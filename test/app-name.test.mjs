/**
 * Tests fuer den konfigurierbaren App-Namen in src/App.jsx.
 *
 * Wie in app-logik.test.mjs wird die Datei im Original geprueft und
 * nicht als Kopie: uebersetzt, um eine Ausfuhrliste ergaenzt, geladen.
 *
 * Zwei Dinge sind hier wichtig:
 *
 *   1. Ohne gesetzte Variable steht dort weiterhin exakt
 *      "Rifat's" / "Archiv" — zwei Zeilen wie bisher.
 *   2. Mit gesetzter Variable greift der Wert. Dafuer wird genau das
 *      nachgestellt, was Vite beim Bauen tut: `import.meta.env` wird
 *      durch ein Objekt ersetzt (esbuild `define`).
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

const GEPRUEFT = ["APP_NAME", "APP_NAME_STANDARD", "APP_NAME_ZEILEN", "appNameZeilen"];

/**
 * Laedt src/App.jsx. `gesetzt` ist der Wert von VITE_APP_NAME:
 * `undefined` heisst "nicht gesetzt".
 */
async function ladeNamen(gesetzt) {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  /* Vite ersetzt `import.meta.env` beim Bauen durch ein Objekt. Genau
     das macht `define` hier auch — sonst waere der Fall "Variable
     gesetzt" gar nicht pruefbar. */
  const umgebung = gesetzt === undefined ? {} : { VITE_APP_NAME: gesetzt };
  const { code } = await transform(quelle, {
    loader: "jsx",
    format: "esm",
    define: { "import.meta.env": JSON.stringify(umgebung) },
  });

  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-name-"));
  const datei = join(verzeichnis, "name.mjs");

  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return import(pathToFileURL(datei).href);
}

const ohne = await ladeNamen(undefined);

/* ---------------------------------------------------------------- *
 * Rueckfall — hier darf sich nichts geaendert haben
 * ---------------------------------------------------------------- */

test("Ohne gesetzte Variable bleibt \"Rifat's Archiv\" der Name", () => {
  assert.equal(ohne.APP_NAME_STANDARD, "Rifat's Archiv");
  assert.equal(ohne.APP_NAME, "Rifat's Archiv");
});

test("Der Kopfbereich zeigt unveraendert zwei Zeilen: \"Rifat's\" / \"Archiv\"", () => {
  assert.deepEqual(ohne.APP_NAME_ZEILEN, ["Rifat's", "Archiv"]);
});

test("Eine leere Variable zaehlt als nicht gesetzt", async () => {
  for (const wert of ["", "   "]) {
    const app = await ladeNamen(wert);
    assert.equal(app.APP_NAME, "Rifat's Archiv");
    assert.deepEqual(app.APP_NAME_ZEILEN, ["Rifat's", "Archiv"]);
  }
});

/* ---------------------------------------------------------------- *
 * Gesetzte Variable
 * ---------------------------------------------------------------- */

test("Mit gesetzter Variable steht dort der eigene Name", async () => {
  const app = await ladeNamen("Lisas Sammlung");
  assert.equal(app.APP_NAME, "Lisas Sammlung");
  assert.deepEqual(app.APP_NAME_ZEILEN, ["Lisas", "Sammlung"]);
});

test("Leerzeichen am Rand werden abgeschnitten", async () => {
  const app = await ladeNamen("  Lisas Sammlung  ");
  assert.equal(app.APP_NAME, "Lisas Sammlung");
});

/* ---------------------------------------------------------------- *
 * Der Umbruch in zwei Zeilen
 * ---------------------------------------------------------------- */

test("Umgebrochen wird am letzten Leerzeichen", () => {
  assert.deepEqual(ohne.appNameZeilen("Archiv der guten Filme"), [
    "Archiv der guten",
    "Filme",
  ]);
});

test("Ein senkrechter Strich bestimmt den Umbruch selbst", () => {
  assert.deepEqual(ohne.appNameZeilen("Archiv der|guten Filme"), [
    "Archiv der",
    "guten Filme",
  ]);
});

test("Ein Name ohne Leerzeichen steht einzeilig", () => {
  assert.deepEqual(ohne.appNameZeilen("Archiv"), ["Archiv"]);
});

test("Es entstehen nie mehr als zwei Zeilen", () => {
  for (const name of [
    "Rifat's Archiv",
    "Archiv",
    "Archiv der guten Filme",
    "Archiv der|guten Filme",
    "a|b|c",
  ]) {
    const zeilen = ohne.appNameZeilen(name);
    assert.ok(zeilen.length >= 1 && zeilen.length <= 2, "zu viele Zeilen bei: " + name);
  }
});

test("Leere oder unbrauchbare Werte fallen auf den Standard zurueck", () => {
  for (const wert of ["", "   ", null, undefined, 42]) {
    assert.deepEqual(ohne.appNameZeilen(wert), ["Rifat's", "Archiv"]);
  }
});

/* ---------------------------------------------------------------- *
 * Der Kopfbereich selbst
 * ---------------------------------------------------------------- */

test("Im Kopfbereich steht kein fest verdrahteter Name mehr", async () => {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  /* Frueher stand der Name als Text in zwei <span> im Kopfbereich.
     Dort darf er nicht mehr auftauchen — nur noch als Standardwert. */
  assert.ok(
    !/>\s*Rifat's\s*</.test(quelle),
    "Im Kopfbereich steht der Name noch als fester Text"
  );
  assert.ok(
    quelle.includes('const APP_NAME_STANDARD = "Rifat\'s Archiv";'),
    "Der Standard steht nicht mehr dort, wo er erwartet wird"
  );
});

test("Die zwei Zeilen im Kopfbereich behalten ihr display:block", async () => {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.ok(
    quelle.includes(
      '{APP_NAME_ZEILEN.map((zeile, i) => (\n                <span key={i} style={{ display: "block" }}>{zeile}</span>'
    ),
    "Der Kopfbereich setzt die Zeilen nicht mehr als Bloecke"
  );
});
