import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EXPLORE_COMMAND_REGEX, RUN_COMMAND_REGEX, BOT_COMMENT_PREFIX } from '@sage/shared';
import type { ExploreCommand } from '@sage/shared';
import { getDb, schema } from '../db/index.js';
import { updateRunStatus } from '../db/helpers.js';
import { getGitHubApp } from '../github/index.js';
import { parseCheckboxes } from '../github/parse-checkboxes.js';
import { runOptionsEngine, runOrchestrator } from '../ai/orchestrator.js';
import type { Env } from '../config/index.js';

interface WebhookBody {
  action: string;
  comment: {
    id: number;
    body: string;
    user: {
      login: string;
      type: string;
    };
    pull_request_review_id: number;
    diff_hunk: string;
    path: string;
    position: number | null;
    original_position: number | null;
    line: number | null;
    original_line: number | null;
    start_line: number | null;
    original_start_line: number | null;
  };
  pull_request: {
    number: number;
    head: {
      ref: string;
      sha: string;
    };
  };
  repository: {
    owner: {
      login: string;
    };
    name: string;
  };
  installation?: {
    id: number;
  };
}

export function registerWebhookRoutes(app: FastifyInstance, env: Env) {
  const githubApp = getGitHubApp(env);

  // In-memory dedup for webhook deliveries (fine for single-instance P0)
  const processedDeliveries = new Set<string>();
  const MAX_DELIVERY_CACHE = 1000;

  function markDelivery(deliveryId: string): boolean {
    if (processedDeliveries.has(deliveryId)) return false;
    if (processedDeliveries.size >= MAX_DELIVERY_CACHE) {
      // Evict oldest entries (Set preserves insertion order)
      const first = processedDeliveries.values().next().value;
      if (first) processedDeliveries.delete(first);
    }
    processedDeliveries.add(deliveryId);
    return true;
  }

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // GitHub webhook endpoint
  app.post('/webhooks/github', async (request: FastifyRequest, reply: FastifyReply) => {
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    const event = request.headers['x-github-event'] as string | undefined;
    const deliveryId = request.headers['x-github-delivery'] as string | undefined;

    // Validate required headers
    if (!signature || !event || !deliveryId) {
      return reply.code(400).send({ error: 'Missing required GitHub webhook headers' });
    }

    // Deduplicate webhook deliveries (GitHub may retry)
    if (!markDelivery(deliveryId)) {
      request.log.info({ deliveryId }, 'Duplicate webhook delivery, skipping');
      return reply.code(200).send({ ignored: true, reason: 'duplicate delivery' });
    }

    // Verify webhook signature
    try {
      const isValid = await githubApp.webhooks.verify(request.rawBody as string, signature);
      if (!isValid) {
        request.log.warn({ deliveryId }, 'Invalid webhook signature');
        return reply.code(401).send({ error: 'Invalid signature' });
      }
    } catch {
      request.log.warn({ deliveryId }, 'Invalid webhook signature');
      return reply.code(401).send({ error: 'Invalid signature' });
    }

    // We only care about pull_request_review_comment events
    if (event !== 'pull_request_review_comment') {
      request.log.info({ event, deliveryId }, 'Ignoring non-review-comment event');
      return reply.code(200).send({ ignored: true, reason: `event: ${event}` });
    }

    const body = request.body as WebhookBody;

    request.log.info(
      {
        action: body.action,
        comment: body.comment?.body,
        user: body.comment?.user?.login,
        deliveryId,
      },
      'Processing review comment event',
    );

    // Ignore bot comments to prevent loops (applies to both created and edited)
    if (body.comment.user.type === 'Bot') {
      return reply.code(200).send({ ignored: true, reason: 'bot comment' });
    }

    // ── Handle checkbox edits on Sage bot comments ──────────────────────
    if (body.action === 'edited' && body.comment.body.startsWith(BOT_COMMENT_PREFIX)) {
      return handleCheckboxEdit(request, reply, body, env);
    }

    // Only process newly created comments from here on
    if (body.action !== 'created') {
      return reply.code(200).send({ ignored: true, reason: `action: ${body.action}` });
    }

    // Parse /explore command
    const exploreMatch = EXPLORE_COMMAND_REGEX.exec(body.comment.body);
    const runMatch = RUN_COMMAND_REGEX.exec(body.comment.body);

    if (!exploreMatch?.[1] && !runMatch?.[1]) {
      return reply.code(200).send({ ignored: true, reason: 'no /explore or /run command' });
    }

    const installationId = body.installation?.id;

    if (!installationId) {
      request.log.error({ deliveryId }, 'Missing installation ID');
      return reply.code(400).send({ error: 'Missing installation ID' });
    }

    // Handle /run command
    if (runMatch?.[1]) {
      const selection = runMatch[1].trim();
      const selectedIds = selection === 'all' ? ['A', 'B', 'C'] : selection.split(/\s+/);

      request.log.info({ selectedIds, deliveryId }, '/run command received');

      const db = getDb(env.DATABASE_URL);

      // Find the most recent options_ready run for this PR + file
      const runs = await db.query.exploreRuns.findMany({
        where: (r, { eq, and }) =>
          and(eq(r.filePath, body.comment.path), eq(r.status, 'options_ready' as const)),
        orderBy: (r, { desc }) => [desc(r.createdAt)],
        limit: 5,
      });

      // Filter to matching PR
      const run = runs.find((r) => {
        const pr = r.prRef as { owner: string; repo: string; number: number };
        return (
          pr.owner === body.repository.owner.login &&
          pr.repo === body.repository.name &&
          pr.number === body.pull_request.number
        );
      });

      if (!run) {
        return reply.code(200).send({
          ignored: true,
          reason: 'no options_ready run found for this PR/file',
        });
      }

      // Validate selected IDs exist in run.options
      const validOptions = (run.options as Array<{ id: string }>).map((o) => o.id);
      const validSelected = selectedIds.filter((id) => validOptions.includes(id));

      if (validSelected.length === 0) {
        return reply.code(200).send({
          ignored: true,
          reason: 'no valid option IDs in /run command',
        });
      }

      // Update run and kick off orchestrator
      await updateRunStatus(db, run.id, 'running', {
        selectedOptionIds: validSelected,
      });

      // Fire-and-forget
      runOrchestrator(run.id, validSelected, env).catch((err) => {
        request.log.error({ runId: run.id, err }, 'Orchestrator failed');
      });

      return reply.code(202).send({
        runId: run.id,
        status: 'running',
        selectedIds: validSelected,
        message: '/run command accepted - agents dispatched',
      });
    }

    // Handle /explore command
    const prompt = exploreMatch![1]!.trim();

    // Build the explore command
    const startLine = body.comment.original_start_line ?? body.comment.original_line ?? 0;
    const endLine = body.comment.original_line ?? startLine;

    // Warn if no line selection (file-level comment)
    if (startLine === 0 && endLine === 0) {
      request.log.warn({ deliveryId }, '/explore used on a file-level comment (no line range)');
    }

    const command: ExploreCommand = {
      prompt,
      commentId: body.comment.id,
      prRef: {
        owner: body.repository.owner.login,
        repo: body.repository.name,
        number: body.pull_request.number,
        installationId,
      },
      filePath: body.comment.path,
      lineRange: { start: startLine, end: endLine },
      diffHunk: body.comment.diff_hunk,
      headRef: body.pull_request.head.ref,
    };

    // Persist the explore run
    const runId = nanoid();
    const db = getDb(env.DATABASE_URL);

    await db.insert(schema.exploreRuns).values({
      id: runId,
      prRef: command.prRef,
      filePath: command.filePath,
      lineRange: command.lineRange,
      diffHunk: command.diffHunk,
      headRef: command.headRef,
      prompt: command.prompt,
      status: 'pending',
      commentId: command.commentId,
    });

    request.log.info({ runId, deliveryId, prompt }, 'Explore run created');

    // Post acknowledgement comment back to the PR
    try {
      const octokit = await githubApp.getInstallationOctokit(installationId);

      await octokit.rest.pulls.createReplyForReviewComment({
        owner: command.prRef.owner,
        repo: command.prRef.repo,
        pull_number: command.prRef.number,
        comment_id: command.commentId,
        body: [
          BOT_COMMENT_PREFIX,
          `<!-- sage:run:${runId} -->`,
          `🔍 **Exploring:** "${prompt}"`,
          '',
          `Run ID: \`${runId}\``,
          'Analyzing your code and generating options…',
        ].join('\n'),
      });

      request.log.info({ runId }, 'Ack comment posted');
    } catch (err) {
      request.log.error({ runId, err }, 'Failed to post ack comment');
      // Don't fail the webhook — the run is already persisted
    }

    // Fire-and-forget: kick off the Options Engine asynchronously
    runOptionsEngine(runId, env).catch((err) => {
      request.log.error({ runId, err }, 'Options engine failed');
    });

    return reply.code(202).send({
      runId,
      status: 'pending',
      message: 'Exploration started',
    });
  });

  // GET explore run status (for future polling)
  app.get(
    '/api/explore/:runId',
    async (request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const { runId } = request.params;
      const db = getDb(env.DATABASE_URL);

      const run = await db.query.exploreRuns.findFirst({
        where: (runs, { eq }) => eq(runs.id, runId),
      });

      if (!run) {
        return reply.code(404).send({ error: 'Run not found' });
      }

      return run;
    },
  );

  // ── Checkbox edit handler ───────────────────────────────────────────
  async function handleCheckboxEdit(
    request: FastifyRequest,
    reply: FastifyReply,
    body: WebhookBody,
    env: Env,
  ) {
    const parsed = parseCheckboxes(body.comment.body);

    if (!parsed) {
      return reply.code(200).send({ ignored: true, reason: 'not a sage options comment' });
    }

    const { runId, checkedOptionIds } = parsed;

    if (checkedOptionIds.length === 0) {
      request.log.info({ runId }, 'Checkbox edit detected but no options checked');
      return reply.code(200).send({ ignored: true, reason: 'no options checked' });
    }

    const db = getDb(env.DATABASE_URL);

    const run = await db.query.exploreRuns.findFirst({
      where: (runs, { eq }) => eq(runs.id, runId),
    });

    if (!run) {
      request.log.warn({ runId }, 'Checkbox edit for unknown run');
      return reply.code(200).send({ ignored: true, reason: 'run not found' });
    }

    // Guard: only process if run is in options_ready state
    if (run.status === 'running') {
      request.log.info({ runId }, 'Ignoring checkbox edit — run is already running');
      return reply.code(200).send({ ignored: true, reason: 'run already running' });
    }

    if (run.status !== 'options_ready') {
      request.log.info({ runId, status: run.status }, 'Ignoring checkbox edit — unexpected status');
      return reply.code(200).send({ ignored: true, reason: `status: ${run.status}` });
    }

    // Determine newly selected options (not already in selectedOptionIds)
    const previouslySelected = (run.selectedOptionIds as string[]) ?? [];
    const newSelections = checkedOptionIds.filter((id) => !previouslySelected.includes(id));

    if (newSelections.length === 0) {
      request.log.info({ runId }, 'Checkbox edit detected but no new selections');
      return reply.code(200).send({ ignored: true, reason: 'no new selections' });
    }

    // Update run with new selections and transition to running
    const allSelected = [...new Set([...previouslySelected, ...newSelections])];

    await db
      .update(schema.exploreRuns)
      .set({
        selectedOptionIds: allSelected,
        status: 'running',
        updatedAt: new Date(),
      })
      .where(eq(schema.exploreRuns.id, runId));

    request.log.info(
      { runId, newSelections, allSelected },
      'Checkbox selections detected — run updated to running',
    );

    // Fire-and-forget: kick off the orchestrator for selected options
    runOrchestrator(runId, newSelections, env).catch((err) => {
      request.log.error({ runId, err }, 'Orchestrator failed');
    });

    return reply.code(202).send({
      runId,
      status: 'running',
      newSelections,
      message: 'Checkbox selections received — agents will be dispatched',
    });
  }
}
