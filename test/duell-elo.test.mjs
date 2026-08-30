/**
 * Tests fuer die Duell-Wertung.
 *
 * Ein Duell aendert seit dieser Umstellung nicht mehr das Bauchgefuehl
 * eines Eintrags, sondern nur noch dessen Elo-Zahl. Daraus entsteht ein
 * gedeckelter Zuschlag auf die Endnote:
 *
 *   Endnote = (0,75 x Kriteriennote + 0,25 x Bauchgefuehl) + Zuschlag
 *   Zuschlag = 0,25 x tanh((elo - 1000) / 100)
 *
 * Deckel und Skala sind gegenueber der ersten Fassung halbiert (0,5
 * und 200). Die Steigung im Nullpunkt bleibt dadurch dieselbe: Der
 * erste Sieg bringt weiterhin rund +0,04, drei Siege rund +0,11.
 * Geprueft wird beides — die neue Grenze und das unveraenderte fruehe
 * Verhalten.
 *
 * Geprueft wird beides, wo es steht: der Zuschlag und die Endnote in
 * src/App.jsx (uebersetzt und um eine Ausfuhrliste ergaenzt, wie in
 * app-logik.test.mjs), die Elo-Verschiebung in api/_db.js, wo sie
 * gerechnet wird.
 *
 * Der wichtigste Test steht zuerst: bei elo = 1000 muss jede Endnote
 * Ziffer fuer Ziffer dieselbe sein wie vor der Umstellung. Ohne
 * gespieltes Duell darf sich in der App nichts veraendern.
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

import {
  eloNeu, eloErwartung, ELO_START, ELO_K,
  normalizeElo, normalizeDuels, normalizeSiege,
} from "../api/_db.js";

const GEPRUEFT = [
  "entryScore",
  "entryBasisScore",
  "computeFinalScore",
  "computeCriteriaScore",
  "duellZuschlag",
  "entryZuschlag",
  "entryElo",
  "entryDuels",
  "entrySiege",
  "anzeigeNote",
  "zuschlagText",
  "sortWert",
  "statsFor",
  "imNotenbereich",
  "DEFAULT_FILTER",
  "ELO_START",
  "ZUSCHLAG_MAX",
  "criteriaFor",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-"));
  const datei = join(verzeichnis, "duell-elo.mjs");
  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );
  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();

/* Ein Eintrag mit vollstaendig gesetzten Kriterien. `elo` bleibt
   weg — genau so kommt ein Eintrag aus einem alten Backup an. */
function eintrag(werte, personal, extra = {}) {
  const values = {};
  app.criteriaFor("movie").forEach((c, i) => {
    values[c.key] = Array.isArray(werte) ? werte[i] : werte;
  });
  return { id: "x", category: "movie", title: "Titel", values, personal, seasons: [], ...extra };
}

/* Die Endnote so, wie sie VOR dieser Aenderung gerechnet wurde:
   Kriterien und Bauchgefuehl, sonst nichts. Bewusst hier noch einmal
   ausgeschrieben statt aus der App geholt — sonst pruefte der
   Regressionstest den geaenderten Code gegen sich selbst. */
function endnoteVorher(entry) {
  let total = 0;
  for (const c of app.criteriaFor("movie")) {
    const v = entry.values[c.key];
    if (typeof v === "number") total += v * c.weight;
  }
  const kriterien = Math.round(total * 100) / 100;
  if (typeof entry.personal !== "number") return kriterien;
  return Math.round((0.75 * kriterien + 0.25 * entry.personal) * 100) / 100;
}

/* ---------------------------------------------------------------- *
 * 1. Regression: ohne Duell aendert sich nichts
 * ---------------------------------------------------------------- */

test("Bei elo = 1000 ist die Endnote exakt die alte", () => {
  /* Durchgespielt ueber ein dichtes Raster von Werten — es geht um
     Ziffernidentitaet, nicht um Naeherung. Ein Rundungsfehler an der
     zweiten Nachkommastelle wuerde hier auffallen. */
  let geprueft = 0;
  for (let basis = 0; basis <= 10; basis += 0.1) {
    const wert = Math.round(basis * 10) / 10;
    for (const personal of [0, 1.5, 3.3, 5, 6.7, 8.25, 9.9, 10]) {
      const e = eintrag(wert, personal);
      const erwartet = endnoteVorher(e);

      // Ohne Feld, mit ausdruecklichem Startwert und nach dem
      // Zuruecksetzen muss dieselbe Zahl herauskommen.
      assert.equal(app.entryScore(e, "movie"), erwartet);
      assert.equal(app.entryScore({ ...e, elo: app.ELO_START }, "movie"), erwartet);
      assert.equal(app.entryScore({ ...e, elo: 1000, duels: 17 }, "movie"), erwartet);
      geprueft++;
    }
  }
  assert.ok(geprueft > 800, "zu wenige Kombinationen geprueft: " + geprueft);
});

