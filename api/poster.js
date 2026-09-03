/**
 * GET /api/poster?title=...&category=movie|series|anime|game
 * -> { url, backdrop, year, director, imdbRating, imdbVerfuegbar,
 *      genres, collection, studio,
 *      runtimeMinutes, episodeRuntime, episodeCount, episodesPerSeason }
 *    Alle Datenfelder koennen null (bzw. `genres` leer) sein. `url` ist
 *    das Hochkant-Poster, `backdrop` ein breites Szenenbild fuer den
 *    Kopfbereich.
 *
 * Im selben Durchgang kommen bei Film, Serie und Anime die Angaben zum
 * Werk mit: Erscheinungsjahr und Regie aus TMDB, die IMDb-Note als
 * Vergleichswert aus OMDb. Dazu das Genre — bei Anime von Jikan, sonst
 * von TMDB — und bei Filmen zusaetzlich die Filmreihe
 * (`belongs_to_collection`) und das Produktionsstudio. Bei Spielen
 * entfaellt das alles — dort gibt es nur Bilder.
 *
 * Ebenfalls im selben Durchgang: die Laufzeit. Bei Filmen ist das
 * TMDBs `runtime`, bei Serien und Anime die Episodenlaenge mal der
 * Episodenanzahl (Jikan bei Anime, sonst TMDB bzw. TVMaze). Spiele
 * bleiben auch hier aussen vor.
 *
 * Die Suche läuft bewusst SERVERSEITIG:
 * - keine CORS-Probleme (der Browser spricht nur mit deiner eigenen Domain)
 * - der Schlüssel für TMDB bleibt auf dem Server
 *
 * Quellen: Filme -> TMDB, dann iTunes. Serien -> TVMaze, dann TMDB,
 * dann iTunes. Anime -> Jikan, dann TMDB. Spiele -> SteamGridDB.
 * Kinderserien und Adult Animation laufen ueber dieselbe Kette wie
 * Serien — fuer die Quellen sind es Serien. Dokus und Sitcoms/Comedy
 * laufen ueber TMDB, dort aber ueber BEIDE Bereiche (movie und tv): in
 * ihrem Reiter stehen Filme und Serien nebeneinander.
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

/**
 * Fassung der Angaben zum Werk (Jahr, Regie, IMDb-Note).
 *
 * Die Antwort dieser Funktion wird einen Tag im CDN gehalten und bis zu
 * eine Woche als veralteter Stand weitergereicht. Wird hier etwas
 * ergaenzt, kaemen ohne diese Zahl tagelang alte Antworten zurueck, in
 * denen die neuen Felder fehlen — das Frontend haelt den Eintrag dann
 * faelschlich fuer aussichtslos. Die Zahl steckt im Cache-Schluessel und
 * schickt das Frontend als `v` mit; sie hochzuzaehlen entwertet beide
 * Caches auf einen Schlag.
 */
export const ANGABEN_VERSION = 4;

const RESULT_LIMIT = 15; // 10–15 Kandidaten pro Quelle
const MIN_SIMILARITY = 0.6; // darunter: lieber null

/**
 * Kategorien, die bei den Quellen wie eine Serie behandelt werden:
 * TVMaze zuerst, TMDB als `tv`, iTunes als `tvShow`.
 *
 * Kinderserien und Adult Animation sind fuer die App eigene
 * Kategorien mit eigenen Kriterien — fuer TVMaze und TMDB sind sie
 * schlicht Serien. Anime steht bewusst NICHT in dieser Liste: dort
 * fuehrt Jikan, und es gibt auch Anime-Filme.
 */
