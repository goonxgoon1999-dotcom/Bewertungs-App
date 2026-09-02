/**
 * Tests fuer die beiden neuen Statistik-Abschnitte in src/App.jsx:
 *
 *   - die gesamte Sehzeit der Detailauswertung (Laufzeit mal
 *     Sehzaehler) samt der Frage, was dabei aussen vor bleibt,
 *   - der Vergleich der eigenen Endnote mit der IMDb-Note.
 *
 * Gerendert wird nichts. Wie in app-logik.test.mjs wird src/App.jsx im
 * Original geladen: uebersetzt, um eine Ausfuhrliste ergaenzt,
 * importiert. Geprueft wird damit genau der Code, der auch im Browser
 * laeuft.
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

const GEPRUEFT = [
  "sehzeitEintrag",
  "sehzeitSumme",
  "sehzeitStundenWert",
  "sehzeitTageWert",
  "ohneLaufzeitHinweis",
  "imdbVergleiche",
  "imdbListen",
  "IMDB_VERGLEICH_MIN",
  "IMDB_VERGLEICH_LAENGE",
  "entryWatchCount",
  "zuschlagText",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-"));
  const datei = join(verzeichnis, "statistik-sehzeit-imdb.mjs");

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
 * Sehzeit: Laufzeit mal Zaehler
 * ---------------------------------------------------------------- */

const film = (minuten, zaehler) => ({
  id: "f" + minuten + "-" + zaehler,
  title: "Film " + minuten,
  runtimeMinutes: minuten,
  watchCount: zaehler,
});

test("Sehzeit eines Eintrags ist Laufzeit mal Zaehler", () => {
  // Das Beispiel aus der Beschreibung: 152 Minuten, sechsmal gesehen.
  assert.equal(app.sehzeitEintrag(film(152, 6), "movie"), 912);
  assert.equal(912 / 60, 15.2);
});

test("Zaehler 0 zaehlt wie 1 — ein bewerteter Titel faellt nie weg", () => {
  assert.equal(app.sehzeitEintrag(film(152, 0), "movie"), 152);
  assert.equal(app.sehzeitEintrag(film(152, undefined), "movie"), 152);
  assert.equal(app.entryWatchCount({ watchCount: 0 }), 1);
});

test("Ohne bekannte Laufzeit gibt es keine Sehzeit", () => {
  assert.equal(app.sehzeitEintrag({ runtimeMinutes: null, watchCount: 3 }, "movie"), null);
  assert.equal(app.sehzeitEintrag({ watchCount: 3 }, "movie"), null);
  assert.equal(app.sehzeitEintrag({ runtimeMinutes: 0, watchCount: 3 }, "movie"), null);
});

test("Spiele haben keine Laufzeit und tragen nichts bei", () => {
  // Selbst wenn an einem Spiel eine Laufzeit stuende: es zaehlt nicht.
  assert.equal(app.sehzeitEintrag(film(600, 2), "game"), null);
});

test("Die Summe zaehlt jede Kategorie mit Laufzeit", () => {
  const summe = app.sehzeitSumme([
    { category: "movie", liste: [film(152, 6), film(100, 1)] },
    { category: "series", liste: [film(600, 2)] },
  ]);
  assert.equal(summe.minuten, 912 + 100 + 1200);
  assert.equal(summe.gezaehlt, 3);
  assert.equal(summe.ohneLaufzeit, 0);
  assert.equal(summe.moeglich, true);
});

test("Eintraege ohne Laufzeit werden gezaehlt, nicht gerechnet", () => {
  const summe = app.sehzeitSumme([
    { category: "movie", liste: [film(120, 2), { id: "x", runtimeMinutes: null }] },
  ]);
  assert.equal(summe.minuten, 240);
  assert.equal(summe.gezaehlt, 1);
  assert.equal(summe.ohneLaufzeit, 1);
});

test("Spiele erhoehen die Zahl der fehlenden Laufzeiten nicht", () => {
  /* Sonst stuende unter der Auswahl "Alle" ein Hinweis auf lauter
     Eintraege, bei denen nie eine Laufzeit zu erwarten war. */
  const summe = app.sehzeitSumme([
    { category: "movie", liste: [film(120, 1)] },
    { category: "game", liste: [{ id: "g1" }, { id: "g2" }] },
  ]);
  assert.equal(summe.ohneLaufzeit, 0);
  assert.equal(summe.gezaehlt, 1);
});

test("Nur Spiele in der Auswahl: keine Sehzeit moeglich", () => {
  const summe = app.sehzeitSumme([{ category: "game", liste: [{ id: "g1" }] }]);
  assert.equal(summe.moeglich, false);
  assert.equal(summe.minuten, 0);
});

test("Kartenwerte: volle Stunden, Tage mit einer Nachkommastelle", () => {
  assert.equal(app.sehzeitStundenWert(912), "15");
  assert.equal(app.sehzeitTageWert(912), "0.6");
  assert.equal(app.sehzeitStundenWert(0), "0");
  assert.equal(app.sehzeitTageWert(0), "0.0");
  assert.equal(app.sehzeitStundenWert(60 * 24 * 3), "72");
  assert.equal(app.sehzeitTageWert(60 * 24 * 3), "3.0");
});

