/**
 * Tests fuer das eingegrenzte Teilnehmerfeld im Head-to-Head
 * (auswahlFeld, feldListe, ziehePaarung mit `ohneFenster` in
 * src/App.jsx).
 *
 * Wie in duell-sperrfrist.test.mjs wird die Datei im Original
 * geprueft und nicht als Kopie: uebersetzt, um eine Ausfuhrliste
 * ergaenzt, geladen. Gezogen wird mit einem gesaeten Zufallsgeber —
 * jeder Lauf ist damit derselbe.
 *
 * Die Zusagen:
 *
 *   1. Bei "Alle" ist die Ziehung Zug fuer Zug dieselbe wie vor der
 *      Auswahl — abgesichert durch einen Schnappschuss, der vom Stand
 *      davor stammt.
 *   2. Eine Auswahl liefert nur ihre Titel, auch nachdem sich deren
 *      Noten durch die eigenen Duelle verschoben haben.
 *   3. Innerhalb einer Auswahl gibt es kein Notenfenster mehr: auch
 *      weit auseinanderliegende Titel treten gegeneinander an.
 *   4. Sperrfrist und die Bevorzugung wenig gespielter Titel bleiben.
 *   5. Unter zwei Titeln gibt es kein Duell.
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

const GEPRUEFT = [
  "ziehePaarung",
  "paarungsSchluessel",
  "auswahlFeld",
  "feldListe",
  "duellKandidaten",
  "DUELL_AUSWAHL_ALLE",
  "DUELL_AUSWAHL_PLATZ",
  "DUELL_AUSWAHL_NOTE",
  "DUELL_VERLAUF",
  "MIN_DUELL_TEILNEHMER",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-auswahl-"));
  const datei = join(verzeichnis, "auswahl.mjs");
  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );
  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();

/* Derselbe gesaete Zufallsgeber (mulberry32) wie in den anderen
   Duell-Tests. */
