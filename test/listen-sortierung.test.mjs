/**
 * Tests fuer die Sortierung der Kategorie-Liste (Filter-Menü) in
 * src/App.jsx.
 *
 * Der Anlass: "Zuerst/Zuletzt geschaut" liess die Liste unveraendert
 * in der Notenreihenfolge stehen. Der Vergleich las
 * `(a.createdAt || 0) - (b.createdAt || 0)`; wo beide Seiten 0 sind,
 * ist die Differenz 0, und weil `Array.prototype.sort` stabil ist und
 * die Liste bereits nach Endnote sortiert ankam, blieb sie exakt so
 * stehen. Betroffen waren beide Richtungen gleichermassen.
 *
 * Die Zusagen:
 *
 *   1. Jede Sortierung ordnet nach dem, was sie verspricht.
 *   2. Die beiden Datums-Sortierungen richten sich nach der
 *      ERSTSICHTUNG — nicht nach dem Anlegedatum und nicht nach dem
 *      Erscheinungsjahr.
 *   3. Sie fragen dafuer dieselbe `erstsichtung()` wie die
 *      Detailansicht und der Jahresrueckblick: eigenes
 *      Erstsichtungsdatum, sonst das Bewertungsdatum. Eine zweite
 *      Fassung dieser Regel darf es nirgends geben.
 *   4. `createdAt` geht nicht mehr ein — auch dann nicht, wenn es das
 *      einzige Datum am Eintrag ist.
 *   5. Ein Gleichstand faellt auf den Titel zurueck, damit die Liste
 *      nie stillschweigend in der Notenreihenfolge stehen bleibt.
 *   6. Die Beschriftungen sagen, worauf sie sich beziehen.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";

const GEPRUEFT = ["sortiereListe", "erstsichtung", "SORT_OPTIONS"];

async function ladeApp() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-sort-"));
  const datei = join(verzeichnis, "listen-sortierung.mjs");

  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeApp();
const QUELLE = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

const AM = (jahr, monat, tag) => new Date(jahr, monat - 1, tag, 12, 0, 0, 0).getTime();
const titel = (liste) => liste.map((f) => f.title);

/* Die sechs Titel aus dem Fehlerbericht. Die Endnote faellt von oben
   nach unten, die Erstsichtung steigt dabei, das Erscheinungsjahr
   faellt — jede der drei Sortierungen ergibt damit eine andere
   Reihenfolge, und keine laesst sich mit einer anderen verwechseln.

   `createdAt` laeuft bewusst GEGEN die Erstsichtung: Wer es doch noch
   heranzoege, bekaeme hier sofort die falsche Reihenfolge. */
const MCU = [
  { title: "The Avengers", score: 9.5, firstWatchedAt: AM(2026, 1, 6), ratedAt: null, createdAt: AM(2026, 1, 1), releaseYear: 2014 },
  { title: "Civil War", score: 9.42, firstWatchedAt: AM(2026, 1, 5), ratedAt: null, createdAt: AM(2026, 1, 2), releaseYear: 2015 },
  { title: "The Winter Soldier", score: 9.4, firstWatchedAt: AM(2026, 1, 4), ratedAt: null, createdAt: AM(2026, 1, 3), releaseYear: 2016 },
  { title: "Infinity War", score: 9.36, firstWatchedAt: AM(2026, 1, 3), ratedAt: null, createdAt: AM(2026, 1, 4), releaseYear: 2017 },
  { title: "Endgame", score: 9.3, firstWatchedAt: AM(2026, 1, 2), ratedAt: null, createdAt: AM(2026, 1, 5), releaseYear: 2018 },
  { title: "Guardians", score: 9.26, firstWatchedAt: AM(2026, 1, 1), ratedAt: null, createdAt: AM(2026, 1, 6), releaseYear: 2019 },
];

/* So kommt die Liste bei der Sortierung an: nach Endnote absteigend
   (siehe rankedByCategory). Genau das machte den Fehler unsichtbar. */
const NACH_NOTE = titel(MCU);

/* ---------------------------------------------------------------- *
 * 1. Jede Sortierung tut, was sie verspricht
 * ---------------------------------------------------------------- */

test("Nach Endnote — auf- und absteigend", () => {
  assert.deepEqual(titel(app.sortiereListe(MCU, "score-desc")), NACH_NOTE);
  assert.deepEqual(titel(app.sortiereListe(MCU, "score-asc")), [...NACH_NOTE].reverse());
});

test("Alphabetisch — A→Z und Z→A", () => {
  const az = titel(app.sortiereListe(MCU, "title-asc"));
  assert.deepEqual(az, [
    "Civil War", "Endgame", "Guardians", "Infinity War", "The Avengers", "The Winter Soldier",
  ]);
  assert.deepEqual(titel(app.sortiereListe(MCU, "title-desc")), [...az].reverse());
});

