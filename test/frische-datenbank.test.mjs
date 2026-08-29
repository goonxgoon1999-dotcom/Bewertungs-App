/**
 * Prueft, was `ensureReady()` in api/_db.js tatsaechlich an die
 * Datenbank schickt.
 *
 * Anlass: Eine frisch angelegte, leere Datenbank war nicht leer. Beim
 * ersten Aufruf trug der Start rund 150 Filme aus der Sammlung des
 * urspruenglichen Autors ein — in einem Fork ein Fehlstart, und in
 * den uebrigen Kategorien blieb es trotzdem leer.
 *
 * Es gibt hier kein Postgres. Statt einer echten Datenbank wird der
 * Treiber ersetzt: api/_db.js wird mit einem Stub statt
 * `@neondatabase/serverless` geladen, der jede Anweisung mitschreibt
 * und leere Ergebnisse zurueckgibt. Geprueft wird also der echte
 * Code-Pfad — nur ohne Server am anderen Ende.
 *
 * Zwei Aussagen:
 *
 *   1. Der Start schreibt keine einzige Zeile. Eine frische
 *      Installation bleibt in allen Kategorien leer.
 *   2. Der Start fasst auch sonst keine vorhandenen Daten an: kein
 *      INSERT, UPDATE, DELETE, TRUNCATE, kein DROP TABLE und kein
 *      DROP COLUMN. Alles, was laeuft, ist Struktur.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Der Stub-Treiber: schreibt mit, antwortet leer. */
const STUB = `
export const anweisungen = [];

function fuegeZusammen(strings, werte) {
  let text = strings[0];
  for (let i = 0; i < werte.length; i++) text += "$" + (i + 1) + strings[i + 1];
  return text;
}

export function neon() {
  const sql = (strings, ...werte) => {
    const text = fuegeZusammen(strings, werte);
    anweisungen.push(text);
    /* Ein COUNT muss eine Zahl liefern, sonst bricht der Aufrufer.
       0 ist der interessante Fall: eine wirklich leere Datenbank. */
    if (/count\\(\\*\\)/i.test(text)) return Promise.resolve([{ n: 0, count: 0 }]);
    return Promise.resolve([]);
  };
  sql.transaction = (queries) => Promise.resolve(queries.map(() => []));
  return sql;
}
`;

async function ladeDbMitStub() {
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-db-"));
  const stubDatei = join(verzeichnis, "stub-treiber.mjs");
  await writeFile(stubDatei, STUB);

  const quelle = await readFile(new URL("../api/_db.js", import.meta.url), "utf8");
  const mitStub = quelle.replace(
    /from\s+"@neondatabase\/serverless"/,
    'from "' + pathToFileURL(stubDatei).href + '"'
  );
  assert.notEqual(mitStub, quelle, "Der Treiber-Import wurde nicht ersetzt");

  const dbDatei = join(verzeichnis, "db.mjs");
  await writeFile(dbDatei, mitStub);

  const db = await import(pathToFileURL(dbDatei).href);
  const stub = await import(pathToFileURL(stubDatei).href);
  return { db, stub };
}

/* Ohne Verbindungszeichenkette wirft `db()` sofort — der Stub braucht
   keine echte, aber die Pruefung in api/_db.js schon. Sie wird beim
   Laden des Moduls gelesen, muss also vorher stehen. */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://stub/stub";

const { db, stub } = await ladeDbMitStub();

await db.ensureReady();

const anweisungen = stub.anweisungen;

test("Der Start schickt ueberhaupt Anweisungen", () => {
  assert.ok(anweisungen.length > 0, "ensureReady() hat nichts ausgefuehrt");
});

test("Eine frische Datenbank bekommt keine einzige Zeile eingetragen", () => {
  const eintraege = anweisungen.filter((a) => /\bINSERT\s+INTO\b/i.test(a));
  assert.deepEqual(
    eintraege,
    [],
    "Der Start traegt Daten ein:\n" + eintraege.join("\n---\n")
  );
});

test("In media_items landet beim Start nichts", () => {
  const treffer = anweisungen.filter(
    (a) => /\bINSERT\b/i.test(a) && /media_items/i.test(a)
  );
  assert.deepEqual(treffer, [], "media_items wird beim Start befuellt");
});

test("Kein Filmtitel steht mehr im Start-Pfad", () => {
  const alles = anweisungen.join("\n");
  for (const titel of ["The Dark Knight", "Interstellar", "legacy_movie"]) {
    assert.ok(!alles.includes(titel), "Im Start-Pfad steht noch: " + titel);
  }
});

