/**
 * Tests fuer die Sortierung der Kategorie-Liste (Filter-Menü) in
 * src/App.jsx.
 *
 * Der Anlass: "Zuerst/Zuletzt hinzugefügt" liess die Liste unveraendert
 * in der Notenreihenfolge stehen. Der Vergleich las
 * `(a.createdAt || 0) - (b.createdAt || 0)`; wo beide Seiten 0 sind,
 * ist die Differenz 0, und weil `Array.prototype.sort` stabil ist und
 * die Liste bereits nach Endnote sortiert ankam, blieb sie exakt so
 * stehen. Betroffen waren beide Richtungen gleichermassen.
 *
 * Die Zusagen:
 *
 *   1. Jede Sortierung ordnet nach dem, was sie verspricht.
 *   2. "Hinzugefügt" meint das Anlegedatum, nicht das Erscheinungsjahr.
 *   3. Fehlt `createdAt`, springt `ratedAt` ein — es gibt Zeilen mit
 *      created_at = 0 (siehe ensureBewertetAm in api/_db.js).
 *   4. Eintraege ganz ohne Datum stehen in BEIDEN Richtungen am Ende,
 *      alphabetisch geordnet: Sie sind weder die aeltesten noch die
 *      neuesten, sondern die unbekannten.
 *   5. Die Liste kommt nach Endnote sortiert an und darf danach nicht
 *      mehr so aussehen — der Fall, der den Fehler ausmachte.
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

const GEPRUEFT = ["sortiereListe", "hinzugefuegtAm", "ohneDatumZahl", "SORT_OPTIONS", "SORT_NACH_DATUM"];

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

const AM = (jahr, monat, tag) => new Date(jahr, monat - 1, tag, 12, 0, 0, 0).getTime();
const titel = (liste) => liste.map((f) => f.title);

/* Die sechs Titel aus dem Fehlerbericht. Die Endnote faellt von oben
   nach unten, das Anlegedatum steigt dabei, das Erscheinungsjahr
   faellt — jede der drei Sortierungen ergibt damit eine andere
   Reihenfolge, und keine laesst sich mit einer anderen verwechseln. */
