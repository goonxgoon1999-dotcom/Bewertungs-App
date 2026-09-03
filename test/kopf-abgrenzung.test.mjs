/**
 * Tests fuer den Kopfbereich und die Abgrenzung der Abschnitte in
 * src/App.jsx.
 *
 * Geprueft werden die drei Aenderungen, die rein die Darstellung
 * betreffen:
 *
 *   1. Statistik — die einklappbaren Abschnitte sind durch eine duenne
 *      Linie in der Listenfarbe getrennt statt durch Leerraum, die
 *      Kopfzeile bleibt antippbar (44px), und unter dem letzten
 *      Abschnitt steht keine Linie mehr.
 *   2. Kategorie-Reiter — die Leiste bricht um, statt seitlich zu
 *      scrollen; kein Reiter wird beschnitten.
 *   3. Unter-Reiter — reiner Text im Unterstrich-Stil, einzeilig und
 *      unter keinen Umstaenden umbrechend.
 *
 * Was sich rendern laesst, wird gerendert (renderToStaticMarkup, wie in
 * statistik-abschnitte.test.mjs). Die Regeln fuer Leisten und Reiter
 * stehen im <style>-Block der App und damit als Text in der Quelle —
 * sie werden dort gelesen. Die Masse in einem echten Browser (Zeilen je
 * Breite, Antippflaechen, Balken und Trennstriche) sind damit NICHT
 * abgedeckt; sie wurden von Hand mit Chromium bei 390, 768, 960 und
 * 1440 px nachgemessen.
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

const GEPRUEFT = ["StatsAbschnitt"];

const QUELLE = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

async function ladeLogik() {
  const { code } = await transform(QUELLE, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-kopf-"));
  const datei = join(verzeichnis, "kopf-abgrenzung.mjs");

  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();

/* Die Farbe, die die App in ihren Listen fuer Trennlinien fuehrt.
   Genau diese soll auch zwischen den Statistik-Abschnitten und unter
   den Unter-Reitern stehen — keine neue. */
const LINIENFARBE = "#232326";

/* Einen CSS-Regelblock aus dem <style>-Block der App holen. Gesucht
   wird nach dem Selektor am Zeilenanfang bis zur schliessenden
   Klammer. */
function regel(selektor) {
  const escaped = selektor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const treffer = QUELLE.match(new RegExp("\\n\\s*" + escaped + "\\s*\\{([^}]*)\\}"));
  assert.ok(treffer, "Regel nicht gefunden: " + selektor);
  return treffer[1];
}

/* ---------------------------------------------------------------- *
 * 1. Statistik: Abschnitte sichtbar trennen
 * ---------------------------------------------------------------- */

test("Jeder Statistik-Abschnitt traegt eine Trennlinie in der Listenfarbe", () => {
  const markup = renderToStaticMarkup(
    createElement(
      app.StatsAbschnitt,
      { titel: "Zeit", offen: false, onUmschalten: () => {} },
      createElement("p", null, "Der Inhalt")
    )
  );
  assert.match(markup, /class="stats-abschnitt"/);
  assert.match(markup, new RegExp("border-bottom:1px solid " + LINIENFARBE));
});

test("Die Linie steht auch dann, wenn der Abschnitt aufgeklappt ist", () => {
  const auf = renderToStaticMarkup(
    createElement(
      app.StatsAbschnitt,
      { titel: "Zeit", offen: true, onUmschalten: () => {} },
      createElement("p", null, "Der Inhalt")
    )
  );
  assert.match(auf, new RegExp("border-bottom:1px solid " + LINIENFARBE));
  // Sie trennt dann den Inhalt vom naechsten Abschnitt, steht also
  // hinter dem Inhalt und nicht zwischen Kopfzeile und Inhalt.
  assert.match(auf, /Der Inhalt/);
  assert.ok(
    auf.indexOf("Der Inhalt") < auf.lastIndexOf("</div>"),
    "der Inhalt gehoert in den Abschnitt mit der Linie"
  );
});

test("Unter dem letzten Abschnitt haengt keine Linie im Leeren", () => {
  assert.match(
    QUELLE,
    /\.stats-abschnitt:last-child\s*\{\s*border-bottom:\s*none\s*!important;\s*\}/,
    "die Linie des letzten Abschnitts muss wieder weg"
  );
});

test("Weder Karte noch Rahmen noch Hintergrundflaeche am Abschnitt", () => {
  const markup = renderToStaticMarkup(
    createElement(app.StatsAbschnitt, { titel: "Zeit", offen: true, onUmschalten: () => {} },
      createElement("p", null, "Der Inhalt"))
  );
  const abschnitt = markup.slice(0, markup.indexOf(">") + 1);
  for (const verboten of ["background", "border-radius", "border-top", "border-left"]) {
    assert.ok(!abschnitt.includes(verboten), abschnitt + " darf kein " + verboten + " tragen");
  }
});

