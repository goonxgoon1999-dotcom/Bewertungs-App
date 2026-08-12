import { sql, ensureReady, rowToItem, validateItem, criteriaKeysFor, CATEGORIES } from "./_db.js";

/**
 * Bringt die Kriterien-Werte in die feste Spaltenreihenfolge der
 * Tabelle. Felder, die es in der jeweiligen Kategorie nicht gibt,
 * werden bewusst NULL — ein Spiel hat kein "Schauspiel", und eine 0
 * waere dort eine erfundene Bewertung.
 */
function criteriaColumns(category, values) {
  const allowed = new Set(criteriaKeysFor(category));
  const pick = (key) => (allowed.has(key) ? values[key] : null);
  return {
    story: pick("story"),
    charaktere: pick("charaktere"),
    unterhaltung: pick("unterhaltung"),
    emotion: pick("emotion"),
    inszenierung: pick("inszenierung"),
    schauspiel: pick("schauspiel"),
    sound: pick("sound"),
    gameplay: pick("gameplay"),
    welt: pick("welt"),
    grafik: pick("grafik"),
    wiederspielwert: pick("wiederspielwert"),
  };
}

export default async function handler(req, res) {
  try {
    await ensureReady();

    if (req.method === "GET") return await list(req, res);
    if (req.method === "POST") return await create(req, res);
    if (req.method === "PUT" || req.method === "PATCH") return await update(req, res);
    if (req.method === "DELETE") return await remove(req, res);

    res.setHeader("Allow", "GET, POST, PUT, PATCH, DELETE");
    return res.status(405).json({ error: "Methode nicht erlaubt." });
  } catch (err) {
    console.error("API-Fehler:", err);
    return res.status(500).json({ error: "Serverfehler: " + (err.message || "unbekannt") });
  }
}

/** GET /api/items -> { movie: [...], series: [...], anime: [...] } */
async function list(req, res) {
  const rows = await sql`SELECT * FROM media_items`;
  const grouped = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  for (const r of rows) {
    const item = rowToItem(r);
    if (grouped[item.category]) grouped[item.category].push(item);
  }
  return res.status(200).json(grouped);
}

/** POST /api/items — neuen Eintrag anlegen */
async function create(req, res) {
  const body = req.body || {};
  const errors = validateItem(body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const now = Date.now();
  const id = body.id || body.category + "_" + now + "_" + Math.random().toString(36).slice(2, 8);
  const v = criteriaColumns(body.category, body.values);

  const rows = await sql`
    INSERT INTO media_items
      (id, category, title, poster, poster_source, backdrop, story, charaktere, unterhaltung,
       emotion, inszenierung, schauspiel, sound, gameplay, welt, grafik, wiederspielwert,
       personal, created_at, updated_at)
    VALUES
      (${id}, ${body.category}, ${body.title.trim()}, ${body.poster || ""}, ${body.posterSource || null},
       ${body.backdrop || ""},
       ${v.story}, ${v.charaktere}, ${v.unterhaltung}, ${v.emotion},
       ${v.inszenierung}, ${v.schauspiel}, ${v.sound},
       ${v.gameplay}, ${v.welt}, ${v.grafik}, ${v.wiederspielwert}, ${body.personal},
       ${body.createdAt || now}, ${now})
    RETURNING *
  `;
  return res.status(201).json(rowToItem(rows[0]));
}

/** PUT /api/items?id=... — Eintrag vollständig aktualisieren */
async function update(req, res) {
  const id = req.query.id || (req.body && req.body.id);
  if (!id) return res.status(400).json({ error: "id fehlt." });

  const body = req.body || {};
  const errors = validateItem(body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const v = criteriaColumns(body.category, body.values);
  const rows = await sql`
    UPDATE media_items SET
      category        = ${body.category},
      title           = ${body.title.trim()},
      poster          = ${body.poster || ""},
      poster_source   = ${body.posterSource || null},
      backdrop        = ${body.backdrop || ""},
      story           = ${v.story},
      charaktere      = ${v.charaktere},
      unterhaltung    = ${v.unterhaltung},
      emotion         = ${v.emotion},
      inszenierung    = ${v.inszenierung},
      schauspiel      = ${v.schauspiel},
      sound           = ${v.sound},
      gameplay        = ${v.gameplay},
      welt            = ${v.welt},
      grafik          = ${v.grafik},
      wiederspielwert = ${v.wiederspielwert},
      personal        = ${body.personal},
      updated_at      = ${Date.now()}
    WHERE id = ${id}
    RETURNING *
  `;
  if (!rows.length) return res.status(404).json({ error: "Eintrag nicht gefunden." });
  return res.status(200).json(rowToItem(rows[0]));
}

/** DELETE /api/items?id=... */
async function remove(req, res) {
  const id = req.query.id || (req.body && req.body.id);
  if (!id) return res.status(400).json({ error: "id fehlt." });

  const rows = await sql`DELETE FROM media_items WHERE id = ${id} RETURNING id`;
  if (!rows.length) return res.status(404).json({ error: "Eintrag nicht gefunden." });
  return res.status(200).json({ ok: true, id });
}
