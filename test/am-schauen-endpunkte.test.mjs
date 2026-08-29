/**
 * Tests fuer das, was die Endpunkte rund um "Am Schauen" tatsaechlich
 * an die Datenbank schicken.
 *
 * Es gibt hier kein Postgres. Wie in duell-endpunkte.test.mjs wird der
 * Treiber ersetzt: die Module unter api/ laufen im echten Code-Pfad,
 * nur ohne Server am anderen Ende. Der Stub schreibt Text UND Werte
 * mit — genau darum geht es: welche Spalten mit welchen Werten
 * beschrieben werden.
 *
 * Die Zusagen:
 *
 *   1. Der Start legt die drei Spalten additiv an und fasst dabei
 *      keine Zeile an.
 *   2. Ein Backup ohne die neuen Felder laesst sich einspielen und
 *      bekommt die Standardwerte: false, NULL, NULL.
 *   3. Ein Speichervorgang ohne die drei Felder laesst die
 *      gespeicherten Werte stehen. Damit entfernt insbesondere eine
 *      Bewertung das Kennzeichen nicht.
 *   4. Der Schalter schreibt genau diese drei Spalten — auch bei einem
 *      vorgemerkten Eintrag.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const STUB = `
export const anweisungen = [];

function fuegeZusammen(strings, werte) {
  let text = strings[0];
  for (let i = 0; i < werte.length; i++) text += "$" + (i + 1) + strings[i + 1];
  return text;
}

/* Eine Zeile, wie media_items sie liefern wuerde — nur die Felder,
   die rowToItem tatsaechlich liest. */
function zeile(id) {
  return {
    id: id || "x", category: "movie", title: "Titel", poster: "", backdrop: "",
    story: 8, charaktere: 8, unterhaltung: 8, emotion: 8,
    inszenierung: 8, schauspiel: 8, sound: 8,
    personal: 7, watchlist: false, watch_count: 1,
    elo: 1000, duels: 0,
    am_schauen: false, staffel_nr: null, folge_nr: null,
    created_at: 1, updated_at: 1, rated_at: 1,
  };
}

function antwort(text, werte) {
  if (/count\\(\\*\\)/i.test(text)) return [{ n: 0, count: 0 }];
  if (/SELECT\\s+id\\s+FROM\\s+media_items/i.test(text)) return [{ id: werte[0] }];
  if (/FROM\\s+seasons/i.test(text)) return [];
  if (/media_items/i.test(text) && /RETURNING/i.test(text)) return [zeile(werte[werte.length - 1])];
  return [];
}

