/**
 * POST /api/streaming
 * Body: { region: "DE"|"IT", eintraege: [{ id, category, title, quellId }] }
 * -> { region, treffer: { [id]: {...} }, offen: [id, ...] }
 *
 * Wo laeuft ein Titel gerade im Abo? Mehr beantwortet dieser Endpunkt
 * nicht — er traegt nichts ein und aendert nichts an der Sammlung.
 *
 * Quelle ist TMDB (`/watch/providers`) ueber denselben Schluessel, den
 * die Postersuche schon nutzt. Es kommt kein neuer Dienst dazu. TMDB
 * bezieht die Daten von JustWatch; deren Hinweis gehoert laut
 * Nutzungsbedingungen an die Anzeige und steht deshalb im Daten-Panel.
 *
 * Gemeldet werden ausschliesslich Abo-Anbieter (`flatrate`). Leihen
 * (`rent`) und Kaufen (`buy`) bleiben aussen vor: "Jetzt verfuegbar"
 * soll heissen "ohne weiteres Geld anschaltbar".
 *
 * Spiele sind ausgenommen — TMDB kennt sie nicht.
 *
 * Die TMDB-Kennung steht an den Eintraegen der App nicht. Sie wird
 * deshalb ueber den Titel gesucht, und zwar mit `tmdbKennungFuer` aus
 * api/poster.js: GENAU die Zuordnung, aus der auch Jahr, Regie und die
 * IMDb-Note kommen. Fuer Anime — wo sonst nur eine Jikan-Herkunft
 * vorliegt — gilt damit dieselbe Zuordnung wie bisher, es entsteht
 * keine zweite.
 *
 * Die gefundene Kennung geht mit der Antwort zurueck, damit die App sie
 * mitspeichern und beim naechsten Durchgang gleich mitschicken kann.
 * Der erste Lauf kostet so zwei Aufrufe je Eintrag, jeder weitere einen.
 *
 * Ein Aufruf arbeitet so viele Eintraege ab, wie in die Frist passen.
 * Was uebrig bleibt, steht in `offen` — die App fragt damit den Rest
 * nach. Aufbau und Ablauf entsprechen /api/fortsetzungen.
 */

import { getJson, tmdbKey, tmdbKennungFuer } from "./poster.js";

const TMDB_BASIS = "https://api.themoviedb.org/3";

/* Logos der Anbieter. w92 ist die kleinste Groesse, die TMDB anbietet —
   angezeigt werden sie als Chip-Symbole von rund 16 px. */
const TMDB_LOGO_BASIS = "https://image.tmdb.org/t/p/w92";

/**
 * Die unterstuetzten Regionen. Mehr sind es bewusst nicht: Die
 * Einstellung in der App kennt Deutschland und Italien, und ein
 * beliebiges Kuerzel aus der Anfrage waere eine Abfrage, deren Ergebnis
 * niemand sehen kann.
 */
export const REGIONEN = ["DE", "IT"];
export const REGION_STANDARD = "DE";

export function regionLesen(roh) {
  const wert = typeof roh === "string" ? roh.trim().toUpperCase() : "";
  return REGIONEN.includes(wert) ? wert : REGION_STANDARD;
}

/* Wie lange ein Aufruf hoechstens arbeitet. Serverless-Umgebungen
   brechen nach etwa zehn Sekunden ab, und ein Abbruch liefert gar
   nichts — lieber ein Teilergebnis und ein zweiter Aufruf. */
const FRIST_MS = 7000;

/* Wie viele Abfragen gleichzeitig laufen. */
const PARALLEL = 6;

/* Wie viele Eintraege eine Anfrage hoechstens mitbringen darf. */
const MAX_EINTRAEGE = 300;

/* Spiele fehlen hier bewusst: TMDB kennt sie nicht. */
const KATEGORIEN = new Set(["movie", "series", "anime", "kids", "adultanim", "doku", "comedy"]);

/**
 * Arbeitet eine Liste mit begrenzt vielen gleichzeitigen Aufgaben ab
 * und haelt an, sobald die Frist reisst. Zurueck kommt, was fertig
 * wurde — der Rest bleibt offen.
 */
async function parallelAbarbeiten(liste, grenze, start, arbeit) {
  let naechster = 0;
  const arbeiter = [];
  for (let i = 0; i < Math.min(grenze, liste.length); i++) {
    arbeiter.push(
      (async () => {
        for (;;) {
          const index = naechster++;
          if (index >= liste.length) return;
          if (Date.now() - start > FRIST_MS) return;
          await arbeit(liste[index]);
        }
      })()
    );
  }
  await Promise.all(arbeiter);
}

/* ---------------------------------------------------------------- *
 * Anfrage lesen
 * ---------------------------------------------------------------- */

function eintraegeLesen(roh) {
  if (!Array.isArray(roh)) return [];
  const raus = [];
  for (const e of roh) {
    if (raus.length >= MAX_EINTRAEGE) break;
    if (!e || typeof e.id !== "string" || !e.id) continue;
    if (typeof e.title !== "string" || !e.title.trim()) continue;
    if (!KATEGORIEN.has(e.category)) continue;

    raus.push({
      id: e.id,
      category: e.category,
      title: e.title.trim().slice(0, 120),
      // Aus einem frueheren Durchgang mitgebracht: spart die Suche.
      // Die Art (`movie` oder `tv`) gehoert zwingend dazu — dieselbe
      // Zahl steht bei TMDB fuer zwei verschiedene Werke.
      quellArt: e.quellArt === "movie" || e.quellArt === "tv" ? e.quellArt : null,
      quellId:
        (typeof e.quellId === "string" && e.quellId) || typeof e.quellId === "number"
          ? String(e.quellId)
          : null,
    });
  }
  return raus;
}

