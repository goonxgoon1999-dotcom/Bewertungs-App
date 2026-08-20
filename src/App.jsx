import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";

/* ============================================================
   APP-NAME — die eine Stelle, an der der Name steht

   Der Name im Kopfbereich kommt aus der Umgebungsvariablen
   VITE_APP_NAME. Wer das Repo forkt, setzt sie einmal — lokal in
   einer .env-Datei (Vorlage: .env.example), bei Vercel unter
   Settings -> Environment Variables — und muss dafuer keine Zeile
   Code durchsuchen. Ist nichts gesetzt, steht dort weiterhin
   "Rifat's Archiv".

   Zweizeilig bleibt der Titel: Der Name wird am letzten Leerzeichen
   umgebrochen, aus "Rifat's Archiv" werden also unveraendert die
   Zeilen "Rifat's" und "Archiv". Wer den Umbruch selbst setzen will,
   schreibt ihn mit einem senkrechten Strich:
   VITE_APP_NAME="Archiv der|guten Filme".

   `import.meta.env` gibt es nur im Vite-Build. Die Tests laden diese
   Datei direkt in Node, dort fehlt das Feld — daher der Zugriff mit
   Fragezeichen und der Rueckfall auf den Standard.

   Nicht betroffen sind der Browser-Tab-Titel (index.html) und das
   PWA-Manifest (public/manifest.webmanifest): Dort stand der Name
   noch nie, beide tragen den neutralen Text "Dein Bewertungsbogen".
   Das Manifest ist eine statische Datei, die unveraendert
   ausgeliefert wird — sie kann eine Umgebungsvariable nicht selbst
   lesen. Siehe README.
   ============================================================ */
const APP_NAME_STANDARD = "Rifat's Archiv";

const APP_NAME = (() => {
  const gesetzt = import.meta.env?.VITE_APP_NAME;
  const sauber = typeof gesetzt === "string" ? gesetzt.trim() : "";
  return sauber || APP_NAME_STANDARD;
})();

/**
 * Name -> hoechstens zwei Zeilen fuer den Kopfbereich.
 *
 * "Rifat's Archiv"          -> ["Rifat's", "Archiv"]
 * "Archiv der|guten Filme"  -> ["Archiv der", "guten Filme"]
 * "Archiv"                  -> ["Archiv"]
 */
function appNameZeilen(name) {
  const text = (typeof name === "string" ? name : "").trim() || APP_NAME_STANDARD;

  const strich = text.indexOf("|");
  if (strich >= 0) {
    const oben = text.slice(0, strich).trim();
    const unten = text.slice(strich + 1).trim();
    return [oben, unten].filter(Boolean);
  }

  const luecke = text.lastIndexOf(" ");
  if (luecke <= 0) return [text];
  return [text.slice(0, luecke).trim(), text.slice(luecke + 1).trim()];
}

const APP_NAME_ZEILEN = appNameZeilen(APP_NAME);

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

/* Kinderserien haben eigene Kriterien und eigene Gewichte: Was eine
   Kindheitsserie ausmacht, ist nicht dieselbe Frage wie bei einer
   Serie fuer Erwachsene. Sechs statt sieben — ein Schauspiel gibt es
   dort nicht.

   Wie bei Anime wechselt nur die Beschriftung, nicht die Datenspalte:
   gespeichert wird weiterhin in emotion, unterhaltung, inszenierung
   und sound (siehe KIDS_KEYS in api/_db.js). Damit braucht die neue
   Kategorie keine einzige neue Spalte, und die Staffel-Logik gilt
   unveraendert weiter. */
const KIDS_CRITERIA = [
  { key: "emotion", label: "Nostalgie / Wiedersehenswert", weight: 0.20, hint: "Wie gern schaut man es wieder? Was bleibt von damals?" },
  { key: "charaktere", label: "Charaktere", weight: 0.20, hint: "Figuren, die man behalten hat: Eigenheiten, Wiedererkennung" },
  { key: "unterhaltung", label: "Unterhaltung & Humor", weight: 0.20, hint: "Witz, Tempo, Spielfreude — funktioniert es noch?" },
  { key: "story", label: "Story", weight: 0.15, hint: "Handlung und Aufbau der Folgen" },
  { key: "inszenierung", label: "Animation & Optik", weight: 0.15, hint: "Zeichenstil, Figurendesign, Bildgestaltung" },
  { key: "sound", label: "Intro & Musik", weight: 0.10, hint: "Titellied, Themen, Geräuschkulisse" },
];

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
  kids: KIDS_CRITERIA,
  // Adult Animation wird wie Anime bewertet — es ist Animation, die
  // Fragen nach Animationsqualitaet und Synchronstimme sind dieselben.
  adultanim: ANIME_CRITERIA,
  game: GAME_CRITERIA,
};

/** Die Kriterien einer Kategorie — nie global, immer über diese Funktion. */
function criteriaFor(category) {
  return CRITERIA_BY_CATEGORY[category] || AV_CRITERIA;
}

/* Die Reihenfolge hier bestimmt die Reihenfolge ueberall: Tab-Leiste,
   Statistik, Export. Kinderserien und Adult Animation stehen bei den
   uebrigen Serienarten, Spiele bleiben am Ende. */
const CATEGORIES = [
  { key: "movie", label: "Filme", singular: "Film" },
  { key: "series", label: "Serien", singular: "Serie" },
  { key: "anime", label: "Anime", singular: "Anime" },
  { key: "kids", label: "Kinderserien", singular: "Kinderserie" },
  { key: "adultanim", label: "Adult Animation", singular: "Adult Animation" },
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
  kids: "#C4568C",
  adultanim: "#4A7FC1",
  game: "#C4633E",
};

function accentFor(category) {
  return CATEGORY_COLORS[category] || "#C9A227";
}

/* "#RRGGBB" mit Deckkraft — fuer Verlaeufe, die dieselbe Farbe einmal
   sichtbar und einmal unsichtbar brauchen. Bewusst rgba(...,0) statt
   "transparent": manche Browser blenden "transparent" ueber Schwarz
   aus, was den Verlauf grau werden liesse. */
