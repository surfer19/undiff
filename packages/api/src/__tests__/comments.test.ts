import { describe, it, expect } from 'vitest';
import { buildOptionsComment, buildResultsComment, buildErrorComment } from '../github/comments.js';
import { BOT_COMMENT_PREFIX } from '@sage/shared';
import type { ExplorationOption, SolutionBranch } from '@sage/shared';

const makeOption = (overrides: Partial<ExplorationOption> = {}): ExplorationOption => ({
  id: 'A',
  label: 'Refactor to hooks',
  description: 'Extract logic into a custom hook',
  isPreferred: false,
  estimatedImpact: {
    riskLevel: 'low',
    complexityDelta: -2,
    filesChanged: 2,
  },
  ...overrides,
});

const makeBranch = (overrides: Partial<SolutionBranch> = {}): SolutionBranch => ({
  id: 'branch-001',
  runId: 'run-001',
  optionId: 'A',
  label: 'Refactor to hooks',
  description: 'Extract logic into a custom hook',
  code: 'const x = 1;',
  newFiles: {},
  pros: ['Cleaner code', 'Better testability'],
  cons: ['Requires migration'],
  risk: 'low',
  complexityDelta: -2,
  filesChanged: ['src/utils.ts'],
  status: 'completed',
  sandbox: null,
  agentLog: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('buildOptionsComment', () => {
  it('includes bot prefix and run ID', () => {
    const result = buildOptionsComment('run-123', 'fix this', [makeOption()]);
    expect(result).toContain(BOT_COMMENT_PREFIX);
    expect(result).toContain('<!-- sage:run:run-123 -->');
  });

  it('includes the prompt text', () => {
    const result = buildOptionsComment('run-123', 'fix the race condition', [makeOption()]);
    expect(result).toContain('fix the race condition');
  });

  it('renders option ID, label, and description', () => {
    const result = buildOptionsComment('run-123', 'fix', [makeOption()]);
    expect(result).toContain('**A — Refactor to hooks**');
    expect(result).toContain('Extract logic into a custom hook');
  });

  it('marks preferred option with star', () => {
    const result = buildOptionsComment('run-123', 'fix', [makeOption({ isPreferred: true })]);
    expect(result).toContain('★ Recommended');
  });

  it('shows risk emoji and metadata', () => {
    const result = buildOptionsComment('run-123', 'fix', [makeOption()]);
    expect(result).toContain('🟢');
    expect(result).toContain('low');
    expect(result).toContain('Files: 2');
    expect(result).toContain('-2');
  });

  it('renders multiple options', () => {
    const result = buildOptionsComment('run-123', 'fix', [
      makeOption({ id: 'A', label: 'Option A' }),
      makeOption({
        id: 'B',
        label: 'Option B',
        estimatedImpact: { riskLevel: 'high', complexityDelta: 3, filesChanged: 5 },
      }),
    ]);
    expect(result).toContain('**A — Option A**');
    expect(result).toContain('**B — Option B**');
    expect(result).toContain('🔴');
  });

  it('handles missing prompt', () => {
    const result = buildOptionsComment('run-123', undefined, [makeOption()]);
    expect(result).toContain('1 option found');
    expect(result).not.toContain('for "');
  });

  it('includes checkbox interaction instructions', () => {
    const result = buildOptionsComment('run-123', 'fix', [makeOption()]);
    expect(result).toContain('Check the boxes');
  });
});

describe('buildResultsComment', () => {
  it('includes bot prefix and run ID', () => {
    const result = buildResultsComment('run-123', [makeBranch()], 'http://localhost:5173');
    expect(result).toContain(BOT_COMMENT_PREFIX);
    expect(result).toContain('<!-- sage:run:run-123 -->');
  });

  it('shows completed count', () => {
    const result = buildResultsComment('run-123', [makeBranch()], 'http://localhost:5173');
    expect(result).toContain('1 solution analyzed');
  });

  it('shows link to web app', () => {
    const result = buildResultsComment(
      'run-123',
      [makeBranch({ id: 'br-1' })],
      'http://localhost:5173',
    );
    expect(result).toContain('http://localhost:5173/explore/run-123/branch/br-1');
  });

  it('shows pros and cons', () => {
    const result = buildResultsComment('run-123', [makeBranch()], 'http://localhost:5173');
    expect(result).toContain('Cleaner code');
    expect(result).toContain('Requires migration');
  });

  it('reports failed branches', () => {
    const result = buildResultsComment(
      'run-123',
      [makeBranch({ status: 'failed', optionId: 'B', label: 'Bad approach' })],
      'http://localhost:5173',
    );
    expect(result).toContain('❌ Analysis failed');
    expect(result).toContain('Bad approach');
  });

  it('includes recommendation for lowest risk', () => {
    const result = buildResultsComment(
      'run-123',
      [
        makeBranch({ optionId: 'A', risk: 'high' }),
        makeBranch({ optionId: 'B', risk: 'low', id: 'br-2' }),
      ],
      'http://localhost:5173',
    );
    expect(result).toContain('Recommendation');
    expect(result).toContain('Option B');
  });
});

describe('buildErrorComment', () => {
  it('includes bot prefix and run ID', () => {
    const result = buildErrorComment('run-123', 'Something broke');
    expect(result).toContain(BOT_COMMENT_PREFIX);
    expect(result).toContain('<!-- sage:run:run-123 -->');
  });

  it('includes the error message', () => {
    const result = buildErrorComment('run-123', 'AI analysis timed out');
    expect(result).toContain('AI analysis timed out');
  });

  it('shows failure header', () => {
    const result = buildErrorComment('run-123', 'error');
    expect(result).toContain('❌ **Exploration failed**');
  });
});
