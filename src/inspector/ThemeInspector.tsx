import { useMemo, useRef, useState } from "react";
import { FONT_OPTIONS, TOKEN_DEFS, TOKEN_GROUPS, SIMPLE_LOOK_IDS } from "../theme/tokenMeta";
import type { ExtraFont } from "../theme/extraFonts";
import type { TokenDef } from "../engine/types";
import "./ThemeInspector.css";

type Props = {
  tokens: Record<string, string>;
  extraFonts: ExtraFont[];
  onChange: (id: string, value: string) => void;
  onReset: () => void;
  onAddGoogleFont: (family: string) => Promise<void>;
  onUploadFont: (file: File) => Promise<void>;
  onHide?: () => void;
};

function numericPart(value: string): number {
  return Number.parseFloat(value);
}

function colorSwatch(value: string): string {
  const hex = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const r = hex[1];
    const g = hex[2];
    const b = hex[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#111111";
}

function Control({
  def,
  value,
  fontOptions,
  onChange,
}: {
  def: TokenDef;
  value: string;
  fontOptions: string[];
  onChange: (v: string) => void;
}) {
  if (def.kind === "color") {
    return (
      <div className="token-control">
        <label htmlFor={def.id}>{def.label}</label>
        <div className="token-color">
          <input
            id={def.id}
            type="color"
            value={colorSwatch(value)}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>
    );
  }

  if (def.kind === "font") {
    const options = fontOptions.includes(value) ? fontOptions : [value, ...fontOptions];
    return (
      <div className="token-control">
        <label htmlFor={def.id}>{def.label}</label>
        <select id={def.id} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((font) => (
            <option key={font} value={font}>
              {font.replace(/"/g, "")}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const unit = def.kind === "px" ? "px" : def.kind === "em" ? "em" : "";
  const n = numericPart(value);
  return (
    <div className="token-control">
      <div className="token-head">
        <label htmlFor={def.id}>{def.label}</label>
        <span className="token-value">
          {Number.isFinite(n) ? n : value}
          {unit}
        </span>
      </div>
      <input
        id={def.id}
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={Number.isFinite(n) ? n : 0}
        onInput={(e) => onChange(`${(e.target as HTMLInputElement).value}${unit}`)}
        onChange={(e) => onChange(`${e.target.value}${unit}`)}
      />
    </div>
  );
}

function FontAdder({
  extraFonts,
  onAddGoogleFont,
  onUploadFont,
}: {
  extraFonts: ExtraFont[];
  onAddGoogleFont: (family: string) => Promise<void>;
  onUploadFont: (file: File) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function addGoogle() {
    setBusy(true);
    setNote("");
    try {
      await onAddGoogleFont(name);
      setName("");
      setNote("");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not add font");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="font-adder">
      <p className="inspector-help">
        Add a Google Font by name, or upload a .woff / .ttf. Fonts stay in this browser and export with the PNG — there
        is no separate server.
      </p>
      <div className="font-adder-row">
        <input
          value={name}
          placeholder="e.g. Barlow Condensed"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void addGoogle();
            }
          }}
        />
        <button type="button" className="layer-btn" disabled={busy || !name.trim()} onClick={() => void addGoogle()}>
          Add Google font
        </button>
      </div>
      <button type="button" className="layer-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
        Upload font file
      </button>
      <input
        ref={fileRef}
        className="hidden-file"
        type="file"
        accept=".woff,.woff2,.ttf,.otf"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setBusy(true);
          setNote("");
          void onUploadFont(file)
            .then(() => setNote(`Added ${file.name}`))
            .catch((err: unknown) => setNote(err instanceof Error ? err.message : "Could not add font"))
            .finally(() => setBusy(false));
        }}
      />
      {extraFonts.length > 0 ? (
        <p className="inspector-help">Added: {extraFonts.map((font) => font.family).join(", ")}</p>
      ) : null}
      {note ? <p className="inspector-help">{note}</p> : null}
    </div>
  );
}

export function ThemeInspector({
  tokens,
  extraFonts,
  onChange,
  onReset,
  onAddGoogleFont,
  onUploadFont,
  onHide,
}: Props) {
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Color: true });
  const needle = query.trim().toLowerCase();
  const fontOptions = useMemo(() => {
    const extra = extraFonts.map((font) => font.stack);
    return [...FONT_OPTIONS, ...extra.filter((stack) => !FONT_OPTIONS.includes(stack))];
  }, [extraFonts]);

  const simpleDefs = SIMPLE_LOOK_IDS.map((id) => {
    const def = TOKEN_DEFS.find((item) => item.id === id);
    if (!def) return null;
    if (id === "--poster-accent") return { ...def, label: "Accent" };
    if (id === "--title-y") return { ...def, label: "Title position" };
    if (id === "--row-gap") return { ...def, label: "Space between rows" };
    return def;
  }).filter((def): def is TokenDef => Boolean(def));

  const matches = useMemo(() => {
    const simple = new Set<string>(SIMPLE_LOOK_IDS);
    return TOKEN_DEFS.filter((def) => {
      if (needle) {
        return def.label.toLowerCase().includes(needle) || def.id.toLowerCase().includes(needle);
      }
      return !simple.has(def.id);
    });
  }, [needle]);

  return (
    <aside className="inspector">
      <div className="inspector-top">
        <h2>Look</h2>
        <div className="inspector-top-actions">
          <button type="button" className="text-btn" onClick={onReset}>
            Reset
          </button>
          {onHide ? (
            <button type="button" className="sheet-toggle" onClick={onHide} aria-label="Hide look panel">
              Hide
            </button>
          ) : null}
        </div>
      </div>
      <p className="inspector-help">
        Click anything on the poster to type. Drag the title or photo to move it. Space between rows and title position sit at the top so a weekly graphic is a two-slider job.
      </p>
      {simpleDefs.map((def) => (
        <Control
          key={def.id}
          def={def}
          value={tokens[def.id] ?? ""}
          fontOptions={fontOptions}
          onChange={(value) => onChange(def.id, value)}
        />
      ))}
      <input
        className="token-search"
        type="search"
        value={query}
        placeholder="Search look…"
        onChange={(e) => setQuery(e.target.value)}
      />
      {TOKEN_GROUPS.map((group) => {
        const defs = matches.filter((def) => def.group === group);
        if (defs.length === 0) return null;
        const open = needle ? true : Boolean(openGroups[group]);
        return (
          <section key={group} className={open ? "token-group is-open" : "token-group"}>
            <button
              type="button"
              className="token-group-toggle"
              aria-expanded={open}
              onClick={() => {
                if (needle) return;
                setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
              }}
            >
              <span className="token-group-chevron" aria-hidden />
              {group}
              <span className="token-count">{defs.length}</span>
            </button>
            {open ? (
              <>
                {defs.map((def) => (
                  <Control
                    key={def.id}
                    def={def}
                    value={tokens[def.id] ?? ""}
                    fontOptions={fontOptions}
                    onChange={(value) => onChange(def.id, value)}
                  />
                ))}
                {group === "Type" ? (
                  <FontAdder extraFonts={extraFonts} onAddGoogleFont={onAddGoogleFont} onUploadFont={onUploadFont} />
                ) : null}
                {group === "Photo" ? (
                  <button
                    type="button"
                    className="layer-btn"
                    onClick={() =>
                      onChange("--hero-layer", tokens["--hero-layer"] === "front" ? "behind" : "front")
                    }
                  >
                    {tokens["--hero-layer"] === "front" ? "Photo behind board" : "Photo in front"}
                  </button>
                ) : null}
              </>
            ) : null}
          </section>
        );
      })}
      {matches.length === 0 ? <p className="inspector-help">No control matches “{query}”.</p> : null}
    </aside>
  );
}
