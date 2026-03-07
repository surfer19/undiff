import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import type { ExplorationOption, SandboxResult, AgentLogEntry } from '@sage/shared';
import { runBranchAgent } from '@sage/ai';
import type { BranchAgentOutput } from '@sage/ai';
import { getDb, schema } from '../db/index.js';
import { updateRunStatus } from '../db/helpers.js';
import { getGitHubApp } from '../github/index.js';
import { buildResultsComment, buildErrorComment } from '../github/comments.js';
import type { Env } from '../config/index.js';

/**
 * Fetch file content from GitHub via the installation Octokit.
 */
async function fetchFileContent(
  env: Env,
  installationId: number,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string> {
  const githubApp = getGitHubApp(env);
  const octokit = await githubApp.getInstallationOctokit(installationId);

  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
    ref,
  });

  if ('content' in data && typeof data.content === 'string') {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  throw new Error(`Could not read file content for ${path} at ref ${ref}`);
}

/**
 * Run the options engine pipeline:
 * 1. Transition status to analyzing
 * 2. Fetch file content from GitHub
 * 3. Call AI to generate options
 * 4. Store options in DB, transition to options_ready
 * 5. Post options comment to PR
 */
export async function runOptionsEngine(runId: string, env: Env): Promise<void> {
  console.log(`[orchestrator] ▶ runOptionsEngine started for run ${runId}`);
  const db = getDb(env.DATABASE_URL);
  const { generateOptions } = await import('@sage/ai');

  // Fetch the run
  const run = await db.query.exploreRuns.findFirst({
    where: (runs, { eq }) => eq(runs.id, runId),
  });

  if (!run) {
    console.error(`[orchestrator] ✗ run ${runId} not found in DB`);
    throw new Error(`Explore run ${runId} not found`);
  }

  const prRef = run.prRef as {
    owner: string;
    repo: string;
    number: number;
    installationId: number;
  };

  // Transition to analyzing
  await updateRunStatus(db, runId, 'analyzing');
  console.log(`[orchestrator] run ${runId} → status: analyzing`);

  try {
    // Fetch file content from GitHub
    console.log(`[orchestrator] fetching file content: ${run.filePath} (ref: ${run.headRef})`);
    const fileContent = await fetchFileContent(
      env,
      prRef.installationId,
      prRef.owner,
      prRef.repo,
      run.filePath,
      run.headRef,
    );

    console.log(`[orchestrator] file fetched (${fileContent.length} chars)`);

    // Generate options via AI
    console.log(`[orchestrator] calling AI to generate options for run ${runId}…`);
    const options = await generateOptions(
      {
        fileContent,
        filePath: run.filePath,
        diffHunk: run.diffHunk,
        lineRange: run.lineRange as { start: number; end: number },
        concern: run.prompt || undefined,
      },
      env.ANTHROPIC_API_KEY,
      {
        model: env.AI_OPTIONS_MODEL,
        maxInputChars: env.AI_OPTIONS_MAX_INPUT_CHARS,
        maxOutputTokens: env.AI_OPTIONS_MAX_TOKENS,
      },
    );
    console.log(`[orchestrator] AI returned ${options.length} options for run ${runId}`);

    // Store options and transition to options_ready
    await updateRunStatus(db, runId, 'options_ready', { options });
    console.log(`[orchestrator] run ${runId} → status: options_ready`);

    // Post options comment to PR
    const { buildOptionsComment } = await import('../github/comments.js');
    const githubApp = getGitHubApp(env);
    const octokit = await githubApp.getInstallationOctokit(prRef.installationId);

    console.log(`[orchestrator] posting options comment to PR for run ${runId}`);
    await octokit.rest.pulls.createReplyForReviewComment({
      owner: prRef.owner,
      repo: prRef.repo,
      pull_number: prRef.number,
      comment_id: run.commentId,
      body: buildOptionsComment(runId, run.prompt || undefined, options),
    });
    console.log(`[orchestrator] ✔ runOptionsEngine completed for run ${runId}`);
  } catch (err) {
    // Transition to failed and post error comment
    console.error(`[orchestrator] ✗ runOptionsEngine failed for run ${runId}:`, err);
    await updateRunStatus(db, runId, 'failed');

    try {
      const githubApp = getGitHubApp(env);
      const octokit = await githubApp.getInstallationOctokit(prRef.installationId);

      await octokit.rest.pulls.createReplyForReviewComment({
        owner: prRef.owner,
        repo: prRef.repo,
        pull_number: prRef.number,
        comment_id: run.commentId,
        body: buildErrorComment(runId, 'The AI analysis encountered an error. Please try again.'),
      });
    } catch {
      // Best-effort — if commenting fails too, just log
    }

    throw err;
  }
}

/**
 * Run the orchestrator pipeline:
 * 1. Fetch the run and selected options
 * 2. Run branch agents in parallel (Promise.allSettled)
 * 3. Persist results to solution_branches
 * 4. Post results comment
 */
