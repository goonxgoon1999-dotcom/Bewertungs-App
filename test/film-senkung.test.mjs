/**
 * Tests fuer die einmalige Absenkung aller Filmbewertungen im
 * Daten-Panel — die Vorschau (filmSenkungsPlan), die Rechnung je Film
 * (filmSenkung), die Anfrage ans Backend (filmSenkungsAnfrage) und
 * der Kasten im Panel (FilmSenkung).
 *
 * Wie in sammel-verrechnen.test.mjs wird src/App.jsx im Original
 * geprueft: uebersetzt, um eine Ausfuhrliste ergaenzt, geladen. Der
 * Kasten wird mit renderToStaticMarkup wirklich gerendert.
 *
 * Der Datensatz dahinter ist ein vollstaendiger Bestand in
 * Echtformat: Eintraege ueber alle sieben Kategorien, Serien teils mit
 * Staffeln und eigener Gewichtung, Vorgemerktes ohne Bewertung, dazu
 * erspielte Elo-Zahlen — damit steht neben der Kriterien-Note auch
 * ein Duell-Zuschlag, der die Absenkung nicht beruehren darf.
 *
 * Die Zusagen:
 *
 *   1. Die Vorschau rechnet nur — kein Eintrag des Datensatzes wird
 *      dabei angefasst.
 *   2. Betroffen sind ausschliesslich bewertete Filme. Jede andere
 *      Kategorie und alles Vorgemerkte bleiben aussen vor.
 *   3. Jedes der sieben Kriterien faellt um genau 0,33, abgelegt auf
 *      dem Hundertstel.
 *   4. Wo kein Kriterium anstoesst, faellt die Endnote um 0,25 — bis
 *      auf den Rundungsrest von hoechstens 0,01.
 *   5. Kein Kriterium faellt unter 0. Wo gekappt wird, faellt die
 *      Endnote weniger weit, und der Film steht namentlich in der
 *      Vorschau.
 *   6. Bauchgefuehl, Elo, Duellzahl und Siege gehen unveraendert mit;
 *      der Duell-Zuschlag steht danach genauso da wie vorher.
 *   7. Der Kasten im Panel zeigt zuerst nur den Vorschau-Knopf und
 *      nennt die gekappten Titel beim Namen.
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
  "FILM_SENKUNG_KATEGORIE",
  "FILM_SENKUNG_PRO_KRITERIUM",
  "FILM_SENKUNG_ENDNOTE",
  "filmSenkung",
  "filmSenkungsPlan",
  "filmSenkungsAnfrage",
  "filmSenkungsVorschauText",
  "FilmSenkung",
  "FILM_SENKUNG_MAX_REST",
  "VERRECHNEN_ANTEIL_KRITERIEN",
  "BEWERTUNG_MIN",
  "BEWERTUNG_MAX",
  "aufSammelSchritt",
  "entryScore",
  "entryZuschlag",
  "entryPersonal",
  "computeCriteriaScore",
  "criteriaFor",
  "hasSeasons",
  "CATEGORIES",
  "CATEGORY_KEYS",
  "ELO_START",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-filmsenkung-"));
  const datei = join(verzeichnis, "film-senkung.mjs");
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
   Der Datensatz — ein Zufallsgenerator mit festem Startwert. Der
   Bestand ist damit in jedem Lauf derselbe.
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

const wuerfel = zufall(20260902);

/** Ein Bewertungswert auf der Stufe des Schiebers (0,1). */
function stufenwert(min, max) {
  return Math.round((min + wuerfel() * (max - min)) * 10) / 10;
}

function werteFuer(category, min, max) {
  const values = {};
  for (const c of app.criteriaFor(category)) values[c.key] = stufenwert(min, max);
  return values;
}

const BESTAND = {
  movie: 40, series: 18, anime: 12, kids: 7, adultanim: 6, doku: 7, game: 14,
};

