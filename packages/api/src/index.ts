import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from monorepo root
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { loadEnv } from './config/index.js';
import { registerWebhookRoutes, registerExploreRoutes } from './routes/index.js';
import { appRouter } from './trpc/index.js';
import type { TRPCContext } from './trpc/index.js';

// Augment Fastify request with rawBody for webhook signature verification
declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

async function main() {
  const env = loadEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // Custom content type parser to capture raw body for webhook verification
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    try {
      request.rawBody = body.toString('utf-8');
      done(null, JSON.parse(request.rawBody));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Register plugins
  await app.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : false,
  });

  // Global error handler
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    request.log.error({ err: error, url: request.url }, 'Unhandled error');

    const statusCode = error.statusCode ?? 500;
    reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : error.message,
      ...(env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  });

  // Register routes
  registerWebhookRoutes(app, env);
  registerExploreRoutes(app, env);

  // Register tRPC
  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext: (): TRPCContext => ({ env }),
    },
  });

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down…`);
      await app.close();
      process.exit(0);
    });
  }

  // Start server
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`sage API running on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.fatal(err, 'Failed to start server');
    process.exit(1);
  }
}

main();
