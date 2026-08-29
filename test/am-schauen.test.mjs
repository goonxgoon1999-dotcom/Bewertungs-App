/**
 * Tests fuer den Unter-Reiter "Am Schauen" — die reine Logik in
 * src/App.jsx.
 *
 * Wie in app-logik.test.mjs wird die Datei mit esbuild uebersetzt, um
 * eine Ausfuhrliste ergaenzt und dann geladen. Getestet wird damit
 * genau der Code, der auch im Browser laeuft; gerendert wird nichts.
 *
 * Die Zusagen:
 *
 *   1. Mit `amSchauen = false` und den Fortschrittsfeldern auf null
 *      verhaelt sich die Zuordnung zu den Reitern exakt wie vorher.
 *   2. Ein Eintrag erscheint nie in gar keinem Reiter — geprueft ueber
 *      alle Kombinationen aus bewertet / vorgemerkt / am Schauen.
 *   3. Der Rewatch-Fall: ein bewerteter Eintrag mit `amSchauen = true`
 *      steht in der Rangliste UND im neuen Reiter.
 *   4. "+1" ueber ein Staffelende hinweg, mit und ohne naechste
 *      Staffel.
 *   5. Ein Eintrag ohne Episodendaten hat keinen Fortschritt — und
 *      stuerzt nirgends ab.
 *   6. Die Kennzeichnung im Duplikat-Dialog in allen Kombinationen.
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
  "istVorgemerkt",
  "istAmSchauen",
  "amSchauenLabel",
  "inReiterBewertet",
  "inReiterAmSchauen",
  "inReiterWatchlist",
  "fortschrittStand",
  "fortschrittWeiter",
  "fortschrittText",
  "duplikatText",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-schauen-"));
  const datei = join(verzeichnis, "am-schauen.mjs");

  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );

  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();

/* Ein Eintrag, wie ihn normalizeEntry liefert — beschraenkt auf die
   Felder, um die es hier geht. */
function eintrag(felder) {
  return {
    id: "x",
    title: "Titel",
    watchlist: false,
    amSchauen: false,
    staffelNr: null,
    folgeNr: null,
    episodesPerSeason: [],
    ...felder,
  };
}

/* ---------------------------------------------------------------- *
 * 1. Regression: ohne die neuen Felder aendert sich nichts
 * ---------------------------------------------------------------- */

test("Ohne die neuen Felder bleibt die Zuordnung zu den Reitern wie bisher", () => {
  const bewertet = eintrag({});
  const vorgemerkt = eintrag({ watchlist: true });

  assert.equal(app.inReiterBewertet(bewertet), true);
  assert.equal(app.inReiterWatchlist(bewertet), false);
  assert.equal(app.inReiterAmSchauen(bewertet), false);

  assert.equal(app.inReiterBewertet(vorgemerkt), false);
  assert.equal(app.inReiterWatchlist(vorgemerkt), true);
  assert.equal(app.inReiterAmSchauen(vorgemerkt), false);
});

test("Ein Eintrag ganz ohne die neuen Felder gilt als nicht am Schauen", () => {
  /* Genau die Form, in der ein Backup von vor dieser Aenderung und
     eine aeltere Server-Antwort ankommen: die Felder fehlen. */
  const alt = { id: "a", title: "Alt", watchlist: false };
  assert.equal(app.istAmSchauen(alt), false);
  assert.equal(app.inReiterBewertet(alt), true);
  assert.equal(app.inReiterAmSchauen(alt), false);
  assert.equal(app.inReiterWatchlist(alt), false);
});

/* ---------------------------------------------------------------- *
 * 2. Kein Eintrag faellt zwischen die Reiter
 * ---------------------------------------------------------------- */

test("Jede Kombination aus bewertet, vorgemerkt und am Schauen landet in mindestens einem Reiter", () => {
  for (const watchlist of [false, true]) {
    for (const amSchauen of [false, true]) {
      const e = eintrag({ watchlist, amSchauen });
      const reiter = [
        app.inReiterBewertet(e) && "bewertet",
        app.inReiterAmSchauen(e) && "amschauen",
        app.inReiterWatchlist(e) && "watchlist",
      ].filter(Boolean);
      assert.ok(
        reiter.length >= 1,
        "watchlist=" + watchlist + ", amSchauen=" + amSchauen + " steht in keinem Reiter"
      );
    }
  }
});