test("Die Kopfzeile behaelt eine Antippflaeche von mindestens 44px", () => {
  const markup = renderToStaticMarkup(
    createElement(app.StatsAbschnitt, { titel: "Zeit", offen: false, onUmschalten: () => {} })
  );
  assert.match(markup, /min-height:44px/);
  // 12px oben und unten: zusammen mit der Titelzeile traegt das die
  // 44px auch ohne den Mindestwert.
  assert.match(markup, /padding:12px 0/);
});

test("Der grosse Leerraum zwischen den Abschnitten ist weg", () => {
  const markup = renderToStaticMarkup(
    createElement(app.StatsAbschnitt, { titel: "Zeit", offen: false, onUmschalten: () => {} })
  );
  /* Vorher trennte ein Aussenabstand von 28px die Abschnitte, ohne
     dass die Leere eine Grenze markiert haette. */
  assert.ok(!/margin-bottom:28px/.test(markup), "der 28px-Abstand darf nicht zurueckkommen");
});

/* ---------------------------------------------------------------- *
 * 2. Kategorie-Reiter: Umbruch statt seitlichem Scrollen
 * ---------------------------------------------------------------- */

test("Die Kategorie-Leiste bricht um, statt seitlich zu scrollen", () => {
  const leiste = regel(".tab-leiste");
  assert.match(leiste, /flex-wrap:\s*wrap/);
  assert.ok(!/overflow-x/.test(leiste), "kein seitliches Scrollen mehr");
  assert.ok(!/scroll-snap-type/.test(leiste), "ohne Scrollen braucht es kein Einrasten");
  assert.ok(
    !/\.tab-leiste::-webkit-scrollbar/.test(QUELLE),
    "ohne Rollbalken braucht es keine Regel, die ihn versteckt"
  );
});

test("Kein Kategorie-Reiter rastet noch an einer Scrollposition ein", () => {
  const btn = regel(".tab-btn");
  assert.ok(!/scroll-snap-align/.test(btn));
  assert.match(btn, /white-space:\s*nowrap/, "eine Beschriftung bricht nie im Wort um");
});

test("Ab 960px teilen sich die Reiter die Zeile, ohne beschnitten zu werden", () => {
  /* Mit `flex: 1 1 0` und `min-width: 0` bekam jeder Reiter dieselbe
     Breite — zu wenig fuer "Adult Animation" und "Sitcoms/Comedy",
     deren Beschriftung dadurch ueber den Knopf hinausstand. Mit
     `auto` ist die Textbreite die Untergrenze. */
  const desktop = QUELLE.slice(QUELLE.indexOf("@media (min-width: 960px)"));
  const btn = desktop.match(/\.tab-btn\s*\{([^}]*)\}/);
  assert.ok(btn, "Desktop-Regel fuer .tab-btn nicht gefunden");
  assert.match(btn[1], /flex:\s*1 1 auto/);
  assert.ok(!/min-width:\s*0/.test(btn[1]), "min-width: 0 liess die Beschriftung ueberlaufen");
});

test("Die Leiste holt keinen Reiter mehr ins Bild", () => {
  /* Das Hereinholen des aktiven Reiters gab es nur, weil die Leiste
     seitlich scrollte. Jetzt stehen ohnehin alle im Bild. */
  assert.ok(!/tabLeisteRef/.test(QUELLE), "die Referenz auf die Leiste hat keinen Zweck mehr");
  assert.ok(
    !/data-tab="'\s*\+\s*activeTab/.test(QUELLE),
    "es wird nicht mehr nach dem aktiven Reiter gesucht, um zu ihm zu scrollen"
  );
});

