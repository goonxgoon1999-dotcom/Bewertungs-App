/**
 * Der Aufbau der Zeilen in "Watchlist"/"Backlog" und "Am Schauen".
 *
 * Gerendert wird wie in am-schauen-zeile.test.mjs mit
 * renderToStaticMarkup: kein Browser, aber der echte Bauplan der
 * Komponente mit echten Requisiten.
 *
 * Die Zusagen:
 *
 *   1. Der Titel bekommt die volle Restbreite und zwei Zeilen — er
 *      wird nicht mehr nach einer Zeile abgeschnitten.
 *   2. Jahr, Laufzeit und Vormerkdatum stehen in einer Meta-Zeile,
 *      getrennt durch "·". Fehlt ein Wert, faellt er samt Trennzeichen
 *      weg — nie bleibt ein einzelnes "·" stehen.
 *   3. Die Symbolknoepfe sind mindestens 44 px hoch und tragen ihr
 *      aria-label.
 *   4. Der Bewerten-Knopf im Reiter "Am Schauen" steht nur an
 *      vorgemerkten Zeilen: ein bereits bewerteter Eintrag darf seine
 *      Werte nicht an ein leeres Formular verlieren.
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

const GEPRUEFT = ["WatchlistZeile", "AmSchauenZeile", "zeilenMeta", "hinzugefuegtKurz", "SYMBOL_KNOPF_GROESSE"];

async function ladeBausteine() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-wzeile-"));
  const datei = join(verzeichnis, "zeile.mjs");

  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeBausteine();

const TAG = 86400000;

function eintrag(felder) {
  return {
    id: "x",
    title: "Ein Film",
    poster: "",
    watchlist: true,
    amSchauen: false,
    staffelNr: null,
    folgeNr: null,
    episodesPerSeason: [],
    releaseYear: 1968,
    runtimeMinutes: 149,
    createdAt: Date.now() - 12 * TAG,
    ...felder,
  };
}

function watchlistZeile(felder, extra = {}) {
  return renderToStaticMarkup(
    createElement(app.WatchlistZeile, {
      eintrag: eintrag(felder),
      busy: false,
      merkliste: "Watchlist",
      amSchauenLabelText: "Am Schauen",
      onAmSchauen: () => {},
      onBewerten: () => {},
      onEntfernen: () => {},
      ...extra,
    })
  );
}

function amSchauenZeile(felder, extra = {}) {
  return renderToStaticMarkup(
    createElement(app.AmSchauenZeile, {
      eintrag: eintrag({ amSchauen: true, ...felder }),
      busy: false,
      akzent: "#3E9C8F",
      ausLabel: "Am Schauen",
      onWeiter: () => {},
      onStand: () => {},
      onAus: () => {},
      onBewerten: () => {},
      ...extra,
    })
  );
}

/* ---------------------------------------------------------------- *
 * 1. Der Titel
 * ---------------------------------------------------------------- */

