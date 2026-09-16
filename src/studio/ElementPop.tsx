import { useLayoutEffect, useState } from "react";
import { TOKEN_DEFS } from "../theme/tokenMeta";
import "./ElementPop.css";

type Props = {
  part: string;
  tokens: Record<string, string>;
  stageRef: React.RefObject<HTMLDivElement | null>;
  onChange: (id: string, value: string) => void;
  onPatch: (patch: Record<string, string>) => void;
  onClose: () => void;
  onReplace?: () => void;
};

const HINTS: Record<string, string> = {
  hero: "Drag to move. Use the handles to stretch horizontally, vertically, or diagonally.",
  board: "Drag to move. Click a name, number, or column label to type.",
  header: "Drag to move. Click the title to type. Click TEAM, RATING, OFF, or DEF to rename those labels.",
};

const LABELS: Record<string, string> = {
  hero: "Photo",
  board: "Rankings",
  header: "Title",
  "deco-a": "Sticker 1",
  "deco-b": "Sticker 2",
  "deco-c": "Sticker 3",
  "deco-d": "Sticker 4",
};

const BOARD_COLORS = [
  { id: "--poster-accent", label: "Accent" },
  { id: "--plate-bg", label: "Rows" },
  { id: "--plate-ink", label: "Row text" },
  { id: "--poster-fg", label: "Text" },
  { id: "--rank-fg", label: "Ranks" },
  { id: "--header-bar", label: "Bar" },
  { id: "--pts-bg", label: "Rating" },
  { id: "--pts-fg", label: "Rating text" },
];

const HEADER_COLORS = [
  { id: "--poster-fg", label: "Title" },
  { id: "--poster-accent", label: "Accent" },
  { id: "--title-outline", label: "Outline" },
  { id: "--header-bar", label: "Bar" },
];

const SWATCHES = ["#e4b53c", "#ffffff", "#111111", "#c41e3a", "#1e3a5f", "#0a7a3e", "#ea580c", "#7c3aed"];

function tokenDef(id: string) {
  return TOKEN_DEFS.find((item) => item.id === id);
}

