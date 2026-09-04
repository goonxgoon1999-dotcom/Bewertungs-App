/**
 * Tests fuer das Erstsichtungsdatum.
 *
 * Zwei Ebenen:
 *
 *   1. Die Logik und die Karte in src/App.jsx — uebersetzt wie in
 *      app-logik.test.mjs, gerendert wie in watchlist-zeile.test.mjs.
 *   2. Was /api/items tatsaechlich an die Datenbank schickt — mit
 *      demselben Treiber-Stub wie am-schauen-endpunkte.test.mjs.
 *
 * Die Zusagen:
 *
 *   1. Ohne eigenes Datum gilt das Bewertungsdatum (`ratedAt`) — nicht
 *      `createdAt`, das auch beim Vormerken gesetzt wird.
 *   2. Ein eigenes Datum verdraengt den Rueckfall.
 *   3. Die Karte zeigt beide Zustaende unterschiedlich: eigenes Datum
 *      in normaler Textfarbe ohne Zusatz, Rueckfall gedaempft mit
 *      "(Bewertungsdatum)".
 *   4. Hin und zurueck durch die Datumsfelder aendert das Datum nicht.
 *   5. Der Start legt die Spalte additiv an und fasst keine Zeile an —
 *      es gibt insbesondere KEINEN Backfill.
 *   6. Ein Speichervorgang ohne das Feld laesst den gespeicherten Wert
 *      stehen; `null` leert ihn.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* ---------------------------------------------------------------- *
 * 1. Logik und Karte aus src/App.jsx
 * ---------------------------------------------------------------- */

const GEPRUEFT = [
  "erstsichtung",
  "datumKurz",
  "datumFeldWert",
  "feldWertZuZeit",
  "erstsichtungLabel",
  "ErstsichtungKarte",
  "ErstsichtungEditor",
];

async function ladeApp() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-erst-"));
  const datei = join(verzeichnis, "erstsichtung.mjs");

  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeApp();

/** Ein Zeitstempel auf 12 Uhr Ortszeit — wie ihn das Feld erzeugt. */
function am(jahr, monat, tag) {
  return new Date(jahr, monat - 1, tag, 12, 0, 0, 0).getTime();
}

test("Ohne eigenes Datum gilt das Bewertungsdatum", () => {
  const ergebnis = app.erstsichtung({
    firstWatchedAt: null,
    ratedAt: am(2026, 3, 1),
    createdAt: am(2024, 1, 1),
  });
  assert.equal(ergebnis.zeit, am(2026, 3, 1));
  assert.equal(ergebnis.eigen, false);
});

test("Das Anlegedatum ist ausdruecklich NICHT der Rueckfallwert", () => {
  /* Ein Titel, der zwei Jahre auf der Watchlist lag: createdAt liegt
     2024, bewertet wurde 2026. Wuerde createdAt einspringen, stuende
     hier eine Erstsichtung, die es nie gab. */
  const ergebnis = app.erstsichtung({ firstWatchedAt: null, ratedAt: null, createdAt: am(2024, 1, 1) });
  assert.equal(ergebnis.zeit, null, "createdAt darf nicht einspringen");
  assert.equal(ergebnis.eigen, false);
});

test("Ein eigenes Datum verdraengt den Rueckfall", () => {
  const ergebnis = app.erstsichtung({
    firstWatchedAt: am(2011, 7, 20),
    ratedAt: am(2026, 3, 1),
    createdAt: am(2026, 3, 1),
  });
  assert.equal(ergebnis.zeit, am(2011, 7, 20));
  assert.equal(ergebnis.eigen, true);
});

test("Ohne jede Angabe bleibt das Datum leer", () => {
  const ergebnis = app.erstsichtung({ firstWatchedAt: null, ratedAt: null });
  assert.equal(ergebnis.zeit, null);
  assert.equal(ergebnis.eigen, false);
});

test("Datum und Feldwert gehen verlustfrei hin und zurueck", () => {
  const zeit = am(2011, 7, 20);
  assert.equal(app.datumFeldWert(zeit), "2011-07-20");
  assert.equal(app.feldWertZuZeit("2011-07-20"), zeit);
  assert.equal(app.datumKurz(zeit), "20.07.2011");
});

