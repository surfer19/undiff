import { eq } from 'drizzle-orm';
import type { ExploreRunStatus } from '@sage/shared';
import type { Database } from './index.js';
import { schema } from './index.js';

/**
 * Update an explore run's status and optional extra fields in a single UPDATE.
 * Always sets `updatedAt` to now.
 */
export async function updateRunStatus(
  db: Database,
  runId: string,
  status: ExploreRunStatus,
  extraFields?: Partial<typeof schema.exploreRuns.$inferInsert>,
) {
  await db
    .update(schema.exploreRuns)
    .set({
      status,
      updatedAt: new Date(),
      ...extraFields,
    })
    .where(eq(schema.exploreRuns.id, runId));
}