function zufallMitSaat(saat) {
  let zustand = saat >>> 0;
  return function () {
    zustand = (zustand + 0x6D2B79F5) >>> 0;
    let t = zustand;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function eintrag(id, score, duels = 0) {
  return {
    id, title: "Titel " + id, category: "movie",
    score, personal: 8, duels, seasons: null,
  };
}

/* Acht Titel, Noten in 0,25er-Schritten und absteigend sortiert wie
   die Rangliste. Das Grundfenster (0,6) greift damit wirklich: id0
   und id7 liegen 1,75 auseinander und kaemen ohne Auswahl nie
   zusammen. */
function feldAcht() {
  return Array.from({ length: 8 }, (_, i) => eintrag("id" + i, 9 - i * 0.25));
}

/* Ein einzelner Zug, als IDs. */
function ziehe(liste, verlauf, zufall, gespielt, ohneFenster) {
  const paar = app.ziehePaarung(liste, verlauf, zufall, gespielt, ohneFenster);
  return paar ? [paar[0].id, paar[1].id] : null;
}

/**
 * Spielt eine Reihe von Zuegen durch — so, wie es der Bildschirm tut:
 * ziehen, in den Verlauf legen, als gespielt vermerken.
 */
function spiele(liste, zuege, zufall, ohneFenster = false) {
  const verlauf = [];
  const gespielt = [];
  const folge = [];
  for (let zug = 0; zug < zuege; zug++) {
    const paar = app.ziehePaarung(liste, verlauf, zufall, gespielt, ohneFenster);
    if (!paar) { folge.push(null); continue; }
    folge.push([paar[0].id, paar[1].id]);
    verlauf.push([paar[0].id, paar[1].id]);
    while (verlauf.length > app.DUELL_VERLAUF) verlauf.shift();
    const s = app.paarungsSchluessel(paar[0].id, paar[1].id);
    const i = gespielt.findIndex((p) => app.paarungsSchluessel(p.a, p.b) === s);
    if (i >= 0) gespielt.splice(i, 1);
    gespielt.push({ a: paar[0].id, b: paar[1].id, at: 1000 + zug });
  }
  return folge;
}

/* ---- 1. „Alle“ bleibt exakt, wie es war ---- */

/* Aufgezeichnet vom Stand VOR der Auswahl-Leiste: dasselbe Feld,
   dieselbe Saat, zwanzig Zuege. Weicht die Ziehung hier ab, hat die
   Auswahl etwas veraendert, was sie nicht anfassen darf. */
const SCHNAPPSCHUSS_ALLE = [
  ["id7", "id6"], ["id6", "id5"], ["id2", "id0"], ["id4", "id5"],
  ["id3", "id1"], ["id3", "id5"], ["id1", "id0"], ["id5", "id7"],
  ["id3", "id2"], ["id3", "id4"], ["id2", "id1"], ["id2", "id4"],
  ["id6", "id4"], ["id6", "id7"], ["id5", "id6"], ["id2", "id0"],
  ["id4", "id5"], ["id3", "id1"], ["id3", "id5"], ["id1", "id0"],
];

test("bei „Alle“ ist die Ziehung Zug fuer Zug dieselbe wie vorher", () => {
  const folge = spiele(feldAcht(), 20, zufallMitSaat(2024));
  assert.deepEqual(folge, SCHNAPPSCHUSS_ALLE);
});

test("„Alle“ heisst: gar nicht filtern — dieselbe Liste wie zuvor", () => {
  const liste = feldAcht();
  assert.equal(app.feldListe(liste, null), liste);
  assert.deepEqual(app.auswahlFeld(liste, { art: app.DUELL_AUSWAHL_ALLE }), liste);
  assert.deepEqual(app.auswahlFeld(liste, null), liste);
});

test("ohne Angabe zieht ziehePaarung mit Fenster — die Vorgabe ist „Alle“", () => {
  const liste = feldAcht();
  const mitVorgabe = spiele(liste, 12, zufallMitSaat(7));
  const ausdruecklich = spiele(liste, 12, zufallMitSaat(7), false);
  assert.deepEqual(mitVorgabe, ausdruecklich);
});

/* ---- 2. Das Feld wird einmal bestimmt ---- */

test("nach Platz: von–bis, beide Grenzen dabei", () => {
  const liste = feldAcht();
  const gewaehlt = app.auswahlFeld(liste, { art: app.DUELL_AUSWAHL_PLATZ, von: 3, bis: 7 });
  assert.deepEqual(gewaehlt.map((e) => e.id), ["id2", "id3", "id4", "id5", "id6"]);
});

test("nach Note: von–bis, mit einer Nachkommastelle", () => {
  const liste = feldAcht();
  /* Noten: 9,00 8,75 8,50 8,25 8,00 7,75 7,50 7,25 */
  const gewaehlt = app.auswahlFeld(liste, { art: app.DUELL_AUSWAHL_NOTE, von: 8.0, bis: 8.6 });
  assert.deepEqual(gewaehlt.map((e) => e.id), ["id2", "id3", "id4"]);
});

test("verdrehte Grenzen werden gerade gerueckt", () => {
  const liste = feldAcht();
  const platz = app.auswahlFeld(liste, { art: app.DUELL_AUSWAHL_PLATZ, von: 7, bis: 3 });
  assert.deepEqual(platz.map((e) => e.id), ["id2", "id3", "id4", "id5", "id6"]);
  const note = app.auswahlFeld(liste, { art: app.DUELL_AUSWAHL_NOTE, von: 8.6, bis: 8.0 });
  assert.deepEqual(note.map((e) => e.id), ["id2", "id3", "id4"]);
});

test("ein leeres Feld heisst „ohne Grenze auf dieser Seite“", () => {
  const liste = feldAcht();
  const abPlatz5 = app.auswahlFeld(liste, { art: app.DUELL_AUSWAHL_PLATZ, von: "5", bis: "" });
  assert.deepEqual(abPlatz5.map((e) => e.id), ["id4", "id5", "id6", "id7"]);
  const bisNote8 = app.auswahlFeld(liste, { art: app.DUELL_AUSWAHL_NOTE, von: "", bis: "8" });
  assert.deepEqual(bisNote8.map((e) => e.id), ["id4", "id5", "id6", "id7"]);
});

test("eine Auswahl mit 5 Titeln liefert nur diese 5 — auch nach verschobenen Noten", () => {
  const liste = feldAcht();
  const gewaehlt = app.auswahlFeld(liste, { art: app.DUELL_AUSWAHL_PLATZ, von: 3, bis: 7 });
  assert.equal(gewaehlt.length, 5);
  /* So haelt der Bildschirm das Feld fest: als Menge von IDs. */
  const feld = new Set(gewaehlt.map((e) => e.id));

  /* Die Duelle verschieben die Noten kraeftig — id2 faellt ans Ende
     der Rangliste, id7 und id0 schieben sich mitten hinein. Wuerde
     das Feld neu bestimmt, saehe es jetzt voellig anders aus. */
  const spaeter = [
    eintrag("id7", 9.4), eintrag("id0", 8.9), eintrag("id5", 8.4),
    eintrag("id1", 8.2), eintrag("id6", 8.1), eintrag("id3", 7.9),
    eintrag("id4", 7.1), eintrag("id2", 2.0),
  ];
  const jetzt = app.feldListe(spaeter, feld);
  assert.deepEqual(new Set(jetzt.map((e) => e.id)), feld);
  assert.equal(jetzt.length, 5);

  /* Und die Ziehung sieht auch nur diese fuenf. */
  const folge = spiele(jetzt, 30, zufallMitSaat(99), true);
  for (const paar of folge) {
    assert.ok(paar, "es kommt in jedem Zug ein Duell");
    assert.ok(feld.has(paar[0]) && feld.has(paar[1]), "nur Titel aus dem Feld: " + paar);
  }

  /* Neu bestimmt waere das Feld ein anderes — der Test waere sonst
     blind fuer den Fehler, den er verhindern soll. */
  const neuBestimmt = app.auswahlFeld(spaeter, { art: app.DUELL_AUSWAHL_PLATZ, von: 3, bis: 7 });
  assert.notDeepEqual(new Set(neuBestimmt.map((e) => e.id)), feld);
});

test("das festgehaltene Feld nimmt aktuelle Noten und Duellzahlen mit", () => {
  const feld = new Set(["a", "b"]);
  const jetzt = app.feldListe([eintrag("a", 4.2, 9), eintrag("c", 8), eintrag("b", 1.1, 3)], feld);
  assert.deepEqual(jetzt.map((e) => e.id), ["a", "b"]);
  assert.equal(jetzt[0].score, 4.2);
  assert.equal(jetzt[0].duels, 9);
});

/* ---- 3. Innerhalb der Auswahl kein Notenfenster ---- */

test("in einer Auswahl treten auch weit entfernte Noten gegeneinander an", () => {
  /* Drei Titel, jeder mehr als 1,5 vom naechsten entfernt: ohne
     Auswahl griffe hier erst die letzte Erweiterungsstufe. */
  const weit = [eintrag("hoch", 9.5), eintrag("mitte", 6.0), eintrag("tief", 2.0)];
  const folge = spiele(weit, 12, zufallMitSaat(5), true);
  const gesehen = new Set(folge.map((p) => app.paarungsSchluessel(p[0], p[1])));
  assert.deepEqual(
    gesehen,
    new Set([
      app.paarungsSchluessel("hoch", "mitte"),
      app.paarungsSchluessel("hoch", "tief"),
      app.paarungsSchluessel("mitte", "tief"),
    ]),
    "alle drei Paarungen kommen vor"
  );
});

test("duellKandidaten ohne Fenster gibt das ganze Feld her", () => {
  const liste = feldAcht();
  assert.deepEqual(app.duellKandidaten(liste, 0, true), [1, 2, 3, 4, 5, 6, 7]);
  /* Mit Fenster ist es deutlich weniger — sonst pruefte der Test
     nichts. */
  assert.ok(app.duellKandidaten(liste, 0, false).length < 7);
});

test("ein Titel tritt auch ohne Fenster nie gegen sich selbst an", () => {
  const doppelt = eintrag("a", 8);
  const liste = [doppelt, { ...doppelt }, eintrag("b", 2)];
  const folge = spiele(liste, 10, zufallMitSaat(3), true);
  for (const paar of folge) {
    assert.ok(paar);
    assert.notEqual(paar[0], paar[1]);
  }
});

/* ---- 4. Sperrfrist und wenig gespielte Titel ---- */

test("die Sperrfrist gilt auch in einer Auswahl", () => {
  /* Vier Titel, also sechs Paarungen. Die ersten sechs Zuege muessen
     sechs verschiedene sein — keine kommt wieder, solange es
     ungespielte gibt. */
  const vier = [eintrag("a", 9), eintrag("b", 6), eintrag("c", 4), eintrag("d", 1)];
  const folge = spiele(vier, 6, zufallMitSaat(11), true);
  const schluessel = folge.map((p) => app.paarungsSchluessel(p[0], p[1]));
  assert.equal(new Set(schluessel).size, 6);
});

test("wer wenige Duelle hinter sich hat, kommt auch in einer Auswahl bevorzugt", () => {
  /* Vier Titel im selben Feld, aber „viel“ hat schon 40 Duelle
     hinter sich. Als GEGNER wird er deshalb nie gezogen; als Anker
     kann ihn das Los trotzdem treffen — der Anker ist zufaellig und
     fragt nicht nach Duellzahlen. Gezaehlt wird also, wie oft er
     ueberhaupt vorkommt: seltener als jeder frische Titel. */
  const liste = [
    eintrag("a", 9, 0), eintrag("viel", 8.9, 40),
    eintrag("frisch1", 5, 0), eintrag("frisch2", 2, 0),
  ];
  const zufall = zufallMitSaat(4);
  const wieOft = { a: 0, viel: 0, frisch1: 0, frisch2: 0 };
  /* Jeder Zug fuer sich, ohne Verlauf und ohne gespielte Paarungen:
     so misst der Test die Bevorzugung und nicht die Sperrfrist. */
  for (let zug = 0; zug < 200; zug++) {
    const paar = ziehe(liste, [], zufall, [], true);
    assert.ok(paar);
    wieOft[paar[0]]++;
    wieOft[paar[1]]++;
  }
  assert.ok(wieOft.viel > 0, "als Anker kommt er vor");
  assert.ok(wieOft.viel < wieOft.frisch1, "seltener als frisch1: " + JSON.stringify(wieOft));
  assert.ok(wieOft.viel < wieOft.frisch2, "seltener als frisch2: " + JSON.stringify(wieOft));
  assert.ok(wieOft.viel < wieOft.a, "seltener als a: " + JSON.stringify(wieOft));
});

/* ---- 5. Zu kleines Feld ---- */

test("unter zwei Titeln gibt es kein Duell", () => {
  assert.equal(app.MIN_DUELL_TEILNEHMER, 2);
  assert.equal(app.ziehePaarung([eintrag("a", 8)], null, Math.random, null, true), null);
  assert.equal(app.ziehePaarung([], null, Math.random, null, true), null);
});

test("eine Auswahl kann leer ausgehen — dann gibt es nichts zu ziehen", () => {
  const liste = feldAcht();
  const leer = app.auswahlFeld(liste, { art: app.DUELL_AUSWAHL_NOTE, von: 1, bis: 2 });
  assert.deepEqual(leer, []);
  const einer = app.auswahlFeld(liste, { art: app.DUELL_AUSWAHL_PLATZ, von: 4, bis: 4 });
  assert.equal(einer.length, 1);
  assert.equal(app.ziehePaarung(einer, null, Math.random, null, true), null);
});
