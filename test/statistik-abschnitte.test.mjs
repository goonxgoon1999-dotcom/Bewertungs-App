/**
 * Tests fuer den aufgeraeumten Statistik-Tab und die gleich hohen
 * Head-to-Head-Karten in src/App.jsx.
 *
 * Geprueft werden:
 *
 *   - die eine Kategorie-Auswahl fuer den ganzen Tab (Mehrfachauswahl,
 *     "Alle", Rueckfall bei ausgeblendeten Kategorien),
 *   - der gemerkte Auf-/Zuklapp-Stand der Abschnitte samt Vorgabe und
 *     Rueckfall bei kaputtem Speicher,
 *   - die Zusammenfassungen der zugeklappten Kopfzeilen, soweit sie
 *     eigene Funktionen haben,
 *   - dass der Statistik-Tab nur noch EINE Chip-Gruppe rendert und die
 *     Kategorie-Kacheln nur bei "Alle" stehen,
 *   - und dass die Duell-Karte einen Titelbereich fester Hoehe mit
 *     vollem Titel im title-Attribut hat.
 *
 * Wie in app-logik.test.mjs wird src/App.jsx im Original geladen:
 * uebersetzt, um eine Ausfuhrliste ergaenzt, importiert. Die
 * Bausteine werden mit renderToStaticMarkup wirklich gerendert.
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

const GEPRUEFT = [
  "CATEGORIES",
  "CATEGORY_KEYS",
  "statsAuswahlKategorien",
  "statsIstAlle",
  "statsAuswahlUmschalten",
  "normalisiereStatistikAbschnitte",
  "STATISTIK_ABSCHNITTE_VORGABE",
  "ladeStatistikAbschnitte",
  "groessteImdbAbweichung",
  "StatsAbschnitt",
  "StatsPage",
  "DuellKarte",
  "DUELL_TITEL_ZEILEN",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-stats-"));
  const datei = join(verzeichnis, "statistik-abschnitte.mjs");

  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();
const keys = (liste) => liste.map((c) => c.key);
const KATEGORIEN = app.CATEGORIES;

/* Eine leere Rangliste je Kategorie, damit StatsPage rendern kann. */
function leereListen(inhalt = {}) {
  return Object.fromEntries(app.CATEGORY_KEYS.map((k) => [k, inhalt[k] || []]));
}

const film = (id, titel, score) => ({
  id,
  title: titel,
  score,
  personal: score,
  values: {},
  duels: 0,
  siege: 0,
});

/* ---------------------------------------------------------------- *
 * Die eine Auswahl fuer den ganzen Tab
 * ---------------------------------------------------------------- */

test("Ohne Auswahl gilt Alle — jede sichtbare Kategorie zaehlt mit", () => {
  assert.deepEqual(keys(app.statsAuswahlKategorien(null, KATEGORIEN)), app.CATEGORY_KEYS);
  assert.equal(app.statsIstAlle(null, KATEGORIEN), true);
});

test("Aus Alle heraus waehlt ein Tippen genau eine Kategorie", () => {
  const auswahl = app.statsAuswahlUmschalten(null, "movie");
  assert.deepEqual([...auswahl], ["movie"]);
  assert.deepEqual(keys(app.statsAuswahlKategorien(auswahl, KATEGORIEN)), ["movie"]);
  assert.equal(app.statsIstAlle(auswahl, KATEGORIEN), false);
});

test("Mehrere Kategorien lassen sich gleichzeitig waehlen", () => {
  let auswahl = app.statsAuswahlUmschalten(null, "movie");
  auswahl = app.statsAuswahlUmschalten(auswahl, "series");
  assert.deepEqual(keys(app.statsAuswahlKategorien(auswahl, KATEGORIEN)), ["movie", "series"]);
});

test("Die Reihenfolge kommt aus der Kategorie-Ansicht, nicht aus der Auswahl", () => {
  const auswahl = new Set(["series", "movie"]);
  assert.deepEqual(
    keys(app.statsAuswahlKategorien(auswahl, KATEGORIEN)),
    app.CATEGORY_KEYS.filter((k) => k === "movie" || k === "series")
  );
});

test("Die letzte abgewaehlte Kategorie fuehrt zurueck zu Alle", () => {
  let auswahl = app.statsAuswahlUmschalten(null, "movie");
  auswahl = app.statsAuswahlUmschalten(auswahl, "movie");
  assert.equal(auswahl, null);
  assert.equal(app.statsIstAlle(auswahl, KATEGORIEN), true);
});

test("Ein Tippen auf Alle setzt jede Einschraenkung zurueck", () => {
  const auswahl = app.statsAuswahlUmschalten(new Set(["movie", "series"]), "all");
  assert.equal(auswahl, null);
});

