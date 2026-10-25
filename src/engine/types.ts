export type TeamRecord = {
  id: string;
  name: string;
  aliases: string[];
  primary: string;
  secondary: string;
  accent: string;
  logoUrl: string;
  logoFile: string;
  source: "sample" | "upload";
};

export type SizePreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

export type TableColumnRole =
  | "rank"
  | "team"
  | "record"
  | "prev"
  | "movement"
  | "w"
  | "l"
  | "d"
  | "pts"
  | "gf"
  | "ga"
  | "gd"
  | "rating"
  | "off"
  | "def"
  | "games"
  | "date"
  | "extra";

export type ParsedTable = {
  headers: string[];
  rows: string[][];
  roles: TableColumnRole[];
  /** What the reader guessed before the coach changed anything. */
  guessedRoles: TableColumnRole[];
  hasHeader: boolean;
  delimiter: string;
};

/** Coach corrections to how a pasted table is read. Keys come from `columnKey`. */
export type ColumnOverrides = {
  header?: boolean;
  roles: Record<string, TableColumnRole>;
};

export type RankingStats = {
  w: string;
  l: string;
  d: string;
  pts: string;
  gf: string;
  ga: string;
  gd: string;
  rating: string;
  off: string;
  def: string;
  games: string;
  date: string;
};

export type RankingRow = {
  rank: number;
  teamQuery: string;
  record: string;
  prev: number | null;
  movement: number | null;
  extras: { label: string; value: string }[];
  stats: RankingStats;
  team: TeamRecord | null;
  sourceIndex: number;
};

export type TokenValue = string;

export type TokenKind = "color" | "px" | "em" | "number" | "font";

export type TokenDef = {
  id: string;
  label: string;
  group: string;
  kind: TokenKind;
  min?: number;
  max?: number;
  step?: number;
  /** One plain sentence: what moves on the poster. */
  hint?: string;
};
