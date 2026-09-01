import { neon } from "@neondatabase/serverless";

// Vercel/Neon setzen diese Variable automatisch, wenn du die
// Neon-Integration im Vercel-Dashboard hinzufügst.
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL;

/* Die Verbindung entsteht erst beim ersten Zugriff, nicht schon beim
   Laden des Moduls.

   `neon()` wirft sofort, wenn die Zeichenkette fehlt ("No database
   connection string was provided"). Stand der Aufruf hier oben, flog
   dieser Fehler waehrend des Imports — also bevor irgendein
   try/catch in einem Handler ueberhaupt existierte. Vercel
   beantwortete die Anfrage dann mit einem nackten 500 ohne Rumpf, und
   in der App stand nur "Laden fehlgeschlagen (500)". Die eigentliche
   Ursache — eine fehlende oder umbenannte Umgebungsvariable — war
   weder in der App noch sauber im Log zu sehen.

   Jetzt faellt der Fehler beim ersten `sql`-Aufruf an, also innerhalb
   des Handlers: Er wird gefangen, protokolliert und als lesbare
   Meldung beantwortet. */
let verbindung = null;

function db() {
  if (verbindung) return verbindung;
  if (!connectionString) {
    throw new Error(
      "Keine Datenbank-Verbindung konfiguriert. Es ist weder DATABASE_URL " +
        "noch POSTGRES_URL oder NEON_DATABASE_URL gesetzt."
    );
  }
  verbindung = neon(connectionString);
  return verbindung;
}

/* Nach aussen verhaelt sich `sql` unveraendert: als Template-Tag fuer
   einzelne Abfragen und mit `.transaction([...])` fuer mehrere in
   einem Rutsch. Beides wird unveraendert an den Treiber
   durchgereicht — `transaction` bekommt damit genau die Objekte, die
   der Treiber selbst erzeugt hat. */
export function sql(strings, ...werte) {
  return db()(strings, ...werte);
}

sql.transaction = (queries, options) => db().transaction(queries, options);

/* ----------------------------------------------------------------
   Fehler lesbar machen

   Geht in Postgres etwas schief, wirft der Treiber einen
   `NeonDbError`. Dessen `message` ist nur die erste Zeile der
   Meldung ("column ... does not exist"). Alles, was den Fehler
   wirklich erklaert, haengt in eigenen Feldern: `code` (der
   SQLSTATE), `detail`, `hint`, `constraint`, `table`, `column`.

   Bisher ging beides verloren: `console.error("API-Fehler:", err)`
   gibt diese Felder nicht aus, und in der Antwort stand nur
   `err.message`. In der App kam davon nicht einmal das an — sie
   zeigte allein den Status. Aus einem "relation seasons does not
   exist" wurde so ein blankes "(500)".
   ---------------------------------------------------------------- */
const PG_FELDER = [
  "code", "detail", "hint", "constraint", "table", "column", "dataType", "routine",
];

/** Fehler -> eine Zeile mit allem, was Postgres mitgeteilt hat. */
export function fehlerBeschreibung(err) {
  if (!err) return "unbekannter Fehler";
  const teile = [err.message || String(err)];
  for (const feld of PG_FELDER) {
    const wert = err[feld];
    if (wert !== null && wert !== undefined && wert !== "") teile.push(feld + "=" + wert);
  }
  return teile.join(" | ");
}

/**
 * Fehler ins Log — mit allen Feldern und dem Stapel, damit in den
 * Vercel-Logs die tatsaechliche Ursache steht und nicht nur, dass
 * etwas schiefging.
 */
export function logFehler(kontext, err) {
  console.error(kontext + ": " + fehlerBeschreibung(err));
  if (err && err.stack) console.error(err.stack);
}

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

/* Dokus haben eigene Kriterien mit eigenen Gewichten, kommen dafuer
   aber ebenfalls ohne neue Spalte aus: Sie belegen dieselben sieben
   Felder wie Film, Serie und Anime, nur anders beschriftet (die
   Zuordnung steht in src/App.jsx):

     emotion      -> "Informationsgehalt / Erkenntnisgewinn"
     story        -> "Aufbau & Erzählweise"
     charaktere   -> "Protagonisten & Wirkung"
     inszenierung -> "Inszenierung / Bildsprache"
     unterhaltung -> "Unterhaltung / Spannung"
     schauspiel   -> "Glaubwürdigkeit & Recherche"
     sound        -> "Sound & Sprecher"

   Staffeln gibt es bei Dokus nicht (siehe SEASON_CATEGORIES) — auch
   eine Doku-Serie traegt genau eine Gesamtnote. */
