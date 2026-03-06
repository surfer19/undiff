import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { App } from 'octokit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', '..', '..');
config({ path: resolve(root, '.env') });

const pk = readFileSync(resolve(root, process.env.GITHUB_PRIVATE_KEY_PATH), 'utf-8');

const app = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: pk,
  webhooks: { secret: process.env.GITHUB_WEBHOOK_SECRET },
});

const { data } = await app.octokit.request('GET /app');
console.log('App name:', data.name);
console.log('App slug:', data.slug);
console.log('Events subscribed:', data.events);
console.log('Permissions:', JSON.stringify(data.permissions, null, 2));

const { data: installations } = await app.octokit.request('GET /app/installations');
console.log('\nInstallations:', installations.length);
for (const inst of installations) {
  console.log(`  - ${inst.account.login} (id: ${inst.id})`);
  console.log('    events:', inst.events);
  console.log('    permissions:', JSON.stringify(inst.permissions));
}
