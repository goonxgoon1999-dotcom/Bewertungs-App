import React, { useState, useEffect, useMemo, useRef } from "react";

/* ============================================================
   KRITERIEN-DEFINITION — je Kategorie eigene Kriterien

   Film, Serie und Anime teilen sich dieselben sieben Datenfelder
   und Gewichte. Anime beschriftet zwei davon nur anders: aus
   "Inszenierung" wird "Animation", aus "Schauspiel" wird
   "Synchronstimme". Die Feldnamen (inszenierung, schauspiel) und
   die Gewichte bleiben identisch — gespeicherte Werte gelten also
   unverändert weiter, es ändert sich ausschließlich die Anzeige.

   Spiele haben eigene Kriterien und dadurch eigene Datenfelder.
   ============================================================ */
const AV_CRITERIA = [
  { key: "story", label: "Story & Drehbuch", weight: 0.25, hint: "Handlung, Aufbau, Logik, Dialoge, Pacing" },
  { key: "charaktere", label: "Charaktere", weight: 0.20, hint: "Entwicklung, Tiefe, Beziehungen, Motivation" },
  { key: "unterhaltung", label: "Unterhaltung", weight: 0.15, hint: "Wie fesselnd und unterhaltsam ist das Werk?" },
  { key: "emotion", label: "Emotion & Wirkung", weight: 0.15, hint: "Spannung, Emotionen, Gänsehaut, Wirkung danach" },
  { key: "inszenierung", label: "Inszenierung", weight: 0.10, hint: "Regie, Kamera, Schnitt, Atmosphäre" },
  { key: "schauspiel", label: "Schauspiel", weight: 0.10, hint: "Leistungen, Chemie, Performance" },
  { key: "sound", label: "Soundtrack / Sounddesign", weight: 0.05, hint: "Musik, Score, Soundeffekte" },
];

/* Nur die Beschriftung weicht ab — Feld und Gewicht bleiben gleich. */
const ANIME_LABELS = {
  inszenierung: { label: "Animation", hint: "Animationsqualität, Bildgestaltung, Atmosphäre" },
  schauspiel: { label: "Synchronstimme", hint: "Sprecherleistung, Chemie, Performance" },
};

const ANIME_CRITERIA = AV_CRITERIA.map((c) =>
  ANIME_LABELS[c.key] ? { ...c, ...ANIME_LABELS[c.key] } : c
);

const GAME_CRITERIA = [
  { key: "gameplay", label: "Gameplay", weight: 0.25, hint: "Steuerung, Spielmechanik, Spielgefühl" },
  { key: "story", label: "Story", weight: 0.25, hint: "Handlung, Aufbau, Erzählung" },
  { key: "charaktere", label: "Charaktere", weight: 0.15, hint: "Entwicklung, Tiefe, Motivation" },
  { key: "welt", label: "Welt", weight: 0.15, hint: "Spielwelt, Leveldesign, Atmosphäre" },
  { key: "grafik", label: "Grafik", weight: 0.10, hint: "Optik, Artdesign, technische Umsetzung" },
  { key: "sound", label: "Sound", weight: 0.05, hint: "Musik, Effekte, Vertonung" },
  { key: "wiederspielwert", label: "Wiederspielwert", weight: 0.05, hint: "Motivation für weitere Durchgänge, Umfang" },
];

const CRITERIA_BY_CATEGORY = {
  movie: AV_CRITERIA,
  series: AV_CRITERIA,
  anime: ANIME_CRITERIA,
  game: GAME_CRITERIA,
};

/** Die Kriterien einer Kategorie — nie global, immer über diese Funktion. */
function criteriaFor(category) {
  return CRITERIA_BY_CATEGORY[category] || AV_CRITERIA;
}

const CATEGORIES = [
  { key: "movie", label: "Filme", singular: "Film" },
  { key: "series", label: "Serien", singular: "Serie" },
  { key: "anime", label: "Anime", singular: "Anime" },
  { key: "game", label: "Spiele", singular: "Spiel" },
];

const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/* Akzentfarbe je Kategorie. Sie faerbt nur Bedienelemente —
   Notenfarben (scoreToColor) bleiben davon unberuehrt, weil sie die
   Hoehe der Bewertung codieren und nicht die Kategorie. */
const CATEGORY_COLORS = {
  movie: "#C9A227",
  series: "#3E9C8F",
  anime: "#8B6BC9",
  game: "#C4633E",
};

function accentFor(category) {
  return CATEGORY_COLORS[category] || "#C9A227";
}

/* Alle vorkommenden Kriterien-Felder, in stabiler Reihenfolge —
   für den CSV-Export über mehrere Kategorien hinweg. */
const ALL_CRITERIA_KEYS = Array.from(
  new Set(CATEGORY_KEYS.flatMap((k) => criteriaFor(k).map((c) => c.key)))
);

/* ============================================================
   BERECHNUNG
   ============================================================ */
function computeCriteriaScore(values, category) {
  let total = 0;
  for (const c of criteriaFor(category)) {
    const v = values ? values[c.key] : undefined;
    if (typeof v === "number") total += v * c.weight;
  }
  return Math.round(total * 100) / 100;
}

function computeFinalScore(values, personal, category) {
  const criteriaScore = computeCriteriaScore(values, category);
  if (typeof personal !== "number") return criteriaScore;
  return Math.round((0.75 * criteriaScore + 0.25 * personal) * 100) / 100;
}

/* ---------------------------------------------------------------
   Staffeln (optional, nur Serien und Anime)

   Ein Eintrag mit Staffeln wird nicht mehr selbst bewertet: seine
   Endnote ist der ungewichtete Durchschnitt der Staffelnoten. Jede
   Staffelnote entsteht nach genau derselben Formel wie bisher.
   --------------------------------------------------------------- */
const SEASON_CATEGORIES = ["series", "anime"];

function supportsSeasons(category) {
  return SEASON_CATEGORIES.includes(category);
}

function hasSeasons(entry) {
  return !!(entry && Array.isArray(entry.seasons) && entry.seasons.length);
}

/** Note einer einzelnen Staffel — dieselbe Formel wie fuer Eintraege. */
function seasonScore(season, category) {
  return computeFinalScore(season.values, season.personal, category);
}

/* Gewichtung einer Staffel. Eingegeben wird sie in Prozent: 0 % bis
   200 % in 5-Prozent-Schritten, voreingestellt 100 %. 0 % heisst, dass
   die Staffel nicht in die Endnote einfliesst, 200 % zaehlt sie
   doppelt. Gerechnet wird intern weiter mit Faktoren (Prozent / 100) —
   100 % ist der Faktor 1.0, bestehende Staffeln aendern ihre Note
   dadurch nicht. */
const SEASON_WEIGHT_DEFAULT = 1;
const SEASON_WEIGHT_MIN = 0;
const SEASON_WEIGHT_MAX = 2;
const SEASON_PERCENT_DEFAULT = 100;
const SEASON_PERCENT_MIN = 0;
const SEASON_PERCENT_MAX = 200;
const SEASON_PERCENT_STEP = 5;

function seasonWeight(season) {
  const w = season ? season.weight : undefined;
  if (typeof w !== "number" || Number.isNaN(w)) return SEASON_WEIGHT_DEFAULT;
  return Math.min(SEASON_WEIGHT_MAX, Math.max(SEASON_WEIGHT_MIN, w));
}

/* Faktor -> Prozent. Die Rundung auf eine Nachkommastelle haelt
   Rechenungenauigkeiten heraus (0.05 * 100 ist nicht exakt 5). */
function weightToPercent(faktor) {
  return Math.round(faktor * 1000) / 10;
}

/** Prozent -> Faktor, begrenzt und auf 5-Prozent-Schritte gerundet. */
function percentToWeight(prozent) {
  const roh = typeof prozent === "number" && !Number.isNaN(prozent) ? prozent : SEASON_PERCENT_DEFAULT;
  const begrenzt = Math.min(SEASON_PERCENT_MAX, Math.max(SEASON_PERCENT_MIN, roh));
  return (Math.round(begrenzt / SEASON_PERCENT_STEP) * SEASON_PERCENT_STEP) / 100;
}

/** Gewichtung einer Staffel in Prozent. */
function seasonPercent(season) {
  return weightToPercent(seasonWeight(season));
}

/** Summe aller Gewichte. Ist sie 0, gilt der Eintrag als unbewertet. */
function seasonWeightSum(entry) {
  return entry.seasons.reduce((s, sn) => s + seasonWeight(sn), 0);
}

/**
 * Gewichteter Durchschnitt ueber die Staffeln:
 *   Summe(Wert x Faktor) / Summe(Faktoren)
 * Ohne Gewichte (alle 1.0) ist das exakt der bisherige Mittelwert.
 * Bei Gewichtssumme 0 gibt es kein Ergebnis -> null.
 */
function gewichtetesMittel(entry, wertVon) {
  const summe = seasonWeightSum(entry);
  if (summe <= 0) return null;
  const gewichtet = entry.seasons.reduce((s, sn) => s + wertVon(sn) * seasonWeight(sn), 0);
  return Math.round((gewichtet / summe) * 100) / 100;
}

/**
 * Endnote eines Eintrags: mit Staffeln deren gewichtetes Mittel, sonst
 * wie bisher. `null` bedeutet unbewertet (Gewichtssumme 0).
 */
function entryScore(entry, category) {
  if (!hasSeasons(entry)) return computeFinalScore(entry.values, entry.personal, category);
  return gewichtetesMittel(entry, (sn) => seasonScore(sn, category));
}

/** Kriterien-Note eines Eintrags (ohne Bauchgefuehl), analog gewichtet. */
function entryCriteriaScore(entry, category) {
  if (!hasSeasons(entry)) return computeCriteriaScore(entry.values, category);
  return gewichtetesMittel(entry, (sn) => computeCriteriaScore(sn.values, category));
}

/** Wert eines Kriteriums fuer die Statistik — je Eintrag genau einmal. */
function entryCriterionValue(entry, key) {
  if (!hasSeasons(entry)) {
    const v = entry.values ? entry.values[key] : undefined;
    return typeof v === "number" ? v : null;
  }
  const brauchbar = entry.seasons.filter((s) => typeof s.values[key] === "number");
  const summe = brauchbar.reduce((s, sn) => s + seasonWeight(sn), 0);
  if (!brauchbar.length || summe <= 0) return null;
  return brauchbar.reduce((s, sn) => s + sn.values[key] * seasonWeight(sn), 0) / summe;
}

/** Bauchgefuehl eines Eintrags — bei Staffeln deren Mittel. */
function entryPersonal(entry) {
  if (!hasSeasons(entry)) return typeof entry.personal === "number" ? entry.personal : null;
  const brauchbar = entry.seasons.filter((s) => typeof s.personal === "number");
  const summe = brauchbar.reduce((s, sn) => s + seasonWeight(sn), 0);
  if (!brauchbar.length || summe <= 0) return null;
  return brauchbar.reduce((s, sn) => s + sn.personal * seasonWeight(sn), 0) / summe;
}

/** Leere Staffel mit den Werten eines Eintrags vorbelegen. */
function seasonFromEntry(entry, nummer) {
  return {
    seasonNumber: nummer,
    values: { ...(entry.values || {}) },
    personal: typeof entry.personal === "number" ? entry.personal : null,
    weight: SEASON_WEIGHT_DEFAULT,
  };
}

/* Ankerpunkte der Notenfarbe. Zwischen zwei Ankern wird pro Kanal
   linear interpoliert, sodass sich die Farbe bei jedem 0.1-Schritt
   aendert statt in Stufen zu springen. */
const SCORE_COLOR_STOPS = [
  { at: 0.0, rgb: [155, 17, 17] },
  { at: 2.5, rgb: [220, 38, 38] },
  { at: 5.0, rgb: [234, 108, 12] },
  { at: 6.5, rgb: [212, 160, 23] },
  { at: 7.5, rgb: [22, 163, 74] },
  { at: 8.5, rgb: [14, 156, 171] },
  { at: 9.5, rgb: [59, 79, 224] },
  { at: 10.0, rgb: [37, 46, 190] },
];

/* Anteil, um den der Nachkommabereich gestaucht wird. Dadurch entsteht
   an jeder ganzen Zahl ein sichtbarer Sprung — 8.99 und 9.00 sind klar
   unterscheidbar —, waehrend die Zehntel innerhalb einer Zahl weiterhin
   auseinanderzuhalten sind. */
const GANZZAHL_SPRUNG = 0.35;

function scoreToColor(score) {
  const roh = Math.min(10, Math.max(0, typeof score === "number" && !Number.isNaN(score) ? score : 0));

  // Der Nachkommaanteil deckt nur noch (1 - Sprung) des Abstands zur
  // naechsten ganzen Zahl ab; der Rest wird beim Uebergang uebersprungen.
  const n = Math.floor(roh);
  const frac = roh - n;
  const v = Math.min(10, n + frac * (1 - GANZZAHL_SPRUNG));

  let lo = SCORE_COLOR_STOPS[0];
  let hi = SCORE_COLOR_STOPS[SCORE_COLOR_STOPS.length - 1];
  for (let i = 0; i < SCORE_COLOR_STOPS.length - 1; i++) {
    if (v >= SCORE_COLOR_STOPS[i].at && v <= SCORE_COLOR_STOPS[i + 1].at) {
      lo = SCORE_COLOR_STOPS[i];
      hi = SCORE_COLOR_STOPS[i + 1];
      break;
    }
  }

  const spanne = hi.at - lo.at;
  const t = spanne === 0 ? 0 : (v - lo.at) / spanne;
  const kanal = (i) => Math.round(lo.rgb[i] + (hi.rgb[i] - lo.rgb[i]) * t);
  return `rgb(${kanal(0)}, ${kanal(1)}, ${kanal(2)})`;
}

/* Die Balken der Verteilung nutzen dieselbe Skala: `at` ist der Wert,
   der das jeweilige Band repraesentiert. */
const DISTRIBUTION_BANDS = [
  { label: "9 – 10", min: 9, max: 10.001, at: 9.5 },
  { label: "8 – 8.99", min: 8, max: 9, at: 8.5 },
  { label: "7 – 7.99", min: 7, max: 8, at: 7.5 },
  { label: "6 – 6.99", min: 6, max: 7, at: 6.5 },
  { label: "5 – 5.99", min: 5, max: 6, at: 5.5 },
  { label: "unter 5", min: -Infinity, max: 5, at: 2.5 },
];

const SCORE_PRESETS = [
  { key: "all", label: "Alle", min: 0, max: 10 },
  { key: "9", label: "9.0–10.0", min: 9, max: 10 },
  { key: "8", label: "8.0–8.99", min: 8, max: 8.99 },
  { key: "7", label: "7.0–7.99", min: 7, max: 7.99 },
  { key: "6", label: "6.0–6.99", min: 6, max: 6.99 },
  { key: "u6", label: "unter 6.0", min: 0, max: 5.99 },
];

const SORT_OPTIONS = [
  { key: "score-desc", label: "Bewertung: hoch → niedrig" },
  { key: "score-asc", label: "Bewertung: niedrig → hoch" },
  { key: "title-asc", label: "Alphabetisch A → Z" },
  { key: "title-desc", label: "Alphabetisch Z → A" },
  { key: "recent-desc", label: "Neueste zuerst" },
  { key: "recent-asc", label: "Älteste zuerst" },
];

/* Der Filterzustand. Sortierung und Notenbereich waren schon da; die
   vier leeren Zeichenketten sind die zusaetzlichen Filter — leer heisst
   immer "alle". */
const DEFAULT_FILTER = {
  sort: "score-desc",
  min: 0,
  max: 10,
  genre: "",
  jahrzehnt: "",
  regie: "",
  reihe: "",
};

/* ------------------------------------------------------------
   Zusaetzliche Filter: Genre, Jahrzehnt, Regie, Filmreihe

   Die Auswahlmoeglichkeiten stehen nirgends fest — sie entstehen aus
   dem, was in der jeweiligen Kategorie tatsaechlich vorkommt. Was es
   nicht gibt, steht auch nicht zur Wahl.
   ------------------------------------------------------------ */

/* Filmreihen kommen aus zwei Quellen und werden deshalb mit einem
   Praefix unterschieden: "c:" ist eine echte TMDB-Collection
   ("Star Wars Collection"), "s:" das Produktionsstudio als Naeherung
   fuer Franchises ohne eigene Collection (Marvel Studios fuer das MCU). */
const REIHE_COLLECTION = "c:";
const REIHE_STUDIO = "s:";

function jahrzehntVon(entry) {
  const jahr = entry && entry.releaseYear;
  return typeof jahr === "number" && jahr > 0 ? Math.floor(jahr / 10) * 10 : null;
}

/**
 * Sammelt die Auswahlmoeglichkeiten aus einer Liste von Eintraegen.
 * Jede Moeglichkeit traegt mit, wie oft sie vorkommt — danach wird
 * sortiert, damit oben steht, was die Sammlung praegt.
 */
function filterOptionen(liste, category) {
  const zaehle = (map, wert, label) => {
    if (!wert) return;
    const vorhanden = map.get(wert);
    if (vorhanden) vorhanden.anzahl++;
    else map.set(wert, { wert, label: label || wert, anzahl: 1 });
  };

  const genres = new Map();
  const jahrzehnte = new Map();
  const regie = new Map();
  const reihen = new Map();

  for (const eintrag of liste) {
    for (const g of eintrag.genre || []) zaehle(genres, g);
    const jz = jahrzehntVon(eintrag);
    if (jz) zaehle(jahrzehnte, String(jz), jz + "er");
    if (eintrag.director) zaehle(regie, eintrag.director);
    // Filmreihen und Studios gibt es nur bei Filmen.
    if (category === "movie") {
      if (eintrag.collection) {
        zaehle(reihen, REIHE_COLLECTION + eintrag.collection, eintrag.collection);
      }
      if (eintrag.studio) {
        zaehle(reihen, REIHE_STUDIO + eintrag.studio, eintrag.studio + " (Studio)");
      }
    }
  }

  const nachAnzahl = (a, b) => b.anzahl - a.anzahl || a.label.localeCompare(b.label, "de");
  return {
    genres: [...genres.values()].sort(nachAnzahl),
    // Jahrzehnte lesen sich chronologisch besser als nach Haeufigkeit.
    jahrzehnte: [...jahrzehnte.values()].sort((a, b) => Number(b.wert) - Number(a.wert)),
    regie: [...regie.values()].sort(nachAnzahl),
    // Eine Reihe aus einem einzigen Film ist keine Reihe. Studios
    // bleiben aus demselben Grund erst ab zwei Filmen stehen.
    reihen: [...reihen.values()].filter((r) => r.anzahl >= 2).sort(nachAnzahl),
  };
}

/** Passt ein Eintrag zu den gesetzten Zusatzfiltern? */
function passtZuFiltern(eintrag, filter) {
  if (filter.genre && !(eintrag.genre || []).includes(filter.genre)) return false;
  if (filter.jahrzehnt && String(jahrzehntVon(eintrag)) !== filter.jahrzehnt) return false;
  if (filter.regie && eintrag.director !== filter.regie) return false;
  if (filter.reihe) {
    const wert = filter.reihe.slice(2);
    const feld = filter.reihe.startsWith(REIHE_STUDIO) ? eintrag.studio : eintrag.collection;
    if (feld !== wert) return false;
  }
  return true;
}

/** Ist ausser der Sortierung irgendetwas eingeschraenkt? */
function filterAktiv(filter) {
  return (
    filter.min !== DEFAULT_FILTER.min ||
    filter.max !== DEFAULT_FILTER.max ||
    !!filter.genre ||
    !!filter.jahrzehnt ||
    !!filter.regie ||
    !!filter.reihe
  );
}

function emptyValues(category) {
  const v = {};
  for (const c of criteriaFor(category)) v[c.key] = null;
  return v;
}

function isValuesComplete(values, category) {
  return criteriaFor(category).every(
    (c) => values && typeof values[c.key] === "number" && values[c.key] >= 0 && values[c.key] <= 10
  );
}

/* Staffeln aus einem Backup uebernehmen. Fehlen sie oder sind sie
   unvollstaendig, wird der Eintrag ohne Staffeln importiert — alte
   Backups ohne dieses Feld bleiben damit gueltig. */
function gueltigeStaffeln(seasons, category) {
  if (!supportsSeasons(category) || !Array.isArray(seasons)) return [];
  const brauchbar = seasons.filter(
    (sn) => sn && sn.values && isValuesComplete(sn.values, category) && typeof sn.personal === "number"
  );
  return brauchbar.map((sn, i) => ({
    seasonNumber: i + 1,
    values: sn.values,
    personal: sn.personal,
    // Neuere Backups tragen die Gewichtung in Prozent, aeltere den
    // Faktor. Fehlt beides, gilt 100 % (Faktor 1.0).
    weight:
      typeof sn.weightPercent === "number"
        ? percentToWeight(sn.weightPercent)
        : typeof sn.weight === "number"
          ? Math.min(SEASON_WEIGHT_MAX, Math.max(SEASON_WEIGHT_MIN, sn.weight))
          : SEASON_WEIGHT_DEFAULT,
  }));
}

