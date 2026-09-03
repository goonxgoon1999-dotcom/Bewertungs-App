import {
  sql, ensureReady, rowToItem, rowToSeason, validateItem,
  criteriaKeysFor, CATEGORIES, supportsSeasons, normalizeWeight,
  normalizeWatchCount, WATCH_COUNT_DEFAULT, genresZuText,
  normalizeElo, normalizeDuels, normalizeSiege, ELO_START,
  episodenZuText, positiveZahl, logFehler, fehlerBeschreibung,
  normalizeStaffelNr, normalizeFolgeNr,
} from "./_db.js";

/**
 * Ein mitgeschicktes Bewertungsdatum — oder null.
 *
 * Regulaer schickt die App keines: Das Datum entsteht auf dem Server in
 * dem Moment, in dem aus einem Eintrag ein bewerteter wird. Nur das
 * Einspielen eines Backups bringt es mit, damit ein zurueckgespieltes
 * Jahr nicht auf den Tag des Imports rutscht.
 */
function bewertetAm(body) {
  const wert = body && body.ratedAt;
  return typeof wert === "number" && Number.isFinite(wert) && wert > 0 ? Math.round(wert) : null;
}

/** Die Staffelzeilen eines Eintrags, so wie sie gerade gespeichert sind. */
async function currentSeasonRows(itemId) {
  return await sql`
    SELECT id, season_number FROM seasons WHERE item_id = ${itemId} ORDER BY season_number
  `;
}

/**
 * Die sieben Wertspalten einer Staffel in fester Reihenfolge.
 *
 * Was die Kategorie nicht kennt, wird bewusst NULL — eine Kinderserie
 * hat kein "Schauspiel", und eine 0 waere dort eine erfundene
 * Bewertung. Bei Serien, Anime und Adult Animation gelten alle sieben,
 * dort aendert sich dadurch nichts.
 */
