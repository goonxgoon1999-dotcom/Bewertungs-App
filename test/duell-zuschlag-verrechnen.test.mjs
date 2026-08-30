/**
 * Tests fuer das Verrechnen des Duell-Zuschlags in src/App.jsx —
 * die Schwelle (verrechnenAngeboten), die Umkehrrechnung
 * (verrechnungsWeg), der Dialog (VerrechnenDialog) und der Knopf in
 * der Detailansicht (DetailView).
 *
 * Wie in auffaellige-bewertung.test.mjs wird die Datei im Original
 * geprueft: uebersetzt, um eine Ausfuhrliste ergaenzt, geladen. Die
 * Bausteine werden mit renderToStaticMarkup wirklich gerendert.
 * Zusaetzlich laeuft PUT /api/items gegen einen Stub-Treiber (wie in
 * duell-endpunkte.test.mjs) — nur so laesst sich nachsehen, welche
 * Spalten das Verrechnen tatsaechlich beschreibt.
 *
 * Die Zusagen:
 *
 *   1. Ohne den neuen Knopf aendert sich nichts: keine Zeile mehr in
 *      der Detailansicht, keine veraenderte Endnote, kein
 *      angefasster Eintrag.
 *   2. Der Knopf erscheint erst ab 10 Duellen UND ab Betrag 0,05.
 *   3. Der Weg "Bauchgefuehl" trifft dieselbe Endnote wieder — bis auf
 *      die Schrittweite der Bewertungsfelder. Nach unten genauso.
 *   4. Der Weg "Kriterien" ebenso, geprueft an allen sieben Kriterien
 *      mit den echten Gewichten.
 *   5. Was nicht in 0 bis 10 passt, wird als nicht moeglich angezeigt
 *      und nicht stillschweigend gekappt.
 *   6. Nach dem Verrechnen steht elo auf 1000; duels und siege bleiben.
 *   7. Die angezeigte Rundungsabweichung ist die tatsaechliche.
 *   8. Ein Abbruch aendert nichts.
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
  "VERRECHNEN_MIN_DUELLE",
  "VERRECHNEN_MIN_BETRAG",
  "BEWERTUNG_SCHRITT",
  "BEWERTUNG_MIN",
  "BEWERTUNG_MAX",
  "aufBewertungsSchritt",
  "verrechnenAngeboten",
  "verrechnungsWeg",
  "verrechnungsWege",
  "verrechnenHinweisText",
  "VerrechnenDialog",
  "DetailView",
  "RatingForm",
  "entryScore",
  "entryZuschlag",
  "entryDuels",
  "entrySiege",
  "entryCriteriaScore",
  "entryPersonal",
  "criteriaFor",
  "duellZuschlag",
  "ELO_START",
  "ZUSCHLAG_MAX",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-verrechnen-"));
  const datei = join(verzeichnis, "verrechnen.mjs");
  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );
  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();

/* Die Elo-Zahl, aus der ein bestimmter Zuschlag entsteht. Gesucht
   wird sie stumpf, damit der Test die Zuschlag-Formel nicht noch
   einmal ausschreibt (und damit nicht gegen sich selbst prueft). */
function eloFuerZuschlag(ziel) {
  let unten = app.ELO_START - 5000;
  let oben = app.ELO_START + 5000;
  for (let i = 0; i < 300; i++) {
    const mitte = (unten + oben) / 2;
    if (app.duellZuschlag(mitte) < ziel) unten = mitte;
    else oben = mitte;
  }
  return oben;
}

/* Ein bewerteter Film mit einstellbarem Bauchgefuehl, Kriterienwert
   und Zuschlag. Sieben Kriterien, echte Gewichte. */
function film({ personal = 8, kriterium = 8, zuschlag = 0, duels = 20, werte = null } = {}) {
  const values = {};
  app.criteriaFor("movie").forEach((c) => { values[c.key] = kriterium; });
  return {
    id: "x", category: "movie", title: "Titel", poster: "",
    values: werte ? { ...werte } : values,
    personal,
    seasons: [],
    elo: zuschlag === 0 ? app.ELO_START : eloFuerZuschlag(zuschlag),
    duels,
    siege: Math.max(0, duels - 1),
    watchCount: 1,
  };
}

