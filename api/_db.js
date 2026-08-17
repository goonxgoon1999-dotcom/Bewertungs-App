import { neon } from "@neondatabase/serverless";
import { INITIAL_MOVIES_RAW } from "./seed-data.js";

// Vercel/Neon setzen diese Variable automatisch, wenn du die
// Neon-Integration im Vercel-Dashboard hinzufügst.
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL;

if (!connectionString) {
  console.error("Keine Datenbank-Verbindung gefunden. Bitte DATABASE_URL setzen.");
}

export const sql = neon(connectionString);

/* Film, Serie und Anime teilen sich dieselben Felder. Anime zeigt zwei
   davon nur anders beschriftet an ("Animation" statt "Inszenierung",
   "Synchronstimme" statt "Schauspiel") — die Spalten heissen unveraendert
   inszenierung und schauspiel. */
const AV_KEYS = [
  "story",
  "charaktere",
  "unterhaltung",
  "emotion",
  "inszenierung",
  "schauspiel",
  "sound",
];

const GAME_KEYS = [
  "gameplay",
  "story",
  "charaktere",
  "welt",
  "grafik",
  "sound",
  "wiederspielwert",
];

/* Kinderserien haben eigene Kriterien: Nostalgie, Charaktere, Humor,
   Story, Optik und Intro/Musik. Sechs statt sieben — und keines davon
   braucht eine neue Spalte. Wie bei Anime wechselt nur die
   Beschriftung (die Zuordnung steht in src/App.jsx):

     emotion      -> "Nostalgie / Wiedersehenswert"
     unterhaltung -> "Unterhaltung & Humor"
     inszenierung -> "Animation & Optik"
     sound        -> "Intro & Musik"

   `schauspiel` bleibt bei Kinderserien leer — dort gibt es niemanden
   zu bewerten. */
const KIDS_KEYS = [
  "story",
  "charaktere",
  "unterhaltung",
  "emotion",
  "inszenierung",
  "sound",
];

/* Kinderserien und Adult Animation kamen nach den vier urspruenglichen
   Kategorien dazu. Adult Animation ist technisch eine Serie mit den
   Kriterien und Beschriftungen von Anime. */
export const CATEGORIES = ["movie", "series", "anime", "kids", "adultanim", "game"];

export const CRITERIA_KEYS_BY_CATEGORY = {
  movie: AV_KEYS,
  series: AV_KEYS,
  anime: AV_KEYS,
  kids: KIDS_KEYS,
  adultanim: AV_KEYS,
  game: GAME_KEYS,
};

/** Alle Kriterien-Spalten, die es in der Tabelle gibt. */
export const ALL_CRITERIA_KEYS = Array.from(new Set([...AV_KEYS, ...GAME_KEYS]));

export function criteriaKeysFor(category) {
  return CRITERIA_KEYS_BY_CATEGORY[category] || AV_KEYS;
}

let initPromise = null;

/** Legt die Tabelle an (falls nötig) und befüllt sie einmalig. */
export function ensureReady() {
  if (!initPromise) initPromise = init();
  return initPromise;
}

