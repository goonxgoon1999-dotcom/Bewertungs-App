/**
 * Tests fuer die Auslosung der Minispiele in src/App.jsx —
 * Head-to-Head (ziehePaarung) und Turnier (zieheTurnierFeld), dazu das
 * gemeinsame Teilnehmerfeld (duellTeilnehmer).
 *
 * Wie in app-logik.test.mjs wird die Datei im Original geprueft und
 * nicht als Kopie: uebersetzt, um eine Ausfuhrliste ergaenzt, geladen.
 *
 * Es geht um Dubletten, und zwar um drei Arten:
 *
 *   1. Ein Titel gegen sich selbst. Darf nie vorkommen — auch dann
 *      nicht, wenn derselbe Eintrag zweimal in der Liste steht.
 *   2. Dieselbe Paarung gleich wieder. Die unmittelbare Wiederholung
 *      war schon gesperrt; neu ist, dass eine Begegnung ein paar Zuege
 *      lang draussen bleibt.
 *   3. Derselbe Titel zweimal im Turnierbaum.
 *
 * Gezogen wird mit einem gesaeten Zufallsgeber statt mit Math.random:
 * die Ziehung nimmt ihn ohnehin als Parameter entgegen, und so ist
 * jeder Lauf derselbe. Ein Rueckfall in das alte Verhalten faellt
 * damit reproduzierbar auf und nicht nur mit einer gewissen
 * Wahrscheinlichkeit — die Wiederholungsrate lag vorher bei mehreren
 * Prozent, gemessen ueber dieselben Ziehungen.
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
  "zieheTurnierFeld",
  "baueTurnierbaum",
  "duellTeilnehmer",
  "paarungsSchluessel",
  "DUELL_VERLAUF",
  "DUELL_FENSTER",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-"));
  const datei = join(verzeichnis, "minispiele.mjs");
  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );
  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();

/* Ein Feld bewerteter Titel, absteigend nach Endnote — so, wie die
   Rangliste es liefert. */
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

/* Ein kleiner gesaeter Zufallsgeber (mulberry32). Er macht jeden Lauf
   wiederholbar — ohne ihn haenge das Ergebnis am Zufall des Tages. */
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

/* Die Saaten, mit denen jeder Verteilungstest laeuft. Mehrere, damit
   nicht ein einzelner guenstiger Pfad das Ergebnis traegt. */
const SAATEN = [1, 7, 42, 1337, 20250818];

/* Spielt `zuege` Duelle so, wie das Spiel es tut: der Verlauf wandert
   mit und wird auf DUELL_VERLAUF gekuerzt. */
function spiele(liste, zuege, saat = 1) {
  const zufall = zufallMitSaat(saat);
  const gezogen = [];
  let verlauf = [];
  for (let i = 0; i < zuege; i++) {
    const paar = app.ziehePaarung(liste, verlauf, zufall);
    if (!paar) break;
    gezogen.push(paar);
    verlauf = [...verlauf, [paar[0].id, paar[1].id]].slice(-app.DUELL_VERLAUF);
  }
  return gezogen;
}

/* ---------------------------------------------------------------- *
 * Head-to-Head: niemand tritt gegen sich selbst an
 * ---------------------------------------------------------------- */

test("Kein Titel tritt gegen sich selbst an", () => {
  for (const saat of SAATEN) {
    for (const anzahl of [2, 3, 5, 12, 40]) {
      for (const paar of spiele(feld(anzahl), 2000, saat)) {
        assert.notEqual(paar[0].id, paar[1].id, "Selbstduell bei " + anzahl + " Titeln");
      }
    }
  }
});

test("Auch eine Liste mit doppeltem Eintrag ergibt kein Selbstduell", () => {
  /* Sollte derselbe Eintrag je zweimal in der Rangliste stehen, sind
     die Indizes verschieden, die IDs aber gleich — geprueft werden
     deshalb die IDs. */
  const liste = feld(8);
  liste[5] = { ...liste[1] };
  for (const saat of SAATEN) {
    for (const paar of spiele(liste, 5000, saat)) {
      assert.notEqual(paar[0].id, paar[1].id);
    }
  }
});

