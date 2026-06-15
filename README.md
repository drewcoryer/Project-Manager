# gtm.garden cockpit

Daily operating system for running a multi-client GTM consulting studio.

## Views

- **Today** - unified timeline (5 workspaces), now/next, Slack needs-reply, production priorities
- **Portfolio** - client health, revenue breakdown, concentration tracking
- **Queue** - production backlog with priority/status/client filters
- **Client deep-dive** - Granola notes, open deliverables, revenue % of book
- **Settings** - connect/disconnect Google Calendar + Slack workspaces, setup checklist

## Stack

- Next.js 15 (App Router)
- Tailwind v4 + shadcn/ui + Lucide icons
- Clerk (app auth)
- Supabase (data layer)
- Google Calendar API (multi-workspace via custom OAuth)
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
# - Run migration:
psql "$DATABASE_URL" -f supabase/001_initial.sql
# - Add Supabase keys to .env.local

# 5. Set up Google OAuth
# - Create project in Google Cloud Console
# - Enable Calendar API
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

# 7b. Optional: Slack cockpit pings
# - Add SLACK_PING_CHANNEL_ID for the channel or DM to receive pings
# - Add SLACK_PING_TOKEN for a bot/user token, or connect a Slack workspace
# - Add CRON_SECRET if you want /api/slack/ping called by a scheduler

# 8. Run
npm run dev

# 9. Connect workspaces
# - Open http://localhost:3000/settings
# - Click Connect on each Google Calendar workspace
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
    granola/route.ts                # Meeting notes
    queue/route.ts                  # Production queue CRUD
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
| workspaces | OAuth tokens for Google Calendar + Slack connections |
| queue_items | Production backlog with priority/status/client/source/link/reminder metadata |
| daily_priorities | Today's picked production items |

## Clients (seeded)

| Client | MRR | Color |
|--------|-----|-------|
| Charm / SKMR & Stable Kernel | $4,500 | amber |
| Haus Analytics | $3,500 | violet |
| Astra GTM / CoderPad | $3,000 | blue |
| Kopp Consulting | $800 | emerald |
