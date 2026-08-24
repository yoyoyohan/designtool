import type { ParsedTable, TableColumnRole } from "./types";

const ROLE_PATTERNS: { role: TableColumnRole; pattern: RegExp }[] = [
  { role: "rank", pattern: /^(rank|#|rk|pos|position|r)$/i },
  { role: "team", pattern: /^(team|school|club|name|side)$/i },
  { role: "record", pattern: /^(record|rec|w-l|wl|w_l)$/i },
  { role: "prev", pattern: /^(prev|previous|last|old|lw|last\s*week)$/i },
  { role: "movement", pattern: /^(move|movement|chg|change|delta|mover)$/i },
  { role: "w", pattern: /^(w|win|wins)$/i },
  { role: "l", pattern: /^(l|loss|losses)$/i },
  { role: "d", pattern: /^(d|draw|draws|t|ties)$/i },
  { role: "pts", pattern: /^(pts|pt|points)$/i },
  { role: "gf", pattern: /^(gf|goals?\s*for|for)$/i },
  { role: "ga", pattern: /^(ga|goals?\s*against|against)$/i },
  { role: "gd", pattern: /^(gd|goal\s*diff(?:erential)?|diff)$/i },
  { role: "rating", pattern: /^(rating|rtg|pwr|power|score)$/i },
  { role: "off", pattern: /^(off|offrating|off\s*rating|offense|attack)$/i },
  { role: "def", pattern: /^(def|defrating|def\s*rating|defense)$/i },
  { role: "games", pattern: /^(games|gp|n|played)$/i },
  { role: "date", pattern: /^(date|updated|as\s*of)$/i },
];

function isRankCell(value: string): boolean {
  return /^\d{1,3}$/.test(value.trim());
}

function isTeamCell(value: string): boolean {
  return /[a-zA-Z]/.test(value) && !/^\d+(\.\d+)?$/.test(value.trim());
}

function isDecimalCell(value: string): boolean {
  return /^-?\d+\.\d+$/.test(value.trim());
}

function inferHeaderlessRoles(width: number, sample: string[]): TableColumnRole[] {
  const roles: TableColumnRole[] = Array.from({ length: width }, () => "extra");
  if (width >= 2 && isRankCell(sample[0] ?? "") && isTeamCell(sample[1] ?? "")) {
    roles[0] = "rank";
    roles[1] = "team";
    if (width >= 5 && isDecimalCell(sample[2] ?? "") && isDecimalCell(sample[3] ?? "") && isDecimalCell(sample[4] ?? "")) {
      roles[2] = "rating";
      roles[3] = "off";
      roles[4] = "def";
      if (width > 5) roles[5] = "movement";
      if (width > 6) roles[6] = "games";
      if (width > 7) roles[7] = "date";
    }
    return roles;
  }
  if (width >= 1 && isTeamCell(sample[0] ?? "")) {
    roles[0] = "team";
  }
  return roles;
}

function labelsForRoles(roles: TableColumnRole[]): string[] {
  const names: Record<TableColumnRole, string> = {
    rank: "Rank",
    team: "Team",
    record: "Record",
    prev: "Prev",
    movement: "Move",
    w: "W",
    l: "L",
    d: "D",
    pts: "PTS",
    gf: "GF",
    ga: "GA",
    gd: "GD",
    rating: "Rating",
    off: "Off",
    def: "Def",
    games: "Games",
    date: "Date",
    extra: "Col",
  };
  return roles.map((role, index) => (role === "extra" ? `Col ${index + 1}` : names[role]));
}

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const tabs = (first.match(/\t/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  return tabs >= commas ? "\t" : ",";
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === "\t") {
    return line.split("\t").map((cell) => cell.trim());
  }
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  return (
    ROLE_PATTERNS.some(({ pattern }) => cells.some((cell) => pattern.test(cell))) ||
    /\b(rank|team|school|record|pts|points)\b/.test(joined)
  );
}

export function detectRoles(headers: string[]): TableColumnRole[] {
  const used = new Set<TableColumnRole>();
  return headers.map((header) => {
    const match = ROLE_PATTERNS.find(
      ({ role, pattern }) => !used.has(role) && pattern.test(header.trim()),
    );
    if (match) {
      used.add(match.role);
      return match.role;
    }
    return "extra";
  });
}

function ensureTeamAndRank(roles: TableColumnRole[]): TableColumnRole[] {
  const next = [...roles];
  if (!next.includes("team")) {
    const idx = next[0] === "rank" ? 1 : 0;
    if (next[idx] !== undefined) next[idx] = "team";
  }
  if (!next.includes("rank") && next.length > 1 && next[0] === "extra") {
    next[0] = "rank";
  }
  return next;
}

export function parseTable(text: string): ParsedTable {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return { headers: [], rows: [], roles: [] };
  }

  const delimiter = detectDelimiter(trimmed);
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const parsed = lines.map((line) => splitLine(line, delimiter));
  const width = Math.max(...parsed.map((row) => row.length));
  const padded = parsed.map((row) => {
    const copy = [...row];
    while (copy.length < width) copy.push("");
    return copy;
  });

  const hasHeader = padded[0] ? looksLikeHeader(padded[0]) : false;
  const body = hasHeader ? padded.slice(1) : padded;
  const roles = hasHeader
    ? ensureTeamAndRank(detectRoles(padded[0]))
    : ensureTeamAndRank(inferHeaderlessRoles(width, body[0] ?? padded[0] ?? []));
  const headers = hasHeader ? padded[0] : labelsForRoles(roles);

  return { headers, rows: body, roles };
}

export function cellByRole(
  row: string[],
  roles: TableColumnRole[],
  role: TableColumnRole,
): string {
  const index = roles.indexOf(role);
  return index >= 0 ? (row[index] ?? "") : "";
}

export function extraCells(
  row: string[],
  headers: string[],
  roles: TableColumnRole[],
): { label: string; value: string }[] {
  return roles
    .map((role, index) =>
      role === "extra" && row[index]
        ? { label: headers[index] ?? `Col ${index + 1}`, value: row[index] }
        : null,
    )
    .filter((item): item is { label: string; value: string } => item !== null);
}