test("Ein vorgemerkter Eintrag am Schauen verschwindet aus der Watchlist, behaelt sie aber", () => {
  const e = eintrag({ watchlist: true, amSchauen: true });
  assert.equal(app.inReiterWatchlist(e), false, "wird in der Watchlist noch angezeigt");
  assert.equal(app.inReiterAmSchauen(e), true);
  // Das Merkmal selbst bleibt stehen — sonst kaeme er beim Ausschalten
  // nicht zurueck.
  assert.equal(e.watchlist, true);
  assert.equal(app.istVorgemerkt(e), true);
  // Und genau das ist der Rueckweg:
  assert.equal(app.inReiterWatchlist(eintrag({ watchlist: true, amSchauen: false })), true);
});

/* ---------------------------------------------------------------- *
 * 3. Rewatch: bewertet UND am Schauen
 * ---------------------------------------------------------------- */

test("Ein bewerteter Eintrag am Schauen steht in der Rangliste und im neuen Reiter", () => {
  const e = eintrag({ watchlist: false, amSchauen: true });
  assert.equal(app.inReiterBewertet(e), true, "faellt aus der Rangliste");
  assert.equal(app.inReiterAmSchauen(e), true, "fehlt im neuen Reiter");
  assert.equal(app.inReiterWatchlist(e), false);
});

/* ---------------------------------------------------------------- *
 * 4. "+1" ueber das Staffelende hinweg
 * ---------------------------------------------------------------- */

test("Innerhalb der Staffel zaehlt +1 die Folge hoch", () => {
  const e = eintrag({ amSchauen: true, staffelNr: 2, folgeNr: 4, episodesPerSeason: [12, 10, 8] });
  const stand = app.fortschrittStand(e);
  assert.deepEqual(stand, { staffel: 2, folge: 4, gesamt: 10, staffeln: 3 });
  assert.deepEqual(app.fortschrittWeiter(stand), { staffelNr: 2, folgeNr: 5 });
  assert.equal(app.fortschrittText(stand), "S2 · 4/10");
});

test("Auf der letzten Folge springt der naechste Druck auf die naechste Staffel, Folge 1", () => {
  const vorletzte = app.fortschrittStand(
    eintrag({ amSchauen: true, staffelNr: 2, folgeNr: 9, episodesPerSeason: [12, 10, 8] })
  );
  // Erst noch auf die letzte Folge dieser Staffel ...
  assert.deepEqual(app.fortschrittWeiter(vorletzte), { staffelNr: 2, folgeNr: 10 });

  // ... und erst der naechste Druck wechselt die Staffel.
  const letzte = app.fortschrittStand(
    eintrag({ amSchauen: true, staffelNr: 2, folgeNr: 10, episodesPerSeason: [12, 10, 8] })
  );
  assert.deepEqual(app.fortschrittWeiter(letzte), { staffelNr: 3, folgeNr: 1 });
});

test("Ohne naechste Staffel bleibt der Stand auf der letzten Folge stehen", () => {
  const stand = app.fortschrittStand(
    eintrag({ amSchauen: true, staffelNr: 3, folgeNr: 8, episodesPerSeason: [12, 10, 8] })
  );
  assert.equal(
    app.fortschrittWeiter(stand),
    null,
    "am Ende der letzten Staffel wird trotzdem noch weitergezaehlt"
  );
});

test("Der Anfangsstand einer frisch eingeschalteten Staffel ist Folge 0", () => {
  const stand = app.fortschrittStand(
    eintrag({ amSchauen: true, staffelNr: 1, folgeNr: 0, episodesPerSeason: [12] })
  );
  assert.deepEqual(stand, { staffel: 1, folge: 0, gesamt: 12, staffeln: 1 });
  assert.equal(app.fortschrittText(stand), "S1 · 0/12");
  assert.deepEqual(app.fortschrittWeiter(stand), { staffelNr: 1, folgeNr: 1 });
});

