import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFightPage,
  parseMmss,
  parseOfPair,
  parseRoundsFromTimeFormat,
  splitMethod,
} from "../fight";

const FIGHT_URL = "http://www.ufcstats.com/fight-details/fid123";

// Synthetic fixture mirroring the real fight-details DOM for a completed
// title fight that went to decision.
const FIXTURE_HTML = `
<html><body>
  <h2 class="b-content__title">
    <a class="b-link" href="http://www.ufcstats.com/event-details/eid999">UFC 297</a>
  </h2>

  <div class="b-fight-details__persons">
    <div class="b-fight-details__person">
      <i class="b-fight-details__person-status b-fight-details__person-status_style_green">W</i>
      <h3 class="b-fight-details__person-name">
        <a class="b-link" href="http://www.ufcstats.com/fighter-details/fa">Dricus Du Plessis</a>
      </h3>
    </div>
    <div class="b-fight-details__person">
      <i class="b-fight-details__person-status b-fight-details__person-status_style_gray">L</i>
      <h3 class="b-fight-details__person-name">
        <a class="b-link" href="http://www.ufcstats.com/fighter-details/fb">Sean Strickland</a>
      </h3>
    </div>
  </div>

  <i class="b-fight-details__fight-title">
    <img src="/belt.png" alt="belt">
    Middleweight Title Bout
  </i>

  <p class="b-fight-details__text">
    <i class="b-fight-details__text-item_first">
      <i class="b-fight-details__label">Method:</i>
      Decision - Split
    </i>
    <i class="b-fight-details__text-item">
      <i class="b-fight-details__label">Round:</i>
      5
    </i>
    <i class="b-fight-details__text-item">
      <i class="b-fight-details__label">Time:</i>
      5:00
    </i>
    <i class="b-fight-details__text-item">
      <i class="b-fight-details__label">Time format:</i>
      5 Rnd (5-5-5-5-5)
    </i>
  </p>

  <section class="b-fight-details__section js-fight-section">
    <table class="b-fight-details__table js-fight-table">
      <thead>
        <tr>
          <th>Fighter</th>
          <th>KD</th>
          <th>Sig. str.</th>
          <th>Sig. str. %</th>
          <th>Total str.</th>
          <th>Td</th>
          <th>Td %</th>
          <th>Sub. att</th>
          <th>Rev.</th>
          <th>Ctrl</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><p>Dricus Du Plessis</p><p>Sean Strickland</p></td>
          <td><p>0</p><p>0</p></td>
          <td><p>178 of 356</p><p>136 of 267</p></td>
          <td><p>50%</p><p>50%</p></td>
          <td><p>178 of 356</p><p>136 of 267</p></td>
          <td><p>3 of 5</p><p>0 of 0</p></td>
          <td><p>60%</p><p>--</p></td>
          <td><p>0</p><p>1</p></td>
          <td><p>0</p><p>0</p></td>
          <td><p>5:23</p><p>0:00</p></td>
        </tr>
      </tbody>
    </table>
  </section>
</body></html>
`;

test("parseFightPage extracts winner + method + round + time", () => {
  const d = parseFightPage(FIXTURE_HTML, FIGHT_URL);
  assert.equal(d.sourceId, "fid123");
  assert.equal(d.eventSourceId, "eid999");
  assert.equal(d.weightClass, "Middleweight");
  assert.equal(d.isTitleFight, true);
  assert.equal(d.roundsScheduled, 5);
  assert.equal(d.result.winnerSourceId, "fa");
  assert.equal(d.result.method, "Decision");
  assert.equal(d.result.methodDetail, "Split");
  assert.equal(d.result.endRound, 5);
  assert.equal(d.result.endTimeSeconds, 300);
  assert.equal(d.result.fightEndedDistance, true);
});

test("parseFightPage extracts per-fighter stats from totals table", () => {
  const d = parseFightPage(FIXTURE_HTML, FIGHT_URL);
  assert.equal(d.stats.length, 2);

  const a = d.stats.find((s) => s.fighterSourceId === "fa")!;
  assert.equal(a.sigStrikesLanded, 178);
  assert.equal(a.sigStrikesAttempted, 356);
  assert.equal(a.takedownsLanded, 3);
  assert.equal(a.takedownsAttempted, 5);
  assert.equal(a.controlTimeSeconds, 323); // 5:23
  assert.equal(a.knockdowns, 0);
  assert.equal(a.submissionAttempts, 0);

  const b = d.stats.find((s) => s.fighterSourceId === "fb")!;
  assert.equal(b.sigStrikesLanded, 136);
  assert.equal(b.sigStrikesAttempted, 267);
  assert.equal(b.takedownsLanded, 0);
  assert.equal(b.takedownsAttempted, 0);
  assert.equal(b.controlTimeSeconds, 0);
  assert.equal(b.submissionAttempts, 1);
});

test("parseFightPage handles KO/TKO finish — not a distance fight", () => {
  const html = FIXTURE_HTML
    .replace(/Decision - Split/, "KO/TKO - Punches")
    .replace(/<i class="b-fight-details__label">Round:<\/i>\s*5/, '<i class="b-fight-details__label">Round:</i> 2')
    .replace(/<i class="b-fight-details__label">Time:<\/i>\s*5:00/, '<i class="b-fight-details__label">Time:</i> 3:12');
  const d = parseFightPage(html, FIGHT_URL);
  assert.equal(d.result.method, "KO/TKO");
  assert.equal(d.result.methodDetail, "Punches");
  assert.equal(d.result.endRound, 2);
  assert.equal(d.result.endTimeSeconds, 192);
  assert.equal(d.result.fightEndedDistance, false);
});

test("splitMethod", () => {
  assert.deepEqual(splitMethod("Decision - Unanimous"), {
    method: "Decision",
    methodDetail: "Unanimous",
  });
  assert.deepEqual(splitMethod("Submission - Rear-Naked Choke"), {
    method: "Submission",
    methodDetail: "Rear-Naked Choke",
  });
  assert.deepEqual(splitMethod("KO/TKO"), {
    method: "KO/TKO",
    methodDetail: null,
  });
  assert.deepEqual(splitMethod(""), { method: "", methodDetail: null });
});

test("parseMmss", () => {
  assert.equal(parseMmss("5:00"), 300);
  assert.equal(parseMmss("0:47"), 47);
  assert.equal(parseMmss("12:34"), 754);
  assert.equal(parseMmss("--"), null);
  assert.equal(parseMmss(""), null);
});

test("parseOfPair", () => {
  assert.deepEqual(parseOfPair("178 of 356"), { landed: 178, attempted: 356 });
  assert.deepEqual(parseOfPair("0 of 0"), { landed: 0, attempted: 0 });
  assert.deepEqual(parseOfPair("--"), { landed: 0, attempted: 0 });
  assert.deepEqual(parseOfPair(""), { landed: 0, attempted: 0 });
});

test("parseRoundsFromTimeFormat", () => {
  assert.equal(parseRoundsFromTimeFormat("3 Rnd (5-5-5)"), 3);
  assert.equal(parseRoundsFromTimeFormat("5 Rnd (5-5-5-5-5)"), 5);
  assert.equal(parseRoundsFromTimeFormat("No Time Limit"), 3);
  assert.equal(parseRoundsFromTimeFormat(""), 3);
});