async function init() {
  await sql`
    CREATE TABLE IF NOT EXISTS media_items (
      id            TEXT PRIMARY KEY,
      category      TEXT NOT NULL CHECK (category IN ('movie','series','anime')),
      title         TEXT NOT NULL,
      poster        TEXT NOT NULL DEFAULT '',
      poster_source TEXT,
      story         REAL NOT NULL,
      charaktere    REAL NOT NULL,
      unterhaltung  REAL NOT NULL,
      emotion       REAL NOT NULL,
      inszenierung  REAL NOT NULL,
      schauspiel    REAL NOT NULL,
      sound         REAL NOT NULL,
      personal      REAL NOT NULL,
      created_at    BIGINT NOT NULL,
      updated_at    BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS media_items_category_idx ON media_items (category)`;

  await migrateForGames();
  await ensureAngaben();
  await ensureWatchlist();
  await ensureWatchCount();
  await ensureSeasons();
  await ensureHeaderImages();
  await ensureZusatzdaten();
  await ensureLaufzeit();
  await ensureBewertetAm();
  await ensureNeueKategorien();
  await ensureDuelle();
  await ensureHighscores();
  await ensureXp();

  // Seeding nur, wenn die Tabelle wirklich leer ist — so gehen
  // vorhandene Bewertungen niemals verloren.
  const rows = await sql`SELECT COUNT(*)::int AS n FROM media_items`;
  if (rows[0].n > 0) return;

  for (let i = 0; i < INITIAL_MOVIES_RAW.length; i++) {
    const [title, score] = INITIAL_MOVIES_RAW[i];
    await sql`
      INSERT INTO media_items
        (id, category, title, poster, story, charaktere, unterhaltung, emotion,
         inszenierung, schauspiel, sound, personal, created_at, updated_at)
      VALUES
        (${"legacy_movie_" + i}, 'movie', ${title}, '',
         ${score}, ${score}, ${score}, ${score}, ${score}, ${score}, ${score}, ${score},
         0, 0)
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

/**
 * Erweitert eine bestehende Tabelle um die Spiele-Kategorie.
 *
 * Alles hier ist rein strukturell: Es werden Spalten hinzugefuegt und
 * Pflichtfelder gelockert, aber KEINE einzige bestehende Zeile
 * angefasst. Vorhandene Bewertungen bleiben Bit fuer Bit erhalten.
 */
async function migrateForGames() {
  // 1. Neue Spalten fuer die Spiele-Kriterien. Sie sind absichtlich
  //    NULL-bar: fuer Filme, Serien und Anime gibt es diese Werte nicht.
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS gameplay REAL`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS welt REAL`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS grafik REAL`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS wiederspielwert REAL`;

  // Breites Szenenbild fuer den Kopfbereich. NULL-bar, damit
  // bestehende Zeilen unveraendert bleiben.
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS backdrop TEXT`;

  // 2. Die vier Felder, die es nur bei Film/Serie/Anime gibt, duerfen
  //    bei Spielen leer bleiben. DROP NOT NULL aendert nur die
  //    Spaltendefinition, nicht die gespeicherten Werte.
  await sql`ALTER TABLE media_items ALTER COLUMN unterhaltung DROP NOT NULL`;
  await sql`ALTER TABLE media_items ALTER COLUMN emotion DROP NOT NULL`;
  await sql`ALTER TABLE media_items ALTER COLUMN inszenierung DROP NOT NULL`;
  await sql`ALTER TABLE media_items ALTER COLUMN schauspiel DROP NOT NULL`;

  // 3. Der CHECK auf category kennt 'game' noch nicht. Der alte
  //    Constraint wurde inline angelegt und heisst je nach Postgres-
  //    Version unterschiedlich — deshalb werden alle CHECKs auf
  //    category gesucht und ersetzt. Der Block laeuft nur einmal:
  //    danach existiert der neue, benannte Constraint.
  await sql`
    DO $$
    DECLARE con_name text;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        WHERE r.relname = 'media_items'
          AND c.conname = 'media_items_category_allowed'
      ) THEN
        FOR con_name IN
          SELECT c.conname FROM pg_constraint c
          JOIN pg_class r ON r.oid = c.conrelid
          WHERE r.relname = 'media_items'
            AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) ILIKE '%category%'
        LOOP
          EXECUTE 'ALTER TABLE media_items DROP CONSTRAINT ' || quote_ident(con_name);
        END LOOP;

        ALTER TABLE media_items
          ADD CONSTRAINT media_items_category_allowed
          CHECK (category IN ('movie','series','anime','game'));
      END IF;
    END $$
  `;
}

/**
 * Angaben zum Werk: Erscheinungsjahr, Regie und die IMDb-Note als
 * Vergleichswert. Alle drei sind NULL-bar — bestehende Zeilen bleiben
 * unveraendert und laden die Werte spaeter automatisch nach, genau wie
 * es bei den Postern schon laeuft. Bei Spielen bleiben sie leer.
 */
async function ensureAngaben() {
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS release_year INTEGER`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS director TEXT`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS imdb_rating REAL`;
}

/**
 * Watchlist: ein Eintrag ist entweder vorgemerkt oder bewertet.
 *
 * Vorgemerkte Eintraege haben Titel, Poster, Jahr und Kategorie wie
 * jeder andere — nur eben keine Note. Damit sie ueberhaupt in die
 * Tabelle passen, duerfen die vier bisher verpflichtenden Wertspalten
 * leer bleiben. Wie schon bei den Spielen ist das rein strukturell:
 * Es wird KEINE bestehende Zeile angefasst, alle Bewertungen bleiben
 * Bit fuer Bit erhalten.
 */
async function ensureWatchlist() {
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS watchlist BOOLEAN NOT NULL DEFAULT FALSE`;

  await sql`ALTER TABLE media_items ALTER COLUMN story DROP NOT NULL`;
  await sql`ALTER TABLE media_items ALTER COLUMN charaktere DROP NOT NULL`;
  await sql`ALTER TABLE media_items ALTER COLUMN sound DROP NOT NULL`;
  await sql`ALTER TABLE media_items ALTER COLUMN personal DROP NOT NULL`;

  await sql`CREATE INDEX IF NOT EXISTS media_items_watchlist_idx ON media_items (watchlist)`;
}

/* ----------------------------------------------------------------
   Zaehler: wie oft wurde das Werk geschaut bzw. gespielt?

   Ein bewerteter Eintrag wurde mindestens einmal gesehen — deshalb ist
   1 der Startwert und zugleich die Untergrenze. Die Obergrenze ist rein
   defensiv: sie haelt Tippfehler aus der Datenbank heraus.
   ---------------------------------------------------------------- */
export const WATCH_COUNT_DEFAULT = 1;
export const WATCH_COUNT_MIN = 1;
export const WATCH_COUNT_MAX = 9999;

/**
 * Spalte fuer den Zaehler. Wie alle Migrationen hier rein strukturell:
 * bestehende Zeilen bekommen ueber den DEFAULT die 1 und bleiben damit
 * genau das, was sie sind — einmal geschaut, einmal bewertet.
 *
 * Die 1 steht als Literal im Befehl, nicht als eingesetzter Wert:
 * Postgres erlaubt in DDL keine Parameter. Sie muss deshalb zu
 * WATCH_COUNT_DEFAULT passen.
 */
async function ensureWatchCount() {
  await sql`
    ALTER TABLE media_items
      ADD COLUMN IF NOT EXISTS watch_count INTEGER NOT NULL DEFAULT 1
  `;
}

/**
 * Zaehlerwert aus einer Anfrage.
 *
 * Fehlt das Feld, kommt `null` zurueck — der Aufrufer laesst den
 * gespeicherten Wert dann unangetastet. Das ist wichtig, weil nicht
 * jeder Speichervorgang den Zaehler mitschickt (das automatische
 * Nachladen von Postern etwa): ohne diese Unterscheidung wuerde jeder
 * solche Aufruf den Zaehler stillschweigend auf 1 zuruecksetzen.
 */
export function normalizeWatchCount(wert) {
  if (wert == null) return null;
  if (typeof wert !== "number" || !Number.isFinite(wert)) return null;
  const ganz = Math.round(wert);
  return Math.min(WATCH_COUNT_MAX, Math.max(WATCH_COUNT_MIN, ganz));
}

/* ----------------------------------------------------------------
   Kinderserien und Adult Animation

   Zwei zusaetzliche Kategorien. Sie brauchen keine einzige neue
   Spalte — beide sind technisch Serien und teilen sich die
   vorhandenen Kriterien-Spalten (siehe KIDS_KEYS oben). Zu tun ist
   deshalb nur zweierlei:

   1. Der CHECK auf `category` kennt sie noch nicht. Wie schon bei den
      Spielen werden alle CHECKs auf die Spalte gesucht und durch einen
      ersetzt, der alle sechs Kategorien erlaubt. Der Block laeuft
      genau einmal: danach steht 'kids' in der Bedingung. Der Name
      bleibt bewusst derselbe wie beim Spiele-Schritt — sonst wuerden
      sich die beiden Migrationen bei jedem Start gegenseitig
      ueberschreiben.

   2. Bei Kinderserien gibt es kein Schauspiel. In `media_items` darf
      die Spalte laengst leer bleiben, in `seasons` noch nicht — dort
      ist sie aus der Zeit vor den Spielen als NOT NULL angelegt.

   Beides ist rein strukturell: es wird KEINE bestehende Zeile
   angefasst, alle Bewertungen bleiben Bit fuer Bit erhalten.
   ---------------------------------------------------------------- */
async function ensureNeueKategorien() {
  await sql`
    DO $$
    DECLARE con_name text;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        WHERE r.relname = 'media_items'
          AND c.conname = 'media_items_category_allowed'
          AND pg_get_constraintdef(c.oid) ILIKE '%kids%'
      ) THEN
        FOR con_name IN
          SELECT c.conname FROM pg_constraint c
          JOIN pg_class r ON r.oid = c.conrelid
          WHERE r.relname = 'media_items'
            AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) ILIKE '%category%'
        LOOP
          EXECUTE 'ALTER TABLE media_items DROP CONSTRAINT ' || quote_ident(con_name);
        END LOOP;

        ALTER TABLE media_items
          ADD CONSTRAINT media_items_category_allowed
          CHECK (category IN ('movie','series','anime','kids','adultanim','game'));
      END IF;
    END $$
  `;

  await sql`ALTER TABLE seasons ALTER COLUMN schauspiel DROP NOT NULL`;
}

/* Kategorien, die optional in Staffeln unterteilt werden koennen.
   Kinderserien und Adult Animation gehoeren dazu — es sind Serien. */
export const SEASON_CATEGORIES = ["series", "anime", "kids", "adultanim"];

export function supportsSeasons(category) {
  return SEASON_CATEGORIES.includes(category);
}

/**
 * Tabelle fuer die optionale Staffelbewertung. Wird nur angelegt, wenn
 * sie fehlt — bestehende Daten bleiben unberuehrt. Die Staffeln haengen
 * per Fremdschluessel am Eintrag und verschwinden mit ihm (CASCADE).
 */
async function ensureSeasons() {
  await sql`
    CREATE TABLE IF NOT EXISTS seasons (
      id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      item_id       TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      season_number INTEGER NOT NULL,
      story         REAL NOT NULL,
      charaktere    REAL NOT NULL,
      unterhaltung  REAL NOT NULL,
      emotion       REAL NOT NULL,
      inszenierung  REAL NOT NULL,
      schauspiel    REAL NOT NULL,
      sound         REAL NOT NULL,
      personal      REAL NOT NULL,
      created_at    BIGINT NOT NULL,
      updated_at    BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS seasons_item_idx ON seasons (item_id)`;

  // Gewichtungsfaktor je Staffel. Bestehende Zeilen bekommen 1.0 und
  // behalten damit exakt ihre bisherige Note.
  await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS weight REAL NOT NULL DEFAULT 1.0`;

  await migrateSeasonIds();
}

/**
 * Frueher hat der Anwendungscode die Staffel-IDs selbst gebaut
 * ("<eintrag>_s1", "<eintrag>_s2", ...) und die Staffeln beim Speichern
 * geloescht und neu eingefuegt. Ueberschnitten sich dabei zwei
 * Speichervorgaenge desselben Eintrags, kollidierten die IDs — genau
 * der Fehler "duplicate key value violates unique constraint
 * seasons_pkey".
 *
 * Die ID vergibt deshalb jetzt Postgres. Da die alten IDs Text sind und
 * sich nicht in Zahlen umwandeln lassen, wird die Spalte ersetzt: Die
 * Staffelzeilen selbst bleiben dabei unveraendert erhalten (niemand
 * verweist auf seasons.id), nur ihre ID ist danach eine fortlaufende
 * Zahl. Der Block laeuft genau einmal — danach ist die Spalte kein
 * Text mehr.
 */
async function migrateSeasonIds() {
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'seasons' AND column_name = 'id' AND data_type = 'text'
      ) THEN
        ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_pkey;
        ALTER TABLE seasons DROP COLUMN id;
        ALTER TABLE seasons ADD COLUMN id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY;
      END IF;
    END $$
  `;
}

/**
 * Bilder fuer den Kopfbereich. Werden von Hand gepflegt — es gibt
 * keine automatische Suche dafuer. Idempotent angelegt.
 */
async function ensureHeaderImages() {
  await sql`
    CREATE TABLE IF NOT EXISTS header_images (
      id         TEXT PRIMARY KEY,
      url        TEXT NOT NULL,
      position   INTEGER NOT NULL,
      created_at BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS header_images_pos_idx ON header_images (position)`;
}

/** Datenbankzeile -> Kopfbild fuer das Frontend. */
export function rowToHeaderImage(r) {
  return { id: r.id, url: r.url, position: Number(r.position) };
}

/* ----------------------------------------------------------------
   Minispiele: gespielte Duelle je Kategorie

   Was ein Duell bewirkt, steht bereits dort, wo es hingehoert — im
   Bauchgefuehl der beiden beteiligten Eintraege. Festzuhalten bleibt
   nur, wie oft in einer Kategorie ueberhaupt gespielt wurde. Dafuer
   genuegt eine Zeile je Kategorie mit einem Zaehler; eine Tabelle mit
   einer Zeile je Duell braeuchte es dafuer nicht.

   Die Tabelle ist neu und steht fuer sich: keine bestehende Tabelle
   und keine bestehende Zeile wird davon beruehrt. Fehlt eine
   Kategorie darin, wurde in ihr noch nicht gespielt — das ist eine 0
   und kein Fehler.
   ---------------------------------------------------------------- */
async function ensureDuelle() {
  await sql`
    CREATE TABLE IF NOT EXISTS duel_counts (
      category   TEXT PRIMARY KEY,
      duels      INTEGER NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL
    )
  `;
}

/** Datenbankzeile -> Duellzahl fuer das Frontend. */
export function rowToDuelCount(r) {
  return { category: r.category, count: Number(r.duels) };
}

/* ----------------------------------------------------------------
   Minispiele: Bestwert je Spiel und Spielart

   "Higher or Lower" fuehrt je Spielart einen eigenen Bestwert —
   gemischt ueber alle Kategorien oder je Kategorie einzeln. Mehr als
   eine Zahl je Spielart gibt es nicht festzuhalten, also genuegt eine
   Zeile dafuer.

   Der Schluessel ist zweiteilig: `game` und `mode`. Damit kann ein
   spaeteres Minispiel eigene Bestwerte fuehren, ohne mit den hiesigen
   Spielarten zusammenzustossen — "movie" bei einem anderen Spiel ist
   dann eine andere Zeile.

   Wie bei den Duellen ist die Tabelle neu und steht fuer sich: keine
   bestehende Tabelle und keine bestehende Zeile wird davon beruehrt.
   Fehlt eine Spielart, wurde sie noch nicht gespielt — das ist eine 0
   und kein Fehler.
   ---------------------------------------------------------------- */
async function ensureHighscores() {
  await sql`
    CREATE TABLE IF NOT EXISTS highscores (
      game       TEXT NOT NULL,
      mode       TEXT NOT NULL,
      score      INTEGER NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (game, mode)
    )
  `;
}

/** Datenbankzeile -> Bestwert fuer das Frontend. */
export function rowToHighscore(r) {
  return { game: r.game, mode: r.mode, score: Number(r.score) };
}

/* ----------------------------------------------------------------
   Aktivitaets-Punkte des Nutzers (XP)

   Die App hat genau einen Nutzer — es gibt also genau eine Zeile,
   erkennbar an der festen Kennung 'self'. Gespeichert wird nur die
   Gesamtsumme; die Rangstufe wird daraus abgeleitet und nirgends
   festgehalten, damit eine spaetere Aenderung der Schwellen nichts
   umschreiben muss.

   `once` haelt fest, welche einmaligen Boni schon vergeben wurden —
   als Pipe-Liste, wie die Genres nebenan. Ohne diese Liste wuerde ein
   Bonus bei jedem Seitenaufruf erneut gutgeschrieben.

   Wie alle uebrigen Tabellen hier ist sie neu und steht fuer sich:
   keine bestehende Tabelle und keine bestehende Zeile wird beruehrt.
   ---------------------------------------------------------------- */
export const XP_ZEILE = "self";

async function ensureXp() {
  await sql`
    CREATE TABLE IF NOT EXISTS user_progress (
      id         TEXT PRIMARY KEY,
      xp         INTEGER NOT NULL DEFAULT 0,
      once       TEXT NOT NULL DEFAULT '',
      updated_at BIGINT NOT NULL
    )
  `;
}

/* Die vergebenen Einmal-Boni stehen — wie die Genres — als eine
   Zeichenkette in der Spalte, getrennt durch einen senkrechten Strich. */
const ONCE_TRENNER = "|";

/** "bestand|alle-kategorien" -> ["bestand", "alle-kategorien"] */
export function onceAus(text) {
  if (typeof text !== "string" || !text) return [];
  return text.split(ONCE_TRENNER).map((s) => s.trim()).filter(Boolean);
}

/** Datenbankzeile -> XP-Stand fuer das Frontend. */
export function rowToXp(r) {
  return { xp: Number(r.xp), once: onceAus(r.once) };
}

/* ----------------------------------------------------------------
   Zusatzdaten zum Werk: Genre, Filmreihe, Studio

   Genre gibt es bei Film, Serie und Anime (TMDB, TVMaze, Jikan).
   Filmreihe (TMDBs `belongs_to_collection`) und Produktionsstudio
   kommen nur bei Filmen dazu — die Reihe traegt Faelle wie "Star Wars
   Collection" oder "Fast & Furious" genau, das Studio ist die grobe
   Kruecke fuer uebergreifende Franchises ohne eigene Collection
   (Marvel Studios fuer das MCU). Bei Spielen entfaellt beides:
   SteamGridDB ist eine Bilddatenbank und kennt keine Genres.

   Wie alle Migrationen hier rein strukturell — es werden nur
   NULL-bare Spalten ergaenzt, keine bestehende Zeile angefasst.
   ---------------------------------------------------------------- */
async function ensureZusatzdaten() {
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS genres TEXT`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS collection TEXT`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS studio TEXT`;
}

/* Genres stehen als eine Zeichenkette in der Spalte, getrennt durch
   einen senkrechten Strich. Ein eigener Array-Typ waere sauberer,
   bringt hier aber nichts: gelesen wird die Liste immer als Ganzes. */
const GENRE_TRENNER = "|";

/* Defensive Grenzen — sie halten Unsinn aus der Datenbank heraus,
   ohne je einen echten Genrenamen zu beschneiden. */
const MAX_GENRES = 12;
const MAX_GENRE_LAENGE = 60;

/** "Action|Sci-Fi" -> ["Action", "Sci-Fi"] */
export function genresAus(text) {
  if (typeof text !== "string" || !text) return [];
  return text
    .split(GENRE_TRENNER)
    .map((g) => g.trim())
    .filter(Boolean)
    .slice(0, MAX_GENRES);
}

/**
 * ["Action", "Sci-Fi"] -> "Action|Sci-Fi"
 *
 * Doppelte fallen weg, der Trenner wird aus den Namen entfernt (sonst
 * zerfiele ein Genre beim Lesen in zwei). Keine Liste heisst leere
 * Zeichenkette, nicht NULL — die Unterscheidung "nicht mitgeschickt"
 * trifft der Aufrufer.
 */
export function genresZuText(liste) {
  if (!Array.isArray(liste)) return "";
  const sauber = [];
  for (const g of liste) {
    if (typeof g !== "string") continue;
    const name = g.replace(/\|/g, "/").trim().slice(0, MAX_GENRE_LAENGE);
    if (name && !sauber.includes(name)) sauber.push(name);
    if (sauber.length >= MAX_GENRES) break;
  }
  return sauber.join(GENRE_TRENNER);
}

/* ----------------------------------------------------------------
   Laufzeit des Werks

   Bei Filmen ist das die Laufzeit selbst (TMDB `runtime`). Bei Serien
   und Anime entsteht sie aus Episodenlaenge und Episodenanzahl; beides
   wird zusaetzlich einzeln festgehalten, dazu die Episodenanzahl je
   Staffel. Bei Spielen bleibt alles leer — eine Spieldauer laesst sich
   nicht abrufen.

   Wie alle Migrationen hier rein strukturell: es werden nur NULL-bare
   Spalten ergaenzt, keine bestehende Zeile angefasst.
   ---------------------------------------------------------------- */
async function ensureLaufzeit() {
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS runtime_minutes INTEGER`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS episode_runtime INTEGER`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS episode_count INTEGER`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS episodes_per_season TEXT`;
}

/* ----------------------------------------------------------------
   Wann wurde bewertet?

   `created_at` und `updated_at` gab es schon, aber beide beantworten
   die Frage nicht:

   - `updated_at` wandert bei JEDEM Speichervorgang mit, auch beim
     automatischen Nachladen von Poster, Genres und Laufzeit. Nach
     einem solchen Durchlauf waere jeder Eintrag "heute bewertet".
   - `created_at` ist bei direkt bewerteten Eintraegen richtig, bei
     vorgemerkten aber der Tag der Vormerkung — ein Titel, der zwei
     Jahre auf der Watchlist lag, zaehlte ins falsche Jahr.

   Deshalb eine eigene Spalte. Sie wird genau einmal gesetzt: wenn aus
   einem Eintrag ein bewerteter wird. Spaetere Aenderungen an Poster,
   Angaben oder Noten lassen sie unberuehrt (siehe COALESCE in
   api/items.js).

   Der Backfill fuellt sie einmalig aus `created_at` — die beste
   Naeherung, die es rueckwirkend gibt. Er fasst nur Zeilen an, die
   noch gar keinen Wert haben, und laesst die Seeding-Zeilen
   (created_at = 0) bewusst leer: Ein Rueckblick auf das Jahr 1970
   waere schlechter als gar keine Angabe.
   ---------------------------------------------------------------- */
async function ensureBewertetAm() {
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS rated_at BIGINT`;
  await sql`
    UPDATE media_items
       SET rated_at = created_at
     WHERE rated_at IS NULL
       AND created_at > 0
       AND watchlist = FALSE
  `;
}

/* Die Episodenanzahl je Staffel steht — wie die Genres — als eine
   Zeichenkette in der Spalte: "12|12|24" heisst drei Staffeln mit 12,
   12 und 24 Folgen. Eine eigene Tabelle waere sauberer, brachte hier
   aber nichts: gelesen wird die Liste immer als Ganzes. Die Tabelle
   `seasons` scheidet dafuer aus — dort stehen nur die selbst bewerteten
   Staffeln, und gerade vorgemerkte Werke haben davon keine. */
const STAFFEL_TRENNER = "|";

/* Defensive Grenzen gegen Unsinn aus der Datenbank. Kein Werk hat 500
   Staffeln, und keine Staffel 10000 Folgen. */
const MAX_STAFFELN = 500;
const MAX_FOLGEN_JE_STAFFEL = 10000;

/** "12|12|24" -> [12, 12, 24] */
export function episodenAus(text) {
  if (typeof text !== "string" || !text) return [];
  return text
    .split(STAFFEL_TRENNER)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.min(MAX_FOLGEN_JE_STAFFEL, Math.round(n)))
    .slice(0, MAX_STAFFELN);
}

