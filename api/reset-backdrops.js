import { sql, ensureReady } from "./_db.js";

/**
 * POST /api/reset-backdrops
 *
 * Leert ausschließlich die Breitbilder (Backdrops). Poster,
 * Poster-Quelle und sämtliche Bewertungen bleiben unangetastet.
 *
 * Die automatische Nachladelogik im Frontend holt Einträge ohne
 * Backdrop erneut ab — die geleerten Einträge werden also beim
 * nächsten Laden neu gesucht.
 *
 * -> { ok: true, zurueckgesetzt: <Anzahl>, cleared: <Anzahl> }
 */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Methode nicht erlaubt." });
    }

    await ensureReady();

    // Nur Zeilen anfassen, die tatsächlich ein Backdrop haben — so ist
    // die zurückgemeldete Anzahl aussagekräftig.
    const rows = await sql`
      UPDATE media_items
      SET backdrop   = '',
          updated_at = ${Date.now()}
      WHERE backdrop IS NOT NULL
        AND backdrop <> ''
      RETURNING id
    `;

    return res.status(200).json({
      ok: true,
      zurueckgesetzt: rows.length,
      cleared: rows.length,
    });
  } catch (err) {
    console.error("API-Fehler:", err);
    return res.status(500).json({ error: "Serverfehler: " + (err.message || "unbekannt") });
  }
}
