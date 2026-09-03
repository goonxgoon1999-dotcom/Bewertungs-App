import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, createContext, useContext } from "react";

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

/* Dokus haben eigene Kriterien und eigene Gewichte: Bei einer Doku
   zaehlt zuerst, was man aus ihr mitnimmt — nicht, wie gut gespielt
   wird. Sieben Kriterien, wie bei Film/Serie/Anime.

   Wie bei Anime und Kinderserien wechselt nur die Beschriftung, nicht
   die Datenspalte: gespeichert wird weiterhin in den sieben Feldern
   von Film, Serie und Anime (siehe DOKU_KEYS in api/_db.js). Damit
   braucht auch diese Kategorie keine einzige neue Spalte.

     emotion      -> "Informationsgehalt / Erkenntnisgewinn"
     story        -> "Aufbau & Erzählweise"
     charaktere   -> "Protagonisten & Wirkung"
     inszenierung -> "Inszenierung / Bildsprache"
     unterhaltung -> "Unterhaltung / Spannung"
     schauspiel   -> "Glaubwürdigkeit & Recherche"
     sound        -> "Sound & Sprecher"

   Staffeln gibt es hier bewusst nicht: Auch eine Doku-Serie bekommt
   genau eine Gesamtnote (siehe SEASON_CATEGORIES). */
const DOKU_CRITERIA = [
  { key: "emotion", label: "Informationsgehalt / Erkenntnisgewinn", weight: 0.25, hint: "Was bleibt an Wissen? Neue Einsichten, Tiefe des Themas" },
  { key: "story", label: "Aufbau & Erzählweise", weight: 0.20, hint: "Roter Faden, Dramaturgie, Tempo" },
  { key: "charaktere", label: "Protagonisten & Wirkung", weight: 0.15, hint: "Wer kommt zu Wort? Nähe, Glaubwürdigkeit, Präsenz" },
  { key: "inszenierung", label: "Inszenierung / Bildsprache", weight: 0.15, hint: "Kamera, Schnitt, Archivmaterial, Atmosphäre" },
  { key: "unterhaltung", label: "Unterhaltung / Spannung", weight: 0.10, hint: "Wie fesselnd ist es trotz Sachthema?" },
  { key: "schauspiel", label: "Glaubwürdigkeit & Recherche", weight: 0.10, hint: "Quellen, Einordnung, Ausgewogenheit" },
  { key: "sound", label: "Sound & Sprecher", weight: 0.05, hint: "Musik, Geräuschkulisse, Kommentarstimme" },
];

/* Sitcoms/Comedy haben eigene Kriterien und eigene Gewichte: Bei einer
   Comedy zaehlt zuerst, ob sie zum Lachen bringt — nicht, wie tief die
   Handlung reicht. Sieben Kriterien, wie bei Film/Serie/Anime.

   Wie bei Anime, Kinderserien und Dokus wechselt nur die Beschriftung,
   nicht die Datenspalte: gespeichert wird weiterhin in den sieben
   Feldern von Film, Serie und Anime (siehe COMEDY_KEYS in api/_db.js).
   Damit braucht auch diese Kategorie keine einzige neue Spalte.

     unterhaltung -> "Humor / Gag-Dichte"
     charaktere   -> "Charaktere & Ensemble"
     inszenierung -> "Dialoge & Timing"
     emotion      -> "Wiederschauwert"
     story        -> "Story / roter Faden"
     schauspiel   -> "Schauspiel"
     sound        -> "Musik & Sound"

   Ein gemeinsamer Reiter fuer Comedy-Serien und Comedy-Filme. Staffeln
   gibt es hier bewusst nicht: Auch eine Sitcom bekommt genau eine
   Gesamtnote (siehe SEASON_CATEGORIES). */
const COMEDY_CRITERIA = [
  { key: "unterhaltung", label: "Humor / Gag-Dichte", weight: 0.25, hint: "Wie oft und wie gut wird gelacht? Tempo der Pointen" },
  { key: "charaktere", label: "Charaktere & Ensemble", weight: 0.20, hint: "Figuren, Eigenheiten, Zusammenspiel der Truppe" },
  { key: "inszenierung", label: "Dialoge & Timing", weight: 0.15, hint: "Wortwitz, Schlagfertigkeit, Rhythmus der Szenen" },
  { key: "emotion", label: "Wiederschauwert", weight: 0.15, hint: "Läuft es nebenbei immer wieder? Zitierbarkeit" },
  { key: "story", label: "Story / roter Faden", weight: 0.10, hint: "Handlung und Aufbau über die Folgen hinweg" },
  { key: "schauspiel", label: "Schauspiel", weight: 0.10, hint: "Leistungen, Chemie, Performance" },
  { key: "sound", label: "Musik & Sound", weight: 0.05, hint: "Titellied, Musik, Geräuschkulisse" },
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
  doku: DOKU_CRITERIA,
  comedy: COMEDY_CRITERIA,
  game: GAME_CRITERIA,
};

/** Die Kriterien einer Kategorie — nie global, immer über diese Funktion. */
function criteriaFor(category) {
  return CRITERIA_BY_CATEGORY[category] || AV_CRITERIA;
}

/* Die Reihenfolge hier bestimmt die Reihenfolge ueberall: Tab-Leiste,
   Statistik, Export. Kinderserien und Adult Animation stehen bei den
   uebrigen Serienarten, Dokus und Sitcoms/Comedy dahinter, Spiele
   bleiben am Ende.

   Dokus sind ein gemeinsamer Reiter fuer Einzeldokus und Doku-Serien
   — beides bekommt genau eine Gesamtnote. Genauso Sitcoms/Comedy: ein
   Reiter fuer Comedy-Serien und Comedy-Filme, immer eine Gesamtnote. */
const CATEGORIES = [
  { key: "movie", label: "Filme", singular: "Film" },
  { key: "series", label: "Serien", singular: "Serie" },
  { key: "anime", label: "Anime", singular: "Anime" },
  { key: "kids", label: "Kinderserien", singular: "Kinderserie" },
  { key: "adultanim", label: "Adult Animation", singular: "Adult Animation" },
  { key: "doku", label: "Dokus", singular: "Doku" },
  { key: "comedy", label: "Sitcoms/Comedy", singular: "Sitcom/Comedy" },
  { key: "game", label: "Spiele", singular: "Spiel" },
];

const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/* ============================================================
   KATEGORIE-ANSICHT — welche Kategorien dieses Geraet zeigt
   und in welcher Reihenfolge

   Eine reine Anzeige-Einstellung, je Geraet im localStorage. Sie
   liegt bewusst NICHT in der Datenbank: Sie sagt nichts ueber die
   Sammlung aus, sondern darueber, was auf diesem Bildschirm zu sehen
   sein soll. Am Datenmodell und am CHECK auf `category` aendert sie
   entsprechend nichts.

   NICHT VERHANDELBARE REGELN — beim Aendern bitte lesen:

   1. Ausblenden loescht nichts. Ein ausgeblendeter Reiter nimmt seine
      Eintraege mit aus der Anzeige und bringt sie beim Wiedereinschalten
      unveraendert zurueck.
   2. Mindestens eine Kategorie bleibt sichtbar. Waeren alle versteckt,
      gilt die Vorgabe — sonst stuende die App vor einem leeren Reiter.
   3. Gespeichert wird, was VERSTECKT ist, nicht was sichtbar ist.
      Kommt spaeter eine Kategorie im Code dazu, ist sie damit von
      selbst sichtbar, auch wenn schon eine aeltere Auswahl gespeichert
      ist. Die gespeicherte Liste ist nie abschliessend.
   4. Unbekannte Namen im Speicher werden still verworfen, ein
      kaputter Eintrag faellt still auf die Vorgabe zurueck. Ein Fehler
      an dieser Stelle darf die App nicht aufhalten.
   5. Zwei Stellen halten sich ausdruecklich NICHT daran, und das ist
      so gewollt:
        - die XP-Berechnung (xpAusBestand) zaehlt weiter alle
          bewerteten Eintraege — gesehen ist gesehen;
        - Export und Backup enthalten weiter alles — sie sind die
          Sicherung, da darf nichts fehlen.
   ============================================================ */
const KATEGORIE_ANSICHT_SCHLUESSEL = "bewertungsapp.kategorieAnsicht";

/**
 * Ein gespeicherter Stand -> eine brauchbare Ansicht.
 *
 * Zurueck kommt immer `{ reihenfolge, versteckt }` mit genau den
 * Kategorien, die es im Code gibt: die gespeicherte Reihenfolge
 * zuerst, alles Uebrige (neu dazugekommene Kategorien) in der
 * Code-Reihenfolge dahinter.
 */
function normalisiereKategorieAnsicht(roh) {
  const bekannt = new Set(CATEGORY_KEYS);
  const reihenfolge = [];

  const gespeichert = Array.isArray(roh && roh.reihenfolge) ? roh.reihenfolge : [];
  for (const key of gespeichert) {
    if (bekannt.has(key) && !reihenfolge.includes(key)) reihenfolge.push(key);
  }
  /* Was der Speicher nicht kennt, haengt hinten an — genau das macht
     eine neue Kategorie von selbst sichtbar (Regel 3). */
  for (const key of CATEGORY_KEYS) {
    if (!reihenfolge.includes(key)) reihenfolge.push(key);
  }

  const gemerkt = Array.isArray(roh && roh.versteckt) ? roh.versteckt : [];
  const versteckt = reihenfolge.filter((key) => gemerkt.includes(key));

  // Regel 2: waere nichts mehr uebrig, gilt die Vorgabe.
  return { reihenfolge, versteckt: versteckt.length < reihenfolge.length ? versteckt : [] };
}

/** Die Vorgabe: alle Kategorien sichtbar, in der Code-Reihenfolge. */
function standardKategorieAnsicht() {
  return normalisiereKategorieAnsicht(null);
}

function ladeKategorieAnsicht() {
  try {
    const roh = window.localStorage.getItem(KATEGORIE_ANSICHT_SCHLUESSEL);
    return normalisiereKategorieAnsicht(roh ? JSON.parse(roh) : null);
  } catch (e) {
    // Kein localStorage, kaputter Eintrag: still zurueck zur Vorgabe.
    return standardKategorieAnsicht();
  }
}

function speichereKategorieAnsicht(ansicht) {
  try {
    window.localStorage.setItem(
      KATEGORIE_ANSICHT_SCHLUESSEL,
      JSON.stringify(normalisiereKategorieAnsicht(ansicht))
    );
  } catch (e) {
    // Ohne localStorage gilt die Einstellung nur fuer diesen Besuch.
  }
}

/** Alle Kategorien in der eingestellten Reihenfolge — auch die versteckten. */
function geordneteKategorien(ansicht) {
  const rein = normalisiereKategorieAnsicht(ansicht);
  return rein.reihenfolge.map((key) => CATEGORIES.find((c) => c.key === key));
}

/**
 * Die eine zentrale Stelle: welche Kategorien angezeigt werden, in
 * welcher Reihenfolge. Alles, was Kategorien auflistet, fragt hier.
 */
function sichtbareKategorien(ansicht) {
  const rein = normalisiereKategorieAnsicht(ansicht);
  const versteckt = new Set(rein.versteckt);
  return rein.reihenfolge
    .filter((key) => !versteckt.has(key))
    .map((key) => CATEGORIES.find((c) => c.key === key));
}

function istVersteckt(ansicht, key) {
  return normalisiereKategorieAnsicht(ansicht).versteckt.includes(key);
}

/** Eine Kategorie ein- oder ausschalten. Die letzte sichtbare bleibt. */
function schalteKategorie(ansicht, key) {
  const rein = normalisiereKategorieAnsicht(ansicht);
  if (!rein.reihenfolge.includes(key)) return rein;
  const versteckt = new Set(rein.versteckt);
  if (versteckt.has(key)) versteckt.delete(key);
  else if (rein.reihenfolge.length - versteckt.size > 1) versteckt.add(key);
  else return rein; // Regel 2: die letzte sichtbare laesst sich nicht abwaehlen.
  return normalisiereKategorieAnsicht({ reihenfolge: rein.reihenfolge, versteckt: [...versteckt] });
}

/**
 * Eine Kategorie um einen Platz verschieben. `richtung` ist -1 (nach
 * oben) oder 1 (nach unten); am Rand passiert nichts.
 */
function verschiebeKategorie(ansicht, key, richtung) {
  const rein = normalisiereKategorieAnsicht(ansicht);
  const von = rein.reihenfolge.indexOf(key);
  const nach = von + richtung;
  if (von < 0 || nach < 0 || nach >= rein.reihenfolge.length) return rein;
  const reihenfolge = [...rein.reihenfolge];
  reihenfolge[von] = reihenfolge[nach];
  reihenfolge[nach] = key;
  return normalisiereKategorieAnsicht({ reihenfolge, versteckt: rein.versteckt });
}

/* Die Ansicht steht allen Bausteinen zur Verfuegung, ohne sie durch
   jede Ebene durchzureichen. `sichtbar` ist die fertige Liste — wer
   Kategorien auflistet, nimmt useKategorien(). */
const KategorieAnsichtContext = createContext(null);

/** Die sichtbaren Kategorien, in der eingestellten Reihenfolge. */
function useKategorien() {
  const ctx = useContext(KategorieAnsichtContext);
  return ctx ? ctx.sichtbar : CATEGORIES;
}

/* Akzentfarbe je Kategorie. Sie faerbt nur Bedienelemente —
   Notenfarben (scoreToColor) bleiben davon unberuehrt, weil sie die
   Hoehe der Bewertung codieren und nicht die Kategorie. */
