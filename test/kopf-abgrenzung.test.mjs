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
 *   2. Kategorie-Auswahl — die Reiterleiste ist aus dem Kopfbereich
 *      verschwunden; an ihrer Stelle steht ein Knopf mit einem Blatt
 *      von unten.
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

const GEPRUEFT = ["StatsAbschnitt", "KategorieBlatt", "CATEGORY_COLORS"];

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

/* Der Kopfbereich als Textausschnitt: vom Element bis zu dem
   Kommentar, mit dem der Auswahlknopf darunter anfaengt. */
function kopfBlock() {
  const start = QUELLE.indexOf('className="kopfbereich"');
  const ende = QUELLE.indexOf("Der Kategorie-Auswahlknopf", start);
  assert.ok(start > 0 && ende > start, "Kopfbereich nicht gefunden");
  return QUELLE.slice(start, ende);
}

/* Und der Auswahlknopf selbst. Gesucht wird ab dem Kopfbereich —
   derselbe Satz steht weiter oben schon im Stylesheet. */
function knopfBlock() {
  const start = QUELLE.indexOf("Der Kategorie-Auswahlknopf", QUELLE.indexOf('className="kopfbereich"'));
  const ende = QUELLE.indexOf("</button>", start);
  assert.ok(start > 0 && ende > start, "Auswahlknopf nicht gefunden");
  return QUELLE.slice(start, ende);
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
 * 2. Kategorie-Auswahl: ein Knopf statt der Reiterleiste
 *
 * Die acht Reiter passten auf kein Telefon nebeneinander. Wischbar
 * konnte der aktive ausserhalb des Sichtbaren stehen; umbrechend
 * belegten sie drei Zeilen und trieben den Kopfbereich so in die
 * Hoehe, dass sein Seitenverhaeltnis nicht mehr stimmte und der Titel
 * aus dem Bild fiel. Sie sind deshalb ganz aus dem Kopfbereich heraus:
 * ein Knopf ueber die volle Breite darunter, dahinter ein Blatt von
 * unten mit allen sichtbaren Kategorien.
 * ---------------------------------------------------------------- */

test("Von der Reiterleiste ist nichts uebrig", () => {
  for (const weg of ["tab-leiste", "tab-btn"]) {
    assert.ok(!QUELLE.includes(weg), weg + " gehoert samt Regeln entfernt");
  }
  assert.ok(!/data-aktiv/.test(QUELLE), "ohne Reiter gibt es keinen aktiven Reiter");
});

test("Der Knopf laeuft ueber die volle Breite und bleibt ungefuellt", () => {
  const knopf = regel(".kategorie-knopf");
  assert.match(knopf, /width:\s*100%/);
  assert.match(knopf, /background:\s*transparent/, "gefuellt ist allein '+ Neu hinzufuegen'");
  assert.match(knopf, /box-sizing:\s*border-box/, "sonst stuende er ueber seinen Container hinaus");
});

test("Der Rahmen ist 1px stark, damit die Kategoriefarbe traegt", () => {
  const knopf = regel(".kategorie-knopf");
  assert.match(knopf, /border-width:\s*1px/);
  assert.match(knopf, /border-style:\s*solid/);
});

test("Rahmen und Beschriftung tragen die Kategoriefarbe", () => {
  const block = knopfBlock();
  assert.match(block, /borderColor:\s*accent/, "der Rahmen in der Farbe der Kategorie");
  assert.match(block, /color:\s*accent/, "und die Beschriftung ebenso");
});

test("Die Anzahl steht in einer abgedunkelten Abstufung derselben Farbe", () => {
  const block = knopfBlock();
  const zahl = block.slice(block.indexOf('className="kategorie-knopf-zahl"'));
  const farbe = zahl.match(/color:\s*mitDeckkraft\(accent,\s*([0-9.]+)\)/);
  assert.ok(farbe, "die Zahl nimmt dieselbe Farbe, nur gedaempft");
  assert.ok(Number(farbe[1]) < 1, "gedaempft heisst: leiser als der Name");
  /* Und sie ist kleiner gesetzt als der Name (15px am Knopf). */
  const stil = regel(".kategorie-knopf-zahl");
  const groesse = stil.match(/font-size:\s*([0-9.]+)px/);
  assert.ok(groesse && Number(groesse[1]) < 15, "kleinere Schrift als der Name");
});

test("Der Pfeil zeigt nach unten und steht rechts aussen", () => {
  const block = knopfBlock();
  assert.match(block, /className="kategorie-knopf-pfeil"[^>]*>▾</s, "ein nach unten zeigender Pfeil");
  assert.match(regel(".kategorie-knopf-pfeil"), /margin-left:\s*auto/, "alles davor bleibt links");
});

test("Der Knopf fuehrt keinen einzigen neuen Farbwert ein", () => {
  /* Alles Farbige an ihm kommt aus accentFor — also aus den acht
     Werten in CATEGORY_COLORS. Im Stylesheet steht dazu nichts. */
  const knopf = regel(".kategorie-knopf") + regel(".kategorie-knopf-zahl") + regel(".kategorie-knopf-pfeil");
  assert.ok(!/#[0-9A-Fa-f]{3,8}/.test(knopf), "keine Farbe im Stylesheet des Knopfes");
  assert.ok(!/rgb/.test(knopf));
  assert.equal(Object.keys(app.CATEGORY_COLORS).length, 8, "acht Kategorien, acht Farben");
});

test("Der Knopf steht zwischen Kopfbereich und Unter-Reitern", () => {
  const kopf = QUELLE.indexOf('className="kopfbereich"');
  const knopf = QUELLE.indexOf('className="kategorie-knopf"');
  const unter = QUELLE.indexOf('className="unter-reiter-leiste"');
  assert.ok(kopf > 0 && knopf > kopf, "der Knopf steht unter dem Kopfbereich");
  assert.ok(unter > knopf, "und ueber den Unter-Reitern");
});

test("Er steht ausserhalb des Kopfbereichs — dessen Hoehe haengt nicht an ihm", () => {
  const kopf = QUELLE.indexOf('className="kopfbereich"');
  const knopf = QUELLE.indexOf('className="kategorie-knopf"');
  /* Zwischen beiden schliesst der Kopfbereich: der Kommentar, der den
     Knopf einleitet, steht hinter dem schliessenden </div>. */
  const dazwischen = QUELLE.slice(kopf, knopf);
  assert.ok(
    dazwischen.includes("Der Kategorie-Auswahlknopf"),
    "der Knopf gehoert hinter den Kopfbereich, nicht hinein"
  );
});

test("Knopf und Unter-Reiter stehen dicht beieinander", () => {
  /* 14px unter dem Kopfbereich, 10px darunter bis zu den
     Unter-Reitern — beide lesen sich als ein Steuerbereich. */
  assert.match(QUELLE, /padding: "14px 20px 0"/, "Abstand des Knopfes zum Kopfbereich");
  assert.match(
    QUELLE,
    /style=\{\{ maxWidth: 720, margin: "0 auto", padding: "10px 20px 20px" \}\}/,
    "der Inhalt darunter faengt knapp an"
  );
});

/* --- Das Auswahlblatt --- */

/* Die Liste, die der Knopf bekommt, ist die der Kategorie-Ansicht:
   nur sichtbar geschaltete Kategorien, in der dort festgelegten
   Reihenfolge. Hier wird mit zwei Ausschnitten gerendert. */
const ALLE = [
  { key: "movie", label: "Filme" },
  { key: "series", label: "Serien" },
  { key: "anime", label: "Anime" },
  { key: "kids", label: "Kinderserien" },
  { key: "adultanim", label: "Adult Animation" },
  { key: "doku", label: "Dokus" },
  { key: "comedy", label: "Sitcoms/Comedy" },
  { key: "game", label: "Spiele" },
];

function blatt(kategorien, aktuell, anzahlen) {
  return renderToStaticMarkup(
    createElement(app.KategorieBlatt, {
      kategorien,
      aktuell,
      anzahlen,
      onWaehlen: () => {},
      onClose: () => {},
    })
  );
}

test("Das Blatt bietet jede sichtbare Kategorie mit Namen und Anzahl", () => {
  const zahlen = Object.fromEntries(ALLE.map((c, i) => [c.key, i * 7]));
  const markup = blatt(ALLE, "movie", zahlen);
  for (const c of ALLE) {
    assert.ok(markup.includes(c.label), c.label + " fehlt im Blatt");
    assert.ok(markup.includes(">" + zahlen[c.key] + "<"), "die Anzahl zu " + c.label + " fehlt");
  }
});

test("Auch die laengsten Namen stehen vollstaendig da", () => {
  const markup = blatt(ALLE, "movie", {});
  for (const lang of ["Adult Animation", "Sitcoms/Comedy", "Kinderserien"]) {
    assert.ok(markup.includes(lang), lang + " gehoert ungekuerzt ins Blatt");
  }
  /* Untereinander, nicht nebeneinander: nichts kann abgeschnitten
     werden, egal wie lang der Name ist. */
  assert.match(markup, /flex-direction:column/);
});

test("Die aktuelle Kategorie ist markiert, die uebrigen nicht", () => {
  const markup = blatt(ALLE, "comedy", {});
  const zeilen = markup.split("<button").slice(1);
  assert.equal(zeilen.length, 8);
  const markiert = zeilen.filter((z) => z.includes('aria-pressed="true"'));
  assert.equal(markiert.length, 1, "genau eine Zeile ist die aktuelle");
  assert.ok(markiert[0].includes("Sitcoms/Comedy"));
  assert.match(markiert[0], /background:var\(--accent, #C9A227\)/, "in der Kategoriefarbe");
});

test("Ausgeblendete Kategorien werden gar nicht erst angeboten", () => {
  /* Der Knopf reicht sichtbareKats durch — steht nur das im Blatt,
     kann eine versteckte Kategorie dort nicht auftauchen. */
  const zwei = [ALLE[0], ALLE[7]];
  const markup = blatt(zwei, "movie", { movie: 166, game: 12 });
  assert.equal(markup.split("<button").length - 1, 2, "zwei sichtbare, zwei Zeilen");
  assert.ok(markup.includes("Filme") && markup.includes("Spiele"));
  for (const weg of ["Anime", "Dokus", "Adult Animation", "Sitcoms/Comedy", "Kinderserien"]) {
    assert.ok(!markup.includes(weg), weg + " ist ausgeblendet und gehoert nicht ins Blatt");
  }
});

test("Die Reihenfolge im Blatt ist die der Einstellungen", () => {
  const gedreht = [...ALLE].reverse();
  const markup = blatt(gedreht, "game", {});
  const stellen = gedreht.map((c) => markup.indexOf(">" + c.label + "<"));
  for (const stelle of stellen) assert.ok(stelle > 0);
  const sortiert = [...stellen].sort((a, b) => a - b);
  assert.deepEqual(stellen, sortiert, "die Zeilen stehen in der uebergebenen Reihenfolge");
});

test("Das Blatt kommt von unten und traegt die Wahl weiter", () => {
  const markup = blatt(ALLE, "movie", {});
  assert.match(markup, /class="blatt-rein"/, "dieselbe Bewegung wie alle Blaetter der App");
  const auswahl = QUELLE.slice(QUELLE.indexOf("<KategorieBlatt"), QUELLE.indexOf("<KategorieBlatt") + 900);
  assert.match(auswahl, /kategorien=\{sichtbareKats\}/, "genau die sichtbaren Kategorien");
  assert.match(auswahl, /setKategorieBlattOffen\(false\)/, "nach der Wahl schliesst es");
  assert.match(auswahl, /waehleKategorie\(key,/, "und die Liste wechselt");
});

test("Gewaehlt wird erst, wenn die Aus-Bewegung durch ist", () => {
  /* schliessen(...) spielt sie und ruft danach — sonst stuende ein
     Blatt ueber einer schon getauschten Liste. */
  const start = QUELLE.indexOf("function KategorieBlatt");
  const block = QUELLE.slice(start, QUELLE.indexOf("function ConfirmDialog"));
  assert.match(block, /onClick=\{\(\) => schliessen\(\(\) => onWaehlen\(c\.key\)\)\}/);
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

/* ---------------------------------------------------------------- *
 * 4. Kopfbereich: festes 16:9 zurueck
 *
 * Solange die Reiter darin standen, musste die Hoehe mitwachsen — mit
 * dem Ergebnis, dass das Seitenverhaeltnis nicht mehr stimmte. Ohne
 * sie traegt der Kopfbereich nur noch Bild, Titel, Rang-Abzeichen und
 * die drei Symbolknoepfe; die Hoehe darf deshalb wieder fest sein und
 * haengt an nichts, was sich mit den Kategorien aendert.
 * ---------------------------------------------------------------- */

test("Der Kopfbereich hat sein festes 16:9 zurueck", () => {
  const kopf = regel(".kopfbereich");
  assert.match(kopf, /aspect-ratio:\s*16 \/ 9/);
  assert.ok(!/min-height/.test(kopf), "keine mitwachsende Untergrenze mehr");
});

test("Browser ohne aspect-ratio bekommen dieselben 9/16 der Breite", () => {
  assert.match(
    QUELLE,
    /@supports not \(aspect-ratio: 16 \/ 9\) \{\s*\.kopfbereich \{ min-height: calc\(56\.25vw/,
    "56.25vw sind 9/16 der Fensterbreite"
  );
});

test("Ab 960px bleibt die Mindesthoehe von 360px", () => {
  const desktop = QUELLE.slice(QUELLE.indexOf("@media (min-width: 960px)"));
  const kopf = desktop.match(/\.kopfbereich\s*\{([^}]*)\}/);
  assert.ok(kopf, "Desktop-Regel fuer .kopfbereich nicht gefunden");
  assert.match(kopf[1], /aspect-ratio:\s*auto/, "sonst waere der Kopf auf 1920px ueber 1000px hoch");
  assert.match(kopf[1], /min-height:\s*360px/);
  assert.match(kopf[1], /box-sizing:\s*border-box/);
});

test("Die Hoehe haengt an nichts, was sich mit den Kategorien aendert", () => {
  const kopf = kopfBlock();
  assert.ok(!/sichtbareKats/.test(kopf), "keine Kategorienliste mehr im Kopfbereich");
  assert.ok(!/catInfo\.label/.test(kopf), "und auch kein Zaehler '166 Filme'");
});

test("Im Kopfbereich stehen nur noch Bild, Titel, Abzeichen und die drei Symbole", () => {
  const kopf = kopfBlock();
  assert.ok(kopf.includes("<HeaderSlideshow"), "das Hintergrundbild");
  assert.ok(kopf.includes("APP_NAME_ZEILEN"), "der App-Titel");
  assert.ok(kopf.includes("<RangChip"), "das Rang-Abzeichen");
  assert.equal(
    (kopf.match(/<KopfIconButton/g) || []).length,
    3,
    "Minispiele, Statistik und Daten — drei Symbolknoepfe"
  );
});

test("Titel und Abzeichen stehen unten links, die Symbole oben rechts", () => {
  const kopf = kopfBlock();
  assert.match(kopf, /justifyContent: "flex-end"/, "der Inhalt haengt am unteren Rand");
  const symbole = kopf.slice(kopf.indexOf("position: \"absolute\", top: 0"));
  assert.match(symbole.slice(0, 400), /justifyContent: "flex-end"/, "die Symbolreihe nach rechts");
});

test("Das Bild deckt den ganzen Kopfbereich ab", () => {
  const start = QUELLE.indexOf("function HeaderSlideshow");
  const block = QUELLE.slice(start, QUELLE.indexOf("\n}", QUELLE.indexOf("return (", start)));
  assert.match(block, /position:\s*"absolute",\s*inset:\s*0/);
  assert.ok(!/aspectRatio/.test(block), "das Bild bringt keine eigene feste Hoehe mit");
});

test("Am Fuss des Kopfbereichs steht keine harte Kante mehr", () => {
  /* Die 1px-Linie schloss frueher die Reiterleiste ab. Ohne sie laeuft
     der Verlauf ueber dem Bild bis unten in die Seitenfarbe aus. */
  const kopf = kopfBlock();
  assert.ok(!/borderBottom/.test(kopf.slice(0, kopf.indexOf("<HeaderSlideshow"))),
    "keine Trennlinie unter dem Kopfbereich");
  const start = QUELLE.indexOf("function HeaderSlideshow");
  const block = QUELLE.slice(start, QUELLE.indexOf("\n}", QUELLE.indexOf("return (", start)));
  assert.match(block, /rgba\(23,23,26,0\.92\) 82%, #17171A 100%/, "unten die volle Seitenfarbe");
});