test("Bei elo = 1000 ist der Zuschlag exakt 0", () => {
  assert.equal(app.duellZuschlag(1000), 0);
  assert.equal(app.entryZuschlag({}), 0);
  assert.equal(app.entryZuschlag({ elo: app.ELO_START }), 0);
});

test("Ohne Duelle bleibt auch die Sortierreihenfolge dieselbe", () => {
  const liste = [
    eintrag([8, 7, 9, 6, 7, 8, 9], 7),
    eintrag([9, 9, 9, 9, 9, 9, 9], 9),
    eintrag([4, 5, 4, 6, 5, 4, 5], 5),
    eintrag([8, 7, 9, 6, 7, 8, 9], 7.5),
  ].map((e, i) => ({ ...e, id: "id" + i }));

  const neu = [...liste]
    .map((f) => ({ id: f.id, score: app.entryScore(f, "movie") }))
    .sort((a, b) => app.sortWert(b.score) - app.sortWert(a.score))
    .map((f) => f.id);
  const alt = [...liste]
    .map((f) => ({ id: f.id, score: endnoteVorher(f) }))
    .sort((a, b) => app.sortWert(b.score) - app.sortWert(a.score))
    .map((f) => f.id);

  assert.deepEqual(neu, alt);
});

test("Ein fehlendes Feld gilt als Startwert, eine kaputte Angabe auch", () => {
  assert.equal(app.entryElo({}), app.ELO_START);
  assert.equal(app.entryElo({ elo: null }), app.ELO_START);
  assert.equal(app.entryElo({ elo: "1200" }), app.ELO_START);
  assert.equal(app.entryElo({ elo: NaN }), app.ELO_START);
  assert.equal(app.entryElo({ elo: 1234.5 }), 1234.5);

  assert.equal(app.entryDuels({}), 0);
  assert.equal(app.entryDuels({ duels: -3 }), 0);
  assert.equal(app.entryDuels({ duels: "7" }), 0);
  assert.equal(app.entryDuels({ duels: 7 }), 7);

  assert.equal(app.entrySiege({}), 0);
  assert.equal(app.entrySiege({ duels: 7 }), 0);
  assert.equal(app.entrySiege({ duels: 7, siege: -3 }), 0);
  assert.equal(app.entrySiege({ duels: 7, siege: "4" }), 0);
  assert.equal(app.entrySiege({ duels: 7, siege: 4 }), 4);
  // Mehr Siege als Duelle kann es nicht geben.
  assert.equal(app.entrySiege({ duels: 3, siege: 9 }), 3);
});

/* ---------------------------------------------------------------- *
 * 2. Der Zuschlag verlaesst nie das Intervall
 * ---------------------------------------------------------------- */

test("Der Zuschlag bleibt zwischen -0,25 und +0,25 — auch nach 50 Siegen", () => {
  /* Gespielt wird gegen einen Gegner, der mitwandert: 50 Siege in
     Folge, dann 50 Niederlagen. Der Elo-Wert selbst darf frei
     laufen — der Zuschlag darf es nicht. */
  for (const gegnerStart of [600, 1000, 1400]) {
    let elo = ELO_START;
    let gegner = gegnerStart;

    for (let i = 0; i < 50; i++) {
      const neu = eloNeu(elo, gegner);
      elo = neu.gewinner;
      gegner = neu.verlierer;
      const z = app.duellZuschlag(elo);
      assert.ok(z > -app.ZUSCHLAG_MAX && z < app.ZUSCHLAG_MAX, "Sieg " + i + ": Zuschlag " + z);
    }

    for (let i = 0; i < 50; i++) {
      const neu = eloNeu(gegner, elo);
      gegner = neu.gewinner;
      elo = neu.verlierer;
      const z = app.duellZuschlag(elo);
      assert.ok(z > -app.ZUSCHLAG_MAX && z < app.ZUSCHLAG_MAX, "Niederlage " + i + ": Zuschlag " + z);
    }
  }
});

