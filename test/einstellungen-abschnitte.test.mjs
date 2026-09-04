/**
 * Tests fuer die einklappbaren Einstellungen (Daten-Panel) und die
 * ueber die volle Breite verteilten Unter-Reiter in src/App.jsx.
 *
 * Geprueft werden:
 *
 *   - die vier Zusammenfassungen der zugeklappten Kopfzeilen, jede
 *     aus dem tatsaechlichen Zustand ihres Abschnitts,
 *   - dass das Panel dieselbe Kopfzeile benutzt wie der Statistik-Tab
 *     (StatsAbschnitt) und dabei die Abschnitte, ihre Reihenfolge und
 *     ihren Inhalt unveraendert laesst,
 *   - dass beim Oeffnen alles zugeklappt ist und nichts gemerkt wird,
 *   - dass die Kaesten um die Abschnitte weg sind und nur noch die
 *     duenne Linie der Listen trennt,
 *   - und dass die drei Unter-Reiter die volle Breite in gleiche
 *     Drittel teilen, ohne je umzubrechen.
 *
 * Wie in statistik-abschnitte.test.mjs wird src/App.jsx im Original
 * geladen: uebersetzt, um eine Ausfuhrliste ergaenzt, importiert.
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
  "einstellungKategorienText",
  "einstellungRegionText",
  "einstellungExportText",
  "einstellungZuschlaegeText",
  "standardKategorieAnsicht",
  "schalteKategorie",
  "StatsAbschnitt",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-einst-"));
  const datei = join(verzeichnis, "einstellungen-abschnitte.mjs");

  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();
const QUELLE = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

/* Der Rumpf des Daten-Panels — von der Seite bis zu ihrem Ende. */
const PANEL = (() => {
  const anfang = QUELLE.indexOf("{/* Daten-Panel — ueber das Zahnrad");
  const ende = QUELLE.indexOf("</Seite>", anfang);
  assert.ok(anfang > 0 && ende > anfang, "Das Daten-Panel ist nicht auffindbar");
  return QUELLE.slice(anfang, ende);
})();

/* Eine CSS-Regel aus dem style-Block. */
function regel(name) {
  const treffer = QUELLE.match(
    new RegExp("\\n\\s*" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{[^}]*\\}")
  );
  assert.ok(treffer, "Die Regel " + name + " fehlt");
  return treffer[0];
}

/* ---------------------------------------------------------------- *
 * 1. Die Zusammenfassungen
 * ---------------------------------------------------------------- */

test("Die Kategorien melden, wie viele von wie vielen sichtbar sind", () => {
  const alle = app.standardKategorieAnsicht();
  assert.equal(
    app.einstellungKategorienText(alle),
    app.CATEGORIES.length + " von " + app.CATEGORIES.length + " sichtbar"
  );
  const ohneSpiele = app.schalteKategorie(alle, "game");
  assert.equal(
    app.einstellungKategorienText(ohneSpiele),
    app.CATEGORIES.length - 1 + " von " + app.CATEGORIES.length + " sichtbar"
  );
});

test("Die Streaming-Region meldet die gewaehlte Region", () => {
  assert.equal(app.einstellungRegionText("DE", "DE"), "Deutschland");
  assert.equal(app.einstellungRegionText("IT", "IT"), "Italien");
});

test("Bei Automatik steht dahinter, was erkannt wurde", () => {
  /* Sonst saehe man der Kopfzeile nicht an, fuer welches Land die
     Verfuegbarkeit tatsaechlich gilt. */
  assert.equal(app.einstellungRegionText("auto", "IT"), "Automatisch · IT");
  // Ein unbekannter gespeicherter Wert verhaelt sich wie "auto".
  assert.equal(app.einstellungRegionText("XX", "DE"), "Automatisch · DE");
});

test("Export & Backup meldet Format und Zahl der Bilder im Kopfbereich", () => {
  assert.equal(app.einstellungExportText("json", 3), "JSON (Backup) · 3 Bilder im Kopfbereich");
  assert.equal(app.einstellungExportText("csv", 0), "CSV (Tabelle) · 0 Bilder im Kopfbereich");
  assert.equal(app.einstellungExportText("json", 1), "JSON (Backup) · 1 Bild im Kopfbereich");
});

test("Die Duell-Zuschlaege melden, wie viele Eintraege einen offenen haben", () => {
  const leer = Object.fromEntries(app.CATEGORY_KEYS.map((k) => [k, []]));
  assert.equal(app.einstellungZuschlaegeText(leer), "Kein Eintrag mit offenem Zuschlag");
  assert.equal(app.einstellungZuschlaegeText(null), "Kein Eintrag mit offenem Zuschlag");

  /* Gezaehlt wird nach derselben Bedingung wie in der Vorschau:
     genug Duelle und ein Zuschlag, der sich lohnt. Ein Eintrag ohne
     Duelle zaehlt deshalb nicht mit. */
  const mit = { ...leer, movie: [
    { id: "a", duels: 40, siege: 34, elo: 1240 },
    { id: "b", duels: 0, siege: 0, elo: 1000 },
  ] };
  assert.equal(app.einstellungZuschlaegeText(mit), "1 Eintrag mit offenem Zuschlag");

  const zwei = { ...mit, series: [{ id: "c", duels: 40, siege: 6, elo: 760 }] };
  assert.equal(app.einstellungZuschlaegeText(zwei), "2 Einträge mit offenem Zuschlag");
});

