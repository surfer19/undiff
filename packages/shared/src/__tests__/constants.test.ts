import { describe, it, expect } from 'vitest';
import {
  EXPLORE_COMMAND_REGEX,
  RUN_COMMAND_REGEX,
  CHECKBOX_OPTION_REGEX,
  RUN_ID_COMMENT_REGEX,
  OPTION_IDS,
  MAX_BRANCHES_PER_RUN,
} from '../constants.js';

describe('EXPLORE_COMMAND_REGEX', () => {
  it('matches a valid /explore command with straight quotes', () => {
    const input = '/explore "Fix the race condition in useAuth"';
    const match = input.match(EXPLORE_COMMAND_REGEX);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('Fix the race condition in useAuth');
  });

  it('matches a valid /explore command with smart quotes', () => {
    const input = '/explore \u201CFix the race condition\u201D';
    const match = input.match(EXPLORE_COMMAND_REGEX);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('Fix the race condition');
  });

  it('does not match without quotes', () => {
    const input = '/explore Fix the race condition';
    const match = input.match(EXPLORE_COMMAND_REGEX);
    expect(match).toBeNull();
  });
});

describe('RUN_COMMAND_REGEX', () => {
  it('matches /run all', () => {
    const match = '/run all'.match(RUN_COMMAND_REGEX);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('all');
  });

  it('matches /run A B', () => {
    const match = '/run A B'.match(RUN_COMMAND_REGEX);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('A B');
  });

  it('matches /run C', () => {
    const match = '/run C'.match(RUN_COMMAND_REGEX);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('C');
  });

  it('does not match /run D', () => {
    const match = '/run D'.match(RUN_COMMAND_REGEX);
    expect(match).toBeNull();
  });
});

describe('CHECKBOX_OPTION_REGEX', () => {
  it('parses checked and unchecked options', () => {
    const body = '- [x] **A — Refactor**\n- [ ] **B — Rewrite**\n- [x] **C — Quick fix**';
    const matches = [...body.matchAll(CHECKBOX_OPTION_REGEX)];
    expect(matches).toHaveLength(3);
    expect(matches[0]![1]).toBe('x');
    expect(matches[0]![2]).toBe('A');
    expect(matches[1]![1]).toBe(' ');
    expect(matches[1]![2]).toBe('B');
    expect(matches[2]![1]).toBe('x');
    expect(matches[2]![2]).toBe('C');
  });
});

describe('RUN_ID_COMMENT_REGEX', () => {
  it('extracts run ID from HTML comment', () => {
    const body = '<!-- sage:run:run_abc123 -->';
    const match = body.match(RUN_ID_COMMENT_REGEX);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('run_abc123');
  });
});

describe('constants', () => {
  it('OPTION_IDS contains exactly A, B, C', () => {
    expect(OPTION_IDS).toEqual(['A', 'B', 'C']);
  });

  it('MAX_BRANCHES_PER_RUN is a positive number', () => {
    expect(MAX_BRANCHES_PER_RUN).toBeGreaterThan(0);
  });
});
