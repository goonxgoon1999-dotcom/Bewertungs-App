/**
 * Tests fuer /api/recommendations.
 *
 * TMDB und Jikan sind hier nicht erreichbar (und sollen es auch nicht
 * sein — Tests, die am Netz haengen, sind keine Tests). Stattdessen
 * wird `globalThis.fetch` ersetzt: Ein kleiner Verteiler beantwortet
 * die Adressen, die der Endpunkt anfragt, mit nachgebauten Antworten im
 * Format der echten Quellen. Damit laeuft der ganze Weg durch —
 * Sammeln, Anreichern, Hart-Filter, Sortierung.
 *
 *   node --test test/
 */

import test from "node:test";
import assert from "node:assert/strict";

process.env.TMDB_API_KEY = "test-key";

const { default: handler } = await import("../api/recommendations.js");

/* ---------------------------------------------------------------- *
 * Geruest
 * ---------------------------------------------------------------- */

/** Ein Antwortobjekt, das mitschreibt, was der Endpunkt zurueckgibt. */
function antwortAttrappe() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, wert) {
      this.headers[name] = wert;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(daten) {
      this.body = daten;
      return this;
    },
  };
  return res;
}

/**
 * Ersetzt `fetch` fuer die Dauer eines Tests.
 *
 * `routen` ist eine Liste aus [Erkennungsmerkmal, Antwort]. Das
 * Merkmal ist eine Zeichenkette, die in der URL vorkommen muss, oder
 * eine Funktion. Die erste passende Route gewinnt; passt keine, gibt es
 * eine leere Antwort — genau wie bei einer Quelle, die nichts kennt.
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

/** Ruft den Endpunkt wie die App auf. */
async function empfehlungen(category, profil, routen) {
  return mitFetch(routen, async () => {
    const res = antwortAttrappe();
    await handler(
      { method: "GET", query: { category, profil: JSON.stringify(profil) } },
      res
    );
    return res;
  });
}

/* ---------------------------------------------------------------- *
 * Fixtures
 * ---------------------------------------------------------------- */

const TV_GENRES = {
  genres: [
    { id: 16, name: "Animation" },
    { id: 35, name: "Comedy" },
    { id: 10765, name: "Sci-Fi & Fantasy" },
    { id: 10762, name: "Kids" },
  ],
};

const MOVIE_GENRES = {
  genres: [
    { id: 28, name: "Action" },
    { id: 878, name: "Science Fiction" },
    { id: 18, name: "Drama" },
  ],
};

/** Serien-Treffer im Format von /discover/tv. */
function serie(id, name, genreIds, jahr, note) {
  return {
    id,
    name,
    original_name: name,
    first_air_date: jahr + "-01-01",
    poster_path: "/" + id + ".jpg",
    genre_ids: genreIds,
    vote_average: note,
  };
}

const RICK = serie(1, "Rick and Morty", [16, 35, 10765], "2013", 8.7);
const LOUDS = serie(2, "Willkommen bei den Louds", [16, 35, 10762], "2016", 7.8);
const BOJACK = serie(3, "BoJack Horseman", [16, 35], "2014", 8.5);
const OHNE = serie(4, "Serie ohne Angaben", [16, 35], "2019", 7.5);

/** Detailantwort mit Altersfreigabe und Schlagworten. */
function tvDetails(freigabeUS, schlagworte) {
  return {
    content_ratings: freigabeUS
      ? { results: [{ iso_3166_1: "US", rating: freigabeUS }] }
      : { results: [] },
    keywords: { results: (schlagworte || []).map((name, i) => ({ id: i, name })) },
  };
}

/* Die vier Serien mit ihren Detailantworten. So sieht TMDB sie wirklich:
   Rick and Morty ist TV-MA, die Louds sind TV-Y7, BoJack TV-MA. Die
   vierte hat gar nichts hinterlegt — der Fall, der weder das eine noch
   das andere belegt. */
const TV_DETAILS = {
  "/tv/1?": tvDetails("TV-MA", ["adult animation", "crude humor", "scientist"]),
  "/tv/2?": tvDetails("TV-Y7", ["kids", "siblings"]),
  "/tv/3?": tvDetails("TV-MA", ["adult animation", "depression"]),
  "/tv/4?": tvDetails(null, ["animation"]),
};