test("Der Hinweis auf fehlende Laufzeiten steht nur an einer Stelle", async () => {
  assert.equal(
    app.ohneLaufzeitHinweis(4),
    "4 Einträge ohne bekannte Laufzeit fehlen in der Summe."
  );

  /* Jahresrueckblick und Detailauswertung muessen sich denselben Satz
     teilen — zwei Formulierungen wuerden sich frueher oder spaeter
     widersprechen. Deshalb darf der Wortlaut im Quelltext genau
     einmal vorkommen. */
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const treffer = quelle.match(/Einträge ohne bekannte Laufzeit fehlen in der Summe/g) || [];
  assert.equal(treffer.length, 1);
});

/* ---------------------------------------------------------------- *
 * Du vs. IMDb
 * ---------------------------------------------------------------- */

const KATEGORIEN = [
  { key: "movie", label: "Filme" },
  { key: "series", label: "Serien" },
];

const eintrag = (id, titel, score, imdb) => ({
  id,
  title: titel,
  score,
  imdbRating: imdb,
});

test("Verglichen wird nur, was beide Noten hat", () => {
  const ranked = {
    movie: [
      eintrag("1", "Mit IMDb", 9.48, 8.6),
      eintrag("2", "Ohne IMDb", 8.0, null),
      eintrag("3", "Ohne Endnote", null, 7.5),
    ],
    series: [],
  };
  const liste = app.imdbVergleiche(ranked, KATEGORIEN);
  assert.equal(liste.length, 1);
  assert.equal(liste[0].titel, "Mit IMDb");
  assert.equal(liste[0].eigene, 9.48);
  assert.equal(liste[0].imdb, 8.6);
  assert.equal(liste[0].abweichung, 0.88);
  assert.equal(app.zuschlagText(liste[0].abweichung), "+0.88");
});

test("Die Abweichung rechnet mit der angezeigten, begrenzten Endnote", () => {
  /* Ein Duell-Zuschlag kann ueber die 10 hinausschieben. Auf der
     IMDb-Skala gibt es darueber nichts. */
  const ranked = { movie: [eintrag("1", "Ueber zehn", 10.4, 8.0)], series: [] };
  const [v] = app.imdbVergleiche(ranked, KATEGORIEN);
  assert.equal(v.eigene, 10);
  assert.equal(v.abweichung, 2);
});

test("Alle angezeigten Kategorien fliessen ein", () => {
  const ranked = {
    movie: [eintrag("1", "Film", 8.0, 7.0)],
    series: [eintrag("2", "Serie", 6.0, 8.0)],
  };
  assert.equal(app.imdbVergleiche(ranked, KATEGORIEN).length, 2);
  // Eine ausgeblendete Kategorie bleibt draussen.
  assert.equal(app.imdbVergleiche(ranked, [KATEGORIEN[0]]).length, 1);
});

test("Zwei Listen: hoeher absteigend, niedriger nach Betrag absteigend", () => {
  const vergleiche = [
    { schluessel: "a", titel: "A", eigene: 9, imdb: 8, abweichung: 1 },
    { schluessel: "b", titel: "B", eigene: 9.5, imdb: 6.5, abweichung: 3 },
    { schluessel: "c", titel: "C", eigene: 5, imdb: 7, abweichung: -2 },
    { schluessel: "d", titel: "D", eigene: 4, imdb: 8, abweichung: -4 },
    { schluessel: "e", titel: "E", eigene: 7, imdb: 7, abweichung: 0 },
  ];
  const { hoeher, niedriger } = app.imdbListen(vergleiche);
  assert.deepEqual(hoeher.map((v) => v.titel), ["B", "A"]);
  assert.deepEqual(niedriger.map((v) => v.titel), ["D", "C"]);
  // Wer genau auf der IMDb-Note liegt, steht in keiner der Listen.
  assert.equal([...hoeher, ...niedriger].some((v) => v.titel === "E"), false);
});

test("Je Liste hoechstens zehn Eintraege", () => {
  const viele = [];
  for (let i = 0; i < 25; i++) {
    viele.push({ schluessel: "h" + i, titel: "H" + i, eigene: 9, imdb: 1, abweichung: i + 1 });
    viele.push({ schluessel: "n" + i, titel: "N" + i, eigene: 1, imdb: 9, abweichung: -(i + 1) });
  }
  const { hoeher, niedriger } = app.imdbListen(viele);
  assert.equal(app.IMDB_VERGLEICH_LAENGE, 10);
  assert.equal(hoeher.length, 10);
  assert.equal(niedriger.length, 10);
  assert.equal(hoeher[0].abweichung, 25);
  assert.equal(niedriger[0].abweichung, -25);
});

test("Die Schwelle fuer den Hinweis statt leerer Listen liegt bei drei", () => {
  assert.equal(app.IMDB_VERGLEICH_MIN, 3);
});

test("Jeder Vergleich traegt einen eigenen Schluessel", () => {
  /* Dieselbe ID kann in zwei Kategorien vorkommen — der Schluessel
     der Zeile muss trotzdem eindeutig bleiben. */
  const ranked = {
    movie: [eintrag("gleich", "Film", 8.0, 7.0)],
    series: [eintrag("gleich", "Serie", 6.0, 8.0)],
  };
  const liste = app.imdbVergleiche(ranked, KATEGORIEN);
  assert.equal(new Set(liste.map((v) => v.schluessel)).size, 2);
});
