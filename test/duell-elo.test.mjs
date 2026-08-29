/**
 * Tests fuer die Duell-Wertung.
 *
 * Ein Duell aendert seit dieser Umstellung nicht mehr das Bauchgefuehl
 * eines Eintrags, sondern nur noch dessen Elo-Zahl. Daraus entsteht ein
 * gedeckelter Zuschlag auf die Endnote:
 *
 *   Endnote = (0,75 x Kriteriennote + 0,25 x Bauchgefuehl) + Zuschlag
 *   Zuschlag = 0,5 x tanh((elo - 1000) / 200)
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

import { eloNeu, eloErwartung, ELO_START, ELO_K, normalizeElo, normalizeDuels } from "../api/_db.js";

const GEPRUEFT = [
  "entryScore",
  "entryBasisScore",
  "computeFinalScore",
  "computeCriteriaScore",
  "duellZuschlag",
  "entryZuschlag",
  "entryElo",
  "entryDuels",
  "anzeigeNote",
  "zuschlagText",
  "sortWert",
  "statsFor",
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
});

/* ---------------------------------------------------------------- *
 * 2. Der Zuschlag verlaesst nie das Intervall
 * ---------------------------------------------------------------- */

test("Der Zuschlag bleibt zwischen -0,5 und +0,5 — auch nach 50 Siegen", () => {
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
     Genauigkeit ist er ab rund 3800 Punkten Abstand nicht mehr von 1
     zu unterscheiden — dort steht der Zuschlag dann auf glatt 0,5.
     Verlassen wird das Intervall auch dann nicht, und um dorthin zu
     kommen braeuchte es rund 240 Siege in Folge gegen gleich starke
     Gegner. Bis dahin (siehe der Test darueber mit 50 Siegen) bleibt
     der Abstand zur Grenze echt. */
  for (const elo of [-1e9, 0, 500, 1000, 5000, 1e9]) {
    const z = app.duellZuschlag(elo);
    assert.ok(z >= -app.ZUSCHLAG_MAX && z <= app.ZUSCHLAG_MAX, "Zuschlag bei elo " + elo + ": " + z);
  }
  // Im realistischen Bereich bleibt der Abstand zur Grenze echt.
  assert.ok(app.duellZuschlag(2000) < app.ZUSCHLAG_MAX);
  assert.ok(app.duellZuschlag(2000) > 0.4999);
  assert.ok(app.duellZuschlag(0) > -app.ZUSCHLAG_MAX);
});

test("Der Zuschlag folgt der vorgegebenen Formel", () => {
  for (const elo of [700, 900, 1000, 1100, 1200, 1400, 1800]) {
    assert.equal(app.duellZuschlag(elo), 0.5 * Math.tanh((elo - 1000) / 200));
  }
  // Zwei Bezugspunkte zum Nachrechnen von Hand.
  assert.ok(Math.abs(app.duellZuschlag(1200) - 0.3808) < 0.0001);
  assert.ok(Math.abs(app.duellZuschlag(800) + 0.3808) < 0.0001);
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
  assert.equal(normalizeElo(ausBackup.elo) ?? ELO_START, ELO_START);
  assert.equal(normalizeDuels(ausBackup.duels) ?? 0, 0);

  // Und im Frontend: ohne die Felder ist der Zuschlag exakt 0.
  assert.equal(app.entryElo(ausBackup), app.ELO_START);
  assert.equal(app.entryDuels(ausBackup), 0);
  assert.equal(app.entryZuschlag(ausBackup), 0);
});

test("Ein Backup MIT den Feldern bringt sie mit", () => {
  assert.equal(normalizeElo(1234.5), 1234.5);
  assert.equal(normalizeDuels(9), 9);
  // Unsinn faellt heraus und wird zum Standardwert.
  assert.equal(normalizeElo("1200"), null);
  assert.equal(normalizeElo(NaN), null);
  assert.equal(normalizeDuels(-4), 0);
  assert.equal(normalizeDuels(3.7), 4);
});
