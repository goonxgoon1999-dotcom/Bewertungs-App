import { neon } from "@neondatabase/serverless";
import { INITIAL_MOVIES_RAW } from "./seed-data.js";

// Vercel/Neon setzen diese Variable automatisch, wenn du die
// Neon-Integration im Vercel-Dashboard hinzufügst.
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL;

if (!connectionString) {
  console.error("Keine Datenbank-Verbindung gefunden. Bitte DATABASE_URL setzen.");
}

export const sql = neon(connectionString);

/* Film, Serie und Anime teilen sich dieselben Felder. Anime zeigt zwei
   davon nur anders beschriftet an ("Animation" statt "Inszenierung",
   "Synchronstimme" statt "Schauspiel") — die Spalten heissen unveraendert
   inszenierung und schauspiel. */
const AV_KEYS = [
  "story",
  "charaktere",
  "unterhaltung",
  "emotion",
  "inszenierung",
  "schauspiel",
  "sound",
];

const GAME_KEYS = [
  "gameplay",
  "story",
  "charaktere",
  "welt",
  "grafik",
  "sound",
  "wiederspielwert",
];

export const CATEGORIES = ["movie", "series", "anime", "game"];

export const CRITERIA_KEYS_BY_CATEGORY = {
  movie: AV_KEYS,
  series: AV_KEYS,
  anime: AV_KEYS,
  game: GAME_KEYS,
};

/** Alle Kriterien-Spalten, die es in der Tabelle gibt. */
export const ALL_CRITERIA_KEYS = Array.from(new Set([...AV_KEYS, ...GAME_KEYS]));

export function criteriaKeysFor(category) {
  return CRITERIA_KEYS_BY_CATEGORY[category] || AV_KEYS;
}

let initPromise = null;

/** Legt die Tabelle an (falls nötig) und befüllt sie einmalig. */
export function ensureReady() {
  if (!initPromise) initPromise = init();
  return initPromise;
}

