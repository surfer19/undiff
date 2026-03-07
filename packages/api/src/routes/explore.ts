import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import type { Env } from '../config/index.js';

export function registerExploreRoutes(app: FastifyInstance, env: Env) {
  const db = getDb(env.DATABASE_URL);

  // GET /api/explore/:runId
  app.get('/api/explore/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };

    const run = await db.query.exploreRuns.findFirst({
      where: eq(schema.exploreRuns.id, runId),
    });

    if (!run) {
      return reply.code(404).send({ error: 'Run not found' });
    }

    return run;
  });

  // GET /api/explore/:runId/branches
  app.get('/api/explore/:runId/branches', async (request, reply) => {
    const { runId } = request.params as { runId: string };

    const run = await db.query.exploreRuns.findFirst({
      where: eq(schema.exploreRuns.id, runId),
    });

    if (!run) {
      return reply.code(404).send({ error: 'Run not found' });
    }

    const branches = await db.query.solutionBranches.findMany({
      where: eq(schema.solutionBranches.runId, runId),
      orderBy: (b, { asc }) => [asc(b.optionId)],
    });

    return branches;
  });
}
