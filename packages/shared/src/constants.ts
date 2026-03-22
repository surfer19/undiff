/** Maximum number of parallel sandbox agents per run */
export const MAX_BRANCHES_PER_RUN = 3;

/** Sandbox execution timeout in milliseconds */
export const SANDBOX_TIMEOUT_MS = 120_000;

/** Time to acknowledge a webhook before GitHub retries (ms) */
export const WEBHOOK_ACK_TIMEOUT_MS = 10_000;

/** Bot comment prefix for identification */
export const BOT_COMMENT_PREFIX = '<!-- undiff -->';

/** Regex to parse /explore commands from PR review comments */
export const EXPLORE_COMMAND_REGEX = /^\/explore\s+["""\u201C\u201D](.+)["""\u201C\u201D]\s*$/im;

/** Regex to parse /run commands */
export const RUN_COMMAND_REGEX = /^\/run\s+(all|[A-C](?:\s+[A-C])*)\s*$/im;

/** Valid option IDs */
export const OPTION_IDS = ['A', 'B', 'C'] as const;
export type OptionId = (typeof OPTION_IDS)[number];
