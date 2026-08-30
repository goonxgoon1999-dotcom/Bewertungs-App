/**
 * Tests fuer die Endpunkte rund um die Duell-Wertung.
 *
 * Es gibt hier kein Postgres. Wie in frische-datenbank.test.mjs wird
 * der Treiber ersetzt: die Module unter api/ laufen im echten
 * Code-Pfad, nur ohne Server am anderen Ende. Anders als dort schreibt
 * dieser Stub auch die eingesetzten Werte mit — genau darum geht es:
 * welche Spalten mit welchen Zahlen beschrieben werden.
 *
 * Drei Zusagen:
 *
 *   1. Ein Duell schreibt ausschliesslich `elo` und `duels` — beim
 *      Gewinner zusaetzlich `siege`, beim Verlierer nicht.
 *      Bauchgefuehl und Kriterienwerte kommen in keiner Anweisung vor.
 *   2. Ein Backup ohne die neuen Felder laesst sich einspielen und
 *      bekommt dabei die Standardwerte (elo = 1000, duels = 0,
 *      siege = 0).
 *   3. Das Zuruecksetzen setzt `elo` auf den Startwert und laesst die
 *      Duell-Historie stehen.
 *   4. Jedes entschiedene Duell haelt seine Paarung fest — sortiert,
 *      und nur wenn wirklich gespielt wurde.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/* Der Stub-Treiber: schreibt Text UND Werte mit und antwortet mit dem,
   was der jeweilige Aufrufer zum Weiterlaufen braucht. */
const STUB = `
export const anweisungen = [];
export const zustand = { elo: new Map(), paare: [] };

function fuegeZusammen(strings, werte) {
  let text = strings[0];
  for (let i = 0; i < werte.length; i++) text += "$" + (i + 1) + strings[i + 1];
  return text;
}

/* Eine Zeile, wie media_items sie liefern wuerde. Nur die Felder, die
   rowToItem tatsaechlich liest. */
function zeile(id) {
  return {
    id: id || "x", category: "movie", title: "Titel", poster: "", backdrop: "",
    story: 8, charaktere: 8, unterhaltung: 8, emotion: 8,
    inszenierung: 8, schauspiel: 8, sound: 8,
    personal: 7, watchlist: false, watch_count: 1,
    elo: 1000, duels: 0, siege: 0, created_at: 1, updated_at: 1, rated_at: 1,
  };
}

function antwort(text, werte) {
  if (/count\\(\\*\\)/i.test(text)) return [{ n: 0, count: 0 }];

  // Die Elo-Abfrage des Duells: beide Beteiligten mit ihrem Stand.
  if (/SELECT\\s+id,\\s*elo\\s+FROM\\s+media_items/i.test(text)) {
    return werte.map((id) => ({ id, elo: zustand.elo.has(id) ? zustand.elo.get(id) : 1000 }));
  }
  // Die Existenzpruefung von PUT /api/items.
  if (/SELECT\\s+id\\s+FROM\\s+media_items/i.test(text)) return [{ id: werte[0] }];
  if (/FROM\\s+seasons/i.test(text)) return [];
  if (/duel_counts/i.test(text)) return [{ category: werte[0], duels: 5, updated_at: 1 }];
  // Die gespielten Paarungen einer Kategorie.
  if (/FROM\\s+duell_paare/i.test(text)) return zustand.paare;
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
  /* Der echte Treiber bekommt in transaction() genau die Objekte, die
     sql selbst erzeugt hat — hier sind das die Promises oben, an
     denen Text und Werte haengen. */
  sql.transaction = (queries) => Promise.all(queries);
  return sql;
}
`;

