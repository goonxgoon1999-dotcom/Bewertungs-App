/**
 * POST /api/fortsetzungen
 * Body: { eintraege: [{ id, category, title, year, staffeln, quelle, quellId }] }
 * -> { treffer: { [id]: {...} }, offen: [id, ...] }
 *
 * Gibt es zu einer bereits bewerteten Serie inzwischen eine Staffel
 * mehr, als in der App erfasst ist? Mehr beantwortet dieser Endpunkt
 * nicht — er traegt nichts ein und aendert nichts an der Sammlung.
 *
 * Quellen wie ueberall in der App:
 *
 *   Serien, Kinderserien, Adult Animation -> TMDB /tv/{id}
 *      `number_of_seasons` gegen die in der App erfasste Staffelzahl.
 *
 *   Anime -> Jikan /anime/{id}/relations
 *      Dort gibt es keine Staffelzaehlung: Jede Staffel steht als
 *      eigener Eintrag, verbunden ueber die Beziehung "Sequel". Der
 *      Endpunkt meldet deshalb die Titel der Fortsetzungen; ob sie
 *      schon in der Sammlung stehen, entscheidet die App selbst — sie
 *      allein kennt die Sammlung, und der Vergleich ueber alle
 *      Schreibweisen laeuft dort ohnehin schon.
 *
 * Beides braucht die Kennung des Werks bei der Quelle, und die steht
 * an den Eintraegen der App nicht. Sie wird deshalb ueber den Titel
 * gesucht — und mit dem Ergebnis zurueckgegeben, damit die App sie
 * mitspeichern und beim naechsten Durchgang gleich mitschicken kann.
 * Der erste Lauf kostet so zwei Aufrufe je Serie, jeder weitere einen.
 *
 * Ein Aufruf arbeitet so viele Eintraege ab, wie in die Frist passen.
 * Was uebrig bleibt, steht in `offen` — die App fragt damit den Rest
 * nach. Das ist noetig, weil Jikan nur drei Anfragen je Sekunde
 * zulaesst: Vierzig Anime waeren in einem Aufruf nicht zu schaffen.
 */

import { getJson, tmdbKey, similarity, istSerienArt, jahrAus } from "./poster.js";

const TMDB_BASIS = "https://api.themoviedb.org/3";
const JIKAN_BASIS = "https://api.jikan.moe/v4";

/* Jikan begrenzt auf drei Anfragen pro Sekunde. */
const JIKAN_PAUSE_MS = 400;

/* Wie lange ein Aufruf hoechstens arbeitet. Serverless-Umgebungen
   brechen nach etwa zehn Sekunden ab, und ein Abbruch liefert gar
   nichts — lieber ein Teilergebnis und ein zweiter Aufruf. */
const FRIST_MS = 7000;

/* Wie viele TMDB-Abfragen gleichzeitig laufen. */
const PARALLEL = 6;

/* Wie viele Eintraege eine Anfrage hoechstens mitbringen darf. Die
   Grenze schuetzt vor einer Anfrage, die den Server minutenlang
   beschaeftigen wuerde; die Frist oben sorgt ohnehin dafuer, dass ein
   Aufruf frueher aufhoert. */
const MAX_EINTRAEGE = 300;

/* Wie aehnlich ein Suchtreffer sein muss, um als dasselbe Werk zu
   gelten. Dieselbe Schwelle wie bei der Postersuche. */
const MIN_AEHNLICHKEIT = 0.6;

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

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

const KATEGORIEN = new Set(["series", "kids", "adultanim", "anime"]);

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
      year: typeof e.year === "number" && Number.isFinite(e.year) ? e.year : null,
      // Wie viele Staffeln die App kennt. Fehlt die Angabe, gilt eine —
      // dann meldet schon die zweite Staffel etwas Neues.
      staffeln:
        typeof e.staffeln === "number" && Number.isFinite(e.staffeln) && e.staffeln > 0
          ? Math.round(e.staffeln)
          : 1,
      // Aus einem frueheren Durchgang mitgebracht: spart die Suche.
      quelle: e.quelle === "tmdb" || e.quelle === "jikan" ? e.quelle : null,
      quellId:
        (typeof e.quellId === "string" && e.quellId) || typeof e.quellId === "number"
          ? String(e.quellId)
          : null,
    });
  }
  return raus;
}

