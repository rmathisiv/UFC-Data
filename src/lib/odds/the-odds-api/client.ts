import { oddsApiKey } from "../env";
import type { OddsApiEvent } from "./types";

const BASE = "https://api.the-odds-api.com/v4";
const SPORT_KEY = "mma_mixed_martial_arts";

export type FetchOddsOptions = {
  markets?: string[];   // default: ['h2h']
  regions?: string[];   // default: ['us']
  oddsFormat?: "american" | "decimal";
  bookmakers?: string[]; // optional book-key filter at the API layer
};

/**
 * Fetch current MMA odds. Returns one event per scheduled fight, with
 * one or more bookmakers per event.
 *
 * Cost: 1 request consumes (markets * regions) credits per the-odds-api
 * pricing. h2h-only/us is the cheapest combo.
 */
export async function fetchMmaOdds(
  opts: FetchOddsOptions = {},
): Promise<OddsApiEvent[]> {
  const params = new URLSearchParams({
    apiKey: oddsApiKey(),
    regions: (opts.regions ?? ["us"]).join(","),
    markets: (opts.markets ?? ["h2h"]).join(","),
    oddsFormat: opts.oddsFormat ?? "american",
  });
  if (opts.bookmakers?.length) {
    params.set("bookmakers", opts.bookmakers.join(","));
  }

  const url = `${BASE}/sports/${SPORT_KEY}/odds/?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `the-odds-api ${res.status} ${res.statusText}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as OddsApiEvent[];
}

/** Books we sample from at launch (per project brief: DK, FD, MGM). */
export const DEFAULT_BOOKS = ["draftkings", "fanduel", "betmgm"];