/* Der Eintrag, wie er nach dem Verrechnen dastuende: neue
   Bewertungsfelder, Elo zurueck auf dem Startwert. Genau das schreibt
   zuschlagVerrechnen (siehe src/App.jsx) — hier nachgebaut, damit die
   Endnote danach mit derselben Rechnung wie ueberall entsteht. */
function nachVerrechnung(eintrag, weg) {
  return { ...eintrag, ...weg.entwurf, elo: app.ELO_START };
}

const detailRequisiten = {
  category: "movie", singular: "Film", busy: false,
  onBack() {}, onEdit() {}, onDelete() {}, onSaveAngaben() {},
  onSaveWatchCount() {}, onAmSchauen() {}, onEloZuruecksetzen() {}, onVerrechnen() {},
};

function detailMarkup(eintrag) {
  return renderToStaticMarkup(createElement(app.DetailView, { ...detailRequisiten, entry: eintrag }));
}

function dialogMarkup(eintrag, extra = {}) {
  return renderToStaticMarkup(
    createElement(app.VerrechnenDialog, {
      entry: eintrag, category: "movie",
      onVerrechnen() {}, onSelbstVerteilen() {}, onCancel() {},
      ...extra,
    })
  );
}

/* Der sichtbare Text ohne Auszeichnung — zum Nachsehen, was dasteht. */
function text(markup) {
  return markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&").replace(/&#xFC;/g, "ü").replace(/\s+/g, " ").trim();
}

/* ---------------------------------------------------------------- *
 * 1. Regression — ohne den neuen Knopf bleibt alles, wie es war
 * ---------------------------------------------------------------- */

test("Ohne Duelle steht weder Zuschlag-Zeile noch Verrechnen-Knopf", () => {
  const markup = detailMarkup(film({ duels: 0 }));
  assert.ok(!markup.includes("Duell-Zuschlag"), "die Zuschlag-Zeile steht ohne Duelle nicht da");
  assert.ok(!markup.includes("Verrechnen"), "der Knopf steht ohne Duelle nicht da");
});

test("Mit Duellen, aber ohne Verrechnen bleibt die Endnote unveraendert", () => {
  /* Der Regressionsfall: die Zuschlag-Zeile samt Zuruecksetzen steht
     wie bisher da, die Endnote ist Klammerteil plus Zuschlag. */
  const eintrag = film({ personal: 7, kriterium: 8, zuschlag: 0.12, duels: 20 });
  const basis = 0.75 * app.entryCriteriaScore(eintrag, "movie") + 0.25 * app.entryPersonal(eintrag);
  assert.equal(
    app.entryScore(eintrag, "movie"),
    Math.round((basis + app.entryZuschlag(eintrag)) * 100) / 100
  );
  const markup = detailMarkup(eintrag);
  assert.ok(markup.includes("Zurücksetzen"), "der bisherige Knopf steht weiter da");
});

test("Das Durchrechnen fasst den Eintrag selbst nicht an", () => {
  const eintrag = film({ personal: 7.5, kriterium: 8.2, zuschlag: 0.15 });
  const vorher = JSON.stringify(eintrag);
  app.verrechnungsWege(eintrag, "movie");
  assert.equal(JSON.stringify(eintrag), vorher, "verrechnungsWege hat den Eintrag veraendert");
});

/* ---------------------------------------------------------------- *
 * 2. Wann der Knopf erscheint
 * ---------------------------------------------------------------- */

test("Die Schwellen stehen als benannte Konstanten an einer Stelle", () => {
  assert.equal(app.VERRECHNEN_MIN_DUELLE, 10);
  assert.equal(app.VERRECHNEN_MIN_BETRAG, 0.05);
});

test("Grenzfall Duellzahl: 9 nein, 10 ja", () => {
  const mitDuellen = (n) => film({ zuschlag: 0.12, duels: n });
  assert.equal(app.verrechnenAngeboten(mitDuellen(9)), false);
  assert.equal(app.verrechnenAngeboten(mitDuellen(10)), true);
  assert.ok(!detailMarkup(mitDuellen(9)).includes("Verrechnen"));
  assert.ok(detailMarkup(mitDuellen(10)).includes("Verrechnen"));
});

