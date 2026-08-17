/**
 * Tests fuer /api/fortsetzungen.
 *
 * Wie bei den Empfehlungen haengt hier nichts am Netz: `globalThis.fetch`
 * wird ersetzt und ein kleiner Verteiler antwortet mit nachgebauten
 * Antworten von TMDB und Jikan.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

process.env.TMDB_API_KEY = "test-key";

const { default: handler } = await import("../api/fortsetzungen.js");

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

async function pruefen(eintraege, routen) {
  return mitFetch(routen, async (gerufen) => {
    const res = antwortAttrappe();
    await handler({ method: "POST", body: { eintraege } }, res);
    return { res, gerufen };
  });
}

/* ---------------------------------------------------------------- *
 * Serien ueber TMDB
 * ---------------------------------------------------------------- */

const SUCHE_BREAKING = {
  results: [{ id: 1396, name: "Breaking Bad", original_name: "Breaking Bad", first_air_date: "2008-01-20" }],
};

test("Mehr Staffeln bei der Quelle als in der App: Hinweis", async () => {
  const { res } = await pruefen(
    [{ id: "a1", category: "series", title: "Breaking Bad", year: 2008, staffeln: 3 }],
    [
      ["/search/tv", SUCHE_BREAKING],
      ["/tv/1396?", { number_of_seasons: 5, status: "Ended", last_air_date: "2013-09-29" }],
    ]
  );

  assert.equal(res.statusCode, 200);
  const treffer = res.body.treffer.a1;
  assert.equal(treffer.neu, true);
  assert.equal(treffer.staffeln, 5);
  assert.equal(treffer.quelle, "tmdb");
  assert.equal(treffer.quellId, "1396");
  assert.deepEqual(res.body.offen, []);
});

test("Gleich viele Staffeln: kein Hinweis", async () => {
  const { res } = await pruefen(
    [{ id: "a2", category: "series", title: "Breaking Bad", year: 2008, staffeln: 5 }],
    [
      ["/search/tv", SUCHE_BREAKING],
      ["/tv/1396?", { number_of_seasons: 5, status: "Ended" }],
    ]
  );

  assert.equal(res.body.treffer.a2.neu, false);
});

test("Eine laufende Serie allein reicht nicht", async () => {
  /* "Returning Series" stuende bei jeder laufenden Serie dauerhaft da —
     gemeldet wird nur die tatsaechlich hoehere Staffelzahl. */
  const { res } = await pruefen(
    [{ id: "a3", category: "series", title: "Breaking Bad", year: 2008, staffeln: 5 }],
    [
      ["/search/tv", SUCHE_BREAKING],
      ["/tv/1396?", { number_of_seasons: 5, status: "Returning Series" }],
    ]
  );

  assert.equal(res.body.treffer.a3.neu, false);
  assert.equal(res.body.treffer.a3.status, "Returning Series");
});

test("Mitgeschickte Kennung spart die Suche", async () => {
  const { res, gerufen } = await pruefen(
    [{
      id: "a4", category: "adultanim", title: "Rick and Morty", year: 2013,
      staffeln: 6, quelle: "tmdb", quellId: "60625",
    }],
    [["/tv/60625?", { number_of_seasons: 7, status: "Returning Series" }]]
  );

  assert.equal(res.body.treffer.a4.neu, true);
  assert.ok(!gerufen.some((u) => u.includes("/search/tv")), "die Suche muss entfallen");
  assert.equal(gerufen.length, 1);
});

test("Kein Treffer bei der Quelle wird gemeldet, nicht verschwiegen", async () => {
  const { res } = await pruefen(
    [{ id: "a5", category: "kids", title: "Gibt es nicht", staffeln: 1 }],
    [["/search/tv", { results: [] }]]
  );

  // Auch das "nicht gefunden" steht in der Antwort — sonst fragt die App
  // jede Woche erneut nach demselben Titel.
  assert.equal(res.body.treffer.a5.gefunden, false);
  assert.deepEqual(res.body.offen, []);
});

