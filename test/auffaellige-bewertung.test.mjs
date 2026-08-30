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
 *   1. Auffaellig ist nur, wer ALLE DREI Bedingungen erfuellt: Betrag
 *      des Zuschlags >= 0,15 UND mindestens 3 Duelle UND ein
 *      gemischtes Ergebnis (mindestens 1 Sieg und 1 Niederlage). Nach
 *      oben wie nach unten gleichwertig.
 *   2. Wer jedes Duell gewinnt, wird NICHT gekennzeichnet — ein Titel
 *      an der Spitze hat niemanden mehr ueber sich, gegen den er
 *      verlieren koennte; die Markierung sagte bei ihm nichts aus.
 *   3. Erreicht kein Titel die Schwelle, ist die Sammelliste leer und
 *      der Abschnitt erscheint gar nicht.
 *   4. Die Sammelliste steht nach dem Betrag des Zuschlags, der
 *      groesste zuerst.
 *   5. Die Rueckfrage nach dem Speichern hat Ja und Nein.
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
  "AUFFAELLIG_GEMISCHT",
  "entrySiege",
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

/* Ein bewerteter Eintrag mit einstellbarer Duell-Wertung.

   `siege` wird, wo nichts anderes dabeisteht, auf ein gemischtes
   Ergebnis gesetzt: ein Sieg weniger als Duelle. So prueft jeder Test
   unten genau die Bedingung, um die es ihm geht, und nicht nebenbei
   die Bilanz. */
function eintrag(extra = {}) {
  const values = {};
  app.criteriaFor("movie").forEach((c) => { values[c.key] = 8; });
  const duels = typeof extra.duels === "number" ? extra.duels : 0;
  return {
    id: "x", category: "movie", title: "Titel", poster: "",
    values, personal: 8, seasons: [], elo: app.ELO_START, duels,
    siege: Math.max(0, duels - 1),
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
  assert.equal(app.AUFFAELLIG_ZUSCHLAG, 0.15);
  assert.equal(app.AUFFAELLIG_DUELLE, 3);
  assert.equal(app.AUFFAELLIG_GEMISCHT, 1);
});

test("Alle drei Bedingungen muessen zutreffen", () => {
  // 0,14 bei 5 Duellen (3 Siege): der Zuschlag reicht nicht.
  assert.equal(app.auffaelligeBewertung(0.14, 5, 3), false);
  // 0,15 bei 2 Duellen (1 Sieg): zu wenige Duelle.
  assert.equal(app.auffaelligeBewertung(0.15, 2, 1), false);
  // 0,15 bei 3 Duellen (2 Siege): auffaellig.
  assert.equal(app.auffaelligeBewertung(0.15, 3, 2), true);
});

test("Die Grenzfaelle der Schwelle liegen genau auf dem Wert", () => {
  // Zuschlag: 0,14 nein, 0,15 ja.
  assert.equal(app.auffaelligeBewertung(0.14, 8, 4), false);
  assert.equal(app.auffaelligeBewertung(0.15, 8, 4), true);
  // Duellzahl: 2 nein, 3 ja.
  assert.equal(app.auffaelligeBewertung(0.3, 2, 1), false);
  assert.equal(app.auffaelligeBewertung(0.3, 3, 1), true);
  // Und nach unten dieselben Grenzen.
  assert.equal(app.auffaelligeBewertung(-0.14, 8, 4), false);
  assert.equal(app.auffaelligeBewertung(-0.15, 8, 4), true);
  assert.equal(app.auffaelligeBewertung(-0.3, 2, 1), false);
  assert.equal(app.auffaelligeBewertung(-0.3, 3, 1), true);
});

test("Nur gemischte Ergebnisse zaehlen", () => {
  /* Der Kern der Aenderung: Wer jedes Duell gewinnt, sammelt zwar
     Zuschlag — widerspruechlich ist daran aber nichts, er hat schlicht
     niemanden mehr ueber sich. Dasselbe umgekehrt. */
  assert.equal(app.auffaelligeBewertung(0.3, 8, 8), false, "8 von 8 Siegen");
  assert.equal(app.auffaelligeBewertung(-0.3, 8, 0), false, "0 von 8 Siegen");
  // Ein einziger Ausrutscher in die andere Richtung genuegt.
  assert.equal(app.auffaelligeBewertung(0.3, 8, 7), true);
  assert.equal(app.auffaelligeBewertung(-0.3, 8, 1), true);
  // Und der Mittelfall aus der Vorgabe: 8 Duelle, 6 Siege.
  assert.equal(app.auffaelligeBewertung(0.3, 8, 6), true);
});

test("Nach unten gilt dasselbe wie nach oben", () => {
  assert.equal(app.auffaelligeBewertung(-0.14, 5, 3), false);
  assert.equal(app.auffaelligeBewertung(-0.15, 2, 1), false);
  assert.equal(app.auffaelligeBewertung(-0.15, 3, 2), true);
});

test("Ohne Zahlen ist nichts auffaellig", () => {
  assert.equal(app.auffaelligeBewertung(null, 5, 3), false);
  assert.equal(app.auffaelligeBewertung(0.5, null, 3), false);
  assert.equal(app.auffaelligeBewertung(0.5, 5, null), false);
  assert.equal(app.auffaelligeBewertung(NaN, 5, 3), false);
  assert.equal(app.auffaelligeBewertung(0.5, Infinity, 3), false);
  assert.equal(app.auffaelligeBewertung(0.5, 5, NaN), false);
});

