/**
 * Tests fuer den Uebungsmodus der Minispiele in src/App.jsx —
 * den Schalter (ladeUebungsmodus, speichereUebungsmodus), den
 * schreibfreien Rueckruf (uebungsDuell), den Hinweis im Spiel
 * (UebungAbzeichen) und die Verdrahtung in MinispielePage.
 *
 * Wie in duell-zuschlag-verrechnen.test.mjs wird die Datei im
 * Original geprueft und nicht als Kopie: uebersetzt, um eine
 * Ausfuhrliste ergaenzt, geladen. Was sich rendern laesst, wird mit
 * renderToStaticMarkup wirklich gerendert; wo der Zustand einer
 * Komponente im Weg steht (die Runden eines laufenden Turniers),
 * prueft der Test den Quelltext — dieselbe Vorgehensweise wie in
 * duell-sperrfrist.test.mjs.
 *
 * Die Zusagen:
 *
 *   1. Der Schalter ist aus, solange niemand ihn umlegt, und sein
 *      Zustand ueberdauert im localStorage.
 *   2. Im Uebungsmodus tritt uebungsDuell an die Stelle von onDuell.
 *      Es schreibt nichts und meldet keine gespielte Paarung zurueck —
 *      damit ruehrt sich weder Elo noch Zuschlag noch Endnote, und
 *      auch die beiden Zeilen ueber dem Spiel bleiben stehen.
 *   3. Ausgewertet wird der Schalter beim Start eines Spiels: das
 *      laufende Spiel haengt an `uebungLaeuft`, nicht am Schalter.
 *   4. Solange im Uebungsmodus gespielt wird, steht der Hinweis in
 *      der Kopfzeile — im Turnier ueber alle Runden hinweg, und beim
 *      Sieger steht, dass nicht gewertet wurde.
 *   5. Higher or Lower und "Was schau ich?" bekommen den Schalter
 *      nicht zu sehen und laufen unveraendert.
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

const GEPRUEFT = [
  "UEBUNGSMODUS_SCHLUESSEL",
  "ladeUebungsmodus",
  "speichereUebungsmodus",
  "uebungsDuell",
  "UebungAbzeichen",
  "UebungsmodusSchalter",
  "MinispielePage",
  "HeadToHead",
  "Turnier",
  "CATEGORIES",
  "ELO_START",
];

async function ladeLogik() {
  const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const { code } = await transform(quelle, { loader: "jsx", format: "esm" });
  const verzeichnis = await mkdtemp(join(tmpdir(), "bewertungsapp-uebung-"));
  const datei = join(verzeichnis, "uebungsmodus.mjs");
  const projekt = new URL("../node_modules/", import.meta.url).href;
  const mitPfaden = code.replace(
    /from\s+"(react[^"]*)"/g,
    (_, name) => 'from "' + projekt + name + '/index.js"'
  );
  await writeFile(datei, mitPfaden + "\nexport { " + GEPRUEFT.join(", ") + " };\n");
  return await import(pathToFileURL(datei).href);
}

const app = await ladeLogik();
const quelle = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

/* Ein localStorage zum Anfassen. Node bringt keins mit; die App
   greift ueber `window` darauf zu und faengt jeden Fehler ab. */
function mitSpeicher(inhalt, arbeit) {
  const vorher = globalThis.window;
  const daten = new Map(Object.entries(inhalt || {}));
  globalThis.window = {
    localStorage: {
      getItem: (k) => (daten.has(k) ? daten.get(k) : null),
      setItem: (k, v) => { daten.set(k, String(v)); },
      removeItem: (k) => { daten.delete(k); },
    },
  };
  try {
    return arbeit(daten);
  } finally {
    if (vorher === undefined) delete globalThis.window;
    else globalThis.window = vorher;
  }
}

/* Ein Geraet ohne localStorage — der Zugriff wirft. */
function ohneSpeicher(arbeit) {
  const vorher = globalThis.window;
  globalThis.window = {
    get localStorage() { throw new Error("kein localStorage"); },
  };
  try {
    return arbeit();
  } finally {
    if (vorher === undefined) delete globalThis.window;
    else globalThis.window = vorher;
  }
}

