import type { ParsedTable, TableColumnRole } from "./types";

const ROLE_PATTERNS: { role: TableColumnRole; pattern: RegExp }[] = [
  { role: "rank", pattern: /^(rank|#|rk|pos|position|r)$/i },
  { role: "team", pattern: /^(team|teamname|school|club|name|side)$/i },
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

function isDateCell(value: string): boolean {
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value.trim());
}

function parseDecimal(value: string): number | null {
  if (!isDecimalCell(value) && !/^-?\d+$/.test(value.trim())) return null;
  const n = Number.parseFloat(value.trim());
  return Number.isFinite(n) ? n : null;
}

function findRankTeam(sample: string[]): { rank: number; team: number } | null {
  for (let i = 0; i < sample.length - 1; i += 1) {
    if (isRankCell(sample[i] ?? "") && isTeamCell(sample[i + 1] ?? "")) {
      return { rank: i, team: i + 1 };
    }
  }
  return null;
}

function inferHeaderlessRoles(width: number, sample: string[]): TableColumnRole[] {
  const roles: TableColumnRole[] = Array.from({ length: width }, () => "extra");
  const pair = findRankTeam(sample);

  if (pair) {
    roles[pair.rank] = "rank";
    roles[pair.team] = "team";

    assignTrailingMetrics(roles, sample, pair.team + 1);

    const before = sample.slice(0, pair.rank);
    const leading = before
      .map((cell, index) => ({ index, value: parseDecimal(cell) }))
      .filter((item): item is { index: number; value: number } => item.value !== null);
    const rating = parseDecimal(sample[roles.indexOf("rating")] ?? "");

    if (leading.length >= 2) {
      const [first, second] = leading;
      const summed =
        rating !== null && Math.abs(first.value + second.value - rating) < 0.05;
      roles[first.index] = "off";
      roles[second.index] = summed || Math.abs(second.value) < 10 ? "movement" : "def";
    } else if (leading.length === 1) {
      roles[leading[0].index] = Math.abs(leading[0].value) < 10 ? "movement" : "off";
    }

    if (pair.rank === 0 && pair.team === 1 && width >= 5) {
      if (roles[2] === "extra" && isDecimalCell(sample[2] ?? "")) roles[2] = "rating";
      if (roles[3] === "extra" && isDecimalCell(sample[3] ?? "")) roles[3] = "off";
      if (roles[4] === "extra" && isDecimalCell(sample[4] ?? "")) roles[4] = "def";
      if (width > 5 && roles[5] === "extra") roles[5] = "movement";
      if (width > 6 && roles[6] === "extra") roles[6] = "games";
      if (width > 7 && roles[7] === "extra") roles[7] = "date";
    }
    return roles;
  }

  if (width >= 1 && isTeamCell(sample[0] ?? "")) {
    roles[0] = "team";
    assignTrailingMetrics(roles, sample, 1);
  }
  return roles;
}

function assignTrailingMetrics(roles: TableColumnRole[], sample: string[], start: number): void {
  const order: TableColumnRole[] = ["rating", "off", "def"];
  let next = 0;
  for (let i = start; i < sample.length && next < order.length; i += 1) {
    if (roles[i] !== "extra") continue;
    const cell = sample[i] ?? "";
    if (isDateCell(cell)) {
      roles[i] = "date";
      break;
    }
    if (isDecimalCell(cell)) {
      roles[i] = order[next];
      next += 1;
      continue;
    }
    if (cell.trim()) break;
  }
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
  if (tabs > 0) return "\t";
  if (commas > tabs) return ",";
  return "\t";
}

function isTeamToken(value: string): boolean {
  return /[a-zA-Z]/.test(value) && !isDecimalCell(value) && !isDateCell(value);
}

/** Turn a space-separated ranking line into cells so "1 Old Bridge 19.45" still parses. */
function reconstructSpaceLine(line: string): string[] | null {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  let rankAt = -1;
  for (let i = 0; i < tokens.length; i += 1) {
    if (isRankCell(tokens[i] ?? "") && i + 1 < tokens.length && isTeamToken(tokens[i + 1] ?? "")) {
      rankAt = i;
      break;
    }
  }

  if (rankAt >= 0) {
    let teamEnd = rankAt + 1;
    while (teamEnd < tokens.length && isTeamToken(tokens[teamEnd] ?? "")) teamEnd += 1;
    const team = tokens.slice(rankAt + 1, teamEnd).join(" ");
    return [...tokens.slice(0, rankAt), tokens[rankAt], team, ...tokens.slice(teamEnd)];
  }

  if (!isTeamToken(tokens[0] ?? "")) return null;
  let teamEnd = 1;
  while (teamEnd < tokens.length && isTeamToken(tokens[teamEnd] ?? "")) teamEnd += 1;
  if (teamEnd === tokens.length) return [tokens.join(" ")];
  return [tokens.slice(0, teamEnd).join(" "), ...tokens.slice(teamEnd)];
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === "\t") {
    if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
    if (/\s{2,}/.test(line)) return line.trim().split(/\s{2,}/).map((cell) => cell.trim());
    return reconstructSpaceLine(line) ?? line.split("\t").map((cell) => cell.trim());
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

function ensureTeamAndRank(roles: TableColumnRole[], sample: string[] = []): TableColumnRole[] {
  const next = [...roles];
  if (!next.includes("team")) {
    const pair = findRankTeam(sample);
    const named = next.findIndex((role, index) => role !== "rank" && isTeamCell(sample[index] ?? ""));
    const idx = pair ? pair.team : named >= 0 ? named : next[0] === "rank" ? 1 : 0;
    if (next[idx] !== undefined) next[idx] = "team";
  }
  if (!next.includes("rank")) {
    const pair = findRankTeam(sample);
    if (pair && next[pair.rank] === "extra") next[pair.rank] = "rank";
    else if (next.length > 1 && next[0] === "extra") next[0] = "rank";
  }
  return next;
}

function joinLine(cells: string[], delimiter: string): string {
  if (delimiter === "\t") return cells.join("\t");
  return cells
    .map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
    .join(",");
}

export function parseTable(text: string): ParsedTable {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return { headers: [], rows: [], roles: [], hasHeader: false, delimiter: "\t" };
  }

  const delimiter = detectDelimiter(trimmed);
  const lines = trimmed.split(/\r?\n/).filter((line) => line.length > 0);
  const parsed = lines.map((line) => splitLine(line, delimiter));
  const width = Math.max(...parsed.map((row) => row.length));
  const padded = parsed.map((row) => {
    const copy = [...row];
    while (copy.length < width) copy.push("");
    return copy;
  });

  const hasHeader = padded[0] ? looksLikeHeader(padded[0]) : false;
  const body = hasHeader ? padded.slice(1) : padded;
  const sample = body[0] ?? padded[0] ?? [];
  const roles = hasHeader
    ? ensureTeamAndRank(detectRoles(padded[0]), sample)
    : ensureTeamAndRank(inferHeaderlessRoles(width, sample), sample);
  const headers = hasHeader ? padded[0] : labelsForRoles(roles);

  return { headers, rows: body, roles, hasHeader, delimiter };
}

export function textToGrid(text: string): { grid: string[][]; delimiter: string } {
  const raw = text.replace(/^\uFEFF/, "");
  if (!raw.trim()) return { grid: [["", ""]], delimiter: "\t" };
  const delimiter = detectDelimiter(raw.trim());
  const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
  const parsed = lines.map((line) => splitLine(line, delimiter));
  const width = Math.max(1, ...parsed.map((row) => row.length));
  return {
    delimiter,
    grid: parsed.map((row) => {
      const copy = [...row];
      while (copy.length < width) copy.push("");
      return copy;
    }),
  };
}

export function gridToText(grid: string[][], delimiter = "\t"): string {
  if (grid.length === 0) return "";
  const width = Math.max(1, ...grid.map((row) => row.length));
  return grid
    .map((row) => {
      const copy = [...row];
      while (copy.length < width) copy.push("");
      return joinLine(copy, delimiter);
    })
    .join("\n");
}

const STANDING_HEADS = ["Team", "W", "L", "D", "PTS", "GF", "GA", "GD"];

export function blankTable(rows: number, cols: number, header: boolean): string {
  const width = Math.max(1, Math.min(16, Math.round(cols)));
  const count = Math.max(1, Math.min(40, Math.round(rows)));
  const heads = Array.from({ length: width }, (_, i) => STANDING_HEADS[i] ?? `Col ${i + 1}`);
  const body = Array.from({ length: count }, () => Array.from({ length: width }, () => ""));
  return gridToText(header ? [heads, ...body] : body);
}

/** Write one cell back into the pasted table so poster clicks can edit rankings. */
export function patchTableCell(
  text: string,
  rowIndex: number,
  role: TableColumnRole,
  value: string,
): string {
  const parsed = parseTable(text);
  let headers = [...parsed.headers];
  let roles = [...parsed.roles];
  let rows = parsed.rows.map((row) => [...row]);
  let col = roles.indexOf(role);

  if (col < 0 && role === "rank") {
    headers = parsed.hasHeader ? ["Rank", ...headers] : headers;
    roles = ["rank", ...roles];
    rows = rows.map((row, index) => [String(index + 1), ...row]);
    col = 0;
  }
  if (col < 0 || !rows[rowIndex]) return text;

  rows[rowIndex][col] = value;
  const lines = parsed.hasHeader ? [joinLine(headers, parsed.delimiter)] : [];
  for (const row of rows) lines.push(joinLine(row, parsed.delimiter));
  return lines.join("\n");
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