/** Standardrouten fuer eine Serienkategorie. */
function tvRouten(treffer) {
  return [
    ["/genre/tv/list", TV_GENRES],
    ["/discover/tv", { results: treffer }],
    // Profil-Schlagworte: Suche liefert einen Treffer, dann dessen Worte.
    ["/search/tv", (url) => ({
      results: [{ id: 99, name: decodeURIComponent(new URL(url).searchParams.get("query") || "") }],
    })],
    ["/tv/99/keywords", { results: [{ id: 1, name: "adult animation" }, { id: 2, name: "satire" }] }],
    [
      (url) => Object.keys(TV_DETAILS).some((pfad) => url.includes(pfad)),
      (url) => TV_DETAILS[Object.keys(TV_DETAILS).find((pfad) => url.includes(pfad))],
    ],
  ];
}

/* Der Endpunkt haelt Antworten sechs Stunden lang im Speicher, und der
   Schluessel ist das Profil. Jeder Test bekommt deshalb sein eigenes —
   sonst bekaeme der zweite die Vorschlaege des ersten zurueck. Genau
   dieses Verhalten prueft weiter unten ein eigener Test. */
let lauf = 0;

function profilAnim() {
  lauf++;
  return {
    genres: [{ name: "Animation", gewicht: 1 }, { name: "Comedy", gewicht: 0.8 }],
    regie: [],
    studios: [],
    jahrzehnte: [],
    titel: [{ name: "South Park " + lauf, gewicht: 1 }],
  };
}

/* ---------------------------------------------------------------- *
 * Teil 2 — der Hart-Filter
 * ---------------------------------------------------------------- */

test("Adult Animation: TV-MA bleibt, eine Kinderserie fliegt raus", async () => {
  const res = await empfehlungen("adultanim", profilAnim(), tvRouten([RICK, LOUDS, BOJACK]));

  assert.equal(res.statusCode, 200);
  const titel = res.body.results.map((r) => r.title);
  assert.ok(titel.includes("Rick and Morty"), "Rick and Morty muss den Filter bestehen");
  assert.ok(titel.includes("BoJack Horseman"), "BoJack Horseman muss den Filter bestehen");
  assert.ok(
    !titel.includes("Willkommen bei den Louds"),
    "eine TV-Y7-Kinderserie gehoert nicht unter Adult Animation"
  );
});

test("Kinderserien: dieselbe Liste, genau umgekehrt", async () => {
  const res = await empfehlungen("kids", profilAnim(), tvRouten([RICK, LOUDS, BOJACK]));

  const titel = res.body.results.map((r) => r.title);
  assert.deepEqual(titel, ["Willkommen bei den Louds"]);
});

test("Ohne jedes Signal bleibt der Kandidat drin — aber hinter den bestaetigten", async () => {
  const res = await empfehlungen("adultanim", profilAnim(), tvRouten([OHNE, RICK]));

  const titel = res.body.results.map((r) => r.title);
  assert.deepEqual(titel, ["Rick and Morty", "Serie ohne Angaben"]);
});

test("Das TMDB-Genre \"Kids\" schliesst auch ohne Altersfreigabe aus", async () => {
  // Dieselbe Serie wie die Louds, aber ohne hinterlegte Freigabe.
  const stumm = serie(7, "Kinderserie ohne Freigabe", [16, 35, 10762], "2016", 7.8);
  const routen = tvRouten([stumm, RICK]);
  routen.push([(url) => url.includes("/tv/7?"), tvDetails(null, [])]);

  const res = await empfehlungen("adultanim", profilAnim(), routen);
  assert.deepEqual(res.body.results.map((r) => r.title), ["Rick and Morty"]);
});

test("Die Altersfreigabe schlaegt das Schlagwort", async () => {
  /* "family" steht in der Kinder-Liste, TV-MA aber ist eindeutig — ein
     Fall wie "dysfunctional family" darf den Filter nicht umdrehen. */
  const routen = tvRouten([RICK]);
  routen.unshift([(url) => url.includes("/tv/1?"), tvDetails("TV-MA", ["family", "sitcom"])]);

  const res = await empfehlungen("adultanim", profilAnim(), routen);
  assert.deepEqual(res.body.results.map((r) => r.title), ["Rick and Morty"]);
});

