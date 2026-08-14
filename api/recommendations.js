/**
 * POST /api/recommendations
 * Body: { category: "movie"|"series"|"anime", profil: {...} }
 * -> { results: [{ title, year, poster, begruendung, punkte }], gefragt, hinweis }
 *
 * Vorschlaege auf Grundlage eines Geschmacksprofils statt einzelner
 * "aehnliche Titel"-Abfragen.
 *
 * Das Profil baut die App aus den eigenen Bestbewerteten: welche Genres,
 * welche Regie/Studios und welche Jahrzehnte dort ueberdurchschnittlich
 * gut abschneiden, jeweils mit einem Gewicht zwischen 0 und 1. Dieser
 * Endpunkt uebersetzt es in Abfragen an die Entdecken-Endpunkte der
 * Quellen:
 *
 *   Filme  -> TMDB  /discover/movie  (Genre, Jahrzehnt, Regie, Studio)
 *   Serien -> TMDB  /discover/tv     (Genre, Jahrzehnt)
 *   Anime  -> Jikan /anime           (Genre, Jahrzehnt, nach Note sortiert)
 *
 * Der Weg ueber "Entdecken" ist der eigentliche Unterschied zum
 * frueheren Ansatz: Er liefert einen viel groesseren Kandidatenpool.
 * "Aehnliche Titel zu X" lief besonders bei Anime regelmaessig leer,
 * weil nach dem Aussortieren des bereits Bewerteten kaum etwas uebrig
 * blieb.
 *
 * TMDBs Entdecken-Endpunkt fuer Serien kennt kein `with_crew` — dort
 * gibt es deshalb keine Abfrage nach Regie oder Schoepfern. Filmreihe
 * und Studio sind ohnehin nur bei Filmen hinterlegt.
 *
 * Spiele haben weiterhin keinen Abschnitt: SteamGridDB ist eine
 * Bilddatenbank und kennt weder Genres noch Aehnlichkeiten.
 */

import {
  getJson, tmdbKey, similarity, normalizeTitle, TMDB_IMAGE_BASE, jahrAus,
} from "./poster.js";

const TMDB_BASIS = "https://api.themoviedb.org/3";
const JIKAN_BASIS = "https://api.jikan.moe/v4";

/* So viele Kandidaten gehen an die App zurueck. Angezeigt werden davon
   nur 15 (Filme) bzw. 10 (Serien und Anime) — der Rest ist Vorrat:
   Wandert ein Vorschlag auf die Watchlist, rueckt der naechste ohne
   neuen Aufruf nach. */
const MAX_ERGEBNISSE = 40;

/* Jikan begrenzt auf drei Anfragen pro Sekunde. */
const JIKAN_PAUSE_MS = 400;

/* Wie viele Treffer je Abfrage uebernommen werden. TMDB liefert 20 pro
   Seite, Jikan bis zu 25 — mehr als die Haelfte davon waere ohnehin
   Fuellmaterial weit unterhalb der eigenen Massstaebe. */
const PRO_ABFRAGE = 12;

/* Ergebnisse halten sich im Speicher der laufenden Funktion. Die
   eigentliche Bremse ist der Monatscache in der App; das hier faengt
   nur ab, dass zwei Aufrufe kurz hintereinander doppelt rechnen. */
const CACHE = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 Stunden

/* Die Genrelisten aendern sich praktisch nie und werden deshalb einen
   Tag lang behalten. */
const genreListen = new Map();
const GENRE_LISTE_TTL_MS = 24 * 60 * 60 * 1000;

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/* Vergleichsform fuer Namen — dieselbe Normalisierung wie bei Titeln,
   damit "Sci-Fi" und "Sci Fi" dasselbe Genre sind. */
const schluessel = (name) => normalizeTitle(name);

/* Wie das Werk in der Begruendung heisst. */
const NOMEN = { movie: "Filme", series: "Serien", anime: "Anime" };

/* ---------------------------------------------------------------- *
 * Profil einlesen
 *
 * Es kommt aus dem Browser und wird deshalb wie jede andere Eingabe
 * geprueft: nur Zeichenketten, nur Gewichte zwischen 0 und 1, und pro
 * Teil eine feste Obergrenze. Jeder Profileintrag kostet spaeter
 * externe Aufrufe — ohne Grenze waere das ein offenes Scheunentor.
 * ---------------------------------------------------------------- */