const DOKU_KEYS = AV_KEYS;

/* Kinderserien und Adult Animation kamen nach den vier urspruenglichen
   Kategorien dazu. Adult Animation ist technisch eine Serie mit den
   Kriterien und Beschriftungen von Anime. Dokus kamen zuletzt hinzu. */
export const CATEGORIES = ["movie", "series", "anime", "kids", "adultanim", "doku", "game"];

export const CRITERIA_KEYS_BY_CATEGORY = {
  movie: AV_KEYS,
  series: AV_KEYS,
  anime: AV_KEYS,
  kids: KIDS_KEYS,
  adultanim: AV_KEYS,
  doku: DOKU_KEYS,
  game: GAME_KEYS,
};

/** Alle Kriterien-Spalten, die es in der Tabelle gibt. */
export const ALL_CRITERIA_KEYS = Array.from(new Set([...AV_KEYS, ...GAME_KEYS]));

export function criteriaKeysFor(category) {
  return CRITERIA_KEYS_BY_CATEGORY[category] || AV_KEYS;
}

let initPromise = null;

/**
 * Legt die Tabelle an (falls nötig) und befüllt sie einmalig.
 *
 * Scheitert der Durchlauf, wird das Versprechen wieder verworfen. Ohne
 * das blieb ein einmal fehlgeschlagener Start fuer die gesamte
 * Lebensdauer der Serverless-Instanz haengen: `initPromise` zeigte
 * dauerhaft auf ein abgelehntes Versprechen, und jede weitere Anfrage
 * an dieselbe Instanz bekam denselben Fehler zurueck, ohne es noch
 * einmal zu versuchen. Ein kurzer Aussetzer der Datenbank — etwa das
 * Aufwachen einer schlafenden Neon-Instanz — wurde so zu einem
 * dauerhaften 500.
 */