test("Auch bei absurden Elo-Werten haelt die Grenze", () => {
  /* Rechnerisch erreicht der tanh seine Grenzen nie. In doppelter
     Genauigkeit ist er ab rund 1900 Punkten Abstand nicht mehr von 1
     zu unterscheiden — dort steht der Zuschlag dann auf glatt 0,25.
     Verlassen wird das Intervall auch dann nicht, und dorthin kommt
     kein Eintrag: Gegen mitwandernde Gegner laeuft die Elo-Zahl gegen
     rund 1900 Punkte Vorsprung, ohne sie je zu erreichen. Bis dahin
     (siehe der Test darueber mit 50 Siegen) bleibt der Abstand zur
     Grenze echt. */
  for (const elo of [-1e9, 0, 500, 1000, 5000, 1e9]) {
    const z = app.duellZuschlag(elo);
    assert.ok(z >= -app.ZUSCHLAG_MAX && z <= app.ZUSCHLAG_MAX, "Zuschlag bei elo " + elo + ": " + z);
  }
  // Im realistischen Bereich bleibt der Abstand zur Grenze echt.
  assert.ok(app.duellZuschlag(2000) < app.ZUSCHLAG_MAX);
  assert.ok(app.duellZuschlag(2000) > 0.2499);
  assert.ok(app.duellZuschlag(0) > -app.ZUSCHLAG_MAX);
});

test("Der Deckel liegt bei 0,25 und die Skala bei 100", () => {
  assert.equal(app.ZUSCHLAG_MAX, 0.25);
  // Die Skala steht nicht als eigene Ausfuhr; sie laesst sich aus dem
  // Wert bei einer Skalenlaenge Abstand ablesen: tanh(1) = 0,7616.
  assert.ok(Math.abs(app.duellZuschlag(1100) - 0.25 * Math.tanh(1)) < 1e-12);
});

test("Der Zuschlag folgt der vorgegebenen Formel", () => {
  for (const elo of [700, 900, 1000, 1100, 1200, 1400, 1800]) {
    assert.equal(app.duellZuschlag(elo), 0.25 * Math.tanh((elo - 1000) / 100));
  }
  // Zwei Bezugspunkte zum Nachrechnen von Hand.
  assert.ok(Math.abs(app.duellZuschlag(1100) - 0.1904) < 0.0001);
  assert.ok(Math.abs(app.duellZuschlag(900) + 0.1904) < 0.0001);
});

test("Die Steigung im Nullpunkt ist dieselbe wie vor der Halbierung", () => {
  /* Der Kern der Aenderung: Deckel UND Skala sind halbiert, also
     bleibt der Quotient — die Steigung bei elo = 1000 — gleich.
     Gemessen wird sie als Differenzenquotient ueber einen kleinen
     Schritt; die alte Formel steht daneben ausgeschrieben. */
  const alt = (elo) => 0.5 * Math.tanh((elo - 1000) / 200);
  const h = 1e-6;
  const steigungNeu = (app.duellZuschlag(1000 + h) - app.duellZuschlag(1000 - h)) / (2 * h);
  const steigungAlt = (alt(1000 + h) - alt(1000 - h)) / (2 * h);
  assert.ok(Math.abs(steigungNeu - steigungAlt) < 1e-9, steigungNeu + " / " + steigungAlt);
  assert.ok(Math.abs(steigungNeu - 0.0025) < 1e-9, "erwartet 0,0025 je Elo-Punkt: " + steigungNeu);
});

test("Erster Sieg rund +0,04, drei Siege rund +0,11 — praktisch wie vorher", () => {
  /* Gespielt gegen einen gleich starken, mitwandernden Gegner: genau
     der Fall, der in der App am haeufigsten vorkommt. Die alte Formel
     steht zum Vergleich daneben. */
  const alt = (elo) => 0.5 * Math.tanh((elo - 1000) / 200);
  let elo = ELO_START;
  let gegner = ELO_START;
  const nachSieg = [];
  for (let i = 0; i < 3; i++) {
    const n = eloNeu(elo, gegner);
    elo = n.gewinner;
    gegner = n.verlierer;
    nachSieg.push(elo);
  }

  const ersterSieg = app.duellZuschlag(nachSieg[0]);
  const dritterSieg = app.duellZuschlag(nachSieg[2]);

  assert.ok(Math.abs(ersterSieg - 0.04) < 0.005, "erster Sieg: " + ersterSieg);
  assert.ok(Math.abs(dritterSieg - 0.11) < 0.01, "dritter Sieg: " + dritterSieg);

  // Und der Abstand zur alten Formel ist in beiden Faellen winzig.
  assert.ok(Math.abs(ersterSieg - alt(nachSieg[0])) < 0.005);
  assert.ok(Math.abs(dritterSieg - alt(nachSieg[2])) < 0.005);
});