test("Einzeln gewaehlte Kategorien bleiben einzeln gewaehlt", () => {
  /* Wer alle acht antippt, hat sie einzeln gewaehlt — die Kacheln
     bleiben weg. Nur der Knopf "Alle" fuehrt zurueck. */
  const auswahl = new Set(app.CATEGORY_KEYS);
  assert.equal(app.statsIstAlle(auswahl, KATEGORIEN), false);
  assert.deepEqual(keys(app.statsAuswahlKategorien(auswahl, KATEGORIEN)), app.CATEGORY_KEYS);
});

test("Eine Auswahl aus lauter ausgeblendeten Kategorien faellt auf Alle zurueck", () => {
  const sichtbar = KATEGORIEN.filter((c) => c.key !== "game");
  const auswahl = new Set(["game"]);
  assert.deepEqual(keys(app.statsAuswahlKategorien(auswahl, sichtbar)), keys(sichtbar));
  assert.equal(app.statsIstAlle(auswahl, sichtbar), true);
});

/* ---------------------------------------------------------------- *
 * Der gemerkte Auf-/Zuklapp-Stand
 * ---------------------------------------------------------------- */

test("Beim Oeffnen stehen Gesamtstatistik und Top 10 offen, sonst nichts", () => {
  const stand = app.normalisiereStatistikAbschnitte(null);
  assert.equal(stand.gesamt, true);
  assert.equal(stand.top10, true);
  for (const [key, offen] of Object.entries(stand)) {
    if (key === "gesamt" || key === "top10") continue;
    assert.equal(offen, false, key + " sollte zugeklappt beginnen");
  }
});

test("Ein gespeicherter Stand ueberschreibt nur, was er kennt", () => {
  const stand = app.normalisiereStatistikAbschnitte({ gesamt: false, zeit: true });
  assert.equal(stand.gesamt, false);
  assert.equal(stand.zeit, true);
  // Alles Uebrige bleibt bei der Vorgabe.
  assert.equal(stand.top10, true);
  assert.equal(stand.detail, false);
});

test("Unbekannte oder kaputte Werte fallen still auf die Vorgabe zurueck", () => {
  const vorgabe = app.STATISTIK_ABSCHNITTE_VORGABE;
  assert.deepEqual(app.normalisiereStatistikAbschnitte("kaputt"), { ...vorgabe });
  assert.deepEqual(app.normalisiereStatistikAbschnitte({ gesamt: "ja" }), { ...vorgabe });
  assert.deepEqual(
    app.normalisiereStatistikAbschnitte({ gibtEsNicht: true }),
    { ...vorgabe }
  );
});

test("Ohne localStorage gilt die Vorgabe, ohne dass etwas fliegt", () => {
  // In Node gibt es kein window — genau der Fall, den ladeStatistikAbschnitte abfaengt.
  assert.deepEqual(app.ladeStatistikAbschnitte(), { ...app.STATISTIK_ABSCHNITTE_VORGABE });
});

/* ---------------------------------------------------------------- *
 * Zusammenfassungen der zugeklappten Kopfzeilen
 * ---------------------------------------------------------------- */

test("Die groesste IMDb-Abweichung misst den Betrag, behaelt aber das Vorzeichen", () => {
  const vergleiche = [
    { abweichung: 0.9 },
    { abweichung: -1.4 },
    { abweichung: 1.1 },
  ];
  assert.equal(app.groessteImdbAbweichung(vergleiche), -1.4);
});

test("Ohne Vergleichswerte gibt es keine groesste Abweichung", () => {
  assert.equal(app.groessteImdbAbweichung([]), null);
});

test("Zugeklappt steht die Zusammenfassung da, aufgeklappt der Inhalt", () => {
  const zu = renderToStaticMarkup(
    createElement(
      app.StatsAbschnitt,
      { titel: "Zeit", zusammenfassung: "GESEHEN 42 Stunden", offen: false, onUmschalten: () => {} },
      createElement("p", null, "Der Inhalt")
    )
  );
  assert.match(zu, /Zeit/);
  assert.match(zu, /GESEHEN 42 Stunden/);
  assert.ok(!/Der Inhalt/.test(zu), "zugeklappt darf der Inhalt nicht dastehen");
  assert.match(zu, /aria-expanded="false"/);

  const auf = renderToStaticMarkup(
    createElement(
      app.StatsAbschnitt,
      { titel: "Zeit", zusammenfassung: "GESEHEN 42 Stunden", offen: true, onUmschalten: () => {} },
      createElement("p", null, "Der Inhalt")
    )
  );
  assert.match(auf, /Der Inhalt/);
  // Aufgeklappt sagt die Zusammenfassung nichts, was nicht darunter stuende.
  assert.ok(!/GESEHEN 42 Stunden/.test(auf));
  assert.match(auf, /aria-expanded="true"/);
});

/* ---------------------------------------------------------------- *
 * Der Tab als Ganzes
 * ---------------------------------------------------------------- */

function statsMarkup(ranked) {
  return renderToStaticMarkup(
    createElement(app.StatsPage, {
      ranked,
      watchlist: leereListen(),
      onOeffnen: () => {},
    })
  );
}

