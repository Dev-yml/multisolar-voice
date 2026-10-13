# Multi Solar Voice

AI voice agent for Multi Solar (inbound + outbound calls, English ⇄ Hindi) and the
**Voice Console** — the team's private web app for call records, leads, escalations,
knowledge, prices and settings.

**Separate from the website.** Own folder, own Supabase database, own login, own Vercel project,
own port locally (3001). The website and its database are not touched.

## What works today (no company accounts needed)

| Part | Status |
|---|---|
| Agent brain (`packages/core`) — greeting by name + time of day, English→Hindi switch, home/business/factory, bill → kW size, price, PM Surya Ghar subsidy, site-visit booking, callback, Do-Not-Call, 48-hour escalation, number safety guard | ✅ built, 32 tests |
| Voice Console (`apps/console`) — dashboard, test call, calls + transcripts, leads (+ CSV import), escalations board, knowledge (upload PDF/Word + search), prices & subsidy, agent settings, users | ✅ built, runs locally |
| Test Call — talk to the agent in the browser (type, or mic + browser voice) | ✅ |
| **Voice Agent server** (`apps/voice`) — Smartflo voice stream ⇄ Sarvam speech ⇄ agent; barge-in; silence handling | ✅ built, tested with a simulator |
| **Auto-dialer** — consent, DNC, 09:00–21:00, attempts, retry gap, callbacks, budget, lines at once; "Call now" in the Console | ✅ built, `npm run sim:day` |
| Real phone calls through Tata Smartflo | ⏳ deploy on Fly.io + Voice Bot / API keys in the portal — `docs/VOICE-SERVER.md` |
| Natural Hindi/English voice (Sarvam) | ✅ code ready — add `SARVAM_API_KEY` |
| Smarter free-form answers (Claude) | ⏳ optional, needs API key |
| Online: Console on Vercel, database on Supabase | ✅ ready to deploy — see the guide |

## Run it

Needs Node.js 22.12+ and a Supabase project (Postgres).

```bash
npm run setup     # first time: paste the Supabase URLs; creates tables, starting data, admin user
npm run dev       # http://localhost:3001
```

Step-by-step (Windows, Supabase, GitHub, Vercel): [docs/WINDOWS-SETUP.md](docs/WINDOWS-SETUP.md)
Questions for Tata Smartflo: [docs/TATA-SMARTFLO-QUESTIONS.md](docs/TATA-SMARTFLO-QUESTIONS.md)

## Commands

```bash
npm run dev         # Voice Console on http://localhost:3001
npm run sim:day     # a simulated calling day: dialer + agent + fake Smartflo, ~30 s
npm run voice       # Voice Agent server locally (http://localhost:8080)
npm run voice:env   # create apps/voice/.env from apps/console/.env + print Smartflo URLs
npm test            # agent tests
npm run typecheck
npm run lint
npm run build && npm start   # production mode
npm run db:studio   # browse the database
```

## Layout

```
packages/core/        the agent: rule engine, Hindi/English text, pricing, subsidy, knowledge search
packages/data/        database access shared by Console + Voice server: calls, tools, knowledge, dialer rules
apps/voice/           Voice Agent server: Smartflo stream, Sarvam, sessions, dialer, simulator → Fly.io
  src/engine/         rule-agent.ts (conversation), nlu.ts (understanding), messages.ts (what it says)
  test/               conversation tests (Vinay flow, DNC, busy, escalations, safety)
apps/console/         Voice Console (Next.js + Prisma + Supabase Postgres) — deploys to Vercel
  prisma/             schema, migrations, seed (+ website knowledge export)
  src/app/(panel)/    pages
  src/lib/            calls.ts (turn-by-turn), agent-tools.ts (DB tools), knowledge.ts
scripts/setup.mjs     one-time setup on a new computer
scripts/voice-env.mjs settings file for the Voice Agent server
Dockerfile.voice, fly.toml   deploy the Voice Agent server (Fly.io, Mumbai)
```

## Rules the agent follows

- Every price, size and subsidy figure comes from the **Prices & subsidy** tables — never invented.
  A safety guard blocks any number in a reply that didn't come from a tool or the caller.
- Seeded prices are the website's indicative costs, marked **sample** until the official sheet is entered.
- Unknown questions, discounts, batteries/off-grid, complaints → escalation with a 48-hour callback promise.
- Says it is an AI assistant and that the call may be recorded. "Don't call me" → Do-Not-Call list, forever.
- Outbound calling is **off** by default; only consented leads, 09:00–21:00.

## Security

See [docs/SECURITY.md](docs/SECURITY.md) — 20-point review and what to do before going live.

## Secrets

`apps/console/.env` holds the database password and keys. It is git-ignored. Never commit,
email or paste it in chat. Template: `.env.example`.
