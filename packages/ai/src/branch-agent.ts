import { generateObject } from 'ai';
import { z } from 'zod';
import { SANDBOX_TIMEOUT_MS } from '@sage/shared';
import type { ExplorationOption, AgentLogEntry, SandboxResult, RiskLevel } from '@sage/shared';
import { getAIProvider } from './provider.js';

/** Input data for branch analysis — no DB or GitHub dependencies */
export interface BranchAgentInput {
  fileContent: string;
  filePath: string;
  diffHunk: string;
  lineRange: { start: number; end: number };
  concern: string | undefined;
  option: ExplorationOption;
}

/** Output from branch analysis — pure data, caller handles persistence */
export interface BranchAgentOutput {
  optionId: string;
  label: string;
  description: string;
  code: string;
  newFiles: Record<string, string>;
  pros: string[];
  cons: string[];
  risk: RiskLevel;
  complexityDelta: number;
  filesChanged: string[];
  sandbox: SandboxResult;
  agentLog: AgentLogEntry[];
}

const branchOutputSchema = z.object({
  code: z
    .string()
    .describe(
      'The complete modified file content after applying this option. Must be valid, compilable code.',
    ),
  newFiles: z
    .record(z.string(), z.string())
    .describe(
      'Map of new file paths to their content (if this option requires creating new files). Empty object if no new files.',
    ),
  pros: z.array(z.string()).min(1).max(5).describe('1-5 advantages of this approach'),
  cons: z.array(z.string()).min(1).max(5).describe('1-5 disadvantages or risks of this approach'),
  risk: z.enum(['low', 'medium', 'high']).describe('Overall risk assessment'),
  complexityDelta: z
    .number()
    .int()
    .describe('Change in cyclomatic complexity (negative = simpler)'),
  filesChanged: z
    .array(z.string())
    .min(1)
    .describe('List of file paths that would be modified or created'),
  predictedTestResults: z.object({
    total: z.number().int().min(0).describe('Estimated total test count'),
    passed: z.number().int().min(0).describe('Estimated passing tests'),
    failed: z.number().int().min(0).describe('Estimated failing tests'),
    failedNames: z
      .array(z.string())
      .describe('Names of tests likely to fail (empty if none predicted)'),
  }),
  predictedBuildStatus: z
    .enum(['passed', 'failed', 'skipped'])
    .describe('Whether this change is expected to compile successfully'),
  agentLog: z
    .array(
      z.object({
        step: z.string().describe('Step number or name (e.g. "1", "analyze-dependencies")'),
        action: z.string().describe('What the agent did in this step'),
        reasoning: z.string().describe('Why the agent chose this action'),
        outcome: z.string().describe('What the agent found or produced'),
        durationMs: z.number().int().min(0).describe('Estimated duration for this step in ms'),
      }),
    )
    .min(2)
    .describe('Step-by-step reasoning log showing the analysis process'),
});

function buildSystemPrompt(): string {
  return `You are Sage Branch Agent, an expert code implementation agent. Your job is to take a specific refactoring option and implement it fully.

Rules:
- Produce the complete modified file content (not a diff).
- If the option requires new files, include them in newFiles.
- List ALL files that would change (including the main file).
- Think step by step. Record your reasoning in agentLog.
- Give honest pros and cons — do not oversell the approach.
- Predict test and build outcomes based on your analysis of the code.
- predictedBuildStatus: "passed" if confident the code compiles, "failed" if it likely breaks something.
- Be specific in test predictions — name actual test functions/describe blocks if you can infer them.`;
}

function buildUserPrompt(input: BranchAgentInput): string {
  let prompt = `## Task: Implement Option ${input.option.id} — ${input.option.label}

**Description:** ${input.option.description}

## File: ${input.filePath}

### Diff Hunk (what changed in the PR)
\`\`\`
${input.diffHunk}
\`\`\`

### Full File Content
\`\`\`
${input.fileContent}
\`\`\`

### Line Range of Interest: ${input.lineRange.start}-${input.lineRange.end}
`;

  if (input.concern) {
    prompt += `\n### Original Reviewer Concern\n"${input.concern}"\n`;
  }

  prompt += `\n### Instructions
Implement the option described above. Produce:
1. The complete modified file content
2. Any new files needed
3. Honest pros and cons
4. Risk assessment
5. Predicted test and build outcomes
6. A step-by-step reasoning log of your analysis`;

  return prompt;
}

/**
 * Run a branch agent to analyze and implement a single option.
 *
 * Pure function — takes file content and option, returns analysis.
 * The caller handles DB persistence, GitHub API calls, etc.
 */
export async function runBranchAgent(
  input: BranchAgentInput,
  apiKey: string,
): Promise<BranchAgentOutput> {
  const provider = getAIProvider(apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SANDBOX_TIMEOUT_MS);

  try {
    const { object: result } = await generateObject({
      model: provider('claude-sonnet-4-20250514'),
      schema: branchOutputSchema,
      system: buildSystemPrompt(),
      prompt: buildUserPrompt(input),
      temperature: 0.3,
      abortSignal: controller.signal,
    });

    const sandbox: SandboxResult = {
      buildStatus: result.predictedBuildStatus,
      testResults: {
        total: result.predictedTestResults.total,
        passed: result.predictedTestResults.passed,
        failed: result.predictedTestResults.failed,
        failedNames: result.predictedTestResults.failedNames,
      },
      screenshots: null,
      totalDurationMs: result.agentLog.reduce((sum, entry) => sum + entry.durationMs, 0),
    };

    return {
      optionId: input.option.id,
      label: input.option.label,
      description: input.option.description,
      code: result.code,
      newFiles: result.newFiles,
      pros: result.pros,
      cons: result.cons,
      risk: result.risk,
      complexityDelta: result.complexityDelta,
      filesChanged: result.filesChanged,
      sandbox,
      agentLog: result.agentLog,
    };
  } finally {
    clearTimeout(timeout);
  }
}