/* Der Ausschnitt einer Komponente aus dem Quelltext. */
function abschnitt(von, bis) {
  const start = quelle.indexOf(von);
  assert.ok(start >= 0, von + " ist nicht mehr zu finden");
  const ende = quelle.indexOf(bis, start);
  assert.ok(ende > start, bis + " ist nicht mehr zu finden");
  return quelle.slice(start, ende);
}

/* Ein bewerteter Film, wie er in einer Rangliste steht. */
const KRITERIEN = ["story", "charaktere", "unterhaltung", "emotion", "inszenierung", "schauspiel", "sound"];
function film(i) {
  const values = {};
  KRITERIEN.forEach((k) => { values[k] = 8; });
  return {
    id: "f" + i, category: "movie", title: "Testfilm " + i, poster: "",
    releaseYear: 2000 + i, values, personal: 8, seasons: [], watchlist: false,
    elo: app.ELO_START, duels: 0, siege: 0, watchCount: 1, score: 8 - i * 0.1,
  };
}
function ranglisten() {
  const leer = {};
  for (const c of app.CATEGORIES) leer[c.key] = [];
  leer.movie = [1, 2, 3, 4, 5, 6].map(film);
  return leer;
}

/* ---------------------------------------------------------------- *
 * 1. Der Schalter
 * ---------------------------------------------------------------- */

test("Der Schalter ist standardmaessig aus", () => {
  mitSpeicher({}, () => {
    assert.equal(app.ladeUebungsmodus(), false);
  });
});

test("Der Zustand wird lokal gespeichert und wieder gelesen", () => {
  mitSpeicher({}, (daten) => {
    app.speichereUebungsmodus(true);
    assert.equal(daten.get(app.UEBUNGSMODUS_SCHLUESSEL), "1");
    assert.equal(app.ladeUebungsmodus(), true);

    app.speichereUebungsmodus(false);
    assert.equal(daten.get(app.UEBUNGSMODUS_SCHLUESSEL), "0");
    assert.equal(app.ladeUebungsmodus(), false);
  });
});

test("Der Schluessel steht neben den uebrigen lokalen Einstellungen", () => {
  assert.match(app.UEBUNGSMODUS_SCHLUESSEL, /^bewertungsapp\./);
});

test("Ein kaputter Eintrag und ein fehlendes localStorage fallen still auf 'aus' zurueck", () => {
  mitSpeicher({ [app.UEBUNGSMODUS_SCHLUESSEL]: "vielleicht" }, () => {
    assert.equal(app.ladeUebungsmodus(), false);
  });
  ohneSpeicher(() => {
    assert.equal(app.ladeUebungsmodus(), false);
    // Speichern darf ebenfalls nicht durchschlagen.
    assert.doesNotThrow(() => app.speichereUebungsmodus(true));
  });
});

/* ---------------------------------------------------------------- *
 * 2. Was im Uebungsmodus nicht passiert
 * ---------------------------------------------------------------- */

test("uebungsDuell schreibt nichts und meldet keine gespielte Paarung", async () => {
  /* Ein Duell im Uebungsmodus laeuft durch genau diese Funktion.
     Zurueck kommt `null` — dasselbe wie bei onDuell ohne
     Speicherung. Das Head-to-Head traegt die Paarung damit nicht als
     gespielt nach (merkeGespielt steigt bei null sofort aus), und die
     Zeile "X von Y Paarungen gespielt" bleibt stehen. */
  assert.equal(await app.uebungsDuell("movie", "f1", "f2"), null);
  assert.equal(await app.uebungsDuell(), null);
});

test("Im Uebungsmodus fuehrt kein Weg mehr an api.duell", () => {
  const bereich = abschnitt("async function uebungsDuell", "function UebungAbzeichen");
  assert.ok(!/api\./.test(bereich), "uebungsDuell ruft doch einen Endpunkt: " + bereich);
  assert.ok(!/fetch\b/.test(bereich), "uebungsDuell holt doch etwas");
});

