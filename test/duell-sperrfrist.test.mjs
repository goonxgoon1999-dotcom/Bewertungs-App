/**
 * Tests fuer die Sperrfrist der Head-to-Head-Paarungen in src/App.jsx
 * (ziehePaarung, gespielteZeiten).
 *
 * Wie in minispiele-paarungen.test.mjs wird die Datei im Original
 * geprueft und nicht als Kopie: uebersetzt, um eine Ausfuhrliste
 * ergaenzt, geladen. Gezogen wird mit einem gesaeten Zufallsgeber —
 * jeder Lauf ist damit derselbe.
 *
 * Die Zusagen:
 *
 *   1. Ohne gespielte Paarungen aendert sich gar nichts: dieselbe
 *      Ziehung wie vor der Sperrfrist.
 *   2. Eine gespielte Paarung kommt nicht wieder, solange es im
 *      Fenster ungespielte gibt.
 *   3. Sind alle gespielt, kommt die aelteste zuerst — und es kommt
 *      ueberhaupt eine. Ein Zustand ohne Duell darf nie entstehen.
 *   4. A-gegen-B und B-gegen-A sind dieselbe Paarung.
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
  "gespielteZeiten",
  "DUELL_VERLAUF",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-sperre-"));
  const datei = join(verzeichnis, "sperre.mjs");
  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );
  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();

/* Ein Feld bewerteter Titel, absteigend nach Endnote. Die Noten
   liegen dicht beieinander: bei bis zu sieben Titeln steht damit
   jeder im Notenfenster (0,6) jedes anderen, und die Sperrfrist ist
   das Einzige, was die Auswahl einschraenkt. */
function feld(anzahl) {
  return Array.from({ length: anzahl }, (_, i) => ({
    id: "id" + i,
    title: "Titel " + i,
    category: "movie",
    score: 10 - i * 0.1,
    personal: 8,
    seasons: null,
  }));
}

const schluessel = (paar) => app.paarungsSchluessel(paar[0].id, paar[1].id);

/* Ein kleiner gesaeter Zufallsgeber (mulberry32) — derselbe wie in
   minispiele-paarungen.test.mjs. */
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

/* ---------------------------------------------------------------- *
 * 1. Ohne gespielte Paarungen bleibt alles beim Alten
 * ---------------------------------------------------------------- */

test("Ohne gespielte Paarungen zieht es genau wie vorher", () => {
  const liste = feld(8);

  /* Dreimal dieselbe Saat, dreimal dieselbe Ziehung: einmal ohne das
     neue Argument (der Aufruf von vor der Sperrfrist), einmal mit
     einer leeren Liste, einmal mit null. Weicht eine davon ab, greift
     die Sperrfrist, wo es nichts zu sperren gibt. */
  const ohne = [];
  const leer = [];
  const nichts = [];
  const a = zufallMitSaat(11);
  const b = zufallMitSaat(11);
  const c = zufallMitSaat(11);
  for (let i = 0; i < 60; i++) {
    ohne.push(schluessel(app.ziehePaarung(liste, null, a)));
    leer.push(schluessel(app.ziehePaarung(liste, null, b, [])));
    nichts.push(schluessel(app.ziehePaarung(liste, null, c, null)));
  }
  assert.deepEqual(leer, ohne, "eine leere Liste veraendert die Ziehung");
  assert.deepEqual(nichts, ohne, "null veraendert die Ziehung");
});

/* ---------------------------------------------------------------- *
 * 2. Gespieltes bleibt draussen, solange es Ungespieltes gibt
 * ---------------------------------------------------------------- */

test("Eine gespielte Paarung kommt nicht wieder, solange es ungespielte gibt", () => {
  const liste = feld(6);
  const gespielt = [{ a: "id0", b: "id1", at: 1000 }];
  const gesperrt = app.paarungsSchluessel("id0", "id1");

  const zufall = zufallMitSaat(7);
  for (let i = 0; i < 400; i++) {
    const paar = app.ziehePaarung(liste, null, zufall, gespielt);
    assert.ok(paar, "es kam gar kein Duell");
    assert.notEqual(schluessel(paar), gesperrt, "die gespielte Paarung kam im Zug " + i);
  }
});

test("A-gegen-B und B-gegen-A sind dieselbe Paarung", () => {
  const liste = feld(6);
  // Verkehrt herum abgelegt — die Sperre muss trotzdem greifen.
  const gespielt = [{ a: "id1", b: "id0", at: 1000 }];
  const gesperrt = app.paarungsSchluessel("id0", "id1");

  const zufall = zufallMitSaat(23);
  for (let i = 0; i < 400; i++) {
    const paar = app.ziehePaarung(liste, null, zufall, gespielt);
    assert.notEqual(schluessel(paar), gesperrt, "die Sperre greift nur in eine Richtung");
  }

  // Und dasselbe eine Ebene tiefer, an der Karte selbst.
  const zeiten = app.gespielteZeiten([{ a: "id1", b: "id0", at: 5 }]);
  assert.ok(zeiten.has(app.paarungsSchluessel("id0", "id1")));
  assert.equal(zeiten.size, 1);

  // Zweimal dieselbe Paarung, verschieden herum: ein Eintrag, der
  // juengere Zeitpunkt.
  const doppelt = app.gespielteZeiten([
    { a: "id0", b: "id1", at: 5 },
    { a: "id1", b: "id0", at: 9 },
  ]);
  assert.equal(doppelt.size, 1);
  assert.equal(doppelt.get(app.paarungsSchluessel("id0", "id1")), 9);
});

/* ---------------------------------------------------------------- *
 * 3. Ist alles gespielt, kommt die aelteste zuerst
 * ---------------------------------------------------------------- */

