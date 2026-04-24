import * as cheerio from "cheerio";
import type { ScrapedFighter } from "../types";
import { extractSourceId } from "./fetch";

const INCHES_PER_FOOT = 12;
const CM_PER_INCH = 2.54;

/**
 * Parse a UFCStats fighter-details page into the normalized shape.
 *
 * UFCStats page structure (as of late 2025):
 *   - <h2 class="b-content__title"> with name + record
 *   - <ul class="b-list__box-list"> rows of "Label: Value" pairs:
 *       Height, Weight, Reach, STANCE, DOB
 *   - A fights table with <a class="b-flag"> links to fight-details pages
 *
 * Missing values show as "--". The parser treats those as null.
 */
export function parseFighterPage(html: string, sourceUrl: string): ScrapedFighter {
  const $ = cheerio.load(html);

  const sourceId = extractSourceId(sourceUrl);
  if (!sourceId) {
    throw new Error(`Could not extract source id from ${sourceUrl}`);
  }

  const { name, record } = parseNameAndRecord($);
  const info = parseInfoBox($);
  const fightUrls = parseFightUrls($);

  return {
    source: "ufcstats",
    sourceId,
    sourceUrl,
    name,
    dob: info.dob,
    heightCm: info.heightCm,
    reachCm: info.reachCm,
    stance: info.stance,
    weightClass: null, // derive from latest fight later; fighter page lists weight in lbs, not class
    record,
    fightUrls,
  };
}

// ---------------------------------------------------------------------------

function parseNameAndRecord($: cheerio.CheerioAPI): {
  name: string;
  record: ScrapedFighter["record"];
} {
  const title = cleanText($("h2.b-content__title").text());

  // Expected: "Jon Jones  Record: 27-1-0 (1 NC)"
  const nameMatch = title.match(/^(.*?)\s+Record:/);
  const recMatch = title.match(
    /Record:\s*(\d+)-(\d+)-(\d+)(?:\s*\(\s*(\d+)\s*NC\s*\))?/i,
  );

  const name = nameMatch ? nameMatch[1].trim() : title.trim();

  const record = recMatch
    ? {
        wins: toInt(recMatch[1]),
        losses: toInt(recMatch[2]),
        draws: toInt(recMatch[3]),
        noContests: recMatch[4] ? toInt(recMatch[4]) : 0,
      }
    : { wins: 0, losses: 0, draws: 0, noContests: 0 };

  return { name, record };
}

function parseInfoBox($: cheerio.CheerioAPI): {
  heightCm: number | null;
  reachCm: number | null;
  stance: string | null;
  dob: string | null;
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

  return {
    heightCm: parseHeight(info["height"] ?? null),
    reachCm: parseReach(info["reach"] ?? null),
    stance: info["stance"] ?? null,
    dob: parseDob(info["dob"] ?? null),
  };
}

function parseFightUrls($: cheerio.CheerioAPI): string[] {
  const urls = new Set<string>();
  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (href.includes("/fight-details/")) urls.add(href);
  });
  return [...urls];
}

// ---------------------------------------------------------------------------
// value parsers (exported for unit testing)

export function parseHeight(raw: string | null): number | null {
  if (!raw) return null;
  // e.g. 6' 4"
  const m = raw.match(/(\d+)'[\s]*(\d+)"?/);
  if (!m) return null;
  const totalInches = toInt(m[1]) * INCHES_PER_FOOT + toInt(m[2]);
  return round1(totalInches * CM_PER_INCH);
}

export function parseReach(raw: string | null): number | null {
  if (!raw) return null;
  // e.g. 84.5"
  const m = raw.match(/([\d.]+)"?/);
  if (!m) return null;
  const inches = toFloat(m[1]);
  return Number.isFinite(inches) ? round1(inches * CM_PER_INCH) : null;
}

export function parseDob(raw: string | null): string | null {
  if (!raw) return null;
  // e.g. "Jul 19, 1987"
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function toInt(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function toFloat(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
