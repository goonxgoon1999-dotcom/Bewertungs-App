import React, { useState, useEffect, useMemo, useRef } from "react";

/* ============================================================
   KRITERIEN-DEFINITION — je Kategorie eigene Kriterien

   Film, Serie und Anime teilen sich dieselben sieben Datenfelder
   und Gewichte. Anime beschriftet zwei davon nur anders: aus
   "Inszenierung" wird "Animation", aus "Schauspiel" wird
   "Synchronstimme". Die Feldnamen (inszenierung, schauspiel) und
   die Gewichte bleiben identisch — gespeicherte Werte gelten also
   unverändert weiter, es ändert sich ausschließlich die Anzeige.

   Spiele haben eigene Kriterien und dadurch eigene Datenfelder.
   ============================================================ */
const AV_CRITERIA = [
  { key: "story", label: "Story & Drehbuch", weight: 0.25, hint: "Handlung, Aufbau, Logik, Dialoge, Pacing" },
  { key: "charaktere", label: "Charaktere", weight: 0.20, hint: "Entwicklung, Tiefe, Beziehungen, Motivation" },
  { key: "unterhaltung", label: "Unterhaltung", weight: 0.15, hint: "Wie fesselnd und unterhaltsam ist das Werk?" },
  { key: "emotion", label: "Emotion & Wirkung", weight: 0.15, hint: "Spannung, Emotionen, Gänsehaut, Wirkung danach" },
  { key: "inszenierung", label: "Inszenierung", weight: 0.10, hint: "Regie, Kamera, Schnitt, Atmosphäre" },
  { key: "schauspiel", label: "Schauspiel", weight: 0.10, hint: "Leistungen, Chemie, Performance" },
  { key: "sound", label: "Soundtrack / Sounddesign", weight: 0.05, hint: "Musik, Score, Soundeffekte" },
];

/* Nur die Beschriftung weicht ab — Feld und Gewicht bleiben gleich. */
const ANIME_LABELS = {
  inszenierung: { label: "Animation", hint: "Animationsqualität, Bildgestaltung, Atmosphäre" },
  schauspiel: { label: "Synchronstimme", hint: "Sprecherleistung, Chemie, Performance" },
};

const ANIME_CRITERIA = AV_CRITERIA.map((c) =>
  ANIME_LABELS[c.key] ? { ...c, ...ANIME_LABELS[c.key] } : c
);

const GAME_CRITERIA = [
  { key: "gameplay", label: "Gameplay", weight: 0.25, hint: "Steuerung, Spielmechanik, Spielgefühl" },
  { key: "story", label: "Story", weight: 0.25, hint: "Handlung, Aufbau, Erzählung" },
  { key: "charaktere", label: "Charaktere", weight: 0.15, hint: "Entwicklung, Tiefe, Motivation" },
  { key: "welt", label: "Welt", weight: 0.15, hint: "Spielwelt, Leveldesign, Atmosphäre" },
  { key: "grafik", label: "Grafik", weight: 0.10, hint: "Optik, Artdesign, technische Umsetzung" },
  { key: "sound", label: "Sound", weight: 0.05, hint: "Musik, Effekte, Vertonung" },
  { key: "wiederspielwert", label: "Wiederspielwert", weight: 0.05, hint: "Motivation für weitere Durchgänge, Umfang" },
];

const CRITERIA_BY_CATEGORY = {
  movie: AV_CRITERIA,
  series: AV_CRITERIA,
  anime: ANIME_CRITERIA,
  game: GAME_CRITERIA,
};

/** Die Kriterien einer Kategorie — nie global, immer über diese Funktion. */
function criteriaFor(category) {
  return CRITERIA_BY_CATEGORY[category] || AV_CRITERIA;
}

const CATEGORIES = [
  { key: "movie", label: "Filme", singular: "Film" },
  { key: "series", label: "Serien", singular: "Serie" },
  { key: "anime", label: "Anime", singular: "Anime" },
  { key: "game", label: "Spiele", singular: "Spiel" },
];

const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/* Alle vorkommenden Kriterien-Felder, in stabiler Reihenfolge —
   für den CSV-Export über mehrere Kategorien hinweg. */
const ALL_CRITERIA_KEYS = Array.from(
  new Set(CATEGORY_KEYS.flatMap((k) => criteriaFor(k).map((c) => c.key)))
);

/* ============================================================
   BERECHNUNG
   ============================================================ */
function computeCriteriaScore(values, category) {
  let total = 0;
  for (const c of criteriaFor(category)) {
    const v = values ? values[c.key] : undefined;
    if (typeof v === "number") total += v * c.weight;
  }
  return Math.round(total * 100) / 100;
}

function computeFinalScore(values, personal, category) {
  const criteriaScore = computeCriteriaScore(values, category);
  if (typeof personal !== "number") return criteriaScore;
  return Math.round((0.75 * criteriaScore + 0.25 * personal) * 100) / 100;
}

function scoreToColor(score) {
  if (score < 6) return "#DC2626";
  if (score < 6.5) return "#EA6C0C";
  if (score < 7) return "#D4A017";
  if (score < 8) return "#16A34A";
  if (score < 9) return "#0E9CAB";
  return "#3B4FE0";
}

const DISTRIBUTION_BANDS = [
  { label: "9 – 10", min: 9, max: 10.001, color: "#3B4FE0" },
  { label: "8 – 8.99", min: 8, max: 9, color: "#0E9CAB" },
  { label: "7 – 7.99", min: 7, max: 8, color: "#16A34A" },
  { label: "6 – 6.99", min: 6, max: 7, color: "#D4A017" },
  { label: "5 – 5.99", min: 5, max: 6, color: "#EA6C0C" },
  { label: "unter 5", min: -Infinity, max: 5, color: "#DC2626" },
];

const SCORE_PRESETS = [
  { key: "all", label: "Alle", min: 0, max: 10 },
  { key: "9", label: "9.0–10.0", min: 9, max: 10 },
  { key: "8", label: "8.0–8.99", min: 8, max: 8.99 },
  { key: "7", label: "7.0–7.99", min: 7, max: 7.99 },
  { key: "6", label: "6.0–6.99", min: 6, max: 6.99 },
  { key: "u6", label: "unter 6.0", min: 0, max: 5.99 },
];

const SORT_OPTIONS = [
  { key: "score-desc", label: "Bewertung: hoch → niedrig" },
  { key: "score-asc", label: "Bewertung: niedrig → hoch" },
  { key: "title-asc", label: "Alphabetisch A → Z" },
  { key: "title-desc", label: "Alphabetisch Z → A" },
  { key: "recent-desc", label: "Neueste zuerst" },
  { key: "recent-asc", label: "Älteste zuerst" },
];

const DEFAULT_FILTER = { sort: "score-desc", min: 0, max: 10 };

