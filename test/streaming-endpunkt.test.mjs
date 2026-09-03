/**
 * Tests fuer /api/streaming — die Streaming-Verfuegbarkeit.
 *
 * TMDB ist hier nicht erreichbar (und soll es nicht sein — Tests, die
 * am Netz haengen, sind keine Tests). Wie in recommendations.test.mjs
 * wird `globalThis.fetch` ersetzt: ein kleiner Verteiler beantwortet
 * die Adressen, die der Endpunkt anfragt, mit nachgebauten Antworten im
 * Format der echten Quelle. Damit laeuft der ganze Weg durch — Suche,
 * Zuordnung, Abruf der Anbieter, Auswertung.
 *
 * Die Zusagen:
 *
 *   1. Nur Abo-Anbieter (`flatrate`). Leihen und Kaufen bleiben aussen
 *      vor.
 *   2. Die Region entscheidet, welche Liste gelesen wird; unbekannte
 *      Kuerzel fallen auf DE zurueck.
 *   3. Spiele werden gar nicht erst abgefragt.
 *   4. Anime laufen ueber dieselbe TMDB-Titelzuordnung wie Jahr, Regie
 *      und IMDb-Note — es gibt keine zweite.
 *   5. Eine mitgeschickte Kennung spart die Suche.
 *   6. Ohne TMDB-Schluessel gibt es ein leeres Ergebnis, keinen Fehler.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

process.env.TMDB_API_KEY = "test-key";

const { default: handler, regionLesen } = await import("../api/streaming.js");

/* ---------------------------------------------------------------- *
 * Geruest
 * ---------------------------------------------------------------- */

function antwortAttrappe() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, wert) { this.headers[name] = wert; return this; },
    status(code) { this.statusCode = code; return this; },
    json(daten) { this.body = daten; return this; },
  };
}

/**
 * Ersetzt `fetch` fuer die Dauer eines Tests. `routen` ist eine Liste
 * aus [Erkennungsmerkmal, Antwort]; die erste passende gewinnt.
 */
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

async function streaming(body, routen) {
  return mitFetch(routen, async (gerufen) => {
    const res = antwortAttrappe();
    await handler({ method: "POST", body }, res);
    return { res, gerufen };
  });
}

/* ---------------------------------------------------------------- *
 * Nachgebaute Antworten
 * ---------------------------------------------------------------- */

/** Die Suchantwort von TMDB fuer einen Film. */
const SUCHE_FILM = {
  results: [
    { id: 27205, title: "Inception", original_title: "Inception", release_date: "2010-07-15", poster_path: "/p.jpg" },
  ],
};

/** Dieselbe Form fuer eine Serie/einen Anime. */
const SUCHE_SERIE = {
  results: [
    { id: 1429, name: "Attack on Titan", original_name: "進撃の巨人", first_air_date: "2013-04-07", poster_path: "/s.jpg" },
  ],
};

/**
 * Die Antwort von /watch/providers. Absichtlich mit `rent` und `buy`
 * bestueckt — genau die duerfen nicht durchkommen.
 */
const ANBIETER = {
  id: 27205,
  results: {
    DE: {
      link: "https://www.themoviedb.org/movie/27205/watch",
      flatrate: [
        { logo_path: "/netflix.jpg", provider_id: 8, provider_name: "Netflix", display_priority: 2 },
        { logo_path: "/wow.jpg", provider_id: 30, provider_name: "WOW", display_priority: 1 },
      ],
      rent: [{ logo_path: "/a.jpg", provider_id: 3, provider_name: "Apple TV", display_priority: 5 }],
      buy: [{ logo_path: "/g.jpg", provider_id: 2, provider_name: "Google Play", display_priority: 6 }],
    },
    IT: {
      flatrate: [
        { logo_path: "/prime.jpg", provider_id: 119, provider_name: "Amazon Prime Video", display_priority: 3 },
      ],
      rent: [{ logo_path: "/a.jpg", provider_id: 3, provider_name: "Apple TV", display_priority: 5 }],
    },
  },
};