const MAX_GENRES = 4;
const MAX_REGIE = 2;
const MAX_STUDIOS = 1;
const MAX_JAHRZEHNTE = 2;

function profilTeil(roh, maxAnzahl) {
  if (!Array.isArray(roh)) return [];
  const raus = [];
  for (const e of roh) {
    if (raus.length >= maxAnzahl) break;
    if (!e || typeof e.name !== "string") continue;
    const name = e.name.trim().slice(0, 80);
    const gewicht =
      typeof e.gewicht === "number" && Number.isFinite(e.gewicht)
        ? Math.min(1, Math.max(0, e.gewicht))
        : 0;
    if (!name || gewicht <= 0) continue;
    raus.push({ name, gewicht });
  }
  return raus;
}

function profilLesen(roh) {
  const p = roh && typeof roh === "object" ? roh : {};
  return {
    genres: profilTeil(p.genres, MAX_GENRES),
    regie: profilTeil(p.regie, MAX_REGIE),
    studios: profilTeil(p.studios, MAX_STUDIOS),
    // Jahrzehnte stehen als Zeichenkette im Namen ("1990").
    jahrzehnte: profilTeil(p.jahrzehnte, MAX_JAHRZEHNTE).filter((j) =>
      /^\d{4}$/.test(j.name)
    ),
  };
}

function profilLeer(profil) {
  return (
    !profil.genres.length &&
    !profil.regie.length &&
    !profil.studios.length &&
    !profil.jahrzehnte.length
  );
}

/* ---------------------------------------------------------------- *
 * Genrelisten: Name -> Kennung
 *
 * Gespeichert sind bei den Eintraegen Genre-NAMEN, abgefragt wird bei
 * beiden Quellen ueber Kennungen. Die Uebersetzung liefert die jeweils
 * eigene Liste der Quelle — damit passen die Namen zwangslaeufig, denn
 * sie stammen aus derselben API und derselben Sprache.
 * ---------------------------------------------------------------- */

async function tmdbGenreListe(kind) {
  const cacheKey = "tmdb::" + kind;
  const zwischen = genreListen.get(cacheKey);
  if (zwischen && Date.now() - zwischen.zeit < GENRE_LISTE_TTL_MS) return zwischen.liste;

  const response = await getJson(
    TMDB_BASIS + "/genre/" + kind + "/list?api_key=" + encodeURIComponent(tmdbKey()) +
      "&language=de-DE"
  );
  const liste = ((response.data && response.data.genres) || []).filter(
    (g) => g && g.id != null && typeof g.name === "string" && g.name.trim()
  );
  if (liste.length) genreListen.set(cacheKey, { zeit: Date.now(), liste });
  return liste;
}

async function jikanGenreListe() {
  const cacheKey = "jikan::anime";
  const zwischen = genreListen.get(cacheKey);
  if (zwischen && Date.now() - zwischen.zeit < GENRE_LISTE_TTL_MS) return zwischen.liste;

  const response = await getJson(JIKAN_BASIS + "/genres/anime");
  const liste = ((response.data && response.data.data) || [])
    .filter((g) => g && g.mal_id != null && typeof g.name === "string" && g.name.trim())
    .map((g) => ({ id: g.mal_id, name: g.name }));
  if (liste.length) genreListen.set(cacheKey, { zeit: Date.now(), liste });
  return liste;
}

/** Profil-Genres -> [{ name, gewicht, id }], ohne die unbekannten. */
function genresMitKennung(profilGenres, liste) {
  const nachName = new Map(liste.map((g) => [schluessel(g.name), g.id]));
  return profilGenres
    .map((g) => ({ ...g, id: nachName.get(schluessel(g.name)) }))
    .filter((g) => g.id != null);
}

/* ---------------------------------------------------------------- *
 * TMDB — Filme und Serien
 * ---------------------------------------------------------------- */