test("Alle sichtbaren Kategorien stehen in der Leiste — ohne feste Zeilenzuordnung", () => {
  /* Die Reiter kommen unveraendert aus sichtbareKats; wer eine
     Kategorie ausblendet, laesst den Rest von selbst nachruecken.
     Eine Aufteilung auf Zeilen steht nirgends im Baum. */
  assert.match(QUELLE, /\{sichtbareKats\.map\(\(c, i\) => \(/);
  assert.ok(!/tab-zeile/.test(QUELLE), "es gibt keine feste Zeile fuer einen Reiter");
});

/* ---------------------------------------------------------------- *
 * 3. Unter-Reiter im Unterstrich-Stil
 * ---------------------------------------------------------------- */

test("Die Reihe der Unter-Reiter bricht unter keinen Umstaenden um", () => {
  const leiste = regel(".unter-reiter-leiste");
  assert.match(leiste, /flex-wrap:\s*nowrap/);
  const reiter = regel(".unter-reiter");
  assert.match(reiter, /white-space:\s*nowrap/, "auch die Beschriftung bricht nicht um");
  assert.match(reiter, /word-break:\s*keep-all/, "und schon gar nicht mitten im Wort");
});

test("Reicht der Platz nicht, scrollt die Reihe — ohne sichtbaren Rollbalken", () => {
  const leiste = regel(".unter-reiter-leiste");
  assert.match(leiste, /overflow-x:\s*auto/);
  assert.match(leiste, /scrollbar-width:\s*none/);
  assert.match(QUELLE, /\.unter-reiter-leiste::-webkit-scrollbar\s*\{\s*display:\s*none;\s*\}/);
});

test("Unter der ganzen Reihe laeuft eine durchgehende Linie in der Listenfarbe", () => {
  const leiste = regel(".unter-reiter-leiste");
  assert.match(leiste, new RegExp("border-bottom:\\s*1px solid " + LINIENFARBE));
});

test("Die Unter-Reiter sind reiner Text — keine Flaeche, kein Rahmen", () => {
  const reiter = regel(".unter-reiter");
  assert.match(reiter, /background:\s*transparent/);
  assert.match(reiter, /border:\s*none/);
  assert.match(reiter, /border-radius:\s*0/);
  /* Und im Baum steht keine Flaeche und kein Rahmen mehr am Knopf —
     dort bleibt allein die Farbe. */
  const block = QUELLE.slice(
    QUELLE.indexOf('className="unter-reiter"'),
    QUELLE.indexOf('className="unter-reiter"') + 700
  );
  const style = block.slice(block.indexOf("style={{"), block.indexOf("}}"));
  assert.ok(!/background/.test(style), "keine Hintergrundfarbe am Unter-Reiter");
  assert.ok(!/border/.test(style), "kein Rahmen am Unter-Reiter");
  assert.ok(!/borderRadius/.test(style), "keine Rundung am Unter-Reiter");
});

test("Der aktive Reiter steht in der Kategoriefarbe, die uebrigen gedaempft", () => {
  const block = QUELLE.slice(
    QUELLE.indexOf('className="unter-reiter"'),
    QUELLE.indexOf('className="unter-reiter"') + 700
  );
  assert.match(block, /color: unterReiter === r\.key \? "var\(--accent, #C9A227\)" : "#9A968C"/);
});

test("Unter dem aktiven Reiter sitzt ein kurzer Balken auf der Linie auf", () => {
  const balken = regel('.unter-reiter[aria-pressed="true"]::after');
  assert.match(balken, /content:\s*""/);
  assert.match(balken, /bottom:\s*0/, "der Balken sitzt auf der Linie auf");
  assert.match(balken, /height:\s*2px/);
  assert.match(balken, /background:\s*var\(--accent, #C9A227\)/);
  // Kurz heisst: so breit wie der Text, nicht wie der ganze Knopf.
  assert.match(balken, /left:\s*10px/);
  assert.match(balken, /right:\s*10px/);
});

test("Zwischen den Reitern steht ein kurzer senkrechter Trennstrich", () => {
  const strich = regel(".unter-reiter + .unter-reiter::before");
  assert.match(strich, /content:\s*""/);
  assert.match(strich, /width:\s*1px/);
  assert.match(strich, new RegExp("background:\\s*" + LINIENFARBE), "dieselbe Farbe wie die Linie");
  // Er reicht nicht bis nach unten durch: oben und unten bleibt Luft,
  // unten mehr als 0 — sonst stiesse er an die waagerechte Linie.
  const unten = strich.match(/bottom:\s*(\d+)px/);
  assert.ok(unten && Number(unten[1]) > 0, "der Trennstrich endet oberhalb der Linie");
  assert.match(strich, /top:\s*\d+px/);
});

test("Jeder Unter-Reiter behaelt eine Antippflaeche von mindestens 44px", () => {
  const reiter = regel(".unter-reiter");
  assert.match(reiter, /min-height:\s*44px/);
});

test("Beim Umschalten springt nichts: die Schriftstaerke bleibt gleich", () => {
  /* Vorher war der aktive Reiter fett (700) und die uebrigen normal
     (400) — beim Umschalten rutschten die Nachbarn um die Differenz
     zur Seite. Jetzt tragen alle drei dieselbe Staerke, unterschieden
     wird ueber Farbe und Balken. */
  const reiter = regel(".unter-reiter");
  assert.match(reiter, /font-weight:\s*600/);
  const block = QUELLE.slice(
    QUELLE.indexOf('className="unter-reiter"'),
    QUELLE.indexOf('className="unter-reiter"') + 700
  );
  assert.ok(!/fontWeight/.test(block), "keine wechselnde Schriftstaerke am Unter-Reiter");
});

test('Der Knopf "+ Neu hinzufuegen" steht weiter unter den Unter-Reitern', () => {
  const leiste = QUELLE.indexOf('className="unter-reiter-leiste"');
  const knopf = QUELLE.indexOf('className="neu-knopf"');
  assert.ok(leiste > 0 && knopf > leiste, "der Knopf gehoert hinter die Unter-Reiter");
});
