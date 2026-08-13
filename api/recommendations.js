/**
 * GET /api/recommendations?category=movie|series|anime&titles=A|B|C
 * -> { results: [{ title, year, poster }], seeds, hinweis }
 *
 * Vorschlaege auf Grundlage der eigenen Bestbewerteten. Es gibt hier
 * BEWUSST keine eigene Empfehlungslogik: gefragt werden ausschliesslich
 * die "aehnliche Titel"-Endpunkte der Quellen, die die App ohnehin
 * benutzt. Zusammengefasst wird nur, was von dort zurueckkommt.
 *
 *   Filme  -> TMDB  /movie/{id}/recommendations
 *   Serien -> TMDB  /tv/{id}/recommendations
 *   Anime  -> Jikan /anime/{mal_id}/recommendations
 *
 * TVMaze hat keinen Endpunkt fuer aehnliche Serien — weder
 * "recommendations" noch "similar". Serien laufen deshalb ueber TMDB;
 * ohne TMDB-Schluessel bleibt der Abschnitt leer, was die Antwort im
 * Feld `hinweis` auch sagt.
 *
 * Spiele haben keinen Abschnitt: SteamGridDB ist eine Bilddatenbank und
 * kennt keine Aehnlichkeiten.
 *
 * Die Titel der Sammlung tragen keine Kennung der Quelle. Jeder Seed
 * kostet deshalb zwei Aufrufe: erst suchen (Titel -> Kennung), dann die
 * Empfehlungen holen. Genau deswegen sind die Grenzen unten eng gesetzt.
 */

import {
  getJson, tmdbKey, similarity, normalizeTitle, TMDB_IMAGE_BASE, jahrAus,
} from "./poster.js";

/* So viele Bestbewertete werden hoechstens befragt. Jeder kostet zwei
   externe Aufrufe — die Zahl ist die eigentliche Bremse. */
const MAX_SEEDS = 6;

/* Jikan begrenzt auf drei Anfragen pro Sekunde. Anime bekommen deshalb
   weniger Seeds und zusaetzlich eine Pause zwischen den Aufrufen. */
const MAX_SEEDS_ANIME = 4;
const JIKAN_PAUSE_MS = 350;

/* Sind so viele verschiedene Vorschlaege beisammen, werden die
   restlichen Seeds gar nicht erst befragt. Im Normalfall liefern schon
   zwei bis drei Titel genug — das spart die Haelfte der Aufrufe. */
const ZIEL_KANDIDATEN = 24;

/* Obergrenze der Antwort. Das Frontend filtert davon noch weg, was
   bereits bewertet oder vorgemerkt ist, und zeigt eine kleine Auswahl. */
const MAX_ERGEBNISSE = 30;

/* Ab dieser Aehnlichkeit gilt ein Suchtreffer als der gesuchte Titel.
   Darunter wird der Seed uebersprungen: lieber ein Seed weniger als
   Empfehlungen zu einem fremden Werk. */
const MIN_SEED_AEHNLICHKEIT = 0.6;

/* Ergebnisse halten sich eine Weile im Speicher der laufenden Funktion.
   Zusammen mit dem CDN-Kopf unten sorgt das dafuer, dass ein erneutes
   Oeffnen des Reiters keine externen Aufrufe ausloest. */
const CACHE = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 Stunden

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/* Ein Vorschlag in derselben Form, die auch die Titelsuche liefert —
   so passt er ohne Umweg in die bestehende "+ Watchlist"-Aktion. */
function eintrag(title, year, poster) {
  const name = typeof title === "string" ? title.trim() : "";
  return { title: name || null, year: year || null, poster: poster || null };
}

/* ---------------------------------------------------------------- *
 * TMDB — Filme und Serien
 * ---------------------------------------------------------------- */

