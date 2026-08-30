/**
 * Tests fuer das, was das Verrechnen des Duell-Zuschlags in die
 * Datenbank schreibt.
 *
 * Es gibt hier kein Postgres. Wie in duell-endpunkte.test.mjs wird
 * der Treiber ersetzt: api/items.js laeuft im echten Code-Pfad, nur
 * ohne Server am anderen Ende. Der Stub schreibt Anweisungstext und
 * eingesetzte Werte mit — genau darum geht es: welche Spalten mit
 * welchen Zahlen beschrieben werden.
 *
 * Geprueft wird die Anfrage, die zuschlagVerrechnen in src/App.jsx
 * stellt: eine ganz normale Bewertungsaenderung, ergaenzt um
 * elo = ELO_START.
 *
 * Die Zusagen:
 *
 *   1. Danach steht `elo` auf 1000 — der Zuschlag ist damit 0.
 *   2. `duels` und `siege` gehen unveraendert durch; die
 *      Duellhistorie geht nicht verloren.
 *   3. Die neuen Bewertungswerte landen in ihren Spalten.
 *   4. Eine Bewertungsaenderung OHNE Verrechnen laesst `elo` stehen —
 *      der Regressionsfall.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/* Der Stub-Treiber — dieselbe Bauart wie in duell-endpunkte.test.mjs. */
const STUB = `
export const anweisungen = [];

function fuegeZusammen(strings, werte) {
  let text = strings[0];
  for (let i = 0; i < werte.length; i++) text += "$" + (i + 1) + strings[i + 1];
  return text;
}

function zeile(id) {
  return {
    id: id || "x", category: "movie", title: "Titel", poster: "", backdrop: "",
    story: 8, charaktere: 8, unterhaltung: 8, emotion: 8,
    inszenierung: 8, schauspiel: 8, sound: 8,
    personal: 7, watchlist: false, watch_count: 1,
    elo: 1000, duels: 20, siege: 12, created_at: 1, updated_at: 1, rated_at: 1,
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
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-verrechnen-api-"));
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

  return {
    items: (await import(pathToFileURL(datei).href)).default,
    stub: await import(pathToFileURL(stubDatei).href),
  };
}

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://stub/stub";

function antwortObjekt() {
  const res = {
    status_: 0, body: null,
    setHeader() {},
    status(code) { res.status_ = code; return res; },
    json(body) { res.body = body; return res; },
  };
  return res;
}

const api = await ladeApi();

async function ruf(req) {
  api.stub.anweisungen.length = 0;
  const res = antwortObjekt();
  await api.items({ query: {}, body: {}, ...req }, res);
  return { res, anweisungen: [...api.stub.anweisungen] };
}

// Einmal warmlaufen lassen: ensureReady() legt die Struktur an.
await ruf({ method: "GET" });

/* Der Wert, der fuer eine Spalte eingesetzt wurde. Ueber die
   Platzhalter-Nummer, nicht ueber ein Zerlegen des Textes — die
   COALESCE-Ausdruecke enthalten selbst Kommas. */
function eingesetzt(anweisung, spalte) {
  const treffer = anweisung.text.match(new RegExp("\\b" + spalte + "\\s*=[^,]*?\\$(\\d+)"));
  if (!treffer) return undefined;
  return anweisung.werte[Number(treffer[1]) - 1];
}

function updateAufItems(anweisungen) {
  return anweisungen.find((a) => /UPDATE\s+media_items/i.test(a.text));
}

/* Der Eintrag, wie er vor dem Verrechnen dasteht: 20 Duelle, 12
   Siege, eine erspielte Elo deutlich ueber dem Startwert. */
const VORHER = {
  id: "film-1",
  category: "movie",
  title: "Titel",
  poster: "",
  values: { story: 8, charaktere: 8, unterhaltung: 8, emotion: 8, inszenierung: 8, schauspiel: 8, sound: 8 },
  personal: 7,
  seasons: [],
  watchCount: 1,
  elo: 1187.5,
  duels: 20,
  siege: 12,
  createdAt: 1600000000000,
};

test("Nach dem Verrechnen steht elo auf 1000 und duels und siege bleiben", async () => {
  /* Genau die Anfrage, die zuschlagVerrechnen stellt: der bisherige
     Eintrag, die neuen Bewertungsfelder, elo auf dem Startwert. */
  const { res, anweisungen } = await ruf({
    method: "PUT",
    query: { id: VORHER.id },
    body: { ...VORHER, personal: 7.6, elo: 1000 },
  });
  assert.equal(res.status_, 200, "Antwort: " + JSON.stringify(res.body));

  const update = updateAufItems(anweisungen);
  assert.ok(update, "kein UPDATE auf media_items");

  assert.equal(eingesetzt(update, "elo"), 1000, "elo wird nicht auf den Startwert gesetzt");
  assert.equal(eingesetzt(update, "duels"), 20, "duels wurde veraendert");
  assert.equal(eingesetzt(update, "siege"), 12, "siege wurde veraendert");
  assert.equal(eingesetzt(update, "personal"), 7.6, "das neue Bauchgefuehl fehlt");
});

test("Der Weg in die Kriterien schreibt alle sieben Kriterienspalten", async () => {
  const neueWerte = {
    story: 8.2, charaktere: 8.2, unterhaltung: 8.2, emotion: 8.2,
    inszenierung: 8.2, schauspiel: 8.2, sound: 8.2,
  };
  const { res, anweisungen } = await ruf({
    method: "PUT",
    query: { id: VORHER.id },
    body: { ...VORHER, values: neueWerte, elo: 1000 },
  });
  assert.equal(res.status_, 200, "Antwort: " + JSON.stringify(res.body));

  const update = updateAufItems(anweisungen);
  for (const spalte of Object.keys(neueWerte)) {
    assert.equal(eingesetzt(update, spalte), 8.2, spalte + " wurde nicht geschrieben");
  }
  assert.equal(eingesetzt(update, "personal"), 7, "das Bauchgefuehl darf unberuehrt bleiben");
  assert.equal(eingesetzt(update, "elo"), 1000);
  assert.equal(eingesetzt(update, "duels"), 20);
  assert.equal(eingesetzt(update, "siege"), 12);
});

test("Eine Bewertungsaenderung OHNE Verrechnen laesst die Elo stehen", async () => {
  /* Der Regressionsfall: das Bewertungsformular schickt kein `elo`
     mit, COALESCE laesst den gespeicherten Wert damit stehen. */
  const { res, anweisungen } = await ruf({
    method: "PUT",
    query: { id: VORHER.id },
    body: { ...VORHER, elo: undefined, duels: undefined, siege: undefined, personal: 9 },
  });
  assert.equal(res.status_, 200, "Antwort: " + JSON.stringify(res.body));

  const update = updateAufItems(anweisungen);
  assert.equal(eingesetzt(update, "elo"), null, "ohne elo in der Anfrage darf nichts gesetzt werden");
  assert.equal(eingesetzt(update, "duels"), null);
  assert.equal(eingesetzt(update, "siege"), null);
  assert.match(update.text, /elo\s*=\s*COALESCE\(/i, "die Elo muss ueber COALESCE stehen bleiben");
});