test("Der Titel darf zwei Zeilen hoch werden statt nach einer abzubrechen", () => {
  const html = watchlistZeile({ title: "Shrek 2 - Der tollkühne Held kehrt zurück" });
  assert.match(html, /Shrek 2 - Der tollkühne Held kehrt zurück/);
  assert.match(html, /-webkit-line-clamp:2/, "Der Titel ist nicht auf zwei Zeilen begrenzt");
  assert.doesNotMatch(
    html,
    /white-space:nowrap;overflow:hidden;text-overflow:ellipsis[^"]*">Shrek/,
    "Der Titel steht noch in der alten einzeiligen Fassung"
  );
});

/* ---------------------------------------------------------------- *
 * 2. Die Meta-Zeile
 * ---------------------------------------------------------------- */

test("Jahr, Laufzeit und Vormerkdatum stehen in einer Zeile", () => {
  assert.equal(
    app.zeilenMeta(eintrag({ releaseYear: 1968, runtimeMinutes: 149, createdAt: Date.now() - 12 * TAG })),
    "1968 · 2 Std. 29 Min. · vor 12 Tagen"
  );
});

test("Fehlt die Laufzeit, faellt sie samt Trennzeichen weg", () => {
  assert.equal(
    app.zeilenMeta(eintrag({ releaseYear: 2019, runtimeMinutes: null, createdAt: Date.now() })),
    "2019 · heute"
  );
});

test("Fehlt das Jahr, beginnt die Zeile nicht mit einem Trennzeichen", () => {
  const meta = app.zeilenMeta(eintrag({ releaseYear: null, runtimeMinutes: 90, createdAt: Date.now() - TAG }));
  assert.equal(meta, "1 Std. 30 Min. · gestern");
  assert.doesNotMatch(meta, /^ ?·/);
});

test("Ist gar nichts bekannt, bleibt die Meta-Zeile leer und wird nicht gezeichnet", () => {
  assert.equal(app.zeilenMeta({ id: "x", title: "Ohne alles" }), "");
  const html = watchlistZeile({ releaseYear: null, runtimeMinutes: null, createdAt: null });
  assert.match(html, /Ein Film/);
  assert.doesNotMatch(html, /·/, "In der Zeile steht noch ein Trennzeichen ohne Wert");
});

test("Das Vormerkdatum ist kurz genug, um nicht abgeschnitten zu werden", () => {
  assert.equal(app.hinzugefuegtKurz(Date.now()), "heute");
  assert.equal(app.hinzugefuegtKurz(Date.now() - TAG), "gestern");
  assert.equal(app.hinzugefuegtKurz(Date.now() - 43 * TAG), "vor 43 Tagen");
  assert.equal(app.hinzugefuegtKurz(null), "");
});

/* ---------------------------------------------------------------- *
 * 3. Die Knopfreihe
 * ---------------------------------------------------------------- */

/** Das Knopf-Element, dessen Inhalt genau `text` ist — oder null. */
function knopf(html, text) {
  const treffer = html.match(new RegExp("<button[^>]*>" + text + "</button>"));
  return treffer ? treffer[0] : null;
}

test("Die Symbolknoepfe der Watchlist-Zeile sind 44 px hoch und beschriftet", () => {
  assert.equal(app.SYMBOL_KNOPF_GROESSE, 44);
  const html = watchlistZeile({ title: "Heat" });

  const starten = knopf(html, "▶");
  assert.ok(starten, "Der Startknopf fehlt");
  assert.match(starten, /min-height:44px/);
  assert.match(starten, /aria-label="Heat: Am Schauen beginnen"/);

  const weg = knopf(html, "×");
  assert.ok(weg, "Der Entfernen-Knopf fehlt");
  assert.match(weg, /min-height:44px/);
  assert.match(weg, /aria-label="Heat aus der Watchlist entfernen"/);
});

test("Beim Backlog heisst es „aus dem Backlog“", () => {
  const html = watchlistZeile({ title: "Hades" }, { merkliste: "Backlog", amSchauenLabelText: "Am Spielen" });
  assert.match(knopf(html, "×"), /aria-label="Hades aus dem Backlog entfernen"/);
  assert.match(knopf(html, "▶"), /aria-label="Hades: Am Spielen beginnen"/);
});

test("Der „Ansehen“-Knopf nimmt den restlichen Platz ein", () => {
  const html = watchlistZeile({});
  const ansehen = html.match(/<button[^>]*>✓ Ansehen<\/button>/);
  assert.ok(ansehen, "Der Ansehen-Knopf fehlt");
  assert.match(ansehen[0], /flex:1 1 auto/);
});

/* ---------------------------------------------------------------- *
 * 4. Bewerten aus "Am Schauen"
 * ---------------------------------------------------------------- */

test("Eine vorgemerkte Zeile im Reiter „Am Schauen“ fuehrt direkt ins Formular", () => {
  const html = amSchauenZeile({ watchlist: true });
  assert.ok(knopf(html, "✓ Bewerten"), "Der Bewerten-Knopf fehlt an einer vorgemerkten Zeile");
  // Beenden geht weiterhin.
  assert.match(html, /Am Schauen beenden/);
});

test("An einer bereits bewerteten Zeile steht kein Bewerten-Knopf", () => {
  const html = amSchauenZeile({ watchlist: false });
  assert.equal(knopf(html, "✓ Bewerten"), null, "Ein leeres Formular wuerde die vorhandenen Werte ueberschreiben");
  assert.match(html, /Am Schauen beenden/);
});

test("Ohne onBewerten rendert die Zeile wie bisher", () => {
  const html = amSchauenZeile({ watchlist: true }, { onBewerten: undefined });
  assert.equal(knopf(html, "✓ Bewerten"), null);
  assert.match(html, /Ein Film/);
});

test("Die Zeile im Reiter „Am Schauen“ traegt dieselbe Meta-Zeile", () => {
  const html = amSchauenZeile({ watchlist: true, releaseYear: 2008, runtimeMinutes: 2880, createdAt: Date.now() - 5 * TAG });
  assert.match(html, /2008 · 48 Std\. · vor 5 Tagen/);
});

/* ---------------------------------------------------------------- *
 * 5. Die Unter-Reiter
 * ---------------------------------------------------------------- */

const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

test("Der Zaehler haengt ohne Mittelpunkt am Namen des Unter-Reiters", () => {
  assert.doesNotMatch(
    quelle,
    /anzeigeWatchlist\.length \? " · " \+ anzeigeWatchlist\.length/,
    "Vor dem Zaehler steht noch ein Mittelpunkt"
  );
  assert.match(quelle, /anzeigeWatchlist\.length \? " " \+ anzeigeWatchlist\.length/);
  assert.match(quelle, /anzeigeAmSchauen\.length \? " " \+ anzeigeAmSchauen\.length/);
});

test("Die Reiterleiste ist seitlich wischbar statt umbrechend", () => {
  assert.match(quelle, /className="unter-reiter-leiste"/);
  const regel = quelle.match(/\.unter-reiter-leiste \{[^}]*\}/);
  assert.ok(regel, "Die Regel .unter-reiter-leiste fehlt");
  assert.match(regel[0], /overflow-x: auto/);
  // Kein sichtbarer Rollbalken — wie bei der Kategorie-Tab-Leiste.
  assert.match(regel[0], /scrollbar-width: none/);
  assert.match(quelle, /\.unter-reiter-leiste::-webkit-scrollbar \{ display: none; \}/);
  /* Die Knoepfe teilen sich die Breite zu gleichen Dritteln und
     umbrechen nie. Reicht der Platz einmal nicht, weichen die Drittel
     zugunsten des Textes und die Leiste wird wischbar — umbrochen wird
     trotzdem nicht. */
  const knopfRegel = quelle.match(/\n        \.unter-reiter \{[^}]*\}/);
  assert.ok(knopfRegel, "Die Regel .unter-reiter fehlt");
  assert.match(knopfRegel[0], /flex: 1 1 0/);
  assert.match(knopfRegel[0], /white-space: nowrap/);
});

test("Eine Bewertung aus der Watchlist heraus schaltet „Am Schauen“ ab", () => {
  // watchlistBewerten schickt beide Kennzeichen mit — sonst bliebe der
  // Eintrag nach dem Speichern im Reiter "Am Schauen" stehen.
  const stelle = quelle.indexOf("async function watchlistBewerten");
  assert.ok(stelle > 0, "watchlistBewerten nicht gefunden");
  const rumpf = quelle.slice(stelle, stelle + 2500);
  assert.match(rumpf, /watchlist: false,\s*\n\s*amSchauen: false,/);
});