function csvEscape(s) {
  const str = String(s ?? "");
  if (/[",\n;]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function isLikelyUrl(s) {
  return typeof s === "string" && /^https?:\/\//i.test(s.trim());
}

/* Wie viele Bilder je Seitenaufruf hoechstens nachgeladen werden.
   Jede Suche kostet serverseitig mehrere externe Aufrufe — ohne Grenze
   feuert eine Sammlung mit hunderten Eintraegen bei jedem Oeffnen
   entsprechend viele Anfragen ab. Der Rest folgt beim naechsten Besuch. */
const MAX_NACHLADEN_PRO_BESUCH = 20;

/* Eigenes Kontingent fuer das einmalige Nachtragen der Zusatzdaten
   (Genre, Filmreihe, Studio) und der Laufzeit an Eintraegen, denen
   sonst nichts fehlt.
   Es laeuft neben dem obigen her, damit der Nachtrag nicht das
   Kontingent fuer fehlende Poster aufbraucht — und ist groesser, weil
   es sich um einen einmaligen Durchlauf ueber die ganze Sammlung
   handelt, nicht um laufenden Betrieb. Die Pause dazwischen haelt die
   freien APIs bei Laune; Jikan etwa erlaubt nur drei Anfragen je
   Sekunde. */
const MAX_ZUSATZ_PRO_BESUCH = 40;
const ZUSATZ_PAUSE_MS = 300;

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const ERFOLGLOS_SCHLUESSEL = "bewertungsapp.ohneBildtreffer";

/** Eintraege, fuer die die Suche schon einmal nichts gefunden hat. */
function ladeErfolglose() {
  try {
    const roh = window.localStorage.getItem(ERFOLGLOS_SCHLUESSEL);
    return new Set(roh ? JSON.parse(roh) : []);
  } catch (e) {
    return new Set();
  }
}

function merkeErfolglos(id) {
  try {
    const menge = ladeErfolglose();
    menge.add(id);
    window.localStorage.setItem(ERFOLGLOS_SCHLUESSEL, JSON.stringify([...menge]));
  } catch (e) {
    // Ohne localStorage funktioniert alles weiter, nur ohne Gedaechtnis.
  }
}

function vergissErfolglose() {
  try {
    window.localStorage.removeItem(ERFOLGLOS_SCHLUESSEL);
  } catch (e) {}
}

/* Dasselbe Gedaechtnis fuer die Angaben zum Werk (Jahr, Regie,
   IMDb-Note). Getrennt vom Poster-Gedaechtnis, damit ein erfolgloser
   Poster-Versuch die Angaben nicht mitblockiert — und umgekehrt. */
const OHNE_ANGABEN_SCHLUESSEL = "bewertungsapp.ohneAngaben";

function ladeOhneAngaben() {
  try {
    const roh = window.localStorage.getItem(OHNE_ANGABEN_SCHLUESSEL);
    return new Set(roh ? JSON.parse(roh) : []);
  } catch (e) {
    return new Set();
  }
}

function merkeOhneAngaben(id) {
  try {
    const menge = ladeOhneAngaben();
    menge.add(id);
    window.localStorage.setItem(OHNE_ANGABEN_SCHLUESSEL, JSON.stringify([...menge]));
  } catch (e) {}
}

/** Einen einzelnen Eintrag wieder freigeben — etwa nach Titelaenderung. */
function vergissOhneAngaben(id) {
  try {
    const menge = ladeOhneAngaben();
    if (!menge.delete(id)) return;
    window.localStorage.setItem(OHNE_ANGABEN_SCHLUESSEL, JSON.stringify([...menge]));
  } catch (e) {}
}

function vergissAlleOhneAngaben() {
  try {
    window.localStorage.removeItem(OHNE_ANGABEN_SCHLUESSEL);
  } catch (e) {}
}

/* Und dasselbe noch einmal fuer die Zusatzdaten (Genre, Filmreihe,
   Studio). Wieder getrennt: Ein Eintrag, der seit Jahren keine
   IMDb-Note bekommt, soll deshalb nicht dauerhaft ohne Genre bleiben. */
const OHNE_GENRE_SCHLUESSEL = "bewertungsapp.ohneGenre";

function ladeOhneGenre() {
  try {
    const roh = window.localStorage.getItem(OHNE_GENRE_SCHLUESSEL);
    return new Set(roh ? JSON.parse(roh) : []);
  } catch (e) {
    return new Set();
  }
}

function merkeOhneGenre(id) {
  try {
    const menge = ladeOhneGenre();
    menge.add(id);
    window.localStorage.setItem(OHNE_GENRE_SCHLUESSEL, JSON.stringify([...menge]));
  } catch (e) {}
}

function vergissOhneGenre(id) {
  try {
    const menge = ladeOhneGenre();
    if (!menge.delete(id)) return;
    window.localStorage.setItem(OHNE_GENRE_SCHLUESSEL, JSON.stringify([...menge]));
  } catch (e) {}
}

function vergissAlleOhneGenre() {
  try {
    window.localStorage.removeItem(OHNE_GENRE_SCHLUESSEL);
  } catch (e) {}
}

/* Und ein drittes Mal fuer die Laufzeit. Wieder eigenes Gedaechtnis:
   ein Eintrag ohne Genre kann sehr wohl eine Laufzeit haben — und
   umgekehrt. */
const OHNE_LAUFZEIT_SCHLUESSEL = "bewertungsapp.ohneLaufzeit";

function ladeOhneLaufzeit() {
  try {
    const roh = window.localStorage.getItem(OHNE_LAUFZEIT_SCHLUESSEL);
    return new Set(roh ? JSON.parse(roh) : []);
  } catch (e) {
    return new Set();
  }
}

function merkeOhneLaufzeit(id) {
  try {
    const menge = ladeOhneLaufzeit();
    menge.add(id);
    window.localStorage.setItem(OHNE_LAUFZEIT_SCHLUESSEL, JSON.stringify([...menge]));
  } catch (e) {}
}

function vergissOhneLaufzeit(id) {
  try {
    const menge = ladeOhneLaufzeit();
    if (!menge.delete(id)) return;
    window.localStorage.setItem(OHNE_LAUFZEIT_SCHLUESSEL, JSON.stringify([...menge]));
  } catch (e) {}
}

function vergissAlleOhneLaufzeit() {
  try {
    window.localStorage.removeItem(OHNE_LAUFZEIT_SCHLUESSEL);
  } catch (e) {}
}

/* Angaben zum Werk gibt es nur bei Film, Serie und Anime. */
function unterstuetztAngaben(category) {
  return category !== "game";
}

/** Fehlt an einem Eintrag noch eine der drei Angaben? */
function angabenUnvollstaendig(entry) {
  return entry.releaseYear == null || !entry.director || entry.imdbRating == null;
}

/**
 * Fehlen die Zusatzdaten? Massgeblich ist allein das Genre: Es gibt es
 * bei jedem Werk. Filmreihe und Studio kommen im selben Abruf mit —
 * dass ein Film zu keiner Reihe gehoert, ist der Normalfall und kein
 * Grund, ihn immer wieder abzufragen.
 */
function genreFehlt(entry) {
  return !Array.isArray(entry.genre) || entry.genre.length === 0;
}

/* ------------------------------------------------------------
   Laufzeit

   Bei Filmen die Laufzeit selbst, bei Serien und Anime die Summe ueber
   alle Folgen. Spiele bleiben aussen vor: eine Spieldauer laesst sich
   nicht abrufen.
   ------------------------------------------------------------ */
function unterstuetztLaufzeit(category) {
  return category !== "game";
}

/** Laufzeit eines Eintrags in Minuten — oder null, wenn unbekannt. */
function eintragLaufzeit(entry) {
  const n = entry ? entry.runtimeMinutes : null;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function laufzeitFehlt(entry) {
  return eintragLaufzeit(entry) === null;
}

/**
 * Minuten als Stundenangabe: "42 Stunden". Gerechnet wird auf volle
 * Stunden gerundet — Minuten sind bei Summen dieser Groesse ohne
 * Aussage.
 */
function stundenText(minuten) {
  const stunden = Math.round(minuten / 60);
  if (stunden <= 0) return minuten > 0 ? "unter 1 Stunde" : "0 Stunden";
  return stunden + (stunden === 1 ? " Stunde" : " Stunden");
}

/**
 * Dieselbe Dauer noch einmal in Tagen: "1 Tag 18 Stunden". Unter einem
 * Tag gibt es nichts zu uebersetzen — dann bleibt es bei der
 * Stundenangabe und diese Funktion liefert null.
 */
function tageText(minuten) {
  const stunden = Math.round(minuten / 60);
  if (stunden < 24) return null;

  const tage = Math.floor(stunden / 24);
  const rest = stunden % 24;
  const text = tage + (tage === 1 ? " Tag" : " Tage");
  if (!rest) return text;
  return text + " " + rest + (rest === 1 ? " Stunde" : " Stunden");
}

/** Kurzform fuer die Aufschluesselung: "8 Std." */
function stundenKurz(minuten) {
  return Math.round(minuten / 60) + " Std.";
}

/* ------------------------------------------------------------
   Watchlist

   Ein Eintrag ist entweder vorgemerkt oder bewertet, nie beides. Das
   Merkmal steht am Eintrag selbst; vorgemerkte tauchen in keiner
   Rangliste und in keiner Statistik auf.
   ------------------------------------------------------------ */
function istVorgemerkt(entry) {
  return entry && entry.watchlist === true;
}

/* Bei Spielen heisst die Merkliste "Backlog" — der uebliche Begriff fuer
   Spiele, die man noch vor sich hat. Funktion und Daten sind dieselben,
   nur die Beschriftung wechselt. */
function merklisteLabel(category) {
  return category === "game" ? "Backlog" : "Watchlist";
}

/* ------------------------------------------------------------
   Zaehler: wie oft geschaut bzw. gespielt?

   Grenzen und Startwert wie in api/_db.js. Ein bewerteter Eintrag wurde
   mindestens einmal gesehen, deshalb ist 1 zugleich Startwert und
   Untergrenze.
   ------------------------------------------------------------ */
const WATCH_COUNT_MIN = 1;
const WATCH_COUNT_MAX = 9999;

/** Ein Spiel wird gespielt, alles Uebrige geschaut. */
function zaehlerLabel(category) {
  return category === "game" ? "Gespielt" : "Geschaut";
}

function entryWatchCount(entry) {
  const n = entry && entry.watchCount;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(WATCH_COUNT_MIN, Math.round(n)) : WATCH_COUNT_MIN;
}

/** "hinzugefuegt vor X Tagen" — angefangen bei heute. */
function hinzugefuegtVor(zeit) {
  if (!zeit) return "hinzugefügt";
  const tage = Math.floor((Date.now() - zeit) / 86400000);
  if (tage <= 0) return "heute hinzugefügt";
  if (tage === 1) return "gestern hinzugefügt";
  return "hinzugefügt vor " + tage + " Tagen";
}

/* Fassung der Angaben, muss zu ANGABEN_VERSION in api/poster.js passen.
   Sie haengt an jeder Anfrage, damit eine aeltere Antwort aus dem CDN
   nicht faelschlich als "nichts gefunden" durchgeht. */
const ANGABEN_VERSION = 4;

/** Wechselabstand der Kopfbilder. */
const BACKDROP_INTERVAL = 8000;

/**
 * Zieht zufaellig eines der Bilder — nur nie das, das gerade zu sehen
 * ist. Gezogen wird aus den (anzahl - 1) uebrigen und der Index danach
 * um eins angehoben, sobald er den aktuellen erreicht: dadurch hat
 * jedes andere Bild dieselbe Chance und keines erscheint zweimal
 * direkt hintereinander.
 */
function naechsterZufall(anzahl, aktuell) {
  if (anzahl <= 1) return 0;
  const jetzt = ((aktuell % anzahl) + anzahl) % anzahl;
  const gezogen = Math.floor(Math.random() * (anzahl - 1));
  return gezogen >= jetzt ? gezogen + 1 : gezogen;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/* ------------------------------------------------------------
   Poster-Hintergrund hinter Titel und Tab-Leiste.

   Zwei Ebenen: die scheidende gleitet nach links hinaus, die neue
   von rechts herein. Bei prefers-reduced-motion steht das Bild
   still — kein Wechsel, keine Bewegung.
   ------------------------------------------------------------ */
/* ------------------------------------------------------------
   Kopfbereich-Bilder

   Feste Adressen, von Hand im Daten-Panel gepflegt — es gibt dafuer
   keine automatische Suche. Mehrere Bilder wechseln alle 8 Sekunden
   mit derselben Gleit-Animation wie zuvor, dabei jedes Mal zufaellig
   ausgewaehlt (nie zweimal dasselbe hintereinander); bei einem Bild
   steht es fest, bei keinem bleibt der Bereich schlicht dunkel.
   ------------------------------------------------------------ */
function HeaderSlideshow({ urls }) {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState(null);
  const [tick, setTick] = useState(0);
  // Adressen, die sich nicht laden liessen, werden uebersprungen.
  const [kaputt, setKaputt] = useState(() => new Set());

  const brauchbar = urls.filter((u) => !kaputt.has(u));
  const mehrere = brauchbar.length > 1;

  useEffect(() => {
    setIndex(0);
    setPrevIndex(null);
  }, [urls.length]);

  useEffect(() => {
    if (!mehrere || reducedMotion) return;
    const timer = setInterval(() => {
      setIndex((i) => {
        setPrevIndex(i);
        return naechsterZufall(brauchbar.length, i);
      });
      setTick((t) => t + 1);
    }, BACKDROP_INTERVAL);
    return () => clearInterval(timer);
  }, [mehrere, reducedMotion, brauchbar.length]);

  if (!brauchbar.length) return null;

  const aktuell = brauchbar[index % brauchbar.length];
  const vorher = prevIndex === null ? null : brauchbar[prevIndex % brauchbar.length];

  const bild = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "center",
    opacity: 0.9,
  };

  const kaputtMerken = (url) =>
    setKaputt((alt) => (alt.has(url) ? alt : new Set([...alt, url])));

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }} aria-hidden="true">
      {vorher && vorher !== aktuell && !reducedMotion && (
        <img
          key={"weg" + tick}
          src={vorher}
          alt=""
          className="backdrop-layer backdrop-out"
          style={bild}
          onError={() => kaputtMerken(vorher)}
        />
      )}
      <img
        key={"da" + tick}
        src={aktuell}
        alt=""
        className={"backdrop-layer" + (reducedMotion || !mehrere ? "" : " backdrop-in")}
        style={bild}
        onError={() => kaputtMerken(aktuell)}
      />
      {/* Abdunkelung: oben genug Kontrast fuer den Titel, unten weicher
          Uebergang in die Seitenfarbe. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(23,23,26,0.62) 0%, rgba(23,23,26,0.72) 45%, rgba(23,23,26,0.92) 82%, #17171A 100%)",
        }}
      />
    </div>
  );
}

/* ============================================================
   KLEINTEILE
   ============================================================ */
function ScoreBadge({ score, size = "md" }) {
  const big = size === "lg";
  // null = unbewertet (bei Staffeln: Summe der Gewichte ist 0)
  const unbewertet = typeof score !== "number";
  return (
    <span
      title={unbewertet ? "Unbewertet — die Summe der Staffelgewichte ist 0" : undefined}
      style={{
        background: unbewertet ? "#2A2A2E" : scoreToColor(score),
        color: "#faf7f0",
        borderRadius: 4,
        padding: big ? "6px 14px" : "3px 9px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: big ? 20 : 13,
        fontWeight: 700,
        minWidth: big ? 72 : 48,
        textAlign: "center",
        display: "inline-block",
        flexShrink: 0,
      }}
    >
      {unbewertet ? "–" : score.toFixed(2)}
    </span>
  );
}

/* ------------------------------------------------------------
   Poster-Darstellung

   WICHTIG (Ursache des "Poster wird nicht angezeigt"-Fehlers):
   Die Artefakt-Umgebung bereinigt das HTML und blockiert externe
   Bilder in <img>-Tags — das src-Attribut wird entwertet, das
   Bild lädt nie, onError feuert sofort und es blieb immer der
   Buchstaben-Platzhalter stehen.

   Lösung hier:
   1. Die URL wird per JS (new Image()) vorgeladen. Damit wissen
      wir zuverlässig, ob das Bild überhaupt ladbar ist.
   2. Die Anzeige erfolgt als CSS-Hintergrundbild statt als
      <img>-Tag, da CSS nicht durch die HTML-Bereinigung läuft.
   3. Der Zustand wird bei jedem URL-Wechsel zurückgesetzt
      (vorher blieb "broken" für immer hängen — zweiter Bug).
   ------------------------------------------------------------ */
/* ------------------------------------------------------------
   API-Client — spricht ausschließlich mit der eigenen Domain.
   ------------------------------------------------------------ */
const api = {
  async loadAll() {
    const res = await fetch("/api/items");
    if (!res.ok) throw new Error("Laden fehlgeschlagen (" + res.status + ")");
    return res.json();
  },
  async create(item) {
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Anlegen fehlgeschlagen");
    return res.json();
  },
  async update(id, item) {
    const res = await fetch("/api/items?id=" + encodeURIComponent(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Speichern fehlgeschlagen");
    return res.json();
  },
  async remove(id) {
    const res = await fetch("/api/items?id=" + encodeURIComponent(id), { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Löschen fehlgeschlagen");
    return res.json();
  },
  /* Ein Aufruf liefert alles, was automatisch ermittelt wird: Poster,
     Breitbild und — ausser bei Spielen — Jahr, Regie und IMDb-Note. */
  async findMedia(title, category) {
    const res = await fetch(
      "/api/poster?title=" + encodeURIComponent(title) +
        "&category=" + encodeURIComponent(category) +
        "&v=" + ANGABEN_VERSION
    );
    if (!res.ok) return null;
    return res.json();
  },
  /* Mehrere Treffer zur Auswahl — fuer das Anlegen neuer Eintraege.
     Anders als findMedia, das genau einen bestmoeglichen liefert. */
  async searchTitles(title, category) {
    const res = await fetch(
      "/api/search?title=" + encodeURIComponent(title) + "&category=" + encodeURIComponent(category)
    );
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Suche fehlgeschlagen");
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  },
  /* Vorschlaege auf Grundlage des eigenen Geschmacksprofils. Es geht als
     JSON im Abfrageteil mit — dafuer ist es klein genug, und ein GET ist
     genau der Weg, auf dem dieser Abschnitt schon vorher lief. Geliefert
     werden Treffer in derselben Form wie bei der Titelsuche, ergaenzt um
     eine kurze Begruendung, sodass "+ Watchlist" unveraendert damit
     arbeitet. */
  async loadRecommendations(category, profil) {
    const res = await fetch(
      "/api/recommendations?category=" + encodeURIComponent(category) +
        "&profil=" + encodeURIComponent(JSON.stringify(profil))
    );
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Empfehlungen fehlgeschlagen");
    const data = await res.json();
    return {
      results: Array.isArray(data.results) ? data.results : [],
      hinweis: typeof data.hinweis === "string" ? data.hinweis : "",
    };
  },
  async loadHeaderImages() {
    const res = await fetch("/api/header-images");
    if (!res.ok) throw new Error("Kopfbilder konnten nicht geladen werden (" + res.status + ")");
    const data = await res.json();
    return Array.isArray(data.images) ? data.images : [];
  },
  async addHeaderImage(url) {
    const res = await fetch("/api/header-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Hinzufügen fehlgeschlagen");
    return res.json();
  },
  async removeHeaderImage(id) {
    const res = await fetch("/api/header-images?id=" + encodeURIComponent(id), { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Löschen fehlgeschlagen");
    return res.json();
  },
};

/* Farbiger Platzhalter aus dem Titel, falls kein Poster vorhanden ist. */
function placeholderStyle(title) {
  let hash = 0;
  const t = String(title || "?");
  for (let i = 0; i < t.length; i++) hash = (hash * 31 + t.charCodeAt(i)) % 360;
  return {
    background: "linear-gradient(150deg, hsl(" + hash + ",22%,26%) 0%, hsl(" + ((hash + 40) % 360) + ",18%,15%) 100%)",
    color: "rgba(237,234,227,0.72)",
  };
}

function initialsOf(title) {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

/* Poster: hier ganz normales <img>. Auf einer eigenen Domain gibt es
   die Sandbox-Beschränkung der Artefakt-Umgebung nicht mehr. */
function Poster({ url, title, size = 44 }) {
  const clean = typeof url === "string" ? url.trim() : "";
  const usable = clean && isLikelyUrl(clean);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false); // Zustand bei URL-Wechsel zurücksetzen
  }, [clean]);

  const h = Math.round(size * 1.42);
  const base = {
    width: size, height: h, borderRadius: 5, flexShrink: 0,
    border: "1px solid #2A2A2E", boxSizing: "border-box",
  };

  if (usable && !broken) {
    return (
      <img
        src={clean}
        alt={title}
        loading="lazy"
        onError={() => setBroken(true)}
        style={{ ...base, objectFit: "cover", backgroundColor: "#141416", display: "block" }}
      />
    );
  }

  return (
    <div
      title={title}
      style={{
        ...base,
        ...placeholderStyle(title),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Playfair Display', serif",
        fontSize: Math.max(11, size * 0.34), fontWeight: 700, letterSpacing: 0.5,
      }}
    >
      {initialsOf(title)}
    </div>
  );
}

function Slider({ label, weightLabel, hint, value, onChange }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14.5 }}>
          {label}
          {weightLabel && (
            <span style={{ color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, marginLeft: 8 }}>
              {weightLabel}
            </span>
          )}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: "var(--accent, #C9A227)", fontWeight: 700 }}>
          {typeof value === "number" ? value.toFixed(1) : "–"}
        </span>
      </div>
      {hint && <div style={{ fontSize: 12, color: "#77746c", marginBottom: 8, marginTop: 2 }}>{hint}</div>}
      <input
        type="range"
        min="0"
        max="10"
        step="0.1"
        value={typeof value === "number" ? value : 5}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", height: 32, accentColor: "var(--accent, #C9A227)", touchAction: "pan-y" }}
      />
    </div>
  );
}

/* Eingabe der Staffelgewichtung in Prozent (0–200 in 5er-Schritten).
   Waehrend des Tippens bleibt stehen, was eingegeben wurde; auf einen
   ganzen 5-Prozent-Schritt gerundet wird erst beim Verlassen des
   Feldes — sonst spraenge die Zahl schon beim zweiten Zeichen. */
function GewichtungsEingabe({ prozent, onChange }) {
  const [text, setText] = useState(String(prozent));

  // Aendert sich der Wert von aussen, zieht die Anzeige nach —
  // waehrend des Tippens bleibt sie unberuehrt.
  useEffect(() => {
    setText((t) => (parseFloat(t) === prozent ? t : String(prozent)));
  }, [prozent]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <input
        type="number"
        inputMode="numeric"
        aria-label="Gewichtung in Prozent"
        min={SEASON_PERCENT_MIN}
        max={SEASON_PERCENT_MAX}
        step={SEASON_PERCENT_STEP}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const roh = parseFloat(e.target.value);
          if (Number.isNaN(roh)) return;
          onChange(Math.min(SEASON_PERCENT_MAX, Math.max(SEASON_PERCENT_MIN, roh)));
        }}
        onBlur={() => {
          const roh = parseFloat(text);
          const fertig = Number.isNaN(roh)
            ? SEASON_PERCENT_DEFAULT
            : weightToPercent(percentToWeight(roh));
          setText(String(fertig));
          onChange(fertig);
        }}
        style={{
          width: 84, boxSizing: "border-box", background: "#141416",
          border: "1px solid #33333a", borderRadius: 8, padding: "10px 12px",
          color: "#EDEAE3", fontSize: 15, textAlign: "center",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      />
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: "#9A968C" }}>%</span>
    </div>
  );
}

/* Eingabefeld fuer eine neue Kopfbild-Adresse. Eigener Zustand, damit
   das Tippen nicht bei jedem Zeichen die ganze App neu rendert. */
function HeaderBildFormular({ onAdd, busy }) {
  const [wert, setWert] = useState("");

  async function absenden() {
    const url = wert.trim();
    if (!url) return;
    const ok = await onAdd(url);
    if (ok) setWert("");
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input
        type="url"
        inputMode="url"
        placeholder="https://..."
        value={wert}
        onChange={(e) => setWert(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") absenden(); }}
        style={{
          flex: "1 1 auto", minWidth: 0, background: "#141416", border: "1px solid #33333a",
          borderRadius: 8, padding: "11px 12px", color: "#EDEAE3", fontSize: 14, boxSizing: "border-box",
        }}
      />
      <button
        onClick={absenden}
        disabled={busy || !wert.trim()}
        style={{
          flex: "0 0 auto", padding: "0 16px", borderRadius: 8, fontSize: 13.5, fontWeight: 700,
          background: wert.trim() ? "var(--accent, #C9A227)" : "#2A2A2E",
          color: wert.trim() ? "#17171A" : "#77746c",
          border: "none", cursor: wert.trim() ? "pointer" : "default",
        }}
      >
        Hinzufügen
      </button>
    </div>
  );
}

/* Linkstil im Quellenhinweis des Daten-Panels. */
const quellenLink = { color: "var(--accent, #C9A227)", textDecoration: "none" };

/* Symbolknopf der Suchzeile: feste Breite, damit die Zeile nie
   umbricht oder ueber den Bildschirmrand laeuft. */
function IconButton({ title, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        flex: "0 0 auto",
        width: 46,
        padding: 0,
        background: active ? "var(--accent, #C9A227)" : "#1D1D21",
        border: "1px solid " + (active ? "var(--accent, #C9A227)" : "#2A2A2E"),
        borderRadius: 8,
        color: active ? "#17171A" : "#9A968C",
        cursor: "pointer",
        fontSize: 16,
        lineHeight: 1,
        fontWeight: active ? 700 : 400,
      }}
    >
      {label}
    </button>
  );
}

function BottomSheet({ title, onClose, children }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: "14px 14px 0 0",
          padding: 22, width: "100%", maxWidth: 520, boxSizing: "border-box",
          maxHeight: "85vh", overflowY: "auto", WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ width: 36, height: 4, background: "#33333a", borderRadius: 2, margin: "0 auto 16px" }} />
        {title && <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 16px" }}>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({ title, text, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <BottomSheet title={title} onClose={onCancel}>
      <p style={{ color: "#9A968C", fontSize: 14.5, lineHeight: 1.5, margin: "0 0 20px" }}>{text}</p>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onCancel}
          style={{ flex: 1, padding: "14px", background: "transparent", color: "#9A968C", border: "1px solid #33333a", borderRadius: 8, fontSize: 15, cursor: "pointer" }}
        >
          Abbrechen
        </button>
        <button
          onClick={onConfirm}
          style={{
            flex: 1, padding: "14px", background: danger ? "#DC2626" : "var(--accent, #C9A227)",
            color: danger ? "#faf7f0" : "#17171A", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer",
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ============================================================
   FILTER-BOTTOM-SHEET (Sortierung, Bewertungsbereich, Zusatzfilter)
   ============================================================ */
/* Sortierung hat einen eigenen Knopf und damit ein eigenes Sheet.
   Die Sortierlogik selbst ist unveraendert — gesetzt wird weiterhin
   nur filterState.sort. */
function SortSheet({ initial, onApply, onClose }) {
  return (
    <BottomSheet title="Sortieren" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
        {SORT_OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => { onApply({ ...initial, sort: o.key }); onClose(); }}
            style={{
              textAlign: "left", padding: "13px 14px", borderRadius: 8, fontSize: 14, cursor: "pointer",
              background: initial.sort === o.key ? "var(--accent, #C9A227)" : "#141416",
              color: initial.sort === o.key ? "#17171A" : "#EDEAE3",
              border: "1px solid " + (initial.sort === o.key ? "var(--accent, #C9A227)" : "#2A2A2E"),
              fontWeight: initial.sort === o.key ? 700 : 400,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

/* Beschriftung eines Abschnitts im Filter-Sheet — derselbe Stil wie
   die bereits vorhandene Ueberschrift "BEWERTUNGSBEREICH". */
const filterAbschnitt = {
  fontSize: 12, letterSpacing: 1, color: "#9A968C",
  fontFamily: "'JetBrains Mono', monospace", marginBottom: 10,
};

/* Ein Auswahlknopf im Filter-Sheet — dieselbe Form wie die
   Notenbereich-Knoepfe darueber. */
function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "8px 12px", borderRadius: 6, fontSize: 12.5, cursor: "pointer",
        background: active ? "var(--accent, #C9A227)" : "transparent",
        color: active ? "#17171A" : "#9A968C",
        border: "1px solid " + (active ? "var(--accent, #C9A227)" : "#33333a"),
        fontWeight: active ? 700 : 400,
      }}
    >
      {label}
    </button>
  );
}

/* Lange Listen (Regie, Filmreihe) waeren als Knopfreihe unuebersichtlich
   — sie bekommen ein Auswahlfeld im Stil der uebrigen Eingaben. */
function FilterAuswahl({ label, wert, optionen, alleLabel, onChange }) {
  if (!optionen.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={filterAbschnitt}>{label}</div>
      <select
        value={wert}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box", background: "#141416",
          border: "1px solid " + (wert ? "var(--accent, #C9A227)" : "#33333a"),
          borderRadius: 8, padding: "12px", color: "#EDEAE3", fontSize: 14.5,
          cursor: "pointer",
        }}
      >
        <option value="">{alleLabel}</option>
        {optionen.map((o) => (
          <option key={o.wert} value={o.wert}>
            {o.label} ({o.anzahl})
          </option>
        ))}
      </select>
    </div>
  );
}

