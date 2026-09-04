/**
 * Tests fuer den Jahresrueckblick in src/App.jsx.
 *
 * Die Zusagen:
 *
 *   1. Gezaehlt wird nach dem Jahr der ERSTSICHTUNG. Ein 2011
 *      gesehener, 2026 eingetragener Film steht in 2011.
 *   2. Ohne eigenes Erstsichtungsdatum gilt — wie ueberall sonst — das
 *      Bewertungsdatum als Rueckfall.
 *   3. Die Jahresknoepfe kommen aus den tatsaechlich vorkommenden
 *      Jahren, absteigend sortiert; ein Jahr ohne Eintraege bekommt
 *      keinen Knopf.
 *   4. Beim Oeffnen ist das neueste vorkommende Jahr gewaehlt, und alle
 *      Kennzahlen beziehen sich nur auf dieses Jahr.
 *   5. Zugeklappt steht das gewaehlte Jahr in der Kopfzeile.
 *   6. Die Zeile "Gesehene Zeit" wird nicht rechts abgeschnitten.
 *
 * Geladen wird wie in app-logik.test.mjs: uebersetzt, um eine
 * Ausfuhrliste ergaenzt, importiert; gerendert mit
 * renderToStaticMarkup wie in statistik-abschnitte.test.mjs.
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
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const GEPRUEFT = ["Jahresrueckblick", "jahrDerErstsichtung", "CATEGORY_KEYS"];

async function ladeApp() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-jahr-"));
  const datei = join(verzeichnis, "jahresrueckblick.mjs");

  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeApp();

/** Ein Zeitstempel auf 12 Uhr Ortszeit — wie ihn das Datumsfeld erzeugt. */
const AM = (jahr, monat, tag) => new Date(jahr, monat - 1, tag, 12, 0, 0, 0).getTime();

let laufendeNummer = 0;
function film(titel, score, datum) {
  return {
    id: "f" + ++laufendeNummer,
    title: titel,
    score,
    personal: score,
    values: {},
    genre: ["Drama"],
    runtimeMinutes: 120,
    seasons: [],
    duels: 0,
    ...datum,
  };
}

function listen(filme) {
  const leer = Object.fromEntries(app.CATEGORY_KEYS.map((k) => [k, []]));
  return { ...leer, movie: filme };
}

function rueckblick(filme, offen = true) {
  return renderToStaticMarkup(
    createElement(app.Jahresrueckblick, { ranked: listen(filme), offen, onUmschalten() {} })
  );
}

/** Die Beschriftungen der Jahresknoepfe, in der Reihenfolge des Markups. */
function jahresknoepfe(markup) {
  return [...markup.matchAll(/aria-pressed="(?:true|false)"[^>]*>(\d{4})</g)].map((t) => t[1]);
}

/** Das Jahr des gedrueckten Knopfes. */
function gewaehltesJahr(markup) {
  const treffer = /aria-pressed="true"[^>]*>(\d{4})</.exec(markup);
  return treffer ? treffer[1] : null;
}

/* ---------------------------------------------------------------- *
 * Die Achse: Erstsichtung statt Bewertung
 * ---------------------------------------------------------------- */

test("Ein 2011 gesehener, 2026 eingetragener Film steht in 2011", () => {
  const markup = rueckblick([
    film("Alter Film", 9, { firstWatchedAt: AM(2011, 7, 20), ratedAt: AM(2026, 3, 1) }),
  ]);
  assert.deepEqual(jahresknoepfe(markup), ["2011"]);
  assert.ok(!markup.includes(">2026<"), "das Bewertungsjahr taucht nicht als Knopf auf");
});

test("Ohne eigenes Datum zaehlt das Bewertungsdatum", () => {
  const markup = rueckblick([
    film("Ohne Datum", 8, { firstWatchedAt: null, ratedAt: AM(2023, 5, 4) }),
  ]);
  assert.deepEqual(jahresknoepfe(markup), ["2023"]);
});

/* ---------------------------------------------------------------- *
 * Die Jahresknoepfe
 * ---------------------------------------------------------------- */

const DREI_JAHRE = () => [
  film("Neunzehn", 7, { firstWatchedAt: AM(2019, 2, 2), ratedAt: AM(2026, 1, 1) }),
  film("Dreiundzwanzig", 8, { firstWatchedAt: AM(2023, 6, 6), ratedAt: AM(2026, 1, 1) }),
  film("Sechsundzwanzig", 9, { firstWatchedAt: null, ratedAt: AM(2026, 4, 4) }),
];

test("Die Knoepfe kommen aus den vorkommenden Jahren, absteigend", () => {
  const markup = rueckblick(DREI_JAHRE());
  assert.deepEqual(jahresknoepfe(markup), ["2026", "2023", "2019"]);
});