function seasonWerte(category, values) {
  const erlaubt = new Set(criteriaKeysFor(category));
  const v = values || {};
  const pick = (key) => (erlaubt.has(key) ? v[key] : null);
  return {
    story: pick("story"),
    charaktere: pick("charaktere"),
    unterhaltung: pick("unterhaltung"),
    emotion: pick("emotion"),
    inszenierung: pick("inszenierung"),
    schauspiel: pick("schauspiel"),
    sound: pick("sound"),
  };
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
    const v = seasonWerte(category, s.values);
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
async function seasonsOf(itemId, category) {
  const rows = await sql`SELECT * FROM seasons WHERE item_id = ${itemId} ORDER BY season_number`;
  return rows.map((r) => rowToSeason(r, category));
}

/**
 * Laedt die Staffeln zu mehreren Eintraegen, gruppiert nach item_id.
 *
 * Welche Werte eine Staffel traegt, haengt an der Kategorie ihres
 * Eintrags — die steht in `media_items` und wird deshalb als Zuordnung
 * item_id -> category hereingereicht.
 */
async function loadSeasons(kategorieJeEintrag) {
  const rows = await sql`SELECT * FROM seasons ORDER BY item_id, season_number`;
  const nach = new Map();
  for (const r of rows) {
    if (!nach.has(r.item_id)) nach.set(r.item_id, []);
    nach.get(r.item_id).push(rowToSeason(r, kategorieJeEintrag.get(r.item_id)));
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

/* Die vier Laufzeit-Felder. */
const LAUFZEIT_FELDER = ["runtimeMinutes", "episodeRuntime", "episodeCount", "episodesPerSeason"];

/**
 * Laufzeit in Spaltenform.
 *
 * Sie verhaelt sich beim Aktualisieren wie die uebrigen Zusatzdaten:
 * Fehlt sie in der Anfrage ganz, bleibt der gespeicherte Wert stehen —
 * es gibt keine Eingabe dafuer, und ohne diese Regel wuerde jeder
 * Speichervorgang eines aelteren Clients die nachgeladene Laufzeit
 * stillschweigend entfernen. Bei Zahlen taugt NULL dafuer nicht als
 * Kennzeichen: `null` ist hier ein echter Wert ("Laufzeit gilt nicht
 * mehr", etwa nach einer Titelaenderung). Deshalb entscheidet das
 * eigene Kennzeichen `mitgeschickt`, ob ueberhaupt geschrieben wird.
 *
 * Die vier Felder gehoeren zusammen und reisen immer gemeinsam — das
 * Frontend schickt entweder alle oder keines.
 */
function laufzeitColumns(category, body) {
  // Spiele bleiben bei der Laufzeit aussen vor: es gibt keine Quelle
  // dafuer, also wird bei ihnen auch nie etwas geschrieben.
  const mitgeschickt = category !== "game" && LAUFZEIT_FELDER.some((feld) => body[feld] !== undefined);
  return {
    mitgeschickt,
    runtimeMinutes: positiveZahl(body.runtimeMinutes),
    episodeRuntime: positiveZahl(body.episodeRuntime),
    episodeCount: positiveZahl(body.episodeCount),
    episodesPerSeason: episodenZuText(body.episodesPerSeason),
  };
}

/* Die drei Felder rund um "Am Schauen". */
const AM_SCHAUEN_FELDER = ["amSchauen", "staffelNr", "folgeNr"];

/**
 * "Am Schauen" und der Fortschritt in Spaltenform.
 *
 * Sie verhalten sich beim Aktualisieren wie die Laufzeit: Fehlen sie
 * in der Anfrage ganz, bleibt der gespeicherte Wert stehen. Das ist
 * hier keine Bequemlichkeit, sondern die Bedingung aus der Aufgabe —
 * das Kennzeichen darf sich ausschliesslich ueber seinen eigenen
 * Schalter aendern. Ohne diese Regel wuerde jedes Speichern einer
 * Bewertung (das Formular schickt nur seine eigenen Felder) und jedes
 * automatische Nachladen eines Posters das Kennzeichen loeschen — und
 * damit genau den Fall zerstoeren, um den es geht: Staffel 1 ist
 * bewertet, waehrend Staffel 2 noch laeuft.
 *
 * COALESCE taugt dafuer nicht: Bei `staffel_nr` und `folge_nr` ist
 * NULL ein echter Wert ("nie gesetzt"). Deshalb entscheidet auch hier
 * das eigene Kennzeichen `mitgeschickt`, ob ueberhaupt geschrieben
 * wird.
 */
function amSchauenColumns(body) {
  const mitgeschickt = AM_SCHAUEN_FELDER.some((feld) => body[feld] !== undefined);
  return {
    mitgeschickt,
    amSchauen: body.amSchauen === true,
    staffelNr: normalizeStaffelNr(body.staffelNr),
    folgeNr: normalizeFolgeNr(body.folgeNr),
  };
}

/**
 * Das Erstsichtungsdatum in Spaltenform.
 *
 * Es verhaelt sich wie "Am Schauen": Fehlt das Feld in der Anfrage
 * ganz, bleibt der gespeicherte Wert stehen. Das ist hier
 * ausschlaggebend — sonst wuerde jedes automatische Nachladen eines
 * Posters und jedes Speichern aus einem aelteren Client ein von Hand
 * eingetragenes Datum stillschweigend loeschen.
 *
 * COALESCE taugt dafuer nicht: `null` ist ein echter Wert. Genau
 * damit leert der Nutzer das Feld wieder ("Leeren" in der
 * Detailansicht), und die Anzeige faellt auf das Bewertungsdatum
 * zurueck.
 *
 * Anders als `rated_at` wird das Datum NICHT vom Sehzaehler, von
 * weiteren Durchgaengen oder vom Zurueckwandern auf die Watchlist
 * angefasst: Festgehalten wird die Erstsichtung, sonst nichts.
 */
function erstsichtungColumns(body) {
  const wert = body.firstWatchedAt;
  return {
    mitgeschickt: wert !== undefined,
    firstWatchedAt:
      typeof wert === "number" && Number.isFinite(wert) && wert > 0 ? Math.round(wert) : null,
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
    logFehler("API-Fehler (/api/items " + req.method + ")", err);
    return res.status(500).json({ error: "Serverfehler: " + fehlerBeschreibung(err) });
  }
}

/** GET /api/items -> { movie: [...], series: [...], anime: [...], ... } */
async function list(req, res) {
  const rows = await sql`SELECT * FROM media_items`;
  const staffeln = await loadSeasons(new Map(rows.map((r) => [r.id, r.category])));
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
  const l = laufzeitColumns(body.category, body);
  const sch = amSchauenColumns(body);
  const erst = erstsichtungColumns(body);

  // Eintrag und Staffeln gehen gemeinsam in einer Transaktion in die
  // Datenbank — entweder alles oder nichts.
  const ergebnis = await sql.transaction([
    sql`
      INSERT INTO media_items
        (id, category, title, poster, poster_source, backdrop, story, charaktere, unterhaltung,
         emotion, inszenierung, schauspiel, sound, gameplay, welt, grafik, wiederspielwert,
         personal, release_year, director, imdb_rating, genres, collection, studio,
         runtime_minutes, episode_runtime, episode_count, episodes_per_season,
         watchlist, watch_count, elo, duels, siege,
         am_schauen, staffel_nr, folge_nr,
         created_at, updated_at, rated_at, first_watched_at)
      VALUES
        (${id}, ${body.category}, ${body.title.trim()}, ${body.poster || ""}, ${body.posterSource || null},
         ${body.backdrop || ""},
         ${v.story}, ${v.charaktere}, ${v.unterhaltung}, ${v.emotion},
         ${v.inszenierung}, ${v.schauspiel}, ${v.sound},
         ${v.gameplay}, ${v.welt}, ${v.grafik}, ${v.wiederspielwert},
         ${merkliste ? null : body.personal},
         ${a.releaseYear}, ${a.director}, ${a.imdbRating},
         ${a.genres}, ${a.collection}, ${a.studio},
         ${l.mitgeschickt ? l.runtimeMinutes : null},
         ${l.mitgeschickt ? l.episodeRuntime : null},
         ${l.mitgeschickt ? l.episodeCount : null},
         ${l.mitgeschickt ? l.episodesPerSeason : null},
         ${merkliste},
         ${normalizeWatchCount(body.watchCount) ?? WATCH_COUNT_DEFAULT},
         -- Duell-Staerke, Duellzahl und gewonnene Duelle. Ein Backup
         -- ohne diese Felder (jede Sicherung von vor der jeweiligen
         -- Aenderung) bringt sie nicht mit — dann gilt der Startwert,
         -- der Zuschlag auf die Endnote ist exakt 0, und es steht kein
         -- Sieg zu Buche.
         ${normalizeElo(body.elo) ?? ELO_START},
         ${normalizeDuels(body.duels) ?? 0},
         ${normalizeSiege(body.siege) ?? 0},
         -- Am Schauen und der Stand darin. Ein Backup ohne diese
         -- Felder (jede Sicherung von vor dieser Aenderung) bringt sie
         -- nicht mit — dann gelten die Standardwerte: nicht am
         -- Schauen, kein Stand.
         ${sch.amSchauen}, ${sch.staffelNr}, ${sch.folgeNr},
         ${body.createdAt || now}, ${now},
         -- Wann bewertet wurde. Vorgemerktes hat noch kein Datum; es
         -- kommt erst, wenn daraus ein bewerteter Eintrag wird (siehe
         -- update). Ein ratedAt aus der Anfrage gibt es nur beim
         -- Einspielen eines Backups.
         ${merkliste ? null : bewertetAm(body) || now},
         -- Die Erstsichtung wird von Hand eingetragen und entsteht
         -- deshalb NICHT beim Anlegen. Sie kommt nur mit, wenn sie in
         -- der Anfrage steht — beim Einspielen einer Sicherung.
         ${erst.firstWatchedAt})
      RETURNING *
    `,
    ...seasonQueries(id, body.category, body.seasons, []),
  ]);

  const angelegt = rowToItem(ergebnis[0][0]);
  angelegt.seasons = await seasonsOf(id, body.category);
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
  const l = laufzeitColumns(body.category, body);
  const sch = amSchauenColumns(body);
  const erst = erstsichtungColumns(body);
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
        -- Laufzeit: geschrieben wird nur, wenn sie in der Anfrage
        -- ueberhaupt vorkam (siehe laufzeitColumns). COALESCE taugt
        -- dafuer nicht — bei Zahlen ist NULL ein echter Wert, mit dem
        -- die Laufzeit nach einer Titelaenderung geleert wird.
        runtime_minutes     = CASE WHEN ${l.mitgeschickt}::boolean THEN ${l.runtimeMinutes}::integer ELSE runtime_minutes END,
        episode_runtime     = CASE WHEN ${l.mitgeschickt}::boolean THEN ${l.episodeRuntime}::integer ELSE episode_runtime END,
        episode_count       = CASE WHEN ${l.mitgeschickt}::boolean THEN ${l.episodeCount}::integer ELSE episode_count END,
        episodes_per_season = CASE WHEN ${l.mitgeschickt}::boolean THEN ${l.episodesPerSeason}::text ELSE episodes_per_season END,
        watchlist       = ${merkliste},
        -- Am Schauen und der Stand darin: geschrieben wird nur, wenn
        -- sie in der Anfrage ueberhaupt vorkamen (siehe
        -- amSchauenColumns). Eine Bewertung fasst das Kennzeichen
        -- damit nicht an — nur sein eigener Schalter tut das.
        am_schauen      = CASE WHEN ${sch.mitgeschickt}::boolean THEN ${sch.amSchauen}::boolean ELSE am_schauen END,
        staffel_nr      = CASE WHEN ${sch.mitgeschickt}::boolean THEN ${sch.staffelNr}::integer ELSE staffel_nr END,
        folge_nr        = CASE WHEN ${sch.mitgeschickt}::boolean THEN ${sch.folgeNr}::integer ELSE folge_nr END,
        -- Fehlt der Zaehler in der Anfrage, bleibt der gespeicherte Wert
        -- stehen. Nicht jeder Speichervorgang schickt ihn mit (das
        -- automatische Nachladen von Postern und Angaben etwa) — ohne
        -- COALESCE wuerde jeder dieser Aufrufe ihn auf 1 zuruecksetzen.
        watch_count     = COALESCE(${normalizeWatchCount(body.watchCount)}::integer, watch_count),
        -- Wie beim Zaehler: fehlen die Duell-Felder in der Anfrage,
        -- bleibt der gespeicherte Wert stehen. Das automatische
        -- Nachladen von Postern und Angaben schickt sie nicht mit —
        -- ohne COALESCE wuerde jeder dieser Aufrufe die erspielte
        -- Duell-Staerke auf den Startwert zuruecksetzen.
        elo             = COALESCE(${normalizeElo(body.elo)}::real, elo),
        duels           = COALESCE(${normalizeDuels(body.duels)}::integer, duels),
        siege           = COALESCE(${normalizeSiege(body.siege)}::integer, siege),
        -- Das Bewertungsdatum wird genau einmal gesetzt und danach nie
        -- wieder angefasst: COALESCE nimmt zuerst den gespeicherten
        -- Wert. Erst wenn dort nichts steht — der Eintrag also gerade
        -- von vorgemerkt zu bewertet wird — kommt das heutige Datum
        -- hinein. Wandert er zurueck auf die Watchlist, faellt es weg.
        -- Ohne diese Regel wuerde jedes automatische Nachladen von
        -- Poster oder Genres den Eintrag ins laufende Jahr schieben.
        rated_at        = CASE
                            WHEN ${merkliste}::boolean THEN NULL
                            ELSE COALESCE(rated_at, ${bewertetAm(body)}::bigint, ${Date.now()}::bigint)
                          END,
        -- Die Erstsichtung: geschrieben wird nur, wenn das Feld in der
        -- Anfrage ueberhaupt vorkam (siehe erstsichtungColumns). Ohne
        -- diese Regel wuerde jedes Nachladen eines Posters sie
        -- loeschen. Sie bleibt auch dann stehen, wenn ein Eintrag
        -- zurueck auf die Watchlist wandert — gesehen ist gesehen.
        first_watched_at = CASE
                             WHEN ${erst.mitgeschickt}::boolean THEN ${erst.firstWatchedAt}::bigint
                             ELSE first_watched_at
                           END,
        updated_at      = ${Date.now()}
      WHERE id = ${id}
      RETURNING *
    `,
    ...seasonQueries(id, body.category, body.seasons, vorhandene),
  ]);

  const rows = ergebnis[0];
  if (!rows.length) return res.status(404).json({ error: "Eintrag nicht gefunden." });

  const gespeichert = rowToItem(rows[0]);
  gespeichert.seasons = await seasonsOf(id, body.category);
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