/* ---------------------------------------------------------------- *
 * 3. Elo-Symmetrie
 * ---------------------------------------------------------------- */

test("Was der Gewinner gewinnt, verliert der Verlierer", () => {
  for (const [a, b] of [[1000, 1000], [1200, 800], [800, 1200], [1000, 1013.7], [2400, 100]]) {
    const neu = eloNeu(a, b);
    const gewonnen = neu.gewinner - a;
    const verloren = b - neu.verlierer;
    assert.ok(Math.abs(gewonnen - verloren) < 1e-9, a + " vs " + b + ": " + gewonnen + " / " + verloren);
    // Die Summe beider Zahlen bleibt damit erhalten.
    assert.ok(Math.abs(neu.gewinner + neu.verlierer - (a + b)) < 1e-9);
  }
});

test("Bei gleichem Stand wechselt die halbe K-Zahl die Seite", () => {
  const neu = eloNeu(1000, 1000);
  assert.equal(neu.gewinner, 1000 + ELO_K / 2);
  assert.equal(neu.verlierer, 1000 - ELO_K / 2);
});

test("Die Erwartung liegt zwischen 0 und 1 und ergaenzt sich zu 1", () => {
  for (const [a, b] of [[1000, 1000], [1400, 1000], [1000, 1400], [3000, 100]]) {
    const ea = eloErwartung(a, b);
    const eb = eloErwartung(b, a);
    assert.ok(ea > 0 && ea < 1, "Erwartung " + ea);
    assert.ok(Math.abs(ea + eb - 1) < 1e-12);
  }
  assert.equal(eloErwartung(1000, 1000), 0.5);
});

test("Der Ueberraschungssieg verschiebt mehr als der erwartete", () => {
  const erwartet = eloNeu(1400, 1000).gewinner - 1400;
  const ueberraschung = eloNeu(1000, 1400).gewinner - 1000;
  assert.ok(ueberraschung > erwartet);
  assert.ok(ueberraschung < ELO_K, "hoechstens K, nie mehr");
  assert.ok(erwartet > 0, "auch der erwartete Sieg bringt etwas");
});

test("Die Elo-Zahl wird nicht gedeckelt", () => {
  let elo = ELO_START;
  for (let i = 0; i < 200; i++) elo = eloNeu(elo, 1000).gewinner;
  assert.ok(elo > 1400, "Elo blieb bei " + elo + " haengen");
});

/* ---------------------------------------------------------------- *
 * 4. Begrenzung der Anzeige, Sortierung mit dem unbegrenzten Wert
 * ---------------------------------------------------------------- */

test("Die angezeigte Endnote wird auf 0 bis 10 begrenzt", () => {
  // Alle Kriterien und das Bauchgefuehl auf 10 -> Klammerteil 10,00.
  const hoch = eintrag(10, 10, { elo: 1300 });
  const roh = app.entryScore(hoch, "movie");
  assert.ok(roh > 10, "der unbegrenzte Wert muss ueber 10 liegen, ist " + roh);
  assert.equal(app.anzeigeNote(roh), 10);

  const tief = eintrag(0, 0, { elo: 700 });
  const rohTief = app.entryScore(tief, "movie");
  assert.ok(rohTief < 0, "der unbegrenzte Wert muss unter 0 liegen, ist " + rohTief);
  assert.equal(app.anzeigeNote(rohTief), 0);

  // Innerhalb des Bereichs aendert die Begrenzung nichts.
  assert.equal(app.anzeigeNote(7.42), 7.42);
  assert.equal(app.anzeigeNote(null), null);
});