export function ensureReady() {
  if (!initPromise) {
    initPromise = initMitWiederholung().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/* Fehlercodes, die entstehen, wenn zwei Instanzen gleichzeitig
   migrieren.

   Die Startseite laedt mehrere Endpunkte parallel (Bewertungen,
   Kopfbilder, Duelle, Bestwerte, XP). Jeder davon ist eine eigene
   Serverless-Instanz, und jede ruft `ensureReady()` auf. Solange die
   Datenbank auf dem neuesten Stand ist, tun die Migrationen nichts und
   das faellt nicht auf. Direkt nach einer Auslieferung mit neuer
   Migration laufen sie aber wirklich — und dann sind sie nicht
   gegeneinander abgesichert: `CREATE TABLE IF NOT EXISTS` und
   `CREATE INDEX IF NOT EXISTS` pruefen und legen an, ohne das gegen
   einen zweiten, gleichzeitigen Aufruf zu sperren. Der Verlierer des
   Rennens bekommt einen Fehler aus dem Systemkatalog.

   Die Migrationen sind allesamt wiederholbar. Beim zweiten Versuch ist
   der andere Aufruf fertig, alle `IF NOT EXISTS` greifen ins Leere und
   der Durchlauf geht durch. */
const RENNEN_CODES = new Set([
  "23505", // unique_violation — auf pg_type/pg_class beim gleichzeitigen Anlegen
  "42P07", // duplicate_table
  "42P06", // duplicate_schema
  "42701", // duplicate_column
  "42710", // duplicate_object
  "42704", // undefined_object — der andere Aufruf hat den Constraint schon ersetzt
  "40001", // serialization_failure
  "40P01", // deadlock_detected
]);

const INIT_VERSUCHE = 3;

async function initMitWiederholung() {
  for (let versuch = 1; ; versuch++) {
    try {
      return await init();
    } catch (err) {
      if (versuch >= INIT_VERSUCHE || !RENNEN_CODES.has(err && err.code)) throw err;
      console.warn(
        "Migration lief gegen einen parallelen Aufruf (" + err.code + "), Versuch " +
          versuch + " von " + INIT_VERSUCHE + ": " + err.message
      );
      await new Promise((r) => setTimeout(r, 250 * versuch));
    }
  }
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
  await ensureDokuKategorie();
  await ensureDuelle();
  await ensureEloWerte();
  await ensureDuellPaare();
  await ensureHighscores();
  await ensureXp();
  await ensureAmSchauen();

  /* Hier endet der Start. Eine frische Datenbank bleibt in allen
     Kategorien leer.

     Frueher wurden an dieser Stelle einmalig rund 150 Filme aus der
     Sammlung des urspruenglichen Autors eingetragen — sichtbar nur
     bei einer wirklich leeren media_items, denn ein
     `SELECT COUNT(*)` hat vorher abgebrochen. In einem Fork war das
     ein Fehlstart: Filme fremder Herkunft, Serien/Anime/Spiele leer.

     An einer befuellten Datenbank aendert das Entfernen nichts. Der
     Block lief ausschliesslich bei COUNT(*) = 0; wo Zeilen stehen,
     wurde er noch nie erreicht. Es wird nichts geloescht, nichts
     ueberschrieben und keine Migration angefasst.

     Wer eine leere Datenbank fuellen will, nimmt den Weg, den die App
     ohnehin hat: Daten-Panel (Zahnrad oben rechts) ->
     "JSON-Datei importieren". Der Import ergaenzt nur. */
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
          EXECUTE 'ALTER TABLE media_items DROP CONSTRAINT IF EXISTS ' || quote_ident(con_name);
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
          EXECUTE 'ALTER TABLE media_items DROP CONSTRAINT IF EXISTS ' || quote_ident(con_name);
        END LOOP;

        ALTER TABLE media_items
          ADD CONSTRAINT media_items_category_allowed
          CHECK (category IN ('movie','series','anime','kids','adultanim','game'));
      END IF;
    END $$
  `;

  await sql`ALTER TABLE seasons ALTER COLUMN schauspiel DROP NOT NULL`;
}

/* ----------------------------------------------------------------
   Dokus

   Die siebte Kategorie. Sie braucht wie die beiden davor keine neue
   Spalte — Dokus teilen sich die sieben Kriterien-Spalten von Film,
   Serie und Anime (siehe DOKU_KEYS oben) und kennen keine Staffeln.

   Zu tun ist deshalb nur eines: Der CHECK auf `category` kennt 'doku'
   noch nicht. Wie bei den beiden Schritten davor werden alle CHECKs
   auf die Spalte gesucht und durch einen ersetzt, der alle sieben
   Kategorien erlaubt. Der Block laeuft genau einmal: danach steht
   'doku' in der Bedingung.

   Der Constraint-Name bleibt derselbe wie bei den Schritten davor —
   und weil deren Bedingung ('%kids%') auch im neuen Constraint noch
   zutrifft, ueberschreiben sich die Migrationen nicht gegenseitig.

   Rein strukturell: Es wird KEINE bestehende Zeile angefasst, alle
   Bewertungen bleiben Bit fuer Bit erhalten. Vorhandene Doku-
   Eintraege im Filme-Reiter bleiben unveraendert Filme.
   ---------------------------------------------------------------- */
async function ensureDokuKategorie() {
  await sql`
    DO $$
    DECLARE con_name text;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        WHERE r.relname = 'media_items'
          AND c.conname = 'media_items_category_allowed'
          AND pg_get_constraintdef(c.oid) ILIKE '%doku%'
      ) THEN
        FOR con_name IN
          SELECT c.conname FROM pg_constraint c
          JOIN pg_class r ON r.oid = c.conrelid
          WHERE r.relname = 'media_items'
            AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) ILIKE '%category%'
        LOOP
          EXECUTE 'ALTER TABLE media_items DROP CONSTRAINT IF EXISTS ' || quote_ident(con_name);
        END LOOP;

        ALTER TABLE media_items
          ADD CONSTRAINT media_items_category_allowed
          CHECK (category IN ('movie','series','anime','kids','adultanim','doku','game'));
      END IF;
    END $$
  `;
}

/* Kategorien, die optional in Staffeln unterteilt werden koennen.
   Kinderserien und Adult Animation gehoeren dazu — es sind Serien.
   Dokus gehoeren bewusst nicht dazu: Auch eine Doku-Serie bekommt
   genau eine Gesamtnote. */
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
   Duell-Staerke je Eintrag (Elo)

   Der Zaehler oben sagt, wie oft in einer Kategorie gespielt wurde.
   Wer dabei gewonnen hat, steht hier: jeder Eintrag fuehrt eine
   eigene Elo-Zahl, einen eigenen Duellzaehler und einen Zaehler der
   gewonnenen Duelle.

   Die Siege sind der spaetere Zusatz: Bis dahin war je Eintrag nur
   die Gesamtzahl der Duelle festgehalten, nicht wie sie ausgingen.
   Genau das braucht die Kennzeichnung auffaelliger Bewertungen — sie
   soll nur bei gemischten Ergebnissen anschlagen. Die Niederlagen
   ergeben sich daraus als `duels - siege` und bekommen deshalb keine
   eigene Spalte.

   Alle drei sind Spalten mit einem DEFAULT — bestehende Zeilen
   bekommen den Startwert und aendern sich dadurch nicht. Bei
   ELO_START (1000) ist der Zuschlag auf die Endnote exakt 0; ohne
   gespieltes Duell sieht die App also aus wie zuvor. `siege` startet
   bei allen vorhandenen Eintraegen auf 0: Die bisherigen Ausgaenge
   wurden nirgends festgehalten, und aus dem Elo-Wert lassen sie sich
   nicht zurueckrechnen. Geschaetzt wird hier nichts.

   Die Zahlen stehen als Literale im Befehl und nicht als eingesetzte
   Werte: Postgres erlaubt in DDL keine Parameter. Sie muessen deshalb
   zu ELO_START bzw. 0 passen.
   ---------------------------------------------------------------- */

/** Startwert jedes Eintrags. Genau hier ist der Zuschlag 0. */
export const ELO_START = 1000;

/* Groesste Verschiebung eines einzelnen Duells (klassischer Elo-Wert)
   und die Skala der Erwartung. Beides sind die Konstanten des
   Standard-Elo, nicht mehr die der frueheren Bauchgefuehl-Rechnung. */
export const ELO_K = 32;
export const ELO_SKALA = 400;

async function ensureEloWerte() {
  await sql`
    ALTER TABLE media_items
      ADD COLUMN IF NOT EXISTS elo REAL NOT NULL DEFAULT 1000
  `;
  await sql`
    ALTER TABLE media_items
      ADD COLUMN IF NOT EXISTS duels INTEGER NOT NULL DEFAULT 0
  `;
  await sql`
    ALTER TABLE media_items
      ADD COLUMN IF NOT EXISTS siege INTEGER NOT NULL DEFAULT 0
  `;
}

/* ----------------------------------------------------------------
   Minispiele: welche zwei Titel schon gegeneinander angetreten sind

   Die Zaehler oben sagen, wie oft gespielt wurde — nicht, wer gegen
   wen. Genau das steht hier: eine Zeile je Paarung mit dem Zeitpunkt
   des letzten Duells. Daraus entsteht die Sperrfrist des
   Head-to-Head: eine schon gespielte Paarung kommt erst wieder, wenn
   im Notenfenster keine ungespielte mehr uebrig ist.

   Zwei Dinge sind daran wichtig:

     - `item_a` und `item_b` liegen sortiert (die kleinere ID zuerst,
       siehe paarSortiert). A-gegen-B und B-gegen-A sind dieselbe
       Paarung; ohne das Sortieren griffe die Sperre nur in eine
       Richtung.
     - Beide IDs haengen per Fremdschluessel an media_items und
       verschwinden mit dem Eintrag (ON DELETE CASCADE) — genau wie
       die Staffeln. Verwaiste Zeilen kann es dadurch gar nicht erst
       geben, und die Paarungssuche muss nichts uebergehen.

   Der Index ist eindeutig: je Paarung genau eine Zeile. Ein erneutes
   Duell schreibt den Zeitpunkt fort (ON CONFLICT), statt eine zweite
   Zeile anzulegen — dieselbe Bauart wie beim Kategoriezaehler.

   Die bestehenden Zaehler (`duel_counts` je Kategorie, `duels` je
   Eintrag) bleiben unveraendert; diese Tabelle ersetzt sie nicht.
   ---------------------------------------------------------------- */
async function ensureDuellPaare() {
  await sql`
    CREATE TABLE IF NOT EXISTS duell_paare (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      kategorie   TEXT NOT NULL,
      item_a      TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      item_b      TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      gespielt_am BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS duell_paare_paar_idx
      ON duell_paare (kategorie, item_a, item_b)
  `;
}

/**
 * Die beiden IDs einer Paarung in fester Reihenfolge — kleinere
 * zuerst. Damit ist A-gegen-B derselbe Eintrag wie B-gegen-A.
 *
 * Verglichen wird als Text, genau wie im Frontend
 * (paarungsSchluessel in src/App.jsx). Beide muessen dieselbe
 * Reihenfolge ergeben, sonst findet die Suche die eigene Zeile nicht
 * wieder.
 */
export function paarSortiert(a, b) {
  return String(a) < String(b) ? [a, b] : [b, a];
}

/** Datenbankzeile -> gespielte Paarung fuer das Frontend. */
export function rowToDuellPaar(r) {
  return { a: r.item_a, b: r.item_b, at: Number(r.gespielt_am) };
}

/** Erwartung, dass A gegen B gewinnt — zwischen 0 und 1. */
export function eloErwartung(eloA, eloB) {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / ELO_SKALA));
}

/**
 * Neue Elo-Zahlen nach einem entschiedenen Duell.
 *
 * Der Gewinner steht mit S = 1 an, der Verlierer mit S = 0. Was der
 * eine gewinnt, verliert der andere: beide Erwartungen ergaenzen sich
 * zu 1, also sind die beiden Verschiebungen betragsgleich.
 *
 * Gedeckelt wird hier nichts — die Zahl darf frei laufen. Begrenzt
 * ist erst der Zuschlag, den das Frontend daraus rechnet.
 */
export function eloNeu(eloGewinner, eloVerlierer) {
  const erwartungGewinner = eloErwartung(eloGewinner, eloVerlierer);
  const verschiebung = ELO_K * (1 - erwartungGewinner);
  return {
    gewinner: eloGewinner + verschiebung,
    verlierer: eloVerlierer - verschiebung,
  };
}

/**
 * Elo-Zahl aus einer Anfrage.
 *
 * Wie beim Zaehler heisst "fehlt" hier `null`: der gespeicherte Wert
 * bleibt dann stehen. Ohne diese Unterscheidung wuerde jedes
 * automatische Nachladen von Postern oder Genres die Duell-Staerke
 * eines Eintrags auf den Startwert zuruecksetzen.
 */
export function normalizeElo(wert) {
  if (wert == null) return null;
  if (typeof wert !== "number" || !Number.isFinite(wert)) return null;
  return wert;
}

/** Duellzaehler eines Eintrags aus einer Anfrage — analog. */
export function normalizeDuels(wert) {
  if (wert == null) return null;
  if (typeof wert !== "number" || !Number.isFinite(wert)) return null;
  return Math.max(0, Math.round(wert));
}

/** Siegzaehler eines Eintrags aus einer Anfrage — genauso. */
export function normalizeSiege(wert) {
  if (wert == null) return null;
  if (typeof wert !== "number" || !Number.isFinite(wert)) return null;
  return Math.max(0, Math.round(wert));
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

/* ----------------------------------------------------------------
   Am Schauen

   Ein eigenes, unabhaengiges Kennzeichen — kein Zustand, der
   "bewertet" oder "vorgemerkt" ersetzt. Genau darum eine eigene
   Spalte statt eines dritten Wertes in `watchlist`: Ein bereits
   bewerteter Titel muss beim Rewatch gleichzeitig am Schauen sein
   koennen, ohne aus der Rangliste zu verschwinden.

   Dazu der Stand: laufende Staffel und zuletzt gesehene Folge. Beide
   bleiben NULL, bis das Kennzeichen zum ersten Mal gesetzt wird —
   NULL heisst hier ausdruecklich "nie gesetzt" und ist etwas anderes
   als 0 ("Staffel begonnen, noch keine Folge gesehen"). Beim
   Ausschalten bleiben sie stehen, damit ein spaeteres Wiederaufnehmen
   den Stand kennt.

   Wie alle Migrationen hier rein strukturell: es werden nur Spalten
   ergaenzt, keine bestehende Zeile angefasst.
   ---------------------------------------------------------------- */
async function ensureAmSchauen() {
  await sql`
    ALTER TABLE media_items
      ADD COLUMN IF NOT EXISTS am_schauen BOOLEAN NOT NULL DEFAULT FALSE
  `;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS staffel_nr INTEGER`;
  await sql`ALTER TABLE media_items ADD COLUMN IF NOT EXISTS folge_nr INTEGER`;
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

/**
 * Die laufende Staffel aus einer Anfrage: eine ganze Zahl ab 1 — oder
 * null fuer "nicht gesetzt". Anders als bei der Folge ist 0 hier kein
 * gueltiger Wert: eine Staffel 0 gibt es nicht.
 */
export function normalizeStaffelNr(wert) {
  if (typeof wert !== "number" || !Number.isFinite(wert)) return null;
  const ganz = Math.round(wert);
  return ganz >= 1 ? Math.min(MAX_STAFFELN, ganz) : null;
}

/**
 * Die zuletzt gesehene Folge: eine ganze Zahl ab 0 — oder null fuer
 * "nicht gesetzt". Die 0 ist hier ein echter Wert und heisst "Staffel
 * begonnen, noch keine Folge gesehen"; genau so wird beim Einschalten
 * des Kennzeichens gestartet.
 */
export function normalizeFolgeNr(wert) {
  if (typeof wert !== "number" || !Number.isFinite(wert)) return null;
  const ganz = Math.round(wert);
  return ganz >= 0 ? Math.min(MAX_FOLGEN_JE_STAFFEL, ganz) : null;
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
    /* Am Schauen — ein eigenes Kennzeichen neben `watchlist`, kein
       dritter Wert davon: Ein bewerteter Eintrag kann beim Rewatch
       gleichzeitig am Schauen sein. Aeltere Zeilen ohne die Spalte
       gelten als nicht am Schauen — dasselbe, was der Spalten-DEFAULT
       vorgibt. */
    amSchauen: r.am_schauen === true,
    /* Der Stand: laufende Staffel und zuletzt gesehene Folge. null
       heisst "nie gesetzt" und ist etwas anderes als 0 — eine 0 bei
       der Folge heisst "Staffel begonnen, noch keine Folge gesehen". */
    staffelNr: r.staffel_nr === null || r.staffel_nr === undefined ? null : Number(r.staffel_nr),
    folgeNr: r.folge_nr === null || r.folge_nr === undefined ? null : Number(r.folge_nr),
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
    /* Duell-Staerke, Zahl der gespielten Duelle und davon gewonnene.
       Aeltere Zeilen ohne diese Spalten gelten als unangetastet:
       Startwert und 0 — dasselbe, was der Spalten-DEFAULT vorgibt.
       Bei ELO_START ist der Zuschlag auf die Endnote exakt 0. Die
       Niederlagen stehen nirgends: sie sind `duels - siege`. */
    elo: r.elo === null || r.elo === undefined ? ELO_START : Number(r.elo),
    duels: r.duels === null || r.duels === undefined ? 0 : Number(r.duels),
    siege: r.siege === null || r.siege === undefined ? 0 : Number(r.siege),
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
    return errors
      .concat(angabenFehler(body))
      .concat(zaehlerFehler(body))
      .concat(duellFelderFehler(body))
      .concat(amSchauenFehler(body));
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
  errors.push(...duellFelderFehler(body));
  errors.push(...amSchauenFehler(body));
  errors.push(...validateSeasons(body.seasons, body.category));

  return errors;
}

/**
 * Der Zaehler ist optional: fehlt er, bleibt der gespeicherte Wert
 * stehen. Kommt er mit, muss es eine ganze Zahl ab 1 sein — 0 oder
 * negative Werte waeren keine Ansicht, die je stattgefunden hat.
 */
function duellFelderFehler(body) {
  const errors = [];
  if (body.elo != null && (typeof body.elo !== "number" || !Number.isFinite(body.elo))) {
    errors.push("Ungültige Duell-Wertung.");
  }
  if (
    body.duels != null &&
    (typeof body.duels !== "number" || !Number.isFinite(body.duels) || body.duels < 0)
  ) {
    errors.push("Ungültige Duellzahl.");
  }
  if (
    body.siege != null &&
    (typeof body.siege !== "number" || !Number.isFinite(body.siege) || body.siege < 0)
  ) {
    errors.push("Ungültige Siegzahl.");
  }
  return errors;
}

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
 * Das Kennzeichen "am Schauen" und der Fortschritt darin.
 *
 * Alle drei sind durchweg optional: aeltere Sicherungen kennen sie
 * nicht, und nicht jeder Speichervorgang schickt sie mit. Geprueft
 * wird deshalb nur, was da ist — und zwar bei vorgemerkten Eintraegen
 * genauso wie bei bewerteten: das Kennzeichen gilt fuer beide.
 */
function amSchauenFehler(body) {
  const errors = [];
  if (body.amSchauen != null && typeof body.amSchauen !== "boolean") {
    errors.push("Ungültiges Kennzeichen „Am Schauen“.");
  }
  for (const [feld, name] of [["staffelNr", "Staffel"], ["folgeNr", "Folge"]]) {
    const wert = body[feld];
    if (wert == null) continue;
    if (typeof wert !== "number" || !Number.isFinite(wert) || wert < 0) {
      errors.push("Ungültige " + name + "-Nummer.");
    }
  }
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