async function tmdbDiscover(kind, params) {
  const response = await getJson(
    TMDB_BASIS + "/discover/" + kind + "?api_key=" + encodeURIComponent(tmdbKey()) +
      "&language=de-DE&include_adult=false&page=1&" + params
  );
  return ((response.data && response.data.results) || []).slice(0, PRO_ABFRAGE);
}

/**
 * Person -> TMDB-Kennung. Die Schwelle liegt hoeher als bei Titeln:
 * Bei Namen sind Verwechslungen zu leicht ("Christopher Nolan" gegen
 * "Christopher Nolan Jr."), und ein falscher Regisseur brächte eine
 * ganze Abfrage voller unpassender Vorschlaege.
 */
const MIN_NAMENS_AEHNLICHKEIT = 0.8;

async function tmdbKennungFuer(pfad, name, mindest) {
  const response = await getJson(
    TMDB_BASIS + "/search/" + pfad + "?api_key=" + encodeURIComponent(tmdbKey()) +
      "&query=" + encodeURIComponent(name)
  );
  const hits = (response.data && response.data.results) || [];

  let beste = null;
  let bester = 0;
  for (const hit of hits) {
    if (!hit || hit.id == null || typeof hit.name !== "string") continue;
    const s = similarity(name, hit.name);
    if (s > bester) {
      bester = s;
      beste = hit.id;
    }
  }
  return bester >= mindest ? beste : null;
}

/** Ein TMDB-Treffer in der Form, in der auch die Titelsuche liefert. */
function tmdbKandidat(hit, kind, genreNamenNachId) {
  const isTv = kind === "tv";
  const title = (isTv ? hit.name || hit.original_name : hit.title || hit.original_title) || null;
  if (!title) return null;
  return {
    title,
    year: jahrAus(isTv ? hit.first_air_date : hit.release_date),
    poster: hit.poster_path ? TMDB_IMAGE_BASE + hit.poster_path : null,
    genreNamen: (Array.isArray(hit.genre_ids) ? hit.genre_ids : [])
      .map((id) => genreNamenNachId.get(id))
      .filter(Boolean),
    stimmen: typeof hit.vote_average === "number" ? hit.vote_average : null,
  };
}

/**
 * Baut die Abfrageliste fuer TMDB und arbeitet sie ab.
 *
 * Die Reihenfolge ist Absicht: erst die Kombination der beiden
 * staerksten Genres (die engste und damit treffsicherste Abfrage),
 * dann die Genres einzeln, dann Jahrzehnt, Regie und Studio. Faellt
 * eine Abfrage aus (kein Treffer, Person unbekannt), tragen die
 * uebrigen den Pool trotzdem.
 */
async function tmdbSammeln(kind, profil) {
  const liste = await tmdbGenreListe(kind);
  const genreNamenNachId = new Map(liste.map((g) => [g.id, g.name]));
  const genres = genresMitKennung(profil.genres, liste);

  const istFilm = kind === "movie";
  const datumFeld = istFilm ? "primary_release_date" : "first_air_date";
  // Serien sammeln deutlich weniger Stimmen als Filme — dieselbe
  // Schwelle wuerde dort fast alles aussortieren.
  const mindestStimmen = istFilm ? 200 : 50;
  const basis = "sort_by=vote_average.desc&vote_count.gte=" + mindestStimmen;

  const abfragen = [];

  if (genres.length >= 2) {
    abfragen.push({
      params: basis + "&with_genres=" + genres[0].id + "," + genres[1].id,
      herkunft: {},
    });
  }
  for (const g of genres.slice(0, 3)) {
    abfragen.push({ params: basis + "&with_genres=" + g.id, herkunft: {} });
  }
  if (genres.length && profil.jahrzehnte.length) {
    const jahrzehnt = Number(profil.jahrzehnte[0].name);
    abfragen.push({
      params:
        "sort_by=vote_average.desc&vote_count.gte=" + Math.round(mindestStimmen / 2) +
        "&with_genres=" + genres[0].id +
        "&" + datumFeld + ".gte=" + jahrzehnt + "-01-01" +
        "&" + datumFeld + ".lte=" + (jahrzehnt + 9) + "-12-31",
      herkunft: {},
    });
  }

  // Regie und Studio gibt es nur bei Filmen: TMDBs Entdecken-Endpunkt
  // fuer Serien kennt `with_crew` nicht, und ein Studio ist bei Serien
  // gar nicht erst hinterlegt.
  if (istFilm) {
    for (const r of profil.regie) {
      const id = await tmdbKennungFuer("person", r.name, MIN_NAMENS_AEHNLICHKEIT);
      if (id == null) continue;
      abfragen.push({
        params: "sort_by=vote_average.desc&vote_count.gte=50&with_crew=" + id,
        herkunft: { regie: r.name },
      });
    }
    for (const s of profil.studios) {
      const id = await tmdbKennungFuer("company", s.name, MIN_NAMENS_AEHNLICHKEIT);
      if (id == null) continue;
      abfragen.push({
        params: "sort_by=vote_average.desc&vote_count.gte=100&with_companies=" + id,
        herkunft: { studio: s.name },
      });
    }
  }

  const gesammelt = new Map();
  const gefragt = [];
  for (const abfrage of abfragen) {
    const hits = await tmdbDiscover(kind, abfrage.params);
    if (!hits.length) continue;
    gefragt.push(abfrage.herkunft.regie || abfrage.herkunft.studio || "Genre/Jahrzehnt");
    for (const hit of hits) {
      aufnehmen(gesammelt, tmdbKandidat(hit, kind, genreNamenNachId), abfrage.herkunft);
    }
  }
  return { kandidaten: [...gesammelt.values()], gefragt };
}

