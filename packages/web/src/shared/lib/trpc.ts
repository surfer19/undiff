import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@sage/api/trpc';

export const trpc = createTRPCReact<AppRouter>();
