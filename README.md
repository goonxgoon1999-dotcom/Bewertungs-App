# Bewertungs-App — Filme, Serien, Anime, Kinderserien, Adult Animation, Dokus, Sitcoms/Comedy, Spiele

Persönliche Bewertungs-App mit gewichteten Kriterien je Kategorie
(sechs oder sieben, je nach Kategorie) + Bauchgefühl,
getrennten Rankings, Filtern, Statistik, Postern und echter Datenbank.

- **Frontend:** React + Vite
- **Backend:** Vercel Serverless Functions (Ordner `api/`)
- **Datenbank:** Neon Postgres (kostenloser Plan)
- **Kategorien:** Filme, Serien, Anime, Kinderserien, Adult Animation,
  Dokus, Sitcoms/Comedy und Spiele — je mit eigenen Kriterien
- **Poster:** automatisch über TMDB / Jikan / TVMaze / iTunes, Spiele über SteamGridDB
- **Angaben zum Werk:** Erscheinungsjahr und Regie über TMDB, IMDb-Note als
  Vergleichswert über OMDb — überall außer bei Spielen

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

Beim ersten Aufruf legt die App die Tabellen selbst an. **Eine frische
Datenbank bleibt dabei leer** — in allen Kategorien. Es werden keine
Beispiel- oder Fremddaten eingetragen.

Wie du eigene Bewertungen hineinbekommst, steht in Schritt 4.

---

## Schritt 4 — Alte Bewertungen übernehmen

Falls du in der Artefakt-Version Serien/Anime oder neue Filme angelegt hast:

1. Dort über „⇅ Daten" → **Alles exportieren** (JSON) sichern.
2. In der neuen App über „⇅ Daten" → **JSON-Datei importieren**.

Der Import ergänzt nur und überschreibt nichts.

---

## Name der App

Im Kopfbereich steht standardmäßig **„Rifat's Archiv"**. Der Name ist
nicht fest verdrahtet — er kommt aus einer einzigen Umgebungsvariablen:

```
VITE_APP_NAME="Dein Archiv"
```

- **Lokal:** in eine Datei `.env` im Projektordner schreiben
  (Vorlage: `.env.example`).
- **Bei Vercel:** Settings → Environment Variables → `VITE_APP_NAME`
  anlegen und anschließend einmal **Redeploy** klicken.

Ist nichts gesetzt, bleibt „Rifat's Archiv" stehen.

**Zwei Zeilen.** Der Titel wird zweizeilig gesetzt und dafür am letzten
Leerzeichen umgebrochen — aus „Rifat's Archiv" werden also die Zeilen
„Rifat's" und „Archiv". Wer den Umbruch selbst bestimmen will, setzt
einen senkrechten Strich an die gewünschte Stelle:

```
VITE_APP_NAME="Archiv der|guten Filme"
```

Ein Name ohne Leerzeichen steht einzeilig.

**Wichtig:** Die Variable wird **beim Bauen** eingesetzt, nicht zur
Laufzeit. Nach einer Änderung muss neu gebaut bzw. neu deployt werden.

### Was der Name *nicht* ändert

Der Browser-Tab-Titel (`index.html`) und das PWA-Manifest
(`public/manifest.webmanifest`) tragen den neutralen Text
**„Dein Bewertungsbogen"** — dort stand der Name noch nie, und
`VITE_APP_NAME` fasst beides bewusst nicht an.

Beim Manifest geht es technisch auch gar nicht ohne Umbau: Es ist eine
statische JSON-Datei, die Vite unverändert aus `public/` ausliefert.
Sie kann keine Umgebungsvariable lesen. Damit der Name dort landet,
müsste die Datei beim Bauen erzeugt werden (Vite-Plugin oder ein
kleines Build-Skript) — machbar, aber ein eigener Umbau. Der
Tab-Titel in `index.html` ließe sich dagegen leicht nachziehen; beide
Punkte sind hier absichtlich offen gelassen, weil sie das heutige
Verhalten ändern würden.

Wer beides trotzdem umbenennen möchte, ändert die zwei Dateien direkt
— es sind genau zwei Stellen:

- `index.html` → `<title>`
- `public/manifest.webmanifest` → `name` und `short_name`

---

## Kategorien und Kriterien

Jede Kategorie hat eigene Kriterien. Die Endnote entsteht überall
gleich: 75 % Kriterien-Note + 25 % Bauchgefühl, dazu der Duell-Zuschlag
aus dem Minispiel „Head-to-Head". Ohne gespieltes Duell ist der Zuschlag
exakt 0 — Formel und Herleitung stehen dort und unter „Berechnung".

Gewechselt wird über den **Kategorie-Knopf** direkt unter dem
Kopfbereich. Er läuft über die volle Breite und zeigt links den Namen
der offenen Kategorie, dahinter kleiner die Anzahl ihrer bewerteten
Einträge und rechts einen Pfeil nach unten. Rahmen, Beschriftung und
Pfeil tragen die Akzentfarbe der Kategorie — die Anzahl in einer
gedämpften Abstufung derselben Farbe; gefüllt ist der Knopf nicht.

Ein Tipp öffnet ein Blatt von unten mit allen Kategorien
untereinander, jede mit ihrer Anzahl, die aktuelle markiert. Nach der
Wahl schließt sich das Blatt und die Liste wechselt. Angeboten wird
genau, was in den Einstellungen sichtbar geschaltet ist, in der dort
festgelegten Reihenfolge.

Vorher standen die Kategorien als Reiterleiste im Kopfbereich. Acht
passen auf kein Telefon nebeneinander: wischbar konnte der aktive
Reiter außerhalb des Sichtbaren stehen, umbrechend belegte die Leiste
drei Zeilen und trieb den Kopfbereich so in die Höhe, dass sein
Seitenverhältnis nicht mehr stimmte und der Titel aus dem Bild fiel.
Ein Knopf ist von der Anzahl der Kategorien unabhängig.

Die Statistik ist keine Kategorie und steht deshalb nicht im Blatt:
Sie öffnet sich über das Balkendiagramm-Symbol oben rechts im
Kopfbereich.

**Filme, Serien, Anime und Adult Animation** (identische Felder und Gewichte):

| Kriterium | Gewicht |
|-----------|---------|
| Story & Drehbuch | 25 % |
| Charaktere | 20 % |
| Unterhaltung | 15 % |
| Emotion & Wirkung | 15 % |
| Inszenierung | 10 % |
| Schauspiel | 10 % |
| Soundtrack / Sounddesign | 5 % |

Bei **Anime** und **Adult Animation** heißen zwei davon anders:
„Inszenierung" wird als **Animation** angezeigt, „Schauspiel" als
**Synchronstimme**. Das ist reine Beschriftung — dieselben Datenfelder,
dieselben Gewichte, dieselben gespeicherten Werte.

**Dokus** (eigene Kriterien und eigene Gewichte):

| Kriterium | Gewicht |
|-----------|---------|
| Informationsgehalt / Erkenntnisgewinn | 25 % |
| Aufbau & Erzählweise | 20 % |
| Protagonisten & Wirkung | 15 % |
| Inszenierung / Bildsprache | 15 % |
| Unterhaltung / Spannung | 10 % |
| Glaubwürdigkeit & Recherche | 10 % |
| Sound & Sprecher | 5 % |

Wie bei Anime und Kinderserien wechselt nur die Beschriftung, nicht die
Datenspalte: Informationsgehalt liegt in `emotion`, Aufbau in `story`,
Protagonisten in `charaktere`, Bildsprache in `inszenierung`,
Unterhaltung in `unterhaltung`, Glaubwürdigkeit in `schauspiel` und
Sound in `sound`. Eine neue Spalte braucht die Kategorie damit nicht.

Einzeldokus und Doku-Serien stehen in **einem** Reiter. Staffeln gibt es
dort nicht: Auch eine Doku-Serie bekommt genau eine Gesamtnote.

**Sitcoms/Comedy** (eigene Kriterien und eigene Gewichte):

| Kriterium | Gewicht |
|-----------|---------|
| Humor / Gag-Dichte | 25 % |
| Charaktere & Ensemble | 20 % |
| Dialoge & Timing | 15 % |
| Wiederschauwert | 15 % |
| Story / roter Faden | 10 % |
| Schauspiel | 10 % |
| Musik & Sound | 5 % |

Wie bei Anime, Kinderserien und Dokus wechselt nur die Beschriftung,
nicht die Datenspalte: Humor liegt in `unterhaltung`, Ensemble in
`charaktere`, Dialoge & Timing in `inszenierung`, Wiederschauwert in
`emotion`, Story in `story`, Schauspiel in `schauspiel` und Musik in
`sound`. Eine neue Spalte braucht die Kategorie damit nicht.

Comedy-Serien und Comedy-Filme stehen in **einem** Reiter. Staffeln gibt
es dort nicht: Auch eine Sitcom bekommt genau eine Gesamtnote.

**Kinderserien** (eigene Kriterien, sechs statt sieben):

| Kriterium | Gewicht |
|-----------|---------|
| Nostalgie / Wiedersehenswert | 20 % |
| Charaktere | 20 % |
| Unterhaltung & Humor | 20 % |
| Story | 15 % |
| Animation & Optik | 15 % |
| Intro & Musik | 10 % |

Auch hier wechselt nur die Beschriftung, nicht die Datenspalte:
Nostalgie liegt in `emotion`, Humor in `unterhaltung`, Optik in
`inszenierung`, Intro in `sound`. Ein „Schauspiel" gibt es bei
Kinderserien nicht — die Spalte bleibt dort leer.

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

### Welche Kategorien angezeigt werden (und in welcher Reihenfolge)

Im Daten-Panel (Zahnrad oben rechts) steht ganz oben der Abschnitt
**Kategorien**. Dort lässt sich jede Kategorie einzeln ein- und
ausschalten und mit den Pfeilen ▲ ▼ verschieben.

Die Einstellung gilt **pro Gerät** und liegt im `localStorage` unter
`bewertungsapp.kategorieAnsicht` — nicht in der Datenbank. Am
Datenmodell ändert sie nichts, der `CHECK` auf `category` in
`api/_db.js` bleibt wie er ist.

Was die Einstellung tut:

- **Ausblenden ist reine Anzeige.** Es wird nichts gelöscht. Eine
  wieder eingeschaltete Kategorie bringt alle ihre Einträge
  unverändert mit.
- **Sie wirkt überall.** Kategorie-Knopf samt Blatt, Wischgeste,
  Anlegen- und Bewertungsformular, Statistik (samt ihrer einen Kategorie-Auswahl),
  Jahresrückblick, „Bewertung prüfen", Head-to-Head, Turnier, Higher or
  Lower, „Was schau ich?", Empfehlungen und die Fortsetzungs-Erinnerung
  folgen derselben Liste — samt Reihenfolge, also auch in Auswahlfeldern
  und Statistik-Blöcken.
- **Mindestens eine Kategorie bleibt sichtbar.** Die letzte lässt sich
  nicht abwählen; ihr Schalter ist gesperrt und sagt beim Berühren,
  warum.
