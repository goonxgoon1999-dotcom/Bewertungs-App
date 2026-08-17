import {
  sql, ensureReady, rowToHeaderImage, logFehler, fehlerBeschreibung,
} from "./_db.js";

/**
 * Bilder für den Kopfbereich — von Hand gepflegt, es gibt dafür keine
 * automatische Suche.
 *
 *   GET    /api/header-images            -> { images: [...] }
 *   POST   /api/header-images            { url }        -> angelegtes Bild
 *   DELETE /api/header-images?id=...                    -> { ok: true, id }
 *
 * Die Reihenfolge steckt in `position`; neue Bilder hängen sich hinten an.
 */
export default async function handler(req, res) {
  try {
    await ensureReady();

    if (req.method === "GET") return await list(req, res);
    if (req.method === "POST") return await add(req, res);
    if (req.method === "DELETE") return await remove(req, res);

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Methode nicht erlaubt." });
  } catch (err) {
    logFehler("API-Fehler (/api/header-images)", err);
    return res.status(500).json({ error: "Serverfehler: " + fehlerBeschreibung(err) });
  }
}

async function list(req, res) {
  const rows = await sql`SELECT * FROM header_images ORDER BY position, created_at`;
  return res.status(200).json({ images: rows.map(rowToHeaderImage) });
}

async function add(req, res) {
  const body = req.body || {};
  const url = typeof body.url === "string" ? body.url.trim() : "";

  if (!url) return res.status(400).json({ error: "Bild-Adresse fehlt." });
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "Die Adresse muss mit http:// oder https:// beginnen." });
  }

  const now = Date.now();
  // Ans Ende einsortieren, damit die bestehende Reihenfolge bleibt.
  const max = await sql`SELECT COALESCE(MAX(position), -1)::int AS p FROM header_images`;
  const id = "hdr_" + now + "_" + Math.random().toString(36).slice(2, 8);

  const rows = await sql`
    INSERT INTO header_images (id, url, position, created_at)
    VALUES (${id}, ${url}, ${max[0].p + 1}, ${now})
    RETURNING *
  `;
  return res.status(201).json(rowToHeaderImage(rows[0]));
}

async function remove(req, res) {
  const id = req.query.id || (req.body && req.body.id);
  if (!id) return res.status(400).json({ error: "id fehlt." });

  const rows = await sql`DELETE FROM header_images WHERE id = ${id} RETURNING id`;
  if (!rows.length) return res.status(404).json({ error: "Bild nicht gefunden." });
  return res.status(200).json({ ok: true, id });
}
