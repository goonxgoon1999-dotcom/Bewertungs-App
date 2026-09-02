/**
 * Tests fuer die Sammelfunktion „Alle Duell-Zuschläge verrechnen" in
 * den Einstellungen (Daten-Panel) — die Vorschau
 * (sammelVerrechnungsPlan), die Rechnung je Eintrag
 * (sammelVerrechnung), die Anfrage ans Backend
 * (sammelVerrechnungsAnfrage) und der Kasten im Panel
 * (SammelVerrechnen).
 *
 * Wie in duell-zuschlag-verrechnen.test.mjs wird src/App.jsx im
 * Original geprueft: uebersetzt, um eine Ausfuhrliste ergaenzt,
 * geladen. Der Kasten wird mit renderToStaticMarkup wirklich
 * gerendert.
 *
 * Der Datensatz dahinter ist keine Handvoll gestellter Zahlen,
 * sondern ein vollstaendiger Bestand in Echtformat: gut hundert
 * Eintraege ueber alle sieben Kategorien, Serien teils mit Staffeln
 * und eigener Gewichtung, Vorgemerktes ohne Bewertung — und die
 * Elo-Zahlen stammen aus rund viertausend ausgespielten Duellen, die
 * mit der Elo-Rechnung des Servers (eloNeu aus api/_db.js) gefuehrt
 * werden. Die Zuschlaege sind damit erspielt und nicht gesetzt.
 *
 * Die Zusagen:
 *
 *   1. Die Vorschau rechnet nur — kein Eintrag des Datensatzes wird
 *      dabei angefasst.
 *   2. Betroffen ist genau, was auch einzeln angeboten wuerde: ab 10
 *      Duellen und ab Betrag 0,05.
 *   3. Verteilt wird gleichmaessig: jedes Kriterium um Zuschlag /
 *      0,75, auf das Hundertstel.
 *   4. Ueber den ganzen Datensatz weicht keine Endnote eines
 *      verrechneten Eintrags um mehr als 0,01 ab.
 *   5. Was unter 0 oder ueber 10 fiele, wird uebersprungen und
 *      namentlich genannt — nicht gekappt.
 *   6. Nicht betroffene Eintraege bleiben Ziffer fuer Ziffer gleich.
 *   7. Geschrieben wird `elo` auf 1000; `duels` und `siege` gehen
 *      unveraendert mit.
 *   8. Der Kasten im Panel zeigt zuerst nur den Vorschau-Knopf und
 *      nennt die uebersprungenen Titel beim Namen.
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

import { eloNeu } from "../api/_db.js";

const GEPRUEFT = [
  "SAMMEL_SCHRITT",
  "SAMMEL_MAX_ABWEICHUNG",
  "aufSammelSchritt",
  "sammelVerrechnung",
  "sammelVerrechnungsPlan",
  "sammelVerrechnungsAnfrage",
  "sammelVorschauText",
  "SammelVerrechnen",
  "verrechnenAngeboten",
  "verrechnungsWeg",
  "VERRECHNEN_MIN_DUELLE",
  "VERRECHNEN_MIN_BETRAG",
  "VERRECHNEN_ANTEIL_KRITERIEN",
  "BEWERTUNG_MIN",
  "BEWERTUNG_MAX",
  "entryScore",
  "entryZuschlag",
  "entryDuels",
  "entrySiege",
  "entryCriterionValue",
  "hasSeasons",
  "criteriaFor",
  "duellZuschlag",
  "CATEGORIES",
  "CATEGORY_KEYS",
  "ELO_START",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-sammel-"));
  const datei = join(verzeichnis, "sammel.mjs");
  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );
  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();

/* ----------------------------------------------------------------
   Der Datensatz

   Ein Zufallsgenerator mit festem Startwert — der Bestand ist damit
   in jedem Lauf derselbe, und ein Fehlschlag laesst sich nachstellen.
   ---------------------------------------------------------------- */

