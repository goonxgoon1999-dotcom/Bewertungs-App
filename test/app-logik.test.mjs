/**
 * Tests fuer die reine Logik in src/App.jsx.
 *
 * Die Datei ist eine einzige grosse React-Komponente und exportiert
 * ihre Hilfsfunktionen nicht — sie werden hier trotzdem im Original
 * geprueft und nicht als Kopie: Die Datei wird mit esbuild (steckt
 * ohnehin in Vite) nach JavaScript uebersetzt, um eine Ausfuhrliste
 * ergaenzt und dann geladen. Getestet wird damit genau der Code, der
 * auch im Browser laeuft.
 *
 * Gerendert wird nichts — es geht ausschliesslich um Funktionen ohne
 * Zustand: Einstufung fuer den Stimmungsfilter, das Bewertungsdatum,
 * die Duplikat-Erkennung und die Auswertung der Fortsetzungs-Hinweise.
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

/* Die Funktionen, um die es geht. Alles Deklarationen auf oberster
   Ebene der Datei — deshalb genuegt es, eine Ausfuhrliste anzuhaengen. */
const GEPRUEFT = [
  "stimmungVon",
  "laengenPunkt",
  "tonPunkt",
  "bewertetAm",
  "jahrDerBewertung",
  "trefferSchluessel",
  "findeDuplikat",
  "erfassteStaffeln",
  "animeStaffelSchluessel",
  "neueStaffeln",
  "passtZuFiltern",
  "filterAktiv",
  "titelSchluessel",
  "DEFAULT_FILTER",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-"));
  const datei = join(verzeichnis, "app-logik.mjs");

  /* Die uebersetzte Datei liegt ausserhalb des Projekts, `react` waere
     von dort nicht auffindbar — deshalb zeigen die Importe auf den
     echten Pfad im Projekt. */
  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();

/* ---------------------------------------------------------------- *
 * Stimmungsfilter
 * ---------------------------------------------------------------- */

const film = (minuten, genre) => ({
  category: "movie", runtimeMinutes: minuten, genre: genre || [],
});
const serie = (minuten, genre, folge) => ({
  category: "series", runtimeMinutes: minuten, episodeRuntime: folge || null, genre: genre || [],
});

test("Kurzer Film mit leichtem Genre ist \"kurz & leicht\"", () => {
  assert.equal(app.stimmungVon(film(95, ["Komödie"]), "movie"), "kurz");
  assert.equal(app.stimmungVon(film(95, ["Animation", "Familie"]), "movie"), "kurz");
});

test("Langer Film mit schwerem Genre ist \"episch & lang\"", () => {
  assert.equal(app.stimmungVon(film(180, ["Drama"]), "movie"), "episch");
  assert.equal(app.stimmungVon(film(165, ["Fantasy", "Abenteuer"]), "movie"), "episch");
});

test("Kurz, aber schwer: keins von beidem", () => {
  /* Das ist der Grund fuer die zwei Signale — ein 100-Minuten-Drama ist
     kurz, aber nicht leicht, und gehoert in keine der beiden
     Auswahlen. */
  assert.equal(app.stimmungVon(film(100, ["Drama"]), "movie"), null);
});

test("Lang, aber leicht: ebenfalls keins von beidem", () => {
  assert.equal(app.stimmungVon(film(170, ["Komödie"]), "movie"), null);
});

test("Ein mittellanger Film ohne aussagekraeftiges Genre bleibt drausen", () => {
  assert.equal(app.stimmungVon(film(125, ["Action"]), "movie"), null);
  assert.equal(app.stimmungVon(film(125, []), "movie"), null);
});

test("Serien: die Gesamtlaufzeit schlaegt die kurze Folge", () => {
  // 40 Stunden am Stueck ist kein leichter Abend, auch bei 22 Minuten
  // je Folge.
  assert.equal(app.stimmungVon(serie(40 * 60, ["Komödie"], 22), "series"), null);
  assert.equal(app.stimmungVon(serie(40 * 60, ["Drama"], 45), "series"), "episch");
});

test("Serien: kurze Folgen machen eine mittellange Serie leicht", () => {
  assert.equal(app.stimmungVon(serie(15 * 60, ["Komödie"], 22), "series"), "kurz");
});

test("Ohne Laufzeit gibt es keine Einstufung", () => {
  assert.equal(app.stimmungVon(film(null, ["Komödie"]), "movie"), null);
  assert.equal(app.laengenPunkt(film(null, []), "movie"), null);
});

test("Spiele werden nicht eingestuft", () => {
  assert.equal(app.stimmungVon({ category: "game", runtimeMinutes: 3000, genre: [] }, "game"), null);
});

test("Englische und deutsche Genrenamen wirken gleich", () => {
  assert.equal(app.tonPunkt({ genre: ["Comedy"] }), -1);
  assert.equal(app.tonPunkt({ genre: ["Komödie"] }), -1);
  assert.equal(app.tonPunkt({ genre: ["Adventure"] }), 1);
  assert.equal(app.tonPunkt({ genre: ["Abenteuer"] }), 1);
  // Beides gleich stark vertreten heisst: kein Ausschlag.
  assert.equal(app.tonPunkt({ genre: ["Komödie", "Drama"] }), 0);
  assert.equal(app.tonPunkt({ genre: ["Action", "Krimi"] }), 0);
});

test("Der Stimmungsfilter kombiniert sich mit den uebrigen Filtern", () => {
  const eintrag = { ...film(95, ["Komödie"]), director: "Wes Anderson", releaseYear: 2014 };
  const basis = { ...app.DEFAULT_FILTER, stimmung: "kurz" };

  assert.equal(app.passtZuFiltern(eintrag, basis, "movie"), true);
  // Zusammen mit einem passenden Genre: bleibt drin.
  assert.equal(app.passtZuFiltern(eintrag, { ...basis, genre: "Komödie" }, "movie"), true);
  // Zusammen mit einem unpassenden Regisseur: faellt raus.
  assert.equal(app.passtZuFiltern(eintrag, { ...basis, regie: "Nolan" }, "movie"), false);
  // Die andere Stimmung trifft nicht zu.
  assert.equal(app.passtZuFiltern(eintrag, { ...basis, stimmung: "episch" }, "movie"), false);
});

test("Ohne gesetzte Stimmung aendert sich am Filter nichts", () => {
  const eintrag = film(null, []);
  assert.equal(app.passtZuFiltern(eintrag, app.DEFAULT_FILTER, "movie"), true);
  assert.equal(app.filterAktiv(app.DEFAULT_FILTER), false);
  assert.equal(app.filterAktiv({ ...app.DEFAULT_FILTER, stimmung: "kurz" }), true);
});

/* ---------------------------------------------------------------- *
 * Jahresrueckblick — das Bewertungsdatum
 * ---------------------------------------------------------------- */

const AM = (jahr, monat, tag) => new Date(Date.UTC(jahr, monat - 1, tag, 12)).getTime();

test("Das Bewertungsdatum kommt aus ratedAt, nicht aus createdAt", () => {
  const eintrag = { ratedAt: AM(2026, 3, 1), createdAt: AM(2024, 1, 1), updatedAt: AM(2026, 8, 1) };
  assert.equal(app.jahrDerBewertung(eintrag), 2026);
});

test("Bei Staffeln zaehlt die zuletzt nachgetragene", () => {
  const eintrag = {
    ratedAt: AM(2024, 5, 1),
    seasons: [
      { createdAt: AM(2024, 5, 1) },
      { createdAt: AM(2024, 6, 1) },
      { createdAt: AM(2026, 2, 1) },
    ],
  };
  assert.equal(app.jahrDerBewertung(eintrag), 2026);
});

test("Ohne Datum gibt es kein Jahr", () => {
  assert.equal(app.bewertetAm({ createdAt: AM(2024, 1, 1) }), null);
  assert.equal(app.jahrDerBewertung({ ratedAt: null, seasons: [] }), null);
  // Der Altbestand steht auf 0 und darf nicht als 1970 durchgehen.
  assert.equal(app.jahrDerBewertung({ ratedAt: 0, createdAt: 0 }), null);
});

/* ---------------------------------------------------------------- *
 * Duplikat-Warnung
 * ---------------------------------------------------------------- */

function bekanntAus(eintraege) {
  const map = new Map();
  for (const e of eintraege) map.set(app.titelSchluessel(e.title), e);
  return map;
}

test("Derselbe Titel unter anderem Namen wird erkannt", () => {
  const bekannt = bekanntAus([{ title: "Willkommen bei den Louds", watchlist: false }]);
  const treffer = {
    title: "The Loud House",
    titel: ["The Loud House", "Willkommen bei den Louds"],
  };

  const gefunden = app.findeDuplikat(treffer, bekannt);
  assert.ok(gefunden, "ueber den Alternativtitel muss der Eintrag gefunden werden");
  assert.equal(gefunden.title, "Willkommen bei den Louds");
});

test("Schreibweise, Akzente und ein Klammerjahr stoeren nicht", () => {
  const bekannt = bekanntAus([{ title: "Amélie (2001)", watchlist: true }]);
  assert.ok(app.findeDuplikat({ title: "AMELIE", titel: ["AMELIE"] }, bekannt));
});

test("Ein anderer Titel bleibt ein anderer Titel", () => {
  const bekannt = bekanntAus([{ title: "Blade Runner", watchlist: false }]);
  assert.equal(app.findeDuplikat({ title: "Blade Runner 2049", titel: ["Blade Runner 2049"] }, bekannt), null);
});

test("Ohne Alternativtitel zaehlt der angezeigte Name", () => {
  // So sieht ein Spiel aus: SteamGridDB kennt nur einen Namen.
  const bekannt = bekanntAus([{ title: "The Legend of Zelda", watchlist: false }]);
  assert.ok(app.findeDuplikat({ title: "the legend of zelda" }, bekannt));
  assert.deepEqual(app.trefferSchluessel({ title: "The Legend of Zelda" }), ["the legend of zelda"]);
});

test("Eine leere Sammlung meldet nie ein Duplikat", () => {
  assert.equal(app.findeDuplikat({ title: "Irgendwas" }, new Map()), null);
  assert.equal(app.findeDuplikat({ title: "Irgendwas" }, null), null);
});

/* ---------------------------------------------------------------- *
 * Fortsetzungs-Erinnerung
 * ---------------------------------------------------------------- */

test("Erfasste Staffeln: die groessere der beiden Quellen zaehlt", () => {
  assert.equal(app.erfassteStaffeln({ seasons: [{}, {}, {}], episodesPerSeason: [12, 12] }), 3);
  assert.equal(app.erfassteStaffeln({ seasons: [], episodesPerSeason: [12, 12, 12, 12, 12] }), 5);
  // Ohne jede Angabe gilt eine Staffel.
  assert.equal(app.erfassteStaffeln({}), 1);
});

test("Hinweis nur, solange die Quelle mehr Staffeln fuehrt", () => {
  const items = { series: [{ id: "s1", title: "Serie", seasons: [{}, {}, {}], episodesPerSeason: [] }] };
  const stand = { zeit: Date.now(), stand: { s1: { quelle: "tmdb", neu: true, staffeln: 5 } } };

  assert.ok(app.neueStaffeln(stand, items).has("s1"));

  // Die fehlenden Staffeln nachgetragen: Der Hinweis verschwindet
  // sofort, ohne auf den naechsten Abgleich zu warten.
  const nachgetragen = { series: [{ id: "s1", title: "Serie", seasons: [{}, {}, {}, {}, {}], episodesPerSeason: [] }] };
  assert.ok(!app.neueStaffeln(stand, nachgetragen).has("s1"));
});

test("Ein geloeschter Eintrag traegt keinen Hinweis mehr", () => {
  const stand = { stand: { weg: { quelle: "tmdb", neu: true, staffeln: 9 } } };
  assert.equal(app.neueStaffeln(stand, { series: [] }).size, 0);
});

test("Anime: eine bereits erfasste Fortsetzung meldet nichts", () => {
  const stand = {
    stand: {
      a1: {
        quelle: "jikan", quellId: "16498", neu: true,
        fortsetzungen: [{ malId: "25777", titel: "Shingeki no Kyojin Season 2" }],
      },
      // Die zweite Staffel steht selbst in der Sammlung — und traegt
      // damit die Kennung, an der sie wiedererkannt wird.
      a2: { quelle: "jikan", quellId: "25777", neu: false, fortsetzungen: [] },
    },
  };
  const items = {
    anime: [
      { id: "a1", title: "Shingeki no Kyojin" },
      { id: "a2", title: "Attack on Titan Staffel 2" },
    ],
  };

  assert.equal(app.neueStaffeln(stand, items).size, 0, "die Kennung muss die Fortsetzung erkennen");
});

test("Anime: eine fehlende Fortsetzung meldet sich", () => {
  const stand = {
    stand: {
      a1: {
        quelle: "jikan", quellId: "16498", neu: true,
        fortsetzungen: [{ malId: "25777", titel: "Shingeki no Kyojin Season 2" }],
      },
    },
  };
  const items = { anime: [{ id: "a1", title: "Shingeki no Kyojin" }] };
  assert.ok(app.neueStaffeln(stand, items).has("a1"));
});

test("Anime: \"Season 2\" und \"Staffel 2\" sind dieselbe Staffel", () => {
  assert.equal(
    app.animeStaffelSchluessel("Shingeki no Kyojin Season 2"),
    app.animeStaffelSchluessel("Shingeki no Kyojin Staffel 2")
  );
  assert.notEqual(
    app.animeStaffelSchluessel("Shingeki no Kyojin Season 2"),
    app.animeStaffelSchluessel("Shingeki no Kyojin Season 3")
  );
});

test("Ohne gespeicherten Stand gibt es keine Hinweise", () => {
  assert.equal(app.neueStaffeln(null, { series: [] }).size, 0);
  assert.equal(app.neueStaffeln({ zeit: 1 }, { series: [] }).size, 0);
});