async function ladeApi() {
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-api-"));
  const stubDatei = join(verzeichnis, "stub-treiber.mjs");
  await writeFile(stubDatei, STUB);

  /* api/_db.js mit dem Stub, die Endpunkte mit diesem _db.js — sonst
     laedt jeder Endpunkt wieder das echte Modul. */
  const dbQuelle = await readFile(new URL("../api/_db.js", import.meta.url), "utf8");
  const dbMitStub = dbQuelle.replace(
    /from\s+"@neondatabase\/serverless"/,
    'from "' + pathToFileURL(stubDatei).href + '"'
  );
  assert.notEqual(dbMitStub, dbQuelle, "Der Treiber-Import wurde nicht ersetzt");
  const dbDatei = join(verzeichnis, "_db.mjs");
  await writeFile(dbDatei, dbMitStub);

  const module = {};
  for (const name of ["items", "duels"]) {
    const quelle = await readFile(new URL("../api/" + name + ".js", import.meta.url), "utf8");
    const datei = join(verzeichnis, name + ".mjs");
    await writeFile(datei, quelle.replace(/from\s+"\.\/_db\.js"/, 'from "' + pathToFileURL(dbDatei).href + '"'));
    module[name] = (await import(pathToFileURL(datei).href)).default;
  }

  const stub = await import(pathToFileURL(stubDatei).href);
  return { ...module, stub };
}

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://stub/stub";

/* Eine Antwort, die sich wie die von Vercel verhaelt. */
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

/* Einmal warmlaufen lassen: `ensureReady()` legt beim ersten Aufruf
   die Struktur an und traegt fehlende Bewertungsdaten nach. Das ist
   Bestand und gehoert nicht in die Anweisungen, die die Tests unten
   ansehen — danach ist es abgehakt und laeuft nicht wieder. */
await (async () => {
  const res = antwortObjekt();
  await api.duels({ query: {}, body: {}, method: "GET" }, res);
})();

async function ruf(handler, req) {
  api.stub.anweisungen.length = 0;
  const res = antwortObjekt();
  await handler({ query: {}, body: {}, ...req }, res);
  return { res, anweisungen: [...api.stub.anweisungen] };
}

/* Alle Anweisungen, die schreiben. */
function schreibend(anweisungen) {
  return anweisungen.filter((a) => /\b(INSERT|UPDATE)\b/i.test(a.text));
}

/* Ein vollstaendiger Eintrag, so wie ihn ein Backup von VOR dieser
   Aenderung enthaelt: ohne elo, ohne duels. */
const AUS_ALTEM_BACKUP = {
  category: "movie",
  title: "Alter Film",
  values: { story: 8, charaktere: 7, unterhaltung: 9, emotion: 6, inszenierung: 7, schauspiel: 8, sound: 9 },
  personal: 7.5,
  createdAt: 1600000000000,
  ratedAt: 1600000000000,
};

/* ---------------------------------------------------------------- *
 * Ein Duell fasst nur elo und duels an
 * ---------------------------------------------------------------- */

/* Die Spalten im SET einer Anweisung — in der Reihenfolge egal. */
function gesetzteSpalten(anweisung) {
  return anweisung.text
    .replace(/^[\s\S]*?\bSET\b/i, "")
    .replace(/\bWHERE\b[\s\S]*$/i, "")
    .split(",")
    .map((teil) => teil.split("=")[0].trim())
    .sort();
}

/* Die beiden UPDATE-Anweisungen eines Duells, auseinandergehalten
   ueber die id im letzten Wert. */
function duellSchreiber(anweisungen) {
  const aufItems = schreibend(anweisungen).filter((a) => /media_items/i.test(a.text));
  return {
    alle: aufItems,
    fuer: (id) => aufItems.find((a) => a.werte[a.werte.length - 1] === id),
  };
}

