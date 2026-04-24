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
npm run dev              # next dev
npm run build            # next build
npm run typecheck        # tsc --noEmit
npm test                 # node:test runner
npm run scrape:fighters  # scrape UFCStats fighter pages
```

### scrape:fighters

Scrapes a UFCStats fighter-details page, normalizes into `ScrapedFighter`,
and upserts into the `fighters` table keyed on `ufcstats_id`.

```bash
# default: 10-fighter smoke-test seed list
npm run scrape:fighters

# specific URLs
npm run scrape:fighters -- http://www.ufcstats.com/fighter-details/07c55e76efe5ea25
```

Throttled to 750ms between requests. UFCStats has no public API and no
documented rate limit — be polite.

## Project layout

```
src/
  lib/
    scrapers/
      types.ts                  # shared normalized shapes
      ufcstats/
        fetch.ts                # HTML fetch + helpers
        fighter.ts              # fighter-details parser
        __tests__/              # parser unit tests
    supabase/
      env.ts                    # env var accessors
      browser.ts                # browser client (anon)
      server.ts                 # SSR client (anon + cookies)
      admin.ts                  # service-role client (scripts only)
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
