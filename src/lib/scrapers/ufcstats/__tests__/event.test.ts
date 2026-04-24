import test from "node:test";
import assert from "node:assert/strict";
import { parseEventPage } from "../event";

const EVENT_URL = "http://www.ufcstats.com/event-details/xyz999";

// Synthetic fixture mirroring the real UFCStats event-details DOM.
// Two fights: a title main event (5 rounds, title-fight flag via belt img)
// and a completed undercard fight.
const FIXTURE_HTML = `
<html><body>
  <h2 class="b-content__title">
    <span class="b-content__title-highlight">UFC 297: Strickland vs du Plessis</span>
  </h2>
  <ul class="b-list__box-list">
    <li class="b-list__box-list-item">Date: January 20, 2024</li>
    <li class="b-list__box-list-item">Location: Toronto, Ontario, Canada</li>
    <li class="b-list__box-list-item">Attendance: 18,746</li>
  </ul>

  <table class="b-fight-details__table js-fight-table">
    <thead><tr><th></th><th>Fighter</th><th>KD</th><th>STR</th><th>TD</th><th>Sub</th><th>Weight class</th><th>Method</th><th>Round</th><th>Time</th></tr></thead>
    <tbody>
      <tr class="b-fight-details__table-row js-fight-details-click" data-link="http://www.ufcstats.com/fight-details/fight-main">
        <td><p class="b-fight-details__table-text"><i class="b-flag"><i class="b-flag__text">win</i></i></p>
            <p class="b-fight-details__table-text"><i class="b-flag"><i class="b-flag__text">loss</i></i></p></td>
        <td>
          <p><a class="b-link" href="http://www.ufcstats.com/fighter-details/fa-main">Dricus Du Plessis</a></p>
          <p><a class="b-link" href="http://www.ufcstats.com/fighter-details/fb-main">Sean Strickland</a></p>
        </td>
        <td>0<br>0</td><td>0<br>0</td><td>0<br>0</td><td>0<br>0</td>
        <td>Middleweight Title Bout<img src="/belt.png" alt="belt"></td>
        <td>Decision - Split</td>
        <td>5</td>
        <td>5:00</td>
      </tr>
      <tr class="b-fight-details__table-row js-fight-details-click" data-link="http://www.ufcstats.com/fight-details/fight-under">
        <td><p class="b-fight-details__table-text"><i class="b-flag"><i class="b-flag__text">loss</i></i></p>
            <p class="b-fight-details__table-text"><i class="b-flag"><i class="b-flag__text">win</i></i></p></td>
        <td>
          <p><a class="b-link" href="http://www.ufcstats.com/fighter-details/fa-under">Fighter A</a></p>
          <p><a class="b-link" href="http://www.ufcstats.com/fighter-details/fb-under">Fighter B</a></p>
        </td>
        <td>0<br>1</td><td>0<br>0</td><td>0<br>0</td><td>0<br>0</td>
        <td>Lightweight</td>
        <td>KO/TKO</td>
        <td>2</td>
        <td>3:12</td>
      </tr>
    </tbody>
  </table>
</body></html>
`;

test("parseEventPage extracts event metadata and fights", () => {
  const event = parseEventPage(FIXTURE_HTML, EVENT_URL);

  assert.equal(event.sourceId, "xyz999");
  assert.equal(event.name, "UFC 297: Strickland vs du Plessis");
  assert.equal(event.scheduledAt, "2024-01-20");
  assert.equal(event.city, "Toronto, Ontario, Canada");
  assert.equal(event.isNumberedPpv, true);
  assert.equal(event.fights.length, 2);
});

test("parseEventPage main event is 5 rounds, title fight flagged", () => {
  const event = parseEventPage(FIXTURE_HTML, EVENT_URL);
  const main = event.fights[0];
  assert.equal(main.cardPosition, 1);
  assert.equal(main.isMainEvent, true);
  assert.equal(main.isTitleFight, true);
  assert.equal(main.roundsScheduled, 5);
  assert.equal(main.weightClass, "Middleweight");
});

test("parseEventPage fighter refs parsed on both rows", () => {
  const event = parseEventPage(FIXTURE_HTML, EVENT_URL);
  const main = event.fights[0];
  assert.equal(main.fighterA.sourceId, "fa-main");
  assert.equal(main.fighterA.name, "Dricus Du Plessis");
  assert.equal(main.fighterB.sourceId, "fb-main");
  assert.equal(main.fighterB.name, "Sean Strickland");
});

test("parseEventPage extracts completed-fight result with winner", () => {
  const event = parseEventPage(FIXTURE_HTML, EVENT_URL);

  const main = event.fights[0];
  assert.ok(main.result);
  assert.equal(main.result!.winnerSourceId, "fa-main"); // first flag = "win"
  assert.equal(main.result!.method, "Decision - Split");
  assert.equal(main.result!.endRound, 5);
  assert.equal(main.result!.endTime, "5:00");

  const under = event.fights[1];
  assert.ok(under.result);
  assert.equal(under.result!.winnerSourceId, "fb-under"); // second flag = "win"
  assert.equal(under.result!.method, "KO/TKO");
  assert.equal(under.result!.endRound, 2);
  assert.equal(under.result!.endTime, "3:12");
});

test("parseEventPage leaves result null for upcoming fights", () => {
  const upcomingHtml = FIXTURE_HTML
    .replace(/Decision - Split/, "--")
    .replace(/>5<\/td>/, ">--</td>")
    .replace(/>5:00</, ">--<");
  const event = parseEventPage(upcomingHtml, EVENT_URL);
  assert.equal(event.fights[0].result, null);
});

test("parseEventPage non-title non-main event is 3 rounds", () => {
  const event = parseEventPage(FIXTURE_HTML, EVENT_URL);
  const under = event.fights[1];
  assert.equal(under.isMainEvent, false);
  assert.equal(under.isTitleFight, false);
  assert.equal(under.roundsScheduled, 3);
  assert.equal(under.weightClass, "Lightweight");
});
