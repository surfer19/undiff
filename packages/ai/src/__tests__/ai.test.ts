import { describe, it, expect, vi } from 'vitest';

// AI package tests — mock external AI SDK since it requires API keys
vi.mock('ai', () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(() => 'mocked-model'),
}));

describe('@sage/ai', () => {
  it('exports are importable', async () => {
    const mod = await import('../index.js');
    expect(mod).toBeDefined();
  });
});