/* ---------------------------------------------------------------- *
 * Jikan — Anime
 *
 * Jikan hat keinen eigenen "Entdecken"-Endpunkt; die Suche uebernimmt
 * das: nach Genre gefiltert, nach Note sortiert, mit einer Mindestnote
 * als Boden. Das ist genau die Abfrage, die der frueheren
 * "aehnliche Titel"-Sackgasse bei Anime abhilft.
 * ---------------------------------------------------------------- */

const ANIME_MINDESTNOTE = 7;

async function jikanSuche(params) {
  const response = await getJson(
    JIKAN_BASIS + "/anime?sfw=true&order_by=score&sort=desc&min_score=" + ANIME_MINDESTNOTE +
      "&limit=" + PRO_ABFRAGE + "&" + params
  );
  return (response.data && response.data.data) || [];
}

function jikanKandidat(hit) {
  if (!hit || typeof hit.title !== "string" || !hit.title.trim()) return null;
  const img = hit.images && hit.images.jpg;
  return {
    title: hit.title.trim(),
    year:
      typeof hit.year === "number" ? hit.year : jahrAus(hit.aired && hit.aired.from),
    poster: (img && (img.large_image_url || img.image_url)) || null,
    genreNamen: (Array.isArray(hit.genres) ? hit.genres : [])
      .map((g) => (g && typeof g.name === "string" ? g.name : null))
      .filter(Boolean),
    stimmen: typeof hit.score === "number" ? hit.score : null,
  };
}

async function jikanSammeln(profil) {
  const liste = await jikanGenreListe();
  const genres = genresMitKennung(profil.genres, liste);

  const abfragen = [];
  if (genres.length >= 2) {
    abfragen.push("genres=" + genres[0].id + "," + genres[1].id);
  }
  for (const g of genres.slice(0, 3)) {
    abfragen.push("genres=" + g.id);
  }
  if (genres.length && profil.jahrzehnte.length) {
    const jahrzehnt = Number(profil.jahrzehnte[0].name);
    abfragen.push(
      "genres=" + genres[0].id +
        "&start_date=" + jahrzehnt + "-01-01" +
        "&end_date=" + (jahrzehnt + 9) + "-12-31"
    );
  }
  // Ohne uebersetzbares Genre bliebe gar nichts uebrig — dann wenigstens
  // die durchweg hoch bewerteten Anime als Grundlage.
  if (!abfragen.length) abfragen.push("type=tv");

  const gesammelt = new Map();
  const gefragt = [];
  for (let i = 0; i < abfragen.length; i++) {
    if (i) await warte(JIKAN_PAUSE_MS);
    const hits = await jikanSuche(abfragen[i]);
    if (!hits.length) continue;
    gefragt.push("Genre/Jahrzehnt");
    for (const hit of hits) aufnehmen(gesammelt, jikanKandidat(hit), {});
  }
  return { kandidaten: [...gesammelt.values()], gefragt };
}

