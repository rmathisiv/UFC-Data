import * as cheerio from "cheerio";
import type {
  ScrapedEvent,
  ScrapedFightRef,
  ScrapedFightRowResult,
  ScrapedFighterRef,
} from "../types";
import { extractSourceId } from "./fetch";

/**
 * Parse a UFCStats event-details page. Structure:
 *
 *   <h2 class="b-content__title">
 *     <span class="b-content__title-highlight">UFC 297: ... </span>
 *   </h2>
 *   <ul class="b-list__box-list">
 *     <li>Date: January 20, 2024</li>
 *     <li>Location: Toronto, Ontario, Canada</li>
 *     <li>Attendance: 18,746</li>
 *   </ul>
 *
 *   <table class="b-fight-details__table ... js-fight-table">
 *     <thead>...</thead>
 *     <tbody>
 *       <tr class="b-fight-details__table-row ..." data-link="...fight-details/XYZ">
 *         <td>(W/L flag)</td>
 *         <td>Fighter A <br/> Fighter B (with anchors to fighter-details/)</td>
 *         ... other stat columns ...
 *         <td>Weight class</td>
 *         <td>Method</td>
 *         <td>Round</td>
 *         <td>Time</td>
 *       </tr>
 *     </tbody>
 *   </table>
 *
 * Main event is the first row. Title fights are flagged by a belt icon
 * (`<img src="...belt.png">`) in the weight-class cell.
 */
export function parseEventPage(html: string, sourceUrl: string): ScrapedEvent {
  const $ = cheerio.load(html);

  const sourceId = extractSourceId(sourceUrl);
  if (!sourceId) {
    throw new Error(`Could not extract source id from ${sourceUrl}`);
  }

  const name = cleanText(
    $("h2.b-content__title span.b-content__title-highlight").first().text() ||
      $("h2.b-content__title").first().text(),
  );

  const info = parseInfoBox($);
  const { venue, city } = splitLocation(info.location);
  const isNumberedPpv = /^UFC\s+\d+(?:$|\s*:)/i.test(name);

  const fights: ScrapedFightRef[] = [];
  const rows = $("table.js-fight-table tbody tr.js-fight-details-click");
  rows.each((index, tr) => {
    const fight = parseFightRow($, tr, index);
    if (fight) fights.push(fight);
  });

  return {
    source: "ufcstats",
    sourceId,
    sourceUrl,
    name,
    scheduledAt: info.date,
    venue,
    city,
    isNumberedPpv,
    fights,
  };
}

// ---------------------------------------------------------------------------

function parseInfoBox($: cheerio.CheerioAPI): {
  date: string | null;
  location: string | null;
} {
  const info: Record<string, string> = {};
  $("ul.b-list__box-list li.b-list__box-list-item").each((_, el) => {
    const raw = cleanText($(el).text());
    const colon = raw.indexOf(":");
    if (colon < 0) return;
    const key = raw.slice(0, colon).trim().toLowerCase();
    const value = raw.slice(colon + 1).trim();
    if (value && value !== "--") info[key] = value;
  });

  const dateRaw = info["date"] ?? null;
  const d = dateRaw ? new Date(dateRaw) : null;
  const date = d && !Number.isNaN(d.getTime())
    ? d.toISOString().slice(0, 10)
    : null;

  return { date, location: info["location"] ?? null };
}

function parseFightRow(
  $: cheerio.CheerioAPI,
  tr: ReturnType<cheerio.CheerioAPI>[0],
  index: number,
): ScrapedFightRef | null {
  const $tr = $(tr);
  const fightUrl = $tr.attr("data-link") ?? "";
  if (!fightUrl.includes("/fight-details/")) return null;

  const sourceId = extractSourceId(fightUrl);
  if (!sourceId) return null;

  // Fighter anchors live in the second column. Two anchors, both pointing
  // to fighter-details/.
  const fighterAnchors = $tr
    .find("a.b-link")
    .filter((_, a) => ($(a).attr("href") ?? "").includes("/fighter-details/"));

  if (fighterAnchors.length < 2) return null;

  const fighterA = fighterRefFromAnchor($, fighterAnchors.eq(0));
  const fighterB = fighterRefFromAnchor($, fighterAnchors.eq(1));
  if (!fighterA || !fighterB) return null;

  const cells = $tr.find("td");
  const weightClassCell = cells.eq(cells.length - 4); // 4th from right
  const methodCell = cells.eq(cells.length - 3);
  const roundCell = cells.eq(cells.length - 2);
  const timeCell = cells.eq(cells.length - 1);

  const weightClass = cleanWeightClass(cleanText(weightClassCell.text()));
  const isTitleFight = weightClassCell.find("img").length > 0;
  const roundsScheduled = guessRoundsScheduled(index, isTitleFight);

  // Result: only present on completed events. The first column has a W/L
  // flag per fighter; if methodCell is empty or "--", the fight hasn't
  // happened yet.
  const methodText = cleanText(methodCell.text());
  let result: ScrapedFightRowResult | null = null;

  if (methodText && methodText !== "--") {
    const flagAnchors = cells.eq(0).find("i.b-flag__text");
    const aFlag = cleanText(flagAnchors.eq(0).text()).toLowerCase();
    const bFlag = cleanText(flagAnchors.eq(1).text()).toLowerCase();

    let winnerSourceId: string | null = null;
    if (aFlag === "win") winnerSourceId = fighterA.sourceId;
    else if (bFlag === "win") winnerSourceId = fighterB.sourceId;
    // Draw / NC / DQ leave winnerSourceId null.

    const roundNum = Number.parseInt(cleanText(roundCell.text()), 10);
    const endTime = cleanText(timeCell.text());

    result = {
      winnerSourceId,
      method: methodText,
      endRound: Number.isFinite(roundNum) ? roundNum : null,
      endTime: /^\d+:\d{2}$/.test(endTime) ? endTime : null,
    };
  }

  return {
    source: "ufcstats",
    sourceId,
    sourceUrl: fightUrl,
    cardPosition: index + 1,
    isMainEvent: index === 0,
    isTitleFight,
    weightClass,
    roundsScheduled,
    fighterA,
    fighterB,
    result,
  };
}

function fighterRefFromAnchor(
  $: cheerio.CheerioAPI,
  $a: cheerio.Cheerio<ReturnType<cheerio.CheerioAPI>[0]>,
): ScrapedFighterRef | null {
  const href = $a.attr("href") ?? "";
  const sourceId = extractSourceId(href);
  if (!sourceId) return null;
  const name = cleanText($a.text());
  if (!name) return null;
  return { source: "ufcstats", sourceId, sourceUrl: href, name };
}

// Main event + title fights are 5 rounds; everything else is 3. This is
// correct ~99% of the time since 2011 (when 5-round non-title main events
// became standard). Wrong for pre-2011 non-title main events (some were 3
// rounds) — the fight-details page is authoritative, so we'll correct on
// the second pass.
function guessRoundsScheduled(index: number, isTitleFight: boolean): number {
  return index === 0 || isTitleFight ? 5 : 3;
}

// UFCStats weight-class strings sometimes include "Title" / "Bout". Strip.
function cleanWeightClass(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/title\s*/i, "")
    .replace(/bout$/i, "")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

// "Toronto, Ontario, Canada" → venue=null, city="Toronto, Ontario, Canada".
// UFCStats listings don't distinguish venue from city. Keep the full
// string in `city`; leave `venue` for upstream sources (Tapology) to fill.
function splitLocation(location: string | null): {
  venue: string | null;
  city: string | null;
} {
  return { venue: null, city: location };
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