function zufall(startwert) {
  let z = startwert >>> 0;
  return () => {
    z = (z + 0x6d2b79f5) >>> 0;
    let t = Math.imul(z ^ (z >>> 15), 1 | z);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wuerfel = zufall(20240917);

/** Ein Bewertungswert auf der Stufe des Schiebers (0,1). */
function stufenwert(min, max) {
  return Math.round((min + wuerfel() * (max - min)) * 10) / 10;
}

function werteFuer(category, min, max) {
  const values = {};
  for (const c of app.criteriaFor(category)) values[c.key] = stufenwert(min, max);
  return values;
}

/* Wie viele Eintraege je Kategorie — grob die Verteilung einer
   gewachsenen Sammlung. */
const BESTAND = {
  movie: 34, series: 22, anime: 16, kids: 9, adultanim: 8, doku: 9, game: 18,
};

/* Titel gibt es nicht als Liste; sie werden durchnummeriert, sind
   aber je Eintrag verschieden — die uebersprungenen muessen sich
   namentlich auseinanderhalten lassen. */
function datensatz() {
  const items = {};
  for (const catKey of app.CATEGORY_KEYS) {
    const singular = app.CATEGORIES.find((c) => c.key === catKey).singular;
    const liste = [];
    for (let i = 0; i < BESTAND[catKey]; i++) {
      const id = catKey + "-" + (i + 1);
      const titel = singular + " " + (i + 1);
      /* Jeder zehnte Eintrag ist nur vorgemerkt: keine Bewertung,
         keine Duelle. Er darf von der Sammelaktion nie beruehrt
         werden. */
      if (i % 10 === 9) {
        liste.push({
          id, category: catKey, title: titel, poster: "", watchlist: true,
          values: {}, personal: null, seasons: [],
          elo: app.ELO_START, duels: 0, siege: 0, watchCount: 0,
        });
        continue;
      }

      /* Serienarten bekommen zu einem Drittel Staffeln, teils mit
         eigener Gewichtung. */
      const mitStaffeln = ["series", "anime", "kids", "adultanim"].includes(catKey) && i % 3 === 0;
      const seasons = [];
      if (mitStaffeln) {
        const anzahl = 2 + Math.floor(wuerfel() * 4);
        for (let s = 0; s < anzahl; s++) {
          seasons.push({
            seasonNumber: s + 1,
            values: werteFuer(catKey, 4, 9.4),
            personal: stufenwert(4, 9.6),
            weight: [1, 1, 1, 0.5, 1.5][Math.floor(wuerfel() * 5)],
          });
        }
      }

      liste.push({
        id, category: catKey, title: titel, poster: "", watchlist: false,
        values: mitStaffeln ? werteFuer(catKey, 4, 9.4) : werteFuer(catKey, 3.2, 9.6),
        personal: stufenwert(3, 9.8),
        seasons,
        elo: app.ELO_START, duels: 0, siege: 0, watchCount: 1,
      });
    }

    /* Zwei Eintraege stehen bewusst am Rand: einer schon fast auf 10,
       einer schon fast auf 0. Bei ihnen kann der Zuschlag nicht in die
       Kriterien passen — sie sind der Pruefstein fuer „wird
       uebersprungen statt gekappt". */
    const hoch = {
      id: catKey + "-spitze", category: catKey, title: "Spitzenreiter (" + singular + ")",
      poster: "", watchlist: false,
      values: werteFuer(catKey, 9.9, 10), personal: 9.9, seasons: [],
      elo: app.ELO_START, duels: 0, siege: 0, watchCount: 1,
    };
    const tief = {
      id: catKey + "-keller", category: catKey, title: "Kellerkind (" + singular + ")",
      poster: "", watchlist: false,
      values: werteFuer(catKey, 0, 0.1), personal: 0.2, seasons: [],
      elo: app.ELO_START, duels: 0, siege: 0, watchCount: 1,
    };
    liste.push(hoch, tief);
    items[catKey] = liste;
  }
  return items;
}

/* Duelle ausspielen — mit der Elo-Rechnung des Servers. Wer die
   hoehere Endnote hat, gewinnt meistens; Ueberraschungen gibt es
   genau wie im Betrieb, sonst kaeme nie ein negativer Zuschlag
   zustande. */
function spieleDuelle(items, proKategorie) {
  for (const catKey of app.CATEGORY_KEYS) {
    /* Vorgemerktes spielt nicht mit — im Betrieb stehen im Duell nur
       bewertete Titel. */
    const spieler = items[catKey].filter((e) => !e.watchlist);
    if (spieler.length < 2) continue;
    for (let n = 0; n < proKategorie; n++) {
      const a = spieler[Math.floor(wuerfel() * spieler.length)];
      let b = spieler[Math.floor(wuerfel() * spieler.length)];
      if (a === b) continue;
      const scoreA = app.entryScore(a, catKey);
      const scoreB = app.entryScore(b, catKey);
      const besser = scoreA >= scoreB ? a : b;
      const schlechter = besser === a ? b : a;
      // In drei von zehn Faellen gewinnt der Schwaechere.
      const gewinner = wuerfel() < 0.3 ? schlechter : besser;
      const verlierer = gewinner === besser ? schlechter : besser;
      const neu = eloNeu(gewinner.elo, verlierer.elo);
      gewinner.elo = neu.gewinner;
      gewinner.duels += 1;
      gewinner.siege += 1;
      verlierer.elo = neu.verlierer;
      verlierer.duels += 1;
    }
  }
  return items;
}

const ITEMS = spieleDuelle(datensatz(), 600);
const ALLE = app.CATEGORY_KEYS.flatMap((k) => ITEMS[k].map((e) => ({ catKey: k, entry: e })));

/* Der Datensatz muss ueberhaupt etwas zu verrechnen hergeben, sonst
   pruefen die Tests darunter nichts. */
test("Der Datensatz ist ein tragfaehiger Pruefstein", () => {
  assert.ok(ALLE.length > 100, "zu wenige Eintraege: " + ALLE.length);
  const betroffen = ALLE.filter((x) => app.verrechnenAngeboten(x.entry));
  assert.ok(betroffen.length > 30, "zu wenige betroffene Eintraege: " + betroffen.length);
  const positiv = betroffen.filter((x) => app.entryZuschlag(x.entry) > 0).length;
  const negativ = betroffen.filter((x) => app.entryZuschlag(x.entry) < 0).length;
  assert.ok(positiv > 5 && negativ > 5, "Zuschlaege nur in eine Richtung: +" + positiv + " / -" + negativ);
  const mitStaffeln = ALLE.filter((x) => app.hasSeasons(x.entry) && app.verrechnenAngeboten(x.entry));
  assert.ok(mitStaffeln.length > 0, "kein betroffener Eintrag mit Staffeln");
});

/* Die Endnoten vor dem Vorgang — und der Bestand als Tiefenkopie,
   damit sich hinterher jede Aenderung nachweisen laesst. */
const NOTEN_VORHER = new Map(ALLE.map((x) => [x.entry.id, app.entryScore(x.entry, x.catKey)]));
const KOPIE_VORHER = JSON.parse(JSON.stringify(ITEMS));

const PLAN = app.sammelVerrechnungsPlan(ITEMS);

test("Die Vorschau rechnet nur — sie fasst keinen Eintrag an", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(ITEMS)), KOPIE_VORHER);
  /* Und sie sagt, worum es geht. */
  assert.ok(PLAN.betroffen > 0);
  assert.equal(PLAN.betroffen, PLAN.verrechenbar.length + PLAN.uebersprungen.length);
  assert.match(app.sammelVorschauText(PLAN), new RegExp(String(PLAN.betroffen) + " Einträge betroffen"));
});

