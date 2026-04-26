/**
 * Snapshot current MMA odds from the-odds-api into the `odds_snapshots`
 * table. One row per (fight, book, market_type, selection).
 *
 * Usage:
 *   npx tsx scripts/snapshot-odds.ts                   # h2h, default books
 *   npx tsx scripts/snapshot-odds.ts --books all       # don't filter books
 *   npx tsx scripts/snapshot-odds.ts --markets h2h     # explicit markets
 *
 * Cost: 1 API credit per (markets * regions). h2h-only/us = 1 credit/run.
 *
 * Run hourly during fight week + once at fight time to capture closing
 * lines (price_at_close on `picks` is reconciled separately).
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import {
  DEFAULT_BOOKS,
  fetchMmaOdds,
} from "../src/lib/odds/the-odds-api/client";
import {
  buildFightIndex,
  matchEvent,
  type DbFightForMatch,
} from "../src/lib/odds/match";
import { createAdminClient } from "../src/lib/supabase/admin";

type CliOpts = { books: string[] | null; markets: string[] };

function parseArgs(): CliOpts {
  const args = process.argv.slice(2);
  let books: string[] | null = DEFAULT_BOOKS;
  let markets = ["h2h"];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--books") {
      const v = args[++i];
      books = v === "all" ? null : v.split(",");
    } else if (args[i] === "--markets") {
      markets = args[++i].split(",");
    }
  }
  return { books, markets };
}

async function main() {
  const { books, markets } = parseArgs();
  const admin = createAdminClient();

  console.log(
    `Fetching MMA odds (markets=${markets.join(",")}, books=${
      books?.join(",") ?? "all"
    })...`,
  );
  const events = await fetchMmaOdds({
    markets,
    bookmakers: books ?? undefined,
  });
  console.log(`Got ${events.length} event(s) from the-odds-api.`);

  // Pull all upcoming fights for the matcher.
  const now = new Date().toISOString();
  const { data: fights, error: fErr } = await admin
    .from("fights")
    .select(
      "id, fighter_a_id, fighter_b_id, scheduled_at, " +
        "fighter_a:fighter_a_id(name), fighter_b:fighter_b_id(name), " +
        "events!inner(scheduled_at)",
    )
    .gte("events.scheduled_at", now);
  if (fErr) throw fErr;

  type FightRow = {
    id: string;
    fighter_a_id: string;
    fighter_b_id: string;
    scheduled_at: string | null;
    fighter_a: { name: string } | null;
    fighter_b: { name: string } | null;
    events: { scheduled_at: string | null } | null;
  };

  const dbFights: DbFightForMatch[] = ((fights ?? []) as unknown as FightRow[])
    .filter((r) => r.fighter_a?.name && r.fighter_b?.name)
    .map((r) => ({
      fightId: r.id,
      fighterAId: r.fighter_a_id,
      fighterBId: r.fighter_b_id,
      fighterAName: r.fighter_a!.name,
      fighterBName: r.fighter_b!.name,
      scheduledAt: r.events?.scheduled_at ?? r.scheduled_at,
    }));

  const index = buildFightIndex(dbFights);
  console.log(`Built fight index with ${dbFights.length} upcoming fight(s).`);

  const rows: Array<{
    fight_id: string;
    book: string;
    market_type: string;
    market_detail: string | null;
    selection: string;
    price_american: number;
  }> = [];
  const unmatched: string[] = [];

  for (const ev of events) {
    const match = matchEvent(index, ev.home_team, ev.away_team, ev.commence_time);
    if (!match) {
      unmatched.push(`${ev.home_team} vs ${ev.away_team}`);
      continue;
    }

    for (const bm of ev.bookmakers) {
      for (const market of bm.markets) {
        // Map market keys to our market_type taxonomy. Add more as we
        // expand prop coverage.
        const marketType =
          market.key === "h2h"
            ? "moneyline"
            : market.key;

        for (const o of market.outcomes) {
          rows.push({
            fight_id: match.fightId,
            book: bm.key,
            market_type: marketType,
            market_detail: o.point != null ? String(o.point) : null,
            selection: o.name,
            price_american: o.price,
          });
        }
      }
    }
  }

  console.log(
    `Matched ${events.length - unmatched.length}/${events.length} event(s); ` +
      `${rows.length} odds row(s) to insert.`,
  );
  if (unmatched.length > 0) {
    console.log("Unmatched events (no DB fight found):");
    for (const u of unmatched) console.log(`  - ${u}`);
  }
  if (rows.length === 0) {
    console.log("Nothing to insert.");
    return;
  }

  // odds_snapshots is append-only — every snapshot is a new row, so we
  // insert (no upsert).
  const { error } = await admin.from("odds_snapshots").insert(rows);
  if (error) {
    console.error("Insert failed:", error);
    process.exit(1);
  }

  console.log(`Inserted ${rows.length} odds snapshot(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