const MCU = [
  { title: "The Avengers", score: 9.5, createdAt: AM(2026, 1, 6), releaseYear: 2014 },
  { title: "Civil War", score: 9.42, createdAt: AM(2026, 1, 5), releaseYear: 2015 },
  { title: "The Winter Soldier", score: 9.4, createdAt: AM(2026, 1, 4), releaseYear: 2016 },
  { title: "Infinity War", score: 9.36, createdAt: AM(2026, 1, 3), releaseYear: 2017 },
  { title: "Endgame", score: 9.3, createdAt: AM(2026, 1, 2), releaseYear: 2018 },
  { title: "Guardians", score: 9.26, createdAt: AM(2026, 1, 1), releaseYear: 2019 },
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

test("Zuerst hinzugefuegt dreht die Notenreihenfolge tatsaechlich um", () => {
  /* Der gemeldete Fehler: Der Knopf war gedrueckt, die Liste blieb
     "The Avengers, Civil War, The Winter Soldier, …" — exakt die
     Notenreihenfolge. */
  const alt = titel(app.sortiereListe(MCU, "recent-asc"));
  assert.deepEqual(alt, [...NACH_NOTE].reverse());
  assert.notDeepEqual(alt, NACH_NOTE, "die Liste steht noch in der Notenreihenfolge");
});

test("Zuletzt hinzugefuegt ist die Gegenrichtung", () => {
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
 * 2. Anlegedatum, nicht Erscheinungsjahr
 * ---------------------------------------------------------------- */

test("Sortiert wird nach dem Anlegedatum, nicht nach dem Erscheinungsjahr", () => {
  /* In dieser Liste laufen beide gegeneinander: Guardians ist der
     neueste Film (2019) und der zuerst angelegte Eintrag. Steht er bei
     "Zuerst hinzugefügt" vorn, entscheidet das Anlegedatum. */
  const erster = app.sortiereListe(MCU, "recent-asc")[0];
  assert.equal(erster.title, "Guardians");
  assert.equal(erster.releaseYear, 2019, "es ist der NEUESTE Film — das Jahr entscheidet also nicht");
});

/* ---------------------------------------------------------------- *
 * 3. Der Rueckfall auf das Bewertungsdatum
 * ---------------------------------------------------------------- */

test("Ohne createdAt springt ratedAt ein", () => {
  assert.equal(app.hinzugefuegtAm({ createdAt: AM(2026, 1, 1), ratedAt: AM(2020, 1, 1) }), AM(2026, 1, 1));
  assert.equal(app.hinzugefuegtAm({ createdAt: 0, ratedAt: AM(2020, 1, 1) }), AM(2020, 1, 1));
  assert.equal(app.hinzugefuegtAm({ ratedAt: AM(2020, 1, 1) }), AM(2020, 1, 1));
  assert.equal(app.hinzugefuegtAm({ createdAt: 0, ratedAt: null }), null);
  assert.equal(app.hinzugefuegtAm(null), null);
});

test("Zeilen mit created_at = 0 sortieren ueber ihr Bewertungsdatum", () => {
  /* Genau diese Zeilen gibt es in der Datenbank — ensureBewertetAm in
     api/_db.js laesst sie beim Backfill ausdruecklich aus. */
  const liste = [
    { title: "A", score: 9, createdAt: 0, ratedAt: AM(2026, 3, 1) },
    { title: "B", score: 8, createdAt: 0, ratedAt: AM(2024, 3, 1) },
    { title: "C", score: 7, createdAt: 0, ratedAt: AM(2025, 3, 1) },
  ];
  assert.deepEqual(titel(app.sortiereListe(liste, "recent-asc")), ["B", "C", "A"]);
  assert.deepEqual(titel(app.sortiereListe(liste, "recent-desc")), ["A", "C", "B"]);
});

/* ---------------------------------------------------------------- *
 * 4. Eintraege ganz ohne Datum
 * ---------------------------------------------------------------- */

const GEMISCHT = [
  { title: "Mit Datum neu", score: 9.5, createdAt: AM(2026, 1, 2), ratedAt: null },
  { title: "Ohne B", score: 9.4, createdAt: 0, ratedAt: null },
  { title: "Mit Datum alt", score: 9.3, createdAt: AM(2026, 1, 1), ratedAt: null },
  { title: "Ohne A", score: 9.2, createdAt: 0, ratedAt: null },
];

test("Ohne Datum steht in beiden Richtungen am Ende", () => {
  assert.deepEqual(titel(app.sortiereListe(GEMISCHT, "recent-asc")), [
    "Mit Datum alt", "Mit Datum neu", "Ohne A", "Ohne B",
  ]);
  assert.deepEqual(titel(app.sortiereListe(GEMISCHT, "recent-desc")), [
    "Mit Datum neu", "Mit Datum alt", "Ohne A", "Ohne B",
  ]);
});

test("Der Block ohne Datum ist alphabetisch geordnet, nicht nach Note", () => {
  /* Nach Note stuende "Ohne B" (9.4) vor "Ohne A" (9.2). Der Block
     bekommt eine eigene, erkennbare Ordnung — sonst saehe der Schluss
     der Liste nach einer Chronologie aus, die es dort nicht gibt. */
  const ohne = titel(app.sortiereListe(GEMISCHT, "recent-asc")).slice(2);
  assert.deepEqual(ohne, ["Ohne A", "Ohne B"]);
});

test("Traegt keiner ein Datum, steht die Liste trotzdem nicht mehr nach Note", () => {
  /* Der gemeldete Fall in Reinform: alle Daten fehlen. Vorher blieb
     die Notenreihenfolge stehen; jetzt ordnet der Block alphabetisch. */
  const keins = MCU.map((f) => ({ ...f, createdAt: 0, ratedAt: null }));
  const sortiert = titel(app.sortiereListe(keins, "recent-asc"));
  assert.deepEqual(sortiert, [
    "Civil War", "Endgame", "Guardians", "Infinity War", "The Avengers", "The Winter Soldier",
  ]);
  assert.notDeepEqual(sortiert, NACH_NOTE, "die Notenreihenfolge steht immer noch da");
});

test("Gezaehlt wird, wie viele kein Datum tragen", () => {
  assert.equal(app.ohneDatumZahl(GEMISCHT), 2);
  assert.equal(app.ohneDatumZahl(MCU), 0);
  assert.equal(app.ohneDatumZahl([]), 0);
});

/* ---------------------------------------------------------------- *
 * 5. Die Beschriftungen
 * ---------------------------------------------------------------- */

test("Die Beschriftungen nennen das Hinzufuegen, nicht ein vages Alter", () => {
  const labels = Object.fromEntries(app.SORT_OPTIONS.map((o) => [o.key, o.label]));
  assert.equal(labels["recent-desc"], "Zuletzt hinzugefügt");
  assert.equal(labels["recent-asc"], "Zuerst hinzugefügt");
  /* "Neueste/Älteste zuerst" liess offen, ob das Erscheinungsjahr
     gemeint ist — genau daran entzuendete sich die Rueckfrage. */
  for (const o of app.SORT_OPTIONS) {
    assert.ok(!/Neueste|Älteste/.test(o.label), "mehrdeutige Beschriftung: " + o.label);
  }
});

test("Nur die beiden Datums-Sortierungen brauchen ein Datum", () => {
  assert.deepEqual([...app.SORT_NACH_DATUM].sort(), ["recent-asc", "recent-desc"]);
});