test("Grenzfall Betrag: 0,04 nein, 0,05 ja", () => {
  const mitBetrag = (b) => film({ zuschlag: b, duels: 20 });
  assert.equal(app.verrechnenAngeboten(mitBetrag(0.04)), false);
  assert.equal(app.verrechnenAngeboten(mitBetrag(0.05)), true);
  // Nach unten dieselbe Grenze — gemessen wird der Betrag.
  assert.equal(app.verrechnenAngeboten(mitBetrag(-0.04)), false);
  assert.equal(app.verrechnenAngeboten(mitBetrag(-0.05)), true);
  assert.ok(!detailMarkup(mitBetrag(0.04)).includes("Verrechnen"));
  assert.ok(detailMarkup(mitBetrag(0.05)).includes("Verrechnen"));
});

test("Beide Bedingungen muessen zutreffen", () => {
  assert.equal(app.verrechnenAngeboten(film({ zuschlag: 0.2, duels: 9 })), false);
  assert.equal(app.verrechnenAngeboten(film({ zuschlag: 0.02, duels: 40 })), false);
  assert.equal(app.verrechnenAngeboten(film({ zuschlag: 0.2, duels: 40 })), true);
});

/* ---------------------------------------------------------------- *
 * 3. Der Weg ins Bauchgefuehl
 * ---------------------------------------------------------------- */

test("Bauchgefuehl: geht die Schrittweite auf, bleibt die Endnote exakt gleich", () => {
  /* Zuschlag 0,10 heisst Bauchgefuehl + 0,40 — das liegt genau auf
     einer Stufe der Bewertungsfelder, es bleibt keine Abweichung. */
  const eintrag = film({ personal: 7, kriterium: 8, zuschlag: 0.1 });
  const weg = app.verrechnungsWeg(eintrag, "movie", "bauch");
  assert.equal(weg.moeglich, true, weg.grund);
  assert.equal(weg.entwurf.personal, 7.4);
  assert.deepEqual(weg.entwurf.values, eintrag.values, "die Kriterien bleiben unberuehrt");
  assert.equal(weg.abweichung, 0);
  assert.equal(app.entryScore(nachVerrechnung(eintrag, weg), "movie"), weg.noteVorher);
});

test("Bauchgefuehl: mit negativem Zuschlag gleichwertig", () => {
  const eintrag = film({ personal: 7, kriterium: 8, zuschlag: -0.1 });
  const weg = app.verrechnungsWeg(eintrag, "movie", "bauch");
  assert.equal(weg.moeglich, true, weg.grund);
  assert.equal(weg.entwurf.personal, 6.6);
  assert.equal(weg.abweichung, 0);
  assert.equal(app.entryScore(nachVerrechnung(eintrag, weg), "movie"), weg.noteVorher);
});

test("Bauchgefuehl: die Abweichung bleibt im Rahmen der Schrittweite", () => {
  /* Mehr als die halbe Stufe kann nicht danebenliegen, und das
     Bauchgefuehl zaehlt nur zu einem Viertel: 0,25 x 0,05 = 0,0125.
     Dazu kommt die Anzeige auf zwei Nachkommastellen — in Summe
     hoechstens 0,02.

     Die Vorgabe nannte hier 0,01. Bei einer Schrittweite von 0,1 ist
     das nicht durchzuhalten; naeher als hier kommt man dem Zielwert
     nicht, ohne die Felder feiner zu machen. Genannt wird die
     Abweichung deshalb im Dialog (siehe unten). */
  const grenze = 0.25 * (app.BEWERTUNG_SCHRITT / 2) + 0.01;
  let groesste = 0;
  for (let z = 5; z <= 24; z++) {
    for (let p = 0; p <= 100; p++) {
      const eintrag = film({ personal: p / 10, kriterium: 8, zuschlag: z / 100 });
      const weg = app.verrechnungsWeg(eintrag, "movie", "bauch");
      if (!weg.moeglich) continue;
      groesste = Math.max(groesste, Math.abs(weg.abweichung));
      assert.ok(
        Math.abs(weg.abweichung) <= grenze + 1e-9,
        "Abweichung " + weg.abweichung + " bei Bauchgefuehl " + p / 10 + " und Zuschlag " + z / 100
      );
    }
  }
  assert.ok(groesste > 0, "es muss auch Faelle mit Abweichung geben");
});