const ROUTEN = [
  ["/search/movie", SUCHE_FILM],
  ["/search/tv", SUCHE_SERIE],
  ["/watch/providers", ANBIETER],
];

const FILM = { id: "m1", category: "movie", title: "Inception" };

/* ---------------------------------------------------------------- *
 * Tests
 * ---------------------------------------------------------------- */

test("Nur Abo-Anbieter kommen durch — Leihen und Kaufen nicht", async () => {
  const { res } = await streaming({ region: "DE", eintraege: [FILM] }, ROUTEN);
  assert.equal(res.statusCode, 200);

  const treffer = res.body.treffer.m1;
  assert.equal(treffer.gefunden, true);
  const namen = treffer.anbieter.map((a) => a.name);
  assert.deepEqual(namen, ["WOW", "Netflix"], "nach display_priority sortiert");
  assert.ok(!namen.includes("Apple TV"), "Leihen gehoert nicht dazu");
  assert.ok(!namen.includes("Google Play"), "Kaufen gehoert nicht dazu");
});

test("Die Anbieter bringen Kennung, Name und Logo mit", async () => {
  const { res } = await streaming({ region: "DE", eintraege: [FILM] }, ROUTEN);
  const erster = res.body.treffer.m1.anbieter[0];
  assert.deepEqual(Object.keys(erster).sort(), ["id", "logo", "name"]);
  assert.equal(erster.id, "30");
  assert.match(erster.logo, /^https:\/\/image\.tmdb\.org\/t\/p\/w92\/wow\.jpg$/);
});

test("Die Region entscheidet, welche Liste gelesen wird", async () => {
  const { res } = await streaming({ region: "IT", eintraege: [FILM] }, ROUTEN);
  assert.equal(res.body.region, "IT");
  assert.deepEqual(
    res.body.treffer.m1.anbieter.map((a) => a.name),
    ["Amazon Prime Video"]
  );
});

test("Eine Region ohne Eintrag ergibt eine leere Liste, keinen Fehler", async () => {
  const { res } = await streaming(
    { region: "IT", eintraege: [FILM] },
    [["/search/movie", SUCHE_FILM], ["/watch/providers", { id: 1, results: { DE: { flatrate: [] } } }]]
  );
  assert.equal(res.body.treffer.m1.gefunden, true);
  assert.deepEqual(res.body.treffer.m1.anbieter, []);
});

test("Unbekannte Regionskuerzel fallen auf DE zurueck", () => {
  assert.equal(regionLesen("de"), "DE");
  assert.equal(regionLesen("it"), "IT");
  assert.equal(regionLesen("US"), "DE");
  assert.equal(regionLesen(undefined), "DE");
  assert.equal(regionLesen(42), "DE");
});

test("Spiele werden gar nicht erst abgefragt", async () => {
  const { res, gerufen } = await streaming(
    { region: "DE", eintraege: [{ id: "g1", category: "game", title: "Portal" }] },
    ROUTEN
  );
  assert.deepEqual(res.body.treffer, {});
  assert.deepEqual(gerufen, [], "fuer ein Spiel darf keine Anfrage rausgehen");
});

test("Anime laufen ueber die TMDB-Serienzuordnung — keine zweite Logik", async () => {
  const { res, gerufen } = await streaming(
    { region: "DE", eintraege: [{ id: "a1", category: "anime", title: "Attack on Titan" }] },
    [["/search/tv", SUCHE_SERIE], ["/watch/providers", { id: 1429, results: { DE: { flatrate: [
      { logo_path: "/c.jpg", provider_id: 283, provider_name: "Crunchyroll", display_priority: 1 },
    ] } } }]]
  );

  // Gesucht wird bei TMDB im Serienbereich — derselbe Weg, ueber den
  // auch Jahr, Regie und die IMDb-Kennung eines Anime laufen.
  assert.ok(gerufen.some((u) => u.includes("/search/tv")), "TMDB-Serienbereich wurde nicht befragt");
  assert.ok(!gerufen.some((u) => u.includes("jikan")), "Jikan hat hier nichts zu suchen");
  assert.equal(res.body.treffer.a1.quellArt, "tv");
  assert.equal(res.body.treffer.a1.quellId, "1429");
  assert.deepEqual(res.body.treffer.a1.anbieter.map((a) => a.name), ["Crunchyroll"]);
});

