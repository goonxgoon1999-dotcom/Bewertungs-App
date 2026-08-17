import {
  sql, ensureReady, rowToDuelCount, CATEGORIES, logFehler, fehlerBeschreibung,
} from "./_db.js";

/**
 * Gespielte Duelle je Kategorie — aus dem Minispiel "Head-to-Head"
 * ebenso wie aus dem Turnier, dessen Paarungen dieselbe Auswertung
 * durchlaufen.
 *
 *   GET  /api/duels                 -> { counts: { movie: 12, series: 0, ... } }
 *   POST /api/duels   { category }  -> { category, count }
 *
 * Gezaehlt wird ausschliesslich ein ausgewertetes Duell. Wer
 * ueberspringt, aendert nichts — weder am Bauchgefuehl noch hier.
 */
export default async function handler(req, res) {
  try {
    await ensureReady();

    if (req.method === "GET") return await list(req, res);
    if (req.method === "POST") return await zaehle(req, res);

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Methode nicht erlaubt." });
  } catch (err) {
    logFehler("API-Fehler (/api/duels)", err);
    return res.status(500).json({ error: "Serverfehler: " + fehlerBeschreibung(err) });
  }
}

/* Jede Kategorie kommt vor, auch die noch nie gespielten — dann mit 0.
   So muss das Frontend nicht zwischen "0" und "fehlt" unterscheiden. */
async function list(req, res) {
  const rows = await sql`SELECT * FROM duel_counts`;
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const r of rows) {
    const eintrag = rowToDuelCount(r);
    if (eintrag.category in counts) counts[eintrag.category] = eintrag.count;
  }
  return res.status(200).json({ counts });
}

/* Hochzaehlen in einem Schritt: die Zeile entsteht beim ersten Duell
   und waechst danach ueber ON CONFLICT weiter. Zwei gleichzeitige
   Duelle koennen sich dadurch nicht gegenseitig ueberschreiben. */
async function zaehle(req, res) {
  const body = req.body || {};
  const category = typeof body.category === "string" ? body.category : "";
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Ungültige Kategorie." });
  }

  const now = Date.now();
  const rows = await sql`
    INSERT INTO duel_counts (category, duels, updated_at)
    VALUES (${category}, 1, ${now})
    ON CONFLICT (category) DO UPDATE
      SET duels = duel_counts.duels + 1, updated_at = ${now}
    RETURNING *
  `;
  return res.status(200).json(rowToDuelCount(rows[0]));
}
