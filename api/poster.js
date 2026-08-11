/**
 * GET /api/poster?title=...&category=movie|series|anime
 * -> { url: "https://..." } oder { url: null }
 *
 * Die Suche läuft bewusst SERVERSEITIG:
 * - keine CORS-Probleme (der Browser spricht nur mit deiner eigenen Domain)
 * - kein API-Key nötig; alle Quellen sind frei nutzbar
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
async function getJson(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Bewertungs-App/1.0" },
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
 * candidates: [{ titles: [...], url }]
 * -> { url, bestScore }
 *
 * `bestScore` ist der höchste Wert über ALLE Kandidaten, auch über
 * solche ohne Bild. Für die Auswahl zählen nur Kandidaten mit Bild —
 * so verrät die Diagnose, ob ein Titel gar nicht gefunden wurde oder
 * ob der passende Treffer bloß kein Poster mitbrachte.
 */
function pickBestMatch(query, candidates) {
  let best = null;
  let bestUsableScore = 0;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (!candidate) continue;
    // Manche Quellen liefern mehrere Schreibweisen (z. B. Anime auf
    // Japanisch und Englisch) — die beste zählt.
    let score = 0;
    for (const title of candidate.titles) {
      const s = similarity(query, title);
      if (s > score) score = s;
    }
    if (score > bestScore) bestScore = score;

    if (!candidate.url) continue;
    if (score > bestUsableScore) {
      bestUsableScore = score;
      best = candidate;
    }
  }

  const url = best && bestUsableScore >= MIN_SIMILARITY ? best.url : null;
  return { url, bestScore };
}

/* ---------------------------------------------------------------- *
 * Quellen — liefern jeweils mehrere Kandidaten
 *
 * Jede Quelle gibt { url, debug } zurück. `url` ist das Ergebnis wie
 * bisher; `debug` beschreibt, was die Quelle geantwortet hat.
 * ---------------------------------------------------------------- */

const DEBUG_TITLE_SAMPLE = 5; // so viele Kandidatentitel zeigt die Diagnose

/** Baut den Diagnose-Block einer Quelle. */
function buildDebug(source, response, candidates, bestScore) {
  return {
    source,
    status: response.status,
    error: response.error,
    candidates: candidates.length,
    titles: candidates
      .slice(0, DEBUG_TITLE_SAMPLE)
      .map((c) => c.titles[0] || null),
    bestScore: Math.round(bestScore * 100) / 100,
  };
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
    };
  });

  const { url, bestScore } = pickBestMatch(title, candidates);
  return { url, debug: buildDebug("Jikan", response, candidates, bestScore) };
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
    };
  });

  const { url, bestScore } = pickBestMatch(title, candidates);
  return { url, debug: buildDebug("TVMaze", response, candidates, bestScore) };
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
    };
  });

  const { url, bestScore } = pickBestMatch(title, candidates);
  const label = "iTunes (" + (isTv ? "tvSeason" : "movie") + ")";
  return { url, debug: buildDebug(label, response, candidates, bestScore) };
}

/** "Breaking Bad, Season 2" -> "Breaking Bad" */
function stripSeasonSuffix(name) {
  if (!name) return null;
  return name.replace(/,?\s*(season|staffel|series)\s+\d+\s*$/i, "").trim();
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
    return res.status(200).json({ url: CACHE.get(cacheKey), cached: true });
  }

  let chain;
  if (category === "anime") {
    chain = [() => fromJikan(title), () => fromItunes(title, "tv")];
  } else if (category === "series") {
    chain = [() => fromTvmaze(title), () => fromItunes(title, "tv")];
  } else {
    // Kein TVMaze für Filme — TVMaze kennt ausschließlich Serien.
    chain = [() => fromItunes(title, "movie")];
  }

  let url = null;
  const sources = [];
  for (const step of chain) {
    const result = await step();
    sources.push(result.debug);
    if (!url && result.url) {
      url = result.url;
      result.debug.used = true;
      // Ohne Diagnose endet die Kette beim ersten Treffer; mit Diagnose
      // laufen alle Quellen durch, damit man sie vergleichen kann.
      if (!debug) break;
    }
  }

  if (debug) {
    // Diagnose-Antworten dürfen nicht im CDN hängenbleiben.
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      url,
      debug: { title, category, minSimilarity: MIN_SIMILARITY, sources },
    });
  }

  CACHE.set(cacheKey, url);
  // Ergebnis einen Tag im CDN cachen — spart Aufrufe bei den freien APIs.
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json({ url });
}