function datensatz() {
  const items = {};
  for (const catKey of app.CATEGORY_KEYS) {
    const singular = app.CATEGORIES.find((c) => c.key === catKey).singular;
    const liste = [];
    for (let i = 0; i < BESTAND[catKey]; i++) {
      const id = catKey + "-" + (i + 1);
      const titel = singular + " " + (i + 1);
      /* Jeder zehnte Eintrag ist nur vorgemerkt: keine Bewertung. Er
         darf von der Absenkung nie beruehrt werden. */
      if (i % 10 === 9) {
        liste.push({
          id, category: catKey, title: titel, poster: "", watchlist: true,
          values: {}, personal: null, seasons: [],
          elo: app.ELO_START, duels: 0, siege: 0, watchCount: 0,
        });
        continue;
      }

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
    items[catKey] = liste;
  }

  /* Vier Filme stehen bewusst am Rand — sie sind der Pruefstein fuer
     das Kappen:

       keller  — alle Kriterien unter 0,33: nichts bleibt uebrig.
       knapp   — genau ein Kriterium unter 0,33.
       grenze  — ein Kriterium exakt auf 0,33: das landet auf 0, ohne
                 darunter zu geraten, und gilt damit als nicht gekappt.
       spitze  — alles nahe 10: hier faellt die Senkung voll durch. */
  const rand = [
    { id: "movie-keller", title: "Kellerkind", werte: () => werteFuer("movie", 0, 0.3), personal: 0.2 },
    { id: "movie-knapp", title: "Knapp daneben", werte: () => ({ ...werteFuer("movie", 4, 8), story: 0.1 }), personal: 5.5 },
    { id: "movie-grenze", title: "Auf der Grenze", werte: () => ({ ...werteFuer("movie", 4, 8), sound: 0.33 }), personal: 6.0 },
    { id: "movie-spitze", title: "Spitzenreiter", werte: () => werteFuer("movie", 9.5, 10), personal: 9.9 },
  ];
  for (const r of rand) {
    items.movie.push({
      id: r.id, category: "movie", title: r.title, poster: "", watchlist: false,
      values: r.werte(), personal: r.personal, seasons: [],
      elo: app.ELO_START, duels: 0, siege: 0, watchCount: 1,
    });
  }
  return items;
}

/* Duelle ausspielen — mit der Elo-Rechnung des Servers, damit neben
   der Kriterien-Note wirklich ein erspielter Zuschlag steht. */
function spieleDuelle(items, proKategorie) {
  for (const catKey of app.CATEGORY_KEYS) {
    const spieler = items[catKey].filter((e) => !e.watchlist);
    if (spieler.length < 2) continue;
    for (let n = 0; n < proKategorie; n++) {
      const a = spieler[Math.floor(wuerfel() * spieler.length)];
      const b = spieler[Math.floor(wuerfel() * spieler.length)];
      if (a === b) continue;
      const besser = app.entryScore(a, catKey) >= app.entryScore(b, catKey) ? a : b;
      const schlechter = besser === a ? b : a;
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

const ITEMS = spieleDuelle(datensatz(), 700);
const ABDRUCK = JSON.stringify(ITEMS);

/** Der Plan, frisch gerechnet — jeder Test bekommt seinen eigenen. */
function plan() {
  return app.filmSenkungsPlan(ITEMS);
}

/* ================================================================
   1. Die Vorschau rechnet nur
   ================================================================ */

test("die Vorschau fasst keinen Eintrag an", () => {
  const p = plan();
  assert.ok(p.betroffen > 0, "der Datensatz muss betroffene Filme enthalten");
  assert.equal(JSON.stringify(ITEMS), ABDRUCK);
});

/* ================================================================
   2. Betroffen sind ausschliesslich bewertete Filme
   ================================================================ */

test("nur Filme stehen im Plan", () => {
  const p = plan();
  for (const vorgang of p.aenderbar.concat(p.uebersprungen)) {
    assert.equal(vorgang.category, app.FILM_SENKUNG_KATEGORIE);
  }
});

test("jeder bewertete Film ist erfasst, kein vorgemerkter", () => {
  const p = plan();
  const bewertet = ITEMS.movie.filter((f) => !f.watchlist);
  const vorgemerkt = ITEMS.movie.filter((f) => f.watchlist);
  assert.ok(vorgemerkt.length > 0, "der Datensatz muss vorgemerkte Filme enthalten");

  const erfasst = new Set(p.aenderbar.concat(p.uebersprungen).map((v) => v.id));
  assert.equal(erfasst.size, bewertet.length);
  for (const f of bewertet) assert.ok(erfasst.has(f.id), f.title + " fehlt im Plan");
  for (const f of vorgemerkt) assert.ok(!erfasst.has(f.id), f.title + " steht faelschlich im Plan");
});

test("die Zahlen des Plans passen zusammen", () => {
  const p = plan();
  assert.equal(p.betroffen, p.voll.length + p.gekappt.length);
  assert.equal(p.aenderbar.length, p.betroffen);
  assert.equal(p.uebersprungen.length, 0, "im Datensatz gibt es nichts zu ueberspringen");
});

/* ================================================================
   3. Jedes Kriterium faellt um 0,33
   ================================================================ */

test("jedes der sieben Kriterien faellt um genau 0,33 — oder auf 0", () => {
  const p = plan();
  const kriterien = app.criteriaFor("movie");
  assert.equal(kriterien.length, 7);

  for (const vorgang of p.aenderbar) {
    const vorher = ITEMS.movie.find((f) => f.id === vorgang.id).values;
    for (const c of kriterien) {
      const alt = vorher[c.key];
      const neu = vorgang.entwurf.values[c.key];
      const erwartet = app.aufSammelSchritt(
        Math.max(app.BEWERTUNG_MIN, alt - app.FILM_SENKUNG_PRO_KRITERIUM)
      );
      assert.equal(neu, erwartet, vorgang.titel + " / " + c.key);
      // Auf dem Hundertstel abgelegt.
      assert.equal(neu, app.aufSammelSchritt(neu));
    }
  }
});

test("die Kriterien-Note faellt bei ungekappten Filmen um genau 0,33", () => {
  const p = plan();
  for (const vorgang of p.voll) {
    const vorher = ITEMS.movie.find((f) => f.id === vorgang.id);
    const alt = app.computeCriteriaScore(vorher.values, "movie");
    const neu = app.computeCriteriaScore(vorgang.entwurf.values, "movie");
    assert.ok(
      Math.abs(alt - neu - app.FILM_SENKUNG_PRO_KRITERIUM) <= 0.01 + 1e-9,
      vorgang.titel + ": " + alt + " -> " + neu
    );
  }
});

/* ================================================================
   4. Die Endnote faellt um 0,25
   ================================================================ */

test("ungekappt faellt die Endnote um 0,25, bis auf den Rundungsrest", () => {
  const p = plan();
  assert.ok(p.voll.length > 0);
  for (const vorgang of p.voll) {
    const rest = Math.abs(vorgang.abweichung + app.FILM_SENKUNG_ENDNOTE);
    assert.ok(
      rest <= app.FILM_SENKUNG_MAX_REST + 1e-9,
      vorgang.titel + " weicht um " + vorgang.abweichung + " ab"
    );
  }
});

test("über hunderttausend gestreute Filme bleibt der Rundungsrest im Rahmen", () => {
  /* Die Zusage aus FILM_SENKUNG_MAX_REST steht und faellt mit den
     Rundungen der Endnoten-Formel — deshalb wird sie hier nicht an
     einer Handvoll Faelle geprueft, sondern breit gestreut: Werte auf
     der Schieberstufe UND auf dem Hundertstel (so liegen sie nach
     einem verrechneten Duell-Zuschlag da), Bauchgefuehl in
     Hundertstel-Schritten und eine Elo quer ueber das Feld. */
  const wuerfelBreit = zufall(4711);
  const kriterien = app.criteriaFor("movie");
  const gesehen = new Set();
  for (let n = 0; n < 120000; n++) {
    const stufe = n % 2 ? 0.1 : 0.01;
    const values = {};
    for (const c of kriterien) {
      values[c.key] = Math.round((0.4 + wuerfelBreit() * 9.6) / stufe) * stufe;
    }
    const film = {
      id: "streu-" + n, category: "movie", title: "Streufall " + n, watchlist: false,
      values, personal: Math.round(wuerfelBreit() * 1000) / 100, seasons: [],
      elo: 700 + wuerfelBreit() * 600, duels: 20, siege: 10,
    };
    const vorgang = app.filmSenkung(film);
    if (!vorgang.moeglich || vorgang.gekappt) continue;
    gesehen.add(vorgang.abweichung);
    assert.ok(
      Math.abs(vorgang.abweichung + app.FILM_SENKUNG_ENDNOTE) <= app.FILM_SENKUNG_MAX_REST + 1e-9,
      "Streufall " + n + " weicht um " + vorgang.abweichung + " ab"
    );
  }
  // Und die 0,25 ist dabei nicht die Ausnahme, sondern die Regel.
  assert.ok(gesehen.has(-0.25));
});

test("die Senkung der Endnote ist der Abzug mal dem Kriterien-Anteil", () => {
  assert.equal(
    app.FILM_SENKUNG_ENDNOTE,
    app.FILM_SENKUNG_PRO_KRITERIUM * app.VERRECHNEN_ANTEIL_KRITERIEN
  );
  assert.equal(Math.round(app.FILM_SENKUNG_ENDNOTE * 100) / 100, 0.25);
});

/* ================================================================
   5. Kein Kriterium unter 0 — dort wird gekappt
   ================================================================ */

test("kein Kriterium faellt unter 0", () => {
  const p = plan();
  for (const vorgang of p.aenderbar) {
    for (const c of app.criteriaFor("movie")) {
      const neu = vorgang.entwurf.values[c.key];
      assert.ok(neu >= app.BEWERTUNG_MIN, vorgang.titel + " / " + c.key + " = " + neu);
      assert.ok(neu <= app.BEWERTUNG_MAX);
    }
  }
});

test("gekappt ist genau, wo ein Kriterium unter 0,33 stand", () => {
  const p = plan();
  const erwartet = ITEMS.movie
    .filter((f) => !f.watchlist)
    .filter((f) =>
      app.criteriaFor("movie").some((c) => f.values[c.key] - app.FILM_SENKUNG_PRO_KRITERIUM < -1e-9)
    )
    .map((f) => f.id)
    .sort();
  assert.deepEqual(p.gekappt.map((v) => v.id).sort(), erwartet);
  assert.ok(p.gekappt.length >= 2, "der Datensatz muss gekappte Filme enthalten");
});

test("bei gekappten Filmen faellt die Endnote weniger weit", () => {
  const p = plan();
  for (const vorgang of p.gekappt) {
    assert.ok(vorgang.gekappt);
    assert.ok(vorgang.gekappteKriterien.length > 0);
    assert.ok(
      vorgang.abweichung > -app.FILM_SENKUNG_ENDNOTE,
      vorgang.titel + " faellt um " + vorgang.abweichung + " und damit nicht weniger weit"
    );
    assert.ok(vorgang.abweichung <= 0);
  }
});

test("ein Kriterium exakt auf 0,33 landet auf 0 und gilt nicht als gekappt", () => {
  const p = plan();
  const grenze = p.voll.find((v) => v.id === "movie-grenze");
  assert.ok(grenze, "der Grenzfall muss unter den voll gesenkten stehen");
  assert.equal(grenze.entwurf.values.sound, 0);
  assert.equal(grenze.gekappt, false);
});

test("ein Film ganz unten aendert sich gar nicht mehr", () => {
  const p = plan();
  const keller = p.gekappt.find((v) => v.id === "movie-keller");
  assert.ok(keller);
  for (const c of app.criteriaFor("movie")) assert.equal(keller.entwurf.values[c.key], 0);
});

/* ================================================================
   6. Bauchgefuehl, Elo und Zuschlag bleiben unberuehrt
   ================================================================ */

test("die Anfrage laesst Bauchgefuehl, Elo, Duelle und Siege stehen", () => {
  const p = plan();
  for (const vorgang of p.aenderbar) {
    const vorher = ITEMS.movie.find((f) => f.id === vorgang.id);
    const anfrage = app.filmSenkungsAnfrage(vorher, vorgang);
    assert.equal(anfrage.personal, vorher.personal);
    assert.equal(anfrage.elo, vorher.elo);
    assert.equal(anfrage.duels, vorher.duels);
    assert.equal(anfrage.siege, vorher.siege);
    assert.equal(anfrage.category, "movie");
    assert.deepEqual(anfrage.seasons, []);
    assert.deepEqual(anfrage.values, vorgang.entwurf.values);
    // Der Zuschlag haengt allein an der Elo — er steht danach genauso da.
    assert.equal(app.entryZuschlag(anfrage), app.entryZuschlag(vorher));
  }
});

test("die Endnote danach ist Kriterien, Bauchgefuehl und derselbe Zuschlag", () => {
  const p = plan();
  for (const vorgang of p.aenderbar) {
    const vorher = ITEMS.movie.find((f) => f.id === vorgang.id);
    const danach = app.filmSenkungsAnfrage(vorher, vorgang);
    assert.equal(app.entryScore(danach, "movie"), vorgang.noteNachher);
    assert.equal(
      Math.round((vorgang.noteNachher - vorgang.noteVorher) * 100) / 100,
      vorgang.abweichung
    );
  }
});

test("andere Kategorien kennt die Rechnung nicht", () => {
  const vorher = JSON.stringify(ITEMS.series) + JSON.stringify(ITEMS.game);
  plan();
  assert.equal(JSON.stringify(ITEMS.series) + JSON.stringify(ITEMS.game), vorher);
});

/* ================================================================
   Sonderfaelle
   ================================================================ */

test("ein Film mit fehlenden Kriterien wird uebersprungen, nicht halb gesenkt", () => {
  const p = app.filmSenkungsPlan({
    movie: [
      {
        id: "luecke", category: "movie", title: "Lückenhaft", watchlist: false,
        values: { story: 8, charaktere: 7 }, personal: 7, seasons: [],
        elo: app.ELO_START, duels: 0, siege: 0,
      },
    ],
  });
  assert.equal(p.betroffen, 0);
  assert.equal(p.uebersprungen.length, 1);
  assert.equal(p.uebersprungen[0].titel, "Lückenhaft");
  assert.equal(p.uebersprungen[0].entwurf, null);
});

test("ein leerer Bestand ergibt einen leeren Plan", () => {
  const p = app.filmSenkungsPlan({});
  assert.equal(p.betroffen, 0);
  assert.deepEqual(p.aenderbar, []);
  assert.match(app.filmSenkungsVorschauText(p), /keinen bewerteten Film/);
});

/* ================================================================
   7. Der Kasten im Panel
   ================================================================ */

test("ohne Vorschau steht nur der Knopf da", () => {
  const html = renderToStaticMarkup(
    createElement(app.FilmSenkung, { plan: null, busy: false, ergebnis: "" })
  );
  assert.match(html, /Alle Filmbewertungen absenken/);
  assert.doesNotMatch(html, /Filme absenken/);
  assert.match(html, /0,33/);
  assert.match(html, /0,25/);
});

test("die Vorschau nennt Zahl und gekappte Titel", () => {
  const p = plan();
  const html = renderToStaticMarkup(
    createElement(app.FilmSenkung, { plan: p, busy: false, ergebnis: "" })
  );
  assert.match(html, new RegExp(p.betroffen + " Filme betroffen"));
  assert.match(html, new RegExp(p.betroffen + " Filme absenken"));
  for (const vorgang of p.gekappt) {
    assert.ok(html.includes(vorgang.titel), vorgang.titel + " fehlt in der Vorschau");
  }
});

test("der Vorschautext nennt beide Zahlen", () => {
  const p = plan();
  const text = app.filmSenkungsVorschauText(p);
  assert.ok(text.includes(String(p.betroffen)));
  assert.ok(text.includes(String(p.gekappt.length)));
});