async function init() {
  await sql`
    CREATE TABLE IF NOT EXISTS media_items (
      id            TEXT PRIMARY KEY,
      category      TEXT NOT NULL CHECK (category IN ('movie','series','anime')),
      title         TEXT NOT NULL,
      poster        TEXT NOT NULL DEFAULT '',
      poster_source TEXT,
      story         REAL NOT NULL,
      charaktere    REAL NOT NULL,
      unterhaltung  REAL NOT NULL,
      emotion       REAL NOT NULL,
      inszenierung  REAL NOT NULL,
      schauspiel    REAL NOT NULL,
      sound         REAL NOT NULL,
      personal      REAL NOT NULL,
      created_at    BIGINT NOT NULL,
      updated_at    BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS media_items_category_idx ON media_items (category)`;

  await migrateForGames();
  await ensureSeasons();
  await ensureHeaderImages();

  // Seeding nur, wenn die Tabelle wirklich leer ist — so gehen
  // vorhandene Bewertungen niemals verloren.
  const rows = await sql`SELECT COUNT(*)::int AS n FROM media_items`;
  if (rows[0].n > 0) return;

  for (let i = 0; i < INITIAL_MOVIES_RAW.length; i++) {
    const [title, score] = INITIAL_MOVIES_RAW[i];
    await sql`
      INSERT INTO media_items
        (id, category, title, poster, story, charaktere, unterhaltung, emotion,
         inszenierung, schauspiel, sound, personal, created_at, updated_at)
      VALUES
        (${"legacy_movie_" + i}, 'movie', ${title}, '',
         ${score}, ${score}, ${score}, ${score}, ${score}, ${score}, ${score}, ${score},
         0, 0)
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

/**
 * Erweitert eine bestehende Tabelle um die Spiele-Kategorie.
 *
 * Alles hier ist rein strukturell: Es werden Spalten hinzugefuegt und
 * Pflichtfelder gelockert, aber KEINE einzige bestehende Zeile
 * angefasst. Vorhandene Bewertungen bleiben Bit fuer Bit erhalten.
 */
async function migrateForGames() {
  // 1. Neue Spalten fuer die Spiele-Kriterien. Sie sind absichtlich
  //    NULL-bar: fuer Filme, Serien und Anime gibt es diese Werte nicht.
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS gameplay REAL`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS welt REAL`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS grafik REAL`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS wiederspielwert REAL`;

  // Breites Szenenbild fuer den Kopfbereich. NULL-bar, damit
  // bestehende Zeilen unveraendert bleiben.
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS backdrop TEXT`;

  // 2. Die vier Felder, die es nur bei Film/Serie/Anime gibt, duerfen
  //    bei Spielen leer bleiben. DROP NOT NULL aendert nur die
  //    Spaltendefinition, nicht die gespeicherten Werte.
  await sql`ALTER TABLE media_items ALTER COLUMN unterhaltung DROP NOT NULL`;
  await sql`ALTER TABLE media_items ALTER COLUMN emotion DROP NOT NULL`;
  await sql`ALTER TABLE media_items ALTER COLUMN inszenierung DROP NOT NULL`;
  await sql`ALTER TABLE media_items ALTER COLUMN schauspiel DROP NOT NULL`;

  // 3. Der CHECK auf category kennt 'game' noch nicht. Der alte
  //    Constraint wurde inline angelegt und heisst je nach Postgres-
  //    Version unterschiedlich — deshalb werden alle CHECKs auf
  //    category gesucht und ersetzt. Der Block laeuft nur einmal:
  //    danach existiert der neue, benannte Constraint.
  await sql`
    DO $$
    DECLARE con_name text;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        WHERE r.relname = 'media_items'
          AND c.conname = 'media_items_category_allowed'
      ) THEN
        FOR con_name IN
          SELECT c.conname FROM pg_constraint c
          JOIN pg_class r ON r.oid = c.conrelid
          WHERE r.relname = 'media_items'
            AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) ILIKE '%category%'
        LOOP
          EXECUTE 'ALTER TABLE media_items DROP CONSTRAINT ' || quote_ident(con_name);
        END LOOP;

        ALTER TABLE media_items
          ADD CONSTRAINT media_items_category_allowed
          CHECK (category IN ('movie','series','anime','game'));
      END IF;
    END $$
  `;
}

/* Kategorien, die optional in Staffeln unterteilt werden koennen. */
export const SEASON_CATEGORIES = ["series", "anime"];

export function supportsSeasons(category) {
  return SEASON_CATEGORIES.includes(category);
}

/**
 * Tabelle fuer die optionale Staffelbewertung. Wird nur angelegt, wenn
 * sie fehlt — bestehende Daten bleiben unberuehrt. Die Staffeln haengen
 * per Fremdschluessel am Eintrag und verschwinden mit ihm (CASCADE).
 */
async function ensureSeasons() {
  await sql`
    CREATE TABLE IF NOT EXISTS seasons (
      id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      item_id       TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      season_number INTEGER NOT NULL,
      story         REAL NOT NULL,
      charaktere    REAL NOT NULL,
      unterhaltung  REAL NOT NULL,
      emotion       REAL NOT NULL,
      inszenierung  REAL NOT NULL,
      schauspiel    REAL NOT NULL,
      sound         REAL NOT NULL,
      personal      REAL NOT NULL,
      created_at    BIGINT NOT NULL,
      updated_at    BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS seasons_item_idx ON seasons (item_id)`;

  // Gewichtungsfaktor je Staffel. Bestehende Zeilen bekommen 1.0 und
  // behalten damit exakt ihre bisherige Note.
  await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS weight REAL NOT NULL DEFAULT 1.0`;

  await migrateSeasonIds();
}

/**
 * Frueher hat der Anwendungscode die Staffel-IDs selbst gebaut
 * ("<eintrag>_s1", "<eintrag>_s2", ...) und die Staffeln beim Speichern
 * geloescht und neu eingefuegt. Ueberschnitten sich dabei zwei
 * Speichervorgaenge desselben Eintrags, kollidierten die IDs — genau
 * der Fehler "duplicate key value violates unique constraint
 * seasons_pkey".
 *
 * Die ID vergibt deshalb jetzt Postgres. Da die alten IDs Text sind und
 * sich nicht in Zahlen umwandeln lassen, wird die Spalte ersetzt: Die
 * Staffelzeilen selbst bleiben dabei unveraendert erhalten (niemand
 * verweist auf seasons.id), nur ihre ID ist danach eine fortlaufende
 * Zahl. Der Block laeuft genau einmal — danach ist die Spalte kein
 * Text mehr.
 */
async function migrateSeasonIds() {
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'seasons' AND column_name = 'id' AND data_type = 'text'
      ) THEN
        ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_pkey;
        ALTER TABLE seasons DROP COLUMN id;
        ALTER TABLE seasons ADD COLUMN id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
      END IF;
    END $$
  `;
}

/**
 * Bilder fuer den Kopfbereich. Werden von Hand gepflegt — es gibt
 * keine automatische Suche dafuer. Idempotent angelegt.
 */
async function ensureHeaderImages() {
  await sql`
    CREATE TABLE IF NOT EXISTS header_images (
      id         TEXT PRIMARY KEY,
      url        TEXT NOT NULL,
      position   INTEGER NOT NULL,
      created_at BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS header_images_pos_idx ON header_images (position)`;
}

/** Datenbankzeile -> Kopfbild fuer das Frontend. */
export function rowToHeaderImage(r) {
  return { id: r.id, url: r.url, position: Number(r.position) };
}

/* Gewichtung einer Staffel. Eingegeben wird sie in der App als Prozent
   (0 % bis 200 % in 5-Prozent-Schritten); gespeichert und gerechnet wird
   weiterhin mit Faktoren (Prozent / 100). 100 % entspricht dem Faktor
   1.0 — bestehende Staffeln aendern ihre Note dadurch nicht. */
export const SEASON_WEIGHT_MIN = 0;
export const SEASON_WEIGHT_MAX = 2;
export const SEASON_WEIGHT_DEFAULT = 1;
export const SEASON_WEIGHT_STEP = 0.05;

export function normalizeWeight(wert) {
  if (typeof wert !== "number" || Number.isNaN(wert)) return SEASON_WEIGHT_DEFAULT;
  const begrenzt = Math.min(SEASON_WEIGHT_MAX, Math.max(SEASON_WEIGHT_MIN, wert));
  // Auf 0.05 (= 5 %) runden, damit keine krummen Werte in die
  // Datenbank geraten.
  return Math.round(begrenzt * 20) / 20;
}

/** Staffelzeile -> Format, das das Frontend erwartet. */
export function rowToSeason(r) {
  const values = {};
  for (const key of AV_KEYS) values[key] = Number(r[key]);
  return {
    // Die ID vergibt Postgres (Identity). Als Zeichenkette, damit grosse
    // Zahlen unterwegs nicht an Genauigkeit verlieren.
    id: r.id === null || r.id === undefined ? undefined : String(r.id),
    seasonNumber: Number(r.season_number),
    values,
    personal: Number(r.personal),
    weight: normalizeWeight(r.weight === null || r.weight === undefined ? SEASON_WEIGHT_DEFAULT : Number(r.weight)),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

/**
 * Prueft eine Staffelliste. Staffeln gibt es nur bei Serien und Anime;
 * jede traegt dieselben sieben Kriterien wie der Eintrag selbst.
 */
export function validateSeasons(seasons, category) {
  const errors = [];
  if (seasons == null) return errors;
  if (!Array.isArray(seasons)) return ["Ungültige Staffelliste."];
  if (!seasons.length) return errors;

  if (!supportsSeasons(category)) {
    errors.push("Staffeln gibt es nur bei Serien und Anime.");
    return errors;
  }

  seasons.forEach((season, i) => {
    const nr = i + 1;
    if (!season || typeof season !== "object") {
      errors.push("Staffel " + nr + " ist ungültig.");
      return;
    }
    const values = season.values || {};
    for (const key of AV_KEYS) {
      const v = values[key];
      if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 10) {
        errors.push("Staffel " + nr + ": ungültiger Wert für " + key + " (0–10 erforderlich).");
      }
    }
    if (typeof season.personal !== "number" || season.personal < 0 || season.personal > 10) {
      errors.push("Staffel " + nr + ": ungültiges Bauchgefühl (0–10 erforderlich).");
    }
    // Das Gewicht ist optional; fehlt es, gilt 1.0 (= 100 %).
    if (
      season.weight != null &&
      (typeof season.weight !== "number" ||
        Number.isNaN(season.weight) ||
        season.weight < SEASON_WEIGHT_MIN ||
        season.weight > SEASON_WEIGHT_MAX)
    ) {
      errors.push("Staffel " + nr + ": ungültige Gewichtung (0–200 % erforderlich).");
    }
  });

  return errors;
}

/** Datenbankzeile -> Format, das das Frontend erwartet. */
export function rowToItem(r) {
  // Nur die Felder der jeweiligen Kategorie zurueckgeben. Sonst kaemen
  // die nicht belegten Spalten als 0 beim Frontend an und wuerden dort
  // wie echte Bewertungen aussehen.
  const values = {};
  for (const key of criteriaKeysFor(r.category)) {
    values[key] = r[key] === null || r[key] === undefined ? null : Number(r[key]);
  }

  return {
    id: r.id,
    category: r.category,
    title: r.title,
    poster: r.poster || "",
    posterSource: r.poster_source || undefined,
    backdrop: r.backdrop || "",
    values,
    personal: Number(r.personal),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

/** Serverseitige Validierung — keine ungültigen Daten in der DB. */
export function validateItem(body) {
  const errors = [];
  if (!body || typeof body !== "object") return ["Ungültiger Datensatz."];

  if (typeof body.title !== "string" || !body.title.trim()) errors.push("Titel fehlt.");
  if (!CATEGORIES.includes(body.category)) {
    // Ohne gueltige Kategorie ist nicht entscheidbar, welche Kriterien
    // gelten — die Wertepruefung waere dann sinnlos.
    errors.push("Ungültige Kategorie.");
    return errors;
  }

  const values = body.values || {};
  for (const key of criteriaKeysFor(body.category)) {
    const v = values[key];
    if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 10) {
      errors.push("Ungültiger Wert für " + key + " (0–10 erforderlich).");
    }
  }
  if (typeof body.personal !== "number" || body.personal < 0 || body.personal > 10) {
    errors.push("Ungültiges Bauchgefühl (0–10 erforderlich).");
  }
  if (body.poster != null && typeof body.poster !== "string") errors.push("Ungültige Poster-URL.");
  if (body.backdrop != null && typeof body.backdrop !== "string") errors.push("Ungültige Backdrop-URL.");

  errors.push(...validateSeasons(body.seasons, body.category));

  return errors;
}
