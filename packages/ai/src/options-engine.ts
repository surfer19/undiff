import { generateObject } from 'ai';
import { z } from 'zod';
import type { ExplorationOption } from '@sage/shared';
import { getAIProvider } from './provider.js';

/** Input data for option generation — no DB or GitHub dependencies */
export interface OptionsEngineInput {
  fileContent: string;
  filePath: string;
  diffHunk: string;
  lineRange: { start: number; end: number };
  concern: string | undefined;
}

const explorationOptionSchema = z.object({
  id: z.enum(['A', 'B', 'C']),
  label: z.string().describe('Short descriptive label for this option (3-8 words)'),
  description: z
    .string()
    .describe('One paragraph explaining what this option does and why it helps'),
  estimatedImpact: z.object({
    filesChanged: z.number().int().min(1).describe('Estimated number of files that would change'),
    complexityDelta: z
      .number()
      .int()
      .describe('Estimated change in cyclomatic complexity (negative = simpler)'),
    riskLevel: z.enum(['low', 'medium', 'high']),
  }),
  isPreferred: z.boolean().describe('Whether this is the recommended option'),
  preferredReason: z
    .string()
    .optional()
    .describe('If isPreferred, a short reason why this is recommended'),
});

const optionsArraySchema = z
  .array(explorationOptionSchema)
  .min(1)
  .max(3)
  .describe('1 to 3 exploration options');

function buildSystemPrompt(): string {
  return `You are Sage, an expert code analysis agent. Your job is to analyze code and propose concrete refactoring or improvement options.

Rules:
- Generate 1 to 3 options based on relevance. Do NOT force 3 options if fewer are appropriate.
- Each option must be actionable — something a developer could implement in a single PR.
- Exactly one option should be marked as isPreferred (your recommendation).
- Option IDs must be sequential: A, then B, then C.
- Risk levels: "low" = safe refactor, "medium" = moderate change, "high" = significant restructuring.
- complexityDelta: negative means the code gets simpler, positive means more complex.
- Be specific — reference actual function names, patterns, and line numbers from the code.`;
}

function buildUserPrompt(input: OptionsEngineInput): string {
  const lines = input.fileContent.split('\n');
  const contextStart = Math.max(0, input.lineRange.start - 10);
  const contextEnd = Math.min(lines.length, input.lineRange.end + 10);
  const focusedContext = lines.slice(contextStart, contextEnd).join('\n');

  let prompt = `## File: ${input.filePath}

### Diff Hunk
\`\`\`
${input.diffHunk}
\`\`\`

### Code Context (lines ${contextStart + 1}-${contextEnd})
\`\`\`
${focusedContext}
\`\`\`

### Full File
\`\`\`
${input.fileContent}
\`\`\`
`;

  if (input.concern) {
    prompt += `\n### Reviewer Concern\n"${input.concern}"\n\nAnalyze the code with this specific concern in mind and propose 1-3 improvement options.`;
  } else {
    prompt += `\n### Task\nAnalyze this code and identify 1-3 potential improvements, issues, or refactoring opportunities. Focus on the diff hunk and surrounding context.`;
  }

  return prompt;
}

/**
 * Generate exploration options using AI.
 *
 * This is a pure function — it takes file content and context,
 * returns structured options. No DB or GitHub side effects.
 */
export async function generateOptions(
  input: OptionsEngineInput,
  apiKey: string,
): Promise<ExplorationOption[]> {
  const provider = getAIProvider(apiKey);

  const { object: options } = await generateObject({
    model: provider('claude-sonnet-4-20250514'),
    schema: optionsArraySchema,
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(input),
    temperature: 0.7,
  });

  return options;
}