test("MinispielePage schickt im Uebungsmodus uebungsDuell statt onDuell", () => {
  const bereich = abschnitt("function MinispielePage", "function DuellKarte");
  assert.match(bereich, /const duellRueckruf = uebungLaeuft \? uebungsDuell : onDuell;/);

  // Und beide Duellspiele bekommen genau diesen einen Rueckruf.
  const anHeadToHead = bereich.slice(bereich.indexOf("<HeadToHead"));
  const anTurnier = bereich.slice(bereich.indexOf("<Turnier"));
  assert.match(anHeadToHead.slice(0, anHeadToHead.indexOf("/>")), /onDuell=\{duellRueckruf\}/);
  assert.match(anTurnier.slice(0, anTurnier.indexOf("/>")), /onDuell=\{duellRueckruf\}/);
});

test("Die Duellspiele haben weiterhin keinen eigenen Weg zum Server", () => {
  /* Wuerde eines der beiden selbst speichern, ginge der Uebungsmodus
     daran vorbei — er sitzt allein an onDuell. */
  for (const [von, bis] of [
    ["function HeadToHead(", "MINISPIEL \"TURNIER\""],
    ["function Turnier(", "MINISPIEL \"HIGHER OR LOWER\""],
  ]) {
    const bereich = abschnitt(von, bis);
    assert.ok(!/api\.duell\b/.test(bereich), von + " meldet Duelle an onDuell vorbei");
  }
});

/* ---------------------------------------------------------------- *
 * 3. Ausgewertet wird beim Start
 * ---------------------------------------------------------------- */