/**
 * [12, 12, 24] -> "12|12|24"
 *
 * Keine Liste heisst leere Zeichenkette, nicht NULL — die
 * Unterscheidung "nicht mitgeschickt" trifft der Aufrufer.
 */
export function episodenZuText(liste) {
  if (!Array.isArray(liste)) return "";
  return liste
    .map((n) => (typeof n === "number" ? n : Number(n)))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => String(Math.min(MAX_FOLGEN_JE_STAFFEL, Math.round(n))))
    .slice(0, MAX_STAFFELN)
    .join(STAFFEL_TRENNER);
}

/**
 * Minuten- und Stueckzahlen aus einer Anfrage: eine positive ganze
 * Zahl oder null. Alles andere (0, negativ, Text) gilt als "nicht
 * bekannt" — eine Laufzeit von 0 Minuten waere keine Angabe, sondern
 * ein Fehler.
 */
export function positiveZahl(wert) {
  if (typeof wert !== "number" || !Number.isFinite(wert)) return null;
  const ganz = Math.round(wert);
  return ganz > 0 ? ganz : null;
}

/* Gewichtung einer Staffel. Eingegeben wird sie in der App als Prozent
   (0 % bis 200 % in 5-Prozent-Schritten); gespeichert und gerechnet wird
   weiterhin mit Faktoren (Prozent / 100). 100 % entspricht dem Faktor
   1.0 — bestehende Staffeln aendern ihre Note dadurch nicht. */