test("Serien laufen ohne Alterspruefung — dieselben Kandidaten bleiben alle", async () => {
  const res = await empfehlungen("series", profilAnim(), tvRouten([RICK, LOUDS, BOJACK]));

  assert.equal(res.body.results.length, 3, "bei Serien filtert nichts nach Alter");
});

/* ---------------------------------------------------------------- *
 * Teil 1 — Profil-Aehnlichkeit
 * ---------------------------------------------------------------- */

test("Schlagworte aus dem Profil heben den passenderen Kandidaten", async () => {
  /* Beide Kandidaten haben dieselben Genres und dieselbe Freigabe. Der
     Unterschied liegt allein in den Schlagworten: Einer teilt sie mit
     dem Profil, der andere nicht. */
  const passend = serie(11, "Passt zum Profil", [16, 35], "2015", 7.0);
  const fremd = serie(12, "Passt nicht", [16, 35], "2015", 7.0);

  const routen = [
    ["/genre/tv/list", TV_GENRES],
    ["/discover/tv", { results: [fremd, passend] }],
    ["/search/tv", { results: [{ id: 99, name: "South Park" }] }],
    ["/tv/99/keywords", { results: [{ id: 1, name: "adult animation" }, { id: 2, name: "satire" }] }],
    [(url) => url.includes("/tv/11?"), tvDetails("TV-MA", ["adult animation", "satire"])],
    [(url) => url.includes("/tv/12?"), tvDetails("TV-MA", ["medieval", "romance"])],
  ];

  const res = await empfehlungen("adultanim", profilAnim(), routen);
  const titel = res.body.results.map((r) => r.title);
  assert.equal(titel[0], "Passt zum Profil");
  assert.ok(
    res.body.results[0].punkte > res.body.results[1].punkte,
    "der Schlagwort-Treffer muss sich in den Punkten niederschlagen"
  );
});

test("Ein starkes Profilgenre wiegt schwerer als ein schwaches", async () => {
  const stark = { id: 21, title: "Starkes Genre", original_title: "Starkes Genre",
    release_date: "2015-01-01", genre_ids: [28], vote_average: 7 };
  const schwach = { id: 22, title: "Schwaches Genre", original_title: "Schwaches Genre",
    release_date: "2015-01-01", genre_ids: [18], vote_average: 7 };

  const profil = {
    genres: [{ name: "Action", gewicht: 1 }, { name: "Drama", gewicht: 0.2 }],
    regie: [], studios: [], jahrzehnte: [], titel: [],
  };

  const res = await empfehlungen("movie", profil, [
    ["/genre/movie/list", MOVIE_GENRES],
    ["/discover/movie", { results: [schwach, stark] }],
    [(url) => /\/movie\/2\d\?/.test(url), { keywords: { keywords: [] } }],
  ]);

  assert.deepEqual(res.body.results.map((r) => r.title), ["Starkes Genre", "Schwaches Genre"]);
});

test("Anime: Themes und Demographics kommen ohne Zusatzaufruf mit", async () => {
  const anime = (id, title, genres, themes) => ({
    mal_id: id,
    title,
    titles: [{ type: "Default", title }],
    year: 2015,
    images: { jpg: { image_url: "bild" } },
    genres: genres.map((name, i) => ({ mal_id: i, name })),
    themes: themes.map((name, i) => ({ mal_id: 100 + i, name })),
    demographics: [{ mal_id: 27, name: "Shounen" }],
    score: 8,
  });

  const treffer = [
    anime(1, "Mit Thema", ["Action"], ["Mecha"]),
    anime(2, "Ohne Thema", ["Action"], ["Slice of Life"]),
  ];

  const routen = [
    ["/genres/anime", { data: [{ mal_id: 1, name: "Action" }] }],
    // Die Suche nach dem Profiltitel — sie traegt die Themes des Profils.
    [(url) => url.includes("/anime?") && url.includes("q="), {
      data: [anime(9, "Gundam", ["Action"], ["Mecha"])],
    }],
    [(url) => url.includes("/anime?"), { data: treffer }],
  ];

  const profil = {
    genres: [{ name: "Action", gewicht: 1 }],
    regie: [], studios: [], jahrzehnte: [],
    titel: [{ name: "Gundam", gewicht: 1 }],
  };

  const res = await mitFetch(routen, async (gerufen) => {
    const r = antwortAttrappe();
    await handler({ method: "GET", query: { category: "anime", profil: JSON.stringify(profil) } }, r);
    return { r, gerufen };
  });

  const titel = res.r.body.results.map((x) => x.title);
  assert.equal(titel[0], "Mit Thema", "das gemeinsame Thema \"Mecha\" muss nach oben sortieren");
  assert.ok(
    !res.gerufen.some((u) => u.includes("themoviedb")),
    "Anime duerfen TMDB gar nicht erst anfragen"
  );
});

