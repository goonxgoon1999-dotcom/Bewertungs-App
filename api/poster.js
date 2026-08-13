/**
 * GET /api/poster?title=...&category=movie|series|anime|game
 * -> { url, backdrop, year, director, imdbRating, imdbVerfuegbar }
 *    Alle Datenfelder koennen null sein. `url` ist das Hochkant-Poster,
 *    `backdrop` ein breites Szenenbild fuer den Kopfbereich.
 *
 * Im selben Durchgang kommen bei Film, Serie und Anime die Angaben zum
 * Werk mit: Erscheinungsjahr und Regie aus TMDB, die IMDb-Note als
 * Vergleichswert aus OMDb. Bei Spielen entfaellt das — dort gibt es nur
 * Bilder.
 *
 * Die Suche läuft bewusst SERVERSEITIG:
 * - keine CORS-Probleme (der Browser spricht nur mit deiner eigenen Domain)
 * - der Schlüssel für TMDB bleibt auf dem Server
 *
 * Quellen: Filme -> TMDB, dann iTunes. Serien -> TVMaze, dann TMDB,
 * dann iTunes. Anime -> Jikan, dann TMDB. Spiele -> SteamGridDB.
 *
 * TMDB braucht TMDB_API_KEY; fehlt der, wird TMDB übersprungen und
 * alles läuft über die freien Quellen wie zuvor. Spiele brauchen
 * STEAMGRIDDB_API_KEY; fehlt der, findet für sie gar keine
 * automatische Suche statt und es bleibt bei der manuell
 * eingetragenen URL. Die IMDb-Note braucht OMDB_API_KEY; fehlt der,
 * bleibt sie leer — ein Fehler ist das nicht.
 *
 * Es wird NICHT blind der erste Treffer genommen: Jede Quelle liefert
 * mehrere Kandidaten, deren Titel mit dem gesuchten Titel verglichen
 * werden. Nur wer nah genug dran ist, wird verwendet — sonst lieber
 * gar kein Poster als ein falsches.
 */

const CACHE = new Map(); // einfacher Cache pro laufender Funktion

const RESULT_LIMIT = 15; // 10–15 Kandidaten pro Quelle
const MIN_SIMILARITY = 0.6; // darunter: lieber null

/**
 * Holt JSON und meldet dabei IMMER, was passiert ist:
 *   { data, status, error }
 * - status: HTTP-Statuscode, oder null wenn fetch selbst scheiterte
 * - error:  Fehlertext, oder null wenn alles glattlief
 *
 * Fehler werden bewusst nicht mehr verschluckt: `data` bleibt zwar null,
 * damit die Suche wie bisher weiterläuft, aber der Grund geht nicht
 * verloren und ist über ?debug=1 sichtbar.
 */
async function getJson(url, zusatzKopfzeilen) {
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Bewertungs-App/1.0", ...(zusatzKopfzeilen || {}) },
    });
  } catch (e) {
    return { data: null, status: null, error: "fetch fehlgeschlagen: " + (e.message || String(e)) };
  }

  if (!res.ok) {
    return { data: null, status: res.status, error: "HTTP " + res.status + " " + (res.statusText || "") };
  }

  try {
    return { data: await res.json(), status: res.status, error: null };
  } catch (e) {
    return {
      data: null,
      status: res.status,
      error: "Antwort war kein gültiges JSON: " + (e.message || String(e)),
    };
  }
}

/* ---------------------------------------------------------------- *
 * Titel-Ähnlichkeit
 * ---------------------------------------------------------------- */

/**
 * Vereinheitlicht einen Titel für den Vergleich:
 * Kleinschreibung, Umlaute/Akzente ohne Diakritika, keine Jahreszahlen,
 * keine Sonderzeichen.
 *   "Der Herr der Ringe (2001)" -> "der herr der ringe"
 */
function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Akzente entfernen: é -> e, ä -> a
    .replace(/\b(?:19|20)\d{2}\b/g, " ") // Jahreszahlen ignorieren
    .replace(/[^a-z0-9]+/g, " ") // Sonderzeichen -> Leerzeichen
    .trim()
    .replace(/\s+/g, " ");
}

function tokenize(title) {
  const normalized = normalizeTitle(title);
  return normalized ? normalized.split(" ") : [];
}