/* ---------------------------------------------------------------- *
 * 2. Die Abschnitte des Panels
 * ---------------------------------------------------------------- */

test("Die Einstellungen benutzen dieselbe Kopfzeile wie der Statistik-Tab", () => {
  const abschnitte = [...PANEL.matchAll(/<StatsAbschnitt\s+titel="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(abschnitte, [
    "Kategorien",
    "Streaming-Region",
    "Export & Backup",
    "Duell-Zuschläge",
  ]);
});

test("Jeder Abschnitt traegt eine Zusammenfassung aus seinem Zustand", () => {
  assert.match(PANEL, /zusammenfassung=\{einstellungKategorienText\(kategorieAnsicht\)\}/);
  assert.match(PANEL, /zusammenfassung=\{einstellungRegionText\(regionWahl, region\)\}/);
  assert.match(
    PANEL,
    /zusammenfassung=\{einstellungExportText\(exportFormat, headerImages\.length\)\}/
  );
  assert.match(PANEL, /zusammenfassung=\{einstellungZuschlaegeText\(items\)\}/);
});

test("Beim Oeffnen ist alles zugeklappt — gemerkt wird nichts", () => {
  /* Das leere Objekt ist genau dieser Zustand: kein Abschnitt offen,
     keine Vorgabe, kein localStorage. */
  assert.match(QUELLE, /const \[panelAbschnitte, setPanelAbschnitte\] = useState\(\{\}\);/);
  assert.ok(
    !/panelAbschnitte[\s\S]{0,200}localStorage/.test(QUELLE),
    "der Stand des Panels gehoert nicht in den Speicher"
  );
  // Und jedes erneute Oeffnen faengt wieder bei zugeklappt an.
  const zahnrad = QUELLE.slice(
    QUELLE.indexOf('title="Daten (Export & Import)"'),
    QUELLE.indexOf('title="Daten (Export & Import)"') + 900
  );
  assert.match(zahnrad, /setPanelAbschnitte\(\{\}\)/);
});

test("Die Kaesten um die Abschnitte sind weg — es trennt nur die Linie", () => {
  /* Keine Karte, kein Rahmen, keine Hintergrundflaeche mehr: die
     Flaechenfarbe #141416 und die Rahmenfarbe #2A2A2E stehen im Panel
     nur noch innerhalb der Abschnitte (Trennlinien im Export-Teil),
     nicht mehr als Kasten um einen ganzen Abschnitt. */
  assert.ok(
    !/background: "#141416", border: "1px solid/.test(PANEL),
    "um die Abschnitte steht noch ein Kasten"
  );
  // Die Linie kommt aus StatsAbschnitt und ist die Listenfarbe.
  const abschnitt = QUELLE.slice(
    QUELLE.indexOf("function StatsAbschnitt"),
    QUELLE.indexOf("function StatsAbschnitt") + 600
  );
  assert.match(abschnitt, /borderBottom: "1px solid #232326"/);
  assert.match(regel(".stats-abschnitt:last-child"), /border-bottom: none/);
});

test("Die Ueberschriften stehen nicht mehr in Monospace-Grossschreibung", () => {
  assert.ok(!PANEL.includes("KATEGORIEN"), "KATEGORIEN steht noch als Monospace-Titel");
  assert.ok(!PANEL.includes("STREAMING-REGION"), "STREAMING-REGION steht noch so da");
  assert.ok(!PANEL.includes("EXPORT & BACKUP"), "EXPORT & BACKUP steht noch so da");
  assert.ok(!PANEL.includes("DUELL-ZUSCHLÄGE"), "DUELL-ZUSCHLÄGE steht noch so da");
  /* Die Kopfzeile selbst traegt die Schrift des Statistik-Tabs. */
  const abschnitt = QUELLE.slice(
    QUELLE.indexOf("function StatsAbschnitt"),
    QUELLE.indexOf("function RanglistenZeile")
  );
  assert.match(abschnitt, /fontFamily: "'Playfair Display', serif"/);
  assert.match(abschnitt, /minHeight: 44/, "die Antippflaeche bleibt bei 44px");
});

test("Der aufklappbare Bilder-Bereich sitzt weiter in Export & Backup", () => {
  const export_ = PANEL.slice(
    PANEL.indexOf('titel="Export & Backup"'),
    PANEL.indexOf('titel="Duell-Zuschläge"')
  );
  assert.match(export_, /BILDER IM KOPFBEREICH \(\{headerImages\.length\}\)/);
  assert.match(export_, /setZeigeKopfbilder\(\(v\) => !v\)/);
  // Und alles Uebrige des Abschnitts steht unveraendert darin.
  assert.match(export_, /Poster neu suchen/);
  assert.match(export_, /JSON \(Backup\)/);
  assert.match(export_, /JSON-Datei importieren/);
  assert.match(export_, /Poster- und Bilddaten von/);
});

