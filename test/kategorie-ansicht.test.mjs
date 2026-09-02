/**
 * Tests fuer die Kategorie-Ansicht in src/App.jsx.
 *
 * Welche Kategorien angezeigt werden und in welcher Reihenfolge, ist
 * eine reine Anzeige-Einstellung je Geraet (localStorage). Geprueft
 * werden hier die Funktionen dahinter — die Oberflaeche selbst wird
 * nicht gerendert:
 *
 *   - die Vorgabe ohne gespeicherten Stand,
 *   - dass ein kaputter oder unbekannter Stand still zur Vorgabe
 *     zurueckfaellt,
 *   - dass eine neue Kategorie im Code auch dann sichtbar ist, wenn
 *     schon eine aeltere Auswahl gespeichert ist,
 *   - dass die letzte sichtbare Kategorie nicht abwaehlbar ist,
 *   - das Verschieben,
 *   - und die beiden ausdruecklichen Ausnahmen: XP zaehlt weiter alle
 *     bewerteten Eintraege, der Export enthaelt weiter alles.
 *
 * Wie in app-logik.test.mjs wird src/App.jsx im Original geladen:
 * uebersetzt, um eine Ausfuhrliste ergaenzt, importiert.
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

const GEPRUEFT = [
  "CATEGORIES",
  "CATEGORY_KEYS",
  "normalisiereKategorieAnsicht",
  "standardKategorieAnsicht",
  "ladeKategorieAnsicht",
  "geordneteKategorien",
  "sichtbareKategorien",
  "istVersteckt",
  "schalteKategorie",
  "verschiebeKategorie",
  "statsBereiche",
  "holModi",
  "zeitaufwandKategorien",
  "auffaelligeTitel",
  "duellTeilnehmer",
  "fortsetzungenFrisch",
  "fortsetzungsAnfrage",
  "xpAusBestand",
  "XP_PRO_BEWERTUNG",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-kat-"));
  const datei = join(verzeichnis, "kategorie-ansicht.mjs");

  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();
const keys = (liste) => liste.map((c) => c.key);

/* ---------------------------------------------------------------- *
 * Vorgabe und Rueckfall
 * ---------------------------------------------------------------- */

test("Ohne gespeicherten Stand ist alles sichtbar, in der Code-Reihenfolge", () => {
  const ansicht = app.standardKategorieAnsicht();
  assert.deepEqual(ansicht.reihenfolge, app.CATEGORY_KEYS);
  assert.deepEqual(ansicht.versteckt, []);
  assert.deepEqual(keys(app.sichtbareKategorien(ansicht)), app.CATEGORY_KEYS);
});

test("Kaputte oder fremde Staende fallen still auf die Vorgabe zurueck", () => {
  for (const roh of [null, undefined, 42, "kaputt", [], {}, { reihenfolge: "nein", versteckt: 7 }]) {
    const ansicht = app.normalisiereKategorieAnsicht(roh);
    assert.deepEqual(ansicht.reihenfolge, app.CATEGORY_KEYS);
    assert.deepEqual(ansicht.versteckt, []);
  }
});

test("Unbekannte Kategorienamen werden verworfen", () => {
  const ansicht = app.normalisiereKategorieAnsicht({
    reihenfolge: ["gibtsnicht", "game", "movie", "game"],
    versteckt: ["gibtsnicht", "movie"],
  });
  // Bekanntes in gespeicherter Reihenfolge, Doppeltes nur einmal, der
  // Rest in der Code-Reihenfolge dahinter.
  assert.deepEqual(ansicht.reihenfolge.slice(0, 2), ["game", "movie"]);
  assert.deepEqual([...ansicht.reihenfolge].sort(), [...app.CATEGORY_KEYS].sort());
  assert.deepEqual(ansicht.versteckt, ["movie"]);
});

test("Ohne localStorage laedt die Vorgabe, ohne zu werfen", () => {
  // In Node gibt es kein `window` — genau der Fall, den der Rueckfall
  // abfangen muss.
  assert.deepEqual(app.ladeKategorieAnsicht(), app.standardKategorieAnsicht());
});

test("Eine neue Kategorie im Code ist auch bei alter Auswahl sichtbar", () => {
  /* Der gespeicherte Stand kennt nur die ersten drei Kategorien —
     genau der Fall "Auswahl von frueher, seither kam etwas dazu". */
  const alt = { reihenfolge: app.CATEGORY_KEYS.slice(0, 3), versteckt: [] };
  const sichtbar = keys(app.sichtbareKategorien(alt));
  for (const key of app.CATEGORY_KEYS) {
    assert.ok(sichtbar.includes(key), key + " fehlt in der Anzeige");
  }
  // Die gespeicherte Reihenfolge bleibt vorn, das Neue haengt hinten an.
  assert.deepEqual(sichtbar.slice(0, 3), app.CATEGORY_KEYS.slice(0, 3));
});