/* ---------------------------------------------------------------- *
 * Bestehendes Verhalten
 * ---------------------------------------------------------------- */

test("Ohne Profil kommt der Hinweis statt einer Fehlermeldung", async () => {
  const res = await empfehlungen("movie", { genres: [], regie: [], studios: [], jahrzehnte: [] }, []);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.results, []);
  assert.match(res.body.hinweis, /zu wenige Bewertungen/i);
});

test("Spiele bleiben abgewiesen", async () => {
  const res = await empfehlungen("game", profilAnim(), []);
  assert.equal(res.statusCode, 400);
});

test("Alle Schreibweisen gehen mit — daran erkennt die App Bekanntes", async () => {
  const mitOriginal = {
    id: 31,
    title: "The Return of the First Avenger",
    original_title: "Captain America: The Winter Soldier",
    release_date: "2014-01-01",
    genre_ids: [28],
    vote_average: 7.7,
  };

  const res = await empfehlungen(
    "movie",
    { genres: [{ name: "Action", gewicht: 1 }], regie: [], studios: [], jahrzehnte: [], titel: [] },
    [
      ["/genre/movie/list", MOVIE_GENRES],
      ["/discover/movie", { results: [mitOriginal] }],
      [(url) => url.includes("/movie/31?"), { keywords: { keywords: [] } }],
    ]
  );

  assert.deepEqual(res.body.results[0].titel, [
    "The Return of the First Avenger",
    "Captain America: The Winter Soldier",
  ]);
});

test("Doppelte Treffer aus mehreren Abfragen werden zu einem", async () => {
  const profil = {
    genres: [{ name: "Action", gewicht: 1 }, { name: "Drama", gewicht: 0.9 }],
    regie: [], studios: [], jahrzehnte: [], titel: [],
  };
  const film = {
    id: 41, title: "Doppelt gefunden", original_title: "Doppelt gefunden",
    release_date: "2015-01-01", genre_ids: [28, 18], vote_average: 8,
  };

  // Jede Discover-Abfrage liefert denselben Film — es bleibt einer.
  const res = await empfehlungen("movie", profil, [
    ["/genre/movie/list", MOVIE_GENRES],
    ["/discover/movie", { results: [film] }],
    [(url) => url.includes("/movie/41?"), { keywords: { keywords: [] } }],
  ]);

  assert.equal(res.body.results.length, 1);
});

test("Ein zweiter Aufruf mit demselben Profil kommt aus dem Cache", async () => {
  const profil = {
    genres: [{ name: "Action", gewicht: 0.77 }],
    regie: [], studios: [], jahrzehnte: [], titel: [],
  };
  const film = {
    id: 51, title: "Aus dem Cache", original_title: "Aus dem Cache",
    release_date: "2015-01-01", genre_ids: [28], vote_average: 8,
  };
  const routen = [
    ["/genre/movie/list", MOVIE_GENRES],
    ["/discover/movie", { results: [film] }],
    [(url) => url.includes("/movie/51?"), { keywords: { keywords: [] } }],
  ];

  const erste = await empfehlungen("movie", profil, routen);
  assert.ok(!erste.body.cached);

  const zweite = await mitFetch([], async (gerufen) => {
    const res = antwortAttrappe();
    await handler({ method: "GET", query: { category: "movie", profil: JSON.stringify(profil) } }, res);
    return { res, gerufen };
  });

  assert.equal(zweite.res.body.cached, true);
  assert.equal(zweite.gerufen.length, 0, "aus dem Cache darf kein Aufruf mehr rausgehen");
});

test("Ein interner Vermerk landet nicht in der Antwort", async () => {
  const res = await empfehlungen("adultanim", profilAnim(), tvRouten([OHNE, RICK]));
  for (const r of res.body.results) {
    assert.ok(!("unsicher" in r), "der Vermerk zur Kategorie-Passung ist nur intern");
  }
});