test("Ein Duell schreibt ausschliesslich elo, duels und beim Gewinner siege", async () => {
  api.stub.zustand.elo.set("sieger", 1000);
  api.stub.zustand.elo.set("verlierer", 1000);

  const { res, anweisungen } = await ruf(api.duels, {
    method: "POST",
    body: { category: "movie", winnerId: "sieger", loserId: "verlierer" },
  });
  assert.equal(res.status_, 200);

  const schreiber = duellSchreiber(anweisungen);
  assert.equal(schreiber.alle.length, 2, "es werden nicht genau zwei Eintraege beschrieben");

  const gewinner = schreiber.fuer("sieger");
  const verlierer = schreiber.fuer("verlierer");
  assert.ok(gewinner && verlierer, "Gewinner und Verlierer sind nicht auseinanderzuhalten");

  assert.deepEqual(gesetzteSpalten(gewinner), ["duels", "elo", "siege"]);
  assert.deepEqual(gesetzteSpalten(verlierer), ["duels", "elo"]);
});

test("siege waechst nur beim Gewinner — und nur um eins", async () => {
  api.stub.zustand.elo.set("sieger", 1000);
  api.stub.zustand.elo.set("verlierer", 1000);

  const { anweisungen } = await ruf(api.duels, {
    method: "POST",
    body: { category: "movie", winnerId: "sieger", loserId: "verlierer" },
  });

  const schreiber = duellSchreiber(anweisungen);
  assert.match(schreiber.fuer("sieger").text, /siege\s*=\s*siege\s*\+\s*1/i);
  assert.ok(
    !/\bsiege\b/i.test(schreiber.fuer("verlierer").text),
    "die Niederlage schreibt siege:\n" + schreiber.fuer("verlierer").text
  );
});

test("Ein uebersprungenes Duell fasst siege nicht an", async () => {
  /* Uebersprungen heisst: es wird gar nichts gemeldet. Selbst der
     reine Zaehler-Aufruf ohne Beteiligte darf keinen Sieg buchen. */
  const { anweisungen } = await ruf(api.duels, {
    method: "POST",
    body: { category: "movie" },
  });
  assert.equal(
    anweisungen.filter((a) => /\bsiege\b/i.test(a.text)).length,
    0,
    "ein Duell ohne Beteiligte schreibt siege"
  );
});

test("Ein Selbstduell bucht keinen Sieg", async () => {
  const { res, anweisungen } = await ruf(api.duels, {
    method: "POST",
    body: { category: "movie", winnerId: "a", loserId: "a" },
  });
  assert.equal(res.status_, 400);
  assert.equal(anweisungen.filter((a) => /\bsiege\b/i.test(a.text)).length, 0);
});

test("Kein Duell beruehrt Bauchgefuehl oder ein Kriterium", async () => {
  api.stub.zustand.elo.set("sieger", 1180);
  api.stub.zustand.elo.set("verlierer", 940);

  const { anweisungen } = await ruf(api.duels, {
    method: "POST",
    body: { category: "movie", winnerId: "sieger", loserId: "verlierer" },
  });

  const felder = ["personal", "story", "charaktere", "unterhaltung", "emotion", "inszenierung", "schauspiel", "sound", "gameplay", "welt", "grafik", "wiederspielwert"];
  for (const a of schreibend(anweisungen)) {
    for (const feld of felder) {
      assert.ok(
        !new RegExp("\\b" + feld + "\\b\\s*=").test(a.text),
        "Ein Duell schreibt " + feld + ":\n" + a.text
      );
    }
  }
});

test("Die geschriebenen Elo-Zahlen sind die gerechneten", async () => {
  api.stub.zustand.elo.set("sieger", 1000);
  api.stub.zustand.elo.set("verlierer", 1000);

  const { anweisungen } = await ruf(api.duels, {
    method: "POST",
    body: { category: "movie", winnerId: "sieger", loserId: "verlierer" },
  });

  const aufItems = schreibend(anweisungen).filter((a) => /media_items/i.test(a.text));
  const zahlen = aufItems.map((a) => a.werte[0]).sort((x, y) => x - y);
  // Gleicher Stand, K = 32: die halbe K-Zahl wechselt die Seite.
  assert.deepEqual(zahlen, [984, 1016]);
});

