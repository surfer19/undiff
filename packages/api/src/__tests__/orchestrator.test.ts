import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock external dependencies ──────────────────────────────────────────
// These must be declared before any imports that reference them.

const mockDb = {
  query: {
    exploreRuns: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    solutionBranches: {
      findMany: vi.fn(),
    },
  },
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  }),
};

vi.mock('../db/index.js', () => ({
  getDb: () => mockDb,
  schema: {
    exploreRuns: { id: 'id' },
    solutionBranches: { id: 'id', runId: 'run_id' },
  },
}));

vi.mock('../db/helpers.js', () => ({
  updateRunStatus: vi.fn().mockResolvedValue(undefined),
}));

const mockVerify = vi.fn().mockResolvedValue(true);
const mockGetContent = vi.fn();
const mockCreateReply = vi.fn().mockResolvedValue({});

vi.mock('../github/index.js', () => ({
  getGitHubApp: () => ({
    webhooks: { verify: mockVerify },
    getInstallationOctokit: vi.fn().mockResolvedValue({
      rest: {
        repos: { getContent: mockGetContent },
        pulls: { createReplyForReviewComment: mockCreateReply },
      },
    }),
  }),
}));

vi.mock('@sage/ai', () => ({
  runBranchAgent: vi.fn().mockResolvedValue({
    optionId: 'A',
    label: 'Refactor',
    description: 'Refactor approach',
    code: 'const x = 1;',
    newFiles: {},
    pros: ['Clean'],
    cons: ['Work'],
    risk: 'low',
    complexityDelta: -1,
    filesChanged: ['src/utils.ts'],
    sandbox: {
      buildStatus: 'passed',
      testResults: { total: 1, passed: 1, failed: 0, failedNames: [] },
      screenshots: null,
      totalDurationMs: 100,
    },
    agentLog: [{ step: '1', action: 'analyze', reasoning: 'test', outcome: 'ok', durationMs: 50 }],
  }),
  generateOptions: vi.fn().mockResolvedValue([
    {
      id: 'A',
      label: 'Refactor',
      description: 'Refactor approach',
      isPreferred: true,
      estimatedImpact: { riskLevel: 'low', complexityDelta: -1, filesChanged: 1 },
    },
    {
      id: 'B',
      label: 'Rewrite',
      description: 'Full rewrite',
      isPreferred: false,
      estimatedImpact: { riskLevel: 'high', complexityDelta: 3, filesChanged: 5 },
    },
  ]),
}));

// ── Now import the modules under test ────────────────────────────────────
import { runOptionsEngine, runOrchestrator } from '../ai/orchestrator.js';
import { updateRunStatus } from '../db/helpers.js';

const fakeEnv = {
  GITHUB_APP_ID: 'test-app-id',
  GITHUB_PRIVATE_KEY: 'test-key',
  GITHUB_WEBHOOK_SECRET: 'test-secret',
  DATABASE_URL: 'postgres://localhost/test',
  ANTHROPIC_API_KEY: 'sk-test',
  WEB_APP_URL: 'http://localhost:5173',
  PORT: 4000,
  HOST: '0.0.0.0',
  LOG_LEVEL: 'info' as const,
  NODE_ENV: 'test' as const,
};