function emptyValues(category) {
  const v = {};
  for (const c of criteriaFor(category)) v[c.key] = null;
  return v;
}

function isValuesComplete(values, category) {
  return criteriaFor(category).every(
    (c) => values && typeof values[c.key] === "number" && values[c.key] >= 0 && values[c.key] <= 10
  );
}

function csvEscape(s) {
  const str = String(s ?? "");
  if (/[",\n;]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function isLikelyUrl(s) {
  return typeof s === "string" && /^https?:\/\//i.test(s.trim());
}

/* ============================================================
   KLEINTEILE
   ============================================================ */
function ScoreBadge({ score, size = "md" }) {
  const big = size === "lg";
  return (
    <span
      style={{
        background: scoreToColor(score),
        color: "#faf7f0",
        borderRadius: 4,
        padding: big ? "6px 14px" : "3px 9px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: big ? 20 : 13,
        fontWeight: 700,
        minWidth: big ? 72 : 48,
        textAlign: "center",
        display: "inline-block",
        flexShrink: 0,
      }}
    >
      {score.toFixed(2)}
    </span>
  );
}

/* ------------------------------------------------------------
   Poster-Darstellung

   WICHTIG (Ursache des "Poster wird nicht angezeigt"-Fehlers):
   Die Artefakt-Umgebung bereinigt das HTML und blockiert externe
   Bilder in <img>-Tags — das src-Attribut wird entwertet, das
   Bild lädt nie, onError feuert sofort und es blieb immer der
   Buchstaben-Platzhalter stehen.

   Lösung hier:
   1. Die URL wird per JS (new Image()) vorgeladen. Damit wissen
      wir zuverlässig, ob das Bild überhaupt ladbar ist.
   2. Die Anzeige erfolgt als CSS-Hintergrundbild statt als
      <img>-Tag, da CSS nicht durch die HTML-Bereinigung läuft.
   3. Der Zustand wird bei jedem URL-Wechsel zurückgesetzt
      (vorher blieb "broken" für immer hängen — zweiter Bug).
   ------------------------------------------------------------ */
/* ------------------------------------------------------------
   API-Client — spricht ausschließlich mit der eigenen Domain.
   ------------------------------------------------------------ */
const api = {
  async loadAll() {
    const res = await fetch("/api/items");
    if (!res.ok) throw new Error("Laden fehlgeschlagen (" + res.status + ")");
    return res.json();
  },
  async create(item) {
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Anlegen fehlgeschlagen");
    return res.json();
  },
  async update(id, item) {
    const res = await fetch("/api/items?id=" + encodeURIComponent(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Speichern fehlgeschlagen");
    return res.json();
  },
  async remove(id) {
    const res = await fetch("/api/items?id=" + encodeURIComponent(id), { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Löschen fehlgeschlagen");
    return res.json();
  },
  async findPoster(title, category) {
    const res = await fetch(
      "/api/poster?title=" + encodeURIComponent(title) + "&category=" + encodeURIComponent(category)
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  },
};

/* Farbiger Platzhalter aus dem Titel, falls kein Poster vorhanden ist. */
function placeholderStyle(title) {
  let hash = 0;
  const t = String(title || "?");
  for (let i = 0; i < t.length; i++) hash = (hash * 31 + t.charCodeAt(i)) % 360;
  return {
    background: "linear-gradient(150deg, hsl(" + hash + ",22%,26%) 0%, hsl(" + ((hash + 40) % 360) + ",18%,15%) 100%)",
    color: "rgba(237,234,227,0.72)",
  };
}

function initialsOf(title) {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

/* Poster: hier ganz normales <img>. Auf einer eigenen Domain gibt es
   die Sandbox-Beschränkung der Artefakt-Umgebung nicht mehr. */
function Poster({ url, title, size = 44 }) {
  const clean = typeof url === "string" ? url.trim() : "";
  const usable = clean && isLikelyUrl(clean);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false); // Zustand bei URL-Wechsel zurücksetzen
  }, [clean]);

  const h = Math.round(size * 1.42);
  const base = {
    width: size, height: h, borderRadius: 5, flexShrink: 0,
    border: "1px solid #2A2A2E", boxSizing: "border-box",
  };

  if (usable && !broken) {
    return (
      <img
        src={clean}
        alt={title}
        loading="lazy"
        onError={() => setBroken(true)}
        style={{ ...base, objectFit: "cover", backgroundColor: "#141416", display: "block" }}
      />
    );
  }

  return (
    <div
      title={title}
      style={{
        ...base,
        ...placeholderStyle(title),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Playfair Display', serif",
        fontSize: Math.max(11, size * 0.34), fontWeight: 700, letterSpacing: 0.5,
      }}
    >
      {initialsOf(title)}
    </div>
  );
}

function Slider({ label, weightLabel, hint, value, onChange }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14.5 }}>
          {label}
          {weightLabel && (
            <span style={{ color: "#C9A227", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, marginLeft: 8 }}>
              {weightLabel}
            </span>
          )}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: "#C9A227", fontWeight: 700 }}>
          {typeof value === "number" ? value.toFixed(1) : "–"}
        </span>
      </div>
      {hint && <div style={{ fontSize: 12, color: "#77746c", marginBottom: 8, marginTop: 2 }}>{hint}</div>}
      <input
        type="range"
        min="0"
        max="10"
        step="0.1"
        value={typeof value === "number" ? value : 5}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", height: 32, accentColor: "#C9A227", touchAction: "pan-y" }}
      />
    </div>
  );
}

function BottomSheet({ title, onClose, children }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: "14px 14px 0 0",
          padding: 22, width: "100%", maxWidth: 520, boxSizing: "border-box",
          maxHeight: "85vh", overflowY: "auto", WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ width: 36, height: 4, background: "#33333a", borderRadius: 2, margin: "0 auto 16px" }} />
        {title && <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 16px" }}>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({ title, text, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <BottomSheet title={title} onClose={onCancel}>
      <p style={{ color: "#9A968C", fontSize: 14.5, lineHeight: 1.5, margin: "0 0 20px" }}>{text}</p>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onCancel}
          style={{ flex: 1, padding: "14px", background: "transparent", color: "#9A968C", border: "1px solid #33333a", borderRadius: 8, fontSize: 15, cursor: "pointer" }}
        >
          Abbrechen
        </button>
        <button
          onClick={onConfirm}
          style={{
            flex: 1, padding: "14px", background: danger ? "#DC2626" : "#C9A227",
            color: danger ? "#faf7f0" : "#17171A", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer",
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </BottomSheet>
  );
}

/* ============================================================
   FILTER-BOTTOM-SHEET (Sortierung + Bewertungsbereich)
   ============================================================ */