/* ---------------------------------------------------------------- *
 * Ein- und Ausschalten
 * ---------------------------------------------------------------- */

test("Ausblenden nimmt die Kategorie aus der Anzeige, nicht aus der Liste", () => {
  const ansicht = app.schalteKategorie(app.standardKategorieAnsicht(), "game");
  assert.ok(app.istVersteckt(ansicht, "game"));
  assert.ok(!keys(app.sichtbareKategorien(ansicht)).includes("game"));
  // In der Einstellungs-Liste steht sie weiterhin — sonst liesse sie
  // sich nie wieder einschalten.
  assert.ok(keys(app.geordneteKategorien(ansicht)).includes("game"));
});

test("Wieder einschalten stellt den alten Zustand her", () => {
  const aus = app.schalteKategorie(app.standardKategorieAnsicht(), "anime");
  const an = app.schalteKategorie(aus, "anime");
  assert.deepEqual(an, app.standardKategorieAnsicht());
});

test("Die letzte sichtbare Kategorie laesst sich nicht abwaehlen", () => {
  let ansicht = app.standardKategorieAnsicht();
  for (const key of app.CATEGORY_KEYS) ansicht = app.schalteKategorie(ansicht, key);

  assert.equal(app.sichtbareKategorien(ansicht).length, 1);
  const letzte = app.sichtbareKategorien(ansicht)[0].key;

  const nochmal = app.schalteKategorie(ansicht, letzte);
  assert.deepEqual(nochmal, ansicht);
  assert.equal(app.sichtbareKategorien(nochmal).length, 1);
});

test("Ein Stand, der alles versteckt, gilt nicht — dann ist alles sichtbar", () => {
  const ansicht = app.normalisiereKategorieAnsicht({
    reihenfolge: app.CATEGORY_KEYS,
    versteckt: app.CATEGORY_KEYS,
  });
  assert.deepEqual(keys(app.sichtbareKategorien(ansicht)), app.CATEGORY_KEYS);
});

/* ---------------------------------------------------------------- *
 * Reihenfolge
 * ---------------------------------------------------------------- */

test("Verschieben tauscht mit dem Nachbarn", () => {
  const [erste, zweite] = app.CATEGORY_KEYS;
  const runter = app.verschiebeKategorie(app.standardKategorieAnsicht(), erste, 1);
  assert.deepEqual(runter.reihenfolge.slice(0, 2), [zweite, erste]);

  const zurueck = app.verschiebeKategorie(runter, erste, -1);
  assert.deepEqual(zurueck.reihenfolge, app.CATEGORY_KEYS);
});

test("Am Rand und bei unbekanntem Namen passiert nichts", () => {
  const start = app.standardKategorieAnsicht();
  const erste = app.CATEGORY_KEYS[0];
  const letzte = app.CATEGORY_KEYS[app.CATEGORY_KEYS.length - 1];

  assert.deepEqual(app.verschiebeKategorie(start, erste, -1), start);
  assert.deepEqual(app.verschiebeKategorie(start, letzte, 1), start);
  assert.deepEqual(app.verschiebeKategorie(start, "gibtsnicht", 1), start);
});

test("Die Reihenfolge gilt auch fuer versteckte Kategorien", () => {
  // Verschieben, dann ausblenden: die Position bleibt erhalten und die
  // Kategorie steht nach dem Wiedereinschalten wieder dort.
  const [erste, zweite] = app.CATEGORY_KEYS;
  const getauscht = app.verschiebeKategorie(app.standardKategorieAnsicht(), erste, 1);
  const versteckt = app.schalteKategorie(getauscht, zweite);
  const wieder = app.schalteKategorie(versteckt, zweite);
  assert.deepEqual(wieder.reihenfolge.slice(0, 2), [zweite, erste]);
});

/* ---------------------------------------------------------------- *
 * Die Listen, die aus der Ansicht entstehen
 * ---------------------------------------------------------------- */

