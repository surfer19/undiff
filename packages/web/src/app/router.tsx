import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router';
import { RootLayout } from '@/app/layout';
import { IndexPage } from '@/domains/home/pages/index';
import { RunOverview } from '@/domains/explore/pages/run-overview';
import { SolutionDetail } from '@/domains/explore/pages/solution-detail';
import { NotFound } from '@/shared/pages/not-found';

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
});

const runRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore/$runId',
  component: RunOverview,
});

const branchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore/$runId/branch/$branchId',
  component: SolutionDetail,
});

const routeTree = rootRoute.addChildren([indexRoute, runRoute, branchRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
