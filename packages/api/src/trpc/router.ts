import { router } from './init.js';
import { exploreRouter } from './explore.js';

export const appRouter = router({
  explore: exploreRouter,
});

export type AppRouter = typeof appRouter;