test("Auswahlfelder und Statistik-Bloecke folgen derselben Liste", () => {
  const ansicht = app.verschiebeKategorie(
    app.schalteKategorie(app.standardKategorieAnsicht(), "game"),
    app.CATEGORY_KEYS[0],
    1
  );
  const sichtbar = app.sichtbareKategorien(ansicht);

  // Statistik-Bereiche: "Alle" plus die sichtbaren, in ihrer Reihenfolge.
  assert.deepEqual(
    app.statsBereiche(sichtbar).map((b) => b.key),
    ["all", ...keys(sichtbar)]
  );

  // Higher or Lower: "Gemischt" plus dieselbe Liste.
  assert.deepEqual(
    app.holModi(sichtbar).map((m) => m.key),
    ["mixed", ...keys(sichtbar)]
  );

  // Zeitaufwand: davon alles, was ueberhaupt eine Laufzeit kennt.
  const zeit = keys(app.zeitaufwandKategorien(sichtbar));
  assert.ok(!zeit.includes("game"));
  assert.deepEqual(zeit, keys(sichtbar).filter((k) => zeit.includes(k)));
});

test("Duell-Teilnehmer und auffaellige Titel kennen nur sichtbare Kategorien", () => {
  const eintrag = (id) => ({
    id,
    title: "T" + id,
    score: 8,
    personal: 8,
    values: {},
    duels: 0,
    siege: 0,
  });
  const ranked = Object.fromEntries(app.CATEGORY_KEYS.map((k) => [k, [eintrag(k + "-1")]]));

  const ansicht = app.schalteKategorie(app.standardKategorieAnsicht(), "game");
  const sichtbar = app.sichtbareKategorien(ansicht);

  const teilnehmer = app.duellTeilnehmer(ranked, sichtbar);
  assert.ok(!Object.keys(teilnehmer).includes("game"));
  assert.deepEqual(Object.keys(teilnehmer), keys(sichtbar));

  // Ohne Zuschlag ist ohnehin nichts auffaellig — geprueft wird hier,
  // dass die versteckte Kategorie gar nicht erst durchlaufen wird.
  assert.deepEqual(app.auffaelligeTitel(ranked, sichtbar), []);
});

/* ---------------------------------------------------------------- *
 * Fortsetzungs-Erinnerung
 * ---------------------------------------------------------------- */

test("Die Fortsetzungs-Abfrage laesst versteckte Kategorien aus", () => {
  const serie = { id: "s1", title: "Serie", seasons: [], watchlist: false };
  const items = { series: [serie], anime: [{ ...serie, id: "a1" }] };

  const alle = app.fortsetzungsAnfrage(items, null, app.CATEGORY_KEYS);
  assert.deepEqual(alle.map((e) => e.category).sort(), ["anime", "series"]);

  const ohneAnime = app.fortsetzungsAnfrage(items, null, ["series"]);
  assert.deepEqual(ohneAnime.map((e) => e.category), ["series"]);
});

test("Wird eine Kategorie wieder eingeschaltet, gilt der Stand als veraltet", () => {
  const frisch = {
    zeit: Date.now(),
    fassung: 1,
    stand: {},
    kategorien: ["series"],
  };
  assert.ok(app.fortsetzungenFrisch(frisch, ["series"]));
  assert.ok(!app.fortsetzungenFrisch(frisch, ["series", "anime"]));
});

test("Ein Stand von frueher ohne Kategorien-Feld gilt als vollstaendig", () => {
  const alt = { zeit: Date.now(), fassung: 1, stand: {} };
  assert.ok(app.fortsetzungenFrisch(alt, app.CATEGORY_KEYS));
});

/* ---------------------------------------------------------------- *
 * Die beiden Ausnahmen
 * ---------------------------------------------------------------- */

test("XP zaehlt auch die Eintraege ausgeblendeter Kategorien", () => {
  const bewertet = { id: "x", watchlist: false };
  const items = Object.fromEntries(app.CATEGORY_KEYS.map((k) => [k, [bewertet]]));

  // Die Rechnung kennt die Ansicht gar nicht — gesehen ist gesehen.
  assert.equal(
    app.xpAusBestand(items),
    app.CATEGORY_KEYS.length * app.XP_PRO_BEWERTUNG
  );
});

test("Der Export laeuft weiterhin ueber alle Kategorien", async () => {
  /* Geprueft an der Quelle: Die beiden Export-Wege duerfen die
     Ansicht nicht kennen, sonst fehlte im Backup etwas. */
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  const exportRows = quelle.slice(
    quelle.indexOf("function buildExportRows"),
    quelle.indexOf("function exportData")
  );
  assert.ok(exportRows.length > 0);
  assert.ok(!/sichtbareK|useKategorien/.test(exportRows));
  assert.ok(exportRows.includes("CATEGORIES.map((c) => c.key)"));

  const exportData = quelle.slice(
    quelle.indexOf("function exportData"),
    quelle.indexOf("function doExport")
  );
  assert.ok(exportData.length > 0);
  assert.ok(!/sichtbareK|useKategorien/.test(exportData));
  assert.ok(exportData.includes("CATEGORY_KEYS.map"));
});