export function istSerienArt(category) {
  return category === "series" || category === "kids" || category === "adultanim";
}

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
export async function getJson(url, zusatzKopfzeilen) {
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
export function normalizeTitle(title) {
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
export function similarity(a, b) {
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

/**
 * Namen aus einer Liste benannter Objekte — [{ name }] -> ["…"].
 * Genau die Form, in der TMDB und Jikan Genres, Studios und
 * Produktionsfirmen liefern.
 */
function namenAus(liste) {
  if (!Array.isArray(liste)) return [];
  const namen = [];
  for (const e of liste) {
    const name = e && typeof e.name === "string" ? e.name.trim() : "";
    if (name && !namen.includes(name)) namen.push(name);
  }
  return namen;
}

/* ---------------------------------------------------------------- *
 * Laufzeit
 * ---------------------------------------------------------------- */

/**
 * Minuten- und Stueckzahlen aus den Quellen: eine positive ganze Zahl
 * oder null. 0 und Unsinn gelten als "nicht bekannt" — eine Laufzeit
 * von 0 Minuten ist keine Angabe.
 */
function positiveZahl(wert) {
  const n = typeof wert === "number" ? wert : Number(wert);
  if (!Number.isFinite(n)) return null;
  const ganz = Math.round(n);
  return ganz > 0 ? ganz : null;
}

/**
 * Jikan nennt die Episodenlaenge als Text: "24 min per ep",
 * "1 hr 58 min", "Unknown". Daraus werden Minuten. Angaben in Sekunden
 * ("15 sec per ep", es gibt solche Kurzformate) ergeben gerundet 0 und
 * damit keine Laufzeit — genauer waere hier scheingenau.
 */
export function dauerInMinuten(text) {
  if (typeof text !== "string") return null;
  const stunden = /(\d+)\s*hr/i.exec(text);
  const minuten = /(\d+)\s*min/i.exec(text);
  let summe = 0;
  if (stunden) summe += Number(stunden[1]) * 60;
  if (minuten) summe += Number(minuten[1]);
  return positiveZahl(summe);
}

/** Englischer Titel aus Jikans `titles`-Liste, falls vorhanden. */
function englischerTitel(hit) {
  if (!hit || !Array.isArray(hit.titles)) return null;
  const treffer = hit.titles.find(
    (t) => t && t.title && typeof t.type === "string" && t.type.toLowerCase() === "english"
  );
  return treffer ? treffer.title : null;
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
      // Fuer die Angaben zum Werk: Jikan kennt das Startjahr direkt,
      // die Regie steht hinter der mal_id in einer eigenen Abfrage.
      malId: hit.mal_id,
      year:
        typeof hit.year === "number"
          ? hit.year
          : jahrAus(hit.aired && hit.aired.from),
      // OMDb kennt Anime fast nur unter dem englischen Titel. `title`
      // ist bei Jikan der romanisierte japanische ("Shingeki no
      // Kyojin") und fuehrt dort zu nichts. `title_english` fehlt aber
      // bei vielen Eintraegen — dann steht der englische Titel noch in
      // der Liste `titles` unter dem Typ "English".
      englishTitle: hit.title_english || englischerTitel(hit) || null,
      // Jikans Genres sind die treffenderen fuer Anime: TMDB kennt dort
      // nur "Animation" und "Action & Adventure", Jikan unterscheidet
      // "Shounen", "Isekai", "Slice of Life". `themes` und
      // `demographics` bleiben bewusst draussen — sie wuerden die
      // Genreliste verwaessern.
      genres: namenAus(hit.genres),
      // Laufzeit: Jikan nennt Episodenanzahl und Episodenlaenge direkt.
      // Anime-Filme fuehrt es als eine Folge in voller Laenge — die
      // Rechnung Anzahl mal Laenge trifft damit auch diesen Fall.
      episodeCount: positiveZahl(hit.episodes),
      episodeRuntime: dauerInMinuten(hit.duration),
      url: (img && (img.large_image_url || img.image_url)) || null,
      // Jikan liefert keine Breitbilder.
      backdrop: null,
    };
  });

  const { url, backdrop, bestScore, ueberEnthaltung } = pickBestMatch(title, candidates);

  // Fuer die Angaben zaehlt allein der Titel — ein Treffer ohne Bild
  // ist als Quelle fuer Jahr und Regie genauso gut.
  const fuerAngaben = pickBestMatch(title, candidates, () => true).treffer;

  return {
    url,
    backdrop,
    eigeneAngaben:
      fuerAngaben && fuerAngaben.malId != null
        ? {
            quelle: "jikan",
            id: fuerAngaben.malId,
            year: fuerAngaben.year,
            originalTitle: fuerAngaben.englishTitle,
            imdbId: null,
            genres: fuerAngaben.genres || [],
            episodeCount: fuerAngaben.episodeCount,
            episodeRuntime: fuerAngaben.episodeRuntime,
          }
        : null,
    debug: buildDebug("Jikan", response, candidates, bestScore, ueberEnthaltung),
  };
}

