/**
 * Scrape UFCStats fighter pages and upsert into Supabase.
 *
 * Usage:
 *   npx tsx scripts/scrape-fighters.ts              # run against the 10-fighter seed list
 *   npx tsx scripts/scrape-fighters.ts URL [URL...] # scrape specific URLs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { parseFighterPage } from "../src/lib/scrapers/ufcstats/fighter";
import { fetchHtml, sleep } from "../src/lib/scrapers/ufcstats/fetch";
import { createAdminClient } from "../src/lib/supabase/admin";
import type { ScrapedFighter } from "../src/lib/scrapers/types";

// Ten well-known UFC fighters spanning LW/WW/MW for the initial smoke test.
// UFCStats hex ids are stable; if one 404s, replace it.
const SEED_URLS = [
  "http://www.ufcstats.com/fighter-details/07c55e76efe5ea25", // Jon Jones
  "http://www.ufcstats.com/fighter-details/f4c49976c75c5ab2", // Islam Makhachev
  "http://www.ufcstats.com/fighter-details/b361180739bed4b0", // Charles Oliveira
  "http://www.ufcstats.com/fighter-details/c670aa48827d6be7", // Dustin Poirier
  "http://www.ufcstats.com/fighter-details/a1f79b0d844dd0e2", // Justin Gaethje
  "http://www.ufcstats.com/fighter-details/898436fa6bfe4b09", // Leon Edwards
  "http://www.ufcstats.com/fighter-details/e1248643d0c7533a", // Kamaru Usman
  "http://www.ufcstats.com/fighter-details/7f5586480d75d547", // Belal Muhammad
  "http://www.ufcstats.com/fighter-details/93fe7332d16c6ad9", // Israel Adesanya
  "http://www.ufcstats.com/fighter-details/a77633a989013265", // Alex Pereira
];

const REQUEST_DELAY_MS = 750;

async function main() {
  const urls = process.argv.slice(2);
  const targets = urls.length > 0 ? urls : SEED_URLS;

  console.log(`Scraping ${targets.length} fighter page(s)...`);

  const admin = createAdminClient();
  const results: ScrapedFighter[] = [];
  const errors: { url: string; error: string }[] = [];

  for (const [i, url] of targets.entries()) {
    try {
      if (i > 0) await sleep(REQUEST_DELAY_MS);
      const html = await fetchHtml(url);
      const fighter = parseFighterPage(html, url);
      results.push(fighter);
      console.log(
        `  [${i + 1}/${targets.length}] ${fighter.name} ` +
          `(${fighter.record.wins}-${fighter.record.losses}-${fighter.record.draws}) ` +
          `${fighter.heightCm ?? "?"}cm / ${fighter.reachCm ?? "?"}cm`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ url, error: msg });
      console.error(`  [${i + 1}/${targets.length}] FAILED ${url}: ${msg}`);
    }
  }

  if (results.length === 0) {
    console.error("No fighters scraped — aborting before writing to DB.");
    process.exit(1);
  }

  console.log(`\nUpserting ${results.length} fighter(s) into Supabase...`);

  const rows = results.map((f) => ({
    ufcstats_id: f.sourceId,
    name: f.name,
    dob: f.dob,
    height_cm: f.heightCm,
    reach_cm: f.reachCm,
    stance: f.stance,
    weight_class: f.weightClass,
    record_w: f.record.wins,
    record_l: f.record.losses,
    record_d: f.record.draws,
    record_nc: f.record.noContests,
  }));

  const { error } = await admin
    .from("fighters")
    .upsert(rows, { onConflict: "ufcstats_id" });

  if (error) {
    console.error("Upsert failed:", error);
    process.exit(1);
  }

  console.log(`Upsert ok. ${errors.length} fetch error(s).`);
  if (errors.length > 0) {
    console.log("Errors:");
    for (const e of errors) console.log(`  - ${e.url}: ${e.error}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
