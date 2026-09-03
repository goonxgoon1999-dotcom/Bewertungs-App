/**
 * Tests fuer die Anzeige- und Speicherlogik der Streaming-Verfuegbarkeit
 * in src/App.jsx.
 *
 * Uebersetzt wie in app-logik.test.mjs, gerendert wie in
 * watchlist-zeile.test.mjs. Es geht ausschliesslich um Funktionen ohne
 * Zustand und um den Bauplan der Chips — kein Browser, kein Netz.
 *
 * Die Zusagen:
 *
 *   1. Die Automatik erkennt DE und IT aus Spracheinstellung bzw.
 *      Zeitzone; alles Uebrige faellt auf Deutschland.
 *   2. Der Zwischenspeicher haelt je Eintrag UND Region einen eigenen
 *      Zeitstempel — ein Regionswechsel loescht die andere nicht.
 *   3. Neu geholt wird hoechstens einmal pro Woche.
 *   4. Solange nichts bekannt ist, bleibt die Stelle leer.
 *   5. Kein Abo-Anbieter -> ein einzelner Chip "nicht im Abo".
 *   6. Die Zeile zeigt hoechstens drei Chips, danach "+N".
 *   7. Spiele werden nicht abgefragt.
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
  "automatischeRegion",
  "regionAus",
  "streamingAnfrage",
  "streamingEinarbeiten",
  "streamingFrisch",
  "streamingStand",
  "anbieterFuer",
  "AnbieterZeile",
  "VerfuegbarKarte",
  "RegionEinstellung",
  "STREAMING_TTL_MS",
  "STREAMING_FASSUNG",
];

async function ladeBausteine() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-stream-"));
  const datei = join(verzeichnis, "streaming.mjs");

  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeBausteine();

/* ---------------------------------------------------------------- *
 * Die Automatik
 * ---------------------------------------------------------------- */

/** Setzt navigator und Zeitzone fuer die Dauer eines Aufrufs. */
function mitUmgebung({ sprachen = [], zone = "UTC" }, arbeit) {
  const alterNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const echtesFormat = Intl.DateTimeFormat;

  Object.defineProperty(globalThis, "navigator", {
    value: { languages: sprachen, language: sprachen[0] || "" },
    configurable: true,
    writable: true,
  });
  Intl.DateTimeFormat = function () {
    return { resolvedOptions: () => ({ timeZone: zone }) };
  };

  try {
    return arbeit();
  } finally {
    Intl.DateTimeFormat = echtesFormat;
    if (alterNavigator) Object.defineProperty(globalThis, "navigator", alterNavigator);
    else delete globalThis.navigator;
  }
}

test("Die Spracheinstellung mit Landeskennung entscheidet zuerst", () => {
  assert.equal(mitUmgebung({ sprachen: ["de-DE", "en-US"] }, app.automatischeRegion), "DE");
  assert.equal(mitUmgebung({ sprachen: ["it-IT"] }, app.automatischeRegion), "IT");
});

test("Eine Landeskennung, die die App nicht kennt, wird uebergangen", () => {
  // de-CH ist weder DE noch IT — die naechste Sprache kommt dran.
  assert.equal(mitUmgebung({ sprachen: ["de-CH", "it-IT"] }, app.automatischeRegion), "IT");
});

test("Ohne Landeskennung entscheidet die Zeitzone", () => {
  assert.equal(
    mitUmgebung({ sprachen: ["en"], zone: "Europe/Rome" }, app.automatischeRegion),
    "IT"
  );
  assert.equal(
    mitUmgebung({ sprachen: ["en"], zone: "Europe/Berlin" }, app.automatischeRegion),
    "DE"
  );
});

test("Zuletzt zaehlt die reine Sprache", () => {
  assert.equal(mitUmgebung({ sprachen: ["it"], zone: "UTC" }, app.automatischeRegion), "IT");
});

test("Wird weder DE noch IT erkannt, gilt Deutschland", () => {
  assert.equal(
    mitUmgebung({ sprachen: ["en-US", "fr-FR"], zone: "America/New_York" }, app.automatischeRegion),
    "DE"
  );
  assert.equal(mitUmgebung({ sprachen: [], zone: "UTC" }, app.automatischeRegion), "DE");
});

test("Eine feste Einstellung uebergeht die Automatik", () => {
  assert.equal(mitUmgebung({ sprachen: ["de-DE"] }, () => app.regionAus("IT")), "IT");
  assert.equal(mitUmgebung({ sprachen: ["it-IT"] }, () => app.regionAus("DE")), "DE");
  assert.equal(mitUmgebung({ sprachen: ["it-IT"] }, () => app.regionAus("auto")), "IT");
});

/* ---------------------------------------------------------------- *
 * Der Zwischenspeicher
 * ---------------------------------------------------------------- */

const WOCHE = 7 * 24 * 60 * 60 * 1000;