/**
 * Regie eines Anime ueber die Stab-Liste. Jikan fuehrt Personen mit
 * ihren Positionen ("Director", "Chief Director", …); die exakte
 * Position "Director" hat Vorrang.
 *
 * Die Namen stehen dort mit Komma ("Araki, Tetsuro") — fuer die Anzeige
 * wird daraus die uebliche Reihenfolge.
 */
async function jikanRegie(malId) {
  const response = await getJson("https://api.jikan.moe/v4/anime/" + encodeURIComponent(malId) + "/staff");
  const liste = (response.data && response.data.data) || [];

  let genau = null;
  let irgendein = null;
  for (const eintrag of liste) {
    const name = eintrag && eintrag.person && eintrag.person.name;
    const positionen = (eintrag && eintrag.positions) || [];
    if (!name || !Array.isArray(positionen)) continue;
    if (positionen.includes("Director")) { genau = name; break; }
    if (!irgendein && positionen.some((p) => typeof p === "string" && p.includes("Director"))) {
      irgendein = name;
    }
  }

  return {
    director: nameOrdnen(genau || irgendein),
    debug: { source: "Jikan (staff)", status: response.status, error: response.error },
  };
}

/** "Araki, Tetsuro" -> "Tetsuro Araki"; alles ohne Komma bleibt, wie es ist. */
function nameOrdnen(name) {
  if (!name) return null;
  const teile = String(name).split(",");
  if (teile.length !== 2) return String(name).trim();
  const vorne = teile[1].trim();
  const hinten = teile[0].trim();
  return vorne && hinten ? vorne + " " + hinten : String(name).trim();
}

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/w780";

/**
 * Der TMDB-Schlüssel ist optional. Fehlt er, wird die Quelle
 * übersprungen und die Suche läuft wie zuvor über die freien APIs —
 * die App darf daran nicht scheitern.
 */