function FilterSheet({ initial, totalCount, allInCategory, onApply, onClose }) {
  const [sort, setSort] = useState(initial.sort);
  const [min, setMin] = useState(initial.min);
  const [max, setMax] = useState(initial.max);

  const previewCount = useMemo(() => {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return allInCategory.filter((f) => f.score >= lo && f.score <= hi).length;
  }, [min, max, allInCategory]);

  function applyPreset(p) {
    setMin(p.min);
    setMax(p.max);
  }

  function handleApply() {
    onApply({ sort, min: Math.min(min, max), max: Math.max(min, max) });
  }

  function handleReset() {
    setSort(DEFAULT_FILTER.sort);
    setMin(DEFAULT_FILTER.min);
    setMax(DEFAULT_FILTER.max);
    onApply({ ...DEFAULT_FILTER });
  }

  return (
    <BottomSheet title="Filter" onClose={onClose}>
      <div style={{ fontSize: 12, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>
        SORTIERUNG
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
        {SORT_OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => setSort(o.key)}
            style={{
              textAlign: "left", padding: "12px 14px", borderRadius: 8, fontSize: 14, cursor: "pointer",
              background: sort === o.key ? "#C9A227" : "#141416",
              color: sort === o.key ? "#17171A" : "#EDEAE3",
              border: "1px solid " + (sort === o.key ? "#C9A227" : "#2A2A2E"),
              fontWeight: sort === o.key ? 700 : 400,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>
        BEWERTUNGSBEREICH
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {SCORE_PRESETS.map((p) => {
          const active = min === p.min && max === p.max;
          return (
            <button
              key={p.key}
              onClick={() => applyPreset(p)}
              style={{
                padding: "8px 12px", borderRadius: 6, fontSize: 12.5, cursor: "pointer",
                background: active ? "#C9A227" : "transparent",
                color: active ? "#17171A" : "#9A968C",
                border: "1px solid " + (active ? "#C9A227" : "#33333a"),
                fontWeight: active ? 700 : 400,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11.5, color: "#9A968C" }}>Mindestnote</label>
          <input
            type="number" min="0" max="10" step="0.1" value={min}
            onChange={(e) => setMin(Math.max(0, Math.min(10, parseFloat(e.target.value) || 0)))}
            style={{ width: "100%", boxSizing: "border-box", background: "#141416", border: "1px solid #33333a", borderRadius: 8, padding: "12px", color: "#EDEAE3", fontSize: 15, marginTop: 4 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11.5, color: "#9A968C" }}>Höchstnote</label>
          <input
            type="number" min="0" max="10" step="0.1" value={max}
            onChange={(e) => setMax(Math.max(0, Math.min(10, parseFloat(e.target.value) || 0)))}
            style={{ width: "100%", boxSizing: "border-box", background: "#141416", border: "1px solid #33333a", borderRadius: 8, padding: "12px", color: "#EDEAE3", fontSize: 15, marginTop: 4 }}
          />
        </div>
      </div>

      <div style={{ fontSize: 13, color: "#9A968C", marginBottom: 18, textAlign: "center" }}>
        <strong style={{ color: "#EDEAE3" }}>{previewCount}</strong> von {totalCount} Einträgen
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleReset}
          style={{ flex: 1, padding: "14px", background: "transparent", color: "#9A968C", border: "1px solid #33333a", borderRadius: 8, fontSize: 15, cursor: "pointer" }}
        >
          Filter zurücksetzen
        </button>
        <button
          onClick={handleApply}
          style={{ flex: 1, padding: "14px", background: "#C9A227", color: "#17171A", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer" }}
        >
          Anwenden
        </button>
      </div>
    </BottomSheet>
  );
}

/* ============================================================
   BEWERTUNGSFORMULAR (Neu + Bearbeiten) — für jeden Eintrag identisch
   ============================================================ */
function RatingForm({ category, categoryLabel, initialTitle, initialPoster, initialValues, initialPersonal, onSave, onCancel }) {
  const criteria = criteriaFor(category);
  const [title, setTitle] = useState(initialTitle || "");
  const [poster, setPoster] = useState(initialPoster || "");
  const [values, setValues] = useState(initialValues || emptyValues(category));
  const [personal, setPersonal] = useState(typeof initialPersonal === "number" ? initialPersonal : null);
  const [touched, setTouched] = useState(false);

  const complete = title.trim().length > 0 && isValuesComplete(values, category) && typeof personal === "number";
  const criteriaScore = computeCriteriaScore(values, category);
  const finalScore = complete ? computeFinalScore(values, personal, category) : null;

  function handleSave() {
    setTouched(true);
    if (!complete) return;
    onSave({ title: title.trim(), poster: poster.trim(), values, personal });
  }

  return (
    <div style={{ background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 12, padding: 20, marginBottom: 28 }}>
      <div style={{ fontSize: 12, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace", marginBottom: 14 }}>
        {categoryLabel.toUpperCase()} · BEWERTUNGSFORMULAR
      </div>

      <label style={{ fontSize: 12, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace" }}>
        TITEL
      </label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titel eingeben"
        style={{
          width: "100%", boxSizing: "border-box", background: "#141416", border: "1px solid #33333a",
          borderRadius: 8, padding: "14px 12px", color: "#EDEAE3", fontSize: 16, marginTop: 6, marginBottom: 18,
        }}
      />

      <label style={{ fontSize: 12, letterSpacing: 1, color: "#9A968C", fontFamily: "'JetBrains Mono', monospace" }}>
        POSTER-URL (OPTIONAL)
      </label>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 6, marginBottom: 22 }}>
        <input
          type="text"
          value={poster}
          onChange={(e) => setPoster(e.target.value)}
          placeholder="https://..."
          style={{
            flex: 1, boxSizing: "border-box", background: "#141416", border: "1px solid #33333a",
            borderRadius: 8, padding: "14px 12px", color: "#EDEAE3", fontSize: 14,
          }}
        />
        {poster.trim() && <Poster url={poster.trim()} title={title} size={44} />}
      </div>

      {criteria.map((c) => (
        <Slider
          key={c.key}
          label={c.label}
          weightLabel={`${Math.round(c.weight * 100)}%`}
          hint={c.hint}
          value={values[c.key]}
          onChange={(v) => setValues((prev) => ({ ...prev, [c.key]: v }))}
        />
      ))}

      <div style={{ marginTop: 6, marginBottom: 4, padding: "16px 14px", background: "#141416", border: "1px dashed #C9A227", borderRadius: 8 }}>
        <Slider
          label="Bauchgefühl (rein subjektiv)"
          weightLabel="25%"
          hint={`Egal was die ${criteria.length} Kriterien sagen — wie sehr berührt es dich wirklich?`}
          value={personal}
          onChange={setPersonal}
        />
      </div>

      <div style={{ fontSize: 13.5, color: "#9A968C", marginTop: 12, lineHeight: 1.8 }}>
        Kriterien-Note: <strong style={{ color: "#EDEAE3" }}>{criteriaScore.toFixed(2)}</strong>
        {typeof personal === "number" && (
          <>
            {" "}· Endnote (live):{" "}
            <strong style={{ color: "#C9A227", fontSize: 16 }}>{computeFinalScore(values, personal, category).toFixed(2)}</strong>
          </>
        )}
      </div>

      {touched && !complete && (
        <div style={{ color: "#d9736a", fontSize: 13, marginTop: 10 }}>
          Bitte Titel eingeben und alle {criteria.length + 1} Werte ({criteria.length} Kriterien + Bauchgefühl) setzen.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button
          onClick={handleSave}
          style={{
            flex: 1, padding: "15px", background: complete ? "#C9A227" : "#3a3a3f",
            color: complete ? "#17171A" : "#77746c", border: "none", borderRadius: 8,
            fontWeight: 700, fontSize: 15.5, cursor: "pointer",
          }}
        >
          Speichern{complete && ` — ${finalScore.toFixed(2)}`}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "15px 18px", background: "transparent", color: "#9A968C",
            border: "1px solid #33333a", borderRadius: 8, cursor: "pointer", fontSize: 15,
          }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   DETAILANSICHT — identisch für jeden Eintrag
   ============================================================ */
function DetailView({ entry, category, singular, onBack, onEdit, onDelete }) {
  const criteria = criteriaFor(category);
  const criteriaScore = computeCriteriaScore(entry.values, category);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#17171A", zIndex: 50, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 40px" }}>
        <button
          onClick={onBack}
          style={{ background: "transparent", border: "none", color: "#9A968C", fontSize: 15, cursor: "pointer", padding: "10px 0", marginBottom: 8 }}
        >
          ← Zurück
        </button>

        <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
          <div style={{ flexShrink: 0 }}>
            <Poster url={entry.poster} title={entry.title} size={72} />
          </div>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, color: "#C9A227", fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
              {singular.toUpperCase()}
            </div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 26, margin: 0, lineHeight: 1.2 }}>
              {entry.title}
            </h1>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <span style={{ fontSize: 13, color: "#9A968C" }}>Endnote</span>
          <ScoreBadge score={entry.score} size="lg" />
        </div>

        <div style={{ display: "flex", gap: 20, marginBottom: 20, fontSize: 14, color: "#9A968C" }}>
          <div>Kriterien-Note: <strong style={{ color: "#EDEAE3" }}>{criteriaScore.toFixed(2)}</strong></div>
          <div>Bauchgefühl: <strong style={{ color: "#EDEAE3" }}>{entry.personal.toFixed(2)}</strong></div>
        </div>

        <div style={{ marginBottom: 24 }}>
          {criteria.map((c) => (
            <div key={c.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #232326" }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 11.5, color: "#77746c", marginTop: 2 }}>{c.hint}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: "#C9A227", fontFamily: "'JetBrains Mono', monospace" }}>
                  {Math.round(c.weight * 100)}%
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700 }}>
                  {typeof entry.values[c.key] === "number" ? entry.values[c.key].toFixed(1) : "–"}
                </span>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: "#C9A227" }}>Bauchgefühl</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "#C9A227", fontFamily: "'JetBrains Mono', monospace" }}>25%</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700 }}>
                {entry.personal.toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onEdit}
            style={{ flex: 1, padding: "15px", background: "#C9A227", color: "#17171A", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer" }}
          >
            Bearbeiten
          </button>
          <button
            onClick={onDelete}
            style={{ padding: "15px 18px", background: "transparent", color: "#d9736a", border: "1px solid #d9736a", borderRadius: 8, cursor: "pointer", fontSize: 15 }}
          >
            Löschen
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   STATISTIK — eigener Hauptbereich (kein Overlay, sondern Tab)
   ============================================================ */
/* Kennzahlen einer Liste: Anzahl, Durchschnitt, höchste und
   niedrigste Endnote. Wird von der Statistik-Seite genutzt. */
function statsFor(list) {
  const count = list.length;
  const avg = count ? list.reduce((s, f) => s + f.score, 0) / count : 0;
  const max = count ? Math.max(...list.map((f) => f.score)) : 0;
  const min = count ? Math.min(...list.map((f) => f.score)) : 0;
  return { count, avg, max, min };
}

const STATS_SCOPES = [{ key: "all", label: "Alle" }, ...CATEGORIES.map((c) => ({ key: c.key, label: c.label }))];

function StatsPage({ ranked }) {
  const [scope, setScope] = useState("all");

  const overall = useMemo(() => {
    const all = CATEGORY_KEYS.flatMap((k) => ranked[k]);
    return {
      counts: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, ranked[k].length])),
      countTotal: all.length,
      ...statsFor(all),
    };
  }, [ranked]);

  const scopedList = useMemo(() => {
    if (scope === "all") return CATEGORY_KEYS.flatMap((k) => ranked[k]);
    return ranked[scope];
  }, [ranked, scope]);

  const scopedStats = statsFor(scopedList);

  /* Kriterien-Durchschnitte werden ausschließlich innerhalb einer
     Kategorie gebildet. Bei "Alle" gibt es deshalb einen Block je
     Kategorie statt eines gemeinsamen — die Kriterien von Spielen
     und Filmen sind schlicht nicht dieselben und dürfen nicht in
     einen Topf. */
  const criteriaGroups = useMemo(() => {
    const base =
      scope === "all"
        ? CATEGORIES.map((c) => ({ key: c.key, label: c.label, list: ranked[c.key] }))
        : [{ key: scope, label: null, list: ranked[scope] }];

    return base
      .filter((g) => g.list.length > 0)
      .map((g) => ({
        ...g,
        criteria: criteriaFor(g.key).map((c) => {
          const vals = g.list.map((f) => f.values[c.key]).filter((v) => typeof v === "number");
          return { ...c, avg: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0 };
        }),
        avgPersonal:
          g.list.reduce((s, f) => s + (typeof f.personal === "number" ? f.personal : 0), 0) / g.list.length,
      }));
  }, [ranked, scope]);

  const bands = DISTRIBUTION_BANDS.map((b) => ({
    ...b,
    count: scopedList.filter((f) => f.score >= b.min && f.score < b.max).length,
  }));
  const maxBandCount = Math.max(1, ...bands.map((b) => b.count));

  const top10Lists =
    scope === "all"
      ? CATEGORIES.map((c) => ({
          label: "Top 10 " + c.label,
          list: [...ranked[c.key]].sort((a, b) => b.score - a.score).slice(0, 10),
        }))
      : [{ label: "Top 10", list: [...scopedList].sort((a, b) => b.score - a.score).slice(0, 10) }];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 50px" }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 14px" }}>Gesamtstatistik</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {CATEGORIES.map((c) => (
          <StatCard key={c.key} label={c.label.toUpperCase()} value={overall.counts[c.key]} />
        ))}
        <StatCard label="GESAMT" value={overall.countTotal} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        <StatCard label="Ø ENDNOTE" value={overall.avg.toFixed(2)} color={scoreToColor(overall.avg)} />
        <StatCard label="HÖCHSTE" value={overall.max.toFixed(2)} color={scoreToColor(overall.max)} />
        <StatCard label="NIEDRIGSTE" value={overall.min.toFixed(2)} color={scoreToColor(overall.min)} />
      </div>

      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, margin: "0 0 14px" }}>Detailauswertung</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {STATS_SCOPES.map((s) => (
          <button
            key={s.key}
            onClick={() => setScope(s.key)}
            style={{
              padding: "9px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
              background: scope === s.key ? "#C9A227" : "transparent",
              color: scope === s.key ? "#17171A" : "#9A968C",
              border: "1px solid " + (scope === s.key ? "#C9A227" : "#33333a"),
              fontWeight: scope === s.key ? 700 : 400,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {scopedList.length === 0 ? (
        <div style={{ color: "#77746c", padding: 30, textAlign: "center" }}>Noch keine Einträge in diesem Bereich.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
            <StatCard label="ANZAHL" value={scopedStats.count} />
            <StatCard label="Ø ENDNOTE" value={scopedStats.avg.toFixed(2)} color={scoreToColor(scopedStats.avg)} />
            <StatCard label="HÖCHSTE" value={scopedStats.max.toFixed(2)} color={scoreToColor(scopedStats.max)} />
            <StatCard label="NIEDRIGSTE" value={scopedStats.min.toFixed(2)} color={scoreToColor(scopedStats.min)} />
          </div>

          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, margin: "0 0 14px" }}>Ø je Kriterium</h3>
          {scope === "all" && (
            <div style={{ fontSize: 12, color: "#77746c", marginBottom: 14, lineHeight: 1.5 }}>
              Getrennt nach Kategorie — die Kriterien unterscheiden sich je Kategorie
              und werden deshalb nicht zusammengerechnet.
            </div>
          )}
          {criteriaGroups.map((group) => (
            <div key={group.key} style={{ marginBottom: 18 }}>
              {group.label && (
                <div style={{ fontSize: 12, letterSpacing: 1, color: "#C9A227", fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>
                  {group.label.toUpperCase()}
                </div>
              )}
              {group.criteria.map((c) => (
                <div key={c.key} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span>{c.label} <span style={{ color: "#C9A227", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{Math.round(c.weight * 100)}%</span></span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#C9A227" }}>{c.avg.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 8, background: "#232326", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${(c.avg / 10) * 100}%`, height: "100%", background: "#C9A227" }} />
                  </div>
                </div>
              ))}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span>Bauchgefühl <span style={{ color: "#C9A227", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>25% der Endnote</span></span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#C9A227" }}>{group.avgPersonal.toFixed(2)}</span>
                </div>
                <div style={{ height: 8, background: "#232326", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${(group.avgPersonal / 10) * 100}%`, height: "100%", background: "#C9A227" }} />
                </div>
              </div>
            </div>
          ))}

          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, margin: "24px 0 14px" }}>Bewertungsverteilung</h3>
          <div style={{ marginBottom: 28 }}>
            {bands.map((b) => (
              <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 62, fontSize: 12, color: "#9A968C", flexShrink: 0 }}>{b.label}</div>
                <div style={{ flex: 1, height: 14, background: "#232326", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${(b.count / maxBandCount) * 100}%`, height: "100%", background: b.color }} />
                </div>
                <div style={{ width: 26, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, flexShrink: 0 }}>{b.count}</div>
              </div>
            ))}
          </div>

          {top10Lists.map((group) => (
            <div key={group.label} style={{ marginBottom: 24 }}>
              <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, margin: "0 0 12px" }}>{group.label}</h3>
              {group.list.length === 0 ? (
                <div style={{ color: "#55524c", fontSize: 13, padding: "8px 0" }}>Keine Einträge.</div>
              ) : (
                group.list.map((f, i) => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #232326" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#55524c", width: 18, flexShrink: 0 }}>{i + 1}</span>
                      <Poster url={f.poster} title={f.title} size={28} />
                      <span style={{ fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</span>
                    </div>
                    <ScoreBadge score={f.score} />
                  </div>
                ))
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ flex: "1 1 100px", background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 10.5, color: "#9A968C", marginBottom: 6, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 21, fontWeight: 700, color: color || "#EDEAE3" }}>{value}</div>
    </div>
  );
}

/* ============================================================
   HAUPT-APP
   ============================================================ */
const EMPTY_ITEMS = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, []]));

export default function App() {
  const [items, setItems] = useState(EMPTY_ITEMS);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("movie");
  const [activeTab, setActiveTab] = useState("movie"); // movie | series | anime | stats
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("list"); // list | form | edit
  const [selectedId, setSelectedId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [exportFormat, setExportFormat] = useState("json");
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState("");
  const [filterState, setFilterState] = useState({ ...DEFAULT_FILTER });
  const fileInputRef = useRef(null);

  function normalizeEntry(e) {
    return {
      id: e.id,
      category: e.category,
      title: e.title,
      poster: typeof e.poster === "string" ? e.poster : "",
      posterSource: e.posterSource === "manual" || e.posterSource === "auto" ? e.posterSource : undefined,
      genre: Array.isArray(e.genre) ? e.genre : [],
      values: e.values,
      personal: e.personal,
      createdAt: e.createdAt || 0,
      updatedAt: e.updatedAt || 0,
    };
  }

  // ---- Laden aus der Datenbank ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.loadAll();
        if (cancelled) return;
        setItems(Object.fromEntries(CATEGORY_KEYS.map((k) => [k, (data[k] || []).map(normalizeEntry)])));
        setSaveError("");
      } catch (e) {
        if (!cancelled) {
          setSaveError(
            "Die Bewertungen konnten nicht geladen werden: " + e.message +
              ". Bitte Seite neu laden. (Prüfe, ob die Datenbank verbunden ist.)"
          );
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* Es gibt bewusst KEINEN "alles speichern"-Effekt mehr.
     Jede Änderung wird einzeln über die API geschrieben und erst
     danach in den State übernommen — dadurch kann nichts mehr
     stillschweigend verloren gehen. */

  // ---- Automatische Poster-Suche für Einträge ohne Poster ----
  const posterAttempted = useRef(new Set());

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;

    (async () => {
      const todo = [];
      for (const catKey of CATEGORY_KEYS) {
        for (const entry of items[catKey] || []) {
          if (entry.poster) continue;
          if (posterAttempted.current.has(entry.id)) continue;
          todo.push({ catKey, entry });
        }
      }
      if (!todo.length) return;

      for (const job of todo) {
        if (cancelled) return;
        posterAttempted.current.add(job.entry.id);

        const url = await api.findPoster(job.entry.title, job.catKey);
        if (cancelled || !url) continue;

        // Poster dauerhaft am Eintrag speichern
        try {
          const saved = await api.update(job.entry.id, {
            ...job.entry,
            category: job.catKey,
            poster: url,
            posterSource: "auto",
          });
          if (cancelled) return;
          setItems((prev) => ({
            ...prev,
            [job.catKey]: (prev[job.catKey] || []).map((f) => (f.id === saved.id ? normalizeEntry(saved) : f)),
          }));
        } catch (e) {
          // Poster ist Nebensache — Fehler hier nicht dem Nutzer aufdrängen.
        }
      }
    })();

    return () => { cancelled = true; };
  }, [items, loaded]);

  const catInfo = CATEGORIES.find((c) => c.key === category);

  // ---- Sortierte Liste je Kategorie (immer nach Endnote — das ist die "normale" Rangliste) ----
  const rankedByCategory = useMemo(() => {
    const result = {};
    for (const cat of CATEGORIES) {
      const list = (items[cat.key] || []).map((f) => ({
        ...f,
        score: computeFinalScore(f.values, f.personal, cat.key),
      }));
      list.sort((a, b) => b.score - a.score);
      result[cat.key] = list;
    }
    return result;
  }, [items]);

  const currentList = rankedByCategory[category];

  // ---- Angezeigte Liste: Suche + Filter (Bereich + Sortierung) ----
  const filtered = useMemo(() => {
    let list = currentList;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.title.toLowerCase().includes(q));
    }
    list = list.filter((f) => f.score >= filterState.min && f.score <= filterState.max);

    const sorted = [...list];
    switch (filterState.sort) {
      case "score-asc":
        sorted.sort((a, b) => a.score - b.score);
        break;
      case "title-asc":
        sorted.sort((a, b) => a.title.localeCompare(b.title, "de"));
        break;
      case "title-desc":
        sorted.sort((a, b) => b.title.localeCompare(a.title, "de"));
        break;
      case "recent-desc":
        sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        break;
      case "recent-asc":
        sorted.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        break;
      case "score-desc":
      default:
        sorted.sort((a, b) => b.score - a.score);
    }
    return sorted;
  }, [currentList, search, filterState]);

  const isFilterActive = filterState.min !== DEFAULT_FILTER.min || filterState.max !== DEFAULT_FILTER.max || filterState.sort !== DEFAULT_FILTER.sort;

  const selectedEntry = useMemo(() => {
    if (!selectedId) return null;
    return currentList.find((f) => f.id === selectedId) || null;
  }, [currentList, selectedId]);

  // ---- CRUD ----
  async function addEntry({ title, poster, values, personal }) {
    setBusy(true);
    try {
      const created = await api.create({
        category,
        title,
        poster,
        posterSource: poster ? "manual" : undefined,
        values,
        personal,
      });
      setItems((prev) => ({ ...prev, [category]: [normalizeEntry(created), ...prev[category]] }));
      setSaveError("");
      setMode("list");
    } catch (e) {
      setSaveError("Nicht gespeichert: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateEntry(id, { title, poster, values, personal }) {
    const current = (items[category] || []).find((f) => f.id === id);
    if (!current) return;

    let nextPoster = poster;
    let nextSource = current.posterSource;

    if (poster && poster !== current.poster) {
      nextSource = "manual"; // selbst eingetragen
    } else if (!poster) {
      nextSource = undefined; // geleert -> wieder automatisch suchen
    } else if (current.posterSource === "auto" && title.trim() !== current.title.trim()) {
      // Titel geändert und Poster kam automatisch -> neu suchen lassen
      nextPoster = "";
      nextSource = undefined;
      posterAttempted.current.delete(id);
    }

    setBusy(true);
    try {
      const saved = await api.update(id, {
        category,
        title,
        poster: nextPoster,
        posterSource: nextSource,
        values,
        personal,
        createdAt: current.createdAt,
      });
      setItems((prev) => ({
        ...prev,
        [category]: prev[category].map((f) => (f.id === id ? normalizeEntry(saved) : f)),
      }));
      setSaveError("");
      setMode("list");
    } catch (e) {
      setSaveError("Änderung nicht gespeichert: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(id) {
    setBusy(true);
    try {
      await api.remove(id);
      setItems((prev) => ({ ...prev, [category]: prev[category].filter((f) => f.id !== id) }));
      setSaveError("");
      setConfirmDelete(null);
      setSelectedId(null);
    } catch (e) {
      setSaveError("Löschen fehlgeschlagen: " + e.message);
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  }

  // ---- Poster neu suchen lassen ----
  async function resetPosters() {
    setBusy(true);
    try {
      const res = await fetch("/api/reset-posters", { method: "POST" });
      if (!res.ok) throw new Error("Fehlgeschlagen (" + res.status + ")");
      const data = await res.json();
      // Erneute Suche im Client wieder freigeben
      posterAttempted.current = new Set();
      const fresh = await api.loadAll();
      setItems(Object.fromEntries(CATEGORY_KEYS.map((k) => [k, (fresh[k] || []).map(normalizeEntry)])));
      setSaveError(
        data.zurueckgesetzt + " Poster werden neu gesucht. Das dauert einen Moment."
      );
    } catch (e) {
      setSaveError("Poster-Rücksetzung fehlgeschlagen: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Export ----
  function buildExportRows(scopeAll) {
    const cats = scopeAll ? CATEGORIES.map((c) => c.key) : [category];
    const rows = [];
    cats.forEach((catKey) => {
      rankedByCategory[catKey].forEach((f, i) => {
        rows.push({
          kategorie: CATEGORIES.find((c) => c.key === catKey).label,
          position: i + 1,
          titel: f.title,
          poster: f.poster || "",
          genre: (f.genre || []).join("|"),
          endnote: f.score,
          kriterienNote: computeCriteriaScore(f.values, catKey),
          bauchgefuehl: f.personal,
          erstelltAm: f.createdAt ? new Date(f.createdAt).toISOString() : "",
          ...Object.fromEntries(criteriaFor(catKey).map((c) => [c.key, f.values[c.key]])),
        });
      });
    });
    return rows;
  }

  function doExport(scopeAll) {
    const rows = buildExportRows(scopeAll);
    const scopeName = scopeAll ? "alle" : category;
    if (exportFormat === "json") {
      const payload = { exportedAt: new Date().toISOString(), scope: scopeName, data: items };
      downloadFile(`bewertungen-${scopeName}-${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json");
    } else {
      const headers = ["kategorie", "position", "titel", "poster", "genre", "endnote", "kriterienNote", "bauchgefuehl", "erstelltAm", ...ALL_CRITERIA_KEYS];
      const lines = [headers.join(";")];
      rows.forEach((r) => {
        lines.push(headers.map((h) => csvEscape(r[h])).join(";"));
      });
      downloadFile(`bewertungen-${scopeName}-${Date.now()}.csv`, lines.join("\n"), "text/csv");
    }
  }

  // ---- Import ----
  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const data = parsed && parsed.data ? parsed.data : parsed;
        const cleaned = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, []]));
        let totalValid = 0;
        for (const catKey of CATEGORY_KEYS) {
          const arr = Array.isArray(data[catKey]) ? data[catKey] : [];
          for (const entry of arr) {
            if (
              entry &&
              typeof entry.title === "string" &&
              entry.title.trim() &&
              entry.values &&
              isValuesComplete(entry.values, catKey) &&
              typeof entry.personal === "number" &&
              entry.personal >= 0 &&
              entry.personal <= 10
            ) {
              cleaned[catKey].push({
                id: entry.id || catKey + "_import_" + Date.now() + "_" + totalValid,
                category: catKey,
                title: entry.title.trim(),
                poster: typeof entry.poster === "string" ? entry.poster : "",
                genre: Array.isArray(entry.genre) ? entry.genre : [],
                values: entry.values,
                personal: entry.personal,
                createdAt: entry.createdAt || Date.now(),
                updatedAt: entry.updatedAt || Date.now(),
              });
              totalValid++;
            }
          }
        }
        if (totalValid === 0) {
          setImportError("Die Datei enthält keine gültigen Einträge. Import wurde abgebrochen.");
          setImportPreview(null);
        } else {
          setImportError("");
          setImportPreview({ cleaned, count: totalValid });
        }
      } catch (err) {
        setImportError("Diese Datei ist kein gültiges JSON-Backup und konnte nicht gelesen werden.");
        setImportPreview(null);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function confirmImport() {
    if (!importPreview) return;
    setBusy(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const catKey of CATEGORY_KEYS) {
        for (const entry of importPreview.cleaned[catKey]) {
          try {
            const created = await api.create({ ...entry, category: catKey, id: undefined });
            setItems((prev) => ({ ...prev, [catKey]: [normalizeEntry(created), ...prev[catKey]] }));
            ok++;
          } catch (e) {
            failed++;
          }
        }
      }
      setSaveError(
        failed
          ? ok + " Einträge importiert, " + failed + " fehlgeschlagen."
          : ""
      );
    } finally {
      setBusy(false);
      setImportPreview(null);
    }
  }

  const editingEntry = mode === "edit" && selectedEntry ? selectedEntry : null;

  return (
    <div style={{ minHeight: "100vh", background: "#17171A", color: "#EDEAE3", fontFamily: "'Inter', system-ui, sans-serif", padding: "0 0 60px 0" }}>
      <style>{`
        input[type=range] { -webkit-appearance: none; background: transparent; }
        input[type=range]::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: #2A2A2E; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; margin-top: -9px; width: 24px; height: 24px; border-radius: 50%; background: #C9A227; border: 3px solid #17171A; }
        input[type=range]::-moz-range-track { height: 6px; border-radius: 3px; background: #2A2A2E; }
        input[type=range]::-moz-range-thumb { width: 24px; height: 24px; border-radius: 50%; background: #C9A227; border: 3px solid #17171A; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #2A2A2E", padding: "32px 20px 0", background: "linear-gradient(180deg, #1D1D21 0%, #17171A 100%)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, color: "#C9A227", marginBottom: 8 }}>
            LFDNR. {String(currentList.length).padStart(4, "0")}
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 800, fontSize: 30, margin: 0, lineHeight: 1.1 }}>
            Dein Bewertungsbogen
          </h1>
          <p style={{ color: "#9A968C", marginTop: 10, fontSize: 14.5, lineHeight: 1.5, marginBottom: 20 }}>
            {currentList.length} {catInfo.label} erfasst · gewichtet nach{" "}
            {criteriaFor(category).map((c) => c.label.split(" ")[0]).join(", ")}, plus 25% Bauchgefühl.
          </p>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 0 }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => {
                  setCategory(c.key);
                  setActiveTab(c.key);
                  setMode("list");
                  setSelectedId(null);
                  setSearch("");
                }}
                style={{
                  flex: 1, padding: "13px 6px", background: activeTab === c.key ? "#C9A227" : "transparent",
                  color: activeTab === c.key ? "#17171A" : "#9A968C",
                  border: activeTab === c.key ? "none" : "1px solid #2A2A2E",
                  borderBottom: activeTab === c.key ? "none" : "1px solid #2A2A2E",
                  borderRadius: "8px 8px 0 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                }}
              >
                {c.label}
              </button>
            ))}
            <button
              onClick={() => setActiveTab("stats")}
              style={{
                flex: 1, padding: "13px 6px", background: activeTab === "stats" ? "#C9A227" : "transparent",
                color: activeTab === "stats" ? "#17171A" : "#9A968C",
                border: activeTab === "stats" ? "none" : "1px solid #2A2A2E",
                borderBottom: activeTab === "stats" ? "none" : "1px solid #2A2A2E",
                borderRadius: "8px 8px 0 0", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
              }}
            >
              📊 Statistik
            </button>
          </div>
        </div>
      </div>

      {activeTab === "stats" ? (
        <StatsPage ranked={rankedByCategory} />
      ) : (
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px" }}>
          {saveError && (
            <div style={{ background: "#2a1616", border: "1px solid #d9736a", color: "#d9736a", borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              {saveError}
            </div>
          )}

          {!loaded && (
            <div style={{ color: "#9A968C", fontSize: 13, marginBottom: 16 }}>
              Bewertungen werden geladen…
            </div>
          )}

          {busy && (
            <div style={{ color: "#C9A227", fontSize: 13, marginBottom: 16 }}>
              Wird gespeichert…
            </div>
          )}

          {mode === "form" && (
            <RatingForm category={category} categoryLabel={catInfo.singular} onSave={addEntry} onCancel={() => setMode("list")} />
          )}

          {mode === "edit" && editingEntry && (
            <RatingForm
              category={category}
              categoryLabel={catInfo.singular}
              initialTitle={editingEntry.title}
              initialPoster={editingEntry.poster}
              initialValues={editingEntry.values}
              initialPersonal={editingEntry.personal}
              onSave={(payload) => updateEntry(editingEntry.id, payload)}
              onCancel={() => setMode("list")}
            />
          )}

          {mode === "list" && (
            <>
              <button
                onClick={() => setMode("form")}
                style={{ width: "100%", padding: "16px", background: "#C9A227", color: "#17171A", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15.5, cursor: "pointer", marginBottom: 20 }}
              >
                + Neu bewerten
              </button>

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  type="text"
                  placeholder={`${catInfo.label} durchsuchen...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ flex: 1, background: "#1D1D21", border: "1px solid #2A2A2E", borderRadius: 8, padding: "13px 12px", color: "#EDEAE3", fontSize: 15, boxSizing: "border-box" }}
                />
                <button
                  onClick={() => setShowFilter(true)}
                  style={{
                    background: isFilterActive ? "#C9A227" : "#1D1D21", border: "1px solid " + (isFilterActive ? "#C9A227" : "#2A2A2E"),
                    borderRadius: 8, padding: "0 16px", color: isFilterActive ? "#17171A" : "#9A968C", cursor: "pointer", fontSize: 13.5, whiteSpace: "nowrap", fontWeight: isFilterActive ? 700 : 400,
                  }}
                >
                  ⚙ Filter
                </button>
                <button
                  onClick={() => setShowExport((v) => !v)}
                  style={{ background: showExport ? "#C9A227" : "#1D1D21", border: "1px solid " + (showExport ? "#C9A227" : "#2A2A2E"), borderRadius: 8, padding: "0 14px", color: showExport ? "#17171A" : "#9A968C", cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}
                >
                  ⇅
                </button>
              </div>

              <div style={{ fontSize: 12.5, color: "#77746c", marginBottom: 14 }}>
                {filtered.length} von {currentList.length} {catInfo.label}
              </div>

              {showExport && (
                <div style={{ background: "#141416", border: "1px solid #C9A227", borderRadius: 8, padding: 16, marginBottom: 18 }}>
                  <div style={{ fontSize: 12, letterSpacing: 1, color: "#C9A227", fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>
                    EXPORT & BACKUP
                  </div>

                  <div style={{ borderBottom: "1px solid #2A2A2E", paddingBottom: 14, marginBottom: 14 }}>
                    <button
                      onClick={resetPosters}
                      disabled={busy}
                      style={{
                        width: "100%", padding: "12px", borderRadius: 8, fontSize: 14,
                        background: "transparent", color: "#C9A227",
                        border: "1px solid #C9A227", cursor: "pointer", fontWeight: 600,
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      Poster neu suchen
                    </button>
                    <div style={{ fontSize: 11, color: "#77746c", marginTop: 8, lineHeight: 1.5 }}>
                      Verwirft automatisch gefundene Poster und sucht sie neu.
                      Selbst eingetragene Poster und alle Bewertungen bleiben erhalten.
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button
                      onClick={() => setExportFormat("json")}
                      style={{ flex: 1, padding: "10px", borderRadius: 6, fontSize: 13, cursor: "pointer", background: exportFormat === "json" ? "#C9A227" : "transparent", color: exportFormat === "json" ? "#17171A" : "#9A968C", border: "1px solid " + (exportFormat === "json" ? "#C9A227" : "#33333a"), fontWeight: 700 }}
                    >
                      JSON (Backup)
                    </button>
                    <button
                      onClick={() => setExportFormat("csv")}
                      style={{ flex: 1, padding: "10px", borderRadius: 6, fontSize: 13, cursor: "pointer", background: exportFormat === "csv" ? "#C9A227" : "transparent", color: exportFormat === "csv" ? "#17171A" : "#9A968C", border: "1px solid " + (exportFormat === "csv" ? "#C9A227" : "#33333a"), fontWeight: 700 }}
                    >
                      CSV (Tabelle)
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <button onClick={() => doExport(false)} style={{ flex: 1, padding: "12px", background: "#2A2A2E", color: "#EDEAE3", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13.5 }}>
                      Nur {catInfo.label} exportieren
                    </button>
                    <button onClick={() => doExport(true)} style={{ flex: 1, padding: "12px", background: "#2A2A2E", color: "#EDEAE3", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13.5 }}>
                      Alles exportieren
                    </button>
                  </div>
                  <div style={{ borderTop: "1px solid #2A2A2E", paddingTop: 14 }}>
                    <div style={{ fontSize: 12, color: "#9A968C", marginBottom: 8 }}>
                      JSON-Backup wieder einspielen (bestehende Einträge bleiben erhalten, es werden nur neue hinzugefügt):
                    </div>
                    <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: "none" }} />
                    <button
                      onClick={() => fileInputRef.current && fileInputRef.current.click()}
                      style={{ width: "100%", padding: "12px", background: "transparent", color: "#C9A227", border: "1px dashed #C9A227", borderRadius: 6, cursor: "pointer", fontSize: 13.5 }}
                    >
                      JSON-Datei importieren
                    </button>
                    {importError && <div style={{ color: "#d9736a", fontSize: 12.5, marginTop: 8 }}>{importError}</div>}
                  </div>
                </div>
              )}

              {/* Liste */}
              <div>
                {filtered.map((f, i) => (
                  <div
                    key={f.id}
                    onClick={() => { setSelectedId(f.id); setMode("list"); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 4px", borderBottom: "1px solid #232326", gap: 10, cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#55524c", width: 22, textAlign: "right", flexShrink: 0 }}>
                        {i + 1}
                      </span>
                      <Poster url={f.poster} title={f.title} size={34} />
                      <span style={{ fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</span>
                    </div>
                    <ScoreBadge score={f.score} />
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div style={{ color: "#77746c", textAlign: "center", padding: 50, fontSize: 14.5 }}>
                    {search.trim() || isFilterActive ? "Nichts gefunden." : `Noch keine ${catInfo.label} bewertet.`}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {selectedEntry && mode === "list" && activeTab !== "stats" && (
        <DetailView
          entry={selectedEntry}
          category={category}
          singular={catInfo.singular}
          onBack={() => setSelectedId(null)}
          onEdit={() => setMode("edit")}
          onDelete={() => setConfirmDelete(selectedEntry.id)}
        />
      )}

      {showFilter && (
        <FilterSheet
          initial={filterState}
          totalCount={currentList.length}
          allInCategory={currentList}
          onApply={(f) => { setFilterState(f); setShowFilter(false); }}
          onClose={() => setShowFilter(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Eintrag löschen?"
          text="Dieser Eintrag wird endgültig entfernt und kann nicht wiederhergestellt werden."
          confirmLabel="Löschen"
          danger
          onConfirm={() => deleteEntry(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {importPreview && (
        <ConfirmDialog
          title="Backup importieren?"
          text={`${importPreview.count} gültige Einträge wurden in der Datei gefunden. Sie werden zu deinen bestehenden Bewertungen hinzugefügt, nichts wird überschrieben.`}
          confirmLabel="Importieren"
          onConfirm={confirmImport}
          onCancel={() => setImportPreview(null)}
        />
      )}
    </div>
  );
}
