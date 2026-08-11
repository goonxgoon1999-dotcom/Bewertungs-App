# Bewertungs-App — Filme, Serien, Anime

Persönliche Bewertungs-App mit 7 gewichteten Kriterien + Bauchgefühl,
getrennten Rankings, Filtern, Statistik, Postern und echter Datenbank.

- **Frontend:** React + Vite
- **Backend:** Vercel Serverless Functions (Ordner `api/`)
- **Datenbank:** Neon Postgres (kostenloser Plan)
- **Poster:** automatisch über Jikan / TVMaze / iTunes — **kein API-Key nötig**

---

## Schritt 1 — Projekt zu GitHub hochladen

1. Auf github.com ein neues, leeres Repository anlegen (z. B. `bewertungs-app`).
2. Diesen Ordner dort hochladen. Entweder über die GitHub-Weboberfläche
   („Add file" → „Upload files", den ganzen Ordnerinhalt hineinziehen),
   oder im Terminal:

```bash
git init
git add .
git commit -m "Bewertungs-App"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/bewertungs-app.git
git push -u origin main
```

**Wichtig:** `node_modules` nicht hochladen — die `.gitignore` verhindert das bereits.

---

## Schritt 2 — Bei Vercel deployen

1. Auf [vercel.com](https://vercel.com) mit dem GitHub-Konto anmelden.
2. „Add New…" → „Project" → dein Repository auswählen → **Import**.
3. Vercel erkennt Vite automatisch. Einstellungen unverändert lassen.
4. Auf **Deploy** klicken.

Der erste Build läuft durch, aber die App zeigt noch einen Ladefehler —
die Datenbank fehlt noch. Das ist Schritt 3.

---

## Schritt 3 — Neon-Datenbank verbinden (kostenlos)

1. Im Vercel-Projekt oben auf den Reiter **Storage**.
2. **Create Database** → **Neon** (Serverless Postgres) auswählen.
3. Kostenlosen Plan wählen, Region möglichst nah (z. B. Frankfurt).
4. Bestätigen, dass die Datenbank mit **diesem Projekt** verbunden wird.

Vercel legt die Zugangsdaten danach automatisch als Umgebungsvariable an
(`DATABASE_URL` bzw. `POSTGRES_URL`). Du musst nichts von Hand eintragen.

5. Zurück auf den Reiter **Deployments** → beim neuesten Deployment
   **Redeploy** klicken, damit die App die Datenbank sieht.

Beim ersten Aufruf legt die App die Tabelle selbst an und füllt sie
einmalig mit deinen 148 Filmen. Alle Kriterien werden dabei auf die
bisherige Endnote gesetzt, sodass die Noten exakt erhalten bleiben.

---

## Schritt 4 — Alte Bewertungen übernehmen

Falls du in der Artefakt-Version Serien/Anime oder neue Filme angelegt hast:

1. Dort über „⇅ Daten" → **Alles exportieren** (JSON) sichern.
2. In der neuen App über „⇅ Daten" → **JSON-Datei importieren**.

Der Import ergänzt nur und überschreibt nichts.

---

## Poster

Die Poster-Suche läuft **serverseitig** (`api/poster.js`), damit es keine
CORS-Probleme gibt. Beim Öffnen der App werden fehlende Poster automatisch
nachgeladen und dauerhaft am Eintrag gespeichert — auch für alle Altfilme.
Du musst nichts manuell eintragen. Eine eigene Poster-URL kannst du im
Formular trotzdem angeben; sie wird dann nie automatisch überschrieben.

Quellen: Anime → Jikan, Serien → TVMaze, Filme → iTunes. Anime und Serien
haben iTunes als Fallback; für Filme gibt es keinen, weil TVMaze
ausschließlich Serien kennt. Alle Quellen sind ohne Anmeldung und ohne
API-Key nutzbar.

Es wird nicht einfach der erste Suchtreffer genommen: Jede Quelle liefert
bis zu 15 Kandidaten, deren Titel mit dem gesuchten abgeglichen werden
(ohne Groß-/Kleinschreibung, Sonderzeichen und Jahreszahlen). Erreicht
kein Kandidat 60 % Wortüberschneidung, bleibt der Eintrag lieber ohne
Poster, statt ein falsches zu zeigen.

Sind bereits falsche Poster gespeichert, lassen sie sich alle auf einmal
zum Neusuchen freigeben — per Button in der App oder von Hand:

```bash
curl -X POST https://<deine-domain>/api/reset-posters
# -> { "ok": true, "zurueckgesetzt": 42, "cleared": 42 }
```

Das leert nur automatisch gefundene Poster — von Hand eingetragene
(`posterSource: "manual"`) bleiben erhalten. Beim nächsten Öffnen der App
werden die geleerten Einträge neu gesucht.

### Wenn ein Poster fehlt

Bleibt ein Eintrag ohne Poster, verrät `?debug=1`, woran es lag:

```bash
curl "https://<deine-domain>/api/poster?title=Severance&category=series&debug=1"
```

Die Antwort enthält dann pro Quelle den HTTP-Status (oder den Fehlertext,
falls die Anfrage selbst scheiterte), die Zahl der Kandidaten, die ersten
fünf Kandidatentitel und den höchsten erreichten Ähnlichkeitswert:

```json
{
  "url": null,
  "debug": {
    "title": "Severance", "category": "series", "minSimilarity": 0.6,
    "sources": [
      { "source": "TVMaze", "status": 200, "error": null,
        "candidates": 3, "titles": ["Severance", "..."], "bestScore": 1 }
    ]
  }
}
```

Damit lässt sich unterscheiden, ob die Quelle gar nicht antwortete
(`status`/`error`), nichts fand (`candidates: 0`) oder der Titel schlicht
zu weit auseinanderlag (`bestScore` unter `minSimilarity`). Ein hoher
`bestScore` bei `url: null` heißt: Titel gefunden, aber ohne Bild.
Ohne `debug=1` bleibt die Antwort unverändert schlank.

---

## Lokal entwickeln (optional)

```bash
npm install
npm i -g vercel     # einmalig
vercel link         # mit dem Vercel-Projekt verbinden
vercel env pull     # Datenbank-Zugangsdaten holen
vercel dev          # startet Frontend + API zusammen
```

---

## API-Übersicht

| Methode | Pfad | Zweck |
|---------|------|-------|
| GET | `/api/items` | Alle Einträge, nach Kategorie gruppiert |
| POST | `/api/items` | Neuen Eintrag anlegen |
| PUT | `/api/items?id=…` | Eintrag ändern |
| DELETE | `/api/items?id=…` | Eintrag löschen |
| GET | `/api/poster?title=…&category=…` | Poster-URL suchen (`&debug=1` für Diagnose) |
| POST | `/api/reset-posters` | Automatisch gefundene Poster leeren (Neusuche) |

Alle Eingaben werden serverseitig validiert: Titel darf nicht leer sein,
alle Werte müssen zwischen 0 und 10 liegen, Kategorie muss gültig sein.

---

## Berechnung (unverändert)

```
Kriteriennote = Story×0.25 + Charaktere×0.20 + Unterhaltung×0.15
              + Emotion×0.15 + Inszenierung×0.10 + Schauspiel×0.10
              + Sound×0.05

Endnote = Kriteriennote × 0.75 + Bauchgefühl × 0.25
```

Beide Werte auf zwei Nachkommastellen gerundet.
