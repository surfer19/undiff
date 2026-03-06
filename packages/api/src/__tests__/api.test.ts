import { describe, it, expect, vi } from 'vitest';

// Mock heavy external deps so tests run without a real DB or env
vi.mock('postgres', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn(() => ({})),
}));

describe('@sage/api', () => {
  it('config module is importable', async () => {
    const mod = await import('../config/env');
    expect(mod).toBeDefined();
  });
});