test("Zwei Eintraege, die beide bei 10,00 anstossen, bleiben unterscheidbar", () => {
  const stark = { ...eintrag(10, 10, { elo: 1400 }), id: "stark" };
  const schwaecher = { ...eintrag(10, 10, { elo: 1050 }), id: "schwaecher" };

  const a = app.entryScore(stark, "movie");
  const b = app.entryScore(schwaecher, "movie");
  assert.ok(a > b, "unbegrenzt muessen sie sich unterscheiden: " + a + " / " + b);
  assert.equal(app.anzeigeNote(a), 10);
  assert.equal(app.anzeigeNote(b), 10);

  // Sortiert wird mit dem unbegrenzten Wert — der Staerkere steht vorn.
  const sortiert = [schwaecher, stark]
    .map((f) => ({ id: f.id, score: app.entryScore(f, "movie") }))
    .sort((x, y) => app.sortWert(y.score) - app.sortWert(x.score))
    .map((f) => f.id);
  assert.deepEqual(sortiert, ["stark", "schwaecher"]);

  /* Mit der begrenzten Note waeren beide gleich — genau das soll die
     Trennung von Anzeige und Sortierung verhindern. */
  assert.equal(app.anzeigeNote(a), app.anzeigeNote(b));
});

test("Die Endnote wird weiterhin auf zwei Nachkommastellen gerundet", () => {
  const e = eintrag([8, 7, 9, 6, 7, 8, 9], 7.3, { elo: 1137 });
  const score = app.entryScore(e, "movie");
  assert.equal(score, Math.round(score * 100) / 100);
  assert.ok(String(score).split(".")[1] === undefined || String(score).split(".")[1].length <= 2);
});

test("Der Zuschlag steht mit Vorzeichen und zwei Nachkommastellen da", () => {
  assert.equal(app.zuschlagText(0), "+0.00");
  assert.equal(app.zuschlagText(0.3808), "+0.38");
  assert.equal(app.zuschlagText(-0.3808), "−0.38");
  // Ein Wert, der auf zwei Stellen null ist, bekommt kein Minus.
  assert.equal(app.zuschlagText(-0.001), "+0.00");
});

/* ---------------------------------------------------------------- *
 * 4b. Die Statistik-Kennzahlen rechnen mit der begrenzten Note
 * ---------------------------------------------------------------- */

/* Eine Liste, wie die Rangliste sie liefert: Eintraege mit `score`,
   also der unbegrenzten Endnote. */
function mitNoten(noten) {
  return noten.map((score, i) => ({ id: "id" + i, score }));
}

test("Der Hoechstwert wird bei 10,00 abgeschnitten", () => {
  /* Die Skala geht bis 10. Ein Eintrag, den ein Duell-Zuschlag
     darueber schiebt, darf in den Kennzahlen nicht mit 10,21
     dastehen. */
  const stats = app.statsFor(mitNoten([10.21, 8.5, 7.0]));
  assert.equal(stats.max, 10);
  assert.equal(stats.count, 3);
});

test("Der Tiefstwert wird bei 0,00 abgeschnitten", () => {
  const stats = app.statsFor(mitNoten([-0.34, 2.5, 6.0]));
  assert.equal(stats.min, 0);
});

test("Der Durchschnitt rechnet mit den begrenzten Werten", () => {
  /* Unbegrenzt waere der Schnitt (10.4 + 9 + 8) / 3 = 9.1333…,
     begrenzt ist er (10 + 9 + 8) / 3 = 9. */
  const stats = app.statsFor(mitNoten([10.4, 9, 8]));
  assert.equal(stats.avg, 9);
  assert.notEqual(stats.avg, (10.4 + 9 + 8) / 3);

  // Und am unteren Ende genauso.
  assert.equal(app.statsFor(mitNoten([-1, 1, 3])).avg, (0 + 1 + 3) / 3);
});

test("Aus einer echten Endnote ueber 10 wird in der Statistik 10,00", () => {
  /* Nicht von Hand gesetzt, sondern ueber den ganzen Weg gerechnet:
     Klammerteil 10,00 plus Zuschlag aus einer erspielten Elo. */
  const hoch = eintrag(10, 10, { elo: 1300 });
  const score = app.entryScore(hoch, "movie");
  assert.ok(score > 10, "die Endnote muss unbegrenzt ueber 10 liegen, ist " + score);

  const stats = app.statsFor([{ id: "a", score }, { id: "b", score: 7 }]);
  assert.equal(stats.max, 10);
  assert.equal(stats.max.toFixed(2), "10.00");
});

test("Innerhalb von 0 bis 10 aendert die Begrenzung keine Kennzahl", () => {
  /* Der Regressionsfall: solange keine Endnote den Bereich verlaesst
     — und ohne gespieltes Duell tut das keine —, muss jede Kennzahl
     Ziffer fuer Ziffer dieselbe sein wie vorher. */
  const noten = [9.37, 8.02, 7.5, 6.13, 4.88, 2.4, 0, 10];
  const stats = app.statsFor(mitNoten(noten));
  assert.equal(stats.count, noten.length);
  assert.equal(stats.max, 10);
  assert.equal(stats.min, 0);
  assert.equal(stats.avg, noten.reduce((s, v) => s + v, 0) / noten.length);
});

