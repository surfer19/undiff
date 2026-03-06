import { BOT_COMMENT_PREFIX } from '@sage/shared';
import type { ExplorationOption, SolutionBranch, RiskLevel } from '@sage/shared';

const RISK_EMOJI: Record<RiskLevel, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🔴',
};

/**
 * Build the options comment posted after the AI generates options.
 * Includes checkboxes for user selection.
 */
export function buildOptionsComment(
  runId: string,
  prompt: string | undefined,
  options: ExplorationOption[],
): string {
  const header = prompt
    ? `🔍 **${options.length} option${options.length > 1 ? 's' : ''} found** for "${prompt}"`
    : `🔍 **${options.length} option${options.length > 1 ? 's' : ''} found**`;

  const optionLines = options.map((opt) => {
    const risk = opt.estimatedImpact.riskLevel;
    const emoji = RISK_EMOJI[risk];
    const preferred = opt.isPreferred ? ' ★ Recommended' : '';
    const delta = opt.estimatedImpact.complexityDelta;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;

    return [
      `- [ ] **${opt.id} — ${opt.label}**${preferred}`,
      `  ${opt.description}`,
      `  \`Risk: ${emoji} ${risk} · Files: ${opt.estimatedImpact.filesChanged} · Complexity: ${deltaStr}\``,
    ].join('\n');
  });

  return [
    BOT_COMMENT_PREFIX,
    `<!-- sage:run:${runId} -->`,
    '',
    header,
    '',
    ...optionLines,
    '',
    '**Check the boxes above** to explore solutions, or reply `/run A C`.',
  ].join('\n');
}

/**
 * Build the results comment posted after branch agents complete.
 */
export function buildResultsComment(
  runId: string,
  branches: SolutionBranch[],
  webAppUrl: string,
): string {
  const completed = branches.filter((b) => b.status === 'completed');
  const failed = branches.filter((b) => b.status === 'failed');

  const branchLines = completed.map((b) => {
    const emoji = RISK_EMOJI[b.risk];
    const delta = b.complexityDelta > 0 ? `+${b.complexityDelta}` : `${b.complexityDelta}`;
    const prosStr = b.pros
      .slice(0, 2)
      .map((p) => `  - ${p}`)
      .join('\n');
    const consStr = b.cons
      .slice(0, 2)
      .map((c) => `  - ${c}`)
      .join('\n');

    return [
      `### ${b.optionId} — ${b.label}`,
      '',
      b.description,
      `**Pros:**`,
      prosStr,
      `**Cons:**`,
      consStr,
      `\`Risk: ${emoji} ${b.risk} · Files: ${b.filesChanged.length} · Complexity: ${delta}\``,
      `🔗 [View full analysis](${webAppUrl}/explore/${runId}/branch/${b.id})`,
    ].join('\n');
  });

  const failedLines = failed.map((b) => `### ${b.optionId} — ${b.label}\n\n❌ Analysis failed`);

  // Find recommendation (the completed branch whose option was preferred, or lowest risk)
  const recommended =
    completed.length > 0
      ? completed.reduce((best, b) => {
          const riskOrder = { low: 0, medium: 1, high: 2 };
          return riskOrder[b.risk] < riskOrder[best.risk] ? b : best;
        })
      : null;

  const recommendationLine = recommended
    ? `\n💡 **Recommendation:** Option ${recommended.optionId} offers the best balance of impact and risk.`
    : '';

  return [
    BOT_COMMENT_PREFIX,
    `<!-- sage:run:${runId} -->`,
    '',
    `✅ **${completed.length} solution${completed.length !== 1 ? 's' : ''} analyzed**${failed.length > 0 ? ` (${failed.length} failed)` : ''}`,
    '',
    ...branchLines,
    ...failedLines,
    recommendationLine,
  ].join('\n');
}

/**
 * Build an error comment when the options engine or orchestrator fails.
 */
export function buildErrorComment(runId: string, message: string): string {
  return [
    BOT_COMMENT_PREFIX,
    `<!-- sage:run:${runId} -->`,
    '',
    `❌ **Exploration failed**`,
    '',
    message,
    '',
    `Run ID: \`${runId}\``,
  ].join('\n');
}
