# gtm.garden cockpit

Daily operating system for running a multi-client GTM consulting studio.

## Views

- **Today** - unified timeline (5 workspaces), now/next, Slack needs-reply, production priorities
- **Portfolio** - client health, revenue breakdown, concentration tracking
- **Queue** - production backlog with priority/status/client filters
- **Client deep-dive** - Granola notes, open deliverables, revenue % of book
- **Settings** - connect/disconnect Google Calendar, Gmail, and Slack workspaces, setup checklist

## Stack

- Next.js 15 (App Router)
- Tailwind v4 + shadcn/ui + Lucide icons
- Clerk (app auth)
- Supabase (data layer)
- Google Calendar + Gmail APIs (multi-account via custom OAuth)
- Slack API (multi-workspace via custom OAuth)
- Granola API (meeting notes)

## Quick start

```bash
# 1. Unpack and install
tar xzf gtm-cockpit.tar.gz
cd gtm-cockpit
npm install

# 2. Copy env and fill in values
cp .env.example .env.local

# 3. Set up Clerk
# - Create app at clerk.com
# - Add Clerk keys to .env.local

# 4. Set up Supabase
# - Create project or use existing
# - Run migrations:
psql "$DATABASE_URL" -f supabase/001_initial.sql
psql "$DATABASE_URL" -f supabase/002_granola_actions.sql
psql "$DATABASE_URL" -f supabase/003_queue_terminal_statuses.sql
psql "$DATABASE_URL" -f supabase/004_granola_realtime_slack.sql
psql "$DATABASE_URL" -f supabase/005_raw_events_triage.sql
# - Add Supabase keys to .env.local

# 5. Set up Google OAuth
# - Create project in Google Cloud Console
# - Enable Calendar API and Gmail API
# - Create OAuth 2.0 credentials (Web application)
# - Add redirect URI: http://localhost:3000/api/auth/callback/google
# - Add client ID + secret to .env.local

# 6. Set up Slack OAuth
# - Create app at api.slack.com/apps
# - Add redirect URI: http://localhost:3000/api/auth/callback/slack
# - Enable user token scopes: channels:read, channels:history,
#   groups:read, groups:history, im:read, im:history,
#   search:read, users:read, users:read.email
# - Add client ID + secret to .env.local

# 7. Add Granola API key to .env.local

# 7b. Slack cockpit pings + Granola to-do notifications
# - Add SLACK_PING_CHANNEL_ID for the channel or DM to receive pings
# - Add SLACK_PING_TOKEN for a bot/user token with chat:write
# - Add CRON_SECRET for /api/cron/granola and /api/slack/ping schedulers
# - Optional: add GRANOLA_ACTION_SECRET for immediate /api/granola/list-todos action calls
# - In Settings, add each client's dedicated Slack channel ID

# 7c. Optional: AI fallback for Granola extraction
# - Add OPENAI_API_KEY to extract tasks when Granola's summary has no clear action bullets
# - Optional: set OPENAI_MODEL, TRIAGE_MIN_CONFIDENCE, and TRIAGE_BATCH_SIZE

# 8. Run
npm run dev

# 9. Connect workspaces
# - Open http://localhost:3000/settings
# - Click Connect on each Google Calendar workspace
# - Click Connect on each Gmail account you control
# - Click Connect on each Slack workspace

# 10. Deploy
vercel
# Update redirect URIs to production URL
```

## Architecture

```
app/
  page.tsx                          # Main cockpit
  settings/page.tsx                 # Workspace connection management
  api/
    auth/callback/google/route.ts   # Google OAuth flow (multi-workspace)
    auth/callback/slack/route.ts    # Slack OAuth flow (multi-workspace)
    calendar/route.ts               # Unified calendar events
    clients/route.ts                # Client config
    slack/route.ts                  # Slack summaries
    slack/ping/route.ts             # Manual or cron-triggered attention digest pings
    cron/granola/route.ts           # Vercel cron-triggered Granola sync + Slack task notifications
    cron/triage/route.ts            # Vercel cron-triggered raw source collection + AI task candidates
    granola/route.ts                # Meeting notes
    granola/list-todos/route.ts     # Protected immediate action endpoint for /list todo workflows
    queue/route.ts                  # Production queue CRUD
    triage/route.ts                 # Manual AI triage + candidate approve/dismiss
    workspaces/route.ts             # Workspace management
lib/
  calendar.ts     # Multi-workspace Google Calendar + token refresh
  slack.ts        # Multi-workspace Slack + search
  granola.ts      # Granola meeting notes
  supabase.ts     # Supabase client + types
  utils.ts        # cn() helper
components/
  ui/             # shadcn/ui components (Card, Badge, Button, Tabs, etc.)
  cockpit/
    shell.tsx     # Main cockpit component
supabase/
  001_initial.sql # Schema + seed data
```

## Key behaviors

- **Clone filtering**: auto-strips "(Clone)" events from OneCal cross-workspace blockers
- **Client inference**: events auto-tagged to clients via title/workspace pattern matching
- **Token refresh**: Google OAuth tokens auto-refresh on each calendar fetch
- **Multi-workspace Slack**: user tokens (not bot tokens) - works in any workspace you're a member of
- **Graceful degradation**: works with zero integrations connected (mock data), progressively better as you connect sources

## Data model

| Table | Purpose |
|-------|---------|
| clients | Client config (name, color, MRR, health) |
| workspaces | OAuth tokens for Google Calendar, Gmail, and Slack connections |
| queue_items | Production backlog with priority/status/client/source/link/reminder metadata |
| granola_action_items | Durable Granola to-do items linked into queue_items |
| raw_events | Durable source inbox for Calendar/Gmail/Slack records before LLM triage |
| task_candidates | LLM-created task suggestions awaiting approve/dismiss |
| daily_priorities | Today's picked production items |

## Granola to Slack automation

- Vercel Pro Cron calls `/api/cron/granola` every 5 minutes via `vercel.json`.
- The cron route reads Granola notes with `updated_after`, imports stable task IDs into Supabase, and posts newly discovered to-dos into each client's mapped Slack channel.
- An immediate action can `POST /api/granola/list-todos` with `Authorization: Bearer $GRANOLA_ACTION_SECRET` to run the same sync after a call.
- Manual Granola Sync still imports/backfills tasks, but suppresses Slack notifications to avoid old-note spam.
- Slack failures leave queue items retryable; the next cron run will try unsent Granola notifications again.

## Source inbox + AI triage

- Vercel Cron calls `/api/cron/triage` every 20 minutes via `vercel.json`.
- Connected Calendar, Gmail, and Slack workspaces write durable rows to `raw_events`.
- OpenAI turns only concrete asks/follow-ups/blockers/deadlines into `task_candidates`.
- Pending candidates appear in the Queue tab. Approving one creates a real `queue_items` row; dismissing one keeps it out of the cockpit.
- Disconnected Gmail/Calendar/Slack placeholders are skipped, so accounts you do not have auth access to can remain visible but inactive.

## Clients (seeded)

| Client | MRR | Color |
|--------|-----|-------|
| Charm / SKMR & Stable Kernel | $4,500 | amber |
| Haus Analytics | $3,500 | violet |
| Astra GTM / CoderPad | $3,000 | blue |
| Kopp Consulting | $800 | emerald |
