import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { RankingRow, TableColumnRole } from "../engine/types";
import { type TemplateId } from "./catalog";
import { OrnamentGraphic, type OrnamentId } from "./ornaments";
import { graphicBarFor } from "../theme/graphicBars";
import "./RankingPoster.css";
import "../theme/tokens.css";

export type PosterDecor = {
  id: OrnamentId;
  src?: string;
};

export type PosterMedia = {
  background?: string;
  header?: string;
  watermark?: string;
  footer?: string;
  hero?: string;
};

export type PosterTextField = "title" | "subtitle" | "kicker" | "handle";

/* Column labels are editable, so a coach can call the rating column "POWER" or blank out a
   heading entirely without touching the pasted table. */
export type PosterHeadField =
  | "rank"
  | "team"
  | "rating"
  | "off"
  | "def"
  | "w"
  | "l"
  | "d"
  | "pts"
  | "gf"
  | "ga"
  | "gd"
  | "move"
  | "games";

export const HEAD_DEFAULTS: Record<PosterHeadField, string> = {
  rank: "#",
  team: "TEAM",
  rating: "RATING",
  off: "OFF",
  def: "DEF",
  w: "W",
  l: "L",
  d: "D",
  pts: "PTS",
  gf: "GF",
  ga: "GA",
  gd: "GD",
  move: "+/-",
  games: "GP",
};

export type PosterHeadLabels = Partial<Record<PosterHeadField, string>>;

type Props = {
  title: string;
  subtitle: string;
  kicker: string;
  handle: string;
  width: number;
  height: number;
  rows: RankingRow[];
  tokens: Record<string, string>;
  templateId: TemplateId;
  media: PosterMedia;
  decorA: PosterDecor;
  decorB: PosterDecor;
  decorC: PosterDecor;
  decorD: PosterDecor;
  live?: boolean;
  selected?: string | null;
  artboardId?: string;
  headLabels?: PosterHeadLabels;
  onText?: (field: PosterTextField, value: string) => void;
  onHead?: (field: PosterHeadField, value: string) => void;
  onRowEdit?: (rowIndex: number, field: TableColumnRole, value: string) => void;
  onLogoPick?: (teamId: string | null, teamQuery: string) => void;
};

function parsePx(value: string | undefined, fallback: number): number {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseHex(color: string | undefined): string | null {
  if (!color) return null;
  let hex = color.trim().replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length !== 6 || !/^[0-9a-f]{6}$/i.test(hex)) return null;
  return hex.toLowerCase();
}