function num(tokens: Record<string, string>, id: string): number {
  const n = Number.parseFloat(tokens[id] ?? "");
  return Number.isFinite(n) ? n : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function colorValue(value: string): string {
  const hex = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return "#111111";
}

function SliderRow({
  id,
  tokens,
  onChange,
}: {
  id: string;
  tokens: Record<string, string>;
  onChange: (id: string, value: string) => void;
}) {
  const def = tokenDef(id);
  if (!def || def.kind === "color" || def.kind === "font") return null;
  const unit = def.kind === "px" ? "px" : def.kind === "em" ? "em" : "";
  const n = num(tokens, id);
  return (
    <div className="element-pop-slider">
      <div className="element-pop-slider-head">
        <span>{def.label}</span>
        <span>
          {n}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={n}
        onInput={(event) => onChange(id, `${(event.target as HTMLInputElement).value}${unit}`)}
      />
    </div>
  );
}

function ColorGrid({
  ids,
  tokens,
  onChange,
}: {
  ids: { id: string; label: string }[];
  tokens: Record<string, string>;
  onChange: (id: string, value: string) => void;
}) {
  return (
    <div className="element-pop-colors">
      {ids.map((item) => (
        <label key={item.id} className="element-pop-color">
          <input
            type="color"
            value={colorValue(tokens[item.id] ?? "")}
            onChange={(event) => onChange(item.id, event.target.value)}
          />
          <span>{item.label}</span>
        </label>
      ))}
    </div>
  );
}

export function ElementPop({ part, tokens, stageRef, onChange, onPatch, onClose, onReplace }: Props) {
  const [pos, setPos] = useState({ left: 24, top: 72 });

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const el = stage?.querySelector(`[data-drag="${part}"]`);
    if (!stage || !(el instanceof HTMLElement)) return undefined;

    const place = () => {
      const sr = stage.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const popW = 252;
      let left = er.right - sr.left + stage.scrollLeft + 12;
      if (left + popW > stage.scrollLeft + stage.clientWidth) {
        left = er.left - sr.left + stage.scrollLeft - popW;
      }
      if (left < stage.scrollLeft + 8) left = stage.scrollLeft + 8;
      let top = er.top - sr.top + stage.scrollTop;
      const maxTop = stage.scrollTop + Math.max(48, stage.clientHeight - 280);
      top = Math.min(Math.max(top, stage.scrollTop + 48), maxTop);
      setPos({ left, top });
    };

    place();
    stage.addEventListener("scroll", place, { passive: true });
    const ro = new ResizeObserver(place);
    ro.observe(el);
    ro.observe(stage);
    return () => {
      stage.removeEventListener("scroll", place);
      ro.disconnect();
    };
  }, [part, stageRef, tokens]);

  const title = LABELS[part] ?? part;
  const front = tokens["--hero-layer"] === "front";

  function nudgeHero(axis: "x" | "y" | "both", dir: 1 | -1) {
    const stage = stageRef.current;
    const box = stage?.querySelector('[data-drag="hero"]');
    const measured = box instanceof HTMLElement ? box.offsetHeight : 640;
    const w = num(tokens, "--hero-size");
    const hToken = num(tokens, "--hero-h");
    const h = hToken > 0 ? hToken : measured;
    const step = 48 * dir;
    if (axis === "x") {
      onPatch({ "--hero-size": `${clamp(w + step, 80, 2200)}px` });
      return;
    }
    if (axis === "y") {
      onPatch({ "--hero-h": `${clamp(h + step, 80, 2200)}px` });
      return;
    }
    const patch: Record<string, string> = { "--hero-size": `${clamp(w + step, 80, 2200)}px` };
    if (hToken > 0) patch["--hero-h"] = `${clamp(h + step, 80, 2200)}px`;
    onPatch(patch);
  }

  return (
    <div
      className="element-pop"
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="element-pop-head">
        <h3>{title}</h3>
        <button type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="element-pop-hint">
        {HINTS[part] ?? "Drag to move. Use the handle to resize."}
      </p>

      {part === "hero" ? (
        <>
          <div className="element-pop-label">Size</div>
          <div className="element-pop-scale">
            <div className="element-pop-scale-row">
              <button type="button" onClick={() => nudgeHero("x", -1)}>
                −
              </button>
              <span>Horizontal</span>
              <button type="button" onClick={() => nudgeHero("x", 1)}>
                +
              </button>
            </div>
            <div className="element-pop-scale-row">
              <button type="button" onClick={() => nudgeHero("y", -1)}>
                −
              </button>
              <span>Vertical</span>
              <button type="button" onClick={() => nudgeHero("y", 1)}>
                +
              </button>
            </div>
            <div className="element-pop-scale-row">
              <button type="button" onClick={() => nudgeHero("both", -1)}>
                −
              </button>
              <span>Diagonal</span>
              <button type="button" onClick={() => nudgeHero("both", 1)}>
                +
              </button>
            </div>
          </div>
          <div className="element-pop-label">Layer</div>
          <div className="element-pop-btns">
            <button
              type="button"
              className={front ? "is-on" : undefined}
              onClick={() => onChange("--hero-layer", "front")}
            >
              Forward
            </button>
            <button
              type="button"
              className={front ? undefined : "is-on"}
              onClick={() => onChange("--hero-layer", "behind")}
            >
              Backward
            </button>
          </div>
          <div className="element-pop-label">Crop</div>
          <SliderRow id="--hero-focus-x" tokens={tokens} onChange={onChange} />
          <SliderRow id="--hero-focus-y" tokens={tokens} onChange={onChange} />
          <SliderRow id="--photo-contrast" tokens={tokens} onChange={onChange} />
          <SliderRow id="--photo-saturate" tokens={tokens} onChange={onChange} />
        </>
      ) : null}

      {part === "board" ? (
        <>
          <div className="element-pop-label">Color</div>
          <div className="element-pop-chips">
            {SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                className="element-pop-chip"
                style={{ background: hex }}
                aria-label={hex}
                onClick={() => onChange("--poster-accent", hex)}
              />
            ))}
          </div>
          <ColorGrid ids={BOARD_COLORS} tokens={tokens} onChange={onChange} />
          <div className="element-pop-label">Layout</div>
          <SliderRow id="--board-width" tokens={tokens} onChange={onChange} />
          <SliderRow id="--name-size" tokens={tokens} onChange={onChange} />
          <SliderRow id="--row-height" tokens={tokens} onChange={onChange} />
        </>
      ) : null}

      {part === "header" ? (
        <>
          <div className="element-pop-label">Color</div>
          <ColorGrid ids={HEADER_COLORS} tokens={tokens} onChange={onChange} />
          <div className="element-pop-label">Type</div>
          <SliderRow id="--title-size" tokens={tokens} onChange={onChange} />
          <SliderRow id="--outline-width" tokens={tokens} onChange={onChange} />
          <SliderRow id="--header-height" tokens={tokens} onChange={onChange} />
        </>
      ) : null}

      {part.startsWith("deco-") ? (
        <>
          <SliderRow id={`--${part}-size`} tokens={tokens} onChange={onChange} />
          <SliderRow id={`--${part}-rotate`} tokens={tokens} onChange={onChange} />
          <SliderRow id="--deco-opacity" tokens={tokens} onChange={onChange} />
        </>
      ) : null}

      {onReplace ? (
        <button type="button" className="element-pop-replace" onClick={onReplace}>
          Replace image
        </button>
      ) : null}
    </div>
  );
}
