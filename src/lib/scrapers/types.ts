/**
 * Normalized shapes emitted by scrapers. Each scraper module adapts a source
 * (UFCStats, Tapology, Sherdog, BestFightOdds, ...) into these shapes so the
 * rest of the pipeline stays source-agnostic.
 */

export type Source = "ufcstats" | "tapology" | "sherdog";

export type ScrapedFighter = {
  source: Source;
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

/**
 * A row from the events-list page — just enough to queue an event-details
 * scrape. Full event metadata (venue, attendance) comes from the event page.
 */
export type ScrapedEventRef = {
  source: Source;
  sourceId: string;
  sourceUrl: string;
  name: string;
  scheduledAt: string | null;   // ISO datetime, date-only if no time given
  location: string | null;
};

/**
 * A fully scraped event-details page. Includes the event metadata plus one
 * ScrapedFightRef per fight on the card.
 */
export type ScrapedEvent = {
  source: Source;
  sourceId: string;
  sourceUrl: string;
  name: string;
  scheduledAt: string | null;
  venue: string | null;
  city: string | null;
  isNumberedPpv: boolean;
  fights: ScrapedFightRef[];
};

/**
 * A fight row as it appears on an event-details page. Enough to populate
 * the `fights` table; per-fighter stats + formal result come from the
 * fight-details page.
 */
export type ScrapedFightRef = {
  source: Source;
  sourceId: string;
  sourceUrl: string;
  cardPosition: number;          // 1 = main event, 2 = co-main, etc.
  isMainEvent: boolean;
  isTitleFight: boolean;
  weightClass: string | null;
  roundsScheduled: number;
  fighterA: ScrapedFighterRef;
  fighterB: ScrapedFighterRef;
  // Set when the event has already happened:
  result: ScrapedFightRowResult | null;
};

export type ScrapedFighterRef = {
  source: Source;
  sourceId: string;
  sourceUrl: string;
  name: string;
};

export type ScrapedFightRowResult = {
  winnerSourceId: string | null;  // null on draw/NC
  method: string;                 // "KO/TKO", "SUB", "U-DEC", "S-DEC", "M-DEC", "DQ", "NC", ...
  endRound: number | null;
  endTime: string | null;         // "mm:ss"
};

/**
 * A fully scraped fight-details page: canonical result plus per-fighter
 * aggregated stats. Used to populate `fight_results` + `fight_stats`.
 */
export type ScrapedFightDetail = {
  source: Source;
  sourceId: string;
  sourceUrl: string;
  eventSourceId: string | null;
  weightClass: string | null;
  isTitleFight: boolean;
  roundsScheduled: number;
  result: {
    winnerSourceId: string | null;
    method: string;                // raw UFCStats method, e.g. "KO/TKO", "Submission", "Decision - Unanimous"
    methodDetail: string | null;   // e.g. "Punch", "Rear-Naked Choke", "Unanimous"
    endRound: number | null;
    endTimeSeconds: number | null;
    fightEndedDistance: boolean;
  };
  stats: ScrapedFighterFightStats[];
};

export type ScrapedFighterFightStats = {
  fighterSourceId: string;
  fighterName: string;
  sigStrikesLanded: number;
  sigStrikesAttempted: number;
  takedownsLanded: number;
  takedownsAttempted: number;
  controlTimeSeconds: number;
  knockdowns: number;
  submissionAttempts: number;
};
