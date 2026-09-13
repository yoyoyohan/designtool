import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { RankingRow, TableColumnRole } from "../engine/types";
import { type TemplateId } from "./catalog";
import { OrnamentGraphic, type OrnamentId } from "./ornaments";
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
  onText?: (field: PosterTextField, value: string) => void;
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
function barTone(color: string | undefined): { ink: string; soft: string; fill: string; lightBar: boolean } {
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
  const colHead = omitColHeads ? 0 : parsePx(tokens["--col-head-height"], 38) + (tightChrome ? 6 : 18);
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
    gap = gaps > 0 ? clamp(Math.round(Math.min(preferredGap, avail * 0.1 / gaps)), 0, preferredGap) : 0;
    rowH = Math.floor((avail - gap * gaps) / listCount);
    rowH = clamp(rowH, 16, maxRowHeight);
    if (rowH * listCount + gap * gaps > avail && gaps > 0) {
      gap = clamp(Math.floor((avail - 16 * listCount) / gaps), 0, preferredGap);
      rowH = clamp(Math.floor((avail - gap * gaps) / listCount), 16, maxRowHeight);
    }
  }

  const nameSize = clamp(Math.round(Math.min(namePref, rowH * 0.44)), 9, namePref);
  const rankSize = clamp(Math.round(Math.min(rankPref, rowH * 0.5)), 9, rankPref);
  const statSize = clamp(Math.round(Math.min(statPref, rowH * 0.34)), 8, statPref);
  const titleSize =
    header < headerPref ? clamp(Math.round(titlePref * (header / headerPref)), 28, titlePref) : titlePref;

  return {
    "--row-height": `${rowH}px`,
    "--row-gap": `${gap}px`,
    "--logo-size": `${rowH}px`,
    "--mark-size": `${Math.max(8, Math.round((rowH * clamp(logoScale, 20, 100)) / 100))}px`,
    "--name-size": `${nameSize}px`,
    "--rank-size": `${rankSize}px`,
    "--stat-size": `${statSize}px`,
    "--header-height": `${Math.round(header)}px`,
    "--footer-height": `${Math.round(footer)}px`,
    "--poster-pad": `${Math.round(pad)}px`,
    "--title-size": `${titleSize}px`,
    "--col-head-size": `${clamp(Math.round(Math.min(colSizePref, Math.max(9, rowH * 0.22))), 8, colSizePref)}px`,
  };
}

function wrapBoardName(name: string): string {
  const text = name.trim();
  const hyphen = text.indexOf("-");
  if (hyphen > 0) {
    const left = text.slice(0, hyphen);
    const right = text.slice(hyphen + 1);
    if (left.includes(" ") || right.includes(" ") || text.length > 20) {
      return `${left}-\n${right}`;
    }
  }
  if (text.length > 18) {
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
        {visible.rating ? <LiveCell className="poster-pts" value={row.stats.rating} field="rating" {...cell} /> : null}
        {visible.off ? <LiveCell className="poster-stat" value={row.stats.off} field="off" {...cell} /> : null}
        {visible.def ? <LiveCell className="poster-stat" value={row.stats.def} field="def" {...cell} /> : null}
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
  naturalNames = false,
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
  naturalNames?: boolean;
  live?: boolean;
  onRowEdit?: (rowIndex: number, field: TableColumnRole, value: string) => void;
  onLogoPick?: (teamId: string | null, teamQuery: string) => void;
}) {
  const source = row.team?.name ?? row.teamQuery;
  const cleaned = compactName ? source.replace(/\s*\(.*?\)\s*/g, " ").trim() : source;
  const label = naturalNames ? wrapBoardName(cleaned) : cleaned.toUpperCase();
  const moveClass =
    row.movement && row.movement > 0 ? "is-up" : row.movement && row.movement < 0 ? "is-down" : "is-flat";
  const primary = row.team?.primary ?? "#3a3a40";
  const tone = barTone(primary);
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
          "--team-secondary": row.team?.secondary ?? "#111111",
          "--team-fill": tone.fill,
          "--team-ink": tone.ink,
          "--team-ink-soft": tone.soft,
          "--row-i": String(index),
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
          <span className="lettermark">{label.trim().charAt(0)}</span>
        )}
      </span>
      <span
        className="poster-name"
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
        {!row.team ? <span className="poster-missing">no match</span> : null}
      </span>
      <RowMetrics row={row} mode={mode} visible={visible} rowIndex={row.sourceIndex} live={live} onRowEdit={onRowEdit} />
    </li>
  );
}

