import { App } from 'octokit';
import type { Env } from '../config/index.js';

let _githubApp: App | null = null;

export function getGitHubApp(env: Env): App {
  if (!_githubApp) {
    _githubApp = new App({
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_PRIVATE_KEY,
      webhooks: {
        secret: env.GITHUB_WEBHOOK_SECRET,
      },
    });
  }
  return _githubApp;
}