test("Nie gesetzte Felder gelten als Staffel 1, Folge 0 — und nicht als fehlende Daten", () => {
  const stand = app.fortschrittStand(
    eintrag({ amSchauen: true, staffelNr: null, folgeNr: null, episodesPerSeason: [6, 6] })
  );
  assert.deepEqual(stand, { staffel: 1, folge: 0, gesamt: 6, staffeln: 2 });
});

/* ---------------------------------------------------------------- *
 * 5. Ohne Episodendaten kein Fortschritt — und kein Absturz
 * ---------------------------------------------------------------- */

test("Ohne Episodenzahlen je Staffel gibt es keinen Fortschritt", () => {
  // Der Film: Laufzeit ja, Staffelliste nein.
  assert.equal(app.fortschrittStand(eintrag({ amSchauen: true, episodesPerSeason: [] })), null);
  // Das Spiel: gar keine Laufzeitdaten.
  assert.equal(
    app.fortschrittStand(eintrag({ amSchauen: true, episodesPerSeason: undefined })),
    null
  );
  // Ein Eintrag, dessen Nachladen die Daten nie liefern konnte.
  const ohneFeld = { id: "b", title: "Ohne", watchlist: false, amSchauen: true };
  assert.equal(app.fortschrittStand(ohneFeld), null);
});

test("Kein Fortschritt heisst auch: kein Weiterzaehlen, aber kein Fehler", () => {
  assert.equal(app.fortschrittWeiter(null), null);
  assert.equal(app.fortschrittStand(null), null);
  assert.equal(app.fortschrittStand(undefined), null);
});

test("Steht der Stand hinter der bekannten Staffelliste, gibt es keinen Fortschritt", () => {
  /* Kann vorkommen, wenn die Quelle spaeter weniger Staffeln meldet
     oder von Hand eine hoehere gesetzt wurde. Angezeigt wird dann
     nichts — abstuerzen darf dabei nichts. */
  const stand = app.fortschrittStand(
    eintrag({ amSchauen: true, staffelNr: 9, folgeNr: 3, episodesPerSeason: [12, 10] })
  );
  assert.equal(stand, null);
});

test("Der Eintrag steht auch ohne Fortschritt im Reiter", () => {
  const e = eintrag({ amSchauen: true, episodesPerSeason: [] });
  assert.equal(app.inReiterAmSchauen(e), true);
  assert.equal(app.fortschrittStand(e), null);
});

/* ---------------------------------------------------------------- *
 * 6. Die Kennzeichnung im Duplikat-Dialog
 * ---------------------------------------------------------------- */

/* Der Satz, den der Dialog zeigt — gebaut aus dem, was
   `bekannteEintraege` je Treffer mitgibt. */
function satz(treffer, category = "series") {
  return app.duplikatText(
    { treffer: { title: "Titel", ...treffer }, kandidat: { title: "Titel" } },
    "Serien",
    category
  );
}

test("Bewertet steht vor am Schauen steht vor vorgemerkt", () => {
  // Nur bewertet.
  assert.match(satz({ watchlist: false, amSchauen: false }), /ist bereits bewertet/);
  // Bewertet UND am Schauen — der Rewatch-Fall: die Bewertung gewinnt.
  assert.match(satz({ watchlist: false, amSchauen: true }), /ist bereits bewertet/);
  // Vorgemerkt und am Schauen.
  assert.match(satz({ watchlist: true, amSchauen: true }), /ist bereits am Schauen/);
  // Nur vorgemerkt.
  assert.match(satz({ watchlist: true, amSchauen: false }), /ist bereits vorgemerkt/);
});

test("Ein Treffer ohne das neue Feld wird weiter wie bisher benannt", () => {
  /* Genau der bisherige Zustand: `bekannteEintraege` ohne `amSchauen`.
     Daran darf sich nichts geaendert haben. */
  assert.match(satz({ watchlist: false }), /ist bereits bewertet/);
  assert.match(satz({ watchlist: true }), /ist bereits vorgemerkt/);
});

test("Bei Spielen heisst es „am Spielen“", () => {
  assert.match(satz({ watchlist: true, amSchauen: true }, "game"), /ist bereits am Spielen/);
  assert.equal(app.amSchauenLabel("game"), "Am Spielen");
  assert.equal(app.amSchauenLabel("series"), "Am Schauen");
  assert.equal(app.amSchauenLabel("movie"), "Am Schauen");
});
