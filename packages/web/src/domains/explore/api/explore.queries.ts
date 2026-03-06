import { trpc } from '@/shared/lib/trpc';

/** Fetch a single explore run by ID */
export function useExploreRun(runId: string) {
  return trpc.explore.getRun.useQuery({ runId });
}

/** Fetch all solution branches for a run */
export function useExploreBranches(runId: string, options?: { enabled?: boolean }) {
  return trpc.explore.getBranches.useQuery({ runId }, options);
}
