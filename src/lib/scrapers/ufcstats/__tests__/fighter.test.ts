/**
 * Unit tests for the UFCStats fighter-page parser.
 *
 * The fixture here is a minimal synthetic page that mirrors the real
 * UFCStats DOM structure (h2.b-content__title + ul.b-list__box-list). When
 * the real site structure changes and parsing breaks, save a real page HTML
 * into a fixtures folder and add a regression test against it.
 *
 * Run with: npx tsx --test src/lib/scrapers/ufcstats/__tests__/fighter.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFighterPage,
  parseHeight,
  parseReach,
  parseDob,
} from "../fighter";

const FIXTURE_URL = "http://www.ufcstats.com/fighter-details/07c55e76efe5ea25";

const FIXTURE_HTML = `
<html><body>
  <h2 class="b-content__title">Jon Jones  Record: 27-1-0 (1 NC)</h2>
  <ul class="b-list__box-list">
    <li class="b-list__box-list-item">Height: 6' 4"</li>
    <li class="b-list__box-list-item">Weight: 248 lbs.</li>
    <li class="b-list__box-list-item">Reach: 84.5"</li>
    <li class="b-list__box-list-item">STANCE: Orthodox</li>
    <li class="b-list__box-list-item">DOB: Jul 19, 1987</li>
  </ul>
  <table>
    <tr><td><a href="http://www.ufcstats.com/fight-details/abc123">W</a></td></tr>
    <tr><td><a href="http://www.ufcstats.com/fight-details/def456">W</a></td></tr>
  </table>
</body></html>
`;

test("parseFighterPage extracts name, record, vitals, fight urls", () => {
  const f = parseFighterPage(FIXTURE_HTML, FIXTURE_URL);
  assert.equal(f.source, "ufcstats");
  assert.equal(f.sourceId, "07c55e76efe5ea25");
  assert.equal(f.name, "Jon Jones");
  assert.equal(f.record.wins, 27);
  assert.equal(f.record.losses, 1);
  assert.equal(f.record.draws, 0);
  assert.equal(f.record.noContests, 1);
  assert.equal(f.heightCm, 193.0);          // 6'4" = 76" = 193.04cm → 193.0
  assert.equal(f.reachCm, 214.6);           // 84.5" = 214.63cm → 214.6
  assert.equal(f.stance, "Orthodox");
  assert.equal(f.dob, "1987-07-19");
  assert.equal(f.fightUrls.length, 2);
});

test("parseFighterPage handles missing values (--)", () => {
  const html = `
    <html><body>
      <h2 class="b-content__title">Test Guy  Record: 0-0-0</h2>
      <ul class="b-list__box-list">
        <li class="b-list__box-list-item">Height: --</li>
        <li class="b-list__box-list-item">Reach: --</li>
        <li class="b-list__box-list-item">STANCE: --</li>
        <li class="b-list__box-list-item">DOB: --</li>
      </ul>
    </body></html>
  `;
  const f = parseFighterPage(html, FIXTURE_URL);
  assert.equal(f.heightCm, null);
  assert.equal(f.reachCm, null);
  assert.equal(f.stance, null);
  assert.equal(f.dob, null);
  assert.equal(f.record.noContests, 0);
});

test("parseHeight", () => {
  assert.equal(parseHeight("6' 4\""), 193.0);
  assert.equal(parseHeight("5' 10\""), 177.8);
  assert.equal(parseHeight("--"), null);
  assert.equal(parseHeight(null), null);
});

test("parseReach", () => {
  assert.equal(parseReach("84.5\""), 214.6);
  assert.equal(parseReach("72\""), 182.9);
  assert.equal(parseReach("--"), null);
  assert.equal(parseReach(null), null);
});

test("parseDob", () => {
  assert.equal(parseDob("Jul 19, 1987"), "1987-07-19");
  assert.equal(parseDob("--"), null);
  assert.equal(parseDob(null), null);
});