/* ---------------------------------------------------------------- *
 * Sammeln und bewerten
 * ---------------------------------------------------------------- */

/**
 * Nimmt einen Kandidaten auf. Doppelte verschwinden ueber den
 * normalisierten Titel — dabei werden Luecken gefuellt (ein spaeterer
 * Fund bringt vielleicht ein Poster mit) und die Herkuenfte vereinigt:
 * Wer sowohl in der Genre- als auch in der Regie-Abfrage auftaucht,
 * traegt beides und wird unten hoeher bewertet.
 */
function aufnehmen(gesammelt, kandidat, herkunft) {
  if (!kandidat) return;
  const key = normalizeTitle(kandidat.title);
  if (!key) return;

  const vorhanden = gesammelt.get(key);
  if (!vorhanden) {
    gesammelt.set(key, { ...kandidat, herkunft: { ...herkunft } });
    return;
  }
  if (!vorhanden.poster && kandidat.poster) vorhanden.poster = kandidat.poster;
  if (!vorhanden.year && kandidat.year) vorhanden.year = kandidat.year;
  if (!vorhanden.genreNamen.length && kandidat.genreNamen.length) {
    vorhanden.genreNamen = kandidat.genreNamen;
  }
  if (!vorhanden.herkunft.regie && herkunft.regie) vorhanden.herkunft.regie = herkunft.regie;
  if (!vorhanden.herkunft.studio && herkunft.studio) vorhanden.herkunft.studio = herkunft.studio;
}

/* So viele Genretreffer eines Kandidaten zaehlen hoechstens. Ohne die
   Grenze gewaenne ein Titel, der in acht Genres eingeordnet ist,
   allein durch seine Breite. */
const MAX_GENRE_TREFFER = 3;

/* Zuschlag je zusaetzlich getroffener Kategorie. "Treffer in Genre UND
   Regie" soll mehr wiegen als die Summe beider Einzelgewichte. */
const KATEGORIE_BONUS = 0.15;

/* Das Jahrzehnt ist das schwaechste Signal: Es sagt etwas ueber den
   Geschmack, aber nichts ueber den einzelnen Titel. */
const JAHRZEHNT_FAKTOR = 0.5;

function bewerten(kandidaten, profil, category) {
  const gGewicht = new Map(profil.genres.map((g) => [schluessel(g.name), g.gewicht]));
  const rGewicht = new Map(profil.regie.map((g) => [schluessel(g.name), g.gewicht]));
  const sGewicht = new Map(profil.studios.map((g) => [schluessel(g.name), g.gewicht]));
  const jGewicht = new Map(profil.jahrzehnte.map((g) => [String(Number(g.name)), g.gewicht]));
  const nomen = NOMEN[category] || "Titel";

  return kandidaten.map((k) => {
    let punkte = 0;
    let kategorien = 0;

    const genreTreffer = [];
    for (const name of k.genreNamen) {
      const gewicht = gGewicht.get(schluessel(name));
      if (gewicht == null) continue;
      genreTreffer.push({ name, gewicht });
    }
    genreTreffer.sort((a, b) => b.gewicht - a.gewicht);
    const besteGenres = genreTreffer.slice(0, MAX_GENRE_TREFFER);
    if (besteGenres.length) {
      kategorien++;
      for (const g of besteGenres) punkte += g.gewicht;
    }

    let regie = null;
    if (k.herkunft.regie) {
      const gewicht = rGewicht.get(schluessel(k.herkunft.regie));
      if (gewicht != null) {
        punkte += gewicht;
        kategorien++;
        regie = k.herkunft.regie;
      }
    }

    let studio = null;
    if (k.herkunft.studio) {
      const gewicht = sGewicht.get(schluessel(k.herkunft.studio));
      if (gewicht != null) {
        punkte += gewicht;
        kategorien++;
        studio = k.herkunft.studio;
      }
    }

    let jahrzehnt = null;
    if (k.year) {
      const jz = String(Math.floor(k.year / 10) * 10);
      const gewicht = jGewicht.get(jz);
      if (gewicht != null) {
        punkte += gewicht * JAHRZEHNT_FAKTOR;
        kategorien++;
        jahrzehnt = Number(jz);
      }
    }

    if (kategorien >= 2) punkte *= 1 + KATEGORIE_BONUS * (kategorien - 1);
    // Winziger Ausschlag fuer die allgemeine Beliebtheit. Er entscheidet
    // nur bei Gleichstand und kann keinen Profiltreffer ueberholen.
    punkte += (typeof k.stimmen === "number" ? k.stimmen : 0) / 1000;

    return {
      title: k.title,
      year: k.year || null,
      poster: k.poster || null,
      begruendung: begruendung(nomen, besteGenres.map((g) => g.name), regie, studio, jahrzehnt),
      punkte: Math.round(punkte * 1000) / 1000,
    };
  });
}

