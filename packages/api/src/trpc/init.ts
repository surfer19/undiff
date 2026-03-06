import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import type { Env } from '../config/index.js';

export interface TRPCContext {
  env: Env;
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