const NETFLIX = { id: "8", name: "Netflix", logo: "https://x/n.jpg" };
const WOW = { id: "30", name: "WOW", logo: null };
const PRIME = { id: "119", name: "Amazon Prime Video", logo: null };
const DISNEY = { id: "337", name: "Disney Plus", logo: null };
const PARAMOUNT = { id: "531", name: "Paramount Plus", logo: null };

test("Eine Antwort wandert je Region getrennt in den Speicher", () => {
  const stand = app.streamingEinarbeiten(null, "DE", {
    m1: { gefunden: true, quellArt: "movie", quellId: "27205", anbieter: [NETFLIX] },
  });
  assert.equal(stand.fassung, app.STREAMING_FASSUNG);
  assert.deepEqual(stand.stand.m1.regionen.DE.anbieter, [NETFLIX]);
  assert.equal(stand.stand.m1.quellId, "27205");
  assert.equal(stand.stand.m1.regionen.IT, undefined);
});

test("Ein Regionswechsel laesst die Werte der anderen Region stehen", () => {
  const mitDe = app.streamingEinarbeiten(null, "DE", {
    m1: { gefunden: true, quellArt: "movie", quellId: "27205", anbieter: [NETFLIX] },
  });
  const mitBeiden = app.streamingEinarbeiten(mitDe, "IT", {
    m1: { gefunden: true, quellArt: "movie", quellId: "27205", anbieter: [PRIME] },
  });

  assert.deepEqual(mitBeiden.stand.m1.regionen.DE.anbieter, [NETFLIX], "DE darf nicht verloren gehen");
  assert.deepEqual(mitBeiden.stand.m1.regionen.IT.anbieter, [PRIME]);
});

test("Ein Eintrag, der nicht in der Antwort steht, bleibt unangetastet", () => {
  const alt = app.streamingEinarbeiten(null, "DE", {
    m1: { gefunden: true, quellId: "1", anbieter: [NETFLIX] },
    m2: { gefunden: true, quellId: "2", anbieter: [WOW] },
  });
  const neu = app.streamingEinarbeiten(alt, "DE", {
    m1: { gefunden: true, quellId: "1", anbieter: [] },
  });
  assert.deepEqual(neu.stand.m2.regionen.DE.anbieter, [WOW]);
  assert.deepEqual(neu.stand.m1.regionen.DE.anbieter, []);
});

test("Ein Titel, den TMDB nicht kennt, gilt als 'nicht im Abo'", () => {
  const stand = app.streamingEinarbeiten(null, "DE", {
    m1: { gefunden: false, anbieter: [] },
  });
  assert.deepEqual(app.anbieterFuer(stand, "m1", "DE"), []);
});

test("Ein gescheiterter Abruf gilt als 'noch nichts bekannt'", () => {
  const stand = app.streamingEinarbeiten(null, "DE", {
    m1: { gefunden: false, quellArt: "movie", quellId: "27205", anbieter: [] },
  });
  assert.equal(app.anbieterFuer(stand, "m1", "DE"), null, "kein Ergebnis heisst leere Stelle");
});

test("Ein Ergebnis haelt eine Woche, ein Fehlschlag nur einen Tag", () => {
  const jetzt = Date.now();
  assert.equal(app.streamingFrisch({ zeit: jetzt, anbieter: [NETFLIX] }), true);
  assert.equal(app.streamingFrisch({ zeit: jetzt - (WOCHE - 60000), anbieter: [NETFLIX] }), true);
  assert.equal(app.streamingFrisch({ zeit: jetzt - (WOCHE + 60000), anbieter: [NETFLIX] }), false);

  // Fehlschlag: anbieter ist null.
  assert.equal(app.streamingFrisch({ zeit: jetzt - 2 * 60 * 60 * 1000, anbieter: null }), true);
  assert.equal(app.streamingFrisch({ zeit: jetzt - 25 * 60 * 60 * 1000, anbieter: null }), false);
  assert.equal(app.streamingFrisch(null), false);
});

/* ---------------------------------------------------------------- *
 * Was abgefragt wird
 * ---------------------------------------------------------------- */

const SAMMLUNG = {
  movie: [{ id: "m1", title: "Inception" }],
  series: [{ id: "s1", title: "Dark" }],
  anime: [{ id: "a1", title: "Attack on Titan" }],
  game: [{ id: "g1", title: "Portal" }],
  kids: [],
  adultanim: [],
  doku: [],
  comedy: [],
};

test("Spiele werden nicht abgefragt", () => {
  const anfrage = app.streamingAnfrage(SAMMLUNG, null, "DE");
  assert.ok(!anfrage.some((e) => e.category === "game"), "Spiele gehoeren nicht dazu");
  assert.deepEqual(anfrage.map((e) => e.id).sort(), ["a1", "m1", "s1"]);
});

test("Ausgeblendete Kategorien bleiben aussen vor", () => {
  const anfrage = app.streamingAnfrage(SAMMLUNG, null, "DE", ["movie"]);
  assert.deepEqual(anfrage.map((e) => e.id), ["m1"]);
});