test("Ein Selbstduell wird abgewiesen", async () => {
  const { res } = await ruf(api.duels, {
    method: "POST",
    body: { category: "movie", winnerId: "a", loserId: "a" },
  });
  assert.equal(res.status_, 400);
});

test("Ohne Beteiligte bleibt es beim reinen Hochzaehlen", async () => {
  const { res, anweisungen } = await ruf(api.duels, {
    method: "POST",
    body: { category: "movie" },
  });
  assert.equal(res.status_, 200);
  assert.equal(schreibend(anweisungen).filter((a) => /media_items/i.test(a.text)).length, 0);
});

/* ---------------------------------------------------------------- *
 * Zuruecksetzen
 * ---------------------------------------------------------------- */

test("Zuruecksetzen setzt elo auf den Startwert und laesst duels stehen", async () => {
  const { res, anweisungen } = await ruf(api.duels, {
    method: "DELETE",
    query: { id: "abc" },
  });
  assert.equal(res.status_, 200);

  const schreiber = schreibend(anweisungen);
  assert.equal(schreiber.length, 1);
  assert.match(schreiber[0].text, /UPDATE\s+media_items\s+SET\s+elo\s*=/i);
  assert.equal(schreiber[0].werte[0], 1000, "es wird nicht auf den Startwert gesetzt");
  assert.ok(!/\bduels\b\s*=/i.test(schreiber[0].text), "die Duell-Historie wird geloescht");
  assert.ok(!/\bsiege\b\s*=/i.test(schreiber[0].text), "die Siege werden geloescht");
});

test("Zuruecksetzen ohne id wird abgewiesen", async () => {
  const { res } = await ruf(api.duels, { method: "DELETE" });
  assert.equal(res.status_, 400);
});

/* ---------------------------------------------------------------- *
 * Import eines Backups ohne die neuen Felder
 * ---------------------------------------------------------------- */

test("Ein Eintrag aus einem alten Backup laesst sich anlegen", async () => {
  const { res, anweisungen } = await ruf(api.items, {
    method: "POST",
    body: { ...AUS_ALTEM_BACKUP },
  });
  assert.equal(res.status_, 201, "Antwort: " + JSON.stringify(res.body));

  const insert = anweisungen.find((a) => /INSERT\s+INTO\s+media_items/i.test(a.text));
  assert.ok(insert, "kein INSERT auf media_items");

  /* Die Spaltenliste steht im Text, die Werte in derselben
     Reihenfolge daneben — so laesst sich nachsehen, was fuer elo und
     duels tatsaechlich eingesetzt wurde. */
  const spalten = insert.text
    .replace(/^[\s\S]*?media_items\s*\(/i, "")
    .replace(/\)[\s\S]*$/, "")
    .split(",")
    .map((n) => n.trim());
  assert.ok(spalten.includes("elo"), "elo fehlt in der Spaltenliste");
  assert.ok(spalten.includes("duels"), "duels fehlt in der Spaltenliste");
  assert.ok(spalten.includes("siege"), "siege fehlt in der Spaltenliste");

  /* Spalten und Werte stehen in derselben Reihenfolge: jede Spalte
     ist ein eigener Platzhalter. */
  assert.equal(spalten.length, insert.werte.length, "Spalten und Werte gehen nicht auf");
  assert.equal(insert.werte[spalten.indexOf("elo")], 1000);
  assert.equal(insert.werte[spalten.indexOf("duels")], 0);
  /* Und `siege` faengt bei 0 an. Zurueckgerechnet wird nichts: die
     bisherigen Duellausgaenge stehen nirgends. */
  assert.equal(insert.werte[spalten.indexOf("siege")], 0);
});

