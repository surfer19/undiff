import { createAnthropic } from '@ai-sdk/anthropic';

let _provider: ReturnType<typeof createAnthropic> | null = null;

/**
 * Lazy singleton for the Anthropic AI provider.
 * Reuses the same instance across all AI calls within the process.
 */
export function getAIProvider(apiKey: string) {
  if (!_provider) {
    _provider = createAnthropic({ apiKey });
  }
  return _provider;
}
