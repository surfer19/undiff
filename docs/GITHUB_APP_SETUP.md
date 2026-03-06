# GitHub App Setup

Step-by-step guide to create and configure the GitHub App for sage.

## 1. Create the GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
   - Or use this direct link: https://github.com/settings/apps/new

2. Fill in the form:

| Field               | Value                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| **GitHub App name** | `sage-dev` (or any unique name)                                                                |
| **Homepage URL**    | `https://github.com/surfer19/sage`                                                      |
| **Webhook URL**     | Your public URL + `/webhooks/github` (see [Webhook Tunnel](#4-webhook-tunnel-for-development)) |
| **Webhook secret**  | Generate one: `openssl rand -hex 32`                                                           |

## 2. Permissions

Under **Repository permissions**, set:

| Permission        | Access                    |
| ----------------- | ------------------------- |
| **Pull requests** | Read & Write              |
| **Contents**      | Read-only                 |
| **Metadata**      | Read-only (auto-selected) |

Under **Organization permissions**: none needed.

## 3. Events

Subscribe to these events:

- [x] **Pull request review comment**

That's it — just one event for P0.

## 4. Post-Creation Steps

After clicking "Create GitHub App":

### a) Note your App ID

Shown at the top of the app settings page. Save it as `GITHUB_APP_ID`.

### b) Generate a Private Key

1. Scroll to **Private keys** → **Generate a private key**
2. A `.pem` file will download
3. Set it as `GITHUB_PRIVATE_KEY` in your `.env`:

```bash
# Option A: inline (replace newlines with \n)
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBA...\n-----END RSA PRIVATE KEY-----"

# Option B: path to file (if you prefer)
# GITHUB_PRIVATE_KEY_PATH=./private-key.pem
```

### c) Install the App

1. Go to **Install App** (left sidebar)
2. Select your test repository
3. Grant access to the repo(s) you want to test with

Note the **Installation ID** from the URL after installing:
`https://github.com/settings/installations/XXXXXX` ← that number.

## 4. Webhook Tunnel for Development

GitHub needs a public URL to send webhooks to your local server.

### Option A: smee.io (recommended for dev)

```bash
# Create a channel at https://smee.io — click "Start a new channel"
# Copy the URL, e.g. https://smee.io/abc123

# Install the smee client
npm install -g smee-client

# Forward webhooks to your local server
smee --url https://smee.io/abc123 --target http://localhost:4000/webhooks/github
```

Set `https://smee.io/abc123` as the **Webhook URL** in your GitHub App settings.

### Option B: ngrok

```bash
ngrok http 4000
# Use the generated https URL + /webhooks/github as your Webhook URL
```

## 5. Environment Variables

Your `.env` should now have:

```bash
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=your-generated-secret

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/next_review
ANTHROPIC_API_KEY=sk-ant-...

PORT=4000
HOST=0.0.0.0
LOG_LEVEL=debug
NODE_ENV=development
```

## 6. Test the Setup

1. Start the local database:

   ```bash
   podman compose up -d
   ```

2. Run migrations:

   ```bash
   pnpm db:migrate
   ```

3. Start the dev server:

   ```bash
   pnpm dev
   ```

4. Start smee (in another terminal):

   ```bash
   smee --url https://smee.io/YOUR_CHANNEL --target http://localhost:4000/webhooks/github
   ```

5. Go to a PR in your test repo, select some lines in the diff, and post a review comment:

   ```
   /explore "refactor this to use async/await"
   ```

6. Check your terminal — you should see:
   - Webhook received and verified
   - Explore run created with a `runId`
   - Ack comment posted back to the PR

## Troubleshooting

| Problem                         | Solution                                                |
| ------------------------------- | ------------------------------------------------------- |
| 401 on webhook                  | Check `GITHUB_WEBHOOK_SECRET` matches the app settings  |
| "Missing installation ID"       | Make sure the app is installed on the repo              |
| No webhook received             | Verify smee/ngrok is running and webhook URL is correct |
| Permission denied on PR comment | Check the app has `pull_requests: write` permission     |
| Ack comment not posted          | Check `GITHUB_PRIVATE_KEY` format (newlines as `\n`)    |