test("Bei elo = 1000 aendert sich in der Statistik kein Wert", () => {
  /* Gerechnet ueber echte Eintraege, einmal ohne die neuen Felder und
     einmal mit ausdruecklichem Startwert — verglichen wird gegen die
     Kennzahlen aus der alten Endnoten-Formel. */
  const eintraege = [
    eintrag([9, 8, 9, 8, 9, 8, 9], 9),
    eintrag([8, 7, 9, 6, 7, 8, 9], 7.4),
    eintrag([5, 6, 5, 4, 6, 5, 6], 5.2),
    eintrag([2, 3, 1, 2, 3, 2, 1], 2),
  ];

  const vorher = app.statsFor(eintraege.map((e, i) => ({ id: "id" + i, score: endnoteVorher(e) })));

  for (const zusatz of [{}, { elo: app.ELO_START }, { elo: 1000, duels: 9 }]) {
    const jetzt = app.statsFor(
      eintraege.map((e, i) => ({ id: "id" + i, score: app.entryScore({ ...e, ...zusatz }, "movie") }))
    );
    assert.deepEqual(jetzt, vorher, "Kennzahlen weichen ab bei " + JSON.stringify(zusatz));
  }
});

test("Unbewertete Eintraege fliessen weiterhin nicht in die Kennzahlen ein", () => {
  /* Bestand: sie zaehlen bei `count` mit, aber nicht im Schnitt.
     Daran aendert die Begrenzung nichts. */
  const stats = app.statsFor([{ id: "a", score: 8 }, { id: "b", score: null }, { id: "c", score: 6 }]);
  assert.equal(stats.count, 3);
  assert.equal(stats.avg, 7);
  assert.equal(stats.max, 8);
  assert.equal(stats.min, 6);
});

test("Eine leere Liste bleibt bei den bisherigen Nullen", () => {
  assert.deepEqual(app.statsFor([]), { count: 0, avg: 0, max: 0, min: 0 });
});

test("Sortiert wird trotzdem weiter mit dem unbegrenzten Wert", () => {
  /* Die Begrenzung sitzt in den Kennzahlen, nicht in der Sortierung —
     zwei Eintraege, die beide bei 10,00 anstossen, bleiben in der
     Rangliste unterscheidbar. */
  const stark = { id: "stark", score: 10.4 };
  const schwaecher = { id: "schwaecher", score: 10.05 };
  assert.equal(app.statsFor([stark, schwaecher]).max, 10);

  const sortiert = [schwaecher, stark]
    .sort((a, b) => app.sortWert(b.score) - app.sortWert(a.score))
    .map((f) => f.id);
  assert.deepEqual(sortiert, ["stark", "schwaecher"]);
});

/* ---------------------------------------------------------------- *
 * 4c. Notenfilter: Vorschau und Ergebnisliste nennen dieselbe Zahl
 * ---------------------------------------------------------------- */

test("Ein Eintrag ueber 10,00 faellt beim voreingestellten Bereich nicht heraus", () => {
  /* Der Notenfilter geht bis 10. Ohne Begrenzung waere ein Eintrag,
     den ein Duell-Zuschlag darueber schiebt, schon bei der
     Voreinstellung unsichtbar. */
  const hoch = eintrag(10, 10, { elo: 1300 });
  const score = app.entryScore(hoch, "movie");
  assert.ok(score > 10, "die Endnote muss unbegrenzt ueber 10 liegen, ist " + score);

  assert.equal(app.imNotenbereich(score, app.DEFAULT_FILTER.min, app.DEFAULT_FILTER.max), true);
});

