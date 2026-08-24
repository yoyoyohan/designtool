import type { CSSProperties } from "react";
import type { RankingRow } from "../engine/types";
import { OrnamentGraphic, type OrnamentId } from "./ornaments";
import "./RankingPoster.css";
import "../theme/tokens.css";

export type PosterDecor = {
  id: OrnamentId;
  src?: string;
};

type Props = {
  title: string;
  subtitle: string;
  kicker: string;
  width: number;
  height: number;
  rows: RankingRow[];
  tokens: Record<string, string>;
  fitRows: boolean;
  decorA: PosterDecor;
  decorB: PosterDecor;
};

function parsePx(value: string | undefined, fallback: number): number {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n : fallback;
}

function formatMove(value: number | null): string {
  if (value === null || value === 0) return "·";
  const n = Math.abs(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return value > 0 ? `▲${n}` : `▼${n}`;
}

const STAT_KEYS = ["w", "l", "d", "pts", "gf", "ga", "gd"] as const;

export function RankingPoster({
  title,
  subtitle,
  kicker,
  width,
  height,
  rows,
  tokens,
  fitRows,
  decorA,
  decorB,
}: Props) {
  const style: CSSProperties & Record<string, string> = {
    width: `${width}px`,
    height: `${height}px`,
    ...tokens,
  };

  if (fitRows && rows.length > 0) {
    const pad = parsePx(tokens["--poster-pad"], 48);
    const header = parsePx(tokens["--header-height"], 150);
    const colHead = parsePx(tokens["--col-head-height"], 38);
    const footer = parsePx(tokens["--footer-height"], 72);
    const gap = parsePx(tokens["--row-gap"], 14);
    const available = height - pad * 2 - header - colHead - footer - 18;
    const rowH = Math.floor((available - gap * (rows.length - 1)) / rows.length);
    const size = `${Math.max(56, rowH)}px`;
    style["--row-height"] = size;
    style["--logo-size"] = size;
  }

  const showStats = rows.some((row) => STAT_KEYS.some((key) => row.stats[key]));
  const showRatings = !showStats && rows.some((row) => row.stats.rating);
  const mode = showStats ? "stats" : showRatings ? "ratings" : "simple";

  return (
    <article
      className={`poster is-${mode}`}
      id="ranking-artboard"
      style={style}
    >
      <div className="poster-glow" aria-hidden />
      <div className="poster-glitter" aria-hidden />
      <div className="poster-deco poster-deco-a" aria-hidden>
        <OrnamentGraphic id={decorA.id} src={decorA.src} />
      </div>
      <div className="poster-deco poster-deco-b" aria-hidden>
        <OrnamentGraphic id={decorB.id} src={decorB.src} />
      </div>
      <header className="poster-header">
        {kicker.trim() ? <p className="poster-kicker">{kicker}</p> : null}
        <h1 className="poster-title">{title}</h1>
      </header>
      {mode === "stats" ? (
        <div className="poster-cols" aria-hidden>
          <span className="col-rank">#</span>
          <span />
          <span />
          <span className="col-fill">W</span>
          <span className="col-fill">L</span>
          <span className="col-fill">D</span>
          <span className="col-fill">PTS</span>
          <span className="col-fill">GF</span>
          <span className="col-fill">GA</span>
          <span className="col-fill">GD</span>
        </div>
      ) : null}
      {mode === "ratings" ? (
        <div className="poster-cols" aria-hidden>
          <span className="col-rank">#</span>
          <span />
          <span />
          <span className="col-fill">RTG</span>
          <span className="col-fill">OFF</span>
          <span className="col-fill">DEF</span>
          <span className="col-fill">+/-</span>
          <span className="col-fill">GP</span>
        </div>
      ) : null}
      <ol className="poster-list">
        {rows.map((row) => {
          const label = (row.team?.name ?? row.teamQuery).toUpperCase();
          const moveClass =
            row.movement && row.movement > 0 ? "is-up" : row.movement && row.movement < 0 ? "is-down" : "";
          return (
            <li
              key={`${row.rank}-${row.teamQuery}`}
              className={row.team ? "poster-row" : "poster-row is-unmatched"}
              style={
                {
                  "--team-primary": row.team?.primary ?? "#3a3a40",
                  "--team-secondary": row.team?.secondary ?? "#111111",
                } as CSSProperties
              }
            >
              <span className="poster-rank">{row.rank}</span>
              <span className="poster-mark">
                {row.team?.logoUrl ? (
                  <img src={row.team.logoUrl} alt="" />
                ) : (
                  <span className="lettermark">{label.trim().charAt(0)}</span>
                )}
              </span>
              <span className="poster-name">
                <span>
                  {label}
                  {!row.team && <span className="poster-missing">no match</span>}
                </span>
              </span>
              {mode === "stats" ? (
                <>
                  <span className="poster-stat">{row.stats.w || row.record || ""}</span>
                  <span className="poster-stat">{row.stats.l}</span>
                  <span className="poster-stat">{row.stats.d}</span>
                  <span className="poster-pts">{row.stats.pts}</span>
                  <span className="poster-stat">{row.stats.gf}</span>
                  <span className="poster-stat">{row.stats.ga}</span>
                  <span className="poster-stat">{row.stats.gd}</span>
                </>
              ) : null}
              {mode === "ratings" ? (
                <>
                  <span className="poster-pts">{row.stats.rating}</span>
                  <span className="poster-stat">{row.stats.off}</span>
                  <span className="poster-stat">{row.stats.def}</span>
                  <span className={`poster-stat poster-move ${moveClass}`}>{formatMove(row.movement)}</span>
                  <span className="poster-stat">{row.stats.games}</span>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
      {subtitle.trim() ? <footer className="poster-footer">{subtitle}</footer> : null}
    </article>
  );
}
