import Fuse from "fuse.js";
import { cellByRole, extraCells } from "./parseTable";
import type { ParsedTable, RankingRow, TeamRecord } from "./types";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|fc|cf|sc|university|univ|u|college)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[#]/g, "").trim();
  if (!cleaned) return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function parseMovement(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "·" || trimmed === "•" || trimmed === "-" || trimmed === "–") {
    return 0;
  }
  const down = /[▼↓v]/i.test(trimmed);
  const n = Number.parseFloat(trimmed.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (n === 0) return 0;
  return down ? -n : n;
}

export function matchTeam(
  query: string,
  teams: TeamRecord[],
  fuse: Fuse<TeamRecord> | null,
): TeamRecord | null {
  const q = query.trim();
  if (!q || teams.length === 0) return null;
  const nq = normalize(q);

  for (const team of teams) {
    const names = [team.name, team.logoFile.replace(/\.[^.]+$/, ""), ...team.aliases];
    if (names.some((name) => normalize(name) === nq)) return team;
  }

  if (!fuse) return null;
  const hits = fuse.search(q, { limit: 1 });
  const top = hits[0];
  if (top && top.score !== undefined && top.score <= 0.34) return top.item;
  return null;
}

export function buildFuse(teams: TeamRecord[]): Fuse<TeamRecord> | null {
  if (teams.length === 0) return null;
  return new Fuse(teams, {
    includeScore: true,
    threshold: 0.34,
    ignoreLocation: true,
    keys: [
      { name: "name", weight: 0.6 },
      { name: "aliases", weight: 0.3 },
      { name: "logoFile", weight: 0.1 },
    ],
  });
}

export function decorateRows(table: ParsedTable, teams: TeamRecord[]): RankingRow[] {
  const fuse = buildFuse(teams);
  return table.rows
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, index) => {
      const rank = parseNumber(cellByRole(row, table.roles, "rank")) ?? index + 1;
      const teamQuery = cellByRole(row, table.roles, "team") || row[1] || row[0] || "";
      const record = cellByRole(row, table.roles, "record");
      const prev = parseNumber(cellByRole(row, table.roles, "prev"));
      const explicitMove = parseMovement(cellByRole(row, table.roles, "movement"));
      const movement =
        explicitMove ?? (prev !== null ? prev - rank : null);
      const w = cellByRole(row, table.roles, "w");
      const l = cellByRole(row, table.roles, "l");
      const d = cellByRole(row, table.roles, "d");
      const gf = cellByRole(row, table.roles, "gf");
      const ga = cellByRole(row, table.roles, "ga");
      let pts = cellByRole(row, table.roles, "pts");
      let gd = cellByRole(row, table.roles, "gd");
      const wN = parseNumber(w);
      const dN = parseNumber(d);
      const gfN = parseNumber(gf);
      const gaN = parseNumber(ga);
      if (!pts && wN !== null && dN !== null) pts = String(wN * 3 + dN);
      if (!gd && gfN !== null && gaN !== null) {
        const diff = gfN - gaN;
        gd = diff > 0 ? `+${diff}` : String(diff);
      }
      return {
        rank,
        teamQuery,
        record,
        prev,
        movement,
        extras: extraCells(row, table.headers, table.roles),
        stats: {
          w,
          l,
          d,
          pts,
          gf,
          ga,
          gd,
          rating: cellByRole(row, table.roles, "rating"),
          off: cellByRole(row, table.roles, "off"),
          def: cellByRole(row, table.roles, "def"),
          games: cellByRole(row, table.roles, "games"),
          date: cellByRole(row, table.roles, "date"),
        },
        team: matchTeam(teamQuery, teams, fuse),
      };
    });
}
