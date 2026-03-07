import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Monorepo root: packages/api/src/config -> ../../../../
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..', '..', '..', '..');

const envSchema = z.object({
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_PRIVATE_KEY: z.string().optional(),
  GITHUB_PRIVATE_KEY_PATH: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  AI_OPTIONS_MODEL: z.string().default('claude-3-5-haiku-latest'),
  AI_BRANCH_MODEL: z.string().default('claude-3-5-haiku-latest'),
  AI_OPTIONS_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(12000),
  AI_OPTIONS_MAX_TOKENS: z.coerce.number().int().positive().default(900),
  AI_BRANCH_MAX_TOKENS: z.coerce.number().int().positive().default(1200),
  WEB_APP_URL: z.string().url().default('http://localhost:5173'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = Omit<z.infer<typeof envSchema>, 'GITHUB_PRIVATE_KEY_PATH'> & {
  GITHUB_PRIVATE_KEY: string;
};

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    const missing = Object.entries(formatted)
      .map(([key, errs]) => `  ${key}: ${errs?.join(', ')}`)
      .join('\n');
    throw new Error(`Missing or invalid environment variables:\n${missing}`);
  }

  const data = result.data;

  // Resolve private key: inline value or file path
  let privateKey = data.GITHUB_PRIVATE_KEY;

  if (!privateKey && data.GITHUB_PRIVATE_KEY_PATH) {
    try {
      privateKey = readFileSync(resolve(ROOT_DIR, data.GITHUB_PRIVATE_KEY_PATH), 'utf-8');
    } catch (err) {
      throw new Error(
        `Failed to read GITHUB_PRIVATE_KEY_PATH (${data.GITHUB_PRIVATE_KEY_PATH}): ${(err as Error).message}`,
        { cause: err },
      );
    }
  }

  if (!privateKey) {
    throw new Error('Either GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH must be set');
  }

  return {
    ...data,
    GITHUB_PRIVATE_KEY: privateKey,
  };
}
