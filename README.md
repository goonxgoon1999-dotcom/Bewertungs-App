# Bewertungs-App — Filme, Serien, Anime, Spiele

Persönliche Bewertungs-App mit 7 gewichteten Kriterien je Kategorie
+ Bauchgefühl,
getrennten Rankings, Filtern, Statistik, Postern und echter Datenbank.

- **Frontend:** React + Vite
- **Backend:** Vercel Serverless Functions (Ordner `api/`)
- **Datenbank:** Neon Postgres (kostenloser Plan)
- **Kategorien:** Filme, Serien, Anime und Spiele — je mit eigenen Kriterien
- **Poster:** automatisch über TMDB / Jikan / TVMaze / iTunes, Spiele über SteamGridDB
- **Angaben zum Werk:** Erscheinungsjahr und Regie über TMDB, IMDb-Note als
  Vergleichswert über OMDb — bei Filmen, Serien und Anime

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

## Kategorien und Kriterien

Jede Kategorie hat eigene Kriterien. Die Endnote entsteht überall gleich:
75 % Kriterien-Note + 25 % Bauchgefühl.

**Filme, Serien und Anime** (identische Felder und Gewichte):

| Kriterium | Gewicht |
|-----------|---------|
| Story & Drehbuch | 25 % |
| Charaktere | 20 % |
| Unterhaltung | 15 % |
| Emotion & Wirkung | 15 % |
| Inszenierung | 10 % |
| Schauspiel | 10 % |
| Soundtrack / Sounddesign | 5 % |

Bei **Anime** heißen zwei davon anders: „Inszenierung" wird als
**Animation** angezeigt, „Schauspiel" als **Synchronstimme**. Das ist
reine Beschriftung — dieselben Datenfelder, dieselben Gewichte,
dieselben gespeicherten Werte.

**Spiele:**

| Kriterium | Gewicht |
|-----------|---------|
| Gameplay | 25 % |
| Story | 25 % |
| Charaktere | 15 % |
| Welt | 15 % |
| Grafik | 10 % |
| Sound | 5 % |
| Wiederspielwert | 5 % |

### Staffeln (Serien und Anime)

Serien und Anime lassen sich optional in Staffeln unterteilen. Jede
Staffel hat dieselben sieben Kriterien, ein eigenes Bauchgefühl und
eine **Gewichtung in Prozent** zwischen 0 % und 200 % (Voreinstellung
100 %, in 5-Prozent-Schritten). Gerechnet wird intern mit Faktoren
(Prozent ÷ 100); die Endnote ist der gewichtete Durchschnitt:

```
Endnote = Σ(Staffelnote × Faktor) / Σ(Faktoren)
```

0 % blendet eine Staffel aus der Wertung aus, 200 % zählt sie doppelt.
Stehen alle Staffeln auf 0 %, gilt der Eintrag als unbewertet und wird
mit „–" statt einer Note angezeigt. Bestehende Staffeln stehen auf
100 % (Faktor 1.0) und ändern ihre Note dadurch nicht. Angezeigt wird
die Prozentangabe nur, wenn sie von 100 % abweicht.

Die Staffeln liegen in einer eigenen Tabelle `seasons`; ihre ID vergibt
Postgres (Identity). Beim Speichern werden bestehende Staffeln per ID
aktualisiert, neue eingefügt und entfernte gelöscht — Eintrag und
Staffeln gemeinsam in einer Transaktion.

In der Statistik werden Kriterien-Durchschnitte nur innerhalb einer
Kategorie gebildet. Bei „Alle" erscheint deshalb ein Block je Kategorie
statt eines gemeinsamen — die Kriterien sind schlicht nicht dieselben.

---

## Kopfbereich

Oben zeigt die App einen festen 16:9-Ausschnitt über die volle Breite.
Die Bilder dafür werden **von Hand** gepflegt — dafür gibt es keine
automatische Suche.

Im Daten-Panel (⤓) unter „Bilder im Kopfbereich" lassen sich beliebig
viele Adressen eintragen und einzeln wieder entfernen. Sie liegen in
einer eigenen Tabelle und bleiben dauerhaft erhalten.

- Mehrere Adressen wechseln alle 8 Sekunden mit einer Gleit-Animation.
- Eine einzelne Adresse steht fest.
- Ohne Adresse bleibt der Bereich schlicht dunkel.

Die Bilder füllen den Ausschnitt formatfüllend und zentriert
(`object-fit: cover`) bei 90 % Deckkraft; darüber liegt ein Verlauf,
der Titel und Tabs lesbar hält. Eine Adresse, die sich nicht laden
lässt, wird übersprungen.

---

## Poster

Die Poster-Suche läuft **serverseitig** (`api/poster.js`), damit es keine
CORS-Probleme gibt. Beim Öffnen der App werden fehlende Poster automatisch
nachgeladen und dauerhaft am Eintrag gespeichert — auch für alle Altfilme.
Du musst nichts manuell eintragen. Eine eigene Poster-URL kannst du im
Formular trotzdem angeben; sie wird dann nie automatisch überschrieben.