test("Sind alle Paarungen gespielt, kommt die aelteste zuerst wieder", () => {
  const liste = feld(3);
  /* Alle drei moeglichen Paarungen gespielt — die aelteste zuerst
     hingeschrieben, damit die Reihenfolge in der Liste nicht schon
     die Antwort ist. */
  const gespielt = [
    { a: "id1", b: "id2", at: 300 },
    { a: "id0", b: "id1", at: 100 },
    { a: "id0", b: "id2", at: 200 },
  ];
  const aelteste = app.paarungsSchluessel("id0", "id1");

  const zufall = zufallMitSaat(3);
  for (let i = 0; i < 50; i++) {
    const paar = app.ziehePaarung(liste, null, zufall, gespielt);
    assert.ok(paar, "das Minispiel blockiert, statt weiterzulaufen");
    assert.equal(schluessel(paar), aelteste, "es kommt nicht die aelteste Paarung");
  }
});

test("Eine kleine Kategorie spielt alle Paarungen durch und faengt von vorn an", () => {
  const liste = feld(3);
  const zufall = zufallMitSaat(99);

  /* Gespielt wird wie im Minispiel: gezogen, gemerkt (Verlauf), die
     Paarung festgehalten (Sperrfrist), und weiter. */
  let gespielt = [];
  let verlauf = [];
  const gezogen = [];
  for (let zug = 0; zug < 6; zug++) {
    const paar = app.ziehePaarung(liste, verlauf, zufall, gespielt);
    assert.ok(paar, "im Zug " + zug + " kam gar kein Duell");
    const s = schluessel(paar);
    gezogen.push(s);
    verlauf = [...verlauf, [paar[0].id, paar[1].id]].slice(-app.DUELL_VERLAUF);
    gespielt = [
      ...gespielt.filter((p) => app.paarungsSchluessel(p.a, p.b) !== s),
      { a: paar[0].id, b: paar[1].id, at: 1000 + zug },
    ];
  }

  // Die ersten drei Zuege sind die drei moeglichen Paarungen, jede genau einmal.
  assert.equal(new Set(gezogen.slice(0, 3)).size, 3, "eine Paarung kam doppelt: " + gezogen.join(", "));
  // Danach beginnt es von vorn: der vierte Zug ist wieder der erste.
  assert.equal(gezogen[3], gezogen[0], "nach der Runde kommt nicht die aelteste Paarung");
  assert.equal(gezogen[4], gezogen[1]);
  assert.equal(gezogen[5], gezogen[2]);
});

test("Auch mit genau zwei Titeln kommt immer ein Duell", () => {
  const liste = feld(2);
  const zufall = zufallMitSaat(5);
  let gespielt = [];
  for (let zug = 0; zug < 10; zug++) {
    const paar = app.ziehePaarung(liste, null, zufall, gespielt);
    assert.ok(paar, "bei zwei Titeln blockiert das Minispiel im Zug " + zug);
    assert.equal(schluessel(paar), app.paarungsSchluessel("id0", "id1"));
    gespielt = [{ a: paar[0].id, b: paar[1].id, at: 1000 + zug }];
  }
});

test("Unvollstaendige Eintraege stoeren die Paarungssuche nicht", () => {
  const liste = feld(4);
  const gespielt = [null, {}, { a: "id0" }, { b: "id1" }, { a: "id0", b: "id1" }];
  const zeiten = app.gespielteZeiten(gespielt);
  assert.equal(zeiten.size, 1, "unvollstaendige Eintraege landen in der Karte");
  // Ohne `at` gilt 0 — der Eintrag zaehlt trotzdem als gespielt.
  assert.equal(zeiten.get(app.paarungsSchluessel("id0", "id1")), 0);

  const zufall = zufallMitSaat(13);
  for (let i = 0; i < 100; i++) {
    assert.ok(app.ziehePaarung(liste, null, zufall, gespielt));
  }
});

/* ---------------------------------------------------------------- *
 * Turnier und Head-to-Head teilen sich dieselbe Auswertung
 * ---------------------------------------------------------------- */

test("Turnier-Matches laufen durch dieselbe Auswertung wie das Head-to-Head", async () => {
  /* Warum eine Quelltextpruefung: dass ein Turnier-Match die Paarung
     sperrt, haengt allein daran, dass beide Spiele denselben
     onDuell-Weg nehmen — und der schreibt sie auf dem Server
     (siehe test/duell-endpunkte.test.mjs). Gaebe es fuer das Turnier
     einen zweiten Weg, faellt es hier auf. */
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  const bereich = quelle.slice(
    quelle.indexOf("function MinispielePage"),
    quelle.indexOf("function DuellKarte")
  );
  assert.ok(bereich.length > 0, "MinispielePage ist nicht mehr zu finden");

  const anHeadToHead = bereich.slice(bereich.indexOf("<HeadToHead"));
  const anTurnier = bereich.slice(bereich.indexOf("<Turnier"));
  assert.match(anHeadToHead.slice(0, anHeadToHead.indexOf("/>")), /onDuell=\{onDuell\}/);
  assert.match(anTurnier.slice(0, anTurnier.indexOf("/>")), /onDuell=\{onDuell\}/);

  // Und im Turnier gibt es keinen eigenen Aufruf an /api/duels.
  const turnier = quelle.slice(
    quelle.indexOf("function Turnier("),
    quelle.indexOf("function zieheAnderen")
  );
  assert.ok(turnier.length > 0, "die Turnier-Komponente ist nicht mehr zu finden");
  assert.ok(!/api\.duell\b/.test(turnier), "das Turnier meldet Duelle an api.duell vorbei");
});