export async function runOrchestrator(
  runId: string,
  selectedOptionIds: string[],
  env: Env,
): Promise<void> {
  console.log(`[orchestrator] ▶ runOrchestrator started for run ${runId} (options: ${selectedOptionIds.join(', ')})`);
  const db = getDb(env.DATABASE_URL);

  // Fetch the run
  const run = await db.query.exploreRuns.findFirst({
    where: (runs, { eq }) => eq(runs.id, runId),
  });

  if (!run) {
    console.error(`[orchestrator] ✗ run ${runId} not found in DB`);
    throw new Error(`Explore run ${runId} not found`);
  }

  const prRef = run.prRef as {
    owner: string;
    repo: string;
    number: number;
    installationId: number;
  };
  const options = (run.options as ExplorationOption[]).filter((o) =>
    selectedOptionIds.includes(o.id),
  );

  if (options.length === 0) {
    console.warn(`[orchestrator] ✗ no matching options for run ${runId}, marking failed`);
    await updateRunStatus(db, runId, 'failed');
    return;
  }

  console.log(`[orchestrator] matched ${options.length} option(s): ${options.map((o) => o.label).join(', ')}`);

  // Fetch file content
  const fileContent = await fetchFileContent(
    env,
    prRef.installationId,
    prRef.owner,
    prRef.repo,
    run.filePath,
    run.headRef,
  );

  // Create pending solution_branches rows
  const branchIds: Record<string, string> = {};
  for (const option of options) {
    const branchId = nanoid();
    branchIds[option.id] = branchId;
    await db.insert(schema.solutionBranches).values({
      id: branchId,
      runId,
      optionId: option.id,
      label: option.label,
      description: option.description,
      status: 'generating',
    });
  }

  // Run branch agents in parallel
  console.log(`[orchestrator] dispatching ${options.length} branch agent(s) in parallel…`);
  const results = await Promise.allSettled(
    options.map((option) =>
      runBranchAgent(
        {
          fileContent,
          filePath: run.filePath,
          diffHunk: run.diffHunk,
          lineRange: run.lineRange as { start: number; end: number },
          concern: run.prompt || undefined,
          option,
        },
        env.ANTHROPIC_API_KEY,
        {
          model: env.AI_BRANCH_MODEL,
          maxOutputTokens: env.AI_BRANCH_MAX_TOKENS,
        },
      ),
    ),
  );

  // Persist results
  const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
  const rejected = results.filter((r) => r.status === 'rejected').length;
  console.log(`[orchestrator] branch agents done: ${fulfilled} completed, ${rejected} failed`);

  const completedBranches: Array<BranchAgentOutput & { id: string }> = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const option = options[i]!;
    const branchId = branchIds[option.id]!;

    if (result.status === 'fulfilled') {
      const output = result.value;
      await db
        .update(schema.solutionBranches)
        .set({
          code: output.code,
          newFiles: output.newFiles,
          pros: output.pros,
          cons: output.cons,
          risk: output.risk,
          complexityDelta: output.complexityDelta,
          filesChanged: output.filesChanged,
          sandbox: output.sandbox,
          agentLog: output.agentLog,
          status: 'completed',
          updatedAt: new Date(),
        })
        .where(eq(schema.solutionBranches.id, branchId));

      completedBranches.push({ ...output, id: branchId });
    } else {
      await db
        .update(schema.solutionBranches)
        .set({
          status: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(schema.solutionBranches.id, branchId));
    }
  }

  // Determine final run status
  const anyCompleted = completedBranches.length > 0;
  const finalStatus = anyCompleted ? 'completed' : 'failed';
  await updateRunStatus(db, runId, finalStatus);
  console.log(`[orchestrator] run ${runId} → status: ${finalStatus}`);

  // Fetch all branches for this run to build the results comment
  const allBranches = await db.query.solutionBranches.findMany({
    where: (branches, { eq }) => eq(branches.runId, runId),
  });

  // Post results comment
  try {
    const githubApp = getGitHubApp(env);
    const octokit = await githubApp.getInstallationOctokit(prRef.installationId);

    if (anyCompleted) {
      // Map DB rows to SolutionBranch shape for comment builder
      const branchData = allBranches.map((b) => ({
        id: b.id,
        runId: b.runId,
        optionId: b.optionId,
        label: b.label,
        description: b.description,
        code: b.code,
        newFiles: b.newFiles as Record<string, string>,
        pros: b.pros as string[],
        cons: b.cons as string[],
        risk: b.risk as 'low' | 'medium' | 'high',
        complexityDelta: b.complexityDelta,
        filesChanged: b.filesChanged as string[],
        status: b.status as 'pending' | 'generating' | 'sandbox_running' | 'completed' | 'failed',
        sandbox: b.sandbox as SandboxResult | null,
        agentLog: b.agentLog as AgentLogEntry[],
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      }));

      await octokit.rest.pulls.createReplyForReviewComment({
        owner: prRef.owner,
        repo: prRef.repo,
        pull_number: prRef.number,
        comment_id: run.commentId,
        body: buildResultsComment(runId, branchData, env.WEB_APP_URL),
      });
    } else {
      await octokit.rest.pulls.createReplyForReviewComment({
        owner: prRef.owner,
        repo: prRef.repo,
        pull_number: prRef.number,
        comment_id: run.commentId,
        body: buildErrorComment(runId, 'All branch analyses failed. Please try again.'),
      });
    }
    console.log(`[orchestrator] ✔ runOrchestrator completed for run ${runId}`);
  } catch (err) {
    console.error(`[orchestrator] ✗ failed to post results comment for run ${runId}:`, err);
  }
}
