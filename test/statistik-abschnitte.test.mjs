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
  "nurEinerOffen",
  "STATISTIK_ABSCHNITTE_VORGABE",
  "ladeStatistikAbschnitte",
  "groessteImdbAbweichung",
  "eintraegeText",
  "statsGesamtText",
  "statsTopTenText",
  "statsPruefenText",
  "statsZeitText",
  "tageKurz",
  "StatsAbschnitt",
  "AbschnittStil",
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

test("Beim Oeffnen steht genau die Gesamtstatistik offen, sonst nichts", () => {
  const stand = app.normalisiereStatistikAbschnitte(null);
  assert.equal(stand.gesamt, true);
  for (const [key, offen] of Object.entries(stand)) {
    if (key === "gesamt") continue;
    assert.equal(offen, false, key + " sollte zugeklappt beginnen");
  }
});

test("Ein gespeicherter Stand ueberschreibt nur, was er kennt", () => {
  const stand = app.normalisiereStatistikAbschnitte({ gesamt: false, zeit: true });
  assert.equal(stand.gesamt, false);
  assert.equal(stand.zeit, true);
  // Alles Uebrige bleibt bei der Vorgabe.
  assert.equal(stand.top10, false);
  assert.equal(stand.detail, false);
});

test("Ein alter Stand mit zwei offenen Abschnitten behaelt nur den oberen", () => {
  /* Genau der Stand, den die Vorgabe von frueher hinterlassen hat:
     Gesamtstatistik UND Top 10. Offen bleibt der, der im Tab weiter
     oben steht. */
  const stand = app.normalisiereStatistikAbschnitte({ gesamt: true, top10: true });
  assert.equal(stand.gesamt, true);
  assert.equal(stand.top10, false);

  // Und ohne die Gesamtstatistik gewinnt der naechste in der Reihe.
  const ohne = app.normalisiereStatistikAbschnitte({ gesamt: false, zeit: true, top10: true });
  assert.equal(ohne.zeit, true);
  assert.equal(ohne.top10, false);
});