test("Betroffen ist genau, was auch einzeln angeboten wuerde", () => {
  const imPlan = new Set([...PLAN.verrechenbar, ...PLAN.uebersprungen].map((v) => v.id));
  for (const { catKey, entry } of ALLE) {
    const erwartet = app.verrechnenAngeboten(entry);
    assert.equal(
      imPlan.has(entry.id), erwartet,
      entry.title + " (" + catKey + "): " + app.entryDuels(entry) + " Duelle, Zuschlag " +
        app.entryZuschlag(entry).toFixed(3)
    );
  }
  /* Die beiden Schwellen ausdruecklich: darunter passiert nichts. */
  for (const v of [...PLAN.verrechenbar, ...PLAN.uebersprungen]) {
    assert.ok(v.duels >= app.VERRECHNEN_MIN_DUELLE, v.titel + " hat nur " + v.duels + " Duelle");
    assert.ok(
      Math.round(Math.abs(v.zuschlag) * 100) / 100 >= app.VERRECHNEN_MIN_BETRAG,
      v.titel + " hat nur den Zuschlag " + v.zuschlag
    );
  }
});

test("Nichts geht ohne Bewertung durch", () => {
  const namen = new Set([...PLAN.verrechenbar, ...PLAN.uebersprungen].map((v) => v.id));
  for (const { entry } of ALLE) {
    if (entry.watchlist) assert.ok(!namen.has(entry.id), entry.title + " ist nur vorgemerkt");
  }
});