test("Was frisch ist, wird nicht erneut geholt", () => {
  const stand = app.streamingEinarbeiten(null, "DE", {
    m1: { gefunden: true, quellArt: "movie", quellId: "27205", anbieter: [NETFLIX] },
  });
  const anfrage = app.streamingAnfrage(SAMMLUNG, stand, "DE");
  assert.ok(!anfrage.some((e) => e.id === "m1"), "m1 ist frisch und muss draussen bleiben");
});

test("Fuer die andere Region wird trotzdem geholt — mit der bekannten Kennung", () => {
  const stand = app.streamingEinarbeiten(null, "DE", {
    m1: { gefunden: true, quellArt: "movie", quellId: "27205", anbieter: [NETFLIX] },
  });
  const anfrage = app.streamingAnfrage(SAMMLUNG, stand, "IT");
  const m1 = anfrage.find((e) => e.id === "m1");
  assert.ok(m1, "fuer IT liegt noch nichts vor");
  assert.equal(m1.quellArt, "movie");
  assert.equal(m1.quellId, "27205", "die Kennung spart die Suche");
});

test("Ein abgelaufener Stand wird wieder abgefragt", () => {
  const stand = app.streamingEinarbeiten(null, "DE", {
    m1: { gefunden: true, quellId: "27205", anbieter: [NETFLIX] },
  });
  stand.stand.m1.regionen.DE.zeit = Date.now() - (WOCHE + 60000);
  const anfrage = app.streamingAnfrage(SAMMLUNG, stand, "DE");
  assert.ok(anfrage.some((e) => e.id === "m1"));
});

/* ---------------------------------------------------------------- *
 * Die Anzeige
 * ---------------------------------------------------------------- */

const zeile = (anbieter) => renderToStaticMarkup(createElement(app.AnbieterZeile, { anbieter }));
const karte = (anbieter, region = "DE") =>
  renderToStaticMarkup(createElement(app.VerfuegbarKarte, { anbieter, region }));

test("Solange nichts bekannt ist, bleibt die Stelle leer", () => {
  assert.equal(zeile(null), "");
  assert.equal(karte(null), "");
});

test("Kein Abo-Anbieter: ein einzelner gedaempfter Chip", () => {
  const html = zeile([]);
  assert.match(html, /nicht im Abo/);
  assert.equal((html.match(/nicht im Abo/g) || []).length, 1);
  assert.match(karte([]), /nicht im Abo/);
});

test("Die Zeile zeigt hoechstens drei Chips, danach +N", () => {
  const html = zeile([NETFLIX, WOW, PRIME, DISNEY, PARAMOUNT]);
  assert.match(html, /Netflix/);
  assert.match(html, /WOW/);
  assert.match(html, /Amazon Prime Video/);
  assert.ok(!html.includes(">Disney Plus<"), "der vierte Anbieter gehoert nicht mehr in die Zeile");
  assert.match(html, /\+2/);
});

test("Genau drei Anbieter kommen ohne +N aus", () => {
  const html = zeile([NETFLIX, WOW, PRIME]);
  assert.ok(!/\+\d/.test(html), "hier gibt es nichts zu ergaenzen");
});

test("Die Karte traegt Beschriftung und Regionskuerzel", () => {
  const html = karte([NETFLIX], "IT");
  assert.match(html, /JETZT VERFÜGBAR/);
  assert.match(html, />IT</);
  assert.match(html, /Netflix/);
  assert.match(html, /JetBrains Mono/);
});

test("Die Karte zeigt alle Anbieter — sie ist nicht auf drei begrenzt", () => {
  const html = karte([NETFLIX, WOW, PRIME, DISNEY, PARAMOUNT]);
  for (const a of [NETFLIX, WOW, PRIME, DISNEY, PARAMOUNT]) assert.match(html, new RegExp(a.name));
  assert.ok(!/\+\d/.test(html));
});

test("Ein Anbieter ohne Logo zeigt nur den Namen", () => {
  const html = zeile([WOW]);
  assert.match(html, /WOW/);
  assert.ok(!html.includes("<img"), "ohne Logo gibt es kein Bild");
});

/* ---------------------------------------------------------------- *
 * Die Einstellung
 * ---------------------------------------------------------------- */

test("Die Einstellung bietet genau drei Moeglichkeiten", () => {
  const html = renderToStaticMarkup(
    createElement(app.RegionEinstellung, { wahl: "auto", erkannt: "DE", onAendern() {} })
  );
  assert.match(html, /Automatisch/);
  assert.match(html, /Deutschland/);
  assert.match(html, /Italien/);
  // Die Vorgabe ist "Automatisch" — sie ist als gewaehlt markiert.
  const teil = html.slice(0, html.indexOf("Automatisch"));
  assert.match(teil, /aria-pressed="true"/);
});

test("Die Einstellung nennt die erkannte Region", () => {
  const html = renderToStaticMarkup(
    createElement(app.RegionEinstellung, { wahl: "auto", erkannt: "IT", onAendern() {} })
  );
  assert.match(html, /erkannt: IT/);
});