test("Eine mitgeschickte Kennung spart die Suche", async () => {
  const { res, gerufen } = await streaming(
    { region: "DE", eintraege: [{ ...FILM, quellArt: "movie", quellId: "27205" }] },
    ROUTEN
  );
  assert.equal(gerufen.length, 1, "es darf nur noch der Abruf der Anbieter uebrig bleiben");
  assert.match(gerufen[0], /\/movie\/27205\/watch\/providers/);
  assert.equal(res.body.treffer.m1.gefunden, true);
});

test("Die gefundene Kennung geht zurueck, damit sie beim naechsten Mal mitgeht", async () => {
  const { res } = await streaming({ region: "DE", eintraege: [FILM] }, ROUTEN);
  assert.equal(res.body.treffer.m1.quellArt, "movie");
  assert.equal(res.body.treffer.m1.quellId, "27205");
});

test("Ein Titel, den TMDB nicht kennt, wird als 'nicht gefunden' gemeldet", async () => {
  const { res } = await streaming(
    { region: "DE", eintraege: [{ id: "m9", category: "movie", title: "Gibt es nicht" }] },
    [["/search/movie", { results: [] }]]
  );
  assert.equal(res.body.treffer.m9.gefunden, false);
  assert.equal(res.body.treffer.m9.quellId, undefined);
  assert.deepEqual(res.body.treffer.m9.anbieter, []);
});

test("Ein gescheiterter Abruf meldet die Kennung, aber kein Ergebnis", async () => {
  const echt = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/watch/providers")) {
      return { ok: false, status: 503, statusText: "Service Unavailable", json: async () => ({}) };
    }
    return { ok: true, status: 200, statusText: "OK", json: async () => SUCHE_FILM };
  };
  try {
    const res = antwortAttrappe();
    await handler({ method: "POST", body: { region: "DE", eintraege: [FILM] } }, res);
    const treffer = res.body.treffer.m1;
    assert.equal(treffer.gefunden, false, "ein Fehlschlag ist kein Ergebnis");
    assert.equal(treffer.quellId, "27205", "die Kennung war richtig und geht zurueck");
  } finally {
    globalThis.fetch = echt;
  }
});

test("Derselbe Dienst mehrfach ergibt einen Chip", async () => {
  const { res } = await streaming(
    { region: "DE", eintraege: [FILM] },
    [["/search/movie", SUCHE_FILM], ["/watch/providers", { id: 1, results: { DE: { flatrate: [
      { provider_id: 8, provider_name: "Netflix", display_priority: 1, logo_path: "/n.jpg" },
      { provider_id: 8, provider_name: "Netflix", display_priority: 4, logo_path: "/n.jpg" },
    ] } } }]]
  );
  assert.equal(res.body.treffer.m1.anbieter.length, 1);
});

test("Eine leere Anfrage kostet keinen Aufruf", async () => {
  const { res, gerufen } = await streaming({ region: "DE", eintraege: [] }, ROUTEN);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.treffer, {});
  assert.deepEqual(gerufen, []);
});

test("Nur POST ist erlaubt", async () => {
  const res = antwortAttrappe();
  await handler({ method: "GET", query: {} }, res);
  assert.equal(res.statusCode, 405);
});

test("Die Antwort wird nicht zwischengespeichert", async () => {
  const { res } = await streaming({ region: "DE", eintraege: [FILM] }, ROUTEN);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("Ohne TMDB-Schluessel gibt es ein leeres Ergebnis, keinen Fehler", async () => {
  const alt = process.env.TMDB_API_KEY;
  delete process.env.TMDB_API_KEY;
  try {
    const { res, gerufen } = await streaming({ region: "DE", eintraege: [FILM] }, ROUTEN);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.treffer, {});
    assert.match(res.body.tmdb, /TMDB_API_KEY fehlt/);
    assert.deepEqual(gerufen, []);
  } finally {
    process.env.TMDB_API_KEY = alt;
  }
});