Quellen, jeweils in dieser Reihenfolge:

| Kategorie | Reihenfolge |
|-----------|-------------|
| Filme | TMDB → iTunes |
| Serien | TVMaze → TMDB → iTunes |
| Anime | Jikan → TMDB |
| Spiele | SteamGridDB |

TVMaze taucht bei Filmen nicht auf, weil es ausschließlich Serien kennt.
Für Spiele gibt es nur SteamGridDB — die übrigen Quellen kennen keine
Spiele, ein Treffer dort wäre zwangsläufig falsch.

Es wird nicht einfach der erste Suchtreffer genommen: Jede Quelle liefert
bis zu 15 Kandidaten, deren Titel mit dem gesuchten abgeglichen werden
(ohne Groß-/Kleinschreibung, Sonderzeichen und Jahreszahlen). Erreicht
kein Kandidat 60 % Wortüberschneidung, bleibt der Eintrag lieber ohne
Poster, statt ein falsches zu zeigen.

### TMDB-Schlüssel (optional, aber empfohlen)

TMDB liefert deutsche Titel und die zuverlässigsten Filmposter, braucht
aber einen kostenlosen API-Schlüssel. Auf
[themoviedb.org](https://www.themoviedb.org/settings/api) anlegen und in
Vercel unter **Settings → Environment Variables** als `TMDB_API_KEY`
hinterlegen, danach einmal neu deployen.

Ohne den Schlüssel funktioniert alles weiter: TMDB wird dann einfach
übersprungen, Filme und Anime laufen wie zuvor über iTunes. Der
Schlüssel bleibt auf dem Server und taucht nie im Browser auf.

### SteamGridDB-Schlüssel für Spiele (optional)

Bilder für Spiele kommen von [SteamGridDB](https://www.steamgriddb.com).
Schlüssel dort kostenlos anlegen und in Vercel als
`STEAMGRIDDB_API_KEY` hinterlegen.

Die Abfrage läuft in zwei Schritten: erst wird das Spiel über die
Autovervollständigung gesucht und der Titel wie überall abgeglichen,
dann werden für die gefundene ID die Bilder geholt — `grids` liefert
das Hochkant-Poster (600×900), `heroes` das Breitbild für den
Kopfbereich. Die Anmeldung erfolgt über einen Bearer-Kopf, der
Schlüssel steht also nie in der URL.

Ohne diesen Schlüssel findet für Spiele **keine** automatische Suche
statt — Bilder lassen sich dann nur von Hand im Formular eintragen.
Filme, Serien und Anime sind davon nicht betroffen.

---

## Erscheinungsjahr, Regie und IMDb-Note

Bei Filmen, Serien und Anime kommen im **selben** Abruf, der schon die
Poster ermittelt (`api/poster.js`), drei weitere Angaben mit:

| Angabe | Quelle |
|--------|--------|
| Erscheinungsjahr | TMDB (`release_date` / `first_air_date`), sonst TVMaze (`premiered`) bzw. Jikan (`year`) |
| Regie | TMDB-Credits; bei Serien ersatzweise die Schöpfer (`created_by`), sonst TVMaze `/crew` (Creator) bzw. Jikan `/staff` (Director) |
| IMDb-Note | OMDb, über die IMDb-Kennung aus TMDB oder aus TVMaze (`externals.imdb`) |

Serien und Anime hängen damit nicht mehr an TMDB: TVMaze und Jikan
bringen Jahr und Ersteller selbst mit, TVMaze sogar die IMDb-Kennung.
Auch ohne `TMDB_API_KEY` sind die Angaben dort vollständig.

Sie werden am Eintrag gespeichert und nicht bei jedem Aufruf neu geholt.
Auch bereits vorhandene Einträge laden sie automatisch nach — genauso wie
die Poster, mit derselben Obergrenze pro Seitenaufruf. Angezeigt wird das
Ganze nur in der Detailansicht: Jahr und Regie unter dem Titel, die
IMDb-Note neben der eigenen Endnote. Die Ranglisten bleiben unberührt.

Bei **Spielen** entfällt das vollständig — dort gibt es weiterhin nur
Bilder.

Wird der Titel eines Eintrags geändert, gelten die Angaben nicht mehr und
werden beim nächsten Öffnen neu geholt.

### Von Hand eintragen und überschreiben

Alle drei Angaben lassen sich in der Detailansicht über das Stift-Symbol
jederzeit selbst setzen — auch wenn die automatische Suche schon etwas
gefunden hat. Fehlt eine Angabe, steht an ihrer Stelle ein Feld zum
Anklicken („Jahr · Regie eingeben" bzw. „IMDB eingeben"). Von Hand
eingetragene Werte werden wie die automatisch gefundenen gespeichert und
von der Suche **nie** überschrieben: nachgetragen wird nur, was leer ist.
Ein leeres Feld löscht den Wert wieder und gibt ihn für die Suche frei.

### Fassung der Angaben (`ANGABEN_VERSION`)

Die Antwort von `api/poster.js` liegt einen Tag im CDN und wird bis zu
eine Woche als veralteter Stand weitergereicht. Kommt eine neue Angabe
dazu, lieferte das CDN sonst tagelang alte Antworten ohne die neuen
Felder — das Frontend hielte den Eintrag dann für aussichtslos und würde
ihn nie wieder abfragen. Deshalb trägt jede Antwort eine `angabenVersion`;
die Zahl steckt im Cache-Schlüssel und hängt als `v` an jeder Anfrage.
Wird `ANGABEN_VERSION` in `api/poster.js` erhöht, muss dieselbe Zahl in
`src/App.jsx` mitgezogen werden — dann sind beide Caches auf einen Schlag
entwertet.

### OMDb-Schlüssel für die IMDb-Note (optional)

Die IMDb-Note kommt von [OMDb](https://www.omdbapi.com/apikey.aspx). Den
kostenlosen Schlüssel dort anlegen und in Vercel unter **Settings →
Environment Variables** als `OMDB_API_KEY` hinterlegen, danach einmal neu
deployen.

Ohne den Schlüssel wird OMDb gar nicht erst gefragt: Die Note wird dann
schlicht nicht angezeigt — ein Fehler ist das nicht, alles andere läuft
unverändert weiter. Der Schlüssel bleibt auf dem Server und taucht nie im
Browser auf.

Gesucht wird bevorzugt über die IMDb-Kennung aus TMDB, damit der Treffer
eindeutig ist. Fehlt sie, bleibt die Titelsuche — deren Ergebnis wird wie
überall auf Titelähnlichkeit geprüft, damit nicht die Note eines fremden
Werks am Eintrag landet.

---

Sind bereits falsche Poster gespeichert, lassen sie sich alle auf einmal
zum Neusuchen freigeben — per Button in der App oder von Hand:

```bash
curl -X POST https://<deine-domain>/api/reset-posters
# -> { "ok": true, "zurueckgesetzt": 42, "cleared": 42 }
```

Das leert nur automatisch gefundene Poster — von Hand eingetragene
(`posterSource: "manual"`) bleiben erhalten. Beim nächsten Öffnen der App
werden die geleerten Einträge neu gesucht. Der Knopf in der App gibt
dabei auch die Suche nach Jahr, Regie und IMDb-Note wieder frei; das ist
der Weg, sie nach dem Nachtragen eines Schlüssels erneut zu holen.

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
    "tmdb": "aktiv", "steamgriddb": "aktiv", "omdb": "aktiv",
    "sources": [
      { "source": "TVMaze", "status": 200, "error": null,
        "candidates": 3, "titles": ["Severance", "..."], "bestScore": 1 },
      { "source": "TMDB (tv)", "status": 200, "error": null,
        "candidates": 2, "titles": ["Severance", "..."], "bestScore": 1 }
    ]
  }
}
```

Damit lässt sich unterscheiden, ob die Quelle gar nicht antwortete
(`status`/`error`), nichts fand (`candidates: 0`) oder der Titel schlicht
zu weit auseinanderlag (`bestScore` unter `minSimilarity`). Das Feld
`tmdb` zeigt, ob der Schlüssel erkannt wurde; ein `status: 401` bei
`TMDB` bedeutet, dass er nicht gültig ist. Ein hoher
`bestScore` bei `url: null` heißt: Titel gefunden, aber ohne Bild.
Ohne `debug=1` bleibt die Antwort unverändert schlank.

Unter `angaben` steht daneben, was TMDB-Details und OMDb geantwortet
haben — damit lässt sich eine fehlende IMDb-Note genauso nachvollziehen
wie ein fehlendes Poster. `omdb` zeigt, ob der OMDb-Schlüssel erkannt
wurde.

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
| GET | `/api/poster?title=…&category=…` | Poster-URL suchen, dazu Jahr, Regie und IMDb-Note (`&debug=1` für Diagnose) |
| POST | `/api/reset-posters` | Automatisch gefundene Poster leeren (Neusuche) |
| GET | `/api/header-images` | Bilder des Kopfbereichs auflisten |
| POST | `/api/header-images` | Bild-Adresse hinzufügen |
| DELETE | `/api/header-images?id=…` | Bild-Adresse entfernen |

Alle Eingaben werden serverseitig validiert: Titel darf nicht leer sein,
alle Werte müssen zwischen 0 und 10 liegen, Kategorie muss gültig sein.

---

## Berechnung

Filme, Serien und Anime (unverändert):

```
Kriteriennote = Story×0.25 + Charaktere×0.20 + Unterhaltung×0.15
              + Emotion×0.15 + Inszenierung×0.10 + Schauspiel×0.10
              + Sound×0.05
```

Spiele:

```
Kriteriennote = Gameplay×0.25 + Story×0.25 + Charaktere×0.15
              + Welt×0.15 + Grafik×0.10 + Sound×0.05
              + Wiederspielwert×0.05
```

Die Endnote entsteht in allen Kategorien gleich:

```
Endnote = Kriteriennote × 0.75 + Bauchgefühl × 0.25
```

Beide Werte auf zwei Nachkommastellen gerundet.
