import { test, expect } from '@playwright/test';

const runId = 'run_123';
const branchId = 'branch_a';

const runResponse = {
  id: runId,
  prRef: { owner: 'acme', repo: 'sage', number: 42, installationId: 1 },
  filePath: 'packages/api/src/routes/webhooks.ts',
  lineRange: { start: 10, end: 40 },
  diffHunk: '@@ -10,3 +10,8 @@',
  headRef: 'feature/explore',
  prompt: 'Refactor webhook parsing logic',
  status: 'running',
  commentId: 101,
  options: [
    {
      id: 'A',
      label: 'Extract parser helper',
      description: 'Move parsing into a dedicated helper module.',
      estimatedImpact: { filesChanged: 2, complexityDelta: -1, riskLevel: 'low' },
      isPreferred: true,
    },
  ],
  selectedOptionIds: ['A'],
  pickedBranchId: branchId,
  deliveryMode: null,
  createdAt: '2026-03-07T10:00:00.000Z',
  updatedAt: '2026-03-07T10:01:00.000Z',
};

const branchesResponse = [
  {
    id: branchId,
    runId,
    optionId: 'A',
    label: 'Extract parser helper',
    description: 'Move parsing into a dedicated helper module.',
    code: 'export function parse() { return true; }',
    newFiles: {
      'packages/api/src/github/parser.ts': 'export const parser = () => true;',
    },
    pros: ['Improves readability', 'Easier testing'],
    cons: ['Adds one extra module'],
    risk: 'low',
    complexityDelta: -1,
    filesChanged: ['packages/api/src/routes/webhooks.ts', 'packages/api/src/github/parser.ts'],
    status: 'completed',
    sandbox: {
      buildStatus: 'passed',
      testResults: { total: 12, passed: 12, failed: 0, failedNames: [] },
      screenshots: null,
      totalDurationMs: 5100,
    },
    agentLog: [
      {
        step: '1',
        action: 'Analyze hunk',
        reasoning: 'Need to isolate parser logic.',
        outcome: 'Helper extraction chosen.',
        durationMs: 800,
      },
    ],
    createdAt: '2026-03-07T10:02:00.000Z',
    updatedAt: '2026-03-07T10:03:00.000Z',
  },
];

function trpcResult(json: unknown) {
  return {
    result: {
      data: {
        json,
      },
    },
  };
}

test('critical explore flow: run overview to branch details', async ({ page }) => {
  await page.route('**/trpc/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const trpcPath = requestUrl.pathname.split('/trpc/')[1] ?? '';
    const procedures = trpcPath.split(',').filter(Boolean);

    const responses = procedures.map((procedure) => {
      if (procedure === 'explore.getRun') {
        return trpcResult(runResponse);
      }
      if (procedure === 'explore.getBranches') {
        return trpcResult(branchesResponse);
      }
      return {
        error: {
          code: -32601,
          message: `Unhandled procedure: ${procedure}`,
        },
      };
    });

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responses),
    });
  });

  await page.goto(`/explore/${runId}`);

  await expect(page.getByRole('heading', { name: 'Explore Run' })).toBeVisible();
  await expect(page.getByText('Extract parser helper')).toBeVisible();
  await expect(page.getByText('★ Preferred')).toBeVisible();

  await page.getByRole('link', { name: /Extract parser helper/i }).click();

  await expect(page).toHaveURL(new RegExp(`/explore/${runId}/branch/${branchId}$`));
  await expect(page.getByRole('heading', { name: 'Extract parser helper' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Code Changes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sandbox Results' })).toBeVisible();
  await expect(page.getByText('12/12 passed')).toBeVisible();
});