/**
 * Füllwörter zählen nur zu einem Bruchteil. Sonst reicht bei Reihen
 * schon der gemeinsame Namensteil für einen Treffer: "Der Herr der
 * Ringe: Die zwei Türme" und "... Die Rückkehr des Königs" teilen sich
 * vier Wörter, von denen drei nichts aussagen.
 */
const STOPWORDS = new Set([
  "der", "die", "das", "den", "dem", "des",
  "ein", "eine", "einen", "einem", "einer", "eines",
  "und", "the", "a", "an", "of", "and",
]);

const STOPWORD_WEIGHT = 0.3;

function weightOf(word) {
  return STOPWORDS.has(word) ? STOPWORD_WEIGHT : 1;
}

function totalWeight(words) {
  let sum = 0;
  for (const word of words) sum += weightOf(word);
  return sum;
}

/**
 * Ähnlichkeit zweier Titel als gewichtete Wortüberschneidung
 * (Dice-Koeffizient):
 *   2 * gemeinsame Wörter / (Wörter A + Wörter B)  -> 0 … 1
 *
 * Symmetrisch, d. h. sowohl fehlende als auch überzählige Wörter
 * senken den Wert. Damit fällt "Alien" vs. "Aliens vs. Predator"
 * durch, "Herr der Ringe" vs. "Der Herr der Ringe" aber nicht.
 */
function similarity(a, b) {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const setA = new Set(tokenize(normA));
  const setB = new Set(tokenize(normB));
  if (!setA.size || !setB.size) return 0;

  let shared = 0;
  for (const word of setA) if (setB.has(word)) shared += weightOf(word);

  const total = totalWeight(setA) + totalWeight(setB);
  if (!total) return 0;

  return (2 * shared) / total;
}

/**
 * Wählt aus den Kandidaten den ähnlichsten aus — oder null, wenn
 * keiner die Mindestähnlichkeit erreicht.
 *
 * candidates: [{ titles: [...], url, backdrop }]
 * -> { url, backdrop, bestScore }
 *
 * `bestScore` ist der höchste Wert über ALLE Kandidaten, auch über
 * solche ohne Bild. Für die Auswahl zählen nur Kandidaten mit Bild —
 * so verrät die Diagnose, ob ein Titel gar nicht gefunden wurde oder
 * ob der passende Treffer bloß kein Poster mitbrachte.
 */
/**
 * Enthaelt der Kandidat ALLE Woerter des gesuchten Titels?
 *
 * Untertitel sind vor allem bei Anime und Serien die Regel: TMDB kennt
 * "Demon Slayer" nur als "Demon Slayer: Kimetsu no Yaiba". Die reine
 * Wortueberschneidung bestraft das (2 von 7 gemeinsamen Woertern = 0.57)
 * und liegt damit unter der Schwelle, obwohl es dasselbe Werk ist.
 */
function istEnthalten(query, title) {
  const gesucht = new Set(tokenize(query));
  const kandidat = new Set(tokenize(title));
  if (!gesucht.size || !kandidat.size) return false;

  // Ein einzelnes Wort ist zu schwach: "Alien" steckt auch in
  // "Alien vs. Predator". Erst ab zwei bedeutungstragenden Woertern
  // ist die Enthaltung ein verlaessliches Signal.
  let inhaltlich = 0;
  for (const wort of gesucht) if (!STOPWORDS.has(wort)) inhaltlich++;
  if (inhaltlich < 2) return false;

  for (const wort of gesucht) if (!kandidat.has(wort)) return false;
  return true;
}

function pickBestMatch(query, candidates, istNutzbar) {
  const nutzbar = istNutzbar || ((c) => !!c.url);
  let best = null;
  let bestUsableScore = 0;
  let bestScore = 0;

  // Zweiter Durchgang: bester Kandidat, der den gesuchten Titel
  // vollstaendig enthaelt. Wird nur genutzt, wenn der strenge
  // Durchgang gar nichts gefunden hat.
  let enthalten = null;
  let enthaltenScore = -1;

  for (const candidate of candidates) {
    if (!candidate) continue;
    // Manche Quellen liefern mehrere Schreibweisen (z. B. Anime auf
    // Japanisch und Englisch) — die beste zählt.
    let score = 0;
    let passtEnthalten = false;
    for (const title of candidate.titles) {
      const s = similarity(query, title);
      if (s > score) score = s;
      if (istEnthalten(query, title)) passtEnthalten = true;
    }
    if (score > bestScore) bestScore = score;

    if (!nutzbar(candidate)) continue;
    if (score > bestUsableScore) {
      bestUsableScore = score;
      best = candidate;
    }
    if (passtEnthalten && score > enthaltenScore) {
      enthaltenScore = score;
      enthalten = candidate;
    }
  }

  let treffer = best && bestUsableScore >= MIN_SIMILARITY ? best : null;
  let ueberEnthaltung = false;
  if (!treffer && enthalten) {
    treffer = enthalten;
    ueberEnthaltung = true;
  }

  // Das Backdrop stammt immer vom selben Kandidaten wie das Poster —
  // sonst koennten Bild und Titel auseinanderfallen.
  return {
    treffer,
    url: treffer ? treffer.url : null,
    backdrop: (treffer && treffer.backdrop) || null,
    bestScore,
    ueberEnthaltung,
  };
}

