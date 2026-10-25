import { useEffect, useState } from "react";
import { columnKey } from "../engine/parseTable";
import type { ColumnOverrides, ParsedTable, TableColumnRole } from "../engine/types";
import "./ColumnReader.css";

const ROLE_LABELS: Record<TableColumnRole, string> = {
  rank: "Rank",
  team: "School",
  prev: "Last week's rank",
  movement: "Movement (+/−)",
  record: "Record",
  w: "Wins",
  l: "Losses",
  d: "Ties / draws",
  pts: "Points",
  gf: "Goals for",
  ga: "Goals against",
  gd: "Goal difference",
  rating: "Rating",
  off: "Offense",
  def: "Defense",
  games: "Games played",
  date: "Date",
  extra: "Not used",
};

const ROLE_ORDER: TableColumnRole[] = [
  "rank",
  "team",
  "rating",
  "off",
  "def",
  "prev",
  "movement",
  "record",
  "w",
  "l",
  "d",
  "pts",
  "gf",
  "ga",
  "gd",
  "games",
  "date",
  "extra",
];

type Props = {
  table: ParsedTable;
  overrides: ColumnOverrides;
  onChange: (next: ColumnOverrides) => void;
};

function sampleFor(table: ParsedTable, index: number): string {
  for (const row of table.rows) {
    const value = (row[index] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function ColumnReader({ table, overrides, onChange }: Props) {
  const width = table.roles.length;
  const unused = table.roles.filter((role) => role === "extra").length;
  const missingTeam = width > 0 && !table.roles.includes("team");
  const changed = Object.keys(overrides.roles).length > 0 || overrides.header !== undefined;
  const needsLook = unused > 0 || missingTeam || !table.hasHeader;
  const [open, setOpen] = useState(needsLook);

  useEffect(() => {
    if (needsLook) setOpen(true);
  }, [needsLook, width]);

  if (width === 0 || table.rows.length === 0) return null;

  function setRole(index: number, role: TableColumnRole) {
    const key = columnKey(table, index);
    const roles = { ...overrides.roles };
    if (role === table.guessedRoles[index]) delete roles[key];
    else roles[key] = role;
    onChange({ ...overrides, roles });
  }

  return (
    <section className={open ? "col-reader is-open" : "col-reader"}>
      <button type="button" className="col-reader-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="col-reader-title">How we read your table</span>
        <span className="col-reader-sum">
          {width} column{width === 1 ? "" : "s"}
          {unused ? <em className="is-warn"> · {unused} not used</em> : null}
          {missingTeam ? <em className="is-warn"> · no school column</em> : null}
        </span>
        <span className="col-reader-chev" aria-hidden />
      </button>
      {open ? (
        <div className="col-reader-body">
          <label className="col-reader-check">
            <input
              type="checkbox"
              checked={table.hasHeader}
              onChange={(event) => onChange({ roles: {}, header: event.target.checked })}
            />
            First row is column names
          </label>
          <ol className="col-reader-list">
            {table.roles.map((role, index) => {
              const label = table.hasHeader ? table.headers[index]?.trim() || `Column ${index + 1}` : `Column ${index + 1}`;
              const sample = sampleFor(table, index);
              const isChanged = Boolean(overrides.roles[columnKey(table, index)]);
              return (
                <li key={index} className={role === "extra" ? "is-unused" : undefined}>
                  <div className="col-reader-name">
                    <span title={label}>{label}</span>
                    {sample ? <small title={sample}>e.g. {sample}</small> : null}
                  </div>
                  <select
                    value={role}
                    aria-label={`What is ${label}?`}
                    onChange={(event) => setRole(index, event.target.value as TableColumnRole)}
                  >
                    {ROLE_ORDER.map((item) => (
                      <option key={item} value={item}>
                        {ROLE_LABELS[item]}
                      </option>
                    ))}
                  </select>
                  {isChanged ? <span className="col-reader-dot" title="You set this" /> : null}
                </li>
              );
            })}
          </ol>
          <p className="col-reader-note">
            {missingTeam
              ? "Pick which column has the school names."
              : unused
                ? "“Not used” columns stay off the poster. Change one if it should show."
                : "Everything here shows on the poster."}
          </p>
          {changed ? (
            <button type="button" className="link-btn" onClick={() => onChange({ roles: {} })}>
              Go back to our guess
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
