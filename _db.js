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

export const CRITERIA_KEYS = [
  "story",
  "charaktere",
  "unterhaltung",
  "emotion",
  "inszenierung",
  "schauspiel",
  "sound",
];

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

/** Datenbankzeile -> Format, das das Frontend erwartet. */
export function rowToItem(r) {
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    poster: r.poster || "",
    posterSource: r.poster_source || undefined,
    values: {
      story: Number(r.story),
      charaktere: Number(r.charaktere),
      unterhaltung: Number(r.unterhaltung),
      emotion: Number(r.emotion),
      inszenierung: Number(r.inszenierung),
      schauspiel: Number(r.schauspiel),
      sound: Number(r.sound),
    },
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
  if (!["movie", "series", "anime"].includes(body.category)) errors.push("Ungültige Kategorie.");

  const values = body.values || {};
  for (const key of CRITERIA_KEYS) {
    const v = values[key];
    if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 10) {
      errors.push("Ungültiger Wert für " + key + " (0–10 erforderlich).");
    }
  }
  if (typeof body.personal !== "number" || body.personal < 0 || body.personal > 10) {
    errors.push("Ungültiges Bauchgefühl (0–10 erforderlich).");
  }
  if (body.poster != null && typeof body.poster !== "string") errors.push("Ungültige Poster-URL.");

  return errors;
}
