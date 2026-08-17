/**
 * Prueft, dass jede Datei unter api/ ueberhaupt ladbar ist.
 *
 * Anlass ist ein echter Ausfall: In api/items.js stand in einem
 * SQL-Kommentar mitten im Template-String ein in Backticks gesetztes
 * Wort ("`ratedAt`"). Das erste dieser Zeichen beendet in JavaScript
 * den Template-String — die Datei liess sich nicht mehr uebersetzen.
 *
 * Ausgefallen ist damit der gesamte Endpunkt, und zwar so frueh, dass
 * kein try/catch im Handler noch greifen konnte: Der Fehler entsteht
 * beim Laden des Moduls. Die Antwort war ein nackter 500 ohne Rumpf,
 * in der App sichtbar als "Laden fehlgeschlagen (500)" — ohne jeden
 * Hinweis auf die Ursache.
 *
 * Ein Syntaxfehler faellt sonst nirgends auf: Die Dateien unter api/
 * laufen nur auf dem Server, der Vite-Build fasst sie nicht an, und
 * die uebrigen Tests laden jeweils nur den einen Endpunkt, um den es
 * ihnen geht. Deshalb hier einmal alle.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const apiVerzeichnis = join(dirname(fileURLToPath(import.meta.url)), "..", "api");

const dateien = (await readdir(apiVerzeichnis)).filter((n) => n.endsWith(".js")).sort();

test("es gibt ueberhaupt Endpunkte zu pruefen", () => {
  assert.ok(dateien.length > 0, "keine Dateien in api/ gefunden");
});

for (const name of dateien) {
  test("api/" + name + " laesst sich uebersetzen", async () => {
    /* Importieren reicht als Pruefung: Ein Syntaxfehler wirft hier
       genau so, wie er es auf dem Server tun wuerde. Die Module haben
       beim blossen Laden keine Nebenwirkungen — die Datenbank-
       Verbindung entsteht erst beim ersten Zugriff (siehe api/_db.js),
       gerade damit ein fehlendes DATABASE_URL nicht schon den Import
       sprengt. */
    await import(pathToFileURL(join(apiVerzeichnis, name)).href);
  });
}