export function tmdbKey() {
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
 * Welche TMDB-Bereiche eine Kategorie abfragt — genau die Reihenfolge,
 * in der die Suchkette oben sie durchlaeuft.
 *
 * Anime steht bewusst bei `tv`: Dort fuehrt zwar Jikan, aber die
 * Angaben zum Werk (Jahr, Regie, IMDb-Kennung) kommen auch bei Anime
 * aus dem TMDB-Serientreffer. Spiele kennt TMDB gar nicht.
 */
function tmdbArten(category) {
  if (category === "game") return [];
  if (category === "doku" || category === "comedy") return ["movie", "tv"];
  if (category === "anime" || istSerienArt(category)) return ["tv"];
  return ["movie"];
}

/**
 * Der TMDB-Treffer zu einem Titel: `{ id, kind, year }` oder null.
 *
 * Das ist GENAU die Zuordnung, aus der auch Jahr, Regie und die
 * IMDb-Kennung stammen (siehe `tmdbTreffer` im Handler unten) — mit
 * derselben Kandidatenauswahl und derselben Aehnlichkeitsschwelle.
 * Andere Endpunkte, die eine TMDB-Kennung brauchen, greifen hier zu,
 * statt sich eine zweite Zuordnungslogik zu bauen.
 */
export async function tmdbKennungFuer(title, category) {
  if (!tmdbKey()) return null;
  for (const kind of tmdbArten(category)) {
    const { meta } = await fromTmdb(title, kind);
    if (meta) return meta;
  }
  return null;
}

/**
 * Der SteamGridDB-Schluessel ist optional. Ohne ihn gibt es fuer Spiele
 * gar keine automatische Suche — TMDB und die uebrigen Quellen kennen
 * keine Spiele, ein Treffer dort waere zwangslaeufig falsch.
 */
export function steamGridKey() {
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
    const externals = (show && show.externals) || {};
    return {
      titles: [show && show.name].filter(Boolean),
      // Fuer die Angaben zum Werk: TVMaze nennt das Startdatum und —
      // besonders wertvoll — die IMDb-Kennung direkt mit. Damit ist die
      // Note eindeutig zu holen, ohne ueber Titel zu raten.
      showId: show && show.id,
      year: jahrAus(show && show.premiered),
      imdbId: externals.imdb || null,
      originalTitle: (show && show.name) || null,
      // TVMaze fuehrt Genres als schlichte Liste von Zeichenketten.
      genres: Array.isArray(show && show.genres)
        ? show.genres.filter((g) => typeof g === "string" && g.trim()).map((g) => g.trim())
        : [],
      // Die Episodenlaenge steht schon in der Suche; die Episodenzahl
      // haengt an einer eigenen Abfrage (siehe tvmazeFolgen).
      episodeRuntime: positiveZahl(show && (show.averageRuntime || show.runtime)),
      episodeCount: null,
      url: (img && (img.original || img.medium)) || null,
      // TVMaze kennt kein eigenes Breitbild — das vorhandene Bild
      // dient als Rueckfall.
      backdrop: (img && (img.original || img.medium)) || null,
    };
  });

  const { url, backdrop, bestScore, ueberEnthaltung } = pickBestMatch(title, candidates);

  // Wie bei den anderen Quellen: fuer die Angaben zaehlt nur der Titel.
  const fuerAngaben = pickBestMatch(title, candidates, () => true).treffer;

  return {
    url,
    backdrop,
    eigeneAngaben:
      fuerAngaben && fuerAngaben.showId != null
        ? {
            quelle: "tvmaze",
            id: fuerAngaben.showId,
            year: fuerAngaben.year,
            originalTitle: fuerAngaben.originalTitle,
            imdbId: fuerAngaben.imdbId,
            genres: fuerAngaben.genres || [],
            episodeCount: fuerAngaben.episodeCount,
            episodeRuntime: fuerAngaben.episodeRuntime,
          }
        : null,
    debug: buildDebug("TVMaze", response, candidates, bestScore, ueberEnthaltung),
  };
}

/**
 * Ersteller einer Serie ueber die Stab-Liste von TVMaze. Bei Serien
 * gibt es meist keinen einzelnen Regisseur — der Schoepfer beantwortet
 * dieselbe Frage. Gibt es keinen, wird ersatzweise die Regie genommen.
 */
async function tvmazeErsteller(showId) {
  const response = await getJson("https://api.tvmaze.com/shows/" + encodeURIComponent(showId) + "/crew");
  const liste = Array.isArray(response.data) ? response.data : [];

  const namenMit = (typ) =>
    liste
      .filter((e) => e && e.type === typ && e.person && e.person.name)
      .map((e) => e.person.name);

  const schoepfer = namenMit("Creator");
  const regie = schoepfer.length ? schoepfer : namenMit("Director");

  return {
    director: regie.length ? regie.join(", ") : null,
    debug: { source: "TVMaze (crew)", status: response.status, error: response.error },
  };
}

/**
 * Die Folgen einer Serie bei TVMaze. Ein Aufruf liefert sie alle mit
 * Staffelnummer und einzelner Laufzeit — daraus entstehen die
 * Episodenanzahl je Staffel und die genaueste Summe, die es gibt:
 * Folge fuer Folge addiert statt geschaetzt.
 *
 * Specials liefert TVMaze nur auf Nachfrage; die Antwort enthaelt sie
 * also nicht. Sollte doch eine Folge in Staffel 0 stehen, bleibt sie
 * draussen — Specials gehoeren nicht zum Durchschauen der Serie.
 *
 * Der Aufruf kostet eine Anfrage und laeuft deshalb nur, wenn TMDB die
 * Angaben nicht schon mitgebracht hat.
 */