const fakeRun = {
  id: 'run-001',
  prRef: { owner: 'test-owner', repo: 'test-repo', number: 42, installationId: 12345 },
  filePath: 'src/utils.ts',
  lineRange: { start: 10, end: 20 },
  diffHunk: '@@ -10,6 +10,8 @@\n function foo() {}',
  headRef: 'feature/branch',
  prompt: 'refactor this',
  status: 'pending',
  commentId: 999,
  options: [
    {
      id: 'A',
      label: 'Refactor',
      description: 'Refactor approach',
      isPreferred: true,
      estimatedImpact: { riskLevel: 'low', complexityDelta: -1, filesChanged: 1 },
    },
    {
      id: 'B',
      label: 'Rewrite',
      description: 'Full rewrite',
      isPreferred: false,
      estimatedImpact: { riskLevel: 'high', complexityDelta: 3, filesChanged: 5 },
    },
  ],
  selectedOptionIds: ['A'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('runOptionsEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.query.exploreRuns.findFirst.mockResolvedValue(fakeRun);
    mockGetContent.mockResolvedValue({
      data: { content: Buffer.from('const foo = 1;').toString('base64') },
    });
  });

  it('transitions to analyzing then options_ready on success', async () => {
    await runOptionsEngine('run-001', fakeEnv);

    expect(updateRunStatus).toHaveBeenCalledWith(mockDb, 'run-001', 'analyzing');
    expect(updateRunStatus).toHaveBeenCalledWith(
      mockDb,
      'run-001',
      'options_ready',
      expect.objectContaining({ options: expect.any(Array) }),
    );
  });

  it('fetches file content from GitHub', async () => {
    await runOptionsEngine('run-001', fakeEnv);

    expect(mockGetContent).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      path: 'src/utils.ts',
      ref: 'feature/branch',
    });
  });

  it('posts options comment to PR', async () => {
    await runOptionsEngine('run-001', fakeEnv);

    expect(mockCreateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 42,
        comment_id: 999,
      }),
    );
  });

  it('transitions to failed when GitHub API errors', async () => {
    mockGetContent.mockRejectedValue(new Error('Not Found'));

    await expect(runOptionsEngine('run-001', fakeEnv)).rejects.toThrow('Not Found');
    expect(updateRunStatus).toHaveBeenCalledWith(mockDb, 'run-001', 'failed');
  });

  it('transitions to failed when AI generation errors', async () => {
    const { generateOptions } = await import('@sage/ai');
    vi.mocked(generateOptions).mockRejectedValueOnce(new Error('AI rate limit'));

    await expect(runOptionsEngine('run-001', fakeEnv)).rejects.toThrow('AI rate limit');
    expect(updateRunStatus).toHaveBeenCalledWith(mockDb, 'run-001', 'failed');
  });

  it('throws when run not found', async () => {
    mockDb.query.exploreRuns.findFirst.mockResolvedValue(null);

    await expect(runOptionsEngine('run-missing', fakeEnv)).rejects.toThrow('not found');
  });

  it('attempts to post error comment on failure', async () => {
    mockGetContent.mockRejectedValue(new Error('Not Found'));

    try {
      await runOptionsEngine('run-001', fakeEnv);
    } catch {
      // expected
    }

    // Should have tried to post an error comment (second call to createReply)
    expect(mockCreateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('failed'),
      }),
    );
  });
});

describe('runOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.query.exploreRuns.findFirst.mockResolvedValue({
      ...fakeRun,
      status: 'running',
    });
    mockDb.query.solutionBranches.findMany.mockResolvedValue([
      {
        id: 'br-1',
        runId: 'run-001',
        optionId: 'A',
        label: 'Refactor',
        description: 'Refactor approach',
        code: 'const x = 1;',
        newFiles: {},
        pros: ['Clean'],
        cons: ['Work'],
        risk: 'low',
        complexityDelta: -1,
        filesChanged: ['src/utils.ts'],
        status: 'completed',
        sandbox: null,
        agentLog: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockGetContent.mockResolvedValue({
      data: { content: Buffer.from('const foo = 1;').toString('base64') },
    });
  });

  it('fetches file content and runs branch agents', async () => {
    await runOrchestrator('run-001', ['A'], fakeEnv);

    expect(mockGetContent).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      path: 'src/utils.ts',
      ref: 'feature/branch',
    });
  });

  it('creates solution_branches rows', async () => {
    await runOrchestrator('run-001', ['A'], fakeEnv);

    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('sets final status to completed when branches succeed', async () => {
    await runOrchestrator('run-001', ['A'], fakeEnv);

    expect(updateRunStatus).toHaveBeenCalledWith(mockDb, 'run-001', 'completed');
  });

  it('sets final status to failed when no branches succeed', async () => {
    const { runBranchAgent } = await import('@sage/ai');
    vi.mocked(runBranchAgent).mockRejectedValueOnce(new Error('AI failed'));

    await runOrchestrator('run-001', ['A'], fakeEnv);

    expect(updateRunStatus).toHaveBeenCalledWith(mockDb, 'run-001', 'failed');
  });

  it('sets failed when no valid options selected', async () => {
    await runOrchestrator('run-001', ['Z'], fakeEnv);

    expect(updateRunStatus).toHaveBeenCalledWith(mockDb, 'run-001', 'failed');
  });

  it('throws when run not found', async () => {
    mockDb.query.exploreRuns.findFirst.mockResolvedValue(null);

    await expect(runOrchestrator('run-missing', ['A'], fakeEnv)).rejects.toThrow('not found');
  });

  it('posts results comment on success', async () => {
    await runOrchestrator('run-001', ['A'], fakeEnv);

    expect(mockCreateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 42,
        body: expect.stringContaining('solution'),
      }),
    );
  });
});
