/**
 * Unit tests for the UFCStats events-list parser.
 * Run with: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  parseEventsListPage,
  parseEventDate,
} from "../events";

const FIXTURE_HTML = `
<html><body>
<table class="b-statistics__table-events">
  <tbody>
    <tr class="b-statistics__table-row">
      <td class="b-statistics__table-col">
        <i class="b-statistics__table-content">
          <a class="b-link" href="http://www.ufcstats.com/event-details/aaa111">
            UFC 297: Strickland vs du Plessis
          </a>
          <span class="b-statistics__date">January 20, 2024</span>
        </i>
      </td>
      <td class="b-statistics__table-col">
        <span>Toronto, Ontario, Canada</span>
      </td>
    </tr>
    <tr class="b-statistics__table-row">
      <td class="b-statistics__table-col">
        <i class="b-statistics__table-content">
          <a class="b-link" href="http://www.ufcstats.com/event-details/bbb222">
            UFC Fight Night: Ankalaev vs Walker 2
          </a>
          <span class="b-statistics__date">January 13, 2024</span>
        </i>
      </td>
      <td class="b-statistics__table-col">
        <span>Las Vegas, Nevada, USA</span>
      </td>
    </tr>
    <tr class="b-statistics__table-row">
      <!-- a junk row with no link should be ignored -->
      <td class="b-statistics__table-col"></td>
    </tr>
  </tbody>
</table>
</body></html>
`;

test("parseEventsListPage extracts name, date, location, source id", () => {
  const events = parseEventsListPage(FIXTURE_HTML);
  assert.equal(events.length, 2);

  assert.equal(events[0].source, "ufcstats");
  assert.equal(events[0].sourceId, "aaa111");
  assert.equal(events[0].name, "UFC 297: Strickland vs du Plessis");
  assert.equal(events[0].scheduledAt, "2024-01-20");
  assert.equal(events[0].location, "Toronto, Ontario, Canada");

  assert.equal(events[1].sourceId, "bbb222");
  assert.equal(events[1].name, "UFC Fight Night: Ankalaev vs Walker 2");
});

test("parseEventsListPage ignores rows without an event-details anchor", () => {
  const html = `
    <table class="b-statistics__table-events"><tbody>
      <tr class="b-statistics__table-row">
        <td><a class="b-link" href="/somewhere-else">Nope</a></td>
      </tr>
    </tbody></table>
  `;
  assert.equal(parseEventsListPage(html).length, 0);
});

test("parseEventDate", () => {
  assert.equal(parseEventDate("January 20, 2024"), "2024-01-20");
  assert.equal(parseEventDate("Jan 20, 2024"), "2024-01-20");
  assert.equal(parseEventDate("--"), null);
  assert.equal(parseEventDate(null), null);
});