/** Titel -> TMDB-Kennung. Null, wenn kein Treffer nah genug dran ist. */
async function tmdbKennung(title, kind) {
  const response = await getJson(
    "https://api.themoviedb.org/3/search/" +
      kind +
      "?api_key=" +
      encodeURIComponent(tmdbKey()) +
      "&language=de-DE&query=" +
      encodeURIComponent(title)
  );
  const hits = (response.data && response.data.results) || [];

  let beste = null;
  let bester = 0;
  for (const hit of hits) {
    if (!hit || hit.id == null) continue;
    const titel = kind === "tv" ? [hit.name, hit.original_name] : [hit.title, hit.original_title];
    for (const t of titel) {
      if (!t) continue;
      const s = similarity(title, t);
      if (s > bester) {
        bester = s;
        beste = hit.id;
      }
    }
  }
  return bester >= MIN_SEED_AEHNLICHKEIT ? beste : null;
}

async function tmdbEmpfehlungen(id, kind) {
  const response = await getJson(
    "https://api.themoviedb.org/3/" +
      kind +
      "/" +
      encodeURIComponent(id) +
      "/recommendations?api_key=" +
      encodeURIComponent(tmdbKey()) +
      "&language=de-DE"
  );
  const hits = (response.data && response.data.results) || [];
  return hits
    .map((hit) =>
      eintrag(
        kind === "tv" ? hit.name || hit.original_name : hit.title || hit.original_title,
        jahrAus(kind === "tv" ? hit.first_air_date : hit.release_date),
        hit.poster_path ? TMDB_IMAGE_BASE + hit.poster_path : null
      )
    )
    .filter((e) => e.title);
}

/* ---------------------------------------------------------------- *
 * Jikan — Anime
 * ---------------------------------------------------------------- */

/** Titel -> MyAnimeList-Kennung. */
async function jikanKennung(title) {
  const response = await getJson(
    "https://api.jikan.moe/v4/anime?limit=10&sfw=true&q=" + encodeURIComponent(title)
  );
  const hits = (response.data && response.data.data) || [];

  let beste = null;
  let bester = 0;
  for (const hit of hits) {
    if (!hit || hit.mal_id == null) continue;
    // Jikan fuehrt denselben Anime unter mehreren Schreibweisen —
    // die beste zaehlt, wie ueberall in der App.
    const titel = [hit.title, hit.title_english, hit.title_japanese];
    if (Array.isArray(hit.titles)) for (const t of hit.titles) if (t && t.title) titel.push(t.title);
    for (const t of titel) {
      if (!t) continue;
      const s = similarity(title, t);
      if (s > bester) {
        bester = s;
        beste = hit.mal_id;
      }
    }
  }
  return bester >= MIN_SEED_AEHNLICHKEIT ? beste : null;
}

/**
 * Jikans Empfehlungen nennen nur Kennung, Titel und Bild — kein Jahr.
 * Das ist kein Mangel: Das Jahr traegt dasselbe automatische Nachladen
 * nach, das auch bei jedem anderen vorgemerkten Eintrag laeuft.
 */
async function jikanEmpfehlungen(malId) {
  const response = await getJson(
    "https://api.jikan.moe/v4/anime/" + encodeURIComponent(malId) + "/recommendations"
  );
  const hits = (response.data && response.data.data) || [];
  return hits
    .map((hit) => {
      const e = hit && hit.entry;
      if (!e || !e.title) return null;
      const img = e.images && e.images.jpg;
      return eintrag(e.title, null, (img && (img.large_image_url || img.image_url)) || null);
    })
    .filter(Boolean);
}

/* ---------------------------------------------------------------- *
 * Sammeln
 * ---------------------------------------------------------------- */

/**
 * Fragt die Seeds der Reihe nach ab und fasst zusammen, was zurueckkommt.
 *
 * Doppelte verschwinden ueber den normalisierten Titel; wie oft ein
 * Vorschlag genannt wurde, entscheidet spaeter die Reihenfolge. Das ist
 * keine eigene Bewertung, sondern nur die Frage: Wie viele meiner
 * Lieblingstitel fuehren auf dasselbe Werk?
 */
