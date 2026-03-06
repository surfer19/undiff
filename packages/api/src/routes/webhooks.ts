import { nanoid } from 'nanoid';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EXPLORE_COMMAND_REGEX, RUN_COMMAND_REGEX, BOT_COMMENT_PREFIX } from '@sage/shared';
import type { ExploreCommand } from '@sage/shared';
import { getDb, schema } from '../db/index.js';
import { getGitHubApp } from '../github/index.js';
import type { Env } from '../config/index.js';

interface WebhookBody {
  action: string;
  comment: {
    id: number;
    body: string;
    user: {
      login: string;
      type: string;
    };
    pull_request_review_id: number;
    diff_hunk: string;
    path: string;
    position: number | null;
    original_position: number | null;
    line: number | null;
    original_line: number | null;
    start_line: number | null;
    original_start_line: number | null;
  };
  pull_request: {
    number: number;
    head: {
      ref: string;
      sha: string;
    };
  };
  repository: {
    owner: {
      login: string;
    };
    name: string;
  };
  installation?: {
    id: number;
  };
}

export function registerWebhookRoutes(app: FastifyInstance, env: Env) {
  const githubApp = getGitHubApp(env);

  // In-memory dedup for webhook deliveries (fine for single-instance P0)
  const processedDeliveries = new Set<string>();
  const MAX_DELIVERY_CACHE = 1000;

  function markDelivery(deliveryId: string): boolean {
    if (processedDeliveries.has(deliveryId)) return false;
    if (processedDeliveries.size >= MAX_DELIVERY_CACHE) {
      // Evict oldest entries (Set preserves insertion order)
      const first = processedDeliveries.values().next().value;
      if (first) processedDeliveries.delete(first);
    }
    processedDeliveries.add(deliveryId);
    return true;
  }

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // GitHub webhook endpoint
  app.post('/webhooks/github', async (request: FastifyRequest, reply: FastifyReply) => {
    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    const event = request.headers['x-github-event'] as string | undefined;
    const deliveryId = request.headers['x-github-delivery'] as string | undefined;

    // Validate required headers
    if (!signature || !event || !deliveryId) {
      return reply.code(400).send({ error: 'Missing required GitHub webhook headers' });
    }

    // Deduplicate webhook deliveries (GitHub may retry)
    if (!markDelivery(deliveryId)) {
      request.log.info({ deliveryId }, 'Duplicate webhook delivery, skipping');
      return reply.code(200).send({ ignored: true, reason: 'duplicate delivery' });
    }

    // Verify webhook signature
    try {
      const isValid = await githubApp.webhooks.verify(request.rawBody as string, signature);
      if (!isValid) {
        request.log.warn({ deliveryId }, 'Invalid webhook signature');
        return reply.code(401).send({ error: 'Invalid signature' });
      }
    } catch {
      request.log.warn({ deliveryId }, 'Invalid webhook signature');
      return reply.code(401).send({ error: 'Invalid signature' });
    }

    // We only care about pull_request_review_comment events
    if (event !== 'pull_request_review_comment') {
      request.log.info({ event, deliveryId }, 'Ignoring non-review-comment event');
      return reply.code(200).send({ ignored: true, reason: `event: ${event}` });
    }

    const body = request.body as WebhookBody;

    request.log.info(
      {
        action: body.action,
        comment: body.comment?.body,
        user: body.comment?.user?.login,
        deliveryId,
      },
      'Processing review comment event',
    );

    // Only process newly created comments
    if (body.action !== 'created') {
      return reply.code(200).send({ ignored: true, reason: `action: ${body.action}` });
    }

    // Ignore bot comments to prevent loops
    if (body.comment.user.type === 'Bot') {
      return reply.code(200).send({ ignored: true, reason: 'bot comment' });
    }

    // Parse /explore command
    const exploreMatch = EXPLORE_COMMAND_REGEX.exec(body.comment.body);
    const runMatch = RUN_COMMAND_REGEX.exec(body.comment.body);

    if (!exploreMatch?.[1] && !runMatch?.[1]) {
      return reply.code(200).send({ ignored: true, reason: 'no /explore or /run command' });
    }

    const installationId = body.installation?.id;

    if (!installationId) {
      request.log.error({ deliveryId }, 'Missing installation ID');
      return reply.code(400).send({ error: 'Missing installation ID' });
    }

    // Handle /run command (P1 — stub for now)
    if (runMatch?.[1]) {
      const selection = runMatch[1].trim();
      const selectedIds = selection === 'all' ? ['A', 'B', 'C'] : selection.split(/\s+/);

      request.log.info({ selectedIds, deliveryId }, '/run command received (P1 stub)');

      // TODO (P1): Look up the most recent run for this PR/file,
      // update selectedOptionIds, and kick off agents
      return reply.code(202).send({
        message: '/run command acknowledged — agent execution coming in P1',
        selectedIds,
      });
    }

    // Handle /explore command
    const prompt = exploreMatch![1]!.trim();

    // Build the explore command
    const startLine = body.comment.original_start_line ?? body.comment.original_line ?? 0;
    const endLine = body.comment.original_line ?? startLine;

    // Warn if no line selection (file-level comment)
    if (startLine === 0 && endLine === 0) {
      request.log.warn({ deliveryId }, '/explore used on a file-level comment (no line range)');
    }

    const command: ExploreCommand = {
      prompt,
      commentId: body.comment.id,
      prRef: {
        owner: body.repository.owner.login,
        repo: body.repository.name,
        number: body.pull_request.number,
        installationId,
      },
      filePath: body.comment.path,
      lineRange: { start: startLine, end: endLine },
      diffHunk: body.comment.diff_hunk,
      headRef: body.pull_request.head.ref,
    };

    // Persist the explore run
    const runId = nanoid();
    const db = getDb(env.DATABASE_URL);

    await db.insert(schema.exploreRuns).values({
      id: runId,
      prRef: command.prRef,
      filePath: command.filePath,
      lineRange: command.lineRange,
      diffHunk: command.diffHunk,
      headRef: command.headRef,
      prompt: command.prompt,
      status: 'pending',
      commentId: command.commentId,
    });

    request.log.info({ runId, deliveryId, prompt }, 'Explore run created');

    // Post acknowledgement comment back to the PR
    try {
      const octokit = await githubApp.getInstallationOctokit(installationId);

      await octokit.rest.pulls.createReplyForReviewComment({
        owner: command.prRef.owner,
        repo: command.prRef.repo,
        pull_number: command.prRef.number,
        comment_id: command.commentId,
        body: [
          BOT_COMMENT_PREFIX,
          `🔍 **Exploring:** "${prompt}"`,
          '',
          `Run ID: \`${runId}\``,
          'Analyzing your code and generating options…',
        ].join('\n'),
      });

      request.log.info({ runId }, 'Ack comment posted');
    } catch (err) {
      request.log.error({ runId, err }, 'Failed to post ack comment');
      // Don't fail the webhook — the run is already persisted
    }

    // TODO (P1): Kick off the Options Engine asynchronously here
    // await enqueueOptionsGeneration(runId);

    return reply.code(202).send({
      runId,
      status: 'pending',
      message: 'Exploration started',
    });
  });

  // GET explore run status (for future polling)
  app.get(
    '/api/explore/:runId',
    async (request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const { runId } = request.params;
      const db = getDb(env.DATABASE_URL);

      const run = await db.query.exploreRuns.findFirst({
        where: (runs, { eq }) => eq(runs.id, runId),
      });

      if (!run) {
        return reply.code(404).send({ error: 'Run not found' });
      }

      return run;
    },
  );
}