test("Verteilt wird gleichmaessig auf die Kriterien: Zuschlag / 0,75", () => {
  for (const v of PLAN.verrechenbar) {
    const soll = Math.round((v.zuschlag / app.VERRECHNEN_ANTEIL_KRITERIEN) * 100) / 100;
    assert.equal(v.proFeld, soll, v.titel);

    const vorher = ITEMS[v.category].find((e) => e.id === v.id);
    const kriterien = app.criteriaFor(v.category);
    const quellenVorher = app.hasSeasons(vorher) ? vorher.seasons : [vorher];
    const quellenNachher = app.hasSeasons(vorher) ? v.entwurf.seasons : [v.entwurf];
    assert.equal(quellenVorher.length, quellenNachher.length);
    for (let i = 0; i < quellenVorher.length; i++) {
      for (const c of kriterien) {
        const alt = quellenVorher[i].values[c.key];
        const neu = quellenNachher[i].values[c.key];
        assert.ok(
          Math.abs(neu - alt - v.proFeld) < 1e-9,
          v.titel + " / " + c.key + ": " + alt + " -> " + neu + " statt " + v.proFeld
        );
      }
    }
  }
});

test("Das Bauchgefuehl bleibt unangetastet", () => {
  for (const v of PLAN.verrechenbar) {
    const vorher = ITEMS[v.category].find((e) => e.id === v.id);
    if (app.hasSeasons(vorher)) {
      v.entwurf.seasons.forEach((s, i) => assert.equal(s.personal, vorher.seasons[i].personal, v.titel));
    } else {
      assert.equal(v.entwurf.personal, vorher.personal, v.titel);
    }
  }
});

/* Der Vorgang selbst: genau das, was die App schreibt — die neuen
   Bewertungsfelder und `elo` auf dem Startwert. */
function nachher(vorgang) {
  const vorher = ITEMS[vorgang.category].find((e) => e.id === vorgang.id);
  return app.sammelVerrechnungsAnfrage(vorher, vorgang);
}

test("Die Endnote aendert sich um hoechstens 0,01 — ueber den ganzen Datensatz", () => {
  assert.ok(PLAN.verrechenbar.length > 20, "zu wenig zu verrechnen: " + PLAN.verrechenbar.length);
  let groesste = 0;
  for (const v of PLAN.verrechenbar) {
    const vorherNote = NOTEN_VORHER.get(v.id);
    const nachherNote = app.entryScore(nachher(v), v.category);
    const abstand = Math.abs(Math.round((nachherNote - vorherNote) * 100) / 100);
    groesste = Math.max(groesste, abstand);
    assert.ok(
      abstand <= app.SAMMEL_MAX_ABWEICHUNG + 1e-9,
      v.titel + ": " + vorherNote + " -> " + nachherNote + " (" + abstand + ")"
    );
    /* Und die Vorschau hat dieselbe Zahl genannt, die dann eintritt. */
    assert.equal(v.noteVorher, vorherNote, v.titel);
    assert.equal(v.noteNachher, nachherNote, v.titel);
    assert.equal(v.abweichung, Math.round((nachherNote - vorherNote) * 100) / 100, v.titel);
  }
  assert.ok(groesste >= 0, "kein Vergleich gelaufen");
});

test("Danach ist der Zuschlag 0, duels und siege bleiben stehen", () => {
  for (const v of PLAN.verrechenbar) {
    const vorher = ITEMS[v.category].find((e) => e.id === v.id);
    const anfrage = nachher(v);
    assert.equal(anfrage.elo, app.ELO_START, v.titel);
    assert.equal(app.entryZuschlag(anfrage), 0, v.titel);
    assert.equal(anfrage.duels, vorher.duels, v.titel);
    assert.equal(anfrage.siege, vorher.siege, v.titel);
    assert.equal(anfrage.id, vorher.id);
    assert.equal(anfrage.title, vorher.title);
    assert.equal(anfrage.category, v.category);
  }
});

