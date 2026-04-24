/**
 * Scrape the UFCStats events list (completed or upcoming) and upsert rows
 * into the `events` table.
 *
 * Usage:
 *   npx tsx scripts/scrape-events.ts --completed    # default
 *   npx tsx scripts/scrape-events.ts --upcoming
 *
 * Idempotent on `ufcstats_id`. Run before scrape-event-fights.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import {
  EVENTS_COMPLETED_URL,
  EVENTS_UPCOMING_URL,
  parseEventsListPage,
} from "../src/lib/scrapers/ufcstats/events";
import { fetchHtml } from "../src/lib/scrapers/ufcstats/fetch";
import { createAdminClient } from "../src/lib/supabase/admin";

async function main() {
  const mode = process.argv.includes("--upcoming") ? "upcoming" : "completed";
  const url = mode === "upcoming" ? EVENTS_UPCOMING_URL : EVENTS_COMPLETED_URL;

  console.log(`Fetching ${mode} events list: ${url}`);
  const html = await fetchHtml(url);
  const refs = parseEventsListPage(html);
  console.log(`Parsed ${refs.length} event row(s).`);

  if (refs.length === 0) {
    console.error("No rows parsed — aborting before write.");
    process.exit(1);
  }

  const admin = createAdminClient();
  const rows = refs.map((e) => ({
    ufcstats_id: e.sourceId,
    name: e.name,
    city: e.location,
    venue: null,
    scheduled_at: e.scheduledAt ? new Date(e.scheduledAt).toISOString() : null,
    is_numbered_ppv: /^UFC\s+\d+(?:$|\s*:)/i.test(e.name),
  }));

  const { error } = await admin
    .from("events")
    .upsert(rows, { onConflict: "ufcstats_id" });

  if (error) {
    console.error("Upsert failed:", error);
    process.exit(1);
  }

  console.log(`Upserted ${rows.length} event(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
