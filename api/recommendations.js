/**
 * GET  /api/recommendations?category=movie|series|anime|kids|adultanim|doku|comedy&profil=<JSON>
 * POST /api/recommendations   Body: { category, profil }
 * -> { results: [{ title, year, poster, begruendung, punkte }], gefragt, hinweis }
 *
 * Beide Wege sind gleichwertig; die App nimmt GET, weil der Abschnitt
 * damit schon vor dieser Erweiterung zuverlaessig lief.
 *
 * Vorschlaege auf Grundlage eines Geschmacksprofils statt einzelner
 * "aehnliche Titel"-Abfragen.
 *
 * Das Profil baut die App aus ALLEN bewerteten Eintraegen einer
 * Kategorie, gewichtet nach Endnote: welche Genres, welche
 * Regie/Studios und welche Jahrzehnte ueberdurchschnittlich gut
 * abschneiden. Dazu kommen die Titel der Bestbewerteten — aus ihnen
 * holt dieser Endpunkt die Schlagworte (TMDB-Keywords bzw. Jikans
 * Themes/Demographics), denn in der eigenen Datenbank stehen sie
 * nicht.
 *
 * Damit laeuft der Durchgang in drei Schritten:
 *
 *   1. Kandidaten sammeln — ueber die Entdecken-Endpunkte der Quellen:
 *        Filme  -> TMDB  /discover/movie  (Genre, Jahrzehnt, Regie, Studio)
 *        Serien -> TMDB  /discover/tv     (Genre, Jahrzehnt)
 *        Anime  -> Jikan /anime           (Genre, Jahrzehnt, nach Note sortiert)
 *   2. Anreichern und, bei Adult Animation und Kinderserien, hart
 *      filtern — dazu unten mehr.
 *   3. Nach Aehnlichkeit zum Gesamtprofil sortieren (Cosinus ueber
 *      Genres und Schlagworte).
 *
 * Kinderserien und Adult Animation laufen beim Sammeln ueber denselben
 * Weg wie Serien: fuer TMDBs Entdecken-Endpunkt sind es Serien, das
 * Geschmacksprofil kommt aber jeweils aus der eigenen Kategorie.
 *
 * Genau dort lag aber ein Problem: Eine Kinderserie und eine Serie fuer
 * Erwachsene unterscheiden sich in Genre und Jahrzehnt kaum — beide
 * sind "Animation, Comedy". Deshalb muessen Kandidaten dieser beiden
 * Kategorien zusaetzlich eine Alterspruefung bestehen (siehe
 * `kategoriePassung`). Filme, Serien und Anime beruehrt das nicht.
 *
 * TMDBs Entdecken-Endpunkt fuer Serien kennt kein `with_crew` — dort
 * gibt es deshalb keine Abfrage nach Regie oder Schoepfern. Filmreihe
 * und Studio sind ohnehin nur bei Filmen hinterlegt.
 *
 * Dokus und Sitcoms/Comedy sammeln ueber TMDBs /discover/movie — dort
 * steht der Bestand an Dokumentarfilmen und Komoedien. Das
 * Geschmacksprofil kommt wie bei jeder Kategorie aus den eigenen
 * Bewertungen.
 *
 * Spiele haben weiterhin keinen Abschnitt: SteamGridDB ist eine
 * Bilddatenbank und kennt weder Genres noch Aehnlichkeiten.
 */