/* ---------------------------------------------------------------- *
 * TMDB — Serien, Kinderserien, Adult Animation
 * ---------------------------------------------------------------- */

/** Titel -> TMDB-Kennung, ueber alle Schreibweisen eines Treffers. */
async function tmdbKennung(title, year) {
  const response = await getJson(
    TMDB_BASIS + "/search/tv?api_key=" + encodeURIComponent(tmdbKey()) +
      "&language=de-DE&include_adult=false&query=" + encodeURIComponent(title) +
      (year ? "&first_air_date_year=" + year : "")
  );
  const hits = (response.data && response.data.results) || [];

  let beste = null;
  let bester = 0;
  for (const hit of hits) {
    if (!hit || hit.id == null) continue;
    for (const name of [hit.name, hit.original_name]) {
      if (typeof name !== "string" || !name.trim()) continue;
      const wert = similarity(title, name);
      if (wert > bester) {
        bester = wert;
        beste = hit.id;
      }
    }
  }
  return bester >= MIN_AEHNLICHKEIT ? String(beste) : null;
}

/**
 * Staffelzahl und Status einer Serie.
 *
 * `number_of_seasons` zaehlt die regulaeren Staffeln; die Specials
 * (Staffel 0) sind darin nicht enthalten — genau richtig, denn in der
 * App werden sie auch nicht bewertet.
 */
async function tmdbStand(id) {
  const response = await getJson(
    TMDB_BASIS + "/tv/" + encodeURIComponent(id) + "?api_key=" +
      encodeURIComponent(tmdbKey()) + "&language=de-DE"
  );
  const d = response.data;
  if (!d) return null;
  return {
    staffeln:
      typeof d.number_of_seasons === "number" && d.number_of_seasons > 0
        ? d.number_of_seasons
        : null,
    status: typeof d.status === "string" ? d.status : null,
    // Nur fuer die Anzeige: das Jahr der zuletzt gestarteten Staffel.
    zuletzt: jahrAus(d.last_air_date) || null,
  };
}

async function tmdbPruefen(eintrag) {
  let id = eintrag.quelle === "tmdb" ? eintrag.quellId : null;
  if (!id) id = await tmdbKennung(eintrag.title, eintrag.year);
  if (!id) return { id: eintrag.id, gefunden: false };

  const stand = await tmdbStand(id);
  if (!stand || stand.staffeln == null) {
    return { id: eintrag.id, gefunden: false, quelle: "tmdb", quellId: id };
  }

  return {
    id: eintrag.id,
    gefunden: true,
    quelle: "tmdb",
    quellId: id,
    staffeln: stand.staffeln,
    status: stand.status,
    zuletzt: stand.zuletzt,
    // Der eigentliche Hinweis: Die Quelle fuehrt mehr Staffeln als die
    // App kennt. Ein blosser Status wie "Returning Series" reicht
    // nicht — er stuende bei jeder laufenden Serie dauerhaft da.
    neu: stand.staffeln > eintrag.staffeln,
  };
}

/* ---------------------------------------------------------------- *
 * Jikan — Anime
 * ---------------------------------------------------------------- */

async function jikanKennung(title) {
  const response = await getJson(
    JIKAN_BASIS + "/anime?sfw=true&limit=5&q=" + encodeURIComponent(title)
  );
  const hits = (response.data && response.data.data) || [];

  let beste = null;
  let bester = 0;
  for (const hit of hits) {
    if (!hit || hit.mal_id == null) continue;
    const namen = [hit.title, hit.title_english, hit.title_japanese];
    if (Array.isArray(hit.titles)) for (const t of hit.titles) if (t && t.title) namen.push(t.title);
    if (Array.isArray(hit.title_synonyms)) namen.push(...hit.title_synonyms);

    for (const name of namen) {
      if (typeof name !== "string" || !name.trim()) continue;
      const wert = similarity(title, name);
      if (wert > bester) {
        bester = wert;
        beste = hit.mal_id;
      }
    }
  }
  return bester >= MIN_AEHNLICHKEIT ? String(beste) : null;
}

