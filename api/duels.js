import {
  sql, ensureReady, rowToDuelCount, rowToItem, eloNeu, ELO_START,
  CATEGORIES, logFehler, fehlerBeschreibung,
} from "./_db.js";

/**
 * Duelle — aus dem Minispiel "Head-to-Head" ebenso wie aus dem
 * Turnier, dessen Paarungen dieselbe Auswertung durchlaufen.
 *
 *   GET    /api/duels                              -> { counts: { movie: 12, ... } }
 *   POST   /api/duels  { category, winnerId, loserId }
 *                                                  -> { category, count, entries: [...] }
 *   POST   /api/duels  { category }                -> { category, count }
 *   DELETE /api/duels?id=...                       -> { id, elo, duels }
 *
 * Ein entschiedenes Duell verschiebt ausschliesslich die Elo-Zahl der
 * beiden Beteiligten und zaehlt hoch — je Eintrag und je Kategorie.
 * Bauchgefuehl und Kriterienwerte werden hier nirgends angefasst; sie
 * aendert allein das Bewertungsformular. Wer ueberspringt, aendert
 * nichts.
 *
 * Das Rechnen steht bewusst auf dem Server: Elo lesen, verschieben und
 * schreiben laeuft damit in einer Transaktion, und zwei kurz
 * aufeinanderfolgende Duelle desselben Titels koennen sich nicht
 * gegenseitig ueberschreiben.
 */
export default async function handler(req, res) {
  try {
    await ensureReady();

    if (req.method === "GET") return await list(req, res);
    if (req.method === "POST") return await auswerten(req, res);
    if (req.method === "DELETE") return await zuruecksetzen(req, res);

    res.setHeader("Allow", "GET, POST, DELETE");
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
function zaehlerAbfrage(category, now) {
  return sql`
    INSERT INTO duel_counts (category, duels, updated_at)
    VALUES (${category}, 1, ${now})
    ON CONFLICT (category) DO UPDATE
      SET duels = duel_counts.duels + 1, updated_at = ${now}
    RETURNING *
  `;
}

async function auswerten(req, res) {
  const body = req.body || {};
  const category = typeof body.category === "string" ? body.category : "";
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Ungültige Kategorie." });
  }

  const gewinnerId = typeof body.winnerId === "string" ? body.winnerId : "";
  const verliererId = typeof body.loserId === "string" ? body.loserId : "";

  /* Ohne Beteiligte bleibt es beim reinen Hochzaehlen — so, wie der
     Endpunkt es vor der Elo-Wertung schon tat. */
  if (!gewinnerId || !verliererId) {
    const rows = await zaehlerAbfrage(category, Date.now());
    return res.status(200).json(rowToDuelCount(rows[0]));
  }

  if (gewinnerId === verliererId) {
    return res.status(400).json({ error: "Ein Titel kann nicht gegen sich selbst antreten." });
  }

  const beteiligte = await sql`
    SELECT id, elo FROM media_items WHERE id IN (${gewinnerId}, ${verliererId})
  `;
  const eloVon = new Map(
    beteiligte.map((r) => [r.id, r.elo === null || r.elo === undefined ? ELO_START : Number(r.elo)])
  );
  if (!eloVon.has(gewinnerId) || !eloVon.has(verliererId)) {
    return res.status(404).json({ error: "Eintrag nicht gefunden." });
  }

  const neu = eloNeu(eloVon.get(gewinnerId), eloVon.get(verliererId));
  const now = Date.now();

  /* Beide Eintraege und der Kategoriezaehler gehen gemeinsam in die
     Datenbank — entweder alles oder nichts. Geschrieben werden genau
     zwei Spalten je Eintrag: `elo` und `duels`. Bauchgefuehl,
     Kriterienwerte und alles Uebrige bleiben unberuehrt; auch
     `updated_at` bleibt stehen, damit ein Duell nicht wie eine
     Bearbeitung aussieht. */
  const ergebnis = await sql.transaction([
    sql`
      UPDATE media_items SET elo = ${neu.gewinner}, duels = duels + 1
      WHERE id = ${gewinnerId} RETURNING *
    `,
    sql`
      UPDATE media_items SET elo = ${neu.verlierer}, duels = duels + 1
      WHERE id = ${verliererId} RETURNING *
    `,
    zaehlerAbfrage(category, now),
  ]);

  const stand = rowToDuelCount(ergebnis[2][0]);
  return res.status(200).json({
    category: stand.category,
    count: stand.count,
    entries: [ergebnis[0][0], ergebnis[1][0]]
      .filter(Boolean)
      .map((r) => {
        const item = rowToItem(r);
        return { id: item.id, elo: item.elo, duels: item.duels };
      }),
  });
}

/**
 * Elo eines Eintrags auf den Startwert zuruecksetzen.
 *
 * Der Zuschlag auf die Endnote ist danach wieder exakt 0. Die
 * Duell-Historie bleibt: der Zaehler des Eintrags und der Zaehler der
 * Kategorie werden nicht angefasst.
 */
async function zuruecksetzen(req, res) {
  const id = req.query.id || (req.body && req.body.id);
  if (!id) return res.status(400).json({ error: "id fehlt." });

  const rows = await sql`
    UPDATE media_items SET elo = ${ELO_START} WHERE id = ${id} RETURNING *
  `;
  if (!rows.length) return res.status(404).json({ error: "Eintrag nicht gefunden." });

  const item = rowToItem(rows[0]);
  return res.status(200).json({ id: item.id, elo: item.elo, duels: item.duels });
}