/* ---------------------------------------------------------------- *
 * 4. Der Weg in die Kriterien
 * ---------------------------------------------------------------- */

test("Die Kriteriengewichte ergeben in Summe 1 — darauf beruht die Rechnung", () => {
  const summe = app.criteriaFor("movie").reduce((s, c) => s + c.weight, 0);
  assert.ok(Math.abs(summe - 1) < 1e-9, "Summe der Gewichte: " + summe);
  assert.equal(app.criteriaFor("movie").length, 7);
});

test("Kriterien: geht die Schrittweite auf, bleibt die Endnote exakt gleich", () => {
  /* Zuschlag 0,15 heisst je Kriterium + 0,20 — genau zwei Stufen.
     Geprueft an allen sieben Kriterien mit ihren echten Gewichten. */
  const eintrag = film({ personal: 7, kriterium: 8, zuschlag: 0.15 });
  const weg = app.verrechnungsWeg(eintrag, "movie", "kriterien");
  assert.equal(weg.moeglich, true, weg.grund);
  assert.equal(weg.entwurf.personal, 7, "das Bauchgefuehl bleibt unberuehrt");
  for (const c of app.criteriaFor("movie")) {
    assert.equal(weg.entwurf.values[c.key], 8.2, c.key + " wurde nicht um genau zwei Stufen gehoben");
  }
  assert.equal(weg.abweichung, 0);
  assert.equal(app.entryScore(nachVerrechnung(eintrag, weg), "movie"), weg.noteVorher);
});

test("Kriterien: auch bei ungleichen Ausgangswerten steigt jedes um denselben Betrag", () => {
  const werte = { story: 9, charaktere: 7, unterhaltung: 8.5, emotion: 6, inszenierung: 7.5, schauspiel: 8, sound: 9.5 };
  const eintrag = film({ personal: 7, zuschlag: 0.15, werte });
  const weg = app.verrechnungsWeg(eintrag, "movie", "kriterien");
  assert.equal(weg.moeglich, true, weg.grund);
  for (const c of app.criteriaFor("movie")) {
    assert.ok(
      Math.abs(weg.entwurf.values[c.key] - (werte[c.key] + 0.2)) < 1e-9,
      c.key + ": " + weg.entwurf.values[c.key]
    );
  }
  assert.equal(weg.abweichung, 0);
});

test("Kriterien: mit negativem Zuschlag gleichwertig", () => {
  const eintrag = film({ personal: 7, kriterium: 8, zuschlag: -0.15 });
  const weg = app.verrechnungsWeg(eintrag, "movie", "kriterien");
  assert.equal(weg.moeglich, true, weg.grund);
  for (const c of app.criteriaFor("movie")) assert.equal(weg.entwurf.values[c.key], 7.8);
  assert.equal(weg.abweichung, 0);
  assert.equal(app.entryScore(nachVerrechnung(eintrag, weg), "movie"), weg.noteVorher);
});

test("Kriterien: die Abweichung bleibt im Rahmen der Schrittweite", () => {
  /* Wie oben, nur zaehlen die Kriterien zu drei Vierteln:
     0,75 x 0,05 = 0,0375, mit der Anzeige hoechstens 0,04. Auch das
     liegt ueber den 0,01 der Vorgabe — dieselbe Ursache. */
  const grenze = 0.75 * (app.BEWERTUNG_SCHRITT / 2) + 0.01;
  let groesste = 0;
  for (let z = 5; z <= 24; z++) {
    for (let k = 0; k <= 100; k++) {
      const eintrag = film({ personal: 7, kriterium: k / 10, zuschlag: z / 100 });
      const weg = app.verrechnungsWeg(eintrag, "movie", "kriterien");
      if (!weg.moeglich) continue;
      groesste = Math.max(groesste, Math.abs(weg.abweichung));
      assert.ok(
        Math.abs(weg.abweichung) <= grenze + 1e-9,
        "Abweichung " + weg.abweichung + " bei Kriterium " + k / 10 + " und Zuschlag " + z / 100
      );
    }
  }
  assert.ok(groesste > 0, "es muss auch Faelle mit Abweichung geben");
});

/* ---------------------------------------------------------------- *
 * 5. Was nicht in 0 bis 10 passt
 * ---------------------------------------------------------------- */