function mitDeckkraft(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`;
}

/* Die klassischen Medaillenfarben der ersten drei Plaetze. Sie stehen
   ueber der Kategoriefarbe: Gold ist Gold, in jeder Kategorie. */
const MEDAILLEN = { 1: "#E8C158", 2: "#D3D7DC", 3: "#D4915A" };

/* ------------------------------------------------------------
   Auszeichnung der Plaetze 1-10 in einer Rangliste.

   Platz 1-3 tragen ihre Medaillenfarbe, Platz 4-10 die Farbe ihrer
   Kategorie — und zwar von Platz 4 zu Platz 10 gleichmaessig
   schwaecher werdend. Ab Platz 11 bleibt alles wie bisher: die
   Rueckgabe ist dann leer und die Zeile ruehrt sich nicht.

   Der Verlauf hinter der Zeile ist absichtlich blass und endet weit vor
   dem Notenschild — er soll den Rang begleiten, nicht den Titel
   einfaerben. Er hat genau einen Hoehepunkt und steigt und faellt
   ringsum: eine gehaltene Flaeche braeche am Poster sichtbar ab, weil
   das Bild sie deckt. Der Hoehepunkt liegt deshalb hinter dem Poster —
   davor waechst die Farbe an, dahinter laeuft sie aus.
   ------------------------------------------------------------ */
const RANG_VERLAUF_HOEHEPUNKT = "22%";
const RANG_VERLAUF_ENDE = "68%";

/* Verlauf einer Rang-Zeile: unsichtbar, ein einzelner Hoehepunkt,
   wieder unsichtbar — alles in derselben Farbe. */
function rangVerlauf(farbe, deckkraft) {
  const unsichtbar = mitDeckkraft(farbe, 0);
  return (
    `linear-gradient(90deg, ${unsichtbar} 0%, ${mitDeckkraft(farbe, deckkraft)} ${RANG_VERLAUF_HOEHEPUNKT}, ` +
    `${unsichtbar} ${RANG_VERLAUF_ENDE})`
  );
}

function rangSchmuck(platz, akzent) {
  if (platz <= 3) {
    const farbe = MEDAILLEN[platz];
    return {
      zahl: { fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 21, color: farbe, lineHeight: 1 },
      verlauf: rangVerlauf(farbe, 0.13),
    };
  }
  if (platz <= 10) {
    // 0 bei Platz 4, 1 bei Platz 10 — dazwischen linear.
    const anteil = (platz - 4) / 6;
    return {
      zahl: { fontSize: 14, color: mitDeckkraft(akzent, 1 - 0.45 * anteil), lineHeight: 1 },
      verlauf: rangVerlauf(akzent, 0.14 - 0.08 * anteil),
    };
  }
  return { zahl: null, verlauf: undefined };
}

/* ------------------------------------------------------------
   Das Podest — Platz 1, 2 und 3 einer Rangliste

   Die vorderen drei Plaetze tragen keinen Farbverlauf mehr, sondern
   eine eigene, lebende Flaeche. Sie liegt wie der Verlauf der Plaetze
   4-10 hinter der ganzen Zeile und reicht bis an den linken
   Bildschirmrand; nur ihr Aussehen steckt jetzt in CSS-Klassen, weil
   es ohne Keyframes nicht geht (siehe den <style>-Block in App).

   Abgestuft ist die Auszeichnung in drei Schritten — Platz 1 ist am
   kraeftigsten, Platz 3 am leisesten:

     1  Iridescent: drei kraeftige Farbflaechen in Pink, Blau und
        Tuerkis, die unruhig gegeneinander wandern (Seegang), dazu
        vier kurz aufblitzende Glanzpunkte.
     2  Champion: glattes, warmes Karminrot mit einem ruhig
        durchziehenden Glanzstreifen.
     3  Diamond: glattes Violett, still — nur die Deckkraft atmet.

   Die Plaetze 4-10 und alles ab 11 fasst das hier nicht an; dafuer
   bleibt rangSchmuck zustaendig.
   ------------------------------------------------------------ */

/* Die Zusatzebenen je Platz. Sie sind leere <span>, die allein ueber
   ihre Klasse gefaerbt und bewegt werden — Platz 3 braucht keine. */
const PODEST_EBENEN = {
  1: [
    "podest1-welle podest1-welle-a",
    "podest1-welle podest1-welle-b",
    "podest1-welle podest1-welle-c",
    "podest1-glanz podest1-glanz-a",
    "podest1-glanz podest1-glanz-b",
    "podest1-glanz podest1-glanz-c",
    "podest1-glanz podest1-glanz-d",
  ],
  2: ["podest2-streifen"],
  3: [],
};

/* Die Rang-Zahl bleibt in Playfair Display und wird von Platz zu Platz
   kleiner: 26 > 23 > 20 — und darunter die 14 der Plaetze ab 4. */
const PODEST_ZAHL = {
  1: { fontSize: 26, color: "#FBE4EE", textShadow: "0 0 12px rgba(255, 190, 225, 0.45)" },
  2: { fontSize: 23, color: "#F2AAB4", textShadow: "0 0 10px rgba(230, 120, 140, 0.35)" },
  3: { fontSize: 20, color: "#C9B0F5", textShadow: "0 0 8px rgba(150, 110, 220, 0.30)" },
};

function podestSchmuck(platz) {
  const zahl = PODEST_ZAHL[platz];
  if (!zahl) return null;
  return {
    zahl: { fontFamily: "'Playfair Display', serif", fontWeight: 800, lineHeight: 1, ...zahl },
    klasse: "podest podest" + platz,
    ebenen: PODEST_EBENEN[platz],
    verlauf: undefined,
  };
}

/* Auszeichnung einer Ranglisten-Zeile: vorne das Podest, dahinter
   unveraendert der Verlauf aus rangSchmuck. */
function zeilenSchmuck(platz, akzent) {
  return podestSchmuck(platz) || rangSchmuck(platz, akzent);
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
   Staffeln (optional, nur bei den Serienarten)

   Ein Eintrag mit Staffeln wird nicht mehr selbst bewertet: seine
   Endnote ist der ungewichtete Durchschnitt der Staffelnoten. Jede
   Staffelnote entsteht nach genau derselben Formel wie bisher.
   --------------------------------------------------------------- */
const SEASON_CATEGORIES = ["series", "anime", "kids", "adultanim"];

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

/* ============================================================
   MINISPIEL "HEAD-TO-HEAD" — Duell zweier Titel

   Ein Duell aendert ausschliesslich das gespeicherte Bauchgefuehl der
   beiden beteiligten Titel. Die Endnote entsteht danach wie immer
   ueber computeFinalScore (75 % Kriterien, 25 % Bauchgefuehl) — an
   der Formel selbst aendert das Minispiel nichts.
   ============================================================ */

/* Skalierung der Erwartung. Beim klassischen Elo steht dort 400, weil
   dessen Zahlen in Tausendern laufen; unsere Noten laufen von 0 bis
   10. S = 2 heisst: zwei Notenpunkte Vorsprung entsprechen einer
   Erwartung von 10:1. */
const ELO_SKALA = 2;

/* Groesste Verschiebung, die ein einzelnes Duell bewirken kann. Der
   erwartete Ausgang bleibt deutlich darunter, die Ueberraschung kommt
   nahe heran. */
const ELO_K = 0.3;

/** Erwartung, dass der erste Titel gewinnt — zwischen 0 und 1. */
function eloErwartung(noteGewinner, noteVerlierer) {
  return 1 / (1 + Math.pow(10, (noteVerlierer - noteGewinner) / ELO_SKALA));
}

/**
 * Verschiebung eines Duells: klein beim erwarteten Ausgang, nahe K bei
 * einer Ueberraschung. Der Gewinner bekommt sie aufgeschlagen, der
 * Verlierer abgezogen.
 */
function eloDelta(noteGewinner, noteVerlierer) {
  return ELO_K * (1 - eloErwartung(noteGewinner, noteVerlierer));
}

/* Bauchgefuehl bleibt eine Note von 0 bis 10 — auf zwei Nachkomma-
   stellen, wie jede andere gerechnete Note in der App auch. */
function begrenzteNote(wert) {
  return Math.round(Math.min(10, Math.max(0, wert)) * 100) / 100;
}

/**
 * Bauchgefuehl eines Eintrags um `delta` verschieben.
 *
 * Bei Eintraegen mit Staffeln steht das Bauchgefuehl je Staffel und
 * die Endnote ist deren gewichtetes Mittel — dort wandert deshalb jede
 * Staffel um denselben Betrag, und der Wert am Eintrag zieht auf das
 * neue Mittel nach. Genau das tut auch das Bewertungsformular beim
 * Speichern, der Datensatz bleibt also in sich stimmig.
 *
 * Zurueck kommt null, wenn es nichts zu verschieben gibt.
 */
function mitVerschobenemBauchgefuehl(entry, delta) {
  if (!hasSeasons(entry)) {
    if (typeof entry.personal !== "number") return null;
    return { personal: begrenzteNote(entry.personal + delta), seasons: [] };
  }
  const seasons = entry.seasons.map((sn) =>
    typeof sn.personal === "number" ? { ...sn, personal: begrenzteNote(sn.personal + delta) } : sn
  );
  const personal = entryPersonal({ ...entry, seasons });
  if (typeof personal !== "number") return null;
  return { personal: begrenzteNote(personal), seasons };
}

/* Wie weit der Gegner in der Rangliste hoechstens entfernt sein darf.
   Ein Duell zwischen Platz 2 und Platz 40 sagt wenig: der Ausgang
   waere ohnehin klar und die Verschiebung entsprechend winzig.
   Innerhalb weniger Plaetze liegen die Endnoten dicht beieinander —
   dort traegt die Wahl echte Auskunft. */
const DUELL_FENSTER = 5;

/* Ab zwei bewerteten Titeln laesst sich in einer Kategorie spielen. */
const MIN_DUELL_TEILNEHMER = 2;

/* Wie viele der zuletzt gespielten Paarungen gesperrt bleiben. Nur die
   unmittelbar vorige zu sperren genuegte nicht: in einer kleinen
   Kategorie stand dieselbe Begegnung schon nach einem Zug wieder da.
   Deutlich mehr zu sperren bringt nichts — bei wenigen Titeln gibt es
   schlicht nicht genug verschiedene Paarungen, und dann greift ohnehin
   der Ausweg unten. */
const DUELL_VERLAUF = 3;

/* So oft wird gezogen, bis eine freie Paarung dasteht. Mit nur einer
   gesperrten Paarung genuegten zwoelf Versuche; seit drei gesperrt
   sind, ist das Fenster enger und der Ausweg unten sprang bei vier
   Titeln gelegentlich an (rund einer von zehntausend Zuegen). Mit dem
   doppelten Vorrat an Versuchen faellt das unter jede spuerbare
   Schwelle, ohne dass sich an der Ziehung selbst etwas aendert. */
const DUELL_VERSUCHE = 24;

/* Eine Paarung ist dieselbe, egal wer links steht. */
function paarungsSchluessel(a, b) {
  return String(a) < String(b) ? a + "|" + b : b + "|" + a;
}

/**
 * Zwei Titel fuer ein Duell ziehen: ein zufaelliger Anker aus der nach
 * Endnote sortierten Liste, der Gegner aus dem Fenster um ihn herum.
 * Welcher der beiden links steht, wird gelost — sonst saesse der Anker
 * immer auf derselben Seite.
 *
 * `verlauf` sind die zuletzt gezogenen Paarungen als Paare von IDs,
 * die juengste zuletzt. Keine davon soll gleich wieder drankommen.
 *
 * Zwei Sperren, die nicht verhandelbar sind:
 *  - Ein Titel tritt nie gegen sich selbst an. Die Indizes sind zwar
 *    schon verschieden, aber zwei Plaetze der Liste koennten denselben
 *    Eintrag fuehren — die IDs entscheiden.
 *  - Findet sich im Fenster nichts Freies, ist der Ausweg immer noch
 *    eine Paarung, die wenigstens nicht die unmittelbar vorige ist.
 *    Bei genau zwei Titeln bleibt es zwangslaeufig beim einzigen
 *    moeglichen Paar.
 */
function ziehePaarung(liste, verlauf, zufall = Math.random) {
  if (!Array.isArray(liste) || liste.length < MIN_DUELL_TEILNEHMER) return null;

  const gesperrt = (Array.isArray(verlauf) ? verlauf : [])
    .filter((eintrag) => Array.isArray(eintrag) && eintrag.length === 2)
    .map((eintrag) => paarungsSchluessel(eintrag[0], eintrag[1]));
  const vorige = gesperrt.length ? gesperrt[gesperrt.length - 1] : null;

  let ersatz = null;
  let zuletztGezogen = null;
  for (let versuch = 0; versuch < DUELL_VERSUCHE; versuch++) {
    const ankerIndex = Math.floor(zufall() * liste.length);
    const von = Math.max(0, ankerIndex - DUELL_FENSTER);
    const bis = Math.min(liste.length - 1, ankerIndex + DUELL_FENSTER);

    const kandidaten = [];
    for (let i = von; i <= bis; i++) if (i !== ankerIndex) kandidaten.push(i);
    if (!kandidaten.length) continue;

    const gegnerIndex = kandidaten[Math.floor(zufall() * kandidaten.length)];
    const gezogen = [liste[ankerIndex], liste[gegnerIndex]];
    if (!gezogen[0] || !gezogen[1] || gezogen[0].id === gezogen[1].id) continue;

    const paar = zufall() < 0.5 ? gezogen : [gezogen[1], gezogen[0]];
    const schluessel = paarungsSchluessel(paar[0].id, paar[1].id);
    zuletztGezogen = paar;

    if (!gesperrt.includes(schluessel)) return paar;
    if (!ersatz && schluessel !== vorige) ersatz = paar;
  }
  return ersatz || zuletztGezogen;
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
  // "kurz" oder "episch" — siehe Stimmungsfilter weiter unten.
  stimmung: "",
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

/* ------------------------------------------------------------
   Stimmungsfilter — "kurz & leicht" oder "episch & lang"

   Die Einstufung entsteht aus zwei Signalen, die je einen Punkt
   beisteuern:

     Laenge  -1 kurz, 0 mittel, +1 lang   (aus der vorhandenen Laufzeit)
     Ton     -1 leicht, 0 gemischt, +1 schwer (aus den Genres)

   Die Summe entscheidet: -2 oder -1 heisst "kurz & leicht", +1 oder +2
   "episch & lang", 0 heisst keins von beidem. Ein 100-Minuten-Drama
   faellt damit aus beiden Optionen — kurz ja, leicht nein —, eine
   100-Minuten-Komoedie landet bei "kurz & leicht", und ein
   170-Minuten-Fantasyfilm bei "episch & lang".

   Zwei Signale statt einem, weil die Laufzeit allein den Unterschied
   zwischen "lang und schwer" und "lang und leicht" verliert — und
   genau der ist gemeint, wenn man abends etwas sucht.

   Eintraege ohne bekannte Laufzeit lassen sich nicht einstufen und
   erscheinen in keiner der beiden Optionen. Spiele auch nicht: fuer
   sie gibt es keine abrufbare Dauer.
   ------------------------------------------------------------ */
const STIMMUNG_KURZ = "kurz";
const STIMMUNG_EPISCH = "episch";

const STIMMUNG_OPTIONEN = [
  { wert: STIMMUNG_KURZ, label: "kurz & leicht" },
  { wert: STIMMUNG_EPISCH, label: "episch & lang" },
];

/* Schwellen fuer die Laenge. Filme in Minuten, Serienarten in Stunden
   ueber die ganze Laufzeit — eine Serie mit zehn Stunden ist ein
   langer Abend, ein Film mit zehn Stunden gibt es nicht.

   Die Werte sind gesetzt, nicht gemessen: Die Sammlung liegt in der
   Datenbank und nicht im Quelltext. 110 Minuten ist die uebliche
   Laenge einer Komoedie, 150 die Schwelle, ab der ein Film als lang
   gilt; bei Serien sind zehn Stunden ein Wochenende und dreissig eine
   Verpflichtung. */
const FILM_KURZ_MIN = 110;
const FILM_LANG_MIN = 150;
const SERIE_KURZ_MIN = 10 * 60;
const SERIE_LANG_MIN = 30 * 60;

/* Eine kurze Episodenlaenge macht auch eine laengere Serie leicht
   wegzuschauen — solange die Gesamtlaufzeit nicht ohnehin ins Epische
   geht. */
const EPISODE_KURZ_MIN = 30;

/* Genres, die den Ton angeben. Beide Sprachen, weil TMDB auf Deutsch
   antwortet und Jikan auf Englisch. Was in keiner der Listen steht —
   Krimi, Horror, Action — bleibt ohne Wirkung: Es sagt ueber "leicht
   oder schwer" nichts Eindeutiges. */
const GENRES_LEICHT = new Set(
  [
    "Komödie", "Comedy", "Familie", "Family", "Animation", "Kinder", "Kids",
    "Musik", "Music", "Slice of Life", "Gag Humor", "Dokumentarfilm",
  ].map(titelSchluessel)
);
const GENRES_EPISCH = new Set(
  [
    "Drama", "Fantasy", "Abenteuer", "Adventure", "Science Fiction", "Sci-Fi",
    "Sci-Fi & Fantasy", "Historie", "History", "Kriegsfilm", "War",
    "Krieg & Politik", "War & Politics", "Western", "Mystery", "Award Winning",
  ].map(titelSchluessel)
);

/** -1 kurz, 0 mittel, +1 lang — oder null, wenn die Laufzeit fehlt. */
function laengenPunkt(entry, category) {
  const dauer = eintragLaufzeit(entry);
  if (dauer === null) return null;

  if (category === "movie") {
    if (dauer <= FILM_KURZ_MIN) return -1;
    if (dauer >= FILM_LANG_MIN) return 1;
    return 0;
  }

  // Serienarten: Die Gesamtlaufzeit hat Vorrang. Eine Serie mit 300
  // kurzen Folgen ist kein kurzer Abend, auch wenn jede Folge es waere.
  if (dauer >= SERIE_LANG_MIN) return 1;
  if (dauer <= SERIE_KURZ_MIN) return -1;
  const folge = entry && entry.episodeRuntime;
  if (typeof folge === "number" && folge > 0 && folge <= EPISODE_KURZ_MIN) return -1;
  return 0;
}

/** -1 leicht, 0 gemischt, +1 schwer. */
function tonPunkt(entry) {
  let leicht = 0;
  let schwer = 0;
  for (const genre of entry.genre || []) {
    const key = titelSchluessel(genre);
    if (GENRES_LEICHT.has(key)) leicht++;
    if (GENRES_EPISCH.has(key)) schwer++;
  }
  if (schwer > leicht) return 1;
  if (leicht > schwer) return -1;
  return 0;
}

/**
 * Die Stimmung eines Eintrags: "kurz", "episch" oder null.
 *
 * `category` darf fehlen — dann entscheidet die Kategorie am Eintrag
 * selbst, die aus der Datenbank ohnehin mitkommt.
 */
function stimmungVon(entry, category) {
  const kategorie = category || (entry && entry.category);
  if (!entry || !unterstuetztLaufzeit(kategorie)) return null;

  const laenge = laengenPunkt(entry, kategorie);
  if (laenge === null) return null;

  const summe = laenge + tonPunkt(entry);
  if (summe <= -1) return STIMMUNG_KURZ;
  if (summe >= 1) return STIMMUNG_EPISCH;
  return null;
}

/** Passt ein Eintrag zu den gesetzten Zusatzfiltern? */
function passtZuFiltern(eintrag, filter, category) {
  if (filter.genre && !(eintrag.genre || []).includes(filter.genre)) return false;
  if (filter.jahrzehnt && String(jahrzehntVon(eintrag)) !== filter.jahrzehnt) return false;
  if (filter.regie && eintrag.director !== filter.regie) return false;
  if (filter.reihe) {
    const wert = filter.reihe.slice(2);
    const feld = filter.reihe.startsWith(REIHE_STUDIO) ? eintrag.studio : eintrag.collection;
    if (feld !== wert) return false;
  }
  if (filter.stimmung && stimmungVon(eintrag, category) !== filter.stimmung) return false;
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
    !!filter.reihe ||
    !!filter.stimmung
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

/* ------------------------------------------------------------
   Anzeige-Cache

   Beim Start steht der zuletzt vom Server bestaetigte Stand sofort auf
   dem Schirm, waehrend der echte Abruf noch laeuft.

   NICHT VERHANDELBARE REGELN — beim Aendern bitte lesen:

   1. Der Cache ist REINE ANZEIGE. Aus ihm entsteht niemals ein
      Schreibvorgang. Kein POST/PUT/PATCH/DELETE nimmt seine Nutzlast
      von hier. Deshalb landet er auch nicht in `items`, sondern in
      einem eigenen Zustand, den ausschliesslich die Darstellung liest
      (siehe `anzeigeCache` in App).
   2. Geschrieben wird er nur aus einer bestaetigten Server-Antwort,
      nie aus einem optimistischen Zwischenzustand.
   3. Aendert sich das Feld-Schema der Eintraege, muss
      ANZEIGE_CACHE_VERSION erhoeht werden. Aeltere Staende werden
      beim Lesen dann verworfen.
   ------------------------------------------------------------ */
const ANZEIGE_CACHE_SCHLUESSEL = "archiv-anzeige-cache-v1";
/* Schema-Fassung des Feldes `daten`. Bei jeder Aenderung an den
   gespeicherten Feldern um eins erhoehen. */
const ANZEIGE_CACHE_VERSION = 1;
const ANZEIGE_CACHE_MAX_ALTER_MS = 7 * 24 * 60 * 60 * 1000;
/* Groesser als das schreibt sich der Cache gar nicht erst — der
   Speicher der Seite ist begrenzt und der Cache ist nur Beiwerk. */
const ANZEIGE_CACHE_MAX_ZEICHEN = 2 * 1024 * 1024;

function verwirfAnzeigeCache() {
  try {
    window.localStorage.removeItem(ANZEIGE_CACHE_SCHLUESSEL);
  } catch (e) {}
}

/**
 * Liest den gespeicherten Stand. Jeder Zweifelsfall — kaputter Text,
 * andere Fassung, aelter als eine Woche, unerwarteter Aufbau — fuehrt
 * zum Verwerfen: der Cache wird geloescht und es wird ganz normal
 * geladen. Der Nutzer bekommt davon nichts zu sehen.
 */
function ladeAnzeigeCache() {
  try {
    const roh = window.localStorage.getItem(ANZEIGE_CACHE_SCHLUESSEL);
    if (!roh) return null;
    const eintrag = JSON.parse(roh);
    if (!eintrag || typeof eintrag !== "object") { verwirfAnzeigeCache(); return null; }
    if (eintrag.version !== ANZEIGE_CACHE_VERSION) { verwirfAnzeigeCache(); return null; }
    if (typeof eintrag.gespeichertAm !== "number") { verwirfAnzeigeCache(); return null; }
    if (Date.now() - eintrag.gespeichertAm > ANZEIGE_CACHE_MAX_ALTER_MS) { verwirfAnzeigeCache(); return null; }
    const daten = eintrag.daten;
    if (!daten || typeof daten !== "object") { verwirfAnzeigeCache(); return null; }
    // Nur bekannte Kategorien, nur Listen, nur Eintraege mit Kennung.
    const sauber = {};
    let vorhanden = 0;
    for (const key of CATEGORY_KEYS) {
      const liste = Array.isArray(daten[key]) ? daten[key] : [];
      sauber[key] = liste.filter((e) => e && typeof e === "object" && e.id != null);
      vorhanden += sauber[key].length;
    }
    if (!vorhanden) { verwirfAnzeigeCache(); return null; }
    return sauber;
  } catch (e) {
    verwirfAnzeigeCache();
    return null;
  }
}

/**
 * Speichert einen bestaetigten Server-Stand. Aufrufer duerfen hier
 * ausschliesslich das uebergeben, was der Server geliefert hat.
 */
function schreibeAnzeigeCache(daten) {
  try {
    const eintrag = {
      version: ANZEIGE_CACHE_VERSION,
      gespeichertAm: Date.now(),
      daten: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, daten[k] || []])),
    };
    const text = JSON.stringify(eintrag);
    // Zu gross: still uebergehen. Lieber kein Cache als ein voller
    // Speicher, der andere Eintraege der App verdraengt.
    if (text.length > ANZEIGE_CACHE_MAX_ZEICHEN) { verwirfAnzeigeCache(); return; }
    window.localStorage.setItem(ANZEIGE_CACHE_SCHLUESSEL, text);
  } catch (e) {}
}

/* ------------------------------------------------------------
   Wischgeste im Inhaltsbereich

   Ausgeloest wird erst ab 60 px waagerecht, und die waagerechte
   Strecke muss mindestens das 1,5-fache der senkrechten betragen —
   sonst war es Scrollen und nicht Wischen.
   ------------------------------------------------------------ */
const WISCH_SCHWELLE_PX = 60;
const WISCH_VERHAELTNIS = 1.5;

/**
 * Gehoert der Punkt, an dem der Finger aufsetzte, zu einem Bereich,
 * der selbst waagerecht rollt (die Reiterleiste liegt ohnehin
 * ausserhalb) oder zu einem Bedienelement, das eigene waagerechte
 * Gesten kennt (Schieberegler, Eingabefelder, Auswahlfelder)? Dann
 * gehoert die Geste dorthin und nicht zum Kategorie-Wechsel.
 */
function istEigenerQuerbereich(ziel, grenze) {
  let knoten = ziel;
  while (knoten && knoten !== grenze && knoten.nodeType === 1) {
    const tag = knoten.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return true;
    let stil = null;
    try {
      stil = window.getComputedStyle(knoten);
    } catch (e) {
      stil = null;
    }
    if (
      stil &&
      (stil.overflowX === "auto" || stil.overflowX === "scroll") &&
      knoten.scrollWidth > knoten.clientWidth
    ) {
      return true;
    }
    knoten = knoten.parentElement;
  }
  return false;
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

   Bei Filmen die Laufzeit selbst, bei allen Serienarten die Summe
   ueber alle Folgen. Spiele bleiben aussen vor: eine Spieldauer laesst
   sich nicht abrufen.
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

/**
 * Die Laufzeit eines einzelnen Werks: "45 Min.", "2 Std. 28 Min.",
 * "10 Std.". Bei allem ab einem Tag — ganze Serien also — fallen die
 * Minuten weg; neben 48 Stunden sind sie ohne Aussage.
 */
function laufzeitKurz(minuten) {
  if (minuten < 60) return minuten + " Min.";
  const stunden = Math.floor(minuten / 60);
  const rest = minuten % 60;
  if (!rest || stunden >= 24) return stunden + " Std.";
  return stunden + " Std. " + rest + " Min.";
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

/* Die Dauern aus --bewegung-rein / --bewegung-raus, hier noch einmal
   als Zahl: Wer sich hinausbewegt, muss so lange im Baum bleiben, wie
   die Bewegung dauert. Bei Aenderung beides gemeinsam anpassen. */
const BEWEGUNG_REIN_MS = 200;
const BEWEGUNG_RAUS_MS = 160;

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
   Ab welcher Breite gilt die Desktop-Ansicht?

   Derselbe Wert wie im <style>-Block (DESKTOP_AB). Alles, was sich
   auf dem Desktop anders anordnet, laesst sich in CSS erledigen —
   bis auf eine Ausnahme: die Filter-Seitenleiste. Sie ist nicht
   dasselbe Element wie das Blatt von unten, sondern eine zweite
   Darstellung derselben Komponente, und welche davon im Baum steht,
   kann eine Media Query nicht entscheiden.

   Unterhalb der Schwelle meldet der Haken durchgaengig false — dort
   bleibt der Baum also Zeichen fuer Zeichen der bisherige.
   ------------------------------------------------------------ */
const DESKTOP_AB = "(min-width: 960px)";

function useDesktop() {
  /* Der Startwert wird schon beim ersten Rendern gelesen, nicht erst
     im Effekt: sonst zeigte der Desktop fuer einen Bildaufbau das
     Blatt-Layout und ordnete danach sichtbar um. */
  const [desktop, setDesktop] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(DESKTOP_AB).matches
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(DESKTOP_AB);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
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

  /* Gewechselt wird erst, wenn das naechste Bild wirklich da ist:
     sonst blendet die Ueberblendung auf eine leere Flaeche und das
     Bild ploppt mittendrin hinein. */
  useEffect(() => {
    if (!mehrere || reducedMotion) return undefined;
    let abgebrochen = false;
    const timer = setInterval(() => {
      const naechster = naechsterZufall(brauchbar.length, index);
      const url = brauchbar[naechster];
      const zeigen = () => {
        if (abgebrochen) return;
        setPrevIndex(index);
        setIndex(naechster);
        setTick((t) => t + 1);
      };
      const vorlader = new Image();
      // Auch bei einem Fehlschlag weiterschalten — die kaputte Adresse
      // meldet das <img> selbst und faellt danach heraus.
      vorlader.onload = zeigen;
      vorlader.onerror = zeigen;
      vorlader.src = url;
    }, BACKDROP_INTERVAL);
    return () => { abgebrochen = true; clearInterval(timer); };
  }, [mehrere, reducedMotion, brauchbar.length, index]);

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
      {/* Das scheidende Bild bleibt liegen; das neue blendet darueber
          auf. Damit gibt es keinen Moment, in dem der Kopfbereich leer
          waere. */}
      {vorher && vorher !== aktuell && !reducedMotion && (
        <img
          key={"weg" + tick}
          src={vorher}
          alt=""
          className="backdrop-layer"
          style={bild}
          onError={() => kaputtMerken(vorher)}
        />
      )}
      <img
        key={"da" + tick}
        src={aktuell}
        alt=""
        /* Das erste Bild holt der Browser vorrangig — bisher erschien
           es rund eine Sekunde nach dem Rest. */
        fetchPriority={prevIndex === null ? "high" : undefined}
        decoding="async"
        className={"backdrop-layer" + (reducedMotion || prevIndex === null ? "" : " backdrop-blende")}
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
    /* Der Server schickt seine Begruendung im Rumpf mit ({ error: ... }),
       genau wie beim Anlegen und Speichern. Bisher wurde sie hier
       weggeworfen und nur der Status gemeldet — aus einem "relation
       seasons does not exist" wurde dadurch ein blankes
       "Laden fehlgeschlagen (500)". Fehlt der Rumpf (etwa bei einem
       Absturz noch vor dem Handler), bleibt der Status als Notnagel. */
    if (!res.ok) {
      const grund = (await res.json().catch(() => ({}))).error;
      throw new Error(grund || "Laden fehlgeschlagen (" + res.status + ")");
    }
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
     arbeitet.

     Seit die Titel der Bestbewerteten mitgehen, ist das Profil nicht
     mehr zwangslaeufig winzig — `profilFuerUrl` haelt es unter der
     Laenge, die eine URL sicher vertraegt. */
  async loadRecommendations(category, profil) {
    const res = await fetch(
      "/api/recommendations?category=" + encodeURIComponent(category) +
        "&profil=" + encodeURIComponent(JSON.stringify(profilFuerUrl(profil)))
    );
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Empfehlungen fehlgeschlagen");
    const data = await res.json();
    return {
      results: Array.isArray(data.results) ? data.results : [],
      hinweis: typeof data.hinweis === "string" ? data.hinweis : "",
    };
  },
  /* Gibt es zu bewerteten Serien eine neue Staffel? Die Liste kann lang
     werden und geht deshalb im Rumpf mit, nicht im Abfrageteil. Was ein
     Aufruf nicht mehr geschafft hat, steht in `offen` — der Aufrufer
     fragt damit nach. */
  async pruefeFortsetzungen(eintraege) {
    const res = await fetch("/api/fortsetzungen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eintraege }),
    });
    if (!res.ok) {
      throw new Error((await res.json().catch(() => ({}))).error || "Abgleich fehlgeschlagen");
    }
    const data = await res.json();
    return {
      treffer: data && typeof data.treffer === "object" && data.treffer ? data.treffer : {},
      offen: Array.isArray(data && data.offen) ? data.offen : [],
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
  /* Gespielte Duelle je Kategorie — der Zaehler des Minispiels. */
  async loadDuelCounts() {
    const res = await fetch("/api/duels");
    if (!res.ok) throw new Error("Duelle konnten nicht geladen werden (" + res.status + ")");
    const data = await res.json();
    return data && data.counts ? data.counts : {};
  },
  async countDuel(category) {
    const res = await fetch("/api/duels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Zählen fehlgeschlagen");
    return res.json();
  },
  /* Bestwerte eines Minispiels, je Spielart. */
  async loadHighscores(game) {
    const res = await fetch("/api/highscores?game=" + encodeURIComponent(game));
    if (!res.ok) throw new Error("Bestwerte konnten nicht geladen werden (" + res.status + ")");
    const data = await res.json();
    return data && data.scores ? data.scores : {};
  },
  /* Meldet das Ergebnis eines Durchgangs. Gespeichert wird davon nur,
     was den bisherigen Bestwert uebertrifft — das entscheidet der
     Server, zurueck kommt der geltende Bestwert. */
  async reportHighscore(game, mode, score) {
    const res = await fetch("/api/highscores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game, mode, score }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Bestwert nicht gespeichert");
    return res.json();
  },
  /* Aktivitaets-Punkte. Wie viel eine Aktion wert ist, entscheidet der
     Server — hier wird nur gemeldet, was passiert ist. */
  async loadXp() {
    const res = await fetch("/api/xp");
    if (!res.ok) throw new Error("Punktestand konnte nicht geladen werden (" + res.status + ")");
    const data = await res.json();
    return {
      xp: typeof data.xp === "number" ? data.xp : 0,
      once: Array.isArray(data.once) ? data.once : [],
    };
  },
  async grantXp(source, zusatz) {
    const res = await fetch("/api/xp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, ...(zusatz || {}) }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Punkte nicht gespeichert");
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
   die Sandbox-Beschränkung der Artefakt-Umgebung nicht mehr.

   `vorrang` ist fuer die ersten sichtbaren Zeilen gedacht: die holt der
   Browser mit hoher Prioritaet und ohne Verzoegerung, alles darunter
   erst beim Heranscrollen.

   Beim Erscheinen blendet das Bild auf, statt hart aufzupoppen. Die
   Platzhalter-Kachel mit den Initialen bleibt unveraendert der
   Rueckfall. */
function Poster({ url, title, size = 44, vorrang = false }) {
  const clean = typeof url === "string" ? url.trim() : "";
  const usable = clean && isLikelyUrl(clean);
  const [broken, setBroken] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const bildRef = useRef(null);

  useEffect(() => {
    setBroken(false); // Zustand bei URL-Wechsel zurücksetzen
    /* Steht das Bild schon im Cache, ist es beim ersten Rendern
       womoeglich fertig, bevor onLoad ueberhaupt haengt — dann bliebe
       es ohne diese Pruefung dauerhaft unsichtbar. */
    const el = bildRef.current;
    setGeladen(!!(el && el.complete && el.naturalWidth > 0));
  }, [clean]);

  const h = Math.round(size * 1.42);
  const base = {
    width: size, height: h, borderRadius: 5, flexShrink: 0,
    border: "1px solid #2A2A2E", boxSizing: "border-box",
  };

  if (usable && !broken) {
    return (
      <img
        ref={bildRef}
        src={clean}
        alt={title}
        loading={vorrang ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={vorrang ? "high" : undefined}
        onLoad={() => setGeladen(true)}
        onError={() => setBroken(true)}
        style={{
          ...base, objectFit: "cover", backgroundColor: "#141416", display: "block",
          opacity: geladen ? 1 : 0,
          transition: "opacity var(--bewegung-rein)",
        }}
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

/* Symbole als reine Strichzeichnung. Sie erben mit currentColor die
   Farbe ihres Knopfes und bringen weder eigene Flaeche noch eigene
   Farben mit. */
const symbolBasis = {
  width: 18,
  height: 18,
  display: "block",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/* Balkendiagramm: drei senkrechte Striche unterschiedlicher Hoehe. */
function IconStatistik() {
  return (
    <svg viewBox="0 0 24 24" style={symbolBasis} aria-hidden="true" focusable="false">
      <line x1="6" y1="20" x2="6" y2="13" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="9" />
    </svg>
  );
}

/* Zahnrad fuer das Daten-Panel. */
function IconZahnrad() {
  return (
    <svg viewBox="0 0 24 24" style={symbolBasis} aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.1 14.6a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-1.7-.3 1.5 1.5 0 0 0-.9 1.4v.2a1.8 1.8 0 1 1-3.6 0v-.1a1.5 1.5 0 0 0-1-1.4 1.5 1.5 0 0 0-1.7.3l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9h-.2a1.8 1.8 0 1 1 0-3.6h.1a1.5 1.5 0 0 0 1.4-1 1.5 1.5 0 0 0-.3-1.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.2a1.8 1.8 0 1 1 3.6 0v.1a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.2a1.8 1.8 0 1 1 0 3.6h-.1a1.5 1.5 0 0 0-1.4.9z" />
    </svg>
  );
}

/* Spielecontroller fuer die Minispiele: Gehaeuse, Steuerkreuz und
   zwei Knoepfe. Die Knoepfe sind Striche ohne Laenge — mit dem runden
   Abschluss aus symbolBasis werden daraus Punkte, ohne dass eine
   Farbflaeche ins Symbol kaeme. */
function IconSpiele() {
  return (
    <svg viewBox="0 0 24 24" style={symbolBasis} aria-hidden="true" focusable="false">
      <path d="M8 8h8a4.5 4.5 0 0 1 4.4 3.5l.9 4.2a2.9 2.9 0 0 1-2.8 3.5 2.9 2.9 0 0 1-2.2-1l-1.2-1.4H8.9l-1.2 1.4a2.9 2.9 0 0 1-2.2 1 2.9 2.9 0 0 1-2.8-3.5l.9-4.2A4.5 4.5 0 0 1 8 8Z" />
      <line x1="7.2" y1="11.6" x2="7.2" y2="14.4" />
      <line x1="5.8" y1="13" x2="8.6" y2="13" />
      <line x1="15.4" y1="12.6" x2="15.4" y2="12.6" />
      <line x1="17.6" y1="14.4" x2="17.6" y2="14.4" />
    </svg>
  );
}

/* Filter: drei waagerechte Balken, von oben nach unten kuerzer. */
function IconFilter() {
  return (
    <svg viewBox="0 0 24 24" style={symbolBasis} aria-hidden="true" focusable="false">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </svg>
  );
}

/* Symbolknopf der Suchzeile: feste Breite, damit die Zeile nie
   umbricht oder ueber den Bildschirmrand laeuft. */
function IconButton({ title, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="icon-knopf"
      style={{
        flex: "0 0 auto",
        width: 46,
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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

/* Symbolknopf, der auf dem Bild des Kopfbereichs sitzt: halbdurch-
   sichtig dunkel, damit er sich vom Bild abhebt, ohne den Titel
   daneben zu ueberstrahlen. */
function KopfIconButton({ title, active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className="kopf-icon"
      style={{
        pointerEvents: "auto",
        flex: "0 0 auto",
        width: 38,
        height: 38,
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(23,23,26,0.62)",
        border: "1px solid " + (active ? "var(--accent, #C9A227)" : "rgba(237,234,227,0.16)"),
        borderRadius: 8,
        color: active ? "var(--accent, #C9A227)" : "#9A968C",
        cursor: "pointer",
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

/* Huelle fuer einen Listenwechsel: der Inhalt blendet auf und rutscht
   dabei leicht heran (siehe .uebergang).

   Die Kinder werden bewusst *nicht* ueber einen key ausgetauscht — ein
   Neuaufbau wuerde Zustand und Effekte der Kinder zuruecksetzen. Die
   Animation wird stattdessen von Hand neu angestossen: Klasse ab,
   einmal Layout erzwingen, Klasse wieder dran. So bleibt jeder
   Klick-Handler und jeder Zustand darunter unberuehrt.

   Beim ersten Aufbau traegt das Element die Klasse schon im Markup und
   spielt die Bewegung von allein. */
/* `richtung` waehlt die Bewegung: 1 = der Inhalt kommt von rechts,
   -1 = von links, 0 (oder gar nicht gesetzt) = das bisherige
   Einblenden ohne Richtung. */
const UEBERGANG_KLASSEN = ["uebergang", "kategorie-rechts", "kategorie-links"];

function uebergangKlasse(richtung) {
  if (richtung > 0) return "kategorie-rechts";
  if (richtung < 0) return "kategorie-links";
  return "uebergang";
}

function Uebergang({ trigger, richtung = 0, children }) {
  const ref = useRef(null);
  const ersterLauf = useRef(true);
  const klasse = uebergangKlasse(richtung);
  /* Die Klasse gehoert zum Ausloeser, nicht zum Rendern: laeuft der
     Effekt wegen `trigger`, soll er genau die Klasse setzen, die zu
     dieser Aenderung gehoert. */
  const klasseRef = useRef(klasse);
  klasseRef.current = klasse;

  /* useLayoutEffect und nicht useEffect: React hat die neue Klasse
     beim Rendern schon gesetzt, die Bewegung also bereits gestartet.
     Der Neustart muss deshalb vor dem naechsten Bild passieren, sonst
     zuckt sie sichtbar. */
  useLayoutEffect(() => {
    if (ersterLauf.current) { ersterLauf.current = false; return; }
    const el = ref.current;
    if (!el) return;
    el.classList.remove(...UEBERGANG_KLASSEN);
    void el.offsetWidth;
    el.classList.add(klasseRef.current);
  }, [trigger]);

  return <div ref={ref} className={klasse}>{children}</div>;
}

/* Versatz einer Listenzeile beim Erscheinen: 25ms je Zeile, ab der
   zehnten bleibt es dabei. Sonst warteten die unteren Zeilen einer
   langen Liste sekundenlang auf ihren Auftritt. */
function listenVersatz(i) {
  return Math.min(i, 9) * 25 + "ms";
}

/* ============================================================
   LADESKELETT

   Platzhalter fuer noch nicht geladene Listen. Die Bausteine tragen
   die Klasse `skelett` — gedimmte Flaechen in der vorhandenen
   Kartenfarbe, die still zwischen 0,45 und 0,75 Deckkraft atmen. Kein
   Verlauf, kein Sweep.

   Wichtig sind die Masse: Eine Skelettzeile muss genau so hoch sein
   wie die echte Zeile, die sie vertritt — sonst springt die Liste,
   sobald die Daten eintreffen.
   ============================================================ */

/* Eine gedimmte Flaeche. `rund` nur, wo auch das Echte rund ist. */
function SkelettFlaeche({ breite, hoehe, rund = 5, style }) {
  return (
    <span
      className="skelett"
      style={{ display: "block", width: breite, height: hoehe, borderRadius: rund, ...style }}
    />
  );
}

/* Eine Zeile der Ranglisten-Ansicht: Rangzahl, Poster (34 x 48 —
   dasselbe Mass wie <Poster size={34} />), zwei Textbalken, Noten-Chip.
   Aussenmasse und Innenabstaende sind aus der echten Zeile
   uebernommen; die Posterkachel gibt die Hoehe vor. */
function SkelettListenZeile() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 4px", borderBottom: "1px solid #232326", gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
        <SkelettFlaeche breite={14} hoehe={10} rund={3} style={{ marginLeft: 8, flexShrink: 0 }} />
        <SkelettFlaeche breite={34} hoehe={48} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <SkelettFlaeche breite="62%" hoehe={13} rund={3} />
          <SkelettFlaeche breite="34%" hoehe={9} rund={3} style={{ marginTop: 6 }} />
        </div>
      </div>
      <SkelettFlaeche breite={48} hoehe={22} rund={4} style={{ flexShrink: 0 }} />
    </div>
  );
}

/* Acht Zeilen — genug, um den ersten Bildschirm zu fuellen. */
function SkelettListe({ anzahl = 8 }) {
  return (
    <div>
      {Array.from({ length: anzahl }, (_, i) => (
        <SkelettListenZeile key={i} />
      ))}
    </div>
  );
}

/**
 * Ein Blatt, das von unten hereinkommt.
 *
 * Die Abdunkelung liegt als eigene Ebene darunter, damit sich ihre
 * Deckkraft unabhaengig vom Blatt bewegen laesst. Sie ist absolut
 * positioniert — das Blatt braucht deshalb `position: relative`, sonst
 * laege die Ebene darueber.
 *
 * `children` darf eine Funktion sein. Sie bekommt `schliessen`
 * uebergeben: damit spielen auch die eigenen Knoepfe des Blattes die
 * Aus-Bewegung, statt einfach zu verschwinden.
 *
 * Die Griffleiste oben ist zugleich der Ziehbereich: nach unten
 * gezogen folgt das Blatt 1:1 dem Finger. Beim Loslassen entscheidet
 * Weg oder Tempo, ob es schliesst — sonst schnappt es zurueck. Nach
 * oben gezogen bleibt es stehen. Am Aussehen aendert das nichts.
 */
/* Ab hier gilt das Blatt beim Loslassen als weggezogen: Weg in px
   oder Tempo in px je ms. Ein kurzer, schneller Wisch reicht damit
   ebenso wie ein langsames, weites Ziehen. Unterhalb von
   ZIEH_MINDESTWEG_PX ist es ein Tippen und kein Wisch — sonst schloesse
   schon ein hastiger Fingerauftupfer das Blatt. */
const ZIEH_WEG_PX = 100;
const ZIEH_TEMPO_PX_MS = 0.5;
const ZIEH_MINDESTWEG_PX = 12;
/* Mindestabstand zweier Tempomessungen und Hoechstalter der letzten
   Messung beim Loslassen — beides in ms. */
const ZIEH_MESSABSTAND_MS = 8;
const ZIEH_TEMPO_FRISCH_MS = 120;
/* Der Ziehbereich greift etwas ueber die Griffleiste hinaus. Die
   Polsterung wird durch denselben negativen Aussenabstand wieder
   aufgehoben: der Bereich fasst weiter, verschiebt aber nichts. */
const ZIEH_GRIFF_LUFT_PX = 12;

function BottomSheet({ title, onClose, children }) {
  const reducedMotion = usePrefersReducedMotion();
  const [geht, setGeht] = useState(false);
  /* Wird das Blatt weggezogen, laeuft die Aus-Bewegung aus der
     Position heraus, in der der Finger es losgelassen hat. Die Klasse
     .blatt-raus faengt dagegen immer bei 0 an und liesse das Blatt
     zuerst sichtbar hochspringen — deshalb bleibt sie in diesem Fall
     weg, und der Weg nach unten laeuft ueber eine transition. */
  const [ziehtRaus, setZiehtRaus] = useState(false);
  const blattRef = useRef(null);
  const zug = useRef(null);

  function schliessen(danach) {
    const ende = typeof danach === "function" ? danach : onClose;
    if (reducedMotion) { ende(); return; }
    setGeht(true);
    setTimeout(ende, BEWEGUNG_RAUS_MS);
  }

  /* Der Versatz geht direkt ans Element und nicht ueber den Zustand:
     am Finger soll nichts nachhinken, und ein Renderdurchlauf je
     Mausbewegung waere dafuer zu viel. */
  function setzeVersatz(px, uebergang) {
    const el = blattRef.current;
    if (!el) return;
    el.style.transition = uebergang || "";
    el.style.transform = px ? `translateY(${px}px)` : "";
  }

  function ziehAnfang(e) {
    if (geht) return;
    if (e.button != null && e.button > 0) return;
    zug.current = { id: e.pointerId, start: e.clientY, weg: 0, tempo: 0, letzteY: e.clientY, letzteZeit: e.timeStamp };
    /* Ohne Capture endete die Geste, sobald der Finger den
       Griffbereich verlaesst — beim Ziehen nach unten also sofort. */
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* nicht ueberall vorhanden */ }
  }

  function ziehBewegung(e) {
    const z = zug.current;
    if (!z || e.pointerId !== z.id) return;
    /* Nur nach unten: ueber die Ausgangslage hinaus bleibt es stehen. */
    z.weg = Math.max(0, e.clientY - z.start);
    /* Das Tempo braucht einen Mindestabstand zwischen zwei Messungen:
       aus zwei Punkten, die eine Millisekunde auseinanderliegen, kaeme
       ein beliebig grosser Wert heraus. */
    const dt = e.timeStamp - z.letzteZeit;
    if (dt >= ZIEH_MESSABSTAND_MS) {
      z.tempo = (e.clientY - z.letzteY) / dt;
      z.letzteY = e.clientY;
      z.letzteZeit = e.timeStamp;
    }
    setzeVersatz(z.weg);
  }

  /* Zurueck in die Ausgangslage — dieselbe Kurve wie beim Hereinkommen. */
  function ziehZurueck() {
    setzeVersatz(0, reducedMotion ? "" : `transform ${BEWEGUNG_REIN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`);
  }

  function ziehEnde(e) {
    const z = zug.current;
    zug.current = null;
    if (!z || e.pointerId !== z.id) return;
    /* Wer zuletzt stillhaelt, wirft nicht: liegt die letzte Bewegung
       schon eine Weile zurueck, zaehlt allein der Weg. */
    const frisch = e.timeStamp - z.letzteZeit <= ZIEH_TEMPO_FRISCH_MS;
    const geworfen = frisch && z.tempo >= ZIEH_TEMPO_PX_MS && z.weg >= ZIEH_MINDESTWEG_PX;
    const weggezogen = z.weg >= ZIEH_WEG_PX || geworfen;
    if (!weggezogen) { ziehZurueck(); return; }
    /* Dasselbe Schliessen wie beim Tippen auf die Abdunkelung: die
       Ebene blendet aus, nach der Aus-Bewegung faellt das Blatt aus
       dem Baum. Nur der Weg des Blattes selbst beginnt hier dort, wo
       der Finger es gelassen hat. */
    if (reducedMotion) { onClose(); return; }
    setZiehtRaus(true);
    const el = blattRef.current;
    if (el) {
      el.style.transition = `transform ${BEWEGUNG_RAUS_MS}ms cubic-bezier(0.4, 0, 1, 1)`;
      el.style.transform = "translateY(100%)";
    }
    setGeht(true);
    setTimeout(onClose, BEWEGUNG_RAUS_MS);
  }

  function ziehAbbruch(e) {
    const z = zug.current;
    zug.current = null;
    if (!z || e.pointerId !== z.id) return;
    ziehZurueck();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}
    >
      {/* Tippen auf den abgedunkelten Bereich schliesst das Blatt. */}
      <div
        aria-hidden="true"
        onClick={() => schliessen()}
        className={geht ? "blende-raus" : "blende-rein"}
        style={{ position: "absolute", inset: 0, background: "#000", opacity: 0.55 }}
      />
      <div
        ref={blattRef}
        onClick={(e) => e.stopPropagation()}
        className={geht ? (ziehtRaus ? "" : "blatt-raus") : "blatt-rein"}
        style={{
          position: "relative",
          background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: "14px 14px 0 0",
          padding: 22, width: "100%", maxWidth: 520, boxSizing: "border-box",
          maxHeight: "85vh", overflowY: "auto", WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Griffleiste und Titel bilden zusammen den Ziehbereich.
            touchAction: none, damit der Zug nach unten nicht als
            Rollen im Blatt ankommt. Polsterung und negativer
            Aussenabstand heben sich auf — es sitzt alles wie zuvor. */}
        <div
          onPointerDown={ziehAnfang}
          onPointerMove={ziehBewegung}
          onPointerUp={ziehEnde}
          onPointerCancel={ziehAbbruch}
          style={{
            touchAction: "none",
            padding: `${ZIEH_GRIFF_LUFT_PX}px 0`,
            margin: `${-ZIEH_GRIFF_LUFT_PX}px 0`,
          }}
        >
          <div style={{ width: 36, height: 4, background: "#33333a", borderRadius: 2, margin: "0 auto 16px" }} />
          {title && <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 16px" }}>{title}</h3>}
        </div>
        {typeof children === "function" ? children(schliessen) : children}
      </div>
    </div>
  );
}

function ConfirmDialog({ title, text, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <BottomSheet title={title} onClose={onCancel}>
      {(schliessen) => (
        <>
          <p style={{ color: "#9A968C", fontSize: 14.5, lineHeight: 1.5, margin: "0 0 20px" }}>{text}</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => schliessen(onCancel)}
              style={{ flex: 1, padding: "14px", background: "transparent", color: "#9A968C", border: "1px solid #33333a", borderRadius: 8, fontSize: 15, cursor: "pointer" }}
            >
              Abbrechen
            </button>
            <button
              onClick={() => schliessen(onConfirm)}
              style={{
                flex: 1, padding: "14px", background: danger ? "#DC2626" : "var(--accent, #C9A227)",
                color: danger ? "#faf7f0" : "#17171A", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer",
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}

/**
 * Ein Bereich, der beim Oeffnen hereingleitet und beim Schliessen
 * hinaus. Damit die Aus-Bewegung ueberhaupt zu sehen ist, bleibt der
 * zuletzt gezeigte Inhalt fuer ihre Dauer stehen — sonst waere er
 * schon weg, bevor die Bewegung beginnt.
 *
 * Nicht geeignet fuer Inhalte mit `position: fixed` darin: die
 * laufende transform macht diesen Bereich zu deren Bezugsrahmen. Die
 * Detailseite bringt ihre Bewegung deshalb selbst mit.
 */
function Seite({ offen, children }) {
  const reducedMotion = usePrefersReducedMotion();
  const [imBaum, setImBaum] = useState(offen);
  const [geht, setGeht] = useState(false);
  const letzte = useRef(children);
  if (offen) letzte.current = children;

  useEffect(() => {
    if (offen) { setImBaum(true); setGeht(false); return undefined; }
    if (reducedMotion) { setImBaum(false); setGeht(false); return undefined; }
    setGeht(true);
    const zeit = setTimeout(() => { setImBaum(false); setGeht(false); }, BEWEGUNG_RAUS_MS);
    return () => clearTimeout(zeit);
  }, [offen, reducedMotion]);

  if (!offen && !imBaum) return null;
  return <div className={geht ? "seite-raus" : "seite-rein"}>{letzte.current}</div>;
}

/* ============================================================
   FILTER-BOTTOM-SHEET (Sortierung, Bewertungsbereich, Zusatzfilter)
   ============================================================ */
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
      className="filter-eintrag"
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

/* `alsSeitenleiste` waehlt allein die Huelle: dieselben Zustaende,
   dieselben Bedienelemente, dieselbe Filterlogik — einmal im Blatt von
   unten (Handy, unveraendert), einmal als feste Spalte (ab 960px). */
function FilterSheet({ initial, totalCount, allInCategory, category, onApply, onClose, alsSeitenleiste }) {
  const [sort, setSort] = useState(initial.sort);
  const [min, setMin] = useState(initial.min);
  const [max, setMax] = useState(initial.max);
  const [genre, setGenre] = useState(initial.genre);
  const [jahrzehnt, setJahrzehnt] = useState(initial.jahrzehnt);
  const [regie, setRegie] = useState(initial.regie);
  const [reihe, setReihe] = useState(initial.reihe);
  const [stimmung, setStimmung] = useState(initial.stimmung);

  const optionen = useMemo(
    () => filterOptionen(allInCategory, category),
    [allInCategory, category]
  );

  const entwurf = { genre, jahrzehnt, regie, reihe, stimmung };

  const previewCount = useMemo(() => {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return allInCategory.filter(
      (f) =>
        typeof f.score === "number" &&
        f.score >= lo &&
        f.score <= hi &&
        passtZuFiltern(f, entwurf, category)
    ).length;
  }, [min, max, allInCategory, category, genre, jahrzehnt, regie, reihe, stimmung]);

  function applyPreset(p) {
    setMin(p.min);
    setMax(p.max);
  }

  /* Ein zweiter Klick auf denselben Knopf hebt die Auswahl wieder auf —
     das erspart einen eigenen "alle"-Knopf je Abschnitt. */
  const umschalten = (setzen, aktuell) => (wert) => setzen(aktuell === wert ? "" : wert);

  function handleApply() {
    onApply({
      sort,
      min: Math.min(min, max),
      max: Math.max(min, max),
      genre, jahrzehnt, regie, reihe, stimmung,
    });
  }

  /* Zurueckgesetzt werden die Filter — die gewaehlte Sortierung ist
     keine Einschraenkung der Liste und bleibt deshalb stehen. */
  function handleReset() {
    setMin(DEFAULT_FILTER.min);
    setMax(DEFAULT_FILTER.max);
    setGenre("");
    setJahrzehnt("");
    setRegie("");
    setReihe("");
    setStimmung("");
    onApply({ ...DEFAULT_FILTER, sort });
  }

  /* Der Inhalt haengt nicht am Blatt — dieselbe Funktion fuellt auch
     die Seitenleiste. Als Funktion, damit auch "Anwenden" und
     "Zuruecksetzen" die Aus-Bewegung des Blattes spielen statt einfach
     zu verschwinden. */
  const inhalt = (schliessen) => (
      <>
      {/* Die Sortierung steht vor den Filtern — sie bestimmt die
          Reihenfolge der Liste, die die Filter danach kuerzen. */}
      <div style={filterAbschnitt}>SORTIEREN</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
        {SORT_OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => setSort(o.key)}
            aria-pressed={sort === o.key}
            className="filter-eintrag"
            style={{
              textAlign: "left", padding: "13px 14px", borderRadius: 8, fontSize: 14, cursor: "pointer",
              background: sort === o.key ? "var(--accent, #C9A227)" : "#141416",
              color: sort === o.key ? "#17171A" : "#EDEAE3",
              border: "1px solid " + (sort === o.key ? "var(--accent, #C9A227)" : "#2A2A2E"),
              fontWeight: sort === o.key ? 700 : 400,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

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

      {/* Stimmung: kein Filter ueber ein gespeichertes Feld, sondern
          ueber Laufzeit und Genre zusammen. Bei Spielen fehlt beides,
          deshalb steht der Abschnitt dort gar nicht erst. */}
      {unterstuetztLaufzeit(category) && (
        <>
          <div style={filterAbschnitt}>STIMMUNG</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {STIMMUNG_OPTIONEN.map((s) => (
              <FilterChip
                key={s.wert}
                label={s.label}
                active={stimmung === s.wert}
                onClick={() => umschalten(setStimmung, stimmung)(s.wert)}
              />
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#77746c", lineHeight: 1.5, marginBottom: 16 }}>
            Aus Laufzeit und Genre zusammen. Einträge, deren Laufzeit noch
            nicht bekannt ist, erscheinen in keiner der beiden Auswahlen.
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
          onClick={() => schliessen(handleReset)}
          style={{ flex: 1, padding: "14px", background: "transparent", color: "#9A968C", border: "1px solid #33333a", borderRadius: 8, fontSize: 15, cursor: "pointer" }}
        >
          Filter zurücksetzen
        </button>
        <button
          onClick={() => schliessen(handleApply)}
          style={{ flex: 1, padding: "14px", background: "var(--accent, #C9A227)", color: "#17171A", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer" }}
        >
          Anwenden
        </button>
      </div>
      </>
  );

  /* Feste Spalte: kein Blatt, keine Abdunkelung, kein Ziehgriff — und
     nichts zu schliessen. `schliessen` fuehrt den uebergebenen Aufruf
     deshalb einfach aus, "Anwenden" und "Zuruecksetzen" wirken damit
     genau wie im Blatt. */
  if (alsSeitenleiste) {
    return (
      <div className="filter-seitenleiste">
        {inhalt((fn) => { if (fn) fn(); })}
      </div>
    );
  }

  return (
    <BottomSheet title="Filter" onClose={onClose}>
      {inhalt}
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

/* ------------------------------------------------------------
   Duplikat-Warnung

   Steht der Titel schon in der Sammlung? Verglichen wird ueber ALLE
   Schreibweisen, die die Quelle zum Treffer kennt — nicht nur ueber den
   angezeigten Namen. Die Suche liefert sie seit dieser Erweiterung mit
   (siehe api/search.js): deutscher und Originaltitel bei TMDB, dazu
   romanisierte, englische und japanische Schreibweise samt Synonymen
   bei Jikan.

   Ohne das ginge die Warnung genau dort daneben, wo sie gebraucht wird:
   "The Loud House" und "Willkommen bei den Louds" sind dieselbe Serie,
   und wer den einen Namen sucht, hat womoeglich den anderen bereits
   eingetragen.

   Bei Spielen bleibt es beim Vergleich der Namen selbst — SteamGridDB
   fuehrt keine Alternativtitel. Dafuer braucht es keinen eigenen Zweig:
   Ein Treffer ohne weitere Schreibweisen traegt eben nur eine.

   Der Vergleich laeuft ueber `titelSchluessel`, also ohne Ruecksicht auf
   Gross- und Kleinschreibung, Akzente und ein angehaengtes Jahr in
   Klammern. Gewarnt wird, nicht blockiert: Wer ein Remake bewusst
   getrennt fuehren will, kommt mit einem Klick weiter.
   ------------------------------------------------------------ */

/** Alle Vergleichsformen eines Suchtreffers. */
function trefferSchluessel(treffer) {
  const namen =
    Array.isArray(treffer && treffer.titel) && treffer.titel.length
      ? treffer.titel
      : [treffer && treffer.title];
  const raus = [];
  for (const name of namen) {
    const key = titelSchluessel(name);
    if (key && !raus.includes(key)) raus.push(key);
  }
  return raus;
}

/**
 * Der bereits vorhandene Eintrag zu einem Treffer — oder null.
 *
 * `bekannt` ist eine Map von Vergleichsform auf den Eintrag, die der
 * Aufrufer einmal je Kategorie aufbaut.
 */
function findeDuplikat(treffer, bekannt) {
  if (!bekannt || !bekannt.size) return null;
  for (const key of trefferSchluessel(treffer)) {
    const vorhanden = bekannt.get(key);
    if (vorhanden) return vorhanden;
  }
  return null;
}

/**
 * Eine Zeile der Trefferliste.
 *
 * Der Zustand haengt ausschliesslich an dieser Zeile: `vorgemerkt`
 * wird schon gesetzt, bevor der Server geantwortet hat (siehe
 * `vormerken` in NeuerEintrag). Zieht sich die Antwort ueber 400 ms
 * hin, sagt `langsam` das an — dann wird der Haken gedimmt, sonst
 * merkt niemand etwas von der Wartezeit. Geht es schief, verschwindet
 * der Haken wieder und `fehler` steht an der Zeile.
 *
 * Ein globales `busy` gibt es hier bewusst nicht mehr: ein laufender
 * Vorgang in einer Zeile darf die anderen nicht sperren.
 */
function TrefferZeile({ treffer, vorgemerkt, langsam, fehler, onWatchlist, onBewerten }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid #232326" }}>
      <Poster url={treffer.poster} title={treffer.title} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Der Titel bekommt die volle Zeilenbreite und darf ueber zwei
            Zeilen laufen. Vorher standen die beiden Knoepfe daneben —
            danach blieb vom Titel "Der ...", "Ros...", "Ber..." uebrig
            und man wusste nicht, was man gerade hinzufuegt. */}
        <div
          title={treffer.title}
          style={{
            fontSize: 14.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            overflowWrap: "anywhere",
          }}
        >
          {treffer.title}
        </div>
        {treffer.year && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#77746c", marginTop: 2 }}>
            {treffer.year}
          </div>
        )}
        {/* Fehlermeldung an der Zeile, nicht oben am Bildschirmrand. */}
        {fehler && (
          <div style={{ color: "#d9736a", fontSize: 11.5, marginTop: 2, lineHeight: 1.4 }}>{fehler}</div>
        )}
        {/* Eigene Reihe unter dem Titel, rechtsbuendig — Groesse und
            Stil der Knoepfe bleiben unveraendert. */}
        {/* flexWrap zusammen mit nowrap in den Knoepfen: wird es ganz
            eng (320 px im eingerueckten "eigener Titel"-Kasten),
            rutscht der zweite Knopf in die naechste Reihe, statt dass
            die Beschriftung "+ Watchlist" mitten im Wort umbricht.
            Groesse und Stil der Knoepfe bleiben unveraendert. */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {vorgemerkt ? (
            <span style={{ fontSize: 12.5, color: "#77746c", opacity: langsam ? 0.5 : 1 }}>
              ✓ vorgemerkt
            </span>
          ) : (
            <>
              <button
                onClick={onWatchlist}
                style={{
                  padding: "8px 10px", borderRadius: 6, fontSize: 12.5, cursor: "pointer",
                  background: "transparent", color: "var(--accent, #C9A227)",
                  border: "1px solid var(--accent, #C9A227)", fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                + Watchlist
              </button>
              <button
                onClick={onBewerten}
                style={{
                  padding: "8px 12px", borderRadius: 6, fontSize: 12.5, cursor: "pointer",
                  background: "var(--accent, #C9A227)", color: "#17171A",
                  border: "1px solid var(--accent, #C9A227)", fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                Bewerten
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* Platzhalterzeile der Trefferliste — derselbe Aufbau und dieselben
   Masse wie oben: Innenabstand 10px oben/unten, Poster 40 x 57,
   Titelzeile, Jahr, darunter die Knopfreihe, dieselbe Trennlinie.

   Sie gibt dem Dokument sofort Hoehe, damit die Seite beim Schliessen
   der Tastatur nicht nach oben klappt. */
function SkelettTrefferZeile() {
  return (
    <div
      aria-hidden="true"
      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: "1px solid #232326" }}
    >
      <SkelettFlaeche breite={40} hoehe={57} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <SkelettFlaeche breite="62%" hoehe={15} rund={3} />
        <SkelettFlaeche breite="24%" hoehe={13} rund={3} style={{ marginTop: 2 }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
          <SkelettFlaeche breite={94} hoehe={33} rund={6} />
          <SkelettFlaeche breite={83} hoehe={33} rund={6} />
        </div>
      </div>
    </div>
  );
}

/* Ab hier gilt eine Antwort als "zieht sich" und die Zeile zeigt einen
   Ladezustand. Darunter waere das Aufblitzen stoerender als hilfreich. */
const ZEILEN_LADEN_AB_MS = 400;

function NeuerEintrag({ category, categoryLabel, bekannt, onWatchlist, onBewerten, onCancel }) {
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
  /* Zeilen, deren Antwort sich ueber 400 ms hinzieht, und Zeilen, bei
     denen etwas schiefging. Beides haengt an der einzelnen Zeile — es
     gibt keinen globalen Ladezustand und keine globale Meldung mehr. */
  const [langsam, setLangsam] = useState(() => new Set());
  const [zeilenFehler, setZeilenFehler] = useState({});
  /* Doppelklick-Schutz: derselbe Eintrag kann waehrend eines laufenden
     Vorgangs nicht erneut abgeschickt werden. Als Ref, damit der
     zweite Klick den ersten auch dann sieht, wenn React die
     Zustandsaenderung noch nicht gerendert hat. */
  const laufend = useRef(new Set());
  /* Ein Treffer, der schon in der Sammlung steht, und was mit ihm
     geschehen sollte. Solange das hier gesetzt ist, steht die Rueckfrage
     offen — bestaetigt wird sie mit `trotzdem`. */
  const [warnung, setWarnung] = useState(null);

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

  /* Vormerken laeuft optimistisch: die Zeile steht sofort auf
     "✓ vorgemerkt", ohne auf den Server zu warten. Geht es schief,
     springt sie zurueck und sagt an Ort und Stelle, warum. */
  async function vormerken(kandidat) {
    const key = kandidatSchluessel(kandidat);
    if (laufend.current.has(key)) return;
    laufend.current.add(key);

    setZeilenFehler((alt) => {
      if (!(key in alt)) return alt;
      const neu = { ...alt };
      delete neu[key];
      return neu;
    });
    setVorgemerkt((alt) => new Set(alt).add(key));

    const langsamTimer = setTimeout(
      () => setLangsam((alt) => new Set(alt).add(key)),
      ZEILEN_LADEN_AB_MS
    );

    const { ok, fehler: grund } = await onWatchlist(kandidat);

    clearTimeout(langsamTimer);
    laufend.current.delete(key);
    setLangsam((alt) => {
      if (!alt.has(key)) return alt;
      const neu = new Set(alt);
      neu.delete(key);
      return neu;
    });

    if (!ok) {
      setVorgemerkt((alt) => {
        const neu = new Set(alt);
        neu.delete(key);
        return neu;
      });
      setZeilenFehler((alt) => ({ ...alt, [key]: grund || "Nicht vorgemerkt." }));
    }
  }

  /* Beide Wege — vormerken und direkt bewerten — laufen durch dieselbe
     Pruefung. Gibt es den Titel schon, wird erst gefragt; sonst geht es
     unveraendert weiter wie bisher. */
  function anstossen(kandidat, aktion) {
    const treffer = findeDuplikat(kandidat, bekannt);
    if (treffer) {
      setWarnung({ kandidat, aktion, treffer });
      return;
    }
    ausfuehren(kandidat, aktion);
  }

  function ausfuehren(kandidat, aktion) {
    if (aktion === "watchlist") vormerken(kandidat);
    else onBewerten(kandidat);
  }

  function trotzdem() {
    const offen = warnung;
    setWarnung(null);
    if (offen) ausfuehren(offen.kandidat, offen.aktion);
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
          aria-busy={laeuft}
          style={{
            flex: "0 0 auto", padding: "0 18px", borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: text.trim() ? "var(--accent, #C9A227)" : "#2A2A2E",
            color: text.trim() ? "#17171A" : "#77746c",
            border: "none", cursor: text.trim() && !laeuft ? "pointer" : "default",
            // Waehrend der Abfrage gesperrt und gedimmt — dieselbe
            // Ladedarstellung wie ueberall sonst in der App.
            opacity: laeuft ? 0.5 : 1,
          }}
        >
          Suchen
        </button>
      </div>

      {/* Waehrend der Abfrage vier Platzhalterzeilen statt eines
          Kleingedruckten. Sie sind das eigentliche Signal — und sie
          geben dem Dokument Hoehe, damit die Seite beim Schliessen der
          Tastatur nicht nach oben klappt. */}
      {laeuft && (
        <div>
          {Array.from({ length: 4 }, (_, i) => (
            <SkelettTrefferZeile key={i} />
          ))}
        </div>
      )}
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
                vorgemerkt={vorgemerkt.has(kandidatSchluessel(t))}
                langsam={langsam.has(kandidatSchluessel(t))}
                fehler={zeilenFehler[kandidatSchluessel(t)]}
                onWatchlist={() => anstossen(t, "watchlist")}
                onBewerten={() => anstossen(t, "bewerten")}
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
                vorgemerkt={vorgemerkt.has(kandidatSchluessel(eigener))}
                langsam={langsam.has(kandidatSchluessel(eigener))}
                fehler={zeilenFehler[kandidatSchluessel(eigener)]}
                onWatchlist={() => anstossen(eigener, "watchlist")}
                onBewerten={() => anstossen(eigener, "bewerten")}
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

      {/* Schon vorhanden? Dann erst fragen. Derselbe Dialog wie beim
          Loeschen, nur ohne die rote Warnfarbe — hier geht nichts
          verloren, es wird nur womoeglich etwas doppelt angelegt. */}
      {warnung && (
        <ConfirmDialog
          title="Steht schon in der Liste"
          text={duplikatText(warnung, categoryLabel)}
          confirmLabel="Trotzdem hinzufügen"
          onConfirm={trotzdem}
          onCancel={() => setWarnung(null)}
        />
      )}
    </div>
  );
}

/**
 * Der Satz in der Rueckfrage. Er nennt den Namen, unter dem der Titel
 * schon gespeichert ist — der weicht ja womoeglich genau von dem ab,
 * nach dem gerade gesucht wurde, und ohne diese Angabe waere die
 * Warnung ein Raetsel.
 */
function duplikatText(warnung, categoryLabel) {
  const gefunden = warnung.treffer.title;
  const gesucht = warnung.kandidat.title;
  const wo = warnung.treffer.watchlist ? "ist bereits vorgemerkt" : "ist bereits bewertet";

  const anders =
    titelSchluessel(gefunden) === titelSchluessel(gesucht)
      ? ""
      : " Gesucht hast du nach „" + gesucht + "“ — das ist derselbe Titel unter anderem Namen.";

  return (
    "„" + gefunden + "“ " + wo + " (" + categoryLabel + ")." + anders +
    " Trotzdem hinzufügen? Sinnvoll ist das etwa bei einem Remake, das du getrennt führen willst."
  );
}

/* ============================================================
   WATCHLIST — vorgemerkt, noch ohne Note
   ============================================================ */
function WatchlistZeile({ eintrag, busy, merkliste, onBewerten, onEntfernen, reihe = 0, vorrang = false }) {
  /* Die eigene Laufzeit des Eintrags. Ist sie nicht bekannt — oder
     handelt es sich um ein Spiel —, bleibt sie einfach weg. */
  const laufzeit = eintragLaufzeit(eintrag);
  return (
    <div className="listen-eintrag" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: "1px solid #232326", animationDelay: listenVersatz(reihe) }}>
      <Poster url={eintrag.poster} title={eintrag.title} size={34} vorrang={vorrang} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {eintrag.title}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#77746c", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {typeof eintrag.releaseYear === "number" ? eintrag.releaseYear + " · " : ""}
          {hinzugefuegtVor(eintrag.createdAt)}
        </div>
        {/* Eigene Zeile statt angehaengt: die Zeile darueber ist auf
            dem Telefon schon voll und schneidet ab, was nicht mehr
            hineinpasst — die Laufzeit waere unsichtbar geblieben. */}
        {laufzeit && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#77746c", marginTop: 2 }}>
            {laufzeitKurz(laufzeit)}
          </div>
        )}
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

   Nicht mehr "aehnliche Titel zu X": Aus den bewerteten Eintraegen
   entsteht ein Profil — welche Genres, welche Regie/Studios und welche
   Jahrzehnte ueberdurchschnittlich gut abschneiden —, und mit diesem
   Profil werden die Entdecken-Endpunkte der Quellen abgefragt. Das
   ergibt einen viel groesseren und passenderen Kandidatenpool; bei
   Anime lief der alte Weg regelmaessig ganz leer.

   Das Profil beruht auf ALLEN Bewertungen der Kategorie, gewichtet nach
   Endnote. Dazu gehen die Titel der Bestbewerteten mit: Aus ihnen holt
   der Server die Schlagworte, an denen er misst, wie gut ein Kandidat
   zum Geschmack passt — Genres allein unterscheiden zu grob.

   Was das Profil gewichtet, wie die Kandidaten sortiert werden und wie
   Kinderserien von Adult Animation getrennt bleiben, steht in
   api/recommendations.js. Hier wird das Profil nur gebaut, angezeigt
   und zwischengespeichert.

   Bei Spielen erscheint dieser Abschnitt gar nicht, deshalb steht hier
   nirgends "Backlog".
   ============================================================ */

/* Das Profil selbst entsteht aus ALLEN bewerteten Eintraegen der
   Kategorie — jeder zaehlt, gewichtet nach seiner Endnote (siehe
   `profilTeil`). Eine Obergrenze gibt es dafuer nicht: Genres, Regie
   und Jahrzehnte stehen ohnehin in der eigenen Datenbank und kosten
   keinen einzigen externen Aufruf.

   Etwas anderes gilt fuer die Schlagworte (TMDB-Keywords, bei Anime
   Jikans Themes): Zu den eigenen Eintraegen ist keine Kennung bei TMDB
   oder MyAnimeList gespeichert, der Server muss sie also ueber den
   Titel suchen — zwei Aufrufe je Titel. Deshalb gehen nur die
   Bestbewerteten als Titel mit. Bei Anime weniger, weil Jikan nur drei
   Anfragen je Sekunde zulaesst. */
const PROFIL_TITEL = { movie: 12, series: 12, anime: 8, kids: 12, adultanim: 12 };

/* So viele Vorschlaege stehen am Ende in der Liste. Der Server liefert
   deutlich mehr (rund 40) — der Rest ist Vorrat und rueckt nach, sobald
   ein Vorschlag auf der Watchlist landet. */
const EMPFEHLUNGEN_SICHTBAR = { movie: 15, series: 10, anime: 10, kids: 10, adultanim: 10 };

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
   sich bereits Bewertetes nicht zuverlaessig aussortieren laesst.
   Zuletzt, weil die Vorschlaege nun aus einem Profil ueber alle
   Bewertungen samt Schlagworten kommen und bei Kinderserien und Adult
   Animation zusaetzlich eine Alterspruefung durchlaufen. Ein alter
   Stand wird dadurch einmal verworfen; am Monatsrhythmus selbst aendert
   das nichts. */
const EMPFEHLUNGS_FASSUNG = 3;

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

/* So viele Eigenschaften je Art gehen ins Profil.

   Genres duerfen mehr sein als frueher: Sie bilden serverseitig den
   Vektor, an dem die Aehnlichkeit der Kandidaten gemessen wird, und
   dort kostet ein weiteres Genre nur Rechenzeit. Abgefragt werden bei
   der Quelle weiterhin nur die staerksten — das entscheidet der
   Server. Regie und Studio kosten dagegen je eine eigene Suche. */
const PROFIL_MAX = { genres: 8, regie: 2, studios: 1, jahrzehnte: 2 };

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
 * Die Titel, aus denen der Server die Schlagworte holt: die
 * Bestbewerteten der Kategorie, gewichtet an der besten Note.
 *
 * `bewertet` ist nach Endnote absteigend sortiert, der erste Eintrag
 * traegt damit das Gewicht 1. Die Titel gehen im Abfrageteil der URL
 * mit — deshalb die Laengengrenze.
 */
const MAX_TITEL_LAENGE = 60;

function profilTitel(bewertet, anzahl) {
  const beste = bewertet.slice(0, anzahl).filter((f) => f.title);
  if (!beste.length) return [];
  const spitze = beste[0].score;
  if (!(spitze > 0)) return [];

  return beste.map((f) => ({
    name: String(f.title).slice(0, MAX_TITEL_LAENGE),
    gewicht: Math.max(0.05, Math.round((f.score / spitze) * 100) / 100),
  }));
}

/**
 * Das Profil einer Kategorie.
 *
 * `bewertet` sind ALLE bewerteten Eintraege der Kategorie, nach Endnote
 * absteigend sortiert; `basisNote` ihr Durchschnitt — daran misst sich
 * "ueberdurchschnittlich". Frueher gingen nur die Besten ein; seither
 * traegt jeder Eintrag bei, aber nur so stark, wie er ueber dem
 * Durchschnitt liegt. Was unterdurchschnittlich abschneidet, zieht sein
 * Genre entsprechend nach unten — das ist der eigentliche Gewinn: Ein
 * Genre, das man zwar oft, aber selten gern sieht, faellt jetzt heraus.
 */
function geschmacksProfil(bewertet, basisNote, category) {
  const mit = (auswahl) =>
    bewertet.map((f) => ({ werte: auswahl(f), note: f.score }));

  return {
    titel: profilTitel(bewertet, PROFIL_TITEL[category] || 8),
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

/* Wie lang das Profil im Abfrageteil hoechstens werden darf. Zweitausend
   Zeichen gelten seit jeher als die Laenge, die jede Zwischenstation
   klaglos durchreicht; mit Pfad und Kategorie davor bleibt hier
   reichlich Luft. */
const MAX_PROFIL_LAENGE = 1500;

/**
 * Das Profil, gekuerzt auf eine Laenge, die sicher durch eine URL passt.
 *
 * Gekuerzt wird ausschliesslich bei den Titeln, und zwar von hinten:
 * Sie sind der einzige Teil, der mit der Sammlung waechst, und der
 * letzte in der Reihe ist der am schwaechsten gewichtete. Genres,
 * Regie, Studio und Jahrzehnte bleiben in jedem Fall vollstaendig —
 * ohne sie gaebe es gar keine Abfrage.
 */
function profilFuerUrl(profil) {
  if (!profil) return profil;
  const laenge = (p) => encodeURIComponent(JSON.stringify(p)).length;
  if (laenge(profil) <= MAX_PROFIL_LAENGE) return profil;

  const titel = [...(profil.titel || [])];
  while (titel.length) {
    titel.pop();
    const gekuerzt = { ...profil, titel };
    if (laenge(gekuerzt) <= MAX_PROFIL_LAENGE) return gekuerzt;
  }
  return { ...profil, titel: [] };
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
              const { ok } = await onWatchlist(v);
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

/* ============================================================
   FORTSETZUNGS-ERINNERUNG

   Gibt es zu einer bewerteten Serie inzwischen eine Staffel mehr, als
   hier erfasst ist? Der Abgleich laeuft ueber api/fortsetzungen.js:
   TMDB fuer Serien, Kinderserien und Adult Animation, Jikan fuer Anime.

   Nachgefragt wird einmal die Woche, nicht bei jedem Oeffnen — ein
   Durchgang kostet je Serie einen bis zwei externe Aufrufe. Der Stand
   liegt wie die Empfehlungen im localStorage und ueberdauert damit auch
   das Schliessen der Seite.

   Die gefundenen Kennungen wandern mit in den Speicher: Beim naechsten
   Durchgang gehen sie mit, dann entfaellt die Suche und es bleibt ein
   Aufruf je Serie.

   Hinzugefuegt wird nichts — der Hinweis sagt nur, dass es etwas
   nachzutragen gibt.
   ============================================================ */

const FORTSETZUNGS_SPEICHER = "bewertungsapp.fortsetzungen";
const FORTSETZUNGS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // eine Woche
/* Ein fehlgeschlagener Durchgang haelt nur einen Tag. Sonst wuerde eine
   Stoerung eine Woche lang nachwirken. */
const FORTSETZUNGS_TTL_FEHLER_MS = 24 * 60 * 60 * 1000;
const FORTSETZUNGS_FASSUNG = 1;

/* So oft fragt die App hoechstens nach. Ein Aufruf schafft, was in
   seine Frist passt; der Rest kommt in weiteren Runden. Die Grenze
   verhindert, dass eine Quelle, die dauerhaft nichts liefert, die App
   in eine Endlosschleife schickt. */
const FORTSETZUNGS_RUNDEN = 12;

const FORTSETZUNGS_KATEGORIEN = ["series", "kids", "adultanim", "anime"];

function ladeFortsetzungen() {
  try {
    const roh = window.localStorage.getItem(FORTSETZUNGS_SPEICHER);
    const eintrag = roh ? JSON.parse(roh) : null;
    if (!eintrag || typeof eintrag.zeit !== "number" || !eintrag.stand) return null;
    return eintrag;
  } catch (e) {
    return null;
  }
}

function speichereFortsetzungen(eintrag) {
  try {
    window.localStorage.setItem(FORTSETZUNGS_SPEICHER, JSON.stringify(eintrag));
  } catch (e) {
    // Ohne localStorage laeuft alles weiter, nur ohne Wochengedaechtnis.
  }
}

function fortsetzungenFrisch(eintrag) {
  if (!eintrag || eintrag.fassung !== FORTSETZUNGS_FASSUNG) return false;
  const frist = eintrag.fehler ? FORTSETZUNGS_TTL_FEHLER_MS : FORTSETZUNGS_TTL_MS;
  return Date.now() - eintrag.zeit < frist;
}

/**
 * Wie viele Staffeln die App zu einem Eintrag kennt.
 *
 * Zwei Quellen, und es zaehlt die groessere: die selbst bewerteten
 * Staffeln und die Staffelliste, die beim Anlegen von der Quelle kam.
 * Die groessere ist die vorsichtigere Wahl — wer drei von fuenf
 * Staffeln bewertet hat, weiss von fuenfen und braucht wegen der
 * vierten keinen Hinweis.
 */
function erfassteStaffeln(entry) {
  const bewertet = Array.isArray(entry.seasons) ? entry.seasons.length : 0;
  const bekannt = Array.isArray(entry.episodesPerSeason) ? entry.episodesPerSeason.length : 0;
  return Math.max(bewertet, bekannt, 1);
}

/**
 * Die Anfrage an den Endpunkt: alle bewerteten Serien, dazu die
 * Kennungen aus dem letzten Durchgang.
 */
function fortsetzungsAnfrage(items, alt) {
  const bekannt = (alt && alt.stand) || {};
  const raus = [];

  for (const key of FORTSETZUNGS_KATEGORIEN) {
    for (const eintrag of items[key] || []) {
      if (istVorgemerkt(eintrag)) continue;
      const frueher = bekannt[eintrag.id];
      raus.push({
        id: eintrag.id,
        category: key,
        title: eintrag.title,
        year: typeof eintrag.releaseYear === "number" ? eintrag.releaseYear : null,
        staffeln: erfassteStaffeln(eintrag),
        quelle: (frueher && frueher.quelle) || null,
        quellId: (frueher && frueher.quellId) || null,
      });
    }
  }
  return raus;
}

/**
 * Vergleichsform eines Anime-Titels, die die Staffelzaehlung mit
 * aufnimmt: "Shingeki no Kyojin Season 2" und "Shingeki no Kyojin
 * Staffel 2" werden dasselbe.
 *
 * Noetig, weil Jikan Fortsetzungen als eigene Eintraege fuehrt und
 * deren Titel selten genau so lauten wie der, unter dem die Staffel
 * hier gespeichert ist. Ueber Sprachgrenzen hinweg hilft das nicht —
 * dafuer steht darunter der Vergleich ueber die Kennungen.
 */
function animeStaffelSchluessel(title) {
  const key = titelSchluessel(title);
  if (!key) return "";
  const treffer = /^(.*?)\s*(?:season|staffel|part|teil|cour)\s*(\d+)$/.exec(key);
  if (treffer) return treffer[1].trim() + "#" + Number(treffer[2]);
  const nurZahl = /^(.*?)\s+(\d+)$/.exec(key);
  if (nurZahl) return nurZahl[1].trim() + "#" + Number(nurZahl[2]);
  return key + "#1";
}

/**
 * Zu welchen Eintraegen gibt es einen Hinweis?
 *
 * Bei TMDB ist die Antwort eindeutig: Die Quelle fuehrt mehr Staffeln
 * als die App. Bei Jikan gibt es keine Staffelzaehlung — dort meldet
 * der Endpunkt die Fortsetzungen, und hier faellt die Entscheidung, ob
 * davon eine noch fehlt. Verglichen wird ueber die MAL-Kennungen der
 * eigenen Anime (genau) und zusaetzlich ueber die Titel (fuer alles,
 * wozu keine Kennung vorliegt — Vorgemerktes etwa).
 */
function neueStaffeln(gespeichert, items) {
  const treffer = new Set();
  const stand = (gespeichert && gespeichert.stand) || null;
  if (!stand) return treffer;

  /* Die Eintraege selbst, um an die aktuelle Staffelzahl zu kommen. Sie
     entscheidet, nicht die vom Zeitpunkt des Abgleichs: Wer die neue
     Staffel nachtraegt, ist das Badge sofort los und wartet nicht eine
     Woche auf den naechsten Durchgang. */
  const nachId = new Map();
  for (const key of FORTSETZUNGS_KATEGORIEN) {
    for (const eintrag of items[key] || []) nachId.set(eintrag.id, eintrag);
  }

  const eigeneKennungen = new Set();
  for (const wert of Object.values(stand)) {
    if (wert && wert.quelle === "jikan" && wert.quellId) eigeneKennungen.add(String(wert.quellId));
  }

  const eigeneTitel = new Set();
  for (const eintrag of items.anime || []) {
    eigeneTitel.add(animeStaffelSchluessel(eintrag.title));
  }

  for (const [id, wert] of Object.entries(stand)) {
    if (!wert || !wert.neu) continue;
    const eintrag = nachId.get(id);
    // Geloescht oder zurueck auf die Watchlist — dann gibt es nichts,
    // woran ein Hinweis haengen koennte.
    if (!eintrag) continue;

    if (wert.quelle === "jikan") {
      const fehlt = (wert.fortsetzungen || []).some(
        (f) =>
          f &&
          f.titel &&
          !(f.malId && eigeneKennungen.has(String(f.malId))) &&
          !eigeneTitel.has(animeStaffelSchluessel(f.titel))
      );
      if (!fehlt) continue;
    } else if (typeof wert.staffeln === "number") {
      if (wert.staffeln <= erfassteStaffeln(eintrag)) continue;
    }

    treffer.add(id);
  }
  return treffer;
}

/* Das Hinweis-Badge selbst. Es nimmt die Kategoriefarbe auf wie der
   "+ Watchlist"-Knopf und bleibt bewusst klein — es ist eine Notiz am
   Rand, keine Meldung. */
function NeueStaffelBadge() {
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: 0.5,
        color: "var(--accent, #C9A227)", border: "1px solid var(--accent, #C9A227)",
        borderRadius: 4, padding: "1px 5px", flexShrink: 0, whiteSpace: "nowrap",
      }}
      title="Die Quelle führt mehr Staffeln, als hier erfasst sind."
    >
      NEUE STAFFEL
    </span>
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
/* `mitImdb` haengt ab 960px die IMDb-Note hinten an — bis dahin stand
   sie in der Liste gar nicht, sondern nur in der Detailansicht. Auf dem
   Handy fehlt dafuer schlicht der Platz: Jahr und Regie fuellen die
   Zeile dort bereits bis zum Abschneiden.

   Sichtbar wird sie ueber .nur-desktop-* und damit rein ueber CSS —
   unterhalb der Schwelle steht sie auf display: none und nimmt keinen
   Punkt ein. Die Rangliste in der Statistik setzt das Kennzeichen
   nicht und bleibt dadurch in jeder Breite unveraendert. */
function AngabenZeile({ eintrag, mitImdb }) {
  if (!unterstuetztAngaben(eintrag.category)) return null;

  const teile = [];
  if (typeof eintrag.releaseYear === "number") teile.push(String(eintrag.releaseYear));
  if (eintrag.director) teile.push(eintrag.director);
  const imdb = mitImdb && typeof eintrag.imdbRating === "number" ? eintrag.imdbRating : null;
  if (!teile.length && imdb === null) return null;

  /* Nur die IMDb-Note und sonst nichts: Dann darf auch die Zeile selbst
     erst ab der Schwelle erscheinen — eine leere Zeile haette am Handy
     zwei Bildpunkte Hoehe eingenommen, die es vorher nicht gab. */
  const nurImdb = !teile.length;

  return (
    <div
      className={nurImdb ? "nur-desktop-block" : undefined}
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
      {imdb !== null && (
        <span className="nur-desktop-inline">
          {nurImdb ? "" : " · "}IMDb {imdb.toFixed(1)}
        </span>
      )}
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

  /* Die Seite bringt ihre Bewegung selbst mit statt in einer Huelle zu
     stecken: sie liegt mit position: fixed ueber der Liste, und eine
     transform an einer Huelle darueber wuerde ihr genau diesen Bezug
     zum Fenster nehmen.

     Die Liste darunter wird nicht angefasst und behaelt damit ihre
     Rollposition — daran aendert die Bewegung nichts. */
  const reducedMotion = usePrefersReducedMotion();
  const [geht, setGeht] = useState(false);

  function zurueck() {
    if (reducedMotion) { onBack(); return; }
    setGeht(true);
    setTimeout(onBack, BEWEGUNG_RAUS_MS);
  }

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
    <div
      className={geht ? "seite-raus" : "seite-rein"}
      style={{ position: "fixed", inset: 0, background: "#17171A", zIndex: 50, overflowY: "auto", WebkitOverflowScrolling: "touch" }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 40px" }}>
        <button
          onClick={zurueck}
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

   Wie lange braucht es, alles Vorgemerkte zu schauen? Gezaehlt wird
   jede Kategorie mit Laufzeit — Spiele haben keine abrufbare und
   bleiben aussen vor.

   Eintraege, deren Laufzeit (noch) nicht bekannt ist, zaehlen nicht
   mit. Ihre Anzahl steht als Hinweis darunter, damit die Summe nicht
   vollstaendiger wirkt, als sie ist.

   Ueber die Auswahl darueber laesst sich der Abschnitt auf eine
   einzelne Kategorie einschraenken — dieselben Bereiche und dieselbe
   Bedienung wie in der Detailauswertung weiter unten, nur eben mit der
   Watchlist statt den Noten. Spiele stehen mit in der Auswahl und
   erklaeren beim Anklicken, warum es fuer sie keine Zahl gibt.
   ------------------------------------------------------------ */
const ZEITAUFWAND_KATEGORIEN = CATEGORIES.filter((c) => unterstuetztLaufzeit(c.key));

/* Knopf der Bereichsauswahl. Baugleich zu den Knoepfen der
   Detailauswertung — dort steht das Markup weiterhin an Ort und
   Stelle, damit dieser Abschnitt nichts Bestehendes anfasst. */
function ZeitaufwandBereich({ label, aktiv, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={aktiv}
      style={{
        padding: "9px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
        background: aktiv ? "#C9A227" : "transparent",
        color: aktiv ? "#17171A" : "#9A968C",
        border: "1px solid " + (aktiv ? "#C9A227" : "#33333a"),
        fontWeight: aktiv ? 700 : 400,
      }}
    >
      {label}
    </button>
  );
}

function ZeitaufwandWatchlist({ watchlist }) {
  const [scope, setScope] = useState("all");

  const daten = useMemo(() => {
    const jeKategorie = ZEITAUFWAND_KATEGORIEN.map((cat) => {
      let minuten = 0;
      let gezaehlt = 0;
      let offen = 0;
      for (const eintrag of watchlist[cat.key] || []) {
        const dauer = eintragLaufzeit(eintrag);
        if (dauer === null) {
          offen++;
          continue;
        }
        minuten += dauer;
        gezaehlt++;
      }
      return { key: cat.key, label: cat.label, minuten, gezaehlt, offen };
    });

    const gesamt = jeKategorie.reduce(
      (s, k) => ({
        minuten: s.minuten + k.minuten,
        gezaehlt: s.gezaehlt + k.gezaehlt,
        offen: s.offen + k.offen,
      }),
      { minuten: 0, gezaehlt: 0, offen: 0 }
    );

    return { jeKategorie, gesamt };
  }, [watchlist]);

  /* Spiele haben keine Laufzeit und deshalb auch keine Zahlen — die
     Auswahl fuehrt sie trotzdem, damit die Frage "und meine Spiele?"
     eine Antwort bekommt statt einfach zu fehlen. */
  const gewaehlt =
    scope === "all" ? daten.gesamt : daten.jeKategorie.find((k) => k.key === scope) || null;

  const inTagen = gewaehlt ? tageText(gewaehlt.minuten) : null;

  /* Eine Zeile fuer beides: die Tagesangabe (ab einem Tag sagt die
     Stundenzahl allein wenig) und — nur bei "Alle" — die
     Aufschluesselung nach Kategorie. Bei einer einzelnen Kategorie
     waere sie bloss die Wiederholung der Zahl darueber. */
  const nebenzeile = [];
  if (gewaehlt && gewaehlt.gezaehlt > 0) {
    if (inTagen) nebenzeile.push("das sind " + inTagen);
    if (scope === "all") {
      for (const k of daten.jeKategorie) nebenzeile.push(k.label + ": " + stundenKurz(k.minuten));
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 14px" }}>
        Zeitaufwand Watchlist
      </h2>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {STATS_SCOPES.map((s) => (
          <ZeitaufwandBereich
            key={s.key}
            label={s.label}
            aktiv={scope === s.key}
            onClick={() => setScope(s.key)}
          />
        ))}
      </div>

      {!gewaehlt ? (
        <div style={{ color: "#77746c", fontSize: 13, padding: "8px 0" }}>
          Keine Laufzeit-Daten für Spiele.
        </div>
      ) : gewaehlt.gezaehlt === 0 && gewaehlt.offen === 0 ? (
        <div style={{ color: "#77746c", fontSize: 13, padding: "8px 0" }}>
          {scope === "all"
            ? "Nichts vorgemerkt — Spiele zählen hier nicht mit."
            : "Keine " + gewaehlt.label + " vorgemerkt."}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <StatCard label="GESAMT" value={stundenText(gewaehlt.minuten)} />
            <StatCard label="MIT LAUFZEIT" value={gewaehlt.gezaehlt} />
          </div>

          {nebenzeile.length > 0 && (
            <div style={{ fontSize: 12.5, color: "#77746c", lineHeight: 1.5 }}>
              {nebenzeile.join(" · ")}
            </div>
          )}

          {gewaehlt.offen > 0 && (
            <div style={{ fontSize: 12, color: "#55524c", marginTop: 6, lineHeight: 1.5 }}>
              {gewaehlt.offen}{" "}
              {gewaehlt.offen === 1 ? "Eintrag ohne bekannte Laufzeit" : "Einträge ohne bekannte Laufzeit"},
              noch nicht mitgerechnet
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================
   JAHRESRÜCKBLICK

   Was ist in einem Jahr zusammengekommen? Gezaehlt wird nach dem Tag,
   an dem aus einem Eintrag ein bewerteter wurde — nicht nach dem Tag,
   an dem er angelegt oder zuletzt angefasst wurde.

   Das Datum steht seit dieser Erweiterung in einer eigenen Spalte
   (`ratedAt`, siehe api/_db.js). Es wird genau einmal gesetzt und
   danach nie wieder verschoben; das automatische Nachladen von Poster,
   Genres und Laufzeit laesst es unberuehrt.

   Bei Serien mit einzeln bewerteten Staffeln zaehlt die zuletzt
   nachgetragene Staffel: Wer 2024 die ersten drei Staffeln bewertet
   und 2026 die vierte nachtraegt, hat die Serie 2026 zuletzt bewertet.

   Eintraege ohne Datum — der Altbestand aus der Zeit vor dieser Spalte
   — bleiben aussen vor und werden am Fuss des Abschnitts als Zahl
   genannt. Sie einem Jahr zuzuschlagen hiesse, es zu erfinden.
   ============================================================ */

/** Wann wurde zuletzt bewertet? Zeitstempel oder null. */
function bewertetAm(entry) {
  let zeit = typeof entry.ratedAt === "number" && entry.ratedAt > 0 ? entry.ratedAt : 0;
  for (const staffel of entry.seasons || []) {
    if (typeof staffel.createdAt === "number" && staffel.createdAt > zeit) zeit = staffel.createdAt;
  }
  return zeit > 0 ? zeit : null;
}

function jahrDerBewertung(entry) {
  const zeit = bewertetAm(entry);
  return zeit ? new Date(zeit).getFullYear() : null;
}

function Jahresrueckblick({ ranked }) {
  const [gewaehlt, setGewaehlt] = useState(() => new Date().getFullYear());

  const daten = useMemo(() => {
    const nachJahr = new Map();
    let ohneDatum = 0;

    for (const cat of CATEGORIES) {
      for (const eintrag of ranked[cat.key] || []) {
        const jahr = jahrDerBewertung(eintrag);
        if (!jahr) {
          ohneDatum++;
          continue;
        }
        if (!nachJahr.has(jahr)) nachJahr.set(jahr, []);
        nachJahr.get(jahr).push({ eintrag, category: cat.key });
      }
    }

    return {
      nachJahr,
      ohneDatum,
      jahre: [...nachJahr.keys()].sort((a, b) => b - a),
    };
  }, [ranked]);

  /* Das laufende Jahr, solange darin etwas steht — sonst das neueste
     Jahr, zu dem es ueberhaupt etwas zu zeigen gibt. */
  const jahr = daten.nachJahr.has(gewaehlt) ? gewaehlt : daten.jahre[0] ?? null;

  const rueckblick = useMemo(() => {
    const liste = (jahr && daten.nachJahr.get(jahr)) || [];
    if (!liste.length) return null;

    const zaehler = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0]));
    const genres = new Map();
    let bester = null;
    let minuten = 0;
    let ohneLaufzeit = 0;

    for (const { eintrag, category } of liste) {
      zaehler[category]++;

      // Genres zaehlen ueber alle Eintraege des Jahres, jedes Genre je
      // Eintrag genau einmal — sonst zaehlte eine doppelt gepflegte
      // Liste doppelt.
      for (const genre of new Set(eintrag.genre || [])) {
        genres.set(genre, (genres.get(genre) || 0) + 1);
      }

      if (typeof eintrag.score === "number" && (!bester || eintrag.score > bester.score)) {
        bester = eintrag;
      }

      if (unterstuetztLaufzeit(category)) {
        const dauer = eintragLaufzeit(eintrag);
        if (dauer === null) ohneLaufzeit++;
        else minuten += dauer;
      }
    }

    const staerksteKategorie = CATEGORIES.map((c) => ({ label: c.label, anzahl: zaehler[c.key] }))
      .filter((k) => k.anzahl > 0)
      .sort((a, b) => b.anzahl - a.anzahl)[0] || null;

    const haeufigstesGenre = [...genres.entries()]
      .map(([name, anzahl]) => ({ name, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, "de"))[0] || null;

    return {
      anzahl: liste.length,
      zaehler,
      staerksteKategorie,
      haeufigstesGenre,
      bester,
      minuten,
      ohneLaufzeit,
    };
  }, [jahr, daten]);

  if (!daten.jahre.length) {
    return (
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 14px" }}>
          Jahresrückblick
        </h2>
        <div style={{ fontSize: 12.5, color: "#77746c", lineHeight: 1.6 }}>
          Noch nichts zu zeigen. Sobald du etwas bewertest, sammelt sich
          hier das Jahr — der Bestand aus der Zeit davor trägt kein
          Bewertungsdatum und bleibt deshalb außen vor.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 14px" }}>
        Jahresrückblick
      </h2>

      {/* Jahresauswahl — dieselben Knoepfe wie beim Zeitaufwand. */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {daten.jahre.map((j) => (
          <ZeitaufwandBereich
            key={j}
            label={String(j)}
            aktiv={jahr === j}
            onClick={() => setGewaehlt(j)}
          />
        ))}
      </div>

      {rueckblick && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {CATEGORIES.filter((c) => rueckblick.zaehler[c.key] > 0).map((c) => (
              <StatCard
                key={c.key}
                label={c.label.toUpperCase()}
                value={rueckblick.zaehler[c.key]}
              />
            ))}
            <StatCard label="GESAMT" value={rueckblick.anzahl} />
          </div>

          <div
            style={{
              background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 12,
              padding: "14px 16px", marginBottom: 10,
            }}
          >
            <RueckblickZeile
              label="Meiste Bewertungen"
              wert={
                rueckblick.staerksteKategorie
                  ? rueckblick.staerksteKategorie.label +
                    " (" + rueckblick.staerksteKategorie.anzahl + ")"
                  : "—"
              }
            />
            <RueckblickZeile
              label="Häufigstes Genre"
              wert={
                rueckblick.haeufigstesGenre
                  ? rueckblick.haeufigstesGenre.name +
                    " (" + rueckblick.haeufigstesGenre.anzahl + "×)"
                  : "noch keine Genres geladen"
              }
            />
            <RueckblickZeile
              label="Bester Neuzugang"
              wert={rueckblick.bester ? rueckblick.bester.title : "—"}
              zusatz={
                rueckblick.bester && typeof rueckblick.bester.score === "number"
                  ? rueckblick.bester.score.toFixed(2)
                  : null
              }
              zusatzFarbe={
                rueckblick.bester && typeof rueckblick.bester.score === "number"
                  ? scoreToColor(rueckblick.bester.score)
                  : null
              }
            />
            <RueckblickZeile
              label="Gesehene Zeit"
              wert={
                rueckblick.minuten > 0
                  ? stundenText(rueckblick.minuten) +
                    (tageText(rueckblick.minuten) ? " · " + tageText(rueckblick.minuten) : "")
                  : "noch keine Laufzeiten bekannt"
              }
              letzte
            />
          </div>

          <div style={{ fontSize: 11, color: "#77746c", lineHeight: 1.6 }}>
            Gezählt wird nach dem Datum der Bewertung; bei Serien nach der
            zuletzt nachgetragenen Staffel. Spiele haben keine abrufbare
            Laufzeit und gehen in die gesehene Zeit nicht ein.
            {rueckblick.ohneLaufzeit > 0 &&
              " " + rueckblick.ohneLaufzeit + " Einträge ohne bekannte Laufzeit fehlen in der Summe."}
            {daten.ohneDatum > 0 &&
              " " + daten.ohneDatum + " ältere Einträge tragen kein Bewertungsdatum und stehen in keinem Jahr."}
          </div>
        </>
      )}
    </div>
  );
}

/* Eine Zeile im Rueckblick: Beschriftung links, Wert rechts — dieselbe
   Aufteilung wie in der Detailansicht eines Eintrags. */
function RueckblickZeile({ label, wert, zusatz, zusatzFarbe, letzte }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
        padding: "9px 0",
        borderBottom: letzte ? "none" : "1px solid #232326",
      }}
    >
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 0.5,
          color: "#9A968C", flexShrink: 0,
        }}
      >
        {label.toUpperCase()}
      </span>
      <span
        style={{
          fontSize: 14, color: "#EDEAE3", textAlign: "right", minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {wert}
        {zusatz && (
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
              color: zusatzFarbe || "#9A968C", marginLeft: 8,
            }}
          >
            {zusatz}
          </span>
        )}
      </span>
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

      {/* Was in einem Jahr zusammenkam. Steht vor der Watchlist, weil
          es zurueckblickt, wo diese nach vorn schaut. */}
      <Jahresrueckblick ranked={ranked} />

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
   MINISPIELE

   Ein eigener Bereich neben den Kategorien und der Statistik,
   erreichbar ueber das Controller-Symbol im Kopfbereich. Zurzeit
   steht dort ein Spiel; weitere kommen spaeter als eigene Kacheln
   in dieselbe Uebersicht.
   ============================================================ */
const MINISPIELE = [
  {
    key: "head-to-head",
    name: "Head-to-Head",
    beschreibung:
      "Zwei Titel derselben Kategorie treten gegeneinander an. Deine Wahl verschiebt " +
      "das Bauchgefühl beider Titel — und damit ein Stück weit ihre Endnote.",
  },
  {
    key: "turnier",
    name: "Turnier",
    beschreibung:
      "Vier, acht oder sechzehn Titel im K.o.-System: Runde für Runde bis zum " +
      "Sieger. Jede Paarung ist ein Duell — überspringen geht hier nicht.",
  },
  {
    key: "higher-or-lower",
    name: "Higher or Lower",
    beschreibung:
      "Höher oder niedriger als die Note darüber? Rate dich durch eine möglichst " +
      "lange Strähne — je Spielart zählt ein eigener Bestwert.",
  },
  {
    key: "was-schau-ich",
    name: "Was schau ich?",
    beschreibung:
      "Keine Lust zu wählen? Das Rad dreht sich durch die Watchlist einer " +
      "Kategorie und bleibt bei einem Titel stehen.",
  },
];

/* Wie lange die Rueckmeldung nach einer Wahl stehen bleibt, bevor das
   naechste Duell kommt. Ein Tippen springt jederzeit sofort weiter. */
const DUELL_PAUSE_MS = 1300;

function MinispielePage({ ranked, watchlist, duellZahlen, onDuell, onBewerten, onXP, onTurnier, fehler }) {
  const [spiel, setSpiel] = useState(null);

  if (spiel === "head-to-head") {
    return (
      <HeadToHead
        ranked={ranked}
        duellZahlen={duellZahlen}
        onDuell={onDuell}
        fehler={fehler}
        onZurueck={() => setSpiel(null)}
      />
    );
  }

  /* Dasselbe onDuell wie beim Head-to-Head: eine Turnier-Paarung wird
     genauso ausgewertet wie ein freies Duell. */
  if (spiel === "turnier") {
    return (
      <Turnier
        ranked={ranked}
        onDuell={onDuell}
        onFertig={onTurnier}
        fehler={fehler}
        onZurueck={() => setSpiel(null)}
      />
    );
  }

  if (spiel === "higher-or-lower") {
    return <HigherOrLower ranked={ranked} onZurueck={() => setSpiel(null)} onXP={onXP} />;
  }

  if (spiel === "was-schau-ich") {
    return (
      <WasSchauIch
        watchlist={watchlist}
        onBewerten={onBewerten}
        onZurueck={() => setSpiel(null)}
      />
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 50px" }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 6px" }}>
        Minispiele
      </h2>
      <p style={{ color: "#9A968C", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 18px" }}>
        Kleine Spiele rund um die eigene Sammlung.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {MINISPIELE.map((s) => (
          <button
            key={s.key}
            onClick={() => setSpiel(s.key)}
            style={{
              flex: "1 1 240px", minWidth: 0, textAlign: "left", cursor: "pointer",
              background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 12,
              padding: 16, color: "#EDEAE3", fontFamily: "inherit",
            }}
          >
            <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
              {s.name}
            </div>
            <div style={{ fontSize: 12.5, color: "#9A968C", lineHeight: 1.5 }}>{s.beschreibung}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Eine Seite des Duells. Bewusst ohne Note: die Wahl soll aus dem
   Titel selbst kommen, nicht aus der Zahl daneben. */
function DuellKarte({ eintrag, zustand, onClick }) {
  const gewaehlt = zustand === "gewaehlt";
  const unterlegen = zustand === "unterlegen";
  const jahr = typeof eintrag.releaseYear === "number" ? eintrag.releaseYear : null;

  return (
    <button
      onClick={onClick}
      style={{
        flex: "1 1 0", minWidth: 0, cursor: "pointer", fontFamily: "inherit",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 9,
        background: "#1D1D21",
        border: "1px solid " + (gewaehlt ? "var(--accent, #C9A227)" : "#2A2A2E"),
        borderRadius: 12, padding: 10, color: "#EDEAE3",
        opacity: unterlegen ? 0.38 : 1,
        /* transform gehoert mit in die eigene Angabe: sonst
           ueberschriebe sie die Tipp-Rueckmeldung aus dem Stylesheet
           und die Karte spraenge statt zu federn. Die GEWAEHLT-
           Markierung bleibt davon unberuehrt. */
        transition: "opacity 200ms ease, border-color 200ms ease, transform var(--bewegung-tippen)",
      }}
    >
      <Poster url={eintrag.poster} title={eintrag.title} size={100} />
      <div
        style={{
          fontSize: 14, lineHeight: 1.3, textAlign: "center",
          width: "100%", overflowWrap: "anywhere",
        }}
      >
        {eintrag.title}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "#77746c" }}>
        {jahr !== null ? jahr : "—"}
      </div>
      {/* Der Platz fuer das Abzeichen bleibt immer frei, sonst
          huepften die Karten beim Einblenden in der Hoehe. */}
      <div style={{ minHeight: 20, display: "flex", alignItems: "center" }}>
        {gewaehlt && (
          <span
            style={{
              fontSize: 10.5, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace",
              background: "var(--accent, #C9A227)", color: "#17171A",
              borderRadius: 4, padding: "3px 8px", fontWeight: 700,
            }}
          >
            GEWÄHLT
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * Wer je Kategorie ueberhaupt antreten kann — fuer jedes Spiel, das
 * Duelle auswertet (Head-to-Head wie Turnier).
 *
 * Antreten kann nur, wer eine Endnote und ein Bauchgefuehl hat.
 * Vorgemerkte Eintraege sind hier ohnehin nicht dabei (sie stehen in
 * keiner Rangliste); Eintraege ohne Note — Staffelgewichte in Summe 0 —
 * fallen heraus, und ohne Bauchgefuehl gaebe es nichts zu verschieben.
 * Die Reihenfolge bleibt die der Rangliste, daran haengt das Fenster
 * der Head-to-Head-Paarung.
 */
function duellTeilnehmer(ranked) {
  const result = {};
  for (const c of CATEGORIES) {
    /* Jeder Eintrag tritt hoechstens einmal an. Stuende derselbe
       zweimal in der Liste, koennte er im Duell gegen sich selbst
       antreten und im Turnierbaum zweimal auftauchen. Die Sperre sitzt
       hier und nicht in den Spielen: so ziehen Head-to-Head und
       Turnier aus demselben Feld, und die Zahl, die bei der Kategorie
       steht ("N bewertet"), meint genau die Titel, die auch antreten
       koennen. Eintraege ohne ID bleiben unangetastet — sie liessen
       sich nicht auseinanderhalten. */
    const gesehen = new Set();
    result[c.key] = (ranked[c.key] || []).filter((f) => {
      if (typeof f.score !== "number" || typeof entryPersonal(f) !== "number") return false;
      if (!f.id) return true;
      if (gesehen.has(f.id)) return false;
      gesehen.add(f.id);
      return true;
    });
  }
  return result;
}

function HeadToHead({ ranked, duellZahlen, onDuell, fehler, onZurueck }) {
  const [kategorie, setKategorie] = useState(null);
  const [paar, setPaar] = useState(null);
  // ID des gewaehlten Titels — solange sie steht, laeuft die Rueckmeldung.
  const [gewaehlt, setGewaehlt] = useState(null);

  const teilnehmer = useMemo(() => duellTeilnehmer(ranked), [ranked]);

  /* Gezogen wird immer aus dem aktuellen Stand: nach einem Duell haben
     sich zwei Endnoten verschoben und die Rangliste sieht anders aus.
     Der Verweis haelt ihn fuer die Zeitschaltung bereit, die nicht bei
     jedem Neuaufbau neu gesetzt werden soll. */
  const listeRef = useRef([]);
  listeRef.current = kategorie ? teilnehmer[kategorie] : [];
  /* Die zuletzt gezogenen Paarungen, die juengste zuletzt. Sie halten
     dieselbe Begegnung fuer ein paar Zuege draussen. */
  const verlaufRef = useRef([]);

  function merkePaarung(gezogen) {
    if (!gezogen) return;
    verlaufRef.current = [...verlaufRef.current, [gezogen[0].id, gezogen[1].id]].slice(-DUELL_VERLAUF);
  }

  const speicherungRef = useRef(null);
  const wechseltRef = useRef(false);
  const lebtRef = useRef(true);
  useEffect(() => () => { lebtRef.current = false; }, []);

  /* Naechstes Duell. Laeuft die Auswertung des letzten noch, wird sie
     abgewartet — sonst zoege die neue Paarung aus einer Rangliste, in
     der das eben gespielte Duell noch nicht steckt. */
  function weiter() {
    if (wechseltRef.current) return;
    wechseltRef.current = true;

    const zeichnen = () => {
      wechseltRef.current = false;
      if (!lebtRef.current) return;
      setGewaehlt(null);
      const naechste = ziehePaarung(listeRef.current, verlaufRef.current);
      merkePaarung(naechste);
      setPaar(naechste);
    };

    const laufend = speicherungRef.current;
    speicherungRef.current = null;
    if (laufend) laufend.then(zeichnen, zeichnen);
    else zeichnen();
  }

  function waehle(gewinner, verlierer) {
    if (gewaehlt || wechseltRef.current) return;
    setGewaehlt(gewinner.id);
    speicherungRef.current = Promise.resolve(onDuell(kategorie, gewinner.id, verlierer.id));
  }

  /* Erstes Duell einer Kategorie. Nur die Wahl der Kategorie loest es
     aus — sonst wuerde jede gespeicherte Verschiebung sofort ein neues
     Paar ziehen und die Rueckmeldung waere nie zu sehen. */
  useEffect(() => {
    setGewaehlt(null);
    /* Neue Kategorie, neuer Verlauf — die gesperrten Paarungen der
       vorigen Kategorie kommen hier ohnehin nicht vor. */
    verlaufRef.current = [];
    const erste = kategorie ? ziehePaarung(listeRef.current, null) : null;
    merkePaarung(erste);
    setPaar(erste);
  }, [kategorie]);

  /* Nach kurzer Pause von selbst weiter. Wer nicht warten mag, tippt. */
  useEffect(() => {
    if (!gewaehlt) return undefined;
    const zeit = setTimeout(weiter, DUELL_PAUSE_MS);
    return () => clearTimeout(zeit);
  }, [gewaehlt]);

  // ---- Kategorie waehlen ----
  if (!kategorie) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 50px" }}>
        <button
          onClick={onZurueck}
          style={{ background: "transparent", border: "none", color: "#9A968C", fontSize: 15, cursor: "pointer", padding: "10px 0", marginBottom: 8 }}
        >
          ← Minispiele
        </button>

        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 6px" }}>
          Head-to-Head
        </h2>
        <p style={{ color: "#9A968C", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 18px" }}>
          In welcher Kategorie soll gespielt werden? Duelle finden immer
          innerhalb einer Kategorie statt.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {CATEGORIES.map((c) => {
            const anzahl = teilnehmer[c.key].length;
            const moeglich = anzahl >= MIN_DUELL_TEILNEHMER;
            const gespielt = duellZahlen[c.key] || 0;
            return (
              <button
                key={c.key}
                onClick={() => moeglich && setKategorie(c.key)}
                disabled={!moeglich}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "14px", borderRadius: 10, textAlign: "left",
                  background: "#1D1D21",
                  border: "1px solid " + (moeglich ? accentFor(c.key) : "#2A2A2E"),
                  color: moeglich ? "#EDEAE3" : "#55524c",
                  cursor: moeglich ? "pointer" : "default",
                  fontFamily: "inherit", fontSize: 15, fontWeight: 700,
                }}
              >
                <span>{c.label}</span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, fontWeight: 400,
                    color: moeglich ? "#9A968C" : "#55524c", textAlign: "right",
                  }}
                >
                  {moeglich
                    ? anzahl + " bewertet" + (gespielt ? " · " + gespielt + " Duelle" : "")
                    : "mind. " + MIN_DUELL_TEILNEHMER + " Bewertungen"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Duell ----
  const catInfo = CATEGORIES.find((c) => c.key === kategorie);
  const gespielt = duellZahlen[kategorie] || 0;

  return (
    <div
      style={{
        "--accent": accentFor(kategorie),
        maxWidth: 720, margin: "0 auto", padding: "20px 20px 50px",
      }}
    >
      <button
        onClick={() => setKategorie(null)}
        style={{ background: "transparent", border: "none", color: "#9A968C", fontSize: 15, cursor: "pointer", padding: "10px 0", marginBottom: 8 }}
      >
        ← Kategorie wechseln
      </button>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace" }}>
          HEAD-TO-HEAD · {catInfo.label.toUpperCase()}
        </div>
        <div style={{ fontSize: 11.5, color: "#77746c", fontFamily: "'JetBrains Mono', monospace" }}>
          {gespielt} {gespielt === 1 ? "Duell" : "Duelle"} gespielt
        </div>
      </div>

      {fehler && (
        <div style={{ background: "#2a1616", border: "1px solid #d9736a", color: "#d9736a", borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
          {fehler}
        </div>
      )}

      {!paar ? (
        <div style={{ color: "#77746c", textAlign: "center", padding: 50, fontSize: 14.5 }}>
          In dieser Kategorie gibt es gerade kein Duell.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {[0, 1].map((seite) => {
              const eintrag = paar[seite];
              const gegner = paar[1 - seite];
              const zustand = !gewaehlt
                ? "offen"
                : gewaehlt === eintrag.id
                  ? "gewaehlt"
                  : "unterlegen";
              return (
                <React.Fragment key={eintrag.id}>
                  {seite === 1 && (
                    <div
                      aria-hidden="true"
                      style={{
                        flex: "0 0 auto", width: 26, textAlign: "center",
                        fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 16,
                        color: "#55524c", letterSpacing: 0.5,
                      }}
                    >
                      VS
                    </div>
                  )}
                  <DuellKarte
                    eintrag={eintrag}
                    zustand={zustand}
                    onClick={() => (gewaehlt ? weiter() : waehle(eintrag, gegner))}
                  />
                </React.Fragment>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: "#77746c", textAlign: "center", margin: "14px 0 16px", lineHeight: 1.5 }}>
            {gewaehlt
              ? "Tippen für das nächste Duell."
              : "Welcher Titel gefällt dir besser?"}
          </div>

          <button
            onClick={() => weiter()}
            disabled={!!gewaehlt}
            style={{
              width: "100%", padding: "13px", borderRadius: 8, fontSize: 14,
              background: "transparent", color: gewaehlt ? "#55524c" : "#9A968C",
              border: "1px solid " + (gewaehlt ? "#2A2A2E" : "#33333a"),
              cursor: gewaehlt ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            Überspringen
          </button>
          <div style={{ fontSize: 11.5, color: "#55524c", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
            Überspringen zählt nicht und ändert keine Note.
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   MINISPIEL "TURNIER" — K.o.-System

   Kein zweites Duellspiel, sondern die Runden drumherum: gespielt
   wird Paarung fuer Paarung mit genau demselben Duell-Bildschirm
   (DuellKarte) und genau derselben Auswertung wie bei Head-to-Head
   (onDuell — siehe duellAuswerten). Neu sind allein die Auslosung,
   der Bracket-Baum und der Sieger am Ende.

   Anders als beim freien Head-to-Head gibt es kein Ueberspringen: in
   jeder Paarung muss eine Wahl getroffen werden, sonst gaebe es
   niemanden, der weiterkommt.
   ============================================================ */

/* Waehlbare Turniergroessen. Groesser als das Feld bewerteter Titel
   kann ein Turnier nicht werden — zu grosse Groessen stehen deshalb
   nicht zur Wahl. */
const TURNIER_GROESSEN = [4, 8, 16];

/* Ab so vielen bewerteten Titeln laesst sich in einer Kategorie
   ueberhaupt ein Turnier spielen. */
const TURNIER_MIN_TEILNEHMER = TURNIER_GROESSEN[0];

/* Der Name einer Runde haengt allein an der Zahl ihrer Paarungen —
   bei acht Teilnehmern faengt es also im Viertelfinale an. */
function turnierRundenName(paare) {
  if (paare === 1) return "Finale";
  if (paare === 2) return "Halbfinale";
  if (paare === 4) return "Viertelfinale";
  return "Achtelfinale";
}

/**
 * `groesse` Teilnehmer aus der Liste losen.
 *
 * Gemischt wird die ganze Liste (Fisher-Yates), danach wird vorne
 * abgeschnitten: jeder bewertete Titel hat dieselbe Chance, und
 * gesetzt wird nichts — Platz 1 kann schon in der ersten Runde auf
 * Platz 2 treffen. Zurueck kommt null, wenn das Feld nicht reicht.
 */
function zieheTurnierFeld(liste, groesse, zufall = Math.random) {
  if (!Array.isArray(liste) || liste.length < groesse) return null;
  const kopie = liste.slice();
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    const merk = kopie[i];
    kopie[i] = kopie[j];
    kopie[j] = merk;
  }
  return kopie.slice(0, groesse);
}

/**
 * Der Baum zu einem gelosten Feld: die erste Runde mit den ausgelosten
 * Paarungen, darunter je Runde halb so viele noch leere Paarungen bis
 * zum Finale.
 *
 * Eine Paarung haelt ihre beiden Plaetze (`a`, `b` — null, solange
 * niemand dort steht) und die ID des Siegers (null, solange sie nicht
 * entschieden ist).
 */
function baueTurnierbaum(feld) {
  if (!Array.isArray(feld) || feld.length < 2) return null;
  const erste = [];
  for (let i = 0; i + 1 < feld.length; i += 2) {
    erste.push({ a: feld[i], b: feld[i + 1], sieger: null });
  }
  const baum = [erste];
  let anzahl = erste.length;
  while (anzahl > 1) {
    anzahl = Math.floor(anzahl / 2);
    const runde = [];
    for (let i = 0; i < anzahl; i++) runde.push({ a: null, b: null, sieger: null });
    baum.push(runde);
  }
  return baum;
}

/**
 * Die naechste zu entscheidende Paarung: die erste ohne Sieger, von
 * oben nach unten gelesen. Weil in dieser Reihenfolge entschieden
 * wird, stehen dort immer schon beide Teilnehmer fest.
 *
 * Zurueck kommt null, wenn auch das Finale entschieden ist.
 */
function offeneTurnierPaarung(baum) {
  for (let r = 0; r < baum.length; r++) {
    for (let p = 0; p < baum[r].length; p++) {
      if (!baum[r][p].sieger) return { runde: r, paar: p };
    }
  }
  return null;
}

/**
 * Den Baum mit einer entschiedenen Paarung zurueckgeben — der alte
 * bleibt unberuehrt. Der Sieger rueckt zugleich in die naechste Runde
 * nach: zwei benachbarte Paarungen treffen sich dort, die gerade
 * Nummer links, die ungerade rechts.
 */
function mitTurnierEntscheidung(baum, ort, siegerId) {
  const neu = baum.map((runde) => runde.map((paarung) => ({ ...paarung })));
  const paarung = neu[ort.runde][ort.paar];
  const sieger = paarung.a && paarung.a.id === siegerId ? paarung.a : paarung.b;
  if (!sieger || sieger.id !== siegerId) return baum;
  paarung.sieger = sieger.id;

  const naechste = neu[ort.runde + 1];
  if (naechste) {
    const ziel = naechste[Math.floor(ort.paar / 2)];
    if (ort.paar % 2 === 0) ziel.a = sieger;
    else ziel.b = sieger;
  }
  return neu;
}

/** Der Turniersieger — null, solange das Finale nicht entschieden ist. */
function turnierSieger(baum) {
  const finale = baum[baum.length - 1][0];
  if (!finale || !finale.sieger) return null;
  return finale.a && finale.a.id === finale.sieger ? finale.a : finale.b;
}

/* Pokal — das Zeichen des Turniersiegers. Wie die uebrigen Symbole der
   App eine reine Strichzeichnung, die ihre Farbe vom Umfeld erbt. */
function IconPokal({ groesse = 18 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ ...symbolBasis, width: groesse, height: groesse }}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7.4 3.4h9.2v5.1a4.6 4.6 0 0 1-9.2 0V3.4Z" />
      <path d="M7.4 5.4H4.5v1.3a3.4 3.4 0 0 0 3.4 3.4" />
      <path d="M16.6 5.4h2.9v1.3a3.4 3.4 0 0 1-3.4 3.4" />
      <path d="M12 13.1v3.4" />
      <path d="M8.5 20.6h7l-1-4.1h-5l-1 4.1Z" />
    </svg>
  );
}

/* Eine Zeile der Bracket-Karte. Ohne Eintrag steht dort "?" — dieser
   Platz ist noch nicht ausgespielt. */
function BracketTeilnehmer({ eintrag, sieger, verloren, trennlinie, akzent }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8, minWidth: 0,
        padding: "8px 10px",
        borderBottom: trennlinie ? "1px solid #2A2A2E" : "none",
        opacity: verloren ? 0.5 : 1,
      }}
    >
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.35,
          overflowWrap: "anywhere", color: eintrag ? "#EDEAE3" : "#55524c",
          fontFamily: eintrag ? "inherit" : "'JetBrains Mono', monospace",
        }}
      >
        {eintrag ? eintrag.title : "?"}
      </span>
      {sieger && (
        <span style={{ flexShrink: 0, display: "flex", color: akzent }} title="weiter">
          <IconHaken groesse={14} />
        </span>
      )}
    </div>
  );
}

/**
 * Eine Paarung im Baum. Vier Zustaende:
 *
 *   aktuell       — jetzt zu entscheiden: Rahmen und getoenter Grund
 *                   in der Kategoriefarbe.
 *   entschieden   — Sieger mit Haekchen, Verlierer abgeblendet.
 *   unerreichbar  — mindestens ein Platz noch offen ("?"), stark
 *                   abgeblendet.
 *   bereit        — beide Teilnehmer stehen fest, die Paarung ist aber
 *                   noch nicht an der Reihe.
 */
function BracketKarte({ paarung, zustand, akzent }) {
  const aktuell = zustand === "aktuell";
  const entschieden = zustand === "entschieden";
  const unerreichbar = zustand === "unerreichbar";

  const gewinnerA = entschieden && paarung.a && paarung.sieger === paarung.a.id;
  const gewinnerB = entschieden && paarung.b && paarung.sieger === paarung.b.id;

  return (
    <div
      style={{
        borderRadius: 10, overflow: "hidden",
        border: "1px solid " + (aktuell ? akzent : "#2A2A2E"),
        background: aktuell ? mitDeckkraft(akzent, 0.12) : "#1D1D21",
        opacity: unerreichbar ? 0.35 : entschieden ? 0.85 : 1,
      }}
    >
      <BracketTeilnehmer
        eintrag={paarung.a}
        sieger={gewinnerA}
        verloren={entschieden && !gewinnerA}
        trennlinie
        akzent={akzent}
      />
      <BracketTeilnehmer
        eintrag={paarung.b}
        sieger={gewinnerB}
        verloren={entschieden && !gewinnerB}
        akzent={akzent}
      />
    </div>
  );
}

/* Welchen Zustand eine Paarung im Baum hat — siehe BracketKarte. */
function bracketZustand(paarung, runde, paar, ort) {
  if (paarung.sieger) return "entschieden";
  if (ort && ort.runde === runde && ort.paar === paar) return "aktuell";
  if (!paarung.a || !paarung.b) return "unerreichbar";
  return "bereit";
}

/**
 * Der Baum als Ganzes.
 *
 * Ein klassischer Turnierbaum laeuft in die Breite und passt damit auf
 * kein Telefon. Hier stehen die Runden deshalb untereinander — Runde 1
 * oben, darunter die naechste —, je Runde eine Spalte aus
 * Paarungskarten, dazwischen ein Pfeil nach unten.
 */
function TurnierBracket({ baum, ort, akzent }) {
  const sieger = turnierSieger(baum);
  return (
    <div style={{ marginTop: 26 }}>
      <div
        style={{
          fontSize: 11.5, letterSpacing: 1, color: "#55524c",
          fontFamily: "'JetBrains Mono', monospace", marginBottom: 12,
        }}
      >
        BRACKET
      </div>

      {baum.map((runde, r) => (
        <React.Fragment key={r}>
          {r > 0 && (
            <div
              aria-hidden="true"
              style={{ textAlign: "center", color: "#3B3B41", fontSize: 15, padding: "8px 0" }}
            >
              ↓
            </div>
          )}
          <div>
            <div
              style={{
                fontSize: 11, letterSpacing: 1, color: "#77746c",
                fontFamily: "'JetBrains Mono', monospace", marginBottom: 8,
              }}
            >
              {turnierRundenName(runde.length).toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {runde.map((paarung, p) => (
                <BracketKarte
                  key={p}
                  paarung={paarung}
                  zustand={bracketZustand(paarung, r, p, ort)}
                  akzent={akzent}
                />
              ))}
            </div>
          </div>
        </React.Fragment>
      ))}

      <div
        aria-hidden="true"
        style={{ textAlign: "center", color: "#3B3B41", fontSize: 15, padding: "8px 0" }}
      >
        ↓
      </div>

      {/* Der Platz des Siegers steht von Anfang an da und wird
          ausgefuellt, sobald das Finale entschieden ist. */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
          padding: "13px 14px", borderRadius: 10, textAlign: "center",
          border: "1px solid " + (sieger ? akzent : "#2A2A2E"),
          background: sieger ? mitDeckkraft(akzent, 0.12) : "#1D1D21",
          opacity: sieger ? 1 : 0.6,
        }}
      >
        <span style={{ flexShrink: 0, display: "flex", color: sieger ? akzent : "#55524c" }}>
          <IconPokal groesse={18} />
        </span>
        <span
          style={{
            fontFamily: "'Playfair Display', serif", fontWeight: 800,
            fontSize: sieger ? 16 : 13.5, minWidth: 0, overflowWrap: "anywhere",
            color: sieger ? "#EDEAE3" : "#55524c",
          }}
        >
          {sieger ? sieger.title : "Turniersieger wird hier gekrönt"}
        </span>
      </div>
    </div>
  );
}

function Turnier({ ranked, onDuell, onFertig, fehler, onZurueck }) {
  const [kategorie, setKategorie] = useState(null);
  const [baum, setBaum] = useState(null);
  // ID des gewaehlten Titels — solange sie steht, laeuft die Rueckmeldung.
  const [gewaehlt, setGewaehlt] = useState(null);

  const teilnehmer = useMemo(() => duellTeilnehmer(ranked), [ranked]);

  /* Dieselbe Wahl darf nur einmal weiterruecken. Der Verweis
     entscheidet das ohne Umweg ueber den naechsten Aufbau: ein Tippen
     und die ablaufende Pause koennen sonst beide durchkommen. */
  const gewaehltRef = useRef(null);

  /* Die Auswertungen laufen nacheinander. Zwei gleichzeitige
     Speicherungen laesen denselben Stand und schrieben sich
     gegenseitig zu — die Kette haelt sie auseinander, ohne die
     Oberflaeche warten zu lassen. */
  const speicherungRef = useRef(Promise.resolve());

  function abbrechen() {
    /* Ein abgebrochenes Turnier ist keins: es gibt keine Punkte, und
       stehen bleibt nichts. Die bereits ausgespielten Paarungen haben
       ihre Wirkung natuerlich behalten — sie waren richtige Duelle. */
    gewaehltRef.current = null;
    setGewaehlt(null);
    setBaum(null);
  }

  function starte(groesse) {
    const feld = zieheTurnierFeld(teilnehmer[kategorie], groesse);
    if (!feld) return;
    gewaehltRef.current = null;
    setGewaehlt(null);
    setBaum(baueTurnierbaum(feld));
  }

  function waehle(gewinner, verlierer) {
    if (gewaehltRef.current) return;
    gewaehltRef.current = gewinner.id;
    setGewaehlt(gewinner.id);
    speicherungRef.current = speicherungRef.current
      .catch(() => {})
      .then(() => onDuell(kategorie, gewinner.id, verlierer.id));
  }

  /* Die Wahl in den Baum uebernehmen und zur naechsten Paarung. */
  function weiter() {
    const wahl = gewaehltRef.current;
    if (!wahl || !baum) return;
    const ort = offeneTurnierPaarung(baum);
    if (!ort) return;

    gewaehltRef.current = null;
    const neu = mitTurnierEntscheidung(baum, ort, wahl);
    setGewaehlt(null);
    setBaum(neu);

    /* Punkte gibt es fuer das abgeschlossene Turnier, nicht fuer die
       einzelne Paarung — die zaehlt bereits als Duell. */
    if (turnierSieger(neu)) onFertig();
  }

  /* Nach kurzer Pause von selbst weiter. Wer nicht warten mag, tippt.
     Dieselbe Pause wie beim Duell nebenan. */
  useEffect(() => {
    if (!gewaehlt) return undefined;
    const zeit = setTimeout(weiter, DUELL_PAUSE_MS);
    return () => clearTimeout(zeit);
  }, [gewaehlt]);

  // ---- Kategorie waehlen ----
  if (!kategorie) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 50px" }}>
        <button
          onClick={onZurueck}
          style={{ background: "transparent", border: "none", color: "#9A968C", fontSize: 15, cursor: "pointer", padding: "10px 0", marginBottom: 8 }}
        >
          ← Minispiele
        </button>

        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 6px" }}>
          Turnier
        </h2>
        <p style={{ color: "#9A968C", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 18px" }}>
          In welcher Kategorie soll gespielt werden? Ein Turnier läuft
          immer innerhalb einer Kategorie.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {CATEGORIES.map((c) => {
            const anzahl = teilnehmer[c.key].length;
            const moeglich = anzahl >= TURNIER_MIN_TEILNEHMER;
            return (
              <button
                key={c.key}
                onClick={() => moeglich && setKategorie(c.key)}
                disabled={!moeglich}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "14px", borderRadius: 10, textAlign: "left",
                  background: "#1D1D21",
                  border: "1px solid " + (moeglich ? accentFor(c.key) : "#2A2A2E"),
                  color: moeglich ? "#EDEAE3" : "#55524c",
                  cursor: moeglich ? "pointer" : "default",
                  fontFamily: "inherit", fontSize: 15, fontWeight: 700,
                }}
              >
                <span>{c.label}</span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, fontWeight: 400,
                    color: moeglich ? "#9A968C" : "#55524c", textAlign: "right", flexShrink: 0,
                  }}
                >
                  {moeglich
                    ? anzahl + " bewertet"
                    : "mind. " + TURNIER_MIN_TEILNEHMER + " Bewertungen"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const catInfo = CATEGORIES.find((c) => c.key === kategorie);
  const akzent = accentFor(kategorie);
  const anzahl = teilnehmer[kategorie].length;

  // ---- Groesse waehlen ----
  if (!baum) {
    return (
      <div style={{ "--accent": akzent, maxWidth: 720, margin: "0 auto", padding: "20px 20px 50px" }}>
        <button
          onClick={() => setKategorie(null)}
          style={{ background: "transparent", border: "none", color: "#9A968C", fontSize: 15, cursor: "pointer", padding: "10px 0", marginBottom: 8 }}
        >
          ← Kategorie wechseln
        </button>

        <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 16 }}>
          TURNIER · {catInfo.label.toUpperCase()}
        </div>

        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 6px" }}>
          Wie viele Teilnehmer?
        </h2>
        <p style={{ color: "#9A968C", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 18px" }}>
          Gelost wird zufällig aus den {anzahl} bewerteten Titeln dieser
          Kategorie — gesetzt wird nichts, Platz 1 kann schon in der
          ersten Runde auf Platz 2 treffen.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {TURNIER_GROESSEN.map((g) => {
            const moeglich = anzahl >= g;
            const runden = Math.round(Math.log2(g));
            return (
              <button
                key={g}
                onClick={() => moeglich && starte(g)}
                disabled={!moeglich}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "14px", borderRadius: 10, textAlign: "left",
                  background: "#1D1D21",
                  border: "1px solid " + (moeglich ? akzent : "#2A2A2E"),
                  color: moeglich ? "#EDEAE3" : "#55524c",
                  cursor: moeglich ? "pointer" : "default",
                  fontFamily: "inherit", fontSize: 15, fontWeight: 700,
                }}
              >
                <span>{g} Teilnehmer</span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, fontWeight: 400,
                    color: moeglich ? "#9A968C" : "#55524c", textAlign: "right", flexShrink: 0,
                  }}
                >
                  {moeglich
                    ? runden + " Runden · " + (g - 1) + " Duelle"
                    : "mind. " + g + " Bewertungen"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Turnier ----
  const ort = offeneTurnierPaarung(baum);
  const sieger = turnierSieger(baum);
  const paarung = ort ? baum[ort.runde][ort.paar] : null;

  return (
    <div style={{ "--accent": akzent, maxWidth: 720, margin: "0 auto", padding: "20px 20px 50px" }}>
      {/* Abbrechen ist jederzeit moeglich — und kostet das Turnier. */}
      <button
        onClick={sieger ? onZurueck : abbrechen}
        style={{ background: "transparent", border: "none", color: "#9A968C", fontSize: 15, cursor: "pointer", padding: "10px 0", marginBottom: 8 }}
      >
        {sieger ? "← Minispiele" : "← Turnier abbrechen"}
      </button>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace" }}>
          TURNIER · {catInfo.label.toUpperCase()}
        </div>
        <div style={{ fontSize: 11.5, color: "#77746c", fontFamily: "'JetBrains Mono', monospace" }}>
          {ort
            ? turnierRundenName(baum[ort.runde].length) +
              " · Duell " + (ort.paar + 1) + " von " + baum[ort.runde].length
            : "Turnier entschieden"}
        </div>
      </div>

      {fehler && (
        <div style={{ background: "#2a1616", border: "1px solid #d9736a", color: "#d9736a", borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
          {fehler}
        </div>
      )}

      {paarung ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {["a", "b"].map((seite, i) => {
              const eintrag = paarung[seite];
              const gegner = paarung[seite === "a" ? "b" : "a"];
              const zustand = !gewaehlt
                ? "offen"
                : gewaehlt === eintrag.id
                  ? "gewaehlt"
                  : "unterlegen";
              return (
                <React.Fragment key={eintrag.id}>
                  {i === 1 && (
                    <div
                      aria-hidden="true"
                      style={{
                        flex: "0 0 auto", width: 26, textAlign: "center",
                        fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 16,
                        color: "#55524c", letterSpacing: 0.5,
                      }}
                    >
                      VS
                    </div>
                  )}
                  <DuellKarte
                    eintrag={eintrag}
                    zustand={zustand}
                    onClick={() => (gewaehlt ? weiter() : waehle(eintrag, gegner))}
                  />
                </React.Fragment>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: "#77746c", textAlign: "center", margin: "14px 0 6px", lineHeight: 1.5 }}>
            {gewaehlt
              ? "Tippen für die nächste Paarung."
              : "Welcher Titel gefällt dir besser?"}
          </div>
          <div style={{ fontSize: 11.5, color: "#55524c", textAlign: "center", lineHeight: 1.5 }}>
            Im Turnier gibt es kein Überspringen.
          </div>
        </>
      ) : (
        <>
          {/* ---- Sieger ---- */}
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              borderRadius: 12, padding: "24px 16px",
              border: "1px solid " + akzent, background: mitDeckkraft(akzent, 0.12),
            }}
          >
            <span style={{ display: "flex", color: akzent }}>
              <IconPokal groesse={38} />
            </span>
            <div style={{ fontSize: 12, letterSpacing: 1, color: akzent, fontFamily: "'JetBrains Mono', monospace" }}>
              TURNIERSIEGER
            </div>
            <Poster url={sieger.poster} title={sieger.title} size={120} />
            <div
              style={{
                fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 22,
                lineHeight: 1.25, textAlign: "center", overflowWrap: "anywhere",
              }}
            >
              {sieger.title}
            </div>
          </div>

          <button
            onClick={abbrechen}
            style={{
              width: "100%", padding: "15px", borderRadius: 8, marginTop: 14,
              background: akzent, color: "#17171A", border: "none",
              fontWeight: 700, fontSize: 15.5, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Neues Turnier
          </button>
        </>
      )}

      <TurnierBracket baum={baum} ort={ort} akzent={akzent} />
    </div>
  );
}

/* ============================================================
   MINISPIEL "HIGHER OR LOWER"

   Oben ein Titel mit sichtbarer Endnote, darunter einer mit
   verdeckter: hoeher oder niedriger? Wer richtig liegt, ruecht den
   unteren Titel nach oben und bekommt einen neuen darunter — solange,
   bis ein Tipp danebengeht.

   Das Spiel liest nur; es schreibt an keiner Bewertung. Festgehalten
   wird allein der Bestwert je Spielart.
   ============================================================ */

/* Schluessel des Spiels in der Bestwert-Tabelle. */
const HOL_SPIEL = "higher-or-lower";

/* Gemischt ueber alle Kategorien oder eine einzelne. Jede Spielart
   fuehrt ihren eigenen Bestwert. */
const HOL_MODI = [
  { key: "mixed", label: "Gemischt" },
  ...CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
];

/* Unter zwei bewerteten Titeln gibt es nichts zu vergleichen. */
const HOL_MIN_TITEL = 2;

/* Wie lange die aufgedeckte Note stehen bleibt, bevor die naechste
   Runde kommt — dieselbe Pause wie beim Duell nebenan. Ein Tippen
   springt jederzeit sofort weiter. */
const HOL_PAUSE_MS = 1300;

/* Gruen der Rueckmeldung. Kein neuer Farbton: es ist genau das Gruen,
   das die Notenskala bei 7.5 traegt (siehe SCORE_COLOR_STOPS). */
const TREFFER_GRUEN = "rgb(22, 163, 74)";

/** Einen zufaelligen Titel ziehen, aber nicht den ausgeschlossenen. */
function zieheAnderen(liste, ausser, zufall = Math.random) {
  if (!Array.isArray(liste)) return null;
  const moeglich = ausser ? liste.filter((f) => f.id !== ausser.id) : liste;
  if (!moeglich.length) return null;
  return moeglich[Math.floor(zufall() * moeglich.length)];
}

/**
 * War der Tipp richtig?
 *
 * Gleichstand geht immer als richtig durch — bei exakt gleicher Note
 * gibt es keine Richtung, die falscher waere als die andere.
 */
function tippStimmt(richtung, noteOben, noteUnten) {
  if (noteUnten === noteOben) return true;
  return richtung === "hoeher" ? noteUnten > noteOben : noteUnten < noteOben;
}

/* Die verdeckte Note. Masse und Schrift wie beim Notenschild daneben,
   damit beim Aufdecken nichts springt. */
function VerdeckteNote() {
  return (
    <span
      title="Note verdeckt — genau darum geht es"
      style={{
        background: "#2A2A2E", color: "#77746c", borderRadius: 4, padding: "6px 14px",
        fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700,
        minWidth: 72, textAlign: "center", display: "inline-block", flexShrink: 0,
      }}
    >
      ?
    </span>
  );
}

/* Eine der beiden Zeilen des Spiels: Poster, Titel, Jahr — und rechts
   die Note, entweder sichtbar oder verdeckt. */
function HoLKarte({ eintrag, verdeckt, rahmen }) {
  const jahr = typeof eintrag.releaseYear === "number" ? eintrag.releaseYear : null;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "#1D1D21", border: "1px solid " + (rahmen || "#2A2A2E"),
        borderRadius: 12, padding: 12,
        transition: "border-color 200ms ease",
      }}
    >
      <Poster url={eintrag.poster} title={eintrag.title} size={52} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 15, lineHeight: 1.3, overflowWrap: "anywhere" }}>{eintrag.title}</div>
        {jahr !== null && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "#77746c", marginTop: 3 }}>
            {jahr}
          </div>
        )}
      </div>
      {verdeckt ? <VerdeckteNote /> : <ScoreBadge score={eintrag.score} size="lg" />}
    </div>
  );
}

function HigherOrLower({ ranked, onZurueck, onXP }) {
  const [modus, setModus] = useState(null);
  const [bestwerte, setBestwerte] = useState({});
  const [fehler, setFehler] = useState("");

  const [oben, setOben] = useState(null);
  const [unten, setUnten] = useState(null);
  const [streak, setStreak] = useState(0);
  // raten | richtig | ende
  const [phase, setPhase] = useState("raten");
  const [neuerRekord, setNeuerRekord] = useState(false);

  /* Bestwerte einmal beim Oeffnen des Spiels holen. Sie sind Beiwerk:
     ohne sie laesst sich weiterspielen, es fehlt nur der Vergleich. */
  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        const werte = await api.loadHighscores(HOL_SPIEL);
        if (!abgebrochen) setBestwerte(werte);
      } catch (e) {
        if (!abgebrochen) setFehler("Bestwerte konnten nicht geladen werden.");
      }
    })();
    return () => { abgebrochen = true; };
  }, []);

  /* Antreten kann nur, wer eine Endnote hat — vorgemerkte Eintraege
     stehen in keiner Rangliste und haben keine. "Gemischt" wirft alle
     Kategorien zusammen; die Notenskala ist ueberall dieselbe. */
  const titelJeModus = useMemo(() => {
    const bewertet = (k) => (ranked[k] || []).filter((f) => typeof f.score === "number");
    const result = {};
    for (const c of CATEGORIES) result[c.key] = bewertet(c.key);
    result.mixed = CATEGORY_KEYS.flatMap((k) => result[k]);
    return result;
  }, [ranked]);

  const liste = modus ? titelJeModus[modus] : [];
  const listeRef = useRef(liste);
  listeRef.current = liste;

  /* Der Verweis sperrt die Phase sofort, noch bevor React neu
     zeichnet: sonst koennte die Zeitschaltung eine Runde
     weiterspringen, die das Tippen gerade schon weitergeschaltet hat. */
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  function starte(fuerModus) {
    const pool = titelJeModus[fuerModus] || [];
    const ersterOben = zieheAnderen(pool, null);
    setOben(ersterOben);
    setUnten(zieheAnderen(pool, ersterOben));
    setStreak(0);
    setNeuerRekord(false);
    phaseRef.current = "raten";
    setPhase("raten");
  }

  /* Ergebnis eines Durchgangs melden. Gespeichert wird davon nur, was
     den bisherigen Bestwert uebertrifft — das entscheidet der Server. */
  async function bestwertMelden(erreicht) {
    const bisher = bestwerte[modus] || 0;
    if (erreicht <= bisher) {
      setNeuerRekord(false);
      return;
    }
    setNeuerRekord(true);
    // Sofort anzeigen; der Server bestaetigt gleich darauf.
    setBestwerte((prev) => ({ ...prev, [modus]: erreicht }));
    try {
      const gespeichert = await api.reportHighscore(HOL_SPIEL, modus, erreicht);
      setBestwerte((prev) => ({ ...prev, [modus]: gespeichert.score }));
      setFehler("");
      // Punkte fuer den neuen persoenlichen Bestwert.
      if (onXP) onXP();
    } catch (e) {
      setFehler("Bestwert nicht gespeichert: " + e.message);
    }
  }

  function rate(richtung) {
    if (phaseRef.current !== "raten" || !oben || !unten) return;
    if (tippStimmt(richtung, oben.score, unten.score)) {
      phaseRef.current = "richtig";
      setStreak((s) => s + 1);
      setPhase("richtig");
    } else {
      phaseRef.current = "ende";
      setPhase("ende");
      // Die erreichte Straehne ist der Stand vor diesem Tipp.
      bestwertMelden(streak);
    }
  }

  /* Naechste Runde: der aufgedeckte untere Titel rueckt nach oben, ein
     neuer kommt darunter. */
  function weiter() {
    if (phaseRef.current !== "richtig") return;
    phaseRef.current = "raten";
    const neuesOben = unten;
    setOben(neuesOben);
    setUnten(zieheAnderen(listeRef.current, neuesOben));
    setPhase("raten");
  }

  /* Nach kurzer Pause von selbst weiter. Wer nicht warten mag, tippt. */
  useEffect(() => {
    if (phase !== "richtig") return undefined;
    const zeit = setTimeout(weiter, HOL_PAUSE_MS);
    return () => clearTimeout(zeit);
  }, [phase]);

  // ---- Spielart waehlen ----
  if (!modus) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 50px" }}>
        <button
          onClick={onZurueck}
          style={{ background: "transparent", border: "none", color: "#9A968C", fontSize: 15, cursor: "pointer", padding: "10px 0", marginBottom: 8 }}
        >
          ← Minispiele
        </button>

        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 6px" }}>
          Higher or Lower
        </h2>
        <p style={{ color: "#9A968C", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 18px" }}>
          Womit soll gespielt werden? „Gemischt" wirft alle Kategorien
          zusammen — die Notenskala ist überall dieselbe. Jede Spielart führt
          ihren eigenen Bestwert.
        </p>

        {fehler && (
          <div style={{ background: "#2a1616", border: "1px solid #d9736a", color: "#d9736a", borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
            {fehler}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {HOL_MODI.map((m) => {
            const anzahl = (titelJeModus[m.key] || []).length;
            const moeglich = anzahl >= HOL_MIN_TITEL;
            const best = bestwerte[m.key] || 0;
            return (
              <button
                key={m.key}
                onClick={() => { if (moeglich) { setModus(m.key); starte(m.key); } }}
                disabled={!moeglich}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "14px", borderRadius: 10, textAlign: "left",
                  background: "#1D1D21",
                  border: "1px solid " + (moeglich ? accentFor(m.key) : "#2A2A2E"),
                  color: moeglich ? "#EDEAE3" : "#55524c",
                  cursor: moeglich ? "pointer" : "default",
                  fontFamily: "inherit", fontSize: 15, fontWeight: 700,
                }}
              >
                <span>{m.label}</span>
                {/* Anzahl und Bestwert stehen bewusst untereinander: als
                    eine Zeile braechen sie auf schmalen Displays an
                    unguenstiger Stelle um. */}
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, fontWeight: 400,
                    color: moeglich ? "#9A968C" : "#55524c", textAlign: "right", flexShrink: 0,
                  }}
                >
                  {moeglich ? (
                    <>
                      <span style={{ display: "block", whiteSpace: "nowrap" }}>{anzahl} bewertet</span>
                      <span style={{ display: "block", whiteSpace: "nowrap", color: "#77746c", marginTop: 2 }}>
                        Bestwert {best}
                      </span>
                    </>
                  ) : (
                    "mind. " + HOL_MIN_TITEL + " Bewertungen"
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Spiel ----
  const modusInfo = HOL_MODI.find((m) => m.key === modus);
  const best = bestwerte[modus] || 0;
  const aufgedeckt = phase !== "raten";
  const rahmenUnten = phase === "richtig" ? TREFFER_GRUEN : phase === "ende" ? "#d9736a" : undefined;

  return (
    <div
      style={{
        // Bei "Gemischt" gibt es keine Kategoriefarbe; accentFor faellt
        // dort auf den Grundton der App zurueck.
        "--accent": accentFor(modus),
        maxWidth: 720, margin: "0 auto", padding: "20px 20px 50px",
      }}
    >
      <button
        onClick={() => setModus(null)}
        style={{ background: "transparent", border: "none", color: "#9A968C", fontSize: 15, cursor: "pointer", padding: "10px 0", marginBottom: 8 }}
      >
        ← Spielart wechseln
      </button>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace" }}>
          HIGHER OR LOWER · {modusInfo.label.toUpperCase()}
        </div>
        <div style={{ fontSize: 11.5, color: "#77746c", fontFamily: "'JetBrains Mono', monospace" }}>
          Strähne {streak} · Bestwert {best}
        </div>
      </div>

      {fehler && (
        <div style={{ background: "#2a1616", border: "1px solid #d9736a", color: "#d9736a", borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
          {fehler}
        </div>
      )}

      {!oben || !unten ? (
        <div style={{ color: "#77746c", textAlign: "center", padding: 50, fontSize: 14.5 }}>
          In dieser Spielart gibt es gerade nichts zu raten.
        </div>
      ) : (
        <>
          <HoLKarte eintrag={oben} verdeckt={false} />

          <div style={{ fontSize: 11.5, color: "#55524c", textAlign: "center", margin: "10px 0", fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>
            HÖHER ODER NIEDRIGER?
          </div>

          <HoLKarte eintrag={unten} verdeckt={!aufgedeckt} rahmen={rahmenUnten} />

          {phase === "raten" && (
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              {[
                { key: "hoeher", label: "↑ Höher" },
                { key: "niedriger", label: "↓ Niedriger" },
              ].map((k) => (
                <button
                  key={k.key}
                  onClick={() => rate(k.key)}
                  style={{
                    flex: "1 1 0", minWidth: 0, padding: "15px", borderRadius: 8,
                    background: "var(--accent, #C9A227)", color: "#17171A",
                    border: "none", fontWeight: 700, fontSize: 15.5,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {k.label}
                </button>
              ))}
            </div>
          )}

          {phase === "richtig" && (
            <>
              <div style={{ color: TREFFER_GRUEN, fontSize: 14, fontWeight: 700, textAlign: "center", marginTop: 16 }}>
                {unten.score === oben.score ? "Gleichstand — zählt als richtig!" : "Richtig!"}
              </div>
              <button
                onClick={weiter}
                style={{
                  width: "100%", padding: "13px", borderRadius: 8, fontSize: 14, marginTop: 12,
                  background: "transparent", color: "#9A968C", border: "1px solid #33333a",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Weiter
              </button>
            </>
          )}

          {phase === "ende" && (
            <div
              style={{
                marginTop: 18, background: "#141416", borderRadius: 12, padding: 18,
                border: "1px solid " + (neuerRekord ? "var(--accent, #C9A227)" : "#2A2A2E"),
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 12, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>
                DANEBEN — STRÄHNE VORBEI
              </div>

              <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 40, lineHeight: 1, marginBottom: 6 }}>
                {streak}
              </div>
              <div style={{ fontSize: 13, color: "#9A968C" }}>
                {streak === 1 ? "richtiger Tipp" : "richtige Tipps"}
              </div>

              {neuerRekord && (
                <div style={{ marginTop: 14 }}>
                  <span
                    style={{
                      fontSize: 10.5, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace",
                      background: "var(--accent, #C9A227)", color: "#17171A",
                      borderRadius: 4, padding: "4px 10px", fontWeight: 700,
                    }}
                  >
                    NEUER BESTWERT
                  </span>
                </div>
              )}

              <div style={{ fontSize: 12.5, color: "#77746c", fontFamily: "'JetBrains Mono', monospace", marginTop: 14 }}>
                Bestwert {modusInfo.label}: {best}
              </div>

              <button
                onClick={() => starte(modus)}
                style={{
                  width: "100%", padding: "15px", borderRadius: 8, marginTop: 18,
                  background: "var(--accent, #C9A227)", color: "#17171A",
                  border: "none", fontWeight: 700, fontSize: 15.5,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Nochmal
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================
   MINISPIEL "WAS SCHAU ICH?" — Zufallsrad durch die Watchlist

   Fuer Abende, an denen die Wahl schwerer faellt als das Schauen: das
   Fenster blaettert schnell durch die Watchlist einer Kategorie, wird
   langsamer und bleibt bei einem zufaelligen Titel stehen.

   Das Spiel liest nur. Gespeichert wird nichts — kein Bestwert, keine
   Statistik; es ist fuer den Moment gedacht. Der einzige Weg hinaus
   fuehrt ueber "Bewerten" in dasselbe Formular, das auch "Ansehen" in
   der Watchlist oeffnet.
   ============================================================ */

/* Der Ablauf des Rads: wie viele Titelwechsel es gibt und wie lange
   der erste und der letzte stehen bleiben. Dazwischen waechst die
   Pause gleichmaessig — das ergibt das Auslaufen einer Walze. */
const DREH_SCHRITTE = 20;
const DREH_START_MS = 45;
const DREH_ENDE_MS = 340;

/* Wer schnelle Wechsel abbestellt hat, bekommt keine: dann gibt es
   genau ein Bild, das nach kurzer Bedenkzeit das Ergebnis ist. */
const DREH_RUHE_MS = 420;

/**
 * Die Standzeiten der einzelnen Bilder, geometrisch wachsend von `von`
 * bis `bis`. Der letzte Wert ist die Pause, bevor das Ergebnis steht.
 */
function drehPausen(schritte = DREH_SCHRITTE, von = DREH_START_MS, bis = DREH_ENDE_MS) {
  if (schritte <= 1) return [bis];
  const faktor = Math.pow(bis / von, 1 / (schritte - 1));
  return Array.from({ length: schritte }, (_, i) => Math.round(von * Math.pow(faktor, i)));
}

/** Kopie der Liste in zufaelliger Reihenfolge (Fisher-Yates). */
function mische(liste, zufall = Math.random) {
  const kopie = [...liste];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

/**
 * Der ganze Durchlauf eines Drehs: die Bilder in ihrer Reihenfolge und
 * der Titel, bei dem es stehen bleibt.
 *
 * Gezogen wird zuerst der Gewinner, danach wird rueckwaerts gerechnet,
 * wo die Walze anfangen muss, damit sie genau bei ihm ankommt. Dadurch
 * laeuft das Fenster durchgehend in eine Richtung durch die Liste —
 * eine Walze eben — statt bei jedem Bild neu zu wuerfeln, was als
 * Stottern zu sehen waere (derselbe Titel zweimal hintereinander).
 *
 * Weil die Liste vorher gemischt und der Gewinner gleichverteilt aus
 * ihr gezogen wird, ist jeder Titel der Watchlist gleich wahrscheinlich.
 */
function drehSequenz(liste, schritte, zufall = Math.random) {
  if (!Array.isArray(liste) || !liste.length || schritte < 1) return null;
  const reihe = mische(liste, zufall);
  const laenge = reihe.length;
  const gewinnerIndex = Math.floor(zufall() * laenge);
  const start = (((gewinnerIndex - (schritte - 1)) % laenge) + laenge) % laenge;
  const bilder = [];
  for (let i = 0; i < schritte; i++) bilder.push(reihe[(start + i) % laenge]);
  return { bilder, gewinner: reihe[gewinnerIndex] };
}

/* Wie die Watchlist einer Kategorie in Worten heisst — bei Spielen
   liegt der Titel im Backlog, nicht auf der Watchlist. */
function vorgemerktText(category, anzahl) {
  return anzahl + (category === "game" ? " im Backlog" : " vorgemerkt");
}

/* Das Fenster des Rads. Poster, Titel und Jahr stehen bei jedem Bild an
   derselben Stelle: die Hoehe ist fest, sonst huepfte der Kasten bei
   jedem Titelwechsel. */
function RadFenster({ eintrag, hervorgehoben }) {
  const jahr = eintrag && typeof eintrag.releaseYear === "number" ? eintrag.releaseYear : null;
  return (
    <div
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        background: "#1D1D21",
        border: "1px solid " + (hervorgehoben ? "var(--accent, #C9A227)" : "#2A2A2E"),
        borderRadius: 12, padding: "20px 16px",
        transition: "border-color 200ms ease",
      }}
    >
      {eintrag ? (
        <Poster url={eintrag.poster} title={eintrag.title} size={124} />
      ) : (
        <div
          aria-hidden="true"
          style={{
            width: 124, height: 176, borderRadius: 5, border: "1px dashed #33333a",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#3d3a35", fontFamily: "'Playfair Display', serif", fontSize: 34, fontWeight: 800,
          }}
        >
          ?
        </div>
      )}

      {/* Platz fuer zwei Zeilen in der groessten vorkommenden Schrift —
          damit der Kasten beim Anhalten nicht die Hoehe wechselt. */}
      <div style={{ minHeight: 58, display: "flex", alignItems: "center", width: "100%" }}>
        <div
          style={{
            width: "100%", textAlign: "center", overflowWrap: "anywhere", lineHeight: 1.25,
            fontFamily: hervorgehoben ? "'Playfair Display', serif" : "inherit",
            fontWeight: hervorgehoben ? 800 : 400,
            fontSize: hervorgehoben ? 22 : 16,
            color: eintrag ? "#EDEAE3" : "#55524c",
          }}
        >
          {eintrag ? eintrag.title : "Bereit zum Drehen"}
        </div>
      </div>

      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#77746c", minHeight: 16 }}>
        {jahr !== null ? jahr : ""}
      </div>
    </div>
  );
}

function WasSchauIch({ watchlist, onBewerten, onZurueck }) {
  const [kategorie, setKategorie] = useState(null);
  // bereit | dreht | ergebnis
  const [phase, setPhase] = useState("bereit");
  const [lauf, setLauf] = useState(null);
  const [schritt, setSchritt] = useState(0);

  /* Schnelle Bildwechsel sind genau das, was diese Einstellung
     abbestellt — dann steht das Ergebnis nach einer kurzen Bedenkzeit
     ohne Flackern da. */
  const reduzierteBewegung = usePrefersReducedMotion();
  const pausen = useMemo(
    () => (reduzierteBewegung ? [DREH_RUHE_MS] : drehPausen()),
    [reduzierteBewegung]
  );

  const liste = kategorie ? watchlist[kategorie] || [] : [];

  function drehen() {
    const sequenz = drehSequenz(liste, pausen.length);
    if (!sequenz) return;
    setLauf(sequenz);
    setSchritt(0);
    setPhase("dreht");
  }

  /* Ein Bild nach dem anderen, mit wachsender Standzeit. Beim letzten
     steht das Ergebnis. Das Aufraeumen beendet den Lauf sauber, wenn
     der Bereich waehrend des Drehens verlassen wird. */
  useEffect(() => {
    if (phase !== "dreht" || !lauf) return undefined;
    const letztes = schritt >= lauf.bilder.length - 1;
    const pause = pausen[Math.min(schritt, pausen.length - 1)];
    const zeit = setTimeout(
      () => (letztes ? setPhase("ergebnis") : setSchritt((s) => s + 1)),
      pause
    );
    return () => clearTimeout(zeit);
  }, [phase, schritt, lauf, pausen]);

  // ---- Kategorie waehlen ----
  if (!kategorie) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 50px" }}>
        <button
          onClick={onZurueck}
          style={{ background: "transparent", border: "none", color: "#9A968C", fontSize: 15, cursor: "pointer", padding: "10px 0", marginBottom: 8 }}
        >
          ← Minispiele
        </button>

        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 6px" }}>
          Was schau ich?
        </h2>
        <p style={{ color: "#9A968C", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 18px" }}>
          Aus welcher Watchlist soll gezogen werden? Gedreht wird immer
          innerhalb einer Kategorie.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {CATEGORIES.map((c) => {
            const anzahl = (watchlist[c.key] || []).length;
            const moeglich = anzahl > 0;
            return (
              <button
                key={c.key}
                onClick={() => { if (moeglich) { setKategorie(c.key); setPhase("bereit"); setLauf(null); } }}
                disabled={!moeglich}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "14px", borderRadius: 10, textAlign: "left",
                  background: "#1D1D21",
                  border: "1px solid " + (moeglich ? accentFor(c.key) : "#2A2A2E"),
                  color: moeglich ? "#EDEAE3" : "#55524c",
                  cursor: moeglich ? "pointer" : "default",
                  fontFamily: "inherit", fontSize: 15, fontWeight: 700,
                }}
              >
                <span>{c.label}</span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, fontWeight: 400,
                    color: moeglich ? "#9A968C" : "#55524c", textAlign: "right", flexShrink: 0,
                  }}
                >
                  {moeglich
                    ? vorgemerktText(c.key, anzahl)
                    : c.key === "game" ? "nichts im Backlog" : "nichts vorgemerkt"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Drehen ----
  const catInfo = CATEGORIES.find((c) => c.key === kategorie);
  const dreht = phase === "dreht";
  const fertig = phase === "ergebnis";
  const gezeigt = fertig ? lauf.gewinner : dreht ? lauf.bilder[schritt] : null;

  return (
    <div
      style={{
        "--accent": accentFor(kategorie),
        maxWidth: 720, margin: "0 auto", padding: "20px 20px 50px",
      }}
    >
      <button
        onClick={() => { setKategorie(null); setPhase("bereit"); setLauf(null); }}
        style={{ background: "transparent", border: "none", color: "#9A968C", fontSize: 15, cursor: "pointer", padding: "10px 0", marginBottom: 8 }}
      >
        ← Kategorie wechseln
      </button>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace" }}>
          WAS SCHAU ICH? · {catInfo.label.toUpperCase()}
        </div>
        <div style={{ fontSize: 11.5, color: "#77746c", fontFamily: "'JetBrains Mono', monospace" }}>
          {vorgemerktText(kategorie, liste.length)}
        </div>
      </div>

      {/* Die Zeile ueber dem Fenster hat immer dieselbe Hoehe, damit der
          Kasten beim Anhalten nicht nach unten rutscht. */}
      <div
        style={{
          minHeight: 20, marginBottom: 10, textAlign: "center",
          fontSize: 12, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace",
          color: fertig ? "var(--accent, #C9A227)" : "#55524c",
        }}
      >
        {fertig ? "HEUTE SCHAUST DU" : dreht ? "…" : ""}
      </div>

      <RadFenster eintrag={gezeigt} hervorgehoben={fertig} />

      {fertig ? (
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          {/* Beide Knoepfe bleiben einzeilig; wird es zu eng, rutscht
              der zweite auf eine eigene Zeile statt umzubrechen. */}
          <button
            onClick={drehen}
            style={{
              flex: "1 1 auto", padding: "15px", borderRadius: 8, whiteSpace: "nowrap",
              background: "transparent", color: "var(--accent, #C9A227)",
              border: "1px solid var(--accent, #C9A227)", fontWeight: 700, fontSize: 15,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Nochmal drehen
          </button>
          <button
            onClick={() => onBewerten(kategorie, lauf.gewinner)}
            style={{
              flex: "1 1 auto", padding: "15px", borderRadius: 8, whiteSpace: "nowrap",
              background: "var(--accent, #C9A227)", color: "#17171A",
              border: "none", fontWeight: 700, fontSize: 15.5,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Bewerten
          </button>
        </div>
      ) : (
        <button
          onClick={drehen}
          disabled={dreht}
          style={{
            width: "100%", padding: "16px", borderRadius: 8, marginTop: 18,
            background: dreht ? "#2A2A2E" : "var(--accent, #C9A227)",
            color: dreht ? "#77746c" : "#17171A",
            border: "none", fontWeight: 700, fontSize: 15.5,
            cursor: dreht ? "default" : "pointer", fontFamily: "inherit",
          }}
        >
          {dreht ? "Dreht…" : "Drehen"}
        </button>
      )}
    </div>
  );
}

/* ============================================================
   AKTIVITAETS-RANG DES NUTZERS

   Rein kosmetisch und rein persoenlich: der Rang haengt daran, was
   man in der App tut, nicht an den Noten der Titel. Mit den Medaillen
   der ersten drei Plaetze (siehe rangSchmuck) hat er nichts zu tun —
   die zeichnen eine Rangliste aus, dieser hier den Nutzer.

   Gespeichert wird allein die Gesamtzahl der Punkte (siehe /api/xp);
   die Stufe wird daraus abgeleitet und nirgends festgehalten.
   ============================================================ */
const RAENGE = [
  { key: "kupfer", name: "Kupfer", farbe: "#C97D4A", ab: 0 },
  { key: "bronze", name: "Bronze", farbe: "#A9662F", ab: 200 },
  { key: "silber", name: "Silber", farbe: "#A8A8B0", ab: 500 },
  { key: "gold", name: "Gold", farbe: "#D4AF37", ab: 900 },
  { key: "platin", name: "Platin", farbe: "#7FA8B3", ab: 1800 },
  { key: "smaragd", name: "Smaragd", farbe: "#2E9B6F", ab: 3200 },
  { key: "diamant", name: "Diamant", farbe: "#9B7FD4", ab: 5000 },
  { key: "champion", name: "Champion", farbe: "#D6453F", ab: 7500 },
];

/**
 * Stufe zu einer Punktzahl.
 *
 * Zurueck kommt die erreichte Stufe, ihr Platz in der Leiter, die
 * naechste Stufe (null beim Champion) und wie weit der Weg dorthin
 * zurueckgelegt ist — als Anteil zwischen 0 und 1.
 */
function rangFuer(xp) {
  const punkte = typeof xp === "number" && xp > 0 ? Math.floor(xp) : 0;
  let index = 0;
  for (let i = 0; i < RAENGE.length; i++) if (punkte >= RAENGE[i].ab) index = i;

  const rang = RAENGE[index];
  const naechster = RAENGE[index + 1] || null;
  const spanne = naechster ? naechster.ab - rang.ab : 0;
  const fortschritt =
    naechster && spanne > 0 ? Math.min(1, Math.max(0, (punkte - rang.ab) / spanne)) : 1;

  return { xp: punkte, index, rang, naechster, fortschritt };
}

/** Punktzahlen mit Tausenderpunkt — "1.240". */
function xpText(n) {
  return Math.round(n).toLocaleString("de-DE");
}

/**
 * Ist in jeder vorhandenen Kategorie mindestens ein Titel bewertet?
 *
 * Welche Kategorien es gibt, steht in CATEGORIES — kommt spaeter eine
 * dazu, zaehlt sie hier von selbst mit, ohne dass hier etwas zu
 * aendern waere.
 */
function alleKategorienBewertet(items) {
  return CATEGORY_KEYS.every((k) => (items[k] || []).some((f) => !istVorgemerkt(f)));
}

/* Schild — Zeichen der Stufe Bronze und Rueckfall fuer jede Stufe
   ohne eigenes Zeichen. Wie die uebrigen Symbole der App eine reine
   Strichzeichnung, die ihre Farbe vom Umfeld erbt. */
function IconSchild({ groesse = 18 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ ...symbolBasis, width: groesse, height: groesse }}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3.2l7 2.5v5.2c0 4.3-2.9 8.1-7 9.2-4.1-1.1-7-4.9-7-9.2V5.7l7-2.5Z" />
    </svg>
  );
}

/* Haekchen fuer erreichte Stufen. */
function IconHaken({ groesse = 18 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ ...symbolBasis, width: groesse, height: groesse }}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4.5 12.5l4.7 4.7L19.5 6.9" />
    </svg>
  );
}

/* Schloss fuer noch gesperrte Stufen. */
function IconSchloss({ groesse = 18 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ ...symbolBasis, width: groesse, height: groesse }}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4.8" y="10.5" width="14.4" height="9.7" rx="2" />
      <path d="M8.2 10.5V7.6a3.8 3.8 0 0 1 7.6 0v2.9" />
    </svg>
  );
}

/* ------------------------------------------------------------
   Ein eigenes Zeichen je Stufe.

   Bis hierher trugen alle acht Stufen dasselbe Schild und
   unterschieden sich allein in der Farbe — auf dem Chip unter dem
   Titel war die Stufe damit nur am Namen zu erkennen. Jede Stufe
   bekommt jetzt ihr eigenes Symbol, das mit ihr aufsteigt:
   Muenze, Schild, Stern, Barren, Krone, Edelstein, Raute, Pokal.
   Den Pokal gibt es schon (IconPokal, Turniersieger) — er wird hier
   benutzt, nicht ein zweites Mal gezeichnet.

   Es bleiben reine Strichzeichnungen wie die uebrigen Symbole der
   App (symbolBasis): kein Fuellen, Farbe kommt vom Umfeld. Damit
   traegt jedes Zeichen weiterhin die Rangfarbe, ohne dass hier eine
   Farbe steht.
   ------------------------------------------------------------ */

/* Huelle fuer die Rang-Zeichen — spart acht Mal dasselbe Geruest. */
function RangSymbol({ groesse = 18, children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ ...symbolBasis, width: groesse, height: groesse }}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* Kupfer — Muenze. */
function IconMuenze({ groesse = 18 }) {
  return (
    <RangSymbol groesse={groesse}>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="3.4" />
    </RangSymbol>
  );
}

/* Silber — Stern. */
function IconStern({ groesse = 18 }) {
  return (
    <RangSymbol groesse={groesse}>
      <path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.75-5.2 2.75 1-5.8-4.2-4.1 5.8-.85L12 3.6Z" />
    </RangSymbol>
  );
}

/* Gold — Barren. */
function IconBarren({ groesse = 18 }) {
  return (
    <RangSymbol groesse={groesse}>
      <path d="M3.4 18.8h17.2l-3.4-8.4H6.8L3.4 18.8Z" />
      <path d="M6.8 10.4l2-5.2h6.4l2 5.2" />
    </RangSymbol>
  );
}

/* Platin — Krone. */
function IconKrone({ groesse = 18 }) {
  return (
    <RangSymbol groesse={groesse}>
      <path d="M5.4 17.6l-1.5-9.2 4.6 3.5L12 5.6l3.5 6.3 4.6-3.5-1.5 9.2H5.4Z" />
      <path d="M5.9 20.2h12.2" />
    </RangSymbol>
  );
}

/* Smaragd — geschliffener Stein: Krone, Rundiste, zwei Facetten. */
function IconEdelstein({ groesse = 18 }) {
  return (
    <RangSymbol groesse={groesse}>
      <path d="M8.2 4.6h7.6L19 9.7 12 19.6 5 9.7l3.2-5.1Z" />
      <path d="M5 9.7h14" />
      <path d="M9.5 9.7L12 4.6l2.5 5.1" />
    </RangSymbol>
  );
}

/* Diamant — Raute mit Tafel. Spitze Ecken, damit sie sich vom
   geschliffenen Stein der Stufe darunter klar unterscheidet. */
function IconRaute({ groesse = 18 }) {
  return (
    <RangSymbol groesse={groesse}>
      <path d="M12 3.2 20.8 12 12 20.8 3.2 12 12 3.2Z" />
      <path d="M12 8.4 15.6 12 12 15.6 8.4 12 12 8.4Z" />
    </RangSymbol>
  );
}

/* Welches Zeichen zu welcher Stufe gehoert. Der Schluessel ist der
   der Stufe (RAENGE) — kommt spaeter eine dazu, ohne dass hier ein
   Zeichen hinterlegt wird, traegt sie das Schild wie bisher. */
const RANG_ICONS = {
  kupfer: IconMuenze,
  bronze: IconSchild,
  silber: IconStern,
  gold: IconBarren,
  platin: IconKrone,
  smaragd: IconEdelstein,
  diamant: IconRaute,
  // Champion — derselbe Pokal wie beim Turniersieger.
  champion: IconPokal,
};

/* Das Zeichen einer Stufe. Ohne hinterlegtes Zeichen das Schild. */
function RangIcon({ stufe, groesse = 18 }) {
  const Zeichen = (stufe && RANG_ICONS[stufe.key]) || IconSchild;
  return <Zeichen groesse={groesse} />;
}

/* Der Rang unter dem Titel: Zeichen und Name in der Rangfarbe. */
function RangChip({ xp, onClick }) {
  const { rang } = rangFuer(xp);
  return (
    <button
      onClick={onClick}
      title="Dein Rang"
      aria-label={"Dein Rang: " + rang.name + " — Übersicht öffnen"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        marginTop: 10, padding: "5px 12px 5px 10px", borderRadius: 999,
        background: mitDeckkraft(rang.farbe, 0.14),
        border: "1px solid " + mitDeckkraft(rang.farbe, 0.55),
        color: rang.farbe, cursor: "pointer", fontFamily: "inherit",
        fontSize: 12.5, fontWeight: 700, lineHeight: 1,
      }}
    >
      <RangIcon stufe={rang} groesse={14} />
      {rang.name}
    </button>
  );
}

/* Eine Zeile der Leiter. */
function RangZeile({ stufe, platz, erreicht, aktuell }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 12px", borderRadius: 8,
        background: aktuell ? mitDeckkraft(stufe.farbe, 0.12) : "#141416",
        border: "1px solid " + (aktuell ? stufe.farbe : "#2A2A2E"),
        // Was noch aussteht, tritt zurueck — bleibt aber lesbar.
        opacity: erreicht ? 1 : 0.55,
      }}
    >
      <span style={{ color: stufe.farbe, display: "flex", flexShrink: 0 }}>
        <RangIcon stufe={stufe} groesse={16} />
      </span>
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 14,
          fontWeight: aktuell ? 700 : 400,
          color: aktuell ? stufe.farbe : "#EDEAE3",
        }}
      >
        {stufe.name}
      </span>

      {aktuell && (
        <span
          style={{
            flexShrink: 0, fontSize: 9.5, letterSpacing: 1,
            fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
            background: stufe.farbe, color: "#17171A",
            borderRadius: 4, padding: "3px 7px",
          }}
        >
          AKTUELL
        </span>
      )}

      <span
        style={{
          flexShrink: 0, fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, color: "#77746c",
        }}
        title={"Rang " + platz + " von " + RAENGE.length}
      >
        {xpText(stufe.ab)}
      </span>

      <span style={{ display: "flex", flexShrink: 0, color: erreicht ? "#9A968C" : "#55524c" }}>
        {erreicht ? <IconHaken groesse={15} /> : <IconSchloss groesse={15} />}
      </span>
    </div>
  );
}

/**
 * Die Rang-Uebersicht. Oben der eigene Stand, darunter die ganze
 * Leiter — hoechste Stufe zuerst.
 *
 * Getoent wird durchweg mit der Farbe der aktuellen Stufe, nicht mit
 * der Akzentfarbe der App: der Rang bringt seine eigene Farbe mit.
 */
function RangOverlay({ xp, onClose }) {
  const stand = rangFuer(xp);
  const { rang, naechster, fortschritt, index } = stand;

  return (
    <BottomSheet onClose={onClose}>
      <div style={{ textAlign: "center", paddingBottom: 20, borderBottom: "1px solid #2A2A2E", marginBottom: 18 }}>
        <div
          style={{
            width: 66, height: 66, borderRadius: "50%", margin: "0 auto 12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: mitDeckkraft(rang.farbe, 0.16),
            border: "1px solid " + mitDeckkraft(rang.farbe, 0.5),
            color: rang.farbe,
          }}
        >
          <RangIcon stufe={rang} groesse={30} />
        </div>

        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 26, color: rang.farbe, lineHeight: 1.1 }}>
          {rang.name}
        </div>
        <div style={{ fontSize: 12.5, color: "#9A968C", marginTop: 6 }}>
          Rang {index + 1} von {RAENGE.length}
        </div>

        {naechster ? (
          <>
            <div style={{ height: 8, borderRadius: 4, background: "#2A2A2E", margin: "16px 0 9px", overflow: "hidden" }}>
              <div
                style={{
                  width: (fortschritt * 100).toFixed(1) + "%", height: "100%",
                  background: rang.farbe, borderRadius: 4,
                  transition: "width 300ms ease",
                }}
              />
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#9A968C" }}>
              {xpText(stand.xp)} / {xpText(naechster.ab)} XP bis {naechster.name}
            </div>
          </>
        ) : (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: rang.farbe, marginTop: 16 }}>
            Höchster Rang erreicht · {xpText(stand.xp)} XP
          </div>
        )}
      </div>

      {/* Die Leiter, hoechste Stufe oben. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {RAENGE.map((stufe, i) => ({ stufe, platz: i + 1 }))
          .reverse()
          .map(({ stufe, platz }) => (
            <RangZeile
              key={stufe.key}
              stufe={stufe}
              platz={platz}
              erreicht={stand.xp >= stufe.ab}
              aktuell={stufe.key === rang.key}
            />
          ))}
      </div>
    </BottomSheet>
  );
}

/* Wie lange die Punkte-Einblendung stehen bleibt. */
const XP_HINWEIS_MS = 1800;

/* Kurze Einblendung nach einem Punktgewinn — im selben Ton wie die
   Rueckmeldung im Duell: kurz da, dann von selbst wieder weg. Sie
   liegt unter den Overlays (zIndex 100), damit sie ein offenes Blatt
   nicht ueberdeckt. */
function XpHinweis({ punkte, farbe }) {
  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed", left: 0, right: 0, bottom: 26, zIndex: 90,
        display: "flex", justifyContent: "center", pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "#1D1D21", border: "1px solid " + farbe, color: farbe,
          borderRadius: 999, padding: "9px 16px",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700,
        }}
      >
        +{xpText(punkte)} XP
      </div>
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
  /* Der zuletzt bestaetigte Server-Stand aus dem Anzeige-Cache. Er ist
     bewusst NICHT Teil von `items`: aus ihm darf nie ein
     Schreibvorgang entstehen (siehe ladeAnzeigeCache). Sobald die
     echte Antwort da ist, faellt er ersatzlos weg; scheitert der
     Abruf, bleibt er als "zuletzt bekannter Stand" stehen. */
  const [anzeigeCache, setAnzeigeCache] = useState(() => ladeAnzeigeCache());
  /* Der Ladeeffekt laeuft nur einmal und kennt den Zustand von damals.
     Ob ein Cache-Stand da ist, muss er im Fehlerfall aber aktuell
     wissen — daher zusaetzlich als Ref. */
  const anzeigeCacheRef = useRef(anzeigeCache);
  anzeigeCacheRef.current = anzeigeCache;
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("movie");
  // eine der Kategorien (movie, series, anime, kids, adultanim, game),
  // stats oder minigames
  const [activeTab, setActiveTab] = useState("movie");
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
  /* Der Bilder-Abschnitt im Daten-Panel startet bei jedem Oeffnen
     zugeklappt — gemerkt wird der Zustand bewusst nicht. */
  const [zeigeKopfbilder, setZeigeKopfbilder] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [exportFormat, setExportFormat] = useState("json");
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState("");
  const [filterState, setFilterState] = useState({ ...DEFAULT_FILTER });
  /* Ab 960px stehen Filter und Sortieren als feste Spalte neben der
     Liste statt im Blatt von unten. Unterhalb bleibt der Wert false und
     damit alles wie bisher. */
  const istDesktop = useDesktop();
  const fileInputRef = useRef(null);

  /* Die Tab-Leiste ist seitlich wischbar und breiter als das Display.
     Damit der aktive Tab nie ausserhalb des Sichtbaren steht, wird er
     bei jedem Wechsel hereingeholt — beim ersten Aufbau ebenso wie
     nach einem Klick auf einen nur halb sichtbaren Tab. "nearest"
     heisst: steht er schon vollstaendig im Bild, passiert nichts, und
     die Seite springt vertikal nicht. */
  const tabLeisteRef = useRef(null);

  /* Aus welcher Richtung der neue Kategorie-Inhalt hereingleitet:
     1 = nach rechts gewechselt (Inhalt kommt von rechts), -1 = nach
     links, 0 = ohne Richtung (dann bleibt es beim bisherigen
     Einblenden, etwa beim Zurueckkommen aus der Statistik). */
  const [wechselRichtung, setWechselRichtung] = useState(0);

  /* Eine Kategorie waehlen — von der Reiterleiste wie von der
     Wischgeste. Der Rumpf stammt unveraendert aus dem bisherigen
     Klick-Handler; neu ist allein die Richtung. */
  function waehleKategorie(key, richtung) {
    setWechselRichtung(richtung);
    setCategory(key);
    setActiveTab(key);
    setMode("list");
    setUnterReiter("bewertet");
    setSelectedId(null);
    setSearch("");
    /* Genre, Jahrzehnt, Regie und Reihe gehoeren zur Kategorie, aus
       der sie stammen — ein Filmgenre in den Serien liesse die Liste
       ohne ersichtlichen Grund leer aussehen. Notenbereich und
       Sortierung bleiben wie bisher stehen. */
    setFilterState((f) => ({ ...f, genre: "", jahrzehnt: "", regie: "", reihe: "" }));
  }

  useEffect(() => {
    const leiste = tabLeisteRef.current;
    if (!leiste) return;
    const aktiv = leiste.querySelector('[data-tab="' + activeTab + '"]');
    if (aktiv && typeof aktiv.scrollIntoView === "function") {
      aktiv.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }, [activeTab]);

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
            // Wann die Staffel angelegt wurde. Anders als beim Eintrag
            // bleibt dieser Wert beim Speichern stehen — er ist damit
            // das Datum der letzten Staffel-Bewertung, das der
            // Jahresrueckblick braucht.
            createdAt: typeof sn.createdAt === "number" ? sn.createdAt : 0,
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
      /* Wann aus dem Eintrag ein bewerteter wurde. Der Server setzt das
         Datum genau einmal und laesst es danach stehen — anders als
         `updatedAt`, das bei jedem Nachladen von Poster oder Genres
         mitwandert. null heisst "nicht bekannt": bei Vorgemerktem und
         bei Altbestand aus der Zeit vor dieser Spalte. */
      ratedAt: typeof e.ratedAt === "number" && e.ratedAt > 0 ? e.ratedAt : null,
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
        /* Die Antwort ersetzt den Cache-Stand vollstaendig — auch wenn
           sie weniger Eintraege enthaelt als das, was gespeichert war.
           Und nur sie: geschrieben wird ausschliesslich aus einer
           bestaetigten Server-Antwort. */
        setAnzeigeCache(null);
        schreibeAnzeigeCache(data);
      } catch (e) {
        if (!cancelled) {
          /* Mit gecachter Ansicht bleibt der Stand stehen und es gibt
             nur den dezenten Hinweis darunter (siehe `cacheHinweis`);
             ohne sie die ausfuehrliche Meldung wie bisher. */
          if (!anzeigeCacheRef.current) {
            setSaveError(
              "Die Bewertungen konnten nicht geladen werden: " + e.message +
                ". Bitte Seite neu laden. (Prüfe, ob die Datenbank verbunden ist.)"
            );
          }
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

  /* ---- Anzeige-Cache: nur zum Hinsehen ----
     Die beiden Listen hier entstehen aus dem gespeicherten Stand und
     gehen in keinen einzigen Schreibvorgang ein. `rankedByCategory`
     und `watchlistByCategory` darueber bleiben unberuehrt bei den
     echten Daten — daran haengen Duelle, Statistik und alles, was
     speichert. */
  const zeigtCache = anzeigeCache !== null;

  const cacheListe = useMemo(() => {
    if (!anzeigeCache) return null;
    const liste = (anzeigeCache[category] || [])
      .filter((f) => !istVorgemerkt(f))
      .map((f) => ({ ...f, score: entryScore(f, category) }));
    liste.sort((a, b) => sortWert(b.score) - sortWert(a.score));
    return liste;
  }, [anzeigeCache, category]);

  const cacheWatchlist = useMemo(() => {
    if (!anzeigeCache) return null;
    return (anzeigeCache[category] || [])
      .filter(istVorgemerkt)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [anzeigeCache, category]);

  /* Was die Liste zeigt — echte Daten, sobald sie da sind. */
  const anzeigeListe = zeigtCache && cacheListe ? cacheListe : currentList;
  const anzeigeWatchlist = zeigtCache && cacheWatchlist ? cacheWatchlist : watchlistList;

  /* Steht der Cache noch, obwohl der Abruf durch ist, ist er
     fehlgeschlagen — dann sagt ein dezenter Hinweis, woher die Liste
     stammt. */
  const cacheHinweis = zeigtCache && loaded;

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

  /* ---- Aktivitaets-Rang ----
     Der Punktestand wird einmal beim Start geholt und danach von jeder
     Gutschrift aktuell gehalten. Er ist Beiwerk: geht hier etwas
     schief, laeuft die App unveraendert weiter, nur der Rang-Chip
     bleibt auf dem letzten bekannten Stand. */
  const [xpStand, setXpStand] = useState({ xp: 0, once: [] });
  const [xpGeladen, setXpGeladen] = useState(false);
  const [rangOffen, setRangOffen] = useState(false);
  // Die zuletzt gutgeschriebenen Punkte, solange die Einblendung steht.
  const [xpHinweis, setXpHinweis] = useState(null);

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        const stand = await api.loadXp();
        if (!abgebrochen) setXpStand(stand);
      } catch (e) {
        // Der Rang ist Beiwerk — ein Fehler hier bleibt still.
      } finally {
        if (!abgebrochen) setXpGeladen(true);
      }
    })();
    return () => { abgebrochen = true; };
  }, []);

  /* Die Einblendung verschwindet von selbst. Kommen zwei Gutschriften
     kurz hintereinander, loest die zweite die erste ab. */
  useEffect(() => {
    if (!xpHinweis) return undefined;
    const zeit = setTimeout(() => setXpHinweis(null), XP_HINWEIS_MS);
    return () => clearTimeout(zeit);
  }, [xpHinweis]);

  /**
   * Punkte gutschreiben. Der Server entscheidet ueber die Hoehe und
   * darueber, ob ein einmaliger Bonus noch aussteht; `granted` sagt,
   * was wirklich dazugekommen ist.
   */
  async function xpGeben(quelle, zusatz) {
    try {
      const stand = await api.grantXp(quelle, zusatz);
      setXpStand({ xp: stand.xp, once: stand.once });
      if (stand.granted > 0) setXpHinweis({ punkte: stand.granted, id: Date.now() });
    } catch (e) {
      // Ohne Punkte laeuft alles Uebrige weiter.
    }
  }

  /* Der einmalige Bonus, sobald in jeder Kategorie etwas bewertet ist.
     Geprueft wird nach jeder neuen Bewertung — und nur, solange der
     Bonus ueberhaupt noch aussteht. */
  async function kategorieBonusPruefen(stand) {
    if (xpStand.once.includes("alle-kategorien")) return;
    if (!alleKategorienBewertet(stand)) return;
    await xpGeben("alle-kategorien", { once: "alle-kategorien" });
  }

  /* Bewertungen, die es schon gab, bevor es Punkte gab: einmalig
     angerechnet, mit demselben Wert wie eine neue Bewertung. Der
     Server laesst das genau einmal zu.

     Erst wenn beides steht — Sammlung und Punktestand — und das Laden
     der Sammlung geklappt hat: sonst wuerde eine leer geladene
     Sammlung den Bonus mit 0 verbrauchen. */
  const bestandGemeldet = useRef(false);
  useEffect(() => {
    if (!loaded || !xpGeladen || bestandGemeldet.current || saveError) return;
    bestandGemeldet.current = true;
    if (xpStand.once.includes("bestand")) return;
    const anzahl = CATEGORY_KEYS.reduce(
      (s, k) => s + (items[k] || []).filter((f) => !istVorgemerkt(f)).length,
      0
    );
    xpGeben("bewertung", { once: "bestand", count: anzahl });
  }, [loaded, xpGeladen, saveError]);

  /* ---- Fortsetzungs-Erinnerung ----
     Einmal die Woche wird abgeglichen, ob es zu einer bewerteten Serie
     inzwischen mehr Staffeln gibt. Das laeuft im Hintergrund und darf
     ruhig scheitern: Es ist ein Hinweis am Rand, keine Funktion, an der
     etwas haengt. Deshalb faengt der Aufruf seine Fehler selbst ab und
     der Nutzer sieht davon nichts. */
  const [fortsetzungen, setFortsetzungen] = useState(() => ladeFortsetzungen());
  const fortsetzungenGeprueft = useRef(false);

  useEffect(() => {
    if (!loaded || fortsetzungenGeprueft.current) return;
    fortsetzungenGeprueft.current = true;

    const alt = ladeFortsetzungen();
    if (fortsetzungenFrisch(alt)) return;

    const anfrage = fortsetzungsAnfrage(items, alt);
    if (!anfrage.length) return;

    let abgebrochen = false;
    (async () => {
      const stand = {};
      let offen = anfrage;

      for (let runde = 0; runde < FORTSETZUNGS_RUNDEN && offen.length; runde++) {
        const antwort = await api.pruefeFortsetzungen(offen);
        Object.assign(stand, antwort.treffer);

        const offeneIds = new Set(antwort.offen);
        const rest = offen.filter((e) => offeneIds.has(e.id));
        // Kommt eine Runde ohne Fortschritt zurueck, bringt die
        // naechste auch keinen — dann lieber mit dem aufhoeren, was da
        // ist, als es zwoelfmal zu wiederholen.
        if (rest.length >= offen.length) break;
        offen = rest;
      }

      if (abgebrochen) return;
      const eintrag = { zeit: Date.now(), fassung: FORTSETZUNGS_FASSUNG, stand };
      speichereFortsetzungen(eintrag);
      setFortsetzungen(eintrag);
    })().catch(() => {
      if (abgebrochen) return;
      /* Gescheitert — der Stand wird trotzdem vermerkt, damit es nicht
         bei jedem Neuladen der Seite erneut versucht wird. Er haelt nur
         einen Tag statt einer Woche. */
      const eintrag = { zeit: Date.now(), fassung: FORTSETZUNGS_FASSUNG, stand: {}, fehler: true };
      speichereFortsetzungen(eintrag);
      setFortsetzungen(eintrag);
    });

    return () => {
      abgebrochen = true;
    };
  }, [loaded]);

  /* Zu welchen Eintraegen gehoert ein Hinweis? Die Auswertung haengt am
     gespeicherten Stand UND an der Sammlung: Wer die neue Staffel
     nachtraegt, soll das Badge sofort los sein, ohne eine Woche auf den
     naechsten Abgleich zu warten. */
  const neueStaffelIds = useMemo(() => neueStaffeln(fortsetzungen, items), [fortsetzungen, items]);

  /* ---- Gespielte Duelle je Kategorie ----
     Geholt wird der Stand erst, wenn die Minispiele zum ersten Mal
     geoeffnet werden — wer nie spielt, laedt ihn nie. Danach haelt ihn
     jede Auswertung selbst aktuell. */
  const [duellZahlen, setDuellZahlen] = useState({});
  const [duellFehler, setDuellFehler] = useState("");
  const duellZahlenGeholt = useRef(false);

  useEffect(() => {
    if (activeTab !== "minigames" || duellZahlenGeholt.current) return;
    duellZahlenGeholt.current = true;
    (async () => {
      try {
        const zahlen = await api.loadDuelCounts();
        setDuellZahlen(zahlen);
      } catch (e) {
        // Der Zaehler ist Beiwerk — ein Fehler hier bleibt still.
      }
    })();
  }, [activeTab]);

  // ---- Angezeigte Liste: Suche + Filter (Bereich + Sortierung) ----
  const filtered = useMemo(() => {
    let list = anzeigeListe;
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
    list = list.filter((f) => passtZuFiltern(f, filterState, category));

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
  }, [anzeigeListe, search, filterState, category]);

  const isFilterActive = filterAktiv(filterState);
  const isSortActive = filterState.sort !== DEFAULT_FILTER.sort;

  const selectedEntry = useMemo(() => {
    if (!selectedId) return null;
    return currentList.find((f) => f.id === selectedId) || null;
  }, [currentList, selectedId]);

  /* ---- Grundlage der Empfehlungen: das Geschmacksprofil ----
     ALLE bewerteten Eintraege der Kategorie bilden die Grundlage, nicht
     nur die Besten — `currentList` ist bereits nach Endnote sortiert,
     unbewertetes (Staffelgewichte auf 0) hat keine Note und faellt
     heraus.

     Der Massstab fuer "ueberdurchschnittlich" ist der Durchschnitt
     ueber dieselben Eintraege: Jeder zaehlt mit dem Abstand zu diesem
     Schnitt, hoch Bewertetes zieht sein Genre also nach oben,
     schwach Bewertetes nach unten. Die Sortierung nach Note bleibt
     wichtig — die vorderen Eintraege gehen zusaetzlich als Titel mit,
     aus denen der Server die Schlagworte holt. */
  const empfehlungsProfil = useMemo(() => {
    const bewertet = currentList.filter((f) => typeof f.score === "number");
    if (!bewertet.length) return null;

    const basis = bewertet.reduce((s, f) => s + f.score, 0) / bewertet.length;
    return geschmacksProfil(bewertet, basis, category);
  }, [currentList, category]);

  /* Alles, was in dieser Kategorie schon bekannt ist — bewertet wie
     vorgemerkt. Daran werden die Vorschlaege aussortiert. */
  const bekannteTitel = useMemo(
    () => new Set((items[category] || []).map((f) => titelSchluessel(f.title))),
    [items, category]
  );

  /* Dieselbe Sammlung noch einmal, aber als Nachschlagewerk: Von der
     Vergleichsform des Titels auf den Eintrag selbst. Daran erkennt das
     Hinzufuegen, dass ein Titel schon da ist — und kann sagen, unter
     welchem Namen und ob er bewertet oder vorgemerkt ist.

     Steht derselbe Schluessel mehrfach (zwei Eintraege mit gleichem
     Titel — genau das, was die Warnung kuenftig verhindern soll), gilt
     der erste. */
  const bekannteEintraege = useMemo(() => {
    const map = new Map();
    for (const f of items[category] || []) {
      const key = titelSchluessel(f.title);
      if (key && !map.has(key)) {
        map.set(key, { id: f.id, title: f.title, watchlist: istVorgemerkt(f) });
      }
    }
    return map;
  }, [items, category]);

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
      // Punkte fuer die neue Bewertung — und der Kategorie-Bonus, falls
      // damit die letzte offene Kategorie belegt ist.
      const danach = { ...items, [category]: [normalizeEntry(created), ...items[category]] };
      await xpGeben("bewertung");
      await kategorieBonusPruefen(danach);
    } catch (e) {
      setSaveError("Nicht gespeichert: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  /* ---- Watchlist ----
     Vormerken legt einen Eintrag ohne jede Bewertung an. Poster und
     Angaben holt danach dasselbe automatische Nachladen wie bei jedem
     anderen Eintrag.

     Bewusst OHNE `busy` und OHNE globale Fehlermeldung: der Aufruf
     dauert rund zwei Sekunden, und in dieser Zeit sollen die uebrigen
     Zeilen der Trefferliste bedienbar bleiben. Ladezustand und Fehler
     gehoeren an die Zeile, die gedrueckt wurde — deshalb liefert die
     Funktion beides zurueck, statt es selbst anzuzeigen. */
  async function watchlistHinzufuegen({ title, poster, year }) {
    const name = (title || "").trim();
    if (!name) return { ok: false, fehler: "Kein Titel." };
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
      return { ok: true, fehler: "" };
    } catch (e) {
      return { ok: false, fehler: "Nicht vorgemerkt: " + e.message };
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
      // Punkte fuer den Uebergang von vorgemerkt zu bewertet — und der
      // Kategorie-Bonus, falls damit die letzte Kategorie belegt ist.
      const danach = {
        ...items,
        [category]: items[category].map((f) => (f.id === id ? normalizeEntry(saved) : f)),
      };
      await xpGeben("watchlist");
      await kategorieBonusPruefen(danach);
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

  /* ---- Minispiel "Head-to-Head" ----
     Ein Duell verschiebt ausschliesslich das Bauchgefuehl der beiden
     beteiligten Eintraege; die Endnote entsteht danach wie immer ueber
     die bestehende Formel. Uebersprungene Duelle kommen hier nie an. */
  async function duellAuswerten(catKey, gewinnerId, verliererId) {
    if (gewinnerId === verliererId) return;
    const liste = items[catKey] || [];
    const gewinner = liste.find((f) => f.id === gewinnerId);
    const verlierer = liste.find((f) => f.id === verliererId);
    if (!gewinner || !verlierer) return;

    const noteGewinner = entryScore(gewinner, catKey);
    const noteVerlierer = entryScore(verlierer, catKey);
    if (typeof noteGewinner !== "number" || typeof noteVerlierer !== "number") return;

    const delta = eloDelta(noteGewinner, noteVerlierer);
    const neuGewinner = mitVerschobenemBauchgefuehl(gewinner, delta);
    const neuVerlierer = mitVerschobenemBauchgefuehl(verlierer, -delta);
    if (!neuGewinner || !neuVerlierer) return;

    try {
      /* Alles Uebrige des Eintrags geht unveraendert mit — wie beim
         Speichern der Angaben fasst dieser Aufruf nur das Bauchgefuehl
         an (bei Staffeln deren Bauchgefuehl, siehe
         mitVerschobenemBauchgefuehl). */
      const [gespeicherterGewinner, gespeicherterVerlierer] = await Promise.all([
        api.update(gewinner.id, {
          ...gewinner,
          category: catKey,
          personal: neuGewinner.personal,
          seasons: neuGewinner.seasons,
        }),
        api.update(verlierer.id, {
          ...verlierer,
          category: catKey,
          personal: neuVerlierer.personal,
          seasons: neuVerlierer.seasons,
        }),
      ]);
      setItems((prev) => ({
        ...prev,
        [catKey]: prev[catKey].map((f) =>
          f.id === gewinner.id
            ? normalizeEntry(gespeicherterGewinner)
            : f.id === verlierer.id
              ? normalizeEntry(gespeicherterVerlierer)
              : f
        ),
      }));
      setDuellFehler("");
    } catch (e) {
      setDuellFehler("Duell nicht gespeichert: " + e.message);
      return;
    }

    /* Der Zaehler ist Beiwerk: geht er schief, bleibt die Verschiebung
       trotzdem stehen — nur die Zahl hinkt dann hinterher. */
    try {
      const stand = await api.countDuel(catKey);
      setDuellZahlen((prev) => ({ ...prev, [catKey]: stand.count }));
    } catch (e) {
      setDuellZahlen((prev) => ({ ...prev, [catKey]: (prev[catKey] || 0) + 1 }));
    }

    // Punkte fuer das gespielte Duell.
    await xpGeben("duell");
  }

  /* ---- Minispiel "Was schau ich?" ----
     Der ausgeloste Titel geht in genau dasselbe Bewertungsformular, das
     auch "✓ Ansehen" in der Watchlist oeffnet. Dafuer muss der
     Minispiele-Bereich verlassen und in die Kategorie des Titels
     gewechselt werden — gesetzt wird dabei dasselbe wie beim Klick auf
     einen Kategorie-Tab, damit die Liste dahinter stimmig ist. */
  function vorgemerktesBewerten(catKey, eintrag) {
    if (!eintrag || !CATEGORY_KEYS.includes(catKey)) return;
    setCategory(catKey);
    setActiveTab(catKey);
    setSelectedId(null);
    setSearch("");
    setUnterReiter("watchlist");
    /* Genre, Jahrzehnt, Regie und Reihe gehoeren zur Kategorie, aus der
       sie stammen; nach dem Wechsel gelten sie nicht mehr. */
    setFilterState((f) => ({ ...f, genre: "", jahrzehnt: "", regie: "", reihe: "" }));
    setBewerteVorgemerkt(eintrag);
    setMode("watchlist-form");
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
          // Wann bewertet wurde — bei Serien die zuletzt nachgetragene
          // Staffel. Leer, wo kein Datum vorliegt (Altbestand).
          bewertetAm: bewertetAm(f) ? new Date(bewertetAm(f)).toISOString() : "",
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
                /* Das Bewertungsdatum aus der Sicherung. Ohne diese
                   Zeile stuende nach dem Einspielen die ganze Sammlung
                   im Jahr des Imports — der Jahresrueckblick waere
                   damit hinueber. Aeltere Sicherungen haben das Feld
                   nicht; dann setzt der Server das heutige Datum. */
                ratedAt: typeof entry.ratedAt === "number" && entry.ratedAt > 0 ? entry.ratedAt : undefined,
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

  /* ---- Wischen im Inhaltsbereich wechselt die Kategorie ----
     Es wird nur die Geste erkannt; am Finger zieht nichts mit. Erkannt
     heisst: derselbe Uebergang wie beim Antippen des Reiters, in
     dieselbe Richtung. Am ersten bzw. letzten Reiter passiert nichts.

     Die Reiterleiste selbst liegt im Kopfbereich und damit ausserhalb
     dieses Bereichs; alles andere, was waagerecht rollt oder eigene
     waagerechte Gesten hat, faengt istEigenerQuerbereich ab. */
  const wischStart = useRef(null);
  const inhaltRef = useRef(null);

  function wischAnfang(e) {
    wischStart.current = null;
    if (mode !== "list") return;
    if (!e.touches || e.touches.length !== 1) return;
    if (istEigenerQuerbereich(e.target, inhaltRef.current)) return;
    wischStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function wischEnde(e) {
    const start = wischStart.current;
    wischStart.current = null;
    if (!start || mode !== "list") return;
    if (!e.changedTouches || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < WISCH_SCHWELLE_PX) return;
    if (Math.abs(dx) < WISCH_VERHAELTNIS * Math.abs(dy)) return;

    // Nach links gewischt heisst: eine Kategorie weiter nach rechts.
    const richtung = dx < 0 ? 1 : -1;
    const jetzt = CATEGORY_KEYS.indexOf(category);
    const ziel = jetzt + richtung;
    if (jetzt < 0 || ziel < 0 || ziel >= CATEGORY_KEYS.length) return;
    waehleKategorie(CATEGORY_KEYS[ziel], richtung);
  }

  return (
    /* overflowX: "clip" faengt den Versatz der Kategorie-Bewegung ab —
       ohne ihn zeigte die Seite fuer die Dauer der Bewegung eine
       Querlaufleiste.
       "clip" und nicht "hidden": es macht die Seite nicht zum
       Rollbereich und laesst die Detailseite (position: fixed)
       unberuehrt. */
    <div style={{ "--accent": accent, minHeight: "100vh", background: "#17171A", color: "#EDEAE3", fontFamily: "'Inter', system-ui, sans-serif", padding: "0 0 60px 0", overflowX: "clip" }}>
      <style>{`
        /* ----------------------------------------------------------
           Grundwerte der Bewegung. Alles, was sich in der App bewegt,
           nimmt seine Dauer und seine Kurve von hier — damit die App
           ueberall im selben Takt laeuft.

           Kurz, praezise, ohne Federn und ohne Ueberschwingen: die
           Kurven laufen alle monoton auf ihren Endwert zu.

           Bewegt werden ausschliesslich transform und opacity. Weder
           width, height, top, left, margin noch padding — die kosten
           einen Layout-Durchlauf und ruckeln auf dem Telefon.
           ---------------------------------------------------------- */
        :root {
          --bewegung-rein:   200ms cubic-bezier(0.22, 1, 0.36, 1);
          --bewegung-raus:   160ms cubic-bezier(0.4, 0, 1, 1);
          --bewegung-tippen: 110ms cubic-bezier(0.4, 0, 0.2, 1);
          --bewegung-blende: 600ms ease-in-out; /* nur Bild-Ueberblendungen */
          /* Der Kategorie-Wechsel laeuft bewusst etwas laenger als der
             Rest: er traegt den groessten Weg und wirkte mit der
             allgemeinen Rein-Dauer abgehackt. Nur diese eine Bewegung
             nutzt den Wert. */
          --bewegung-kategorie: 240ms cubic-bezier(0.25, 0.1, 0.25, 1);
        }

        /* Wer weniger Bewegung eingestellt hat, bekommt keine: alle
           Dauern auf 0ms. Die Regeln weiter unten schalten zusaetzlich
           die Keyframes ab, sodass nur noch Ein- und Ausblenden ohne
           Bewegung uebrigbleibt. */
        @media (prefers-reduced-motion: reduce) {
          :root {
            --bewegung-rein:   0ms linear;
            --bewegung-raus:   0ms linear;
            --bewegung-tippen: 0ms linear;
            --bewegung-blende: 0ms linear;
            --bewegung-kategorie: 0ms linear;
          }
        }

        input[type=range] { -webkit-appearance: none; background: transparent; }
        input[type=range]::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: #2A2A2E; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; margin-top: -9px; width: 24px; height: 24px; border-radius: 50%; background: var(--accent, #C9A227); border: 3px solid #17171A; }
        input[type=range]::-moz-range-track { height: 6px; border-radius: 3px; background: #2A2A2E; }
        input[type=range]::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: var(--accent, #C9A227); border: 3px solid #17171A; }

        /* Bildwechsel im Kopfbereich: das neue Bild blendet ueber dem
           liegengebliebenen alten auf. Der Zielwert 0.9 ist die
           Deckkraft, mit der die Ebene ohnehin liegt. */
        @keyframes backdropBlende { from { opacity: 0; } to { opacity: 0.9; } }
        .backdrop-blende { animation: backdropBlende var(--bewegung-blende) backwards; }

        @media (prefers-reduced-motion: reduce) {
          .backdrop-layer { animation: none !important; transform: none !important; }
        }

        /* ----------------------------------------------------------
           Grundbewegungen der Bedienung. Rein dekorativ: keine der
           Regeln aendert Farbe, Schrift, Groesse oder Position im
           Ruhezustand — sie beschreiben nur den Weg dorthin.
           ---------------------------------------------------------- */

        /* Wechsel der Liste (Kategorie-Tab oder Unterreiter): der neue
           Inhalt blendet auf und kommt dabei ein Stueck von links
           heran. Der Versatz geht bewusst nach links: nach rechts
           haette er auf schmalen Displays fuer den Moment der
           Animation eine Querlaufleiste ausgeloest. */
        /* fill-mode ist bewusst backwards und nicht both: "both" haelt
           den Endzustand fest und liesse damit dauerhaft eine
           transform-Matrix am Element stehen — auch eine Identitaet
           macht das Element zum Bezugsrahmen fuer position: fixed
           darin. Mit "backwards" gilt der Anfangszustand nur vor dem
           Start (wichtig fuer den Versatz der Listenzeilen), danach
           faellt alles auf den normalen Stil zurueck: kein transform,
           volle Deckkraft. */
        @keyframes inhaltRein {
          from { opacity: 0; transform: translateX(-10px); }
          to   { opacity: 1; transform: none; }
        }
        .uebergang { animation: inhaltRein 180ms ease-out backwards; }

        /* Listeneintraege beim Erscheinen — dieselbe Bewegung, nur
           kleiner und nacheinander. Der Versatz steht als
           animation-delay an der Zeile und ist bei den ersten zehn
           gedeckelt (siehe listenVersatz), damit lange Listen nicht
           spuerbar nachhinken. */
        @keyframes zeileRein {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        .listen-eintrag { animation: zeileRein 190ms ease-out backwards; }

        /* Kategorie-Wechsel: der neue Inhalt gleitet richtungsabhaengig
           herein — nach rechts gewechselt kommt er von rechts, nach
           links von links. Der Weg ist kurz und die Deckkraft faellt
           nur bis 0,4: es soll ein Ruck in die Richtung sein, kein
           Auf- und Zublenden.

           Der Versatz nach rechts wuerde fuer die Dauer der Bewegung
           eine Querlaufleiste ausloesen — deshalb traegt die Seite
           overflow-x: clip (siehe der Wurzel-Container). "clip" und
           nicht "hidden": es macht die Seite nicht zum Rollbereich und
           laesst position: fixed (Detailseite) unberuehrt. */
        @keyframes kategorieVonRechts {
          from { opacity: 0.4; transform: translateX(20px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes kategorieVonLinks {
          from { opacity: 0.4; transform: translateX(-20px); }
          to   { opacity: 1; transform: none; }
        }
        .kategorie-rechts { animation: kategorieVonRechts var(--bewegung-kategorie) backwards; }
        .kategorie-links  { animation: kategorieVonLinks  var(--bewegung-kategorie) backwards; }

        /* Seitenwechsel: Detailseite, Minispiele, Statistik und
           Daten-Panel. Hinein von rechts, zurueck nach rechts hinaus. */
        @keyframes seiteRein {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes seiteRaus {
          from { opacity: 1; transform: none; }
          to   { opacity: 0; transform: translateX(12px); }
        }
        .seite-rein { animation: seiteRein var(--bewegung-rein) backwards; }
        /* forwards, weil das Element unmittelbar danach aus dem Baum
           faellt — es bleibt also nichts stehen. */
        .seite-raus { animation: seiteRaus var(--bewegung-raus) forwards; }

        /* Blatt von unten (Filter, Dialoge, Rangleiter) samt
           Abdunkelung dahinter. */
        @keyframes blattRein  { from { transform: translateY(100%); } to { transform: none; } }
        @keyframes blattRaus  { from { transform: none; } to { transform: translateY(100%); } }
        @keyframes blendeRein { from { opacity: 0; }    to { opacity: 0.55; } }
        @keyframes blendeRaus { from { opacity: 0.55; } to { opacity: 0; } }
        .blatt-rein  { animation: blattRein  var(--bewegung-rein) backwards; }
        .blatt-raus  { animation: blattRaus  var(--bewegung-raus) forwards; }
        .blende-rein { animation: blendeRein 160ms ease-out; }
        .blende-raus { animation: blendeRaus 160ms ease-out forwards; }

        /* Die Kategoriefarbe springt nicht um, sie blendet ueber. */
        .tab-btn, .unter-reiter, .neu-knopf {
          transition: background-color 200ms ease, border-color 200ms ease;
        }

        /* Tipp-Rueckmeldung: Knoepfe, Reiter, Karten und Listenzeilen
           federn beim Antippen kurz ein und loesen beim Loslassen
           wieder auf. */
        button, .listen-eintrag { transition: transform var(--bewegung-tippen); }
        button:active, .listen-eintrag:active { transform: scale(0.98); }

        @media (prefers-reduced-motion: reduce) {
          .uebergang, .listen-eintrag, .kategorie-rechts, .kategorie-links,
          .seite-rein, .seite-raus, .blatt-rein, .blatt-raus,
          .blende-rein, .blende-raus {
            animation: none !important;
          }
          .tab-btn, .unter-reiter, .neu-knopf { transition: none !important; }
          button, .listen-eintrag { transition: none !important; }
          button:active, .listen-eintrag:active { transform: none !important; }
        }

        /* Ladeskelett: gedimmte Flaechen in der vorhandenen Kartenfarbe,
           die zwischen 0,45 und 0,75 Deckkraft atmen. Bewegt wird nur
           die Deckkraft — kein Verlauf, kein Sweep, kein Layout. */
        @keyframes skelettPuls {
          from { opacity: 0.45; }
          to   { opacity: 0.75; }
        }
        .skelett {
          background: #1D1D21;
          animation: skelettPuls 1400ms ease-in-out alternate infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .skelett { animation: none !important; opacity: 0.6; }
        }

        input:focus, button:focus-visible, input:focus-visible {
          outline: 2px solid var(--accent, #C9A227);
          outline-offset: 1px;
        }

        /* Sieben Tabs passen auf kein Telefon mehr nebeneinander.
           Statt sie zu schrumpfen, behalten sie ihre Groesse und die
           Leiste wird seitlich wischbar. Die Rollbalkenleiste bleibt
           ausgeblendet — gewischt wird ohnehin mit dem Finger, und ein
           Balken unter den Tabs saehe aus wie ein Trennstrich.

           Das Wischen soll nicht mitten in einem Tab stehenbleiben:
           scroll-snap laesst die Leiste an einem Tabanfang einrasten.
           Der letzte Tab braucht Luft nach rechts, sonst klebt er am
           Rand. */
        .tab-leiste {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          scroll-snap-type: x proximity;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          padding-right: 12px;
        }
        .tab-leiste::-webkit-scrollbar { display: none; }

        .tab-btn {
          flex: 0 0 auto;
          scroll-snap-align: start;
          padding: 13px 12px;
          font-size: 13.5px;
          white-space: nowrap;
        }

        /* Fester 16:9-Ausschnitt ueber die volle Breite. Der Inhalt sitzt
           unten; reicht er einmal tiefer als 16:9 hergeben, waechst der
           Bereich mit, damit nichts abgeschnitten wird. */
        /* Luft ueber dem Titel. Der Inhalt haengt am unteren Rand des
           Kopfbereichs (justify-content: flex-end) — ein groesserer
           Innenabstand am Inhalt selbst haette den Titel deshalb nicht
           nach unten geschoben, sondern nur oben mehr abgeschnitten.
           Der Abstand gehoert an den Kopfbereich: der 16:9-Ausschnitt
           gilt fuer die Inhaltsflaeche (box-sizing content-box), die
           Polsterung kommt also oben drauf und der ganze Block darin
           rutscht mit nach unten.

           Die Safe-Area ersetzt den Zuschlag nicht, sie kommt davor:
           auf Geraeten mit Kerbe lag der Titel bisher unter der
           Statusleiste. Ohne Kerbe liefert env() 0px, dort bleiben die
           28px uebrig.

           Die Symbole oben rechts bleiben, wo sie waren: sie sind
           absolut positioniert und beziehen ihr top: 0 auf die
           Polsterungskante, nicht auf den Inhalt. Ebenso das Bild
           dahinter (inset: 0), das den groesseren Ausschnitt einfach
           mitfuellt. */
        .kopfbereich {
          aspect-ratio: 16 / 9;
          padding-top: calc(env(safe-area-inset-top, 0px) + 28px);
        }
        @supports not (aspect-ratio: 16 / 9) {
          .kopfbereich { min-height: calc(56.25vw + env(safe-area-inset-top, 0px) + 28px); }
        }

        /* ----------------------------------------------------------
           Das Podest — Auszeichnung der Plaetze 1-3 (siehe
           podestSchmuck). Die Flaeche liegt hinter der ganzen Zeile
           und laeuft nach rechts aus, damit Titel und Note lesbar
           bleiben. Alles darin ist rein dekorativ.
           ---------------------------------------------------------- */
        .podest {
          overflow: hidden;
          -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 46%, rgba(0,0,0,0.35) 72%, transparent 92%);
          mask-image: linear-gradient(90deg, #000 0%, #000 46%, rgba(0,0,0,0.35) 72%, transparent 92%);
        }

        /* --- Platz 1: Iridescent, "Seegang" ---------------------- */
        /* Drei Farbflaechen, die mit verschiedener Dauer und
           verschiedenem Versatz gegeneinander wandern. Keine von ihnen
           verschwindet je ganz — die Deckkraft bleibt ueberall > 0. */
        .podest1 {
          box-shadow:
            inset 0 0 0 1px rgba(255, 180, 220, 0.14),
            0 0 16px -5px rgba(120, 190, 255, 0.40),
            0 0 22px -8px rgba(240, 90, 170, 0.35);
        }
        .podest1-welle {
          position: absolute;
          top: -40%; bottom: -40%; left: -12%; right: -12%;
          will-change: transform, opacity;
        }
        .podest1-welle-a {
          background: radial-gradient(42% 130% at 24% 50%, rgba(238, 74, 156, 0.52) 0%, rgba(238, 74, 156, 0.24) 46%, rgba(238, 74, 156, 0) 74%);
          animation: podest1SeegangA 3.3s ease-in-out infinite;
        }
        .podest1-welle-b {
          background: radial-gradient(40% 125% at 44% 46%, rgba(66, 128, 246, 0.48) 0%, rgba(66, 128, 246, 0.22) 44%, rgba(66, 128, 246, 0) 73%);
          animation: podest1SeegangB 4.1s ease-in-out -1.4s infinite;
        }
        .podest1-welle-c {
          background: radial-gradient(38% 120% at 62% 56%, rgba(45, 212, 191, 0.44) 0%, rgba(45, 212, 191, 0.20) 42%, rgba(45, 212, 191, 0) 72%);
          animation: podest1SeegangC 4.9s ease-in-out -2.7s infinite;
        }
        @keyframes podest1SeegangA {
          0%   { transform: translate3d(-7%, -5%, 0) scale(1.04); opacity: 0.82; }
          27%  { transform: translate3d(6%, 6%, 0) scale(1.24); opacity: 1; }
          51%  { transform: translate3d(-4%, 3%, 0) scale(0.96); opacity: 0.68; }
          74%  { transform: translate3d(8%, -6%, 0) scale(1.16); opacity: 0.93; }
          100% { transform: translate3d(-7%, -5%, 0) scale(1.04); opacity: 0.82; }
        }
        @keyframes podest1SeegangB {
          0%   { transform: translate3d(5%, 6%, 0) scale(1.18); opacity: 0.95; }
          22%  { transform: translate3d(-8%, -4%, 0) scale(0.94); opacity: 0.66; }
          49%  { transform: translate3d(7%, -7%, 0) scale(1.26); opacity: 1; }
          73%  { transform: translate3d(-3%, 5%, 0) scale(1.02); opacity: 0.74; }
          100% { transform: translate3d(5%, 6%, 0) scale(1.18); opacity: 0.95; }
        }
        @keyframes podest1SeegangC {
          0%   { transform: translate3d(-5%, 4%, 0) scale(1.10); opacity: 0.70; }
          31%  { transform: translate3d(9%, -6%, 0) scale(1.28); opacity: 0.98; }
          58%  { transform: translate3d(-9%, 5%, 0) scale(0.95); opacity: 0.62; }
          80%  { transform: translate3d(3%, -3%, 0) scale(1.14); opacity: 0.88; }
          100% { transform: translate3d(-5%, 4%, 0) scale(1.10); opacity: 0.70; }
        }

        /* Vier Glanzpunkte, die unregelmaessig aufblitzen: jeder mit
           eigener Dauer und eigenem Versatz, damit sie nie im
           Gleichschritt blinken. */
        .podest1-glanz {
          position: absolute;
          width: 26px; height: 26px;
          margin: -13px 0 0 -13px;
          border-radius: 50%;
          opacity: 0;
          background: radial-gradient(circle, rgba(255,255,255,0.92) 0%, rgba(255,236,248,0.42) 34%, rgba(255,255,255,0) 70%);
          will-change: transform, opacity;
        }
        .podest1-glanz-a { left: 13%; top: 26%; animation: podest1Glanz 2.6s ease-out -0.4s infinite; }
        .podest1-glanz-b { left: 31%; top: 72%; animation: podest1Glanz 3.7s ease-out -1.9s infinite; }
        .podest1-glanz-c { left: 52%; top: 34%; animation: podest1Glanz 4.3s ease-out -3.1s infinite; }
        .podest1-glanz-d { left: 68%; top: 64%; animation: podest1Glanz 5.1s ease-out -0.9s infinite; }
        @keyframes podest1Glanz {
          0%, 74%, 100% { opacity: 0; transform: scale(0.5); }
          80%           { opacity: 0.95; transform: scale(1); }
          88%           { opacity: 0.18; transform: scale(0.72); }
        }

        /* --- Platz 2: Champion ----------------------------------- */
        /* Glatte Flaeche, kein Linienmuster — nur ein Glanzstreifen,
           der alle 3,6 s einmal von rechts nach links durchzieht. */
        .podest2 {
          background: linear-gradient(90deg,
            rgba(198, 58, 84, 0.46) 0%,
            rgba(216, 86, 108, 0.32) 32%,
            rgba(198, 58, 84, 0.12) 60%,
            rgba(198, 58, 84, 0) 82%);
          box-shadow:
            inset 0 0 0 1px rgba(255, 175, 190, 0.10),
            0 0 12px -7px rgba(216, 86, 108, 0.45);
        }
        .podest2-streifen {
          position: absolute;
          top: -70%; bottom: -70%; left: 0; width: 16%;
          background: linear-gradient(90deg, rgba(255,226,232,0) 0%, rgba(255,226,232,0.34) 50%, rgba(255,226,232,0) 100%);
          opacity: 0;
          will-change: transform, opacity;
          animation: podest2Glanz 3.6s linear infinite;
        }
        @keyframes podest2Glanz {
          0%        { transform: translateX(560%) rotate(18deg); opacity: 0; }
          8%        { opacity: 0.9; }
          52%       { opacity: 0.9; }
          62%, 100% { transform: translateX(-160%) rotate(18deg); opacity: 0; }
        }

        /* --- Platz 3: Diamond ------------------------------------ */
        /* Glattes Violett, kein Muster und kein Glanzstreifen. Die
           Flaeche steht still; nur die Deckkraft atmet sehr langsam. */
        .podest3 {
          background: linear-gradient(90deg,
            rgba(139, 107, 201, 0.36) 0%,
            rgba(158, 128, 214, 0.23) 34%,
            rgba(139, 107, 201, 0.08) 62%,
            rgba(139, 107, 201, 0) 84%);
          box-shadow: inset 0 0 0 1px rgba(190, 170, 240, 0.07);
          animation: podest3Atmen 7s ease-in-out infinite;
        }
        @keyframes podest3Atmen {
          0%, 100% { opacity: 0.88; }
          50%      { opacity: 1; }
        }

        /* Wer weniger Bewegung eingestellt hat, bekommt dieselben
           Farben — nur still. Die Glanzpunkte blieben sonst
           unsichtbar, sie bekommen deshalb eine feste Deckkraft. */
        @media (prefers-reduced-motion: reduce) {
          .podest1-welle, .podest1-glanz, .podest2-streifen, .podest3 {
            animation: none !important;
          }
          .podest1-glanz { opacity: 0.30; }
          .podest2-streifen { opacity: 0; }
        }

        /* Ab 960px sichtbar, darunter gar nicht vorhanden. Beide
           Klassen tragen ausschliesslich neu hinzugekommene Elemente —
           fuer alles Bestehende aendert sich dadurch nichts. */
        .nur-desktop-inline, .nur-desktop-block { display: none; }
        @media (min-width: 960px) {
          .nur-desktop-inline { display: inline; }
          .nur-desktop-block { display: block; }
        }

        /* ==========================================================
           DESKTOP — ab 960px

           Alles unterhalb dieser Schwelle bleibt unberuehrt: Es gibt
           in diesem Abschnitt keine Regel ausserhalb der Media Query,
           und keine der benutzten Klassen traegt sonst irgendwo eine
           Eigenschaft. Die Handy-Ansicht kennt die Klassen also, hat
           aber nichts von ihnen.

           Warum an vielen Stellen !important: Die App gibt ihr Layout
           ueberwiegend als style-Attribut mit. Ein style-Attribut
           schlaegt jede Regel aus dem Stylesheet — ausser einer mit
           !important. Der bestehende Inline-Wert bleibt dadurch
           unangetastet und gilt weiterhin unterhalb der Schwelle; er
           wird nur oberhalb ueberstimmt.
           ========================================================== */
        @media (min-width: 960px) {
          /* --- 1. Inhalts-Container ---------------------------------
             Der Seitenhintergrund liegt am aeussersten <div> und
             bleibt davon unberuehrt — er faerbt weiterhin das ganze
             Fenster. Zentriert wird nur, was Inhalt traegt. */
          .inhalt-breite { max-width: 1200px !important; }

          /* --- 2. Kopfbereich ---------------------------------------
             Ohne 16:9 waere der Kopf auf 1920px ueber 1000px hoch.
             min-height statt height mit Deckel: Der Kopf traegt Titel,
             Rang, Zaehler und die Tab-Leiste — waere die Hoehe fest
             und der Inhalt einmal hoeher, schnitte ihn das
             overflow: hidden des Kopfbereichs ab. So ist 360px der
             Boden, nicht die Decke, und nichts kann verschwinden.

             Das Bild dahinter fuellt den Ausschnitt unveraendert mit
             object-fit: cover (siehe HeaderSlideshow) — es wird
             beschnitten, nicht verzerrt. Titel und Symbolreihe sitzen
             relativ zum Kopfbereich und wandern einfach mit; an
             Deckkraft und Wechselintervall aendert sich nichts.

             box-sizing: border-box, weil die Polsterung oben sonst auf
             die 360px draufkaeme — der Kopf waere dann 388px hoch und
             damit ueber dem angepeilten Bereich. Am Handy bleibt es
             beim bisherigen content-box: dort gilt diese Regel nicht. */
          .kopfbereich {
            aspect-ratio: auto;
            box-sizing: border-box;
            min-height: 360px;
          }
          /* Hebt die Ersatzregel aus dem @supports-Block oben auf —
             sie rechnet ebenfalls mit 56.25vw und stuende hier sonst
             mit 1080px dagegen. */
          @supports not (aspect-ratio: 16 / 9) {
            .kopfbereich { min-height: 360px; }
          }

          /* --- 3. Tab-Leiste ----------------------------------------
             Sechs Kategorien haben auf 1200px reichlich Platz. Kein
             Wischen mehr, stattdessen teilen sich die Tabs die Breite
             zu gleichen Teilen. Farben, Form und der aktive Zustand
             stehen als Inline-Stil an den Knoepfen und bleiben, wie
             sie sind — hier aendert sich allein die Breite. */
          .tab-leiste {
            overflow-x: visible;
            scroll-snap-type: none;
            padding-right: 0;
          }
          .tab-btn {
            flex: 1 1 0;
            min-width: 0;
          }

          /* --- 4. Filter und Sortieren als Seitenleiste -------------
             Zwei Spalten: links die Filter, rechts die Liste. Welche
             Darstellung im Baum steht, entscheidet useDesktop — hier
             steht nur ihre Anordnung. */
          .listen-spalten {
            display: grid;
            grid-template-columns: 240px minmax(0, 1fr);
            gap: 28px;
            align-items: start;
          }
          /* Die Leiste laeuft mit, wenn die Liste lang wird. */
          .filter-spalte {
            position: sticky;
            top: 20px;
            max-height: calc(100vh - 40px);
            overflow-y: auto;
            scrollbar-width: thin;
          }

          /* --- "+ Neu hinzufuegen" ---------------------------------
             Ueber die vollen 1200px gezogen wirkte der Knopf wie ein
             Balken. Er bekommt deshalb einen Deckel — 240px, dieselbe
             Breite wie die Filterspalte direkt darunter, sodass beide
             an derselben Kante enden.

             Nur max-width: Die Inline-Breite width: 100% bleibt stehen
             und gilt unterhalb der Schwelle unveraendert weiter; ein
             !important braucht es nicht, weil max-width ohnehin
             vorgeht. Farbe, Hoehe, Rundung und Schrift stehen alle im
             style-Attribut und sind nicht angefasst. */
          .neu-knopf { max-width: 240px; }

          /* --- 5. Ranglisten-Zeilen ---------------------------------
             Einspaltig wie bisher — nur mehr Luft nach oben und
             unten. Die Zeile selbst wird durch den breiteren Container
             breiter, dazu braucht es keine Regel. */
          .listen-eintrag { padding: 16px 10px !important; }

          /* --- 6. Verlauf der Plaetze 1-10 --------------------------
             Am Handy holt der Inline-Wert calc(-50vw + 50%) den
             Verlauf bis an den linken Fensterrand. Ab hier steht links
             die Filterleiste: derselbe Wert liefe unter ihr hindurch
             und begaenne im leeren Bereich daneben. Der Verlauf endet
             deshalb an der linken Kante der Listenspalte — dort, wo
             der Inhalt anfaengt.

             Farbe, Kurve und Abstufung stecken im background der
             Zeile (rangVerlauf) und werden hier nicht angefasst. */
          .zeilen-schmuck { left: 0 !important; }
        }

        /* --- 7. Hover ----------------------------------------------
           Nur fuer Geraete mit echtem Zeiger. Touch-Geraete melden
           hover: none und bekommen davon nichts zu sehen — dort bliebe
           ein Hover-Zustand sonst nach dem Tippen kleben.

           Ausschliesslich Farben, die die App schon fuehrt: #1D1D21
           (Flaeche der Eingabefelder), #9A968C (gedaempfte Schrift),
           #EDEAE3 (Textfarbe) und die Akzentfarbe der Kategorie. Kein
           einziger neuer Farbwert. */
        @media (min-width: 960px) and (hover: hover) {
          .listen-eintrag { transition: background var(--bewegung-tippen); }
          .listen-eintrag:hover { background: #1D1D21; }

          /* Nur die nicht gewaehlten Tabs reagieren — der aktive traegt
             bereits die Akzentfarbe und soll darunter nicht flackern. */
          .tab-btn:not([data-aktiv="ja"]):hover { color: #EDEAE3; }
          .unter-reiter:not([aria-pressed="true"]):hover { border-color: #9A968C; }

          .filter-eintrag:not([aria-pressed="true"]):hover { border-color: #9A968C; }
          .kopf-icon:hover, .icon-knopf:hover { border-color: var(--accent, #C9A227); }
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

        {/* Minispiele, Statistik und Daten-Panel sitzen als Symbole oben
            rechts auf dem Bild — alle drei gehoeren zu keiner einzelnen
            Kategorie. */}
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0, zIndex: 2,
            padding: "12px 20px 0", pointerEvents: "none",
          }}
        >
          <div className="inhalt-breite" style={{ maxWidth: 720, margin: "0 auto", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {/* Minispiele und Statistik liegen neben den Kategorien,
                nicht daneben in einer Reihe — hier gibt es also keine
                Wechselrichtung, sie wird zurueckgesetzt. */}
            <KopfIconButton
              title="Minispiele"
              active={activeTab === "minigames"}
              onClick={() => {
                setWechselRichtung(0);
                setActiveTab(activeTab === "minigames" ? category : "minigames");
              }}
            >
              <IconSpiele />
            </KopfIconButton>
            <KopfIconButton
              title="Statistik"
              active={activeTab === "stats"}
              onClick={() => {
                setWechselRichtung(0);
                setActiveTab(activeTab === "stats" ? category : "stats");
              }}
            >
              <IconStatistik />
            </KopfIconButton>
            <KopfIconButton
              title="Daten (Export & Import)"
              active={showExport}
              onClick={() => { setShowExport((v) => !v); setZeigeKopfbilder(false); }}
            >
              <IconZahnrad />
            </KopfIconButton>
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 1, padding: "32px 20px 0" }}>
          <div className="inhalt-breite" style={{ maxWidth: 720, margin: "0 auto" }}>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 34, margin: 0, lineHeight: 1.08 }}>
              {APP_NAME_ZEILEN.map((zeile, i) => (
                <span key={i} style={{ display: "block" }}>{zeile}</span>
              ))}
            </h1>
            {/* Der eigene Rang — er gehoert zum Nutzer, nicht zu einer
                Kategorie, und steht deshalb direkt unter dem Titel.

                Solange der Punktestand nicht geholt ist, steht hier
                KEIN Abzeichen: 0 XP hiesse "Kupfer", und das waere
                schlicht falsch. Stattdessen haelt ein gedimmter
                Platzhalter genau dessen Platz frei, damit beim
                Eintreffen nichts springt. */}
            <div>
              {xpGeladen ? (
                <RangChip xp={xpStand.xp} onClick={() => setRangOffen(true)} />
              ) : (
                <SkelettFlaeche
                  breite={104}
                  hoehe={25}
                  rund={999}
                  style={{ marginTop: 10 }}
                />
              )}
            </div>
            <div style={{ color: "#9A968C", marginTop: 10, fontSize: 14.5, lineHeight: 1.5, marginBottom: 20 }}>
              {/* Der Zaehler zeigt erst eine Zahl, wenn es eine gibt —
                  "0 Filme" waehrend des Ladens sah aus wie eine leere
                  Sammlung. Bis dahin ein Platzhalter derselben Hoehe. */}
              {activeTab === "minigames" ? (
                "Minispiele"
              ) : activeTab === "stats" ? (
                /* Die Statistik rechnet ausschliesslich mit den echten
                   Daten — solange die fehlen, gibt es hier keine Zahl. */
                loaded && !zeigtCache ? (
                  `${gesamtAnzahl} ${gesamtAnzahl === 1 ? "Eintrag" : "Einträge"}`
                ) : (
                  <SkelettFlaeche breite={92} hoehe={15} rund={3} style={{ margin: "3px 0" }} />
                )
              ) : loaded || zeigtCache ? (
                `${anzeigeListe.length} ${catInfo.label}`
              ) : (
                <SkelettFlaeche breite={92} hoehe={15} rund={3} style={{ margin: "3px 0" }} />
              )}
            </div>

          {/* Tabs — seitlich wischbar, siehe .tab-leiste */}
          <div className="tab-leiste" ref={tabLeisteRef} style={{ marginBottom: 0 }}>
            {CATEGORIES.map((c, i) => (
              <button
                key={c.key}
                data-tab={c.key}
                data-aktiv={activeTab === c.key ? "ja" : "nein"}
                onClick={() => {
                  /* Richtung aus der Position in der Leiste: weiter
                     rechts heisst, der Inhalt kommt von rechts. */
                  const jetzt = CATEGORY_KEYS.indexOf(category);
                  waehleKategorie(c.key, i === jetzt ? 0 : i > jetzt ? 1 : -1);
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
            </div>
          </div>
        </div>
      </div>

      {/* Daten-Panel — ueber das Zahnrad im Kopfbereich erreichbar und
          deshalb nicht mehr an eine Kategorie gebunden. */}
      <Seite offen={showExport}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 0" }}>
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

              {/* Bilder des Kopfbereichs — von Hand gepflegt. Die Liste
                  wird mit jedem Bild laenger und stuende sonst zwischen
                  dem Panel-Anfang und Export/Import; der Abschnitt
                  klappt deshalb erst auf Wunsch auf. */}
              <div style={{ borderTop: "1px solid #2A2A2E", marginTop: 14, paddingTop: 14 }}>
                <button
                  onClick={() => setZeigeKopfbilder((v) => !v)}
                  aria-expanded={zeigeKopfbilder}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    background: "transparent", border: "none", padding: 0,
                    cursor: "pointer", textAlign: "left",
                    fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>
                    {zeigeKopfbilder ? "▾" : "▸"}
                  </span>
                  BILDER IM KOPFBEREICH ({headerImages.length})
                </button>

                {zeigeKopfbilder && (
                  <div style={{ marginTop: 10 }}>
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
        </div>
      </Seite>

      {/* Statistik und Minispiele treten an die Stelle des
          Kategorie-Inhalts. Sie gleiten beim Oeffnen mit derselben
          Bewegung herein wie die Detailseite; beim Verlassen uebernimmt
          der Kategorie-Inhalt, der seinerseits hereingleitet — beide
          gleichzeitig im Baum zu halten wuerde die Seite fuer den
          Moment doppelt so hoch machen. `key` sorgt dafuer, dass die
          Bewegung bei jedem Oeffnen neu laeuft. */}
      {activeTab === "stats" ? (
        <div key="seite-stats" className="seite-rein">
        <StatsPage ranked={rankedByCategory} watchlist={watchlistByCategory} />
        </div>
      ) : activeTab === "minigames" ? (
        <div key="seite-minigames" className="seite-rein">
        <MinispielePage
          ranked={rankedByCategory}
          watchlist={watchlistByCategory}
          duellZahlen={duellZahlen}
          onDuell={duellAuswerten}
          onBewerten={vorgemerktesBewerten}
          onXP={() => xpGeben("highscore")}
          onTurnier={() => xpGeben("turnier")}
          fehler={duellFehler}
        />
        </div>
      ) : (
        <div
          ref={inhaltRef}
          onTouchStart={wischAnfang}
          onTouchEnd={wischEnde}
          onTouchCancel={() => { wischStart.current = null; }}
          className="inhalt-breite"
          style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px" }}
        >
          {/* Der Tabwechsel blendet den neuen Kategorie-Inhalt ein.
              Der Zustand darunter bleibt erhalten — die Huelle tauscht
              nichts aus, sie startet nur die Bewegung neu. Mit Richtung
              gleitet er zusaetzlich von der Seite herein, aus der
              gewechselt wurde. */}
          <Uebergang trigger={activeTab} richtung={wechselRichtung}>
          {saveError && (
            <div style={{ background: "#2a1616", border: "1px solid #d9736a", color: "#d9736a", borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              {saveError}
            </div>
          )}

          {/* Kein "Bewertungen werden geladen…" mehr — das Ladeskelett
              der Liste sagt dasselbe, ohne die Seite kurz leer zu
              lassen. */}

          {/* Der Abruf ist gescheitert, aber es gibt einen gespeicherten
              Stand: der bleibt stehen, mit Hinweis woher er stammt. */}
          {cacheHinweis && (
            <div style={{ color: "#77746c", fontSize: 12.5, marginBottom: 16 }}>
              Offline — zuletzt bekannter Stand.
            </div>
          )}

          {mode === "suche" && (
            <NeuerEintrag
              category={category}
              categoryLabel={catInfo.singular}
              bekannt={bekannteEintraege}
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
                      (anzeigeWatchlist.length ? " · " + anzeigeWatchlist.length : ""),
                  },
                ].map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setUnterReiter(r.key)}
                    aria-pressed={unterReiter === r.key}
                    className="unter-reiter"
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
                className="neu-knopf"
                style={{ width: "100%", padding: "16px", background: "var(--accent, #C9A227)", color: "#17171A", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15.5, cursor: "pointer", marginBottom: 20 }}
              >
                + Neu hinzufügen
              </button>
            </>
          )}

          {mode === "list" && unterReiter === "watchlist" && (
            <Uebergang trigger={unterReiter}>
            <>
              <div style={{ fontSize: 12.5, color: "#77746c", marginBottom: 14 }}>
                {!loaded && !zeigtCache ? (
                  <SkelettFlaeche breite={120} hoehe={11} rund={3} style={{ margin: "3px 0" }} />
                ) : anzeigeWatchlist.length === 0 ? (
                  category === "game"
                    ? "Nichts im Backlog."
                    : "Nichts vorgemerkt."
                ) : (
                  anzeigeWatchlist.length +
                  (category === "game"
                    ? anzeigeWatchlist.length === 1 ? " Eintrag im Backlog" : " Einträge im Backlog"
                    : anzeigeWatchlist.length === 1 ? " Eintrag vorgemerkt" : " Einträge vorgemerkt")
                )}
              </div>
              {!loaded && !zeigtCache ? (
                <SkelettListe />
              ) : anzeigeWatchlist.length === 0 ? (
                /* Der Satz erscheint erst, wenn der Abruf durch ist —
                   vorher wuesste niemand, ob wirklich nichts da ist. */
                loaded && (
                  <div style={{ color: "#77746c", textAlign: "center", padding: 50, fontSize: 14.5 }}>
                    {category === "game"
                      ? "Der Backlog ist leer."
                      : "Noch nichts vorgemerkt."}{" "}
                    Über „+ Neu hinzufügen" kannst du Titel{" "}
                    {category === "game" ? "in den Backlog" : "auf die Watchlist"} setzen,
                    ohne sie schon zu bewerten.
                  </div>
                )
              ) : (
                anzeigeWatchlist.map((f, i) => (
                  <WatchlistZeile
                    key={f.id}
                    eintrag={f}
                    reihe={i}
                    vorrang={i < 10}
                    /* Gecachte Zeilen sind reine Anzeige: aus ihnen darf
                       weder eine Bewertung noch ein Loeschen entstehen. */
                    busy={busy || zeigtCache}
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
            </Uebergang>
          )}

          {mode === "list" && unterReiter === "bewertet" && (() => {
            /* Suchfeld, Zaehler und Liste stehen als Bausteine bereit:
               am Handy in genau der bisherigen Reihenfolge untereinander,
               ab 960px verteilt auf zwei Spalten. Der Inhalt der
               Bausteine ist in beiden Faellen derselbe. */
            const suchfeld = (
                <input
                  type="text"
                  placeholder={`${catInfo.label} durchsuchen...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ flex: "1 1 auto", minWidth: 0, background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 8, padding: "13px 12px", color: "#EDEAE3", fontSize: 15, boxSizing: "border-box" }}
                />
            );

            /* Suchzeile: Feld schrumpft mit (minWidth 0), der Knopf
               bleibt als Symbol in fester Breite — so passt die Zeile
               auch auf schmale Displays ohne Querscrollen. Sortieren
               steckt im selben Menue wie die Filter. */
            const suchzeile = (
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {suchfeld}
                <IconButton
                  title="Filter & Sortieren"
                  label={<IconFilter />}
                  active={isFilterActive || isSortActive}
                  onClick={() => setShowFilter(true)}
                />
              </div>
            );

            const zaehler = (
              <div style={{ fontSize: 12.5, color: "#77746c", marginBottom: 14 }}>
                {!loaded && !zeigtCache ? (
                  <SkelettFlaeche breite={120} hoehe={11} rund={3} style={{ margin: "3px 0" }} />
                ) : (
                  `${filtered.length} von ${anzeigeListe.length} ${catInfo.label}`
                )}
              </div>
            );

            /* Liste — die vorderen Plaetze tragen ihre Auszeichnung:
               Platz 1-3 das Podest, Platz 4-10 den Verlauf. Siehe
               zeilenSchmuck. */
            const liste = (
              <div>
                {/* Noch keine Daten: acht Platzhalterzeilen in der Hoehe
                    echter Zeilen. Die echten Daten ersetzen sie ohne
                    Hoehensprung. */}
                {!loaded && !zeigtCache && <SkelettListe />}
                {(loaded || zeigtCache) && filtered.map((f, i) => {
                  const rang = zeilenSchmuck(i + 1, accent);
                  return (
                  <div
                    key={f.id}
                    /* Gecachte Zeilen fuehren bewusst nirgendwohin — der
                       Cache ist reine Anzeige und darf nie Ausgangspunkt
                       eines Schreibvorgangs werden. */
                    onClick={zeigtCache ? undefined : () => { setSelectedId(f.id); setMode("list"); }}
                    className="listen-eintrag"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 4px", borderBottom: "1px solid #232326", gap: 10, cursor: zeigtCache ? "default" : "pointer", position: "relative", animationDelay: listenVersatz(i) }}
                  >
                    {/* Der Verlauf gehoert an den Bildschirmrand, nicht an
                        den Innenabstand der Liste: die Zeile sitzt mittig
                        im Fenster, also holt "-50vw + 50%" genau den Weg
                        nach links zurueck, den Rand und Innenabstand
                        einnehmen. Nach rechts endet die Flaeche wie die
                        Zeile — dort laeuft der Verlauf ohnehin aus. */}
                    {(rang.verlauf || rang.klasse) && (
                      <div
                        aria-hidden="true"
                        className={"zeilen-schmuck" + (rang.klasse ? " " + rang.klasse : "")}
                        style={{
                          position: "absolute", top: 0, bottom: 0, right: 0,
                          left: "calc(-50vw + 50%)",
                          background: rang.verlauf,
                          pointerEvents: "none",
                        }}
                      >
                        {/* Nur das Podest bringt eigene Ebenen mit —
                            Wellen und Glanz von Platz 1, der
                            Glanzstreifen von Platz 2. */}
                        {(rang.ebenen || []).map((klasse) => (
                          <span key={klasse} className={klasse} />
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1, position: "relative", zIndex: 1 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#55524c", width: 22, textAlign: "right", flexShrink: 0, ...rang.zahl }}>
                        {i + 1}
                      </span>
                      {/* Die ersten sichtbaren Zeilen holt der Browser
                          vorrangig, alles darunter erst beim
                          Heranscrollen. */}
                      <Poster url={f.poster} title={f.title} size={34} vorrang={i < 10} />
                      <div style={{ minWidth: 0 }}>
                        {/* Titel und — falls es etwas nachzutragen gibt —
                            der Hinweis auf die neue Staffel. Beides in
                            einer Zeile: Das Badge gehoert an den Titel,
                            nicht in die Angabenzeile darunter. */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <span style={{ fontSize: 15, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</span>
                          {neueStaffelIds.has(f.id) && <NeueStaffelBadge />}
                        </div>
                        <AngabenZeile eintrag={f} mitImdb />
                      </div>
                    </div>
                    <ScoreBadge score={f.score} />
                  </div>
                  );
                })}
                {/* Der Leer-Satz erscheint erst, wenn der Abruf
                    abgeschlossen ist UND die Kategorie wirklich leer
                    ist — waehrend des Ladens stand hier bisher
                    faelschlich "Noch keine … bewertet." */}
                {loaded && filtered.length === 0 && (
                  <div style={{ color: "#77746c", textAlign: "center", padding: 50, fontSize: 14.5 }}>
                    {search.trim() || isFilterActive ? "Nichts gefunden." : `Noch keine ${catInfo.label} bewertet.`}
                  </div>
                )}
              </div>
            );

            /* Ab 960px: Filter und Sortieren stehen links als feste
               Spalte, dauerhaft sichtbar. Das Blatt von unten entfaellt
               hier — mit der Maus gibt es nichts zu wischen. Angewendet
               wird wie bisher ueber "Anwenden"; die Filterlogik selbst
               ist dieselbe, es ist nur eine zweite Huelle um dieselbe
               Komponente (siehe FilterSheet).

               Das Suchfeld wandert mit in die Spalte, der Symbolknopf
               daneben entfaellt: Er oeffnet das Blatt, und das steht
               hier bereits offen. */
            if (istDesktop) {
              return (
                <Uebergang trigger={unterReiter}>
                <div className="listen-spalten">
                  <aside className="filter-spalte">
                    <div style={{ marginBottom: 12 }}>{suchfeld}</div>
                    <FilterSheet
                      alsSeitenleiste
                      initial={filterState}
                      totalCount={anzeigeListe.length}
                      allInCategory={anzeigeListe}
                      category={category}
                      onApply={(f) => setFilterState(f)}
                    />
                  </aside>
                  <div>
                    {zaehler}
                    {liste}
                  </div>
                </div>
                </Uebergang>
              );
            }

            /* Unterhalb der Schwelle: dieselbe Abfolge wie bisher —
               Suchzeile, Zaehler, Liste, ohne zusaetzliche Huelle. */
            return (
              <Uebergang trigger={unterReiter}>
              <>
                {suchzeile}
                {zaehler}
                {liste}
              </>
              </Uebergang>
            );
          })()}
          </Uebergang>
        </div>
      )}

      {selectedEntry && mode === "list" && activeTab !== "stats" && activeTab !== "minigames" && (
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

      {showFilter && !istDesktop && (
        <FilterSheet
          initial={filterState}
          totalCount={anzeigeListe.length}
          allInCategory={anzeigeListe}
          category={category}
          onApply={(f) => { setFilterState(f); setShowFilter(false); }}
          onClose={() => setShowFilter(false)}
        />
      )}

      {rangOffen && <RangOverlay xp={xpStand.xp} onClose={() => setRangOffen(false)} />}

      {xpHinweis && (
        <XpHinweis key={xpHinweis.id} punkte={xpHinweis.punkte} farbe={rangFuer(xpStand.xp).rang.farbe} />
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
