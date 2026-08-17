/**
 * Tests fuer /api/search — genauer: fuer die Schreibweisen, die die
 * Suche seit der Duplikat-Warnung mitliefert. Die Trefferliste selbst
 * (Reihenfolge, Namen, Poster) darf sich dadurch nicht aendern.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

process.env.TMDB_API_KEY = "test-key";

const { default: handler } = await import("../api/search.js");

function antwortAttrappe() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, wert) { this.headers[name] = wert; },
    status(code) { this.statusCode = code; return this; },
    json(daten) { this.body = daten; return this; },
  };
}

function mitFetch(routen, arbeit) {
  const echt = globalThis.fetch;
  const gerufen = [];

  globalThis.fetch = async (url) => {
    gerufen.push(String(url));
    for (const [merkmal, antwort] of routen) {
      const passt =
        typeof merkmal === "function" ? merkmal(String(url)) : String(url).includes(merkmal);
      if (!passt) continue;
      const daten = typeof antwort === "function" ? antwort(String(url)) : antwort;
      return { ok: true, status: 200, statusText: "OK", json: async () => daten };
    }
    return { ok: true, status: 200, statusText: "OK", json: async () => ({ results: [] }) };
  };

  return arbeit(gerufen).finally(() => {
    globalThis.fetch = echt;
  });
}

async function suchen(title, category, routen) {
  return mitFetch(routen, async (gerufen) => {
    const res = antwortAttrappe();
    await handler({ query: { title, category } }, res);
    return { res, gerufen };
  });
}

test("Filme: der Originaltitel geht neben dem deutschen mit", async () => {
  const { res } = await suchen("Winter Soldier", "movie", [
    ["/search/movie", {
      results: [{
        id: 1,
        title: "The Return of the First Avenger",
        original_title: "Captain America: The Winter Soldier",
        release_date: "2014-04-03",
        poster_path: "/x.jpg",
      }],
    }],
  ]);

  const treffer = res.body.results[0];
  // Angezeigt wird unveraendert der deutsche Titel.
  assert.equal(treffer.title, "The Return of the First Avenger");
  assert.deepEqual(treffer.titel, [
    "The Return of the First Avenger",
    "Captain America: The Winter Soldier",
  ]);
});

test("Anime: romanisiert, englisch, japanisch und Synonyme", async () => {
  const { res } = await suchen("Attack on Titan", "anime", [
    ["jikan", {
      data: [{
        mal_id: 16498,
        title: "Shingeki no Kyojin",
        title_english: "Attack on Titan",
        title_japanese: "進撃の巨人",
        titles: [{ type: "Default", title: "Shingeki no Kyojin" }],
        title_synonyms: ["AoT"],
        year: 2013,
        images: { jpg: { image_url: "bild" } },
      }],
    }],
  ]);

  const treffer = res.body.results[0];
  assert.equal(treffer.title, "Shingeki no Kyojin");
  assert.ok(treffer.titel.includes("Attack on Titan"));
  assert.ok(treffer.titel.includes("進撃の巨人"));
  assert.ok(treffer.titel.includes("AoT"));
});

test("Serien: TVMaze fuehrt, TMDB steuert die Schreibweisen bei", async () => {
  const { res } = await suchen("Loud House", "kids", [
    ["tvmaze", [{ show: { id: 7, name: "The Loud House", premiered: "2016-05-02", image: { medium: "bild" } } }]],
    ["/search/tv", {
      results: [{
        id: 62741,
        name: "Willkommen bei den Louds",
        original_name: "The Loud House",
        first_air_date: "2016-05-02",
      }],
    }],
  ]);

  const treffer = res.body.results[0];
  // Die Auswahl zeigt weiterhin, was TVMaze liefert.
  assert.equal(treffer.title, "The Loud House");
  assert.equal(treffer.poster, "bild");
  // Der deutsche Name kommt nur fuer den Abgleich dazu.
  assert.ok(
    treffer.titel.includes("Willkommen bei den Louds"),
    "ohne den deutschen Namen greift die Duplikat-Warnung nicht"
  );
});

test("Serien: ein Treffer aus einem anderen Jahr erbt keine Titel", async () => {
  const { res } = await suchen("Battlestar Galactica", "series", [
    ["tvmaze", [{ show: { id: 8, name: "Battlestar Galactica", premiered: "2004-10-18" } }]],
    ["/search/tv", {
      results: [{
        id: 71,
        name: "Kampfstern Galactica",
        original_name: "Battlestar Galactica",
        first_air_date: "1978-09-17",
      }],
    }],
  ]);

  const treffer = res.body.results[0];
  assert.deepEqual(treffer.titel, ["Battlestar Galactica"]);
});

test("Serien ohne TVMaze-Treffer laufen unveraendert ueber TMDB", async () => {
  const { res } = await suchen("Nur bei TMDB", "series", [
    ["tvmaze", []],
    ["/search/tv", {
      results: [{ id: 5, name: "Nur bei TMDB", original_name: "Only On TMDB", first_air_date: "2020-01-01" }],
    }],
  ]);

  assert.equal(res.body.results.length, 1);
  assert.deepEqual(res.body.results[0].titel, ["Nur bei TMDB", "Only On TMDB"]);
});

test("Spiele tragen nur ihren eigenen Namen", async () => {
  process.env.STEAMGRIDDB_API_KEY = "test-key";
  const { res } = await suchen("Zelda", "game", [
    ["steamgriddb", { success: true, data: [{ id: 1, name: "The Legend of Zelda" }] }],
  ]);
  delete process.env.STEAMGRIDDB_API_KEY;

  assert.deepEqual(res.body.results[0].titel, ["The Legend of Zelda"]);
});

test("Ohne Titel bleibt es bei der Fehlermeldung", async () => {
  const res = antwortAttrappe();
  await handler({ query: { title: "  ", category: "movie" } }, res);
  assert.equal(res.statusCode, 400);
});