test("Kein Kriterium verlaesst 0 bis 10", () => {
  for (const v of PLAN.verrechenbar) {
    const quellen = v.entwurf.seasons.length ? v.entwurf.seasons : [v.entwurf];
    for (const q of quellen) {
      for (const c of app.criteriaFor(v.category)) {
        assert.ok(
          q.values[c.key] >= app.BEWERTUNG_MIN && q.values[c.key] <= app.BEWERTUNG_MAX,
          v.titel + " / " + c.key + " = " + q.values[c.key]
        );
      }
    }
  }
});

test("Was nicht passt, wird uebersprungen und namentlich genannt — nicht gekappt", () => {
  assert.ok(PLAN.uebersprungen.length > 0, "der Datensatz sollte Randfaelle enthalten");
  for (const v of PLAN.uebersprungen) {
    assert.ok(v.titel && v.titel.length > 0, "ein uebersprungener Eintrag ohne Titel");
    assert.ok(v.grund && v.grund.length > 0, v.titel + " ohne Begruendung");
    assert.equal(v.entwurf, null, v.titel + " hat trotzdem einen Entwurf");
    assert.equal(v.moeglich, false);
  }
  /* Die Randfaelle des Datensatzes stehen wirklich darunter. */
  const namen = PLAN.uebersprungen.map((v) => v.titel);
  const rand = ALLE.filter(
    (x) => /Spitzenreiter|Kellerkind/.test(x.entry.title) && app.verrechnenAngeboten(x.entry)
  );
  assert.ok(rand.length > 0, "kein Randfall hat genug Duelle gesammelt");
  for (const x of rand) {
    assert.ok(namen.includes(x.entry.title), x.entry.title + " fehlt in der Liste");
  }
  /* Und die Begruendung nennt die Grenze, an der es scheitert. */
  const grenzen = PLAN.uebersprungen.filter((v) => /über 10,0|unter 0,0/.test(v.grund));
  assert.ok(grenzen.length > 0, "keine Begruendung nennt die Grenze: " + JSON.stringify(namen));
});

test("Nicht betroffene Eintraege bleiben Ziffer fuer Ziffer gleich", () => {
  const angefasst = new Set(PLAN.verrechenbar.map((v) => v.id));
  for (const { catKey, entry } of ALLE) {
    if (angefasst.has(entry.id)) continue;
    assert.equal(app.entryScore(entry, catKey), NOTEN_VORHER.get(entry.id), entry.title);
  }
  // Und der Bestand selbst ist auch nach allen Rechnungen unberuehrt.
  assert.deepEqual(JSON.parse(JSON.stringify(ITEMS)), KOPIE_VORHER);
});

/* ----------------------------------------------------------------
   Die Schwellen und die Randfaelle einzeln
   ---------------------------------------------------------------- */

/* Die Elo-Zahl, aus der ein bestimmter Zuschlag entsteht — stumpf
   gesucht, damit der Test die Zuschlag-Formel nicht noch einmal
   ausschreibt. */
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

function film({ kriterium = 8, personal = 7, zuschlag = 0.1, duels = 12 } = {}) {
  const values = {};
  app.criteriaFor("movie").forEach((c) => { values[c.key] = kriterium; });
  return {
    id: "einzeln", category: "movie", title: "Einzelfall", poster: "",
    values, personal, seasons: [],
    elo: zuschlag === 0 ? app.ELO_START : eloFuerZuschlag(zuschlag),
    duels, siege: Math.max(0, duels - 3), watchCount: 1,
  };
}

test("Unter 10 Duellen bleibt der Eintrag aussen vor", () => {
  const knapp = app.sammelVerrechnungsPlan({ movie: [film({ duels: app.VERRECHNEN_MIN_DUELLE - 1 })] });
  assert.equal(knapp.betroffen, 0);
  const gerade = app.sammelVerrechnungsPlan({ movie: [film({ duels: app.VERRECHNEN_MIN_DUELLE })] });
  assert.equal(gerade.betroffen, 1);
  assert.equal(gerade.verrechenbar.length, 1);
});