- **Ohne gespeicherte Einstellung** sind alle Kategorien sichtbar, in
  der Reihenfolge aus dem Code. Bestehende Installationen verhalten
  sich damit unverändert.
- **Eine neue Kategorie im Code ist immer sichtbar**, auch wenn schon
  eine ältere Auswahl gespeichert ist: Gespeichert wird, was
  *versteckt* ist, nicht was sichtbar ist. Sie hängt sich hinten an die
  gespeicherte Reihenfolge an.
- **Ein leerer, kaputter oder fremder Speicherstand** fällt still auf
  die Vorgabe zurück; unbekannte Kategorienamen werden verworfen. Ein
  Fehler erscheint dabei nicht.
- **Wird die gerade offene Kategorie ausgeblendet**, wechselt die App
  auf die erste sichtbare. Steht oben Statistik oder Minispiele, bleibt
  das so — gewechselt wird dann nur die Kategorie darunter. Läuft
  gerade ein Minispiel in dieser Kategorie, steht wieder dessen
  Kategorie-Auswahl da.

Zwei Stellen halten sich ausdrücklich **nicht** daran, und das ist so
gewollt:

- Der **Aktivitäts-Rang** zählt weiter *alle* bewerteten Einträge, auch
  die in ausgeblendeten Kategorien — gesehen ist gesehen. Der
  XP-Stand kann dadurch höher wirken, als die sichtbaren Einträge
  erklären. Das ist kein Fehler (siehe „Punkte").
- **Export und Backup** enthalten weiter alles, unabhängig von der
  Sichtbarkeit. Sie sind die Sicherung, da darf nichts fehlen. Das gilt
  für „Alles exportieren" als JSON wie als CSV.

### Staffeln (Serien, Anime, Kinderserien, Adult Animation)

Alle Serienarten lassen sich optional in Staffeln unterteilen. Jede
Staffel hat dieselben Kriterien wie der Eintrag selbst, ein eigenes Bauchgefühl und
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
Ist oben eine einzelne Kategorie gewählt, steht dort nur noch ihr Block.

---

## Kopfbereich

Oben zeigt die App einen festen 16:9-Ausschnitt über die volle
Breite. Darin stehen nur noch vier Dinge: das Hintergrundbild, der
App-Titel und das Rang-Abzeichen unten links, die drei Symbolknöpfe
oben rechts. Weil nichts davon mit der Zahl der Kategorien wächst,
steht die Höhe fest — der Titel ist beim Öffnen immer vollständig zu
sehen.

Genau genommen gilt das 16:9 für die Inhaltsfläche; darüber kommen
noch die Gerätekerbe und 28 px Luft, damit der Titel nicht unter der
Statusleiste liegt. Bei 390 px Breite ist der Kopf damit 247 px hoch,
bei 768 px 460 px. Ab 960 px gilt statt der 16:9 eine Mindesthöhe von
360 px, sonst wäre der Kopf auf einem breiten Bildschirm über 800 px
hoch.

Die Zahl der Einträge stand früher hier („166 Filme"); sie steht
jetzt im Kategorie-Knopf darunter.

Die Bilder werden **von Hand** gepflegt — dafür gibt es keine
automatische Suche.

Im Daten-Panel (Zahnrad oben rechts im Kopfbereich) unter
„Bilder im Kopfbereich" lassen sich beliebig
viele Adressen eintragen und einzeln wieder entfernen. Sie liegen in
einer eigenen Tabelle und bleiben dauerhaft erhalten.

- Mehrere Adressen wechseln alle 8 Sekunden mit einer Gleit-Animation.
- Eine einzelne Adresse steht fest.
- Ohne Adresse bleibt der Bereich schlicht dunkel.

Die Bilder füllen den Ausschnitt formatfüllend und zentriert
(`object-fit: cover`) bei 90 % Deckkraft; darüber liegt ein Verlauf,
der den Titel lesbar hält und nach unten in die Seitenfarbe ausläuft —
am Fuß des Kopfbereichs steht deshalb keine Trennlinie mehr. Eine
Adresse, die sich nicht laden lässt, wird übersprungen.

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
| Kinderserien | TVMaze → TMDB → iTunes |
| Adult Animation | TVMaze → TMDB → iTunes |
| Dokus | TMDB (movie) → TMDB (tv) → iTunes |
| Sitcoms/Comedy | TMDB (movie) → TMDB (tv) → iTunes |
| Spiele | SteamGridDB |

Kinderserien und Adult Animation laufen über dieselbe Kette wie Serien:
Für TVMaze und TMDB sind es schlicht Serien, eigene Kategorien sind sie
nur in dieser App.

Dokus und Sitcoms/Comedy fragen TMDB in **beiden** Bereichen — erst
`movie`, dann `tv`. In beiden Reitern stehen Filme und Serien
nebeneinander (Einzeldokus neben Doku-Serien, Comedy-Filme neben
Comedy-Serien), und nur eine Suche über beide Bereiche findet beides.
Dasselbe gilt für die Titelauswahl beim Hinzufügen (`api/search.js`):
Dort werden die beiden Trefferlisten abwechselnd zusammengelegt, damit
keine der beiden Arten verdrängt wird. Die Laufzeit richtet sich danach,
was TMDB geliefert hat: eine Filmlaufzeit beim Einzelwerk, Folgenlänge
mal Folgenzahl bei der Serie.

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

### Genre, Filmreihe und Studio

Im selben Abruf kommen drei weitere Felder mit. Sie werden nirgends
angezeigt, tragen aber die zusätzlichen Filter in den Ranglisten und das
Geschmacksprofil der Empfehlungen:

| Feld | Gilt für | Quelle |
|------|----------|--------|
| Genre | alle außer Spielen | TMDB (`genres`); bei Anime hat Jikan Vorrang, bei den Serienarten springt TVMaze ein |
| Filmreihe | nur Filme | TMDB `belongs_to_collection` (z. B. „Star Wars Collection") |
| Studio | nur Filme | TMDB `production_companies`, die erstgenannte Firma |

Bei Anime zählen Jikans Genres mehr als die von TMDB: TMDB kennt dort nur
„Animation" und „Action & Adventure", Jikan unterscheidet „Shounen",
„Isekai" oder „Slice of Life".

Die **Filmreihe** trifft Reihen mit eigener TMDB-Collection genau — Star
Wars, Fast & Furious, Der Herr der Ringe. Übergreifende Franchises haben
dort keine eigene Collection; für sie dient das **Studio** als Näherung
(„Marvel Studios" für das MCU). Das ist bewusst keine exakte
Franchise-Zuordnung, sondern eine grobe Krücke: Unter „Marvel Studios"
landet, was dieses Studio produziert hat — nicht mehr und nicht weniger.

Bestehende Einträge laden die Felder automatisch nach, wie schon Poster
und Angaben, mit einem eigenen Kontingent pro Seitenaufruf und einer
kurzen Pause zwischen den Abrufen. Geschrieben wird nur bei Erfolg — ein
fehlgeschlagener Abruf lässt den Eintrag unangetastet. Bei **Spielen**
entfällt das komplett: SteamGridDB ist eine Bilddatenbank und liefert
keine Genres.

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
dabei auch die Suche nach Jahr, Regie, IMDb-Note, Genre, Filmreihe und
Studio wieder frei; das ist der Weg, sie nach dem Nachtragen eines
Schlüssels erneut zu holen.

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

## Erstmals geschaut

Wann wurde ein Titel zum **ersten Mal** gesehen? Das beantwortet
`rated_at` gerade nicht: Diese Spalte hält den Tag fest, an dem aus dem
Eintrag ein bewerteter wurde. Wer einen Film 2011 gesehen und erst 2026
hier eingetragen hat, hat ihn nicht 2026 zum ersten Mal geschaut.

Dafür gibt es eine eigene, rein optionale Spalte `first_watched_at`
(BIGINT, NULL-bar). Sie wird **ausschließlich von Hand** gesetzt — es
gibt keinen Backfill, keine automatische Ermittlung und keine Stelle,
an der sie nebenbei entsteht. Bestehende Einträge bleiben leer.

**In der Detailansicht** steht sie als eigene Karte neben der IMDb-Note,
mit der Beschriftung `ERSTMALS GESCHAUT` und einem Stiftknopf rechts —
genau wie bei Jahr, Regie und IMDb-Note. Zwei Zustände:

| Zustand | Anzeige |
|---------|---------|
| Eigenes Datum eingetragen | Datum in normaler Textfarbe, ohne Zusatz |
| Kein eigenes Datum | das Bewertungsdatum (`ratedAt`) gedämpft, dahinter klein `(Bewertungsdatum)` |

Fehlt auch das Bewertungsdatum — Altbestand aus der Zeit vor jener
Spalte —, steht dort die Einladung „eintragen". Ein Datum wird nicht
erfunden.

Der Stiftknopf öffnet ein Datumsfeld. **Speichern** schreibt den Wert,
**Leeren** entfernt ihn wieder; danach gilt erneut das Bewertungsdatum.

**Was das Datum ausdrücklich nicht verschiebt:** der Sehzähler, weitere
Durchgänge, das Bearbeiten der Bewertung, das automatische Nachladen von
Poster, Genres und Laufzeit. Technisch steht dahinter dieselbe Regel wie
bei „Am Schauen": Fehlt das Feld in der Anfrage, bleibt der gespeicherte
Wert stehen (`erstsichtungColumns` in `api/items.js`). Die Nachlade-
Schleife im Frontend schickt es bewusst gar nicht erst mit.

Der **Rückfallwert ist `ratedAt` und nicht `createdAt`**: Letzteres wird
auch beim Vormerken gesetzt und stünde bei einem Titel, der zwei Jahre
auf der Watchlist lag, um zwei Jahre zu früh. Auch nicht `bewertetAm()`
(das die CSV-Spalte „bewertet am" trägt) — dort zählt die zuletzt
nachgetragene Staffel mit, das Datum wanderte also mit jeder weiteren
Staffel nach vorn.

Auf derselben Rechnung steht der **Jahresrückblick**: Er zählt nach dem
Jahr der Erstsichtung, mit genau diesem Rückfall. Näheres unten im
Statistik-Tab.

Export und Backup nehmen das Feld als `firstWatchedAt` mit; ältere
Sicherungen ohne das Feld lassen sich unverändert einspielen.

---

## Streaming-Verfügbarkeit

Wo läuft ein Titel gerade **im Abo**? Die Antwort kommt von TMDBs
Watch-Providers über denselben `TMDB_API_KEY`, den die Postersuche schon
nutzt (`api/streaming.js`) — es kommt kein neuer Dienst dazu. TMDB
bezieht die Daten von [JustWatch](https://www.justwatch.com); der
Hinweis darauf steht im Daten-Panel bei den übrigen Quellen.

Angezeigt werden **ausschließlich Abo-Anbieter** (`flatrate`). Leihen
(`rent`) und Kaufen (`buy`) bleiben draußen: „Jetzt verfügbar" soll
heißen „ohne weiteres Geld anschaltbar".

Betroffen sind alle Kategorien **außer Spielen** — TMDB kennt sie nicht.

**Die Titelzuordnung ist keine neue.** Der Endpunkt nimmt
`tmdbKennungFuer()` aus `api/poster.js`, also genau die Zuordnung, aus
der auch Jahr, Regie und die IMDb-Kennung stammen — mit derselben
Kandidatenauswahl und derselben Ähnlichkeitsschwelle. Das gilt
insbesondere für **Anime**: Dort führt sonst Jikan, aber der
TMDB-Serientreffer ist auch bisher schon die Quelle der Angaben. Die
gefundene Kennung (`quellArt` + `quellId`) geht mit der Antwort zurück
und wird mitgespeichert; der erste Lauf kostet so zwei Aufrufe je
Eintrag, jeder weitere einen.

### Region

Im Daten-Panel unter **Streaming-Region** stehen drei Möglichkeiten:
**Automatisch** (Vorgabe), **Deutschland**, **Italien**. Die Automatik
liest zuerst die Spracheinstellungen des Geräts mit Landeskennung
(`de-DE`, `it-IT`), dann die Zeitzone, zuletzt die reine Sprache
(`de`, `it`). Wird weder DE noch IT erkannt, gilt Deutschland. Die
Einstellung liegt wie die Kategorie-Ansicht im `localStorage`
(`bewertungsapp.streamingRegion`) und gilt nur auf diesem Gerät.

### Zwischenspeicher

Die Anbieter stehen **nicht** in der Datenbank, sondern im
`localStorage` (`bewertungsapp.streaming`) — je Eintrag **und Region**
mit eigenem Zeitstempel:

```
{ fassung, stand: { <id>: { quellArt, quellId,
                            regionen: { DE: { zeit, anbieter }, IT: {…} } } } }
```

Neu geholt wird höchstens **einmal pro Woche**; ein gescheiterter Abruf
hält nur einen Tag, damit eine Störung nicht eine Woche nachwirkt. Beim
Wechsel der Region wird nur für die neue geholt — die Werte der anderen
bleiben stehen.

### Anzeige

- **Detailansicht:** eine Karte `JETZT VERFÜGBAR` mit dem
  Regionskürzel dahinter, darunter die Anbieter als Chips.
- **Watchlist-Zeilen:** dieselben Chips klein unter der Meta-Zeile,
  höchstens drei, danach `+N`.
- **Kein Abo-Anbieter gefunden:** ein einzelner gedämpfter Chip
  `nicht im Abo`.
- **Solange die Abfrage läuft:** gar nichts. Die Stelle bleibt leer,
  statt beim Eintreffen der Antwort umzuspringen.

### Warum das die Nachlade-Schleife nicht ausbremst

Der Abruf läuft in einem **eigenen** Effekt, getrennt von der Schleife
für Poster, Jahr, Regie und IMDb-Note. Er fasst weder deren Zähler
(`nachladeZaehler`, `zusatzZaehler`) noch `items` an und schreibt nichts
in die Datenbank. Damit kann er die Schleife weder bremsen noch
abbrechen — und umgekehrt. Pro Runde ist genau eine zusätzliche Anfrage
unterwegs; abgearbeitet wird sie serverseitig gebündelt.

Ohne `TMDB_API_KEY` liefert der Endpunkt ein leeres Ergebnis statt eines
Fehlers: Die Stelle bleibt dann einfach leer, genau wie bei fehlender
IMDb-Note.

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
| GET | `/api/poster?title=…&category=…` | Poster-URL suchen, dazu Jahr, Regie, IMDb-Note, Genre, Filmreihe und Studio (`&debug=1` für Diagnose) |
| GET | `/api/search?title=…&category=…` | Mehrere Titel-Treffer zur Auswahl beim Anlegen |
| GET | `/api/recommendations?category=…&profil=…` | Vorschläge zum mitgeschickten Geschmacksprofil (Profil als JSON) |
| POST | `/api/recommendations` | Dasselbe, Profil im Rumpf (`{ category, profil }`) |
| POST | `/api/fortsetzungen` | Prüft zu bewerteten Serien, ob es inzwischen eine Staffel bzw. Fortsetzung mehr gibt (`{ eintraege: [{ id, category, title, year, staffeln, quelle, quellId }] }`) — meldet nur (`{ treffer, offen }`), trägt nichts ein. Was in die Frist eines Aufrufs nicht passt, steht in `offen` und wird nachgefragt |
| POST | `/api/streaming` | Streaming-Verfügbarkeit im Abo (`{ region, eintraege: [{ id, category, title, quellArt, quellId }] }`) — meldet je Eintrag die Abo-Anbieter (`{ treffer, offen }`), trägt nichts ein. Wie bei den Fortsetzungen steht in `offen`, was in die Frist eines Aufrufs nicht passte |
| POST | `/api/reset-posters` | Automatisch gefundene Poster leeren (Neusuche) |
| GET | `/api/header-images` | Bilder des Kopfbereichs auflisten |
| POST | `/api/header-images` | Bild-Adresse hinzufügen |
| DELETE | `/api/header-images?id=…` | Bild-Adresse entfernen |
| GET | `/api/duels` | Zahl der gespielten Duelle je Kategorie (Head-to-Head und Turnier) |
| GET | `/api/duels?category=…` | Die schon gespielten Paarungen dieser Kategorie (`{ a, b, at }` je Paarung) — Grundlage der Sperrfrist im Head-to-Head |
| POST | `/api/duels` | Ein entschiedenes Duell auswerten (`{ category, winnerId, loserId }`): Elo beider Beteiligten verschieben, je Eintrag und je Kategorie hochzählen, beim Gewinner `siege` erhöhen, die Paarung festhalten. Ohne `winnerId`/`loserId` (`{ category }`) wird nur gezählt |
| DELETE | `/api/duels?id=…` | Duell-Zuschlag eines Eintrags zurücksetzen — Elo zurück auf 1000; die gespielten und gewonnenen Duelle bleiben gezählt |
| GET | `/api/highscores?game=…` | Bestwerte eines Minispiels, je Spielart |
| POST | `/api/highscores` | Ergebnis eines Durchgangs melden (`{ game, mode, score }`) — gespeichert wird nur, was den Bestwert übertrifft |

Alle Eingaben werden serverseitig validiert: Titel darf nicht leer sein,
alle Werte müssen zwischen 0 und 10 liegen, Kategorie muss gültig sein.

---

## Watchlist

Jede Kategorie hat drei Unter-Reiter: **Bewertet** (die gewohnte
Rangliste), **Am Schauen** (siehe unten) und **Watchlist** mit der Zahl
der Vormerkungen dahinter („Watchlist 43").

Die Reihe steht im **Unterstrich-Stil** und hebt sich damit von den
Kategorie-Tabs darüber ab: kein gefüllter oder umrandeter Knopf mehr,
sondern reiner Text nebeneinander. Der aktive Reiter steht in der
Kategoriefarbe und trägt einen Balken direkt unter sich, die
übrigen in der gedämpften Textfarbe. Unter der ganzen Reihe läuft eine
durchgehende dünne Linie, auf der der Balken aufsitzt und die zugleich
den Kopfbereich vom Inhalt trennt; zwischen den Reitern steht je ein
kurzer senkrechter Strich in derselben Farbe, der oberhalb der Linie
endet. Jeder Reiter behält eine Antippfläche von mindestens 44 px, und
die Schriftstärke ist bei allen dreien gleich — beim Umschalten
verrutscht deshalb nichts.

**Die drei teilen sich die volle Breite** zu gleichen Dritteln, die
Beschriftung steht mittig in ihrem Drittel. Die Reihe ist damit genauso
breit wie „+ Neu hinzufügen" und das Suchfeld darunter und schließt
links und rechts bündig mit ihnen ab; die senkrechten Striche sitzen an
der Dritteltrennung, der Balken des aktiven Reiters ist so breit wie
dessen Drittel. Früher stand die Reihe linksbündig und maß nur so viel,
wie ihr Text brauchte.

**Die Reihe bricht nie um**, auch nicht mit dreistelligen Zählern in
allen drei Reitern. Der breiteste Fall („Am Schauen 999") misst mit
12 px Schrift und 6 px Innenabstand 111 px und passt damit bei 390 px
Fensterbreite in das Drittel von 117 px — die Schriftgröße ist dafür um
einen Schritt von 13 px auf 12 px gesunken, weil ein Drittel weniger
Platz lässt als der frühere, am Text gemessene Knopf. Reicht der Platz
einmal doch nicht, weichen die Drittel zugunsten des Textes und die
Reihe wird seitlich wischbar — ohne sichtbaren Rollbalken, und
umbrochen wird trotzdem nicht. Vorgemerkt und bewertet bleibt
dabei ein Entweder-oder — ein Eintrag ist immer nur eines von beidem;
das Kennzeichen „Am Schauen" steht unabhängig daneben.

Vorgemerkte Einträge stehen in derselben Tabelle, tragen aber
`watchlist = true` und haben weder Kriterien-Werte noch Bauchgefühl.
Sie tauchen deshalb in keiner Rangliste, keiner Statistik und keinem
CSV-Export auf. Poster, Jahr und Regie werden trotzdem automatisch
nachgeladen wie bei jedem anderen Eintrag.

**Anlegen:** „+ Neu hinzufügen" öffnet eine Titelsuche (`api/search.js`)
in denselben Quellen wie die Poster — TMDB für Filme, TVMaze für Serien,
Jikan für Anime, SteamGridDB für Spiele. Je Treffer stehen zwei Wege
offen: **+ Watchlist** merkt nur vor, **Bewerten** führt direkt ins
gewohnte Bewertungsformular. Was keine Quelle kennt, lässt sich unter
den Treffern mit dem eingegebenen Titel von Hand anlegen.

**Aus der Watchlist heraus bewerten:** „✓ Ansehen" öffnet dasselbe
Bewertungsformular. Nach dem Speichern behält der Eintrag seine ID,
verliert die Vormerkung und steht in der Rangliste. Derselbe Knopf
steht als „✓ Bewerten" auch an vorgemerkten Zeilen im Reiter **Am
Schauen** — von dort führte der Weg vorher nur über das Beenden und
die Watchlist zurück.

**Entfernen:** das kleine × neben dem Eintrag löscht die Vormerkung
sofort — es gibt dort nichts zu verlieren außer dem Titel selbst.

**Aufbau einer Zeile.** Links das Poster, rechts daneben untereinander
der Titel über die volle Restbreite (höchstens zwei Zeilen, dann
Auslassungspunkte), die Meta-Zeile `Jahr · Laufzeit · vor X Tagen`,
darunter die Streaming-Anbieter als kleine Chips (höchstens drei, danach
`+N` — siehe „Streaming-Verfügbarkeit") und zuletzt die Knopfreihe: der breite Knopf ins Bewertungsformular, daneben
Play- und Entfernen-Symbol mit je 44 px Antippfläche. Fehlt ein Wert der
Meta-Zeile — bei Spielen etwa die Laufzeit —, fällt er samt Trennzeichen
weg. Nebeneinander in einer einzigen Zeile blieb bei 430 px Breite für
den Titel zu wenig übrig.

---

## Am Schauen

Der dritte Unter-Reiter jeder Kategorie: **Am Schauen** — bei Spielen
**Am Spielen** —, mit der Zahl der angefangenen Einträge daneben. Hier
steht, was begonnen, aber noch nicht zu Ende geschaut ist.

Das Kennzeichen ist **unabhängig** von „bewertet" und „vorgemerkt": Es
ersetzt keines von beiden, sondern steht daneben. Genau darum geht es —
ein bereits bewerteter Titel kann beim Rewatch gleichzeitig am Schauen
sein, ohne aus der Rangliste zu verschwinden, und bei einer Serie kann
Staffel 1 bewertet sein, während Staffel 2 noch läuft. Ein vorgemerkter
Eintrag, der am Schauen ist, steht in diesem Reiter statt in der
Watchlist; seine Vormerkung bleibt aber stehen, und er taucht dort
wieder auf, sobald das Kennzeichen ausgeht. Kein Eintrag kann dadurch
aus allen Reitern fallen.

Gesetzt und gelöscht wird es **ausschließlich von Hand**: über den
Schalter in der Detailansicht, über das Play-Symbol an einer
Watchlist-Zeile oder über das × im Reiter selbst. Kein Nachladen und
kein beiläufiger Speichervorgang fasst es an — auch die letzte Folge der
letzten Staffel schaltet es nicht von selbst aus, und das Bearbeiten
einer bestehenden Bewertung lässt es stehen (Staffel 1 bewertet,
Staffel 2 läuft noch). Die eine Ausnahme ist der Weg, der aus einem
vorgemerkten Eintrag einen bewerteten macht: Wer eine vorgemerkte Zeile
bewertet — aus der Watchlist, aus diesem Reiter oder aus dem Minispiel
—, hat sie zu Ende geschaut, deshalb geht mit der Vormerkung auch das
Kennzeichen ab. Der Stand (Staffel/Folge) bleibt dabei erhalten.

**Bewerten aus dem Reiter heraus.** Vorgemerkte Zeilen tragen einen
breiten „✓ Bewerten"-Knopf, der direkt ins Bewertungsformular führt.
Bereits bewertete Zeilen haben ihn nicht: ein leeres Formular würde
ihre Werte beim Speichern überschreiben — ihre Note ändert man wie
bisher in der Detailansicht.

**Fortschritt.** Wo die Episodenzahlen je Staffel vorliegen, zeigt die
Zeile den Stand als schmalen Balken mit „S2 · 4/10" daneben. „+1" zählt
eine Folge weiter; nach der letzten Folge einer Staffel springt der
nächste Druck auf die nächste Staffel, Folge 1. Ein Druck auf den Stand
öffnet die Eingabe von Hand — nötig, wenn ein Titel mitten in einer
Staffel aufgenommen wird. Beim Einschalten beginnt ein Eintrag ohne
Stand bei Staffel 1, Folge 0; ein vorhandener Stand bleibt auch beim
Ausschalten erhalten, damit ein späteres Wiederaufnehmen ihn kennt. Bei
Filmen, bei Spielen und überall dort, wo die Episodenzahlen fehlen,
steht der Titel einfach ohne Zusatz im Reiter.

---

## Empfehlungen für dich

Unterhalb der Watchlist-Einträge steht in jeder Kategorie außer Spielen
ein Abschnitt mit Vorschlägen. Er beruht nicht auf „ähnliche Titel zu X",
sondern auf einem **Geschmacksprofil**.

**Das Profil** entsteht aus den bestbewerteten Einträgen der Kategorie —
50 Filme, je 20 aus den übrigen Kategorien, nach Endnote sortiert. Für jedes Genre,
jeden Regisseur, jedes Studio und jedes Jahrzehnt wird aufsummiert, wie
weit die Einträge, die es tragen, über dem Durchschnitt **aller**
bewerteten Einträge der Kategorie liegen. Was häufig **und** mit hohen
Noten vorkommt, sammelt so das meiste Gewicht; was nur mittelmäßig
abschneidet, fällt heraus. Am Ende wird auf den stärksten Wert normiert.
Regie, Studio und Jahrzehnt zählen erst ab zwei bzw. drei Einträgen — ein
einzelner Film sagt über den Geschmack nichts aus.

**Die Abfrage** geht damit an die Entdecken-Endpunkte der Quellen:

| Kategorie | Endpunkt | Kriterien |
|-----------|----------|-----------|
| Filme | TMDB `/discover/movie` | Genre-Kombination, Genres einzeln, Jahrzehnt, `with_crew` (Regie), `with_companies` (Studio) |
| Serien | TMDB `/discover/tv` | Genre-Kombination, Genres einzeln, Jahrzehnt |
| Kinderserien | TMDB `/discover/tv` | wie Serien, Profil aus der eigenen Kategorie |
| Adult Animation | TMDB `/discover/tv` | wie Serien, Profil aus der eigenen Kategorie |
| Dokus | TMDB `/discover/movie` | Profil aus der eigenen Kategorie |
| Sitcoms/Comedy | TMDB `/discover/movie` | Profil aus der eigenen Kategorie |
| Anime | Jikan `/anime` | Genres, Jahrzehnt, nach Note sortiert, Mindestnote 7, zwei Seiten je Abfrage |

Bei Serien gibt es keine Abfrage nach Regie: TMDBs Entdecken-Endpunkt für
Serien kennt `with_crew` nicht. Bei Anime ersetzt dieser Weg den früheren
Ansatz, der dort regelmäßig ganz leer lief — nach dem Aussortieren des
bereits Bewerteten blieben von den direkt ähnlichen Titeln zu wenige
übrig.

Anime holen dabei **zwei Seiten** je Abfrage, Filme und Serien eine. Der
Grund: Nach Note sortiert liefert jede Genre-Abfrage die Spitze dieses
Genres, und die Spitzenlisten mehrerer Genres sind fast dieselben Titel.
Wer eine gewachsene Anime-Sammlung hat, kennt davon praktisch alles —
mit nur einer Seite bleibt nach dem Ausschluss nichts übrig. TMDBs
Bestand ist um Größenordnungen größer, dort trägt schon die erste Seite.

**Die Sortierung** addiert die Gewichte aller getroffenen Kategorien.
Wer in mehreren zugleich trifft (Genre **und** Regie), bekommt zusätzlich
einen Zuschlag — ein Treffer auf breiter Front wiegt mehr als die Summe
seiner Teile. Unter jedem Vorschlag steht der Grund in einem Satz, im
selben dezenten Stil wie Jahr und Regie in den Listen: „weil du
Sci-Fi-Filme von Christopher Nolan hoch bewertest".

**Angezeigt** werden höchstens 15 Vorschläge bei Filmen und 10 bei Serien
und Anime, jeweils mit Poster, Titel, Begründung und „+ Watchlist". Was
bereits bewertet oder vorgemerkt ist, fällt vorher heraus.

**Der Ausschluss** vergleicht über den Titel — und zwar über **alle**
Schreibweisen, die die Quelle kennt: deutscher und Originaltitel bei
TMDB, dazu die englische und japanische Schreibweise samt Synonymen bei
Jikan. Das ist nötig, weil beide Seiten dasselbe Werk verschieden
benennen können: In der Sammlung steht „Captain America: The Winter
Soldier", TMDB antwortet auf Deutsch mit „The Return of the First
Avenger". Ein Vergleich über nur einen Titel findet das nie. Ein Jahr in
Klammern („Spider-Man 2 (2004)") zählt dabei nicht zum Titel; eine
Jahreszahl, die zum Titel gehört, schon („Blade Runner 2049").

**Berechnet** wird nur etwa **einmal im Monat** — jede Runde kostet ein
gutes Dutzend externer Aufrufe. Gespeichert werden dabei rund 40
Kandidaten, also deutlich mehr als angezeigt. Wandert ein Vorschlag auf
die Watchlist, rückt der nächste aus diesem Vorrat sofort nach, ohne
einen einzigen neuen Aufruf. Der Stand liegt im `localStorage` und
überdauert das Schließen der Seite. Zwei Ausnahmen vom Monat: Kam nichts
zurück, wird schon nach einem Tag wieder gefragt, und sobald die Genres
erstmals nachgeladen sind, wird ein noch ohne sie entstandener Stand
einmalig verworfen.

Bei **Spielen** entfällt der Abschnitt vollständig.

---

## Filter in den Ranglisten

Das Filter-Sheet öffnet sich über das Filter-Symbol neben der Suche und
enthält ganz oben die Sortierung. Neben Notenbereich und Sortierung
filtert es in allen Kategorien außer Spielen zusätzlich nach:

- **Genre** — als Knopfreihe, aus den tatsächlich vorkommenden Genres
- **Jahrzehnt** — abgeleitet aus dem Erscheinungsjahr
- **Regie** — Auswahlfeld, häufigste zuerst, mit Anzahl
- **Filmreihe / Franchise** — nur bei Filmen

Die Auswahlmöglichkeiten stehen nirgends fest: Sie entstehen aus dem, was
in der jeweiligen Kategorie vorhanden ist. Was es nicht gibt, steht auch
nicht zur Wahl. Ein zweiter Klick auf denselben Knopf hebt die Auswahl
wieder auf. Beim Wechsel der Kategorie werden die vier zurückgesetzt —
ein Filmgenre in den Serien ließe die Liste sonst ohne ersichtlichen
Grund leer aussehen; Notenbereich und Sortierung bleiben stehen.

Beim Filter **Filmreihe** stehen echte TMDB-Collections und Studios
gemeinsam zur Wahl; Studios sind mit „(Studio)" gekennzeichnet und die
Näherung für Franchises ohne eigene Collection. Reihen mit nur einem
Eintrag werden ausgelassen — eine Reihe aus einem Film ist keine Reihe.

---

## Einstellungen (Daten-Panel)

Das Zahnrad oben rechts öffnet die Einstellungen. Sie enthalten vier
Abschnitte, in dieser Reihenfolge: **Kategorien**, **Streaming-Region**,
**Export & Backup** und **Duell-Zuschläge**. Was in ihnen steht, ist
jeweils an der Stelle beschrieben, an der es hingehört — welche
Kategorien angezeigt werden, für welches Land die Verfügbarkeit gilt,
Export und Import samt den Bildern im Kopfbereich, und die Sammelfunktion
für die Duell-Zuschläge.

**Jeder Abschnitt ist einklappbar** — dieselbe Kopfzeile wie im
Statistik-Tab: ein Knopf mit Pfeil, mindestens 44 px hoch, mit der
Überschrift in derselben Schrift. Getrennt werden die Abschnitte durch
die dünne waagerechte Linie der Listen (`#232326`); die Kästen, die
früher um jeden Abschnitt standen, sind weg, und mit ihnen der große
Abstand dazwischen.

**Beim Öffnen ist alles zugeklappt.** Anders als im Statistik-Tab bleibt
hier kein Abschnitt offen: In den Einstellungen sucht man gezielt eine
einzelne Sache. Welcher Abschnitt zuletzt offen war, wird bewusst
**nicht** gemerkt — weder im `localStorage` noch über das Schließen
hinweg; jedes erneute Öffnen fängt wieder bei zugeklappt an.

**Zugeklappt steht unter dem Titel eine kurze Zusammenfassung** in der
gedämpften Monospace-Schrift, damit man beim Scrollen sieht, was
eingestellt ist:

| Abschnitt | Zusammenfassung |
| --- | --- |
| Kategorien | wie viele von wie vielen sichtbar sind („6 von 8 sichtbar") |
| Streaming-Region | die gewählte Region; bei „Automatisch" dahinter das erkannte Land („Automatisch · DE") |
| Export & Backup | das gewählte Ausgabeformat und die Zahl der Bilder im Kopfbereich („JSON (Backup) · 2 Bilder im Kopfbereich") |
| Duell-Zuschläge | wie viele Einträge einen offenen Zuschlag haben — dieselbe Bedingung, nach der auch die Vorschau zählt |

Jede Zusammenfassung wird aus dem tatsächlichen Zustand gerechnet;
geschätzt wird nichts. Aufgeklappt entfällt sie, dort sagt der Inhalt
selbst, was gilt.

Der aufklappbare Bereich **„Bilder im Kopfbereich"** sitzt weiterhin
innerhalb von *Export & Backup* und verhält sich unverändert: Er startet
bei jedem Öffnen zugeklappt und trägt die Zahl der Bilder im Titel.

---

## Statistik

Das Balken-Symbol oben rechts öffnet den Statistik-Tab. Er tritt an die
Stelle des Kategorie-Inhalts und rechnet ausschließlich mit den echten
Daten — solange die noch nicht geladen sind, steht dort keine Zahl.

**Eine Kategorie-Auswahl für den ganzen Tab.** Ganz oben steht eine
einzige Knopfreihe: „Alle" und dahinter die sichtbaren Kategorien in
ihrer Reihenfolge. Sie bleibt beim Scrollen am oberen Rand stehen
(`position: sticky`), damit immer dasteht, worauf sich die Zahlen
darunter beziehen. Mehrere Kategorien lassen sich gleichzeitig wählen;
wird die letzte abgewählt, gilt wieder „Alle". Leer wird die Auswahl
also nie.

Ihr folgen **Gesamtstatistik, Zeit, Detailauswertung, „Du vs. IMDb",
Top 10, Bewertungsverteilung** und **„Ø je Kriterium"**. Zwei Abschnitte
folgen ihr bewusst **nicht** und zählen weiter über alle sichtbaren
Kategorien: **„Bewertung prüfen"** sammelt ein, was irgendwo nachzusehen
wäre, und der **Jahresrückblick** zählt ein ganzes Jahr — beide wären
mit einem Kategorie-Filter etwas anderes als das, wofür sie da sind.

**Die Kategorie-Kacheln** mit ihrer Anzahl stehen nur bei „Alle", auch
wenn eine Kategorie leer ist und 0 anzeigt. Ist eine einzelne Kategorie
gewählt, steht ihre Anzahl bereits in der Kennzahl „Gesamt".

**Jeder Abschnitt ist einklappbar.** Die Kopfzeile ist ein Knopf mit
Pfeil und mindestens 44 px hoch; zugeklappt steht unter dem Titel eine
kurze Zusammenfassung in
der gedämpften Monospace-Schrift, gerechnet aus denselben Daten, die
aufgeklappt ausführlich dastehen — die gesehene Zeit in Stunden und
Tagen, Anzahl und Ø Endnote, die größte IMDb-Abweichung mit Vorzeichen,
die stärkste Notenspanne samt Anzahl, die gewählte Kategorie, das
gewählte Jahr. Beim Öffnen des Tabs stehen **Gesamtstatistik** und
**Top 10** offen, alles Übrige zugeklappt. Welcher Abschnitt offen ist,
merkt sich das Gerät im `localStorage`
(`bewertungsapp.statistikAbschnitte`) — wie die Kategorie-Ansicht auch,
und mit demselben stillen Rückfall auf die Vorgabe, wenn der Stand fehlt
oder kaputt ist. Kommt später ein Abschnitt dazu, gilt für ihn die
Vorgabe und nicht der Stand von gestern.

**Getrennt werden die Abschnitte durch eine dünne waagerechte Linie** in
derselben Farbe, die die App in ihren Listen zieht (`#232326`) — keine
Karten, keine Rahmen, keine Hintergrundflächen. Die Linie sitzt am Fuß
des Abschnitts: zugeklappt steht sie direkt unter der Kopfzeile,
aufgeklappt trennt sie dessen Inhalt vom nächsten Abschnitt. Unter dem
letzten Abschnitt entfällt sie, dort gibt es nichts mehr zu trennen. Der
frühere Leerraum von 28 px zwischen den Abschnitten ist damit
weggefallen — die Grenze ist jetzt sichtbar statt leer, und der Tab
wird spürbar kürzer.

**Der Abschnitt „Zeit"** trägt beides, was in Stunden zählt: die
**gesehene Zeit** (Laufzeit mal Sehzähler — was hinter einem liegt) und
den **Zeitaufwand der Watchlist** (was noch vor einem liegt). Gerechnet
wird an beiden Stellen unverändert; Spiele haben keine abrufbare
Laufzeit und bleiben außen vor, Einträge ohne bekannte Laufzeit werden
als Zahl genannt statt geschätzt.

### Jahresrückblick

**Gezählt wird nach der Erstsichtung**, nicht nach der Bewertung. Ein
Eintrag gehört in das Jahr, in dem er zum **ersten Mal gesehen** wurde.
Wer einen Film 2011 gesehen und erst 2026 hier eingetragen hat, hat 2011
einen Film gesehen — 2026 hat er ihn nur bewertet.

Dahinter steht dieselbe `erstsichtung()` wie in der Detailansicht, mit
demselben Rückfall: **Ohne eigenes Erstsichtungsdatum gilt das
Bewertungsdatum** (`ratedAt`). Ausdrücklich nicht `bewertetAm()` — dort
zählt bei Serien die zuletzt nachgetragene Staffel mit, das Jahr wanderte
also mit jeder weiteren Staffel nach vorn. Hier zählt der erste Kontakt,
und der verschiebt sich nicht mehr. Trägt ein Eintrag weder das eine noch
das andere Datum — Altbestand aus der Zeit vor `rated_at` —, steht er in
keinem Jahr; wie viele das sind, sagt die Fußzeile des Abschnitts.

**Die Jahresknöpfe sind nicht vorgegeben**, sondern werden aus den
Jahren gebildet, die tatsächlich vorkommen: Stehen Einträge aus 2019,
2023 und 2026 da, gibt es genau drei Knöpfe, absteigend sortiert. Beim
Öffnen ist das **neueste** vorkommende Jahr gewählt — nicht das laufende;
wer zuletzt 2019 etwas gesehen hat, sähe sonst einen leeren Rückblick.
Alle Kennzahlen und Zeilen darunter beziehen sich ausschließlich auf das
gewählte Jahr, und zugeklappt steht dieses Jahr in der Kopfzeile.

Der Abschnitt zählt über **alle sichtbaren Kategorien** und folgt der
Kategorie-Auswahl oben bewusst nicht — ein Jahr ist ein Jahr. Die Zeilen:
**Meiste Einträge** (die stärkste Kategorie), **Häufigstes Genre**,
**Bester Titel** samt Note und **Gesehene Zeit**. Letztere zählt jede
Laufzeit genau einmal, ohne den Sehzähler — sie beantwortet „was ist in
diesem Jahr dazugekommen?", während die gesehene Zeit im Abschnitt
„Zeit" mit dem Zähler rechnet und „wie viel Zeit steckt insgesamt darin?"
beantwortet. Der Wert **bricht um, statt abgeschnitten zu werden**: Auf
schmalen Geräten stand dort sonst „3944 Stunden · 164 Tage…", und
ausgerechnet die Tage, wegen derer die zweite Hälfte überhaupt dasteht,
fielen weg.

---

## Minispiele

Das Controller-Symbol oben rechts — links neben Statistik und Zahnrad —
öffnet den Minispiele-Bereich. Er steht neben den Kategorien und gehört
zu keiner einzelnen; weitere Spiele kommen später als eigene Kacheln in
dieselbe Übersicht.

### Head-to-Head

Zwei Titel derselben Kategorie treten gegeneinander an. Zuerst wird die
Kategorie gewählt — Kategorien mit weniger als zwei bewerteten Einträgen
stehen nicht zur Wahl und sagen das auch. Duelle finden **ausschließlich
innerhalb einer Kategorie** statt, nie kategorieübergreifend.

Im Duell stehen Poster, Titel und Jahr nebeneinander, dazwischen „VS" —
**ohne Note**, damit die Wahl aus dem Titel kommt und nicht aus der Zahl
daneben. Beide Karten sind **gleich hoch**, egal wie lang die Titel
sind: Der Titelbereich ist auf zwei Zeilen festgelegt, längere Titel
enden mit Auslassungspunkten und bleiben vollständig im
`title`-Attribut lesbar. Poster, Titel und Jahr stehen dadurch links und
rechts auf derselben Höhe, das „VS" mittig dazwischen. Ein Tippen wählt den Favoriten, „Überspringen" springt ohne
jede Auswertung zum nächsten Duell. Ein Zähler zeigt, wie oft in dieser
Kategorie schon gespielt wurde; gezählt werden nur ausgewertete Duelle.

Darunter steht, wie weit das Feld durchgespielt ist — etwa „38 von 1.612
Paarungen gespielt". Gemeint sind **Paarungen**, nicht Duelle, je Paar
einmal gezählt. Die Zeile misst immer genau das, woraus auch gezogen
wird:

| | möglich | gespielt |
|---|---|---|
| **Alle** | alle Paare bewerteter Einträge der Kategorie im Grundfenster von 0,6 (die Erweiterungsstufen unten zählen nicht mit, sie sind der Notausgang für dünne Kategorien) | die Zeilen in `duell_paare` dieser Kategorie |
| **Eingegrenzt** | alle Paare des eingefrorenen Feldes, ohne Notenfenster — wie beim Ziehen | die Zeilen in `duell_paare`, bei denen **beide** Seiten zum Feld gehören |

Der Zähler eine Zeile darüber ist bewusst etwas anderes: Er zählt jedes
ausgewertete Duell samt Wiederholungen und Turniermatches und ergäbe als
Quote ein schiefes Bild.

**Teilnehmerfeld.** Eine kleine Leiste über dem Duell grenzt ein, wer
überhaupt antritt:

| Auswahl | Bedeutung |
|---------|-----------|
| **Alle** | Vorgabe — die ganze Kategorie, Verhalten wie bisher |
| **Nach Platz** | von–bis, zwei Zahlenfelder; Platz 3 bis 7 heißt die Ränge 3 bis 7 der Kategorie-Rangliste, beide dabei |
| **Nach Note** | von–bis, zwei Felder mit einer Nachkommastelle; gemessen wird die angezeigte Endnote, wie beim Notenfilter der Rangliste |

„Übernehmen" bestimmt das Feld — **einmal**. Danach steht fest, wer
dabei ist, bis die Auswahl oder die Kategorie wechselt. Das ist keine
Kleinigkeit, sondern der Kern der Sache: Würde das Feld nach jedem Duell
neu bestimmt, verschöbe es sich durch die eigenen Ergebnisse — ein Titel
fiele mitten im Spiel aus „Platz 3 bis 7" heraus, weil er gerade
gewonnen hat. Noten und Duellzahlen der Teilnehmer bleiben dagegen
aktuell; nur die Zugehörigkeit ist eingefroren. Ein leeres Feld heißt
„ohne Grenze auf dieser Seite", verdrehte Grenzen werden gerade gerückt.

Innerhalb einer Auswahl **entfällt das Notenfenster** samt seiner
Erweiterungsstufen — die Auswahl tritt an seine Stelle, und im Feld darf
jeder gegen jeden. Sperrfrist und die Bevorzugung wenig gespielter Titel
bleiben unverändert aktiv. Stehen weniger als zwei Titel in der Auswahl,
kommt statt eines Duells eine kurze Meldung. Bei „Alle" bleibt alles
exakt wie zuvor.

**Paarung.** Ein zufälliger Anker aus der nach Endnote sortierten
Kategorie-Liste, der Gegner aus einem **Notenfenster von 0,6** um ihn
herum. Gemessen wird also der Abstand der Endnoten selbst — nicht mehr
ein Fenster von Rangplätzen. Der Grund steht in der Wirkung weiter
unten: Der Duell-Zuschlag ist gedeckelt, zwei Titel können sich also
nur um einen begrenzten Betrag aneinander vorbeischieben — bei −0,25
bis +0,25 je Titel um höchstens einen halben Notenpunkt. Bei deutlich
mehr Abstand wäre eine Paarung folgenlos, der Ausgang stünde ohnehin
fest. Die Stufen selbst sind seit der Halbierung des Deckels
unverändert geblieben.

Gibt das engste Fenster nicht genug her — verlangt sind mindestens zwei
mögliche Gegner —, wird schrittweise geöffnet:

| Stufe | Notenfenster |
|-------|--------------|
| 1 | 0,6 |
| 2 | 1,0 |
| 3 | 1,5 |
| 4 | ohne Grenze |

Die letzte Stufe lässt alles zu, damit auch in einer dünn besetzten
Kategorie überhaupt gespielt werden kann. Die Tabelle gilt für „Alle";
in einer eingegrenzten Auswahl greift sie nicht (siehe oben). Innerhalb des Fensters kommt
bevorzugt, wer die wenigsten Duelle hinter sich hat; bei Gleichstand
entscheidet das Los — sonst käme in einer frischen Kategorie, in der
alle bei 0 stehen, immer derselbe. Welcher der beiden links steht, wird
ebenfalls gelost.

**Sperrfrist.** Jedes ausgewertete Duell hält fest, wer gegen wen
angetreten ist (Tabelle `duell_paare`, je Paarung eine Zeile mit dem
Zeitpunkt des letzten Duells). Eine schon gespielte Paarung kommt
deshalb erst dann wieder, wenn im Fenster **keine ungespielte mehr
übrig ist** — und dann die am längsten zurückliegende zuerst. Ein
dauerhaftes Verbot ist das ausdrücklich nicht: Ein Zustand, in dem gar
kein Duell mehr angeboten wird, kann dadurch nicht entstehen.
Zusätzlich bleiben die **drei zuletzt gezogenen** Paarungen für ein
paar Züge draußen.

**Turnier-Matches werden mitprotokolliert** — sie laufen durch denselben
Endpunkt und zählen für die Sperrfrist genauso. Übersprungene Duelle
melden nichts und stehen deshalb auch nicht in der Liste.

**Wirkung.** Nach der Wahl steht der gewählte Titel kurz mit Rahmen in
der Kategoriefarbe und „GEWÄHLT"-Abzeichen da, der andere abgedunkelt;
darunter steht, auf welchem Platz der Gewinner jetzt liegt. Nach etwa
1,3 Sekunden — oder sofort per Tipp — kommt das nächste Duell.

Ein Duell ändert **weder das Bauchgefühl noch einen Kriterienwert**.
Jeder Eintrag hat stattdessen einen eigenen **Elo-Wert** (Spalte `elo`,
Startwert 1000), und nur der verschiebt sich; daneben wachsen die
beiden Zähler `duels` (bei beiden Beteiligten) und `siege` (nur beim
Gewinner):

```
expected = 1 / (1 + 10^((Elo_Verlierer − Elo_Gewinner) / 400))
delta    = K × (1 − expected)                              K = 32

Elo_Gewinner  += delta
Elo_Verlierer −= delta
```

Das ist klassisches Elo mit den üblichen Konstanten. Gerechnet wird auf
dem Server (`api/duels.js`), damit Lesen und Schreiben in einer
Transaktion liegen und zwei kurz aufeinanderfolgende Duelle desselben
Titels sich nicht gegenseitig überschreiben können.

Aus dem Elo-Wert entsteht ein **gedeckelter Zuschlag** auf die Endnote:

```
Zuschlag = 0.25 × tanh((Elo − 1000) / 100)

Endnote  = (75 % Kriterien + 25 % Bauchgefühl) + Zuschlag
```

Der Tangens hyperbolicus läuft von −1 bis 1 und erreicht die Grenzen
nie: Der Zuschlag liegt damit mathematisch **immer echt zwischen −0,25
und +0,25**, egal wie lang eine Siegesserie wird. Ein Hochschaukeln auf
einen unrealistischen Wert ist strukturell ausgeschlossen, nicht nur
unwahrscheinlich. Bei Elo 1000 ist der Zuschlag exakt 0 — ohne
gespieltes Duell steht Ziffer für Ziffer dieselbe Endnote da wie vor
der Duell-Wertung.

Deckel und Skala waren zunächst **0,5 und 200**. Beide sind halbiert
worden, und zwar gemeinsam: An der Spitze der Rangliste liegen die
Noten nur wenige Hundertstel auseinander, während der Zuschlag bis 0,5
gehen konnte — dort bestimmte also nicht mehr die Bewertung die
Reihenfolge, sondern die Duellbilanz. Weil **beide** Zahlen halbiert
sind, bleibt die Steigung im Nullpunkt exakt dieselbe (0,0025 je
Elo-Punkt): Der erste Sieg bringt weiterhin +0,04, drei Siege in Folge
+0,10 statt +0,11. Am frühen Verhalten ändert sich also praktisch
nichts — nur die Sättigung setzt doppelt so früh ein, und mehr als
±0,25 ist nicht mehr erreichbar.

| Elo | Zuschlag |
|-----|----------|
| 800 | −0,24 |
| 900 | −0,19 |
| 950 | −0,12 |
| 975 | −0,06 |
| 1000 (Start) | ±0,00 |
| 1025 | +0,06 |
| 1050 | +0,12 |
| 1100 | +0,19 |
| 1200 | +0,24 |
| 1400 | +0,25 |

Gespeichert wird der Zuschlag nirgends — er entsteht immer wieder neu
aus `elo`. Es gibt damit genau eine Quelle der Wahrheit, und ein
zurückgesetzter Eintrag steht sofort wieder bei 0.

| Ausgang | expected | delta | Elo | Zuschlag |
|---------|----------|-------|-----|----------|
| Beide bei 1000 | 0.5000 | 16.0 | 1016.0 / 984.0 | +0,04 / −0,04 |
| 1200 schlägt 1000 (erwartet) | 0.7597 | 7.7 | 1207.7 / 992.3 | +0,24 / −0,02 |
| 1000 schlägt 1200 (Überraschung) | 0.2403 | 24.3 | 1024.3 / 1175.7 | +0,06 / +0,24 |

Wer den ohnehin stärkeren Titel wählt, verschiebt wenig; eine
Überraschung bewegt deutlich mehr.

**Anzeige und Sortierung.** Die Endnote wird für die **Anzeige** auf 0
bis 10 begrenzt — die Grenze greift erst, wenn ein Zuschlag über die 10
hinausschiebt. **Sortiert** wird dagegen mit dem unbegrenzten Wert,
damit zwei Einträge, die beide bei 10,00 anstoßen, unterscheidbar
bleiben. Die Endnote entsteht an genau einer Stelle im Code
(`entryScore`); Rangliste, Top 10, Medaillen, Statistik und Export
hören alle dort, Duell-Ergebnisse gelten dadurch überall ohne
Sonderbehandlung.

Weil der Klammerteil unangetastet bleibt, rührt ein Duell auch bei
Einträgen **mit Staffeln** keine einzelne Staffelnote an: Der Zuschlag
sitzt am Eintrag, nicht an der Staffel.

Beim Überspringen passiert nichts: kein Elo-Wert ändert sich, die
Paarung gilt weiter als ungespielt, und der Zähler bleibt stehen.

**Auffällige Bewertungen.** Schneidet ein Titel im Duell dauerhaft
anders ab, als seine Kriterien hergeben, passt womöglich die Bewertung
selbst nicht mehr — genau das sagt ein großer Zuschlag. Aus einem
einzigen Duell wäre er allerdings Zufall und kein Hinweis, und ein
Titel, der jedes Duell gewinnt, sammelt Zuschlag, ohne dass daran etwas
widersprüchlich wäre: Er hat schlicht niemanden mehr über sich, gegen
den er verlieren könnte. Gekennzeichnet wird deshalb nur, wo **alle
drei** Punkte zutreffen:

| Bedingung | Wert |
|-----------|------|
| gespielte Duelle | mindestens **3** |
| Betrag des Zuschlags (gerundet, so wie er auch dasteht) | mindestens **0,15** |
| Duellbilanz | mindestens **1 Sieg** und **1 Niederlage** |

Die Schwelle des Zuschlags orientiert sich am Deckel: Bei ±0,25 wären
die früheren 0,20 praktisch das Maximum und damit kaum je erreichbar.
Aussagekräftig ist die Markierung ohnehin nur bei einem Titel, der
teils gewinnt und teils verliert und trotzdem stark von seiner Note
abweicht — das ist der echte Hinweis darauf, dass die Bewertung nicht
mehr passt.

Gekennzeichnet wird an drei Stellen:

- in der Rangliste durch ein kleines **Warndreieck** vor der Note,
- in der Detailansicht durch einen Satz unter der Zuschlag-Zeile,
- in der Statistik durch den Abschnitt **„Bewertung prüfen"** — eine
  Sammelliste aller auffälligen Titel über alle Kategorien hinweg, nach
  dem Betrag des Zuschlags sortiert, der größte zuerst. Erreicht kein
  Titel die Schwelle, gibt es den Abschnitt gar nicht.

Das ist eine Kennzeichnung, keine Rechnung — an der Endnote ändert sie
nichts.

Die gewonnenen Duelle stehen je Eintrag in der Spalte `siege`
(Startwert 0); hochgezählt wird sie nur beim Gewinner. Die Niederlagen
werden nirgends gespeichert, sie sind `duels − siege`. Weil die
bisherigen Duellausgänge nirgends festgehalten wurden, startet `siege`
bei allen vorhandenen Einträgen auf 0 — bis genug neue Duelle gespielt
sind, erfüllt also kein Titel die Bedingung „mindestens 1 Sieg". Die
Markierungen verschwinden zunächst und bauen sich mit der Zeit neu
auf. **Kein Backfill, kein Schätzen von Siegen aus dem Elo-Wert.**

**Zurücksetzen.** Der Zuschlag lässt sich **je Eintrag einzeln**
zurücksetzen: In der Detailansicht steht neben der Zuschlag-Zeile ein
„Zurücksetzen" (`DELETE /api/duels?id=…`). Der Elo-Wert geht damit auf
1000 und der Zuschlag ist wieder exakt 0; die gespielten und
gewonnenen Duelle bleiben gezählt. Wird die Bewertung eines auffälligen Titels geändert, fragt
die App von sich aus nach, ob der Zuschlag aus den alten Duellen stehen
bleiben soll — von selbst zurückgesetzt wird nichts.

**Verrechnen.** Der Zuschlag muss kein dauerhafter dritter Wert neben
der Bewertung bleiben. Hat ein Titel genug Duelle hinter sich, lässt er
sich **in die eigenen Bewertungsfelder übertragen**: Die Endnote bleibt
dabei gleich, sie besteht danach aber wieder allein aus Kriterien und
Bauchgefühl, und der Zuschlag ist 0. Das ist **optional und nie
automatisch** — wer nichts tut, behält das bisherige Verhalten.

Angeboten wird es über einen Knopf „Verrechnen" neben der
Zuschlag-Zeile, und nur wenn **beides** zutrifft:

| Bedingung | Schwelle |
| --- | --- |
| Gespielte Duelle | mindestens **10** (`VERRECHNEN_MIN_DUELLE`) |
| Betrag des Zuschlags (gerundet, so wie er auch dasteht) | mindestens **0,05** (`VERRECHNEN_MIN_BETRAG`) |

Die Rechnung ist die Umkehrung der Endnoten-Formel. Aus

```
Endnote = 0,75 × Kriterien-Note + 0,25 × Bauchgefühl + Zuschlag
```

folgt, dass derselbe Endwert ohne Zuschlag entsteht, wenn entweder das
**Bauchgefühl** um `Zuschlag ÷ 0,25` steigt (das Vierfache des
Zuschlags) oder **jedes Kriterium** um `Zuschlag ÷ 0,75`. Weil die
Kriteriengewichte in Summe 1 ergeben, hebt der zweite Weg die
Kriterien-Note um genau diesen Betrag. Beide Wege sind mathematisch
gleichwertig; sie unterscheiden sich nur darin, wo der Punkt landet.

Ein Bestätigungsdialog zeigt **vor** dem Schreiben, was passieren
würde — mit konkreten Zahlen („Bauchgefühl 9,50 → 10,00", „jedes
Kriterium +0,20") sowie der Endnote davor und danach. Zur Wahl stehen
drei Wege: ins Bauchgefühl, gleichmäßig in die Kriterien, oder **selbst
verteilen** — dann öffnet das gewohnte Bewertungsformular, ergänzt um
einen Hinweistext mit der Zielnote; geändert wird dort allein, was der
Nutzer selbst ändert.

**Rundung wird genannt, nicht verschwiegen.** Die Bewertungsfelder
laufen in Schritten von 0,1 (dieselbe Schrittweite wie die Schieber im
Bewertungsformular). Fällt der berechnete Wert nicht genau auf eine
Stufe, wird auf die nächste gerundet — und die dadurch entstehende
Abweichung steht im Dialog („Endnote danach: 8,07 statt 8,05"). Sie
kann bis zu **0,02** betragen, wenn der Zuschlag ins Bauchgefühl geht
(ein Viertel einer halben Stufe plus Anzeigerundung), und bis zu
**0,04** bei den Kriterien (drei Viertel einer halben Stufe plus
Anzeigerundung).

**Was nicht passt, wird nicht gekappt.** Bauchgefühl und Kriterien sind
auf 0 bis 10 begrenzt. Ein Titel mit Bauchgefühl 9,50 und einem
Zuschlag von +0,20 bräuchte 10,30 — dieser Weg wird dann mit
Begründung als nicht möglich angezeigt („Bauchgefühl kann höchstens
10,0 sein"), der andere bleibt wählbar. Passt keiner, sagt der Dialog
das und bietet nur das eigene Verteilen an. **Kein automatisches
Aufteilen auf beide Felder, kein teilweises Verrechnen.**

Gespeichert wird wie eine normale Bewertungsänderung, ergänzt um
`elo = 1000` in derselben Anfrage (`PUT /api/items?id=…`); der Zuschlag
ist damit 0. `duels`, `siege` und die Einträge in `duell_paare` bleiben
stehen — die Duellhistorie geht nicht verloren. Rückgängig machen lässt
sich der Schritt nicht automatisch, weil die Bewertung danach echt
geändert ist; der Dialog sagt das. Von Hand zurückstellen geht
natürlich jederzeit.

**Alle Zuschläge auf einmal.** Dasselbe gibt es als Sammelfunktion für
die ganze Sammlung: im Daten-Panel (Zahnrad im Kopfbereich) unter
**„Duell-Zuschläge"** steht der Knopf **„Alle Duell-Zuschläge
verrechnen"**. Betroffen ist genau, was auch einzeln angeboten würde —
mindestens **10 Duelle** und ein Zuschlag im Betrag **ab 0,05**. Der
Zuschlag geht dabei immer **gleichmäßig in die Kriterien** (je
Kriterium `Zuschlag ÷ 0,75`), danach steht `elo` auf 1000. Der Weg ins
Bauchgefühl steht hier nicht zur Wahl: Bei einem Stapel kann niemand
Eintrag für Eintrag entscheiden. `duels`, `siege` und die Einträge in
`duell_paare` bleiben stehen.

**Erst Vorschau, dann schreiben.** Der erste Klick rechnet nur und
fasst nichts an. Er zeigt, wie viele Einträge betroffen wären, wie
viele davon verrechnet würden — und welche **übersprungen** werden,
namentlich und mit Begründung. Geschrieben wird erst nach einem
zweiten, ausdrücklichen Klick („N Einträge verrechnen"). Übersprungen
wird, wo ein Kriterium unter 0 oder über 10 fiele: **kein stilles
Kappen.**

**Höchstens 0,01 Abweichung — nachgerechnet, nicht behauptet.** Für
die Sammelaktion gilt eine engere Zusage als für den Einzelweg: Die
Endnote eines verrechneten Eintrags darf sich um höchstens **0,01**
verschieben (`SAMMEL_MAX_ABWEICHUNG`). Dafür rechnet sie auf dem
**Hundertstel** statt auf der 0,1-Stufe des Schiebers
(`SAMMEL_SCHRITT`) — eine halbe Schieberstufe je Kriterium schlüge
sonst mit bis zu 0,04 durch. Angezeigt werden Kriterien ohnehin mit
einer Nachkommastelle, und krumme Werte stehen dort mit Staffeln schon
lange, weil deren Mittel ebenfalls nicht auf der Stufe liegt. Bleibt
trotzdem ein größerer Rest aus den Zwischenrundungen der
Endnoten-Formel, geht dieser Eintrag **unverändert durch** und steht
mit Begründung in der Liste der Übersprungenen. Getestet wird die
Zusage über einen vollständigen Datensatz mit erspielten Elo-Zahlen
(`test/sammel-verrechnen.test.mjs`): Endnoten davor und danach im
Vergleich, Eintrag für Eintrag.

**Die einzelne Verrechnung bleibt, wie sie war.** Der Knopf in der
Detailansicht, seine beiden Wege und seine 0,1-Stufe sind von der
Sammelfunktion unberührt.

### Turnier

Kein zweites Duellspiel, sondern die Runden drumherum: Statt einzelner
Duelle wird ein **K.o.-Turnier** über mehrere Runden bis zu einem Sieger
gespielt. Der Duell-Bildschirm, die Elo-Wertung und der Duell-Zähler sind
**exakt dieselben** wie beim Head-to-Head — das Turnier ergänzt nur
Auslosung, Rundensteuerung und Bracket.

**Auslosung.** Zuerst die Kategorie — Kategorien mit weniger als vier
bewerteten Einträgen stehen nicht zur Wahl. Dann die Turniergröße: **4,
8 oder 16** Teilnehmer, wobei nur Größen anwählbar sind, für die in
dieser Kategorie genug bewertete Einträge vorhanden sind; der Rest ist
ausgegraut und sagt, wie viele fehlen. Vorgemerkte Einträge zählen nicht
mit — sie haben keine Note.

Die Teilnehmer werden **zufällig gelost** (Fisher-Yates über die ganze
Kategorie, danach vorne abgeschnitten). Es gibt **kein Seeding nach
Rang**: Platz 1 kann schon in der ersten Runde auf Platz 2 treffen.

**Ablauf.** Gespielt wird Paarung für Paarung von oben nach unten — bei
8 Teilnehmern also Viertelfinale → Halbfinale → Finale, insgesamt
`n − 1` Duelle. Jede Paarung nutzt denselben Duell-Bildschirm wie das
Head-to-Head: Poster, Titel und Jahr nebeneinander, dazwischen „VS",
**ohne Note**. Anders als dort gibt es **kein Überspringen** — in jeder
Paarung muss eine Wahl getroffen werden, sonst käme niemand weiter.

Jede Wahl löst **dieselbe Auswertung** aus wie ein freies Duell: Der
Elo-Wert beider Titel verschiebt sich über die Formel oben und mit ihm
ihr Zuschlag auf die Endnote, die Paarung wird für die Sperrfrist
mitprotokolliert und der Duell-Zähler der Kategorie wächst. Die
Auswertungen laufen nacheinander, damit zwei schnell hintereinander
gewählte Paarungen sich nicht gegenseitig überschreiben.

**Bracket.** Ein klassischer Turnierbaum läuft in die Breite und passt
damit auf kein Telefon. Hier stehen die Runden deshalb **untereinander**
— Runde 1 oben, darunter die nächste —, je Runde eine Spalte aus
Paarungskarten, dazwischen ein Pfeil nach unten. Jede Karte zeigt beide
Teilnehmer untereinander, getrennt durch eine dünne Linie:

| Zustand | Darstellung |
|---|---|
| Jetzt zu entscheiden | Rahmen und getönter Grund in der Kategoriefarbe |
| Bereits entschieden | Sieger mit Häkchen, Verlierer auf 50 % abgeblendet, Karte auf 85 % |
| Noch nicht erreichbar | „?" statt Titel, Karte auf 35 % abgeblendet |

Unter dem Baum steht von Anfang an der Platz des Siegers: Pokal und
„Turniersieger wird hier gekrönt". Sobald das Finale entschieden ist,
steht dort der Titel.

**Ende.** Nach dem Finale erscheint der Sieger-Bildschirm — Pokal,
„TURNIERSIEGER", Poster und Titel —, darunter führt **Neues Turnier**
zurück zur Größenwahl.

**Abbrechen** ist jederzeit möglich („← Turnier abbrechen"). Die bereits
ausgespielten Paarungen behalten ihre Wirkung — sie waren richtige
Duelle.

Auf den [Aktivitäts-Rang](#aktivitäts-rang) wirkt sich nichts davon aus:
Minispiele geben keine XP.

### Higher or Lower

Oben ein Titel mit sichtbarer Endnote, darunter einer mit verdeckter:
**↑ Höher** oder **↓ Niedriger**? Wer richtig liegt, rückt den unteren
Titel nach oben und bekommt einen neuen darunter — so lange, bis ein
Tipp danebengeht.

**Spielart.** Vor dem Start wird gewählt, womit gespielt wird:
„Gemischt" wirft alle Kategorien zusammen (die Notenskala ist überall
dieselbe, also lassen sich die Noten direkt vergleichen), oder eine
einzelne Kategorie — dann kommen beide Titel aus dieser einen.
Spielarten mit weniger als zwei bewerteten Einträgen sind gesperrt.
Jede Spielart führt **ihren eigenen Bestwert**; er steht schon in der
Auswahl neben der Zahl der bewerteten Titel.

**Ablauf.** Liegt der Tipp richtig, wird die Note aufgedeckt, die Karte
bekommt einen grünen Rahmen und die Strähne wächst um eins; nach etwa
1,3 Sekunden — oder sofort per „Weiter" — kommt die nächste Runde.
**Gleichstand zählt immer als richtig**, in beide Richtungen: bei exakt
gleicher Note ist keine Richtung falscher als die andere.

Liegt der Tipp daneben, endet die Strähne. Der Endstand zeigt die Zahl
der richtigen Tipps und den Bestwert der Spielart zum Vergleich; wurde
er übertroffen, ist er bereits aktualisiert und mit „NEUER BESTWERT"
hervorgehoben. „Nochmal" startet einen neuen Durchgang in derselben
Spielart.

Gespielt wird ausschließlich mit **bewerteten** Titeln — vorgemerkte
haben keine Note und kommen nicht vor. Das Spiel liest nur: es ändert
an keiner Bewertung etwas. Festgehalten wird allein der Bestwert.

### Was schau ich?

Für Abende, an denen die Wahl schwerer fällt als das Schauen. Zuerst
wird die Kategorie gewählt — jede mit der Zahl ihrer Watchlist-Einträge
daneben („Filme · 4 vorgemerkt", bei Spielen „im Backlog"). Kategorien
mit leerer Watchlist sind gesperrt und sagen das auch. Gedreht wird
immer **innerhalb einer Kategorie**, nie kategorieübergreifend.

„Drehen" lässt das Fenster schnell durch die Watchlist blättern: Poster,
Titel und Jahr wechseln zunächst alle 45 Millisekunden, die Standzeit
wächst gleichmäßig bis auf 340 ms, nach rund drei Sekunden bleibt es
stehen. Das ist reine Text- und Bildvertauschung — kein Canvas, kein
gezeichnetes Rad.

Der Gewinner wird **vorab** gezogen; danach rechnet das Spiel zurück, wo
die Walze anfangen muss, um genau bei ihm anzukommen. Dadurch läuft das
Fenster durchgehend in eine Richtung durch die (vorher gemischte) Liste,
statt bei jedem Bild neu zu würfeln — Letzteres wäre als Stottern zu
sehen, wenn zweimal derselbe Titel hintereinander fiele. Jeder Titel der
Watchlist ist dabei gleich wahrscheinlich.

Wer schnelle Bildwechsel abbestellt hat (`prefers-reduced-motion`),
bekommt keine: dann steht das Ergebnis nach einer kurzen Bedenkzeit ohne
Flackern da.

Am Ende steht der Titel groß unter „HEUTE SCHAUST DU", das Fenster ist in
der Kategoriefarbe gerahmt. Zwei Wege führen weiter: **Nochmal drehen**
für eine neue Runde in derselben Kategorie, oder **Bewerten** — das
öffnet genau dasselbe Bewertungsformular wie „✓ Ansehen" in der
Watchlist, samt Wechsel in die Kategorie des Titels. Gespeichert wird
danach der vorgemerkte Eintrag selbst; es entsteht kein zweiter.

Gezogen wird ausschließlich aus der **Watchlist**, nie aus bereits
bewerteten Titeln. Das Spiel speichert nichts — kein Bestwert, keine
Statistik; es ist für den Moment gedacht.

---

## Aktivitäts-Rang

Unter dem Titel „Rifat's Archiv" steht ein kleiner Chip mit dem
Zeichen der Stufe und dem Rangnamen. Er gehört **dem Nutzer**, nicht den Titeln: mit den
Medaillen der ersten drei Plätze in den Ranglisten hat er nichts zu
tun. Er ist rein kosmetisch — kein Filter, keine Sortierung, keine
Bewertung hängt daran.

Ein Tipp öffnet die Übersicht: oben der eigene Stand (Zeichen im
Farbkreis, Rangname, „Rang X von 8", Fortschrittsbalken und der
XP-Text, z. B. „1.240 / 1.800 XP bis Platin"), darunter die ganze
Leiter mit der höchsten Stufe zuoberst. Erreichte Stufen tragen ein
Häkchen, die aktuelle einen Rahmen, einen getönten Hintergrund und ein
„AKTUELL"-Abzeichen, kommende ein Schloss. Getönt wird durchweg mit der
Farbe der **aktuellen** Stufe. Beim Champion entfällt der Balken; dort
steht „Höchster Rang erreicht".

### Stufen

| Stufe | Farbe | ab | Zeichen |
|---|---|---|---|
| Kupfer | `#C97D4A` | 0 XP | Münze |
| Bronze | `#A9662F` | 200 XP | Schild |
| Silber | `#A8A8B0` | 500 XP | Stern |
| Gold | `#D4AF37` | 900 XP | Barren |
| Platin | `#7FA8B3` | 1.800 XP | Krone |
| Smaragd | `#2E9B6F` | 3.200 XP | Geschliffener Stein |
| Diamant | `#9B7FD4` | 5.000 XP | Raute |
| Champion | `#D6453F` | 7.500 XP | Pokal |

Jede Stufe trägt ihr eigenes Zeichen — vorher stand über allen achten
dasselbe Schild, die Stufe war auf dem Chip also nur am Namen zu
erkennen. Es sind Strichzeichnungen wie die übrigen Symbole der App:
die Farbe kommt vom Umfeld, also von der Stufe. Der Pokal ist derselbe
wie beim Turniersieger. Eine später ergänzte Stufe ohne hinterlegtes
Zeichen trägt weiterhin das Schild.

Gespeichert wird **nichts davon** — weder die Punkte noch die Stufe.
Beides wird bei jeder Anzeige neu gerechnet: die Punkte aus dem
Bestand, die Stufe aus den Punkten. Eine spätere Änderung der
Schwellen muss deshalb nichts umschreiben.

### Punkte

| Quelle | XP |
|---|---|
| Je **bewertetem** Eintrag in der Sammlung | 10 |

Das ist die einzige Quelle. Der Stand ist keine mitgeführte Summe,
sondern eine Rechnung auf dem aktuellen Bestand:

```
XP = 10 × Anzahl der bewerteten Einträge (alle Kategorien zusammen)
```

„Alle Kategorien" heißt wörtlich alle — auch die, die in den
Einstellungen ausgeblendet sind (siehe „Welche Kategorien angezeigt
werden"). Gesehen ist gesehen. Der Stand kann dadurch höher stehen, als
die sichtbaren Einträge erklären; das ist so gewollt und kein Fehler.

Steigen kann also nur, wer wirklich schaut und bewertet. Und weil
gerechnet und nicht gezählt wird, nimmt ein **entfernter Titel seine
Punkte von selbst wieder mit** — dafür braucht es keine Abzugslogik
und keine Zuordnung „XP ↔ Titel".

**Was nicht zählt:** Vorgemerktes (Watchlist bzw. Backlog) hat keine
Note und zählt nicht. „Am Schauen" ist ein Kennzeichen *neben* der
Bewertung und ändert nichts; der Sehzähler zählt Durchläufe, keine
Einträge. Und die **Minispiele geben gar keine Punkte**: weder das
Head-to-Head-Duell noch der Turnier-Modus, das Zufallsrad oder ein
neuer Bestwert bei Higher or Lower. Sie bleiben ansonsten unverändert —
Elo-Zuschlag auf die Endnoten, Bestwerte und Serien laufen weiter wie
zuvor, nur eben ohne Wirkung auf den Rang.

Kommt eine Bewertung dazu, blendet sich kurz „+10 XP" ein, in der Farbe
des aktuellen Rangs. Fällt der Stand (ein Eintrag wurde entfernt), gibt
es keine Einblendung.

Solange die Sammlung noch lädt, steht anstelle des Chips ein gedimmter
Platzhalter: Die Punkte kommen aus ihr, „0 XP" hieße also „Kupfer" und
wäre schlicht falsch.

---

## Berechnung

Filme, Serien, Anime und Adult Animation:

```
Kriteriennote = Story×0.25 + Charaktere×0.20 + Unterhaltung×0.15
              + Emotion×0.15 + Inszenierung×0.10 + Schauspiel×0.10
              + Sound×0.05
```

Kinderserien:

```
Kriteriennote = Nostalgie×0.20 + Charaktere×0.20 + Humor×0.20
              + Story×0.15 + Optik×0.15 + Intro×0.10
```

Dokus:

```
Kriteriennote = Informationsgehalt×0.25 + Aufbau×0.20
              + Protagonisten×0.15 + Bildsprache×0.15
              + Unterhaltung×0.10 + Glaubwürdigkeit×0.10
              + Sound×0.05
```

Sitcoms/Comedy:

```
Kriteriennote = Humor×0.25 + Ensemble×0.20 + Dialoge×0.15
              + Wiederschauwert×0.15 + Story×0.10 + Schauspiel×0.10
              + Musik×0.05
```

Spiele:

```
Kriteriennote = Gameplay×0.25 + Story×0.25 + Charaktere×0.15
              + Welt×0.15 + Grafik×0.10 + Sound×0.05
              + Wiederspielwert×0.05
```

Die Endnote entsteht in allen Kategorien gleich:

```
Endnote = (Kriteriennote × 0.75 + Bauchgefühl × 0.25) + Duell-Zuschlag
```

Der Klammerteil ist das, was das Bewertungsformular ergibt; bei
Einträgen mit Staffeln steht dort das gewichtete Mittel der
Staffelnoten. Der Duell-Zuschlag kommt aus dem Elo-Wert des Eintrags
und ist ohne gespieltes Duell exakt 0:

```
Duell-Zuschlag = 0.25 × tanh((Elo − 1000) / 100)
```

Er liegt damit immer echt zwischen −0,25 und +0,25. Woher der Elo-Wert
kommt und wie er sich verschiebt, steht beim Minispiel
**Head-to-Head**.

Für die **Anzeige** wird die Endnote auf 0 bis 10 begrenzt — die Grenze
greift erst, wenn ein Zuschlag über die 10 hinausschiebt. **Sortiert**
wird dagegen mit dem unbegrenzten Wert, damit zwei Einträge, die beide
bei 10,00 anstoßen, unterscheidbar bleiben.

Kriteriennote und Endnote auf zwei Nachkommastellen gerundet.
