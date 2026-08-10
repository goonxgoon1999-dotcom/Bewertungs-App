/**
 * GET /api/poster?title=...&category=movie|series|anime
 * -> { url: "https://..." } oder { url: null }
 *
 * Die Suche läuft bewusst SERVERSEITIG:
 * - keine CORS-Probleme (der Browser spricht nur mit deiner eigenen Domain)
 * - kein API-Key nötig; alle Quellen sind frei nutzbar
 */

const CACHE = new Map(); // einfacher Cache pro laufender Funktion

async function getJson(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Bewertungs-App/1.0" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fromJikan(title) {
  const data = await getJson(
    "https://api.jikan.moe/v4/anime?limit=1&sfw=true&q=" + encodeURIComponent(title)
  );
  const hit = data && data.data && data.data[0];
  const img = hit && hit.images && hit.images.jpg;
  return (img && (img.large_image_url || img.image_url)) || null;
}

async function fromTvmaze(title) {
  const data = await getJson(
    "https://api.tvmaze.com/singlesearch/shows?q=" + encodeURIComponent(title)
  );
  const img = data && data.image;
  return (img && (img.original || img.medium)) || null;
}

async function fromItunes(title, kind) {
  const data = await getJson(
    "https://itunes.apple.com/search?limit=1&media=" +
      (kind === "movie" ? "movie" : "tvShow") +
      "&term=" +
      encodeURIComponent(title)
  );
  const hit = data && data.results && data.results[0];
  const art = hit && hit.artworkUrl100;
  return art ? art.replace("100x100bb", "600x600bb") : null;
}

export default async function handler(req, res) {
  const title = (req.query.title || "").trim();
  const category = req.query.category || "movie";

  if (!title) return res.status(400).json({ error: "title fehlt." });

  const cacheKey = category + "::" + title.toLowerCase();
  if (CACHE.has(cacheKey)) {
    return res.status(200).json({ url: CACHE.get(cacheKey), cached: true });
  }

  let chain;
  if (category === "anime") {
    chain = [() => fromJikan(title), () => fromItunes(title, "tv")];
  } else if (category === "series") {
    chain = [() => fromTvmaze(title), () => fromItunes(title, "tv")];
  } else {
    chain = [() => fromItunes(title, "movie"), () => fromTvmaze(title)];
  }

  let url = null;
  for (const step of chain) {
    url = await step();
    if (url) break;
  }

  CACHE.set(cacheKey, url);
  // Ergebnis einen Tag im CDN cachen — spart Aufrufe bei den freien APIs.
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json({ url });
}
