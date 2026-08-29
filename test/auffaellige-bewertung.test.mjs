/**
 * Tests fuer die Kennzeichnung auffaelliger Bewertungen in
 * src/App.jsx — Schwelle (auffaelligeBewertung, entryAuffaellig),
 * Sammelliste (auffaelligeTitel) und die Anzeige (BewertungPruefen,
 * ConfirmDialog).
 *
 * Wie in am-schauen-zeile.test.mjs wird die Datei im Original
 * geprueft: uebersetzt, um eine Ausfuhrliste ergaenzt, geladen. Die
 * Bausteine werden mit renderToStaticMarkup wirklich gerendert — kein
 * Browser, aber der echte Bauplan mit echten Requisiten.
 *
 * Die Zusagen:
 *
 *   1. Auffaellig ist nur, wer BEIDE Bedingungen erfuellt: Betrag des
 *      Zuschlags >= 0,20 UND mindestens 3 Duelle. Nach oben wie nach
 *      unten gleichwertig.
 *   2. Erreicht kein Titel die Schwelle, ist die Sammelliste leer und
 *      der Abschnitt erscheint gar nicht.
 *   3. Die Sammelliste steht nach dem Betrag des Zuschlags, der
 *      groesste zuerst.
 *   4. Die Rueckfrage nach dem Speichern hat Ja und Nein.
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
  "auffaelligeBewertung",
  "entryAuffaellig",
  "auffaelligText",
  "auffaelligeTitel",
  "BewertungPruefen",
  "ConfirmDialog",
  "duellZuschlag",
  "entryZuschlag",
  "criteriaFor",
  "AUFFAELLIG_ZUSCHLAG",
  "AUFFAELLIG_DUELLE",
  "ELO_START",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-auffaellig-"));
  const datei = join(verzeichnis, "auffaellig.mjs");
  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );
  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();

/* Ein bewerteter Eintrag mit einstellbarer Duell-Wertung. */
function eintrag(extra = {}) {
  const values = {};
  app.criteriaFor("movie").forEach((c) => { values[c.key] = 8; });
  return {
    id: "x", category: "movie", title: "Titel", poster: "",
    values, personal: 8, seasons: [], elo: app.ELO_START, duels: 0,
    ...extra,
  };
}

/* Die Elo-Zahl, aus der ein bestimmter Zuschlag entsteht. Gesucht
   wird sie stumpf, damit der Test die Zuschlag-Formel nicht noch
   einmal ausschreibt (und damit nicht gegen sich selbst prueft). */
function eloFuerZuschlag(ziel) {
  let unten = app.ELO_START;
  let oben = app.ELO_START + 5000;
  for (let i = 0; i < 200; i++) {
    const mitte = (unten + oben) / 2;
    if (app.duellZuschlag(mitte) < ziel) unten = mitte;
    else oben = mitte;
  }
  return oben;
}

/* ---------------------------------------------------------------- *
 * 1. Die Schwelle
 * ---------------------------------------------------------------- */

test("Die Schwelle steht als benannte Konstante an einer Stelle", () => {
  assert.equal(app.AUFFAELLIG_ZUSCHLAG, 0.2);
  assert.equal(app.AUFFAELLIG_DUELLE, 3);
});

test("Beide Bedingungen muessen zutreffen", () => {
  // 0,19 bei 5 Duellen: der Zuschlag reicht nicht.
  assert.equal(app.auffaelligeBewertung(0.19, 5), false);
  // 0,20 bei 2 Duellen: zu wenige Duelle.
  assert.equal(app.auffaelligeBewertung(0.2, 2), false);
  // 0,20 bei 3 Duellen: auffaellig.
  assert.equal(app.auffaelligeBewertung(0.2, 3), true);
});

test("Nach unten gilt dasselbe wie nach oben", () => {
  assert.equal(app.auffaelligeBewertung(-0.19, 5), false);
  assert.equal(app.auffaelligeBewertung(-0.2, 2), false);
  assert.equal(app.auffaelligeBewertung(-0.2, 3), true);
});

test("Ohne Zahlen ist nichts auffaellig", () => {
  assert.equal(app.auffaelligeBewertung(null, 5), false);
  assert.equal(app.auffaelligeBewertung(0.5, null), false);
  assert.equal(app.auffaelligeBewertung(NaN, 5), false);
  assert.equal(app.auffaelligeBewertung(0.5, Infinity), false);
});

test("Ein Eintrag ohne Duelle ist nie auffaellig", () => {
  /* Der Regressionsfall: solange nichts gespielt ist, steht die Elo
     auf dem Startwert, der Zuschlag ist 0 — und die Kennzeichnung
     kommt nirgends vor. */
  assert.equal(app.entryAuffaellig(eintrag()), false);
  assert.equal(app.entryAuffaellig(eintrag({ duels: 12 })), false);
});