test("Der Tab traegt genau eine Kategorie-Auswahl", () => {
  const markup = statsMarkup(leereListen({ movie: [film("a", "Ein Film", 8)] }));
  /* Der Knopf "Alle" gehoert genau einer Auswahl — stuende er
     mehrfach da, waeren die alten Chip-Gruppen zurueck. */
  const alle = markup.match(/>Alle</g) || [];
  assert.equal(alle.length, 1);
  // Und dahinter genau einmal jede sichtbare Kategorie.
  for (const c of KATEGORIEN) {
    const treffer = markup.match(new RegExp(">" + c.label.replace(/[/]/g, "\\/") + "<", "g")) || [];
    assert.ok(treffer.length >= 1, "Kategorie " + c.key + " fehlt in der Auswahl");
  }
});

test("Bei Alle stehen die Kategorie-Kacheln, auch die leeren", () => {
  const markup = statsMarkup(leereListen({ movie: [film("a", "Ein Film", 8)] }));
  for (const c of KATEGORIEN) {
    assert.match(markup, new RegExp(c.label.toUpperCase().replace(/[/]/g, "\\/")));
  }
  assert.match(markup, /GESAMT/);
});

test("Die Auswahl bleibt beim Scrollen oben stehen", () => {
  const markup = statsMarkup(leereListen({ movie: [film("a", "Ein Film", 8)] }));
  assert.match(markup, /position:sticky/);
});

test("Gesamtstatistik und Top 10 stehen offen, der Rest zugeklappt", () => {
  const markup = statsMarkup(leereListen({ movie: [film("a", "Ein Film", 8)] }));

  /* Die Ueberschriften aller Abschnitte stehen da … */
  for (const titel of [
    "Gesamtstatistik",
    "Jahresrückblick",
    "Zeit",
    "Detailauswertung",
    "Du vs. IMDb",
    "Top 10",
    "Bewertungsverteilung",
    "Ø je Kriterium",
  ]) {
    assert.match(markup, new RegExp(titel.replace(".", "\\.")));
  }

  /* … der Inhalt der offenen Abschnitte auch: die Kacheln der
     Gesamtstatistik und die Zeile der Top 10. */
  assert.match(markup, /GESAMT/);
  assert.match(markup, /Ein Film/);

  /* Der Inhalt der zugeklappten Abschnitte nicht. Jede dieser
     Beschriftungen steht ausschliesslich in einem zugeklappten
     Abschnitt. */
  for (const inhalt of ["MIT LAUFZEIT", "ANZAHL", "9 – 10", "Bauchgefühl"]) {
    assert.ok(!markup.includes(inhalt), inhalt + " steht da, obwohl zugeklappt");
  }
});

test("Zeit steht als ein Abschnitt da, nicht mehr als zwei", () => {
  const markup = statsMarkup(leereListen({ movie: [film("a", "Ein Film", 8)] }));
  assert.ok(!/Zeitaufwand Watchlist<\/span>/.test(markup), "die alte Ueberschrift ist weg");
  const zeit = markup.match(/>Zeit</g) || [];
  assert.equal(zeit.length, 1);
});

/* ---------------------------------------------------------------- *
 * Die Duell-Karte
 * ---------------------------------------------------------------- */

test("Der Titelbereich der Duell-Karte ist zwei Zeilen hoch", () => {
  const markup = renderToStaticMarkup(
    createElement(app.DuellKarte, {
      eintrag: { id: "a", title: "Charlie and the Chocolate Factory", releaseYear: 2005 },
      zustand: "offen",
      onClick: () => {},
    })
  );
  assert.equal(app.DUELL_TITEL_ZEILEN, 2);
  assert.match(markup, /-webkit-line-clamp:2/);
  assert.match(markup, /height:2\.6em/);
  // Der vollstaendige Titel bleibt erreichbar.
  assert.match(markup, /title="Charlie and the Chocolate Factory"/);
});

test("Kurzer und langer Titel ergeben denselben Kartenaufbau", () => {
  const karte = (titel) =>
    renderToStaticMarkup(
      createElement(app.DuellKarte, {
        eintrag: { id: "a", title: titel, releaseYear: 2010 },
        zustand: "offen",
        onClick: () => {},
      })
    );

  const kurz = karte("Inception");
  const lang = karte("Charlie and the Chocolate Factory");

  /* Poster, Titelbereich, Jahr und der Platz fuer das Abzeichen
     tragen in beiden Karten dieselben Massangaben — nur der Titeltext
     unterscheidet sich. Damit stehen sie in beiden Karten auf
     derselben Hoehe. */
  const masse = (markup) => (markup.match(/style="[^"]*"/g) || []).map((s) =>
    // Die Platzhalterfarbe haengt am Titel und ist keine Massangabe.
    s.replace(/background:linear-gradient\([^)]*\)[^;"]*/g, "background:X")
  );
  assert.deepEqual(masse(kurz), masse(lang));

  // Und beide holen sich die Hoehe der hoeheren Karte.
  assert.match(kurz, /align-self:stretch/);
  assert.match(lang, /align-self:stretch/);
});