test("Vorschau und angewendeter Filter zaehlen denselben Eintrag", () => {
  /* Die Vorschau im Filterblatt ("N Einträge") und die Liste danach
     stellen dieselbe Frage — beide ueber imNotenbereich. Genau das
     hielt frueher nicht: die Vorschau verglich unbegrenzt, die Liste
     begrenzt, und bei einem Eintrag ueber 10,00 wichen die Zahlen
     auseinander. */
  const ueberZehn = app.entryScore(eintrag(10, 10, { elo: 1300 }), "movie");
  const unterNull = app.entryScore(eintrag(0, 0, { elo: 700 }), "movie");
  assert.ok(ueberZehn > 10 && unterNull < 0);

  const liste = [
    { id: "drueber", score: ueberZehn },
    { id: "drunter", score: unterNull },
    { id: "mittig", score: 7.42 },
    { id: "ohne", score: null },
  ];

  /* Nachgestellt wird beides so, wie es in src/App.jsx steht: die
     Vorschau ohne die unbewerteten Eintraege, die Liste mit dem
     Rueckfall fuer sie. Beim voreingestellten Bereich ist er offen,
     die beiden Zahlen muessen also gleich sein. */
  const vorschau = (min, max) =>
    liste.filter((f) => app.imNotenbereich(f.score, Math.min(min, max), Math.max(min, max))).length;
  const angewendet = (min, max) => {
    const bereichOffen = min === app.DEFAULT_FILTER.min && max === app.DEFAULT_FILTER.max;
    return liste.filter((f) =>
      typeof f.score === "number" ? app.imNotenbereich(f.score, min, max) : bereichOffen
    ).length;
  };

  // Voreingestellt: alle drei bewerteten Eintraege, der ueber 10 dabei.
  const { min, max } = app.DEFAULT_FILTER;
  assert.equal(vorschau(min, max), 3);
  assert.equal(angewendet(min, max), 3 + 1, "der unbewertete Eintrag bleibt bei offenem Bereich sichtbar");

  /* Und so haette die Vorschau frueher gezaehlt: unbegrenzt. Der
     Unterschied ist genau der Fehler, um den es geht — stuende er
     nicht hier, koennte der Test nicht belegen, dass die Aenderung
     ueberhaupt etwas bewirkt. */
  const vorschauAlt = (min, max) =>
    liste.filter(
      (f) => typeof f.score === "number" && f.score >= Math.min(min, max) && f.score <= Math.max(min, max)
    ).length;
  assert.equal(vorschauAlt(min, max), 1, "unbegrenzt fielen zwei der drei heraus");
  assert.notEqual(vorschauAlt(min, max), vorschau(min, max));

  // Der Eintrag ueber 10,00 zaehlt genau dort, wo seine Anzeige steht.
  assert.equal(app.imNotenbereich(ueberZehn, 10, 10), true, "10,00 ist seine angezeigte Note");
  assert.equal(app.imNotenbereich(ueberZehn, 0, 9.9), false);
  // Und der unter 0,00 genauso.
  assert.equal(app.imNotenbereich(unterNull, 0, 0), true);
  assert.equal(app.imNotenbereich(unterNull, 0.1, 10), false);
});