export function neon() {
  const sql = (strings, ...werte) => {
    const text = fuegeZusammen(strings, werte);
    const eintrag = { text, werte };
    anweisungen.push(eintrag);
    return Object.assign(Promise.resolve(antwort(text, werte)), eintrag);
  };
  sql.transaction = (queries) => Promise.all(queries);
  return sql;
}
`;

async function ladeApi() {
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-schauen-api-"));
  const stubDatei = join(verzeichnis, "stub-treiber.mjs");
  await writeFile(stubDatei, STUB);

  const dbQuelle = await readFile(new URL("../api/_db.js", import.meta.url), "utf8");
  const dbMitStub = dbQuelle.replace(
    /from\s+"@neondatabase\/serverless"/,
    'from "' + pathToFileURL(stubDatei).href + '"'
  );
  assert.notEqual(dbMitStub, dbQuelle, "Der Treiber-Import wurde nicht ersetzt");
  const dbDatei = join(verzeichnis, "_db.mjs");
  await writeFile(dbDatei, dbMitStub);

  const quelle = await readFile(new URL("../api/items.js", import.meta.url), "utf8");
  const datei = join(verzeichnis, "items.mjs");
  await writeFile(datei, quelle.replace(/from\s+"\.\/_db\.js"/, 'from "' + pathToFileURL(dbDatei).href + '"'));

  const stub = await import(pathToFileURL(stubDatei).href);
  return {
    items: (await import(pathToFileURL(datei).href)).default,
    db: await import(pathToFileURL(dbDatei).href),
    stub,
  };
}

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://stub/stub";

function antwortObjekt() {
  const res = {
    status_: 0,
    body: null,
    setHeader() {},
    status(code) { res.status_ = code; return res; },
    json(body) { res.body = body; return res; },
  };
  return res;
}

const api = await ladeApi();

/* Der allererste Aufruf laesst `ensureReady()` laufen. Diese
   Anweisungen sieht der erste Test an; danach ist es abgehakt. */
const startAnweisungen = await (async () => {
  const res = antwortObjekt();
  await api.items({ query: {}, body: {}, method: "GET" }, res);
  return [...api.stub.anweisungen];
})();

async function ruf(req) {
  api.stub.anweisungen.length = 0;
  const res = antwortObjekt();
  await api.items({ query: {}, body: {}, ...req }, res);
  return { res, anweisungen: [...api.stub.anweisungen] };
}

/** Alle Anweisungen, die schreiben. */
function schreibend(anweisungen) {
  return anweisungen.filter((a) => /\b(INSERT|UPDATE)\b/i.test(a.text));
}

/** Die Spalten im SET einer UPDATE-Anweisung. */
function gesetzteSpalten(text) {
  return text
    .replace(/^[\s\S]*?\bSET\b/i, "")
    .replace(/\bWHERE\b[\s\S]*$/i, "")
    .split("\n")
    .map((zeile) => zeile.replace(/--.*$/, "").trim())
    .join(" ")
    .split(",")
    .map((teil) => teil.split("=")[0].trim())
    .filter((name) => /^[a-z_]+$/.test(name));
}

/** Die Spaltenliste eines INSERT, in ihrer Reihenfolge. */
function spaltenListe(text) {
  return text
    .replace(/^[\s\S]*?INSERT INTO media_items\s*\(/i, "")
    .replace(/\)[\s\S]*$/, "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

/** Der Wert, der an Platzhalter $n haengt. */
function wertVon(a, platzhalter) {
  return a.werte[Number(platzhalter.slice(1)) - 1];
}

/** Ein vollstaendiger, bewerteter Eintrag. */
const BEWERTET = {
  category: "movie",
  title: "Ein Film",
  values: { story: 8, charaktere: 7, unterhaltung: 9, emotion: 6, inszenierung: 7, schauspiel: 8, sound: 9 },
  personal: 7.5,
};

/* ---------------------------------------------------------------- *
 * 1. Der Start legt die Spalten additiv an
 * ---------------------------------------------------------------- */

test("Der Start ergaenzt am_schauen, staffel_nr und folge_nr", () => {
  const text = startAnweisungen.map((a) => a.text).join("\n");
  assert.match(text, /ADD COLUMN IF NOT EXISTS am_schauen BOOLEAN NOT NULL DEFAULT FALSE/i);
  assert.match(text, /ADD COLUMN IF NOT EXISTS staffel_nr INTEGER/i);
  assert.match(text, /ADD COLUMN IF NOT EXISTS folge_nr INTEGER/i);
});

test("Die neue Migration ist rein additiv", () => {
  /* Dass der Start ueberhaupt keine Zeile schreibt, prueft
     frische-datenbank.test.mjs. Hier geht es nur um die drei neuen
     Spalten: Sie werden ergaenzt und sonst nichts — kein Backfill,
     keine Umbenennung, keine Typaenderung, und keine bestehende
     Spalte wird angefasst. */
  const meine = startAnweisungen.filter((a) => /am_schauen|staffel_nr|folge_nr/i.test(a.text));
  assert.equal(meine.length, 3, "erwartet werden genau drei Anweisungen, nicht " + meine.length);

  for (const a of meine) {
    assert.match(a.text, /^\s*ALTER TABLE media_items\s+ADD COLUMN IF NOT EXISTS/i);
    assert.ok(
      !/\b(INSERT|UPDATE|TRUNCATE|RENAME|DROP)\b/i.test(a.text),
      "Die Migration fasst Daten an: " + a.text.trim()
    );
  }

  // Und keine bestehende Spalte wird umbenannt oder umgetypt.
  for (const a of startAnweisungen) {
    assert.ok(!/\bRENAME\b/i.test(a.text), "Es wird etwas umbenannt: " + a.text.trim().slice(0, 90));
  }
});

/* ---------------------------------------------------------------- *
 * 2. Ein Backup ohne die neuen Felder
 * ---------------------------------------------------------------- */

test("Ein Backup ohne die neuen Felder wird mit den Standardwerten angelegt", async () => {
  const { res, anweisungen } = await ruf({ method: "POST", body: { ...BEWERTET } });
  assert.equal(res.status_, 201, "Das Anlegen ist fehlgeschlagen: " + JSON.stringify(res.body));

  const insert = schreibend(anweisungen).find((a) => /INSERT INTO media_items/i.test(a.text));
  assert.ok(insert, "Es wurde kein Eintrag angelegt");

  // Die drei Spalten stehen in der Spaltenliste ...
  const spalten = spaltenListe(insert.text);
  for (const name of ["am_schauen", "staffel_nr", "folge_nr"]) {
    assert.ok(spalten.includes(name), name + " fehlt in der Spaltenliste");
  }

  /* Die Werte stehen positionsgenau zur Spaltenliste: jede Spalte
     hat in VALUES genau einen Platzhalter, und der Treiber legt sie
     in derselben Reihenfolge ab. */
  assert.equal(spalten.length, insert.werte.length, "Spalten und Werte passen nicht zusammen");
  assert.equal(insert.werte[spalten.indexOf("am_schauen")], false, "am_schauen ist nicht false");
  assert.equal(insert.werte[spalten.indexOf("staffel_nr")], null, "staffel_nr ist nicht NULL");
  assert.equal(insert.werte[spalten.indexOf("folge_nr")], null, "folge_nr ist nicht NULL");

  // Und die Antwort an die App sagt dasselbe.
  assert.equal(res.body.amSchauen, false);
  assert.equal(res.body.staffelNr, null);
  assert.equal(res.body.folgeNr, null);
});

test("Ein Backup mit den neuen Feldern bringt sie mit", async () => {
  const { res, anweisungen } = await ruf({
    method: "POST",
    body: { ...BEWERTET, amSchauen: true, staffelNr: 2, folgeNr: 4 },
  });
  assert.equal(res.status_, 201, JSON.stringify(res.body));

  const insert = schreibend(anweisungen).find((a) => /INSERT INTO media_items/i.test(a.text));
  const spalten = spaltenListe(insert.text);
  assert.equal(insert.werte[spalten.indexOf("am_schauen")], true);
  assert.equal(insert.werte[spalten.indexOf("staffel_nr")], 2);
  assert.equal(insert.werte[spalten.indexOf("folge_nr")], 4);
});

test("Unsinn in den neuen Feldern wird abgewiesen statt gespeichert", async () => {
  const { res } = await ruf({
    method: "POST",
    body: { ...BEWERTET, staffelNr: -3 },
  });
  assert.equal(res.status_, 400);
  assert.match(res.body.error, /Staffel/);
  // Genau einmal — nicht doppelt aus zwei Pruefpfaden.
  assert.equal(res.body.error.match(/Staffel/g).length, 1);
});

test("Auch bei einem vorgemerkten Eintrag wird geprueft — und nur einmal", async () => {
  const { res } = await ruf({
    method: "POST",
    body: { category: "movie", title: "Vorgemerkt", watchlist: true, folgeNr: -1 },
  });
  assert.equal(res.status_, 400);
  assert.match(res.body.error, /Folge/);
  assert.equal(res.body.error.match(/Folge/g).length, 1);
});

/* ---------------------------------------------------------------- *
 * 3. Ohne die Felder bleibt der gespeicherte Stand stehen
 * ---------------------------------------------------------------- */

test("Ein Speichervorgang ohne die drei Felder laesst sie unveraendert", async () => {
  /* Genau das, was das Bewertungsformular und das automatische
     Nachladen eines Posters schicken: die eigenen Felder, sonst
     nichts. */
  const { res, anweisungen } = await ruf({
    method: "PUT",
    query: { id: "abc" },
    body: { ...BEWERTET, id: "abc" },
  });
  assert.equal(res.status_, 200, JSON.stringify(res.body));

  const update = schreibend(anweisungen).find((a) => /UPDATE media_items/i.test(a.text));
  assert.ok(update, "Es wurde nichts aktualisiert");

  /* Die drei Spalten stehen im SET — aber hinter einem CASE, dessen
     Bedingung false ist. Damit schreibt Postgres den vorhandenen Wert
     zurueck. */
  for (const spalte of ["am_schauen", "staffel_nr", "folge_nr"]) {
    const treffer = update.text.match(
      new RegExp(spalte + "\\s*=\\s*CASE WHEN (\\$\\d+)::boolean THEN [^E]*ELSE " + spalte + " END")
    );
    assert.ok(treffer, "Die Spalte " + spalte + " steht nicht in der erwarteten CASE-Form");
    assert.equal(
      wertVon(update, treffer[1]),
      false,
      "Die Spalte " + spalte + " wuerde ueberschrieben, obwohl sie nicht mitgeschickt wurde"
    );
  }
});

test("Eine Bewertung entfernt das Kennzeichen nicht", async () => {
  /* Der Fall aus der Aufgabe: Staffel 1 wird bewertet, waehrend
     Staffel 2 noch laeuft. Die Bewertung schickt das Kennzeichen nicht
     mit — es darf trotzdem nicht verschwinden. */
  const { anweisungen } = await ruf({
    method: "PUT",
    query: { id: "serie" },
    body: {
      category: "series",
      title: "Eine Serie",
      values: BEWERTET.values,
      personal: 8,
      seasons: [{ values: BEWERTET.values, personal: 8 }],
    },
  });
  const update = schreibend(anweisungen).find((a) => /UPDATE media_items/i.test(a.text));
  const treffer = update.text.match(/am_schauen\s*=\s*CASE WHEN (\$\d+)::boolean/);
  assert.ok(treffer);
  assert.equal(wertVon(update, treffer[1]), false, "Die Bewertung wuerde das Kennzeichen anfassen");
});

/* ---------------------------------------------------------------- *
 * 4. Der Schalter selbst
 * ---------------------------------------------------------------- */

test("Das Einschalten schreibt die drei Spalten", async () => {
  const { anweisungen } = await ruf({
    method: "PUT",
    query: { id: "abc" },
    body: { ...BEWERTET, id: "abc", amSchauen: true, staffelNr: 1, folgeNr: 0 },
  });
  const update = schreibend(anweisungen).find((a) => /UPDATE media_items/i.test(a.text));

  for (const spalte of ["am_schauen", "staffel_nr", "folge_nr"]) {
    const treffer = update.text.match(new RegExp(spalte + "\\s*=\\s*CASE WHEN (\\$\\d+)::boolean"));
    assert.equal(wertVon(update, treffer[1]), true, spalte + " wird nicht geschrieben");
  }

  const kennzeichen = update.text.match(/am_schauen\s*=\s*CASE WHEN \$\d+::boolean THEN (\$\d+)/);
  assert.equal(wertVon(update, kennzeichen[1]), true);
  const folge = update.text.match(/folge_nr\s*=\s*CASE WHEN \$\d+::boolean THEN (\$\d+)/);
  assert.equal(wertVon(update, folge[1]), 0, "Folge 0 muss als echter Wert ankommen, nicht als NULL");
});

test("Das Ausschalten laesst den Stand stehen", async () => {
  const { anweisungen } = await ruf({
    method: "PUT",
    query: { id: "abc" },
    body: { ...BEWERTET, id: "abc", amSchauen: false, staffelNr: 3, folgeNr: 7 },
  });
  const update = schreibend(anweisungen).find((a) => /UPDATE media_items/i.test(a.text));

  const kennzeichen = update.text.match(/am_schauen\s*=\s*CASE WHEN \$\d+::boolean THEN (\$\d+)/);
  assert.equal(wertVon(update, kennzeichen[1]), false);
  const staffel = update.text.match(/staffel_nr\s*=\s*CASE WHEN \$\d+::boolean THEN (\$\d+)/);
  assert.equal(wertVon(update, staffel[1]), 3, "Die Staffel wurde beim Ausschalten geleert");
  const folge = update.text.match(/folge_nr\s*=\s*CASE WHEN \$\d+::boolean THEN (\$\d+)/);
  assert.equal(wertVon(update, folge[1]), 7, "Die Folge wurde beim Ausschalten geleert");
});

test("Auch ein vorgemerkter Eintrag laesst sich auf „am Schauen“ setzen", async () => {
  const { res, anweisungen } = await ruf({
    method: "PUT",
    query: { id: "vorgemerkt" },
    body: {
      category: "series",
      title: "Vorgemerkte Serie",
      watchlist: true,
      seasons: [],
      amSchauen: true,
      staffelNr: 1,
      folgeNr: 0,
    },
  });
  assert.equal(res.status_, 200, JSON.stringify(res.body));

  const update = schreibend(anweisungen).find((a) => /UPDATE media_items/i.test(a.text));
  const kennzeichen = update.text.match(/am_schauen\s*=\s*CASE WHEN \$\d+::boolean THEN (\$\d+)/);
  assert.equal(wertVon(update, kennzeichen[1]), true);

  /* Das Watchlist-Merkmal bleibt dabei gesetzt — nur die Anzeige
     blendet den Eintrag dort aus. */
  const merkliste = update.text.match(/watchlist\s*=\s*(\$\d+)/);
  assert.equal(wertVon(update, merkliste[1]), true, "Die Vormerkung wurde mit entfernt");
});

test("Sonst fasst der Schalter nichts an, was zur Bewertung gehoert", async () => {
  const { anweisungen } = await ruf({
    method: "PUT",
    query: { id: "abc" },
    body: { ...BEWERTET, id: "abc", amSchauen: true, staffelNr: 1, folgeNr: 0 },
  });
  const update = schreibend(anweisungen).find((a) => /UPDATE media_items/i.test(a.text));
  const spalten = gesetzteSpalten(update.text);

  /* Elo, Duellzahl und Bewertungsdatum stehen zwar im SET, sind dort
     aber ausdruecklich gegen Ueberschreiben gesichert (COALESCE bzw.
     CASE). Was hier zaehlt: Es sind keine Spalten dazugekommen, die
     der Schalter nicht ohnehin schon mitschrieb. */
  for (const name of ["am_schauen", "staffel_nr", "folge_nr"]) {
    assert.ok(spalten.includes(name), name + " fehlt im SET");
  }
  assert.match(update.text, /elo\s*=\s*COALESCE/i);
  assert.match(update.text, /duels\s*=\s*COALESCE/i);
  assert.match(update.text, /rated_at\s*=\s*CASE/i);
});

/* ---------------------------------------------------------------- *
 * Was rowToItem aus einer Zeile macht
 * ---------------------------------------------------------------- */

test("Eine Zeile ohne die neuen Spalten liest sich als „nicht am Schauen, kein Stand“", () => {
  const alt = api.db.rowToItem({
    id: "a", category: "movie", title: "Alt",
    story: 8, charaktere: 8, unterhaltung: 8, emotion: 8, inszenierung: 8, schauspiel: 8, sound: 8,
    personal: 7, watchlist: false, created_at: 1, updated_at: 1,
  });
  assert.equal(alt.amSchauen, false);
  assert.equal(alt.staffelNr, null);
  assert.equal(alt.folgeNr, null);
});

test("Folge 0 bleibt beim Lesen eine 0 und wird nicht zu null", () => {
  const zeile = api.db.rowToItem({
    id: "a", category: "movie", title: "Neu",
    story: 8, charaktere: 8, unterhaltung: 8, emotion: 8, inszenierung: 8, schauspiel: 8, sound: 8,
    personal: 7, watchlist: false, created_at: 1, updated_at: 1,
    am_schauen: true, staffel_nr: 1, folge_nr: 0,
  });
  assert.equal(zeile.amSchauen, true);
  assert.equal(zeile.staffelNr, 1);
  assert.equal(zeile.folgeNr, 0);
});
