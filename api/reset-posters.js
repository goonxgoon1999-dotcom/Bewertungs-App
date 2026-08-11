import { sql, ensureReady } from "./_db.js";

/**
 * POST /api/reset-posters
 *
 * Leert das Poster bei allen Einträgen, deren Poster NICHT von Hand
 * gesetzt wurde (poster_source <> 'manual'). Die automatische
 * Poster-Suche im Frontend greift nur bei Einträgen ohne Poster —
 * die betroffenen Einträge werden also beim nächsten Laden neu gesucht.
 *
 * Manuell gepflegte Poster bleiben unangetastet.
 *
 * -> { ok: true, cleared: <Anzahl> }
 */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Methode nicht erlaubt." });
    }

    await ensureReady();

    // IS DISTINCT FROM behandelt NULL wie einen normalen Wert — Einträge
    // ganz ohne poster_source zählen also ebenfalls als "nicht manuell".
    const rows = await sql`
      UPDATE media_items
      SET poster        = '',
          poster_source = NULL,
          updated_at    = ${Date.now()}
      WHERE poster_source IS DISTINCT FROM 'manual'
        AND poster <> ''
      RETURNING id
    `;

    return res.status(200).json({ ok: true, cleared: rows.length });
  } catch (err) {
    console.error("API-Fehler:", err);
    return res.status(500).json({ error: "Serverfehler: " + (err.message || "unbekannt") });
  }
}