test("nurEinerOffen laesst hoechstens einen offenen Abschnitt uebrig", () => {
  const alles = {};
  for (const key of Object.keys(app.STATISTIK_ABSCHNITTE_VORGABE)) alles[key] = true;
  const stand = app.nurEinerOffen(alles);
  assert.equal(Object.values(stand).filter(Boolean).length, 1);
  assert.equal(stand.gesamt, true);

  // Alles zugeklappt bleibt alles zugeklappt — auch das ist ein Zustand.
  const keiner = app.nurEinerOffen({});
  assert.equal(Object.values(keiner).filter(Boolean).length, 0);
  assert.deepEqual(Object.keys(keiner), Object.keys(app.STATISTIK_ABSCHNITTE_VORGABE));
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
 * Der aufgeklappte Abschnitt
 *
 * Zugeklappt sind beide Seiten uebersichtlich; offen verlor man beim
 * Scrollen den Zusammenhang, weil der Inhalt optisch nichts von der
 * naechsten Kopfzeile trennte. Vier Dinge haengen deshalb am offenen
 * Zustand — und nur an ihm.
 * ---------------------------------------------------------------- */

function abschnitt(props) {
  return renderToStaticMarkup(
    createElement(
      app.StatsAbschnitt,
      { titel: "Ø je Kriterium", offen: true, onUmschalten: () => {}, ...props },
      createElement("p", null, "Der Inhalt")
    )
  );
}

test("Die Kopfzeile eines offenen Abschnitts klebt oben und deckt dabei ab", () => {
  const auf = abschnitt({});
  assert.match(auf, /position:sticky/);
  /* Der Hintergrund der Seite unter der Kopfzeile: sonst schiene der
     Inhalt beim Scrollen durch sie hindurch. */
  assert.match(auf, /background:#17171A/);
  /* Unter der klebenden Kategorie-Auswahl (zIndex 5), nicht ueber
     ihr — beide stehen untereinander. */
  assert.match(auf, /z-index:4/);

  const zu = abschnitt({ offen: false });
  assert.ok(!/position:sticky/.test(zu), "zugeklappt klebt nichts");
});

test("Der offene Inhalt haengt an einer senkrechten Linie in der Akzentfarbe", () => {
  const auf = abschnitt({});
  /* 2px, durchgehend, links am eingerueckten Inhalt. Die Farbe kommt
     aus dem Kontext; ohne ihn gilt die Akzentfarbe der App. */
  assert.match(auf, /border-left:2px solid var\(--accent, #C9A227\)/);
  assert.match(auf, /padding-left:14px/);

  const zu = abschnitt({ offen: false });
  assert.ok(!/border-left:2px solid/.test(zu));
});

test("Titel und Pfeil des offenen Abschnitts stehen in der Akzentfarbe", () => {
  const auf = abschnitt({});
  /* Die Kopfzeile faerbt Titel und Pfeil; der Pfeil traegt die Farbe
     ausserdem selbst, weil er sonst die gedaempfte behielte. */
  const kopf = auf.slice(0, auf.indexOf("</button>"));
  assert.equal((kopf.match(/color:var\(--accent, #C9A227\)/g) || []).length, 2);

  const zu = abschnitt({ offen: false });
  const kopfZu = zu.slice(0, zu.indexOf("</button>"));
  assert.match(kopfZu, /color:#EDEAE3/, "zugeklappt bleibt es bei der Textfarbe");
  assert.ok(!/color:var\(--accent, #C9A227\)/.test(kopfZu));
});

test("Am Fuss des offenen Abschnitts steht die Zuklappen-Zeile", () => {
  const auf = abschnitt({});
  assert.match(auf, /Ø je Kriterium zuklappen/);
  /* Zurueckhaltend: duenner Rahmen, gedaempfte Schrift, keine
     gefuellte Flaeche — und trotzdem 44px hoch. */
  const zeile = auf.slice(auf.lastIndexOf("<button"));
  assert.match(zeile, /border:1px solid #2A2A2E/);
  assert.match(zeile, /background:transparent/);
  assert.match(zeile, /color:#77746c/);
  assert.match(zeile, /min-height:44px/);
  /* Der Pfeil zeigt nach oben — dasselbe gedrehte Symbol wie in der
     Kopfzeile eines offenen Abschnitts. */
  assert.match(zeile, /rotate\(180deg\)/);

  const zu = abschnitt({ offen: false });
  assert.ok(!/zuklappen/.test(zu), "zugeklappt gibt es nichts zuzuklappen");
});

test("Die Akzentfarbe kommt aus dem Kontext der Seite", () => {
  /* Der Statistik-Tab setzt darin die Farbe der gewaehlten Kategorie,
     die Einstellungen lassen die Vorgabe stehen. Neue Farbwerte
     kommen keine dazu — hier steht die Farbe der Spiele. */
  const html = renderToStaticMarkup(
    createElement(
      app.AbschnittStil.Provider,
      { value: { akzent: "#C4633E", klebtBei: 59 } },
      createElement(
        app.StatsAbschnitt,
        { titel: "Zeit", offen: true, onUmschalten: () => {} },
        createElement("p", null, "Der Inhalt")
      )
    )
  );
  assert.match(html, /border-left:2px solid #C4633E/);
  assert.match(html, /color:#C4633E/);
  // Und die gemessene Hoehe der Auswahlleiste haelt die Kopfzeile darunter.
  assert.match(html, /top:59px/);
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
  /* Der KNOPF "Alle" gehoert genau einer Auswahl — stuende er
     mehrfach da, waeren die alten Chip-Gruppen zurueck.

     Gezaehlt werden ausdruecklich nur Knoepfe: Seit die zugeklappten
     Kopfzeilen ihre Zusammenfassung in normaler Schreibweise tragen,
     steht das Wort "Alle" auch unter "Ø je Kriterium" — als Text,
     nicht als Auswahl. */
  const knoepfe = markup.match(/<button[^>]*>Alle<\/button>/g) || [];
  assert.equal(knoepfe.length, 1);
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

test("Die Gesamtstatistik steht offen, der Rest zugeklappt", () => {
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

  /* … der Inhalt des einen offenen Abschnitts auch: die Kacheln der
     Gesamtstatistik. */
  assert.match(markup, /GESAMT/);

  /* Der Inhalt der zugeklappten Abschnitte nicht. Jede dieser
     Beschriftungen steht ausschliesslich in einem zugeklappten
     Abschnitt. Der Titel "Ein Film" taugt dafuer nicht: Er steht
     auch in der Zusammenfassung der zugeklappten Top 10. */
  for (const inhalt of ["MIT LAUFZEIT", "ANZAHL", "9 – 10", "Bauchgefühl"]) {
    assert.ok(!markup.includes(inhalt), inhalt + " steht da, obwohl zugeklappt");
  }

  /* Und offen ist genau einer: Die Zuklappen-Zeile steht am Fuss
     jedes offenen Abschnitts, also genau einmal. */
  const zuklappen = markup.match(/ zuklappen<\/span>/g) || [];
  assert.equal(zuklappen.length, 1);
  assert.ok(markup.includes("Gesamtstatistik zuklappen"));
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

/* ---------------------------------------------------------------- *
 * Jede Kopfzeile traegt eine Zusammenfassung — und zwar in normaler
 * Schreibweise
 *
 * "Gesamtstatistik" und "Top 10" hatten keine und waren dadurch eine
 * Zeile niedriger als ihre Nachbarn; die vorhandenen standen in
 * Grossbuchstaben, waehrend dieselbe Kopfzeile im Daten-Panel von
 * Anfang an normal schrieb ("6 von 8 sichtbar").
 * ---------------------------------------------------------------- */

const QUELLE = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

/* Die oeffnenden Tags eines Bausteins, samt aller Eigenschaften.
   Geschweifte Klammern werden mitgezaehlt, damit ein ">" in einem
   Ausdruck den Tag nicht vorzeitig beendet. */
function oeffnendeTags(quelle, name) {
  const marke = "<" + name;
  const tags = [];
  let von = quelle.indexOf(marke);
  while (von >= 0) {
    let tiefe = 0;
    let i = von + marke.length;
    for (; i < quelle.length; i++) {
      const zeichen = quelle[i];
      if (zeichen === "{") tiefe++;
      else if (zeichen === "}") tiefe--;
      else if (zeichen === ">" && tiefe === 0) break;
    }
    tags.push(quelle.slice(von, i + 1));
    von = quelle.indexOf(marke, i);
  }
  return tags;
}

test("Kein Abschnitt bleibt ohne Zusammenfassung", () => {
  const tags = oeffnendeTags(QUELLE, "StatsAbschnitt");
  assert.ok(tags.length >= 10, "zu wenige Abschnitte gefunden — " + tags.length);
  for (const tag of tags) {
    const titel = /titel="([^"]+)"/.exec(tag);
    assert.match(tag, /zusammenfassung[={]/, (titel ? titel[1] : tag.slice(0, 60)) + " hat keine");
  }
});

test("Die Zusammenfassungen stehen nicht in Grossbuchstaben", () => {
  for (const alt of ['"GRÖSSTE ABWEICHUNG ', '" EINTRÄGE"', '" EINTRAG"', '"ALLE"', '"GESEHEN "']) {
    assert.ok(!QUELLE.includes(alt), "Grossschreibung " + alt + " steht noch da");
  }
  assert.equal(app.eintraegeText(1), "1 Eintrag");
  assert.equal(app.eintraegeText(264), "264 Einträge");
});

test("Gesamtstatistik meldet Bereich und Anzahl", () => {
  assert.equal(app.statsGesamtText(true, KATEGORIEN, 264), "8 Kategorien · 264 Einträge");
  assert.equal(
    app.statsGesamtText(false, [{ label: "Filme" }, { label: "Serien" }], 12),
    "Filme, Serien · 12 Einträge"
  );
  assert.equal(app.statsGesamtText(false, [{ label: "Filme" }], 1), "Filme · 1 Eintrag");
});

test("Top 10 meldet den Ersten samt Note", () => {
  assert.equal(app.statsTopTenText([]), "Noch keine Einträge");
  assert.equal(
    app.statsTopTenText([{ title: "Ein Film", score: 9.62 }, { title: "Zweiter", score: 9 }]),
    "Ein Film · 9.62"
  );
  // Ohne Note bleibt der Titel allein stehen — erfunden wird nichts.
  assert.equal(app.statsTopTenText([{ title: "Ohne Note" }]), "Ohne Note");
});

test("Bewertung pruefen meldet, wie viele Titel das Nachsehen lohnen", () => {
  assert.equal(app.statsPruefenText(1), "1 Titel zum Nachsehen");
  assert.equal(app.statsPruefenText(3), "3 Titel zum Nachsehen");
});

test("Die Zeit nennt die Stunden nicht zweimal", () => {
  /* 5317 Stunden sind 221 Tage und 13 Stunden. In der Kopfzeile
     standen beide Stundenzahlen: "5317 Stunden · 221 Tage 13
     Stunden". */
  const minuten = 5317 * 60;
  assert.equal(app.tageKurz(minuten), "221 Tage");
  assert.equal(
    app.statsZeitText({ moeglich: true, minuten }),
    "Gesehen 5317 Stunden · 221 Tage"
  );
});

test("Unter einem Tag bleibt es bei den Stunden", () => {
  assert.equal(app.tageKurz(10 * 60), null);
  assert.equal(app.statsZeitText({ moeglich: true, minuten: 10 * 60 }), "Gesehen 10 Stunden");
  assert.equal(app.tageKurz(25 * 60), "1 Tag");
});

test("Ohne Laufzeit steht dort, dass es keine gibt", () => {
  /* Eine fehlende Zeile machte die Kopfzeile niedriger als ihre
     Nachbarn — genau das soll nicht mehr vorkommen. */
  assert.equal(app.statsZeitText({ moeglich: false, minuten: 0 }), "Noch keine Laufzeiten bekannt");
  assert.equal(app.statsZeitText({ moeglich: true, minuten: 0 }), "Noch keine Laufzeiten bekannt");
});

/* ---------------------------------------------------------------- *
 * Die Regeln, die im Quelltext stehen
 * ---------------------------------------------------------------- */

test("Der Statistik-Tab faerbt nach seiner Auswahl und misst die Auswahlleiste", () => {
  /* Genau eine Kategorie: ihre Farbe. "Alle" und mehrere: das Gold,
     das die Auswahlleiste fuer "Alle" ohnehin traegt. */
  assert.match(
    QUELLE,
    /const akzent = !istAlle && aktive\.length === 1 \? accentFor\(aktive\[0\]\.key\) : "#C9A227";/
  );
  // Die Hoehe der klebenden Leiste wird gemessen, nicht geraten.
  assert.match(QUELLE, /messRef=\{auswahlRef\}/);
  assert.match(QUELLE, /klebtBei: auswahlHoehe/);
});

test("Aufklappen schliesst den vorigen Abschnitt — auf beiden Seiten", () => {
  // Statistik-Tab: der neue Stand kennt nur den einen Schluessel.
  assert.match(
    QUELLE,
    /const neu = nurEinerOffen\(alt\[key\] \? \{\} : \{ \[key\]: true \}\);/
  );
  // Einstellungen: derselbe Gedanke ohne Speicher.
  assert.match(
    QUELLE,
    /setPanelAbschnitte\(\(stand\) => \(stand\[key\] \? \{\} : \{ \[key\]: true \}\)\)/
  );
});
