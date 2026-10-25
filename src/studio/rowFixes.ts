import type { RankingRow, TeamRecord } from "../engine/types";
import { graphicBarFor } from "../theme/graphicBars";
import { normalizeLogoName } from "./logoStore";

/** Stored as the picked team when the coach wants the pasted name with no school attached. */
export const NO_SCHOOL = "__none__";

/** One poster's correction for one pasted name. Never touches the shared desk. */
export type RowFix = { team?: string; primary?: string; secondary?: string };
export type RowFixes = Record<string, RowFix>;

/** sure: the pasted name is the school's name or alias. check: we guessed. none: nothing found. fixed: the coach set it. */
export type MatchState = "sure" | "check" | "none" | "fixed";

export type CheckedRow = RankingRow & { matchKey: string; matchState: MatchState };

export function rowKey(teamQuery: string): string {
  return normalizeLogoName(teamQuery);
}

function fileStem(file: string): string {
  return file.replace(/^.*\//, "").replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
}

function namesFor(team: TeamRecord): string[] {
  return [team.name, ...team.aliases, team.logoFile ? fileStem(team.logoFile) : ""].filter(Boolean);
}

function findTeam(teams: TeamRecord[], name: string): TeamRecord | null {
  const key = normalizeLogoName(name);
  if (!key) return null;
  return (
    teams.find((team) => normalizeLogoName(team.name) === key) ??
    teams.find((team) => team.aliases.some((alias) => normalizeLogoName(alias) === key)) ??
    null
  );
}

function plainTeam(key: string, name: string): TeamRecord {
  const graphic = graphicBarFor(name);
  return {
    id: `poster-${key.replace(/\s+/g, "-") || "row"}`,
    name,
    aliases: [],
    primary: graphic?.primary ?? "#3a3a40",
    secondary: graphic?.secondary ?? "#ffffff",
    accent: "",
    logoUrl: "",
    logoFile: "",
    source: "upload",
  };
}

export function hasFix(fix: RowFix | undefined): boolean {
  return Boolean(fix && (fix.team || fix.primary || fix.secondary));
}

export function applyRowFixes(rows: RankingRow[], fixes: RowFixes, teams: TeamRecord[]): CheckedRow[] {
  return rows.map((row) => {
    const key = rowKey(row.teamQuery);
    const fix = fixes[key];
    let team = row.team;
    let matchState: MatchState = !team
      ? "none"
      : namesFor(team).some((name) => normalizeLogoName(name) === key)
        ? "sure"
        : "check";

    if (fix?.team === NO_SCHOOL) team = null;
    else if (fix?.team) team = findTeam(teams, fix.team) ?? team;

    if (fix?.primary || fix?.secondary) {
      const base = team ?? plainTeam(key, row.teamQuery);
      team = { ...base, primary: fix.primary ?? base.primary, secondary: fix.secondary ?? base.secondary };
    }
    if (hasFix(fix)) matchState = "fixed";
    return { ...row, team, matchKey: key, matchState };
  });
}

export function cleanFixes(fixes: unknown): RowFixes {
  if (!fixes || typeof fixes !== "object") return {};
  const out: RowFixes = {};
  for (const [key, value] of Object.entries(fixes as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const raw = value as Record<string, unknown>;
    const fix: RowFix = {};
    if (typeof raw.team === "string" && raw.team) fix.team = raw.team;
    if (typeof raw.primary === "string" && /^#[0-9a-f]{6}$/i.test(raw.primary)) fix.primary = raw.primary;
    if (typeof raw.secondary === "string" && /^#[0-9a-f]{6}$/i.test(raw.secondary)) fix.secondary = raw.secondary;
    if (hasFix(fix)) out[key] = fix;
  }
  return out;
}