function ColumnHeads({
  mode,
  variant,
  visible,
}: {
  mode: "stats" | "ratings" | "simple";
  variant: "full" | "power" | "split" | "board";
  visible: VisibleMetrics;
}) {
  if (mode !== "stats" && mode !== "ratings") return null;
  const lead = mode === "stats" ? "PTS" : visible.rating ? "RATING" : visible.off ? "OFF" : "RTG";
  if (variant === "power") {
    return (
      <div className="poster-cols is-lead" aria-hidden>
        <span className="col-trend" />
        <span className="col-rank">#</span>
        <span className="col-team">TEAM</span>
        <span className="col-fill is-primary">{mode === "stats" ? "PTS" : lead}</span>
      </div>
    );
  }
  if (variant === "split") {
    return (
      <div className="poster-cols is-lead" aria-hidden>
        <span className="col-rank">#</span>
        <span className="col-trend" />
        <span className="col-mark" />
        <span className="col-team">TEAM</span>
        <span className="poster-metrics">
          <span className="col-fill is-primary">{mode === "stats" ? "PTS" : lead}</span>
        </span>
      </div>
    );
  }
  if (variant === "board") {
    return (
      <div className="poster-cols" aria-hidden>
        <span className="col-trend" />
        <span className="col-rank" />
        <span />
        <span className="col-team">{mode === "ratings" ? "TEAMNAME" : "TEAM"}</span>
        <span className="poster-metrics">
          {mode === "stats" ? (
            <>
              {visible.w ? <span className="col-fill">W</span> : null}
              {visible.l ? <span className="col-fill">L</span> : null}
              {visible.d ? <span className="col-fill">D</span> : null}
              {visible.pts ? <span className="col-fill is-primary">PTS</span> : null}
              {visible.gf ? <span className="col-fill">GF</span> : null}
              {visible.ga ? <span className="col-fill">GA</span> : null}
              {visible.gd ? <span className="col-fill">GD</span> : null}
            </>
          ) : (
            <>
              {visible.rating ? <span className="col-fill is-primary">RATING</span> : null}
              {visible.off ? <span className="col-fill">OFF</span> : null}
              {visible.def ? <span className="col-fill">DEF</span> : null}
            </>
          )}
        </span>
      </div>
    );
  }
  return (
    <div className="poster-cols" aria-hidden>
      <span className="col-trend" />
      <span className="col-rank">#</span>
      <span />
      <span className="col-team">TEAM</span>
      <span className="poster-metrics">
        {mode === "stats" ? (
          <>
            {visible.w ? <span className="col-fill">W</span> : null}
            {visible.l ? <span className="col-fill">L</span> : null}
            {visible.d ? <span className="col-fill">D</span> : null}
            {visible.pts ? <span className="col-fill is-primary">PTS</span> : null}
            {visible.gf ? <span className="col-fill">GF</span> : null}
            {visible.ga ? <span className="col-fill">GA</span> : null}
            {visible.gd ? <span className="col-fill">GD</span> : null}
          </>
        ) : (
          <>
            {visible.rating ? <span className="col-fill is-primary">RATING</span> : null}
            {visible.off ? <span className="col-fill">OFF</span> : null}
            {visible.def ? <span className="col-fill">DEF</span> : null}
            <span className="col-fill is-move">+/-</span>
            {visible.games ? <span className="col-fill">GP</span> : null}
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
  onText,
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
  const headVariant =
    templateId === "power" ? "power" : templateId === "split" ? "split" : templateId === "board" ? "board" : "full";

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
    const metaChrome = templateId === "movers" ? 22 : 0;
    const preferredRow = parsePx(tokens["--row-height"], 92);
    Object.assign(
      style,
      fitListToCanvas(
        height,
        listRows.length,
        tokens,
        metaChrome,
        !showHeads,
        templateId === "board" ? preferredRow : 140,
        templateId === "board",
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
      className={`poster is-${mode} tmpl-${templateId}${heroFront ? " is-hero-front" : " is-hero-behind"}${media.hero ? " has-hero" : ""}${heroH > 0 ? " has-hero-h" : ""}${hasMovement ? "" : " is-no-trend"}${live ? " is-live" : ""}${selected ? ` is-picked-${selected}` : ""}`}
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
          <ColumnHeads mode={mode} variant={headVariant} visible={visible} />
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
                unsignedTrend={templateId === "board"}
                naturalNames={templateId === "board"}
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