test("Unter dem Mindestbetrag bleibt der Eintrag aussen vor", () => {
  const klein = app.sammelVerrechnungsPlan({ movie: [film({ zuschlag: 0.04 })] });
  assert.equal(klein.betroffen, 0);
  const gerade = app.sammelVerrechnungsPlan({ movie: [film({ zuschlag: app.VERRECHNEN_MIN_BETRAG })] });
  assert.equal(gerade.betroffen, 1);
});

test("Ein Kriterium an der Obergrenze wird uebersprungen, nicht gekappt", () => {
  const plan = app.sammelVerrechnungsPlan({ movie: [film({ kriterium: 10, zuschlag: 0.2 })] });
  assert.equal(plan.betroffen, 1);
  assert.equal(plan.verrechenbar.length, 0);
  assert.equal(plan.uebersprungen.length, 1);
  assert.match(plan.uebersprungen[0].grund, /über 10,0/);
  assert.equal(plan.uebersprungen[0].titel, "Einzelfall");
});

test("Ein Kriterium an der Untergrenze wird uebersprungen, nicht gekappt", () => {
  const plan = app.sammelVerrechnungsPlan({ movie: [film({ kriterium: 0, zuschlag: -0.2 })] });
  assert.equal(plan.verrechenbar.length, 0);
  assert.match(plan.uebersprungen[0].grund, /unter 0,0/);
});

test("Die Sammelfunktion laesst die einzelne Verrechnung unberuehrt", () => {
  /* Der Einzelweg rundet weiter auf die Schieberstufe 0,1 — das ist
     ausdruecklich so geblieben. */
  const eintrag = film({ kriterium: 8, zuschlag: 0.15 });
  const einzeln = app.verrechnungsWeg(eintrag, "movie", "kriterien");
  assert.equal(einzeln.moeglich, true);
  const proStufe = app.criteriaFor("movie").map((c) => einzeln.entwurf.values[c.key] - 8);
  for (const d of proStufe) {
    assert.ok(Math.abs(Math.round(d * 10) / 10 - d) < 1e-9, "der Einzelweg rundet nicht mehr auf 0,1: " + d);
  }
});

/* ----------------------------------------------------------------
   Der Kasten im Daten-Panel
   ---------------------------------------------------------------- */

function rendere(props) {
  return renderToStaticMarkup(createElement(app.SammelVerrechnen, props));
}

test("Ohne Vorschau steht dort nur der Knopf, der sie rechnet", () => {
  const markup = rendere({ plan: null, busy: false, ergebnis: "" });
  assert.match(markup, /Alle Duell-Zuschläge verrechnen/);
  assert.doesNotMatch(markup, /Einträge verrechnen<|Eintrag verrechnen</);
  assert.doesNotMatch(markup, /Abbrechen/);
});

test("Die Vorschau nennt die Zahlen und die uebersprungenen Titel", () => {
  const markup = rendere({ plan: PLAN, busy: false, ergebnis: "" });
  assert.match(markup, new RegExp(String(PLAN.betroffen) + " Einträge betroffen"));
  assert.match(markup, new RegExp(String(PLAN.verrechenbar.length) + " Einträge verrechnen"));
  for (const v of PLAN.uebersprungen) {
    assert.ok(markup.includes(v.titel), "der Titel fehlt im Panel: " + v.titel);
    assert.ok(markup.includes(v.grund.replace(/&/g, "&amp;")), "die Begruendung fehlt: " + v.grund);
  }
  assert.match(markup, /Abbrechen/);
});

test("Ohne etwas zu verrechnen bleibt der Bestaetigungsknopf gesperrt", () => {
  const leer = { verrechenbar: [], uebersprungen: [], betroffen: 0 };
  const markup = rendere({ plan: leer, busy: false, ergebnis: "" });
  assert.match(markup, /disabled/);
  assert.match(markup, /Kein Eintrag hat genug Duelle/);
});

test("Nach dem Vorgang steht das Ergebnis da", () => {
  const markup = rendere({ plan: null, busy: false, ergebnis: "7 Zuschläge verrechnet, 2 übersprungen." });
  assert.match(markup, /7 Zuschläge verrechnet, 2 übersprungen\./);
});
