import {
  sql, ensureReady, rowToItem, rowToSeason, validateItem,
  criteriaKeysFor, CATEGORIES, supportsSeasons,
} from "./_db.js";

/**
 * Schreibt die Staffeln eines Eintrags neu. Es wird ersetzt statt
 * einzeln abgeglichen: die Liste ist kurz, und so kann keine
 * verwaiste Staffel zurueckbleiben.
 */
async function saveSeasons(itemId, category, seasons) {
  await sql`DELETE FROM seasons WHERE item_id = ${itemId}`;
  if (!supportsSeasons(category) || !Array.isArray(seasons) || !seasons.length) return;

  const now = Date.now();
  for (let i = 0; i < seasons.length; i++) {
    const s = seasons[i];
    const v = s.values || {};
    await sql`
      INSERT INTO seasons
        (id, item_id, season_number, story, charaktere, unterhaltung, emotion,
         inszenierung, schauspiel, sound, personal, created_at, updated_at)
      VALUES
        (${itemId + "_s" + (i + 1)}, ${itemId}, ${i + 1},
         ${v.story}, ${v.charaktere}, ${v.unterhaltung}, ${v.emotion},
         ${v.inszenierung}, ${v.schauspiel}, ${v.sound}, ${s.personal},
         ${s.createdAt || now}, ${now})
    `;
  }
}

/** Laedt die Staffeln zu mehreren Eintraegen, gruppiert nach item_id. */
async function loadSeasons() {
  const rows = await sql`SELECT * FROM seasons ORDER BY item_id, season_number`;
  const nach = new Map();
  for (const r of rows) {
    if (!nach.has(r.item_id)) nach.set(r.item_id, []);
    nach.get(r.item_id).push(rowToSeason(r));
  }
  return nach;
}

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
  const staffeln = await loadSeasons();
  const grouped = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  for (const r of rows) {
    const item = rowToItem(r);
    item.seasons = staffeln.get(r.id) || [];
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

  await saveSeasons(id, body.category, body.seasons);
  const angelegt = rowToItem(rows[0]);
  angelegt.seasons = (await loadSeasons()).get(id) || [];
  return res.status(201).json(angelegt);
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

  await saveSeasons(id, body.category, body.seasons);
  const gespeichert = rowToItem(rows[0]);
  gespeichert.seasons = (await loadSeasons()).get(id) || [];
  return res.status(200).json(gespeichert);
}

/** DELETE /api/items?id=... */
async function remove(req, res) {
  const id = req.query.id || (req.body && req.body.id);
  if (!id) return res.status(400).json({ error: "id fehlt." });

  const rows = await sql`DELETE FROM media_items WHERE id = ${id} RETURNING id`;
  if (!rows.length) return res.status(404).json({ error: "Eintrag nicht gefunden." });
  return res.status(200).json({ ok: true, id });
}