/* ---------------------------------------------------------------- *
 * TMDB
 * ---------------------------------------------------------------- */

/**
 * Die Abo-Anbieter eines Werks in einer Region.
 *
 * TMDB liefert je Region bis zu vier Listen (`flatrate`, `free`,
 * `rent`, `buy`). Gelesen wird nur `flatrate` — genau das, was ein
 * bestehendes Abo abdeckt.
 *
 * Zurueck kommt immer eine Liste (moeglicherweise leer) oder null,
 * wenn der Abruf selbst scheiterte. Der Unterschied zaehlt: "keine
 * Anbieter" ist ein Ergebnis, "nicht erreichbar" ist keines.
 */
async function anbieterHolen(art, id, region) {
  const response = await getJson(
    TMDB_BASIS + "/" + (art === "tv" ? "tv" : "movie") + "/" + encodeURIComponent(id) +
      "/watch/providers?api_key=" + encodeURIComponent(tmdbKey())
  );
  if (!response.data) return null;

  const fuerRegion = (response.data.results && response.data.results[region]) || null;
  const flatrate = (fuerRegion && fuerRegion.flatrate) || [];

  const raus = [];
  const gesehen = new Set();
  for (const a of Array.isArray(flatrate) ? flatrate : []) {
    if (!a || typeof a.provider_name !== "string" || !a.provider_name.trim()) continue;
    const schluessel = a.provider_id != null ? String(a.provider_id) : a.provider_name.trim();
    // Derselbe Dienst steht bei TMDB oft mehrfach (etwa "Netflix" und
    // "Netflix basic with Ads") — je Kennung genuegt ein Chip.
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    raus.push({
      id: schluessel,
      name: a.provider_name.trim(),
      logo: typeof a.logo_path === "string" && a.logo_path ? TMDB_LOGO_BASIS + a.logo_path : null,
      // Die Reihenfolge, die TMDB selbst vorschlaegt. Fehlt sie, zaehlt
      // der Name — irgendeine feste Ordnung braucht die Anzeige.
      rang: typeof a.display_priority === "number" ? a.display_priority : 999,
    });
  }
  raus.sort((x, y) => x.rang - y.rang || x.name.localeCompare(y.name, "de"));
  return raus.map(({ rang, ...rest }) => rest);
}

async function pruefen(eintrag, region) {
  let art = eintrag.quellArt;
  let id = art ? eintrag.quellId : null;

  if (!id) {
    const treffer = await tmdbKennungFuer(eintrag.title, eintrag.category);
    if (!treffer) return { id: eintrag.id, gefunden: false, anbieter: [] };
    art = treffer.kind;
    id = String(treffer.id);
  }

  const anbieter = await anbieterHolen(art, id, region);
  if (anbieter === null) {
    /* Der Abruf ist gescheitert. Die Kennung geht trotzdem zurueck —
       sie war richtig ermittelt und spart beim naechsten Versuch die
       Suche. Als Ergebnis gilt das hier NICHT: `gefunden` bleibt
       falsch, damit die App es nicht eine Woche lang festhaelt. */
    return { id: eintrag.id, gefunden: false, quellArt: art, quellId: id, anbieter: [] };
  }

  return { id: eintrag.id, gefunden: true, quellArt: art, quellId: id, anbieter };
}

/* ---------------------------------------------------------------- *
 * Handler
 * ---------------------------------------------------------------- */

function anfrageLesen(req) {
  const roh = req.body;
  if (typeof roh === "string") {
    // Nicht jede Umgebung liest den Rumpf selbst als JSON ein.
    try { return JSON.parse(roh); } catch (e) { return {}; }
  }
  return roh && typeof roh === "object" ? roh : {};
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Methode nicht erlaubt." });
    }

    const anfrage = anfrageLesen(req);
    const region = regionLesen(anfrage.region);
    const eintraege = eintraegeLesen(anfrage.eintraege);

    res.setHeader("Cache-Control", "no-store");

    /* Ohne Schluessel gibt es keine Verfuegbarkeit — und zwar
       ausdruecklich als leeres Ergebnis, nicht als Fehler. Die App
       zeigt die Stelle dann einfach nicht an, genau wie bei einer
       fehlenden IMDb-Note. */
    if (!eintraege.length || !tmdbKey()) {
      return res.status(200).json({
        region,
        treffer: {},
        offen: [],
        tmdb: tmdbKey() ? "aktiv" : "übersprungen (TMDB_API_KEY fehlt)",
      });
    }

    const start = Date.now();
    const treffer = {};
    const erledigt = new Set();

    await parallelAbarbeiten(eintraege, PARALLEL, start, async (e) => {
      const ergebnis = await pruefen(e, region);
      erledigt.add(ergebnis.id);
      // Auch ein "nicht gefunden" wird gemeldet — sonst fragt die App
      // jede Woche erneut nach einem Titel, den TMDB nicht kennt.
      treffer[ergebnis.id] = ergebnis;
    });

    /* Was die Frist nicht mehr hergab. Die App fragt damit nach — bis
       `offen` leer ist. */
    const offen = eintraege.filter((e) => !erledigt.has(e.id)).map((e) => e.id);

    return res.status(200).json({ region, treffer, offen, tmdb: "aktiv" });
  } catch (err) {
    console.error("API-Fehler:", err);
    return res.status(500).json({ error: "Serverfehler: " + (err.message || "unbekannt") });
  }
}
