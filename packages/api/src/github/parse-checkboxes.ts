import { BOT_COMMENT_PREFIX, CHECKBOX_OPTION_REGEX, RUN_ID_COMMENT_REGEX } from '@sage/shared';

export interface CheckboxParseResult {
  runId: string;
  checkedOptionIds: string[];
}

/**
 * Parse a Sage bot comment to extract run ID and checked option IDs.
 *
 * Returns `null` if the comment is not a Sage options comment
 * (missing prefix or missing embedded run ID).
 */
export function parseCheckboxes(commentBody: string): CheckboxParseResult | null {
  // Only parse Sage bot comments
  if (!commentBody.startsWith(BOT_COMMENT_PREFIX)) {
    return null;
  }

  // Extract embedded run ID
  const runIdMatch = RUN_ID_COMMENT_REGEX.exec(commentBody);
  if (!runIdMatch?.[1]) {
    return null;
  }

  const runId = runIdMatch[1];

  // Extract checked option IDs
  const checkedOptionIds: string[] = [];

  // Reset lastIndex since the regex has the `g` flag
  CHECKBOX_OPTION_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CHECKBOX_OPTION_REGEX.exec(commentBody)) !== null) {
    const isChecked = match[1]?.toLowerCase() === 'x';
    const optionId = match[2]?.toUpperCase();
    if (isChecked && optionId) {
      checkedOptionIds.push(optionId);
    }
  }

  return { runId, checkedOptionIds };
}