function hexLuminance(hex: string): number {
  const channel = (start: number) => {
    const v = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrastRatio(a: string, b: string): number {
  const l1 = hexLuminance(a) + 0.05;
  const l2 = hexLuminance(b) + 0.05;
  return l1 > l2 ? l1 / l2 : l2 / l1;
}

function mixHex(hex: string, toward: string, amount: number): string {
  const t = clamp(amount, 0, 1);
  const mix = (start: number) => {
    const a = Number.parseInt(hex.slice(start, start + 2), 16);
    const b = Number.parseInt(toward.slice(start, start + 2), 16);
    return Math.round(a + (b - a) * t)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${mix(0)}${mix(2)}${mix(4)}`;
}

/** Pick black or white ink, then push the bar fill until the name stays readable. */
function barTone(color: string | undefined): {
  ink: string;
  soft: string;
  fill: string;
  lightBar: boolean;
} {
  const dark = { ink: "#101114", soft: "rgba(16, 17, 20, 0.78)" };
  const light = { ink: "#ffffff", soft: "rgba(255, 255, 255, 0.84)" };
  const hex = parseHex(color);
  if (!hex) return { ...light, fill: "#2a2a32", lightBar: false };
  const useLightInk = contrastRatio(hex, "ffffff") >= contrastRatio(hex, "101114");
  const tone = useLightInk ? light : dark;
  const toward = useLightInk ? "000000" : "ffffff";
  const inkHex = useLightInk ? "ffffff" : "101114";
  let fillHex = hex;
  for (let i = 0; i < 8 && contrastRatio(fillHex, inkHex) < 4.6; i += 1) {
    fillHex = mixHex(fillHex, toward, 0.18).slice(1);
  }
  return { ...tone, fill: `#${fillHex}`, lightBar: !useLightInk };
}

/*
  Graphic skins (State, Movers) paint the team colour exactly as published, so no contrast
  nudging on the bar itself. Three inks come off that one colour:
  - name ink is the team's second colour, dropped when it disappears into the bar
  - rank and movement digits sit on the white plate, so the colour is pushed dark enough to read
  - the stat panel is the bar pulled toward neutral, which darkens pale bars and lifts dark ones
*/
function graphicTone(
  primary: string | undefined,
  secondary: string | undefined,
  statTint: number,
): { fill: string; ink: string; soft: string; plateInk: string; statFill: string; lightBar: boolean } {
  const fill = parseHex(primary) ?? "2a2a32";
  const lightBar = hexLuminance(fill) > 0.4;
  const secondaryHex = parseHex(secondary);
  const readable = secondaryHex && contrastRatio(secondaryHex, fill) >= 3;
  const ink = readable ? `#${secondaryHex}` : lightBar ? "var(--bar-ink-on-light)" : "var(--bar-ink)";

  return {
    fill: `#${fill}`,
    ink,
    soft: lightBar ? "rgba(26, 39, 72, 0.8)" : "rgba(255, 255, 255, 0.8)",
    // The graphic prints every rank and movement number in one ink, not the team colour.
    plateInk: "var(--plate-ink)",
    statFill: mixHex(fill, "808080", clamp(statTint / 100, 0, 0.7)),
    lightBar,
  };
}

function formatRating(value: string): string {
  if (!/-?\d+\.\d{4,}/.test(value.trim())) return value;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return value;
  return (Math.trunc(n * 1000) / 1000).toFixed(3);
}

function fitListToCanvas(
  canvasHeight: number,
  listCount: number,
  tokens: Record<string, string>,
  extraChrome: number,
  omitColHeads = false,
  maxRowHeight = 140,
  tightChrome = false,
): Record<string, string> {
  if (listCount <= 0) return {};

  const preferredRow = parsePx(tokens["--row-height"], 92);
  const preferredGap = parsePx(tokens["--row-gap"], 14);
  const headerPref = parsePx(tokens["--header-height"], 150);
  const titlePref = parsePx(tokens["--title-size"], 92);
  const namePref = parsePx(tokens["--name-size"], 28);
  const rankPref = parsePx(tokens["--rank-size"], 28);
  const statPref = parsePx(tokens["--stat-size"], 22);
  const colSizePref = parsePx(tokens["--col-head-size"], 15);
  const logoScale = parsePx(tokens["--logo-scale"], 100);

  let pad = parsePx(tokens["--poster-pad"], 48);
  let header = headerPref;
  let footer = parsePx(tokens["--footer-height"], 72);
  // Graphic skins measure their column-head band exactly; --cols-y is the air between the
  // title block and the labels. Looser templates keep a larger cushion around the heads.
  const colsY = omitColHeads ? 0 : parsePx(tokens["--cols-y"], tightChrome ? 0 : 8);
  const colHead = omitColHeads ? 0 : parsePx(tokens["--col-head-height"], 38) + colsY + (tightChrome ? 6 : 18);
  const gaps = Math.max(0, listCount - 1);

  const chrome = () => pad * 2 + header + colHead + footer + (tightChrome ? 0 : 14) + extraChrome;
  let avail = canvasHeight - chrome();

  if (avail < listCount * 20) {
    header = Math.max(64, header - (listCount * 20 - avail));
    avail = canvasHeight - chrome();
  }
  if (avail < listCount * 18) {
    pad = Math.max(10, pad - Math.ceil((listCount * 18 - avail) / 2));
    footer = Math.max(0, footer - Math.max(0, listCount * 18 - (canvasHeight - chrome()) + footer));
    avail = canvasHeight - chrome();
  }

  let gap = preferredGap;
  let rowH = preferredRow;
  if (listCount > 0 && avail > 0) {
    if (tightChrome) {
      // Honour the designed gap. Shrink the bars if fifteen rows cannot fit; pour leftover
      // height into the gap so a short paste still reads as separate boards, not one slab.
      const minRow = 48;
      const packed = preferredRow * listCount + preferredGap * gaps;
      if (packed > avail) {
        rowH = clamp(Math.floor((avail - preferredGap * gaps) / listCount), minRow, preferredRow);
        if (rowH * listCount + preferredGap * gaps > avail && gaps > 0) {
          gap = clamp(Math.floor((avail - minRow * listCount) / gaps), 4, preferredGap);
          rowH = clamp(Math.floor((avail - gap * gaps) / listCount), minRow, preferredRow);
        }
      } else if (gaps > 0) {
        const leftover = avail - packed;
        gap = preferredGap + clamp(Math.floor(leftover / gaps), 0, 16);
        rowH = preferredRow;
      }
    } else {
      gap = gaps > 0 ? clamp(Math.round(Math.min(preferredGap, (avail * 0.1) / gaps)), 0, preferredGap) : 0;
      rowH = Math.floor((avail - gap * gaps) / listCount);
      rowH = clamp(rowH, 16, maxRowHeight);
      if (rowH * listCount + gap * gaps > avail && gaps > 0) {
        gap = clamp(Math.floor((avail - 16 * listCount) / gaps), 0, preferredGap);
        rowH = clamp(Math.floor((avail - gap * gaps) / listCount), 16, maxRowHeight);
      }
    }
  }

  // Graphic skins run type nearly as tall as the bar, so their ceilings are a different ratio.
  const nameCap = tightChrome ? 0.62 : 0.44;
  const rankCap = tightChrome ? 0.58 : 0.5;
  const statCap = tightChrome ? 0.5 : 0.34;
  const nameSize = clamp(Math.round(Math.min(namePref, rowH * nameCap)), 9, namePref);
  const rankSize = clamp(Math.round(Math.min(rankPref, rowH * rankCap)), 9, rankPref);
  const statSize = clamp(Math.round(Math.min(statPref, rowH * statCap)), 8, statPref);
  const titleSize =
    header < headerPref ? clamp(Math.round(titlePref * (header / headerPref)), 28, titlePref) : titlePref;

  const colHeadCap = tightChrome ? 0.55 : 0.22;
  const fitted: Record<string, string> = {
    "--row-height": `${rowH}px`,
    "--row-gap": `${gap}px`,
    "--mark-size": `${Math.max(8, Math.round((rowH * clamp(logoScale, 20, 100)) / 100))}px`,
    "--name-size": `${nameSize}px`,
    "--rank-size": `${rankSize}px`,
    "--stat-size": `${statSize}px`,
    "--header-height": `${Math.round(header)}px`,
    "--footer-height": `${Math.round(footer)}px`,
    "--poster-pad": `${Math.round(pad)}px`,
    "--title-size": `${titleSize}px`,
    "--col-head-size": `${clamp(Math.round(Math.min(colSizePref, Math.max(9, rowH * colHeadCap))), 8, colSizePref)}px`,
  };
  // Graphic skins set the crest cell wider than the bar is tall, so squaring it off the row
  // height would pull the team name out of its measured column.
  if (!tightChrome) fitted["--logo-size"] = `${rowH}px`;
  return fitted;
}

/*
  The published graphics break a name onto two lines only when a hyphen joins two multi-word
  halves ("Rumson-Fair Haven", "Scotch Plains-Fanwood"). A plain compound such as
  "Bridgewater-Raritan" stays on one line, so length alone is the wrong test — the hyphen
  break comes first and a space break is the last resort for names that cannot fit.
*/
function wrapBoardName(name: string): string {
  const text = name.trim();
  const hyphen = text.indexOf("-");
  if (hyphen > 0) {
    const left = text.slice(0, hyphen);
    const right = text.slice(hyphen + 1);
    if (left.includes(" ") || right.includes(" ")) return `${left}-\n${right}`;
  }
  if (text.length > 20) {
    const space = text.lastIndexOf(" ");
    if (space > 6) return `${text.slice(0, space)}\n${text.slice(space + 1)}`;
  }
  return text;
}

function trendLabel(movement: number | null, unsigned = false): string {
  if (movement == null || movement === 0) return unsigned ? "" : "=";
  const rounded = Math.round(movement);
  const n = rounded === 0 ? (movement > 0 ? 1 : -1) : rounded;
  if (unsigned) return String(Math.abs(n));
  return n > 0 ? `+${n}` : `${n}`;
}

function LiveText({
  as: Tag,
  className,
  value,
  field,
  live,
  onText,
  placeholder,
}: {
  as: "h1" | "p" | "span";
  className: string;
  value: string;
  field: PosterTextField;
  live?: boolean;
  onText?: (field: PosterTextField, value: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const focused = useRef(false);
  const [editing, setEditing] = useState(false);
  const empty = live && !value.trim() && !editing;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || focused.current) return;
    if ((node.textContent ?? "") !== value) node.textContent = value;
  }, [value]);

  useLayoutEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  return (
    <Tag
      ref={ref as never}
      className={empty ? `${className} is-empty` : className}
      data-text={field}
      data-placeholder={placeholder}
      contentEditable={Boolean(live) && editing}
      suppressContentEditableWarning
      spellCheck={false}
      onPointerDown={(event) => {
        if (!live) return;
        event.stopPropagation();
      }}
      onClick={() => {
        if (live) setEditing(true);
      }}
      onDoubleClick={(event) => {
        if (!live) return;
        event.stopPropagation();
        setEditing(true);
      }}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={(event) => {
        focused.current = false;
        setEditing(false);
        onText?.(field, (event.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim());
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function LiveHead({
  className,
  field,
  labels,
  live,
  onHead,
}: {
  className: string;
  field: PosterHeadField;
  labels?: PosterHeadLabels;
  live?: boolean;
  onHead?: (field: PosterHeadField, value: string) => void;
}) {
  const fallback = HEAD_DEFAULTS[field];
  const value = labels?.[field] ?? fallback;
  const ref = useRef<HTMLSpanElement>(null);
  const focused = useRef(false);
  const [editing, setEditing] = useState(false);
  const empty = live && !value.trim() && !editing;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || focused.current) return;
    if ((node.textContent ?? "") !== value) node.textContent = value;
  }, [value]);

  useLayoutEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  return (
    <span
      ref={ref}
      className={empty ? `${className} is-empty` : className}
      data-head={field}
      data-placeholder={fallback}
      contentEditable={Boolean(live) && editing}
      suppressContentEditableWarning
      spellCheck={false}
      tabIndex={live ? 0 : undefined}
      title={live ? "Click to rename this column" : undefined}
      onPointerDown={(event) => {
        if (!live) return;
        event.stopPropagation();
      }}
      onClick={() => {
        if (live) setEditing(true);
      }}
      onFocus={() => {
        if (live) {
          focused.current = true;
          setEditing(true);
        }
      }}
      onBlur={(event) => {
        focused.current = false;
        setEditing(false);
        const next = (event.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim();
        if (next !== value) onHead?.(field, next);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.currentTarget.blur();
      }}
    />
  );
}

function LiveCell({
  className,
  value,
  display,
  field,
  rowIndex,
  live,
  onRowEdit,
}: {
  className?: string;
  value: string;
  display?: string;
  field: TableColumnRole;
  rowIndex: number;
  live?: boolean;
  onRowEdit?: (rowIndex: number, field: TableColumnRole, value: string) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const focused = useRef(false);
  const valueRef = useRef(value);
  const editRef = useRef(onRowEdit);
  valueRef.current = value;
  editRef.current = onRowEdit;
  const shown = display ?? value;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || focused.current) return;
    if ((node.textContent ?? "") !== shown) node.textContent = shown;
  }, [shown]);

  const commit = (node: HTMLSpanElement) => {
    const next = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (next !== valueRef.current) editRef.current?.(rowIndex, field, next);
  };

  return (
    <span
      ref={ref}
      className={className}
      data-cell={field}
      contentEditable={live ? "plaintext-only" : undefined}
      suppressContentEditableWarning
      spellCheck={false}
      tabIndex={live ? 0 : undefined}
      onPointerDown={(event) => {
        if (!live) return;
        event.stopPropagation();
      }}
      onFocus={() => {
        focused.current = true;
        const node = ref.current;
        if (node && (node.textContent ?? "") !== valueRef.current) node.textContent = valueRef.current;
      }}
      onBlur={(event) => {
        focused.current = false;
        commit(event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        focused.current = false;
        commit(event.currentTarget);
        event.currentTarget.blur();
      }}
    />
  );
}

function formatMove(value: number | null): string {
  if (value === null || value === 0) return "·";
  const n = Math.abs(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return value > 0 ? `▲${n}` : `▼${n}`;
}

const STAT_KEYS = ["w", "l", "d", "pts", "gf", "ga", "gd"] as const;
const RATING_KEYS = ["rating", "off", "def"] as const;

type VisibleMetrics = {
  rating: boolean;
  off: boolean;
  def: boolean;
  games: boolean;
  w: boolean;
  l: boolean;
  d: boolean;
  pts: boolean;
  gf: boolean;
  ga: boolean;
  gd: boolean;
};

function filledStat(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  return v !== "" && v !== "·" && v !== "•" && v !== "-" && v !== "–";
}

function visibleMetricsFrom(rows: RankingRow[]): VisibleMetrics {
  const any = (key: keyof RankingRow["stats"]) => rows.some((row) => filledStat(row.stats[key]));
  return {
    rating: any("rating"),
    off: any("off"),
    def: any("def"),
    games: any("games"),
    w: any("w") || rows.some((row) => filledStat(row.record)),
    l: any("l"),
    d: any("d"),
    pts: any("pts"),
    gf: any("gf"),
    ga: any("ga"),
    gd: any("gd"),
  };
}

export function visibleHeadFields(rows: RankingRow[]): PosterHeadField[] {
  const visible = visibleMetricsFrom(rows);
  const fields: PosterHeadField[] = ["team"];
  if (STAT_KEYS.some((key) => visible[key])) {
    for (const key of STAT_KEYS) if (visible[key]) fields.push(key);
  } else {
    for (const key of RATING_KEYS) if (visible[key]) fields.push(key);
  }
  return fields;
}

function RowMetrics({
  row,
  mode,
  visible,
  rowIndex,
  live,
  onRowEdit,
}: {
  row: RankingRow;
  mode: "stats" | "ratings" | "simple";
  visible: VisibleMetrics;
  rowIndex: number;
  live?: boolean;
  onRowEdit?: (rowIndex: number, field: TableColumnRole, value: string) => void;
}) {
  const cell = {
    rowIndex,
    live,
    onRowEdit,
  };
  const moveClass =
    row.movement && row.movement > 0 ? "is-up" : row.movement && row.movement < 0 ? "is-down" : "";
  const wins = row.stats.w || row.record || "";
  const winField: TableColumnRole = row.stats.w ? "w" : row.record ? "record" : "w";
  if (mode === "stats") {
    if (!visible.w && !visible.l && !visible.d && !visible.pts && !visible.gf && !visible.ga && !visible.gd) {
      return null;
    }
    return (
      <span className="poster-metrics">
        {visible.w ? <LiveCell className="poster-stat" value={wins} field={winField} {...cell} /> : null}
        {visible.l ? <LiveCell className="poster-stat" value={row.stats.l} field="l" {...cell} /> : null}
        {visible.d ? <LiveCell className="poster-stat" value={row.stats.d} field="d" {...cell} /> : null}
        {visible.pts ? <LiveCell className="poster-pts" value={row.stats.pts} field="pts" {...cell} /> : null}
        {visible.gf ? <LiveCell className="poster-stat" value={row.stats.gf} field="gf" {...cell} /> : null}
        {visible.ga ? <LiveCell className="poster-stat" value={row.stats.ga} field="ga" {...cell} /> : null}
        {visible.gd ? <LiveCell className="poster-stat" value={row.stats.gd} field="gd" {...cell} /> : null}
      </span>
    );
  }
  if (mode === "ratings") {
    if (!visible.rating && !visible.off && !visible.def) return null;
    return (
      <span className="poster-metrics">
        {visible.rating ? (
          <LiveCell className="poster-pts" value={row.stats.rating} display={formatRating(row.stats.rating)} field="rating" {...cell} />
        ) : null}
        {visible.off ? (
          <LiveCell className="poster-stat" value={row.stats.off} display={formatRating(row.stats.off)} field="off" {...cell} />
        ) : null}
        {visible.def ? (
          <LiveCell className="poster-stat" value={row.stats.def} display={formatRating(row.stats.def)} field="def" {...cell} />
        ) : null}
        <span className={`poster-stat poster-move is-move ${moveClass}`}>{formatMove(row.movement)}</span>
        {visible.games ? <LiveCell className="poster-stat is-games" value={row.stats.games} field="games" {...cell} /> : null}
      </span>
    );
  }
  return null;
}

function PosterRow({
  row,
  mode,
  visible,
  index,
  className,
  compactName = false,
  unsignedTrend = false,
  graphicSkin = false,
  statTint = 0,
  live,
  onRowEdit,
  onLogoPick,
}: {
  row: RankingRow;
  mode: "stats" | "ratings" | "simple";
  visible: VisibleMetrics;
  index: number;
  className?: string;
  compactName?: boolean;
  unsignedTrend?: boolean;
  graphicSkin?: boolean;
  statTint?: number;
  live?: boolean;
  onRowEdit?: (rowIndex: number, field: TableColumnRole, value: string) => void;
  onLogoPick?: (teamId: string | null, teamQuery: string) => void;
}) {
  const source = row.team?.name ?? row.teamQuery;
  const cleaned = compactName ? source.replace(/\s*\(.*?\)\s*/g, " ").trim() : source;
  const label = graphicSkin ? wrapBoardName(cleaned) : cleaned.toUpperCase();
  const markLetter = cleaned.trim().charAt(0).toUpperCase();
  const moveClass =
    row.movement && row.movement > 0 ? "is-up" : row.movement && row.movement < 0 ? "is-down" : "is-flat";
  // Sampled bar colours come straight off the published art, so they outrank whatever the
  // logo pack guessed for the same school.
  const graphic = graphicBarFor(row.teamQuery, row.team?.name);
  const primary = graphic?.primary ?? row.team?.primary ?? "#3a3a40";
  const secondary = graphic?.secondary ?? row.team?.secondary ?? "#111111";
  const tone = graphicSkin ? graphicTone(primary, secondary, statTint) : barTone(primary);
  const graphicVars: Record<string, string> = graphicSkin
    ? {
        "--plate-team-ink": (tone as ReturnType<typeof graphicTone>).plateInk,
        "--stat-fill": (tone as ReturnType<typeof graphicTone>).statFill,
      }
    : {};
  return (
    <li
      data-rank={row.rank}
      className={[
        row.team ? "poster-row" : "poster-row is-unmatched",
        tone.lightBar ? "is-light-bar" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--team-primary": primary,
          "--team-secondary": secondary,
          "--team-fill": tone.fill,
          "--team-ink": tone.ink,
          "--team-ink-soft": tone.soft,
          "--row-i": String(index),
          ...graphicVars,
        } as CSSProperties
      }
    >
      <span className={`poster-trend ${moveClass}`} aria-hidden>
        {trendLabel(row.movement, unsignedTrend)}
      </span>
      <LiveCell
        className="poster-rank"
        value={String(row.rank)}
        field="rank"
        rowIndex={row.sourceIndex}
        live={live}
        onRowEdit={onRowEdit}
      />
      <span
        className="poster-mark"
        data-logo=""
        title={live ? "Click to change logo" : undefined}
        onPointerDown={(event) => {
          if (live) event.stopPropagation();
        }}
        onClick={(event) => {
          if (!live) return;
          event.stopPropagation();
          onLogoPick?.(row.team?.id ?? null, row.teamQuery);
        }}
      >
        {row.team?.logoUrl ? (
          <img src={row.team.logoUrl} alt="" />
        ) : (
          <span className="lettermark">{markLetter}</span>
        )}
      </span>
      <span
        className={label.includes("\n") ? "poster-name is-wrapped" : "poster-name"}
        onPointerDown={(event) => {
          if (!live) return;
          if (event.target instanceof HTMLElement && event.target.closest("[data-logo]")) {
            event.stopPropagation();
          }
        }}
        onClick={(event) => {
          if (!live) return;
          if (event.target instanceof HTMLElement && event.target.closest("[data-logo]")) return;
          const cell = event.currentTarget.querySelector("[data-cell='team']");
          if (cell instanceof HTMLElement) cell.focus();
        }}
      >
        {row.team?.logoUrl ? (
          <img
            className="poster-name-ghost"
            data-logo=""
            src={row.team.logoUrl}
            alt=""
            title={live ? "Click to change logo" : undefined}
            onPointerDown={(event) => {
              if (live) event.stopPropagation();
            }}
            onClick={(event) => {
              if (!live) return;
              event.stopPropagation();
              onLogoPick?.(row.team?.id ?? null, row.teamQuery);
            }}
          />
        ) : null}
        <LiveCell
          value={row.teamQuery}
          display={label}
          field="team"
          rowIndex={row.sourceIndex}
          live={live}
          onRowEdit={onRowEdit}
        />
        {!row.team && !graphicSkin ? <span className="poster-missing">no match</span> : null}
      </span>
      <RowMetrics row={row} mode={mode} visible={visible} rowIndex={row.sourceIndex} live={live} onRowEdit={onRowEdit} />
    </li>
  );
}

function ColumnHeads({
  mode,
  variant,
  visible,
  labels,
  live,
  onHead,
}: {
  mode: "stats" | "ratings" | "simple";
  variant: "full" | "power" | "split" | "board";
  visible: VisibleMetrics;
  labels?: PosterHeadLabels;
  live?: boolean;
  onHead?: (field: PosterHeadField, value: string) => void;
}) {
  if (mode !== "stats" && mode !== "ratings") return null;
  const head = (field: PosterHeadField, className: string) => (
    <LiveHead key={field} className={className} field={field} labels={labels} live={live} onHead={onHead} />
  );
  // The lead column is whichever metric the paste actually carries.
  const lead: PosterHeadField = mode === "stats" ? "pts" : visible.rating ? "rating" : "off";
  const statHeads = (
    <>
      {visible.w ? head("w", "col-fill") : null}
      {visible.l ? head("l", "col-fill") : null}
      {visible.d ? head("d", "col-fill") : null}
      {visible.pts ? head("pts", "col-fill is-primary") : null}
      {visible.gf ? head("gf", "col-fill") : null}
      {visible.ga ? head("ga", "col-fill") : null}
      {visible.gd ? head("gd", "col-fill") : null}
    </>
  );
  // Editable labels have to stay reachable, so only hide the row from screen readers
  // when the poster is not live.
  const hidden = live ? undefined : true;

  if (variant === "power") {
    return (
      <div className="poster-cols is-lead" aria-hidden={hidden}>
        <span className="col-trend" />
        {head("rank", "col-rank")}
        {head("team", "col-team")}
        {head(lead, "col-fill is-primary")}
      </div>
    );
  }
  if (variant === "split") {
    return (
      <div className="poster-cols is-lead" aria-hidden={hidden}>
        {head("rank", "col-rank")}
        <span className="col-trend" />
        <span className="col-mark" />
        {head("team", "col-team")}
        <span className="poster-metrics">{head(lead, "col-fill is-primary")}</span>
      </div>
    );
  }
  if (variant === "board") {
    return (
      <div className="poster-cols" aria-hidden={hidden}>
        <span className="col-trend" />
        <span className="col-rank" />
        <span className="col-mark" />
        {head("team", "col-team")}
        <span className="poster-metrics">
          {mode === "stats" ? (
            statHeads
          ) : (
            <>
              {visible.rating ? head("rating", "col-fill is-primary") : null}
              {visible.off ? head("off", "col-fill") : null}
              {visible.def ? head("def", "col-fill") : null}
            </>
          )}
        </span>
      </div>
    );
  }
  return (
    <div className="poster-cols" aria-hidden={hidden}>
      <span className="col-trend" />
      {head("rank", "col-rank")}
      <span />
      {head("team", "col-team")}
      <span className="poster-metrics">
        {mode === "stats" ? (
          statHeads
        ) : (
          <>
            {visible.rating ? head("rating", "col-fill is-primary") : null}
            {visible.off ? head("off", "col-fill") : null}
            {visible.def ? head("def", "col-fill") : null}
            {head("move", "col-fill is-move")}
            {visible.games ? head("games", "col-fill") : null}
          </>
        )}
      </span>
    </div>
  );
}

function Deco({
  slot,
  decor,
  live,
}: {
  slot: "a" | "b" | "c" | "d";
  decor: PosterDecor;
  live?: boolean;
}) {
  if (!decor.src && decor.id === "none") return null;
  return (
    <div className={`poster-deco poster-deco-${slot}`} data-drag={`deco-${slot}`} aria-hidden>
      <OrnamentGraphic id={decor.id} src={decor.src} />
      {live ? <span className="edit-handle is-se" data-resize={`deco-${slot}`} data-axis="both" /> : null}
    </div>
  );
}

export function RankingPoster({
  title,
  subtitle,
  kicker,
  handle,
  width,
  height,
  rows,
  tokens,
  templateId,
  media,
  decorA,
  decorB,
  decorC,
  decorD,
  live = false,
  selected = null,
  artboardId = "ranking-artboard",
  headLabels,
  onText,
  onHead,
  onRowEdit,
  onLogoPick,
}: Props) {
  const style: CSSProperties & Record<string, string> = {
    width: `${width}px`,
    height: `${height}px`,
    ...tokens,
  };

  const listRows = rows;
  const compactList = templateId === "power" || templateId === "split";
  const metaBar = templateId === "board" || templateId === "movers";
  // State and Movers are the published Instagram graphics: exact team colours, title-case
  // names, unsigned movement, and a stat panel tinted off the bar.
  const graphicSkin = templateId === "board" || templateId === "movers";
  const statTint = parsePx(tokens["--stat-tint"], 0);
  const headVariant =
    templateId === "power"
      ? "power"
      : templateId === "split"
        ? "split"
        : graphicSkin
          ? "board"
          : "full";

  const visible = visibleMetricsFrom(rows);
  const showStats = STAT_KEYS.some((key) => visible[key]);
  const showRatings = !showStats && RATING_KEYS.some((key) => visible[key]);
  const mode = showStats ? "stats" : showRatings ? "ratings" : "simple";
  const showHeads = mode !== "simple" && templateId !== "power";
  const metricCols =
    mode === "stats"
      ? [
          visible.w ? "var(--stat-col-width)" : "",
          visible.l ? "var(--stat-col-width)" : "",
          visible.d ? "var(--stat-col-width)" : "",
          visible.pts ? "var(--pts-box)" : "",
          visible.gf ? "var(--stat-col-width)" : "",
          visible.ga ? "var(--stat-col-width)" : "",
          visible.gd ? "var(--stat-col-width)" : "",
        ].filter(Boolean)
      : [
          visible.rating ? "var(--pts-box)" : "",
          visible.off ? "var(--stat-col-width)" : "",
          visible.def ? "var(--stat-col-width)" : "",
        ].filter(Boolean);
  if (metricCols.length) style["--metrics"] = metricCols.join(" ");

  if (listRows.length > 0) {
    const preferredRow = parsePx(tokens["--row-height"], 92);
    Object.assign(
      style,
      fitListToCanvas(
        height,
        listRows.length,
        tokens,
        0,
        !showHeads,
        graphicSkin ? preferredRow : 140,
        graphicSkin,
      ),
    );
  }

  // Total diagonal travel across the poster, so the slope holds at any row count.
  const travel = parsePx(tokens["--row-stagger"], 0);
  style["--split-shift"] = `${Math.round(travel)}px`;

  if (templateId === "split") {
    // Rows have to ride the photo's cut, not merely lean the same way. Percentages can't do it:
    // the cut is measured on the poster box while rows sit inside the board's padding box, and
    // the list only spans the middle of the poster. So resolve the line to px here and hand the
    // board its indent, the per-row step, and the per-row slant off the one slope.
    const pad = parsePx(style["--poster-pad"] ?? tokens["--poster-pad"], 48);
    const rowH = parsePx(style["--row-height"] ?? tokens["--row-height"], 74);
    const gap = parsePx(style["--row-gap"] ?? tokens["--row-gap"], 3);
    const headerH = parsePx(style["--header-height"] ?? tokens["--header-height"], 150);
    const cutX = (Number.parseFloat(tokens["--split-cut"] ?? "34") / 100) * width;
    const slope = height > 0 ? travel / height : 0;
    const listTop = pad + parsePx(tokens["--list-y"], 0) + headerH;
    const listH = listRows.length * rowH + Math.max(0, listRows.length - 1) * gap;
    const indent =
      cutX + slope * listTop + parsePx(tokens["--split-gutter"], 20) - pad - parsePx(tokens["--list-x"], 0);

    style["--split-cut-x"] = `${cutX.toFixed(2)}px`;
    style["--split-slant"] = `${(slope * rowH).toFixed(2)}px`;
    style["--row-step"] = `${(slope * (rowH + gap)).toFixed(2)}px`;
    style["--split-pad-left"] = `${Math.max(0, indent).toFixed(2)}px`;
    style["--split-foot-shift"] = `${(slope * listH).toFixed(2)}px`;
  }

  const highlight = Number.parseInt(tokens["--highlight-rank"] ?? "0", 10);
  const heroFront = tokens["--hero-layer"] === "front";
  const heroH = parsePx(tokens["--hero-h"], 0);

  // A table with no movement column parses as all-zero, which would render a column of bare dashes.
  const hasMovement = rows.some((row) => row.movement != null && row.movement !== 0);
  if (!hasMovement) style["--trend-width"] = "0px";

  const liveText = { live, onText };

  return (
    <article
      className={`poster is-${mode} tmpl-${templateId}${graphicSkin ? " is-graphic" : ""}${heroFront ? " is-hero-front" : " is-hero-behind"}${media.hero ? " has-hero" : ""}${heroH > 0 ? " has-hero-h" : ""}${hasMovement ? "" : " is-no-trend"}${live ? " is-live" : ""}${selected ? ` is-picked-${selected}` : ""}`}
      id={artboardId}
      style={style}
    >
      {media.background ? (
        <>
          <img className="poster-bg-photo" src={media.background} alt="" />
          <div className="poster-bg-dim" aria-hidden />
        </>
      ) : null}
      <div className="poster-glow" aria-hidden />
      <div className="poster-glitter" aria-hidden />
      <div className="poster-hero-panel" aria-hidden />
      {media.hero ? (
        <div className="poster-hero-wrap">
          <div className="poster-hero-box" data-drag="hero">
            <img className="poster-hero" src={media.hero} alt="" />
            {live ? (
              <>
                <span className="edit-handle is-e" data-resize="hero" data-axis="x" />
                <span className="edit-handle is-s" data-resize="hero" data-axis="y" />
                <span className="edit-handle is-se" data-resize="hero" data-axis="both" />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {media.watermark ? <img className="poster-watermark" src={media.watermark} alt="" /> : null}
      <Deco slot="a" decor={decorA} live={live} />
      <Deco slot="b" decor={decorB} live={live} />
      <Deco slot="c" decor={decorC} live={live} />
      <Deco slot="d" decor={decorD} live={live} />
      <div className="poster-board" data-drag="board">
        {metaBar && live ? (
          <div className="poster-meta">
            <LiveText as="span" className="poster-meta-kicker" value={kicker} field="kicker" placeholder="Kicker" {...liveText} />
            <LiveText as="span" className="poster-meta-handle" value={handle} field="handle" placeholder="@handle" {...liveText} />
          </div>
        ) : metaBar && (kicker.trim() || handle.trim()) ? (
          <div className="poster-meta">
            <LiveText as="span" className="poster-meta-kicker" value={kicker} field="kicker" placeholder="Kicker" {...liveText} />
            <LiveText as="span" className="poster-meta-handle" value={handle} field="handle" placeholder="@handle" {...liveText} />
          </div>
        ) : null}
        <header className="poster-header" data-drag="header">
          {media.header ? <img className="poster-header-mark" src={media.header} alt="" /> : null}
          <div className="poster-header-copy">
            {!metaBar && (live || kicker.trim()) ? (
              <LiveText as="p" className="poster-kicker" value={kicker} field="kicker" placeholder="Kicker" {...liveText} />
            ) : null}
            {metaBar && (live || subtitle.trim()) ? (
              <LiveText as="p" className="poster-eyebrow" value={subtitle} field="subtitle" placeholder="Subtitle" {...liveText} />
            ) : null}
            <LiveText as="h1" className="poster-title" value={title} field="title" placeholder="Title" {...liveText} />
            {templateId === "power" && (live || subtitle.trim()) ? (
              <LiveText as="p" className="poster-week" value={subtitle} field="subtitle" placeholder="Subtitle" {...liveText} />
            ) : null}
          </div>
        </header>
        {listRows.length > 0 && showHeads ? (
          <ColumnHeads
            mode={mode}
            variant={headVariant}
            visible={visible}
            labels={headLabels}
            live={live}
            onHead={onHead}
          />
        ) : null}
        {listRows.length > 0 ? (
          <ol className="poster-list">
            {listRows.map((row, i) => (
              <PosterRow
                key={`${row.rank}-${row.teamQuery}`}
                row={row}
                mode={mode}
                index={i}
                className={row.rank === highlight ? "is-hot" : undefined}
                visible={visible}
                compactName={compactList}
                unsignedTrend={graphicSkin}
                graphicSkin={graphicSkin}
                statTint={statTint}
                live={live}
                onRowEdit={onRowEdit}
                onLogoPick={onLogoPick}
              />
            ))}
          </ol>
        ) : null}
        {!metaBar && (live || subtitle.trim() || handle.trim() || media.footer) ? (
          <footer className="poster-footer">
            {media.footer ? <img className="poster-footer-badge" src={media.footer} alt="" /> : null}
            {live || subtitle.trim() ? (
              <LiveText as="span" className="poster-footer-copy" value={subtitle} field="subtitle" placeholder="Subtitle" {...liveText} />
            ) : null}
            {live || handle.trim() ? (
              <LiveText as="span" className="poster-footer-handle" value={handle} field="handle" placeholder="@handle" {...liveText} />
            ) : null}
          </footer>
        ) : null}
        {metaBar && media.footer ? (
          <footer className="poster-footer">
            <img className="poster-footer-badge" src={media.footer} alt="" />
          </footer>
        ) : null}
      </div>
    </article>
  );
}
