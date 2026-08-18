/**
 * Tests fuer die Zeichen der Rang-Stufen in src/App.jsx.
 *
 * Wie in app-logik.test.mjs wird die Datei im Original geprueft und
 * nicht als Kopie: uebersetzt, um eine Ausfuhrliste ergaenzt, geladen.
 * Gerendert wird hier allerdings — die Zeichen sind Komponenten, also
 * werden sie mit react-dom/server zu Markup gemacht und dieses geprueft.
 *
 * Es geht um drei Dinge: dass jede Stufe ein Zeichen hat, dass die
 * Zeichen sich voneinander unterscheiden (vorher trugen alle acht
 * dasselbe Schild) und dass eine Stufe ohne hinterlegtes Zeichen auf
 * das Schild zurueckfaellt statt zu brechen.
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
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const GEPRUEFT = ["RAENGE", "RANG_ICONS", "RangIcon", "IconSchild"];

async function ladeRang() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-rang-"));
  const datei = join(verzeichnis, "rang.mjs");

  /* Die uebersetzte Datei liegt ausserhalb des Projekts, `react` waere
     von dort nicht auffindbar — deshalb zeigen die Importe auf den
     echten Pfad im Projekt. */
  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return import(pathToFileURL(datei).href);
}

const rang = await ladeRang();
const { RAENGE, RANG_ICONS, RangIcon, IconSchild } = rang;

/** Das Markup eines Zeichens — ohne die Groessenangaben im Stil. */
function markup(element) {
  return renderToStaticMarkup(element);
}

/** Nur die Zeichnung: alles zwischen den svg-Tags. */
function zeichnung(m) {
  const treffer = m.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  return treffer ? treffer[1] : "";
}

test("Jede Stufe hat ein eigenes Zeichen", () => {
  for (const stufe of RAENGE) {
    assert.ok(RANG_ICONS[stufe.key], "Stufe ohne Zeichen: " + stufe.key);
  }
});

test("Im Verzeichnis steht kein Zeichen zu viel", () => {
  const schluessel = RAENGE.map((s) => s.key).sort();
  assert.deepEqual(Object.keys(RANG_ICONS).sort(), schluessel);
});

test("Alle acht Zeichen sind voneinander verschieden", () => {
  const gesehen = new Map();
  for (const stufe of RAENGE) {
    const d = zeichnung(markup(React.createElement(RangIcon, { stufe })));
    assert.notEqual(d.trim(), "", "Leeres Zeichen bei " + stufe.key);
    const schon = gesehen.get(d);
    assert.equal(schon, undefined, "Gleiches Zeichen bei " + schon + " und " + stufe.key);
    gesehen.set(d, stufe.key);
  }
  assert.equal(gesehen.size, RAENGE.length);
});

test("Jedes Zeichen ist eine Strichzeichnung ohne eigene Farbe", () => {
  for (const stufe of RAENGE) {
    const m = markup(React.createElement(RangIcon, { stufe }));
    assert.match(m, /<svg/, stufe.key);
    assert.match(m, /viewBox="0 0 24 24"/, stufe.key);
    assert.match(m, /stroke:currentcolor/i, stufe.key);
    assert.match(m, /fill:none/i, stufe.key);
    /* Keine eigene Farbe: die Rangfarbe kommt vom Umfeld. */
    assert.doesNotMatch(m, /#[0-9a-fA-F]{3,8}/, stufe.key);
  }
});

test("Die Groesse wird durchgereicht", () => {
  for (const stufe of RAENGE) {
    const m = markup(React.createElement(RangIcon, { stufe, groesse: 30 }));
    assert.match(m, /width:30px/, stufe.key);
    assert.match(m, /height:30px/, stufe.key);
  }
});

test("Champion traegt den Pokal, Bronze das Schild", () => {
  const champion = RAENGE[RAENGE.length - 1];
  assert.equal(champion.key, "champion");
  const schild = zeichnung(markup(React.createElement(IconSchild, {})));
  assert.equal(
    zeichnung(markup(React.createElement(RangIcon, { stufe: { key: "bronze" } }))),
    schild
  );
  assert.notEqual(
    zeichnung(markup(React.createElement(RangIcon, { stufe: champion }))),
    schild
  );
});

test("Eine Stufe ohne hinterlegtes Zeichen faellt auf das Schild zurueck", () => {
  const schild = zeichnung(markup(React.createElement(IconSchild, {})));
  for (const stufe of [{ key: "titan" }, {}, null, undefined]) {
    assert.equal(zeichnung(markup(React.createElement(RangIcon, { stufe }))), schild);
  }
});