test("Ein unmoegliches Datum ergibt keinen Zeitstempel", () => {
  // JavaScript rollt "31. Februar" still auf den 2. Maerz weiter.
  assert.equal(app.feldWertZuZeit("2024-02-31"), null);
  assert.equal(app.feldWertZuZeit(""), null);
  assert.equal(app.feldWertZuZeit("gestern"), null);
});

/* ---- Die Karte ---- */

function karte(props) {
  return renderToStaticMarkup(createElement(app.ErstsichtungKarte, { onBearbeiten() {}, ...props }));
}

test("Die Karte traegt die Ueberschrift in der Monospace-Beschriftung", () => {
  const html = karte({ zeit: am(2011, 7, 20), eigen: true });
  assert.match(html, /ERSTMALS GESCHAUT/);
  assert.match(html, /JetBrains Mono/);
});

test("Bei Spielen heisst die Karte ERSTMALS GESPIELT", () => {
  /* Direkt darunter stehen in der Detailansicht "Gespielt: 1x" und
     "Am Spielen" — "geschaut" widersprach dem. */
  const spiel = karte({ zeit: am(2011, 7, 20), eigen: true, category: "game" });
  assert.match(spiel, /ERSTMALS GESPIELT/);
  assert.ok(!spiel.includes("ERSTMALS GESCHAUT"));

  // In allen uebrigen Kategorien bleibt es beim bisherigen Wort.
  for (const category of ["movie", "series", "anime", "kids", "adultanim", "doku", "comedy"]) {
    const html = karte({ zeit: am(2011, 7, 20), eigen: true, category });
    assert.match(html, /ERSTMALS GESCHAUT/, category + " sollte weiter geschaut heissen");
  }

  // Und die Funktion dahinter sagt dasselbe.
  assert.equal(app.erstsichtungLabel("game"), "ERSTMALS GESPIELT");
  assert.equal(app.erstsichtungLabel("movie"), "ERSTMALS GESCHAUT");
  assert.equal(app.erstsichtungLabel(undefined), "ERSTMALS GESCHAUT");
});

test("Der Editor traegt dieselbe Beschriftung wie seine Karte", () => {
  const editor = (category) =>
    renderToStaticMarkup(
      createElement(app.ErstsichtungEditor, {
        zeit: am(2011, 7, 20), eigen: true, category, busy: false, onSave() {}, onCancel() {},
      })
    );
  assert.match(editor("game"), /ERSTMALS GESPIELT/);
  assert.match(editor("series"), /ERSTMALS GESCHAUT/);
});

test("Die Detailansicht reicht ihre Kategorie an beides durch", async () => {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(quelle, /<ErstsichtungKarte[\s\S]{0,200}category=\{category\}/);
  assert.match(quelle, /<ErstsichtungEditor[\s\S]{0,200}category=\{category\}/);
});