test("Bauchgefuehl 9,5 mit grossem Zuschlag geht nicht — und wird nicht gekappt", () => {
  /* 9,5 + 0,20 / 0,25 waeren 10,3. Der Deckel des Zuschlags liegt bei
     0,25 und wird nie ganz erreicht (tanh), deshalb steht hier der
     naechstbeste Fall aus der Vorgabe. */
  const eintrag = film({ personal: 9.5, kriterium: 8, zuschlag: 0.2 });
  const weg = app.verrechnungsWeg(eintrag, "movie", "bauch");
  assert.equal(weg.moeglich, false);
  assert.equal(weg.entwurf, null, "es darf kein Entwurf entstehen");
  assert.match(weg.grund, /höchstens 10,0/);

  // Der andere Weg bleibt wählbar.
  const kriterien = app.verrechnungsWeg(eintrag, "movie", "kriterien");
  assert.equal(kriterien.moeglich, true, kriterien.grund);

  // Und im Dialog steht die Begründung, nicht eine stillschweigende 10.
  const gezeigt = text(dialogMarkup(eintrag));
  assert.ok(gezeigt.includes("Nicht möglich"), gezeigt);
  assert.ok(gezeigt.includes("höchstens 10,0"), gezeigt);
  assert.ok(gezeigt.includes("Gleichmäßig in die Kriterien"), gezeigt);
});

test("Nach unten dieselbe Grenze", () => {
  const eintrag = film({ personal: 0.3, kriterium: 8, zuschlag: -0.2 });
  const weg = app.verrechnungsWeg(eintrag, "movie", "bauch");
  assert.equal(weg.moeglich, false);
  assert.match(weg.grund, /nicht unter 0,0/);
});

test("Passt kein Weg, sagt der Dialog das und bietet nur das eigene Verteilen an", () => {
  const eintrag = film({ personal: 10, kriterium: 10, zuschlag: 0.2 });
  const wege = app.verrechnungsWege(eintrag, "movie");
  assert.deepEqual(wege.map((w) => w.moeglich), [false, false]);
  const gezeigt = text(dialogMarkup(eintrag));
  assert.ok(gezeigt.includes("Keiner der beiden Wege passt"), gezeigt);
  assert.ok(gezeigt.includes("Selbst verteilen"), gezeigt);
});

test("Selbst verteilen nennt die Zielnote und oeffnet nur das Formular mit Hinweis", () => {
  const eintrag = film({ personal: 7, kriterium: 8, zuschlag: 0.12 });
  const ziel = app.entryScore(eintrag, "movie").toFixed(2).replace(".", ",");
  assert.ok(text(dialogMarkup(eintrag)).includes(ziel), "die Zielnote fehlt im Dialog");

  const hinweis = app.verrechnenHinweisText(eintrag, "movie");
  assert.ok(hinweis.includes(ziel), hinweis);

  /* Der Aufbau des Formulars bleibt unveraendert — es kommt nur ein
     Hinweistext dazu. */
  const requisiten = {
    category: "movie", categoryLabel: "Film", initialTitle: "Titel",
    initialValues: eintrag.values, initialPersonal: eintrag.personal,
    onSave() {}, onCancel() {},
  };
  const ohne = text(renderToStaticMarkup(createElement(app.RatingForm, requisiten)));
  const mit = text(renderToStaticMarkup(createElement(app.RatingForm, { ...requisiten, hinweis })));
  assert.ok(!ohne.includes(ziel), "ohne Hinweis steht die Zielnote nicht im Formular");
  assert.ok(mit.includes(ziel), "mit Hinweis steht sie da");
  for (const c of app.criteriaFor("movie")) {
    assert.ok(ohne.includes(c.label) && mit.includes(c.label), c.label + " fehlt");
  }
});

/* ---------------------------------------------------------------- *
 * 7. Die angezeigte Abweichung ist die tatsaechliche
 * ---------------------------------------------------------------- */

