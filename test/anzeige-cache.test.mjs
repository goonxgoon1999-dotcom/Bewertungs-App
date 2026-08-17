/**
 * Tests fuer den Anzeige-Cache in src/App.jsx.
 *
 * Geprueft wird vor allem, dass ein kaputter, veralteter oder
 * manipulierter Eintrag im localStorage NICHT zum Absturz fuehrt,
 * sondern still verworfen wird — die App laedt dann ganz normal.
 *
 * Geladen wird wie in app-logik.test.mjs: die Originaldatei wird mit
 * esbuild uebersetzt und um eine Ausfuhrliste ergaenzt, damit wirklich
 * der Code laeuft, der auch im Browser laeuft.
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

/* Ein minimaler localStorage, der sich wie der echte verhaelt. */
function neuerSpeicher() {
  const daten = new Map();
  return {
    getItem: (k) => (daten.has(k) ? daten.get(k) : null),
    setItem: (k, v) => daten.set(k, String(v)),
    removeItem: (k) => daten.delete(k),
    _daten: daten,
  };
}

globalThis.window = { localStorage: neuerSpeicher() };

const GEPRUEFT = [
  "ladeAnzeigeCache",
  "schreibeAnzeigeCache",
  "verwirfAnzeigeCache",
  "ANZEIGE_CACHE_SCHLUESSEL",
  "ANZEIGE_CACHE_VERSION",
  "CATEGORY_KEYS",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-cache-"));
  const datei = join(verzeichnis, "app-logik.mjs");
  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );
  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();
const SCHLUESSEL = app.ANZEIGE_CACHE_SCHLUESSEL;

function setze(roh) {
  window.localStorage = neuerSpeicher();
  if (roh !== undefined) window.localStorage.setItem(SCHLUESSEL, roh);
}

const beispiel = () => ({ movie: [{ id: 1, title: "Der Bernd" }], series: [] });

test("Schluessel und Fassung stehen wie vereinbart", () => {
  assert.equal(SCHLUESSEL, "archiv-anzeige-cache-v1");
  assert.equal(typeof app.ANZEIGE_CACHE_VERSION, "number");
});

test("Kein Eintrag: kein Cache, kein Fehler", () => {
  setze(undefined);
  assert.equal(app.ladeAnzeigeCache(), null);
});

test("Geschriebenes kommt vollstaendig zurueck", () => {
  setze(undefined);
  app.schreibeAnzeigeCache(beispiel());
  const gelesen = app.ladeAnzeigeCache();
  assert.ok(gelesen);
  assert.equal(gelesen.movie.length, 1);
  assert.equal(gelesen.movie[0].title, "Der Bernd");
  // Alle bekannten Kategorien sind belegt, auch die leeren.
  for (const key of app.CATEGORY_KEYS) assert.ok(Array.isArray(gelesen[key]));
});

test("Kaputter Text wird verworfen und geloescht", () => {
  setze("{das ist kein JSON");
  assert.equal(app.ladeAnzeigeCache(), null);
  assert.equal(window.localStorage.getItem(SCHLUESSEL), null);
});

test("Abweichende Fassung wird verworfen", () => {
  setze(JSON.stringify({ version: 999, gespeichertAm: Date.now(), daten: beispiel() }));
  assert.equal(app.ladeAnzeigeCache(), null);
  assert.equal(window.localStorage.getItem(SCHLUESSEL), null);
});

test("Aelter als sieben Tage wird verworfen", () => {
  const acht = Date.now() - 8 * 24 * 60 * 60 * 1000;
  setze(JSON.stringify({ version: app.ANZEIGE_CACHE_VERSION, gespeichertAm: acht, daten: beispiel() }));
  assert.equal(app.ladeAnzeigeCache(), null);
  assert.equal(window.localStorage.getItem(SCHLUESSEL), null);
});

test("Sechs Tage alt bleibt gueltig", () => {
  const sechs = Date.now() - 6 * 24 * 60 * 60 * 1000;
  setze(JSON.stringify({ version: app.ANZEIGE_CACHE_VERSION, gespeichertAm: sechs, daten: beispiel() }));
  const gelesen = app.ladeAnzeigeCache();
  assert.ok(gelesen);
  assert.equal(gelesen.movie.length, 1);
});

test("Unerwarteter Aufbau wird verworfen statt zu stuerzen", () => {
  for (const roh of [
    JSON.stringify(null),
    JSON.stringify(42),
    JSON.stringify("nur ein Text"),
    JSON.stringify([1, 2, 3]),
    JSON.stringify({ version: app.ANZEIGE_CACHE_VERSION, daten: beispiel() }),
    JSON.stringify({ version: app.ANZEIGE_CACHE_VERSION, gespeichertAm: "gestern", daten: beispiel() }),
    JSON.stringify({ version: app.ANZEIGE_CACHE_VERSION, gespeichertAm: Date.now(), daten: null }),
    JSON.stringify({ version: app.ANZEIGE_CACHE_VERSION, gespeichertAm: Date.now(), daten: "kaputt" }),
  ]) {
    setze(roh);
    assert.equal(app.ladeAnzeigeCache(), null, "verworfen: " + roh);
  }
});

test("Eintraege ohne Kennung fallen heraus", () => {
  setze(JSON.stringify({
    version: app.ANZEIGE_CACHE_VERSION,
    gespeichertAm: Date.now(),
    daten: { movie: [{ id: 1, title: "Gut" }, { title: "Ohne Kennung" }, null, "Text"] },
  }));
  const gelesen = app.ladeAnzeigeCache();
  assert.equal(gelesen.movie.length, 1);
  assert.equal(gelesen.movie[0].title, "Gut");
});

test("Ein Stand ganz ohne Eintraege gilt als wertlos", () => {
  setze(JSON.stringify({
    version: app.ANZEIGE_CACHE_VERSION,
    gespeichertAm: Date.now(),
    daten: { movie: [], series: [] },
  }));
  assert.equal(app.ladeAnzeigeCache(), null);
});

test("Nutzlast ueber 2 MB wird gar nicht erst geschrieben", () => {
  setze(undefined);
  const gross = { movie: [{ id: 1, title: "x".repeat(2 * 1024 * 1024 + 100) }] };
  app.schreibeAnzeigeCache(gross);
  assert.equal(window.localStorage.getItem(SCHLUESSEL), null);
});

test("Ein neuer Stand ersetzt den alten vollstaendig — auch wenn er kleiner ist", () => {
  setze(undefined);
  app.schreibeAnzeigeCache({ movie: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  app.schreibeAnzeigeCache({ movie: [{ id: 9 }] });
  const gelesen = app.ladeAnzeigeCache();
  assert.equal(gelesen.movie.length, 1);
  assert.equal(gelesen.movie[0].id, 9);
});

test("Ein nicht verfuegbarer Speicher bleibt folgenlos", () => {
  window.localStorage = {
    getItem() { throw new Error("kein Zugriff"); },
    setItem() { throw new Error("kein Zugriff"); },
    removeItem() { throw new Error("kein Zugriff"); },
  };
  assert.equal(app.ladeAnzeigeCache(), null);
  assert.doesNotThrow(() => app.schreibeAnzeigeCache(beispiel()));
  assert.doesNotThrow(() => app.verwirfAnzeigeCache());
});
