import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from './init.js';
import { getDb, schema } from '../db/index.js';

export const exploreRouter = router({
  /** Get a single explore run by ID */
  getRun: publicProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const db = getDb(ctx.env.DATABASE_URL);

      const run = await db.query.exploreRuns.findFirst({
        where: eq(schema.exploreRuns.id, input.runId),
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Run "${input.runId}" not found`,
        });
      }

      return run;
    }),

  /** Get all solution branches for a run */
  getBranches: publicProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const db = getDb(ctx.env.DATABASE_URL);

      const run = await db.query.exploreRuns.findFirst({
        where: eq(schema.exploreRuns.id, input.runId),
      });

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Run "${input.runId}" not found`,
        });
      }

      const branches = await db.query.solutionBranches.findMany({
        where: eq(schema.solutionBranches.runId, input.runId),
        orderBy: (b, { asc }) => [asc(b.optionId)],
      });

      return branches;
    }),
});