test("Die Kopfzeile zeigt die Zusammenfassung nur zugeklappt", () => {
  const zu = renderToStaticMarkup(
    createElement(app.StatsAbschnitt, { titel: "Kategorien", zusammenfassung: "8 von 8 sichtbar", offen: false }, "Inhalt")
  );
  assert.match(zu, /8 von 8 sichtbar/);
  assert.ok(!zu.includes("Inhalt"), "zugeklappt steht der Inhalt nicht da");

  const auf = renderToStaticMarkup(
    createElement(app.StatsAbschnitt, { titel: "Kategorien", zusammenfassung: "8 von 8 sichtbar", offen: true }, "Inhalt")
  );
  assert.match(auf, /Inhalt/);
  assert.ok(!auf.includes("8 von 8 sichtbar"), "aufgeklappt sagt der Inhalt selbst, was gilt");
});

/* ---------------------------------------------------------------- *
 * 3. Die Unter-Reiter ueber die volle Breite
 * ---------------------------------------------------------------- */

test("Die drei Unter-Reiter bekommen je ein Drittel der vollen Breite", () => {
  const reiter = regel(".unter-reiter");
  assert.match(reiter, /flex:\s*1 1 0/, "gleiche Drittel, unabhaengig von der Textlaenge");
  assert.match(reiter, /text-align:\s*center/, "die Beschriftung steht mittig im Drittel");
  assert.match(reiter, /min-height:\s*44px/);
});

test("Die Reihe bricht auch mit dreistelligen Zaehlern nicht um", () => {
  const leiste = regel(".unter-reiter-leiste");
  assert.match(leiste, /flex-wrap:\s*nowrap/);
  const reiter = regel(".unter-reiter");
  assert.match(reiter, /white-space:\s*nowrap/);
  assert.match(reiter, /word-break:\s*keep-all/);
  /* "Am Schauen 999" misst bei 12px Schrift 99px und passt mit 6px
     Innenabstand je Seite (111px) in das Drittel, das bei 390px
     Fensterbreite zur Verfuegung steht (117px). Bei den frueheren
     13px waeren es 120px und damit zu viel — genau ein Schritt
     kleiner. */
  assert.match(reiter, /font-size:\s*12px/);
  assert.match(reiter, /padding:\s*0 6px/);
});

test("Der Balken des aktiven Reiters ist so breit wie dessen Drittel", () => {
  const balken = regel('.unter-reiter[aria-pressed="true"]::after');
  assert.match(balken, /left:\s*0/);
  assert.match(balken, /right:\s*0/);
  assert.match(balken, /bottom:\s*0/);
});

/* ---------------------------------------------------------------- *
 * 4. Die Einstellungen ersetzen den Seiteninhalt
 *
 * Offene Einstellungen liessen darunter alles stehen: Unter-Reiter,
 * "+ Neu hinzufügen", das Suchfeld und die vollstaendige Rangliste.
 * Wer die Einstellungen zu Ende scrollte, landete mitten in einer
 * Liste, die gar nicht gemeint war. Der Statistik-Tab macht es
 * richtig — er tritt an die Stelle des Kategorie-Inhalts.
 * ---------------------------------------------------------------- */

/* Die Verzweigung, die entscheidet, was unter dem Kopfbereich steht. */
const INHALT_WEICHE = (() => {
  const anfang = QUELLE.indexOf("{/* Statistik und Minispiele treten an die Stelle des");
  assert.ok(anfang > 0, "Die Weiche fuer den Seiteninhalt ist nicht auffindbar");
  return QUELLE.slice(anfang, anfang + 1600);
})();

test("Bei offenen Einstellungen faellt der Seiteninhalt ganz weg", () => {
  assert.match(
    INHALT_WEICHE,
    /\{showExport \? null : activeTab === "stats" \?/,
    "showExport blendet den Inhalt nicht aus"
  );
});

test("Der Kategorie-Inhalt haengt an derselben Weiche wie Statistik", () => {
  /* Nicht drei einzelne Bedingungen, sondern eine Kette: Statistik,
     Minispiele und Kategorie-Inhalt schliessen einander aus, und die
     Einstellungen stehen vor allen dreien. */
  assert.match(INHALT_WEICHE, /activeTab === "minigames" \?/);
  assert.match(INHALT_WEICHE, /ref=\{inhaltRef\}/);
});

test("Die Einstellungen bleiben ueber die Seite erreichbar", () => {
  /* Der Kategorie-Auswahlknopf steht ausserhalb dieser Weiche und
     bleibt deshalb sichtbar — genau wie beim Statistik-Tab. Er ist
     der Weg zurueck. */
  const knopf = QUELLE.indexOf('className="kategorie-knopf"');
  const weiche = QUELLE.indexOf("{showExport ? null : activeTab === \"stats\" ?");
  assert.ok(knopf > 0 && weiche > knopf, "der Auswahlknopf steckt in der Weiche");
});
