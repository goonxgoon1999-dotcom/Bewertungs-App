import { sql, ensureReady, rowToHighscore, CATEGORIES } from "./_db.js";

/**
 * Bestwerte der Minispiele, je Spiel und Spielart.
 *
 *   GET  /api/highscores?game=higher-or-lower
 *        -> { scores: { mixed: 14, movie: 9, ... } }
 *   POST /api/highscores  { game, mode, score }
 *        -> { game, mode, score }   (der gespeicherte Bestwert)
 *
 * Ein POST meldet das Ergebnis eines Durchgangs, nicht den Bestwert:
 * gespeichert wird der hoehere der beiden Werte (siehe GREATEST unten).
 * Ein schwaecherer Durchgang kann einen Bestwert also nie druecken.
 */

/* Welche Spielarten es je Spiel gibt. Alles andere wird abgewiesen —
   so landen keine erfundenen Schluessel in der Tabelle. */
const SPIELARTEN = {
  "higher-or-lower": ["mixed", ...CATEGORIES],
};

/* Eine Strähne von 100000 richtigen Tipps hat niemand; alles darueber
   ist ein Fehler und keine Bestleistung. */
const MAX_SCORE = 100000;

export default async function handler(req, res) {
  try {
    await ensureReady();

    if (req.method === "GET") return await list(req, res);
    if (req.method === "POST") return await melde(req, res);

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Methode nicht erlaubt." });
  } catch (err) {
    console.error("API-Fehler:", err);
    return res.status(500).json({ error: "Serverfehler: " + (err.message || "unbekannt") });
  }
}

/* Jede Spielart des Spiels kommt vor, auch die nie gespielten — dann
   mit 0. So muss das Frontend nicht zwischen "0" und "fehlt"
   unterscheiden. */
async function list(req, res) {
  const game = typeof req.query.game === "string" ? req.query.game : "";
  const arten = SPIELARTEN[game];
  if (!arten) return res.status(400).json({ error: "Unbekanntes Spiel." });

  const rows = await sql`SELECT * FROM highscores WHERE game = ${game}`;
  const scores = Object.fromEntries(arten.map((m) => [m, 0]));
  for (const r of rows) {
    const eintrag = rowToHighscore(r);
    if (eintrag.mode in scores) scores[eintrag.mode] = eintrag.score;
  }
  return res.status(200).json({ scores });
}

async function melde(req, res) {
  const body = req.body || {};
  const game = typeof body.game === "string" ? body.game : "";
  const mode = typeof body.mode === "string" ? body.mode : "";
  const score = body.score;

  const arten = SPIELARTEN[game];
  if (!arten) return res.status(400).json({ error: "Unbekanntes Spiel." });
  if (!arten.includes(mode)) return res.status(400).json({ error: "Ungültige Spielart." });
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
    return res.status(400).json({ error: "Ungültiges Ergebnis (0–" + MAX_SCORE + " erforderlich)." });
  }

  /* In einem Schritt: die Zeile entsteht beim ersten Durchgang und
     waechst danach nur noch. GREATEST haelt den Bestwert auch dann
     richtig, wenn zwei Durchgaenge gleichzeitig melden. */
  const now = Date.now();
  const rows = await sql`
    INSERT INTO highscores (game, mode, score, updated_at)
    VALUES (${game}, ${mode}, ${score}, ${now})
    ON CONFLICT (game, mode) DO UPDATE
      SET score = GREATEST(highscores.score, EXCLUDED.score),
          updated_at = ${now}
    RETURNING *
  `;
  return res.status(200).json(rowToHighscore(rows[0]));
}