export const SEASON_WEIGHT_MIN = 0;
export const SEASON_WEIGHT_MAX = 2;
export const SEASON_WEIGHT_DEFAULT = 1;
export const SEASON_WEIGHT_STEP = 0.05;

export function normalizeWeight(wert) {
  if (typeof wert !== "number" || Number.isNaN(wert)) return SEASON_WEIGHT_DEFAULT;
  const begrenzt = Math.min(SEASON_WEIGHT_MAX, Math.max(SEASON_WEIGHT_MIN, wert));
  // Auf 0.05 (= 5 %) runden, damit keine krummen Werte in die
  // Datenbank geraten.
  return Math.round(begrenzt * 20) / 20;
}

/**
 * Staffelzeile -> Format, das das Frontend erwartet.
 *
 * Welche Werte eine Staffel traegt, haengt an der Kategorie des
 * Eintrags: Kinderserien haben kein Schauspiel. Ohne Angabe gelten die
 * sieben Felder von Film, Serie und Anime — so verhalten sich alle
 * Aufrufer wie zuvor, die die Kategorie nicht kennen.
 */
export function rowToSeason(r, category) {
  const values = {};
  for (const key of criteriaKeysFor(category)) {
    values[key] = r[key] === null || r[key] === undefined ? null : Number(r[key]);
  }
  return {
    // Die ID vergibt Postgres (Identity). Als Zeichenkette, damit grosse
    // Zahlen unterwegs nicht an Genauigkeit verlieren.
    id: r.id === null || r.id === undefined ? undefined : String(r.id),
    seasonNumber: Number(r.season_number),
    values,
    personal: Number(r.personal),
    weight: normalizeWeight(r.weight === null || r.weight === undefined ? SEASON_WEIGHT_DEFAULT : Number(r.weight)),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

/**
 * Prueft eine Staffelliste. Staffeln gibt es bei allen Serienarten;
 * jede traegt dieselben Kriterien wie der Eintrag selbst — bei
 * Kinderserien sind das sechs statt sieben.
 */
export function validateSeasons(seasons, category) {
  const errors = [];
  if (seasons == null) return errors;
  if (!Array.isArray(seasons)) return ["Ungültige Staffelliste."];
  if (!seasons.length) return errors;

  if (!supportsSeasons(category)) {
    errors.push("Staffeln gibt es nur bei Serien, Anime, Kinderserien und Adult Animation.");
    return errors;
  }

  seasons.forEach((season, i) => {
    const nr = i + 1;
    if (!season || typeof season !== "object") {
      errors.push("Staffel " + nr + " ist ungültig.");
      return;
    }
    const values = season.values || {};
    for (const key of criteriaKeysFor(category)) {
      const v = values[key];
      if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 10) {
        errors.push("Staffel " + nr + ": ungültiger Wert für " + key + " (0–10 erforderlich).");
      }
    }
    if (typeof season.personal !== "number" || season.personal < 0 || season.personal > 10) {
      errors.push("Staffel " + nr + ": ungültiges Bauchgefühl (0–10 erforderlich).");
    }
    // Das Gewicht ist optional; fehlt es, gilt 1.0 (= 100 %).
    if (
      season.weight != null &&
      (typeof season.weight !== "number" ||
        Number.isNaN(season.weight) ||
        season.weight < SEASON_WEIGHT_MIN ||
        season.weight > SEASON_WEIGHT_MAX)
    ) {
      errors.push("Staffel " + nr + ": ungültige Gewichtung (0–200 % erforderlich).");
    }
  });

  return errors;
}

/** Datenbankzeile -> Format, das das Frontend erwartet. */
export function rowToItem(r) {
  // Nur die Felder der jeweiligen Kategorie zurueckgeben. Sonst kaemen
  // die nicht belegten Spalten als 0 beim Frontend an und wuerden dort
  // wie echte Bewertungen aussehen.
  const values = {};
  for (const key of criteriaKeysFor(r.category)) {
    values[key] = r[key] === null || r[key] === undefined ? null : Number(r[key]);
  }

  return {
    id: r.id,
    category: r.category,
    title: r.title,
    poster: r.poster || "",
    posterSource: r.poster_source || undefined,
    backdrop: r.backdrop || "",
    // Angaben zum Werk. Nicht gesetzt heisst null, nicht 0 — sonst
    // stuende bei jedem Eintrag ohne Daten das Jahr 0 in der App.
    releaseYear: r.release_year === null || r.release_year === undefined ? null : Number(r.release_year),
    director: r.director || null,
    imdbRating: r.imdb_rating === null || r.imdb_rating === undefined ? null : Number(r.imdb_rating),
    // Zusatzdaten. Leer heisst leere Liste bzw. null — daran erkennt
    // das Frontend, was noch nachzuladen ist.
    genre: genresAus(r.genres),
    collection: r.collection || null,
    studio: r.studio || null,
    // Laufzeit. Nicht bekannt heisst null bzw. leere Liste — daran
    // erkennt das Frontend, was noch nachzuladen ist, und die Summe im
    // Statistik-Tab laesst diese Eintraege aus.
    runtimeMinutes: positiveZahl(r.runtime_minutes === null || r.runtime_minutes === undefined ? null : Number(r.runtime_minutes)),
    episodeRuntime: positiveZahl(r.episode_runtime === null || r.episode_runtime === undefined ? null : Number(r.episode_runtime)),
    episodeCount: positiveZahl(r.episode_count === null || r.episode_count === undefined ? null : Number(r.episode_count)),
    episodesPerSeason: episodenAus(r.episodes_per_season),
    // Vorgemerkt statt bewertet: dann gibt es keine Werte und keine Note.
    watchlist: r.watchlist === true,
    // Wie oft geschaut/gespielt. Aeltere Zeilen ohne Spalte gelten als
    // einmal gesehen — dasselbe, was der Spalten-DEFAULT vorgibt.
    watchCount:
      r.watch_count === null || r.watch_count === undefined
        ? WATCH_COUNT_DEFAULT
        : Number(r.watch_count),
    values,
    // Ohne Bauchgefuehl bleibt es null — Number(null) waere 0 und saehe
    // aus wie eine echte, sehr schlechte Bewertung.
    personal: r.personal === null || r.personal === undefined ? null : Number(r.personal),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    // Wann aus dem Eintrag ein bewerteter wurde. null heisst "nicht
    // bekannt" — bei vorgemerkten Eintraegen und bei Altbestand ohne
    // brauchbares Datum. Der Jahresrueckblick laesst beide aus.
    ratedAt: r.rated_at === null || r.rated_at === undefined ? null : Number(r.rated_at),
  };
}

/** Serverseitige Validierung — keine ungültigen Daten in der DB. */
export function validateItem(body) {
  const errors = [];
  if (!body || typeof body !== "object") return ["Ungültiger Datensatz."];

  if (typeof body.title !== "string" || !body.title.trim()) errors.push("Titel fehlt.");
  if (!CATEGORIES.includes(body.category)) {
    // Ohne gueltige Kategorie ist nicht entscheidbar, welche Kriterien
    // gelten — die Wertepruefung waere dann sinnlos.
    errors.push("Ungültige Kategorie.");
    return errors;
  }

  // Vorgemerkte Eintraege haben noch keine Bewertung — dort gibt es
  // weder Kriterien-Werte noch Bauchgefuehl zu pruefen. Alles Uebrige
  // (Titel, Kategorie, Poster, Angaben) gilt unveraendert.
  if (body.watchlist === true) {
    if (body.seasons != null && Array.isArray(body.seasons) && body.seasons.length) {
      errors.push("Vorgemerkte Einträge haben keine Staffeln.");
    }
    return errors.concat(angabenFehler(body)).concat(zaehlerFehler(body));
  }

  const values = body.values || {};
  for (const key of criteriaKeysFor(body.category)) {
    const v = values[key];
    if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 10) {
      errors.push("Ungültiger Wert für " + key + " (0–10 erforderlich).");
    }
  }
  if (typeof body.personal !== "number" || body.personal < 0 || body.personal > 10) {
    errors.push("Ungültiges Bauchgefühl (0–10 erforderlich).");
  }
  errors.push(...angabenFehler(body));
  errors.push(...zaehlerFehler(body));
  errors.push(...validateSeasons(body.seasons, body.category));

  return errors;
}