const CATEGORY_COLORS = {
  movie: "#C9A227",
  series: "#3E9C8F",
  anime: "#8B6BC9",
  kids: "#C4568C",
  adultanim: "#4A7FC1",
  doku: "#6B9C4F",
  comedy: "#B5C22E",
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

   Dokus und Sitcoms/Comedy stehen bewusst NICHT in der Liste: Auch
   eine Doku-Serie und auch eine Sitcom bekommen genau eine Gesamtnote,
   die Staffel-Funktion wird dort also gar nicht erst angeboten.
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
 * Der Klammerteil der Endnote — ohne Duell-Zuschlag: mit Staffeln das
 * gewichtete Mittel der Staffelnoten, sonst 75 % Kriterien und 25 %
 * Bauchgefuehl. `null` bedeutet unbewertet (Gewichtssumme 0).
 */
function entryBasisScore(entry, category) {
  if (!hasSeasons(entry)) return computeFinalScore(entry.values, entry.personal, category);
  return gewichtetesMittel(entry, (sn) => seasonScore(sn, category));
}

/**
 * DIE Endnote eines Eintrags — die einzige Stelle, an der sie
 * entsteht. Rangliste, Top 10, Medaillen, Statistik und Export
 * hoeren alle hier: Duell-Ergebnisse gelten dadurch ueberall, ohne
 * dass irgendwo eine Sonderbehandlung noetig waere.
 *
 *   Endnote = Klammerteil + Duell-Zuschlag
 *
 * Ohne gespieltes Duell steht die Elo auf ELO_START, der Zuschlag ist
 * dann exakt 0 und heraus kommt Ziffer fuer Ziffer dieselbe Zahl wie
 * vor der Duell-Wertung.
 *
 * Der Rueckgabewert ist NICHT auf 0–10 begrenzt. Sortiert wird mit
 * ihm, damit zwei Eintraege, die beide bei 10,00 anstossen,
 * unterscheidbar bleiben; fuer die Anzeige begrenzt `anzeigeNote`.
 */
function entryScore(entry, category) {
  const basis = entryBasisScore(entry, category);
  if (typeof basis !== "number") return null;
  return Math.round((basis + entryZuschlag(entry)) * 100) / 100;
}

/* Die Endnote, wie sie dasteht: begrenzt auf 0 bis 10. Ohne Duelle
   liegt jede Endnote ohnehin in diesem Bereich — die Begrenzung
   greift erst, wenn ein Zuschlag ueber die 10 hinausschiebt. */
function anzeigeNote(score) {
  if (typeof score !== "number") return score;
  return Math.min(10, Math.max(0, score));
}

/**
 * Liegt eine Endnote im eingestellten Bereich des Notenfilters?
 *
 * Verglichen wird mit der angezeigten, auf 0–10 begrenzten Note.
 * Sonst fiele ein Eintrag, den ein Duell-Zuschlag ueber die 10
 * schiebt, schon beim voreingestellten Bereich heraus.
 *
 * Die Funktion steht hier, damit die Vorschau im Filterblatt ("N
 * Einträge") und die Liste danach dieselbe Frage stellen. Standen die
 * beiden Vergleiche getrennt, konnte die Vorschau eine andere Zahl
 * nennen als die Liste dann zeigte.
 */
function imNotenbereich(score, min, max) {
  if (typeof score !== "number") return false;
  const gezeigt = anzeigeNote(score);
  return gezeigt >= min && gezeigt <= max;
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

   Ein Duell aendert weder das Bauchgefuehl noch einen Kriterienwert.
   Es verschiebt allein die Elo-Zahl der beiden Beteiligten; daraus
   entsteht ein gedeckelter Zuschlag auf die Endnote:

     Endnote = (0,75 x Kriteriennote + 0,25 x Bauchgefuehl) + Zuschlag

   Der Klammerteil bleibt unangetastet — er aendert sich nur noch
   ueber das Bewertungsformular. Gerechnet wird die Elo-Verschiebung
   auf dem Server (api/duels.js), damit Lesen und Schreiben in einer
   Transaktion liegen; hier steht, was daraus fuer die Endnote folgt.
   ============================================================ */

/* Startwert jedes Eintrags. Genau hier ist der Zuschlag exakt 0 —
   ohne gespieltes Duell rechnet die App also wie vorher. Muss zu
   ELO_START in api/_db.js passen. */
const ELO_START = 1000;

/* Groesse des Zuschlags und die Skala, ueber die er sich aufbaut.
   Der tanh laeuft von -1 bis 1 und erreicht die Grenzen nie: der
   Zuschlag liegt damit mathematisch immer echt zwischen -0,25 und
   +0,25, egal wie lang eine Siegesserie wird. Ein Hochschaukeln auf
   einen unrealistischen Wert ist strukturell ausgeschlossen, nicht
   nur unwahrscheinlich. Bei 100 Punkten Elo-Vorsprung steht der
   Zuschlag bei rund +0,19, bei 200 bei rund +0,24.

   Beide Zahlen sind gegenueber der ersten Fassung halbiert (vorher
   0,5 und 200). Das ist Absicht und haelt die Steigung im Nullpunkt
   unveraendert bei 0,0025 je Elo-Punkt: Der erste Sieg bringt
   weiterhin rund +0,04, drei Siege rund +0,10. Am fruehen Verhalten
   aendert sich also praktisch nichts — nur die Saettigung setzt
   doppelt so frueh ein. An der Spitze der Rangliste liegen die Noten
   nur wenige Hundertstel auseinander; mit einem Deckel von 0,5 haette
   dort die Duellbilanz die Reihenfolge bestimmt und nicht mehr die
   Bewertung. */
const ZUSCHLAG_MAX = 0.25;
const ZUSCHLAG_SKALA = 100;

/** Elo-Zahl eines Eintrags. Ohne Angabe gilt der Startwert. */
function entryElo(entry) {
  const wert = entry ? entry.elo : undefined;
  return typeof wert === "number" && Number.isFinite(wert) ? wert : ELO_START;
}

/** Gespielte Duelle eines Eintrags. Ohne Angabe: noch keines. */
function entryDuels(entry) {
  const wert = entry ? entry.duels : undefined;
  return typeof wert === "number" && Number.isFinite(wert) && wert > 0 ? Math.round(wert) : 0;
}

/**
 * Gewonnene Duelle eines Eintrags. Ohne Angabe: noch keines.
 *
 * Die Niederlagen stehen nirgends — sie sind `duels - siege`. Mehr
 * Siege als Duelle kann es nicht geben; sollte eine krumme Angabe
 * doch einmal mehr behaupten, wird sie hier gekappt, damit die
 * Niederlagen nicht negativ werden.
 */
function entrySiege(entry) {
  const wert = entry ? entry.siege : undefined;
  const roh = typeof wert === "number" && Number.isFinite(wert) && wert > 0 ? Math.round(wert) : 0;
  return Math.min(roh, entryDuels(entry));
}

/**
 * Der Zuschlag zu einer Elo-Zahl.
 *
 * Gespeichert wird er nirgends — er entsteht immer wieder aus `elo`.
 * Es gibt damit genau eine Quelle der Wahrheit, und ein
 * zurueckgesetzter Eintrag ist sofort wieder bei 0.
 */
function duellZuschlag(elo) {
  return ZUSCHLAG_MAX * Math.tanh((elo - ELO_START) / ZUSCHLAG_SKALA);
}

/** Der Zuschlag eines Eintrags. Bei ELO_START exakt 0. */
function entryZuschlag(entry) {
  return duellZuschlag(entryElo(entry));
}

/* Der Zuschlag, wie er dasteht: zwei Nachkommastellen und immer mit
   Vorzeichen. Ohne das "+" waere ein Zuschlag von 0,12 nicht als
   Aufschlag zu erkennen. */
function zuschlagText(wert) {
  const gerundet = Math.round(wert * 100) / 100;
  // Math.abs haelt "-0.00" heraus: das Minus stuende sonst bei einem
  // Wert, der auf zwei Stellen genau null ist.
  return (gerundet >= 0 ? "+" : "−") + Math.abs(gerundet).toFixed(2);
}

/* ----------------------------------------------------------------
   Auffaellige Bewertungen

   Schneidet ein Titel im Duell dauerhaft anders ab, als seine
   Kriterien hergeben, passt womoeglich die Bewertung selbst nicht
   mehr. Genau das sagt ein grosser Zuschlag: er ist der Abstand
   zwischen dem, was die Kriterien ergeben, und dem, was die Duelle
   zeigen.

   Auffaellig ist ein Titel nur, wenn ALLE DREI Bedingungen
   zutreffen — ein grosser Zuschlag aus einem einzigen Duell waere
   Zufall und kein Hinweis.

   Die dritte Bedingung, gemischte Ergebnisse, ist der spaetere
   Zusatz: Ein Titel an der Spitze gewinnt jedes Duell und sammelt
   Zuschlag, ohne dass daran etwas widersprueglich waere — er hat
   schlicht niemanden mehr ueber sich, gegen den er verlieren
   koennte. Bei ihm sagt die Markierung nichts aus. Aussagekraeftig
   ist sie erst bei einem Titel, der teils gewinnt und teils verliert
   und trotzdem stark von seiner Note abweicht.

   Alle drei Zahlen stehen hier an einer Stelle und sonst nirgends,
   damit sich die Schwelle spaeter mit einem Griff verschieben laesst.
   Die Duell-Wertung selbst fassen sie nicht an: es ist eine
   Kennzeichnung, keine Rechnung.
   ---------------------------------------------------------------- */

/* Ab diesem Betrag gilt der Zuschlag als deutlich. Die Schwelle
   orientiert sich am Deckel des Zuschlags: bei ZUSCHLAG_MAX = 0,25
   waeren die frueheren 0,20 praktisch das Maximum und damit kaum je
   erreichbar. */
const AUFFAELLIG_ZUSCHLAG = 0.15;

/* So viele Duelle muessen dahinterstehen. */
const AUFFAELLIG_DUELLE = 3;

/* So viele Siege UND so viele Niederlagen muessen darunter sein —
   erst dann ist das Ergebnis gemischt. */
const AUFFAELLIG_GEMISCHT = 1;

/**
 * Ob Zuschlag, Duellzahl und Duellbilanz die Schwelle erreichen.
 *
 * Gemessen wird am Betrag: nach oben wie nach unten gleichwertig.
 * Verglichen wird der Zuschlag so, wie er auch dasteht — auf zwei
 * Nachkommastellen gerundet (siehe zuschlagText). Sonst stuende in
 * der Detailansicht "+0,15" ohne Hinweis daneben, weil der ungerundete
 * Wert knapp darunter liegt.
 *
 * Die Niederlagen stehen nirgends gespeichert; sie ergeben sich als
 * `duelle - siege`.
 */
function auffaelligeBewertung(zuschlag, duelle, siege) {
  if (typeof zuschlag !== "number" || !Number.isFinite(zuschlag)) return false;
  if (typeof duelle !== "number" || !Number.isFinite(duelle)) return false;
  if (typeof siege !== "number" || !Number.isFinite(siege)) return false;
  const betrag = Math.round(Math.abs(zuschlag) * 100) / 100;
  const niederlagen = duelle - siege;
  return (
    duelle >= AUFFAELLIG_DUELLE &&
    betrag >= AUFFAELLIG_ZUSCHLAG &&
    siege >= AUFFAELLIG_GEMISCHT &&
    niederlagen >= AUFFAELLIG_GEMISCHT
  );
}

/** Dasselbe fuer einen Eintrag. */
function entryAuffaellig(entry) {
  return auffaelligeBewertung(entryZuschlag(entry), entryDuels(entry), entrySiege(entry));
}

/* Was in der Detailansicht unter der Zuschlag-Zeile steht — die
   Richtung entscheidet, in welche der beiden Formulierungen. */
function auffaelligText(zuschlag) {
  return zuschlag >= 0
    ? "Du stellst diesen Titel im Duell regelmäßig höher, als seine Kriterien " +
      "hergeben. Vielleicht passt die Bewertung nicht mehr."
    : "Du stellst diesen Titel im Duell regelmäßig niedriger, als seine Kriterien " +
      "hergeben. Vielleicht passt die Bewertung nicht mehr.";
}

/* ----------------------------------------------------------------
   Den Zuschlag verrechnen

   Der Duell-Zuschlag steht als dritter Wert neben Kriterien und
   Bauchgefuehl. Wer genug Duelle hinter sich hat, kann ihn in die
   eigenen Bewertungsfelder holen: die Endnote bleibt dabei gleich,
   sie besteht danach aber wieder allein aus Kriterien und
   Bauchgefuehl — und der Zuschlag ist weg.

   Von selbst passiert das nie. Wer den Knopf nicht drueckt, behaelt
   Ziffer fuer Ziffer das bisherige Verhalten.

   Die Umkehrrechnung. Es gilt

     Endnote = 0,75 x Kriterien-Note + 0,25 x Bauchgefuehl + Zuschlag

   Denselben Endwert ohne Zuschlag ergibt also, wenn

     - das Bauchgefuehl um Zuschlag / 0,25 steigt (das Vierfache des
       Zuschlags), oder
     - JEDES Kriterium um Zuschlag / 0,75 steigt. Die
       Kriteriengewichte ergeben in Summe 1, deshalb hebt das die
       Kriterien-Note um genau diesen Betrag.

   Beide Wege sind mathematisch gleichwertig; sie unterscheiden sich
   nur darin, wo der Punkt landet. Aufgeteilt wird nie — das waere
   nicht mehr nachvollziehbar.
   ---------------------------------------------------------------- */

/* Ab so vielen gespielten Duellen wird das Verrechnen ueberhaupt
   angeboten. Darunter steht zu wenig hinter dem Zuschlag, um ihn in
   die Bewertung selbst zu schreiben. */
const VERRECHNEN_MIN_DUELLE = 10;

/* Und erst ab diesem Betrag. Darunter lohnt es nicht: 0,04 gehen in
   der Schrittweite der Bewertungsfelder ohnehin unter. */
const VERRECHNEN_MIN_BETRAG = 0.05;

/* Die Schrittweite der Bewertungsfelder und ihre Grenzen — dieselben,
   mit denen die Schieber im Bewertungsformular laufen (siehe
   Slider). Ein verrechneter Wert muss genau auf einer dieser Stufen
   landen, sonst liesse er sich dort nicht wieder einstellen. */
const BEWERTUNG_SCHRITT = 0.1;
const BEWERTUNG_MIN = 0;
const BEWERTUNG_MAX = 10;

/* Die beiden Gewichte der Endnoten-Formel, durch die die
   Umkehrrechnung oben teilt. Sie stehen hier ein zweites Mal, weil
   computeFinalScore unangetastet bleibt; die Tests rechnen die
   Endnote ueber entryScore nach und schlagen an, sollten die beiden
   Stellen je auseinanderlaufen. */
const VERRECHNEN_ANTEIL_BAUCH = 0.25;
const VERRECHNEN_ANTEIL_KRITERIEN = 0.75;

/* Spielraum fuer Gleitkomma-Reste beim Vergleich mit 0 und 10. Ohne
   ihn faellt ein Wert, der rechnerisch genau auf 10 landet, gelegentlich
   als "geht nicht" heraus. */
const VERRECHNEN_TOLERANZ = 1e-9;

/** Ein Wert auf die naechste gueltige Stufe der Bewertungsfelder. */
function aufBewertungsSchritt(wert) {
  const stufen = Math.round(wert / BEWERTUNG_SCHRITT);
  /* Die zweite Rundung haelt Rechenungenauigkeiten heraus: 83 x 0,1
     ist in Gleitkomma nicht exakt 8,3. */
  return Math.round(stufen * BEWERTUNG_SCHRITT * 1000) / 1000;
}

/**
 * Ob das Verrechnen angeboten wird: genug gespielte Duelle UND ein
 * Zuschlag, der den Aufwand wert ist.
 *
 * Verglichen wird der Betrag so, wie er auch dasteht — auf zwei
 * Nachkommastellen gerundet (siehe zuschlagText). Sonst stuende in
 * der Detailansicht "+0,05" ohne Knopf daneben, weil der ungerundete
 * Wert knapp darunter liegt.
 */
function verrechnenAngeboten(entry) {
  if (entryDuels(entry) < VERRECHNEN_MIN_DUELLE) return false;
  const betrag = Math.round(Math.abs(entryZuschlag(entry)) * 100) / 100;
  return betrag >= VERRECHNEN_MIN_BETRAG;
}

/** Eine Zahl, wie sie im Dialog steht: zwei Nachkommastellen, Komma. */
function notenText(wert) {
  return (Math.round(wert * 100) / 100).toFixed(2).replace(".", ",");
}

/** Eine Grenze oder Schrittweite, wie sie dasteht — „10,0", „0,1". */
function stufenText(wert) {
  return wert.toFixed(1).replace(".", ",");
}

/** Dasselbe mit Vorzeichen — „+0,33". */
function betragText(wert) {
  const gerundet = Math.round(wert * 100) / 100;
  // Math.abs haelt "−0,00" heraus, genau wie in zuschlagText.
  return (gerundet >= 0 ? "+" : "−") + notenText(Math.abs(gerundet));
}

/** Die Beschriftung eines Weges. */
function verrechnungsWegLabel(weg) {
  return weg === "bauch" ? "Ins Bauchgefühl" : "Gleichmäßig in die Kriterien";
}

/**
 * Einer der beiden Wege, durchgerechnet — mit allem, was der Dialog
 * VOR dem Schreiben zeigen muss.
 *
 * Zurueck kommt immer ein Objekt; `moeglich` sagt, ob der Weg
 * gangbar ist, und `grund` warum nicht. Gekappt wird nie: ein
 * Bauchgefuehl von 9,5 mit Zuschlag +0,25 braeuchte 10,5 — daraus
 * stillschweigend 10,0 zu machen ergaebe eine andere Endnote als
 * versprochen.
 *
 * `entwurf` enthaelt die neuen Bewertungsfelder (values, personal,
 * seasons) und sonst nichts; gespeichert wird damit wie bei einer
 * normalen Bewertungsaenderung.
 */
function verrechnungsWeg(entry, category, weg) {
  const zuschlag = entryZuschlag(entry);
  const noteVorher = entryScore(entry, category);
  const anteil = weg === "bauch" ? VERRECHNEN_ANTEIL_BAUCH : VERRECHNEN_ANTEIL_KRITERIEN;
  const proFeld = zuschlag / anteil;
  const kriterien = criteriaFor(category);

  /* Die betroffenen Felder: ohne Staffeln das Bauchgefuehl bzw. jedes
     Kriterium des Eintrags, mit Staffeln dasselbe in JEDER Staffel.
     Das gewichtete Mittel ueber die Staffeln steigt genau dann um den
     gesuchten Betrag, wenn jede einzelne Staffel um ihn steigt. */
  const quellen = hasSeasons(entry) ? entry.seasons : [entry];
  const werte = [];
  for (const quelle of quellen) {
    if (weg === "bauch") {
      werte.push(typeof quelle.personal === "number" ? quelle.personal : null);
    } else {
      for (const c of kriterien) {
        const v = quelle.values ? quelle.values[c.key] : undefined;
        werte.push(typeof v === "number" ? v : null);
      }
    }
  }

  const feldName = weg === "bauch" ? "Bauchgefühl" : "Ein Kriterium";
  const offen = (grund) => ({
    weg, moeglich: false, grund, proFeld,
    beschreibung: "", noteVorher, noteNachher: null, abweichung: null, entwurf: null,
  });

  if (!werte.length || werte.some((w) => w === null)) {
    return offen("Dafür fehlen bewertete Felder.");
  }
  /* Bauchgefuehl und Kriterien sind auf 0 bis 10 begrenzt. Was
     darueber hinausmuesste, geht nicht. */
  if (werte.some((w) => w + proFeld > BEWERTUNG_MAX + VERRECHNEN_TOLERANZ)) {
    return offen(feldName + " kann höchstens " + stufenText(BEWERTUNG_MAX) + " sein.");
  }
  if (werte.some((w) => w + proFeld < BEWERTUNG_MIN - VERRECHNEN_TOLERANZ)) {
    return offen(feldName + " kann nicht unter " + stufenText(BEWERTUNG_MIN) + " liegen.");
  }

  const neuerWert = (w) => aufBewertungsSchritt(w + proFeld);
  const neueQuelle = (q) => {
    if (weg === "bauch") return { ...q, personal: neuerWert(q.personal) };
    // Nur die Kriterien dieser Kategorie werden angefasst; was sonst
    // in `values` steht, bleibt unberuehrt stehen.
    const neueWerte = { ...(q.values || {}) };
    for (const c of kriterien) neueWerte[c.key] = neuerWert(neueWerte[c.key]);
    return { ...q, values: neueWerte };
  };

  let entwurf;
  if (hasSeasons(entry)) {
    const seasons = entry.seasons.map(neueQuelle);
    const mitStaffeln = { ...entry, seasons };
    /* Mit Staffeln bekommt der Eintrag die Mittelwerte seiner Staffeln
       als eigene Werte — genau wie beim Speichern im
       Bewertungsformular (siehe RatingForm.handleSave). */
    const obenWerte = {};
    for (const c of kriterien) obenWerte[c.key] = entryCriterionValue(mitStaffeln, c.key);
    entwurf = { values: obenWerte, personal: entryPersonal(mitStaffeln), seasons };
  } else {
    const neu = neueQuelle(entry);
    entwurf = { values: neu.values, personal: neu.personal, seasons: [] };
  }

  /* Was danach wirklich dastuende — ueber dieselbe Rechnung wie
     ueberall sonst, mit der Elo zurueck auf dem Startwert und damit
     einem Zuschlag von 0. Die Abweichung stammt allein aus der
     Schrittweite der Bewertungsfelder und wird im Dialog genannt. */
  const danach = { ...entry, ...entwurf, elo: ELO_START };
  const noteNachher = entryScore(danach, category);
  const abweichung = Math.round((noteNachher - noteVorher) * 100) / 100;

  const mehrfach = quellen.length > 1;
  const beschreibung =
    weg === "bauch"
      ? mehrfach
        ? "Bauchgefühl jeder Staffel " + betragText(proFeld)
        : "Bauchgefühl " + notenText(entry.personal) + " → " + notenText(entwurf.personal)
      : (mehrfach ? "jedes Kriterium jeder Staffel " : "jedes Kriterium ") + betragText(proFeld);

  return { weg, moeglich: true, grund: "", proFeld, beschreibung, noteVorher, noteNachher, abweichung, entwurf };
}

/** Beide Wege in der Reihenfolge, in der sie im Dialog stehen. */
function verrechnungsWege(entry, category) {
  return [verrechnungsWeg(entry, category, "bauch"), verrechnungsWeg(entry, category, "kriterien")];
}

/* Der Hinweis ueber dem Bewertungsformular, wenn es aus dem Dialog
   heraus zum eigenen Verteilen geoeffnet wurde. Mehr passiert dort
   nicht: der Aufbau des Formulars bleibt, wie er ist, und geaendert
   wird allein, was der Nutzer selbst aendert. */
function verrechnenHinweisText(entry, category) {
  return (
    "Duell-Zuschlag " + zuschlagText(entryZuschlag(entry)) + " selbst verteilen: " +
    "Ändere die Felder so, dass die Endnote bei " + notenText(entryScore(entry, category)) +
    " landet. Der Zuschlag bleibt bestehen, bis du ihn in der Detailansicht zurücksetzt."
  );
}

/* ----------------------------------------------------------------
   Alle Duell-Zuschlaege auf einmal verrechnen (Sammelfunktion)

   Dieselbe Idee wie der Knopf in der Detailansicht, nur ueber die
   ganze Sammlung: Betroffen ist jeder Eintrag, dem das Verrechnen
   auch einzeln angeboten wuerde (siehe verrechnenAngeboten — ab 10
   Duellen und ab Betrag 0,05). Der Zuschlag geht dabei immer
   gleichmaessig in die Kriterien, je Kriterium um Zuschlag / 0,75;
   der Weg ins Bauchgefuehl steht hier nicht zur Wahl, weil bei einer
   Sammelaktion niemand Eintrag fuer Eintrag entscheiden kann.

   Zwei Dinge unterscheiden die Sammelfunktion vom Einzelweg, und
   beide haben denselben Grund — bei einem Stapel sieht niemand jede
   einzelne Zahl nach:

   1. Sie rechnet auf dem Hundertstel, nicht auf der 0,1-Stufe des
      Schiebers. Eine halbe Schieberstufe je Kriterium schlaegt mit
      bis zu 0,04 auf die Endnote durch (siehe README); zugesagt ist
      hier aber, dass sich keine Endnote um mehr als
      SAMMEL_MAX_ABWEICHUNG aendert. Ein Hundertstel je Kriterium
      bringt das auf ein Rundungsrest-Mass herunter. Angezeigt werden
      Kriterien ohnehin mit einer Nachkommastelle (siehe
      DetailView) — und krumme Werte stehen dort mit Staffeln schon
      lange, weil deren Mittel ebenfalls nicht auf der Stufe liegt.
   2. Sie prueft die Zusage einzeln nach, statt sie zu behaupten:
      Was die Grenzen 0 bis 10 sprengen wuerde ODER wo die Endnote
      trotz allem um mehr als SAMMEL_MAX_ABWEICHUNG wandern wuerde,
      wird uebersprungen und namentlich genannt. Gekappt wird nichts,
      und still uebergangen auch nichts.

   Geschrieben wird erst nach ausdruecklicher Bestaetigung: Die
   Vorschau (sammelVerrechnungsPlan) rechnet nur, sie fasst keinen
   Eintrag an.
   ---------------------------------------------------------------- */

/* Die Schrittweite, auf der die Sammelfunktion die neuen
   Kriterienwerte ablegt. */
const SAMMEL_SCHRITT = 0.01;

/* So weit darf die Endnote eines verrechneten Eintrags hoechstens
   wandern. Mehr als Rundung soll die Sammelaktion nicht bewirken. */
const SAMMEL_MAX_ABWEICHUNG = 0.01;

/** Ein Wert auf das Hundertstel — die Stufe der Sammelfunktion.

    Gerundet wird ueber den Kehrwert der Stufe statt ueber eine
    Division durch sie: 0,01 ist in Gleitkomma nicht exakt, und ein
    Wert wie 8,27 kaeme sonst als 8,270000000000001 heraus. */
function aufSammelSchritt(wert) {
  const proStufe = Math.round(1 / SAMMEL_SCHRITT);
  return Math.round(wert * proStufe) / proStufe;
}

/**
 * Ein Eintrag der Sammelaktion, durchgerechnet.
 *
 * Aufbau wie verrechnungsWeg: zurueck kommt immer ein Objekt,
 * `moeglich` sagt, ob der Eintrag verrechnet wird, und `grund`
 * warum nicht. Angefasst wird hier nichts — `entwurf` ist ein
 * Vorschlag, mehr nicht.
 */
function sammelVerrechnung(entry, category) {
  const zuschlag = entryZuschlag(entry);
  const noteVorher = entryScore(entry, category);
  /* Der Betrag je Kriterium, auf dem Hundertstel: Die
     Kriteriengewichte ergeben in Summe 1, deshalb hebt er die
     Kriterien-Note um genau diesen Betrag. */
  const proFeld = aufSammelSchritt(zuschlag / VERRECHNEN_ANTEIL_KRITERIEN);
  const kriterien = criteriaFor(category);

  /* Ohne Staffeln die Kriterien des Eintrags, mit Staffeln dieselben
     in JEDER Staffel — genau wie beim Einzelweg. */
  const quellen = hasSeasons(entry) ? entry.seasons : [entry];
  const werte = [];
  for (const quelle of quellen) {
    for (const c of kriterien) {
      const v = quelle.values ? quelle.values[c.key] : undefined;
      werte.push(typeof v === "number" ? v : null);
    }
  }

  const grundlage = {
    id: entry.id, category, titel: entry.title || "", zuschlag, proFeld,
    duels: entryDuels(entry), noteVorher,
  };
  const offen = (grund) => ({
    ...grundlage, moeglich: false, grund,
    noteNachher: null, abweichung: null, entwurf: null,
  });

  if (typeof noteVorher !== "number") return offen("Der Eintrag hat keine Endnote.");
  if (!werte.length || werte.some((w) => w === null)) return offen("Dafür fehlen bewertete Kriterien.");
  /* Kriterien sind auf 0 bis 10 begrenzt. Was darueber hinausmuesste,
     geht nicht — und wird nicht stillschweigend gekappt. */
  if (werte.some((w) => w + proFeld > BEWERTUNG_MAX + VERRECHNEN_TOLERANZ)) {
    return offen("Ein Kriterium käme über " + stufenText(BEWERTUNG_MAX) + ".");
  }
  if (werte.some((w) => w + proFeld < BEWERTUNG_MIN - VERRECHNEN_TOLERANZ)) {
    return offen("Ein Kriterium fiele unter " + stufenText(BEWERTUNG_MIN) + ".");
  }

  const neueQuelle = (q) => {
    // Nur die Kriterien dieser Kategorie werden angefasst; was sonst
    // in `values` steht, bleibt unberuehrt stehen. Das Bauchgefuehl
    // ebenso: die Sammelfunktion geht ausschliesslich in die Kriterien.
    const neueWerte = { ...(q.values || {}) };
    for (const c of kriterien) neueWerte[c.key] = aufSammelSchritt(neueWerte[c.key] + proFeld);
    return { ...q, values: neueWerte };
  };

  let entwurf;
  if (hasSeasons(entry)) {
    const seasons = entry.seasons.map(neueQuelle);
    const mitStaffeln = { ...entry, seasons };
    /* Mit Staffeln bekommt der Eintrag die Mittelwerte seiner Staffeln
       als eigene Werte — genau wie beim Speichern im
       Bewertungsformular (siehe RatingForm.handleSave). */
    const obenWerte = {};
    for (const c of kriterien) obenWerte[c.key] = entryCriterionValue(mitStaffeln, c.key);
    entwurf = { values: obenWerte, personal: entryPersonal(mitStaffeln), seasons };
  } else {
    const neu = neueQuelle(entry);
    entwurf = { values: neu.values, personal: neu.personal, seasons: [] };
  }

  /* Was danach wirklich dastuende — ueber dieselbe Rechnung wie
     ueberall sonst, mit der Elo zurueck auf dem Startwert und damit
     einem Zuschlag von 0. */
  const danach = { ...entry, ...entwurf, elo: ELO_START };
  const noteNachher = entryScore(danach, category);
  const abweichung = Math.round((noteNachher - noteVorher) * 100) / 100;

  /* Die Zusage wird nachgerechnet, nicht behauptet. Bliebe ein Rest
     aus den Zwischenrundungen der Endnoten-Formel groesser als
     zugesagt, geht dieser Eintrag lieber unveraendert durch. */
  if (Math.abs(abweichung) > SAMMEL_MAX_ABWEICHUNG + VERRECHNEN_TOLERANZ) {
    return offen("Die Endnote würde sich um " + betragText(abweichung) + " ändern.");
  }

  return { ...grundlage, moeglich: true, grund: "", noteNachher, abweichung, entwurf };
}

/**
 * Die Vorschau ueber die ganze Sammlung. Rechnet nur.
 *
 * `items` ist der Bestand nach Kategorien, so wie ihn die App haelt.
 * Zurueck kommen zwei Listen in der Reihenfolge der Kategorien:
 * was verrechnet wuerde, und was uebersprungen wird — Letzteres mit
 * Titel und Begruendung, damit es sich namentlich auflisten laesst.
 */
function sammelVerrechnungsPlan(items) {
  const verrechenbar = [];
  const uebersprungen = [];
  for (const catKey of CATEGORY_KEYS) {
    const liste = (items && items[catKey]) || [];
    for (const entry of liste) {
      if (!verrechnenAngeboten(entry)) continue;
      const vorgang = sammelVerrechnung(entry, catKey);
      (vorgang.moeglich ? verrechenbar : uebersprungen).push(vorgang);
    }
  }
  return { verrechenbar, uebersprungen, betroffen: verrechenbar.length + uebersprungen.length };
}

/**
 * Die Anfrage, mit der ein einzelner Vorgang gespeichert wird: eine
 * ganz normale Bewertungsaenderung, ergaenzt um `elo` auf dem
 * Startwert. `duels`, `siege` und die Eintraege in duell_paare
 * bleiben damit stehen — die Duellhistorie geht nicht verloren.
 */
function sammelVerrechnungsAnfrage(entry, vorgang) {
  return {
    ...entry,
    category: vorgang.category,
    values: vorgang.entwurf.values,
    personal: vorgang.entwurf.personal,
    seasons: vorgang.entwurf.seasons || [],
    elo: ELO_START,
  };
}

/* Die Zeile ueber der Vorschau — wie viele Eintraege betroffen sind
   und was mit ihnen geschieht. */
function sammelVorschauText(plan) {
  if (!plan || !plan.betroffen) {
    return "Kein Eintrag hat genug Duelle und einen Zuschlag, der sich zu verrechnen lohnt.";
  }
  const eintraege = plan.betroffen === 1 ? "1 Eintrag" : plan.betroffen + " Einträge";
  const wuerden =
    plan.verrechenbar.length === 1
      ? "1 würde verrechnet"
      : plan.verrechenbar.length + " würden verrechnet";
  if (!plan.uebersprungen.length) return eintraege + " betroffen, " + wuerden + ".";
  const rest =
    plan.uebersprungen.length === 1
      ? "1 wird übersprungen"
      : plan.uebersprungen.length + " werden übersprungen";
  return eintraege + " betroffen, " + wuerden + ", " + rest + ":";
}

/* Wie weit die Endnote des Gegners hoechstens abweichen darf.
   Frueher stand hier ein Fenster von fuenf Raengen. Das Mass ist
   jetzt die Endnote selbst, und zwar aus einem handfesten Grund: Der
   Duell-Zuschlag ist gedeckelt, zwei Titel koennen sich also nur um
   einen begrenzten Betrag aneinander vorbeischieben — bei -0,25 bis
   +0,25 je Titel um hoechstens einen halben Notenpunkt. Bei deutlich
   mehr Abstand waere eine Paarung folgenlos, der Ausgang stuende
   ohnehin fest. Die Stufen selbst bleiben unveraendert.

   Findet sich im engsten Fenster nicht genug, wird schrittweise
   geoeffnet; die letzte Stufe laesst alles zu, damit in einer
   duennen Kategorie ueberhaupt gespielt werden kann. */
const DUELL_FENSTER_STUFEN = [0.6, 1.0, 1.5, Infinity];

/* Die erste Stufe — das Fenster, in dem eine Paarung normalerweise
   zustande kommt. Die Erweiterungsstufen sind der Notausgang fuer
   duenne Kategorien und zaehlen deshalb nicht mit, wenn es darum
   geht, wie viele Paarungen es ueberhaupt gibt. */
const DUELL_GRUNDFENSTER = DUELL_FENSTER_STUFEN[0];

/* So viele Gegner muss ein Fenster mindestens hergeben, sonst wird
   die naechste Stufe genommen. Bei nur einem Kandidaten gaebe es
   nichts zu waehlen — dieselbe Begegnung kaeme immer wieder. */
const DUELL_MIN_KANDIDATEN = 2;

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
 * Die schon gespielten Paarungen als Nachschlagewerk:
 * Paarungsschluessel -> Zeitpunkt des letzten Duells.
 *
 * Was hereinkommt, sind die Zeilen aus duell_paare ({ a, b, at }) —
 * je Paarung eine. Doppelte oder unvollstaendige Eintraege stoeren
 * nicht: unvollstaendige fallen heraus, bei doppelten gilt der
 * juengste Zeitpunkt.
 *
 * Ist nichts gespielt (oder konnte die Liste nicht geladen werden),
 * bleibt die Karte leer — und damit laeuft die Ziehung genau so wie
 * vor der Sperrfrist.
 */
function gespielteZeiten(gespielt) {
  const zeiten = new Map();
  for (const eintrag of Array.isArray(gespielt) ? gespielt : []) {
    if (!eintrag || !eintrag.a || !eintrag.b) continue;
    const zeit = typeof eintrag.at === "number" && Number.isFinite(eintrag.at) ? eintrag.at : 0;
    const schluessel = paarungsSchluessel(eintrag.a, eintrag.b);
    const bisher = zeiten.get(schluessel);
    if (bisher === undefined || zeit > bisher) zeiten.set(schluessel, zeit);
  }
  return zeiten;
}

/* Endnote eines Teilnehmers fuer das Fenster. Die Liste kommt aus der
   Rangliste, dort steht sie in `score`. */
function duellNote(eintrag) {
  const wert = eintrag ? eintrag.score : undefined;
  return typeof wert === "number" && Number.isFinite(wert) ? wert : null;
}

/**
 * Liegen zwei Teilnehmer im selben Notenfenster?
 *
 * Das ist der eine Vergleich, an dem die Paarung haengt — er steht
 * deshalb hier und nur hier. Die Ziehung fragt ihn Stufe fuer Stufe
 * (siehe duellKandidaten), die Zaehlung der moeglichen Paarungen
 * fragt ihn fuer das Grundfenster. Ohne Begrenzung passt jedes Paar;
 * fehlt einem der beiden die Endnote, gibt es nichts zu messen.
 */
function imNotenfenster(a, b, fenster) {
  if (fenster === Infinity) return true;
  const noteA = duellNote(a);
  const noteB = duellNote(b);
  if (noteA === null || noteB === null) return false;
  return Math.abs(noteA - noteB) <= fenster;
}

/**
 * Wie viele Paarungen ein Teilnehmerfeld ueberhaupt hergibt.
 *
 * Gezaehlt wird ueber alle Teilnehmer, je Paar genau einmal — die
 * innere Schleife startet deshalb hinter der aeusseren.
 *
 * Ob ein Paar mitzaehlt, entscheidet dieselbe Frage wie bei der
 * Ziehung, und `ohneFenster` steht fuer dasselbe wie dort: ohne
 * Eingrenzung misst das Grundfenster (imNotenfenster, ohne die
 * Erweiterungsstufen — gemeint ist das Feld, aus dem im Normalfall
 * gezogen wird); in einer Auswahl faellt die Messung weg, denn dort
 * darf jeder gegen jeden.
 *
 * Zwei Plaetze der Liste koennten denselben Eintrag fuehren; ein
 * solches Paar gaebe kein Duell und zaehlt deshalb nicht.
 */
function moeglichePaarungen(liste, ohneFenster = false) {
  if (!Array.isArray(liste)) return 0;
  let zahl = 0;
  for (let i = 0; i < liste.length; i++) {
    const a = liste[i];
    if (!a) continue;
    for (let j = i + 1; j < liste.length; j++) {
      const b = liste[j];
      if (!b) continue;
      if (a.id && b.id && a.id === b.id) continue;
      if (ohneFenster || imNotenfenster(a, b, DUELL_GRUNDFENSTER)) zahl++;
    }
  }
  return zahl;
}

/**
 * Wie viele der schon gespielten Paarungen in ein Feld fallen.
 *
 * `gespielt` sind die Zeilen aus duell_paare ({ a, b, at }) — je
 * Paarung eine, fuer die ganze Kategorie. `ids` ist das
 * festgehaltene Teilnehmerfeld.
 *
 * Ohne Feld (Auswahl "Alle") zaehlt schlicht, was dasteht: die Zeilen
 * der Kategorie. Mit Feld zaehlen nur die Paarungen, bei denen BEIDE
 * Seiten dazugehoeren — das sind genau die, die moeglichePaarungen
 * fuer dieses Feld auch als moeglich zaehlt.
 *
 * Doppelte Zeilen zaehlen einmal; unvollstaendige fallen heraus.
 */
function gespieltePaarungen(gespielt, ids) {
  const zeilen = Array.isArray(gespielt) ? gespielt : [];
  if (!ids) return zeilen.length;
  const gesehen = new Set();
  for (const eintrag of zeilen) {
    if (!eintrag || !eintrag.a || !eintrag.b) continue;
    if (!ids.has(eintrag.a) || !ids.has(eintrag.b)) continue;
    gesehen.add(paarungsSchluessel(eintrag.a, eintrag.b));
  }
  return gesehen.size;
}

/** Zahlen mit Tausenderpunkt — „1.612". */
function zahlText(n) {
  return Math.round(n).toLocaleString("de-DE");
}

/* Wie das Teilnehmerfeld eines Head-to-Head eingegrenzt wird.
   "Alle" ist die Vorgabe und laesst alles, wie es war. */
const DUELL_AUSWAHL_ALLE = "alle";
const DUELL_AUSWAHL_PLATZ = "platz";
const DUELL_AUSWAHL_NOTE = "note";

/* Die Grenzen, wenn ein Feld leer bleibt: von Platz 1 bis ans Ende
   der Liste, von Note 0 bis 10. Ein leeres Feld heisst damit "ohne
   Grenze auf dieser Seite" und nicht "nichts". */
const DUELL_NOTE_MIN = 0;
const DUELL_NOTE_MAX = 10;

/* Eine eingetippte Grenze als Zahl. Was sich nicht lesen laesst —
   leer, Buchstaben —, faellt auf den Ersatzwert zurueck. */
function auswahlGrenze(wert, ersatz) {
  if (typeof wert === "number" && Number.isFinite(wert)) return wert;
  /* Ein leeres Feld ist keine 0, sondern gar keine Angabe — Number("")
     waere hier eine boese Falle. */
  if (typeof wert !== "string" || !wert.trim()) return ersatz;
  const zahl = Number(wert.trim().replace(",", "."));
  return Number.isFinite(zahl) ? zahl : ersatz;
}

/**
 * Das Teilnehmerfeld einer Auswahl — wer ueberhaupt antreten darf.
 *
 * `liste` ist das Teilnehmerfeld der Kategorie in Ranglisten-
 * Reihenfolge (beste Note zuerst), `auswahl` die Eingrenzung:
 *
 *   { art: "alle" }                    das ganze Feld
 *   { art: "platz", von: 3, bis: 7 }   Platz 3 bis 7, beide dabei
 *   { art: "note", von: 7, bis: 8.5 }  Endnote 7,0 bis 8,5
 *
 * Verdrehte Grenzen werden gerade gerueckt: "von 7 bis 3" meint
 * dasselbe wie "von 3 bis 7". Beim Notenbereich entscheidet
 * dieselbe Frage wie beim Notenfilter der Rangliste
 * (imNotenbereich) — die angezeigte, auf 0 bis 10 begrenzte Note.
 *
 * Diese Funktion wird EINMAL gerufen, wenn die Auswahl beginnt. Was
 * sie zurueckgibt, steht danach fest; verschieben sich die Noten
 * durch die eigenen Duelle, bleibt das Feld trotzdem dasselbe.
 */
function auswahlFeld(liste, auswahl) {
  const alle = (Array.isArray(liste) ? liste : []).filter(Boolean);
  const art = auswahl && auswahl.art;

  if (art === DUELL_AUSWAHL_PLATZ) {
    const roh = [
      Math.round(auswahlGrenze(auswahl.von, 1)),
      Math.round(auswahlGrenze(auswahl.bis, alle.length)),
    ];
    const von = Math.max(1, Math.min(roh[0], roh[1]));
    const bis = Math.max(roh[0], roh[1]);
    return alle.slice(von - 1, Math.max(0, bis));
  }

  if (art === DUELL_AUSWAHL_NOTE) {
    const roh = [
      auswahlGrenze(auswahl.von, DUELL_NOTE_MIN),
      auswahlGrenze(auswahl.bis, DUELL_NOTE_MAX),
    ];
    const von = Math.min(roh[0], roh[1]);
    const bis = Math.max(roh[0], roh[1]);
    return alle.filter((eintrag) => imNotenbereich(duellNote(eintrag), von, bis));
  }

  return alle;
}

/**
 * Das festgehaltene Feld auf den aktuellen Stand gelegt.
 *
 * `ids` sind die Teilnehmer, wie sie beim Start der Auswahl
 * feststanden; `liste` ist das Feld der Kategorie, wie es jetzt
 * dasteht. Heraus kommt, wer beides ist — in der aktuellen
 * Reihenfolge und mit den aktuellen Noten und Duellzahlen, aber ohne
 * dass jemand hinzukommt oder herausfaellt, nur weil ein Duell die
 * Noten verschoben hat.
 *
 * Ohne `ids` (Auswahl "Alle") bleibt die Liste unangetastet — genau
 * dieselbe, die vor der Auswahl an die Ziehung ging.
 */
function feldListe(liste, ids) {
  const alle = Array.isArray(liste) ? liste : [];
  if (!ids) return alle;
  return alle.filter((eintrag) => eintrag && ids.has(eintrag.id));
}

/**
 * Die moeglichen Gegner eines Titels, samt der Stufe, die dafuer
 * noetig war.
 *
 * Genommen wird die engste Stufe, die mindestens
 * DUELL_MIN_KANDIDATEN hergibt. Reicht keine, bleibt es bei der
 * letzten (ohne Begrenzung) — dort steht dann alles drin, was
 * ueberhaupt antreten kann.
 *
 * Aussortiert wird, wer denselben Eintrag meint: gleicher Platz oder
 * gleiche ID. Zwei Plaetze der Liste koennen denselben Eintrag
 * fuehren, und ein Selbstduell darf daraus nie entstehen.
 *
 * Mit `ohneFenster` faellt die Messung ganz weg: dann zaehlt das
 * ganze Feld. Das ist der Fall, wenn der Spieler das Teilnehmerfeld
 * selbst eingegrenzt hat — die Auswahl tritt dann an die Stelle des
 * Fensters (siehe DUELL_AUSWAHL_*).
 */
function duellKandidaten(liste, ankerIndex, ohneFenster = false) {
  const anker = liste[ankerIndex];
  if (!anker) return [];
  const note = duellNote(anker);

  const moeglich = [];
  for (let i = 0; i < liste.length; i++) {
    if (i === ankerIndex) continue;
    const gegner = liste[i];
    if (!gegner) continue;
    if (gegner.id && anker.id && gegner.id === anker.id) continue;
    moeglich.push(i);
  }
  if (!moeglich.length) return [];

  /* Eine Auswahl ersetzt das Fenster: wer im Feld steht, darf gegen
     jeden anderen darin antreten. Die Erweiterungsstufen entfallen
     damit ebenso — sie waeren der Notausgang eines Fensters, das es
     hier nicht gibt. */
  if (ohneFenster) return moeglich;

  /* Ohne Note gibt es nichts zu messen — dann zaehlt das ganze Feld.
     In der Rangliste kommt das nicht vor, die Sperre steht nur, damit
     die Ziehung auch mit unvollstaendigen Daten etwas liefert. */
  if (note === null) return moeglich;

  let letzte = moeglich;
  for (const fenster of DUELL_FENSTER_STUFEN) {
    const imFenster = moeglich.filter((i) => imNotenfenster(anker, liste[i], fenster));
    letzte = imFenster;
    if (imFenster.length >= DUELL_MIN_KANDIDATEN) return imFenster;
  }
  /* Auch ohne Begrenzung zu wenige: dann eben das, was da ist. */
  return letzte.length ? letzte : moeglich;
}

/* Aus einer Auswahl den Kandidaten mit den wenigsten bisherigen
   Duellen ziehen. Bei Gleichstand entscheidet das Los — sonst kaeme
   in einer frischen Kategorie, in der alle bei 0 stehen, immer
   derselbe. So verteilen sich die Duelle ueber die Sammlung. */
function wenigsteDuelle(liste, auswahl, zufall) {
  let wenigste = Infinity;
  let beste = [];
  for (const i of auswahl) {
    const zahl = entryDuels(liste[i]);
    if (zahl < wenigste) {
      wenigste = zahl;
      beste = [i];
    } else if (zahl === wenigste) {
      beste.push(i);
    }
  }
  if (!beste.length) return null;
  return beste[Math.floor(zufall() * beste.length)];
}

/**
 * Zwei Titel fuer ein Duell ziehen: ein zufaelliger Anker aus der nach
 * Endnote sortierten Liste, der Gegner aus dem Notenfenster um ihn
 * herum. Welcher der beiden links steht, wird gelost — sonst saesse
 * der Anker immer auf derselben Seite.
 *
 * `verlauf` sind die zuletzt gezogenen Paarungen als Paare von IDs,
 * die juengste zuletzt. Keine davon soll gleich wieder drankommen.
 *
 * `gespielt` sind die Paarungen, die es schon einmal gab, mit dem
 * Zeitpunkt ihres letzten Duells ({ a, b, at } — aus duell_paare).
 * Sie bilden die Sperrfrist, und die ist ausdruecklich kein
 * dauerhaftes Verbot: im Fenster zaehlen zuerst nur die ungespielten
 * Paarungen; ist dort keine mehr uebrig, kommt die am laengsten
 * zurueckliegende wieder dran. Ein Zustand, in dem gar kein Duell
 * mehr angeboten wird, kann dadurch nicht entstehen.
 *
 * Am Notenfenster selbst und an seinen Erweiterungsstufen aendert das
 * nichts (siehe duellKandidaten) — die Stufe sitzt davor.
 *
 * Innerhalb des Fensters kommt bevorzugt, wer die wenigsten Duelle
 * hinter sich hat — gesucht wird also zuerst unter den freien
 * Kandidaten, und erst wenn dort keiner uebrig ist, unter den
 * gesperrten.
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
function ziehePaarung(liste, verlauf, zufall = Math.random, gespielt = null, ohneFenster = false) {
  if (!Array.isArray(liste) || liste.length < MIN_DUELL_TEILNEHMER) return null;

  const gesperrt = (Array.isArray(verlauf) ? verlauf : [])
    .filter((eintrag) => Array.isArray(eintrag) && eintrag.length === 2)
    .map((eintrag) => paarungsSchluessel(eintrag[0], eintrag[1]));
  const vorige = gesperrt.length ? gesperrt[gesperrt.length - 1] : null;

  const zeitVon = gespielteZeiten(gespielt);

  const seitenLos = (a, b) => (zufall() < 0.5 ? [a, b] : [b, a]);

  let ersatz = null;
  let zuletztGezogen = null;
  for (let versuch = 0; versuch < DUELL_VERSUCHE; versuch++) {
    const ankerIndex = Math.floor(zufall() * liste.length);
    const anker = liste[ankerIndex];
    if (!anker) continue;

    const imFenster = duellKandidaten(liste, ankerIndex, ohneFenster);
    if (!imFenster.length) continue;

    /* Die vorgelagerte Stufe: im Fenster zaehlen zuerst nur die
       Paarungen, die es noch nie gab. Steht dort keine, hat dieser
       Anker nichts zu bieten — dann kommt der naechste dran, und ganz
       zum Schluss die aelteste Paarung (unten). */
    const kandidaten = zeitVon.size
      ? imFenster.filter((i) => !zeitVon.has(paarungsSchluessel(anker.id, liste[i].id)))
      : imFenster;
    if (!kandidaten.length) continue;

    const frei = kandidaten.filter(
      (i) => !gesperrt.includes(paarungsSchluessel(anker.id, liste[i].id))
    );

    /* Erst unter den freien suchen. Nur wenn dort keiner steht, wird
       der Ausweg vorgemerkt und mit einem neuen Anker weitergesucht. */
    const gegnerIndex = wenigsteDuelle(liste, frei.length ? frei : kandidaten, zufall);
    if (gegnerIndex === null) continue;

    const paar = seitenLos(anker, liste[gegnerIndex]);
    const schluessel = paarungsSchluessel(paar[0].id, paar[1].id);
    zuletztGezogen = paar;

    if (frei.length) return paar;
    if (!ersatz && schluessel !== vorige) ersatz = paar;
  }
  if (ersatz || zuletztGezogen) return ersatz || zuletztGezogen;

  /* Kein Anker hatte eine ungespielte Paarung im Fenster. Statt hier
     aufzugeben, kommt die Begegnung wieder, die am laengsten
     zurueckliegt. */
  return aeltestePaarung(liste, zeitVon, seitenLos, zufall, ohneFenster);
}

