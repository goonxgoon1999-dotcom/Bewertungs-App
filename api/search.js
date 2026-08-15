/**
 * GET /api/search?title=...&category=movie|series|anime|game
 * -> { results: [{ title, year, poster }] }
 *
 * Liefert MEHRERE Treffer zur Auswahl — im Unterschied zu
 * `api/poster.js`, das aus denselben Quellen genau einen bestmoeglichen
 * Treffer bestimmt. Hier wird bewusst NICHT nach Aehnlichkeit gefiltert:
 * Wer sucht, sieht die Liste und entscheidet selbst.
 *
 * Quellen wie ueberall in der App: Filme -> TMDB (ohne Schluessel
 * iTunes), Serien (auch Kinderserien und Adult Animation) -> TVMaze,
 * Anime -> Jikan, Spiele -> SteamGridDB.
 * Findet die erste Quelle nichts, springt bei Serien und Anime TMDB
 * ein. Die Suche laeuft serverseitig, damit die Schluessel auf dem
 * Server bleiben und es keine CORS-Probleme gibt.
 */

import { getJson, tmdbKey, steamGridKey, TMDB_IMAGE_BASE, jahrAus, istSerienArt } from "./poster.js";

/* So viele Treffer zeigt die Auswahl. Mehr wird auf einem Telefon
   ohnehin nicht ueberblickt. */
const MAX_TREFFER = 8;

/* Ein Treffer fuer die Auswahl. Ohne Titel gibt es nichts anzuzeigen —
   dann bleibt der Eintrag leer und wird herausgefiltert. */
function eintrag(title, year, poster) {
  const name = typeof title === "string" ? title.trim() : "";
  return { title: name || null, year: year || null, poster: poster || null };
}

async function tmdbSuche(title, kind) {
  const isTv = kind === "tv";
  const response = await getJson(
    "https://api.themoviedb.org/3/search/" +
      (isTv ? "tv" : "movie") +
      "?api_key=" +
      encodeURIComponent(tmdbKey()) +
      "&language=de-DE&query=" +
      encodeURIComponent(title)
  );
  const hits = ((response.data && response.data.results) || []).slice(0, MAX_TREFFER);
  return hits
    .map((hit) =>
      eintrag(
        isTv ? hit.name || hit.original_name : hit.title || hit.original_title,
        jahrAus(isTv ? hit.first_air_date : hit.release_date),
        hit.poster_path ? TMDB_IMAGE_BASE + hit.poster_path : null
      )
    )
    .filter((e) => e.title);
}

async function tvmazeSuche(title) {
  const response = await getJson(
    "https://api.tvmaze.com/search/shows?q=" + encodeURIComponent(title)
  );
  const hits = Array.isArray(response.data) ? response.data.slice(0, MAX_TREFFER) : [];
  return hits
    .map((e) => {
      const show = e && e.show;
      if (!show || !show.name) return null;
      const img = show.image;
      return eintrag(show.name, jahrAus(show.premiered), (img && (img.medium || img.original)) || null);
    })
    .filter(Boolean);
}

async function jikanSuche(title) {
  const response = await getJson(
    "https://api.jikan.moe/v4/anime?limit=" + MAX_TREFFER + "&sfw=true&q=" + encodeURIComponent(title)
  );
  const hits = (response.data && response.data.data) || [];
  return hits
    .map((hit) => {
      if (!hit || !hit.title) return null;
      const img = hit.images && hit.images.jpg;
      return eintrag(
        hit.title,
        typeof hit.year === "number" ? hit.year : jahrAus(hit.aired && hit.aired.from),
        (img && (img.image_url || img.large_image_url)) || null
      );
    })
    .filter(Boolean);
}

/**
 * SteamGridDB kennt in der Autovervollstaendigung nur Name und
 * Kennung. Die Bilder haengen an einer zweiten Abfrage pro Spiel —
 * dafuer acht weitere Aufrufe je Suche waeren zu teuer. Die Auswahl
 * zeigt Spiele deshalb ohne Vorschaubild; das Poster traegt die
 * bestehende automatische Suche nach, sobald der Eintrag angelegt ist.
 */
async function steamGridSuche(title) {
  const response = await getJson(
    "https://www.steamgriddb.com/api/v2/search/autocomplete/" + encodeURIComponent(title),
    { Authorization: "Bearer " + steamGridKey() }
  );
  const d = response.data;
  const hits = d && d.success && Array.isArray(d.data) ? d.data.slice(0, MAX_TREFFER) : [];
  return hits
    .filter((spiel) => spiel && spiel.name)
    .map((spiel) =>
      eintrag(
        spiel.name,
        // `release_date` kommt als Unix-Zeit in Sekunden, wenn ueberhaupt.
        typeof spiel.release_date === "number"
          ? new Date(spiel.release_date * 1000).getUTCFullYear()
          : null,
        null
      )
    );
}

async function fromItunes(title) {
  const response = await getJson(
    "https://itunes.apple.com/search?limit=" + MAX_TREFFER + "&media=movie&term=" + encodeURIComponent(title)
  );
  const hits = (response.data && response.data.results) || [];
  return hits
    .filter((hit) => hit && hit.trackName)
    .map((hit) =>
      eintrag(
        hit.trackName,
        jahrAus(hit.releaseDate),
        hit.artworkUrl100 ? hit.artworkUrl100.replace("100x100bb", "600x600bb") : null
      )
    );
}

export default async function handler(req, res) {
  try {
    const title = (req.query.title || "").trim();
    const category = req.query.category || "movie";
    if (!title) return res.status(400).json({ error: "title fehlt." });

    const hasTmdb = !!tmdbKey();
    let results = [];

    if (category === "game") {
      results = steamGridKey() ? await steamGridSuche(title) : [];
    } else if (istSerienArt(category)) {
      // Serien, Kinderserien und Adult Animation teilen sich dieselbe
      // Quelle — fuer TVMaze und TMDB sind alle drei schlicht Serien.
      results = await tvmazeSuche(title);
      if (!results.length && hasTmdb) results = await tmdbSuche(title, "tv");
    } else if (category === "anime") {
      results = await jikanSuche(title);
      if (!results.length && hasTmdb) results = await tmdbSuche(title, "tv");
    } else {
      results = hasTmdb ? await tmdbSuche(title, "movie") : await fromItunes(title);
    }

    // Dieselbe Suche liefert dasselbe Ergebnis — eine Stunde im CDN
    // halten spart Aufrufe bei den freien APIs.
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({ results: results.slice(0, MAX_TREFFER) });
  } catch (err) {
    console.error("API-Fehler:", err);
    return res.status(500).json({ error: "Serverfehler: " + (err.message || "unbekannt") });
  }
}