test("Am Eintrag entscheidet der gerechnete Zuschlag", () => {
  const hoch = eloFuerZuschlag(0.25);
  assert.equal(app.entryAuffaellig(eintrag({ elo: hoch, duels: 3 })), true);
  assert.equal(app.entryAuffaellig(eintrag({ elo: hoch, duels: 2 })), false);
  // Dieselbe Entfernung nach unten.
  const tief = app.ELO_START - (hoch - app.ELO_START);
  assert.equal(app.entryAuffaellig(eintrag({ elo: tief, duels: 3 })), true);

  // Knapp darunter bleibt unauffaellig, auch mit vielen Duellen.
  const knapp = eloFuerZuschlag(0.19);
  assert.equal(app.entryAuffaellig(eintrag({ elo: knapp, duels: 20 })), false);
});

test("Die Richtung steht im Hinweistext", () => {
  assert.match(app.auffaelligText(0.3), /höher/);
  assert.match(app.auffaelligText(-0.3), /niedriger/);
});

/* ---------------------------------------------------------------- *
 * 2. Die Sammelliste
 * ---------------------------------------------------------------- */

/* Eine Rangliste je Kategorie, wie StatsPage sie bekommt. */
function ranglisten(nachKategorie) {
  const result = {};
  for (const key of ["movie", "series", "anime", "kids", "adultanim", "game"]) {
    result[key] = nachKategorie[key] || [];
  }
  return result;
}

test("Ohne auffaellige Titel bleibt die Sammelliste leer", () => {
  const ranked = ranglisten({
    movie: [eintrag({ id: "a" }), eintrag({ id: "b", duels: 9 })],
    series: [eintrag({ id: "c", elo: eloFuerZuschlag(0.19), duels: 9 })],
  });
  assert.deepEqual(app.auffaelligeTitel(ranked), []);
});

test("Der Abschnitt erscheint gar nicht, wenn die Liste leer ist", () => {
  const ranked = ranglisten({ movie: [eintrag({ id: "a", duels: 9 })] });
  const markup = renderToStaticMarkup(
    createElement(app.BewertungPruefen, { ranked, onOeffnen: () => {} })
  );
  assert.equal(markup, "", "der Abschnitt steht da, obwohl nichts zu pruefen ist");
});

test("Die Sammelliste steht nach dem Betrag des Zuschlags", () => {
  const ranked = ranglisten({
    movie: [
      eintrag({ id: "mittel", title: "Mittel", elo: eloFuerZuschlag(0.3), duels: 4 }),
      eintrag({ id: "klein", title: "Klein", elo: eloFuerZuschlag(0.21), duels: 4 }),
    ],
    series: [
      /* Der groesste Betrag, aber nach unten — die Reihenfolge misst
         den Betrag, nicht das Vorzeichen. */
      eintrag({
        id: "gross", title: "Gross", category: "series",
        elo: app.ELO_START - (eloFuerZuschlag(0.4) - app.ELO_START), duels: 5,
      }),
    ],
  });

  const liste = app.auffaelligeTitel(ranked);
  assert.deepEqual(liste.map((e) => e.eintrag.id), ["gross", "mittel", "klein"]);
  assert.equal(liste[0].kategorie.key, "series");
  assert.equal(liste[0].duelle, 5);
  assert.ok(liste[0].zuschlag < 0, "das Vorzeichen geht verloren");
});

test("Der Abschnitt zeigt Titel, Kategorie, Duellzahl und Zuschlag", () => {
  const ranked = ranglisten({
    movie: [eintrag({ id: "a", title: "Ein Film", elo: eloFuerZuschlag(0.31), duels: 7 })],
  });
  const markup = renderToStaticMarkup(
    createElement(app.BewertungPruefen, { ranked, onOeffnen: () => {} })
  );
  assert.match(markup, /Bewertung prüfen/);
  assert.match(markup, /Ein Film/);
  assert.match(markup, /Filme/);
  assert.match(markup, /7 Duelle/);
  assert.match(markup, /\+0\.31/);
});

/* ---------------------------------------------------------------- *
 * 3. Die Rueckfrage nach dem Speichern
 * ---------------------------------------------------------------- */

test("Die Rueckfrage steht mit Ja und Nein da", () => {
  const markup = renderToStaticMarkup(
    createElement(app.ConfirmDialog, {
      title: "Duell-Zuschlag zurücksetzen?",
      text: "Text",
      confirmLabel: "Ja",
      cancelLabel: "Nein",
      onConfirm: () => {},
      onCancel: () => {},
    })
  );
  assert.match(markup, /Duell-Zuschlag zurücksetzen\?/);
  assert.match(markup, />Ja</);
  assert.match(markup, />Nein</);
  assert.ok(!/Abbrechen/.test(markup), "der Abbrechen-Knopf steht noch da");
});

test("Ohne eigenen Text bleibt es bei Abbrechen", () => {
  /* Die bestehenden Rueckfragen (Loeschen, Import) geben keinen
     eigenen Text mit und duerfen sich nicht veraendert haben. */
  const markup = renderToStaticMarkup(
    createElement(app.ConfirmDialog, {
      title: "Eintrag löschen?",
      text: "Text",
      confirmLabel: "Löschen",
      danger: true,
      onConfirm: () => {},
      onCancel: () => {},
    })
  );
  assert.match(markup, />Abbrechen</);
});