/* ---------------------------------------------------------------- *
 * Quellen — liefern jeweils mehrere Kandidaten
 *
 * Jede Quelle gibt { url, debug } zurück. `url` ist das Ergebnis wie
 * bisher; `debug` beschreibt, was die Quelle geantwortet hat.
 * ---------------------------------------------------------------- */

const DEBUG_TITLE_SAMPLE = 5; // so viele Kandidatentitel zeigt die Diagnose

/** Baut den Diagnose-Block einer Quelle. */
function buildDebug(source, response, candidates, bestScore, ueberEnthaltung) {
  const block = {
    source,
    status: response.status,
    error: response.error,
    candidates: candidates.length,
    titles: candidates
      .slice(0, DEBUG_TITLE_SAMPLE)
      .map((c) => c.titles[0] || null),
    bestScore: Math.round(bestScore * 100) / 100,
  };
  // Erklaert Treffer, die unter der Schwelle liegen.
  if (ueberEnthaltung) block.ueberEnthaltung = true;
  return block;
}

async function fromJikan(title) {
  const response = await getJson(
    "https://api.jikan.moe/v4/anime?limit=" +
      RESULT_LIMIT +
      "&sfw=true&q=" +
      encodeURIComponent(title)
  );
  const data = response.data;
  const hits = (data && data.data) || [];

  const candidates = hits.map((hit) => {
    const img = hit && hit.images && hit.images.jpg;
    const titles = [hit.title, hit.title_english, hit.title_japanese];
    // `titles` enthält je nach Eintrag noch Synonyme.
    if (Array.isArray(hit.titles)) {
      for (const t of hit.titles) if (t && t.title) titles.push(t.title);
    }
    return {
      titles: titles.filter(Boolean),
      url: (img && (img.large_image_url || img.image_url)) || null,
      // Jikan liefert keine Breitbilder.
      backdrop: null,
    };
  });

  const { url, backdrop, bestScore, ueberEnthaltung } = pickBestMatch(title, candidates);
  return { url, backdrop, debug: buildDebug("Jikan", response, candidates, bestScore, ueberEnthaltung) };
}

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/w780";

/**
 * Der TMDB-Schlüssel ist optional. Fehlt er, wird die Quelle
 * übersprungen und die Suche läuft wie zuvor über die freien APIs —
 * die App darf daran nicht scheitern.
 */
