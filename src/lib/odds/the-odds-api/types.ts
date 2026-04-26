/**
 * Subset of the the-odds-api.com response shapes we consume.
 * Full reference: https://the-odds-api.com/liveapi/guides/v4/
 */

export type OddsApiOutcome = {
  name: string;
  price: number;        // american odds
  point?: number;       // for spreads/totals
};

export type OddsApiMarket = {
  key: string;          // 'h2h' | 'spreads' | 'totals' | (props vary)
  last_update?: string; // ISO
  outcomes: OddsApiOutcome[];
};

export type OddsApiBookmaker = {
  key: string;          // 'draftkings' | 'fanduel' | 'betmgm' | ...
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
};

export type OddsApiEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string; // ISO
  home_team: string;     // for MMA: a fighter name
  away_team: string;     // for MMA: opposing fighter name
  bookmakers: OddsApiBookmaker[];
};
