import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(databaseUrl: string) {
  if (!_db) {
    const client = postgres(databaseUrl);
    _db = drizzle(client, { schema });
  }
  return _db;
}

export { schema };
export type Database = ReturnType<typeof getDb>;
