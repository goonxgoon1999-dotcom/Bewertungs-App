/**
 * GET /api/search?title=...&category=movie|series|anime|game
 * -> { results: [{ title, year, poster, titel: [...] }] }
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
 * ein. Dokus fragen TMDB in BEIDEN Bereichen (movie und tv), weil im
 * Doku-Reiter Einzeldokus und Doku-Serien nebeneinander stehen.
 * Die Suche laeuft serverseitig, damit die Schluessel auf dem
 * Server bleiben und es keine CORS-Probleme gibt.
 */

import {
  getJson, tmdbKey, steamGridKey, TMDB_IMAGE_BASE, jahrAus, istSerienArt,
  normalizeTitle, similarity,
} from "./poster.js";

/* So viele Treffer zeigt die Auswahl. Mehr wird auf einem Telefon
   ohnehin nicht ueberblickt. */
const MAX_TREFFER = 8;

/**
 * Ein Treffer fuer die Auswahl. Ohne Titel gibt es nichts anzuzeigen —
 * dann bleibt der Eintrag leer und wird herausgefiltert.
 *
 * `titel` traegt alle Schreibweisen, unter denen die Quelle das Werk
 * fuehrt — deutscher und Originaltitel bei TMDB, dazu die englische und
 * japanische Schreibweise samt Synonymen bei Jikan. Angezeigt wird
 * davon nur die erste; die uebrigen braucht die App, um beim
 * Hinzufuegen zu erkennen, dass derselbe Titel unter anderem Namen
 * laengst in der Sammlung steht.
 */
function eintrag(title, year, poster, ...weitere) {
  const name = typeof title === "string" ? title.trim() : "";
  const titel = [];
  for (const wert of [name, ...weitere]) {
    if (typeof wert !== "string") continue;
    const sauber = wert.trim();
    if (sauber && !titel.includes(sauber)) titel.push(sauber);
  }
  return { title: name || null, year: year || null, poster: poster || null, titel };
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
        hit.poster_path ? TMDB_IMAGE_BASE + hit.poster_path : null,
        // Der Originaltitel neben dem deutschen: In der Sammlung steht
        // "Captain America: The Winter Soldier", TMDB antwortet mit
        // "The Return of the First Avenger".
        isTv ? hit.original_name : hit.original_title
      )
    )
    .filter((e) => e.title);
}

/**
 * Ergaenzt TVMaze-Treffer um die Schreibweisen, die TMDB kennt.
 *
 * TVMaze fuehrt Serien unter genau einem Namen, meist dem englischen.
 * Fuer die Auswahl reicht das — fuer die Duplikat-Warnung nicht: Wer
 * "Willkommen bei den Louds" in der Sammlung hat, soll beim Suchen
 * nach "The Loud House" den Hinweis bekommen. Deshalb laeuft bei
 * Serien zusaetzlich die TMDB-Suche und ihre Titel werden den
 * passenden TVMaze-Treffern beigelegt.
 *
 * Angezeigt wird weiterhin, was TVMaze liefert: Die Reihenfolge und
 * die Namen der Auswahl bleiben unveraendert, es kommen nur
 * Schreibweisen dazu.
 *
 * Zugeordnet wird ueber den ORIGINALTITEL von TMDB — der deutsche
 * waere hier nutzlos, denn genau die Abweichung ist ja der Grund fuer
 * die ganze Uebung. Das Jahr entscheidet mit, damit Neuverfilmungen
 * nicht die Titel ihrer Vorlage erben.
 */
const MIN_ZUORDNUNG = 0.7;

function mitTmdbTiteln(treffer, tmdbTreffer) {
  if (!tmdbTreffer.length) return treffer;

  return treffer.map((t) => {
    let beste = null;
    let bester = 0;
    for (const kandidat of tmdbTreffer) {
      // Ein Jahresunterschied von mehr als einem Jahr trennt zwei
      // Serien zuverlaessiger als jeder Titelvergleich.
      if (t.year && kandidat.year && Math.abs(t.year - kandidat.year) > 1) continue;
      for (const name of kandidat.titel) {
        const wert =
          normalizeTitle(name) === normalizeTitle(t.title) ? 1 : similarity(t.title, name);
        if (wert > bester) {
          bester = wert;
          beste = kandidat;
        }
      }
    }
    if (!beste || bester < MIN_ZUORDNUNG) return t;
    return { ...t, titel: eintrag(t.title, t.year, t.poster, ...beste.titel).titel };
  });
}

/**
 * Zwei Trefferlisten abwechselnd zusammenlegen — erst der eine, dann
 * der andere, und so fort.
 *
 * Fuer Dokus: Ein blosses Aneinanderhaengen wuerde die Serien
 * verdraengen, sobald der Filmbereich schon acht Treffer liefert. So
 * ist beides in der Auswahl zu sehen, und die Reihenfolge innerhalb
 * einer Quelle bleibt, wie die Quelle sie geliefert hat.
 */
function abwechselnd(a, b) {
  const raus = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) raus.push(a[i]);
    if (i < b.length) raus.push(b[i]);
  }
  return raus;
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
      /* Jikan fuehrt denselben Anime unter mehreren Schreibweisen —
         romanisiert, englisch, japanisch, dazu Synonyme. Alle gehen
         mit: Wer "Attack on Titan" bewertet hat, soll beim Suchen nach
         "Shingeki no Kyojin" den Hinweis bekommen. */
      const weitere = [hit.title_english, hit.title_japanese];
      if (Array.isArray(hit.titles)) for (const t of hit.titles) if (t && t.title) weitere.push(t.title);
      if (Array.isArray(hit.title_synonyms)) weitere.push(...hit.title_synonyms);

      return eintrag(
        hit.title,
        typeof hit.year === "number" ? hit.year : jahrAus(hit.aired && hit.aired.from),
        (img && (img.image_url || img.large_image_url)) || null,
        ...weitere
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
      if (!results.length && hasTmdb) {
        results = await tmdbSuche(title, "tv");
      } else if (results.length && hasTmdb) {
        // TVMaze fuehrt und bleibt sichtbar; TMDB steuert nur die
        // weiteren Schreibweisen bei (siehe mitTmdbTiteln).
        results = mitTmdbTiteln(results, await tmdbSuche(title, "tv"));
      }
    } else if (category === "anime") {
      results = await jikanSuche(title);
      if (!results.length && hasTmdb) results = await tmdbSuche(title, "tv");
    } else if (category === "doku") {
      // Beide TMDB-Bereiche, abwechselnd zusammengelegt. Ohne
      // Schluessel bleibt es wie bei Filmen bei iTunes.
      if (hasTmdb) {
        const [filme, serien] = await Promise.all([
          tmdbSuche(title, "movie"),
          tmdbSuche(title, "tv"),
        ]);
        results = abwechselnd(filme, serien);
      } else {
        results = await fromItunes(title);
      }
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