test("Ein Backup MIT Duellzahl, aber OHNE siege setzt 0", async () => {
  /* Genau der Zwischenstand: eine Sicherung aus der Zeit zwischen der
     Duell-Wertung und dem Siegzaehler. `elo` und `duels` kommen mit,
     `siege` nicht — und wird nicht aus der Elo geschaetzt. */
  const { res, anweisungen } = await ruf(api.items, {
    method: "POST",
    body: { ...AUS_ALTEM_BACKUP, elo: 1187.5, duels: 23 },
  });
  assert.equal(res.status_, 201, "Antwort: " + JSON.stringify(res.body));

  const insert = anweisungen.find((a) => /INSERT\s+INTO\s+media_items/i.test(a.text));
  const spalten = insert.text
    .replace(/^[\s\S]*?media_items\s*\(/i, "")
    .replace(/\)[\s\S]*$/, "")
    .split(",")
    .map((n) => n.trim());
  assert.equal(insert.werte[spalten.indexOf("elo")], 1187.5);
  assert.equal(insert.werte[spalten.indexOf("duels")], 23);
  assert.equal(insert.werte[spalten.indexOf("siege")], 0);
});

test("Ein Backup MIT siege bringt den Wert mit", async () => {
  const { res, anweisungen } = await ruf(api.items, {
    method: "POST",
    body: { ...AUS_ALTEM_BACKUP, elo: 1187.5, duels: 23, siege: 14 },
  });
  assert.equal(res.status_, 201, "Antwort: " + JSON.stringify(res.body));

  const insert = anweisungen.find((a) => /INSERT\s+INTO\s+media_items/i.test(a.text));
  assert.ok(insert.werte.includes(14), "siege aus dem Backup fehlt");
});

test("Ein Eintrag aus einem neuen Backup bringt seine Werte mit", async () => {
  const { res, anweisungen } = await ruf(api.items, {
    method: "POST",
    body: { ...AUS_ALTEM_BACKUP, elo: 1187.5, duels: 23 },
  });
  assert.equal(res.status_, 201, "Antwort: " + JSON.stringify(res.body));

  const insert = anweisungen.find((a) => /INSERT\s+INTO\s+media_items/i.test(a.text));
  assert.ok(insert.werte.includes(1187.5), "elo aus dem Backup fehlt");
  assert.ok(insert.werte.includes(23), "duels aus dem Backup fehlt");
});

test("Ein Speichervorgang ohne die Felder laesst den Stand stehen", async () => {
  /* Das automatische Nachladen von Postern und Angaben schickt weder
     elo noch duels mit. Ohne COALESCE wuerde jeder dieser Aufrufe die
     erspielte Duell-Wertung zurueckdrehen. */
  const { res, anweisungen } = await ruf(api.items, {
    method: "PUT",
    query: { id: "abc" },
    body: { ...AUS_ALTEM_BACKUP, id: "abc" },
  });
  assert.equal(res.status_, 200, "Antwort: " + JSON.stringify(res.body));

  const update = anweisungen.find((a) => /UPDATE\s+media_items/i.test(a.text));
  assert.match(update.text, /elo\s*=\s*COALESCE\([^)]*,\s*elo\)/i);
  assert.match(update.text, /duels\s*=\s*COALESCE\([^)]*,\s*duels\)/i);
  assert.match(update.text, /siege\s*=\s*COALESCE\([^)]*,\s*siege\)/i);
  // Eingesetzt wird NULL — COALESCE nimmt dann den gespeicherten Wert.
  const stelle = Number((update.text.match(/elo\s*=\s*COALESCE\(\$(\d+)/i) || [])[1]);
  assert.equal(update.werte[stelle - 1], null);
});

/* ---------------------------------------------------------------- *
 * Die gespielten Paarungen (duell_paare)
 * ---------------------------------------------------------------- */

test("Ein entschiedenes Duell haelt seine Paarung fest", async () => {
  api.stub.zustand.elo.set("sieger", 1000);
  api.stub.zustand.elo.set("verlierer", 1000);

  const { res, anweisungen } = await ruf(api.duels, {
    method: "POST",
    body: { category: "movie", winnerId: "sieger", loserId: "verlierer" },
  });
  assert.equal(res.status_, 200);

  const paar = anweisungen.find((a) => /INSERT\s+INTO\s+duell_paare/i.test(a.text));
  assert.ok(paar, "die Paarung wird nicht festgehalten");
  assert.match(paar.text, /ON\s+CONFLICT\s*\(kategorie,\s*item_a,\s*item_b\)/i);
  // Kategorie, beide IDs und der Zeitpunkt gehen mit.
  assert.equal(paar.werte[0], "movie");
});

