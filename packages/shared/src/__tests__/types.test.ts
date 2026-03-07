import { describe, it, expect } from 'vitest';
import type {
  ExplorationOption,
  SandboxResult,
  PrRef,
  RiskLevel,
  ExploreRunStatus,
  SolutionBranchStatus,
} from '../types.js';

describe('type contracts', () => {
  it('ExploreRunStatus covers all valid states', () => {
    const statuses: ExploreRunStatus[] = [
      'pending',
      'analyzing',
      'options_ready',
      'running',
      'completed',
      'failed',
    ];
    expect(statuses).toHaveLength(6);
  });

  it('SolutionBranchStatus covers all valid states', () => {
    const statuses: SolutionBranchStatus[] = [
      'pending',
      'generating',
      'sandbox_running',
      'completed',
      'failed',
    ];
    expect(statuses).toHaveLength(5);
  });

  it('RiskLevel covers all valid values', () => {
    const levels: RiskLevel[] = ['low', 'medium', 'high'];
    expect(levels).toHaveLength(3);
  });

  it('creates a valid PrRef', () => {
    const ref: PrRef = {
      owner: 'user',
      repo: 'sage',
      number: 42,
      installationId: 12345,
    };
    expect(ref.owner).toBe('user');
    expect(ref.number).toBe(42);
  });

  it('SandboxResult shape matches expected contract', () => {
    const result: SandboxResult = {
      buildStatus: 'passed',
      testResults: { total: 10, passed: 9, failed: 1, failedNames: ['foo.test.ts'] },
      screenshots: null,
      totalDurationMs: 5000,
    };
    expect(result.testResults.total).toBe(10);
    expect(result.testResults.failed).toBe(1);
  });

  it('ExplorationOption includes estimatedImpact', () => {
    const option: ExplorationOption = {
      id: 'A',
      label: 'Refactor approach',
      description: 'Extract into hook',
      estimatedImpact: { filesChanged: 3, complexityDelta: -2, riskLevel: 'low' },
      isPreferred: true,
      preferredReason: 'Lowest risk',
    };
    expect(option.estimatedImpact.riskLevel).toBe('low');
  });
});