function tmdbKey() {
  const key = process.env.TMDB_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

/**
 * TMDB kennt Filme und Serien, liefert deutsche Titel und meist auch
 * ein Poster. Die Feldnamen unterscheiden sich je nach Suchtyp:
 *   Filme:  title / original_title
 *   Serien: name  / original_name
 */
async function fromTmdb(title, kind) {
  const isTv = kind === "tv";
  const response = await getJson(
    "https://api.themoviedb.org/3/search/" +
      (isTv ? "tv" : "movie") +
      "?api_key=" +
      encodeURIComponent(tmdbKey()) +
      "&language=de-DE&query=" +
      encodeURIComponent(title)
  );
  const data = response.data;
  const hits = ((data && data.results) || []).slice(0, RESULT_LIMIT);

  const candidates = hits.map((hit) => {
    // Deutscher und Originaltitel weichen oft voneinander ab —
    // beide werden abgeglichen, der bessere zählt.
    const titles = isTv
      ? [hit.name, hit.original_name]
      : [hit.title, hit.original_title];
    return {
      titles: titles.filter(Boolean),
      // Kennung und Datum des Treffers: daraus entstehen spaeter
      // Erscheinungsjahr, Regie und die IMDb-Kennung.
      id: hit.id,
      year: jahrAus(isTv ? hit.first_air_date : hit.release_date),
      // Ohne poster_path gibt es kein Bild: Der Eintrag zählt für die
      // Diagnose noch mit, kommt für die Auswahl aber nicht in Frage.
      url: hit.poster_path ? TMDB_IMAGE_BASE + hit.poster_path : null,
      // Breites Szenenbild fuer den Kopfbereich der App.
      backdrop: hit.backdrop_path ? TMDB_BACKDROP_BASE + hit.backdrop_path : null,
    };
  });

  const { url, backdrop, bestScore, ueberEnthaltung } = pickBestMatch(title, candidates);

  // Fuer die Angaben zum Werk zaehlt allein der Titel: ein Treffer ohne
  // Poster ist als Quelle fuer Jahr und Regie genauso gut. Die Auswahl
  // des Bildes darueber bleibt davon unberuehrt.
  const fuerAngaben = pickBestMatch(title, candidates, () => true).treffer;

  const label = "TMDB (" + (isTv ? "tv" : "movie") + ")";
  return {
    url,
    backdrop,
    meta:
      fuerAngaben && fuerAngaben.id != null
        ? { id: fuerAngaben.id, kind: isTv ? "tv" : "movie", year: fuerAngaben.year }
        : null,
    debug: buildDebug(label, response, candidates, bestScore, ueberEnthaltung),
  };
}

/**
 * Der SteamGridDB-Schluessel ist optional. Ohne ihn gibt es fuer Spiele
 * gar keine automatische Suche — TMDB und die uebrigen Quellen kennen
 * keine Spiele, ein Treffer dort waere zwangslaeufig falsch.
 */
function steamGridKey() {
  const key = process.env.STEAMGRIDDB_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

const SGDB_BASIS = "https://www.steamgriddb.com/api/v2";

/** SteamGridDB antwortet stets als { success, data }. */
function sgdbListe(response) {
  const d = response.data;
  return d && d.success && Array.isArray(d.data) ? d.data : [];
}

/** Erste brauchbare Bild-URL aus einer Grid-/Hero-Antwort. */
function ersteBildUrl(response) {
  const eintrag = sgdbListe(response).find((b) => b && typeof b.url === "string" && b.url);
  return eintrag ? eintrag.url : null;
}

/**
 * SteamGridDB in zwei Schritten:
 *   1. Spiel ueber die Autovervollstaendigung suchen und den Titel mit
 *      der bestehenden Aehnlichkeitslogik abgleichen.
 *   2. Fuer die gefundene id die Bilder holen — grids sind die
 *      Hochkant-Poster, heroes die Breitbilder.
 *
 * Die Anmeldung laeuft ueber einen Bearer-Kopf, nicht ueber die URL.
 */
async function fromSteamGridDB(title) {
  const kopf = { Authorization: "Bearer " + steamGridKey() };

  const response = await getJson(
    SGDB_BASIS + "/search/autocomplete/" + encodeURIComponent(title),
    kopf
  );

  const treffer = sgdbListe(response).slice(0, RESULT_LIMIT);
  // In diesem Schritt gibt es noch keine Bilder — ausgewaehlt wird
  // allein nach dem Titel, deshalb zaehlt jeder Kandidat als nutzbar.
  const candidates = treffer.map((spiel) => ({
    titles: [spiel.name].filter(Boolean),
    id: spiel.id,
    url: null,
    backdrop: null,
  }));

  const gewaehlt = pickBestMatch(title, candidates, () => true);
  const debug = buildDebug(
    "SteamGridDB",
    response,
    candidates,
    gewaehlt.bestScore,
    gewaehlt.ueberEnthaltung
  );

  if (!gewaehlt.treffer || gewaehlt.treffer.id == null) {
    return { url: null, backdrop: null, debug };
  }

  const id = gewaehlt.treffer.id;
  debug.spielId = id;

  // Schritt 2: Poster (hochkant) und Hero (breit) getrennt abrufen.
  const grids = await getJson(SGDB_BASIS + "/grids/game/" + id + "?dimensions=600x900", kopf);
  const heroes = await getJson(SGDB_BASIS + "/heroes/game/" + id, kopf);

  debug.gridsStatus = grids.status;
  debug.heroesStatus = heroes.status;
  if (grids.error) debug.gridsError = grids.error;
  if (heroes.error) debug.heroesError = heroes.error;

  return { url: ersteBildUrl(grids), backdrop: ersteBildUrl(heroes), debug };
}

async function fromTvmaze(title) {
  // `search/shows` liefert mehrere Treffer, `singlesearch` nur einen.
  const response = await getJson(
    "https://api.tvmaze.com/search/shows?q=" + encodeURIComponent(title)
  );
  const data = response.data;
  const hits = Array.isArray(data) ? data.slice(0, RESULT_LIMIT) : [];

  const candidates = hits.map((entry) => {
    const show = entry && entry.show;
    const img = show && show.image;
    return {
      titles: [show && show.name].filter(Boolean),
      url: (img && (img.original || img.medium)) || null,
      // TVMaze kennt kein eigenes Breitbild — das vorhandene Bild
      // dient als Rueckfall.
      backdrop: (img && (img.original || img.medium)) || null,
    };
  });

  const { url, backdrop, bestScore, ueberEnthaltung } = pickBestMatch(title, candidates);
  return { url, backdrop, debug: buildDebug("TVMaze", response, candidates, bestScore, ueberEnthaltung) };
}

async function fromItunes(title, kind) {
  const isTv = kind !== "movie";
  const response = await getJson(
    "https://itunes.apple.com/search?limit=" +
      RESULT_LIMIT +
      "&media=" +
      (isTv ? "tvShow&entity=tvSeason" : "movie") +
      "&term=" +
      encodeURIComponent(title)
  );
  const data = response.data;
  const hits = (data && data.results) || [];

  const candidates = hits.map((hit) => {
    const art = hit && hit.artworkUrl100;
    // Bei Serien ist `artistName` der Serienname; `collectionName`
    // trägt noch ein ", Season 2" o. ä. hinter sich her.
    const titles = isTv
      ? [hit.artistName, stripSeasonSuffix(hit.collectionName)]
      : [hit.trackName, hit.collectionName];
    return {
      titles: titles.filter(Boolean),
      url: art ? art.replace("100x100bb", "600x600bb") : null,
      // iTunes liefert quadratische Artworks, kein Breitbild.
      backdrop: null,
    };
  });

  const { url, backdrop, bestScore, ueberEnthaltung } = pickBestMatch(title, candidates);
  const label = "iTunes (" + (isTv ? "tvSeason" : "movie") + ")";
  return { url, backdrop, debug: buildDebug(label, response, candidates, bestScore, ueberEnthaltung) };
}

/** "Breaking Bad, Season 2" -> "Breaking Bad" */
function stripSeasonSuffix(name) {
  if (!name) return null;
  return name.replace(/,?\s*(season|staffel|series)\s+\d+\s*$/i, "").trim();
}

/* ---------------------------------------------------------------- *
 * Angaben zum Werk: Erscheinungsjahr, Regie, IMDb-Note
 *
 * Nur fuer Film, Serie und Anime. Sie haengen am selben TMDB-Treffer,
 * der auch das Poster liefert — dadurch koennen Bild und Angaben nicht
 * zu verschiedenen Werken gehoeren.
 * ---------------------------------------------------------------- */

/** "2001-12-19" -> 2001; alles andere -> null. */
function jahrAus(datum) {
  const treffer = /^(\d{4})/.exec(String(datum || ""));
  return treffer ? Number(treffer[1]) : null;
}

/**
 * Details zu einem TMDB-Treffer — Jahr, Regie und IMDb-Kennung in
 * einer einzigen Anfrage (`append_to_response`).
 *
 * Serien haben oft keinen einzelnen Regisseur. Steht in den Credits
 * keiner, treten die Schoepfer (`created_by`) an dessen Stelle — das
 * ist die Angabe, die bei einer Serie dieselbe Frage beantwortet.
 */
async function tmdbAngaben(kind, id) {
  const response = await getJson(
    "https://api.themoviedb.org/3/" +
      kind +
      "/" +
      encodeURIComponent(id) +
      "?api_key=" +
      encodeURIComponent(tmdbKey()) +
      "&language=de-DE&append_to_response=credits,external_ids"
  );

  const d = response.data || {};
  const crew = d.credits && Array.isArray(d.credits.crew) ? d.credits.crew : [];

  let regie = null;
  for (const person of crew) {
    if (person && (person.job === "Director" || person.job === "Series Director") && person.name) {
      regie = person.name;
      break;
    }
  }
  if (!regie && Array.isArray(d.created_by)) {
    const namen = d.created_by.map((p) => p && p.name).filter(Boolean);
    if (namen.length) regie = namen.join(", ");
  }

  return {
    year: jahrAus(d.release_date || d.first_air_date),
    director: regie,
    // Ueber die IMDb-Kennung wird die Note spaeter eindeutig geholt,
    // ohne dass noch einmal ueber Titel geraten werden muss.
    imdbId: d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || null,
    originalTitle: d.original_title || d.original_name || null,
    debug: { source: "TMDB (details)", status: response.status, error: response.error },
  };
}

/**
 * Der OMDb-Schluessel ist optional. Fehlt er, wird die IMDb-Note gar
 * nicht erst abgefragt und bleibt leer — die App laeuft unveraendert
 * weiter, es gibt keinen Fehler.
 */
function omdbKey() {
  const key = process.env.OMDB_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

/* Welcher OMDb-Typ zu welcher Kategorie passt. Anime laeuft bewusst
   ohne Vorgabe: es gibt Anime-Filme und Anime-Serien. */
const OMDB_TYP = { movie: "movie", series: "series" };

/**
 * IMDb-Note ueber OMDb.
 *
 * Bevorzugt wird die IMDb-Kennung aus TMDB — damit ist der Treffer
 * eindeutig. Fehlt sie, bleibt die Titelsuche; deren Ergebnis wird wie
 * ueberall auf Titelaehnlichkeit geprueft, damit nicht die Note eines
 * fremden Werks am Eintrag landet.
 */
async function fromOmdb(title, category, angaben) {
  const params = ["apikey=" + encodeURIComponent(omdbKey())];
  const imdbId = angaben && angaben.imdbId;
  const originalTitle = angaben && angaben.originalTitle;

  if (imdbId) {
    params.push("i=" + encodeURIComponent(imdbId));
  } else {
    // OMDb kennt fast nur Originaltitel — der aus TMDB passt besser
    // als ein deutscher Titel aus der Sammlung.
    params.push("t=" + encodeURIComponent(originalTitle || title));
    const typ = OMDB_TYP[category];
    if (typ) params.push("type=" + typ);
    if (angaben && angaben.year) params.push("y=" + angaben.year);
  }

  const response = await getJson("https://www.omdbapi.com/?" + params.join("&"));
  const d = response.data;
  const debug = { source: "OMDb", status: response.status, error: response.error };

  if (!d || d.Response !== "True") {
    if (d && d.Error) debug.error = d.Error;
    return { rating: null, debug };
  }

  if (!imdbId) {
    const score = Math.max(
      similarity(title, d.Title),
      originalTitle ? similarity(originalTitle, d.Title) : 0
    );
    debug.bestScore = Math.round(score * 100) / 100;
    if (score < MIN_SIMILARITY && !istEnthalten(title, d.Title)) {
      return { rating: null, debug };
    }
  }

  // "N/A" und fehlende Werte ergeben NaN — dann gibt es eben keine Note.
  const note = parseFloat(d.imdbRating);
  const rating = Number.isNaN(note) ? null : note;
  debug.rating = rating;
  return { rating, debug };
}

/* ---------------------------------------------------------------- *
 * Handler
 * ---------------------------------------------------------------- */

export default async function handler(req, res) {
  const title = (req.query.title || "").trim();
  const category = req.query.category || "movie";
  const debug = req.query.debug === "1";

  if (!title) return res.status(400).json({ error: "title fehlt." });

  const cacheKey = category + "::" + title.toLowerCase();
  // Im Diagnose-Modus wird der Cache übersprungen — sonst käme eine
  // Antwort ohne jede Information darüber, was die Quellen gesagt haben.
  if (!debug && CACHE.has(cacheKey)) {
    return res.status(200).json({ ...CACHE.get(cacheKey), cached: true });
  }

  const hasTmdb = !!tmdbKey();
  const hasSgdb = !!steamGridKey();
  const hasOmdb = !!omdbKey();

  // Jahr, Regie und IMDb-Note gibt es nur bei Film, Serie und Anime.
  const willAngaben = category !== "game";

  let chain;
  if (category === "game") {
    // Nur SteamGridDB kennt Spiele. Ohne Schluessel wird gar nicht
    // gesucht — dann bleibt es bei der von Hand eingetragenen URL.
    chain = hasSgdb ? [() => fromSteamGridDB(title)] : [];
  } else if (category === "anime") {
    // Jikan bleibt erste Wahl; als Fallback ersetzt TMDB das frühere
    // iTunes — außer der Schlüssel fehlt, dann bleibt es bei iTunes.
    chain = [() => fromJikan(title)];
    chain.push(hasTmdb ? () => fromTmdb(title, "tv") : () => fromItunes(title, "tv"));
  } else if (category === "series") {
    // TVMaze zuerst, dann TMDB als zusätzlicher Fallback, iTunes zuletzt.
    chain = [() => fromTvmaze(title)];
    if (hasTmdb) chain.push(() => fromTmdb(title, "tv"));
    chain.push(() => fromItunes(title, "tv"));
  } else {
    // Filme laufen jetzt über TMDB; iTunes bleibt als Netz darunter.
    // Kein TVMaze — TVMaze kennt ausschließlich Serien.
    chain = [];
    if (hasTmdb) chain.push(() => fromTmdb(title, "movie"));
    chain.push(() => fromItunes(title, "movie"));
  }

  let url = null;
  let backdrop = null;
  let tmdbTreffer = null;
  const sources = [];
  for (const step of chain) {
    const result = await step();
    sources.push(result.debug);

    if (!url && result.url) {
      url = result.url;
      result.debug.used = true;
    }
    // Nicht jede Quelle kennt Breitbilder (Jikan und iTunes etwa gar
    // nicht). Deshalb wird weitergesucht, bis auch ein Backdrop da ist
    // — sonst blieben Anime dauerhaft ohne.
    if (!backdrop && result.backdrop) {
      backdrop = result.backdrop;
      result.debug.usedBackdrop = true;
    }
    // Jahr und Regie kennt nur TMDB. Bei Serien liefert TVMaze zwar
    // schon beide Bilder, die Kette laeuft aber weiter bis TMDB —
    // sonst blieben Serien dauerhaft ohne Angaben.
    if (!tmdbTreffer && result.meta) {
      tmdbTreffer = result.meta;
      result.debug.usedMeta = true;
    }

    // Ohne Diagnose endet die Kette, sobald alles Gesuchte da ist; mit
    // Diagnose laufen alle Quellen durch, damit man sie vergleichen kann.
    const angabenOffen = willAngaben && hasTmdb && !tmdbTreffer;
    if (!debug && url && backdrop && !angabenOffen) break;
  }

  // Zusatzangaben: Details zum TMDB-Treffer, danach die IMDb-Note.
  let year = tmdbTreffer ? tmdbTreffer.year : null;
  let director = null;
  let imdbRating = null;
  const angabenDebug = [];

  if (willAngaben) {
    let angaben = null;
    if (tmdbTreffer) {
      angaben = await tmdbAngaben(tmdbTreffer.kind, tmdbTreffer.id);
      angabenDebug.push(angaben.debug);
      if (angaben.year) year = angaben.year;
      director = angaben.director;
    }
    // Ohne TMDB-Treffer bleibt die Titelsuche bei OMDb — besser eine
    // Note ueber den Titel als gar keine.
    if (hasOmdb) {
      const omdb = await fromOmdb(title, category, angaben);
      angabenDebug.push(omdb.debug);
      imdbRating = omdb.rating;
    }
  }

  const antwort = {
    url,
    backdrop,
    year,
    director,
    imdbRating,
    // Sagt dem Frontend, ob eine fehlende Note am fehlenden Schluessel
    // liegt — dann ist es kein erfolgloser Versuch.
    imdbVerfuegbar: willAngaben && hasOmdb,
  };

  if (debug) {
    // Diagnose-Antworten dürfen nicht im CDN hängenbleiben.
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ...antwort,
      debug: {
        title,
        category,
        minSimilarity: MIN_SIMILARITY,
        tmdb: hasTmdb ? "aktiv" : "übersprungen (TMDB_API_KEY fehlt)",
        steamgriddb: hasSgdb ? "aktiv" : "übersprungen (STEAMGRIDDB_API_KEY fehlt)",
        omdb: hasOmdb ? "aktiv" : "übersprungen (OMDB_API_KEY fehlt)",
        sources,
        angaben: angabenDebug,
      },
    });
  }

  CACHE.set(cacheKey, antwort);
  // Ergebnis einen Tag im CDN cachen — spart Aufrufe bei den freien APIs.
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json(antwort);
}
