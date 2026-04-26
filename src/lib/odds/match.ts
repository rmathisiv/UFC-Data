/**
 * Match The Odds API events to our DB fights by fighter-name pair.
 *
 * Names from different sources differ in trivial ways (case, accents,
 * punctuation, particle capitalization like "du Plessis" vs "Du Plessis").
 * We normalize aggressively then exact-match on the unordered pair.
 */

export function normalizeFighterName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")    // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable, order-independent key for a pair of normalized names. */
export function pairKey(a: string, b: string): string {
  const na = normalizeFighterName(a);
  const nb = normalizeFighterName(b);
  return na < nb ? `${na}|${nb}` : `${nb}|${na}`;
}

export type DbFightForMatch = {
  fightId: string;
  fighterAName: string;
  fighterBName: string;
  fighterAId: string;
  fighterBId: string;
  scheduledAt: string | null; // event.scheduled_at ISO
};

export type FightMatch = {
  fightId: string;
  fighterAId: string;
  fighterBId: string;
  // Map from API's home/away name → our fighter db id.
  homeFighterId: string;
  awayFighterId: string;
};

/**
 * Build a lookup index of DB fights keyed by normalized fighter pair, then
 * resolve an API event's home/away pair against it. Returns null if no
 * unambiguous match exists.
 *
 * For rematches (same pair, different events) we disambiguate by picking
 * the fight whose scheduled_at is closest to the API event's commence_time.
 */
export function buildFightIndex(
  fights: DbFightForMatch[],
): Map<string, DbFightForMatch[]> {
  const index = new Map<string, DbFightForMatch[]>();
  for (const f of fights) {
    const key = pairKey(f.fighterAName, f.fighterBName);
    const list = index.get(key) ?? [];
    list.push(f);
    index.set(key, list);
  }
  return index;
}

export function matchEvent(
  index: Map<string, DbFightForMatch[]>,
  homeName: string,
  awayName: string,
  commenceTimeIso: string,
): FightMatch | null {
  const key = pairKey(homeName, awayName);
  const candidates = index.get(key);
  if (!candidates || candidates.length === 0) return null;

  let chosen = candidates[0];
  if (candidates.length > 1) {
    const target = new Date(commenceTimeIso).getTime();
    chosen = candidates.reduce((best, cur) => {
      const bestDelta = Math.abs(
        (best.scheduledAt ? new Date(best.scheduledAt).getTime() : 0) - target,
      );
      const curDelta = Math.abs(
        (cur.scheduledAt ? new Date(cur.scheduledAt).getTime() : 0) - target,
      );
      return curDelta < bestDelta ? cur : best;
    });
  }

  // Map home/away from API ↔ fighter ids in our DB. We don't know which
  // side the API picked as "home", so resolve by name.
  const nHome = normalizeFighterName(homeName);
  const nA = normalizeFighterName(chosen.fighterAName);
  const homeFighterId = nHome === nA ? chosen.fighterAId : chosen.fighterBId;
  const awayFighterId = nHome === nA ? chosen.fighterBId : chosen.fighterAId;

  return {
    fightId: chosen.fightId,
    fighterAId: chosen.fighterAId,
    fighterBId: chosen.fighterBId,
    homeFighterId,
    awayFighterId,
  };
}
