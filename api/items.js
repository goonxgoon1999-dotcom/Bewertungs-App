import {
  sql, ensureReady, rowToItem, rowToSeason, validateItem,
  criteriaKeysFor, CATEGORIES, supportsSeasons, normalizeWeight,
  normalizeWatchCount, WATCH_COUNT_DEFAULT, genresZuText,
} from "./_db.js";

/** Die Staffelzeilen eines Eintrags, so wie sie gerade gespeichert sind. */
async function currentSeasonRows(itemId) {
  return await sql`
    SELECT id, season_number FROM seasons WHERE item_id = ${itemId} ORDER BY season_number
  `;
}

/**
 * Baut die Schreibbefehle fuer die Staffeln eines Eintrags — ausgefuehrt
 * werden sie vom Aufrufer gemeinsam mit dem Eintrag selbst in einer
 * Transaktion.
 *
 * Bestehende Staffeln werden per ID aktualisiert, wirklich neue
 * eingefuegt, entfernte geloescht. Frueher wurde stattdessen die ganze
 * Liste geloescht und mit selbst gebauten IDs ("<eintrag>_s1", ...) neu
 * eingefuegt. Ueberschnitten sich dabei zwei Speichervorgaenge
 * desselben Eintrags — etwa das Speichern von Hand und das
 * automatische Nachtragen eines Posters —, traf ein INSERT auf eine
 * noch vorhandene Zeile mit derselben ID: "duplicate key value
 * violates unique constraint seasons_pkey". Die IDs vergibt jetzt
 * Postgres, hier wird keine mehr erzeugt.
 */
function seasonQueries(itemId, category, seasons, vorhandene) {
  const liste = supportsSeasons(category) && Array.isArray(seasons) ? seasons : [];
  const nachId = new Map(vorhandene.map((r) => [String(r.id), r]));
  const nachNummer = new Map(vorhandene.map((r) => [Number(r.season_number), r]));
  const vergeben = new Set();
  const queries = [];
  const now = Date.now();

  liste.forEach((s, i) => {
    const nummer = i + 1;
    const v = s.values || {};
    const gewicht = normalizeWeight(s.weight);

    // Zuerst ueber die mitgeschickte ID zuordnen. Kommt keine mit
    // (aeltere Clients, Import aus einem Backup), entscheidet die
    // Staffelnummer — so wird auch dann aktualisiert statt ersetzt.
    let treffer =
      s.id != null && nachId.has(String(s.id)) ? nachId.get(String(s.id)) : nachNummer.get(nummer);
    if (treffer && vergeben.has(String(treffer.id))) treffer = null;

    if (treffer) {
      vergeben.add(String(treffer.id));
      queries.push(sql`
        UPDATE seasons SET
          season_number = ${nummer},
          story         = ${v.story},
          charaktere    = ${v.charaktere},
          unterhaltung  = ${v.unterhaltung},
          emotion       = ${v.emotion},
          inszenierung  = ${v.inszenierung},
          schauspiel    = ${v.schauspiel},
          sound         = ${v.sound},
          personal      = ${s.personal},
          weight        = ${gewicht},
          updated_at    = ${now}
        WHERE id = ${treffer.id}
      `);
    } else {
      queries.push(sql`
        INSERT INTO seasons
          (item_id, season_number, story, charaktere, unterhaltung, emotion,
           inszenierung, schauspiel, sound, personal, weight, created_at, updated_at)
        VALUES
          (${itemId}, ${nummer},
           ${v.story}, ${v.charaktere}, ${v.unterhaltung}, ${v.emotion},
           ${v.inszenierung}, ${v.schauspiel}, ${v.sound}, ${s.personal}, ${gewicht},
           ${s.createdAt || now}, ${now})
      `);
    }
  });

  const entfernt = vorhandene.filter((r) => !vergeben.has(String(r.id))).map((r) => String(r.id));
  if (entfernt.length) {
    queries.push(sql`
      DELETE FROM seasons WHERE item_id = ${itemId} AND id::text = ANY(${entfernt})
    `);
  }
  return queries;
}