test("Der Modus des laufenden Spiels wird beim Start festgehalten", () => {
  const bereich = abschnitt("function MinispielePage", "function DuellKarte");
  /* Zwei getrennte Zustaende: `uebung` ist der Schalter, `uebungLaeuft`
     der Modus des laufenden Spiels. Nur beim Start wird der eine in
     den anderen uebernommen — ein laufendes Turnier aendert seinen
     Modus damit nicht mehr. */
  assert.match(bereich, /const \[uebung, setUebung\] = useState\(ladeUebungsmodus\)/);
  assert.match(bereich, /const \[uebungLaeuft, setUebungLaeuft\] = useState\(false\)/);
  assert.match(bereich, /function starte\(key\) \{\s*setUebungLaeuft\(uebung\);\s*setSpiel\(key\);/);
  assert.match(bereich, /onClick=\{\(\) => starte\(s\.key\)\}/);

  /* Waehrend eines Spiels darf `uebungLaeuft` nirgends sonst gesetzt
     werden — sonst koennte ein laufendes Turnier doch umspringen. */
  const setzt = bereich.match(/setUebungLaeuft\(/g) || [];
  assert.equal(setzt.length, 1, "uebungLaeuft wird an " + setzt.length + " Stellen gesetzt");
});

test("Der Schalter steht nur im Menue, nicht im laufenden Spiel", () => {
  const seite = abschnitt("function MinispielePage", "function DuellKarte");
  assert.match(seite, /<UebungsmodusSchalter an=\{uebung\} onAendern=\{schalte\} \/>/);
  const treffer = quelle.match(/<UebungsmodusSchalter/g) || [];
  assert.equal(treffer.length, 1, "der Schalter steht an " + treffer.length + " Stellen");
});

test("Der Schalter schreibt seinen Zustand sofort weg", () => {
  const bereich = abschnitt("function MinispielePage", "function DuellKarte");
  assert.match(bereich, /function schalte\(an\) \{\s*setUebung\(an\);\s*speichereUebungsmodus\(an\);/);
});

/* ---------------------------------------------------------------- *
 * 4. Sichtbarkeit waehrend des Spiels
 * ---------------------------------------------------------------- */

test("Das Abzeichen steht in der bestehenden Monospace-Beschriftung", () => {
  const markup = renderToStaticMarkup(createElement(app.UebungAbzeichen));
  assert.match(markup, /ÜBUNG/);
  assert.match(markup, /JetBrains Mono/);
});

test("Head-to-Head zeigt den Hinweis nur im Uebungsmodus", () => {
  const eigenschaften = {
    ranked: ranglisten(),
    duellZahlen: { movie: 12 },
    onDuell: async () => null,
    fehler: "",
    onZurueck: () => {},
  };
  const mit = renderToStaticMarkup(createElement(app.HeadToHead, { ...eigenschaften, uebung: true }));
  const ohne = renderToStaticMarkup(createElement(app.HeadToHead, { ...eigenschaften, uebung: false }));
  assert.match(mit, /ÜBUNG/);
  assert.ok(!/ÜBUNG/.test(ohne), "der Hinweis steht auch im normalen Modus da");
});

test("Turnier zeigt den Hinweis nur im Uebungsmodus", () => {
  const eigenschaften = {
    ranked: ranglisten(),
    onDuell: async () => null,
    fehler: "",
    onZurueck: () => {},
  };
  const mit = renderToStaticMarkup(createElement(app.Turnier, { ...eigenschaften, uebung: true }));
  const ohne = renderToStaticMarkup(createElement(app.Turnier, { ...eigenschaften, uebung: false }));
  assert.match(mit, /ÜBUNG/);
  assert.ok(!/ÜBUNG/.test(ohne), "der Hinweis steht auch im normalen Modus da");
});

test("Im Turnier bleibt der Hinweis ueber alle Runden stehen", () => {
  /* Der Baum eines laufenden Turniers liegt im Zustand der
     Komponente und laesst sich von aussen nicht setzen — geprueft
     wird deshalb die Stelle: Das Abzeichen sitzt in der Kopfzeile,
     und die steht vor der Verzweigung zwischen laufender Paarung und
     Sieger. Damit wird sie in jeder Runde gezeichnet. */
  const turnier = abschnitt("function Turnier(", "MINISPIEL \"HIGHER OR LOWER\"");
  const spielstand = turnier.indexOf("// ---- Turnier ----");
  assert.ok(spielstand > 0, "der Turnierbildschirm ist nicht mehr zu finden");

  const bildschirm = turnier.slice(spielstand);
  const kopf = bildschirm.indexOf("TURNIER · {catInfo.label.toUpperCase()}");
  const verzweigung = bildschirm.indexOf("{paarung ? (");
  assert.ok(kopf > 0, "die Kopfzeile des Turniers ist nicht mehr zu finden");
  assert.ok(verzweigung > kopf, "die Kopfzeile steht nicht mehr vor der Verzweigung");

  const kopfzeile = bildschirm.slice(kopf, verzweigung);
  assert.match(kopfzeile, /\{uebung && <UebungAbzeichen \/>\}/);
});

test("Beim Sieger eines Uebungsturniers steht, dass nicht gewertet wurde", () => {
  const turnier = abschnitt("function Turnier(", "MINISPIEL \"HIGHER OR LOWER\"");
  const sieger = turnier.indexOf("TURNIERSIEGER");
  assert.ok(sieger > 0, "der Siegerbereich ist nicht mehr zu finden");
  const bereich = turnier.slice(sieger, turnier.indexOf("Neues Turnier"));
  assert.match(bereich, /\{uebung && \(/);
  assert.match(bereich, /nicht gewertet/);
});

/* ---------------------------------------------------------------- *
 * 5. Die uebrigen Minispiele
 * ---------------------------------------------------------------- */

test("Higher or Lower und 'Was schau ich?' bekommen den Schalter nicht", () => {
  const bereich = abschnitt("function MinispielePage", "function DuellKarte");
  const hol = bereich.slice(bereich.indexOf("<HigherOrLower"));
  const wsi = bereich.slice(bereich.indexOf("<WasSchauIch"));
  assert.ok(!/uebung/.test(hol.slice(0, hol.indexOf("/>"))), "Higher or Lower bekommt den Modus gereicht");
  assert.ok(!/uebung/.test(wsi.slice(0, wsi.indexOf("/>"))), "Was schau ich? bekommt den Modus gereicht");
});

test("Der Schalter sagt selbst, dass er nur fuer zwei Spiele gilt", () => {
  const markup = renderToStaticMarkup(
    createElement(app.UebungsmodusSchalter, { an: false, onAendern: () => {} })
  );
  assert.match(markup, /Übungsmodus/);
  assert.match(markup, /Duelle zählen nicht/);
  assert.match(markup, /Elo, Duell-Zuschlag und Endnoten bleiben\s+unverändert/);
  assert.match(markup, /nur für Head-to-Head und Turnier/);
  // Und er ist als Schalter bedienbar, nicht nur ein Text.
  assert.match(markup, /role="switch"/);
  assert.match(markup, /aria-checked="false"/);

  const an = renderToStaticMarkup(
    createElement(app.UebungsmodusSchalter, { an: true, onAendern: () => {} })
  );
  assert.match(an, /aria-checked="true"/);
});