test("Bei genau zwei Titeln kommt das einzig moegliche Paar", () => {
  const liste = feld(2);
  const paare = spiele(liste, 50);
  assert.equal(paare.length, 50);
  for (const paar of paare) {
    assert.deepEqual([paar[0].id, paar[1].id].sort(), ["id0", "id1"]);
  }
});

test("Unter zwei Titeln gibt es keine Paarung", () => {
  assert.equal(app.ziehePaarung(feld(1), null), null);
  assert.equal(app.ziehePaarung([], null), null);
  assert.equal(app.ziehePaarung(null, null), null);
});

/* ---------------------------------------------------------------- *
 * Head-to-Head: dieselbe Paarung nicht gleich wieder
 * ---------------------------------------------------------------- */

test("Dieselbe Paarung kommt nicht unmittelbar hintereinander", () => {
  for (const saat of SAATEN) {
    for (const anzahl of [3, 4, 5, 8, 12, 20, 40]) {
      const paare = spiele(feld(anzahl), 3000, saat);
      for (let i = 1; i < paare.length; i++) {
        assert.notEqual(
          schluessel(paare[i]), schluessel(paare[i - 1]),
          "direkte Wiederholung bei " + anzahl + " Titeln"
        );
      }
    }
  }
});

test("Dieselbe Paarung bleibt fuer mehrere Zuege draussen", () => {
  /* Der Kern der Aenderung: vorher war nur die unmittelbar vorige
     Paarung gesperrt, eine Begegnung konnte also nach einem einzigen
     Zwischenzug wiederkommen. Ab vier Titeln gibt es genug
     verschiedene Paarungen, dass DUELL_VERLAUF vollstaendig greift. */
  for (const saat of SAATEN) {
    for (const anzahl of [4, 5, 8, 12, 20, 40]) {
      const paare = spiele(feld(anzahl), 3000, saat).map(schluessel);
      for (let i = 0; i < paare.length; i++) {
        const fenster = paare.slice(Math.max(0, i - app.DUELL_VERLAUF), i);
        assert.equal(
          fenster.includes(paare[i]), false,
          "Wiederholung im Verlaufsfenster bei " + anzahl + " Titeln, Saat " + saat
        );
      }
    }
  }
});

test("Drei Titel: die direkte Wiederholung bleibt gesperrt, mehr geht nicht", () => {
  /* Bei drei Titeln gibt es genau drei moegliche Paarungen. Ein
     Verlauf von drei sperrt damit alles — dann greift der Ausweg, und
     der schliesst wenigstens die unmittelbar vorige Paarung aus. Diese
     Zusicherung darf nicht verlorengehen. */
  for (const saat of SAATEN) {
    const paare = spiele(feld(3), 2000, saat).map(schluessel);
    for (let i = 1; i < paare.length; i++) {
      assert.notEqual(paare[i], paare[i - 1]);
    }
    assert.equal(new Set(paare).size, 3, "alle drei Paarungen kommen vor");
  }
});

test("Der Gegner bleibt im Fenster von fuenf Plaetzen", () => {
  /* Die Grundlogik des Matchmakings bleibt unberuehrt: gezogen wird
     weiter aus dem Rangfenster um den Anker. */
  const liste = feld(40);
  const platz = new Map(liste.map((f, i) => [f.id, i]));
  for (const saat of SAATEN) {
    for (const paar of spiele(liste, 3000, saat)) {
      const abstand = Math.abs(platz.get(paar[0].id) - platz.get(paar[1].id));
      assert.ok(abstand >= 1 && abstand <= app.DUELL_FENSTER, "Abstand " + abstand);
    }
  }
});

test("Beide Seiten kommen links vor", () => {
  /* Die Seitenwahl wird weiterhin gelost — sonst saesse der Anker
     immer links. */
  const liste = feld(12);
  const platz = new Map(liste.map((f, i) => [f.id, i]));
  const paare = spiele(liste, 500);
  assert.ok(paare.some((p) => platz.get(p[0].id) < platz.get(p[1].id)));
  assert.ok(paare.some((p) => platz.get(p[0].id) > platz.get(p[1].id)));
});

/* ---------------------------------------------------------------- *
 * Das gemeinsame Teilnehmerfeld
 * ---------------------------------------------------------------- */