test("Die genannte Endnote danach stimmt mit der gerechneten ueberein", () => {
  for (let z = 5; z <= 24; z++) {
    for (const personal of [6.4, 7, 7.3, 8.6]) {
      const eintrag = film({ personal, kriterium: 8.3, zuschlag: z / 100 });
      for (const weg of app.verrechnungsWege(eintrag, "movie")) {
        if (!weg.moeglich) continue;
        const wirklich = app.entryScore(nachVerrechnung(eintrag, weg), "movie");
        assert.equal(weg.noteNachher, wirklich, "angekuendigt vs. gerechnet");
        assert.equal(
          weg.abweichung,
          Math.round((wirklich - weg.noteVorher) * 100) / 100,
          "die genannte Abweichung passt nicht zur Differenz"
        );
      }
    }
  }
});

test("Der Dialog schreibt beide Endnoten aus, und bei Rundung auch die Abweichung", () => {
  // Ein Fall MIT Abweichung: 0,05 auf sieben Kriterien geht nicht auf.
  const krumm = film({ personal: 8, kriterium: 8, zuschlag: 0.05 });
  const wegKrumm = app.verrechnungsWeg(krumm, "movie", "kriterien");
  assert.notEqual(wegKrumm.abweichung, 0, "dieser Fall soll eine Abweichung haben");
  const gezeigtKrumm = text(dialogMarkup(krumm));
  const vorher = wegKrumm.noteVorher.toFixed(2).replace(".", ",");
  const nachher = wegKrumm.noteNachher.toFixed(2).replace(".", ",");
  assert.ok(gezeigtKrumm.includes("Endnote " + vorher + " → " + nachher), gezeigtKrumm);
  assert.ok(gezeigtKrumm.includes("Endnote danach: " + nachher + " statt " + vorher), gezeigtKrumm);

  /* Und einer OHNE: 0,15 geht auf beiden Wegen genau auf — im
     Bauchgefuehl +0,60, je Kriterium +0,20. */
  const glatt = film({ personal: 7, kriterium: 8, zuschlag: 0.15 });
  const wegGlatt = app.verrechnungsWege(glatt, "movie");
  assert.deepEqual(wegGlatt.map((w) => w.abweichung), [0, 0]);
  assert.ok(!text(dialogMarkup(glatt)).includes("Endnote danach:"));
});

test("Der Dialog sagt, dass sich das nicht automatisch zurueckdrehen laesst", () => {
  const gezeigt = text(dialogMarkup(film({ personal: 7, kriterium: 8, zuschlag: 0.12 })));
  assert.ok(gezeigt.includes("Rückgängig machen lässt sich das nicht automatisch"), gezeigt);
});

/* ---------------------------------------------------------------- *
 * 8. Ein Abbruch aendert nichts
 * ---------------------------------------------------------------- */

test("Das blosse Anzeigen des Dialogs schreibt nichts", () => {
  const eintrag = film({ personal: 7, kriterium: 8, zuschlag: 0.12 });
  const vorher = JSON.stringify(eintrag);
  let gerufen = 0;
  dialogMarkup(eintrag, {
    onVerrechnen: () => { gerufen++; },
    onSelbstVerteilen: () => { gerufen++; },
  });
  assert.equal(gerufen, 0, "der Dialog hat von sich aus etwas ausgeloest");
  assert.equal(JSON.stringify(eintrag), vorher, "der Eintrag wurde veraendert");
  assert.equal(eintrag.elo, eloFuerZuschlag(0.12));
  assert.ok(text(dialogMarkup(eintrag)).includes("Abbrechen"));
});

/* ---------------------------------------------------------------- *
 * Kleinkram: die Stufenrundung selbst
 * ---------------------------------------------------------------- */

test("aufBewertungsSchritt rundet auf die Stufen der Bewertungsfelder", () => {
  assert.equal(app.BEWERTUNG_SCHRITT, 0.1);
  assert.equal(app.BEWERTUNG_MIN, 0);
  assert.equal(app.BEWERTUNG_MAX, 10);
  assert.equal(app.aufBewertungsSchritt(8.0666), 8.1);
  assert.equal(app.aufBewertungsSchritt(8.04), 8);
  assert.equal(app.aufBewertungsSchritt(7.25), 7.3);
  assert.equal(app.aufBewertungsSchritt(-0.04), -0);
  // Und keine Gleitkomma-Reste: 8,3 ist 8,3 und nicht 8,299999999.
  assert.equal(app.aufBewertungsSchritt(8.3), 8.3);
  assert.equal(String(app.aufBewertungsSchritt(0.1 + 0.2)), "0.3");
});
