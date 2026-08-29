/**
 * Rendert die neuen Bausteine wirklich — anders als am-schauen.test.mjs,
 * wo es nur um die Funktionen dahinter geht.
 *
 * Gerendert wird mit renderToStaticMarkup aus react-dom/server: kein
 * Browser, kein DOM, aber der echte Bauplan der Komponente mit den
 * echten Requisiten. Das faengt genau das ab, was eine reine
 * Funktionspruefung nicht sieht — einen Zugriff auf `stand.gesamt`,
 * wenn `stand` null ist, etwa.
 *
 * Die Zusagen:
 *
 *   1. Mit Episodendaten zeigt die Zeile Balken, Stand und "+1".
 *   2. Ohne Episodendaten zeigt sie den Titel und sonst nichts davon —
 *      und stuerzt nicht ab.
 *   3. Auf der letzten Folge der letzten Staffel ist "+1" abgeschaltet.
 *   4. Der Schalter kennt beide Stellungen.
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

const GEPRUEFT = ["AmSchauenZeile", "AmSchauenSchalter"];

async function ladeBausteine() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-zeile-"));
  const datei = join(verzeichnis, "zeile.mjs");

  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeBausteine();

function eintrag(felder) {
  return {
    id: "x",
    title: "Eine Serie",
    poster: "",
    watchlist: false,
    amSchauen: true,
    staffelNr: null,
    folgeNr: null,
    episodesPerSeason: [],
    ...felder,
  };
}

function zeile(felder, extra = {}) {
  return renderToStaticMarkup(
    createElement(app.AmSchauenZeile, {
      eintrag: eintrag(felder),
      busy: false,
      akzent: "#3E9C8F",
      ausLabel: "Am Schauen",
      onWeiter: () => {},
      onStand: () => {},
      onAus: () => {},
      ...extra,
    })
  );
}

/* ---------------------------------------------------------------- *
 * Mit Episodendaten
 * ---------------------------------------------------------------- */

test("Mit Episodendaten stehen Balken, Stand und „+1“ in der Zeile", () => {
  const html = zeile({ staffelNr: 2, folgeNr: 4, episodesPerSeason: [12, 10, 8] });
  assert.match(html, /Eine Serie/);
  assert.match(html, /S2 · 4\/10/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="4"/);
  assert.match(html, /aria-valuemax="10"/);
  assert.match(html, /\+1/);
  // Der Balken steht auf 40 % — vier von zehn Folgen.
  assert.match(html, /width:40%/);
});

/** Das Knopf-Element, in dem "+1" steht — oder null. */
function plusEinsKnopf(html) {
  const treffer = html.match(/<button[^>]*>\+1<\/button>/);
  return treffer ? treffer[0] : null;
}

test("Auf der letzten Folge der letzten Staffel ist „+1“ abgeschaltet", () => {
  const html = zeile({ staffelNr: 3, folgeNr: 8, episodesPerSeason: [12, 10, 8] });
  assert.match(html, /S3 · 8\/8/);

  const knopf = plusEinsKnopf(html);
  assert.ok(knopf, "Der Knopf fehlt ganz — er soll da sein, nur gesperrt");
  assert.match(knopf, /disabled/, "Der Knopf ist nicht gesperrt");
  assert.doesNotMatch(knopf, /#3E9C8F/, "Der gesperrte Knopf traegt noch die Akzentfarbe");
});

test("Auf der letzten Folge einer Staffel mit Nachfolgerin bleibt „+1“ aktiv", () => {
  const html = zeile({ staffelNr: 1, folgeNr: 12, episodesPerSeason: [12, 10, 8] });
  assert.match(html, /S1 · 12\/12/);
  assert.match(html, /width:100%/);

  const knopf = plusEinsKnopf(html);
  assert.ok(knopf);
  assert.doesNotMatch(knopf, /disabled/, "Der Knopf ist gesperrt, obwohl eine Staffel folgt");
  assert.match(knopf, /#3E9C8F/, "Dem aktiven Knopf fehlt die Akzentfarbe");
});

test("Waehrend eines laufenden Speichervorgangs ist „+1“ gesperrt", () => {
  const html = zeile({ staffelNr: 1, folgeNr: 3, episodesPerSeason: [12] }, { busy: true });
  assert.match(plusEinsKnopf(html), /disabled/);
});

/* ---------------------------------------------------------------- *
 * Ohne Episodendaten
 * ---------------------------------------------------------------- */

test("Ohne Episodendaten steht der Titel da — ohne Fortschritt und ohne Absturz", () => {
  const html = zeile({ episodesPerSeason: [] });
  assert.match(html, /Eine Serie/);
  assert.doesNotMatch(html, /progressbar/);
  assert.doesNotMatch(html, /\+1/);
  // Beenden geht trotzdem.
  assert.match(html, /Am Schauen beenden/);
});

test("Auch ein Eintrag ganz ohne das Feld rendert", () => {
  const html = renderToStaticMarkup(
    createElement(app.AmSchauenZeile, {
      eintrag: { id: "f", title: "Ein Film", poster: "", amSchauen: true },
      busy: false,
      akzent: "#C9A227",
      ausLabel: "Am Schauen",
      onWeiter: () => {},
      onStand: () => {},
      onAus: () => {},
    })
  );
  assert.match(html, /Ein Film/);
  assert.doesNotMatch(html, /progressbar/);
});

test("Steht der Stand hinter der bekannten Staffelliste, rendert die Zeile ohne Fortschritt", () => {
  const html = zeile({ staffelNr: 9, folgeNr: 3, episodesPerSeason: [12, 10] });
  assert.match(html, /Eine Serie/);
  assert.doesNotMatch(html, /progressbar/);
});

/* ---------------------------------------------------------------- *
 * Der Schalter
 * ---------------------------------------------------------------- */

test("Der Schalter kennt beide Stellungen", () => {
  const aus = renderToStaticMarkup(
    createElement(app.AmSchauenSchalter, {
      an: false, label: "Am Schauen", busy: false, onChange: () => {},
    })
  );
  assert.match(aus, /role="switch"/);
  assert.match(aus, /aria-checked="false"/);
  assert.match(aus, /Am Schauen beginnen/);

  const an = renderToStaticMarkup(
    createElement(app.AmSchauenSchalter, {
      an: true, label: "Am Spielen", busy: false, onChange: () => {},
    })
  );
  assert.match(an, /aria-checked="true"/);
  assert.match(an, /Am Spielen beenden/);
});
