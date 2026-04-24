import * as cheerio from "cheerio";
import type {
  ScrapedFightDetail,
  ScrapedFighterFightStats,
} from "../types";
import { extractSourceId } from "./fetch";

/**
 * Parse a UFCStats fight-details page. Structure (simplified):
 *
 *   <h2 class="b-content__title-highlight">Event name</h2>
 *   <div class="b-fight-details__persons">
 *     <div class="b-fight-details__person">
 *       <i class="b-fight-details__person-status b-fight-details__person-status_style_green">W</i>
 *       <h3><a href=".../fighter-details/..">Fighter A</a></h3>
 *     </div>
 *     <div class="b-fight-details__person">
 *       <i class="b-fight-details__person-status ...">L</i>
 *       <h3><a href=".../fighter-details/..">Fighter B</a></h3>
 *     </div>
 *   </div>
 *
 *   <i class="b-fight-details__fight-title">
 *     <img src="/belt.png">   <!-- present on title fights -->
 *     Middleweight Title Bout
 *   </i>
 *
 *   <p class="b-fight-details__text">
 *     <i><i class="b-fight-details__label">Method:</i> Decision - Split </i>
 *     <i><i class="b-fight-details__label">Round:</i>5</i>
 *     <i><i class="b-fight-details__label">Time:</i>5:00</i>
 *     <i><i class="b-fight-details__label">Time format:</i>5 Rnd (5-5-5-5-5)</i>
 *   </p>
 *
 *   <section class="b-fight-details__section js-fight-section">
 *     <table class="b-fight-details__table"> ...totals table... </table>
 *   </section>
 *
 * Totals table columns (order varies historically — we map by <th> label):
 *   Fighter | KD | Sig. str. | Sig. str. % | Total str. | Td | Td % |
 *   Sub. att | Rev. | Ctrl
 */
export function parseFightPage(
  html: string,
  sourceUrl: string,
): ScrapedFightDetail {
  const $ = cheerio.load(html);

  const sourceId = extractSourceId(sourceUrl);
  if (!sourceId) {
    throw new Error(`Could not extract source id from ${sourceUrl}`);
  }

  const persons = parsePersons($);
  if (persons.length !== 2) {
    throw new Error(
      `Expected 2 persons on fight page ${sourceUrl}, got ${persons.length}`,
    );
  }

  const labels = parseLabelValues($);
  const method = labels["method"] ?? "";
  const { method: methodClean, methodDetail } = splitMethod(method);
  const endRound = toInt(labels["round"] ?? "");
  const endTimeSeconds = parseMmss(labels["time"] ?? "");
  const roundsScheduled = parseRoundsFromTimeFormat(
    labels["time format"] ?? "",
  );

  const title = parseTitleArea($);

  const winnerSourceId = persons.find((p) => p.status === "W")?.sourceId ?? null;
  const fightEndedDistance =
    /^decision/i.test(methodClean) ||
    (endRound != null && endRound >= roundsScheduled && methodClean !== "KO/TKO");

  const stats = parseTotalsTable($, persons);

  return {
    source: "ufcstats",
    sourceId,
    sourceUrl,
    eventSourceId: parseEventId($),
    weightClass: title.weightClass,
    isTitleFight: title.isTitleFight,
    roundsScheduled,
    result: {
      winnerSourceId,
      method: methodClean,
      methodDetail,
      endRound,
      endTimeSeconds,
      fightEndedDistance,
    },
    stats,
  };
}

// ---------------------------------------------------------------------------
// helpers

type Person = {
  sourceId: string;
  sourceUrl: string;
  name: string;
  status: "W" | "L" | "D" | "NC" | "?";
};

function parsePersons($: cheerio.CheerioAPI): Person[] {
  const persons: Person[] = [];
  $("div.b-fight-details__person").each((_, el) => {
    const $el = $(el);
    const anchor = $el.find("h3.b-fight-details__person-name a.b-link").first();
    const href = anchor.attr("href") ?? "";
    const sourceId = extractSourceId(href);
    if (!sourceId) return;
    const name = cleanText(anchor.text());
    const statusText = cleanText(
      $el.find("i.b-fight-details__person-status").text(),
    ).toUpperCase();
    let status: Person["status"] = "?";
    if (statusText === "W") status = "W";
    else if (statusText === "L") status = "L";
    else if (statusText === "D") status = "D";
    else if (statusText === "NC") status = "NC";

    persons.push({ sourceId, sourceUrl: href, name, status });
  });
  return persons;
}

function parseLabelValues($: cheerio.CheerioAPI): Record<string, string> {
  const out: Record<string, string> = {};
  $("i.b-fight-details__text-item, i.b-fight-details__text-item_first").each(
    (_, el) => {
      const $el = $(el);
      const label = cleanText(
        $el.find("i.b-fight-details__label").text(),
      ).toLowerCase();
      if (!label) return;
      const value = cleanText($el.text().replace(/^[^:]*:/, ""));
      if (value) out[label.replace(/:$/, "")] = value;
    },
  );
  return out;
}