import {
  getJson, tmdbKey, similarity, normalizeTitle, TMDB_IMAGE_BASE, jahrAus, istSerienArt,
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

/* Wie viele Treffer je Abfrage uebernommen werden — die volle Seite,
   die die Quelle ohnehin schickt (TMDB 20, Jikan 25).

   Frueher wurde hier auf 12 gekuerzt. Das kostete keinen Aufruf
   weniger, verkleinerte aber den Pool auf die Haelfte, und genau daran
   scheiterten die Anime: Die Abfragen holen nach Note sortiert die
   Spitze eines Genres, und die Spitzenlisten mehrerer Genres
   ueberschneiden sich fast vollstaendig. Wer 30 Anime bewertet hat,
   kennt davon praktisch alles — nach dem Aussortieren blieb nichts. */
const PRO_ABFRAGE_TMDB = 20;
const PRO_ABFRAGE_JIKAN = 25;

/* Anime holen zusaetzlich die zweite Seite je Genre. Der Vorrat an
   hoch bewerteten Anime ist endlich, und die erste Seite besteht bei
   einer gewachsenen Sammlung fast nur aus alten Bekannten. Filme und
   Serien brauchen das nicht: TMDBs Bestand ist um Groessenordnungen
   groesser, dort traegt schon die erste Seite. */
const JIKAN_SEITEN = 2;

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
const NOMEN = {
  movie: "Filme",
  series: "Serien",
  anime: "Anime",
  kids: "Kinderserien",
  adultanim: "Adult Animation",
  doku: "Dokus",
  comedy: "Sitcoms/Comedy",
};

/* ---------------------------------------------------------------- *
 * Zeitbudget
 *
 * Ein Durchgang darf viele Aufrufe machen — er laeuft ja nur einmal im
 * Monat je Kategorie —, aber nicht beliebig lange: Serverless-Umgebungen
 * brechen nach etwa zehn Sekunden ab, und ein Abbruch liefert gar
 * nichts. Deshalb hoert das Anreichern auf, sobald die Frist reisst;
 * die Sortierung laeuft dann mit dem, was schon da ist.
 * ---------------------------------------------------------------- */
const FRIST_MS = 7000;

/* Eigene, engere Frist fuer die Schlagworte des Profils. Bei Anime
   laufen sie einzeln mit Zwangspause und muessen sich die Zeit mit dem
   Sammeln teilen — reisst die Frist, geht es mit den Schlagworten
   weiter, die bis dahin da sind. */
const PROFIL_FRIST_MS = 3500;

/* Wie viele Detailabfragen hoechstens parallel laufen. TMDB vertraegt
   deutlich mehr, aber ein Schwall von hundert gleichzeitigen Anfragen
   bringt vor allem die eigene Laufzeitumgebung ins Schwitzen. */
const PARALLEL = 6;

/**
 * Arbeitet eine Liste mit begrenzt vielen gleichzeitigen Aufgaben ab.
 * Die Reihenfolge der Ergebnisse entspricht der Eingabe.
 */
async function parallelAbarbeiten(liste, grenze, arbeit) {
  const raus = new Array(liste.length);
  let naechster = 0;
  const arbeiter = [];
  for (let i = 0; i < Math.min(grenze, liste.length); i++) {
    arbeiter.push(
      (async () => {
        for (;;) {
          const index = naechster++;
          if (index >= liste.length) return;
          raus[index] = await arbeit(liste[index], index);
        }
      })()
    );
  }
  await Promise.all(arbeiter);
  return raus;
}

/* ---------------------------------------------------------------- *
 * Profil einlesen
 *
 * Es kommt aus dem Browser und wird deshalb wie jede andere Eingabe
 * geprueft: nur Zeichenketten, nur Gewichte zwischen 0 und 1, und pro
 * Teil eine feste Obergrenze. Jeder Profileintrag kostet spaeter
 * externe Aufrufe — ohne Grenze waere das ein offenes Scheunentor.
 * ---------------------------------------------------------------- */

/* Genres gehen in zwei verschiedene Dinge ein, und beide haben ihre
   eigene Grenze: In den Profilvektor duerfen alle acht, weil dort jedes
   weitere Genre nur Rechenzeit kostet. Abgefragt werden bei der Quelle
   dagegen nur die staerksten drei — jede Abfrage ist ein Netzaufruf. */
const MAX_GENRES = 8;
const MAX_ABFRAGE_GENRES = 3;
const MAX_REGIE = 2;
const MAX_STUDIOS = 1;
const MAX_JAHRZEHNTE = 2;

/* So viele der eigenen Bestbewerteten liefern die Schlagworte fuers
   Profil. Bei TMDB kostet jeder Titel zwei Aufrufe (suchen, dann
   Schlagworte holen), die parallel laufen duerfen. Bei Jikan ist es
   nur einer, dafuer mit Zwangspause dazwischen — acht Titel sind dort
   schon ueber drei Sekunden, deshalb die kleinere Grenze. */
const MAX_TITEL = 12;
const MAX_TITEL_ANIME = 8;

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

function profilLesen(roh, category) {
  const p = roh && typeof roh === "object" ? roh : {};
  return {
    genres: profilTeil(p.genres, MAX_GENRES),
    regie: profilTeil(p.regie, MAX_REGIE),
    studios: profilTeil(p.studios, MAX_STUDIOS),
    // Jahrzehnte stehen als Zeichenkette im Namen ("1990").
    jahrzehnte: profilTeil(p.jahrzehnte, MAX_JAHRZEHNTE).filter((j) =>
      /^\d{4}$/.test(j.name)
    ),
    // Titel der Bestbewerteten — allein als Quelle fuer die Schlagworte.
    titel: profilTeil(p.titel, category === "anime" ? MAX_TITEL_ANIME : MAX_TITEL),
  };
}

function profilLeer(profil) {
  /* Die Titel zaehlen hier bewusst nicht mit: Ohne Genre, Regie, Studio
     oder Jahrzehnt gibt es nichts, womit sich die Entdecken-Endpunkte
     abfragen liessen — Schlagworte allein liefern keinen Kandidaten. */
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
 * Aehnlichkeit: Profil gegen Kandidat
 *
 * Beide Seiten werden zu einem Vektor: Genres und Schlagworte, jeweils
 * mit einem Gewicht. Verglichen wird ueber den Cosinus — er misst die
 * Richtung, nicht die Laenge, sodass ein Titel mit vielen Schlagworten
 * nicht schon durch seine Breite gewinnt.
 *
 * Gerechnet wird in ZWEI getrennten Raeumen, Genres und Schlagworte,
 * die erst danach zusammengezaehlt werden. Ein gemeinsamer Vektor haette
 * einen unangenehmen Nebeneffekt: Kandidaten, zu denen keine Schlagworte
 * geholt wurden (das Zeitbudget reicht nicht fuer alle), haetten einen
 * kuerzeren Vektor und damit rein rechnerisch den hoeheren Cosinus —
 * ausgerechnet die schlechter bekannten stuenden oben. Getrennt gerechnet
 * kann ein Kandidat ohne Schlagworte den Schlagwort-Anteil schlicht nicht
 * holen und landet dort, wo er hingehoert: hinter den bestaetigten.
 * ---------------------------------------------------------------- */

/* Wie stark die beiden Anteile in die Endnote eingehen. Genres wiegen
   schwerer: Sie sind gepflegt und vollstaendig, waehrend Schlagworte
   bei TMDB von Freiwilligen kommen und mal treffend, mal beliebig
   sind. */
const GENRE_ANTEIL = 1;
const SCHLAGWORT_ANTEIL = 0.7;

/** [{ name, gewicht }] -> Map(normalisierter Name -> Gewicht). */
function vektorAus(eintraege) {
  const v = new Map();
  for (const e of eintraege) {
    const key = schluessel(e.name);
    if (!key) continue;
    // Kommt derselbe Name mehrfach, zaehlt der staerkste Eintrag.
    if (!v.has(key) || v.get(key) < e.gewicht) v.set(key, e.gewicht);
  }
  return v;
}

/** Cosinus zweier Vektoren; 0, wenn einer leer ist. */
function cosinus(a, b) {
  if (!a.size || !b.size) return 0;
  let punktprodukt = 0;
  let normA = 0;
  let normB = 0;
  for (const [, wert] of a) normA += wert * wert;
  for (const [key, wert] of b) {
    normB += wert * wert;
    const gegen = a.get(key);
    if (gegen != null) punktprodukt += gegen * wert;
  }
  if (!punktprodukt) return 0;
  return punktprodukt / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ---------------------------------------------------------------- *
 * Schlagworte des Profils
 *
 * Die eigene Datenbank speichert zu jedem Eintrag Genres, Regie, Studio
 * und Jahr — aber keine Kennung bei TMDB oder MyAnimeList. Schlagworte
 * lassen sich deshalb nur ueber den Titel holen: suchen, den besten
 * Treffer nehmen, dessen Schlagworte lesen.
 *
 * Das kostet zwei Aufrufe je Titel und begrenzt sich damit von selbst
 * auf die Bestbewerteten (`MAX_TITEL`). Fuer den Rest des Profils —
 * Genres, Jahrzehnte, Regie — gilt das nicht: die stehen in der
 * Datenbank und kommen aus ALLEN bewerteten Eintraegen.
 * ---------------------------------------------------------------- */

/**
 * Wie aehnlich ein Suchtreffer dem gesuchten Titel sein muss. Dieselbe
 * Schwelle wie bei der Postersuche: darunter ist es lieber gar kein
 * Treffer als der falsche Film.
 */
const MIN_TITEL_AEHNLICHKEIT = 0.6;

/** Bester Treffer einer Trefferliste, gemessen an allen Schreibweisen. */
function besterTreffer(gesucht, hits, namenAus) {
  let beste = null;
  let bester = 0;
  for (const hit of hits) {
    if (!hit || hit.id == null) continue;
    for (const name of namenAus(hit)) {
      if (typeof name !== "string" || !name.trim()) continue;
      const s = similarity(gesucht, name);
      if (s > bester) {
        bester = s;
        beste = hit;
      }
    }
  }
  return bester >= MIN_TITEL_AEHNLICHKEIT ? beste : null;
}

/** Namen aus einer TMDB-Schlagwortantwort — Filme und Serien getrennt. */
function schlagworteAus(block) {
  const liste = Array.isArray(block && block.keywords)
    ? block.keywords
    : Array.isArray(block && block.results)
    ? block.results
    : [];
  return liste
    .map((k) => (k && typeof k.name === "string" ? k.name.trim() : ""))
    .filter(Boolean);
}

async function tmdbSchlagworteZuTitel(kind, name) {
  const suche = await getJson(
    TMDB_BASIS + "/search/" + kind + "?api_key=" + encodeURIComponent(tmdbKey()) +
      "&language=de-DE&include_adult=false&query=" + encodeURIComponent(name)
  );
  const treffer = besterTreffer(name, (suche.data && suche.data.results) || [], (h) =>
    kind === "tv" ? [h.name, h.original_name] : [h.title, h.original_title]
  );
  if (!treffer) return [];

  const antwort = await getJson(
    TMDB_BASIS + "/" + kind + "/" + encodeURIComponent(treffer.id) + "/keywords?api_key=" +
      encodeURIComponent(tmdbKey())
  );
  return schlagworteAus(antwort.data);
}

/**
 * Bei Jikan sind die Schlagworte `themes` und `demographics` —
 * "Isekai", "Parody", "Shounen". Die Genres bleiben draussen: die
 * stehen schon in der Datenbank und damit ohnehin im Profil.
 *
 * Ein Aufruf reicht: Jikans Suche liefert alles gleich mit.
 */
async function jikanSchlagworteZuTitel(name) {
  const suche = await getJson(
    JIKAN_BASIS + "/anime?sfw=true&limit=5&q=" + encodeURIComponent(name)
  );
  const treffer = besterTreffer(name, (suche.data && suche.data.data) || [], (h) => {
    const namen = [h.title, h.title_english, h.title_japanese];
    if (Array.isArray(h.titles)) for (const t of h.titles) if (t && t.title) namen.push(t.title);
    if (Array.isArray(h.title_synonyms)) namen.push(...h.title_synonyms);
    return namen;
  });
  if (!treffer) return [];

  const raus = [];
  for (const feld of ["themes", "demographics"]) {
    if (!Array.isArray(treffer[feld])) continue;
    for (const e of treffer[feld]) {
      if (e && typeof e.name === "string" && e.name.trim()) raus.push(e.name.trim());
    }
  }
  return raus;
}

/**
 * Der Schlagwort-Teil des Profils.
 *
 * Jeder Titel bringt sein eigenes Gewicht mit (aus der Endnote). Ein
 * Schlagwort sammelt die Gewichte aller Titel, in denen es vorkommt —
 * was bei mehreren Lieblingen wiederkehrt, wiegt also mehr als ein
 * einmaliger Ausreisser. Am Ende wird auf den staerksten Wert normiert,
 * damit die Zahlen unabhaengig von der Groesse der Sammlung bleiben.
 */
async function profilSchlagworte(profil, category, start) {
  if (!profil.titel.length) return [];

  const summen = new Map(); // normalisierter Name -> { name, summe }
  const zaehlen = (namen, gewicht) => {
    for (const name of new Set(namen.map((n) => schluessel(n)).filter(Boolean))) {
      const e = summen.get(name) || { name, summe: 0 };
      e.summe += gewicht;
      summen.set(name, e);
    }
  };

  if (category === "anime") {
    // Jikan laesst nur drei Anfragen je Sekunde zu — hier also
    // nacheinander mit Pause, nicht parallel.
    let erste = true;
    for (const t of profil.titel) {
      if (Date.now() - start > PROFIL_FRIST_MS) break;
      if (!erste) await warte(JIKAN_PAUSE_MS);
      erste = false;
      zaehlen(await jikanSchlagworteZuTitel(t.name), t.gewicht);
    }
  } else {
    const kind = istSerienArt(category) ? "tv" : "movie";
    const ergebnisse = await parallelAbarbeiten(profil.titel, PARALLEL, (t) =>
      Date.now() - start > PROFIL_FRIST_MS ? [] : tmdbSchlagworteZuTitel(kind, t.name)
    );
    ergebnisse.forEach((namen, i) => zaehlen(namen || [], profil.titel[i].gewicht));
  }

  const alle = [...summen.values()];
  const staerkstes = alle.reduce((max, e) => Math.max(max, e.summe), 0);
  if (!staerkstes) return [];
  return alle.map((e) => ({ name: e.name, gewicht: e.summe / staerkstes }));
}

/* ---------------------------------------------------------------- *
 * TMDB — Filme und Serien
 * ---------------------------------------------------------------- */

async function tmdbDiscover(kind, params) {
  const response = await getJson(
    TMDB_BASIS + "/discover/" + kind + "?api_key=" + encodeURIComponent(tmdbKey()) +
      "&language=de-DE&include_adult=false&page=1&" + params
  );
  return ((response.data && response.data.results) || []).slice(0, PRO_ABFRAGE_TMDB);
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

/**
 * Alle Schreibweisen eines Treffers, ohne Leeres und ohne Doppelte.
 *
 * Der erste Eintrag ist der Anzeigetitel; die uebrigen dienen allein
 * dem Abgleich mit der eigenen Sammlung. Das ist noetig, weil beide
 * Seiten denselben Film unter verschiedenen Namen fuehren koennen: In
 * der Sammlung steht "Captain America: The Winter Soldier", TMDB
 * antwortet auf Deutsch mit "The Return of the First Avenger". Ein
 * Vergleich ueber nur einen Titel findet das nie.
 */
function titelVarianten(...namen) {
  const raus = [];
  for (const name of namen) {
    if (typeof name !== "string") continue;
    const sauber = name.trim();
    if (sauber && !raus.includes(sauber)) raus.push(sauber);
  }
  return raus;
}

/** Ein TMDB-Treffer in der Form, in der auch die Titelsuche liefert. */
function tmdbKandidat(hit, kind, genreNamenNachId) {
  const isTv = kind === "tv";
  const titel = isTv
    ? titelVarianten(hit.name, hit.original_name)
    : titelVarianten(hit.title, hit.original_title);
  if (!titel.length) return null;
  const genreIds = (Array.isArray(hit.genre_ids) ? hit.genre_ids : []).filter((id) => id != null);
  return {
    title: titel[0],
    titel,
    // Die Kennung bleibt erhalten: Ueber sie laufen spaeter Schlagworte
    // und Altersfreigabe.
    quellId: hit.id != null ? hit.id : null,
    year: jahrAus(isTv ? hit.first_air_date : hit.release_date),
    poster: hit.poster_path ? TMDB_IMAGE_BASE + hit.poster_path : null,
    genreIds,
    genreNamen: genreIds.map((id) => genreNamenNachId.get(id)).filter(Boolean),
    schlagworte: [],
    // Altersfreigaben je Land, gefuellt erst beim Anreichern.
    freigaben: null,
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
  for (const g of genres.slice(0, MAX_ABFRAGE_GENRES)) {
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

async function jikanSuche(params, seite) {
  const response = await getJson(
    JIKAN_BASIS + "/anime?sfw=true&order_by=score&sort=desc&min_score=" + ANIME_MINDESTNOTE +
      "&limit=" + PRO_ABFRAGE_JIKAN + "&page=" + seite + "&" + params
  );
  return (response.data && response.data.data) || [];
}

/** Namen aus einer Jikan-Liste ({ name }-Objekte). */
function jikanNamen(liste) {
  return (Array.isArray(liste) ? liste : [])
    .map((e) => (e && typeof e.name === "string" ? e.name.trim() : ""))
    .filter(Boolean);
}

function jikanKandidat(hit) {
  if (!hit || typeof hit.title !== "string" || !hit.title.trim()) return null;
  const img = hit.images && hit.images.jpg;

  /* Jikan fuehrt denselben Anime unter mehreren Schreibweisen. Wer
     "Attack on Titan" in der Sammlung stehen hat, soll "Shingeki no
     Kyojin" nicht noch einmal vorgeschlagen bekommen. */
  const weitere = [];
  if (Array.isArray(hit.titles)) for (const t of hit.titles) if (t && t.title) weitere.push(t.title);
  if (Array.isArray(hit.title_synonyms)) weitere.push(...hit.title_synonyms);

  return {
    title: hit.title.trim(),
    titel: titelVarianten(hit.title, hit.title_english, hit.title_japanese, ...weitere),
    quellId: hit.mal_id != null ? hit.mal_id : null,
    year:
      typeof hit.year === "number" ? hit.year : jahrAus(hit.aired && hit.aired.from),
    poster: (img && (img.large_image_url || img.image_url)) || null,
    genreIds: [],
    genreNamen: jikanNamen(hit.genres),
    /* Themes und Demographics liefert Jikan gleich mit — der
       Schlagwort-Teil des Vektors kostet bei Anime also keinen einzigen
       zusaetzlichen Aufruf. */
    schlagworte: [...jikanNamen(hit.themes), ...jikanNamen(hit.demographics)],
    freigaben: null,
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
  for (const g of genres.slice(0, MAX_ABFRAGE_GENRES)) {
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
  let erste = true;
  for (const abfrage of abfragen) {
    for (let seite = 1; seite <= JIKAN_SEITEN; seite++) {
      if (!erste) await warte(JIKAN_PAUSE_MS);
      erste = false;
      const hits = await jikanSuche(abfrage, seite);
      // Keine Treffer heisst: Diese Genrekombination ist erschoepft —
      // die naechste Seite waere erst recht leer.
      if (!hits.length) break;
      if (seite === 1) gefragt.push("Genre/Jahrzehnt");
      for (const hit of hits) aufnehmen(gesammelt, jikanKandidat(hit), {});
    }
  }
  return { kandidaten: [...gesammelt.values()], gefragt };
}

/* ---------------------------------------------------------------- *
 * Sammeln
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
  if (vorhanden.quellId == null && kandidat.quellId != null) vorhanden.quellId = kandidat.quellId;
  if (!vorhanden.genreNamen.length && kandidat.genreNamen.length) {
    vorhanden.genreNamen = kandidat.genreNamen;
    vorhanden.genreIds = kandidat.genreIds;
  }
  if (!vorhanden.schlagworte.length && kandidat.schlagworte.length) {
    vorhanden.schlagworte = kandidat.schlagworte;
  }
  // Schreibweisen sammeln sich ueber die Abfragen hinweg an: Je mehr
  // Namen ein Kandidat traegt, desto sicherer erkennt die App ihn in
  // der eigenen Sammlung wieder.
  vorhanden.titel = titelVarianten(...vorhanden.titel, ...kandidat.titel);
  if (!vorhanden.herkunft.regie && herkunft.regie) vorhanden.herkunft.regie = herkunft.regie;
  if (!vorhanden.herkunft.studio && herkunft.studio) vorhanden.herkunft.studio = herkunft.studio;
}

/* ---------------------------------------------------------------- *
 * Anreichern: Schlagworte und Altersfreigabe je Kandidat
 *
 * Der Entdecken-Endpunkt liefert weder das eine noch das andere, und
 * einen Filter nach Altersfreigabe kennt er fuer Serien auch nicht
 * (`certification` gibt es nur bei Filmen). Beides steht nur am
 * einzelnen Titel — dafuer in derselben Antwort, ein Aufruf je
 * Kandidat.
 *
 * Weil das ins Geld geht, bekommt nicht jeder Kandidat einen Aufruf:
 * Angereichert werden die aussichtsreichsten zuerst (vorsortiert nach
 * dem Genre-Anteil der Aehnlichkeit), und nur so viele, wie Budget und
 * Frist zulassen.
 * ---------------------------------------------------------------- */

/* Bei Adult Animation und Kinderserien haengt am Anreichern der
   Hart-Filter — dort lohnen mehr Aufrufe, weil ein Teil der Kandidaten
   danach ausscheidet und Nachschub gebraucht wird. */
const MAX_ANREICHERN = { movie: 50, series: 50, kids: 70, adultanim: 70 };

async function tmdbAnreichern(kind, kandidaten, category, start) {
  const grenze = MAX_ANREICHERN[category] || 50;
  const zuHolen = kandidaten.filter((k) => k.quellId != null).slice(0, grenze);
  if (!zuHolen.length) return;

  const anhang = kind === "tv" ? "content_ratings,keywords" : "keywords";
  await parallelAbarbeiten(zuHolen, PARALLEL, async (k) => {
    if (Date.now() - start > FRIST_MS) return;
    const response = await getJson(
      TMDB_BASIS + "/" + kind + "/" + encodeURIComponent(k.quellId) + "?api_key=" +
        encodeURIComponent(tmdbKey()) + "&language=de-DE&append_to_response=" + anhang
    );
    const d = response.data;
    if (!d) return;

    k.schlagworte = schlagworteAus(d.keywords);

    const freigaben = new Map();
    const roh = d.content_ratings && Array.isArray(d.content_ratings.results)
      ? d.content_ratings.results
      : [];
    for (const e of roh) {
      if (!e || typeof e.iso_3166_1 !== "string" || typeof e.rating !== "string") continue;
      const wert = e.rating.trim().toUpperCase();
      if (wert) freigaben.set(e.iso_3166_1.toUpperCase(), wert);
    }
    // Eine leere Karte heisst "gefragt, aber nichts hinterlegt" — das ist
    // etwas anderes als `null` ("gar nicht erst gefragt").
    k.freigaben = freigaben;
  });
}

/* ---------------------------------------------------------------- *
 * Kategorie-Passung — der Hart-Filter
 *
 * Nur fuer Adult Animation und Kinderserien. Beide holen ihre
 * Kandidaten aus demselben Topf wie Serien, und Genre und Jahrzehnt
 * unterscheiden die beiden praktisch nicht: "Animation, Comedy" steht
 * ueber Rick and Morty genauso wie ueber Willkommen bei den Louds.
 *
 * Entschieden wird in fester Reihenfolge, vom belastbarsten Signal zum
 * schwaechsten:
 *
 *   1. US-Altersfreigabe. Sie ist bei TMDB fuer Serien gepflegt und
 *      eindeutig: TV-Y bis TV-PG ist fuer Kinder, TV-14 und TV-MA nicht.
 *      Liegt sie vor, entscheidet sie allein.
 *   2. Deutsche Freigabe als Rueckfall (FSK 16/18 gegen 0/6). Die 12
 *      bleibt aussen vor — sie sagt weder das eine noch das andere.
 *   3. Schlagworte und das TMDB-Genre "Kids". "adult animation" oder
 *      "crude humor" auf der einen, "preschool" oder "children's
 *      television" auf der anderen Seite.
 *   4. Gar kein Signal: Der Kandidat bleibt drin, wird aber als
 *      unsicher vermerkt und landet hinter allen bestaetigten. Ihn
 *      hart auszuschliessen waere die strengere Lesart, wuerde aber
 *      Titel kosten, die schlicht schlecht gepflegt sind.
 * ---------------------------------------------------------------- */

const FREIGABE_ERWACHSEN = new Set(["TV-14", "TV-MA", "R", "NC-17", "MA", "18"]);
const FREIGABE_KINDER = new Set(["TV-Y", "TV-Y7", "TV-Y7-FV", "TV-G", "TV-PG", "G", "PG"]);

/* TMDBs Serien-Genre "Kids". Ueber die Kennung statt ueber den Namen:
   der kommt je nach Sprache als "Kids" oder "Kinder" zurueck. */
const TMDB_GENRE_KIDS = 10762;

/* Schlagworte, die den Ton verraten. Verglichen wird auf genauen
   Namen, nicht auf Teilzeichenketten — sonst wuerde "dysfunctional
   family" (steht ueber halb Adult Animation) als "family" gelesen und
   der Filter drehte sich um. */
const WORTE_ERWACHSEN = new Set(
  [
    "adult animation", "crude humor", "black comedy", "dark comedy", "raunchy",
    "profanity", "nudity", "sex", "gore", "drug abuse", "satire",
  ].map(schluessel)
);
const WORTE_KINDER = new Set(
  [
    "kids", "kids tv", "children", "children's television", "childrens television",
    "preschool", "family", "educational", "cartoon for kids", "toy",
  ].map(schluessel)
);

/** Freigabe -> "erwachsen" | "kinder" | null. */
function ausFreigaben(freigaben) {
  if (!freigaben || !freigaben.size) return null;

  const us = freigaben.get("US");
  if (us) {
    if (FREIGABE_ERWACHSEN.has(us)) return "erwachsen";
    if (FREIGABE_KINDER.has(us)) return "kinder";
  }

  const de = freigaben.get("DE");
  if (de) {
    const zahl = Number(de);
    if (Number.isFinite(zahl)) {
      if (zahl >= 16) return "erwachsen";
      if (zahl <= 6) return "kinder";
    } else if (FREIGABE_ERWACHSEN.has(de)) {
      return "erwachsen";
    } else if (FREIGABE_KINDER.has(de)) {
      return "kinder";
    }
  }
  return null;
}

/** Schlagworte und Genres -> "erwachsen" | "kinder" | null. */
function ausMerkmalen(kandidat) {
  const worte = kandidat.schlagworte.map((w) => schluessel(w));
  if (worte.some((w) => WORTE_ERWACHSEN.has(w))) return "erwachsen";
  if (worte.some((w) => WORTE_KINDER.has(w))) return "kinder";
  if (kandidat.genreIds.includes(TMDB_GENRE_KIDS)) return "kinder";
  return null;
}

/* Zuschlag fuer eine bestaetigte Passung. Er hebt die geprueften
   Kandidaten ueber die knapp gleichauf liegenden. */
const PASSUNG_BONUS = 0.1;

/**
 * -> { erlaubt, unsicher, bonus }
 *
 * Filme, Serien und Anime durchlaufen das nicht: Dort gibt es keine
 * Schwesterkategorie, gegen die abzugrenzen waere.
 */
function kategoriePassung(category, kandidat) {
  const durch = { erlaubt: true, unsicher: false, bonus: 0 };
  if (category !== "kids" && category !== "adultanim") return durch;

  const gesucht = category === "adultanim" ? "erwachsen" : "kinder";
  const gegenteil = category === "adultanim" ? "kinder" : "erwachsen";

  const nachFreigabe = ausFreigaben(kandidat.freigaben);
  if (nachFreigabe === gesucht) return { erlaubt: true, unsicher: false, bonus: PASSUNG_BONUS };
  if (nachFreigabe === gegenteil) return { erlaubt: false, unsicher: false, bonus: 0 };

  const nachMerkmal = ausMerkmalen(kandidat);
  if (nachMerkmal === gesucht) return { erlaubt: true, unsicher: false, bonus: PASSUNG_BONUS };
  if (nachMerkmal === gegenteil) return { erlaubt: false, unsicher: false, bonus: 0 };

  return { erlaubt: true, unsicher: true, bonus: 0 };
}

/* ---------------------------------------------------------------- *
 * Bewerten
 * ---------------------------------------------------------------- */

/* So viele Genretreffer nennt die Begruendung hoechstens. Auf die
   Bewertung selbst hat die Zahl keinen Einfluss mehr — die macht der
   Cosinus. */
const MAX_GENRE_TREFFER = 3;

/* Zuschlaege neben der Aehnlichkeit. Sie koennen einen guten
   Profiltreffer nicht ueberholen, entscheiden aber, wenn zwei
   Kandidaten dicht beieinanderliegen. */
const HERKUNFT_FAKTOR = 0.3;

/* Das Jahrzehnt ist das schwaechste Signal: Es sagt etwas ueber den
   Geschmack, aber nichts ueber den einzelnen Titel. */
const JAHRZEHNT_FAKTOR = 0.1;

/**
 * Aehnlichkeit eines Kandidaten zum Profil, 0 bis 1.
 *
 * `nurGenres` rechnet den Schlagwort-Anteil heraus — das ist die
 * Vorsortierung vor dem Anreichern, wo noch niemand Schlagworte hat.
 */
function aehnlichkeit(kandidat, profilGenres, profilWorte, nurGenres) {
  const gCos = cosinus(profilGenres, vektorAus(kandidat.genreNamen.map((n) => ({ name: n, gewicht: 1 }))));
  if (nurGenres || !profilWorte.size) return gCos;

  const kCos = cosinus(profilWorte, vektorAus(kandidat.schlagworte.map((n) => ({ name: n, gewicht: 1 }))));
  return (GENRE_ANTEIL * gCos + SCHLAGWORT_ANTEIL * kCos) / (GENRE_ANTEIL + SCHLAGWORT_ANTEIL);
}

/**
 * Zuschlaege, die nicht aus der Aehnlichkeit kommen: Regie, Studio,
 * Jahrzehnt und ein winziger Ausschlag fuer die allgemeine
 * Beliebtheit.
 */
function zuschlaege(kandidat, gewichte) {
  let punkte = 0;
  let regie = null;
  let studio = null;
  let jahrzehnt = null;

  if (kandidat.herkunft.regie) {
    const gewicht = gewichte.regie.get(schluessel(kandidat.herkunft.regie));
    if (gewicht != null) {
      punkte += gewicht * HERKUNFT_FAKTOR;
      regie = kandidat.herkunft.regie;
    }
  }
  if (kandidat.herkunft.studio) {
    const gewicht = gewichte.studios.get(schluessel(kandidat.herkunft.studio));
    if (gewicht != null) {
      punkte += gewicht * HERKUNFT_FAKTOR;
      studio = kandidat.herkunft.studio;
    }
  }
  if (kandidat.year) {
    const jz = String(Math.floor(kandidat.year / 10) * 10);
    const gewicht = gewichte.jahrzehnte.get(jz);
    if (gewicht != null) {
      punkte += gewicht * JAHRZEHNT_FAKTOR;
      jahrzehnt = Number(jz);
    }
  }
  // Winziger Ausschlag fuer die allgemeine Beliebtheit. Er entscheidet
  // nur bei Gleichstand und kann keinen Profiltreffer ueberholen.
  punkte += (typeof kandidat.stimmen === "number" ? kandidat.stimmen : 0) / 1000;

  return { punkte, regie, studio, jahrzehnt };
}

/** Die Genres des Kandidaten, die im Profil vorkommen — die staerksten zuerst. */
function genreTreffer(kandidat, profilGenres) {
  const treffer = [];
  for (const name of kandidat.genreNamen) {
    const gewicht = profilGenres.get(schluessel(name));
    if (gewicht == null) continue;
    treffer.push({ name, gewicht });
  }
  treffer.sort((a, b) => b.gewicht - a.gewicht);
  return treffer.slice(0, MAX_GENRE_TREFFER);
}

function bewerten(kandidaten, profil, profilWorte, category) {
  const profilGenres = vektorAus(profil.genres);
  const worte = vektorAus(profilWorte);
  const gewichte = {
    regie: new Map(profil.regie.map((g) => [schluessel(g.name), g.gewicht])),
    studios: new Map(profil.studios.map((g) => [schluessel(g.name), g.gewicht])),
    jahrzehnte: new Map(profil.jahrzehnte.map((g) => [String(Number(g.name)), g.gewicht])),
  };
  const nomen = NOMEN[category] || "Titel";

  const raus = [];
  for (const k of kandidaten) {
    const passung = kategoriePassung(category, k);
    if (!passung.erlaubt) continue;

    const zusatz = zuschlaege(k, gewichte);
    const punkte =
      aehnlichkeit(k, profilGenres, worte, false) + zusatz.punkte + passung.bonus;
    const besteGenres = genreTreffer(k, profilGenres);

    raus.push({
      title: k.title,
      // Alle bekannten Schreibweisen — die App streicht damit, was sie
      // schon bewertet oder vorgemerkt hat.
      titel: k.titel,
      year: k.year || null,
      poster: k.poster || null,
      begruendung: begruendung(
        nomen, besteGenres.map((g) => g.name), zusatz.regie, zusatz.studio, zusatz.jahrzehnt
      ),
      punkte: Math.round(punkte * 1000) / 1000,
      // Nur intern: Kandidaten ohne belastbares Signal zur Kategorie
      // sortieren hinter alle geprueften.
      unsicher: passung.unsicher,
    });
  }
  return raus;
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

/**
 * Liest Kategorie und Profil — gleichgueltig, auf welchem Weg sie
 * ankommen.
 *
 * GET traegt das Profil als JSON im Abfrageteil, POST im Rumpf. Beides
 * geht, und zwar mit Absicht: Der Abschnitt in der App ist Beiwerk, und
 * ein Vorschlagsdienst, der an der Wahl der Methode scheitert, ist
 * schlechter als einer, der beide annimmt.
 */
function anfrageLesen(req) {
  const query = req.query || {};

  if (req.method === "POST") {
    const roh = req.body;
    let body = {};
    if (typeof roh === "string") {
      // Nicht jede Umgebung liest den Rumpf selbst als JSON ein.
      try { body = JSON.parse(roh); } catch (e) { body = {}; }
    } else if (roh && typeof roh === "object") {
      body = roh;
    }
    return { category: body.category, profil: body.profil, veraltet: false };
  }

  let profil = null;
  if (typeof query.profil === "string" && query.profil) {
    try { profil = JSON.parse(query.profil); } catch (e) { profil = null; }
  }

  /* Eine aeltere Fassung der App im Browser-Cache fragt noch nach dem
     alten Muster: statt eines Profils schickt sie die Titel ihrer
     Bestbewerteten als `titles`. Damit ist hier nichts anzufangen — aber
     ein Hinweis ist allemal besser als ein Fehler. */
  const veraltet = !profil && typeof query.titles === "string" && !!query.titles;
  return { category: query.category, profil, veraltet };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Methode nicht erlaubt." });
    }

    const anfrage = anfrageLesen(req);
    const category = anfrage.category || "movie";

    if (category === "game") {
      return res.status(400).json({
        error: "Für Spiele gibt es keine Empfehlungen.",
        hinweis: "SteamGridDB ist eine Bilddatenbank und kennt keine Genres.",
      });
    }
    if (!["movie", "series", "anime", "kids", "adultanim", "doku", "comedy"].includes(category)) {
      return res.status(400).json({ error: "Ungültige Kategorie." });
    }

    const profil = profilLesen(anfrage.profil, category);
    if (profilLeer(profil)) {
      return res.status(200).json({
        results: [],
        gefragt: [],
        hinweis: anfrage.veraltet
          ? "Die App läuft noch in einer älteren Fassung — bitte die Seite einmal neu laden."
          : "Noch zu wenige Bewertungen für ein Geschmacksprofil.",
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

    const start = Date.now();
    const kind = istSerienArt(category) ? "tv" : "movie";

    /* 1. Kandidaten sammeln und die Schlagworte des Profils holen.

          Bei TMDB laeuft beides gleichzeitig — es hat nichts
          miteinander zu tun. Bei Anime nicht: Jikan laesst nur drei
          Anfragen je Sekunde zu, und zwei parallele Strecken mit je
          eigener Pause reissen dieses Limit zusammen. Dort also
          nacheinander, Schlagworte zuerst, damit sie nicht schon an der
          Frist scheitern. */
    let kandidaten;
    let gefragt;
    let profilWorte;
    if (istAnime) {
      profilWorte = await profilSchlagworte(profil, category, start);
      ({ kandidaten, gefragt } = await jikanSammeln(profil));
    } else {
      const [gesammelt, worte] = await Promise.all([
        tmdbSammeln(kind, profil),
        profilSchlagworte(profil, category, start),
      ]);
      ({ kandidaten, gefragt } = gesammelt);
      profilWorte = worte;
    }

    /* 2. Anreichern — aber nur die aussichtsreichsten. Vorsortiert wird
          ueber den Genre-Anteil der Aehnlichkeit; mehr ist zu diesem
          Zeitpunkt nicht bekannt. Anime brauchen den Schritt nicht:
          Jikan liefert Themes und Demographics schon beim Sammeln. */
    if (!istAnime) {
      const profilGenres = vektorAus(profil.genres);
      const vorsortiert = kandidaten
        .map((k) => ({ k, wert: aehnlichkeit(k, profilGenres, new Map(), true) }))
        .sort((a, b) => b.wert - a.wert)
        .map((e) => e.k);
      kandidaten = vorsortiert;
      await tmdbAnreichern(kind, kandidaten, category, start);
    }

    /* 3. Hart-Filter (nur Adult Animation und Kinderserien) und
          Endsortierung nach Aehnlichkeit zum Gesamtprofil. Kandidaten
          ohne belastbares Signal zur Kategorie stehen geschlossen
          hinter den geprueften. */
    const bewertet = bewerten(kandidaten, profil, profilWorte, category);
    bewertet.sort((a, b) => (a.unsicher ? 1 : 0) - (b.unsicher ? 1 : 0) || b.punkte - a.punkte);

    const antwort = {
      results: bewertet.slice(0, MAX_ERGEBNISSE).map(({ unsicher, ...rest }) => rest),
      gefragt,
    };
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
