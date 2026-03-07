import { describe, it, expect } from 'vitest';
import { parseCheckboxes } from '../github/parse-checkboxes.js';
import { BOT_COMMENT_PREFIX } from '@sage/shared';

function buildBotComment(runId: string, checkboxes: string[]): string {
  return [
    BOT_COMMENT_PREFIX,
    `<!-- sage:run:${runId} -->`,
    '',
    '🔍 **3 options found** for "fix this"',
    '',
    ...checkboxes,
    '',
    '**Check the boxes above** to explore solutions, or reply `/run A C`.',
  ].join('\n');
}

describe('parseCheckboxes', () => {
  it('returns null for non-bot comments', () => {
    expect(parseCheckboxes('just a regular comment')).toBeNull();
  });

  it('returns null for bot comment without run ID', () => {
    const body = BOT_COMMENT_PREFIX + '\nSome text without a run id comment';
    expect(parseCheckboxes(body)).toBeNull();
  });

  it('extracts run ID and no checked options', () => {
    const body = buildBotComment('run-abc', [
      '- [ ] **A — Refactor**',
      '- [ ] **B — Rewrite**',
      '- [ ] **C — Quick fix**',
    ]);
    const result = parseCheckboxes(body);
    expect(result).toEqual({
      runId: 'run-abc',
      checkedOptionIds: [],
    });
  });

  it('detects checked options', () => {
    const body = buildBotComment('run-abc', [
      '- [x] **A — Refactor**',
      '- [ ] **B — Rewrite**',
      '- [x] **C — Quick fix**',
    ]);
    const result = parseCheckboxes(body);
    expect(result).toEqual({
      runId: 'run-abc',
      checkedOptionIds: ['A', 'C'],
    });
  });

  it('handles uppercase X checkboxes', () => {
    const body = buildBotComment('run-abc', ['- [X] **A — Refactor**', '- [ ] **B — Rewrite**']);
    const result = parseCheckboxes(body);
    expect(result?.checkedOptionIds).toEqual(['A']);
  });

  it('extracts all three when all checked', () => {
    const body = buildBotComment('run-xyz', [
      '- [x] **A — Option A**',
      '- [x] **B — Option B**',
      '- [x] **C — Option C**',
    ]);
    const result = parseCheckboxes(body);
    expect(result?.runId).toBe('run-xyz');
    expect(result?.checkedOptionIds).toEqual(['A', 'B', 'C']);
  });

  it('handles nanoid-style run IDs', () => {
    const body = buildBotComment('hbo_5CcZ9BjE-glXMGQgq', ['- [x] **A — Refactor**']);
    const result = parseCheckboxes(body);
    expect(result?.runId).toBe('hbo_5CcZ9BjE-glXMGQgq');
  });
});