function parseTitleArea(
  $: cheerio.CheerioAPI,
): { weightClass: string | null; isTitleFight: boolean } {
  const $t = $("i.b-fight-details__fight-title").first();
  if ($t.length === 0) return { weightClass: null, isTitleFight: false };

  const raw = cleanText($t.text());
  const isTitleFight = $t.find("img").length > 0 || /title\s+bout/i.test(raw);
  const weightClass = raw
    .replace(/title\s*bout/i, "")
    .replace(/\s{2,}/g, " ")
    .trim() || null;

  return { weightClass, isTitleFight };
}

function parseEventId($: cheerio.CheerioAPI): string | null {
  const href =
    $("h2.b-content__title a.b-link").attr("href") ??
    $("a.b-link").filter((_, a) => {
      const href = $(a).attr("href") ?? "";
      return href.includes("/event-details/");
    }).first().attr("href") ??
    "";
  return href ? extractSourceId(href) : null;
}

function parseTotalsTable(
  $: cheerio.CheerioAPI,
  persons: Person[],
): ScrapedFighterFightStats[] {
  // The "Totals" table is the first js-fight-table inside the first
  // b-fight-details__section. UFCStats renders the second row as the
  // per-round breakdown — we only want the top row here.
  const table = $("section.js-fight-section table.js-fight-table").first();
  if (table.length === 0) {
    // If the table is missing (unreported/upcoming fight), emit empty
    // stats for each person so callers still get a row.
    return persons.map((p) => emptyStats(p));
  }

  const headers = table
    .find("thead th")
    .map((_, th) => cleanText($(th).text()).toLowerCase())
    .get();

  const idx = (label: string) => headers.findIndex((h) => h === label);

  const firstRow = table.find("tbody tr").first();
  const cells = firstRow.find("td");

  const readCol = (label: string): string[] => {
    const colIdx = idx(label);
    if (colIdx < 0) return [];
    return cells
      .eq(colIdx)
      .find("p")
      .map((_, p) => cleanText($(p).text()))
      .get();
  };

  const kdCol = readCol("kd");
  const sigStrCol = readCol("sig. str.");
  const tdCol = readCol("td");
  const subAttCol = readCol("sub. att");
  const ctrlCol = readCol("ctrl");

  return persons.map((p, i) => {
    const sig = parseOfPair(sigStrCol[i] ?? "");
    const td = parseOfPair(tdCol[i] ?? "");
    return {
      fighterSourceId: p.sourceId,
      fighterName: p.name,
      sigStrikesLanded: sig.landed,
      sigStrikesAttempted: sig.attempted,
      takedownsLanded: td.landed,
      takedownsAttempted: td.attempted,
      controlTimeSeconds: parseMmss(ctrlCol[i] ?? "") ?? 0,
      knockdowns: toInt(kdCol[i] ?? ""),
      submissionAttempts: toInt(subAttCol[i] ?? ""),
    };
  });
}

function emptyStats(p: Person): ScrapedFighterFightStats {
  return {
    fighterSourceId: p.sourceId,
    fighterName: p.name,
    sigStrikesLanded: 0,
    sigStrikesAttempted: 0,
    takedownsLanded: 0,
    takedownsAttempted: 0,
    controlTimeSeconds: 0,
    knockdowns: 0,
    submissionAttempts: 0,
  };
}

// ---------------------------------------------------------------------------
// small value parsers (exported for testing)

export function splitMethod(raw: string): {
  method: string;
  methodDetail: string | null;
} {
  const cleaned = cleanText(raw);
  if (!cleaned) return { method: "", methodDetail: null };
  const dash = cleaned.indexOf(" - ");
  if (dash < 0) return { method: cleaned, methodDetail: null };
  return {
    method: cleaned.slice(0, dash).trim(),
    methodDetail: cleaned.slice(dash + 3).trim() || null,
  };
}

export function parseMmss(raw: string): number | null {
  const m = raw.match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  return toInt(m[1]) * 60 + toInt(m[2]);
}

export function parseOfPair(raw: string): { landed: number; attempted: number } {
  const m = raw.match(/^\s*(\d+)\s+of\s+(\d+)\s*$/i);
  if (!m) return { landed: 0, attempted: 0 };
  return { landed: toInt(m[1]), attempted: toInt(m[2]) };
}

export function parseRoundsFromTimeFormat(raw: string): number {
  // "3 Rnd (5-5-5)" → 3, "5 Rnd (5-5-5-5-5)" → 5, "No Time Limit" → 1.
  const m = raw.match(/^(\d+)\s*Rnd/i);
  if (m) return toInt(m[1]);
  return 3;
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function toInt(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}