test("Die beiden IDs liegen sortiert — A gegen B ist B gegen A", async () => {
  api.stub.zustand.elo.set("zzz", 1000);
  api.stub.zustand.elo.set("aaa", 1000);

  /* Einmal so herum, einmal andersherum: beide Male muss dieselbe
     Reihenfolge in der Datenbank landen, sonst greift die Sperrfrist
     nur in eine Richtung. */
  const hin = await ruf(api.duels, {
    method: "POST",
    body: { category: "movie", winnerId: "zzz", loserId: "aaa" },
  });
  const zurueck = await ruf(api.duels, {
    method: "POST",
    body: { category: "movie", winnerId: "aaa", loserId: "zzz" },
  });

  const idsVon = (lauf) => {
    const paar = lauf.anweisungen.find((a) => /INSERT\s+INTO\s+duell_paare/i.test(a.text));
    assert.ok(paar, "die Paarung wird nicht festgehalten");
    return [paar.werte[1], paar.werte[2]];
  };
  assert.deepEqual(idsVon(hin), ["aaa", "zzz"], "die kleinere ID steht nicht vorn");
  assert.deepEqual(idsVon(zurueck), ["aaa", "zzz"], "andersherum entsteht ein anderer Eintrag");

  // Und dieselbe Reihenfolge kommt zurueck an das Frontend.
  assert.deepEqual(hin.res.body.pair.a, "aaa");
  assert.deepEqual(hin.res.body.pair.b, "zzz");
});

test("Ohne Beteiligte entsteht keine Paarung", async () => {
  /* Genau das passiert beim Ueberspringen: es wird gar nichts
     gemeldet. Und selbst der reine Zaehler-Aufruf legt keine
     Paarung an. */
  const { anweisungen } = await ruf(api.duels, {
    method: "POST",
    body: { category: "movie" },
  });
  assert.equal(
    anweisungen.filter((a) => /duell_paare/i.test(a.text)).length,
    0,
    "ein Duell ohne Beteiligte legt eine Paarung an"
  );
});

test("Ein Selbstduell legt keine Paarung an", async () => {
  const { res, anweisungen } = await ruf(api.duels, {
    method: "POST",
    body: { category: "movie", winnerId: "a", loserId: "a" },
  });
  assert.equal(res.status_, 400);
  assert.equal(anweisungen.filter((a) => /duell_paare/i.test(a.text)).length, 0);
});

test("Die Paarungen einer Kategorie lassen sich abrufen", async () => {
  api.stub.zustand.paare = [
    { item_a: "aaa", item_b: "zzz", gespielt_am: "1700000000000" },
  ];
  const { res } = await ruf(api.duels, { method: "GET", query: { category: "movie" } });
  assert.equal(res.status_, 200);
  assert.deepEqual(res.body, {
    category: "movie",
    pairs: [{ a: "aaa", b: "zzz", at: 1700000000000 }],
  });
  api.stub.zustand.paare = [];
});

test("Ohne Kategorie bleibt es bei den Zaehlern", async () => {
  const { res } = await ruf(api.duels, { method: "GET" });
  assert.equal(res.status_, 200);
  assert.ok(res.body.counts, "die Zaehler fehlen");
  assert.ok(!("pairs" in res.body), "die Paarungen stehen ungefragt dabei");
});

test("Eine unbekannte Kategorie wird abgewiesen", async () => {
  const { res } = await ruf(api.duels, { method: "GET", query: { category: "quatsch" } });
  assert.equal(res.status_, 400);
});