/** Die gespeicherten Staffeln eines Eintrags fuer die Antwort. */
async function seasonsOf(itemId) {
  const rows = await sql`SELECT * FROM seasons WHERE item_id = ${itemId} ORDER BY season_number`;
  return rows.map(rowToSeason);
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
function criteriaColumns(category, values, watchlist) {
  // Vorgemerkte Eintraege sind noch nicht bewertet: alle Wertspalten
  // bleiben leer, bis daraus ein bewerteter Eintrag wird.
  if (watchlist) {
    return {
      story: null, charaktere: null, unterhaltung: null, emotion: null,
      inszenierung: null, schauspiel: null, sound: null,
      gameplay: null, welt: null, grafik: null, wiederspielwert: null,
    };
  }
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

/**
 * Angaben zum Werk in Spaltenform. Bei Spielen gibt es sie nicht —
 * dort bleiben alle leer, egal was geschickt wurde.
 *
 * Die drei Zusatzdaten (Genre, Filmreihe, Studio) verhalten sich beim
 * Aktualisieren anders als Jahr, Regie und IMDb-Note: Fehlt das Feld
 * ganz, bleibt der gespeicherte Wert stehen (null steht hier fuer
 * "nicht mitgeschickt", siehe COALESCE im UPDATE). Der Grund ist, dass
 * es fuer sie keine Eingabe gibt, die man absichtlich leeren koennte —
 * ohne diese Regel wuerde jeder Speichervorgang eines aelteren Clients
 * die nachgeladenen Genres stillschweigend wieder entfernen. Wer sie
 * wirklich loeschen will, schickt eine leere Liste bzw. eine leere
 * Zeichenkette.
 */
function angabenColumns(category, body) {
  if (category === "game") {
    return {
      releaseYear: null, director: null, imdbRating: null,
      genres: "", collection: "", studio: "",
    };
  }
  const regie = typeof body.director === "string" ? body.director.trim() : "";
  return {
    releaseYear: typeof body.releaseYear === "number" ? Math.round(body.releaseYear) : null,
    director: regie || null,
    imdbRating: typeof body.imdbRating === "number" ? body.imdbRating : null,
    genres: body.genre === undefined ? null : genresZuText(body.genre),
    collection: textFeld(body.collection),
    studio: textFeld(body.studio),
  };
}

/** Fehlendes Feld -> null ("unveraendert lassen"), sonst getrimmter Text. */
function textFeld(wert) {
  if (wert === undefined) return null;
  return typeof wert === "string" ? wert.trim() : "";
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
  const merkliste = body.watchlist === true;
  const v = criteriaColumns(body.category, body.values, merkliste);
  const a = angabenColumns(body.category, body);

  // Eintrag und Staffeln gehen gemeinsam in einer Transaktion in die
  // Datenbank — entweder alles oder nichts.
  const ergebnis = await sql.transaction([
    sql`
      INSERT INTO media_items
        (id, category, title, poster, poster_source, backdrop, story, charaktere, unterhaltung,
         emotion, inszenierung, schauspiel, sound, gameplay, welt, grafik, wiederspielwert,
         personal, release_year, director, imdb_rating, genres, collection, studio,
         watchlist, watch_count,
         created_at, updated_at)
      VALUES
        (${id}, ${body.category}, ${body.title.trim()}, ${body.poster || ""}, ${body.posterSource || null},
         ${body.backdrop || ""},
         ${v.story}, ${v.charaktere}, ${v.unterhaltung}, ${v.emotion},
         ${v.inszenierung}, ${v.schauspiel}, ${v.sound},
         ${v.gameplay}, ${v.welt}, ${v.grafik}, ${v.wiederspielwert},
         ${merkliste ? null : body.personal},
         ${a.releaseYear}, ${a.director}, ${a.imdbRating},
         ${a.genres}, ${a.collection}, ${a.studio}, ${merkliste},
         ${normalizeWatchCount(body.watchCount) ?? WATCH_COUNT_DEFAULT},
         ${body.createdAt || now}, ${now})
      RETURNING *
    `,
    ...seasonQueries(id, body.category, body.seasons, []),
  ]);

  const angelegt = rowToItem(ergebnis[0][0]);
  angelegt.seasons = await seasonsOf(id);
  return res.status(201).json(angelegt);
}

/** PUT /api/items?id=... — Eintrag vollständig aktualisieren */
async function update(req, res) {
  const id = req.query.id || (req.body && req.body.id);
  if (!id) return res.status(400).json({ error: "id fehlt." });

  const body = req.body || {};
  const errors = validateItem(body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  // Fehlt der Eintrag, wuerde das Einfuegen der Staffeln am
  // Fremdschluessel scheitern — hier gibt es dafuer die klare Antwort.
  const treffer = await sql`SELECT id FROM media_items WHERE id = ${id}`;
  if (!treffer.length) return res.status(404).json({ error: "Eintrag nicht gefunden." });

  // Welche Staffeln der Eintrag gerade hat, entscheidet darueber, was
  // aktualisiert, eingefuegt und geloescht werden muss.
  const vorhandene = await currentSeasonRows(id);

  const merkliste = body.watchlist === true;
  const v = criteriaColumns(body.category, body.values, merkliste);
  const a = angabenColumns(body.category, body);
  const ergebnis = await sql.transaction([
    sql`
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
        personal        = ${merkliste ? null : body.personal},
        release_year    = ${a.releaseYear},
        director        = ${a.director},
        imdb_rating     = ${a.imdbRating},
        -- Fehlen die Zusatzdaten in der Anfrage, bleibt der gespeicherte
        -- Wert stehen (siehe angabenColumns). Eine leere Zeichenkette ist
        -- dagegen ein echter Wert und leert das Feld.
        genres          = COALESCE(${a.genres}::text, genres),
        collection      = COALESCE(${a.collection}::text, collection),
        studio          = COALESCE(${a.studio}::text, studio),
        watchlist       = ${merkliste},
        -- Fehlt der Zaehler in der Anfrage, bleibt der gespeicherte Wert
        -- stehen. Nicht jeder Speichervorgang schickt ihn mit (das
        -- automatische Nachladen von Postern und Angaben etwa) — ohne
        -- COALESCE wuerde jeder dieser Aufrufe ihn auf 1 zuruecksetzen.
        watch_count     = COALESCE(${normalizeWatchCount(body.watchCount)}::integer, watch_count),
        updated_at      = ${Date.now()}
      WHERE id = ${id}
      RETURNING *
    `,
    ...seasonQueries(id, body.category, body.seasons, vorhandene),
  ]);

  const rows = ergebnis[0];
  if (!rows.length) return res.status(404).json({ error: "Eintrag nicht gefunden." });

  const gespeichert = rowToItem(rows[0]);
  gespeichert.seasons = await seasonsOf(id);
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