test("Ein zu unaehnlicher Treffer gilt nicht", async () => {
  const { res } = await pruefen(
    [{ id: "a6", category: "series", title: "Breaking Bad", staffeln: 1 }],
    [["/search/tv", { results: [{ id: 999, name: "Notruf Hafenkante", original_name: "Notruf Hafenkante" }] }]]
  );

  assert.equal(res.body.treffer.a6.gefunden, false);
});

/* ---------------------------------------------------------------- *
 * Anime ueber Jikan
 * ---------------------------------------------------------------- */

test("Anime: die Fortsetzung kommt als eigener Eintrag zurueck", async () => {
  const { res } = await pruefen(
    [{ id: "b1", category: "anime", title: "Shingeki no Kyojin", staffeln: 1 }],
    [
      [(url) => url.includes("jikan") && url.includes("q="), {
        data: [{ mal_id: 16498, title: "Shingeki no Kyojin", titles: [{ title: "Shingeki no Kyojin" }] }],
      }],
      ["/relations", {
        data: [
          { relation: "Sequel", entry: [{ mal_id: 25777, name: "Shingeki no Kyojin Season 2", type: "anime" }] },
          { relation: "Prequel", entry: [{ mal_id: 111, name: "Irgendwas Davor", type: "anime" }] },
          { relation: "Adaptation", entry: [{ mal_id: 222, name: "Der Manga", type: "manga" }] },
        ],
      }],
    ]
  );

  const treffer = res.body.treffer.b1;
  assert.equal(treffer.neu, true);
  assert.equal(treffer.quelle, "jikan");
  // Nur das Sequel, und nur der Anime — Prequel und Manga bleiben drauss.
  assert.deepEqual(treffer.fortsetzungen, [{ malId: "25777", titel: "Shingeki no Kyojin Season 2" }]);
});

test("Anime ohne Fortsetzung meldet nichts", async () => {
  const { res } = await pruefen(
    [{ id: "b2", category: "anime", title: "Cowboy Bebop", staffeln: 1 }],
    [
      [(url) => url.includes("jikan") && url.includes("q="), {
        data: [{ mal_id: 1, title: "Cowboy Bebop", titles: [{ title: "Cowboy Bebop" }] }],
      }],
      ["/relations", { data: [{ relation: "Side story", entry: [{ mal_id: 5, name: "Ein Film", type: "anime" }] }] }],
    ]
  );

  assert.equal(res.body.treffer.b2.neu, false);
  assert.deepEqual(res.body.treffer.b2.fortsetzungen, []);
});

/* ---------------------------------------------------------------- *
 * Anfrage und Antwort
 * ---------------------------------------------------------------- */

test("Filme und Spiele haben hier nichts verloren", async () => {
  const { res, gerufen } = await pruefen(
    [
      { id: "c1", category: "movie", title: "Heat", staffeln: 1 },
      { id: "c2", category: "game", title: "Zelda", staffeln: 1 },
    ],
    []
  );

  assert.deepEqual(res.body.treffer, {});
  assert.equal(gerufen.length, 0);
});

test("Ein leerer Rumpf ist kein Fehler", async () => {
  const res = antwortAttrappe();
  await handler({ method: "POST", body: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { treffer: {}, offen: [] });
});

test("GET wird abgewiesen", async () => {
  const res = antwortAttrappe();
  await handler({ method: "GET", query: {} }, res);
  assert.equal(res.statusCode, 405);
});

test("Ein Rumpf als Zeichenkette wird gelesen", async () => {
  const { res } = await mitFetch(
    [
      ["/search/tv", SUCHE_BREAKING],
      ["/tv/1396?", { number_of_seasons: 5 }],
    ],
    async () => {
      const r = antwortAttrappe();
      await handler(
        {
          method: "POST",
          body: JSON.stringify({
            eintraege: [{ id: "d1", category: "series", title: "Breaking Bad", staffeln: 1 }],
          }),
        },
        r
      );
      return { res: r };
    }
  );

  assert.equal(res.body.treffer.d1.neu, true);
});
