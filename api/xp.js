import { sql, ensureReady, rowToXp, XP_ZEILE } from "./_db.js";

/**
 * Aktivitaets-Punkte des Nutzers.
 *
 *   GET  /api/xp                                   -> { xp, once }
 *   POST /api/xp   { source, count?, once? }       -> { xp, once, granted }
 *
 * Wie viele Punkte eine Aktion wert ist, entscheidet ausschliesslich
 * der Server (siehe XP_QUELLEN) — das Frontend meldet nur, was
 * passiert ist. `granted` sagt zurueck, wie viele Punkte wirklich
 * dazugekommen sind; daran erkennt die Oberflaeche, ob sie eine
 * Einblendung zeigen muss.
 *
 * Punkte werden nur addiert. Es gibt keinen Weg, sie zu verringern
 * oder zurueckzusetzen.
 */

/* Was eine Aktion einbringt. Die Schluessel sind der Vertrag mit dem
   Frontend; Unbekanntes wird abgewiesen. */
const XP_QUELLEN = {
  // Eine neue Bewertung abgegeben.
  bewertung: 10,
  // Ein vorgemerkter Eintrag wurde bewertet.
  watchlist: 15,
  // Ein Head-to-Head-Duell gespielt.
  duell: 2,
  /* Ein Turnier abgeschlossen. Die Quelle ist fertig angelegt und
     gueltig, wird aber noch von niemandem ausgeloest — ein
     Turnier-Minispiel gibt es bisher nicht. Sobald es dazukommt,
     genuegt ein Aufruf mit dieser Quelle. */
  turnier: 25,
  // Neuer persoenlicher Bestwert bei Higher or Lower.
  highscore: 10,
  /* In jeder vorhandenen Kategorie ist mindestens ein Titel bewertet.
     Welche Kategorien es gibt, entscheidet das Frontend aus seiner
     Kategorienliste — hier steht nur, was der Bonus wert ist. */
  "alle-kategorien": 20,
};

/* Nur diese Einmal-Schluessel sind erlaubt. Ein Einmal-Bonus wird
   genau einmal gutgeschrieben, danach steht sein Schluessel in `once`
   und jeder weitere Versuch bringt 0 Punkte. */
const EINMAL_SCHLUESSEL = [
  // Der Kategorie-Bonus.
  "alle-kategorien",
  /* Die einmalige Anrechnung des Bestands: Bewertungen, die es schon
     gab, bevor es die Punkte gab. Das Frontend meldet dafuer die Zahl
     der vorhandenen Bewertungen als `count`. */
  "bestand",
];

/* Obergrenze fuer `count`. Sie faengt Unsinn ab, ohne je eine echte
   Sammlung zu beschneiden. */
const MAX_COUNT = 100000;

export default async function handler(req, res) {
  try {
    await ensureReady();

    if (req.method === "GET") return await lies(req, res);
    if (req.method === "POST") return await gib(req, res);

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Methode nicht erlaubt." });
  } catch (err) {
    console.error("API-Fehler:", err);
    return res.status(500).json({ error: "Serverfehler: " + (err.message || "unbekannt") });
  }
}

/** Der aktuelle Stand. Noch nie gespielt heisst 0 und keine Boni. */
async function lies(req, res) {
  const rows = await sql`SELECT * FROM user_progress WHERE id = ${XP_ZEILE}`;
  if (!rows.length) return res.status(200).json({ xp: 0, once: [] });
  return res.status(200).json(rowToXp(rows[0]));
}

async function gib(req, res) {
  const body = req.body || {};
  const source = typeof body.source === "string" ? body.source : "";
  const einmal = typeof body.once === "string" && body.once ? body.once : null;

  if (!Object.prototype.hasOwnProperty.call(XP_QUELLEN, source)) {
    return res.status(400).json({ error: "Unbekannte XP-Quelle." });
  }
  if (einmal !== null && !EINMAL_SCHLUESSEL.includes(einmal)) {
    return res.status(400).json({ error: "Unbekannter Einmal-Bonus." });
  }

  /* `count` gibt es nur fuer die Anrechnung des Bestands: dort steht
     eine Quelle fuer viele gleiche Vorgaenge auf einmal. Fehlt sie,
     zaehlt der Vorgang einfach einmal. */
  const count = body.count === undefined ? 1 : body.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > MAX_COUNT) {
    return res.status(400).json({ error: "Ungültige Anzahl (0–" + MAX_COUNT + " erforderlich)." });
  }

  const now = Date.now();
  const punkte = XP_QUELLEN[source] * count;

  // Die Zeile anlegen, falls es sie noch nicht gibt — ohne dabei
  // einen bestehenden Stand anzufassen.
  await sql`
    INSERT INTO user_progress (id, xp, once, updated_at)
    VALUES (${XP_ZEILE}, 0, '', ${now})
    ON CONFLICT (id) DO NOTHING
  `;

  /* Gutschreiben und den Einmal-Schluessel anhaengen in einem Schritt.
     Die Bedingung in WHERE laesst das UPDATE ins Leere laufen, wenn es
     den Bonus schon gab — dann kommen 0 Zeilen zurueck. Erst lesen und
     dann schreiben waere hier falsch: zwei Meldungen dicht
     hintereinander koennten denselben Bonus zweimal gutschreiben. */
  const rows = await sql`
    UPDATE user_progress
       SET xp   = xp + ${punkte},
           once = CASE
                    WHEN ${einmal}::text IS NULL THEN once
                    WHEN once = ''               THEN ${einmal}::text
                    ELSE once || '|' || ${einmal}::text
                  END,
           updated_at = ${now}
     WHERE id = ${XP_ZEILE}
       AND (
         ${einmal}::text IS NULL
         OR ('|' || once || '|') NOT LIKE ('%|' || ${einmal}::text || '|%')
       )
    RETURNING *
  `;

  if (!rows.length) {
    // Der Einmal-Bonus stand schon in der Liste: nichts dazugekommen.
    const stand = await sql`SELECT * FROM user_progress WHERE id = ${XP_ZEILE}`;
    return res.status(200).json({ ...rowToXp(stand[0]), granted: 0 });
  }
  return res.status(200).json({ ...rowToXp(rows[0]), granted: punkte });
}
