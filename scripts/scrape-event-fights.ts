/**
 * For each event in the DB (or a specified list), fetch the event-details
 * page and upsert its fights into the `fights` table. Also upserts minimal
 * fighter placeholder rows (name + ufcstats_id) for any fighter not already
 * in `fighters` so foreign keys resolve. Run `scrape-fighters` afterward
 * to fill in vitals for those placeholders.
 *
 * Usage:
 *   npx tsx scripts/scrape-event-fights.ts                 # all events in DB missing fights
 *   npx tsx scripts/scrape-event-fights.ts UFCSTATS_ID...  # specific events (by ufcstats id)
 *   npx tsx scripts/scrape-event-fights.ts --all           # force re-scrape every event
 *
 * Idempotent on fights.ufcstats_id.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { parseEventPage } from "../src/lib/scrapers/ufcstats/event";
import { fetchHtml, sleep } from "../src/lib/scrapers/ufcstats/fetch";
import { createAdminClient } from "../src/lib/supabase/admin";
import type { ScrapedFightRef } from "../src/lib/scrapers/types";

const REQUEST_DELAY_MS = 750;
const EVENT_URL = (id: string) =>
  `http://www.ufcstats.com/event-details/${id}`;

type DbEvent = { id: string; ufcstats_id: string | null; name: string };
type DbFighter = { id: string; ufcstats_id: string | null };

async function main() {
  const args = process.argv.slice(2);
  const forceAll = args.includes("--all");
  const specificIds = args.filter((a) => !a.startsWith("--"));

  const admin = createAdminClient();

  const events = await selectTargetEvents(admin, { forceAll, specificIds });
  console.log(`Scraping ${events.length} event(s).`);

  for (const [i, evt] of events.entries()) {
    if (!evt.ufcstats_id) {
      console.warn(`  [${i + 1}/${events.length}] ${evt.name} has no ufcstats_id, skipping`);
      continue;
    }

    try {
      if (i > 0) await sleep(REQUEST_DELAY_MS);
      const url = EVENT_URL(evt.ufcstats_id);
      const html = await fetchHtml(url);
      const event = parseEventPage(html, url);
      console.log(
        `  [${i + 1}/${events.length}] ${event.name} — ${event.fights.length} fight(s)`,
      );

      await persistEventFights(admin, evt.id, event.fights);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [${i + 1}/${events.length}] FAILED ${evt.name}: ${msg}`);
    }
  }
}

async function selectTargetEvents(
  admin: ReturnType<typeof createAdminClient>,
  opts: { forceAll: boolean; specificIds: string[] },
): Promise<DbEvent[]> {
  if (opts.specificIds.length > 0) {
    const { data, error } = await admin
      .from("events")
      .select("id, ufcstats_id, name")
      .in("ufcstats_id", opts.specificIds);
    if (error) throw error;
    return data ?? [];
  }

  const { data, error } = await admin
    .from("events")
    .select("id, ufcstats_id, name")
    .order("scheduled_at", { ascending: false });
  if (error) throw error;

  const all = data ?? [];
  if (opts.forceAll) return all;

  // Skip events that already have at least one fight.
  const { data: withFights, error: fErr } = await admin
    .from("fights")
    .select("event_id");
  if (fErr) throw fErr;
  const seen = new Set((withFights ?? []).map((r) => r.event_id));
  return all.filter((e) => !seen.has(e.id));
}

async function persistEventFights(
  admin: ReturnType<typeof createAdminClient>,
  eventDbId: string,
  fights: ScrapedFightRef[],
) {
  if (fights.length === 0) return;

  // 1. Ensure fighter rows exist for every fighter referenced.
  const fighterRefs = new Map<string, string>(); // sourceId -> name
  for (const f of fights) {
    fighterRefs.set(f.fighterA.sourceId, f.fighterA.name);
    fighterRefs.set(f.fighterB.sourceId, f.fighterB.name);
  }

  const fighterRows = [...fighterRefs.entries()].map(([sourceId, name]) => ({
    ufcstats_id: sourceId,
    name,
  }));

  const { error: fErr } = await admin
    .from("fighters")
    .upsert(fighterRows, { onConflict: "ufcstats_id", ignoreDuplicates: true });
  if (fErr) throw fErr;

  // 2. Look up their db ids.
  const { data: fighterRows2, error: fErr2 } = await admin
    .from("fighters")
    .select("id, ufcstats_id")
    .in("ufcstats_id", [...fighterRefs.keys()]);
  if (fErr2) throw fErr2;

  const fighterIdMap = new Map<string, string>();
  for (const r of (fighterRows2 ?? []) as DbFighter[]) {
    if (r.ufcstats_id) fighterIdMap.set(r.ufcstats_id, r.id);
  }

  // 3. Upsert fights.
  const fightRows = fights
    .map((f) => {
      const aId = fighterIdMap.get(f.fighterA.sourceId);
      const bId = fighterIdMap.get(f.fighterB.sourceId);
      if (!aId || !bId) return null;
      return {
        ufcstats_id: f.sourceId,
        event_id: eventDbId,
        fighter_a_id: aId,
        fighter_b_id: bId,
        weight_class: f.weightClass,
        rounds_scheduled: f.roundsScheduled,
        is_title_fight: f.isTitleFight,
        is_main_event: f.isMainEvent,
        card_position: f.cardPosition,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const { error: fightErr } = await admin
    .from("fights")
    .upsert(fightRows, { onConflict: "ufcstats_id" });
  if (fightErr) throw fightErr;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