/**
 * Die Fortsetzungen eines Anime.
 *
 * Jikan kennt keine Staffelzaehlung — die zweite Staffel ist ein
 * eigener Eintrag, verbunden ueber die Beziehung "Sequel". Genau die
 * wird hier ausgelesen; alle anderen Beziehungen (Prequel, Side Story,
 * Adaptation) bleiben draussen.
 */
async function jikanFortsetzungen(id) {
  const response = await getJson(JIKAN_BASIS + "/anime/" + encodeURIComponent(id) + "/relations");
  const liste = (response.data && response.data.data) || [];

  const raus = [];
  for (const beziehung of liste) {
    if (!beziehung || typeof beziehung.relation !== "string") continue;
    if (beziehung.relation.trim().toLowerCase() !== "sequel") continue;
    for (const e of Array.isArray(beziehung.entry) ? beziehung.entry : []) {
      // Nur Anime — ein Manga-Sequel ist keine neue Staffel.
      if (!e || typeof e.name !== "string" || !e.name.trim()) continue;
      if (typeof e.type === "string" && e.type.toLowerCase() !== "anime") continue;
      raus.push({ malId: e.mal_id != null ? String(e.mal_id) : null, titel: e.name.trim() });
    }
  }
  return raus;
}

async function jikanPruefen(eintrag) {
  let id = eintrag.quelle === "jikan" ? eintrag.quellId : null;
  if (!id) {
    id = await jikanKennung(eintrag.title);
    if (!id) return { id: eintrag.id, gefunden: false };
    await warte(JIKAN_PAUSE_MS);
  }

  const fortsetzungen = await jikanFortsetzungen(id);
  return {
    id: eintrag.id,
    gefunden: true,
    quelle: "jikan",
    quellId: id,
    /* `neu` heisst hier nur "es gibt eine Fortsetzung". Ob sie schon in
       der Sammlung steht, entscheidet die App: Sie kennt ihre eigenen
       Eintraege und vergleicht ueber alle Schreibweisen. */
    neu: fortsetzungen.length > 0,
    fortsetzungen,
  };
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

    const eintraege = eintraegeLesen(anfrageLesen(req).eintraege);
    if (!eintraege.length) {
      return res.status(200).json({ treffer: {}, offen: [] });
    }

    const start = Date.now();
    const treffer = {};
    const erledigt = new Set();

    // TMDB und Jikan behindern sich nicht: die eine Strecke laeuft
    // parallel, die andere mit ihrer Zwangspause seriell.
    const ueberTmdb = eintraege.filter((e) => istSerienArt(e.category));
    const ueberJikan = eintraege.filter((e) => e.category === "anime");

    const merken = (ergebnis) => {
      erledigt.add(ergebnis.id);
      // Auch ein "nicht gefunden" wird gemeldet — sonst fragt die App
      // jede Woche erneut nach einem Titel, den die Quelle nicht kennt.
      treffer[ergebnis.id] = ergebnis;
    };

    await Promise.all([
      (async () => {
        if (!ueberTmdb.length || !tmdbKey()) return;
        await parallelAbarbeiten(ueberTmdb, PARALLEL, start, async (e) => {
          merken(await tmdbPruefen(e));
        });
      })(),
      (async () => {
        let erste = true;
        for (const e of ueberJikan) {
          if (Date.now() - start > FRIST_MS) return;
          if (!erste) await warte(JIKAN_PAUSE_MS);
          erste = false;
          merken(await jikanPruefen(e));
        }
      })(),
    ]);

    /* Was die Frist nicht mehr hergab. Die App fragt damit nach — bis
       `offen` leer ist. */
    const offen = eintraege.filter((e) => !erledigt.has(e.id)).map((e) => e.id);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ treffer, offen });
  } catch (err) {
    console.error("API-Fehler:", err);
    return res.status(500).json({ error: "Serverfehler: " + (err.message || "unbekannt") });
  }
}
