import * as cheerio from "cheerio";
import type { ScrapedEventRef } from "../types";
import { extractSourceId } from "./fetch";

export const EVENTS_COMPLETED_URL =
  "http://www.ufcstats.com/statistics/events/completed?page=all";
export const EVENTS_UPCOMING_URL =
  "http://www.ufcstats.com/statistics/events/upcoming";

/**
 * Parse a UFCStats events-listing page (completed or upcoming) into a list
 * of event refs. Each row looks like:
 *
 *   <tr class="b-statistics__table-row">
 *     <td class="b-statistics__table-col">
 *       <i class="b-statistics__table-content">
 *         <a class="b-link" href="...event-details/XYZ">UFC 297: ...</a>
 *         <span class="b-statistics__date">January 20, 2024</span>
 *       </i>
 *     </td>
 *     <td class="b-statistics__table-col ...">
 *       <span>Toronto, Ontario, Canada</span>
 *     </td>
 *   </tr>
 *
 * The first row of the completed listing is a "First UFC PPV" header row
 * on upcoming — we skip rows without a valid event link.
 */
export function parseEventsListPage(html: string): ScrapedEventRef[] {
  const $ = cheerio.load(html);
  const refs: ScrapedEventRef[] = [];

  $("table.b-statistics__table-events tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const anchor = $tr.find("a.b-link").first();
    const href = anchor.attr("href") ?? "";
    if (!href.includes("/event-details/")) return;

    const sourceId = extractSourceId(href);
    if (!sourceId) return;

    const name = cleanText(anchor.text());
    const dateText = cleanText($tr.find("span.b-statistics__date").text());
    const scheduledAt = parseEventDate(dateText);

    // Second td contains the location. Some pages use nested <span> wrappers.
    const locationText = cleanText($tr.find("td").eq(1).text());
    const location = locationText.length > 0 ? locationText : null;

    refs.push({
      source: "ufcstats",
      sourceId,
      sourceUrl: href,
      name,
      scheduledAt,
      location,
    });
  });

  return refs;
}

// ---------------------------------------------------------------------------

export function parseEventDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  // UFCStats listings give date only, no time — store midnight UTC.
  return d.toISOString().slice(0, 10);
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