/**
 * Der Ausweg, wenn im Fenster nichts Ungespieltes mehr steht: die
 * Paarung mit dem aeltesten Zeitpunkt.
 *
 * Gesucht wird ueber alle Anker — die zufaellige Ziehung oben sieht
 * immer nur das Fenster eines einzelnen und wuesste deshalb nichts
 * davon, welche Begegnung im Ganzen am laengsten her ist.
 *
 * Sollte sich dabei doch noch eine ungespielte Paarung finden (die
 * Ziehung oben nimmt ihre Anker zufaellig und kann eine uebersehen),
 * hat die Vorrang — die Sperrfrist greift immer erst, wenn wirklich
 * keine ungespielte mehr uebrig ist.
 */
function aeltestePaarung(liste, zeitVon, seitenLos, zufall, ohneFenster = false) {
  const ungespielt = [];
  let aelteste = null;
  for (let i = 0; i < liste.length; i++) {
    const anker = liste[i];
    if (!anker) continue;
    for (const j of duellKandidaten(liste, i, ohneFenster)) {
      const gegner = liste[j];
      if (!gegner) continue;
      const schluessel = paarungsSchluessel(anker.id, gegner.id);
      if (!zeitVon.has(schluessel)) {
        ungespielt.push([anker, gegner]);
        continue;
      }
      const zeit = zeitVon.get(schluessel);
      if (!aelteste || zeit < aelteste.zeit) aelteste = { paar: [anker, gegner], zeit };
    }
  }
  if (ungespielt.length) {
    const gewaehlt = ungespielt[Math.floor(zufall() * ungespielt.length)];
    return seitenLos(gewaehlt[0], gewaehlt[1]);
  }
  return aelteste ? seitenLos(aelteste.paar[0], aelteste.paar[1]) : null;
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
   Am Schauen

   Ein eigenes, unabhaengiges Kennzeichen — es ersetzt weder
   "bewertet" noch "vorgemerkt", sondern steht daneben. Genau darum
   geht es: Ein bereits bewerteter Titel muss beim Rewatch gleichzeitig
   am Schauen sein koennen, ohne aus der Rangliste zu verschwinden, und
   bei einer Serie kann Staffel 1 bewertet sein, waehrend Staffel 2
   noch laeuft.

   Gesetzt und geloescht wird es ausschliesslich ueber seinen eigenen
   Schalter. Keine Bewertung, kein Nachladen und kein anderer
   Speichervorgang fasst es an (siehe amSchauenColumns in
   api/items.js).
   ------------------------------------------------------------ */
function istAmSchauen(entry) {
  return entry && entry.amSchauen === true;
}

/* Bei Spielen heisst der Reiter "Am Spielen". Wie beim Backlog wechselt
   nur die Beschriftung; Funktion und Daten sind dieselben. */
function amSchauenLabel(category) {
  return category === "game" ? "Am Spielen" : "Am Schauen";
}

/* Dieselbe Beschriftung mitten im Satz: "Am Schauen" -> "am Schauen".
   Klein wird nur das "Am"; die Taetigkeit bleibt gross. */
function amSchauenLabelKlein(category) {
  return amSchauenLabel(category).replace(/^Am /, "am ");
}

/**
 * Der Fortschritt eines Eintrags, so wie die Zeile ihn anzeigt — oder
 * null, wenn es keinen anzuzeigen gibt.
 *
 * Gelesen werden ausschliesslich die Episodenzahlen je Staffel, die
 * ohnehin fuer die Laufzeit gespeichert sind. Sie fehlen bei Filmen,
 * bei Spielen und ueberall dort, wo das automatische Nachladen sie
 * nicht ermitteln konnte — dann steht der Eintrag einfach ohne Zusatz
 * im Reiter. Geschrieben wird an diesen Daten hier nichts.
 *
 * `staffelNr` und `folgeNr` duerfen null sein ("nie gesetzt"); dann
 * gilt Staffel 1, Folge 0 — dasselbe, was das Einschalten des
 * Kennzeichens setzt.
 */
function fortschrittStand(entry) {
  if (!entry) return null;
  const jeStaffel = Array.isArray(entry.episodesPerSeason) ? entry.episodesPerSeason : [];
  if (!jeStaffel.length) return null;

  const staffel =
    typeof entry.staffelNr === "number" && entry.staffelNr >= 1 ? Math.round(entry.staffelNr) : 1;
  const gesamt = jeStaffel[staffel - 1];
  // Eine Staffel, zu der keine Folgenzahl bekannt ist (der Stand steht
  // hinter der Liste, oder die Quelle kannte sie nicht): kein
  // Fortschritt, aber auch kein Fehler.
  if (typeof gesamt !== "number" || gesamt <= 0) return null;

  const folge =
    typeof entry.folgeNr === "number" && entry.folgeNr >= 0 ? Math.round(entry.folgeNr) : 0;
  return { staffel, folge, gesamt, staffeln: jeStaffel.length };
}

/**
 * Was ein Druck auf "+1" aus dem Stand macht — oder null, wenn sich
 * nichts mehr aendert.
 *
 * Innerhalb der Staffel geht es Folge um Folge weiter. Ist die letzte
 * Folge erreicht, springt der naechste Druck auf die naechste Staffel,
 * Folge 1. Gibt es keine naechste, bleibt der Stand auf der letzten
 * Folge stehen — das Kennzeichen wird dabei ausdruecklich nicht von
 * selbst ausgeschaltet.
 */
function fortschrittWeiter(stand) {
  if (!stand) return null;
  if (stand.folge < stand.gesamt) return { staffelNr: stand.staffel, folgeNr: stand.folge + 1 };
  if (stand.staffel < stand.staffeln) return { staffelNr: stand.staffel + 1, folgeNr: 1 };
  return null;
}

/** "S2 · 4/10" — der Stand in einer Zeile. */
function fortschrittText(stand) {
  return "S" + stand.staffel + " · " + stand.folge + "/" + stand.gesamt;
}

/* ------------------------------------------------------------
   Wer steht in welchem Unter-Reiter?

   Als eigene Funktionen, damit die eine Zusage pruefbar ist, an der
   alles haengt: Es darf keinen Zustand geben, in dem ein Eintrag in
   gar keinem Reiter erscheint. Aus den drei Regeln folgt sie
   unmittelbar — wer nicht vorgemerkt ist, steht unter "Bewertet"; wer
   vorgemerkt ist, steht je nach Kennzeichen unter "Am Schauen" oder in
   der Watchlist.

   Die Watchlist blendet dabei nur die Anzeige aus: `watchlist` bleibt
   am Eintrag stehen, damit er beim Ausschalten wieder dort auftaucht.
   ------------------------------------------------------------ */
function inReiterBewertet(entry) {
  return !istVorgemerkt(entry);
}

function inReiterAmSchauen(entry) {
  return istAmSchauen(entry);
}

function inReiterWatchlist(entry) {
  return istVorgemerkt(entry) && !istAmSchauen(entry);
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

/* ------------------------------------------------------------
   Sehzeit — Laufzeit mal Zaehler

   Wie viel Zeit ein bewerteter Eintrag tatsaechlich gekostet hat:
   seine Laufzeit, so oft genommen, wie er gesehen wurde. Ein Film
   von 152 Minuten mit Zaehler 6 steht damit fuer 912 Minuten, also
   15,2 Stunden.

   Der Zaehler kommt aus `entryWatchCount` und ist dort nach unten
   auf 1 begrenzt: Ein bewerteter Eintrag wurde mindestens einmal
   gesehen. Ein fehlender oder auf 0 stehender Zaehler laesst einen
   bewerteten Titel deshalb nicht aus der Summe fallen.

   Aussen vor bleiben Spiele (fuer sie gibt es keine abrufbare
   Laufzeit) und Eintraege, deren Laufzeit noch nicht bekannt ist.
   Wie viele Letztere es sind, gibt `sehzeitSumme` mit zurueck — die
   Summe soll nicht vollstaendiger wirken, als sie ist.

   ACHTUNG, bewusster Unterschied: Die "Gesehene Zeit" im
   Jahresrueckblick rechnet OHNE den Zaehler, zaehlt also jede
   Laufzeit genau einmal. Sie beantwortet die Frage "was ist in
   diesem Jahr dazugekommen?", diese Rechnung hier die Frage "wie
   viel Zeit steckt insgesamt darin?". Die beiden Zahlen sind
   deshalb absichtlich nicht dieselbe Rechnung.
   ------------------------------------------------------------ */

/** Sehzeit eines einzelnen Eintrags in Minuten — oder null. */
function sehzeitEintrag(entry, category) {
  if (!unterstuetztLaufzeit(category)) return null;
  const dauer = eintragLaufzeit(entry);
  return dauer === null ? null : dauer * entryWatchCount(entry);
}

/**
 * Die Sehzeit ueber mehrere Kategorien hinweg.
 *
 * `gruppen` ist je Kategorie eine Liste — dieselbe Aufteilung, in
 * der `ranked` ohnehin vorliegt. Zurueck kommen die Minuten, wie
 * viele Eintraege eingegangen sind, wie viele mangels Laufzeit
 * fehlen und ob in der Auswahl ueberhaupt eine Kategorie mit
 * Laufzeit steckt: Bei "Spiele" allein gibt es keine Sehzeit, und
 * eine 0 waere dort keine Antwort, sondern ein Missverstaendnis.
 */
function sehzeitSumme(gruppen) {
  let minuten = 0;
  let gezaehlt = 0;
  let ohneLaufzeit = 0;
  let moeglich = false;

  for (const { category, liste } of gruppen) {
    if (!unterstuetztLaufzeit(category)) continue;
    moeglich = true;
    for (const eintrag of liste || []) {
      const dauer = sehzeitEintrag(eintrag, category);
      if (dauer === null) {
        ohneLaufzeit++;
        continue;
      }
      minuten += dauer;
      gezaehlt++;
    }
  }

  return { minuten, gezaehlt, ohneLaufzeit, moeglich };
}

/* Die beiden Kartenwerte. Auf einer Kennzahl-Karte steht die Einheit
   schon in der Beschriftung, deshalb hier nur die Zahl.

   Stunden werden auf volle gerundet — Minuten sind bei Summen dieser
   Groesse ohne Aussage, genau wie in `stundenText`. Tage bekommen
   eine Nachkommastelle: ganze Tage waeren fuer die Karte zu grob,
   unter einem Tag stuende sonst nur eine 0. */
function sehzeitStundenWert(minuten) {
  return String(Math.round(minuten / 60));
}

function sehzeitTageWert(minuten) {
  return (minuten / 1440).toFixed(1);
}

/* Der Hinweis unter einer Zeitsumme. Er steht wortgleich im
   Jahresrueckblick und in der Detailauswertung — zwei Formulierungen
   fuer dieselbe Einschraenkung wuerden sich frueher oder spaeter
   widersprechen. */
function ohneLaufzeitHinweis(anzahl) {
  return anzahl + " Einträge ohne bekannte Laufzeit fehlen in der Summe.";
}

/**
 * Wie lange ein Eintrag schon vorgemerkt ist, kurz genug fuer die
 * Meta-Zeile einer Listenzeile: "heute", "gestern", "vor 43 Tagen".
 *
 * Die lange Fassung ("hinzugefuegt vor 43 Tagen") stand frueher allein
 * neben dem Jahr und wurde bei 430 px Breite zu "hinzu…" abgeschnitten.
 * Ist kein Zeitpunkt bekannt, faellt die Angabe ganz weg — ein leerer
 * Platzhalter in der Meta-Zeile saehe aus wie ein Fehler.
 */
function hinzugefuegtKurz(zeit) {
  if (!zeit) return "";
  const tage = Math.floor((Date.now() - zeit) / 86400000);
  if (tage <= 0) return "heute";
  if (tage === 1) return "gestern";
  return "vor " + tage + " Tagen";
}

/* Ein Zeitstempel als Datum: "14.03.2024". */
function datumKurz(zeit) {
  if (typeof zeit !== "number" || !(zeit > 0)) return "";
  return new Date(zeit).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

/* Derselbe Zeitstempel als Wert fuer <input type="date">:
   "2024-03-14".

   Bewusst aus den oertlichen Bestandteilen zusammengesetzt statt ueber
   toISOString: Das rechnet nach UTC um und schoebe ein Datum oestlich
   von Greenwich um einen Tag zurueck. */
function datumFeldWert(zeit) {
  if (typeof zeit !== "number" || !(zeit > 0)) return "";
  const d = new Date(zeit);
  const zwei = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + zwei(d.getMonth() + 1) + "-" + zwei(d.getDate());
}

/* Und zurueck: "2024-03-14" -> Zeitstempel auf 12 Uhr Ortszeit.
   Mittag statt Mitternacht, damit keine Zeitzonenverschiebung das
   Datum ueber die Tagesgrenze kippt. Unbrauchbares ergibt null. */
function feldWertZuZeit(text) {
  const treffer = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(text || "").trim());
  if (!treffer) return null;
  const jahr = Number(treffer[1]);
  const monat = Number(treffer[2]);
  const tag = Number(treffer[3]);
  const d = new Date(jahr, monat - 1, tag, 12, 0, 0, 0);
  // Ein "2024-02-31" rollt in JavaScript still auf den 2. Maerz weiter
  // — hier soll es schlicht kein Datum sein.
  if (d.getFullYear() !== jahr || d.getMonth() !== monat - 1 || d.getDate() !== tag) return null;
  return d.getTime();
}

/* ------------------------------------------------------------
   Erstsichtung — wann wurde der Titel zum ersten Mal gesehen?

   Zwei Quellen, in dieser Reihenfolge:

     1. `firstWatchedAt` — das von Hand eingetragene Datum. Es gibt
        keinen anderen Weg, auf dem es entsteht: Der Sehzaehler, ein
        weiterer Durchgang und jedes automatische Nachladen lassen es
        unberuehrt.
     2. `ratedAt` — der Tag, an dem aus dem Eintrag ein bewerteter
        wurde. Der Rueckfallwert.

   `ratedAt` und ausdruecklich NICHT `createdAt`: Letzteres wird auch
   beim Vormerken gesetzt und stuende bei einem Titel, der zwei Jahre
   auf der Watchlist lag, um zwei Jahre zu frueh. Auch nicht
   `bewertetAm` (das den Jahresrueckblick traegt): Dort zaehlt die
   zuletzt nachgetragene Staffel mit, das Datum wanderte also mit jeder
   weiteren Staffel nach vorn — genau das soll hier nicht passieren.

   Fehlt beides — Altbestand ohne Bewertungsdatum, Vorgemerktes —,
   bleibt `zeit` null. Erfunden wird nichts.
   ------------------------------------------------------------ */
function erstsichtung(entry) {
  const eigen =
    entry && typeof entry.firstWatchedAt === "number" && entry.firstWatchedAt > 0
      ? entry.firstWatchedAt
      : null;
  if (eigen) return { zeit: eigen, eigen: true };
  const bewertet = entry && typeof entry.ratedAt === "number" && entry.ratedAt > 0 ? entry.ratedAt : null;
  return { zeit: bewertet, eigen: false };
}

/**
 * Die Meta-Zeile einer Listenzeile: "1968 · 2 Std. 29 Min. · vor 12
 * Tagen".
 *
 * Fehlt ein Wert — kein Jahr, keine bekannte Laufzeit —, faellt er
 * mitsamt seinem Trennzeichen weg. Sonst blieben je nach Datenlage ein
 * fuehrendes "·" oder zwei Trennzeichen hintereinander stehen.
 */
function zeilenMeta(eintrag) {
  const laufzeit = eintragLaufzeit(eintrag);
  return [
    eintrag && typeof eintrag.releaseYear === "number" ? String(eintrag.releaseYear) : "",
    laufzeit ? laufzeitKurz(laufzeit) : "",
    hinzugefuegtKurz(eintrag && eintrag.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");
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

/* Dieselbe Dauer wie --bewegung-blende, hier noch einmal als Zahl:
   Falls kein animationend eintrifft, raeumt ein Zeitgeber die alte
   Bildebene nach diesem Abstand ab. Bei Aenderung beides gemeinsam
   anpassen. */
const BLENDE_MS = 600;

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

  /* Ist die Ueberblendung durch, wird die alte Ebene aus dem Baum
     genommen — sonst laege sie unter der neuen weiter und schiene
     dauerhaft durch. Ueblich meldet das die Animation selbst; der
     Zeitgeber faengt die Faelle ab, in denen kein animationend kommt
     (etwa weil der Browser die Animation gar nicht erst startet). */
  const blendeFertig = () => setPrevIndex(null);

  useEffect(() => {
    if (prevIndex === null) return undefined;
    const timer = setTimeout(() => setPrevIndex(null), BLENDE_MS + 150);
    return () => clearTimeout(timer);
  }, [prevIndex, tick]);

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
  };

  /* Die 90 % liegen auf dieser Huelle, nicht auf den Bildern: die
     beiden Ebenen blenden darin von 0 auf 1, decken sich also
     vollstaendig ab, und erst das Ergebnis wird gemeinsam
     abgeschwaecht. Die Abdunkelung darunter ist Geschwister der
     Huelle und bleibt dadurch unveraendert. */
  const huelle = { position: "absolute", inset: 0, opacity: 0.9 };

  const kaputtMerken = (url) =>
    setKaputt((alt) => (alt.has(url) ? alt : new Set([...alt, url])));

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }} aria-hidden="true">
      <div style={huelle}>
        {/* Das scheidende Bild bleibt waehrend der Ueberblendung liegen
            — es gibt also keinen Moment, in dem der Kopfbereich leer
            waere. Danach faellt es heraus, damit es nicht als Schatten
            unter dem neuen Bild stehen bleibt. */}
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
             es rund eine Sekunde nach dem Rest. Gemessen wird am Takt,
             nicht an prevIndex: der steht nach jeder Ueberblendung
             wieder auf null. */
          fetchPriority={tick === 0 ? "high" : undefined}
          decoding="async"
          className={"backdrop-layer" + (reducedMotion || prevIndex === null ? "" : " backdrop-blende")}
          style={bild}
          onError={() => kaputtMerken(aktuell)}
          onAnimationEnd={blendeFertig}
        />
      </div>
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
  /* Angezeigt wird die begrenzte Endnote. Sortiert wird anderswo mit
     der unbegrenzten — siehe entryScore. */
  const gezeigt = anzeigeNote(score);
  return (
    <span
      title={unbewertet ? "Unbewertet — die Summe der Staffelgewichte ist 0" : undefined}
      style={{
        background: unbewertet ? "#2A2A2E" : scoreToColor(gezeigt),
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
      {unbewertet ? "–" : gezeigt.toFixed(2)}
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
  /* Wo laufen die Titel gerade im Abo? Wie bei den Fortsetzungen geht
     die Liste im Rumpf mit, und was ein Aufruf nicht mehr geschafft
     hat, steht in `offen`. Die Region entscheidet, welche Anbieter
     zurueckkommen. */
  async holeStreaming(region, eintraege) {
    const res = await fetch("/api/streaming", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region, eintraege }),
    });
    if (!res.ok) {
      throw new Error((await res.json().catch(() => ({}))).error || "Verfügbarkeit fehlgeschlagen");
    }
    const data = await res.json();
    return {
      treffer: data && typeof data.treffer === "object" && data.treffer ? data.treffer : {},
      offen: Array.isArray(data && data.offen) ? data.offen : [],
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
  /* Die schon gespielten Paarungen einer Kategorie — je Paarung der
     Zeitpunkt ihres letzten Duells. Daraus baut das Head-to-Head
     seine Sperrfrist (siehe ziehePaarung). */
  async loadDuellPaare(category) {
    const res = await fetch("/api/duels?category=" + encodeURIComponent(category));
    if (!res.ok) throw new Error("Paarungen konnten nicht geladen werden (" + res.status + ")");
    const data = await res.json();
    return Array.isArray(data.pairs) ? data.pairs : [];
  },
  /* Ein entschiedenes Duell melden. Der Server verschiebt die
     Elo-Zahlen der beiden Beteiligten, zaehlt je Eintrag und je
     Kategorie hoch, haelt die Paarung fest und gibt das zurueck.
     Bauchgefuehl und Kriterienwerte fasst dieser Weg nicht an. */
  async duell(category, winnerId, loserId) {
    const res = await fetch("/api/duels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, winnerId, loserId }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Duell fehlgeschlagen");
    return res.json();
  },
  /* Die Duell-Wertung eines Eintrags auf den Startwert zuruecksetzen.
     Der Zuschlag ist danach wieder 0; die gespielten Duelle bleiben
     gezaehlt. */
  async eloZuruecksetzen(id) {
    const res = await fetch("/api/duels?id=" + encodeURIComponent(id), { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Zurücksetzen fehlgeschlagen");
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

/* Warndreieck fuer eine auffaellige Bewertung (siehe
   entryAuffaellig). Es traegt keine eigene Farbe, sondern die
   uebergebene — in den Listen ist das der Akzent der Kategorie. */
function IconWarndreieck({ farbe, groesse = 13 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ ...symbolBasis, width: groesse, height: groesse, stroke: farbe, flexShrink: 0 }}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 4.2 2.8 20.1h18.4L12 4.2Z" />
      <line x1="12" y1="10.2" x2="12" y2="14.4" />
      <line x1="12" y1="17.2" x2="12" y2="17.2" />
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

function ConfirmDialog({ title, text, confirmLabel, cancelLabel = "Abbrechen", danger, onConfirm, onCancel }) {
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
              {cancelLabel}
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

/* Ein Weg im Verrechnen-Dialog. Gangbare Wege sind Knoepfe, nicht
   gangbare stehen mit ihrer Begruendung da — sie verschwinden nicht,
   sonst bliebe offen, warum es sie nicht gibt. */
function VerrechnenWeg({ weg, onWaehlen }) {
  const rahmen = {
    display: "block", width: "100%", boxSizing: "border-box", textAlign: "left",
    background: "#141416", border: "1px solid " + (weg.moeglich ? "#33333a" : "#2A2A2E"),
    borderRadius: 8, padding: "13px 14px", marginBottom: 10,
    color: "#EDEAE3", fontFamily: "inherit", fontSize: 14,
    cursor: weg.moeglich ? "pointer" : "default", opacity: weg.moeglich ? 1 : 0.6,
  };
  return (
    <button type="button" onClick={weg.moeglich ? onWaehlen : undefined} disabled={!weg.moeglich} style={rahmen}>
      <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>{verrechnungsWegLabel(weg.weg)}</div>
      {weg.moeglich ? (
        <>
          <div style={{ color: "#9A968C", fontSize: 13.5, lineHeight: 1.5 }}>{weg.beschreibung}</div>
          <div
            style={{
              color: "var(--accent, #C9A227)", fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace", marginTop: 6,
            }}
          >
            Endnote {notenText(weg.noteVorher)} → {notenText(weg.noteNachher)}
          </div>
          {/* Geht die Schrittweite nicht auf, steht die Abweichung hier
              — und zwar die, die wirklich entsteht. */}
          {weg.abweichung !== 0 && (
            <div style={{ color: "#9A968C", fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
              Endnote danach: {notenText(weg.noteNachher)} statt {notenText(weg.noteVorher)} —
              die Bewertungsfelder gehen nur in Schritten von {stufenText(BEWERTUNG_SCHRITT)}.
            </div>
          )}
        </>
      ) : (
        <div style={{ color: "#9A968C", fontSize: 13.5, lineHeight: 1.5 }}>
          Nicht möglich: {weg.grund}
        </div>
      )}
    </button>
  );
}

/**
 * Der Dialog zum Verrechnen des Duell-Zuschlags.
 *
 * Er zeigt VOR dem Schreiben, was passieren wuerde: beide Wege mit
 * konkreten Zahlen, die Endnote davor und danach und die Abweichung,
 * falls die Schrittweite der Bewertungsfelder nicht aufgeht. Passt
 * ein Weg nicht, steht das mit Begruendung da; passt keiner, bleibt
 * allein das eigene Verteilen.
 */
function VerrechnenDialog({ entry, category, onVerrechnen, onSelbstVerteilen, onCancel }) {
  const wege = verrechnungsWege(entry, category);
  const keinerMoeglich = wege.every((w) => !w.moeglich);
  const absatz = { color: "#9A968C", fontSize: 13.5, lineHeight: 1.5, margin: "0 0 16px" };

  return (
    <BottomSheet title="Duell-Zuschlag verrechnen" onClose={onCancel}>
      {(schliessen) => (
        <>
          <p style={absatz}>
            Der Zuschlag {zuschlagText(entryZuschlag(entry))} wandert in deine eigenen
            Bewertungsfelder. Die Endnote bleibt dabei gleich — danach besteht sie
            aber wieder allein aus Kriterien und Bauchgefühl, und der Zuschlag ist 0.
          </p>

          {wege.map((w) => (
            <VerrechnenWeg key={w.weg} weg={w} onWaehlen={() => schliessen(() => onVerrechnen(w))} />
          ))}

          {keinerMoeglich && (
            <p style={absatz}>
              Keiner der beiden Wege passt: die Werte lägen außerhalb von 0 bis 10.
              Bleibt das eigene Verteilen.
            </p>
          )}

          <button
            type="button"
            onClick={() => schliessen(onSelbstVerteilen)}
            style={{
              display: "block", width: "100%", boxSizing: "border-box", textAlign: "left",
              background: "#141416", border: "1px solid #33333a", borderRadius: 8,
              padding: "13px 14px", marginBottom: 16, color: "#EDEAE3",
              fontFamily: "inherit", fontSize: 14, cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>Selbst verteilen</div>
            <div style={{ color: "#9A968C", fontSize: 13.5, lineHeight: 1.5 }}>
              Öffnet das Bewertungsformular mit der Zielnote {notenText(entryScore(entry, category))} als Hinweis.
            </div>
          </button>

          <p style={{ ...absatz, marginBottom: 20 }}>
            Rückgängig machen lässt sich das nicht automatisch — die Bewertung ist
            danach wirklich geändert. Von Hand zurückstellen kannst du sie jederzeit.
          </p>

          <button
            type="button"
            onClick={() => schliessen(onCancel)}
            style={{
              width: "100%", padding: "14px", background: "transparent", color: "#9A968C",
              border: "1px solid #33333a", borderRadius: 8, fontSize: 15,
              fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Abbrechen
          </button>
        </>
      )}
    </BottomSheet>
  );
}

/**
 * Die Sammelfunktion im Daten-Panel: „Alle Duell-Zuschläge
 * verrechnen".
 *
 * Zwei Zustaende, und der erste schreibt nichts: Ohne `plan` steht
 * hier nur der Knopf, der die Vorschau rechnet. Mit `plan` steht da,
 * wie viele Eintraege betroffen waeren, welche uebersprungen werden
 * und warum — und erst darunter der Knopf, der es wirklich tut.
 */
function SammelVerrechnen({ plan, busy, ergebnis, onVorschau, onVerrechnen, onAbbrechen }) {
  const hinweis = { fontSize: 11, color: "#77746c", marginTop: 8, lineHeight: 1.5 };
  const knopf = {
    width: "100%", padding: "12px", borderRadius: 8, fontSize: 14,
    background: "transparent", color: "var(--accent, #C9A227)",
    border: "1px solid var(--accent, #C9A227)", cursor: "pointer", fontWeight: 600,
    opacity: busy ? 0.5 : 1,
  };

  if (!plan) {
    return (
      <div>
        <button type="button" onClick={onVorschau} disabled={busy} style={knopf}>
          Alle Duell-Zuschläge verrechnen
        </button>
        <div style={hinweis}>
          Holt bei jedem Eintrag mit mindestens {VERRECHNEN_MIN_DUELLE} Duellen und einem
          Zuschlag ab {notenText(VERRECHNEN_MIN_BETRAG)} den Zuschlag gleichmäßig in die
          Kriterien und setzt die Elo auf {ELO_START} zurück. Gespielte und gewonnene
          Duelle bleiben gezählt. Zuerst kommt eine Vorschau — geschrieben wird erst
          nach deiner Bestätigung.
        </div>
        {ergebnis && (
          <div style={{ ...hinweis, color: "#9A968C", marginTop: 10 }}>{ergebnis}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: "#EDEAE3", lineHeight: 1.5 }}>
        {sammelVorschauText(plan)}
      </div>

      {plan.uebersprungen.length > 0 && (
        <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none" }}>
          {plan.uebersprungen.map((v) => (
            <li key={v.category + ":" + v.id} style={{ fontSize: 12, color: "#9A968C", lineHeight: 1.5, marginBottom: 6 }}>
              <span style={{ color: "#EDEAE3" }}>{v.titel}</span>
              <span style={{ color: "#55524c" }}>
                {" · "}
                {(CATEGORIES.find((c) => c.key === v.category) || {}).singular || v.category}
              </span>
              <div style={{ fontSize: 11.5, color: "#77746c" }}>{v.grund}</div>
            </li>
          ))}
        </ul>
      )}

      {plan.verrechenbar.length > 0 && (
        <div style={{ ...hinweis, marginTop: 12 }}>
          Die Endnote ändert sich dabei um höchstens {notenText(SAMMEL_MAX_ABWEICHUNG)} — was
          weiter wandern würde, steht oben unter den übersprungenen. Rückgängig machen lässt
          sich das nicht automatisch.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={onVerrechnen}
          disabled={busy || !plan.verrechenbar.length}
          style={{
            ...knopf, flex: 1,
            background: plan.verrechenbar.length ? "var(--accent, #C9A227)" : "transparent",
            color: plan.verrechenbar.length ? "#17171A" : "#55524c",
            border: "1px solid " + (plan.verrechenbar.length ? "var(--accent, #C9A227)" : "#33333a"),
            cursor: plan.verrechenbar.length ? "pointer" : "default",
            opacity: busy ? 0.5 : 1,
          }}
        >
          {plan.verrechenbar.length === 1
            ? "1 Eintrag verrechnen"
            : plan.verrechenbar.length + " Einträge verrechnen"}
        </button>
        <button
          type="button"
          onClick={onAbbrechen}
          disabled={busy}
          style={{
            flex: 1, padding: "12px", borderRadius: 8, fontSize: 14,
            background: "transparent", color: "#9A968C", border: "1px solid #33333a",
            cursor: "pointer", opacity: busy ? 0.5 : 1,
          }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------
   KATEGORIEN — was angezeigt wird und in welcher Reihenfolge

   Der Abschnitt im Daten-Panel. Er aendert ausschliesslich die
   Anzeige dieses Geraets: Es wird nichts geloescht und keine
   Bewertung angefasst. Wer eine Kategorie wieder einschaltet, findet
   ihre Eintraege unveraendert vor.

   Verschoben wird mit zwei Pfeilen je Zeile statt per Ziehen. Auf dem
   Handy ist das der treffsichere Weg, und die App kennt sonst keine
   Ziehgesten — ein neues Bedienmuster nur fuer diese Liste waere
   der teurere Weg zum selben Ergebnis.
   ------------------------------------------------------------ */
function KategorieSchalter({ an, gesperrt, label, onClick }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={an}
      aria-label={label}
      disabled={gesperrt}
      onClick={onClick}
      title={gesperrt ? "Mindestens eine Kategorie muss sichtbar bleiben." : undefined}
      style={{
        width: 26, height: 26, flexShrink: 0, borderRadius: 6,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: an ? "var(--accent, #C9A227)" : "transparent",
        border: "1px solid " + (an ? "var(--accent, #C9A227)" : "#33333a"),
        color: an ? "#17171A" : "#55524c",
        fontSize: 15, lineHeight: 1, fontWeight: 700,
        cursor: gesperrt ? "default" : "pointer",
        opacity: gesperrt ? 0.5 : 1,
      }}
    >
      {an ? "✓" : ""}
    </button>
  );
}

/* Pfeilknopf zum Verschieben. Am Rand der Liste ist er abgeblendet
   und ohne Wirkung — verschwinden soll er nicht, sonst wandern die
   Knoepfe der Nachbarzeilen. */
function KategoriePfeil({ richtung, gesperrt, label, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={gesperrt}
      onClick={onClick}
      style={{
        width: 34, height: 34, flexShrink: 0, borderRadius: 6,
        background: "transparent", border: "1px solid #33333a",
        color: gesperrt ? "#3a3a3f" : "#9A968C",
        fontSize: 13, lineHeight: 1,
        cursor: gesperrt ? "default" : "pointer",
      }}
    >
      {richtung < 0 ? "▲" : "▼"}
    </button>
  );
}

function KategorieAnsichtEinstellung({ ansicht, onAendern }) {
  const rein = normalisiereKategorieAnsicht(ansicht);
  const versteckt = new Set(rein.versteckt);
  const zeilen = geordneteKategorien(rein);
  const sichtbar = zeilen.length - versteckt.size;

  return (
    <div>
      <div style={{ fontSize: 11, color: "#77746c", marginBottom: 12, lineHeight: 1.5 }}>
        Welche Kategorien angezeigt werden und in welcher Reihenfolge. Die
        Einstellung gilt nur auf diesem Gerät und ändert nichts an der
        Sammlung: Ausgeblendete Einträge bleiben gespeichert und sind
        wieder da, sobald die Kategorie zurückkommt. Export und Backup
        enthalten weiterhin alles.
      </div>

      {zeilen.map((c, i) => {
        const an = !versteckt.has(c.key);
        const letzte = an && sichtbar <= 1;
        return (
          <div
            key={c.key}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 0", borderBottom: "1px solid #232326",
            }}
          >
            <KategorieSchalter
              an={an}
              gesperrt={letzte}
              label={c.label + (an ? " ausblenden" : " einblenden")}
              onClick={() => onAendern(schalteKategorie(rein, c.key))}
            />
            <span
              style={{
                flex: 1, minWidth: 0, fontSize: 14,
                color: an ? "#EDEAE3" : "#55524c",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {c.label}
            </span>
            <KategoriePfeil
              richtung={-1}
              gesperrt={i === 0}
              label={c.label + " nach oben"}
              onClick={() => onAendern(verschiebeKategorie(rein, c.key, -1))}
            />
            <KategoriePfeil
              richtung={1}
              gesperrt={i === zeilen.length - 1}
              label={c.label + " nach unten"}
              onClick={() => onAendern(verschiebeKategorie(rein, c.key, 1))}
            />
          </div>
        );
      })}

      <div style={{ fontSize: 11, color: "#77746c", marginTop: 10, lineHeight: 1.5 }}>
        {sichtbar <= 1
          ? "Mindestens eine Kategorie muss sichtbar bleiben — die letzte lässt sich deshalb nicht abwählen."
          : sichtbar + " von " + zeilen.length + " Kategorien sichtbar."}
      </div>

      {rein.versteckt.length > 0 && (
        <button
          type="button"
          onClick={() => onAendern({ reihenfolge: rein.reihenfolge, versteckt: [] })}
          style={{
            width: "100%", marginTop: 12, padding: "10px", borderRadius: 8, fontSize: 13,
            background: "transparent", color: "var(--accent, #C9A227)",
            border: "1px solid var(--accent, #C9A227)", cursor: "pointer", fontWeight: 600,
          }}
        >
          Alle wieder einblenden
        </button>
      )}
    </div>
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
      (f) => imNotenbereich(f.score, lo, hi) && passtZuFiltern(f, entwurf, category)
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
          text={duplikatText(warnung, categoryLabel, category)}
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
function duplikatText(warnung, categoryLabel, category) {
  const gefunden = warnung.treffer.title;
  const gesucht = warnung.kandidat.title;
  /* Drei Faelle, und mehrere koennen zugleich zutreffen: ein
     bewerteter Eintrag darf beim Rewatch gleichzeitig am Schauen sein.
     Die Reihenfolge entscheidet, welcher genannt wird — bewertet vor
     "am Schauen" vor vorgemerkt. Gelesen wird ausschliesslich das,
     was `bekannteEintraege` mitgibt; an der Erkennung des Treffers
     selbst (trefferSchluessel/findeDuplikat) aendert sich nichts. */
  const wo = !warnung.treffer.watchlist
    ? "ist bereits bewertet"
    : warnung.treffer.amSchauen
      ? "ist bereits " + amSchauenLabelKlein(category)
      : "ist bereits vorgemerkt";

  const anders =
    titelSchluessel(gefunden) === titelSchluessel(gesucht)
      ? ""
      : " Gesucht hast du nach „" + gesucht + "“ — das ist derselbe Titel unter anderem Namen.";

  return (
    "„" + gefunden + "“ " + wo + " (" + categoryLabel + ")." + anders +
    " Trotzdem hinzufügen? Sinnvoll ist das etwa bei einem Remake, das du getrennt führen willst."
  );
}

/* ------------------------------------------------------------
   Bausteine der Zeilen in "Watchlist"/"Backlog" und "Am Schauen"

   Beide Zeilen sind gleich aufgebaut: Poster links, rechts daneben
   untereinander der Titel, die Meta-Zeile und zuletzt die Knopfreihe.
   Frueher teilten sich Titel, Angaben und Knoepfe eine einzige Zeile —
   bei 430 px blieb fuer den Titel so wenig uebrig, dass nach etwa zehn
   Zeichen Schluss war ("Shrek 2 - …").
   ------------------------------------------------------------ */

/* Der Titel darf ueber die volle Restbreite laufen und zwei Zeilen
   hoch werden; erst danach kommen die Auslassungspunkte. */
const ZEILEN_TITEL = {
  fontSize: 15,
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
  overflowWrap: "anywhere",
};

/* Die Meta-Zeile darunter — dieselbe gedaempfte Schrift wie bisher. */
const ZEILEN_META = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  color: "#77746c",
  marginTop: 3,
};

/* Die Knopfreihe ganz unten: der breite Knopf nimmt den uebrigen
   Platz, die Symbolknoepfe behalten ihre Kantenlaenge. */
const ZEILEN_KNOPFREIHE = { display: "flex", alignItems: "center", gap: 8, marginTop: 10 };

/* Mindest-Antippflaeche eines reinen Symbolknopfs. */
const SYMBOL_KNOPF_GROESSE = 44;

/* Grundform der Symbolknoepfe in der Knopfreihe: quadratisch, mittig,
   nicht schrumpfend. Farbe und Rahmen setzt jeder Knopf selbst. */
const SYMBOL_KNOPF = {
  flexShrink: 0,
  width: SYMBOL_KNOPF_GROESSE,
  height: SYMBOL_KNOPF_GROESSE,
  minWidth: SYMBOL_KNOPF_GROESSE,
  minHeight: SYMBOL_KNOPF_GROESSE,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
  fontFamily: "inherit",
  background: "transparent",
};

/* Der breite Knopf links in der Knopfreihe — er fuehrt ins
   Bewertungsformular und nimmt den restlichen Platz ein. */
function bewertenKnopfStil(busy) {
  return {
    flex: "1 1 auto",
    minWidth: 0,
    minHeight: SYMBOL_KNOPF_GROESSE,
    padding: "8px 12px",
    borderRadius: 6,
    fontSize: 12.5,
    fontFamily: "inherit",
    cursor: busy ? "default" : "pointer",
    background: "transparent",
    color: "var(--accent, #C9A227)",
    border: "1px solid var(--accent, #C9A227)",
    fontWeight: 600,
    opacity: busy ? 0.5 : 1,
  };
}

/* ============================================================
   STREAMING-VERFÜGBARKEIT

   Wo laeuft ein Titel gerade im Abo? Die Antwort kommt von TMDBs
   Watch-Providers ueber denselben Schluessel, den die Postersuche
   schon nutzt (api/streaming.js) — es kommt kein neuer Dienst dazu.

   Gezeigt werden ausschliesslich Abo-Anbieter (flatrate). Leihen und
   Kaufen bleiben draussen: "Jetzt verfuegbar" soll heissen "ohne
   weiteres Geld anschaltbar".

   Spiele sind ausgenommen — TMDB kennt sie nicht.

   Der Abruf laeuft in einem EIGENEN Effekt, getrennt vom
   automatischen Nachladen von Poster, Jahr, Regie und IMDb-Note. Er
   fasst weder dessen Zaehler noch `items` an; die Nachlade-Schleife
   laeuft dadurch unveraendert weiter und wird von hier weder gebremst
   noch abgebrochen.
   ============================================================ */

/* Die Regionen, die die App kennt. Mehr waeren leicht zu ergaenzen,
   aber jede zusaetzliche ist ein weiterer Satz Abfragen. */
const STREAMING_REGIONEN = ["DE", "IT"];

/* Faellt die Automatik auf nichts Bekanntes, gilt Deutschland. */
const STREAMING_REGION_STANDARD = "DE";

const STREAMING_REGION_SCHLUESSEL = "bewertungsapp.streamingRegion";

/* Die drei Moeglichkeiten der Einstellung. "auto" ist die Vorgabe. */
const STREAMING_REGION_WAHL = [
  { key: "auto", label: "Automatisch" },
  { key: "DE", label: "Deutschland" },
  { key: "IT", label: "Italien" },
];

/* Zeitzonen, aus denen sich das Land eindeutig ergibt. Die Liste ist
   bewusst kurz: Sie muss nur DE und IT erkennen, alles Uebrige faellt
   ohnehin auf den Standard. */
const STREAMING_ZONEN = {
  "Europe/Berlin": "DE",
  "Europe/Busingen": "DE",
  "Europe/Rome": "IT",
  "Europe/Vatican": "IT",
  "Europe/San_Marino": "IT",
};

/**
 * Die Region, die die Automatik ermittelt.
 *
 * Erst die Spracheinstellungen des Geraets mit Landeskennung
 * ("de-DE", "it-IT"), dann die Zeitzone, zuletzt die reine Sprache
 * ("de", "it"). Ergibt keines davon DE oder IT, gilt Deutschland.
 */
function automatischeRegion() {
  try {
    const sprachen = [];
    if (typeof navigator !== "undefined") {
      if (Array.isArray(navigator.languages)) sprachen.push(...navigator.languages);
      if (navigator.language) sprachen.push(navigator.language);
    }

    for (const eintrag of sprachen) {
      const treffer = /[-_]([A-Za-z]{2})$/.exec(String(eintrag || ""));
      const land = treffer ? treffer[1].toUpperCase() : "";
      if (STREAMING_REGIONEN.includes(land)) return land;
    }

    const zone =
      typeof Intl !== "undefined" && Intl.DateTimeFormat
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "";
    if (STREAMING_ZONEN[zone]) return STREAMING_ZONEN[zone];

    for (const eintrag of sprachen) {
      const sprache = String(eintrag || "").slice(0, 2).toUpperCase();
      if (STREAMING_REGIONEN.includes(sprache)) return sprache;
    }
  } catch (e) {
    // Ein Geraet ohne Intl oder navigator: dann eben der Standard.
  }
  return STREAMING_REGION_STANDARD;
}

/** Die gespeicherte Einstellung: "auto", "DE" oder "IT". */
function ladeRegionEinstellung() {
  try {
    const roh = window.localStorage.getItem(STREAMING_REGION_SCHLUESSEL);
    return STREAMING_REGION_WAHL.some((w) => w.key === roh) ? roh : "auto";
  } catch (e) {
    return "auto";
  }
}

function speichereRegionEinstellung(wahl) {
  try {
    window.localStorage.setItem(STREAMING_REGION_SCHLUESSEL, wahl);
  } catch (e) {
    // Ohne localStorage gilt die Einstellung nur fuer diesen Besuch.
  }
}

/** Einstellung -> tatsaechliche Region. */
function regionAus(einstellung) {
  return STREAMING_REGIONEN.includes(einstellung) ? einstellung : automatischeRegion();
}

/* ------------------------------------------------------------
   Der Zwischenspeicher

   Aufbau:
     { fassung, stand: { [id]: { quellArt, quellId,
                                 regionen: { DE: {...}, IT: {...} } } } }

   Je Eintrag UND Region ein eigener Zeitstempel. Damit bleibt beim
   Wechsel der Region die andere erhalten und wird nicht neu geholt.
   ------------------------------------------------------------ */
const STREAMING_SPEICHER = "bewertungsapp.streaming";
const STREAMING_FASSUNG = 1;

/* Ein Ergebnis haelt eine Woche. */
const STREAMING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/* Ein gescheiterter Abruf nur einen Tag — sonst wirkte eine Stoerung
   eine Woche lang nach. */
const STREAMING_TTL_FEHLER_MS = 24 * 60 * 60 * 1000;

/* So oft fragt die App hoechstens nach. Ein Aufruf schafft, was in
   seine Frist passt; der Rest kommt in weiteren Runden. */
const STREAMING_RUNDEN = 12;

function ladeStreaming() {
  try {
    const roh = window.localStorage.getItem(STREAMING_SPEICHER);
    const eintrag = roh ? JSON.parse(roh) : null;
    if (!eintrag || eintrag.fassung !== STREAMING_FASSUNG || !eintrag.stand) return null;
    return eintrag;
  } catch (e) {
    return null;
  }
}

function speichereStreaming(eintrag) {
  try {
    window.localStorage.setItem(STREAMING_SPEICHER, JSON.stringify(eintrag));
  } catch (e) {
    // Ohne localStorage laeuft alles weiter, nur ohne Wochengedaechtnis.
  }
}

/** Der gespeicherte Stand eines Eintrags in einer Region — oder null. */
function streamingStand(streaming, id, region) {
  const eintrag = streaming && streaming.stand ? streaming.stand[id] : null;
  const fuerRegion = eintrag && eintrag.regionen ? eintrag.regionen[region] : null;
  return fuerRegion && typeof fuerRegion.zeit === "number" ? fuerRegion : null;
}

/** Ist der gespeicherte Stand noch brauchbar? */
function streamingFrisch(stand) {
  if (!stand) return false;
  const frist = Array.isArray(stand.anbieter) ? STREAMING_TTL_MS : STREAMING_TTL_FEHLER_MS;
  return Date.now() - stand.zeit < frist;
}

/**
 * Die Anbieter eines Eintrags fuer die Anzeige.
 *
 *   null  — noch nicht bekannt. Die Stelle bleibt leer, statt
 *           umzuspringen (Abfrage laeuft, oder sie ist gescheitert).
 *   []    — kein Abo-Anbieter. Dafuer steht der Chip "nicht im Abo".
 *   [...] — die gefundenen Anbieter.
 */
function anbieterFuer(streaming, id, region) {
  const stand = streamingStand(streaming, id, region);
  return stand && Array.isArray(stand.anbieter) ? stand.anbieter : null;
}

/**
 * Die Anfrage an den Endpunkt: alles, was in einer sichtbaren
 * Kategorie steht, noch keinen frischen Stand hat und nicht zu den
 * Spielen gehoert. Bewertetes und Vorgemerktes gleichermassen — beide
 * zeigen die Anbieter an.
 */
function streamingAnfrage(items, streaming, region, sichtbar = CATEGORY_KEYS) {
  const bekannt = (streaming && streaming.stand) || {};
  const raus = [];

  for (const key of sichtbar) {
    // Spiele bleiben draussen: TMDB kennt sie nicht.
    if (key === "game") continue;
    for (const eintrag of items[key] || []) {
      if (streamingFrisch(streamingStand(streaming, eintrag.id, region))) continue;
      const frueher = bekannt[eintrag.id];
      raus.push({
        id: eintrag.id,
        category: key,
        title: eintrag.title,
        // Die Kennung aus einem frueheren Durchgang spart die Suche.
        // Sie haengt nicht an der Region und gilt deshalb fuer beide.
        quellArt: (frueher && frueher.quellArt) || null,
        quellId: (frueher && frueher.quellId) || null,
      });
    }
  }
  return raus;
}

/**
 * Die Antwort in den Zwischenspeicher einarbeiten.
 *
 * Geschrieben wird ausschliesslich die abgefragte Region; was zur
 * anderen gespeichert ist, bleibt unangetastet.
 */
function streamingEinarbeiten(alt, region, treffer) {
  const stand = { ...((alt && alt.stand) || {}) };
  const jetzt = Date.now();

  for (const id of Object.keys(treffer || {})) {
    const e = treffer[id] || {};
    const vorher = stand[id] || {};
    /* Drei Faelle:
         gefunden                       -> die Liste (auch die leere)
         nicht gefunden, keine Kennung  -> TMDB kennt den Titel nicht;
                                           als "nicht im Abo" gueltig
         nicht gefunden, mit Kennung    -> der Abruf ist gescheitert;
                                           kein Ergebnis, kurze Frist */
    const anbieter = e.gefunden
      ? Array.isArray(e.anbieter)
        ? e.anbieter
        : []
      : e.quellId
        ? null
        : [];

    stand[id] = {
      quellArt: e.quellArt || vorher.quellArt || null,
      quellId: e.quellId || vorher.quellId || null,
      regionen: { ...(vorher.regionen || {}), [region]: { zeit: jetzt, anbieter } },
    };
  }

  return { fassung: STREAMING_FASSUNG, stand };
}

/* ------------------------------------------------------------
   Anzeige
   ------------------------------------------------------------ */

/* Ein Anbieter-Chip im vorhandenen Chip-Stil (vgl. FilterChip):
   abgerundet, gedaempfte Schrift, duenner Rahmen. Das Logo steht als
   kleines Quadrat davor; fehlt es, bleibt nur der Name. */
function AnbieterChip({ anbieter, klein = false }) {
  return (
    <span
      title={anbieter.name}
      style={{
        display: "inline-flex", alignItems: "center", gap: klein ? 4 : 6,
        padding: klein ? "3px 7px" : "6px 10px",
        borderRadius: 6,
        fontSize: klein ? 10.5 : 12.5,
        background: "transparent",
        color: "#9A968C",
        border: "1px solid #33333a",
        maxWidth: "100%",
      }}
    >
      {anbieter.logo && (
        <img
          src={anbieter.logo}
          alt=""
          loading="lazy"
          style={{
            width: klein ? 12 : 16, height: klein ? 12 : 16,
            borderRadius: 3, flexShrink: 0, objectFit: "cover",
          }}
        />
      )}
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {anbieter.name}
      </span>
    </span>
  );
}

/* Kein Abo-Anbieter gefunden: ein einzelner, gedaempfter Chip. Er ist
   eine Aussage — "hier laeuft gerade nichts" — und deshalb nicht
   dasselbe wie eine leere Stelle. */
function KeinAboChip({ klein = false }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center",
        padding: klein ? "3px 7px" : "6px 10px",
        borderRadius: 6,
        fontSize: klein ? 10.5 : 12.5,
        background: "transparent",
        color: "#55524c",
        border: "1px dashed #2A2A2E",
      }}
    >
      nicht im Abo
    </span>
  );
}

/* Wie viele Chips eine Listenzeile hoechstens traegt. Was darueber
   hinausgeht, steht als "+N" dahinter. */
const ANBIETER_IN_ZEILE = 3;

/**
 * Die Anbieter unter der Meta-Zeile einer Listenzeile.
 *
 * `anbieter === null` heisst "noch nicht bekannt" — dann bleibt die
 * Stelle leer, statt beim Eintreffen der Antwort umzuspringen.
 */
function AnbieterZeile({ anbieter }) {
  if (!Array.isArray(anbieter)) return null;
  const gezeigt = anbieter.slice(0, ANBIETER_IN_ZEILE);
  const rest = anbieter.length - gezeigt.length;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
      {gezeigt.length === 0 ? (
        <KeinAboChip klein />
      ) : (
        gezeigt.map((a) => <AnbieterChip key={a.id} anbieter={a} klein />)
      )}
      {rest > 0 && (
        <span
          title={anbieter.slice(ANBIETER_IN_ZEILE).map((a) => a.name).join(", ")}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10.5, color: "#77746c", padding: "3px 2px",
          }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

/**
 * Die Karte in der Detailansicht: Beschriftung, Regionskuerzel,
 * darunter die Anbieter als Chips.
 *
 * Solange nichts bekannt ist, gibt es die Karte gar nicht — die Stelle
 * bleibt leer, statt einen Platzhalter zu zeigen, der gleich wieder
 * verschwindet.
 */
function VerfuegbarKarte({ anbieter, region }) {
  if (!Array.isArray(anbieter)) return null;

  return (
    <div
      style={{
        background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 12,
        padding: 16, marginBottom: 20,
      }}
    >
      <div
        style={{
          fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)",
          fontFamily: "'JetBrains Mono', monospace", marginBottom: 10,
        }}
      >
        JETZT VERFÜGBAR{" "}
        <span style={{ color: "#77746c" }}>{region}</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {anbieter.length === 0 ? (
          <KeinAboChip />
        ) : (
          anbieter.map((a) => <AnbieterChip key={a.id} anbieter={a} />)
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------
   Die Einstellung im Daten-Panel.
   ------------------------------------------------------------ */
function RegionEinstellung({ wahl, erkannt, onAendern }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#77746c", marginBottom: 12, lineHeight: 1.5 }}>
        Für welches Land die Streaming-Verfügbarkeit gilt. Angezeigt werden
        nur Abo-Anbieter, nicht Leihen oder Kaufen. Die Einstellung gilt
        nur auf diesem Gerät und ändert nichts an der Sammlung.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {STREAMING_REGION_WAHL.map((w) => {
          const aktiv = wahl === w.key;
          return (
            <button
              key={w.key}
              type="button"
              aria-pressed={aktiv}
              onClick={() => onAendern(w.key)}
              style={{
                flex: "1 1 90px", padding: "10px", borderRadius: 6, fontSize: 13,
                cursor: "pointer", fontWeight: aktiv ? 700 : 400,
                background: aktiv ? "var(--accent, #C9A227)" : "transparent",
                color: aktiv ? "#17171A" : "#9A968C",
                border: "1px solid " + (aktiv ? "var(--accent, #C9A227)" : "#33333a"),
              }}
            >
              {w.label}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: "#77746c", marginTop: 10, lineHeight: 1.5 }}>
        {wahl === "auto"
          ? "Aus Spracheinstellung bzw. Zeitzone dieses Geräts erkannt: " + erkannt +
            ". Wird weder DE noch IT erkannt, gilt Deutschland."
          : "Fest auf " + erkannt + " gestellt."}
        {" Die Anbieter werden je Eintrag und Region höchstens einmal pro Woche neu geholt."}
      </div>
    </div>
  );
}

/* ============================================================
   WATCHLIST — vorgemerkt, noch ohne Note
   ============================================================ */
function WatchlistZeile({ eintrag, busy, merkliste, amSchauenLabelText, anbieter = null, onAmSchauen, onBewerten, onEntfernen, reihe = 0, vorrang = false }) {
  /* Jahr, Laufzeit und Vormerkdatum in einer Zeile. Was nicht bekannt
     ist — bei Spielen etwa die Laufzeit —, faellt samt Trennzeichen
     weg. */
  const meta = zeilenMeta(eintrag);
  const entfernenText = "Aus " + (merkliste === "Backlog" ? "dem" : "der") + " " + merkliste + " entfernen";
  return (
    <div className="listen-eintrag" style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 4px", borderBottom: "1px solid #232326", animationDelay: listenVersatz(reihe) }}>
      <Poster url={eintrag.poster} title={eintrag.title} size={34} vorrang={vorrang} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={ZEILEN_TITEL}>{eintrag.title}</div>
        {meta && <div style={ZEILEN_META}>{meta}</div>}
        {/* Wo der Titel gerade im Abo laeuft — hoechstens drei Chips,
            der Rest als "+N". Solange nichts bekannt ist, steht hier
            gar nichts (siehe AnbieterZeile). */}
        <AnbieterZeile anbieter={anbieter} />
        {/* Die Bedienelemente stehen unter dem Titel statt neben ihm:
            nebeneinander blieb bei 430 px weder fuer den Titel noch
            fuer das Hinzufuegedatum genug Platz. */}
        <div style={ZEILEN_KNOPFREIHE}>
          <button onClick={onBewerten} disabled={busy} style={bewertenKnopfStil(busy)}>
            ✓ Ansehen
          </button>
          {/* Der Einstieg ins "Am Schauen" fuer vorgemerkte Eintraege.
              Sie haben keine Detailansicht, in der der Schalter sonst
              steht — und gerade sie sind der Hauptfall: ein Titel, den
              man von der Watchlist angefangen hat. Ausgeschaltet wird
              im eigenen Reiter, hier steht nie ein Eintrag, der bereits
              am Schauen ist. */}
          <button
            onClick={onAmSchauen}
            disabled={busy}
            title={amSchauenLabelText + " beginnen"}
            aria-label={eintrag.title + ": " + amSchauenLabelText + " beginnen"}
            style={{
              ...SYMBOL_KNOPF,
              borderRadius: 6, fontSize: 12,
              color: "#9A968C", border: "1px solid #33333a",
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
            }}
          >
            ▶
          </button>
          <button
            onClick={onEntfernen}
            disabled={busy}
            title={entfernenText}
            aria-label={eintrag.title + " aus " + (merkliste === "Backlog" ? "dem" : "der") + " " + merkliste + " entfernen"}
            style={{
              ...SYMBOL_KNOPF,
              border: "none", color: "#d9736a", fontSize: 18,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
            }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   AM SCHAUEN — angefangen, noch nicht fertig

   Gleicher Aufbau wie die Watchlist-Zeile — Titel, Meta-Zeile,
   Knopfreihe —, dazwischen der Fortschritt. Der erscheint nur, wo die
   Episodenzahlen je Staffel vorliegen (siehe fortschrittStand); bei
   Filmen, bei Spielen und bei Eintraegen ohne diese Daten stehen
   Titel und Meta-Zeile einfach ohne Zusatz da.

   In der Knopfreihe steht links der Bewerten-Knopf (nur an vorgemerkten
   Zeilen, siehe kannBewerten), rechts "+1" und das Beenden-Kreuz als
   Symbolknoepfe.
   ============================================================ */
function AmSchauenZeile({ eintrag, busy, akzent, onWeiter, onStand, onAus, onBewerten, ausLabel, bewertenLabel, reihe = 0, vorrang = false }) {
  const stand = fortschrittStand(eintrag);
  /* Die Eingabe von Hand — gebraucht, wenn ein Titel mitten in einer
     Staffel aufgenommen wird. Sie oeffnet sich mit einem Druck auf den
     Text und schliesst sich nach dem Uebernehmen wieder. */
  const [offen, setOffen] = useState(false);
  const [staffelText, setStaffelText] = useState("");
  const [folgeText, setFolgeText] = useState("");

  function oeffnen() {
    if (!stand) return;
    setStaffelText(String(stand.staffel));
    setFolgeText(String(stand.folge));
    setOffen(true);
  }

  function uebernehmen() {
    const staffel = Math.round(Number(staffelText));
    const folge = Math.round(Number(folgeText));
    setOffen(false);
    if (!Number.isFinite(staffel) || !Number.isFinite(folge)) return;
    if (staffel < 1 || folge < 0) return;
    if (staffel === stand.staffel && folge === stand.folge) return;
    onStand(staffel, folge);
  }

  // Weiter geht es nur, solange es etwas weiterzuzaehlen gibt.
  const weiterMoeglich = !busy && !!fortschrittWeiter(stand);
  const anteil = stand ? Math.min(1, stand.folge / stand.gesamt) : 0;
  const meta = zeilenMeta(eintrag);

  /* Der Weg direkt ins Bewertungsformular — bisher fuehrte er nur ueber
     "Am Schauen beenden", die Watchlist und dort "✓ Ansehen".
     Er steht ausschliesslich an vorgemerkten Zeilen: ein bereits
     bewerteter Eintrag hat seine Werte schon, und ein leeres Formular
     wuerde sie beim Speichern ueberschreiben. Seine Note aendert man
     wie bisher in der Detailansicht. */
  const kannBewerten = !!onBewerten && istVorgemerkt(eintrag);

  const zahlenfeld = {
    width: 54, boxSizing: "border-box", background: "#141416",
    border: "1px solid #33333a", borderRadius: 6, padding: "6px 8px",
    color: "#EDEAE3", fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
  };

  return (
    <div className="listen-eintrag" style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 4px", borderBottom: "1px solid #232326", animationDelay: listenVersatz(reihe) }}>
      <Poster url={eintrag.poster} title={eintrag.title} size={34} vorrang={vorrang} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={ZEILEN_TITEL}>{eintrag.title}</div>
        {meta && <div style={ZEILEN_META}>{meta}</div>}
        {stand && !offen && (
          /* Balken und Stand in einer Zeile: der Balken nimmt den
             Platz, der uebrig bleibt, der Text steht in fester Breite
             daneben. */
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <div
              style={{ flex: "1 1 auto", minWidth: 0, height: 3, borderRadius: 2, background: "#2A2A2E", overflow: "hidden" }}
              role="progressbar"
              aria-valuenow={stand.folge}
              aria-valuemin={0}
              aria-valuemax={stand.gesamt}
              aria-label={"Staffel " + stand.staffel}
            >
              <div style={{ width: Math.round(anteil * 100) + "%", height: "100%", background: akzent }} />
            </div>
            <button
              onClick={oeffnen}
              title="Staffel und Folge von Hand setzen"
              style={{
                flexShrink: 0, background: "transparent", border: "none", padding: 0,
                color: "#9A968C", fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {fortschrittText(stand)}
            </button>
          </div>
        )}
        {stand && offen && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 11, color: "#77746c", fontFamily: "'JetBrains Mono', monospace" }}>
              S
              <input
                type="number"
                min="1"
                value={staffelText}
                onChange={(e) => setStaffelText(e.target.value)}
                aria-label="Staffel"
                style={{ ...zahlenfeld, marginLeft: 4 }}
              />
            </label>
            <label style={{ fontSize: 11, color: "#77746c", fontFamily: "'JetBrains Mono', monospace" }}>
              F
              <input
                type="number"
                min="0"
                value={folgeText}
                onChange={(e) => setFolgeText(e.target.value)}
                aria-label="Folge"
                style={{ ...zahlenfeld, marginLeft: 4 }}
              />
            </label>
            <button
              onClick={uebernehmen}
              disabled={busy}
              style={{
                padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: busy ? "default" : "pointer",
                background: "transparent", color: akzent, border: "1px solid " + akzent,
                fontWeight: 600, opacity: busy ? 0.5 : 1,
              }}
            >
              Übernehmen
            </button>
            <button
              onClick={() => setOffen(false)}
              style={{
                padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                background: "transparent", color: "#9A968C", border: "1px solid #33333a",
              }}
            >
              Abbrechen
            </button>
          </div>
        )}
        {/* Wie in der Watchlist-Zeile: die Knoepfe stehen unter dem
            Titel, damit ihm die volle Restbreite bleibt. Fehlt der
            breite Bewerten-Knopf, haelt ein Platzhalter die
            Symbolknoepfe am rechten Rand. */}
        <div style={ZEILEN_KNOPFREIHE}>
          {kannBewerten ? (
            <button onClick={onBewerten} disabled={busy} style={bewertenKnopfStil(busy)}>
              {bewertenLabel || "✓ Bewerten"}
            </button>
          ) : (
            <div style={{ flex: "1 1 auto", minWidth: 0 }} />
          )}
          {stand && !offen && (
            <button
              onClick={onWeiter}
              disabled={!weiterMoeglich}
              title="Eine Folge weiter"
              aria-label={eintrag.title + ": eine Folge weiter"}
              style={{
                ...SYMBOL_KNOPF,
                borderRadius: 6, fontSize: 13, fontWeight: 700,
                color: weiterMoeglich ? akzent : "#3a3a40",
                border: "1px solid " + (weiterMoeglich ? akzent : "#232326"),
                cursor: weiterMoeglich ? "pointer" : "default",
              }}
            >
              +1
            </button>
          )}
          <button
            onClick={onAus}
            disabled={busy}
            title={ausLabel + " beenden"}
            aria-label={eintrag.title + ": " + ausLabel + " beenden"}
            style={{
              ...SYMBOL_KNOPF,
              border: "none", color: "#9A968C", fontSize: 18,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
            }}
          >
            ×
          </button>
        </div>
      </div>
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
const PROFIL_TITEL = { movie: 12, series: 12, anime: 8, kids: 12, adultanim: 12, doku: 12, comedy: 12 };

/* So viele Vorschlaege stehen am Ende in der Liste. Der Server liefert
   deutlich mehr (rund 40) — der Rest ist Vorrat und rueckt nach, sobald
   ein Vorschlag auf der Watchlist landet. */
const EMPFEHLUNGEN_SICHTBAR = { movie: 15, series: 10, anime: 10, kids: 10, adultanim: 10, doku: 10, comedy: 10 };

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

/**
 * Ist der gespeicherte Stand noch brauchbar?
 *
 * Neben der Frist zaehlt, welche Kategorien beim letzten Durchgang
 * ueberhaupt gefragt wurden: Wer eine ausgeblendete Kategorie wieder
 * einschaltet, soll ihre Hinweise nicht erst eine Woche spaeter
 * bekommen. Aeltere Staende ohne dieses Feld stammen aus der Zeit, in
 * der immer alles gefragt wurde — sie gelten als vollstaendig.
 */
function fortsetzungenFrisch(eintrag, sichtbar = CATEGORY_KEYS) {
  if (!eintrag || eintrag.fassung !== FORTSETZUNGS_FASSUNG) return false;
  const frist = eintrag.fehler ? FORTSETZUNGS_TTL_FEHLER_MS : FORTSETZUNGS_TTL_MS;
  if (Date.now() - eintrag.zeit >= frist) return false;
  const abgedeckt = Array.isArray(eintrag.kategorien) ? eintrag.kategorien : FORTSETZUNGS_KATEGORIEN;
  return FORTSETZUNGS_KATEGORIEN.filter((k) => sichtbar.includes(k)).every((k) =>
    abgedeckt.includes(k)
  );
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
function fortsetzungsAnfrage(items, alt, sichtbar = CATEGORY_KEYS) {
  const bekannt = (alt && alt.stand) || {};
  const raus = [];

  /* Ausgeblendete Kategorien bleiben aussen vor: Ihr Hinweis waere
     nirgends zu sehen, und der Abgleich kostet je Serie einen
     externen Aufruf. */
  for (const key of FORTSETZUNGS_KATEGORIEN.filter((k) => sichtbar.includes(k))) {
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

function RatingForm({ category, categoryLabel, hinweis, initialTitle, initialPoster, initialValues, initialPersonal, initialSeasons, onSave, onCancel }) {
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

      {/* Ein zusaetzlicher Hinweistext — mehr aendert sich am Formular
          nicht. Er steht nur da, wenn es aus dem Verrechnen-Dialog
          heraus zum eigenen Verteilen geoeffnet wurde. */}
      {hinweis && (
        <div
          style={{
            background: "#141416", border: "1px dashed var(--accent, #C9A227)", borderRadius: 8,
            padding: 12, marginBottom: 16, fontSize: 12.5, color: "#9A968C", lineHeight: 1.5,
          }}
        >
          {hinweis}
        </div>
      )}

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
   ERSTMALS GESCHAUT — die Karte in der Detailansicht.

   Sie hat zwei Zustaende, und der Unterschied ist der ganze Punkt:

     - Ein eigenes Datum steht am Eintrag: normale Textfarbe, kein
       Zusatz.
     - Keines eingetragen: das Bewertungsdatum in gedaempfter Farbe,
       dahinter klein "(Bewertungsdatum)" — damit sichtbar bleibt,
       dass es ein Rueckfall ist und keine Angabe.

   Fehlt beides — Altbestand ohne Bewertungsdatum —, laedt die Karte
   zum Eintragen ein, statt ein Datum zu erfinden.

   Aufbau und Masse wie die IMDb-Karte daneben, samt Stiftknopf
   rechts.
   ------------------------------------------------------------ */
function ErstsichtungKarte({ zeit, eigen, onBearbeiten }) {
  return (
    <span
      title={
        eigen
          ? "Wann du den Titel zum ersten Mal gesehen hast"
          : "Kein eigenes Datum eingetragen — es gilt das Bewertungsdatum"
      }
      style={{
        display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap",
        background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 8,
        padding: "6px 12px", maxWidth: "100%",
      }}
    >
      {/* Die Beschriftung bleibt in einer Zeile; wird es eng, rutscht
          lieber der Zusatz dahinter um — ein umgebrochenes
          "ERSTMALS / GESCHAUT" liest sich schlechter. */}
      <span
        style={{
          fontSize: 11, letterSpacing: 1, color: "#9A968C",
          fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap",
        }}
      >
        ERSTMALS GESCHAUT
      </span>
      {zeit ? (
        <>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700,
              color: eigen ? "#EDEAE3" : "#77746c",
            }}
          >
            {datumKurz(zeit)}
          </span>
          {!eigen && (
            <span style={{ fontSize: 10.5, color: "#77746c" }}>(Bewertungsdatum)</span>
          )}
        </>
      ) : (
        <span style={{ fontSize: 12.5, color: "#77746c" }}>eintragen</span>
      )}
      <StiftKnopf title="Erstsichtung bearbeiten" onClick={onBearbeiten} />
    </span>
  );
}

/* ------------------------------------------------------------
   Das Datumsfeld dazu.

   "Speichern" schreibt den Wert, "Leeren" setzt auf den
   Rueckfallwert zurueck — es loescht ausschliesslich dieses eine
   Feld und fasst weder die Bewertung noch das Bewertungsdatum an.
   ------------------------------------------------------------ */
function ErstsichtungEditor({ zeit, eigen, busy, onSave, onCancel }) {
  const [wert, setWert] = useState(eigen ? datumFeldWert(zeit) : "");

  function speichern() {
    // Ein leeres Feld heisst dasselbe wie "Leeren".
    onSave(wert.trim() ? feldWertZuZeit(wert) : null);
  }

  return (
    <div style={{ background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ ...angabenLabel, marginBottom: 12 }}>ERSTMALS GESCHAUT</div>

      <label style={angabenLabel} htmlFor="erstsichtung-datum">DATUM</label>
      <input
        id="erstsichtung-datum"
        type="date"
        value={wert}
        onChange={(e) => setWert(e.target.value)}
        style={{ ...angabenFeld, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}
      />

      <div style={{ fontSize: 11.5, color: "#77746c", lineHeight: 1.5, marginTop: 10 }}>
        Ohne eigenes Datum zeigt die App das Bewertungsdatum. Der Sehzähler
        und weitere Durchgänge ändern diesen Wert nicht — festgehalten wird
        die Erstsichtung.
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button
          onClick={speichern}
          disabled={busy}
          style={{
            flex: "1 1 120px", padding: "13px", background: "var(--accent, #C9A227)", color: "#17171A",
            border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          Speichern
        </button>
        <button
          onClick={() => onSave(null)}
          disabled={busy || !eigen}
          title={eigen ? "Eigenes Datum entfernen" : "Es ist kein eigenes Datum eingetragen"}
          style={{
            padding: "13px 18px", background: "transparent", color: "#9A968C",
            border: "1px solid #33333a", borderRadius: 8,
            cursor: busy || !eigen ? "default" : "pointer", fontSize: 15,
            opacity: busy || !eigen ? 0.5 : 1,
          }}
        >
          Leeren
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

/**
 * Der Schalter "Am Schauen" (bei Spielen "Am Spielen").
 *
 * Er steht in der Detailansicht eines bewerteten Eintrags. Vorgemerkte
 * Eintraege haben keine Detailansicht — dort sitzt stattdessen der
 * kleine Startknopf an der Watchlist-Zeile (siehe WatchlistZeile).
 *
 * Der Schalter ist die einzige Stelle, die das Kennzeichen aendert:
 * Es wird nirgends automatisch gesetzt und nirgends automatisch
 * geloescht.
 */
function AmSchauenSchalter({ an, label, busy, onChange }) {
  return (
    <button
      onClick={() => !busy && onChange(!an)}
      disabled={busy}
      role="switch"
      aria-checked={an}
      title={an ? label + " beenden" : label + " beginnen"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderRadius: 999, fontFamily: "inherit", fontSize: 13,
        background: "transparent",
        color: an ? "var(--accent, #C9A227)" : "#9A968C",
        border: "1px solid " + (an ? "var(--accent, #C9A227)" : "#33333a"),
        fontWeight: an ? 700 : 400,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.5 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8, height: 8, borderRadius: 999, flexShrink: 0,
          background: an ? "var(--accent, #C9A227)" : "#3a3a40",
        }}
      />
      {label}
    </button>
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

function DetailView({ entry, category, singular, busy, anbieter, region, onBack, onEdit, onDelete, onSaveAngaben, onSaveErstsichtung, onSaveWatchCount, onAmSchauen, onEloZuruecksetzen, onVerrechnen }) {
  const criteria = criteriaFor(category);
  const criteriaScore = entryCriteriaScore(entry, category);
  const staffeln = hasSeasons(entry) ? entry.seasons : null;
  const [angabenOffen, setAngabenOffen] = useState(false);
  const [erstsichtungOffen, setErstsichtungOffen] = useState(false);

  /* Wann zum ersten Mal geschaut — eigenes Datum, sonst der Rueckfall
     auf das Bewertungsdatum (siehe erstsichtung). */
  const ersteSicht = erstsichtung(entry);

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

          {/* Wann der Titel zum ersten Mal gesehen wurde. Steht neben
              der IMDb-Karte und ist genauso gebaut: Beschriftung,
              Wert, Stiftknopf. Bei Spielen ebenso — auch dort gibt es
              ein erstes Mal. */}
          <ErstsichtungKarte
            zeit={ersteSicht.zeit}
            eigen={ersteSicht.eigen}
            onBearbeiten={() => setErstsichtungOffen(true)}
          />
        </div>

        {erstsichtungOffen && (
          <ErstsichtungEditor
            zeit={ersteSicht.zeit}
            eigen={ersteSicht.eigen}
            busy={busy}
            onSave={(wert) => { onSaveErstsichtung(wert); setErstsichtungOffen(false); }}
            onCancel={() => setErstsichtungOffen(false)}
          />
        )}

        {/* Wo der Titel gerade im Abo laeuft. Die Karte erscheint erst,
            wenn eine Antwort da ist — solange bleibt die Stelle leer,
            statt umzuspringen. Bei Spielen gibt es sie nie. */}
        <VerfuegbarKarte anbieter={anbieter} region={region} />

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
          {/* Der Rewatch-Fall: ein bewerteter Eintrag darf gleichzeitig
              am Schauen sein. Er bleibt dabei in der Rangliste und
              steht zusaetzlich im eigenen Reiter. */}
          <AmSchauenSchalter
            an={istAmSchauen(entry)}
            label={amSchauenLabel(category)}
            busy={busy}
            onChange={(an) => onAmSchauen(an)}
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

          {/* Der Zuschlag aus den Duellen. Er steht nur da, wo es
              ueberhaupt ein Duell gab — sonst waere es eine Zeile mit
              einer Null, die nichts erzaehlt. */}
          {entryDuels(entry) > 0 && (
            <div
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 0", borderTop: "1px solid #232326",
              }}
            >
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>Duell-Zuschlag</div>
                <div style={{ fontSize: 11.5, color: "#77746c", marginTop: 2 }}>
                  {entryDuels(entry)} {entryDuels(entry) === 1 ? "Duell" : "Duelle"} gespielt
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700 }}>
                  {zuschlagText(entryZuschlag(entry))}
                </span>
                {/* Der Zuschlag laesst sich in die eigenen
                    Bewertungsfelder holen — aber erst, wenn genug
                    Duelle dahinterstehen und der Betrag es lohnt
                    (siehe verrechnenAngeboten). */}
                {verrechnenAngeboten(entry) && (
                  <button
                    onClick={onVerrechnen}
                    disabled={busy}
                    title="Den Duell-Zuschlag in die eigenen Bewertungsfelder übertragen. Die Endnote bleibt dabei gleich."
                    style={{
                      background: "transparent", border: "1px solid #33333a", borderRadius: 8,
                      color: "#9A968C", fontSize: 11.5, cursor: busy ? "default" : "pointer",
                      padding: "5px 10px", fontFamily: "inherit", opacity: busy ? 0.5 : 1,
                    }}
                  >
                    Verrechnen
                  </button>
                )}
                <button
                  onClick={onEloZuruecksetzen}
                  disabled={busy}
                  title="Duell-Zuschlag dieses Eintrags auf 0 zurücksetzen. Die gespielten Duelle bleiben gezählt."
                  style={{
                    background: "transparent", border: "1px solid #33333a", borderRadius: 8,
                    color: "#9A968C", fontSize: 11.5, cursor: busy ? "default" : "pointer",
                    padding: "5px 10px", fontFamily: "inherit", opacity: busy ? 0.5 : 1,
                  }}
                >
                  Zurücksetzen
                </button>
              </div>
            </div>
          )}

          {/* Direkt unter der Zuschlag-Zeile: der Hinweis, dass die
              Bewertung selbst nicht mehr zu passen scheint. Er steht
              nur, wenn die Schwelle erreicht ist (siehe
              entryAuffaellig) — sonst waere er ein Alarm ohne Anlass.
              Ohne gespielte Duelle kann das nie zutreffen, der Hinweis
              steht also nie ohne die Zeile darueber. */}
          {entryAuffaellig(entry) && (
            <div
              style={{
                display: "flex", alignItems: "flex-start", gap: 9,
                background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 8,
                padding: 12, marginBottom: 4,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", height: 19, flexShrink: 0 }}>
                <IconWarndreieck farbe="var(--accent, #C9A227)" groesse={14} />
              </span>
              <div style={{ fontSize: 12.5, color: "#9A968C", lineHeight: 1.5 }}>
                {auffaelligText(entryZuschlag(entry))}
              </div>
            </div>
          )}
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
   niedrigste Endnote. Unbewertete Einträge fließen nicht ein.

   Gerechnet wird mit der angezeigten, auf 0–10 begrenzten Note: Die
   Skala geht bis 10, ein Höchstwert von 10,21 wäre auf ihr schlicht
   falsch. Sortiert wird davon unberührt weiter mit dem unbegrenzten
   Wert — das entscheidet `sortWert` oben, nicht diese Funktion. */
function statsFor(list) {
  const noten = list
    .map((f) => f.score)
    .filter((v) => typeof v === "number")
    .map(anzeigeNote);
  const count = list.length;
  const avg = noten.length ? noten.reduce((s, v) => s + v, 0) / noten.length : 0;
  const max = noten.length ? Math.max(...noten) : 0;
  const min = noten.length ? Math.min(...noten) : 0;
  return { count, avg, max, min };
}

/* Die Bereichsauswahl ueber der Statistik: "Alle" und dahinter die
   sichtbaren Kategorien in ihrer Reihenfolge. */
function statsBereiche(kategorien) {
  return [{ key: "all", label: "Alle" }, ...kategorien.map((c) => ({ key: c.key, label: c.label }))];
}

/* ============================================================
   EINE AUSWAHL FUER DEN GANZEN TAB

   Der Tab hatte vier Kategorie-Auswahlen: bei der Gesamtstatistik,
   im Zeitaufwand, in der Detailauswertung und bei der Top 10. Wer
   eine davon umstellte, sah die anderen Abschnitte weiter auf einem
   anderen Stand — und musste, um eine Kategorie durchgehend zu
   betrachten, viermal dasselbe tippen.

   Es gibt deshalb nur noch eine Auswahl, ganz oben und beim Scrollen
   sichtbar. Sie kann mehrere Kategorien tragen (das konnte bisher
   nur die Top 10) und kennt weiterhin "Alle".

   Der Zustand ist bewusst schlicht: `null` heisst "Alle", sonst
   steht dort eine Menge von Kategorie-Schluesseln. Leer wird die
   Menge nie — wer die letzte Kategorie abwaehlt, landet wieder bei
   "Alle". Ein Tab, der ueber nichts rechnet, waere nur eine Wand aus
   leeren Abschnitten.

   NICHT dabei sind zwei Abschnitte, und das ist so gewollt:
   "Bewertung pruefen" und der Jahresrueckblick rechnen wie bisher
   ueber alle sichtbaren Kategorien. Der eine sammelt ein, was
   irgendwo nachzusehen waere, der andere zaehlt ein ganzes Jahr —
   beide waeren mit einem Kategorie-Filter etwas anderes als das,
   wofuer sie da sind.
   ============================================================ */

/** Aus dem Auswahlzustand die Kategorien machen, ueber die gerechnet wird. */
function statsAuswahlKategorien(auswahl, kategorien) {
  if (!auswahl) return kategorien;
  const gewaehlt = kategorien.filter((c) => auswahl.has(c.key));
  /* Eine Auswahl kann Kategorien enthalten, die inzwischen
     ausgeblendet sind. Bleibt dadurch nichts uebrig, gilt wieder
     "Alle" — genauso, wie es die Abschnitte bisher einzeln taten. */
  return gewaehlt.length ? gewaehlt : kategorien;
}

/**
 * Steht die Auswahl auf "Alle"?
 *
 * Nur der Knopf "Alle" fuehrt dahin — wer alle Kategorien einzeln
 * antippt, hat sie einzeln gewaehlt, und ein Tippen soll immer nur
 * den einen Knopf umschalten, den es trifft. Die eine Ausnahme:
 * bleibt von der Auswahl nichts Sichtbares uebrig, gilt wieder
 * "Alle" — dieselbe Rueckfallregel wie in statsAuswahlKategorien.
 */
function statsIstAlle(auswahl, kategorien) {
  return !auswahl || !kategorien.some((c) => auswahl.has(c.key));
}

/**
 * Ein Tippen auf einen Knopf der Auswahl.
 *
 * "Alle" setzt zurueck. Eine Kategorie aus "Alle" heraus waehlt genau
 * diese eine; danach kommen weitere dazu oder fallen weg. Faellt die
 * letzte weg, ist wieder "Alle" an der Reihe.
 */
function statsAuswahlUmschalten(auswahl, key) {
  if (key === "all") return null;
  if (!auswahl) return new Set([key]);
  const neu = new Set(auswahl);
  if (neu.has(key)) neu.delete(key);
  else neu.add(key);
  return neu.size ? neu : null;
}

/* Die Auswahlleiste selbst. Sie bleibt beim Scrollen am oberen Rand
   stehen, damit immer dasteht, worauf sich die Zahlen darunter
   beziehen. Der Hintergrund ist der der Seite — sonst schoebe sich
   der Inhalt sichtbar unter den Knoepfen durch. */
function StatsKategorieAuswahl({ kategorien, auswahl, onUmschalten }) {
  const bereiche = statsBereiche(kategorien);
  const alle = statsIstAlle(auswahl, kategorien);

  return (
    <div
      style={{
        position: "sticky", top: 0, zIndex: 5,
        background: "#17171A", borderBottom: "1px solid #232326",
        padding: "12px 0 10px", marginBottom: 18,
      }}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {bereiche.map((b) => {
          const aktiv = b.key === "all" ? alle : !alle && auswahl.has(b.key);
          const farbe = b.key === "all" ? "#C9A227" : accentFor(b.key);
          return (
            <button
              key={b.key}
              onClick={() => onUmschalten(b.key)}
              aria-pressed={aktiv}
              style={{
                padding: "9px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                background: aktiv ? farbe : "transparent",
                color: aktiv ? "#17171A" : "#9A968C",
                border: "1px solid " + (aktiv ? farbe : "#33333a"),
                fontWeight: aktiv ? 700 : 400,
                fontFamily: "inherit",
              }}
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   EINKLAPPBARE ABSCHNITTE

   Der Tab ist lang. Jeder Abschnitt bekommt deshalb eine antippbare
   Kopfzeile; zugeklappt steht unter dem Titel eine kurze
   Zusammenfassung aus denselben Daten, die aufgeklappt ausfuehrlich
   dastuenden — nichts davon ist geschaetzt oder erfunden.

   Welche Abschnitte offen sind, merkt sich das Geraet im
   localStorage, so wie die Kategorie-Ansicht auch. Gespeichert wird
   nur, was von der Vorgabe abweicht: kommt spaeter ein Abschnitt
   dazu, gilt fuer ihn die Vorgabe und nicht der Stand von gestern.
   ============================================================ */
const STATISTIK_ABSCHNITTE_SCHLUESSEL = "bewertungsapp.statistikAbschnitte";

/* Beim Oeffnen des Tabs stehen Gesamtstatistik und Top 10 offen —
   die eine sagt, was da ist, die andere, was oben steht. Alles
   Weitere ist zum Nachsehen da und wartet zugeklappt. */
const STATISTIK_ABSCHNITTE_VORGABE = {
  gesamt: true,
  jahr: false,
  zeit: false,
  detail: false,
  imdb: false,
  top10: true,
  pruefen: false,
  verteilung: false,
  kriterien: false,
};

function normalisiereStatistikAbschnitte(roh) {
  const rein = { ...STATISTIK_ABSCHNITTE_VORGABE };
  if (roh && typeof roh === "object") {
    for (const key of Object.keys(STATISTIK_ABSCHNITTE_VORGABE)) {
      if (typeof roh[key] === "boolean") rein[key] = roh[key];
    }
  }
  return rein;
}

function ladeStatistikAbschnitte() {
  try {
    const roh = window.localStorage.getItem(STATISTIK_ABSCHNITTE_SCHLUESSEL);
    return normalisiereStatistikAbschnitte(roh ? JSON.parse(roh) : null);
  } catch (e) {
    // Kein localStorage, kaputter Eintrag: still zurueck zur Vorgabe.
    return normalisiereStatistikAbschnitte(null);
  }
}

function speichereStatistikAbschnitte(stand) {
  try {
    window.localStorage.setItem(
      STATISTIK_ABSCHNITTE_SCHLUESSEL,
      JSON.stringify(normalisiereStatistikAbschnitte(stand))
    );
  } catch (e) {
    // Ohne localStorage gilt die Einstellung nur fuer diesen Besuch.
  }
}

/* Pfeil der Kopfzeile: zugeklappt zeigt er nach unten ("hier ist
   mehr"), aufgeklappt nach oben. Gedreht wird das eine Symbol, damit
   die Bewegung sichtbar zur selben Kopfzeile gehoert. */
function IconPfeilAuf({ offen }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{
        ...symbolBasis, width: 16, height: 16, flexShrink: 0,
        transform: offen ? "rotate(180deg)" : "none",
        transition: "transform var(--bewegung-rein)",
      }}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * Ein Abschnitt des Statistik-Tabs.
 *
 * `gross` unterscheidet die beiden Ueberschriftgroessen, die der Tab
 * schon vorher hatte (20px und 17px) — daran aendert sich nichts,
 * sie sitzen nur jetzt in einem Knopf.
 *
 * Abgegrenzt werden die Abschnitte durch dieselbe duenne Linie, die
 * die App in allen Listen zieht (#232326) — keine Karte, kein Rahmen,
 * keine Hintergrundflaeche. Die Linie sitzt am Fuss des Abschnitts und
 * steht deshalb zugeklappt direkt unter der Kopfzeile, aufgeklappt
 * unter dessen Inhalt. Beim letzten Abschnitt entfaellt sie, siehe
 * `.stats-abschnitt:last-child`.
 *
 * Der grosse Leerraum zwischen den Abschnitten (28px Aussenabstand)
 * ist entfallen: die Linie markiert die Grenze jetzt sichtbar, dafuer
 * braucht es keine Luft mehr. Was bleibt, ist die Polsterung der
 * Kopfzeile — 12px oben und unten halten sie zusammen mit der
 * Titelzeile ueber der Antippflaeche von 44px (minHeight sichert das
 * auch dann, wenn die Schrift einmal kleiner ausfaellt).
 */
function StatsAbschnitt({ titel, gross = false, zusammenfassung, offen, onUmschalten, children }) {
  return (
    <div className="stats-abschnitt" style={{ borderBottom: "1px solid #232326" }}>
      <button
        onClick={onUmschalten}
        aria-expanded={offen}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          width: "100%", textAlign: "left", padding: "12px 0", minHeight: 44,
          boxSizing: "border-box",
          background: "transparent", border: "none", color: "#EDEAE3",
          cursor: "pointer", fontFamily: "inherit",
          marginBottom: offen ? 10 : 0,
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontFamily: "'Playfair Display', serif",
              fontSize: gross ? 20 : 17,
              fontWeight: 700,
            }}
          >
            {titel}
          </span>
          {!offen && zusammenfassung && (
            <span
              style={{
                display: "block", marginTop: 4,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5,
                color: "#77746c", overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {zusammenfassung}
            </span>
          )}
        </span>
        <span style={{ display: "flex", color: "#77746c" }}>
          <IconPfeilAuf offen={offen} />
        </span>
      </button>
      {/* Aufgeklappt braucht der Inhalt Abstand zur Trennlinie darunter
          — sonst klebte die letzte Zeile daran. */}
      {offen && <div style={{ paddingBottom: 16 }}>{children}</div>}
    </div>
  );
}

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
   Top 10 — die besten Titel der gewaehlten Kategorien.

   Die eigene Knopfreihe ist entfallen: der Abschnitt folgt der einen
   Auswahl ganz oben im Tab. An der Berechnung aendert das nichts —
   sortiert wird wie in jeder Rangliste nach der Endnote.
   ------------------------------------------------------------ */
function TopTen({ ranked, kategorien, offen, onUmschalten }) {
  const { liste, gesamt } = useMemo(() => {
    const alle = kategorien.flatMap((c) => ranked[c.key] || []);
    return {
      liste: [...alle].sort((a, b) => sortWert(b.score) - sortWert(a.score)).slice(0, 10),
      gesamt: alle.length,
    };
  }, [ranked, kategorien]);

  return (
    <StatsAbschnitt titel="Top 10" offen={offen} onUmschalten={onUmschalten}>
      <div style={{ fontSize: 12.5, color: "#77746c", marginBottom: 14 }}>
        {kategorien.map((c) => c.label).join(", ")}
        {" · "}
        {gesamt}
        {gesamt === 1 ? " Eintrag" : " Einträge"}
      </div>

      {liste.length === 0 ? (
        <div style={{ color: "#55524c", fontSize: 13, padding: "8px 0" }}>Keine Einträge.</div>
      ) : (
        liste.map((f, i) => <RanglistenZeile key={f.id} platz={i + 1} eintrag={f} />)
      )}
    </StatsAbschnitt>
  );
}

/* ------------------------------------------------------------
   Bewertung pruefen — die auffaelligen Titel aller Kategorien

   Gesammelt steht hier, was in den Listen einzeln als Warndreieck
   auftaucht: Titel, deren Duell-Zuschlag deutlich von ihren Kriterien
   abweicht (siehe entryAuffaellig). Sortiert nach dem Betrag des
   Zuschlags, der groesste zuerst — dort lohnt das Nachsehen am
   ehesten.

   Erreicht kein Titel die Schwelle, gibt es den Abschnitt nicht: eine
   leere Liste mit Ueberschrift waere ein Hinweis auf nichts.
   ------------------------------------------------------------ */
function auffaelligeTitel(ranked, kategorien = CATEGORIES) {
  const gesammelt = [];
  for (const c of kategorien) {
    for (const eintrag of ranked[c.key] || []) {
      if (!entryAuffaellig(eintrag)) continue;
      gesammelt.push({
        eintrag,
        kategorie: c,
        zuschlag: entryZuschlag(eintrag),
        duelle: entryDuels(eintrag),
      });
    }
  }
  return gesammelt.sort((a, b) => Math.abs(b.zuschlag) - Math.abs(a.zuschlag));
}

function BewertungPruefen({ ranked, onOeffnen, offen, onUmschalten }) {
  const kategorien = useKategorien();
  const liste = useMemo(() => auffaelligeTitel(ranked, kategorien), [ranked, kategorien]);
  if (!liste.length) return null;

  return (
    <StatsAbschnitt titel="Bewertung prüfen" offen={offen} onUmschalten={onUmschalten}>
      <div style={{ fontSize: 12.5, color: "#77746c", marginBottom: 14, lineHeight: 1.5 }}>
        Diese Titel schneiden im Duell dauerhaft anders ab, als ihre Kriterien
        hergeben — ab {AUFFAELLIG_ZUSCHLAG.toFixed(2).replace(".", ",")} Zuschlag
        und {AUFFAELLIG_DUELLE} Duellen, und nur bei gemischten Ergebnissen:
        mindestens {AUFFAELLIG_GEMISCHT} Sieg und {AUFFAELLIG_GEMISCHT} Niederlage.
      </div>

      {liste.map(({ eintrag, kategorie, zuschlag, duelle }) => (
        <button
          key={kategorie.key + "|" + eintrag.id}
          onClick={() => onOeffnen && onOeffnen(kategorie.key, eintrag.id)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 10, width: "100%", textAlign: "left", padding: "8px 0",
            background: "transparent", border: "none",
            borderBottom: "1px solid #232326",
            color: "#EDEAE3", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <IconWarndreieck farbe={accentFor(kategorie.key)} />
            <Poster url={eintrag.poster} title={eintrag.title} size={28} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {eintrag.title}
              </div>
              <div style={{ fontSize: 11.5, color: "#77746c", marginTop: 2 }}>
                {kategorie.label} · {duelle} {duelle === 1 ? "Duell" : "Duelle"}
              </div>
            </div>
          </div>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700,
              color: accentFor(kategorie.key), flexShrink: 0,
            }}
          >
            {zuschlagText(zuschlag)}
          </span>
        </button>
      ))}
    </StatsAbschnitt>
  );
}

/* ------------------------------------------------------------
   Du vs. IMDb

   Wo weicht die eigene Endnote am staerksten von der IMDb-Note ab?

   Grundlage ist ausschliesslich, was ohnehin am Eintrag steht:
   bewertete Eintraege mit eigener Endnote UND gespeicherter
   IMDb-Note. Abgerufen wird hier nichts — fehlt die IMDb-Note,
   taucht der Titel schlicht nicht auf. Sie kommt beim Nachladen der
   Angaben mit (siehe `imdbRating`) oder wird von Hand eingetragen.

   Der Abschnitt folgt der einen Kategorie-Auswahl ganz oben im Tab.
   Gerechnet wird dabei unveraendert: Es aendert sich nur, welche
   Eintraege ueberhaupt in den Vergleich gehen.

   Verglichen wird mit der ANGEZEIGTEN Endnote (`anzeigeNote`, auf
   0–10 begrenzt). Die IMDb-Skala endet bei 10; ein Duell-Zuschlag
   ueber die 10 hinaus liesse die Abweichung sonst groesser
   aussehen, als sie auf derselben Skala ist.
   ------------------------------------------------------------ */

/* Unter drei Vergleichswerten sagen "die groessten Abweichungen"
   nichts — dann steht statt zweier fast leerer Listen ein Hinweis. */
const IMDB_VERGLEICH_MIN = 3;

/* Wie viele Titel je Richtung. Dieselbe Laenge wie die Top 10. */
const IMDB_VERGLEICH_LAENGE = 10;

/** Alle vergleichbaren Eintraege mit ihrer Abweichung. */
function imdbVergleiche(ranked, kategorien) {
  const gesammelt = [];
  for (const cat of kategorien) {
    for (const eintrag of ranked[cat.key] || []) {
      if (typeof eintrag.score !== "number") continue;
      if (typeof eintrag.imdbRating !== "number") continue;
      const eigene = anzeigeNote(eintrag.score);
      gesammelt.push({
        schluessel: cat.key + "|" + eintrag.id,
        titel: eintrag.title,
        eigene,
        imdb: eintrag.imdbRating,
        // Auf zwei Stellen gerundet wie jeder andere Notenwert auch —
        // sonst stuende hinter 9.48 − 8.6 ein "+0.8800000000000008".
        abweichung: Math.round((eigene - eintrag.imdbRating) * 100) / 100,
      });
    }
  }
  return gesammelt;
}

/**
 * Die beiden Listen: nach oben abweichend absteigend, nach unten
 * abweichend nach Betrag absteigend. Eine Abweichung von exakt 0
 * gehoert in keine von beiden — dort ist man sich ja einig.
 */
function imdbListen(vergleiche) {
  return {
    hoeher: vergleiche
      .filter((v) => v.abweichung > 0)
      .sort((a, b) => b.abweichung - a.abweichung)
      .slice(0, IMDB_VERGLEICH_LAENGE),
    niedriger: vergleiche
      .filter((v) => v.abweichung < 0)
      .sort((a, b) => a.abweichung - b.abweichung)
      .slice(0, IMDB_VERGLEICH_LAENGE),
  };
}

/**
 * Die groesste Abweichung der Auswahl, mit Vorzeichen — die
 * Zusammenfassung der zugeklappten Kopfzeile. Gemessen wird der
 * Betrag; zurueck kommt der Wert selbst, damit sein Vorzeichen
 * erhalten bleibt. Ohne Vergleichswerte gibt es nichts zu sagen.
 */
function groessteImdbAbweichung(vergleiche) {
  let groesste = null;
  for (const v of vergleiche) {
    if (groesste === null || Math.abs(v.abweichung) > Math.abs(groesste)) groesste = v.abweichung;
  }
  return groesste;
}

function DuVsImdb({ ranked, kategorien, offen, onUmschalten }) {
  const vergleiche = useMemo(() => imdbVergleiche(ranked, kategorien), [ranked, kategorien]);
  const listen = useMemo(() => imdbListen(vergleiche), [vergleiche]);
  const groesste = groessteImdbAbweichung(vergleiche);

  return (
    <StatsAbschnitt
      titel="Du vs. IMDb"
      offen={offen}
      onUmschalten={onUmschalten}
      zusammenfassung={
        groesste === null ? null : "GRÖSSTE ABWEICHUNG " + zuschlagText(groesste)
      }
    >
      {vergleiche.length < IMDB_VERGLEICH_MIN ? (
        <div style={{ fontSize: 12.5, color: "#77746c", lineHeight: 1.5 }}>
          Noch zu wenig zum Vergleichen — ab {IMDB_VERGLEICH_MIN} bewerteten
          Einträgen mit IMDb-Note stehen hier die größten Abweichungen.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: "#77746c", marginBottom: 14, lineHeight: 1.5 }}>
            Deine Endnote gegen die IMDb-Note, über die Auswahl oben.
            {" "}{vergleiche.length} Einträge haben beide Noten.
          </div>

          <ImdbListe
            titel="Du deutlich höher"
            eintraege={listen.hoeher}
            leer="Kein Titel liegt über seiner IMDb-Note."
          />
          <ImdbListe
            titel="Du deutlich niedriger"
            eintraege={listen.niedriger}
            leer="Kein Titel liegt unter seiner IMDb-Note."
          />
        </>
      )}
    </StatsAbschnitt>
  );
}

/* Eine der beiden Listen. Die Ueberschrift traegt dieselbe kleine
   Mono-Beschriftung wie die Zeilen im Jahresrueckblick. */
function ImdbListe({ titel, eintraege, leer }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 0.5,
          color: "#9A968C", marginBottom: 4,
        }}
      >
        {titel.toUpperCase()}
      </div>
      {eintraege.length === 0 ? (
        <div style={{ color: "#55524c", fontSize: 13, padding: "8px 0" }}>{leer}</div>
      ) : (
        eintraege.map((v) => <ImdbZeile key={v.schluessel} vergleich={v} />)
      )}
    </div>
  );
}

/* Titel links, beide Noten und die Abweichung rechts. Der Titel
   bekommt den ganzen Rest der Zeile und wird bei Ueberlaenge
   abgeschnitten; die Zahlen rechts stehen fest und schrumpfen nie —
   sie sind der Grund, warum die Zeile ueberhaupt dasteht.

   Die Farben der Abweichung sind beide schon in der App in
   Gebrauch: das Gruen der richtigen Antwort aus "Higher or Lower"
   und das Rot, das ueberall die Fehlermeldungen traegt. */
function ImdbZeile({ vergleich }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
        padding: "8px 0", borderBottom: "1px solid #232326",
      }}
    >
      <span
        style={{
          fontSize: 13.5, minWidth: 0,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {vergleich.titel}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 10, flexShrink: 0 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#9A968C" }}>
          {vergleich.eigene.toFixed(2)} · {vergleich.imdb.toFixed(1)}
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700,
            color: vergleich.abweichung > 0 ? TREFFER_GRUEN : "#d9736a",
            minWidth: 46, textAlign: "right",
          }}
        >
          {zuschlagText(vergleich.abweichung)}
        </span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------
   Zeit — gesehene Zeit und Zeitaufwand Watchlist

   Wie lange braucht es, alles Vorgemerkte zu schauen? Gezaehlt wird
   jede Kategorie mit Laufzeit — Spiele haben keine abrufbare und
   bleiben aussen vor.

   Eintraege, deren Laufzeit (noch) nicht bekannt ist, zaehlen nicht
   mit. Ihre Anzahl steht als Hinweis darunter, damit die Summe nicht
   vollstaendiger wirkt, als sie ist.

   Der Abschnitt folgt der einen Kategorie-Auswahl ganz oben im Tab.
   Spiele stehen mit in dieser Auswahl und erklaeren, warum es fuer
   sie keine Zahl gibt.
   ------------------------------------------------------------ */
/* Welche der angezeigten Kategorien ueberhaupt eine Laufzeit haben.
   Spiele fallen hier heraus — sie stehen zwar in der Auswahl, bringen
   aber keine Zahl mit. */
function zeitaufwandKategorien(kategorien) {
  return kategorien.filter((c) => unterstuetztLaufzeit(c.key));
}

/* Knopf der Jahresauswahl im Rueckblick. */
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

/**
 * Der Abschnitt "Zeit" — zwei Zahlen, die beide Stunden sind.
 *
 * Zusammengelegt aus "Gesehene Zeit" (bis dahin zwei Kennzahl-Karten
 * unter der Detailauswertung) und "Zeitaufwand Watchlist". Beide
 * rechnen unveraendert weiter, sie stehen jetzt nur beieinander:
 * einmal, was hinter einem liegt, einmal, was noch vor einem liegt.
 *
 * Beide Haelften folgen der einen Kategorie-Auswahl oben.
 */
function ZeitAbschnitt({ ranked, watchlist, kategorien, offen, onUmschalten }) {
  /* Die gesehene Zeit: Laufzeit mal Sehzaehler. Gerechnet wird je
     Kategorie, weil nur so feststeht, welcher Eintrag ueberhaupt eine
     Laufzeit haben kann — Spiele haben keine. */
  const sehzeit = useMemo(
    () => sehzeitSumme(kategorien.map((c) => ({ category: c.key, liste: ranked[c.key] || [] }))),
    [ranked, kategorien]
  );

  /* Was fehlt: bei einer Auswahl ganz ohne Laufzeit der Grund selbst,
     sonst die Zahl der Eintraege, deren Laufzeit noch nicht bekannt
     ist. */
  const sehzeitHinweis = !sehzeit.moeglich
    ? "Spiele haben keine abrufbare Laufzeit und ergeben keine Sehzeit."
    : sehzeit.ohneLaufzeit > 0
      ? ohneLaufzeitHinweis(sehzeit.ohneLaufzeit)
      : null;

  const watch = useMemo(() => {
    const jeKategorie = zeitaufwandKategorien(kategorien).map((cat) => {
      let minuten = 0;
      let gezaehlt = 0;
      let offenZahl = 0;
      for (const eintrag of watchlist[cat.key] || []) {
        const dauer = eintragLaufzeit(eintrag);
        if (dauer === null) {
          offenZahl++;
          continue;
        }
        minuten += dauer;
        gezaehlt++;
      }
      return { key: cat.key, label: cat.label, minuten, gezaehlt, offen: offenZahl };
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
  }, [watchlist, kategorien]);

  /* Spiele haben keine Laufzeit und deshalb auch keine Zahlen —
     stehen in der Auswahl nur Spiele, sagt der Abschnitt das, statt
     einfach leer zu bleiben. */
  const hatWatchlistZahlen = watch.jeKategorie.length > 0;
  const inTagen = tageText(watch.gesamt.minuten);

  /* Eine Zeile fuer beides: die Tagesangabe (ab einem Tag sagt die
     Stundenzahl allein wenig) und — nur bei mehreren Kategorien — die
     Aufschluesselung. Bei einer einzelnen waere sie bloss die
     Wiederholung der Zahl darueber. */
  const nebenzeile = [];
  if (watch.gesamt.gezaehlt > 0) {
    if (inTagen) nebenzeile.push("das sind " + inTagen);
    if (watch.jeKategorie.length > 1) {
      for (const k of watch.jeKategorie) nebenzeile.push(k.label + ": " + stundenKurz(k.minuten));
    }
  }

  /* Zugeklappt steht die gesehene Zeit in der Kopfzeile: Stunden und,
     ab einem Tag, dieselbe Dauer noch einmal in Tagen. Ohne Laufzeit
     in der Auswahl gibt es keine Zahl und damit auch keine Zeile. */
  const gesehenTage = tageText(sehzeit.minuten);
  const zusammenfassung =
    sehzeit.moeglich && sehzeit.minuten > 0
      ? "GESEHEN " + stundenText(sehzeit.minuten) + (gesehenTage ? " · " + gesehenTage : "")
      : null;

  return (
    <StatsAbschnitt
      titel="Zeit"
      gross
      offen={offen}
      onUmschalten={onUmschalten}
      zusammenfassung={zusammenfassung}
    >
      {/* ---- Was hinter einem liegt ---- */}
      <ZeitUeberschrift>Gesehene Zeit</ZeitUeberschrift>
      {sehzeit.moeglich ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatCard label="STUNDEN" value={sehzeitStundenWert(sehzeit.minuten)} />
          <StatCard label="TAGE" value={sehzeitTageWert(sehzeit.minuten)} />
        </div>
      ) : null}
      {sehzeitHinweis && (
        <div style={{ fontSize: 11, color: "#77746c", lineHeight: 1.6, marginTop: 8 }}>
          {sehzeitHinweis}
        </div>
      )}

      {/* ---- Was noch vor einem liegt ---- */}
      <div style={{ marginTop: 22 }}>
        <ZeitUeberschrift>Zeitaufwand Watchlist</ZeitUeberschrift>
        {!hatWatchlistZahlen ? (
          <div style={{ color: "#77746c", fontSize: 13, padding: "8px 0" }}>
            Keine Laufzeit-Daten für Spiele.
          </div>
        ) : watch.gesamt.gezaehlt === 0 && watch.gesamt.offen === 0 ? (
          <div style={{ color: "#77746c", fontSize: 13, padding: "8px 0" }}>
            Nichts vorgemerkt — Spiele zählen hier nicht mit.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <StatCard label="GESAMT" value={stundenText(watch.gesamt.minuten)} />
              <StatCard label="MIT LAUFZEIT" value={watch.gesamt.gezaehlt} />
            </div>

            {nebenzeile.length > 0 && (
              <div style={{ fontSize: 12.5, color: "#77746c", lineHeight: 1.5 }}>
                {nebenzeile.join(" · ")}
              </div>
            )}

            {watch.gesamt.offen > 0 && (
              <div style={{ fontSize: 12, color: "#55524c", marginTop: 6, lineHeight: 1.5 }}>
                {watch.gesamt.offen}{" "}
                {watch.gesamt.offen === 1
                  ? "Eintrag ohne bekannte Laufzeit"
                  : "Einträge ohne bekannte Laufzeit"},
                noch nicht mitgerechnet
              </div>
            )}
          </>
        )}
      </div>
    </StatsAbschnitt>
  );
}

/* Die kleine Mono-Beschriftung ueber den beiden Haelften des
   Abschnitts — dieselbe wie ueber den Listen bei "Du vs. IMDb". */
function ZeitUeberschrift({ children }) {
  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 0.5,
        color: "#9A968C", marginBottom: 8,
      }}
    >
      {String(children).toUpperCase()}
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

function Jahresrueckblick({ ranked, offen, onUmschalten }) {
  const kategorien = useKategorien();
  const [gewaehlt, setGewaehlt] = useState(() => new Date().getFullYear());

  const daten = useMemo(() => {
    const nachJahr = new Map();
    let ohneDatum = 0;

    for (const cat of kategorien) {
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
  }, [ranked, kategorien]);

  /* Das laufende Jahr, solange darin etwas steht — sonst das neueste
     Jahr, zu dem es ueberhaupt etwas zu zeigen gibt. */
  const jahr = daten.nachJahr.has(gewaehlt) ? gewaehlt : daten.jahre[0] ?? null;

  const rueckblick = useMemo(() => {
    const liste = (jahr && daten.nachJahr.get(jahr)) || [];
    if (!liste.length) return null;

    const zaehler = Object.fromEntries(kategorien.map((c) => [c.key, 0]));
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

    const staerksteKategorie = kategorien.map((c) => ({ label: c.label, anzahl: zaehler[c.key] }))
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
  }, [jahr, daten, kategorien]);

  if (!daten.jahre.length) {
    return (
      <StatsAbschnitt titel="Jahresrückblick" gross offen={offen} onUmschalten={onUmschalten}>
        <div style={{ fontSize: 12.5, color: "#77746c", lineHeight: 1.6 }}>
          Noch nichts zu zeigen. Sobald du etwas bewertest, sammelt sich
          hier das Jahr — der Bestand aus der Zeit davor trägt kein
          Bewertungsdatum und bleibt deshalb außen vor.
        </div>
      </StatsAbschnitt>
    );
  }

  return (
    <StatsAbschnitt
      titel="Jahresrückblick"
      gross
      offen={offen}
      onUmschalten={onUmschalten}
      zusammenfassung={jahr === null ? null : String(jahr)}
    >
      {/* Jahresauswahl — eigene Knoepfe, sie waehlen ja kein Jahr aus
          Kategorien, sondern aus Jahren. */}
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
            {kategorien.filter((c) => rueckblick.zaehler[c.key] > 0).map((c) => (
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
                  ? anzeigeNote(rueckblick.bester.score).toFixed(2)
                  : null
              }
              zusatzFarbe={
                rueckblick.bester && typeof rueckblick.bester.score === "number"
                  ? scoreToColor(anzeigeNote(rueckblick.bester.score))
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
            {rueckblick.ohneLaufzeit > 0 && " " + ohneLaufzeitHinweis(rueckblick.ohneLaufzeit)}
            {daten.ohneDatum > 0 &&
              " " + daten.ohneDatum + " ältere Einträge tragen kein Bewertungsdatum und stehen in keinem Jahr."}
          </div>
        </>
      )}
    </StatsAbschnitt>
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

function StatsPage({ ranked, watchlist, onOeffnen }) {
  const kategorien = useKategorien();

  /* Die eine Auswahl fuer den ganzen Tab: null heisst "Alle". Die
     Liste dahinter bleibt gemerkt, damit die Abschnitte darunter
     nicht bei jedem Rendern neu rechnen. */
  const [auswahl, setAuswahl] = useState(null);
  const aktive = useMemo(() => statsAuswahlKategorien(auswahl, kategorien), [auswahl, kategorien]);
  const istAlle = statsIstAlle(auswahl, kategorien);

  /* Welche Abschnitte offen sind — je Geraet gemerkt, wie die
     Kategorie-Ansicht auch. */
  const [abschnitte, setAbschnitte] = useState(ladeStatistikAbschnitte);
  function umschalten(key) {
    setAbschnitte((alt) => {
      const neu = { ...alt, [key]: !alt[key] };
      speichereStatistikAbschnitte(neu);
      return neu;
    });
  }
  const klapper = (key) => ({ offen: !!abschnitte[key], onUmschalten: () => umschalten(key) });

  /* Die Liste, ueber die alles rechnet, was der Auswahl folgt. */
  const scopedList = useMemo(
    () => aktive.flatMap((c) => ranked[c.key] || []),
    [ranked, aktive]
  );
  const scopedStats = statsFor(scopedList);

  /* Die Kacheln je Kategorie stehen nur bei "Alle". Ist eine einzelne
     Kategorie gewaehlt, steht ihre Anzahl schon in "Gesamt" — dieselbe
     Zahl zweimal untereinander sagt nichts dazu. */
  const kacheln = useMemo(
    () => kategorien.map((c) => ({ key: c.key, label: c.label, anzahl: (ranked[c.key] || []).length })),
    [ranked, kategorien]
  );

  /* Kriterien-Durchschnitte werden ausschließlich innerhalb einer
     Kategorie gebildet: die Kriterien von Spielen und Filmen sind
     schlicht nicht dieselben und dürfen nicht in einen Topf. Bei
     mehreren gewählten Kategorien gibt es deshalb je einen Block. */
  const criteriaGroups = useMemo(() => {
    const mehrere = aktive.length > 1;
    return aktive
      .map((c) => ({ key: c.key, label: mehrere ? c.label : null, list: ranked[c.key] || [] }))
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
  }, [ranked, aktive]);

  const bands = DISTRIBUTION_BANDS.map((b) => ({
    ...b,
    count: scopedList.filter(
      (f) =>
        typeof f.score === "number" &&
        anzeigeNote(f.score) >= b.min &&
        anzeigeNote(f.score) < b.max
    ).length,
  }));
  const maxBandCount = Math.max(1, ...bands.map((b) => b.count));

  /* Die staerkste Notenspanne fuer die zugeklappte Kopfzeile. Bei
     Gleichstand gewinnt die hoehere Spanne — sie steht in der Liste
     zuerst. Ohne bewertete Eintraege gibt es keine. */
  const staerksteSpanne = bands.reduce(
    (beste, b) => (b.count > 0 && (!beste || b.count > beste.count) ? b : beste),
    null
  );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 50px" }}>
      {/* Die eine Auswahl fuer alles, was darunter steht. */}
      <StatsKategorieAuswahl
        kategorien={kategorien}
        auswahl={auswahl}
        onUmschalten={(key) => setAuswahl((alt) => statsAuswahlUmschalten(alt, key))}
      />

      <StatsAbschnitt titel="Gesamtstatistik" gross {...klapper("gesamt")}>
        {istAlle && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {kacheln.map((k) => (
              <StatCard key={k.key} label={k.label.toUpperCase()} value={k.anzahl} />
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatCard label="GESAMT" value={scopedStats.count} />
          <StatCard label="Ø ENDNOTE" value={scopedStats.avg.toFixed(2)} color={scoreToColor(scopedStats.avg)} />
          <StatCard label="HÖCHSTE" value={scopedStats.max.toFixed(2)} color={scoreToColor(scopedStats.max)} />
          <StatCard label="NIEDRIGSTE" value={scopedStats.min.toFixed(2)} color={scoreToColor(scopedStats.min)} />
        </div>
      </StatsAbschnitt>

      {/* Was in einem Jahr zusammenkam. Steht vor der Watchlist, weil
          es zurueckblickt, wo diese nach vorn schaut. Der Rueckblick
          zaehlt bewusst ueber alle Kategorien — ein Jahr ist ein Jahr. */}
      <Jahresrueckblick ranked={ranked} {...klapper("jahr")} />

      {/* Gesehene Zeit und Watchlist in einem Abschnitt: beides sind
          Stunden, das eine hinter einem, das andere vor einem. */}
      <ZeitAbschnitt
        ranked={ranked}
        watchlist={watchlist}
        kategorien={aktive}
        {...klapper("zeit")}
      />

      <StatsAbschnitt
        titel="Detailauswertung"
        gross
        zusammenfassung={
          scopedStats.count === 0
            ? null
            : scopedStats.count +
              (scopedStats.count === 1 ? " EINTRAG" : " EINTRÄGE") +
              " · Ø " +
              scopedStats.avg.toFixed(2)
        }
        {...klapper("detail")}
      >
        {scopedList.length === 0 ? (
          <div style={{ color: "#77746c", padding: 30, textAlign: "center" }}>Noch keine Einträge in diesem Bereich.</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatCard label="ANZAHL" value={scopedStats.count} />
            <StatCard label="Ø ENDNOTE" value={scopedStats.avg.toFixed(2)} color={scoreToColor(scopedStats.avg)} />
            <StatCard label="HÖCHSTE" value={scopedStats.max.toFixed(2)} color={scoreToColor(scopedStats.max)} />
            <StatCard label="NIEDRIGSTE" value={scopedStats.min.toFixed(2)} color={scoreToColor(scopedStats.min)} />
          </div>
        )}
      </StatsAbschnitt>

      {/* Die eigene Note gegen die IMDb-Note — folgt der Auswahl oben. */}
      <DuVsImdb ranked={ranked} kategorien={aktive} {...klapper("imdb")} />

      <TopTen ranked={ranked} kategorien={aktive} {...klapper("top10")} />

      {/* Die auffaelligen Titel ueber alle Kategorien. Der Abschnitt
          zeigt sich nur, wenn es welche gibt. */}
      <BewertungPruefen ranked={ranked} onOeffnen={onOeffnen} {...klapper("pruefen")} />

      {scopedList.length > 0 && (
        <>
          <StatsAbschnitt
            titel="Bewertungsverteilung"
            zusammenfassung={
              staerksteSpanne
                ? staerksteSpanne.label +
                  " · " +
                  staerksteSpanne.count +
                  (staerksteSpanne.count === 1 ? " EINTRAG" : " EINTRÄGE")
                : null
            }
            {...klapper("verteilung")}
          >
            {bands.map((b) => (
              <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 62, fontSize: 12, color: "#9A968C", flexShrink: 0 }}>{b.label}</div>
                <div style={{ flex: 1, height: 14, background: "#232326", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${(b.count / maxBandCount) * 100}%`, height: "100%", background: scoreToColor(b.at) }} />
                </div>
                <div style={{ width: 26, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, flexShrink: 0 }}>{b.count}</div>
              </div>
            ))}
          </StatsAbschnitt>

          <StatsAbschnitt
            titel="Ø je Kriterium"
            zusammenfassung={
              istAlle ? "ALLE" : aktive.map((c) => c.label).join(", ").toUpperCase()
            }
            {...klapper("kriterien")}
          >
            {aktive.length > 1 && (
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
          </StatsAbschnitt>
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
      "die Duell-Wertung beider Titel — und damit ihren Zuschlag auf die Endnote.",
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

function MinispielePage({ ranked, watchlist, duellZahlen, onDuell, onBewerten, fehler }) {
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
        fehler={fehler}
        onZurueck={() => setSpiel(null)}
      />
    );
  }

  if (spiel === "higher-or-lower") {
    return <HigherOrLower ranked={ranked} onZurueck={() => setSpiel(null)} />;
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
   Titel selbst kommen, nicht aus der Zahl daneben.

   Beide Karten sind gleich hoch, egal wie lang die Titel sind: Der
   Titelbereich ist auf zwei Zeilen festgelegt (DUELL_TITEL_ZEILEN),
   laengere Titel enden mit Auslassungspunkten. Vorher wuchs die Karte
   mit ihrem Titel — "Inception" brauchte eine Zeile, "Charlie and the
   Chocolate Factory" drei, und Poster, Titel und Jahr standen links
   und rechts auf verschiedenen Hoehen. Der volle Titel bleibt ueber
   das title-Attribut lesbar, damit beim Abschneiden nichts
   verlorengeht. */
const DUELL_TITEL_ZEILEN = 2;
const DUELL_TITEL_ZEILENHOEHE = 1.3;

function DuellKarte({ eintrag, zustand, onClick }) {
  const gewaehlt = zustand === "gewaehlt";
  const unterlegen = zustand === "unterlegen";
  const jahr = typeof eintrag.releaseYear === "number" ? eintrag.releaseYear : null;

  return (
    <button
      onClick={onClick}
      style={{
        flex: "1 1 0", minWidth: 0, cursor: "pointer", fontFamily: "inherit",
        /* alignSelf: stretch holt sich die Hoehe der hoeheren Karte,
           auch wenn die Reihe daneben (das "vs") mittig sitzt. */
        alignSelf: "stretch",
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
        title={eintrag.title}
        style={{
          fontSize: 14, lineHeight: DUELL_TITEL_ZEILENHOEHE, textAlign: "center",
          width: "100%", overflowWrap: "anywhere",
          /* Feste Hoehe von zwei Zeilen — nicht max-height: sonst
             saesse das Jahr bei einzeiligen Titeln hoeher als
             nebenan. Der Zeilenklammer-Aufbau ist derselbe, den auch
             Browser ohne -webkit-line-clamp verstehen; dort wird
             schlicht ohne Auslassungspunkte abgeschnitten. */
          height: DUELL_TITEL_ZEILEN * DUELL_TITEL_ZEILENHOEHE + "em",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: DUELL_TITEL_ZEILEN,
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
 * fallen heraus. Das Bauchgefuehl bleibt Bedingung, obwohl ein Duell
 * es nicht mehr anfasst: es ist der Viertelanteil der Endnote, und wer
 * ihn nicht hat, ist nicht fertig bewertet. Das Teilnehmerfeld
 * aendert sich dadurch nicht.
 * Die Reihenfolge bleibt die der Rangliste; das Fenster der
 * Head-to-Head-Paarung misst allerdings die Endnote, nicht den Rang.
 */
function duellTeilnehmer(ranked, kategorien = CATEGORIES) {
  const result = {};
  for (const c of kategorien) {
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

/* Platz eines Titels in der Rangliste seiner Kategorie — 1-basiert,
   wie er in der Liste steht. null, wenn er nicht vorkommt. */
function platzVon(liste, id) {
  if (!Array.isArray(liste)) return null;
  const i = liste.findIndex((f) => f && f.id === id);
  return i < 0 ? null : i + 1;
}

/**
 * Was nach einer Wahl im Rueckmeldungsbereich steht.
 *
 * Bewegt hat sich der Titel oder eben nicht — beides wird gesagt, wie
 * es ist. Eine Aenderung vorzutaeuschen, wo keine stattgefunden hat,
 * waere das Gegenteil dessen, wofuer das Duell da ist.
 */
function rueckmeldungsText(rueckmeldung, rangliste) {
  if (!rueckmeldung) return "Wird gespeichert …";

  const platzJetzt = platzVon(rangliste, rueckmeldung.id);
  const titel = rueckmeldung.titel || "Der Titel";
  if (platzJetzt === null) return "Gespeichert.";
  if (rueckmeldung.platzVorher === platzJetzt) {
    return titel + " bleibt auf Platz " + platzJetzt + ".";
  }
  return titel + " steht jetzt auf Platz " + platzJetzt + ".";
}

/* Die drei Arten der Eingrenzung, wie sie in der Leiste stehen. */
const DUELL_AUSWAHL_ARTEN = [
  { key: DUELL_AUSWAHL_ALLE, label: "Alle" },
  { key: DUELL_AUSWAHL_PLATZ, label: "Nach Platz" },
  { key: DUELL_AUSWAHL_NOTE, label: "Nach Note" },
];

/**
 * Die Leiste ueber dem Duell: wer ueberhaupt antreten soll.
 *
 * Die Leiste stellt nur ein — bestimmt wird das Feld erst beim
 * Uebernehmen, und zwar einmal (siehe uebernehmen in HeadToHead).
 * Deshalb steht rechts, was gerade wirklich gilt, und nicht, was in
 * den Feldern getippt ist: beides kann auseinanderlaufen, solange
 * noch nicht uebernommen wurde.
 */
function AuswahlLeiste({
  art, von, bis, anzahl, gesamt, eingegrenzt, onArt, onVon, onBis, onUebernehmen,
}) {
  const nachNote = art === DUELL_AUSWAHL_NOTE;

  const feldStil = {
    width: 62, padding: "6px 8px", borderRadius: 6,
    background: "#17171A", border: "1px solid #2A2A2E", color: "#EDEAE3",
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5,
  };

  return (
    <div
      style={{
        background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 10,
        padding: "10px 12px", marginBottom: 16,
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DUELL_AUSWAHL_ARTEN.map((a) => {
            const aktiv = a.key === art;
            return (
              <button
                key={a.key}
                onClick={() => onArt(a.key)}
                style={{
                  padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                  background: aktiv ? "var(--accent, #C9A227)" : "transparent",
                  border: "1px solid " + (aktiv ? "var(--accent, #C9A227)" : "#2A2A2E"),
                  color: aktiv ? "#17171A" : "#9A968C",
                  fontFamily: "inherit", fontSize: 12.5, fontWeight: aktiv ? 700 : 400,
                }}
              >
                {a.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: "#77746c", fontFamily: "'JetBrains Mono', monospace" }}>
          {eingegrenzt ? "Feld: " + anzahl + " von " + gesamt : "Feld: alle " + gesamt}
        </div>
      </div>

      {art !== DUELL_AUSWAHL_ALLE && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#77746c" }}>von</span>
          <input
            type="number"
            inputMode="decimal"
            value={von}
            onChange={(e) => onVon(e.target.value)}
            min={nachNote ? DUELL_NOTE_MIN : 1}
            max={nachNote ? DUELL_NOTE_MAX : undefined}
            step={nachNote ? 0.1 : 1}
            placeholder={nachNote ? "0,0" : "1"}
            aria-label={nachNote ? "Note von" : "Platz von"}
            style={feldStil}
          />
          <span style={{ fontSize: 12, color: "#77746c" }}>bis</span>
          <input
            type="number"
            inputMode="decimal"
            value={bis}
            onChange={(e) => onBis(e.target.value)}
            min={nachNote ? DUELL_NOTE_MIN : 1}
            max={nachNote ? DUELL_NOTE_MAX : undefined}
            step={nachNote ? 0.1 : 1}
            placeholder={nachNote ? "10,0" : String(gesamt || 1)}
            aria-label={nachNote ? "Note bis" : "Platz bis"}
            style={feldStil}
          />
          <button
            onClick={onUebernehmen}
            style={{
              padding: "6px 12px", borderRadius: 6, cursor: "pointer",
              background: "transparent", border: "1px solid var(--accent, #C9A227)",
              color: "var(--accent, #C9A227)",
              fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
            }}
          >
            Übernehmen
          </button>
          {/* Ein leeres Feld heisst "ohne Grenze auf dieser Seite" —
              nicht "nichts". */}
          <span style={{ fontSize: 11, color: "#55524c", lineHeight: 1.4 }}>
            Leer = ohne Grenze
          </span>
        </div>
      )}
    </div>
  );
}

function HeadToHead({ ranked, duellZahlen, onDuell, fehler, onZurueck }) {
  const kategorien = useKategorien();
  const [kategorieWahl, setKategorie] = useState(null);
  /* Eine ausgeblendete Kategorie gilt als nicht gewaehlt: dann steht
     wieder die Auswahl da statt einer leeren Seite. Der gemerkte Wert
     bleibt stehen — wird sie wieder eingeschaltet, geht es dort
     weiter, wo aufgehoert wurde. */
  const kategorie = kategorien.some((c) => c.key === kategorieWahl) ? kategorieWahl : null;
  const [paar, setPaar] = useState(null);
  // ID des gewaehlten Titels — solange sie steht, laeuft die Rueckmeldung.
  const [gewaehlt, setGewaehlt] = useState(null);
  /* Was nach der Wahl im Rueckmeldungsbereich steht. Gesetzt wird es
     erst, wenn die Auswertung durch ist — vorher waere jede Aussage
     ueber die Platzierung geraten. */
  const [rueckmeldung, setRueckmeldung] = useState(null);

  /* Die Leiste ueber dem Duell: welche Art der Eingrenzung eingestellt
     ist und was in den beiden Feldern steht. Getippt wird als Text —
     gelesen wird erst beim Uebernehmen. */
  const [art, setArt] = useState(DUELL_AUSWAHL_ALLE);
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");

  /* Das Teilnehmerfeld, wie es beim Start der Auswahl feststand — als
     Menge von IDs. Genau hier sitzt die Zusage, dass sich das Feld
     nicht nach jedem Duell neu bestimmt: die Menge entsteht einmal
     beim Uebernehmen und aendert sich erst wieder, wenn die Auswahl
     oder die Kategorie wechselt.

     null heisst "Alle". Dann wird gar nicht gefiltert, und die
     Ziehung bekommt dieselbe Liste wie vor dieser Leiste. */
  const [feld, setFeld] = useState(null);

  /* Eine Auswahl tritt an die Stelle des Notenfensters: innerhalb des
     Feldes darf jeder gegen jeden. Bei "Alle" bleibt das Fenster. */
  const ohneFenster = feld !== null;

  const teilnehmer = useMemo(() => duellTeilnehmer(ranked, kategorien), [ranked, kategorien]);

  /* Die Rangliste der laufenden Kategorie, immer aktuell. Aus ihr
     kommt der Platz vor und nach dem Duell. */
  const ranglisteRef = useRef([]);
  ranglisteRef.current = (kategorie && ranked[kategorie]) || [];

  /* Gezogen wird immer aus dem aktuellen Stand: nach einem Duell haben
     sich zwei Endnoten verschoben und die Rangliste sieht anders aus.
     Der Verweis haelt ihn fuer die Zeitschaltung bereit, die nicht bei
     jedem Neuaufbau neu gesetzt werden soll.

     Wer dabei ist, entscheidet allein das festgehaltene Feld — Noten
     und Duellzahlen bleiben dagegen aktuell, damit die Bevorzugung
     der wenig gespielten Titel weiter greift. */
  const feldJetzt = useMemo(
    () => feldListe(kategorie ? teilnehmer[kategorie] : [], feld),
    [kategorie, teilnehmer, feld]
  );
  const listeRef = useRef([]);
  listeRef.current = feldJetzt;
  /* Das festgehaltene Feld auch als Verweis: die Auswertung eines
     Duells laeuft asynchron und soll hinterher mit dem Feld rechnen,
     das dann gilt — nicht mit dem, das beim Antippen galt. */
  const feldRef = useRef(null);
  feldRef.current = feld;

  /* Wie viele Paarungen dieses Feld ueberhaupt hergibt — die
     Bezugsgroesse der Zeile unter dem Zaehler. Bei "Alle" ist das die
     ganze Kategorie im Grundfenster, in einer Auswahl das Feld ohne
     Fenster: gemessen wird genau das, woraus auch gezogen wird. Nach
     einem Duell haben sich zwei Endnoten verschoben, deshalb wird die
     Zahl mit dem Feld neu gerechnet. */
  const paarungenMoeglich = useMemo(
    () => moeglichePaarungen(feldJetzt, ohneFenster),
    [feldJetzt, ohneFenster]
  );

  /* Die zuletzt gezogenen Paarungen, die juengste zuletzt. Sie halten
     dieselbe Begegnung fuer ein paar Zuege draussen. */
  const verlaufRef = useRef([]);

  /* Die schon gespielten Paarungen dieser Kategorie — auch die aus
     frueheren Sitzungen und aus dem Turnier. Sie kommen vom Server
     (duell_paare) und wachsen waehrend des Spielens mit. */
  const paareRef = useRef([]);
  /* Dieselbe Liste als Zahl, damit die Anzeige sie mitbekommt: der
     Verweis oben aendert sich lautlos, ein Zustand nicht. Gezaehlt
     werden die Zeilen aus duell_paare, also eindeutige Paarungen —
     ausdruecklich nicht der Duellzaehler daneben, der Wiederholungen
     und Turniermatches mitzaehlt. */
  const [paarungenGespielt, setPaarungenGespielt] = useState(0);
  /* Solange die Liste noch unterwegs ist, steht noch kein Duell da —
     ohne sie gezogen zu haben hiesse, die Sperrfrist beim ersten
     Duell zu uebergehen. */
  const [laedtPaare, setLaedtPaare] = useState(false);
  /* Fuer welche Kategorie die gespielten Paarungen schon dastehen.
     Ein blosser Wechsel der Auswahl soll sie nicht noch einmal
     holen — die Liste gehoert der Kategorie. */
  const geladenFuerRef = useRef(null);

  function merkePaarung(gezogen) {
    if (!gezogen) return;
    verlaufRef.current = [...verlaufRef.current, [gezogen[0].id, gezogen[1].id]].slice(-DUELL_VERLAUF);
  }

  /* Eine gerade gespielte Paarung nachtragen. Je Paarung bleibt ein
     Eintrag stehen, mit dem juengsten Zeitpunkt. */
  function merkeGespielt(paar) {
    if (!paar || !paar.a || !paar.b) return;
    const schluessel = paarungsSchluessel(paar.a, paar.b);
    paareRef.current = [
      ...paareRef.current.filter((p) => paarungsSchluessel(p.a, p.b) !== schluessel),
      { a: paar.a, b: paar.b, at: typeof paar.at === "number" ? paar.at : Date.now() },
    ];
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
      setRueckmeldung(null);
      const naechste = ziehePaarung(
        listeRef.current, verlaufRef.current, Math.random, paareRef.current, ohneFenster
      );
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
    const platzVorher = platzVon(ranglisteRef.current, gewinner.id);
    setGewaehlt(gewinner.id);
    setRueckmeldung(null);

    const laeuft = Promise.resolve(onDuell(kategorie, gewinner.id, verlierer.id));
    speicherungRef.current = laeuft;
    /* Erst nach der Auswertung steht fest, wo der Titel gelandet ist.
       Der Platz danach wird beim Zeichnen aus der dann aktuellen
       Rangliste gelesen — beide Zustandsaenderungen kommen im selben
       Durchlauf an. */
    const fertig = (gespielt) => {
      /* Die Paarung ist gelaufen — ab jetzt steht sie der Ziehung im
         Weg, solange es ungespielte gibt. Zurueck kommt sie sortiert
         vom Server; schlaegt das Speichern fehl, kommt hier nichts an
         und die Paarung bleibt ungespielt. */
      merkeGespielt(gespielt);
      if (!lebtRef.current) return;
      setPaarungenGespielt(gespieltePaarungen(paareRef.current, feldRef.current));
      setRueckmeldung({ id: gewinner.id, titel: gewinner.title, platzVorher });
    };
    laeuft.then(fertig, fertig);
  }

  /* Zurueck auf "Alle" — beim Wechsel der Kategorie. Die Eingrenzung
     der einen Kategorie sagt ueber die naechste nichts. */
  function auswahlZuruecksetzen() {
    setArt(DUELL_AUSWAHL_ALLE);
    setVon("");
    setBis("");
    setFeld(null);
  }

  /* Eine andere Art der Eingrenzung einstellen. Bis zum Uebernehmen
     gilt weiter das ganze Feld: was in der Leiste steht, ist dann
     eine Absicht und noch keine Auswahl. */
  function waehleArt(neu) {
    setArt(neu);
    setVon("");
    setBis("");
    setFeld(null);
  }

  /* Die eingestellte Eingrenzung uebernehmen. Hier — und nur hier —
     wird das Teilnehmerfeld bestimmt; danach steht es fest, bis die
     Auswahl oder die Kategorie wechselt. */
  function uebernehmen() {
    if (art === DUELL_AUSWAHL_ALLE) {
      setFeld(null);
      return;
    }
    const gewaehlt = auswahlFeld(teilnehmer[kategorie] || [], { art, von, bis });
    setFeld(new Set(gewaehlt.map((eintrag) => eintrag.id)));
  }

  /* Erstes Duell eines Feldes. Ausgeloest von der Kategorie und von
     der Auswahl — beide bestimmen, wer antritt. Eine gespeicherte
     Verschiebung loest hier ausdruecklich nichts aus, sonst zoege
     jedes Duell sofort ein neues Paar und die Rueckmeldung waere nie
     zu sehen. */
  useEffect(() => {
    setGewaehlt(null);
    setRueckmeldung(null);
    /* Neues Feld, neuer Verlauf — die gesperrten Paarungen des
       vorigen kommen hier ohnehin nicht vor. */
    verlaufRef.current = [];
    setPaar(null);
    if (!kategorie) {
      geladenFuerRef.current = null;
      paareRef.current = [];
      setPaarungenGespielt(0);
      setLaedtPaare(false);
      return undefined;
    }

    const zeichne = () => {
      const erste = ziehePaarung(listeRef.current, null, Math.random, paareRef.current, ohneFenster);
      merkePaarung(erste);
      setPaar(erste);
    };

    /* Die gespielten Paarungen haengen an der Kategorie, nicht an der
       Auswahl: wechselt nur das Feld, stehen sie schon da und werden
       nicht noch einmal geholt. */
    if (geladenFuerRef.current === kategorie) {
      /* Nur das Feld hat gewechselt — die Zeile unter dem Zaehler
         bezieht sich ab jetzt darauf. */
      setPaarungenGespielt(gespieltePaarungen(paareRef.current, feld));
      zeichne();
      return undefined;
    }

    let abgebrochen = false;
    paareRef.current = [];
    setPaarungenGespielt(0);
    setLaedtPaare(true);
    (async () => {
      try {
        paareRef.current = await api.loadDuellPaare(kategorie);
      } catch {
        /* Ohne die Liste wird gespielt wie vor der Sperrfrist. Ein
           Ausfall darf das Minispiel nicht anhalten. */
        paareRef.current = [];
      }
      if (abgebrochen) return;
      geladenFuerRef.current = kategorie;
      setLaedtPaare(false);
      setPaarungenGespielt(gespieltePaarungen(paareRef.current, feld));
      zeichne();
    })();
    return () => { abgebrochen = true; };
  }, [kategorie, feld]);

  /* Nach kurzer Pause von selbst weiter. Wer nicht warten mag, tippt.

     Die Pause laeuft erst an, wenn die Auswertung durch ist: sonst
     stuende die Rueckmeldung bei einer langsamen Verbindung nur einen
     Wimpernschlag da, bevor das naechste Paar kommt. */
  useEffect(() => {
    if (!gewaehlt || !rueckmeldung) return undefined;
    const zeit = setTimeout(weiter, DUELL_PAUSE_MS);
    return () => clearTimeout(zeit);
  }, [gewaehlt, rueckmeldung]);

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
          {kategorien.map((c) => {
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
        onClick={() => { setKategorie(null); auswahlZuruecksetzen(); }}
        style={{ background: "transparent", border: "none", color: "#9A968C", fontSize: 15, cursor: "pointer", padding: "10px 0", marginBottom: 8 }}
      >
        ← Kategorie wechseln
      </button>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace" }}>
          HEAD-TO-HEAD · {catInfo.label.toUpperCase()}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11.5, color: "#77746c", fontFamily: "'JetBrains Mono', monospace" }}>
            {gespielt} {gespielt === 1 ? "Duell" : "Duelle"} gespielt
          </div>
          {/* Wie weit die Kategorie durchgespielt ist. Oben stehen die
              Duelle mit allen Wiederholungen, hier die Paarungen: wie
              viele es im Grundfenster gibt und wie viele davon schon
              einmal angetreten sind. Solange die gespielten Paarungen
              noch geladen werden, stuende hier eine 0, die nichts
              bedeutet — dann bleibt die Zeile weg. */}
          {!laedtPaare && (
            <div style={{ fontSize: 11, color: "#55524c", fontFamily: "'JetBrains Mono', monospace", marginTop: 3 }}>
              {zahlText(paarungenGespielt)} von {zahlText(paarungenMoeglich)} Paarungen gespielt
            </div>
          )}
        </div>
      </div>

      <AuswahlLeiste
        art={art}
        von={von}
        bis={bis}
        anzahl={listeRef.current.length}
        gesamt={(teilnehmer[kategorie] || []).length}
        eingegrenzt={ohneFenster}
        onArt={waehleArt}
        onVon={setVon}
        onBis={setBis}
        onUebernehmen={uebernehmen}
      />

      {fehler && (
        <div style={{ background: "#2a1616", border: "1px solid #d9736a", color: "#d9736a", borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
          {fehler}
        </div>
      )}

      {!paar ? (
        <div style={{ color: "#77746c", textAlign: "center", padding: 50, fontSize: 14.5, lineHeight: 1.5 }}>
          {laedtPaare
            ? "Wird geladen …"
            : listeRef.current.length < MIN_DUELL_TEILNEHMER
              ? "In dieser Auswahl stehen weniger als zwei Titel. " +
                "Nimm den Bereich weiter oder wähle „Alle“."
              : "In dieser Kategorie gibt es gerade kein Duell."}
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
            {!gewaehlt ? (
              "Welcher Titel gefällt dir besser?"
            ) : (
              <>
                {/* Was das Duell bewirkt hat. Solange die Auswertung
                    laeuft, steht hier nichts — eine Platzierung, die
                    noch gar nicht feststeht, waere geraten. */}
                <span style={{ color: "#9A968C" }}>
                  {rueckmeldungsText(rueckmeldung, ranglisteRef.current)}
                </span>
                {rueckmeldung && (
                  <>
                    <br />
                    Tippen für das nächste Duell.
                  </>
                )}
              </>
            )}
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

function Turnier({ ranked, onDuell, fehler, onZurueck }) {
  const kategorien = useKategorien();
  const [kategorieWahl, setKategorie] = useState(null);
  /* Eine ausgeblendete Kategorie gilt als nicht gewaehlt: dann steht
     wieder die Auswahl da statt einer leeren Seite. Der gemerkte Wert
     bleibt stehen — wird sie wieder eingeschaltet, geht es dort
     weiter, wo aufgehoert wurde. */
  const kategorie = kategorien.some((c) => c.key === kategorieWahl) ? kategorieWahl : null;
  const [baum, setBaum] = useState(null);
  // ID des gewaehlten Titels — solange sie steht, laeuft die Rueckmeldung.
  const [gewaehlt, setGewaehlt] = useState(null);

  const teilnehmer = useMemo(() => duellTeilnehmer(ranked, kategorien), [ranked, kategorien]);

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
          {kategorien.map((c) => {
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
function holModi(kategorien) {
  return [
    { key: "mixed", label: "Gemischt" },
    ...kategorien.map((c) => ({ key: c.key, label: c.label })),
  ];
}

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

function HigherOrLower({ ranked, onZurueck }) {
  const kategorien = useKategorien();
  const modi = holModi(kategorien);
  const [modusWahl, setModus] = useState(null);
  /* Eine ausgeblendete Spielart gilt als nicht gewaehlt: dann steht
     wieder die Auswahl da statt einer leeren Runde. */
  const modus = modi.some((m) => m.key === modusWahl) ? modusWahl : null;
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
    for (const c of kategorien) result[c.key] = bewertet(c.key);
    result.mixed = kategorien.flatMap((c) => result[c.key]);
    return result;
  }, [ranked, kategorien]);

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
          {modi.map((m) => {
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
  const modusInfo = modi.find((m) => m.key === modus);
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
  const kategorien = useKategorien();
  const [kategorieWahl, setKategorie] = useState(null);
  /* Eine ausgeblendete Kategorie gilt als nicht gewaehlt: dann steht
     wieder die Auswahl da statt einer leeren Seite. */
  const kategorie = kategorien.some((c) => c.key === kategorieWahl) ? kategorieWahl : null;
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
          {kategorien.map((c) => {
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

   Gespeichert wird nichts davon. Die Punkte werden bei jeder Anzeige
   aus dem aktuellen Bestand gerechnet (siehe xpAusBestand), die Stufe
   wiederum aus den Punkten. Das hat zwei Folgen, die genau so gewollt
   sind: Ein entfernter Titel nimmt seine Punkte von selbst wieder mit,
   und was man in den Minispielen tut, bringt gar keine Punkte — steigen
   kann nur, wer wirklich schaut und bewertet.
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
  return zahlText(n);
}

/* Was ein bewerteter Eintrag einbringt. Derselbe Wert, den eine neue
   Bewertung schon immer gebracht hat. */
const XP_PRO_BEWERTUNG = 10;

/**
 * Der Punktestand zum aktuellen Bestand.
 *
 * Gezaehlt wird genau eines: bewertete Eintraege. Vorgemerktes hat
 * keine Note und zaehlt nicht; "Am Schauen" ist ein Kennzeichen neben
 * der Bewertung und aendert daran nichts; der Sehzaehler zaehlt
 * Durchlaeufe, keine Eintraege. Welche Kategorien es gibt, steht in
 * CATEGORIES — kommt spaeter eine dazu, zaehlt sie hier von selbst mit.
 */
/* Bewusst ueber ALLE Kategorien, auch ueber ausgeblendete: Gesehen ist
   gesehen. Der Punktestand kann dadurch hoeher stehen, als die
   sichtbaren Eintraege erklaeren — das ist so gewollt und kein Fehler
   (siehe Kategorie-Ansicht, Regel 5). */
function xpAusBestand(items) {
  let bewertet = 0;
  for (const k of CATEGORY_KEYS) {
    for (const eintrag of items[k] || []) if (!istVorgemerkt(eintrag)) bewertet++;
  }
  return bewertet * XP_PRO_BEWERTUNG;
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
  // eine der Kategorien (movie, series, anime, kids, adultanim, doku,
  // comedy, game), stats oder minigames
  const [activeTab, setActiveTab] = useState("movie");
  const [search, setSearch] = useState("");
  // list | suche | form | edit | watchlist-form
  const [mode, setMode] = useState("list");
  // Unter-Reiter innerhalb einer Kategorie: bewertet | amschauen | watchlist
  const [unterReiter, setUnterReiter] = useState("bewertet");
  // Der aus der Suche gewaehlte Treffer, den das Formular vorbelegt.
  const [gewaehlterTreffer, setGewaehlterTreffer] = useState(null);
  // Der vorgemerkte Eintrag, der gerade bewertet wird.
  const [bewerteVorgemerkt, setBewerteVorgemerkt] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  /* Die Rueckfrage nach dem Speichern einer auffaelligen Bewertung:
     { catKey, id }, solange sie offen steht. Zurueckgesetzt wird nur
     auf ausdrueckliches "Ja" — von selbst passiert nichts. */
  const [zuschlagRueckfrage, setZuschlagRueckfrage] = useState(null);
  /* Der Verrechnen-Dialog: die ID des Eintrags, solange er offen
     steht. Geschrieben wird erst, wenn darin ein Weg gewaehlt wird —
     ein Abbruch aendert nichts. */
  const [verrechnenOffen, setVerrechnenOffen] = useState(null);
  /* Der Hinweistext ueber dem Bewertungsformular, wenn es aus dem
     Dialog heraus zum eigenen Verteilen geoeffnet wurde. Sonst leer. */
  const [verrechnenHinweis, setVerrechnenHinweis] = useState("");

  /* Die Sammelfunktion im Daten-Panel. `sammelPlan` ist die
     durchgerechnete Vorschau, solange sie dasteht — null heisst: es
     ist noch nichts gerechnet und erst recht nichts geschrieben.
     `sammelErgebnis` ist der Satz, der nach dem Schreiben zurueckbleibt. */
  const [sammelPlan, setSammelPlan] = useState(null);
  const [sammelErgebnis, setSammelErgebnis] = useState("");

  /* Welche Kategorien dieses Geraet zeigt und in welcher Reihenfolge.
     Reine Anzeige-Einstellung aus dem localStorage — an der Sammlung
     aendert sie nichts (siehe Kategorie-Ansicht ganz oben). */
  const [kategorieAnsicht, setKategorieAnsicht] = useState(() => ladeKategorieAnsicht());
  const sichtbareKats = useMemo(() => sichtbareKategorien(kategorieAnsicht), [kategorieAnsicht]);
  const sichtbareKeys = useMemo(() => sichtbareKats.map((c) => c.key), [sichtbareKats]);

  /* Jede Aenderung geht durch diese eine Stelle: normalisieren,
     speichern, anzeigen. */
  function aendereKategorieAnsicht(naechste) {
    const rein = normalisiereKategorieAnsicht(naechste);
    speichereKategorieAnsicht(rein);
    setKategorieAnsicht(rein);
  }

  const kategorieAnsichtWert = useMemo(
    () => ({ ansicht: kategorieAnsicht, sichtbar: sichtbareKats }),
    [kategorieAnsicht, sichtbareKats]
  );

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

  /* Frueher stand hier eine Referenz auf die Tab-Leiste: sie war
     seitlich wischbar und breiter als das Display, der aktive Tab
     musste bei jedem Wechsel ins Bild geholt werden. Die Leiste bricht
     jetzt um (siehe .tab-leiste) — alle Reiter stehen immer im Bild,
     und es gibt nichts mehr zu scrollen. */

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

  /* Die offene Kategorie wurde ausgeblendet: auf die erste sichtbare
     wechseln. Ohne diesen Schritt stuende die App vor einem Reiter,
     den es nicht mehr gibt. */
  useEffect(() => {
    if (sichtbareKeys.includes(category)) return;
    const ziel = sichtbareKeys[0];
    if (!ziel) return;
    const vorher = activeTab;
    waehleKategorie(ziel, 0);
    /* Stand oben die Statistik oder die Minispiele, bleibt das so —
       gewechselt wird dann nur die Kategorie darunter. */
    if (vorher === "stats" || vorher === "minigames") setActiveTab(vorher);
  }, [sichtbareKeys, category, activeTab]);

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
      /* Am Schauen — ein eigenes Kennzeichen neben `watchlist`, kein
         dritter Wert davon. Fehlt es (aeltere Server-Antwort, Backup
         von vor dieser Aenderung), gilt der Standardwert. */
      amSchauen: e.amSchauen === true,
      /* Der Stand darin. null heisst "nie gesetzt" und ist etwas
         anderes als 0: eine 0 bei der Folge heisst "Staffel begonnen,
         noch keine Folge gesehen". */
      staffelNr: typeof e.staffelNr === "number" && e.staffelNr >= 1 ? Math.round(e.staffelNr) : null,
      folgeNr: typeof e.folgeNr === "number" && e.folgeNr >= 0 ? Math.round(e.folgeNr) : null,
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
      /* Duell-Wertung, gespielte und gewonnene Duelle. Fehlen sie —
         aeltere Server-Antwort, Backup von vor der Duell-Wertung —,
         gilt der Startwert und damit ein Zuschlag von exakt 0, und es
         steht kein Sieg zu Buche. */
      elo: typeof e.elo === "number" && Number.isFinite(e.elo) ? e.elo : ELO_START,
      duels: typeof e.duels === "number" && Number.isFinite(e.duels) && e.duels > 0 ? Math.round(e.duels) : 0,
      siege: typeof e.siege === "number" && Number.isFinite(e.siege) && e.siege > 0 ? Math.round(e.siege) : 0,
      createdAt: e.createdAt || 0,
      updatedAt: e.updatedAt || 0,
      /* Wann aus dem Eintrag ein bewerteter wurde. Der Server setzt das
         Datum genau einmal und laesst es danach stehen — anders als
         `updatedAt`, das bei jedem Nachladen von Poster oder Genres
         mitwandert. null heisst "nicht bekannt": bei Vorgemerktem und
         bei Altbestand aus der Zeit vor dieser Spalte. */
      ratedAt: typeof e.ratedAt === "number" && e.ratedAt > 0 ? e.ratedAt : null,
      /* Wann der Titel zum ersten Mal gesehen wurde. Nur von Hand
         gesetzt; null heisst "nicht angegeben" und laesst die Anzeige
         auf das Bewertungsdatum zurueckfallen. */
      firstWatchedAt:
        typeof e.firstWatchedAt === "number" && e.firstWatchedAt > 0 ? e.firstWatchedAt : null,
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
              /* Das Erstsichtungsdatum geht hier bewusst NICHT mit.
                 `job.entry` ist ein Abzug vom Beginn des Durchgangs;
                 wer waehrenddessen ein Datum eintraegt, saehe es sonst
                 vom Nachtrag wieder ueberschrieben. Ohne das Feld
                 laesst der Server die Spalte stehen (siehe
                 erstsichtungColumns in api/items.js). */
              firstWatchedAt: undefined,
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
        .filter(inReiterBewertet)
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
     Sortierung nach Note gibt es hier nicht — es gibt noch keine.

     Das ist die VOLLSTAENDIGE Vormerkliste, samt allem, was gerade am
     Schauen ist. Sie geht so an die Zeitaufwand-Statistik und an das
     Minispiel "Was schau ich?" — an beiden aendert dieser Schritt
     ausdruecklich nichts. Nur die Anzeige im Unter-Reiter blendet
     Laufendes aus (siehe `watchlistList` unten). */
  const watchlistByCategory = useMemo(() => {
    const result = {};
    for (const cat of CATEGORIES) {
      result[cat.key] = (items[cat.key] || [])
        .filter(istVorgemerkt)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return result;
  }, [items]);

  /* Was gerade am Schauen ist — bewertet wie vorgemerkt, beides steht
     hier nebeneinander. Zuletzt geaendert zuerst: der Titel, an dem
     gerade gearbeitet wird, steht damit oben. */
  const amSchauenByCategory = useMemo(() => {
    const result = {};
    for (const cat of CATEGORIES) {
      result[cat.key] = (items[cat.key] || [])
        .filter(inReiterAmSchauen)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
    return result;
  }, [items]);

  const currentList = rankedByCategory[category];
  /* Was der Unter-Reiter "Watchlist" zeigt: dieselbe Liste ohne das,
     was gerade am Schauen ist. Ausgeblendet wird ausschliesslich die
     Anzeige — das Merkmal `watchlist` bleibt am Eintrag stehen, damit
     er beim Ausschalten wieder hier auftaucht. */
  const watchlistList = (watchlistByCategory[category] || []).filter(inReiterWatchlist);
  const amSchauenList = amSchauenByCategory[category] || [];
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
      .filter(inReiterBewertet)
      .map((f) => ({ ...f, score: entryScore(f, category) }));
    liste.sort((a, b) => sortWert(b.score) - sortWert(a.score));
    return liste;
  }, [anzeigeCache, category]);

  const cacheWatchlist = useMemo(() => {
    if (!anzeigeCache) return null;
    return (anzeigeCache[category] || [])
      .filter(inReiterWatchlist)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [anzeigeCache, category]);

  const cacheAmSchauen = useMemo(() => {
    if (!anzeigeCache) return null;
    return (anzeigeCache[category] || [])
      .filter(inReiterAmSchauen)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [anzeigeCache, category]);

  /* Was die Liste zeigt — echte Daten, sobald sie da sind. */
  const anzeigeListe = zeigtCache && cacheListe ? cacheListe : currentList;
  const anzeigeWatchlist = zeigtCache && cacheWatchlist ? cacheWatchlist : watchlistList;
  const anzeigeAmSchauen = zeigtCache && cacheAmSchauen ? cacheAmSchauen : amSchauenList;

  /* Steht der Cache noch, obwohl der Abruf durch ist, ist er
     fehlgeschlagen — dann sagt ein dezenter Hinweis, woher die Liste
     stammt. */
  const cacheHinweis = zeigtCache && loaded;

  /* Im Statistik-Tab zaehlt die Kopfzeile alle Kategorien zusammen,
     nicht die zuletzt gewaehlte. */
  const gesamtAnzahl = sichtbareKeys.reduce((s, k) => s + rankedByCategory[k].length, 0);

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
     Der Punktestand wird nicht gefuehrt, sondern gerechnet: er ergibt
     sich allein aus den bewerteten Eintraegen der Sammlung. Damit
     stimmt er immer mit dem ueberein, was gerade dasteht — auch
     nachdem ein Titel entfernt wurde. */
  const xp = useMemo(() => xpAusBestand(items), [items]);
  const [rangOffen, setRangOffen] = useState(false);
  // Die zuletzt dazugekommenen Punkte, solange die Einblendung steht.
  const [xpHinweis, setXpHinweis] = useState(null);

  /* Die Einblendung verschwindet von selbst. Kommen zwei Gutschriften
     kurz hintereinander, loest die zweite die erste ab. */
  useEffect(() => {
    if (!xpHinweis) return undefined;
    const zeit = setTimeout(() => setXpHinweis(null), XP_HINWEIS_MS);
    return () => clearTimeout(zeit);
  }, [xpHinweis]);

  /* Die Einblendung haengt jetzt am gerechneten Stand: steigt er, ist
     eine Bewertung dazugekommen. Der erste Stand nach dem Laden ist
     kein Gewinn — er wird nur gemerkt. Faellt der Stand (ein Eintrag
     wurde entfernt), gibt es nichts einzublenden. */
  const xpVorher = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    const vorher = xpVorher.current;
    xpVorher.current = xp;
    if (vorher !== null && xp > vorher) setXpHinweis({ punkte: xp - vorher, id: Date.now() });
  }, [xp, loaded]);

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
    if (fortsetzungenFrisch(alt, sichtbareKeys)) return;

    const anfrage = fortsetzungsAnfrage(items, alt, sichtbareKeys);
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
      const eintrag = {
        zeit: Date.now(),
        fassung: FORTSETZUNGS_FASSUNG,
        stand,
        kategorien: FORTSETZUNGS_KATEGORIEN.filter((k) => sichtbareKeys.includes(k)),
      };
      speichereFortsetzungen(eintrag);
      setFortsetzungen(eintrag);
    })().catch(() => {
      if (abgebrochen) return;
      /* Gescheitert — der Stand wird trotzdem vermerkt, damit es nicht
         bei jedem Neuladen der Seite erneut versucht wird. Er haelt nur
         einen Tag statt einer Woche. */
      const eintrag = {
        zeit: Date.now(),
        fassung: FORTSETZUNGS_FASSUNG,
        stand: {},
        fehler: true,
        kategorien: FORTSETZUNGS_KATEGORIEN.filter((k) => sichtbareKeys.includes(k)),
      };
      speichereFortsetzungen(eintrag);
      setFortsetzungen(eintrag);
    });

    return () => {
      abgebrochen = true;
    };
  }, [loaded]);


  /* ---- Streaming-Verfügbarkeit ----

     Ein EIGENER Durchgang, getrennt von der Nachlade-Schleife fuer
     Poster, Jahr, Regie und IMDb-Note. Er fasst weder deren Zaehler
     noch `items` an und schreibt nichts in die Datenbank — die
     Anbieter stehen ausschliesslich im localStorage. Damit kann er die
     Schleife weder ausbremsen noch abbrechen, und umgekehrt.

     Geholt wird je Eintrag und Region hoechstens einmal die Woche
     (siehe streamingFrisch). Ein Wechsel der Region startet einen
     neuen Durchgang fuer die neue Region; die Werte der anderen
     bleiben stehen.

     Wie bei den Fortsetzungen darf das hier ruhig scheitern: Es ist
     eine Zusatzangabe, keine Funktion, an der etwas haengt. Fehler
     werden deshalb still abgefangen. */
  const [regionWahl, setRegionWahl] = useState(() => ladeRegionEinstellung());
  const region = useMemo(() => regionAus(regionWahl), [regionWahl]);
  const [streaming, setStreaming] = useState(() => ladeStreaming());

  /* Fuer welche Region in diesem Besuch schon ein Durchgang lief.
     Ohne diese Sperre startete jeder gespeicherte Eintrag — und davon
     gibt es waehrend des Nachladens viele — einen neuen. */
  const streamingGeholt = useRef("");

  function aendereRegion(wahl) {
    if (wahl === regionWahl) return;
    speichereRegionEinstellung(wahl);
    setRegionWahl(wahl);
  }

  useEffect(() => {
    if (!loaded) return;
    if (streamingGeholt.current === region) return;
    streamingGeholt.current = region;

    const anfrage = streamingAnfrage(items, ladeStreaming(), region, sichtbareKeys);
    if (!anfrage.length) return;

    let abgebrochen = false;
    (async () => {
      let offen = anfrage;

      for (let runde = 0; runde < STREAMING_RUNDEN && offen.length; runde++) {
        const antwort = await api.holeStreaming(region, offen);
        if (abgebrochen) return;

        /* Jede Runde wird sofort gespeichert und angezeigt: Ein
           Abbruch mittendrin — geschlossene Seite, Netzfehler in der
           naechsten Runde — soll nicht alles Geholte verlieren. */
        const eintrag = streamingEinarbeiten(ladeStreaming(), region, antwort.treffer);
        speichereStreaming(eintrag);
        setStreaming(eintrag);

        const offeneIds = new Set(antwort.offen);
        const rest = offen.filter((e) => offeneIds.has(e.id));
        // Kommt eine Runde ohne Fortschritt zurueck, bringt die
        // naechste auch keinen.
        if (rest.length >= offen.length) break;
        offen = rest;
      }
    })().catch(() => {
      /* Gescheitert — es bleibt bei dem, was schon im Speicher steht.
         Angezeigt wird davon nichts: Wo keine Antwort vorliegt, bleibt
         die Stelle leer. Beim naechsten Seitenaufruf wird es erneut
         versucht. */
    });

    return () => {
      abgebrochen = true;
    };
  }, [loaded, region]);

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
        ? imNotenbereich(f.score, filterState.min, filterState.max)
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
        map.set(key, {
          id: f.id,
          title: f.title,
          watchlist: istVorgemerkt(f),
          amSchauen: istAmSchauen(f),
        });
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
     aus der Watchlist und steht in der Rangliste.

     Mit dem Merkmal faellt auch "Am Schauen" weg. Aufgerufen wird diese
     Funktion nur fuer vorgemerkte Eintraege — aus der Watchlist-Zeile,
     aus der Zeile im Reiter "Am Schauen" und aus dem Minispiel —, und
     fuer die gilt: was bewertet ist, ist zu Ende geschaut. Die Regel
     "Staffel 1 bewertet, Staffel 2 laeuft noch" bleibt davon
     unberuehrt; sie betrifft bereits bewertete Eintraege, und die
     kommen hier nie vorbei (siehe updateEntry). Der Stand selbst
     (staffelNr/folgeNr) bleibt stehen — wie beim Ausschalten des
     Schalters auch. */
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
        amSchauen: false,
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

    /* Ob der Titel VOR dem Speichern auffaellig war. Nur dann kommt
       die Rueckfrage nach dem Zuschlag — bei allen anderen aendert
       sich am Ablauf nichts. */
    const warAuffaellig = entryAuffaellig(current);

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
      /* Die Kriterien sind nachgebessert — soll der Zuschlag aus den
         alten Duellen stehen bleiben? Das entscheidet der Nutzer;
         von selbst wird hier nichts zurueckgesetzt. */
      if (warAuffaellig) setZuschlagRueckfrage({ catKey: category, id });
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

  /* Das Erstsichtungsdatum setzen oder leeren.

     Wie beim Speichern der Angaben geht alles Uebrige des Eintrags
     unveraendert mit; dieser Aufruf fasst genau ein Feld an. `null`
     leert es — die Anzeige faellt dann wieder auf das Bewertungsdatum
     zurueck. Am Bewertungsdatum selbst aendert das nichts: Der Server
     laesst `rated_at` stehen, sobald es einmal gesetzt ist. */
  async function erstsichtungSpeichern(id, wert) {
    const current = (items[category] || []).find((f) => f.id === id);
    if (!current) return;

    setBusy(true);
    try {
      const saved = await api.update(id, {
        ...current,
        seasons: current.seasons || [],
        category,
        // Ausdruecklich `null` statt `undefined`: nur so wird das Feld
        // ueberhaupt mitgeschickt und damit geleert.
        firstWatchedAt: typeof wert === "number" && wert > 0 ? wert : null,
      });
      setItems((prev) => ({
        ...prev,
        [category]: prev[category].map((f) => (f.id === id ? normalizeEntry(saved) : f)),
      }));
      setSaveError("");
    } catch (e) {
      setSaveError("Erstsichtung nicht gespeichert: " + e.message);
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

  /* ---- Am Schauen ----
     Das Kennzeichen und der Stand darin. Beides aendert sich hier und
     beim Bewerten eines vorgemerkten Eintrags (watchlistBewerten);
     automatisch gesetzt oder geloescht wird es nirgends. Insbesondere
     entfernt das Bearbeiten einer bestehenden Bewertung das Kennzeichen
     nicht — bei einer Serie kann Staffel 1 bewertet sein, waehrend
     Staffel 2 noch laeuft.

     Wie beim Zaehler geht alles Uebrige des Eintrags unveraendert mit;
     diese Aufrufe fassen nur die drei Felder an. Sie gelten fuer
     bewertete und vorgemerkte Eintraege gleichermassen, deshalb wird
     hier ueber `items` gesucht und nicht ueber die Rangliste. */
  async function amSchauenSchalten(id, an) {
    const current = (items[category] || []).find((f) => f.id === id);
    if (!current) return;

    /* Beim Einschalten bekommt ein Eintrag ohne Stand seinen Anfang:
       Staffel 1, Folge 0. Ein vorhandener Stand bleibt stehen — auch
       beim Ausschalten —, damit ein spaeteres Wiederaufnehmen ihn
       kennt. */
    const staffelNr = an && current.staffelNr === null ? 1 : current.staffelNr;
    const folgeNr = an && current.folgeNr === null ? 0 : current.folgeNr;

    setBusy(true);
    try {
      const saved = await api.update(id, {
        ...current,
        seasons: current.seasons || [],
        category,
        amSchauen: an === true,
        staffelNr,
        folgeNr,
      });
      setItems((prev) => ({
        ...prev,
        [category]: prev[category].map((f) => (f.id === id ? normalizeEntry(saved) : f)),
      }));
      setSaveError("");
    } catch (e) {
      setSaveError(amSchauenLabel(category) + " nicht gespeichert: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  /* Der Stand innerhalb des Kennzeichens — von "+1" und von der
     Eingabe von Hand. Das Kennzeichen selbst bleibt dabei
     unveraendert: auch die letzte Folge der letzten Staffel schaltet
     es nicht aus. */
  async function fortschrittSpeichern(id, staffelNr, folgeNr) {
    const current = (items[category] || []).find((f) => f.id === id);
    if (!current) return;

    setBusy(true);
    try {
      const saved = await api.update(id, {
        ...current,
        seasons: current.seasons || [],
        category,
        amSchauen: istAmSchauen(current),
        staffelNr,
        folgeNr,
      });
      setItems((prev) => ({
        ...prev,
        [category]: prev[category].map((f) => (f.id === id ? normalizeEntry(saved) : f)),
      }));
      setSaveError("");
    } catch (e) {
      setSaveError("Fortschritt nicht gespeichert: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  /* ---- Minispiel "Head-to-Head" ----
     Ein Duell verschiebt ausschliesslich die Elo-Zahl der beiden
     beteiligten Eintraege. Bauchgefuehl und Kriterienwerte bleiben
     unangetastet — die aendert allein das Bewertungsformular. Die
     Endnote wandert trotzdem, weil aus der Elo ein gedeckelter
     Zuschlag entsteht (siehe entryScore); damit gilt das Ergebnis
     ueberall, wo die Endnote zaehlt.

     Gerechnet und geschrieben wird auf dem Server in einer
     Transaktion. Uebersprungene Duelle kommen hier nie an. */
  async function duellAuswerten(catKey, gewinnerId, verliererId) {
    if (gewinnerId === verliererId) return null;
    const liste = items[catKey] || [];
    const gewinner = liste.find((f) => f.id === gewinnerId);
    const verlierer = liste.find((f) => f.id === verliererId);
    if (!gewinner || !verlierer) return null;

    /* Die gespielte Paarung, so wie der Server sie abgelegt hat. Sie
       geht an das Head-to-Head zurueck, damit dessen Sperrfrist ohne
       erneutes Laden weiterrechnet. */
    let gespielt = null;
    try {
      const ergebnis = await api.duell(catKey, gewinnerId, verliererId);
      /* Zurueck kommen nur `elo`, `duels` und `siege` je Eintrag.
         Genau diese drei Felder werden uebernommen — alles Uebrige
         bleibt so stehen, wie es ist. `siege` waechst dabei nur beim
         Gewinner; der Server entscheidet das, nicht das Frontend. */
      const neueWerte = new Map(
        (ergebnis && Array.isArray(ergebnis.entries) ? ergebnis.entries : []).map((e) => [e.id, e])
      );
      if (neueWerte.size) {
        setItems((prev) => ({
          ...prev,
          [catKey]: prev[catKey].map((f) => {
            const neu = neueWerte.get(f.id);
            if (!neu) return f;
            return {
              ...f,
              elo: typeof neu.elo === "number" ? neu.elo : f.elo,
              duels: typeof neu.duels === "number" ? neu.duels : f.duels,
              siege: typeof neu.siege === "number" ? neu.siege : f.siege,
            };
          }),
        }));
      }
      if (typeof ergebnis?.count === "number") {
        setDuellZahlen((prev) => ({ ...prev, [catKey]: ergebnis.count }));
      } else {
        setDuellZahlen((prev) => ({ ...prev, [catKey]: (prev[catKey] || 0) + 1 }));
      }
      gespielt =
        ergebnis && ergebnis.pair && ergebnis.pair.a && ergebnis.pair.b
          ? ergebnis.pair
          : { a: gewinnerId, b: verliererId, at: Date.now() };
      setDuellFehler("");
    } catch (e) {
      setDuellFehler("Duell nicht gespeichert: " + e.message);
      return null;
    }

    return gespielt;
  }

  /* Die Duell-Wertung eines Eintrags auf den Startwert zuruecksetzen.
     Der Zuschlag ist danach wieder exakt 0. Gezaehlte Duelle bleiben
     stehen — die Historie wird nicht geloescht. */
  async function eloZuruecksetzen(catKey, id) {
    setBusy(true);
    try {
      const stand = await api.eloZuruecksetzen(id);
      setItems((prev) => ({
        ...prev,
        [catKey]: prev[catKey].map((f) =>
          f.id === id
            ? {
                ...f,
                elo: typeof stand.elo === "number" ? stand.elo : ELO_START,
                duels: typeof stand.duels === "number" ? stand.duels : f.duels,
                siege: typeof stand.siege === "number" ? stand.siege : f.siege,
              }
            : f
        ),
      }));
      setSaveError("");
    } catch (e) {
      setSaveError("Nicht zurückgesetzt: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  /* Den Zuschlag in die eigenen Bewertungsfelder holen.

     Geschrieben wird genau einmal: die neuen Werte gehen wie bei
     einer normalen Bewertungsaenderung an den Server, und `elo` faellt
     im selben Aufruf auf den Startwert zurueck — der Zuschlag ist
     damit 0. `duels`, `siege` und die Eintraege in duell_paare bleiben
     stehen; die Duellhistorie geht nicht verloren.

     Die Rueckfrage nach einer auffaelligen Bewertung kommt hier
     ausdruecklich NICHT: der Zuschlag ist ja schon weg. */
  async function zuschlagVerrechnen(catKey, id, entwurf) {
    const current = (items[catKey] || []).find((f) => f.id === id);
    if (!current || !entwurf) return;

    setBusy(true);
    try {
      const saved = await api.update(id, {
        ...current,
        category: catKey,
        values: entwurf.values,
        personal: entwurf.personal,
        seasons: entwurf.seasons || [],
        elo: ELO_START,
      });
      setItems((prev) => ({
        ...prev,
        [catKey]: prev[catKey].map((f) => (f.id === id ? normalizeEntry(saved) : f)),
      }));
      setSaveError("");
    } catch (e) {
      setSaveError("Nicht verrechnet: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  /* ---- Alle Duell-Zuschlaege auf einmal verrechnen ----

     Zwei getrennte Schritte, und der erste fasst nichts an:
     `sammelVorschau` rechnet nur und stellt das Ergebnis hin,
     `sammelVerrechnen` schreibt — und wird ausschliesslich aus dem
     Bestaetigungsknopf der Vorschau heraus gerufen.

     Geschrieben wird Eintrag fuer Eintrag ueber genau denselben Weg
     wie beim einzelnen Verrechnen (PUT /api/items mit elo = 1000).
     Nacheinander, nicht alle auf einmal: bei einer grossen Sammlung
     waeren das sonst Dutzende gleichzeitiger Anfragen. Scheitert
     einer, laufen die uebrigen trotzdem durch; was geglueckt ist,
     bleibt geglueckt, und die Fehler stehen danach da. */
  function sammelVorschau() {
    setSammelErgebnis("");
    setSammelPlan(sammelVerrechnungsPlan(items));
  }

  function sammelAbbrechen() {
    setSammelPlan(null);
  }

  async function sammelVerrechnen() {
    const liste = sammelPlan ? sammelPlan.verrechenbar : [];
    if (!liste.length) { setSammelPlan(null); return; }

    setBusy(true);
    const gespeichert = [];
    const fehler = [];
    try {
      for (const vorgang of liste) {
        const current = (items[vorgang.category] || []).find((f) => f.id === vorgang.id);
        if (!current) continue;
        /* Noch einmal auf dem Stand gerechnet, der jetzt wirklich
           dasteht: Zwischen Vorschau und Bestaetigung kann sich ein
           Eintrag geaendert haben, und ein alter Entwurf traefe die
           Endnote dann nicht mehr. */
        const frisch = sammelVerrechnung(current, vorgang.category);
        if (!frisch.moeglich) { fehler.push(vorgang.titel + ": " + frisch.grund); continue; }
        try {
          const saved = await api.update(vorgang.id, sammelVerrechnungsAnfrage(current, frisch));
          gespeichert.push({ category: vorgang.category, eintrag: normalizeEntry(saved) });
        } catch (e) {
          fehler.push(vorgang.titel + ": " + e.message);
        }
      }

      if (gespeichert.length) {
        setItems((prev) => {
          const next = { ...prev };
          for (const g of gespeichert) {
            next[g.category] = (next[g.category] || []).map((f) =>
              f.id === g.eintrag.id ? g.eintrag : f
            );
          }
          return next;
        });
      }

      const zahl = gespeichert.length === 1 ? "1 Zuschlag" : gespeichert.length + " Zuschläge";
      setSammelErgebnis(
        zahl + " verrechnet" +
        (sammelPlan.uebersprungen.length ? ", " + sammelPlan.uebersprungen.length + " übersprungen" : "") +
        "."
      );
      setSaveError(fehler.length ? "Nicht verrechnet — " + fehler.join("; ") : "");
    } finally {
      setSammelPlan(null);
      setBusy(false);
    }
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

  /* Einen Eintrag aus der Statistik heraus oeffnen — aus der Liste
     "Bewertung pruefen". Gewechselt wird in seine Kategorie und
     direkt auf seine Detailansicht; gesetzt wird dabei dasselbe wie
     beim Klick auf einen Kategorie-Tab, damit die Liste dahinter
     stimmt. */
  function eintragOeffnen(catKey, id) {
    if (!CATEGORY_KEYS.includes(catKey) || !id) return;
    setCategory(catKey);
    setActiveTab(catKey);
    setUnterReiter("bewertet");
    setMode("list");
    setSearch("");
    /* Genre, Jahrzehnt, Regie und Reihe gehoeren zur Kategorie, aus der
       sie stammen; nach dem Wechsel gelten sie nicht mehr. */
    setFilterState((f) => ({ ...f, genre: "", jahrzehnt: "", regie: "", reihe: "" }));
    setSelectedId(id);
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
                /* Duell-Wertung, Duellzahl und Siege aus der Sicherung.
                   Eine Sicherung von vor der jeweiligen Aenderung hat
                   sie nicht — dann gilt der Startwert, ein Zuschlag
                   von exakt 0 und kein Sieg. Ein aelteres Backup
                   bleibt damit unveraendert einspielbar. */
                elo: typeof entry.elo === "number" && Number.isFinite(entry.elo) ? entry.elo : ELO_START,
                duels:
                  typeof entry.duels === "number" && Number.isFinite(entry.duels) && entry.duels > 0
                    ? Math.round(entry.duels)
                    : 0,
                siege:
                  typeof entry.siege === "number" && Number.isFinite(entry.siege) && entry.siege > 0
                    ? Math.round(entry.siege)
                    : 0,
                createdAt: entry.createdAt || Date.now(),
                updatedAt: entry.updatedAt || Date.now(),
                /* Das Bewertungsdatum aus der Sicherung. Ohne diese
                   Zeile stuende nach dem Einspielen die ganze Sammlung
                   im Jahr des Imports — der Jahresrueckblick waere
                   damit hinueber. Aeltere Sicherungen haben das Feld
                   nicht; dann setzt der Server das heutige Datum. */
                ratedAt: typeof entry.ratedAt === "number" && entry.ratedAt > 0 ? entry.ratedAt : undefined,
                /* Das Erstsichtungsdatum aus der Sicherung. Aeltere
                   Sicherungen haben das Feld nicht — dann bleibt es
                   leer, und die Anzeige faellt auf das
                   Bewertungsdatum zurueck. `undefined` heisst fuer den
                   Server "nicht mitgeschickt". */
                firstWatchedAt:
                  typeof entry.firstWatchedAt === "number" && entry.firstWatchedAt > 0
                    ? entry.firstWatchedAt
                    : undefined,
                /* Am Schauen und der Stand darin. Ein aelteres Backup
                   kennt die drei Felder nicht — dann gelten die
                   Standardwerte: nicht am Schauen, kein Stand. Die
                   Feldliste hier ist fest, deshalb muessen sie
                   ausdruecklich darin stehen; ein `...entry` gibt es
                   an dieser Stelle bewusst nicht. */
                amSchauen: entry.amSchauen === true,
                staffelNr:
                  typeof entry.staffelNr === "number" && entry.staffelNr >= 1
                    ? Math.round(entry.staffelNr)
                    : null,
                folgeNr:
                  typeof entry.folgeNr === "number" && entry.folgeNr >= 0
                    ? Math.round(entry.folgeNr)
                    : null,
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
    const jetzt = sichtbareKeys.indexOf(category);
    const ziel = jetzt + richtung;
    if (jetzt < 0 || ziel < 0 || ziel >= sichtbareKeys.length) return;
    waehleKategorie(sichtbareKeys[ziel], richtung);
  }

  return (
    /* overflowX: "clip" faengt den Versatz der Kategorie-Bewegung ab —
       ohne ihn zeigte die Seite fuer die Dauer der Bewegung eine
       Querlaufleiste.
       "clip" und nicht "hidden": es macht die Seite nicht zum
       Rollbereich und laesst die Detailseite (position: fixed)
       unberuehrt. */
    <KategorieAnsichtContext.Provider value={kategorieAnsichtWert}>
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
           alten auf — bis 1, damit es das alte vollstaendig abdeckt.
           Die 90 % Deckkraft des Kopfbildes liegen auf der Huelle um
           beide Ebenen (siehe HeaderSlideshow), nicht auf den Ebenen
           selbst. */
        @keyframes backdropBlende { from { opacity: 0; } to { opacity: 1; } }
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

        /* ----------------------------------------------------------
           Statistik: die Grenze zwischen zwei Abschnitten.

           Die Linie selbst steht als Inline-Stil am Abschnitt (siehe
           StatsAbschnitt) — hier faellt sie nur beim letzten weg. Sonst
           haenge unter dem Tab eine Linie im Leeren, die nichts mehr
           trennt. Das !important ist noetig, weil ein Inline-Stil sonst
           vorginge. */
        .stats-abschnitt:last-child { border-bottom: none !important; }

        /* Acht Kategorien passen auf kein Telefon nebeneinander. Frueher
           war die Leiste deshalb seitlich wischbar — mit dem Ergebnis,
           dass der aktive Reiter ausserhalb des Sichtbaren stehen und
           eine Beschriftung am Rand mitten im Wort abgeschnitten sein
           konnte.

           Stattdessen bricht die Leiste jetzt um: die Reiter behalten
           ihre Groesse und belegen so viele Zeilen, wie sie brauchen.
           Alle acht sind damit immer vollstaendig zu sehen. Welcher
           Reiter in welcher Zeile landet, ergibt sich allein aus der
           Breite — wird eine Kategorie ausgeblendet, rutscht der Rest
           von selbst nach.

           Der waagerechte Abstand bleibt bei 6px: bei 390px Breite
           entstehen damit drei Zeilen, und weniger werden es auch mit
           einem kleineren Abstand nicht — die acht Reiter messen allein
           701px, zwei Zeilen fassen bei 350px Inhaltsbreite aber nur
           700px. Die Zeilen selbst stehen dicht beieinander, damit die
           Leiste nicht in die Hoehe waechst. */
        .tab-leiste {
          display: flex;
          flex-wrap: wrap;
          column-gap: 6px;
          row-gap: 4px;
        }

        /* ----------------------------------------------------------
           Unter-Reiter ("Bewertet / Am Schauen / Watchlist", bei
           Spielen "Bewertet / Am Spielen / Backlog") im
           Unterstrich-Stil.

           Vorher waren es umrandete Knoepfe — dieselbe Form wie die
           Kategorie-Reiter eine Zeile darueber, sodass sich beide
           Reihen wie eine einzige Gruppe lasen. Jetzt steht hier nur
           noch Text: der aktive in der Kategoriefarbe mit einem kurzen
           Balken darunter, die uebrigen in der gedaempften Schriftfarbe.

           Unter der ganzen Reihe laeuft eine durchgehende Linie in der
           Listenfarbe (#232326); auf ihr sitzt der Balken auf, und sie
           trennt zugleich den Kopfbereich vom Inhalt darunter.

           Die Reihe bricht unter keinen Umstaenden um: weder die Leiste
           (flex-wrap: nowrap) noch die Beschriftungen selbst
           (white-space: nowrap, word-break: keep-all). Reicht der Platz
           einmal nicht, wird sie seitlich wischbar, wie die
           Kategorie-Reiter es frueher waren; der Rollbalken bleibt dabei
           ausgeblendet.

           Der schlimmste Fall sind dreistellige Zaehler in beiden
           Reitern: "Bewertet / Am Schauen 999 / Watchlist 999" misst
           mit 10px Innenabstand 311px und passt damit bei 390px Breite
           (350px Inhalt) in eine Zeile — auch auf einem 360px breiten
           Geraet (320px Inhalt) reicht es. Der Innenabstand war
           urspruenglich 13px; die 3px weniger je Seite sind genau die
           Reserve dafuer. Die Schriftgroesse blieb bei 13px. */
        .unter-reiter-leiste {
          display: flex;
          flex-wrap: nowrap;
          align-items: stretch;
          gap: 0;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          border-bottom: 1px solid #232326;
        }
        .unter-reiter-leiste::-webkit-scrollbar { display: none; }

        /* Der Knopf ist nur noch Text. Die 44px Mindesthoehe halten die
           Antippflaeche, auch wenn die Schrift kleiner wirkt als der
           bisherige Knopf. Die Schriftstaerke ist bei allen dreien
           gleich: waere der aktive fett, sprangen die Nachbarn beim
           Umschalten um die Differenz zur Seite. */
        .unter-reiter {
          position: relative;
          flex: 0 0 auto;
          min-height: 44px;
          padding: 0 10px;
          background: transparent;
          border: none;
          border-radius: 0;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          line-height: 1;
          white-space: nowrap;
          word-break: keep-all;
          cursor: pointer;
        }

        /* Der kurze senkrechte Trennstrich zwischen zwei Reitern. Er
           endet oberhalb der waagerechten Linie und laeuft deshalb nicht
           bis zum Fuss durch. */
        .unter-reiter + .unter-reiter::before {
          content: "";
          position: absolute;
          left: 0;
          top: 13px;
          bottom: 11px;
          width: 1px;
          background: #232326;
        }

        /* Der Balken des aktiven Reiters — genau so breit wie sein Text
           und aufsitzend auf der Linie unter der Reihe. */
        .unter-reiter[aria-pressed="true"]::after {
          content: "";
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 0;
          height: 2px;
          background: var(--accent, #C9A227);
        }

        .tab-btn {
          flex: 0 0 auto;
          padding: 13px 12px;
          font-size: 13.5px;
          white-space: nowrap;
        }

        /* 16:9-Ausschnitt ueber die volle Breite als Untergrenze, nicht
           als feste Hoehe: der Inhalt sitzt unten, und reicht er einmal
           tiefer als 16:9 hergeben, waechst der Bereich mit, damit
           nichts abgeschnitten wird.

           Genau das leistete das frueher hier stehende
           "aspect-ratio: 16 / 9" nicht. Ein Seitenverhaeltnis leitet
           auch die inhaltsbezogenen Mindestmasse aus der Breite ab —
           die Hoehe stand damit fest, und was nicht hineinpasste, fiel
           unter "overflow: hidden" weg. Weil der Inhalt am unteren Rand
           haengt (justify-content: flex-end), fiel es oben ab: seit die
           Reiterleiste umbricht und auf dem Telefon drei Zeilen statt
           einer belegt, stand der Titel ueber der Oberkante und war nur
           noch mit den Unterlaengen zu sehen; das Bild dahinter endete
           an derselben starren Kante mitten in den Reiterzeilen.

           min-height mit 56.25vw (= 9/16 der Breite) ergibt dieselbe
           Hoehe, solange der Inhalt hineinpasst — der Kopfbereich laeuft
           ueber die volle Fensterbreite, die vw also mit seiner eigenen
           gleich. Darueber hinaus waechst er einfach mit, und das Bild
           (inset: 0) deckt die groessere Flaeche vollstaendig ab. */
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
          min-height: 56.25vw;
          padding-top: calc(env(safe-area-inset-top, 0px) + 28px);
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
            box-sizing: border-box;
            min-height: 360px;
          }

          /* --- 3. Tab-Leiste ----------------------------------------
             Ab 960px ist Platz genug fuer eine Zeile: die acht Reiter
             sind zusammen 743px breit (701px Text plus 7x6px Abstand),
             die Inhaltsspalte misst hier mindestens 920px. Sie teilen
             sich die Breite und fuellen die Zeile aus.

             flex: 1 1 auto statt 1 1 0: mit der Basis 0 und
             min-width: 0 bekam jeder Reiter dieselben 108px — zu wenig
             fuer "Adult Animation" (116px) und "Sitcoms/Comedy"
             (122px), deren Beschriftung dadurch ueber den Knopf
             hinausstand. Mit "auto" ist die Textbreite die Untergrenze;
             verteilt wird nur, was darueber hinaus uebrig ist.

             Farben, Form und der aktive Zustand stehen als Inline-Stil
             an den Knoepfen und bleiben, wie sie sind — hier aendert
             sich allein die Breite. Die Umbruchregel von oben gilt
             weiter: sie greift hier nur nicht, weil alles in eine Zeile
             passt. */
          .tab-btn {
            flex: 1 1 auto;
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
          /* Ohne Rahmen bleibt fuer den Hover die Schriftfarbe — wie
             bei den Kategorie-Reitern darueber. */
          .unter-reiter:not([aria-pressed="true"]):hover { color: #EDEAE3 !important; }

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
              onClick={() => {
                setShowExport((v) => !v);
                setZeigeKopfbilder(false);
                /* Eine offene Vorschau gilt nur, solange das Panel
                   offen ist — sonst stuende beim naechsten Aufschlagen
                   eine Rechnung auf altem Stand da. */
                setSammelPlan(null);
              }}
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

                Solange die Sammlung nicht geladen ist, steht hier
                KEIN Abzeichen: die Punkte kommen aus ihr, 0 XP hiesse
                also "Kupfer", und das waere schlicht falsch.
                Stattdessen haelt ein gedimmter Platzhalter genau
                dessen Platz frei, damit beim Eintreffen nichts
                springt. */}
            <div>
              {loaded ? (
                <RangChip xp={xp} onClick={() => setRangOffen(true)} />
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

          {/* Tabs — umbrechend statt wischbar, siehe .tab-leiste */}
          <div className="tab-leiste" style={{ marginBottom: 0 }}>
            {sichtbareKats.map((c, i) => (
              <button
                key={c.key}
                data-tab={c.key}
                data-aktiv={activeTab === c.key ? "ja" : "nein"}
                onClick={() => {
                  /* Richtung aus der Position in der Leiste: weiter
                     rechts heisst, der Inhalt kommt von rechts. */
                  const jetzt = sichtbareKeys.indexOf(category);
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
          {/* Die Anzeige-Einstellung steht vorn: sie aendert nur, was
              zu sehen ist, waehrend alles darunter an den Daten
              arbeitet. */}
          <div style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 8, padding: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>
              KATEGORIEN
            </div>
            <KategorieAnsichtEinstellung
              ansicht={kategorieAnsicht}
              onAendern={aendereKategorieAnsicht}
            />
          </div>

          {/* Wie die Kategorie-Ansicht eine reine Anzeige-Einstellung
              dieses Geraets: Sie entscheidet nur, fuer welches Land die
              Verfuegbarkeit gilt. */}
          <div style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 8, padding: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>
              STREAMING-REGION
            </div>
            <RegionEinstellung wahl={regionWahl} erkannt={region} onAendern={aendereRegion} />
          </div>

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
                {"). Streaming-Verfügbarkeit über TMDB von "}
                <a href="https://www.justwatch.com" target="_blank" rel="noreferrer" style={quellenLink}>JustWatch</a>
                {" — angezeigt werden nur Abo-Anbieter."}
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

          {/* Die Sammelfunktion steht bewusst in einem eigenen Kasten:
              Sie aendert Bewertungen, waehrend darueber nur gelesen und
              gesichert wird. */}
          <div style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 8, padding: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--accent, #C9A227)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>
              DUELL-ZUSCHLÄGE
            </div>
            <SammelVerrechnen
              plan={sammelPlan}
              busy={busy}
              ergebnis={sammelErgebnis}
              onVorschau={sammelVorschau}
              onVerrechnen={sammelVerrechnen}
              onAbbrechen={sammelAbbrechen}
            />
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
        <StatsPage
          ranked={rankedByCategory}
          watchlist={watchlistByCategory}
          onOeffnen={eintragOeffnen}
        />
        </div>
      ) : activeTab === "minigames" ? (
        <div key="seite-minigames" className="seite-rein">
        <MinispielePage
          ranked={rankedByCategory}
          watchlist={watchlistByCategory}
          duellZahlen={duellZahlen}
          onDuell={duellAuswerten}
          onBewerten={vorgemerktesBewerten}
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
              hinweis={verrechnenHinweis}
              onSave={(payload) => { setVerrechnenHinweis(""); updateEntry(editingEntry.id, payload); }}
              onCancel={() => { setVerrechnenHinweis(""); setMode("list"); }}
            />
          )}

          {mode === "list" && (
            <>
              {/* Unter-Reiter: bewertete Eintraege, was gerade laeuft,
                  oder die Watchlist. Reiner Text im Unterstrich-Stil,
                  einzeilig und niemals umbrechend, siehe
                  .unter-reiter-leiste. Der Zaehler haengt ohne
                  Mittelpunkt am Namen — die zwei Zeichen entschieden
                  darueber, ob die Leiste noch in eine Reihe passt. */}
              <div className="unter-reiter-leiste" style={{ marginBottom: 16 }}>
                {[
                  { key: "bewertet", label: "Bewertet" },
                  {
                    key: "amschauen",
                    label:
                      amSchauenLabel(category) +
                      (anzeigeAmSchauen.length ? " " + anzeigeAmSchauen.length : ""),
                  },
                  {
                    key: "watchlist",
                    label:
                      merklisteLabel(category) +
                      (anzeigeWatchlist.length ? " " + anzeigeWatchlist.length : ""),
                  },
                ].map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setUnterReiter(r.key)}
                    aria-pressed={unterReiter === r.key}
                    className="unter-reiter"
                    style={{
                      /* Alles Weitere — Groesse, Trennstrich, Balken —
                         steht in .unter-reiter. Hier bleibt nur die
                         Farbe: aktiv die Kategoriefarbe, sonst die
                         gedaempfte Schriftfarbe. */
                      color: unterReiter === r.key ? "var(--accent, #C9A227)" : "#9A968C",
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

          {mode === "list" && unterReiter === "amschauen" && (
            <Uebergang trigger={unterReiter}>
            <>
              <div style={{ fontSize: 12.5, color: "#77746c", marginBottom: 14 }}>
                {!loaded && !zeigtCache ? (
                  <SkelettFlaeche breite={120} hoehe={11} rund={3} style={{ margin: "3px 0" }} />
                ) : anzeigeAmSchauen.length === 0 ? (
                  "Nichts angefangen."
                ) : (
                  anzeigeAmSchauen.length +
                  (anzeigeAmSchauen.length === 1 ? " Eintrag " : " Einträge ") +
                  amSchauenLabelKlein(category)
                )}
              </div>
              {!loaded && !zeigtCache ? (
                <SkelettListe />
              ) : anzeigeAmSchauen.length === 0 ? (
                /* Wie in der Watchlist erscheint der Satz erst, wenn
                   der Abruf durch ist — vorher wuesste niemand, ob
                   wirklich nichts da ist. */
                loaded && (
                  <div style={{ color: "#77746c", textAlign: "center", padding: 50, fontSize: 14.5 }}>
                    {category === "game"
                      ? "Gerade ist nichts angespielt."
                      : "Gerade läuft nichts."}{" "}
                    Was du angefangen, aber noch nicht zu Ende{" "}
                    {category === "game" ? "gespielt" : "geschaut"} hast, landet hier — den
                    Schalter „{amSchauenLabel(category)}" findest du am Eintrag selbst.
                  </div>
                )
              ) : (
                anzeigeAmSchauen.map((f, i) => (
                  <AmSchauenZeile
                    key={f.id}
                    eintrag={f}
                    reihe={i}
                    vorrang={i < 10}
                    akzent={accent}
                    /* Gecachte Zeilen sind reine Anzeige: aus ihnen
                       darf kein Schreibvorgang entstehen. */
                    busy={busy || zeigtCache}
                    ausLabel={amSchauenLabel(category)}
                    /* Derselbe Weg wie "✓ Ansehen" in der Watchlist:
                       dasselbe Formular, dieselbe Speicherfunktion.
                       Die Zeile blendet den Knopf von sich aus nur an
                       vorgemerkten Eintraegen ein. */
                    onBewerten={() => { setBewerteVorgemerkt(f); setMode("watchlist-form"); }}
                    onWeiter={() => {
                      const naechster = fortschrittWeiter(fortschrittStand(f));
                      if (naechster) fortschrittSpeichern(f.id, naechster.staffelNr, naechster.folgeNr);
                    }}
                    onStand={(staffel, folge) => fortschrittSpeichern(f.id, staffel, folge)}
                    onAus={() => amSchauenSchalten(f.id, false)}
                  />
                ))
              )}
            </>
            </Uebergang>
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
                    amSchauenLabelText={amSchauenLabel(category)}
                    anbieter={category === "game" ? null : anbieterFuer(streaming, f.id, region)}
                    onAmSchauen={() => amSchauenSchalten(f.id, true)}
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
                    {/* Auffaellige Bewertung: das Zeichen steht als
                        eigenes Element unmittelbar vor der Note. Es
                        sitzt damit zwischen dem linken Block und der
                        Note und rueckt nichts von beidem — Rangnummer,
                        Poster, Titel und Note bleiben, wo sie sind. */}
                    {entryAuffaellig(f) && (
                      <span
                        title="Der Duell-Zuschlag weicht deutlich von den Kriterien ab — Bewertung prüfen."
                        style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
                      >
                        <IconWarndreieck farbe={accent} />
                      </span>
                    )}
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
          /* Wo der Titel gerade im Abo laeuft. Bei Spielen gibt es das
             nicht — dort bleibt es bei null und die Karte entfaellt. */
          anbieter={category === "game" ? null : anbieterFuer(streaming, selectedEntry.id, region)}
          region={region}
          onBack={() => setSelectedId(null)}
          onEdit={() => { setVerrechnenHinweis(""); setMode("edit"); }}
          onDelete={() => setConfirmDelete(selectedEntry.id)}
          onSaveAngaben={(werte) => angabenSpeichern(selectedEntry.id, werte)}
          onSaveErstsichtung={(wert) => erstsichtungSpeichern(selectedEntry.id, wert)}
          onSaveWatchCount={(n) => zaehlerSpeichern(selectedEntry.id, n)}
          onAmSchauen={(an) => amSchauenSchalten(selectedEntry.id, an)}
          onEloZuruecksetzen={() => eloZuruecksetzen(category, selectedEntry.id)}
          onVerrechnen={() => setVerrechnenOffen(selectedEntry.id)}
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

      {rangOffen && <RangOverlay xp={xp} onClose={() => setRangOffen(false)} />}

      {xpHinweis && (
        <XpHinweis key={xpHinweis.id} punkte={xpHinweis.punkte} farbe={rangFuer(xp).rang.farbe} />
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

      {/* Der Verrechnen-Dialog. Er zeigt, was passieren wuerde;
          geschrieben wird erst mit der Wahl eines Weges. Ein Abbruch
          laesst Bewertung und Elo unberuehrt. */}
      {verrechnenOffen && selectedEntry && selectedEntry.id === verrechnenOffen && (
        <VerrechnenDialog
          entry={selectedEntry}
          category={category}
          onVerrechnen={(weg) => {
            const id = verrechnenOffen;
            setVerrechnenOffen(null);
            zuschlagVerrechnen(category, id, weg.entwurf);
          }}
          onSelbstVerteilen={() => {
            setVerrechnenHinweis(verrechnenHinweisText(selectedEntry, category));
            setVerrechnenOffen(null);
            setMode("edit");
          }}
          onCancel={() => setVerrechnenOffen(null)}
        />
      )}

      {zuschlagRueckfrage && (
        <ConfirmDialog
          title="Duell-Zuschlag zurücksetzen?"
          text={
            "Die Bewertung dieses Titels ist geändert. Soll sein Duell-Zuschlag " +
            "wieder bei 0 anfangen? Die gespielten Duelle bleiben gezählt."
          }
          confirmLabel="Ja"
          cancelLabel="Nein"
          onConfirm={() => {
            const offen = zuschlagRueckfrage;
            setZuschlagRueckfrage(null);
            eloZuruecksetzen(offen.catKey, offen.id);
          }}
          onCancel={() => setZuschlagRueckfrage(null)}
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
    </KategorieAnsichtContext.Provider>
  );
}
