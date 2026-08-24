import { FONT_OPTIONS, TOKEN_DEFS, TOKEN_GROUPS } from "../theme/tokenMeta";
import type { TokenDef } from "../engine/types";
import "./ThemeInspector.css";

type Props = {
  tokens: Record<string, string>;
  onChange: (id: string, value: string) => void;
  onReset: () => void;
  fitRows: boolean;
  onFitRows: (value: boolean) => void;
};

function numericPart(value: string): number {
  return Number.parseFloat(value);
}

function Control({ def, value, onChange }: { def: TokenDef; value: string; onChange: (v: string) => void }) {
  if (def.kind === "color") {
    return (
      <div className="token-control">
        <label htmlFor={def.id}>{def.label}</label>
        <div className="token-color">
          <input
            id={def.id}
            type="color"
            value={/^#/.test(value) ? value : "#121212"}
            onChange={(e) => onChange(e.target.value)}
          />
          <input value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
        </div>
      </div>
    );
  }

  if (def.kind === "font") {
    return (
      <div className="token-control">
        <label htmlFor={def.id}>{def.label}</label>
        <select id={def.id} value={value} onChange={(e) => onChange(e.target.value)}>
          {FONT_OPTIONS.map((font) => (
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
        onChange={(e) => onChange(`${e.target.value}${unit}`)}
      />
    </div>
  );
}

export function ThemeInspector({ tokens, onChange, onReset, fitRows, onFitRows }: Props) {
  return (
    <aside className="inspector">
      <div className="inspector-top">
        <h2>Appearance</h2>
        <button type="button" className="text-btn" onClick={onReset}>
          Reset
        </button>
      </div>
      <p className="inspector-help">
        These sliders write CSS variables on the poster. Same names live in tokens.css.
      </p>
      <label className="fit-toggle">
        <input
          type="checkbox"
          checked={fitRows}
          onChange={(e) => onFitRows(e.target.checked)}
        />
        Fit rows to canvas height
      </label>
      {TOKEN_GROUPS.map((group) => (
        <section key={group} className="token-group">
          <h3>{group}</h3>
          {TOKEN_DEFS.filter((def) => def.group === group).map((def) => (
            <Control
              key={def.id}
              def={def}
              value={tokens[def.id] ?? ""}
              onChange={(value) => onChange(def.id, value)}
            />
          ))}
        </section>
      ))}
    </aside>
  );
}
