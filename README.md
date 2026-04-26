# ufcdata

UFC props analytics for bettors. Model numbers on every meaningful prop
market, compared live to sportsbook prices, with public CLV tracking on every
pick.

Solo-founder project. MVP target: 4–6 weeks to a first paying subscriber.
See the project brief for scope and principles.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind v4
- **Supabase** (Postgres + Auth + RLS)
- **Cheerio** for static HTML scraping (Playwright later if needed)
- **The Odds API** for sportsbook prices
- **Vercel** for hosting + cron

All JS/TS. No Python in the stack.

## Prerequisites

- Node 22+
- A Supabase project (free tier is fine)
- A [The Odds API](https://the-odds-api.com) key (needed from step 5 onward)

## Setup

```bash
npm install
cp .env.example .env.local
# fill in Supabase URL, anon key, service role key
```

### Database

Migrations live in `supabase/migrations/`. Apply them via the Supabase
dashboard SQL editor (paste + run, in order) or via the Supabase CLI:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

Schema is defined in:
- `0001_initial_schema.sql` — all tables from section 6 of the brief
- `0002_rls_public_read.sql` — public read; service role writes

## Scripts

```bash
npm run dev                   # next dev
npm run build                 # next build
npm run typecheck             # tsc --noEmit
npm test                      # node:test runner
npm run scrape:fighters       # fighter-details → fighters
npm run scrape:events         # events list → events
npm run scrape:event-fights   # event-details → fights (+ fighter placeholders)
npm run scrape:fight          # fight-details → fight_results + fight_stats
npm run snapshot:odds         # the-odds-api → odds_snapshots
```

### Odds snapshots

Run during fight week to capture sportsbook prices over time. Defaults to
moneyline on DraftKings / FanDuel / BetMGM (per the books locked in for
launch). Each run is one The Odds API credit.

```bash
npm run snapshot:odds                      # h2h, default books
npm run snapshot:odds -- --books all       # don't filter books
npm run snapshot:odds -- --markets h2h     # explicit markets
```

The script matches API events to DB fights by normalized fighter-name
pair (case- and diacritic-insensitive); rematches are disambiguated by
nearest scheduled_at. Unmatched events are logged but don't block the
insert. `odds_snapshots` is append-only — the captured_at column on each
row is the snapshot timestamp.

### Backfill workflow

Run once to populate history, in order:

```bash
npm run scrape:events                 # all completed UFCStats events
npm run scrape:event-fights           # for every event missing fights
npm run scrape:fight                  # every completed fight missing fight_results
npm run scrape:fighters               # fill in vitals for fighter placeholders
```

Each step is idempotent on its source id, so re-running is safe. Scripts
throttle at 750ms between requests — UFCStats has no documented rate limit,
be polite.

### Targeted scrapes

```bash
npm run scrape:fighters -- http://www.ufcstats.com/fighter-details/07c55e76efe5ea25
npm run scrape:events -- --upcoming
npm run scrape:event-fights -- <ufcstats_event_id>
npm run scrape:fight -- <ufcstats_fight_id>
```

## Project layout

```
src/
  lib/
    scrapers/
      types.ts                  # shared normalized shapes
      ufcstats/
        fetch.ts                # HTML fetch + helpers
        events.ts               # events-list parser (completed / upcoming)
        event.ts                # event-details parser (event + fights)
        fight.ts                # fight-details parser (result + stats)
        fighter.ts              # fighter-details parser
        __tests__/              # parser unit tests
    supabase/
      env.ts                    # env var accessors
      browser.ts                # browser client (anon)
      server.ts                 # SSR client (anon + cookies)
      admin.ts                  # service-role client (scripts only)
    odds/
      env.ts                    # ODDS_API_KEY accessor
      match.ts                  # name normalize + DB-fight matcher
      the-odds-api/
        client.ts               # fetchMmaOdds wrapper
        types.ts                # response shapes
scripts/
  scrape-fighters.ts            # CLI entry to scrape + upsert
supabase/
  migrations/                   # SQL migrations, applied in order
```

## Principles (from the brief)

- Ship the loop before the polish. Ugly UI + real data > pretty mockups.
- Every number traceable to a query. No static placeholders in prod.
- Log everything from day one.
- Model projections are immutable once written. Bump `model_version` when
  the model changes — never mutate `model_projections` rows in place.
- `picks` rows are frozen at creation. Never edit or delete them. CLV is
  the product's moat; the data has to be real.