function FilterSheet({ initial, totalCount, allInCategory, category, onApply, onClose }) {
  const [min, setMin] = useState(initial.min);
  const [max, setMax] = useState(initial.max);
  const [genre, setGenre] = useState(initial.genre);
  const [jahrzehnt, setJahrzehnt] = useState(initial.jahrzehnt);
  const [regie, setRegie] = useState(initial.regie);
  const [reihe, setReihe] = useState(initial.reihe);

  const optionen = useMemo(
    () => filterOptionen(allInCategory, category),
    [allInCategory, category]
  );

  const entwurf = { genre, jahrzehnt, regie, reihe };

  const previewCount = useMemo(() => {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return allInCategory.filter(
      (f) => typeof f.score === "number" && f.score >= lo && f.score <= hi && passtZuFiltern(f, entwurf)
    ).length;
  }, [min, max, allInCategory, genre, jahrzehnt, regie, reihe]);

  function applyPreset(p) {
    setMin(p.min);
    setMax(p.max);
  }

  /* Ein zweiter Klick auf denselben Knopf hebt die Auswahl wieder auf —
     das erspart einen eigenen "alle"-Knopf je Abschnitt. */
  const umschalten = (setzen, aktuell) => (wert) => setzen(aktuell === wert ? "" : wert);

  function handleApply() {
    // sort bleibt, wie es ist — dafuer gibt es das Sortier-Sheet.
    onApply({
      sort: initial.sort,
      min: Math.min(min, max),
      max: Math.max(min, max),
      genre, jahrzehnt, regie, reihe,
    });
  }

  function handleReset() {
    setMin(DEFAULT_FILTER.min);
    setMax(DEFAULT_FILTER.max);
    setGenre("");
    setJahrzehnt("");
    setRegie("");
    setReihe("");
    onApply({ ...DEFAULT_FILTER, sort: initial.sort });
  }

  return (
    <BottomSheet title="Filter" onClose={onClose}>
      <div style={filterAbschnitt}>BEWERTUNGSBEREICH</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {SCORE_PRESETS.map((p) => (
          <FilterChip
            key={p.key}
            label={p.label}
            active={min === p.min && max === p.max}
            onClick={() => applyPreset(p)}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11.5, color: "#9A968C" }}>Mindestnote</label>
          <input
            type="number" min="0" max="10" step="0.1" value={min}
            onChange={(e) => setMin(Math.max(0, Math.min(10, parseFloat(e.target.value) || 0)))}
            style={{ width: "100%", boxSizing: "border-box", background: "#141416", border: "1px solid #33333a", borderRadius: 8, padding: "12px", color: "#EDEAE3", fontSize: 15, marginTop: 4 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11.5, color: "#9A968C" }}>Höchstnote</label>
          <input
            type="number" min="0" max="10" step="0.1" value={max}
            onChange={(e) => setMax(Math.max(0, Math.min(10, parseFloat(e.target.value) || 0)))}
            style={{ width: "100%", boxSizing: "border-box", background: "#141416", border: "1px solid #33333a", borderRadius: 8, padding: "12px", color: "#EDEAE3", fontSize: 15, marginTop: 4 }}
          />
        </div>
      </div>

      {optionen.genres.length > 0 && (
        <>
          <div style={filterAbschnitt}>GENRE</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {optionen.genres.map((g) => (
              <FilterChip
                key={g.wert}
                label={g.label}
                active={genre === g.wert}
                onClick={() => umschalten(setGenre, genre)(g.wert)}
              />
            ))}
          </div>
        </>
      )}

      {optionen.jahrzehnte.length > 0 && (
        <>
          <div style={filterAbschnitt}>JAHRZEHNT</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {optionen.jahrzehnte.map((j) => (
              <FilterChip
                key={j.wert}
                label={j.label}
                active={jahrzehnt === j.wert}
                onClick={() => umschalten(setJahrzehnt, jahrzehnt)(j.wert)}
              />
            ))}
          </div>
        </>
      )}

      <FilterAuswahl
        label="REGIE"
        wert={regie}
        optionen={optionen.regie}
        alleLabel="Alle"
        onChange={setRegie}
      />

      <FilterAuswahl
        label="FILMREIHE / FRANCHISE"
        wert={reihe}
        optionen={optionen.reihen}
        alleLabel="Alle"
        onChange={setReihe}
      />

      {category === "movie" && optionen.reihen.length > 0 && (
        <div style={{ fontSize: 11, color: "#77746c", lineHeight: 1.5, marginTop: -8, marginBottom: 16 }}>
          Reihen stammen aus der Filmreihe bei TMDB. Übergreifende
          Franchises ohne eigene Reihe (etwa das MCU) stehen ersatzweise
          über ihr Studio zur Wahl — das ist eine Näherung, kein exakter
          Franchise-Filter.
        </div>
      )}

      <div style={{ fontSize: 13, color: "#9A968C", marginBottom: 18, textAlign: "center" }}>
        <strong style={{ color: "#EDEAE3" }}>{previewCount}</strong> von {totalCount} Einträgen
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleReset}
          style={{ flex: 1, padding: "14px", background: "transparent", color: "#9A968C", border: "1px solid #33333a", borderRadius: 8, fontSize: 15, cursor: "pointer" }}
        >
          Filter zurücksetzen
        </button>
        <button
          onClick={handleApply}
          style={{ flex: 1, padding: "14px", background: "var(--accent, #C9A227)", color: "#17171A", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer" }}
        >
          Anwenden
        </button>
      </div>
    </BottomSheet>
  );
}

/* ============================================================
   BEWERTUNGSFORMULAR (Neu + Bearbeiten) — für jeden Eintrag identisch
   ============================================================ */
/* ============================================================
   NEUER EINTRAG — Titelsuche mit Trefferliste

   Gesucht wird serverseitig in denselben Quellen, aus denen auch die
   Poster kommen (TMDB, TVMaze, Jikan, SteamGridDB). Je Treffer stehen
   zwei Wege offen: nur vormerken oder gleich bewerten.

   Was keine Quelle kennt, geht trotzdem: unter den Treffern steht der
   eingegebene Titel selbst zur Auswahl — so bleibt das Anlegen von
   Hand moeglich wie bisher.
   ============================================================ */
/* Stabile Kennung eines Treffers: normalisierter Titel und Jahr.
   Bewusst NICHT die Position in der Trefferliste — die zeigt nach einer
   zweiten Suche auf einen voellig anderen Titel, und der Haken „vorgemerkt"
   landete dann beim Falschen. */
function kandidatSchluessel(kandidat) {
  const name = kandidat && typeof kandidat.title === "string" ? kandidat.title.trim().toLowerCase() : "";
  const jahr = kandidat && typeof kandidat.year === "number" ? kandidat.year : "";
  return name + "::" + jahr;
}

function TrefferZeile({ treffer, busy, vorgemerkt, onWatchlist, onBewerten }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #232326" }}>
      <Poster url={treffer.poster} title={treffer.title} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {treffer.title}
        </div>
        {treffer.year && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#77746c", marginTop: 2 }}>
            {treffer.year}
          </div>
        )}
      </div>
      {vorgemerkt ? (
        <span style={{ fontSize: 12.5, color: "#77746c", flexShrink: 0 }}>✓ vorgemerkt</span>
      ) : (
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            onClick={onWatchlist}
            disabled={busy}
            style={{
              padding: "8px 10px", borderRadius: 6, fontSize: 12.5, cursor: "pointer",
              background: "transparent", color: "var(--accent, #C9A227)",
              border: "1px solid var(--accent, #C9A227)", fontWeight: 600, opacity: busy ? 0.5 : 1,
            }}
          >
            + Watchlist
          </button>
          <button
            onClick={onBewerten}
            disabled={busy}
            style={{
              padding: "8px 12px", borderRadius: 6, fontSize: 12.5, cursor: "pointer",
              background: "var(--accent, #C9A227)", color: "#17171A",
              border: "1px solid var(--accent, #C9A227)", fontWeight: 700, opacity: busy ? 0.5 : 1,
            }}
          >
            Bewerten
          </button>
        </div>
      )}
    </div>
  );
}

function NeuerEintrag({ category, categoryLabel, busy, onWatchlist, onBewerten, onCancel }) {
  const [text, setText] = useState("");
  const [treffer, setTreffer] = useState(null); // null = noch nicht gesucht
  const [gesuchtNach, setGesuchtNach] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState("");
  // Was in diesem Durchgang schon vorgemerkt wurde — so laesst sich
  // mehreres hintereinander hinzufuegen, ohne den Ueberblick zu verlieren.
  // Gemerkt wird der Kandidat selbst (Titel + Jahr), nicht seine Position:
  // eine zweite Suche stellt die Liste komplett neu zusammen.
  const [vorgemerkt, setVorgemerkt] = useState(() => new Set());

  async function suchen() {
    const frage = text.trim();
    if (!frage || laeuft) return;
    setLaeuft(true);
    setFehler("");
    try {
      const ergebnis = await api.searchTitles(frage, category);
      setTreffer(ergebnis);
      setGesuchtNach(frage);
    } catch (e) {
      setFehler(e.message);
      setTreffer([]);
      setGesuchtNach(frage);
    } finally {
      setLaeuft(false);
    }
  }

  async function vormerken(kandidat) {
    const ok = await onWatchlist(kandidat);
    if (ok) setVorgemerkt((alt) => new Set(alt).add(kandidatSchluessel(kandidat)));
  }

  const eigener = { title: text.trim(), year: null, poster: "" };

  return (
    <div style={{ background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 12, padding: 20, marginBottom: 28 }}>
      <div style={{ fontSize: 12, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace", marginBottom: 14 }}>
        {categoryLabel.toUpperCase()} · HINZUFÜGEN
      </div>

      <label style={{ fontSize: 12, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace" }}>
        TITEL SUCHEN
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 6, marginBottom: 14 }}>
        <input
          type="text"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") suchen(); }}
          placeholder="Titel eingeben"
          style={{
            flex: "1 1 auto", minWidth: 0, boxSizing: "border-box", background: "#141416",
            border: "1px solid #33333a", borderRadius: 8, padding: "14px 12px",
            color: "#EDEAE3", fontSize: 16,
          }}
        />
        <button
          onClick={suchen}
          disabled={!text.trim() || laeuft}
          style={{
            flex: "0 0 auto", padding: "0 18px", borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: text.trim() ? "var(--accent, #C9A227)" : "#2A2A2E",
            color: text.trim() ? "#17171A" : "#77746c",
            border: "none", cursor: text.trim() ? "pointer" : "default",
          }}
        >
          Suchen
        </button>
      </div>

      {laeuft && <div style={{ fontSize: 13, color: "#9A968C", marginBottom: 10 }}>Wird gesucht…</div>}
      {fehler && <div style={{ color: "#d9736a", fontSize: 12.5, marginBottom: 10 }}>{fehler}</div>}

      {treffer && !laeuft && (
        <>
          {treffer.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "#77746c", lineHeight: 1.5, marginBottom: 6 }}>
              Keine Treffer für „{gesuchtNach}". Du kannst den Titel trotzdem
              unten von Hand übernehmen.
            </div>
          ) : (
            treffer.map((t, i) => (
              <TrefferZeile
                key={t.title + "::" + i}
                treffer={t}
                busy={busy}
                vorgemerkt={vorgemerkt.has(kandidatSchluessel(t))}
                onWatchlist={() => vormerken(t)}
                onBewerten={() => onBewerten(t)}
              />
            ))
          )}

          {/* Eigener Titel: fuer alles, was keine Quelle kennt. */}
          {eigener.title && (
            <div style={{ border: "1px dashed #33333a", borderRadius: 8, padding: 12, marginTop: 14 }}>
              <div style={{ fontSize: 11.5, color: "#77746c", marginBottom: 8, lineHeight: 1.5 }}>
                Nicht dabei? Mit dem eingegebenen Titel anlegen — Poster und
                Angaben werden wie gewohnt automatisch nachgeladen.
              </div>
              <TrefferZeile
                treffer={eigener}
                busy={busy}
                vorgemerkt={vorgemerkt.has(kandidatSchluessel(eigener))}
                onWatchlist={() => vormerken(eigener)}
                onBewerten={() => onBewerten(eigener)}
              />
            </div>
          )}
        </>
      )}

      <button
        onClick={onCancel}
        style={{
          width: "100%", marginTop: 18, padding: "13px", background: "transparent",
          color: "#9A968C", border: "1px solid #33333a", borderRadius: 8,
          cursor: "pointer", fontSize: 15,
        }}
      >
        {vorgemerkt.size ? "Fertig" : "Abbrechen"}
      </button>
    </div>
  );
}

/* ============================================================
   WATCHLIST — vorgemerkt, noch ohne Note
   ============================================================ */
