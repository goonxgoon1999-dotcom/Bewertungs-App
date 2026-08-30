/**
 * Tests fuer die Zahl der moeglichen Paarungen im Head-to-Head
 * (moeglichePaarungen, imNotenfenster, DUELL_GRUNDFENSTER in
 * src/App.jsx).
 *
 * Wie in duell-sperrfrist.test.mjs wird die Datei im Original
 * geprueft und nicht als Kopie: uebersetzt, um eine Ausfuhrliste
 * ergaenzt, geladen.
 *
 * Die Zusagen:
 *
 *   1. Gezaehlt wird je Paar einmal, nicht doppelt: drei Titel im
 *      Fenster ergeben drei Paarungen.
 *   2. Wer aus dem Fenster faellt, faellt aus der Zahl — und zwar nur
 *      mit seinen eigenen Paarungen.
 *   3. Gemessen wird das Grundfenster (0,6), nicht die
 *      Erweiterungsstufen.
 *   4. Derselbe Vergleich wie bei der Ziehung: was moeglichePaarungen
 *      zaehlt, deckt sich mit dem, was duellKandidaten im
 *      Grundfenster hergibt.
 *   5. In einer Auswahl faellt das Fenster weg — gezaehlt wird dann
 *      das ganze Feld, und gespielt zaehlt nur, was ganz hineinfaellt.
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
  "moeglichePaarungen",
  "gespieltePaarungen",
  "paarungsSchluessel",
  "imNotenfenster",
  "duellKandidaten",
  "DUELL_GRUNDFENSTER",
  "DUELL_FENSTER_STUFEN",
  "zahlText",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-paarzahl-"));
  const datei = join(verzeichnis, "paarzahl.mjs");
  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );
  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();

/* Ein bewerteter Eintrag, wie er in der Rangliste steht. Fuer das
   Fenster zaehlt allein `score`. */
function eintrag(id, score) {
  return { id, title: "Titel " + id, category: "movie", score, personal: 8, seasons: null };
}

test("Grundfenster ist die erste Stufe (0,6)", () => {
  assert.equal(app.DUELL_GRUNDFENSTER, 0.6);
  assert.equal(app.DUELL_GRUNDFENSTER, app.DUELL_FENSTER_STUFEN[0]);
});

test("drei Titel im Fenster ergeben drei Paarungen — je Paar einmal", () => {
  const liste = [eintrag("a", 8.0), eintrag("b", 7.8), eintrag("c", 7.6)];
  assert.equal(app.moeglichePaarungen(liste), 3);
});

test("liegt einer ausserhalb, bleibt nur die eine Paarung der beiden anderen", () => {
  /* c ist mehr als 0,6 von a und b entfernt und bringt deshalb keine
     Paarung mit. */
  const liste = [eintrag("a", 8.0), eintrag("b", 7.8), eintrag("c", 5.0)];
  assert.equal(app.moeglichePaarungen(liste), 1);
});

test("eine Kette zaehlt nur die Paare, die wirklich im Fenster liegen", () => {
  /* a-b und b-c liegen im Fenster, a-c mit 1,0 Abstand nicht. */
  const liste = [eintrag("a", 8.0), eintrag("b", 7.5), eintrag("c", 7.0)];
  assert.equal(app.moeglichePaarungen(liste), 2);
});

test("genau am Rand zaehlt mit, knapp darueber nicht", () => {
  assert.equal(app.moeglichePaarungen([eintrag("a", 8.0), eintrag("b", 7.4)]), 1);
  assert.equal(app.moeglichePaarungen([eintrag("a", 8.0), eintrag("b", 7.39)]), 0);
});

test("die Erweiterungsstufen zaehlen nicht mit", () => {
  /* Bei 1,0 Abstand wuerde die zweite Stufe greifen — gemeint ist
     aber ausdruecklich nur das Grundfenster. */
  const liste = [eintrag("a", 8.0), eintrag("b", 7.0)];
  assert.equal(app.moeglichePaarungen(liste), 0);
  assert.ok(app.imNotenfenster(liste[0], liste[1], app.DUELL_FENSTER_STUFEN[1]));
});

test("kein Selbstduell: derselbe Eintrag zweimal in der Liste zaehlt nicht", () => {
  const doppelt = eintrag("a", 8.0);
  assert.equal(app.moeglichePaarungen([doppelt, { ...doppelt }]), 0);
});

test("Eintraege ohne Note bringen keine Paarung mit", () => {
  const liste = [eintrag("a", 8.0), eintrag("b", 7.9), { id: "c", score: null }];
  assert.equal(app.moeglichePaarungen(liste), 1);
});

test("zu wenige Teilnehmer oder gar keine Liste ergeben 0", () => {
  assert.equal(app.moeglichePaarungen([]), 0);
  assert.equal(app.moeglichePaarungen([eintrag("a", 8.0)]), 0);
  assert.equal(app.moeglichePaarungen(null), 0);
  assert.equal(app.moeglichePaarungen(undefined), 0);
});