test("duellTeilnehmer laesst jeden Eintrag nur einmal antreten", () => {
  const liste = feld(8);
  liste[5] = { ...liste[1] };
  const teilnehmer = app.duellTeilnehmer({ movie: liste });
  assert.equal(teilnehmer.movie.length, 7);
  assert.equal(new Set(teilnehmer.movie.map((f) => f.id)).size, 7);
});

test("duellTeilnehmer haelt die Reihenfolge der Rangliste", () => {
  const liste = feld(6);
  const teilnehmer = app.duellTeilnehmer({ movie: liste });
  assert.deepEqual(teilnehmer.movie.map((f) => f.id), liste.map((f) => f.id));
});

test("Ohne Note oder ohne Bauchgefuehl wird nicht gespielt", () => {
  const liste = feld(4);
  liste[1] = { ...liste[1], score: null };
  liste[2] = { ...liste[2], personal: null };
  const teilnehmer = app.duellTeilnehmer({ movie: liste });
  assert.deepEqual(teilnehmer.movie.map((f) => f.id), ["id0", "id3"]);
});

/* ---------------------------------------------------------------- *
 * Turnier: jeder Titel genau einmal im Baum
 * ---------------------------------------------------------------- */

test("Im Turnierfeld steht jeder Titel nur einmal", () => {
  for (const [vorrat, groesse] of [[4, 4], [8, 8], [16, 16], [20, 16], [40, 8]]) {
    for (let i = 0; i < 500; i++) {
      const gezogen = app.zieheTurnierFeld(feld(vorrat), groesse);
      assert.equal(gezogen.length, groesse);
      assert.equal(
        new Set(gezogen.map((f) => f.id)).size, groesse,
        "Dublette bei " + vorrat + " Titeln, Groesse " + groesse
      );
    }
  }
});

test("Ein doppelter Eintrag kommt gar nicht erst ins Feld", () => {
  /* Gezogen wird aus duellTeilnehmer — dort sitzt die Sperre, damit
     die Zahl bei der Kategorie und das gezogene Feld dasselbe meinen. */
  const liste = feld(9);
  liste[5] = { ...liste[1] };
  const teilnehmer = app.duellTeilnehmer({ movie: liste });
  for (let i = 0; i < 500; i++) {
    const gezogen = app.zieheTurnierFeld(teilnehmer.movie, 8);
    assert.equal(new Set(gezogen.map((f) => f.id)).size, 8);
  }
});

test("Reicht das Feld nach der Sperre nicht, kommt kein Turnier zustande", () => {
  /* Acht Eintraege, aber nur sieben verschiedene: ein Achterturnier
     laesst sich daraus nicht ziehen. Die Groessenauswahl rechnet mit
     derselben Liste, der Knopf ist dort also gar nicht erst waehlbar. */
  const liste = feld(8);
  liste[5] = { ...liste[1] };
  const teilnehmer = app.duellTeilnehmer({ movie: liste });
  assert.equal(teilnehmer.movie.length, 7);
  assert.equal(app.zieheTurnierFeld(teilnehmer.movie, 8), null);
  assert.equal(app.zieheTurnierFeld(teilnehmer.movie, 4).length, 4);
});

test("Jeder Titel des Feldes steht genau einmal in der ersten Runde", () => {
  const gezogen = app.zieheTurnierFeld(feld(16), 8);
  const baum = app.baueTurnierbaum(gezogen);
  const ersteRunde = baum[0].flatMap((paarung) => [paarung.a.id, paarung.b.id]);
  assert.equal(ersteRunde.length, 8);
  assert.equal(new Set(ersteRunde).size, 8);
  assert.deepEqual(ersteRunde.slice().sort(), gezogen.map((f) => f.id).sort());
});

test("Keine Turnier-Paarung stellt einen Titel gegen sich selbst", () => {
  for (const groesse of [4, 8, 16]) {
    for (let i = 0; i < 300; i++) {
      const baum = app.baueTurnierbaum(app.zieheTurnierFeld(feld(20), groesse));
      for (const paarung of baum[0]) {
        assert.notEqual(paarung.a.id, paarung.b.id);
      }
    }
  }
});