function WatchlistZeile({ eintrag, busy, merkliste, onBewerten, onEntfernen }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid #232326" }}>
      <Poster url={eintrag.poster} title={eintrag.title} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {eintrag.title}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#77746c", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {typeof eintrag.releaseYear === "number" ? eintrag.releaseYear + " · " : ""}
          {hinzugefuegtVor(eintrag.createdAt)}
        </div>
      </div>
      <button
        onClick={onBewerten}
        disabled={busy}
        style={{
          flexShrink: 0, padding: "8px 12px", borderRadius: 6, fontSize: 12.5, cursor: "pointer",
          background: "transparent", color: "var(--accent, #C9A227)",
          border: "1px solid var(--accent, #C9A227)", fontWeight: 600, opacity: busy ? 0.5 : 1,
        }}
      >
        ✓ Ansehen
      </button>
      <button
        onClick={onEntfernen}
        disabled={busy}
        title={"Aus " + (merkliste === "Backlog" ? "dem" : "der") + " " + merkliste + " entfernen"}
        aria-label={eintrag.title + " aus " + (merkliste === "Backlog" ? "dem" : "der") + " " + merkliste + " entfernen"}
        style={{
          flexShrink: 0, background: "transparent", border: "none", color: "#d9736a",
          fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

/* ============================================================
   EMPFEHLUNGEN — Vorschlaege aus dem eigenen Geschmacksprofil

   Nicht mehr "aehnliche Titel zu X": Aus den bestbewerteten Eintraegen
   entsteht ein Profil — welche Genres, welche Regie/Studios und welche
   Jahrzehnte ueberdurchschnittlich gut abschneiden —, und mit diesem
   Profil werden die Entdecken-Endpunkte der Quellen abgefragt. Das
   ergibt einen viel groesseren und passenderen Kandidatenpool; bei
   Anime lief der alte Weg regelmaessig ganz leer.

   Was das Profil gewichtet und wie die Kandidaten sortiert werden,
   steht in api/recommendations.js. Hier wird es nur gebaut, angezeigt
   und zwischengespeichert.

   Bei Spielen erscheint dieser Abschnitt gar nicht, deshalb steht hier
   nirgends "Backlog".
   ============================================================ */

/* So viele Bestbewertete bilden die Grundlage des Profils — nach
   Endnote sortiert. */
const PROFIL_BASIS = { movie: 50, series: 20, anime: 20 };

/* So viele Vorschlaege stehen am Ende in der Liste. Der Server liefert
   deutlich mehr (rund 40) — der Rest ist Vorrat und rueckt nach, sobald
   ein Vorschlag auf der Watchlist landet. */
const EMPFEHLUNGEN_SICHTBAR = { movie: 15, series: 10, anime: 10 };

/* Vorschlaege werden nur etwa einmal im Monat neu berechnet. Der Cache
   liegt im localStorage und ueberdauert damit auch das Schliessen der
   Seite — jede Neuberechnung kostet ein gutes Dutzend externer Aufrufe.

   Kam nichts zurueck, wird frueher wieder gefragt: Ein leeres Ergebnis
   soll sich nicht einen Monat lang festsetzen. */
const EMPFEHLUNGS_SPEICHER = "bewertungsapp.empfehlungen";
const EMPFEHLUNGS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // rund ein Monat
const EMPFEHLUNGS_TTL_LEER_MS = 24 * 60 * 60 * 1000; // ein Tag

function ladeEmpfehlungen(category) {
  try {
    const roh = window.localStorage.getItem(EMPFEHLUNGS_SPEICHER);
    const alles = roh ? JSON.parse(roh) : {};
    const eintrag = alles && alles[category];
    if (!eintrag || typeof eintrag.zeit !== "number" || !Array.isArray(eintrag.vorschlaege)) {
      return null;
    }
    return eintrag;
  } catch (e) {
    return null;
  }
}

function speichereEmpfehlungen(category, eintrag) {
  try {
    const roh = window.localStorage.getItem(EMPFEHLUNGS_SPEICHER);
    const alles = roh ? JSON.parse(roh) : {};
    window.localStorage.setItem(
      EMPFEHLUNGS_SPEICHER,
      JSON.stringify({ ...(alles && typeof alles === "object" ? alles : {}), [category]: eintrag })
    );
  } catch (e) {
    // Ohne localStorage laeuft alles weiter, nur ohne Monatsgedaechtnis.
  }
}

/* Fassung der gespeicherten Vorschlaege. Sie zaehlt hoch, wenn ein
   Stand aus einer aelteren Fassung nicht mehr taugt — hier, weil den
   damals gespeicherten Vorschlaegen die Schreibweisen fehlen, ohne die
   sich bereits Bewertetes nicht zuverlaessig aussortieren laesst. Ein
   alter Stand wird dadurch einmal verworfen; am Monatsrhythmus selbst
   aendert das nichts. */
const EMPFEHLUNGS_FASSUNG = 2;

/**
 * Ist der gespeicherte Stand noch gueltig?
 *
 * Zwei Ausnahmen vom Monat. `hatGenres`: Genres werden nach und nach
 * nachgeladen, und ein Stand, der ohne sie zustande kam, beruht auf
 * einem halben Profil. Und `fassung`: Ein Stand aus einer aelteren
 * Fassung der App wird einmal verworfen. Danach gilt wieder der Monat.
 */
function empfehlungenFrisch(eintrag, profilHatGenres) {
  if (!eintrag) return false;
  if (eintrag.fassung !== EMPFEHLUNGS_FASSUNG) return false;
  if (profilHatGenres && !eintrag.hatGenres) return false;
  const frist = eintrag.vorschlaege.length ? EMPFEHLUNGS_TTL_MS : EMPFEHLUNGS_TTL_LEER_MS;
  return Date.now() - eintrag.zeit < frist;
}

/* ------------------------------------------------------------
   Das Geschmacksprofil

   Fuer jede Eigenschaft (ein Genre, ein Regisseur, ein Jahrzehnt) wird
   aufsummiert, wie weit die Eintraege, die sie tragen, ueber dem
   Durchschnitt der Kategorie liegen. Ein Genre, das haeufig UND mit
   hohen Noten vorkommt, sammelt dadurch das meiste Gewicht; eines, das
   nur mittelmaessig abschneidet, faellt heraus.

   Am Ende wird auf den staerksten Wert normiert — das Gewicht sagt also
   "wie stark im Vergleich zum Lieblingsgenre", nicht "wie viele Noten
   ueber dem Schnitt". Das haelt die Zahlen unabhaengig von der Groesse
   der Sammlung.
   ------------------------------------------------------------ */

/* Wie oft eine Eigenschaft mindestens vorkommen muss, um zu zaehlen.
   Ein einzelner Film sagt ueber den Geschmack fuer einen Regisseur
   nichts aus — Genres wiederholen sich dagegen von selbst. */
const PROFIL_MINDEST = { genres: 2, regie: 2, studios: 2, jahrzehnte: 3 };

/* So viele Eigenschaften je Art gehen ins Profil. Jede kostet
   serverseitig eigene Abfragen. */
const PROFIL_MAX = { genres: 4, regie: 2, studios: 1, jahrzehnte: 2 };

/**
 * Eine Art von Eigenschaft auswerten.
 *
 * `eintraege` ist eine Liste aus { werte: [...], note }. Zurueck kommen
 * die staerksten Werte mit einem Gewicht zwischen 0 und 1.
 */
function profilTeil(eintraege, basis, mindestAnzahl, maxAnzahl) {
  const tabelle = new Map();
  for (const { werte, note } of eintraege) {
    // Ein Eintrag zaehlt je Wert genau einmal, auch wenn dasselbe Genre
    // doppelt in seiner Liste steht.
    for (const wert of new Set(werte)) {
      if (!wert) continue;
      const e = tabelle.get(wert) || { anzahl: 0, summe: 0 };
      e.anzahl++;
      e.summe += note - basis;
      tabelle.set(wert, e);
    }
  }

  const haeufigGenug = [...tabelle.entries()].filter(([, e]) => e.anzahl >= mindestAnzahl);

  let kandidaten = haeufigGenug
    .filter(([, e]) => e.summe > 0)
    .map(([name, e]) => ({ name, gewicht: e.summe, anzahl: e.anzahl }));

  /* Gibt der Ueberdurchschnitt nichts her — etwa weil die Sammlung noch
     klein ist und alle Noten dicht beieinander liegen —, entscheidet
     ersatzweise die Haeufigkeit. Sonst bliebe das Profil leer und es
     gaebe gar keine Vorschlaege. */
  if (!kandidaten.length) {
    kandidaten = haeufigGenug.map(([name, e]) => ({ name, gewicht: e.anzahl, anzahl: e.anzahl }));
  }

  kandidaten.sort((a, b) => b.gewicht - a.gewicht || b.anzahl - a.anzahl);
  const beste = kandidaten.slice(0, maxAnzahl);
  const staerkstes = beste.length ? beste[0].gewicht : 0;

  return beste.map((k) => ({
    name: k.name,
    gewicht: staerkstes > 0 ? Math.max(0.05, Math.round((k.gewicht / staerkstes) * 100) / 100) : 1,
  }));
}

/**
 * Das Profil einer Kategorie.
 *
 * `bestbewertet` sind die Grundlage (die Besten nach Endnote),
 * `basisNote` der Durchschnitt ueber ALLE bewerteten Eintraege der
 * Kategorie — daran misst sich "ueberdurchschnittlich".
 */
function geschmacksProfil(bestbewertet, basisNote, category) {
  const mit = (auswahl) =>
    bestbewertet.map((f) => ({ werte: auswahl(f), note: f.score }));

  return {
    genres: profilTeil(
      mit((f) => f.genre || []),
      basisNote, PROFIL_MINDEST.genres, PROFIL_MAX.genres
    ),
    regie: profilTeil(
      mit((f) => (f.director ? [f.director] : [])),
      basisNote, PROFIL_MINDEST.regie, PROFIL_MAX.regie
    ),
    // Studios sind nur bei Filmen hinterlegt.
    studios:
      category === "movie"
        ? profilTeil(
            mit((f) => (f.studio ? [f.studio] : [])),
            basisNote, PROFIL_MINDEST.studios, PROFIL_MAX.studios
          )
        : [],
    jahrzehnte: profilTeil(
      mit((f) => {
        const jz = jahrzehntVon(f);
        return jz ? [String(jz)] : [];
      }),
      basisNote, PROFIL_MINDEST.jahrzehnte, PROFIL_MAX.jahrzehnte
    ),
  };
}

function profilLeer(profil) {
  return (
    !profil ||
    (!profil.genres.length && !profil.regie.length && !profil.studios.length && !profil.jahrzehnte.length)
  );
}

/* Titelvergleich fuers Aussortieren. Bewusst ohne Jahr: Die Quellen
   liefern es nicht immer mit (Jikan etwa nie), und derselbe Titel ist
   auch ohne Jahresangabe derselbe Titel.

   Das gilt auch fuer ein Jahr, das IM Titel steht. In der Sammlung
   heisst der Film "Spider-Man 2 (2004)", TMDB nennt ihn "Spider-Man 2"
   — ohne diesen Schritt gelten die beiden als verschiedene Werke und
   der laengst bewertete Film taucht als Vorschlag wieder auf. Entfernt
   wird nur ein eingeklammertes Jahr; eine Jahreszahl, die zum Titel
   selbst gehoert, bleibt stehen ("Blade Runner 2049" ist nicht
   "Blade Runner"). */
function titelSchluessel(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Akzente entfernen: é -> e
    .replace(/[([]\s*(?:19|20)\d{2}\s*[)\]]/g, " ") // "(2004)" ist keine Titelangabe
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Alle Schreibweisen eines Vorschlags als Vergleichsschluessel.
 *
 * Der Server schickt zu jedem Vorschlag die Namen mit, unter denen die
 * Quelle das Werk fuehrt — deutscher und Originaltitel bei TMDB, dazu
 * die englische und japanische Schreibweise bei Jikan. Verglichen wird
 * gegen alle: Die Sammlung fuehrt "Captain America: The Winter
 * Soldier", TMDB antwortet auf Deutsch mit "The Return of the First
 * Avenger" — nur ueber den Originaltitel ist das als dasselbe Werk zu
 * erkennen.
 *
 * Aeltere Vorschlaege aus dem Speicher haben das Feld noch nicht; dann
 * bleibt es beim Anzeigetitel allein.
 */
function vorschlagSchluessel(vorschlag) {
  const namen = Array.isArray(vorschlag.titel) && vorschlag.titel.length
    ? vorschlag.titel
    : [vorschlag.title];
  const schluessel = [];
  for (const name of namen) {
    const s = titelSchluessel(name);
    if (s && !schluessel.includes(s)) schluessel.push(s);
  }
  return schluessel;
}

/**
 * Die Vorschlaege, die uebrig bleiben.
 *
 * Was schon bewertet oder vorgemerkt ist, faellt weg — erkannt ueber
 * JEDE Schreibweise, nicht nur ueber den Anzeigetitel. Ausgenommen ist,
 * was gerade eben in diesem Durchgang vorgemerkt wurde: Diese Zeilen
 * bleiben mit dem Haken stehen, genau wie in der Titelsuche. Wuerden
 * sie sofort verschwinden, spraenge die Liste bei jedem Klick und man
 * saehe nie eine Bestaetigung.
 */
function sichtbareVorschlaege(vorschlaege, bekannt, vorgemerkt, grenze) {
  const raus = [];
  for (const v of vorschlaege) {
    if (!v || !v.title) continue;
    const schluessel = vorschlagSchluessel(v);
    if (!schluessel.some((s) => vorgemerkt.has(s)) && schluessel.some((s) => bekannt.has(s))) {
      continue;
    }
    raus.push(v);
    if (raus.length >= grenze) break;
  }
  return raus;
}

function EmpfehlungsZeile({ vorschlag, busy, vorgemerkt, onWatchlist }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #232326" }}>
      <Poster url={vorschlag.poster} title={vorschlag.title} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {vorschlag.title}
        </div>
        {/* Jahr und Begruendung stehen in derselben schmalen Zeile wie
            die uebrigen Meta-Angaben in den Listen. Die Begruendung darf
            umbrechen — sie ist der Grund, warum der Titel hier steht. */}
        {(vorschlag.year || vorschlag.begruendung) && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#77746c", marginTop: 2, lineHeight: 1.45 }}>
            {vorschlag.year ? String(vorschlag.year) : ""}
            {vorschlag.year && vorschlag.begruendung ? " · " : ""}
            {vorschlag.begruendung || ""}
          </div>
        )}
      </div>
      {vorgemerkt ? (
        <span style={{ fontSize: 12.5, color: "#77746c", flexShrink: 0 }}>✓ vorgemerkt</span>
      ) : (
        <button
          onClick={onWatchlist}
          disabled={busy}
          style={{
            flexShrink: 0, padding: "8px 10px", borderRadius: 6, fontSize: 12.5, cursor: "pointer",
            background: "transparent", color: "var(--accent, #C9A227)",
            border: "1px solid var(--accent, #C9A227)", fontWeight: 600, opacity: busy ? 0.5 : 1,
          }}
        >
          + Watchlist
        </button>
      )}
    </div>
  );
}

function Empfehlungen({ category, profil, bekannt, busy, onWatchlist }) {
  const [zustand, setZustand] = useState({ laeuft: false, vorschlaege: [], hinweis: "", fehler: "" });
  // Was in diesem Durchgang vorgemerkt wurde — dieselbe Kennung wie in
  // der Titelsuche, damit der Haken am Titel haengt und nicht an der
  // Position in der Liste.
  const [vorgemerkt, setVorgemerkt] = useState(() => new Set());

  const hatProfil = !profilLeer(profil);
  const hatGenres = !!(profil && profil.genres.length);
  /* Das Profil aendert sich mit jeder neuen Bewertung. Es taugt deshalb
     nicht als Ausloeser fuer eine Neuberechnung — die entscheidet
     allein das Alter des gespeicherten Standes. Als Abhaengigkeit
     dienen nur die beiden groben Fragen: Gibt es ueberhaupt ein Profil,
     und trägt es inzwischen Genres? */
  const profilRef = useRef(profil);
  profilRef.current = profil;

  useEffect(() => {
    if (!hatProfil) {
      setZustand({ laeuft: false, vorschlaege: [], hinweis: "", fehler: "" });
      return;
    }

    const gespeichert = ladeEmpfehlungen(category);
    if (empfehlungenFrisch(gespeichert, hatGenres)) {
      setZustand({
        laeuft: false,
        vorschlaege: gespeichert.vorschlaege,
        hinweis: gespeichert.hinweis || "",
        fehler: "",
      });
      return;
    }

    let abgebrochen = false;
    setZustand({ laeuft: true, vorschlaege: [], hinweis: "", fehler: "" });
    (async () => {
      try {
        const { results, hinweis } = await api.loadRecommendations(category, profilRef.current);
        speichereEmpfehlungen(category, {
          zeit: Date.now(), vorschlaege: results, hinweis, hatGenres,
          fassung: EMPFEHLUNGS_FASSUNG,
        });
        if (!abgebrochen) setZustand({ laeuft: false, vorschlaege: results, hinweis, fehler: "" });
      } catch (e) {
        // Erfolglose Versuche landen nicht im Speicher — beim naechsten
        // Oeffnen darf es noch einmal versucht werden.
        if (!abgebrochen) {
          setZustand({ laeuft: false, vorschlaege: [], hinweis: "", fehler: e.message });
        }
      }
    })();
    return () => { abgebrochen = true; };
  }, [category, hatProfil, hatGenres]);

  /* Was schon bewertet oder vorgemerkt ist, ist kein Vorschlag mehr.
     Der Abgleich laeuft hier und nicht auf dem Server: Nur die App
     kennt die Sammlung — und weil der Vorrat weit mehr Kandidaten
     enthaelt als angezeigt werden, rueckt dabei sofort der naechste
     nach, ohne dass ein einziger Aufruf noetig waere.

     Damit die Liste trotz der stehenbleibenden Haken gleich lang
     bleibt, waechst die Grenze um eben diese Zeilen mit — der
     Nachruecker steht also sofort darunter. */
  const sichtbar = useMemo(
    () =>
      sichtbareVorschlaege(
        zustand.vorschlaege,
        bekannt,
        vorgemerkt,
        (EMPFEHLUNGEN_SICHTBAR[category] || 10) + vorgemerkt.size
      ),
    [zustand.vorschlaege, bekannt, vorgemerkt, category]
  );

  if (!hatProfil && !zustand.laeuft) {
    return (
      <EmpfehlungsRahmen>
        <div style={{ fontSize: 12.5, color: "#77746c", lineHeight: 1.5 }}>
          Sobald ein paar Titel bewertet sind, entsteht daraus ein
          Geschmacksprofil — und hier stehen dazu passende Vorschläge.
        </div>
      </EmpfehlungsRahmen>
    );
  }

  return (
    <EmpfehlungsRahmen>
      {zustand.laeuft && (
        <div style={{ fontSize: 13, color: "#9A968C" }}>Vorschläge werden geholt…</div>
      )}
      {!zustand.laeuft && zustand.fehler && (
        <div style={{ color: "#d9736a", fontSize: 12.5 }}>{zustand.fehler}</div>
      )}
      {!zustand.laeuft && !zustand.fehler && zustand.hinweis && (
        <div style={{ fontSize: 12.5, color: "#77746c", lineHeight: 1.5 }}>{zustand.hinweis}</div>
      )}
      {!zustand.laeuft && !zustand.fehler && !zustand.hinweis && sichtbar.length === 0 && (
        <div style={{ fontSize: 12.5, color: "#77746c", lineHeight: 1.5 }}>
          Gerade nichts Neues — was zum Profil passt, hast du schon
          bewertet oder vorgemerkt.
        </div>
      )}
      {!zustand.laeuft &&
        sichtbar.map((v, i) => (
          <EmpfehlungsZeile
            key={titelSchluessel(v.title) + "::" + i}
            vorschlag={v}
            busy={busy}
            vorgemerkt={vorgemerkt.has(titelSchluessel(v.title))}
            onWatchlist={async () => {
              const ok = await onWatchlist(v);
              if (ok) setVorgemerkt((alt) => new Set(alt).add(titelSchluessel(v.title)));
            }}
          />
        ))}
    </EmpfehlungsRahmen>
  );
}

/* Gemeinsamer Rahmen — dieselbe Karte wie beim Hinzufuegen-Block. */
function EmpfehlungsRahmen({ children }) {
  return (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #232326" }}>
      <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
        EMPFEHLUNGEN FÜR DICH
      </div>
      <div style={{ fontSize: 11.5, color: "#77746c", lineHeight: 1.5, marginBottom: 12 }}>
        Aus dem, was du am besten bewertest: Genres, Regie und Jahrzehnte.
      </div>
      {children}
    </div>
  );
}

function RatingForm({ category, categoryLabel, initialTitle, initialPoster, initialValues, initialPersonal, initialSeasons, onSave, onCancel }) {
  const criteria = criteriaFor(category);
  const [title, setTitle] = useState(initialTitle || "");
  const [poster, setPoster] = useState(initialPoster || "");
  const [values, setValues] = useState(initialValues || emptyValues(category));
  const [personal, setPersonal] = useState(typeof initialPersonal === "number" ? initialPersonal : null);
  const [seasons, setSeasons] = useState(initialSeasons && initialSeasons.length ? initialSeasons : []);
  const [offen, setOffen] = useState(null);
  const [touched, setTouched] = useState(false);

  const mitStaffeln = seasons.length > 0;
  const staffelnMoeglich = supportsSeasons(category);

  // Mit Staffeln zaehlt nur noch deren Vollstaendigkeit — der Eintrag
  // selbst wird dann nicht mehr direkt bewertet.
  const staffelnVollstaendig = seasons.every(
    (sn) => isValuesComplete(sn.values, category) && typeof sn.personal === "number"
  );
  const complete =
    title.trim().length > 0 &&
    (mitStaffeln
      ? staffelnVollstaendig
      : isValuesComplete(values, category) && typeof personal === "number");

  const entwurf = { values, personal, seasons };
  const criteriaScore = entryCriteriaScore(entwurf, category);
  const finalScore = complete ? entryScore(entwurf, category) : null;

  /* Die erste Staffel uebernimmt die bisherigen Werte des Eintrags.
     Dadurch aendert sich die Endnote durch das Anlegen nicht. */
  function staffelHinzufuegen() {
    setSeasons((prev) => {
      const nummer = prev.length + 1;
      const neue = prev.length
        ? { seasonNumber: nummer, values: emptyValues(category), personal: null, weight: SEASON_WEIGHT_DEFAULT }
        : seasonFromEntry({ values, personal }, nummer);
      setOffen(prev.length);
      return [...prev, neue];
    });
  }

  function staffelAendern(index, aenderung) {
    setSeasons((prev) => prev.map((sn, i) => (i === index ? { ...sn, ...aenderung } : sn)));
  }

  /* Beim Loeschen der letzten Staffel faellt der Eintrag auf die
     normale Einzelbewertung zurueck und uebernimmt deren Werte. */
  function staffelLoeschen(index) {
    setSeasons((prev) => {
      const rest = prev.filter((_, i) => i !== index);
      if (!rest.length) {
        const letzte = prev[index];
        if (letzte) {
          setValues({ ...letzte.values });
          setPersonal(typeof letzte.personal === "number" ? letzte.personal : null);
        }
      }
      setOffen(null);
      return rest.map((sn, i) => ({ ...sn, seasonNumber: i + 1 }));
    });
  }

  function handleSave() {
    setTouched(true);
    if (!complete) return;

    // Mit Staffeln bekommt der Eintrag die Mittelwerte seiner Staffeln
    // als eigene Werte. So bleibt der Datensatz in sich stimmig und
    // die Werte stehen bereit, falls spaeter alle Staffeln wegfallen.
    let werte = values;
    let bauch = personal;
    if (mitStaffeln) {
      werte = {};
      for (const c of criteria) werte[c.key] = entryCriterionValue(entwurf, c.key);
      bauch = entryPersonal(entwurf);
    }

    onSave({
      title: title.trim(),
      poster: poster.trim(),
      values: werte,
      personal: bauch,
      seasons: seasons.map((sn, i) => ({
        ...sn,
        seasonNumber: i + 1,
        // Auf einen ganzen 5-Prozent-Schritt gerundet in die Datenbank.
        weight: percentToWeight(seasonPercent(sn)),
      })),
    });
  }

  return (
    <div style={{ background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 12, padding: 20, marginBottom: 28 }}>
      <div style={{ fontSize: 12, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace", marginBottom: 14 }}>
        {categoryLabel.toUpperCase()} · BEWERTUNGSFORMULAR
      </div>

      <label style={{ fontSize: 12, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace" }}>
        TITEL
      </label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titel eingeben"
        style={{
          width: "100%", boxSizing: "border-box", background: "#141416", border: "1px solid #33333a",
          borderRadius: 8, padding: "14px 12px", color: "#EDEAE3", fontSize: 16, marginTop: 6, marginBottom: 18,
        }}
      />

      <label style={{ fontSize: 12, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace" }}>
        POSTER-URL (OPTIONAL)
      </label>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 6, marginBottom: 22 }}>
        <input
          type="text"
          value={poster}
          onChange={(e) => setPoster(e.target.value)}
          placeholder="https://..."
          style={{
            flex: 1, boxSizing: "border-box", background: "#141416", border: "1px solid #33333a",
            borderRadius: 8, padding: "14px 12px", color: "#EDEAE3", fontSize: 14,
          }}
        />
        {poster.trim() && <Poster url={poster.trim()} title={title} size={44} />}
      </div>

      {!mitStaffeln && (
        <>
          {criteria.map((c) => (
            <Slider
              key={c.key}
              label={c.label}
              weightLabel={`${Math.round(c.weight * 100)}%`}
              hint={c.hint}
              value={values[c.key]}
              onChange={(v) => setValues((prev) => ({ ...prev, [c.key]: v }))}
            />
          ))}

          <div style={{ marginTop: 6, marginBottom: 4, padding: "16px 14px", background: "#141416", border: "1px dashed var(--accent, #C9A227)", borderRadius: 8 }}>
            <Slider
              label="Bauchgefühl (rein subjektiv)"
              weightLabel="25%"
              hint={`Egal was die ${criteria.length} Kriterien sagen — wie sehr berührt es dich wirklich?`}
              value={personal}
              onChange={setPersonal}
            />
          </div>
        </>
      )}

      {staffelnMoeglich && (
        <div style={{ marginTop: 18, marginBottom: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace" }}>
              STAFFELN (OPTIONAL)
            </span>
            <button
              onClick={staffelHinzufuegen}
              style={{
                padding: "8px 12px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                background: "transparent", color: "var(--accent, #C9A227)",
                border: "1px solid var(--accent, #C9A227)", fontWeight: 600,
              }}
            >
              + Staffel
            </button>
          </div>

          {!mitStaffeln ? (
            <div style={{ fontSize: 11.5, color: "#77746c", lineHeight: 1.5 }}>
              Ohne Staffeln bleibt es bei der Einzelbewertung oben. Die erste
              Staffel übernimmt die dortigen Werte, die Endnote ändert sich
              dadurch nicht.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11.5, color: "#77746c", lineHeight: 1.5, marginBottom: 12 }}>
                Die Endnote ist der nach der Gewichtung gemittelte
                Durchschnitt aller Staffelnoten. Wird die letzte Staffel
                gelöscht, gilt wieder die Einzelbewertung.
              </div>
              {seasons.map((sn, i) => {
                const fertig = isValuesComplete(sn.values, category) && typeof sn.personal === "number";
                const aufgeklappt = offen === i;
                return (
                  <div key={i} style={{ border: "1px solid #2A2A2E", borderRadius: 8, marginBottom: 10, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "#141416" }}>
                      <button
                        onClick={() => setOffen(aufgeklappt ? null : i)}
                        style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", color: "#EDEAE3", fontSize: 14.5, fontWeight: 600, cursor: "pointer", padding: 0 }}
                      >
                        {aufgeklappt ? "▾" : "▸"} Staffel {i + 1}
                        {seasonPercent(sn) !== SEASON_PERCENT_DEFAULT && (
                          <span style={{ color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, marginLeft: 8 }}>
                            {seasonPercent(sn)} %
                          </span>
                        )}
                      </button>
                      {fertig ? (
                        <ScoreBadge score={seasonScore(sn, category)} />
                      ) : (
                        <span style={{ fontSize: 12, color: "#d9736a" }}>unvollständig</span>
                      )}
                      <button
                        onClick={() => staffelLoeschen(i)}
                        title={"Staffel " + (i + 1) + " löschen"}
                        aria-label={"Staffel " + (i + 1) + " löschen"}
                        style={{ background: "transparent", border: "none", color: "#d9736a", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </div>

                    {aufgeklappt && (
                      <div style={{ padding: "14px" }}>
                        {criteria.map((c) => (
                          <Slider
                            key={c.key}
                            label={c.label}
                            weightLabel={`${Math.round(c.weight * 100)}%`}
                            hint={c.hint}
                            value={sn.values[c.key]}
                            onChange={(v) =>
                              staffelAendern(i, { values: { ...sn.values, [c.key]: v } })
                            }
                          />
                        ))}
                        <div style={{ padding: "16px 14px", background: "#141416", border: "1px dashed var(--accent, #C9A227)", borderRadius: 8 }}>
                          <Slider
                            label="Bauchgefühl (rein subjektiv)"
                            weightLabel="25%"
                            hint="Nur für diese Staffel."
                            value={sn.personal}
                            onChange={(v) => staffelAendern(i, { personal: v })}
                          />
                        </div>

                        {/* Gewichtung in Prozent: wie stark diese Staffel in
                            die Endnote eingeht. 100 % = wie alle anderen. */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
                          <label style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>
                            Gewichtung
                            <span style={{ display: "block", fontSize: 11.5, color: "#77746c", fontWeight: 400, marginTop: 2 }}>
                              Anteil an der Endnote · 100 % = normal, 0 % = zählt nicht,
                              200 % = doppelt
                            </span>
                          </label>
                          <GewichtungsEingabe
                            prozent={seasonPercent(sn)}
                            onChange={(p) => staffelAendern(i, { weight: p / 100 })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      <div style={{ fontSize: 13.5, color: "#9A968C", marginTop: 12, lineHeight: 1.8 }}>
        Kriterien-Note:{" "}
        <strong style={{ color: "#EDEAE3" }}>
          {typeof criteriaScore === "number" ? criteriaScore.toFixed(2) : "–"}
        </strong>
        {complete && (
          <>
            {" "}· Endnote (live):{" "}
            <strong style={{ color: "var(--accent, #C9A227)", fontSize: 16 }}>
              {typeof finalScore === "number" ? finalScore.toFixed(2) : "unbewertet"}
            </strong>
          </>
        )}
      </div>

      {touched && !complete && (
        <div style={{ color: "#d9736a", fontSize: 13, marginTop: 10 }}>
          {mitStaffeln
            ? "Bitte Titel eingeben und jede Staffel vollständig bewerten."
            : `Bitte Titel eingeben und alle ${criteria.length + 1} Werte (${criteria.length} Kriterien + Bauchgefühl) setzen.`}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button
          onClick={handleSave}
          style={{
            flex: 1, padding: "15px", background: complete ? "var(--accent, #C9A227)" : "#3a3a3f",
            color: complete ? "#17171A" : "#77746c", border: "none", borderRadius: 8,
            fontWeight: 700, fontSize: 15.5, cursor: "pointer",
          }}
        >
          Speichern{complete && typeof finalScore === "number" ? ` — ${finalScore.toFixed(2)}` : ""}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "15px 18px", background: "transparent", color: "#9A968C",
            border: "1px solid #33333a", borderRadius: 8, cursor: "pointer", fontSize: 15,
          }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   DETAILANSICHT — identisch für jeden Eintrag
   ============================================================ */
/* ------------------------------------------------------------
   Jahr und Regie/Ersteller als schmale Zeile unter einem Listentitel.

   Bewusst kleiner und blasser als der Titel, damit sie ihn nicht
   ueberdeckt. Bei Spielen und ohne Angaben faellt sie ganz weg —
   dann bleibt die Zeile so hoch wie bisher.
   ------------------------------------------------------------ */
function AngabenZeile({ eintrag }) {
  if (!unterstuetztAngaben(eintrag.category)) return null;

  const teile = [];
  if (typeof eintrag.releaseYear === "number") teile.push(String(eintrag.releaseYear));
  if (eintrag.director) teile.push(eintrag.director);
  if (!teile.length) return null;

  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        color: "#77746c",
        marginTop: 2,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {teile.join(" · ")}
    </div>
  );
}

/* Kleiner Stiftknopf — oeffnet die Eingabe der Angaben zum Werk. */
function StiftKnopf({ title, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        background: "transparent", border: "none", color: "#77746c",
        fontSize: 13, cursor: "pointer", padding: "0 4px", lineHeight: 1,
      }}
    >
      ✎
    </button>
  );
}

/* Beschriftung im Eingabeblock — derselbe Stil wie im Bewertungsformular. */
const angabenLabel = {
  fontSize: 12, letterSpacing: 1, color: "#9A968C",
  fontFamily: "'JetBrains Mono', monospace",
};

const angabenFeld = {
  width: "100%", boxSizing: "border-box", background: "#141416",
  border: "1px solid #33333a", borderRadius: 8, padding: "12px",
  color: "#EDEAE3", fontSize: 15, marginTop: 6,
};

/* ------------------------------------------------------------
   Angaben zum Werk von Hand eintragen oder ueberschreiben.

   Gilt fuer Jahr, Regie und die IMDb-Note gemeinsam — sie stehen in
   der Detailansicht beieinander und werden in einem Zug gespeichert.
   Ein leeres Feld loescht den Wert; die automatische Suche traegt
   spaeter nur nach, was leer ist, und ueberschreibt nie.
   ------------------------------------------------------------ */
function AngabenEditor({ entry, regieLabel, busy, onSave, onCancel }) {
  const [jahr, setJahr] = useState(entry.releaseYear == null ? "" : String(entry.releaseYear));
  const [regie, setRegie] = useState(entry.director || "");
  const [note, setNote] = useState(entry.imdbRating == null ? "" : String(entry.imdbRating));

  function speichern() {
    const jahrZahl = parseInt(jahr, 10);
    const noteZahl = parseFloat(String(note).replace(",", "."));
    onSave({
      releaseYear: Number.isNaN(jahrZahl) ? null : jahrZahl,
      director: regie.trim() || null,
      // Die Note liegt wie jede Note zwischen 0 und 10.
      imdbRating: Number.isNaN(noteZahl) ? null : Math.min(10, Math.max(0, noteZahl)),
    });
  }

  return (
    <div style={{ background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ ...angabenLabel, marginBottom: 12 }}>ANGABEN BEARBEITEN</div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ flex: "1 1 110px", minWidth: 0 }}>
          <label style={angabenLabel} htmlFor="angaben-jahr">JAHR</label>
          <input
            id="angaben-jahr"
            type="number"
            inputMode="numeric"
            placeholder="z. B. 1999"
            value={jahr}
            onChange={(e) => setJahr(e.target.value)}
            style={{ ...angabenFeld, fontFamily: "'JetBrains Mono', monospace" }}
          />
        </div>
        <div style={{ flex: "1 1 110px", minWidth: 0 }}>
          <label style={angabenLabel} htmlFor="angaben-imdb">IMDB-NOTE</label>
          <input
            id="angaben-imdb"
            type="number"
            inputMode="decimal"
            min="0"
            max="10"
            step="0.1"
            placeholder="0–10"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ ...angabenFeld, fontFamily: "'JetBrains Mono', monospace" }}
          />
        </div>
      </div>

      <label style={angabenLabel} htmlFor="angaben-regie">{regieLabel.toUpperCase()}</label>
      <input
        id="angaben-regie"
        type="text"
        placeholder="Name eingeben"
        value={regie}
        onChange={(e) => setRegie(e.target.value)}
        style={{ ...angabenFeld, marginBottom: 4 }}
      />

      <div style={{ fontSize: 11.5, color: "#77746c", lineHeight: 1.5, marginTop: 10 }}>
        Leere Felder löschen den jeweiligen Wert. Von Hand eingetragene
        Angaben werden von der automatischen Suche nicht überschrieben.
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          onClick={speichern}
          disabled={busy}
          style={{
            flex: 1, padding: "13px", background: "var(--accent, #C9A227)", color: "#17171A",
            border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          Speichern
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "13px 18px", background: "transparent", color: "#9A968C",
            border: "1px solid #33333a", borderRadius: 8, cursor: "pointer", fontSize: 15,
          }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------
   Zaehler "wie oft geschaut/gespielt" als schmale Meta-Angabe.

   Bewusst im selben Stil wie "Kriterien-Note" und "Bauchgefuehl"
   daneben: gleiche Schriftgroesse, gleiche Farben. Die beiden Knoepfe
   speichern sofort; bei 1 ist "−" abgeschaltet, denn wer bewertet hat,
   hat mindestens einmal gesehen.
   ------------------------------------------------------------ */
function ZaehlerFeld({ label, wert, busy, onChange }) {
  const knopf = (aktiv) => ({
    width: 26, height: 26, lineHeight: 1, padding: 0,
    background: "transparent",
    border: "1px solid " + (aktiv ? "#33333a" : "#232326"),
    borderRadius: 6,
    color: aktiv ? "#9A968C" : "#3a3a40",
    fontSize: 15, cursor: aktiv ? "pointer" : "default",
    fontFamily: "inherit",
  });

  const runter = !busy && wert > WATCH_COUNT_MIN;
  const hoch = !busy && wert < WATCH_COUNT_MAX;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span>{label}:</span>
      <button
        onClick={() => runter && onChange(wert - 1)}
        disabled={!runter}
        title="Einmal weniger"
        aria-label="Einmal weniger"
        style={knopf(runter)}
      >
        −
      </button>
      <strong
        style={{ color: "#EDEAE3", fontFamily: "'JetBrains Mono', monospace", minWidth: 28, textAlign: "center" }}
      >
        {wert}×
      </strong>
      <button
        onClick={() => hoch && onChange(wert + 1)}
        disabled={!hoch}
        title="Einmal mehr"
        aria-label="Einmal mehr"
        style={knopf(hoch)}
      >
        +
      </button>
    </div>
  );
}

function DetailView({ entry, category, singular, busy, onBack, onEdit, onDelete, onSaveAngaben, onSaveWatchCount }) {
  const criteria = criteriaFor(category);
  const criteriaScore = entryCriteriaScore(entry, category);
  const staffeln = hasSeasons(entry) ? entry.seasons : null;
  const [angabenOffen, setAngabenOffen] = useState(false);

  /* Jahr und Regie stehen unter dem Titel, die IMDb-Note neben der
     eigenen Endnote. Beides gibt es nur bei Film, Serie und Anime.
     Fehlt ein Wert, steht dort ein Platzhalter, der die Eingabe
     oeffnet — so laesst sich jederzeit von Hand nachtragen. */
  const zeigtAngaben = unterstuetztAngaben(category);
  const jahr = zeigtAngaben && typeof entry.releaseYear === "number" ? entry.releaseYear : null;
  const regie = zeigtAngaben && entry.director ? entry.director : null;
  const imdb = zeigtAngaben && typeof entry.imdbRating === "number" ? entry.imdbRating : null;
  // Bei Serien und Anime steht am Werk der Ersteller, nicht die Regie.
  const regieLabel = supportsSeasons(category) ? "Ersteller" : "Regie";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#17171A", zIndex: 50, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 40px" }}>
        <button
          onClick={onBack}
          style={{ background: "transparent", border: "none", color: "#9A968C", fontSize: 15, cursor: "pointer", padding: "10px 0", marginBottom: 8 }}
        >
          ← Zurück
        </button>

        <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
          <div style={{ flexShrink: 0 }}>
            <Poster url={entry.poster} title={entry.title} size={72} />
          </div>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
              {singular.toUpperCase()}
            </div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 26, margin: 0, lineHeight: 1.2 }}>
              {entry.title}
            </h1>
            {zeigtAngaben && (
              <div style={{ fontSize: 13, color: "#9A968C", marginTop: 6, lineHeight: 1.5 }}>
                {jahr || regie ? (
                  <>
                    {jahr && (
                      <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{jahr}</span>
                    )}
                    {jahr && regie && " · "}
                    {regie && <span>{regieLabel}: {regie}</span>}
                    <StiftKnopf title="Angaben bearbeiten" onClick={() => setAngabenOffen(true)} />
                  </>
                ) : (
                  <button
                    onClick={() => setAngabenOffen(true)}
                    style={{
                      background: "transparent", border: "1px dashed #33333a", borderRadius: 8,
                      color: "#77746c", fontSize: 12.5, cursor: "pointer", padding: "5px 10px",
                      fontFamily: "inherit",
                    }}
                  >
                    Jahr · {regieLabel} eingeben
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {zeigtAngaben && angabenOffen && (
          <AngabenEditor
            entry={entry}
            regieLabel={regieLabel}
            busy={busy}
            onSave={(werte) => { onSaveAngaben(werte); setAngabenOffen(false); }}
            onCancel={() => setAngabenOffen(false)}
          />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#9A968C" }}>Endnote</span>
          <ScoreBadge score={entry.score} size="lg" />
          {/* Fremdwert: bewusst als schlichte Karte statt als Notenfarbe,
              damit er nicht mit der eigenen Endnote verwechselt wird.
              Ohne Wert steht dort die Einladung, ihn einzutragen. */}
          {zeigtAngaben && (typeof imdb === "number" ? (
            <span
              title="Vergleichswert von IMDb, über OMDb geholt"
              style={{
                display: "inline-flex", alignItems: "baseline", gap: 8,
                background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 8,
                padding: "6px 12px",
              }}
            >
              <span style={{ fontSize: 11, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace" }}>
                IMDB
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 17, fontWeight: 700, color: "#EDEAE3" }}>
                {imdb.toFixed(1)}
              </span>
              <StiftKnopf title="IMDb-Note bearbeiten" onClick={() => setAngabenOffen(true)} />
            </span>
          ) : (
            <button
              onClick={() => setAngabenOffen(true)}
              title="IMDb-Note von Hand eintragen"
              style={{
                display: "inline-flex", alignItems: "baseline", gap: 8,
                background: "transparent", border: "1px dashed #33333a", borderRadius: 8,
                padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <span style={{ fontSize: 11, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace" }}>
                IMDB
              </span>
              <span style={{ fontSize: 12.5, color: "#77746c" }}>eingeben</span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 20, marginBottom: 20, fontSize: 14, color: "#9A968C", flexWrap: "wrap" }}>
          <div>
            Kriterien-Note:{" "}
            <strong style={{ color: "#EDEAE3" }}>
              {typeof criteriaScore === "number" ? criteriaScore.toFixed(2) : "–"}
            </strong>
          </div>
          <div>
            Bauchgefühl:{" "}
            <strong style={{ color: "#EDEAE3" }}>
              {typeof entryPersonal(entry) === "number" ? entryPersonal(entry).toFixed(2) : "–"}
            </strong>
          </div>
          {staffeln && <div>{staffeln.length} Staffeln</div>}
          <ZaehlerFeld
            label={zaehlerLabel(category)}
            wert={entryWatchCount(entry)}
            busy={busy}
            onChange={(n) => onSaveWatchCount(n)}
          />
        </div>

        {staffeln && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>
              STAFFELN
            </div>
            {staffeln.map((sn, i) => (
              <div
                key={sn.seasonNumber || i}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #232326" }}
              >
                <span style={{ fontSize: 14.5 }}>
                  Staffel {sn.seasonNumber || i + 1}
                  {seasonPercent(sn) !== SEASON_PERCENT_DEFAULT && (
                    <span
                      title="Gewichtung dieser Staffel"
                      style={{ color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, marginLeft: 8 }}
                    >
                      {seasonPercent(sn)} %
                    </span>
                  )}
                </span>
                <ScoreBadge score={seasonScore(sn, category)} />
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: "#77746c", marginTop: 10, lineHeight: 1.5 }}>
              Die Endnote ist der nach den Prozentangaben gewichtete
              Durchschnitt aller Staffelnoten. Die Werte darunter sind
              entsprechend gewichtete Mittel.
              {seasonWeightSum(entry) <= 0 && " Alle Staffeln stehen auf 0 % — der Eintrag gilt als unbewertet."}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          {criteria.map((c) => (
            <div key={c.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #232326" }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 11.5, color: "#77746c", marginTop: 2 }}>{c.hint}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {Math.round(c.weight * 100)}%
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700 }}>
                  {typeof entryCriterionValue(entry, c.key) === "number"
                    ? entryCriterionValue(entry, c.key).toFixed(1)
                    : "–"}
                </span>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--accent, #C9A227)" }}>Bauchgefühl</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace" }}>25%</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700 }}>
                {typeof entryPersonal(entry) === "number" ? entryPersonal(entry).toFixed(1) : "–"}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onEdit}
            style={{ flex: 1, padding: "15px", background: "var(--accent, #C9A227)", color: "#17171A", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer" }}
          >
            Bearbeiten
          </button>
          <button
            onClick={onDelete}
            style={{ padding: "15px 18px", background: "transparent", color: "#d9736a", border: "1px solid #d9736a", borderRadius: 8, cursor: "pointer", fontSize: 15 }}
          >
            Löschen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   STATISTIK — eigener Hauptbereich (kein Overlay, sondern Tab)
   ============================================================ */
/* Vergleichswert fuer Sortierungen: unbewertete Eintraege ganz ans Ende. */
function sortWert(score) {
  return typeof score === "number" ? score : -Infinity;
}

/* Kennzahlen einer Liste: Anzahl, Durchschnitt, höchste und
   niedrigste Endnote. Unbewertete Einträge fließen nicht ein. */
function statsFor(list) {
  const noten = list.map((f) => f.score).filter((v) => typeof v === "number");
  const count = list.length;
  const avg = noten.length ? noten.reduce((s, v) => s + v, 0) / noten.length : 0;
  const max = noten.length ? Math.max(...noten) : 0;
  const min = noten.length ? Math.min(...noten) : 0;
  return { count, avg, max, min };
}

const STATS_SCOPES = [{ key: "all", label: "Alle" }, ...CATEGORIES.map((c) => ({ key: c.key, label: c.label }))];

/* Eine Zeile der Rangliste — dasselbe Format wie ueberall:
   Rang, Poster, Titel, Endnote. */
function RanglistenZeile({ platz, eintrag }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #232326" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#55524c", width: 18, flexShrink: 0 }}>{platz}</span>
        <Poster url={eintrag.poster} title={eintrag.title} size={28} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{eintrag.title}</div>
          <AngabenZeile eintrag={eintrag} />
        </div>
      </div>
      <ScoreBadge score={eintrag.score} />
    </div>
  );
}

/* ------------------------------------------------------------
   Top 10 — eine Liste ueber frei kombinierbare Kategorien.

   Die Knoepfe sind einzeln an- und abschaltbar; ein aktiver traegt
   die Farbe seiner Kategorie. Die Auswahl ist unabhaengig von der
   Detailauswertung darueber und aendert an keiner Berechnung etwas:
   sortiert wird wie in jeder Rangliste nach der Endnote.
   ------------------------------------------------------------ */
function TopTen({ ranked }) {
  const [gewaehlt, setGewaehlt] = useState(() => new Set(CATEGORY_KEYS));

  function umschalten(key) {
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (neu.has(key)) neu.delete(key);
      else neu.add(key);
      return neu;
    });
  }

  const auswahl = CATEGORIES.filter((c) => gewaehlt.has(c.key));

  const { liste, gesamt } = useMemo(() => {
    const alle = CATEGORY_KEYS.filter((k) => gewaehlt.has(k)).flatMap((k) => ranked[k]);
    return {
      liste: [...alle].sort((a, b) => sortWert(b.score) - sortWert(a.score)).slice(0, 10),
      gesamt: alle.length,
    };
  }, [ranked, gewaehlt]);

  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, margin: "0 0 12px" }}>Top 10</h3>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {CATEGORIES.map((c) => {
          const aktiv = gewaehlt.has(c.key);
          const farbe = accentFor(c.key);
          return (
            <button
              key={c.key}
              onClick={() => umschalten(c.key)}
              aria-pressed={aktiv}
              style={{
                padding: "9px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                background: aktiv ? farbe : "transparent",
                color: aktiv ? "#17171A" : "#9A968C",
                border: "1px solid " + (aktiv ? farbe : "#33333a"),
                fontWeight: aktiv ? 700 : 400,
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 12.5, color: "#77746c", marginBottom: 14 }}>
        {auswahl.length === 0
          ? "Keine Kategorie ausgewählt"
          : auswahl.map((c) => c.label).join(", ") +
            " · " +
            gesamt +
            (gesamt === 1 ? " Eintrag" : " Einträge")}
      </div>

      {auswahl.length === 0 ? (
        <div style={{ color: "#55524c", fontSize: 13, padding: "8px 0" }}>
          Wähle oben mindestens eine Kategorie aus.
        </div>
      ) : liste.length === 0 ? (
        <div style={{ color: "#55524c", fontSize: 13, padding: "8px 0" }}>Keine Einträge.</div>
      ) : (
        liste.map((f, i) => <RanglistenZeile key={f.id} platz={i + 1} eintrag={f} />)
      )}
    </div>
  );
}

/* ------------------------------------------------------------
   Zeitaufwand Watchlist

   Wie lange braucht es, alles Vorgemerkte zu schauen? Gezaehlt werden
   Filme, Serien und Anime — Spiele haben keine abrufbare Laufzeit und
   bleiben aussen vor.

   Eintraege, deren Laufzeit (noch) nicht bekannt ist, zaehlen nicht
   mit. Ihre Anzahl steht als Hinweis darunter, damit die Summe nicht
   vollstaendiger wirkt, als sie ist.
   ------------------------------------------------------------ */
const ZEITAUFWAND_KATEGORIEN = CATEGORIES.filter((c) => unterstuetztLaufzeit(c.key));

function ZeitaufwandWatchlist({ watchlist }) {
  const daten = useMemo(() => {
    let minuten = 0;
    let gezaehlt = 0;
    let offen = 0;
    const jeKategorie = [];

    for (const cat of ZEITAUFWAND_KATEGORIEN) {
      let summe = 0;
      for (const eintrag of watchlist[cat.key] || []) {
        const dauer = eintragLaufzeit(eintrag);
        if (dauer === null) {
          offen++;
          continue;
        }
        summe += dauer;
        gezaehlt++;
      }
      minuten += summe;
      jeKategorie.push({ key: cat.key, label: cat.label, minuten: summe });
    }

    return { minuten, gezaehlt, offen, jeKategorie, inTagen: tageText(minuten) };
  }, [watchlist]);

  const leer = daten.gezaehlt === 0 && daten.offen === 0;

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 14px" }}>
        Zeitaufwand Watchlist
      </h2>

      {leer ? (
        <div style={{ color: "#77746c", fontSize: 13, padding: "8px 0" }}>
          Keine Filme, Serien oder Anime vorgemerkt.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <StatCard label="GESAMT" value={stundenText(daten.minuten)} />
            <StatCard label="MIT LAUFZEIT" value={daten.gezaehlt} />
          </div>

          {daten.gezaehlt > 0 && (
            <div style={{ fontSize: 12.5, color: "#77746c", lineHeight: 1.5 }}>
              {/* Ab einem Tag sagt die Stundenzahl allein wenig — die
                  Tagesangabe steht deshalb daneben. */}
              {daten.inTagen ? "das sind " + daten.inTagen + " · " : ""}
              {daten.jeKategorie.map((k) => k.label + ": " + stundenKurz(k.minuten)).join(" · ")}
            </div>
          )}

          {daten.offen > 0 && (
            <div style={{ fontSize: 12, color: "#55524c", marginTop: 6, lineHeight: 1.5 }}>
              {daten.offen}{" "}
              {daten.offen === 1 ? "Eintrag ohne bekannte Laufzeit" : "Einträge ohne bekannte Laufzeit"}, noch
              nicht mitgerechnet
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatsPage({ ranked, watchlist }) {
  const [scope, setScope] = useState("all");

  const overall = useMemo(() => {
    const all = CATEGORY_KEYS.flatMap((k) => ranked[k]);
    return {
      counts: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, ranked[k].length])),
      countTotal: all.length,
      ...statsFor(all),
    };
  }, [ranked]);

  const scopedList = useMemo(() => {
    if (scope === "all") return CATEGORY_KEYS.flatMap((k) => ranked[k]);
    return ranked[scope];
  }, [ranked, scope]);

  const scopedStats = statsFor(scopedList);

  /* Kriterien-Durchschnitte werden ausschließlich innerhalb einer
     Kategorie gebildet. Bei "Alle" gibt es deshalb einen Block je
     Kategorie statt eines gemeinsamen — die Kriterien von Spielen
     und Filmen sind schlicht nicht dieselben und dürfen nicht in
     einen Topf. */
  const criteriaGroups = useMemo(() => {
    const base =
      scope === "all"
        ? CATEGORIES.map((c) => ({ key: c.key, label: c.label, list: ranked[c.key] }))
        : [{ key: scope, label: null, list: ranked[scope] }];

    return base
      .filter((g) => g.list.length > 0)
      .map((g) => ({
        ...g,
        // Jeder Eintrag zaehlt genau einmal. Bei Serien mit Staffeln
        // geht der Durchschnitt der Staffelwerte je Kriterium ein, nicht
        // jede Staffel einzeln — sonst haetten lange Serien mehr Gewicht.
        criteria: criteriaFor(g.key).map((c) => {
          const vals = g.list.map((f) => entryCriterionValue(f, c.key)).filter((v) => typeof v === "number");
          return { ...c, avg: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0 };
        }),
        avgPersonal: (() => {
          const werte = g.list.map(entryPersonal).filter((v) => typeof v === "number");
          return werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : 0;
        })(),
      }));
  }, [ranked, scope]);

  const bands = DISTRIBUTION_BANDS.map((b) => ({
    ...b,
    count: scopedList.filter((f) => typeof f.score === "number" && f.score >= b.min && f.score < b.max).length,
  }));
  const maxBandCount = Math.max(1, ...bands.map((b) => b.count));

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 50px" }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 14px" }}>Gesamtstatistik</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {CATEGORIES.map((c) => (
          <StatCard key={c.key} label={c.label.toUpperCase()} value={overall.counts[c.key]} />
        ))}
        <StatCard label="GESAMT" value={overall.countTotal} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        <StatCard label="Ø ENDNOTE" value={overall.avg.toFixed(2)} color={scoreToColor(overall.avg)} />
        <StatCard label="HÖCHSTE" value={overall.max.toFixed(2)} color={scoreToColor(overall.max)} />
        <StatCard label="NIEDRIGSTE" value={overall.min.toFixed(2)} color={scoreToColor(overall.min)} />
      </div>

      {/* Was noch vor einem liegt — die Watchlist in Stunden. Sie hat
          mit den Noten darueber nichts zu tun und steht deshalb als
          eigener Abschnitt dazwischen. */}
      <ZeitaufwandWatchlist watchlist={watchlist} />

      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 14px" }}>Detailauswertung</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {STATS_SCOPES.map((s) => (
          <button
            key={s.key}
            onClick={() => setScope(s.key)}
            style={{
              padding: "9px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
              background: scope === s.key ? "#C9A227" : "transparent",
              color: scope === s.key ? "#17171A" : "#9A968C",
              border: "1px solid " + (scope === s.key ? "#C9A227" : "#33333a"),
              fontWeight: scope === s.key ? 700 : 400,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {scopedList.length === 0 ? (
        <div style={{ color: "#77746c", padding: 30, textAlign: "center" }}>Noch keine Einträge in diesem Bereich.</div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
          <StatCard label="ANZAHL" value={scopedStats.count} />
          <StatCard label="Ø ENDNOTE" value={scopedStats.avg.toFixed(2)} color={scoreToColor(scopedStats.avg)} />
          <StatCard label="HÖCHSTE" value={scopedStats.max.toFixed(2)} color={scoreToColor(scopedStats.max)} />
          <StatCard label="NIEDRIGSTE" value={scopedStats.min.toFixed(2)} color={scoreToColor(scopedStats.min)} />
        </div>
      )}

      {/* Top 10 steht mit eigenem Filter zwischen Detailauswertung und
          Bewertungsverteilung — unabhaengig von der Auswahl darueber. */}
      <TopTen ranked={ranked} />

      {scopedList.length > 0 && (
        <>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, margin: "0 0 14px" }}>Bewertungsverteilung</h3>
          <div style={{ marginBottom: 28 }}>
            {bands.map((b) => (
              <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 62, fontSize: 12, color: "#9A968C", flexShrink: 0 }}>{b.label}</div>
                <div style={{ flex: 1, height: 14, background: "#232326", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${(b.count / maxBandCount) * 100}%`, height: "100%", background: scoreToColor(b.at) }} />
                </div>
                <div style={{ width: 26, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, flexShrink: 0 }}>{b.count}</div>
              </div>
            ))}
          </div>

          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, margin: "0 0 14px" }}>Ø je Kriterium</h3>
          {scope === "all" && (
            <div style={{ fontSize: 12, color: "#77746c", marginBottom: 14, lineHeight: 1.5 }}>
              Getrennt nach Kategorie — die Kriterien unterscheiden sich je Kategorie
              und werden deshalb nicht zusammengerechnet.
            </div>
          )}
          {criteriaGroups.map((group) => (
            <div key={group.key} style={{ marginBottom: 18 }}>
              {group.label && (
                <div style={{ fontSize: 12, letterSpacing: 1, color: "#C9A227", fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>
                  {group.label.toUpperCase()}
                </div>
              )}
              {group.criteria.map((c) => (
                <div key={c.key} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span>{c.label} <span style={{ color: "#C9A227", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{Math.round(c.weight * 100)}%</span></span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#C9A227" }}>{c.avg.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 8, background: "#232326", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${(c.avg / 10) * 100}%`, height: "100%", background: "#C9A227" }} />
                  </div>
                </div>
              ))}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span>Bauchgefühl <span style={{ color: "#C9A227", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>25% der Endnote</span></span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#C9A227" }}>{group.avgPersonal.toFixed(2)}</span>
                </div>
                <div style={{ height: 8, background: "#232326", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${(group.avgPersonal / 10) * 100}%`, height: "100%", background: "#C9A227" }} />
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ flex: "1 1 100px", background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 10.5, color: "#9A968C", marginBottom: 6, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 21, fontWeight: 700, color: color || "#EDEAE3" }}>{value}</div>
    </div>
  );
}

/* ============================================================
   HAUPT-APP
   ============================================================ */
const EMPTY_ITEMS = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, []]));

export default function App() {
  const [items, setItems] = useState(EMPTY_ITEMS);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("movie");
  const [activeTab, setActiveTab] = useState("movie"); // movie | series | anime | stats
  const [search, setSearch] = useState("");
  // list | suche | form | edit | watchlist-form
  const [mode, setMode] = useState("list");
  // Unter-Reiter innerhalb einer Kategorie: bewertet | watchlist
  const [unterReiter, setUnterReiter] = useState("bewertet");
  // Der aus der Suche gewaehlte Treffer, den das Formular vorbelegt.
  const [gewaehlterTreffer, setGewaehlterTreffer] = useState(null);
  // Der vorgemerkte Eintrag, der gerade bewertet wird.
  const [bewerteVorgemerkt, setBewerteVorgemerkt] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [exportFormat, setExportFormat] = useState("json");
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState("");
  const [filterState, setFilterState] = useState({ ...DEFAULT_FILTER });
  const fileInputRef = useRef(null);

  function normalizeEntry(e) {
    return {
      id: e.id,
      category: e.category,
      title: e.title,
      poster: typeof e.poster === "string" ? e.poster : "",
      posterSource: e.posterSource === "manual" || e.posterSource === "auto" ? e.posterSource : undefined,
      backdrop: typeof e.backdrop === "string" ? e.backdrop : "",
      // Angaben zum Werk: fehlen sie, bleibt es bei null — daran
      // erkennt das Nachladen, was noch zu holen ist.
      releaseYear: typeof e.releaseYear === "number" ? e.releaseYear : null,
      director: typeof e.director === "string" && e.director.trim() ? e.director.trim() : null,
      imdbRating: typeof e.imdbRating === "number" ? e.imdbRating : null,
      // Vorgemerkt statt bewertet — ohne Werte und ohne Endnote.
      watchlist: e.watchlist === true,
      // Wie oft geschaut/gespielt. Wer bewertet hat, hat einmal gesehen.
      watchCount: typeof e.watchCount === "number" ? e.watchCount : WATCH_COUNT_MIN,
      seasons: Array.isArray(e.seasons)
        ? e.seasons.map((sn, i) => ({
            // Die ID kommt aus der Datenbank und muss beim Speichern
            // zurueckgeschickt werden — nur so wird die bestehende
            // Staffel aktualisiert statt eine neue angelegt.
            id: sn.id,
            seasonNumber: typeof sn.seasonNumber === "number" ? sn.seasonNumber : i + 1,
            values: sn.values || {},
            personal: sn.personal,
            // Ohne Gewichtung gilt der Faktor 1.0 (= 100 %).
            weight: typeof sn.weight === "number" ? sn.weight : SEASON_WEIGHT_DEFAULT,
          }))
        : [],
      // Zusatzdaten zum Werk. Wie die Angaben werden sie automatisch
      // nachgeladen; fehlen sie, bleibt die Liste leer bzw. der Wert null.
      genre: Array.isArray(e.genre) ? e.genre.filter((g) => typeof g === "string" && g.trim()) : [],
      collection: typeof e.collection === "string" && e.collection.trim() ? e.collection.trim() : null,
      studio: typeof e.studio === "string" && e.studio.trim() ? e.studio.trim() : null,
      /* Laufzeit. Wie die Angaben wird sie automatisch nachgeladen;
         unbekannt heisst null bzw. leere Liste. Die vier Felder gehen
         beim Speichern immer gemeinsam mit — der Server schreibt sie
         nur dann. */
      runtimeMinutes: typeof e.runtimeMinutes === "number" ? e.runtimeMinutes : null,
      episodeRuntime: typeof e.episodeRuntime === "number" ? e.episodeRuntime : null,
      episodeCount: typeof e.episodeCount === "number" ? e.episodeCount : null,
      episodesPerSeason: Array.isArray(e.episodesPerSeason)
        ? e.episodesPerSeason.filter((n) => typeof n === "number" && n > 0)
        : [],
      values: e.values,
      personal: e.personal,
      createdAt: e.createdAt || 0,
      updatedAt: e.updatedAt || 0,
    };
  }

  // ---- Laden aus der Datenbank ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.loadAll();
        if (cancelled) return;
        setItems(Object.fromEntries(CATEGORY_KEYS.map((k) => [k, (data[k] || []).map(normalizeEntry)])));
        setSaveError("");
      } catch (e) {
        if (!cancelled) {
          setSaveError(
            "Die Bewertungen konnten nicht geladen werden: " + e.message +
              ". Bitte Seite neu laden. (Prüfe, ob die Datenbank verbunden ist.)"
          );
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* Es gibt bewusst KEINEN "alles speichern"-Effekt mehr.
     Jede Änderung wird einzeln über die API geschrieben und erst
     danach in den State übernommen — dadurch kann nichts mehr
     stillschweigend verloren gehen. */

  // ---- Automatisches Nachladen: Poster, Angaben und Zusatzdaten ----
  const posterAttempted = useRef(new Set());
  const angabenAttempted = useRef(new Set());
  const genreAttempted = useRef(new Set());
  const laufzeitAttempted = useRef(new Set());
  const nachladeZaehler = useRef(0);
  const zusatzZaehler = useRef(0);

  /* Laeuft gerade ein Durchgang? Jeder gespeicherte Eintrag aendert
     `items` und stoesst diesen Effekt erneut an. Ohne die Sperre
     loesten sich die Durchgaenge gegenseitig ab: der neue begann von
     vorn, der alte brach mitten in einem Eintrag ab — dessen bereits
     geholte Daten waren damit verloren, der Eintrag aber schon als
     "versucht" vermerkt. */
  const nachladeLaeuft = useRef(false);

  /* Abbruch nur, wenn die App wirklich verlassen wird. Leere
     Abhaengigkeiten heisst: dieses Aufraeumen laeuft ausschliesslich
     beim Aushaengen, nicht bei jedem neuen Effektlauf. */
  const nachladeEnde = useRef(false);
  useEffect(() => () => { nachladeEnde.current = true; }, []);

  useEffect(() => {
    if (!loaded) return;
    if (nachladeLaeuft.current) return;
    nachladeLaeuft.current = true;

    (async () => {
      try {
        // Bereits erfolglos gesuchte Einträge nicht bei jedem Seitenaufruf
        // erneut abfragen — sonst laufen dauerhaft hunderte Anfragen.
        const erfolglos = ladeErfolglose();
        const ohneAngaben = ladeOhneAngaben();
        const ohneGenre = ladeOhneGenre();
        const ohneLaufzeit = ladeOhneLaufzeit();

        const offenJeKategorie = CATEGORY_KEYS.map((catKey) => {
          const liste = [];
          for (const entry of items[catKey] || []) {
            // Nachgeladen werden fehlende Poster, fehlende Angaben zum
            // Werk und fehlende Zusatzdaten (Genre, Filmreihe, Studio).
            // Die Bilder des Kopfbereichs bleiben handgepflegt.
            const posterFehlt =
              !entry.poster && !posterAttempted.current.has(entry.id) && !erfolglos.has(entry.id);
            const angabenFehlen =
              unterstuetztAngaben(catKey) &&
              angabenUnvollstaendig(entry) &&
              !angabenAttempted.current.has(entry.id) &&
              !ohneAngaben.has(entry.id);
            const zusatzFehlt =
              unterstuetztAngaben(catKey) &&
              genreFehlt(entry) &&
              !genreAttempted.current.has(entry.id) &&
              !ohneGenre.has(entry.id);
            // Die Laufzeit haengt am selben Abruf und wird genauso
            // nachgetragen: einmal je Eintrag, batch-weise mit Pausen.
            const laufzeitOffen =
              unterstuetztLaufzeit(catKey) &&
              laufzeitFehlt(entry) &&
              !laufzeitAttempted.current.has(entry.id) &&
              !ohneLaufzeit.has(entry.id);
            if (!posterFehlt && !angabenFehlen && !zusatzFehlt && !laufzeitOffen) continue;
            liste.push({ catKey, entry, posterFehlt, angabenFehlen, zusatzFehlt, laufzeitOffen });
          }
          return liste;
        });

        /* Reihum eines aus jeder Kategorie statt erst alle Filme.
           Die Obergrenze pro Seitenaufruf gilt fuer alle Kategorien
           gemeinsam: Wird sie streng der Reihe nach vergeben, verbraucht
           eine grosse Filmsammlung sie vollstaendig, und Serien, Anime
           und Spiele kommen ueber Besuche hinweg nie an die Reihe. */
        const todo = [];
        for (let i = 0; ; i++) {
          let nochWelche = false;
          for (const liste of offenJeKategorie) {
            if (i < liste.length) {
              todo.push(liste[i]);
              nochWelche = true;
            }
          }
          if (!nochWelche) break;
        }
        if (!todo.length) return;

        for (const job of todo) {
          if (nachladeEnde.current) return;

          /* Zwei getrennte Kontingente: Eintraege, denen nur noch die
             Zusatzdaten fehlen, laufen ueber das eigene Kontingent des
             Nachtrags. Ist eines erschoepft, kommen die Eintraege der
             anderen Art trotzdem noch dran — deshalb `continue` statt
             `return`, und Schluss erst, wenn beide voll sind. */
          const nurZusatz = !job.posterFehlt && !job.angabenFehlen;
          if (nurZusatz) {
            if (zusatzZaehler.current >= MAX_ZUSATZ_PRO_BESUCH) {
              if (nachladeZaehler.current >= MAX_NACHLADEN_PRO_BESUCH) return;
              continue;
            }
            zusatzZaehler.current++;
            // Batch-weise mit Pausen: der Nachtrag laeuft ueber die ganze
            // Sammlung und soll die freien APIs nicht ueberrennen.
            await warte(ZUSATZ_PAUSE_MS);
            if (nachladeEnde.current) return;
          } else {
            // Pro Seitenaufruf nur eine begrenzte Zahl nachladen. Jede Suche
            // kostet serverseitig mehrere externe Aufrufe; bei vielen
            // Einträgen würde das die App sonst lahmlegen.
            if (nachladeZaehler.current >= MAX_NACHLADEN_PRO_BESUCH) {
              if (zusatzZaehler.current >= MAX_ZUSATZ_PRO_BESUCH) return;
              continue;
            }
            nachladeZaehler.current++;
          }

          if (job.posterFehlt) posterAttempted.current.add(job.entry.id);
          if (job.angabenFehlen) angabenAttempted.current.add(job.entry.id);
          if (job.zusatzFehlt) genreAttempted.current.add(job.entry.id);
          if (job.laufzeitOffen) laufzeitAttempted.current.add(job.entry.id);

          // Ein Aufruf deckt beides ab — Poster und Angaben stammen aus
          // demselben Treffer und koennen so nicht auseinanderfallen.
          const gefunden = (await api.findMedia(job.entry.title, job.catKey)) || {};
          if (nachladeEnde.current) return;

          const aenderung = {};

          if (job.posterFehlt) {
            // Leere Felder sind "", die Suche liefert aber null. Ohne
            // Vereinheitlichung schlaegt der Vergleich fehl und es wird
            // gespeichert, obwohl sich nichts geaendert hat.
            const neuesPoster = gefunden.url || "";
            if (neuesPoster) {
              aenderung.poster = neuesPoster;
              aenderung.posterSource = "auto";
            } else {
              // Nichts gefunden: merken, damit der Eintrag beim naechsten
              // Besuch nicht wieder abgefragt wird.
              merkeErfolglos(job.entry.id);
            }
          }

          if (job.angabenFehlen) {
            // Nur fehlende Felder fuellen — was schon dasteht, bleibt
            // stehen. Von Hand eingetragene Werte werden dadurch nie
            // ueberschrieben.
            if (job.entry.releaseYear == null && typeof gefunden.year === "number") {
              aenderung.releaseYear = gefunden.year;
            }
            if (!job.entry.director && typeof gefunden.director === "string" && gefunden.director.trim()) {
              aenderung.director = gefunden.director.trim();
            }
            if (job.entry.imdbRating == null && typeof gefunden.imdbRating === "number") {
              aenderung.imdbRating = gefunden.imdbRating;
            }
            // Als aussichtslos gilt der Eintrag nur, wenn die Antwort auch
            // wirklich aus dieser Fassung stammt. Eine aeltere Antwort aus
            // dem CDN kennt die Felder gar nicht — sie duerfte den Eintrag
            // sonst dauerhaft blockieren, obwohl nie gesucht wurde.
            const echterVersuch = gefunden.angabenVersion === ANGABEN_VERSION;
            if (echterVersuch && angabenUnvollstaendig({ ...job.entry, ...aenderung })) {
              merkeOhneAngaben(job.entry.id);
            }
          }

          if (job.zusatzFehlt) {
            /* Wie bei den Angaben wird nur ergaenzt, nie ueberschrieben:
               Was am Eintrag schon steht, bleibt unangetastet. Und
               geschrieben wird ueberhaupt nur, wenn der Abruf etwas
               gebracht hat — ein Fehlschlag laesst den Eintrag genau so
               zurueck, wie er war. */
            const gefundeneGenres = Array.isArray(gefunden.genres)
              ? gefunden.genres.filter((g) => typeof g === "string" && g.trim())
              : [];
            if (genreFehlt(job.entry) && gefundeneGenres.length) {
              aenderung.genre = gefundeneGenres;
            }
            if (!job.entry.collection && typeof gefunden.collection === "string" && gefunden.collection.trim()) {
              aenderung.collection = gefunden.collection.trim();
            }
            if (!job.entry.studio && typeof gefunden.studio === "string" && gefunden.studio.trim()) {
              aenderung.studio = gefunden.studio.trim();
            }
            // Aussichtslos ist der Eintrag nur, wenn die Antwort auch aus
            // dieser Fassung stammt — eine aeltere aus dem CDN kennt die
            // neuen Felder gar nicht und darf ihn nicht blockieren.
            const echterVersuch = gefunden.angabenVersion === ANGABEN_VERSION;
            if (echterVersuch && !aenderung.genre) merkeOhneGenre(job.entry.id);
          }

          if (job.laufzeitOffen) {
            /* Auch hier gilt: geschrieben wird nur bei erfolgreichem
               Abruf. Ohne Gesamtlaufzeit bleibt der Eintrag genau so
               zurueck, wie er war — Episodenlaenge und -anzahl allein
               ergeben keine Zahl, die die Statistik verwenden koennte. */
            const minuten =
              typeof gefunden.runtimeMinutes === "number" && gefunden.runtimeMinutes > 0
                ? Math.round(gefunden.runtimeMinutes)
                : null;
            if (minuten) {
              aenderung.runtimeMinutes = minuten;
              if (typeof gefunden.episodeRuntime === "number" && gefunden.episodeRuntime > 0) {
                aenderung.episodeRuntime = Math.round(gefunden.episodeRuntime);
              }
              if (typeof gefunden.episodeCount === "number" && gefunden.episodeCount > 0) {
                aenderung.episodeCount = Math.round(gefunden.episodeCount);
              }
              if (Array.isArray(gefunden.episodesPerSeason) && gefunden.episodesPerSeason.length) {
                aenderung.episodesPerSeason = gefunden.episodesPerSeason.filter(
                  (n) => typeof n === "number" && n > 0
                );
              }
            }
            // Wie bei den Zusatzdaten zaehlt nur ein Versuch aus dieser
            // Fassung; eine aeltere Antwort aus dem CDN kennt die
            // Laufzeit gar nicht und darf den Eintrag nicht blockieren.
            const echterVersuch = gefunden.angabenVersion === ANGABEN_VERSION;
            if (echterVersuch && !minuten) merkeOhneLaufzeit(job.entry.id);
          }

          if (!Object.keys(aenderung).length) continue;

          try {
            const saved = await api.update(job.entry.id, {
              ...job.entry,
              seasons: job.entry.seasons || [],
              category: job.catKey,
              ...aenderung,
            });
            if (nachladeEnde.current) return;
            setItems((prev) => ({
              ...prev,
              [job.catKey]: (prev[job.catKey] || []).map((f) => (f.id === saved.id ? normalizeEntry(saved) : f)),
            }));
          } catch (e) {
            // Poster und Angaben sind Nebensache — Fehler hier nicht dem
            // Nutzer aufdrängen.
          }
        }
      } finally {
        nachladeLaeuft.current = false;
      }
    })();
  }, [items, loaded]);

  const catInfo = CATEGORIES.find((c) => c.key === category);

  // ---- Sortierte Liste je Kategorie (immer nach Endnote — das ist die "normale" Rangliste) ----
  const rankedByCategory = useMemo(() => {
    const result = {};
    for (const cat of CATEGORIES) {
      // Vorgemerkte Eintraege haben keine Note und gehoeren deshalb in
      // keine Rangliste — und damit auch in keine Statistik.
      const list = (items[cat.key] || [])
        .filter((f) => !istVorgemerkt(f))
        .map((f) => ({
          ...f,
          score: entryScore(f, cat.key),
        }));
      list.sort((a, b) => sortWert(b.score) - sortWert(a.score));
      result[cat.key] = list;
    }
    return result;
  }, [items]);

  /* Die Watchlist je Kategorie: neueste Vormerkung zuerst. Eine
     Sortierung nach Note gibt es hier nicht — es gibt noch keine. */
  const watchlistByCategory = useMemo(() => {
    const result = {};
    for (const cat of CATEGORIES) {
      result[cat.key] = (items[cat.key] || [])
        .filter(istVorgemerkt)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return result;
  }, [items]);

  const currentList = rankedByCategory[category];
  const watchlistList = watchlistByCategory[category] || [];
  const accent = accentFor(category);

  /* Im Statistik-Tab zaehlt die Kopfzeile alle Kategorien zusammen,
     nicht die zuletzt gewaehlte. */
  const gesamtAnzahl = CATEGORY_KEYS.reduce((s, k) => s + rankedByCategory[k].length, 0);

  /* ---- Poster-Hintergrund im Kopfbereich ----
     Die Mischung entsteht neu, wenn die Kategorie wechselt — und
     einmalig nachtraeglich, falls beim Wechsel noch keine Daten da
     waren. Bei spaeteren Aenderungen (z. B. neue Bewertung) bleibt sie
     stehen, sonst wuerde der Hintergrund beim Bewerten springen. */
  /* Kopfbereich-Bilder: fest hinterlegte Adressen aus der Datenbank.
     Keine automatische Suche mehr — gepflegt wird im Daten-Panel. */
  const [headerImages, setHeaderImages] = useState([]);
  const [headerFehler, setHeaderFehler] = useState("");

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        const bilder = await api.loadHeaderImages();
        if (!abgebrochen) setHeaderImages(bilder);
      } catch (e) {
        // Der Kopfbereich ist Beiwerk — ein Fehler hier bleibt still.
      }
    })();
    return () => { abgebrochen = true; };
  }, []);

  async function headerBildHinzufuegen(url) {
    setHeaderFehler("");
    try {
      const angelegt = await api.addHeaderImage(url);
      setHeaderImages((prev) => [...prev, angelegt]);
      return true;
    } catch (e) {
      setHeaderFehler(e.message);
      return false;
    }
  }

  async function headerBildLoeschen(id) {
    setHeaderFehler("");
    try {
      await api.removeHeaderImage(id);
      setHeaderImages((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setHeaderFehler(e.message);
    }
  }

  // ---- Angezeigte Liste: Suche + Filter (Bereich + Sortierung) ----
  const filtered = useMemo(() => {
    let list = currentList;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.title.toLowerCase().includes(q));
    }
    // Unbewertete Eintraege haben keine Note. Sie bleiben sichtbar,
    // solange der Bereich nicht eingeschraenkt ist — sonst waeren sie
    // unauffindbar, obwohl gerade sie Aufmerksamkeit brauchen.
    const bereichOffen =
      filterState.min === DEFAULT_FILTER.min && filterState.max === DEFAULT_FILTER.max;
    list = list.filter((f) =>
      typeof f.score === "number"
        ? f.score >= filterState.min && f.score <= filterState.max
        : bereichOffen
    );

    // Genre, Jahrzehnt, Regie und Filmreihe. Was nicht gesetzt ist,
    // laesst alles durch.
    list = list.filter((f) => passtZuFiltern(f, filterState));

    const sorted = [...list];
    switch (filterState.sort) {
      case "score-asc":
        sorted.sort((a, b) => sortWert(a.score) - sortWert(b.score));
        break;
      case "title-asc":
        sorted.sort((a, b) => a.title.localeCompare(b.title, "de"));
        break;
      case "title-desc":
        sorted.sort((a, b) => b.title.localeCompare(a.title, "de"));
        break;
      case "recent-desc":
        sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        break;
      case "recent-asc":
        sorted.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        break;
      case "score-desc":
      default:
        sorted.sort((a, b) => sortWert(b.score) - sortWert(a.score));
    }
    return sorted;
  }, [currentList, search, filterState]);

  const isFilterActive = filterAktiv(filterState);
  const isSortActive = filterState.sort !== DEFAULT_FILTER.sort;

  const selectedEntry = useMemo(() => {
    if (!selectedId) return null;
    return currentList.find((f) => f.id === selectedId) || null;
  }, [currentList, selectedId]);

  /* ---- Grundlage der Empfehlungen: das Geschmacksprofil ----
     Die bestbewerteten Titel der Kategorie bilden die Grundlage —
     `currentList` ist bereits nach Endnote sortiert. Unbewertetes
     (Staffelgewichte auf 0) hat keine Note und faellt heraus.

     Der Massstab fuer "ueberdurchschnittlich" ist der Durchschnitt
     ueber ALLE bewerteten Eintraege der Kategorie, nicht nur ueber die
     Besten — sonst waere die Haelfte der eigenen Favoriten
     definitionsgemaess unterdurchschnittlich. */
  const empfehlungsProfil = useMemo(() => {
    const bewertet = currentList.filter((f) => typeof f.score === "number");
    if (!bewertet.length) return null;

    const basis = bewertet.reduce((s, f) => s + f.score, 0) / bewertet.length;
    const grundlage = bewertet.slice(0, PROFIL_BASIS[category] || 20);
    return geschmacksProfil(grundlage, basis, category);
  }, [currentList, category]);

  /* Alles, was in dieser Kategorie schon bekannt ist — bewertet wie
     vorgemerkt. Daran werden die Vorschlaege aussortiert. */
  const bekannteTitel = useMemo(
    () => new Set((items[category] || []).map((f) => titelSchluessel(f.title))),
    [items, category]
  );

  // ---- CRUD ----
  async function addEntry({ title, poster, values, personal, seasons }) {
    setBusy(true);
    try {
      const created = await api.create({
        category,
        title,
        poster,
        posterSource: poster ? "manual" : undefined,
        // Aus der Suche uebernommenes Jahr; sonst traegt es das
        // automatische Nachladen nach.
        releaseYear: gewaehlterTreffer ? gewaehlterTreffer.year : undefined,
        values,
        personal,
        seasons: seasons || [],
      });
      setItems((prev) => ({ ...prev, [category]: [normalizeEntry(created), ...prev[category]] }));
      setSaveError("");
      setGewaehlterTreffer(null);
      setMode("list");
    } catch (e) {
      setSaveError("Nicht gespeichert: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  /* ---- Watchlist ----
     Vormerken legt einen Eintrag ohne jede Bewertung an. Poster und
     Angaben holt danach dasselbe automatische Nachladen wie bei jedem
     anderen Eintrag. */
  async function watchlistHinzufuegen({ title, poster, year }) {
    const name = (title || "").trim();
    if (!name) return false;
    setBusy(true);
    try {
      const created = await api.create({
        category,
        title: name,
        poster: poster || "",
        posterSource: poster ? "auto" : undefined,
        releaseYear: typeof year === "number" ? year : undefined,
        watchlist: true,
      });
      setItems((prev) => ({ ...prev, [category]: [normalizeEntry(created), ...prev[category]] }));
      setSaveError("");
      return true;
    } catch (e) {
      setSaveError("Nicht vorgemerkt: " + e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function watchlistEntfernen(id) {
    setBusy(true);
    try {
      await api.remove(id);
      setItems((prev) => ({ ...prev, [category]: prev[category].filter((f) => f.id !== id) }));
      setSaveError("");
    } catch (e) {
      setSaveError("Entfernen fehlgeschlagen: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  /* Aus vorgemerkt wird bewertet: derselbe Eintrag behaelt seine ID,
     verliert das Merkmal und bekommt seine Werte. Damit verschwindet er
     aus der Watchlist und steht in der Rangliste. */
  async function watchlistBewerten(id, { title, poster, values, personal, seasons }) {
    const current = (items[category] || []).find((f) => f.id === id);
    if (!current) return;

    // Ein von Hand geaendertes Poster gilt als selbst gesetzt; das
    // automatisch gefundene behaelt seine Herkunft.
    const nextSource = !poster
      ? undefined
      : poster !== current.poster
        ? "manual"
        : current.posterSource;

    setBusy(true);
    try {
      const saved = await api.update(id, {
        ...current,
        category,
        title,
        poster,
        posterSource: nextSource,
        values,
        personal,
        seasons: seasons || [],
        watchlist: false,
      });
      setItems((prev) => ({
        ...prev,
        [category]: prev[category].map((f) => (f.id === id ? normalizeEntry(saved) : f)),
      }));
      setSaveError("");
      setBewerteVorgemerkt(null);
      // Der Eintrag steht jetzt in der Rangliste — dorthin auch zeigen.
      setUnterReiter("bewertet");
      setMode("list");
    } catch (e) {
      setSaveError("Bewertung nicht gespeichert: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateEntry(id, { title, poster, values, personal, seasons }) {
    const current = (items[category] || []).find((f) => f.id === id);
    if (!current) return;

    let nextPoster = poster;
    let nextSource = current.posterSource;
    // Das Backdrop bleibt am Eintrag; es wird nur mit verworfen, wenn
    // der Titel sich aendert und ohnehin neu gesucht wird.
    let nextBackdrop = current.backdrop || "";

    if (poster && poster !== current.poster) {
      nextSource = "manual"; // selbst eingetragen
    } else if (!poster) {
      nextSource = undefined; // geleert -> wieder automatisch suchen
    } else if (current.posterSource === "auto" && title.trim() !== current.title.trim()) {
      // Titel geändert und Poster kam automatisch -> neu suchen lassen
      nextPoster = "";
      nextSource = undefined;
      nextBackdrop = "";
      posterAttempted.current.delete(id);
    }

    /* Jahr, Regie und IMDb-Note gehoeren zum Titel. Bleibt er gleich,
       werden sie unveraendert mitgeschickt — sonst wuerden sie beim
       Speichern geleert. Wird er geaendert, gelten sie nicht mehr und
       werden neu geholt. */
    const titelGeaendert = title.trim() !== current.title.trim();
    if (titelGeaendert) {
      angabenAttempted.current.delete(id);
      vergissOhneAngaben(id);
      genreAttempted.current.delete(id);
      vergissOhneGenre(id);
      laufzeitAttempted.current.delete(id);
      vergissOhneLaufzeit(id);
    }
    /* Fuer die Zusatzdaten und die Laufzeit gilt dasselbe. Beim
       Titelwechsel gehen sie ausdruecklich leer mit — ein fehlendes
       Feld liesse den gespeicherten Wert stehen (siehe angabenColumns
       und laufzeitColumns im Server). */
    const angaben = titelGeaendert
      ? {
          releaseYear: null, director: null, imdbRating: null,
          genre: [], collection: "", studio: "",
          runtimeMinutes: null, episodeRuntime: null, episodeCount: null, episodesPerSeason: [],
        }
      : {
          releaseYear: current.releaseYear,
          director: current.director,
          imdbRating: current.imdbRating,
          genre: current.genre || [],
          collection: current.collection || "",
          studio: current.studio || "",
          runtimeMinutes: current.runtimeMinutes,
          episodeRuntime: current.episodeRuntime,
          episodeCount: current.episodeCount,
          episodesPerSeason: current.episodesPerSeason || [],
        };

    setBusy(true);
    try {
      const saved = await api.update(id, {
        category,
        title,
        poster: nextPoster,
        posterSource: nextSource,
        backdrop: nextBackdrop,
        ...angaben,
        values,
        personal,
        seasons: seasons || [],
        // Der Zaehler gehoert nicht ins Bewertungsformular, muss beim
        // Speichern aber mitgehen — sonst faellt er auf den Startwert
        // zurueck, sobald eine Bewertung geaendert wird.
        watchCount: entryWatchCount(current),
        createdAt: current.createdAt,
      });
      setItems((prev) => ({
        ...prev,
        [category]: prev[category].map((f) => (f.id === id ? normalizeEntry(saved) : f)),
      }));
      setSaveError("");
      setMode("list");
    } catch (e) {
      setSaveError("Änderung nicht gespeichert: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  /* Jahr, Regie und IMDb-Note von Hand setzen oder aendern. Alles
     Uebrige des Eintrags geht unveraendert mit, damit das Speichern
     nichts anderes anfasst. */
  async function angabenSpeichern(id, { releaseYear, director, imdbRating }) {
    const current = (items[category] || []).find((f) => f.id === id);
    if (!current) return;

    setBusy(true);
    try {
      const saved = await api.update(id, {
        ...current,
        seasons: current.seasons || [],
        category,
        releaseYear,
        director,
        imdbRating,
      });
      setItems((prev) => ({
        ...prev,
        [category]: prev[category].map((f) => (f.id === id ? normalizeEntry(saved) : f)),
      }));
      setSaveError("");
      // Was von Hand gesetzt wurde, muss nicht mehr gesucht werden;
      // was geleert wurde, darf wieder gesucht werden.
      if (angabenUnvollstaendig(normalizeEntry(saved))) {
        angabenAttempted.current.delete(id);
        vergissOhneAngaben(id);
      }
    } catch (e) {
      setSaveError("Angaben nicht gespeichert: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  /* Zaehler setzen. Wie beim Speichern der Angaben geht alles Uebrige
     des Eintrags unveraendert mit — dieser Aufruf fasst nur die eine
     Zahl an. */
  async function zaehlerSpeichern(id, wert) {
    const current = (items[category] || []).find((f) => f.id === id);
    if (!current) return;

    const neu = Math.min(WATCH_COUNT_MAX, Math.max(WATCH_COUNT_MIN, Math.round(wert)));
    if (neu === entryWatchCount(current)) return;

    setBusy(true);
    try {
      const saved = await api.update(id, {
        ...current,
        seasons: current.seasons || [],
        category,
        watchCount: neu,
      });
      setItems((prev) => ({
        ...prev,
        [category]: prev[category].map((f) => (f.id === id ? normalizeEntry(saved) : f)),
      }));
      setSaveError("");
    } catch (e) {
      setSaveError("Zähler nicht gespeichert: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(id) {
    setBusy(true);
    try {
      await api.remove(id);
      setItems((prev) => ({ ...prev, [category]: prev[category].filter((f) => f.id !== id) }));
      setSaveError("");
      setConfirmDelete(null);
      setSelectedId(null);
    } catch (e) {
      setSaveError("Löschen fehlgeschlagen: " + e.message);
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  }

  // ---- Poster neu suchen lassen ----
  async function bilderZuruecksetzen(pfad, bezeichnung) {
    setBusy(true);
    try {
      const res = await fetch(pfad, { method: "POST" });
      if (!res.ok) throw new Error("Fehlgeschlagen (" + res.status + ")");
      const data = await res.json();
      // Erneute Suche im Client wieder freigeben. Die Angaben zum Werk
      // haengen am selben Abruf und werden deshalb mit freigegeben —
      // sonst gaebe es keinen Weg, sie noch einmal zu versuchen.
      posterAttempted.current = new Set();
      angabenAttempted.current = new Set();
      genreAttempted.current = new Set();
      laufzeitAttempted.current = new Set();
      nachladeZaehler.current = 0;
      zusatzZaehler.current = 0;
      vergissErfolglose();
      vergissAlleOhneAngaben();
      vergissAlleOhneGenre();
      vergissAlleOhneLaufzeit();
      const fresh = await api.loadAll();
      setItems(Object.fromEntries(CATEGORY_KEYS.map((k) => [k, (fresh[k] || []).map(normalizeEntry)])));
      setSaveError(
        data.zurueckgesetzt + " " + bezeichnung + " werden neu geladen. Das dauert einen Moment."
      );
    } catch (e) {
      setSaveError(bezeichnung + "-Rücksetzung fehlgeschlagen: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  const resetPosters = () => bilderZuruecksetzen("/api/reset-posters", "Poster");

  // ---- Export ----
  function buildExportRows(scopeAll) {
    const cats = scopeAll ? CATEGORIES.map((c) => c.key) : [category];
    const rows = [];
    cats.forEach((catKey) => {
      rankedByCategory[catKey].forEach((f, i) => {
        rows.push({
          kategorie: CATEGORIES.find((c) => c.key === catKey).label,
          position: i + 1,
          titel: f.title,
          poster: f.poster || "",
          backdrop: f.backdrop || "",
          genre: (f.genre || []).join("|"),
          reihe: f.collection || "",
          studio: f.studio || "",
          endnote: f.score,
          staffeln: hasSeasons(f) ? f.seasons.length : 0,
          staffelnoten: hasSeasons(f)
            ? f.seasons.map((sn) => seasonScore(sn, catKey).toFixed(2)).join("|")
            : "",
          staffelgewichteProzent: hasSeasons(f)
            ? f.seasons.map((sn) => seasonPercent(sn)).join("|")
            : "",
          kriterienNote: entryCriteriaScore(f, catKey),
          bauchgefuehl: f.personal,
          erstelltAm: f.createdAt ? new Date(f.createdAt).toISOString() : "",
          ...Object.fromEntries(criteriaFor(catKey).map((c) => [c.key, f.values[c.key]])),
        });
      });
    });
    return rows;
  }

  /* Die Sammlung fuers Backup. Jede Staffel bekommt ihre Gewichtung
     zusaetzlich in Prozent; der Faktor bleibt daneben stehen, damit
     eine aeltere Fassung der App die Datei weiterhin lesen kann. */
  function exportData() {
    return Object.fromEntries(
      CATEGORY_KEYS.map((k) => [
        k,
        (items[k] || []).map((f) =>
          hasSeasons(f)
            ? {
                ...f,
                seasons: f.seasons.map((sn) => ({
                  ...sn,
                  weight: seasonWeight(sn),
                  weightPercent: seasonPercent(sn),
                })),
              }
            : f
        ),
      ])
    );
  }

  function doExport(scopeAll) {
    const rows = buildExportRows(scopeAll);
    const scopeName = scopeAll ? "alle" : category;
    if (exportFormat === "json") {
      const payload = {
        exportedAt: new Date().toISOString(),
        scope: scopeName,
        data: exportData(),
        headerImages: headerImages.map((b) => b.url),
      };
      downloadFile(`bewertungen-${scopeName}-${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json");
    } else {
      const headers = ["kategorie", "position", "titel", "poster", "backdrop", "staffeln", "staffelnoten", "staffelgewichteProzent", "genre", "reihe", "studio", "endnote", "kriterienNote", "bauchgefuehl", "erstelltAm", ...ALL_CRITERIA_KEYS];
      const lines = [headers.join(";")];
      rows.forEach((r) => {
        lines.push(headers.map((h) => csvEscape(r[h])).join(";"));
      });
      downloadFile(`bewertungen-${scopeName}-${Date.now()}.csv`, lines.join("\n"), "text/csv");
    }
  }

  // ---- Import ----
  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const data = parsed && parsed.data ? parsed.data : parsed;
        const cleaned = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, []]));
        let totalValid = 0;
        for (const catKey of CATEGORY_KEYS) {
          const arr = Array.isArray(data[catKey]) ? data[catKey] : [];
          for (const entry of arr) {
            // Vorgemerkte Eintraege haben keine Werte — sie waeren sonst
            // beim Einspielen eines Backups stillschweigend verloren.
            const vorgemerkt = !!(entry && entry.watchlist === true);
            if (
              entry &&
              typeof entry.title === "string" &&
              entry.title.trim() &&
              (vorgemerkt ||
                (entry.values &&
                  isValuesComplete(entry.values, catKey) &&
                  typeof entry.personal === "number" &&
                  entry.personal >= 0 &&
                  entry.personal <= 10))
            ) {
              cleaned[catKey].push({
                watchlist: vorgemerkt,
                id: entry.id || catKey + "_import_" + Date.now() + "_" + totalValid,
                category: catKey,
                title: entry.title.trim(),
                poster: typeof entry.poster === "string" ? entry.poster : "",
                backdrop: typeof entry.backdrop === "string" ? entry.backdrop : "",
                // Angaben zum Werk aus dem Backup uebernehmen; aeltere
                // Sicherungen haben sie nicht, dann werden sie
                // nachgeladen wie bei jedem anderen Eintrag auch.
                releaseYear: typeof entry.releaseYear === "number" ? entry.releaseYear : null,
                director: typeof entry.director === "string" ? entry.director : null,
                imdbRating: typeof entry.imdbRating === "number" ? entry.imdbRating : null,
                seasons: vorgemerkt ? [] : gueltigeStaffeln(entry.seasons, catKey),
                // Zusatzdaten aus dem Backup; fehlen sie, werden sie wie
                // bei jedem anderen Eintrag nachgeladen.
                genre: Array.isArray(entry.genre) ? entry.genre.filter((g) => typeof g === "string") : [],
                collection: typeof entry.collection === "string" ? entry.collection : null,
                studio: typeof entry.studio === "string" ? entry.studio : null,
                values: vorgemerkt ? emptyValues(catKey) : entry.values,
                personal: vorgemerkt ? null : entry.personal,
                createdAt: entry.createdAt || Date.now(),
                updatedAt: entry.updatedAt || Date.now(),
              });
              totalValid++;
            }
          }
        }
        // Kopfbilder sind optional — aeltere Backups haben sie nicht.
        const kopfbilder = Array.isArray(parsed && parsed.headerImages)
          ? parsed.headerImages.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u.trim()))
          : [];

        if (totalValid === 0 && !kopfbilder.length) {
          setImportError("Die Datei enthält keine gültigen Einträge. Import wurde abgebrochen.");
          setImportPreview(null);
        } else {
          setImportError("");
          setImportPreview({ cleaned, count: totalValid, kopfbilder });
        }
      } catch (err) {
        setImportError("Diese Datei ist kein gültiges JSON-Backup und konnte nicht gelesen werden.");
        setImportPreview(null);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function confirmImport() {
    if (!importPreview) return;
    setBusy(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const catKey of CATEGORY_KEYS) {
        for (const entry of importPreview.cleaned[catKey]) {
          try {
            const created = await api.create({ ...entry, category: catKey, id: undefined });
            setItems((prev) => ({ ...prev, [catKey]: [normalizeEntry(created), ...prev[catKey]] }));
            ok++;
          } catch (e) {
            failed++;
          }
        }
      }
      // Kopfbilder ergaenzen, ohne bestehende zu doppeln.
      let bilderNeu = 0;
      const vorhanden = new Set(headerImages.map((b) => b.url));
      for (const url of importPreview.kopfbilder || []) {
        if (vorhanden.has(url)) continue;
        if (await headerBildHinzufuegen(url)) {
          vorhanden.add(url);
          bilderNeu++;
        }
      }

      const meldungen = [];
      if (failed) meldungen.push(ok + " Einträge importiert, " + failed + " fehlgeschlagen.");
      if (bilderNeu) meldungen.push(bilderNeu + " Kopfbilder übernommen.");
      setSaveError(meldungen.join(" "));
    } finally {
      setBusy(false);
      setImportPreview(null);
    }
  }

  const editingEntry = mode === "edit" && selectedEntry ? selectedEntry : null;

  return (
    <div style={{ "--accent": accent, minHeight: "100vh", background: "#17171A", color: "#EDEAE3", fontFamily: "'Inter', system-ui, sans-serif", padding: "0 0 60px 0" }}>
      <style>{`
        input[type=range] { -webkit-appearance: none; background: transparent; }
        input[type=range]::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: #2A2A2E; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; margin-top: -9px; width: 24px; height: 24px; border-radius: 50%; background: var(--accent, #C9A227); border: 3px solid #17171A; }
        input[type=range]::-moz-range-track { height: 6px; border-radius: 3px; background: #2A2A2E; }
        input[type=range]::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: var(--accent, #C9A227); border: 3px solid #17171A; }

        /* Bildwechsel im Kopfbereich: alt nach links hinaus,
           neu von rechts herein. */
        @keyframes backdropIn  { from { transform: translateX(100%); }  to { transform: translateX(0); } }
        @keyframes backdropOut { from { transform: translateX(0); } to { transform: translateX(-100%); } }
        .backdrop-in  { animation: backdropIn  850ms cubic-bezier(0.33, 0, 0.15, 1) both; }
        .backdrop-out { animation: backdropOut 850ms cubic-bezier(0.33, 0, 0.15, 1) both; }

        @media (prefers-reduced-motion: reduce) {
          .backdrop-layer { animation: none !important; transform: none !important; }
        }

        input:focus, button:focus-visible, input:focus-visible {
          outline: 2px solid var(--accent, #C9A227);
          outline-offset: 1px;
        }

        /* Fuenf Tabs muessen auch auf schmalen Displays hineinpassen.
           Ohne min-width: 0 koennen Flex-Elemente nicht unter ihre
           Textbreite schrumpfen und die Leiste laeuft ueber. */
        .tab-btn {
          flex: 1 1 0;
          min-width: 0;
          padding: 13px 6px;
          font-size: 13.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        @media (max-width: 400px) {
          .tab-btn { font-size: 11.5px; padding: 13px 3px; }
          .tab-emoji { display: none; }
        }

        /* Fester 16:9-Ausschnitt ueber die volle Breite. Der Inhalt sitzt
           unten; reicht er einmal tiefer als 16:9 hergeben, waechst der
           Bereich mit, damit nichts abgeschnitten wird. */
        .kopfbereich { aspect-ratio: 16 / 9; }
        @supports not (aspect-ratio: 16 / 9) {
          .kopfbereich { min-height: 56.25vw; }
        }
      `}</style>

      {/* Header — mit laufendem Poster-Hintergrund */}
      <div
        className="kopfbereich"
        style={{
          position: "relative",
          overflow: "hidden",
          borderBottom: "1px solid #2A2A2E",
          background: "linear-gradient(180deg, #1D1D21 0%, #17171A 100%)",
          // Der Inhalt sitzt unten; die zusaetzliche Hoehe kommt oben
          // dazu und zeigt mehr vom Bild.
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <HeaderSlideshow urls={headerImages.map((b) => b.url)} />

        <div style={{ position: "relative", zIndex: 1, padding: "32px 20px 0" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 34, margin: 0, lineHeight: 1.08 }}>
              <span style={{ display: "block" }}>Rifat's</span>
              <span style={{ display: "block" }}>Archiv</span>
            </h1>
            <p style={{ color: "#9A968C", marginTop: 10, fontSize: 14.5, lineHeight: 1.5, marginBottom: 20 }}>
              {activeTab === "stats"
                ? `${gesamtAnzahl} ${gesamtAnzahl === 1 ? "Eintrag" : "Einträge"}`
                : `${currentList.length} ${catInfo.label}`}
            </p>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 0 }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => {
                  setCategory(c.key);
                  setActiveTab(c.key);
                  setMode("list");
                  setUnterReiter("bewertet");
                  setSelectedId(null);
                  setSearch("");
                  /* Genre, Jahrzehnt, Regie und Reihe gehoeren zur
                     Kategorie, aus der sie stammen — ein Filmgenre in
                     den Serien liesse die Liste ohne ersichtlichen
                     Grund leer aussehen. Notenbereich und Sortierung
                     bleiben wie bisher stehen. */
                  setFilterState((f) => ({ ...f, genre: "", jahrzehnt: "", regie: "", reihe: "" }));
                }}
                className="tab-btn"
                style={{
                  background: activeTab === c.key ? "var(--accent, #C9A227)" : "transparent",
                  color: activeTab === c.key ? "#17171A" : "#9A968C",
                  border: activeTab === c.key ? "none" : "1px solid #2A2A2E",
                  borderBottom: activeTab === c.key ? "none" : "1px solid #2A2A2E",
                  borderRadius: "8px 8px 0 0", fontWeight: 700, cursor: "pointer",
                }}
              >
                {c.label}
              </button>
            ))}
            {/* Die Statistik ist keine Kategorie und behaelt deshalb das
                neutrale Gold — sie spannt alle Kategorien. */}
            <button
              onClick={() => setActiveTab("stats")}
              className="tab-btn"
              style={{
                background: activeTab === "stats" ? "#C9A227" : "transparent",
                color: activeTab === "stats" ? "#17171A" : "#9A968C",
                border: activeTab === "stats" ? "none" : "1px solid #2A2A2E",
                borderBottom: activeTab === "stats" ? "none" : "1px solid #2A2A2E",
                borderRadius: "8px 8px 0 0", fontWeight: 700, cursor: "pointer",
              }}
            >
              <span className="tab-emoji">📊 </span>Statistik
            </button>
            </div>
          </div>
        </div>
      </div>

      {activeTab === "stats" ? (
        <StatsPage ranked={rankedByCategory} watchlist={watchlistByCategory} />
      ) : (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px" }}>
          {saveError && (
            <div style={{ background: "#2a1616", border: "1px solid #d9736a", color: "#d9736a", borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              {saveError}
            </div>
          )}

          {!loaded && (
            <div style={{ color: "#9A968C", fontSize: 13, marginBottom: 16 }}>
              Bewertungen werden geladen…
            </div>
          )}

          {busy && (
            <div style={{ color: "var(--accent, #C9A227)", fontSize: 13, marginBottom: 16 }}>
              Wird gespeichert…
            </div>
          )}

          {mode === "suche" && (
            <NeuerEintrag
              category={category}
              categoryLabel={catInfo.singular}
              busy={busy}
              onWatchlist={(t) => watchlistHinzufuegen({ title: t.title, poster: t.poster, year: t.year })}
              onBewerten={(t) => { setGewaehlterTreffer(t); setMode("form"); }}
              onCancel={() => setMode("list")}
            />
          )}

          {mode === "form" && (
            <RatingForm
              category={category}
              categoryLabel={catInfo.singular}
              initialTitle={gewaehlterTreffer ? gewaehlterTreffer.title : ""}
              initialPoster={gewaehlterTreffer ? gewaehlterTreffer.poster || "" : ""}
              onSave={addEntry}
              onCancel={() => { setGewaehlterTreffer(null); setMode("list"); }}
            />
          )}

          {mode === "watchlist-form" && bewerteVorgemerkt && (
            <RatingForm
              category={category}
              categoryLabel={catInfo.singular}
              initialTitle={bewerteVorgemerkt.title}
              initialPoster={bewerteVorgemerkt.poster}
              onSave={(payload) => watchlistBewerten(bewerteVorgemerkt.id, payload)}
              onCancel={() => { setBewerteVorgemerkt(null); setMode("list"); }}
            />
          )}

          {mode === "edit" && editingEntry && (
            <RatingForm
              category={category}
              categoryLabel={catInfo.singular}
              initialTitle={editingEntry.title}
              initialPoster={editingEntry.poster}
              initialValues={editingEntry.values}
              initialPersonal={editingEntry.personal}
              initialSeasons={editingEntry.seasons}
              onSave={(payload) => updateEntry(editingEntry.id, payload)}
              onCancel={() => setMode("list")}
            />
          )}

          {mode === "list" && (
            <>
              {/* Unter-Reiter: bewertete Eintraege oder Watchlist. */}
              <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                {[
                  { key: "bewertet", label: "Bewertet" },
                  {
                    key: "watchlist",
                    label:
                      merklisteLabel(category) +
                      (watchlistList.length ? " · " + watchlistList.length : ""),
                  },
                ].map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setUnterReiter(r.key)}
                    aria-pressed={unterReiter === r.key}
                    style={{
                      padding: "9px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                      background: unterReiter === r.key ? "var(--accent, #C9A227)" : "transparent",
                      color: unterReiter === r.key ? "#17171A" : "#9A968C",
                      border: "1px solid " + (unterReiter === r.key ? "var(--accent, #C9A227)" : "#33333a"),
                      fontWeight: unterReiter === r.key ? 700 : 400,
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setMode("suche")}
                style={{ width: "100%", padding: "16px", background: "var(--accent, #C9A227)", color: "#17171A", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15.5, cursor: "pointer", marginBottom: 20 }}
              >
                + Neu hinzufügen
              </button>
            </>
          )}

          {mode === "list" && unterReiter === "watchlist" && (
            <>
              <div style={{ fontSize: 12.5, color: "#77746c", marginBottom: 14 }}>
                {watchlistList.length === 0
                  ? category === "game"
                    ? "Nichts im Backlog."
                    : "Nichts vorgemerkt."
                  : watchlistList.length +
                    (category === "game"
                      ? watchlistList.length === 1 ? " Eintrag im Backlog" : " Einträge im Backlog"
                      : watchlistList.length === 1 ? " Eintrag vorgemerkt" : " Einträge vorgemerkt")}
              </div>
              {watchlistList.length === 0 ? (
                <div style={{ color: "#77746c", textAlign: "center", padding: 50, fontSize: 14.5 }}>
                  {category === "game"
                    ? "Der Backlog ist leer."
                    : "Noch nichts vorgemerkt."}{" "}
                  Über „+ Neu hinzufügen" kannst du Titel{" "}
                  {category === "game" ? "in den Backlog" : "auf die Watchlist"} setzen,
                  ohne sie schon zu bewerten.
                </div>
              ) : (
                watchlistList.map((f) => (
                  <WatchlistZeile
                    key={f.id}
                    eintrag={f}
                    busy={busy}
                    merkliste={merklisteLabel(category)}
                    onBewerten={() => { setBewerteVorgemerkt(f); setMode("watchlist-form"); }}
                    onEntfernen={() => watchlistEntfernen(f.id)}
                  />
                ))
              )}

              {/* Vorschlaege aus dem eigenen Geschmacksprofil. Bei
                  Spielen entfaellt der Abschnitt: SteamGridDB ist eine
                  Bilddatenbank und kennt keine Genres. */}
              {category !== "game" && (
                <Empfehlungen
                  category={category}
                  profil={empfehlungsProfil}
                  bekannt={bekannteTitel}
                  busy={busy}
                  onWatchlist={(v) =>
                    watchlistHinzufuegen({ title: v.title, poster: v.poster, year: v.year })
                  }
                />
              )}
            </>
          )}

          {mode === "list" && unterReiter === "bewertet" && (
            <>
              {/* Suchzeile: Feld schrumpft mit (minWidth 0), die drei
                  Knoepfe bleiben als Symbole in fester Breite — so passt
                  die Zeile auch auf schmale Displays ohne Querscrollen. */}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  type="text"
                  placeholder={`${catInfo.label} durchsuchen...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ flex: "1 1 auto", minWidth: 0, background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 8, padding: "13px 12px", color: "#EDEAE3", fontSize: 15, boxSizing: "border-box" }}
                />
                <IconButton title="Filter" label="⚙" active={isFilterActive} onClick={() => setShowFilter(true)} />
                <IconButton title="Sortieren" label="↓↑" active={isSortActive} onClick={() => setShowSort(true)} />
                <IconButton title="Daten (Export & Import)" label="⤓" active={showExport} onClick={() => setShowExport((v) => !v)} />
              </div>

              <div style={{ fontSize: 12.5, color: "#77746c", marginBottom: 14 }}>
                {filtered.length} von {currentList.length} {catInfo.label}
              </div>

              {showExport && (
                <div style={{ background: "#141416", border: "1px solid var(--accent, #C9A227)", borderRadius: 8, padding: 16, marginBottom: 18 }}>
                  <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>
                    EXPORT & BACKUP
                  </div>

                  <div style={{ borderBottom: "1px solid #2A2A2E", paddingBottom: 14, marginBottom: 14 }}>
                    <button
                      onClick={resetPosters}
                      disabled={busy}
                      style={{
                        width: "100%", padding: "12px", borderRadius: 8, fontSize: 14,
                        background: "transparent", color: "var(--accent, #C9A227)",
                        border: "1px solid var(--accent, #C9A227)", cursor: "pointer", fontWeight: 600,
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      Poster neu suchen
                    </button>
                    <div style={{ fontSize: 11, color: "#77746c", marginTop: 8, lineHeight: 1.5 }}>
                      Verwirft automatisch gefundene Poster und sucht sie neu.
                      Selbst eingetragene Poster und alle Bewertungen bleiben erhalten.
                    </div>

                    {/* Bilder des Kopfbereichs — von Hand gepflegt. */}
                    <div style={{ borderTop: "1px solid #2A2A2E", marginTop: 14, paddingTop: 14 }}>
                      <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
                        BILDER IM KOPFBEREICH
                      </div>
                      <div style={{ fontSize: 11, color: "#77746c", marginBottom: 10, lineHeight: 1.5 }}>
                        Adressen von Bildern, die oben im Kopf angezeigt werden.
                        Mehrere wechseln alle 8 Sekunden. Für diesen Bereich
                        gibt es keine automatische Suche.
                      </div>

                      <HeaderBildFormular onAdd={headerBildHinzufuegen} busy={busy} />
                      {headerFehler && (
                        <div style={{ color: "#d9736a", fontSize: 12.5, marginTop: 8 }}>{headerFehler}</div>
                      )}

                      {headerImages.length === 0 ? (
                        <div style={{ fontSize: 11.5, color: "#55524c", marginTop: 10 }}>
                          Noch keine Bilder hinterlegt — der Kopfbereich bleibt dunkel.
                        </div>
                      ) : (
                        <div style={{ marginTop: 10 }}>
                          {headerImages.map((bild) => (
                            <div
                              key={bild.id}
                              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #232326" }}
                            >
                              <div
                                style={{
                                  width: 48, height: 27, flexShrink: 0, borderRadius: 4,
                                  background: "#141416 center/cover no-repeat",
                                  backgroundImage: `url("${bild.url}")`,
                                }}
                              />
                              <span
                                title={bild.url}
                                style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: "#9A968C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                              >
                                {bild.url}
                              </span>
                              <button
                                onClick={() => headerBildLoeschen(bild.id)}
                                title="Bild entfernen"
                                aria-label="Bild entfernen"
                                style={{ background: "transparent", border: "none", color: "#d9736a", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1, flexShrink: 0 }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Woher die Daten stammen. */}
                    <div style={{ fontSize: 11, color: "#77746c", marginTop: 14, lineHeight: 1.7 }}>
                      Poster- und Bilddaten von{" "}
                      <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" style={quellenLink}>TMDB</a>
                      {", "}
                      <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer" style={quellenLink}>TVMaze</a>
                      {", "}
                      <a href="https://jikan.moe" target="_blank" rel="noreferrer" style={quellenLink}>Jikan</a>
                      {" und "}
                      <a href="https://www.steamgriddb.com" target="_blank" rel="noreferrer" style={quellenLink}>SteamGridDB</a>
                      {". Notendaten zum Vergleich von "}
                      <a href="https://www.omdbapi.com" target="_blank" rel="noreferrer" style={quellenLink}>OMDb</a>
                      {" ("}
                      <a href="https://www.imdb.com" target="_blank" rel="noreferrer" style={quellenLink}>IMDb</a>
                      {")."}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button
                      onClick={() => setExportFormat("json")}
                      style={{ flex: 1, padding: "10px", borderRadius: 6, fontSize: 13, cursor: "pointer", background: exportFormat === "json" ? "var(--accent, #C9A227)" : "transparent", color: exportFormat === "json" ? "#17171A" : "#9A968C", border: "1px solid " + (exportFormat === "json" ? "var(--accent, #C9A227)" : "#33333a"), fontWeight: 700 }}
                    >
                      JSON (Backup)
                    </button>
                    <button
                      onClick={() => setExportFormat("csv")}
                      style={{ flex: 1, padding: "10px", borderRadius: 6, fontSize: 13, cursor: "pointer", background: exportFormat === "csv" ? "var(--accent, #C9A227)" : "transparent", color: exportFormat === "csv" ? "#17171A" : "#9A968C", border: "1px solid " + (exportFormat === "csv" ? "var(--accent, #C9A227)" : "#33333a"), fontWeight: 700 }}
                    >
                      CSV (Tabelle)
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <button onClick={() => doExport(false)} style={{ flex: 1, padding: "12px", background: "#2A2A2E", color: "#EDEAE3", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13.5 }}>
                      Nur {catInfo.label} exportieren
                    </button>
                    <button onClick={() => doExport(true)} style={{ flex: 1, padding: "12px", background: "#2A2A2E", color: "#EDEAE3", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13.5 }}>
                      Alles exportieren
                    </button>
                  </div>
                  <div style={{ borderTop: "1px solid #2A2A2E", paddingTop: 14 }}>
                    <div style={{ fontSize: 12, color: "#9A968C", marginBottom: 8 }}>
                      JSON-Backup wieder einspielen (bestehende Einträge bleiben erhalten, es werden nur neue hinzugefügt):
                    </div>
                    <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: "none" }} />
                    <button
                      onClick={() => fileInputRef.current && fileInputRef.current.click()}
                      style={{ width: "100%", padding: "12px", background: "transparent", color: "var(--accent, #C9A227)", border: "1px dashed var(--accent, #C9A227)", borderRadius: 6, cursor: "pointer", fontSize: 13.5 }}
                    >
                      JSON-Datei importieren
                    </button>
                    {importError && <div style={{ color: "#d9736a", fontSize: 12.5, marginTop: 8 }}>{importError}</div>}
                  </div>
                </div>
              )}

              {/* Liste */}
              <div>
                {filtered.map((f, i) => (
                  <div
                    key={f.id}
                    onClick={() => { setSelectedId(f.id); setMode("list"); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 4px", borderBottom: "1px solid #232326", gap: 10, cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#55524c", width: 22, textAlign: "right", flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <Poster url={f.poster} title={f.title} size={34} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</div>
                        <AngabenZeile eintrag={f} />
                      </div>
                    </div>
                    <ScoreBadge score={f.score} />
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div style={{ color: "#77746c", textAlign: "center", padding: 50, fontSize: 14.5 }}>
                    {search.trim() || isFilterActive ? "Nichts gefunden." : `Noch keine ${catInfo.label} bewertet.`}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {selectedEntry && mode === "list" && activeTab !== "stats" && (
        <DetailView
          entry={selectedEntry}
          category={category}
          singular={catInfo.singular}
          busy={busy}
          onBack={() => setSelectedId(null)}
          onEdit={() => setMode("edit")}
          onDelete={() => setConfirmDelete(selectedEntry.id)}
          onSaveAngaben={(werte) => angabenSpeichern(selectedEntry.id, werte)}
          onSaveWatchCount={(n) => zaehlerSpeichern(selectedEntry.id, n)}
        />
      )}

      {showSort && (
        <SortSheet
          initial={filterState}
          onApply={(f) => setFilterState(f)}
          onClose={() => setShowSort(false)}
        />
      )}

      {showFilter && (
        <FilterSheet
          initial={filterState}
          totalCount={currentList.length}
          allInCategory={currentList}
          category={category}
          onApply={(f) => { setFilterState(f); setShowFilter(false); }}
          onClose={() => setShowFilter(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Eintrag löschen?"
          text="Dieser Eintrag wird endgültig entfernt und kann nicht wiederhergestellt werden."
          confirmLabel="Löschen"
          danger
          onConfirm={() => deleteEntry(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {importPreview && (
        <ConfirmDialog
          title="Backup importieren?"
          text={
            `${importPreview.count} gültige Einträge wurden in der Datei gefunden.` +
            (importPreview.kopfbilder && importPreview.kopfbilder.length
              ? ` Dazu ${importPreview.kopfbilder.length} Bilder für den Kopfbereich.`
              : "") +
            " Sie werden zu deinen bestehenden Bewertungen hinzugefügt, nichts wird überschrieben."
          }
          confirmLabel="Importieren"
          onConfirm={confirmImport}
          onCancel={() => setImportPreview(null)}
        />
      )}
    </div>
  );
}