/**
 * Der eine Satz, der unter jedem Vorschlag steht. Er nennt genau die
 * Kategorien, die den Vorschlag getragen haben — nicht mehr, sonst
 * wird aus der Begruendung eine Aufzaehlung.
 */
function begruendung(nomen, genres, regie, studio, jahrzehnt) {
  const g = genres.slice(0, 2).join(" & ");
  if (regie) return "weil du " + (g ? g + "-" : "") + nomen + " von " + regie + " hoch bewertest";
  if (studio) return "weil du " + nomen + " von " + studio + " hoch bewertest";
  if (g && jahrzehnt) return "weil du " + g + "-" + nomen + " aus den " + jahrzehnt + "ern hoch bewertest";
  if (g) return "weil du " + g + "-" + nomen + " hoch bewertest";
  if (jahrzehnt) return "weil deine Bestbewerteten oft aus den " + jahrzehnt + "ern kommen";
  return "passt zu deinen bestbewerteten " + nomen;
}

/* ---------------------------------------------------------------- *
 * Handler
 * ---------------------------------------------------------------- */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Methode nicht erlaubt." });
    }

    const body = req.body || {};
    const category = body.category || "movie";

    if (category === "game") {
      return res.status(400).json({
        error: "Für Spiele gibt es keine Empfehlungen.",
        hinweis: "SteamGridDB ist eine Bilddatenbank und kennt keine Genres.",
      });
    }
    if (!["movie", "series", "anime"].includes(category)) {
      return res.status(400).json({ error: "Ungültige Kategorie." });
    }

    const profil = profilLesen(body.profil);
    if (profilLeer(profil)) {
      return res.status(200).json({
        results: [],
        gefragt: [],
        hinweis: "Noch zu wenige Bewertungen für ein Geschmacksprofil.",
      });
    }

    const istAnime = category === "anime";

    // Filme und Serien haengen beide an TMDB. Ohne Schluessel gibt es
    // keine Quelle — das ist kein Fehler, sondern eine Auskunft.
    if (!istAnime && !tmdbKey()) {
      return res.status(200).json({
        results: [],
        gefragt: [],
        hinweis: "Ohne TMDB_API_KEY gibt es für diese Kategorie keine Empfehlungen.",
      });
    }

    const cacheKey = category + "::" + JSON.stringify(profil);
    const zwischen = CACHE.get(cacheKey);
    if (zwischen && Date.now() - zwischen.zeit < CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ...zwischen.antwort, cached: true });
    }

    const { kandidaten, gefragt } = istAnime
      ? await jikanSammeln(profil)
      : await tmdbSammeln(category === "series" ? "tv" : "movie", profil);

    const bewertet = bewerten(kandidaten, profil, category);
    bewertet.sort((a, b) => b.punkte - a.punkte);

    const antwort = { results: bewertet.slice(0, MAX_ERGEBNISSE), gefragt };
    CACHE.set(cacheKey, { zeit: Date.now(), antwort });

    // Nicht im CDN ablegen: Die Antwort haengt am Profil im Rumpf, und
    // die eigentliche Bremse ist ohnehin der Monatscache in der App.
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(antwort);
  } catch (err) {
    console.error("API-Fehler:", err);
    return res.status(500).json({ error: "Serverfehler: " + (err.message || "unbekannt") });
  }
}