test("Jahre ohne Eintraege bekommen keinen Knopf", () => {
  const markup = rueckblick(DREI_JAHRE());
  for (const leer of ["2020", "2021", "2022", "2024", "2025"]) {
    assert.ok(!jahresknoepfe(markup).includes(leer), leer + " hat einen Knopf, obwohl leer");
  }
});

test("Beim Oeffnen ist das neueste Jahr gewaehlt", () => {
  assert.equal(gewaehltesJahr(rueckblick(DREI_JAHRE())), "2026");
});

test("Auch ohne einen Eintrag im laufenden Jahr steht ein Jahr da", () => {
  /* Frueher startete die Auswahl auf dem laufenden Jahr — wer zuletzt
     2019 etwas gesehen hat, sah dann einen leeren Rueckblick. */
  const markup = rueckblick([
    film("Lange her", 7, { firstWatchedAt: AM(2019, 2, 2), ratedAt: AM(2019, 2, 2) }),
  ]);
  assert.equal(gewaehltesJahr(markup), "2019");
  assert.match(markup, /Lange her/);
});

/* ---------------------------------------------------------------- *
 * Die Kennzahlen gehoeren zum gewaehlten Jahr
 * ---------------------------------------------------------------- */

test("Gezaehlt wird nur das gewaehlte Jahr", () => {
  const markup = rueckblick(DREI_JAHRE());

  // Drei Filme, aber nur einer im gewaehlten Jahr 2026.
  assert.match(markup, /GESAMT<\/div><div[^>]*>1</);
  // Der beste Titel des Jahres ist der aus 2026, nicht der beste ueberhaupt.
  assert.match(markup, /Sechsundzwanzig/);
  assert.ok(!markup.includes("Dreiundzwanzig"), "ein Titel aus einem anderen Jahr steht da");
  assert.ok(!markup.includes("Neunzehn"), "ein Titel aus einem anderen Jahr steht da");
});

test("Die gesehene Zeit zaehlt nur das gewaehlte Jahr", () => {
  // Ein Film à 120 Minuten im gewaehlten Jahr: 2 Stunden, nicht 6.
  const markup = rueckblick(DREI_JAHRE());
  assert.match(markup, /2 Stunden/);
  assert.ok(!markup.includes("6 Stunden"), "die Zeit der anderen Jahre zaehlt mit");
});

/* ---------------------------------------------------------------- *
 * Kopfzeile und Lesbarkeit
 * ---------------------------------------------------------------- */

test("Zugeklappt steht das gewaehlte Jahr in der Kopfzeile", () => {
  const markup = rueckblick(DREI_JAHRE(), false);
  assert.match(markup, /Jahresrückblick/);
  assert.match(markup, />2026</);
  // Zugeklappt gibt es keine Knoepfe und keine Zeilen.
  assert.deepEqual(jahresknoepfe(markup), []);
  assert.ok(!markup.includes("GESEHENE ZEIT"));
});

test("Die Zeile Gesehene Zeit wird nicht abgeschnitten, sondern bricht um", () => {
  /* Sie wurde auf schmalen Geraeten zu "3944 Stunden · 164 Tage…"
     gekuerzt — ausgerechnet die Tage fielen damit weg. */
  const markup = rueckblick([
    film("Langer Stoff", 8, { firstWatchedAt: AM(2026, 1, 1), ratedAt: AM(2026, 1, 1) }),
  ]);
  const stelle = markup.indexOf("GESEHENE ZEIT");
  assert.ok(stelle > 0, "die Zeile fehlt");
  const zeile = markup.slice(stelle, stelle + 500);
  assert.ok(!zeile.includes("text-overflow:ellipsis"), "der Wert wird abgeschnitten");
  assert.ok(!zeile.includes("white-space:nowrap"), "der Wert darf umbrechen");
  assert.match(zeile, /overflow-wrap:anywhere/);
});

/* ---------------------------------------------------------------- *
 * Einträge ohne jedes Datum
 * ---------------------------------------------------------------- */

test("Eintraege ganz ohne Datum stehen in keinem Jahr und werden gezaehlt", () => {
  const markup = rueckblick([
    film("Mit Datum", 8, { firstWatchedAt: null, ratedAt: AM(2026, 1, 1) }),
    film("Altbestand A", 7, { firstWatchedAt: null, ratedAt: null }),
    film("Altbestand B", 7, { firstWatchedAt: null, ratedAt: 0 }),
  ]);
  assert.deepEqual(jahresknoepfe(markup), ["2026"]);
  assert.match(markup, /2 ältere Einträge tragen kein Datum/);
});

test("Ganz ohne Datum bleibt der Abschnitt bei seiner Erklaerung", () => {
  const markup = rueckblick([film("Altbestand", 7, { firstWatchedAt: null, ratedAt: null })]);
  assert.deepEqual(jahresknoepfe(markup), []);
  assert.match(markup, /Noch nichts zu zeigen/);
});