test("Zuerst geschaut dreht die Notenreihenfolge tatsaechlich um", () => {
  /* Der gemeldete Fehler: Der Knopf war gedrueckt, die Liste blieb
     "The Avengers, Civil War, The Winter Soldier, …" — exakt die
     Notenreihenfolge. */
  const alt = titel(app.sortiereListe(MCU, "recent-asc"));
  assert.deepEqual(alt, [...NACH_NOTE].reverse());
  assert.notDeepEqual(alt, NACH_NOTE, "die Liste steht noch in der Notenreihenfolge");
});

test("Zuletzt geschaut ist die Gegenrichtung", () => {
  assert.deepEqual(titel(app.sortiereListe(MCU, "recent-desc")), NACH_NOTE);
});

test("Eine unbekannte Sortierung faellt auf die Endnote zurueck", () => {
  assert.deepEqual(titel(app.sortiereListe(MCU, "gibtEsNicht")), NACH_NOTE);
});

test("Die Liste selbst wird nicht angefasst", () => {
  const vorher = titel(MCU);
  app.sortiereListe(MCU, "recent-asc");
  assert.deepEqual(titel(MCU), vorher);
});

/* ---------------------------------------------------------------- *
 * 2. Erstsichtung — nicht Anlegedatum, nicht Erscheinungsjahr
 * ---------------------------------------------------------------- */

test("Sortiert wird nach der Erstsichtung, nicht nach dem Erscheinungsjahr", () => {
  /* In dieser Liste laufen beide gegeneinander: Guardians ist der
     neueste Film (2019) und der zuerst gesehene Titel. Steht er bei
     "Zuerst geschaut" vorn, entscheidet die Erstsichtung. */
  const erster = app.sortiereListe(MCU, "recent-asc")[0];
  assert.equal(erster.title, "Guardians");
  assert.equal(erster.releaseYear, 2019, "es ist der NEUESTE Film — das Jahr entscheidet also nicht");
});

test("Das Anlegedatum entscheidet nicht mehr mit", () => {
  /* `createdAt` laeuft in MCU genau gegen die Erstsichtung. Wuerde es
     noch herangezogen, stuende hier die umgekehrte Reihenfolge. */
  const erster = app.sortiereListe(MCU, "recent-asc")[0];
  assert.equal(erster.title, "Guardians");
  assert.equal(erster.createdAt, AM(2026, 1, 6), "es ist der ZULETZT angelegte Eintrag");
});

test("Ein Eintrag, der nur ein Anlegedatum hat, gilt als datumslos", () => {
  /* Frueher sprang `createdAt` ein. Jetzt zaehlt allein, was
     `erstsichtung()` kennt — und die kennt `createdAt` nicht. */
  const nur = { title: "Nur angelegt", score: 9, createdAt: AM(2026, 1, 1), ratedAt: null };
  assert.equal(app.erstsichtung(nur).zeit, null);
});

/* ---------------------------------------------------------------- *
 * 3. Dieselbe Regel wie ueberall sonst
 * ---------------------------------------------------------------- */

test("Ohne eigenes Erstsichtungsdatum gilt das Bewertungsdatum", () => {
  const liste = [
    { title: "A", score: 9, firstWatchedAt: null, ratedAt: AM(2026, 3, 1) },
    { title: "B", score: 8, firstWatchedAt: null, ratedAt: AM(2024, 3, 1) },
    { title: "C", score: 7, firstWatchedAt: null, ratedAt: AM(2025, 3, 1) },
  ];
  assert.deepEqual(titel(app.sortiereListe(liste, "recent-asc")), ["B", "C", "A"]);
  assert.deepEqual(titel(app.sortiereListe(liste, "recent-desc")), ["A", "C", "B"]);
});

test("Ein eigenes Erstsichtungsdatum verdraengt das Bewertungsdatum", () => {
  /* Der Fall, um den es geht: 2011 gesehen, erst 2026 bewertet. Beim
     Sortieren zaehlt 2011. */
  const liste = [
    { title: "Alt gesehen", score: 9, firstWatchedAt: AM(2011, 7, 20), ratedAt: AM(2026, 3, 1) },
    { title: "Neu gesehen", score: 8, firstWatchedAt: null, ratedAt: AM(2020, 1, 1) },
  ];
  assert.deepEqual(titel(app.sortiereListe(liste, "recent-asc")), ["Alt gesehen", "Neu gesehen"]);
});