async function tvmazeFolgen(showId) {
  const response = await getJson(
    "https://api.tvmaze.com/shows/" + encodeURIComponent(showId) + "/episodes"
  );
  const liste = Array.isArray(response.data) ? response.data : [];

  const jeStaffel = new Map();
  let bekannteMinuten = 0;
  let mitLaufzeit = 0;

  for (const folge of liste) {
    const staffel = folge && Number(folge.season);
    if (!Number.isFinite(staffel) || staffel < 1) continue;
    jeStaffel.set(staffel, (jeStaffel.get(staffel) || 0) + 1);
    const dauer = positiveZahl(folge.runtime);
    if (dauer) {
      bekannteMinuten += dauer;
      mitLaufzeit++;
    }
  }

  const nummern = [...jeStaffel.keys()].sort((a, b) => a - b);
  const episodesPerSeason = nummern.map((n) => jeStaffel.get(n));
  const episodeCount = episodesPerSeason.reduce((s, n) => s + n, 0);
  const schnitt = mitLaufzeit ? bekannteMinuten / mitLaufzeit : 0;

  return {
    episodesPerSeason,
    episodeCount: positiveZahl(episodeCount),
    episodeRuntime: positiveZahl(schnitt),
    // Fehlt bei einzelnen Folgen die Laufzeit, wird ihr Anteil mit dem
    // Durchschnitt der uebrigen ergaenzt.
    minutes: positiveZahl(bekannteMinuten + (episodeCount - mitLaufzeit) * schnitt),
    debug: {
      source: "TVMaze (episodes)",
      status: response.status,
      error: response.error,
      folgen: episodeCount,
    },
  };
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
export function jahrAus(datum) {
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
 *
 * Dieselbe Antwort traegt auch die Zusatzdaten: Genre (beide Arten),
 * sowie bei Filmen die Filmreihe und das Produktionsstudio. Und die
 * Laufzeit — bei Filmen `runtime`, bei Serien Episodenlaenge und
 * Episodenanzahl je Staffel.
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

  /* Laufzeit. Bei Filmen steht sie direkt in den Details; bei Serien
     liefert dieselbe Antwort die uebliche Episodenlaenge und die
     Episodenanzahl je Staffel. Staffel 0 sind die Specials und zaehlt
     nicht mit. Beides kostet keine zusaetzliche Anfrage. */
  const istTv = kind === "tv";
  const episodesPerSeason = istTv && Array.isArray(d.seasons)
    ? d.seasons
        .filter((s) => s && Number(s.season_number) >= 1)
        .map((s) => positiveZahl(s.episode_count))
        .filter(Boolean)
    : [];
  const ausStaffeln = episodesPerSeason.reduce((s, n) => s + n, 0);
  const episodeRuntime = istTv && Array.isArray(d.episode_run_time)
    ? d.episode_run_time.map(positiveZahl).find(Boolean) || null
    : null;

  return {
    year: jahrAus(d.release_date || d.first_air_date),
    director: regie,
    runtime: istTv ? null : positiveZahl(d.runtime),
    episodeRuntime,
    episodeCount: positiveZahl(ausStaffeln) || positiveZahl(d.number_of_episodes),
    episodesPerSeason,
    // Ueber die IMDb-Kennung wird die Note spaeter eindeutig geholt,
    // ohne dass noch einmal ueber Titel geraten werden muss.
    imdbId: d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || null,
    originalTitle: d.original_title || d.original_name || null,
    genres: namenAus(d.genres),
    // Filmreihe und Studio gibt es nur bei Filmen: `belongs_to_collection`
    // kennt TMDB bei Serien gar nicht, und die Produktionsfirma einer
    // Serie sagt ueber ein Franchise nichts aus.
    collection:
      kind === "movie" && d.belongs_to_collection && typeof d.belongs_to_collection.name === "string"
        ? d.belongs_to_collection.name.trim() || null
        : null,
    studio: kind === "movie" ? erstesStudio(d.production_companies) : null,
    debug: { source: "TMDB (details)", status: response.status, error: response.error },
  };
}

/**
 * Das fuehrende Produktionsstudio. TMDB listet die Firmen ungefaehr
 * nach Bedeutung; die erste ist die, die man mit dem Film verbindet
 * ("Marvel Studios", "Lucasfilm"). Das ist eine Naeherung und kein
 * Franchise-Feld — genau dafuer taugt sie aber: Reihen wie das MCU
 * haben keine eigene TMDB-Collection, wohl aber ein gemeinsames Studio.
 */
function erstesStudio(firmen) {
  const namen = namenAus(firmen);
  return namen.length ? namen[0] : null;
}

/* Ohne jede Angabe. Eine gemeinsame Form fuer alle Wege, damit die
   Antwort die vier Felder immer traegt. */
const KEINE_LAUFZEIT = {
  runtimeMinutes: null,
  episodeRuntime: null,
  episodeCount: null,
  episodesPerSeason: [],
};

/** Erster gesetzter Wert eines Feldes ueber mehrere Quellen hinweg. */
function ersterWert(quellen, feld) {
  for (const q of quellen) {
    if (q && q[feld] != null) return q[feld];
  }
  return null;
}

/**
 * Laufzeit aus dem, was die Quellen hergeben.
 *
 * Filme: die Laufzeit von TMDB, mehr braucht es nicht.
 *
 * Serien und Anime: Episodenlaenge mal Episodenanzahl. Bei Anime hat
 * Jikan Vorrang (dort stehen `episodes` und `duration` direkt am
 * Treffer), sonst TMDB. Fehlt danach eine der beiden Angaben und ist
 * TVMaze die Quelle, wird dort die Folgenliste geholt: sie ergibt die
 * Episodenanzahl je Staffel und eine Summe, die die Laufzeit jeder
 * einzelnen Folge beruecksichtigt — genauer als jede Schaetzung.
 *
 * Bekannt ist die Laufzeit nur, wenn sie sich wirklich errechnen
 * laesst. Alles andere bleibt null; der Eintrag zaehlt dann in der
 * Statistik nicht mit, statt mit einer erfundenen Zahl einzugehen.
 */
async function ermittleLaufzeit(category, tmdbInfo, eigenTreffer, debugListe) {
  /* Bei Dokus und Sitcoms/Comedy steht erst nach der Suche fest, was
     TMDB geliefert hat: eine Filmlaufzeit gibt es nur beim Filmbereich
     (bei `tv` ist `runtime` immer null, siehe tmdbAngaben). Steht sie
     da, ist es ein Einzelwerk und wird wie ein Film gerechnet; sonst
     laeuft die Serie unten ueber Episodenlaenge mal Episodenanzahl. */
  const einzelwerkMoeglich = category === "doku" || category === "comedy";
  if (category === "movie" || (einzelwerkMoeglich && tmdbInfo && tmdbInfo.runtime)) {
    return { ...KEINE_LAUFZEIT, runtimeMinutes: (tmdbInfo && tmdbInfo.runtime) || null };
  }

  const quellen = category === "anime" ? [eigenTreffer, tmdbInfo] : [tmdbInfo, eigenTreffer];
  let episodeRuntime = ersterWert(quellen, "episodeRuntime");
  let episodeCount = ersterWert(quellen, "episodeCount");
  let episodesPerSeason = (tmdbInfo && tmdbInfo.episodesPerSeason) || [];
  let summe = null;

  if ((!episodeRuntime || !episodeCount) && eigenTreffer && eigenTreffer.quelle === "tvmaze") {
    const folgen = await tvmazeFolgen(eigenTreffer.id);
    debugListe.push(folgen.debug);
    if (!episodeRuntime) episodeRuntime = folgen.episodeRuntime;
    if (!episodeCount) episodeCount = folgen.episodeCount;
    if (!episodesPerSeason.length) episodesPerSeason = folgen.episodesPerSeason;
    summe = folgen.minutes;
  }

  const geschaetzt = episodeRuntime && episodeCount ? episodeRuntime * episodeCount : null;
  return {
    // Die Folge-fuer-Folge-Summe zuerst: sie ist die genauere Zahl.
    runtimeMinutes: summe || geschaetzt || null,
    episodeRuntime,
    episodeCount,
    episodesPerSeason,
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

/* Welcher OMDb-Typ zu welcher Kategorie passt. Anime, Dokus und
   Sitcoms/Comedy laufen bewusst ohne Vorgabe: es gibt Anime-Filme und
   Anime-Serien, im Doku-Reiter stehen Einzeldokus neben Doku-Serien,
   im Comedy-Reiter Comedy-Filme neben Comedy-Serien. Kinderserien und
   Adult Animation sind dagegen immer Serien. */
const OMDB_TYP = { movie: "movie", series: "series", kids: "series", adultanim: "series" };

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

  // Der Cache-Schluessel traegt die Fassung der Angaben mit. Ohne das
  // wuerden nach einer Erweiterung noch tagelang alte Antworten aus dem
  // CDN ausgeliefert, in denen die neuen Felder schlicht fehlen.
  const cacheKey = ANGABEN_VERSION + "::" + category + "::" + title.toLowerCase();
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
  } else if (istSerienArt(category)) {
    // TVMaze zuerst, dann TMDB als zusätzlicher Fallback, iTunes zuletzt.
    // Kinderserien und Adult Animation laufen hier mit: es sind Serien,
    // nur mit eigener Kennzeichnung in der App.
    chain = [() => fromTvmaze(title)];
    if (hasTmdb) chain.push(() => fromTmdb(title, "tv"));
    chain.push(() => fromItunes(title, "tv"));
  } else if (category === "doku" || category === "comedy") {
    /* Im Doku-Reiter stehen Einzeldokus und Doku-Serien nebeneinander,
       im Comedy-Reiter Comedy-Filme und Comedy-Serien — die Suche muss
       deshalb BEIDE TMDB-Bereiche abdecken. Erst der Filmbereich, dann
       der Serienbereich; die Kette bricht ohnehin ab, sobald alles
       Gesuchte da ist, der zweite Schritt kostet also nur dort einen
       Aufruf, wo der erste nichts fand. iTunes bleibt wie bei Filmen
       das Netz darunter. */
    chain = [];
    if (hasTmdb) {
      chain.push(() => fromTmdb(title, "movie"));
      chain.push(() => fromTmdb(title, "tv"));
    }
    chain.push(() => fromItunes(title, "movie"));
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
  let eigenTreffer = null; // Angaben direkt von TVMaze oder Jikan
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
    // TMDB ist die ergiebigste Quelle fuer Jahr und Regie. Bei Serien
    // liefert TVMaze zwar schon beide Bilder, die Kette laeuft aber
    // weiter bis TMDB — sonst blieben Serien dauerhaft ohne Angaben.
    if (!tmdbTreffer && result.meta) {
      tmdbTreffer = result.meta;
      result.debug.usedMeta = true;
    }
    // TVMaze und Jikan bringen das Jahr (TVMaze sogar die IMDb-Kennung)
    // schon aus der Suche mit. Das traegt Serien und Anime auch dann,
    // wenn TMDB sie nicht kennt oder kein Schluessel gesetzt ist.
    if (!eigenTreffer && result.eigeneAngaben) {
      eigenTreffer = result.eigeneAngaben;
      result.debug.usedAngaben = true;
    }

    // Ohne Diagnose endet die Kette, sobald alles Gesuchte da ist; mit
    // Diagnose laufen alle Quellen durch, damit man sie vergleichen kann.
    const angabenOffen = willAngaben && hasTmdb && !tmdbTreffer;
    if (!debug && url && backdrop && !angabenOffen) break;
  }

  // Zusatzangaben: erst die Details des TMDB-Treffers, dann was die
  // Kategorie-Quelle beisteuert, zuletzt die IMDb-Note.
  let year = null;
  let director = null;
  let imdbRating = null;
  let genres = [];
  let collection = null;
  let studio = null;
  let laufzeit = KEINE_LAUFZEIT;
  const angabenDebug = [];

  if (willAngaben) {
    let tmdbInfo = null;
    if (tmdbTreffer) {
      tmdbInfo = await tmdbAngaben(tmdbTreffer.kind, tmdbTreffer.id);
      angabenDebug.push(tmdbInfo.debug);
    }

    // Jahr: die genaueste Angabe zuerst, danach der Reihe nach zurueck.
    year =
      (tmdbInfo && tmdbInfo.year) ||
      (tmdbTreffer && tmdbTreffer.year) ||
      (eigenTreffer && eigenTreffer.year) ||
      null;
    director = (tmdbInfo && tmdbInfo.director) || null;

    // Regie bzw. Ersteller bei der Kategorie-Quelle nachfragen, wenn
    // TMDB keinen nennt — bei Serien und Anime ist das die Regel. Der
    // Aufruf kostet eine Anfrage und laeuft deshalb nur dann.
    if (!director && eigenTreffer) {
      const nachgefragt =
        eigenTreffer.quelle === "tvmaze"
          ? await tvmazeErsteller(eigenTreffer.id)
          : await jikanRegie(eigenTreffer.id);
      angabenDebug.push(nachgefragt.debug);
      director = nachgefragt.director;
    }

    /* Genre: bei Anime hat Jikan Vorrang (siehe fromJikan), sonst TMDB.
       Die jeweils andere Quelle springt ein, wenn die erste nichts
       liefert — ein grobes Genre ist besser als gar keines. */
    const tmdbGenres = (tmdbInfo && tmdbInfo.genres) || [];
    const eigeneGenres = (eigenTreffer && eigenTreffer.genres) || [];
    genres =
      category === "anime"
        ? eigeneGenres.length
          ? eigeneGenres
          : tmdbGenres
        : tmdbGenres.length
          ? tmdbGenres
          : eigeneGenres;

    // Filmreihe und Studio liefert nur TMDB und nur bei Filmen.
    collection = (tmdbInfo && tmdbInfo.collection) || null;
    studio = (tmdbInfo && tmdbInfo.studio) || null;

    laufzeit = await ermittleLaufzeit(category, tmdbInfo, eigenTreffer, angabenDebug);

    // Die IMDb-Kennung ist der einzige eindeutige Weg zur Note. TMDB
    // und TVMaze liefern sie beide — die erste, die da ist, zaehlt.
    // Sonst bleibt die Titelsuche.
    if (hasOmdb) {
      const omdb = await fromOmdb(title, category, {
        imdbId: (tmdbInfo && tmdbInfo.imdbId) || (eigenTreffer && eigenTreffer.imdbId) || null,
        originalTitle:
          (tmdbInfo && tmdbInfo.originalTitle) || (eigenTreffer && eigenTreffer.originalTitle) || null,
        year,
      });
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
    // Zusatzdaten fuer Filter und Empfehlungen. Ohne Treffer bleibt die
    // Liste leer und die beiden Felder null.
    genres,
    collection,
    studio,
    /* Laufzeit fuer den Zeitaufwand der Watchlist. Bei Filmen steht
       alles in `runtimeMinutes`; bei Serien und Anime kommen
       Episodenlaenge, Episodenanzahl und die Anzahl je Staffel dazu.
       Nicht ermittelbar heisst null bzw. leere Liste. */
    runtimeMinutes: laufzeit.runtimeMinutes,
    episodeRuntime: laufzeit.episodeRuntime,
    episodeCount: laufzeit.episodeCount,
    episodesPerSeason: laufzeit.episodesPerSeason,
    // Sagt dem Frontend, ob eine fehlende Note am fehlenden Schluessel
    // liegt — dann ist es kein erfolgloser Versuch.
    imdbVerfuegbar: willAngaben && hasOmdb,
    // Fassung der Angaben. Fehlt sie in einer Antwort, stammt diese aus
    // einem alten Cache und zaehlt nicht als Versuch.
    angabenVersion: ANGABEN_VERSION,
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