test("Der Start legt keine Zeile an und entfernt keine", () => {
  const verboten = [
    /\bINSERT\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bTRUNCATE\b/i,
    /\bDROP\s+TABLE\b/i,
  ];
  for (const anweisung of anweisungen) {
    for (const muster of verboten) {
      assert.ok(
        !muster.test(anweisung),
        "Der Start veraendert den Bestand (" + muster + "):\n" + anweisung
      );
    }
  }
});

test("Die einzige schreibende Anweisung fuellt nur Leerstellen", () => {
  /* Bestand, nicht neu: `ensureBewertetAm()` traegt das
     Bewertungsdatum bei Zeilen nach, die noch keines haben. Die
     Anweisung ist durch `IS NULL` abgesichert und ueberschreibt
     deshalb keinen vorhandenen Wert. Der Test haelt diese Zusage
     fest — kaeme irgendwann ein UPDATE ohne solche Absicherung
     dazu, faellt es hier auf. */
  const schreibend = anweisungen.filter((a) => /\bUPDATE\s+\w/i.test(a));
  assert.equal(schreibend.length, 1, "Es schreibt mehr als erwartet:\n" + schreibend.join("\n---\n"));
  assert.match(schreibend[0], /UPDATE\s+media_items/i);
  assert.match(schreibend[0], /SET\s+rated_at\s*=\s*created_at/i);
  assert.match(schreibend[0], /WHERE\s+rated_at\s+IS\s+NULL/i);
});

test("An den Bewertungen selbst wird nichts umgebaut", () => {
  /* Auf media_items laufen ausschliesslich CREATE/ALTER/INDEX. Ein
     `DROP COLUMN` gaebe es dort nicht — anders als bei `seasons`, wo
     eine aeltere Migration (migrateSeasonIds in api/_db.js) die
     Schluesselspalte ersetzt, solange dort noch der alte
     TEXT-Schluessel steht. Das ist Bestand und bleibt unangetastet. */
  const aufItems = anweisungen.filter((a) => /\bmedia_items\b/i.test(a));
  assert.ok(aufItems.length > 0, "media_items kommt gar nicht vor");
  for (const anweisung of aufItems) {
    assert.ok(!/\bDROP\s+COLUMN\b/i.test(anweisung), "DROP COLUMN auf media_items:\n" + anweisung);
    assert.ok(!/\bDROP\s+TABLE\b/i.test(anweisung), "DROP TABLE auf media_items:\n" + anweisung);
  }
});

test("Die Duell-Spalten kommen additiv dazu und starten neutral", () => {
  /* Bestandsdaten werden nicht zurueckgerechnet: `elo` bekommt ueber
     den Spalten-DEFAULT den Startwert 1000 (dort ist der Zuschlag
     exakt 0) und `duels` die 0. Beides ist ADD COLUMN IF NOT EXISTS —
     keine bestehende Spalte wird umbenannt, geleert oder umgetypt. */
  const elo = anweisungen.filter((a) => /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+elo\b/i.test(a));
  assert.equal(elo.length, 1, "elo wird nicht genau einmal angelegt");
  assert.match(elo[0], /ALTER\s+TABLE\s+media_items/i);
  assert.match(elo[0], /DEFAULT\s+1000\b/i);

  const duels = anweisungen.filter((a) => /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+duels\b/i.test(a));
  assert.equal(duels.length, 1, "duels wird nicht genau einmal angelegt");
  assert.match(duels[0], /ALTER\s+TABLE\s+media_items/i);
  assert.match(duels[0], /DEFAULT\s+0\b/i);

  // Der Startwert der Spalte muss zum Startwert im Code passen.
  assert.equal(db.ELO_START, 1000);

  /* Und nichts davon fasst das Bauchgefuehl an: die einzige
     schreibende Anweisung des Starts bleibt die zum Bewertungsdatum
     (siehe oben). */
  const aufPersonal = anweisungen.filter(
    (a) => /\bUPDATE\b/i.test(a) && /\bpersonal\b/i.test(a)
  );
  assert.deepEqual(aufPersonal, [], "Der Start schreibt am Bauchgefuehl:\n" + aufPersonal.join("\n"));
});

test("Es gibt keine Seed-Datei mehr, die jemand aus Versehen einbindet", async () => {
  const quelle = await readFile(new URL("../api/_db.js", import.meta.url), "utf8");
  assert.ok(
    !/seed-data/.test(quelle),
    "api/_db.js bindet weiterhin eine Seed-Datei ein"
  );

  const { readdir } = await import("node:fs/promises");
  const dateien = await readdir(new URL("../api/", import.meta.url));
  assert.ok(
    !dateien.includes("seed-data.js"),
    "api/seed-data.js liegt wieder im Projekt"
  );
});
