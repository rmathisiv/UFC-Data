/**
 * For each fight in the DB (or a specific list), fetch its fight-details
 * page and upsert into `fight_results` + `fight_stats`. Only runs on
 * fights whose event has already happened (scheduled_at < now).
 *
 * Usage:
 *   npx tsx scripts/scrape-fight.ts                 # all completed fights missing fight_results
 *   npx tsx scripts/scrape-fight.ts UFCSTATS_ID...  # specific fights (by fights.ufcstats_id)
 *   npx tsx scripts/scrape-fight.ts --all           # force re-scrape every completed fight
 *
 * Idempotent on fight_results.fight_id + fight_stats(fight_id, fighter_id).
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { parseFightPage } from "../src/lib/scrapers/ufcstats/fight";
import { fetchHtml, sleep } from "../src/lib/scrapers/ufcstats/fetch";
import { createAdminClient } from "../src/lib/supabase/admin";

const REQUEST_DELAY_MS = 750;
const FIGHT_URL = (id: string) =>
  `http://www.ufcstats.com/fight-details/${id}`;

type DbFight = {
  id: string;
  ufcstats_id: string | null;
  rounds_scheduled: number;
  event_id: string;
  fighter_a_id: string;
  fighter_b_id: string;
};

async function main() {
  const args = process.argv.slice(2);
  const forceAll = args.includes("--all");
  const specificIds = args.filter((a) => !a.startsWith("--"));

  const admin = createAdminClient();
  const fights = await selectTargetFights(admin, { forceAll, specificIds });
  console.log(`Scraping ${fights.length} fight(s).`);

  // Map fighter db ids by ufcstats id so we can attach stats rows.
  const fighterIdMap = await loadFighterIdMap(admin);

  for (const [i, fight] of fights.entries()) {
    if (!fight.ufcstats_id) continue;

    try {
      if (i > 0) await sleep(REQUEST_DELAY_MS);
      const url = FIGHT_URL(fight.ufcstats_id);
      const html = await fetchHtml(url);
      const detail = parseFightPage(html, url);

      const winnerDbId = detail.result.winnerSourceId
        ? fighterIdMap.get(detail.result.winnerSourceId) ?? null
        : null;

      // Upsert fight_results.
      const { error: rErr } = await admin
        .from("fight_results")
        .upsert(
          {
            fight_id: fight.id,
            winner_id: winnerDbId,
            method: detail.result.method,
            method_detail: detail.result.methodDetail,
            end_round: detail.result.endRound,
            end_time_seconds: detail.result.endTimeSeconds,
            fight_ended_distance: detail.result.fightEndedDistance,
          },
          { onConflict: "fight_id" },
        );
      if (rErr) throw rErr;

      // Correct rounds_scheduled on the fight row if the fight-details
      // page disagrees with our event-page guess.
      if (detail.roundsScheduled !== fight.rounds_scheduled) {
        const { error: fErr } = await admin
          .from("fights")
          .update({
            rounds_scheduled: detail.roundsScheduled,
            is_title_fight: detail.isTitleFight,
            weight_class: detail.weightClass ?? null,
          })
          .eq("id", fight.id);
        if (fErr) throw fErr;
      }

      // Upsert fight_stats (one row per fighter).
      const statRows = detail.stats
        .map((s) => {
          const fighterDbId = fighterIdMap.get(s.fighterSourceId);
          if (!fighterDbId) return null;
          return {
            fight_id: fight.id,
            fighter_id: fighterDbId,
            sig_strikes_landed: s.sigStrikesLanded,
            sig_strikes_attempted: s.sigStrikesAttempted,
            takedowns_landed: s.takedownsLanded,
            takedowns_attempted: s.takedownsAttempted,
            control_time_seconds: s.controlTimeSeconds,
            knockdowns: s.knockdowns,
            submission_attempts: s.submissionAttempts,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (statRows.length > 0) {
        const { error: sErr } = await admin
          .from("fight_stats")
          .upsert(statRows, { onConflict: "fight_id,fighter_id" });
        if (sErr) throw sErr;
      }

      console.log(
        `  [${i + 1}/${fights.length}] ${fight.ufcstats_id} ok ` +
          `(${detail.result.method}${
            detail.result.endRound ? `, R${detail.result.endRound}` : ""
          })`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `  [${i + 1}/${fights.length}] FAILED ${fight.ufcstats_id}: ${msg}`,
      );
    }
  }
}

async function selectTargetFights(
  admin: ReturnType<typeof createAdminClient>,
  opts: { forceAll: boolean; specificIds: string[] },
): Promise<DbFight[]> {
  if (opts.specificIds.length > 0) {
    const { data, error } = await admin
      .from("fights")
      .select("id, ufcstats_id, rounds_scheduled, event_id, fighter_a_id, fighter_b_id")
      .in("ufcstats_id", opts.specificIds);
    if (error) throw error;
    return data ?? [];
  }

  // Fights whose event has already started.
  const nowIso = new Date().toISOString();
  const { data: pastEvents, error: eErr } = await admin
    .from("events")
    .select("id")
    .lt("scheduled_at", nowIso);
  if (eErr) throw eErr;
  const pastEventIds = (pastEvents ?? []).map((e) => e.id);
  if (pastEventIds.length === 0) return [];

  const { data: fights, error: fErr } = await admin
    .from("fights")
    .select("id, ufcstats_id, rounds_scheduled, event_id, fighter_a_id, fighter_b_id")
    .in("event_id", pastEventIds);
  if (fErr) throw fErr;
  const all = fights ?? [];

  if (opts.forceAll) return all;

  const { data: withResults, error: rErr } = await admin
    .from("fight_results")
    .select("fight_id");
  if (rErr) throw rErr;
  const seen = new Set((withResults ?? []).map((r) => r.fight_id));
  return all.filter((f) => !seen.has(f.id));
}

async function loadFighterIdMap(
  admin: ReturnType<typeof createAdminClient>,
): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from("fighters")
    .select("id, ufcstats_id");
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.ufcstats_id) map.set(row.ufcstats_id, row.id);
  }
  return map;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
