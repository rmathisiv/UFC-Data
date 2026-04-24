/**
 * Normalized shapes emitted by scrapers. Each scraper module adapts a source
 * (UFCStats, Tapology, Sherdog, BestFightOdds, ...) into these shapes so the
 * rest of the pipeline stays source-agnostic.
 */

export type ScrapedFighter = {
  source: "ufcstats" | "tapology" | "sherdog";
  sourceId: string;           // stable id/slug at the source (e.g. ufcstats hex id)
  sourceUrl: string;
  name: string;
  dob: string | null;         // ISO date (YYYY-MM-DD)
  heightCm: number | null;
  reachCm: number | null;
  stance: string | null;
  weightClass: string | null;
  record: {
    wins: number;
    losses: number;
    draws: number;
    noContests: number;
  };
  fightUrls: string[];        // source urls of fights on the fighter's page
};