test("Die Sortierung baut keine zweite Datumslogik daneben", () => {
  /* Es gibt genau eine Stelle, die entscheidet, welches Datum gilt.
     Der Vergleich muss sie fragen — und darf firstWatchedAt/ratedAt
     nicht selbst auslesen. */
  const anfang = QUELLE.indexOf("function sortiereListe(");
  const ende = QUELLE.indexOf("\n}", QUELLE.indexOf("case \"score-desc\":", anfang));
  const rumpf = QUELLE.slice(anfang, ende);
  assert.match(rumpf, /erstsichtung\(a\)\.zeit/);
  assert.match(rumpf, /erstsichtung\(b\)\.zeit/);
  assert.ok(!/firstWatchedAt/.test(rumpf), "liest das Feld selbst aus");
  assert.ok(!/ratedAt/.test(rumpf), "liest das Feld selbst aus");
  assert.ok(!/createdAt/.test(rumpf), "zieht das Anlegedatum noch heran");
});

/* ---------------------------------------------------------------- *
 * 4. Gleichstand und fehlendes Datum
 * ---------------------------------------------------------------- */

test("Bei gleichem Datum entscheidet der Titel, nicht die Note", () => {
  /* Sonst bliebe die Liste in der Notenreihenfolge stehen — genau der
     Fehler, um den es hier ging. */
  const gleich = [
    { title: "Zebra", score: 9.5, firstWatchedAt: AM(2026, 1, 1), ratedAt: null },
    { title: "Alpha", score: 9.4, firstWatchedAt: AM(2026, 1, 1), ratedAt: null },
  ];
  assert.deepEqual(titel(app.sortiereListe(gleich, "recent-asc")), ["Alpha", "Zebra"]);
  assert.deepEqual(titel(app.sortiereListe(gleich, "recent-desc")), ["Alpha", "Zebra"]);
});

test("Ohne jedes Datum bleibt die Liste nicht in der Notenreihenfolge stehen", () => {
  /* Bewertete Eintraege tragen praktisch immer ein Bewertungsdatum.
     Praktisch, nicht garantiert: ensureBewertetAm() in api/_db.js hat
     die Zeilen mit created_at = 0 beim Backfill ausgelassen. Fuer die
     gilt weiter — still, ohne Hinweis in der Anzeige —, dass sie am
     Ende stehen und dort alphabetisch geordnet sind. */
  const keins = MCU.map((f) => ({ ...f, firstWatchedAt: null, ratedAt: null }));
  const sortiert = titel(app.sortiereListe(keins, "recent-asc"));
  assert.deepEqual(sortiert, [
    "Civil War", "Endgame", "Guardians", "Infinity War", "The Avengers", "The Winter Soldier",
  ]);
  assert.notDeepEqual(sortiert, NACH_NOTE, "die Notenreihenfolge steht immer noch da");
});

test("Ohne Datum steht hinter allem, was eines hat", () => {
  const gemischt = [
    { title: "Ohne B", score: 9.5, firstWatchedAt: null, ratedAt: null },
    { title: "Mit Datum", score: 9.4, firstWatchedAt: null, ratedAt: AM(2026, 1, 1) },
    { title: "Ohne A", score: 9.3, firstWatchedAt: null, ratedAt: null },
  ];
  assert.deepEqual(titel(app.sortiereListe(gemischt, "recent-asc")), ["Mit Datum", "Ohne A", "Ohne B"]);
  assert.deepEqual(titel(app.sortiereListe(gemischt, "recent-desc")), ["Mit Datum", "Ohne A", "Ohne B"]);
});

test("Der Hinweis auf Eintraege ohne Datum steht nicht mehr ueber der Liste", () => {
  assert.ok(!QUELLE.includes("ohne Datum stehen am Ende"), "der Hinweis steht noch da");
  assert.ok(!QUELLE.includes("ohneDatumZahl"), "die Zaehlfunktion steht noch da");
  assert.ok(!QUELLE.includes("hinzugefuegtAm"), "die zweite Datumslogik steht noch da");
});

/* ---------------------------------------------------------------- *
 * 5. Die Beschriftungen
 * ---------------------------------------------------------------- */

test("Die Beschriftungen nennen das Schauen, nicht das Hinzufuegen", () => {
  const labels = Object.fromEntries(app.SORT_OPTIONS.map((o) => [o.key, o.label]));
  assert.equal(labels["recent-desc"], "Zuletzt geschaut");
  assert.equal(labels["recent-asc"], "Zuerst geschaut");
  for (const o of app.SORT_OPTIONS) {
    assert.ok(!/hinzugefügt|Neueste|Älteste/.test(o.label), "veraltete Beschriftung: " + o.label);
  }
});
