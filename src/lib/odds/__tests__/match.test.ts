import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFightIndex,
  matchEvent,
  normalizeFighterName,
  pairKey,
  type DbFightForMatch,
} from "../match";

test("normalizeFighterName lowercases and strips punctuation", () => {
  assert.equal(normalizeFighterName("Sean Strickland"), "sean strickland");
  assert.equal(normalizeFighterName("Du Plessis"), "du plessis");
  assert.equal(normalizeFighterName("du Plessis"), "du plessis"); // case
  assert.equal(normalizeFighterName("O'Malley"), "o malley");
  assert.equal(normalizeFighterName("  Khabib   Nurmagomedov  "), "khabib nurmagomedov");
});

test("normalizeFighterName strips diacritics", () => {
  assert.equal(normalizeFighterName("José Aldo"), "jose aldo");
  assert.equal(normalizeFighterName("Renato Moicano"), "renato moicano");
  assert.equal(normalizeFighterName("Ciryl Gane"), "ciryl gane");
});

test("pairKey is order-independent and case-insensitive", () => {
  assert.equal(pairKey("A", "B"), pairKey("B", "A"));
  assert.equal(
    pairKey("Sean Strickland", "Dricus Du Plessis"),
    pairKey("dricus du plessis", "SEAN STRICKLAND"),
  );
});

test("matchEvent returns the matching fight", () => {
  const fights: DbFightForMatch[] = [
    {
      fightId: "fight-1",
      fighterAName: "Dricus Du Plessis",
      fighterBName: "Sean Strickland",
      fighterAId: "fighter-A",
      fighterBId: "fighter-B",
      scheduledAt: "2024-01-21T03:00:00Z",
    },
    {
      fightId: "fight-2",
      fighterAName: "Conor McGregor",
      fighterBName: "Michael Chandler",
      fighterAId: "fighter-C",
      fighterBId: "fighter-D",
      scheduledAt: "2025-06-29T03:00:00Z",
    },
  ];
  const idx = buildFightIndex(fights);

  const m = matchEvent(idx, "Sean Strickland", "Dricus Du Plessis", "2024-01-21T03:00:00Z");
  assert.ok(m);
  assert.equal(m!.fightId, "fight-1");
  // home was Strickland (B in our DB), so homeFighterId should be B.
  assert.equal(m!.homeFighterId, "fighter-B");
  assert.equal(m!.awayFighterId, "fighter-A");
});

test("matchEvent returns null on no match", () => {
  const idx = buildFightIndex([]);
  assert.equal(
    matchEvent(idx, "Anyone", "Nobody", "2024-01-21T03:00:00Z"),
    null,
  );
});

test("matchEvent disambiguates rematches by closest scheduled_at", () => {
  const fights: DbFightForMatch[] = [
    {
      fightId: "first-meeting",
      fighterAName: "Max Holloway",
      fighterBName: "Dustin Poirier",
      fighterAId: "fa",
      fighterBId: "fb",
      scheduledAt: "2019-04-13T03:00:00Z",
    },
    {
      fightId: "rematch",
      fighterAName: "Max Holloway",
      fighterBName: "Dustin Poirier",
      fighterAId: "fa",
      fighterBId: "fb",
      scheduledAt: "2024-12-14T03:00:00Z",
    },
  ];
  const idx = buildFightIndex(fights);
  const m = matchEvent(
    idx,
    "Dustin Poirier",
    "Max Holloway",
    "2024-12-13T18:00:00Z",
  );
  assert.equal(m!.fightId, "rematch");
});

test("matchEvent tolerates accent / case differences", () => {
  const fights: DbFightForMatch[] = [
    {
      fightId: "f",
      fighterAName: "José Aldo",
      fighterBName: "Aiemann Zahabi",
      fighterAId: "a",
      fighterBId: "b",
      scheduledAt: "2024-05-04T03:00:00Z",
    },
  ];
  const idx = buildFightIndex(fights);
  const m = matchEvent(idx, "Jose Aldo", "Aiemann Zahabi", "2024-05-04T03:00:00Z");
  assert.ok(m);
  assert.equal(m!.fightId, "f");
});
