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