test("Ein Eintrag ohne Duelle ist nie auffaellig", () => {
  /* Der Regressionsfall: solange nichts gespielt ist, steht die Elo
     auf dem Startwert, der Zuschlag ist 0 — und die Kennzeichnung
     kommt nirgends vor. */
  assert.equal(app.entryAuffaellig(eintrag()), false);
  assert.equal(app.entryAuffaellig(eintrag({ duels: 12 })), false);
});

test("Am Eintrag entscheidet der gerechnete Zuschlag", () => {
  const hoch = eloFuerZuschlag(0.2);
  assert.equal(app.entryAuffaellig(eintrag({ elo: hoch, duels: 3, siege: 2 })), true);
  assert.equal(app.entryAuffaellig(eintrag({ elo: hoch, duels: 2, siege: 1 })), false);
  // Dieselbe Entfernung nach unten.
  const tief = app.ELO_START - (hoch - app.ELO_START);
  assert.equal(app.entryAuffaellig(eintrag({ elo: tief, duels: 3, siege: 1 })), true);

  // Knapp darunter bleibt unauffaellig, auch mit vielen Duellen.
  const knapp = eloFuerZuschlag(0.14);
  assert.equal(app.entryAuffaellig(eintrag({ elo: knapp, duels: 20, siege: 10 })), false);
});

test("Der Dauersieger wird nicht gekennzeichnet, der Wechselhafte schon", () => {
  /* Die beiden Faelle aus der Vorgabe, ueber den ganzen Weg gerechnet:
     acht Duelle und ein Zuschlag deutlich ueber der Schwelle. Den
     Unterschied macht allein die Bilanz. */
  const hoch = eloFuerZuschlag(0.2);
  assert.ok(app.duellZuschlag(hoch) >= app.AUFFAELLIG_ZUSCHLAG, "der Zuschlag muss ueber der Schwelle liegen");

  assert.equal(app.entryAuffaellig(eintrag({ elo: hoch, duels: 8, siege: 8 })), false);
  assert.equal(app.entryAuffaellig(eintrag({ elo: hoch, duels: 8, siege: 6 })), true);
});

test("Ein Eintrag ohne siege gilt als sieglos — Bestandsdaten schlagen nicht an", () => {
  /* `siege` startet bei allen vorhandenen Eintraegen auf 0, weil die
     bisherigen Ausgaenge nirgends festgehalten wurden. Bis genug neue
     Duelle gespielt sind, erfuellt also kein Titel die Bedingung
     "mindestens 1 Sieg". Geschaetzt wird nichts. */
  const hoch = eloFuerZuschlag(0.2);
  const ohneFeld = { ...eintrag({ elo: hoch, duels: 8 }) };
  delete ohneFeld.siege;
  assert.equal(app.entrySiege(ohneFeld), 0);
  assert.equal(app.entryAuffaellig(ohneFeld), false);
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
    series: [eintrag({ id: "c", elo: eloFuerZuschlag(0.14), duels: 9, siege: 5 })],
  });
  assert.deepEqual(app.auffaelligeTitel(ranked), []);
});

test("Die Sammelliste laesst den Dauersieger aus", () => {
  /* Dieselbe Bedingung wie am einzelnen Eintrag — die Sammelliste
     fragt nicht selbst nach, sondern geht ueber entryAuffaellig. */
  const hoch = eloFuerZuschlag(0.2);
  const ranked = ranglisten({
    movie: [
      eintrag({ id: "immer", title: "Immer", elo: hoch, duels: 8, siege: 8 }),
      eintrag({ id: "gemischt", title: "Gemischt", elo: hoch, duels: 8, siege: 6 }),
    ],
  });
  assert.deepEqual(app.auffaelligeTitel(ranked).map((e) => e.eintrag.id), ["gemischt"]);

  const markup = renderToStaticMarkup(
    createElement(app.BewertungPruefen, { ranked, onOeffnen: () => {} })
  );
  assert.match(markup, /Gemischt/);
  assert.ok(!/Immer/.test(markup), "der Dauersieger steht in der Sammelliste");
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
      eintrag({ id: "mittel", title: "Mittel", elo: eloFuerZuschlag(0.19), duels: 4, siege: 3 }),
      eintrag({ id: "klein", title: "Klein", elo: eloFuerZuschlag(0.16), duels: 4, siege: 3 }),
    ],
    series: [
      /* Der groesste Betrag, aber nach unten — die Reihenfolge misst
         den Betrag, nicht das Vorzeichen. */
      eintrag({
        id: "gross", title: "Gross", category: "series",
        elo: app.ELO_START - (eloFuerZuschlag(0.23) - app.ELO_START), duels: 5, siege: 1,
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
    movie: [eintrag({ id: "a", title: "Ein Film", elo: eloFuerZuschlag(0.21), duels: 7, siege: 5 })],
  });
  const markup = renderToStaticMarkup(
    createElement(app.BewertungPruefen, { ranked, onOeffnen: () => {} })
  );
  assert.match(markup, /Bewertung prüfen/);
  assert.match(markup, /Ein Film/);
  assert.match(markup, /Filme/);
  assert.match(markup, /7 Duelle/);
  assert.match(markup, /\+0\.21/);
  // Die Schwellen stehen in der Erlaeuterung — auch die neue.
  assert.match(markup, /0,15 Zuschlag/);
  assert.match(markup, /3 Duellen/);
  assert.match(markup, /gemischten Ergebnissen/);
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