test("Beide Stellen im Quelltext stellen die Frage ueber imNotenbereich", async () => {
  /* Der eigentliche Schutz gegen einen Rueckfall: Vorschau und
     angewendeter Filter duerfen den Bereich nicht mehr selbst
     vergleichen. Taeten sie es wieder getrennt, koennten sie erneut
     auseinanderlaufen — und das faellt in einem Test ueber Funktionen
     allein nicht auf, weil beide Stellen in Komponenten stecken. */
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  const aufrufe = quelle.match(/imNotenbereich\(/g) || [];
  assert.ok(aufrufe.length >= 3, "imNotenbereich wird nicht an beiden Stellen benutzt");

  // Kein roher Vergleich einer Endnote gegen eine Filtergrenze mehr.
  const roh = quelle.match(/\bf\.score\s*[<>]=?\s*(lo|hi|filterState\.(min|max))/g) || [];
  assert.deepEqual(roh, [], "es wird wieder unbegrenzt verglichen: " + roh.join(", "));
});

test("Ohne Note gibt es keinen Bereichstreffer", () => {
  /* Unbewertete Eintraege beantwortet die Frage mit nein. Dass sie
     bei offenem Bereich trotzdem sichtbar bleiben, entscheidet die
     Liste daneben — nicht dieser Vergleich. */
  assert.equal(app.imNotenbereich(null, 0, 10), false);
  assert.equal(app.imNotenbereich(undefined, 0, 10), false);
  assert.equal(app.imNotenbereich("8", 0, 10), false);
});

test("Innerhalb von 0 bis 10 vergleicht der Filter wie vorher", () => {
  /* Ohne gespieltes Duell liegt jede Endnote im Bereich — dort darf
     die Begrenzung nichts veraendern. */
  for (const score of [0, 0.01, 2.5, 5, 7.42, 9.99, 10]) {
    for (const [von, bis] of [[0, 10], [5, 10], [0, 5], [7, 8]]) {
      assert.equal(
        app.imNotenbereich(score, von, bis),
        score >= von && score <= bis,
        "Note " + score + " im Bereich " + von + "–" + bis
      );
    }
  }
});

/* ---------------------------------------------------------------- *
 * 5. Ein Duell laesst Bauchgefuehl und Kriterien in Ruhe
 * ---------------------------------------------------------------- */

test("Ein Duell veraendert Bauchgefuehl und Kriterienwerte nicht", () => {
  /* Nachgespielt wird, was duellAuswerten tut: es uebernimmt aus der
     Antwort des Servers genau `elo` und `duels`. Alles andere bleibt
     stehen. */
  const vorher = eintrag([8, 7, 9, 6, 7, 8, 9], 7.4, { elo: 1000, duels: 0 });
  const antwort = eloNeu(1000, 1000);
  const nachher = { ...vorher, elo: antwort.gewinner, duels: vorher.duels + 1 };

  assert.equal(nachher.personal, vorher.personal);
  assert.deepEqual(nachher.values, vorher.values);
  assert.deepEqual(nachher.seasons, vorher.seasons);

  // Der Klammerteil der Endnote bleibt dadurch Ziffer fuer Ziffer gleich.
  assert.equal(app.entryBasisScore(nachher, "movie"), app.entryBasisScore(vorher, "movie"));
  // Die Endnote selbst wandert — allein ueber den Zuschlag.
  assert.ok(app.entryScore(nachher, "movie") > app.entryScore(vorher, "movie"));
  assert.equal(
    Math.round((app.entryBasisScore(vorher, "movie") + app.duellZuschlag(antwort.gewinner)) * 100) / 100,
    app.entryScore(nachher, "movie")
  );
});

test("Der Klammerteil haengt nicht an der Elo", () => {
  const werte = [8, 7, 9, 6, 7, 8, 9];
  const basis = app.entryBasisScore(eintrag(werte, 7.4), "movie");
  for (const elo of [500, 900, 1000, 1100, 2000]) {
    assert.equal(app.entryBasisScore(eintrag(werte, 7.4, { elo }), "movie"), basis);
  }
});

/* ---------------------------------------------------------------- *
 * 6. Backup ohne die neuen Felder
 * ---------------------------------------------------------------- */

test("Ein Backup ohne elo und duels setzt die Standardwerte", () => {
  /* So sieht ein Eintrag in jeder Sicherung von vor dieser Aenderung
     aus: kein elo, kein duels. Der Import muss daraus 1000 und 0
     machen — dieselbe Regel, die der Server ueber normalizeElo und
     den Spalten-DEFAULT anwendet. */
  const ausBackup = { title: "Alt", values: {}, personal: 7 };

  assert.equal(normalizeElo(ausBackup.elo), null, "fehlt -> der gespeicherte Wert bleibt");
  assert.equal(normalizeDuels(ausBackup.duels), null);
  assert.equal(normalizeSiege(ausBackup.siege), null);
  assert.equal(normalizeElo(ausBackup.elo) ?? ELO_START, ELO_START);
  assert.equal(normalizeDuels(ausBackup.duels) ?? 0, 0);
  assert.equal(normalizeSiege(ausBackup.siege) ?? 0, 0);

  // Und im Frontend: ohne die Felder ist der Zuschlag exakt 0.
  assert.equal(app.entryElo(ausBackup), app.ELO_START);
  assert.equal(app.entryDuels(ausBackup), 0);
  assert.equal(app.entrySiege(ausBackup), 0);
  assert.equal(app.entryZuschlag(ausBackup), 0);
});

test("Ein Backup MIT den Feldern bringt sie mit", () => {
  assert.equal(normalizeElo(1234.5), 1234.5);
  assert.equal(normalizeDuels(9), 9);
  assert.equal(normalizeSiege(6), 6);
  // Unsinn faellt heraus und wird zum Standardwert.
  assert.equal(normalizeElo("1200"), null);
  assert.equal(normalizeElo(NaN), null);
  assert.equal(normalizeDuels(-4), 0);
  assert.equal(normalizeDuels(3.7), 4);
  assert.equal(normalizeSiege(-4), 0);
  assert.equal(normalizeSiege("6"), null);
  assert.equal(normalizeSiege(NaN), null);
});