/**
 * Der Zaehler ist optional: fehlt er, bleibt der gespeicherte Wert
 * stehen. Kommt er mit, muss es eine ganze Zahl ab 1 sein — 0 oder
 * negative Werte waeren keine Ansicht, die je stattgefunden hat.
 */
function zaehlerFehler(body) {
  if (body.watchCount == null) return [];
  if (
    typeof body.watchCount !== "number" ||
    !Number.isFinite(body.watchCount) ||
    body.watchCount < WATCH_COUNT_MIN ||
    body.watchCount > WATCH_COUNT_MAX
  ) {
    return ["Ungültiger Zähler (" + WATCH_COUNT_MIN + "–" + WATCH_COUNT_MAX + " erforderlich)."];
  }
  return [];
}

/**
 * Bilder und Angaben zum Werk. Beides gilt fuer bewertete wie fuer
 * vorgemerkte Eintraege gleichermassen und ist durchweg optional —
 * die Angaben werden automatisch nachgeladen und duerfen deshalb
 * jederzeit fehlen.
 */
function angabenFehler(body) {
  const errors = [];

  if (body.poster != null && typeof body.poster !== "string") errors.push("Ungültige Poster-URL.");
  if (body.backdrop != null && typeof body.backdrop !== "string") errors.push("Ungültige Backdrop-URL.");

  if (
    body.releaseYear != null &&
    (typeof body.releaseYear !== "number" || !Number.isFinite(body.releaseYear))
  ) {
    errors.push("Ungültiges Erscheinungsjahr.");
  }
  if (body.director != null && typeof body.director !== "string") {
    errors.push("Ungültiger Regisseur.");
  }
  if (
    body.imdbRating != null &&
    (typeof body.imdbRating !== "number" ||
      Number.isNaN(body.imdbRating) ||
      body.imdbRating < 0 ||
      body.imdbRating > 10)
  ) {
    errors.push("Ungültige IMDb-Note (0–10 erforderlich).");
  }

  // Zusatzdaten sind wie die Angaben durchweg optional — sie werden
  // automatisch nachgeladen und duerfen jederzeit fehlen.
  if (body.genre != null && !Array.isArray(body.genre)) {
    errors.push("Ungültige Genreliste.");
  } else if (Array.isArray(body.genre) && body.genre.some((g) => typeof g !== "string")) {
    errors.push("Ungültige Genreliste.");
  }
  if (body.collection != null && typeof body.collection !== "string") {
    errors.push("Ungültige Filmreihe.");
  }
  if (body.studio != null && typeof body.studio !== "string") {
    errors.push("Ungültiges Studio.");
  }

  // Das Bewertungsdatum schickt regulaer nur das Einspielen eines
  // Backups mit; sonst entsteht es auf dem Server.
  if (
    body.ratedAt != null &&
    (typeof body.ratedAt !== "number" || !Number.isFinite(body.ratedAt) || body.ratedAt < 0)
  ) {
    errors.push("Ungültiges Bewertungsdatum.");
  }

  errors.push(...laufzeitFehler(body));

  return errors;
}

/**
 * Laufzeit-Angaben. Wie die uebrigen Zusatzdaten sind sie durchweg
 * optional: sie werden automatisch nachgeladen und duerfen jederzeit
 * fehlen. `null` ist ausdruecklich erlaubt — so wird die Laufzeit nach
 * einer Titelaenderung wieder geleert.
 */
function laufzeitFehler(body) {
  const errors = [];
  const zahlen = [
    ["runtimeMinutes", "Laufzeit"],
    ["episodeRuntime", "Episodenlänge"],
    ["episodeCount", "Episodenanzahl"],
  ];
  for (const [feld, name] of zahlen) {
    const wert = body[feld];
    if (wert == null) continue;
    if (typeof wert !== "number" || !Number.isFinite(wert) || wert < 0) {
      errors.push("Ungültige " + name + ".");
    }
  }

  if (body.episodesPerSeason != null) {
    if (!Array.isArray(body.episodesPerSeason)) {
      errors.push("Ungültige Episodenliste.");
    } else if (
      body.episodesPerSeason.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0)
    ) {
      errors.push("Ungültige Episodenliste.");
    }
  }

  return errors;
}