test("Mit eigenem Datum: normale Textfarbe, kein Zusatz", () => {
  const html = karte({ zeit: am(2011, 7, 20), eigen: true });
  assert.match(html, /20\.07\.2011/);
  assert.ok(!html.includes("(Bewertungsdatum)"), "der Zusatz gehoert hier nicht hin");
  assert.match(html, /color:#EDEAE3/, "das eigene Datum steht in normaler Textfarbe");
});

test("Ohne eigenes Datum: gedaempft und mit dem Zusatz", () => {
  const html = karte({ zeit: am(2026, 3, 1), eigen: false });
  assert.match(html, /01\.03\.2026/);
  assert.match(html, /\(Bewertungsdatum\)/);
  assert.match(html, /color:#77746c/, "der Rueckfall steht in der gedaempften Textfarbe");
});

test("Die Karte hat einen Stiftknopf wie Jahr, Regie und IMDb-Note", () => {
  const html = karte({ zeit: am(2011, 7, 20), eigen: true });
  assert.match(html, /aria-label="Erstsichtung bearbeiten"/);
  assert.match(html, /✎/);
});

test("Ganz ohne Datum laedt die Karte zum Eintragen ein", () => {
  const html = karte({ zeit: null, eigen: false });
  assert.match(html, /eintragen/);
  assert.ok(!html.includes("(Bewertungsdatum)"));
});

test("Der Editor bringt ein Datumsfeld und den Leeren-Knopf mit", () => {
  const html = renderToStaticMarkup(
    createElement(app.ErstsichtungEditor, {
      zeit: am(2011, 7, 20), eigen: true, busy: false, onSave() {}, onCancel() {},
    })
  );
  assert.match(html, /type="date"/);
  assert.match(html, /value="2011-07-20"/);
  assert.match(html, /Speichern/);
  assert.match(html, /Leeren/);
});

test("Ohne eigenes Datum ist Leeren abgeschaltet — es gibt nichts zu leeren", () => {
  const html = renderToStaticMarkup(
    createElement(app.ErstsichtungEditor, {
      zeit: am(2026, 3, 1), eigen: false, busy: false, onSave() {}, onCancel() {},
    })
  );
  assert.match(html, /Leeren<\/button>/);
  const leerenTeil = html.slice(html.indexOf("Leeren") - 400, html.indexOf("Leeren"));
  assert.match(leerenTeil, /disabled/);
});

test("Das automatische Nachladen schickt das Datum nicht mit", async () => {
  /* `job.entry` in der Nachlade-Schleife ist ein Abzug vom Beginn des
     Durchgangs. Wer waehrenddessen ein Datum eintraegt, saehe es sonst
     vom Nachtrag von Poster oder Genres wieder ueberschrieben. Ohne
     das Feld laesst der Server die Spalte stehen. */
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const start = quelle.indexOf("const saved = await api.update(job.entry.id, {");
  assert.ok(start > 0, "der Aufruf in der Nachlade-Schleife wurde nicht gefunden");
  const aufruf = quelle.slice(start, quelle.indexOf("});", start));
  assert.match(aufruf, /firstWatchedAt:\s*undefined/);
});

/* ---------------------------------------------------------------- *
 * 2. Was der Endpunkt schreibt
 * ---------------------------------------------------------------- */

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
    elo: 1000, duels: 0,
    am_schauen: false, staffel_nr: null, folge_nr: null,
    created_at: 1, updated_at: 1, rated_at: 1, first_watched_at: null,
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

async function ladeEndpunkt() {
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-erst-api-"));
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
  await writeFile(
    datei,
    quelle.replace(/from\s+"\.\/_db\.js"/, 'from "' + pathToFileURL(dbDatei).href + '"')
  );

  return {
    items: (await import(pathToFileURL(datei).href)).default,
    db: await import(pathToFileURL(dbDatei).href),
    stub: await import(pathToFileURL(stubDatei).href),
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

const BEWERTET = {
  category: "movie",
  title: "Ein Film",
  values: { story: 8, charaktere: 8, unterhaltung: 8, emotion: 8, inszenierung: 8, schauspiel: 8, sound: 8 },
  personal: 7,
  seasons: [],
};

const endpunkt = await ladeEndpunkt();

/** Findet den UPDATE auf media_items im Mitschrieb. */
function letzterUpdate(anweisungen) {
  return [...anweisungen].reverse().find((a) => /UPDATE\s+media_items/i.test(a.text));
}

test("Der Start legt die Spalte additiv an — ohne Backfill", async () => {
  endpunkt.stub.anweisungen.length = 0;
  await endpunkt.db.ensureReady();

  const spalte = endpunkt.stub.anweisungen.find((a) =>
    /ADD COLUMN IF NOT EXISTS first_watched_at/i.test(a.text)
  );
  assert.ok(spalte, "die Spalte wird nicht angelegt");
  assert.match(spalte.text, /ALTER TABLE media_items\s+ADD COLUMN IF NOT EXISTS first_watched_at BIGINT/i);

  /* Der entscheidende Teil: Es gibt KEIN UPDATE, das die neue Spalte
     befuellt. Bestehende Daten bleiben unangetastet. */
  const schreibend = endpunkt.stub.anweisungen.filter(
    (a) => /first_watched_at/i.test(a.text) && /\bUPDATE\b/i.test(a.text)
  );
  assert.deepEqual(schreibend, [], "die neue Spalte darf nicht befuellt werden");
});

test("Ein Speichervorgang ohne das Feld laesst den Wert stehen", async () => {
  endpunkt.stub.anweisungen.length = 0;
  const res = antwortObjekt();
  await endpunkt.items({ method: "PUT", query: { id: "x" }, body: { ...BEWERTET } }, res);
  assert.equal(res.status_, 200);

  const update = letzterUpdate(endpunkt.stub.anweisungen);
  assert.ok(update, "kein UPDATE abgesetzt");
  assert.match(update.text, /first_watched_at\s*=\s*CASE/i);

  /* Das Kennzeichen "mitgeschickt" steht als Wert im Aufruf. Ohne das
     Feld muss es false sein — dann bleibt die Spalte, wie sie ist. */
  const stelle = /WHEN\s+\$(\d+)::boolean THEN \$(\d+)::bigint\s+ELSE first_watched_at/i.exec(update.text);
  assert.ok(stelle, "die CASE-Bedingung ist nicht wie erwartet aufgebaut");
  assert.equal(update.werte[Number(stelle[1]) - 1], false, "ohne Feld darf nicht geschrieben werden");
});

test("Ein Datum wird geschrieben, null leert das Feld", async () => {
  const zeit = am(2011, 7, 20);

  endpunkt.stub.anweisungen.length = 0;
  let res = antwortObjekt();
  await endpunkt.items({ method: "PUT", query: { id: "x" }, body: { ...BEWERTET, firstWatchedAt: zeit } }, res);
  assert.equal(res.status_, 200);
  let update = letzterUpdate(endpunkt.stub.anweisungen);
  let stelle = /WHEN\s+\$(\d+)::boolean THEN \$(\d+)::bigint\s+ELSE first_watched_at/i.exec(update.text);
  assert.equal(update.werte[Number(stelle[1]) - 1], true);
  assert.equal(update.werte[Number(stelle[2]) - 1], zeit);

  endpunkt.stub.anweisungen.length = 0;
  res = antwortObjekt();
  await endpunkt.items({ method: "PUT", query: { id: "x" }, body: { ...BEWERTET, firstWatchedAt: null } }, res);
  assert.equal(res.status_, 200);
  update = letzterUpdate(endpunkt.stub.anweisungen);
  stelle = /WHEN\s+\$(\d+)::boolean THEN \$(\d+)::bigint\s+ELSE first_watched_at/i.exec(update.text);
  assert.equal(update.werte[Number(stelle[1]) - 1], true, "null ist ein mitgeschickter Wert");
  assert.equal(update.werte[Number(stelle[2]) - 1], null);
});

test("Das Bewertungsdatum bleibt davon unberuehrt", async () => {
  endpunkt.stub.anweisungen.length = 0;
  const res = antwortObjekt();
  await endpunkt.items(
    { method: "PUT", query: { id: "x" }, body: { ...BEWERTET, firstWatchedAt: am(2011, 7, 20) } },
    res
  );

  const update = letzterUpdate(endpunkt.stub.anweisungen);
  // rated_at wird weiter nur ueber COALESCE gesetzt: einmal und nie wieder.
  assert.match(update.text, /rated_at\s*=\s*CASE[\s\S]*COALESCE\(rated_at/i);
});

test("Ein unbrauchbares Datum wird abgelehnt", async () => {
  const res = antwortObjekt();
  await endpunkt.items(
    { method: "PUT", query: { id: "x" }, body: { ...BEWERTET, firstWatchedAt: "gestern" } },
    res
  );
  assert.equal(res.status_, 400);
  assert.match(res.body.error, /Erstsichtungsdatum/);
});

test("Ein Backup bringt das Datum beim Anlegen mit", async () => {
  endpunkt.stub.anweisungen.length = 0;
  const res = antwortObjekt();
  await endpunkt.items(
    { method: "POST", body: { ...BEWERTET, id: "neu", firstWatchedAt: am(2011, 7, 20) } },
    res
  );
  assert.equal(res.status_, 201);

  const insert = endpunkt.stub.anweisungen.find((a) => /INSERT INTO media_items/i.test(a.text));
  assert.match(insert.text, /rated_at,\s*first_watched_at\)/i);
  assert.ok(insert.werte.includes(am(2011, 7, 20)), "das Datum steht nicht in den Werten");
});
