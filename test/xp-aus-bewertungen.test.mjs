/**
 * Tests fuer die Herkunft der Aktivitaets-Punkte in src/App.jsx.
 *
 * Der Rang haengt seit dieser Aenderung an genau einer Zahl: wie viele
 * bewertete Eintraege in der Sammlung stehen. Frueher war es ein in der
 * Datenbank mitgefuehrter Zaehler, den jede Aktion hochsetzte — auch
 * jedes Duell, jedes Turnier und jeder Bestwert im Higher or Lower. Er
 * konnte nur wachsen; ein entfernter Titel liess seine Punkte stehen.
 *
 * Geprueft wird beides: dass die Rechnung stimmt (xpAusBestand) und
 * dass es den alten Weg wirklich nicht mehr gibt — kein /api/xp, keine
 * Gutschrift aus einem Minispiel.
 *
 * Wie in rang-icons.test.mjs wird src/App.jsx im Original geladen:
 * uebersetzt, um eine Ausfuhrliste ergaenzt, importiert.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";

const GEPRUEFT = ["xpAusBestand", "XP_PRO_BEWERTUNG", "CATEGORY_KEYS", "RAENGE", "rangFuer"];

const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

async function ladeXp() {
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-xp-"));
  const datei = join(verzeichnis, "xp.mjs");

  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return import(pathToFileURL(datei).href);
}

const { xpAusBestand, XP_PRO_BEWERTUNG, CATEGORY_KEYS, RAENGE, rangFuer } = await ladeXp();

/** Eine leere Sammlung — alle Kategorien vorhanden, keine mit Inhalt. */
function leer() {
  return Object.fromEntries(CATEGORY_KEYS.map((k) => [k, []]));
}

/** Ein bewerteter Eintrag: alles ausser `watchlist: true`. */
function bewertet(id, zusatz) {
  return { id, title: "Titel " + id, ...(zusatz || {}) };
}

/** Ein vorgemerkter Eintrag. */
function vorgemerkt(id) {
  return { id, title: "Titel " + id, watchlist: true };
}

test("Eine leere Sammlung ergibt 0 Punkte", () => {
  assert.equal(xpAusBestand(leer()), 0);
});

test("Jeder bewertete Eintrag bringt denselben festen Betrag", () => {
  const stand = leer();
  stand.movie = [bewertet("a"), bewertet("b"), bewertet("c")];
  stand.game = [bewertet("d")];
  assert.equal(xpAusBestand(stand), 4 * XP_PRO_BEWERTUNG);
});

test("Der Betrag je Bewertung ist unveraendert 10", () => {
  assert.equal(XP_PRO_BEWERTUNG, 10);
});

test("Vorgemerkte Eintraege zaehlen nicht", () => {
  const stand = leer();
  stand.movie = [bewertet("a"), vorgemerkt("b"), vorgemerkt("c")];
  assert.equal(xpAusBestand(stand), XP_PRO_BEWERTUNG);
});

test("Am Schauen und der Sehzaehler aendern nichts", () => {
  const stand = leer();
  // Ein bewerteter Titel im Rewatch, 7 Mal gesehen — trotzdem ein Eintrag.
  stand.series = [bewertet("a", { amSchauen: true, watchCount: 7 })];
  // Ein vorgemerkter Titel, der am Schauen ist, hat weiterhin keine Note.
  stand.anime = [{ id: "b", title: "b", watchlist: true, amSchauen: true }];
  assert.equal(xpAusBestand(stand), XP_PRO_BEWERTUNG);
});

test("Ein entfernter Eintrag nimmt seine Punkte wieder mit", () => {
  const vorher = leer();
  vorher.movie = [bewertet("a"), bewertet("b")];
  const nachher = leer();
  nachher.movie = [bewertet("a")];

  assert.equal(xpAusBestand(vorher), 2 * XP_PRO_BEWERTUNG);
  assert.equal(xpAusBestand(nachher), XP_PRO_BEWERTUNG);
  assert.ok(xpAusBestand(nachher) < xpAusBestand(vorher));
});

test("Eine fehlende Kategorie bricht die Rechnung nicht", () => {
  assert.equal(xpAusBestand({}), 0);
  assert.equal(xpAusBestand({ movie: [bewertet("a")] }), XP_PRO_BEWERTUNG);
});

test("Die Stufen bleiben unveraendert — die Rechnung setzt nur darauf auf", () => {
  assert.equal(RAENGE.length, 8);
  assert.equal(RAENGE[0].key, "kupfer");
  assert.equal(RAENGE[RAENGE.length - 1].key, "champion");

  // 20 Bewertungen sind 200 XP und damit genau die Schwelle zu Bronze.
  const stand = leer();
  stand.movie = Array.from({ length: 20 }, (_, i) => bewertet("f" + i));
  assert.equal(xpAusBestand(stand), 200);
  assert.equal(rangFuer(xpAusBestand(stand)).rang.key, "bronze");
});

/* ---- Die alten Quellen sind wirklich weg ------------------------- */

test("Es gibt keinen XP-Endpunkt mehr", async () => {
  const dateien = await readdir(new URL("../api/", import.meta.url));
  assert.ok(!dateien.includes("xp.js"), "api/xp.js liegt wieder im Projekt");
});

test("Das Frontend ruft /api/xp nicht mehr auf", () => {
  assert.ok(!/\/api\/xp/.test(quelle), "In src/App.jsx steht noch ein Aufruf von /api/xp");
});

test("Kein Minispiel meldet noch eine Gutschrift", () => {
  for (const name of ["grantXp", "xpGeben", "kategorieBonusPruefen", "onFertig"]) {
    assert.ok(
      !new RegExp("\\b" + name + "\\b").test(quelle),
      "In src/App.jsx steht noch: " + name
    );
  }
});

test("Der gespeicherte Punktestand wird nirgends mehr angelegt oder gelesen", async () => {
  const db = await readFile(new URL("../api/_db.js", import.meta.url), "utf8");
  for (const name of ["ensureXp", "rowToXp", "onceAus", "XP_ZEILE"]) {
    assert.ok(!new RegExp("\\b" + name + "\\b").test(db), "In api/_db.js steht noch: " + name);
  }
  /* Die Tabelle darf vorkommen — aber nur im Kommentar, der erklaert,
     dass sie in Ruhe gelassen wird. In einer Anweisung nicht mehr. */
  assert.ok(
    !/(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|SELECT)[\s\S]{0,80}user_progress/i.test(db),
    "api/_db.js fasst user_progress weiterhin an"
  );
});