test("dieselbe Messung wie bei der Ziehung", () => {
  /* Was gezaehlt wird, muss sich mit dem decken, was duellKandidaten
     im Grundfenster hergibt — sonst zaehlte die Anzeige etwas
     anderes, als das Matchmaking spielt. Gegengerechnet wird ueber
     alle Anker; jedes Paar kommt dabei zweimal vor. */
  const liste = [
    eintrag("a", 9.0), eintrag("b", 8.7), eintrag("c", 8.5),
    eintrag("d", 8.0), eintrag("e", 6.2), eintrag("f", 6.0),
  ];
  let doppelt = 0;
  for (let i = 0; i < liste.length; i++) {
    for (let j = 0; j < liste.length; j++) {
      if (i === j) continue;
      if (app.imNotenfenster(liste[i], liste[j], app.DUELL_GRUNDFENSTER)) doppelt++;
    }
  }
  assert.equal(app.moeglichePaarungen(liste), doppelt / 2);

  /* Und die Ziehung sieht dasselbe Feld: fuer einen Anker mit genug
     Gegnern im Grundfenster sind es genau die, die auch hier
     mitzaehlen. */
  const kandidaten = app.duellKandidaten(liste, 0);
  const imFenster = liste
    .map((_, i) => i)
    .filter((i) => i !== 0 && app.imNotenfenster(liste[0], liste[i], app.DUELL_GRUNDFENSTER));
  assert.deepEqual(kandidaten, imFenster);
});

test("Zahlen bekommen den Tausenderpunkt", () => {
  assert.equal(app.zahlText(1612), "1.612");
  assert.equal(app.zahlText(38), "38");
});

/* ---- In einer Auswahl: ohne Fenster ---- */

test("ohne Fenster zaehlt jedes Paar des Feldes", () => {
  /* Fuenf Titel, weit auseinander: mit Fenster gaebe es keine
     einzige Paarung, ohne Fenster sind es alle zehn. */
  const weit = [
    eintrag("a", 9.5), eintrag("b", 8.0), eintrag("c", 6.0),
    eintrag("d", 4.0), eintrag("e", 1.0),
  ];
  assert.equal(app.moeglichePaarungen(weit, true), 10);
  assert.equal(app.moeglichePaarungen(weit, false), 0);
});

test("ohne Fenster ist es die Zahl aller Paare — n mal (n-1) durch 2", () => {
  for (const n of [2, 3, 5, 8, 20]) {
    const feld = Array.from({ length: n }, (_, i) => eintrag("id" + i, 10 - i * 0.4));
    assert.equal(app.moeglichePaarungen(feld, true), (n * (n - 1)) / 2);
  }
});

test("die Vorgabe misst weiter das Grundfenster", () => {
  const liste = [eintrag("a", 8.0), eintrag("b", 7.0)];
  assert.equal(app.moeglichePaarungen(liste), 0);
  assert.equal(app.moeglichePaarungen(liste, false), 0);
  assert.equal(app.moeglichePaarungen(liste, true), 1);
});

test("auch ohne Fenster kein Selbstduell und keine Note noetig", () => {
  const doppelt = eintrag("a", 8.0);
  assert.equal(app.moeglichePaarungen([doppelt, { ...doppelt }], true), 0);
  /* Ohne Note zaehlt ein Paar hier trotzdem: in einer Auswahl misst
     niemand mehr die Note. */
  assert.equal(app.moeglichePaarungen([eintrag("a", 8), { id: "b", score: null }], true), 1);
});

/* ---- Gespielte Paarungen im Feld ---- */

const zeile = (a, b, at = 1) => ({ a, b, at });

test("ohne Feld zaehlen schlicht die Zeilen — „Alle“ bleibt, wie es war", () => {
  const zeilen = [zeile("a", "b"), zeile("c", "d"), zeile("e", "f")];
  assert.equal(app.gespieltePaarungen(zeilen, null), zeilen.length);
  assert.equal(app.gespieltePaarungen([], null), 0);
  assert.equal(app.gespieltePaarungen(null, null), 0);
});

test("mit Feld zaehlen nur Paarungen, bei denen beide Seiten dazugehoeren", () => {
  const feld = new Set(["a", "b", "c"]);
  const zeilen = [
    zeile("a", "b"),   // beide drin
    zeile("b", "c"),   // beide drin
    zeile("a", "x"),   // eine Seite draussen
    zeile("y", "c"),   // eine Seite draussen
    zeile("x", "y"),   // beide draussen
  ];
  assert.equal(app.gespieltePaarungen(zeilen, feld), 2);
});

test("doppelte Zeilen zaehlen einmal, unvollstaendige gar nicht", () => {
  const feld = new Set(["a", "b"]);
  const zeilen = [
    zeile("a", "b", 1),
    zeile("b", "a", 9),      // dieselbe Paarung, andere Seite
    { a: "a", b: null },     // unvollstaendig
    { at: 5 },               // unvollstaendig
  ];
  assert.equal(app.gespieltePaarungen(zeilen, feld), 1);
});

test("gespielt ueberschreitet moeglich nicht — beide messen dasselbe Feld", () => {
  const feld = [eintrag("a", 9), eintrag("b", 5), eintrag("c", 2)];
  const ids = new Set(feld.map((e) => e.id));
  /* Alle drei Paarungen gespielt, dazu zwei, die nicht ins Feld
     gehoeren. */
  const zeilen = [
    zeile("a", "b"), zeile("a", "c"), zeile("b", "c"),
    zeile("a", "fremd"), zeile("fremd", "anders"),
  ];
  const moeglich = app.moeglichePaarungen(feld, true);
  const gespielt = app.gespieltePaarungen(zeilen, ids);
  assert.equal(moeglich, 3);
  assert.equal(gespielt, 3);
  assert.ok(gespielt <= moeglich);
});

test("ein Feld ohne gespielte Paarungen steht bei 0", () => {
  const ids = new Set(["a", "b"]);
  assert.equal(app.gespieltePaarungen([zeile("x", "y"), zeile("a", "x")], ids), 0);
});