async function sammeln(seeds, holeKennung, holeEmpfehlungen, pauseMs) {
  const gesehen = new Map(); // normalisierter Titel -> { eintrag, treffer }
  const seedTitel = new Set(seeds.map(normalizeTitle));
  const befragt = [];

  for (const seed of seeds) {
    if (gesehen.size >= ZIEL_KANDIDATEN) break;

    if (pauseMs && befragt.length) await warte(pauseMs);
    const id = await holeKennung(seed);
    if (id == null) continue;

    if (pauseMs) await warte(pauseMs);
    const vorschlaege = await holeEmpfehlungen(id);
    befragt.push(seed);

    for (const v of vorschlaege) {
      const schluessel = normalizeTitle(v.title);
      // Ein Werk, das schon Seed war, ist keine Entdeckung.
      if (!schluessel || seedTitel.has(schluessel)) continue;

      const vorhanden = gesehen.get(schluessel);
      if (vorhanden) {
        vorhanden.treffer++;
        // Ein spaeterer Fund kann ein Bild oder Jahr mitbringen, das
        // dem ersten fehlte — Luecken werden gefuellt, nie ueberschrieben.
        if (!vorhanden.eintrag.poster && v.poster) vorhanden.eintrag.poster = v.poster;
        if (!vorhanden.eintrag.year && v.year) vorhanden.eintrag.year = v.year;
      } else {
        gesehen.set(schluessel, { eintrag: { ...v }, treffer: 1 });
      }
    }
  }

  const liste = [...gesehen.values()];
  // Mehrfach genannte zuerst; bei Gleichstand bleibt die Reihenfolge der
  // Quelle erhalten (sort ist in Node stabil).
  liste.sort((a, b) => b.treffer - a.treffer);
  return { results: liste.slice(0, MAX_ERGEBNISSE).map((e) => e.eintrag), befragt };
}

export default async function handler(req, res) {
  try {
    const category = req.query.category || "movie";
    const roh = typeof req.query.titles === "string" ? req.query.titles : "";

    if (category === "game") {
      return res.status(400).json({
        error: "Für Spiele gibt es keine Empfehlungen.",
        hinweis: "SteamGridDB ist eine Bilddatenbank und kennt keine ähnlichen Titel.",
      });
    }
    if (!["movie", "series", "anime"].includes(category)) {
      return res.status(400).json({ error: "Ungültige Kategorie." });
    }

    const istAnime = category === "anime";
    const grenze = istAnime ? MAX_SEEDS_ANIME : MAX_SEEDS;
    const seeds = roh
      .split("|")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, grenze);

    if (!seeds.length) return res.status(200).json({ results: [], seeds: [] });

    // Filme und Serien haengen beide an TMDB. Ohne Schluessel gibt es
    // keine Quelle fuer aehnliche Titel — das ist kein Fehler, sondern
    // eine Auskunft.
    if (!istAnime && !tmdbKey()) {
      return res.status(200).json({
        results: [],
        seeds: [],
        hinweis: "Ohne TMDB_API_KEY gibt es für diese Kategorie keine Empfehlungen.",
      });
    }

    const cacheKey = category + "::" + seeds.map(normalizeTitle).join("|");
    const zwischen = CACHE.get(cacheKey);
    if (zwischen && Date.now() - zwischen.zeit < CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
      return res.status(200).json({ ...zwischen.antwort, cached: true });
    }

    const { results, befragt } = istAnime
      ? await sammeln(seeds, jikanKennung, jikanEmpfehlungen, JIKAN_PAUSE_MS)
      : await sammeln(
          seeds,
          (t) => tmdbKennung(t, category === "series" ? "tv" : "movie"),
          (id) => tmdbEmpfehlungen(id, category === "series" ? "tv" : "movie"),
          0
        );

    const antwort = { results, seeds: befragt };
    CACHE.set(cacheKey, { zeit: Date.now(), antwort });

    // Sechs Stunden im CDN: dieselben Bestbewerteten ergeben dieselben
    // Vorschlaege, und ein Neuladen der Seite soll die freien APIs nicht
    // erneut belasten.
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json(antwort);
  } catch (err) {
    console.error("API-Fehler:", err);
    return res.status(500).json({ error: "Serverfehler: " + (err.message || "unbekannt") });
  }
}
