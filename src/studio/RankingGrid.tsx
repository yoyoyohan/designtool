import { useMemo, useState, type ReactNode } from "react";
import { blankTable, gridToText, parseTable, textToGrid } from "../engine/parseTable";
import "./RankingGrid.css";

type Props = {
  value: string;
  onChange: (text: string) => void;
  onStructureChange?: (text: string) => void;
  extras?: ReactNode;
};

type EditorMode = "paste" | "table";

export function RankingGrid({ value, onChange, onStructureChange, extras }: Props) {
  const parsed = useMemo(() => textToGrid(value), [value]);
  const hasHeader = useMemo(() => parseTable(value).hasHeader, [value]);
  const [mode, setMode] = useState<EditorMode>("paste");
  const [setup, setSetup] = useState(false);
  const [rows, setRows] = useState(8);
  const [cols, setCols] = useState(7);
  const [header, setHeader] = useState(true);

  const grid = parsed.grid;
  const delimiter = parsed.delimiter;

  function commit(next: string[][], structure = false) {
    const text = gridToText(next, delimiter);
    if (structure && onStructureChange) onStructureChange(text);
    else onChange(text);
  }

  function setCell(r: number, c: number, cell: string) {
    commit(grid.map((row, ri) => (ri === r ? row.map((value, ci) => (ci === c ? cell : value)) : row)));
  }

  function addRow() {
    const width = Math.max(1, ...grid.map((row) => row.length));
    commit([...grid, Array.from({ length: width }, () => "")], true);
  }

  function addColumn() {
    commit(
      grid.map((row) => [...row, ""]),
      true,
    );
  }

  function createTable() {
    const text = blankTable(rows, cols, header);
    if (onStructureChange) onStructureChange(text);
    else onChange(text);
    setSetup(false);
    setMode("table");
  }

  return (
    <div className="rank-grid">
      {mode === "paste" ? (
        <>
          <textarea
            id="rankings"
            className="rank-grid-paste"
            value={value}
            spellCheck={false}
            aria-label="Rankings"
            placeholder={"Team\tW\tL\tD\tPTS\nSt. Joseph\t18\t1\t0\t54"}
            onChange={(event) => onChange(event.target.value)}
          />
          <p className="rank-grid-hint">Paste from Sheets, or type one team per line.</p>
          <div className="quiet-links">
            <button type="button" className="link-btn" onClick={() => setMode("table")}>
              Table
            </button>
            {extras}
          </div>
        </>
      ) : (
        <>
          <div className="quiet-links">
            <button type="button" className="link-btn" onClick={() => setMode("paste")}>
              Back to paste
            </button>
            <button type="button" className="link-btn" onClick={() => setSetup((open) => !open)}>
              New table
            </button>
            <button type="button" className="link-btn" onClick={addRow}>
              Add row
            </button>
            <button type="button" className="link-btn" onClick={addColumn}>
              Add column
            </button>
            {extras}
          </div>
          {setup ? (
            <form
              className="rank-grid-setup"
              onSubmit={(event) => {
                event.preventDefault();
                createTable();
              }}
            >
              <p>How big should the table be?</p>
              <div className="rank-grid-dims">
                <label>
                  Rows
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={rows}
                    onChange={(event) => setRows(Number(event.target.value))}
                  />
                </label>
                <label>
                  Columns
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={cols}
                    onChange={(event) => setCols(Number(event.target.value))}
                  />
                </label>
              </div>
              <label className="rank-grid-check">
                <input type="checkbox" checked={header} onChange={(event) => setHeader(event.target.checked)} />
                Include a header row
              </label>
              <div className="rank-grid-toolbar">
                <button type="submit" className="ghost-btn is-solid">
                  Create table
                </button>
                <button type="button" className="ghost-btn" onClick={() => setSetup(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
          <div className="rank-grid-scroll">
            <table>
              <tbody>
                {grid.map((row, r) => (
                  <tr key={r} className={hasHeader && r === 0 ? "is-head" : undefined}>
                    {row.map((cell, c) => (
                      <td key={c}>
                        <input
                          value={cell}
                          aria-label={`Row ${r + 1}, column ${c + 1}`}
                          spellCheck={false}
                          onChange={(event) => setCell(r, c, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" || event.shiftKey) return;
                            event.preventDefault();
                            const next = grid[r + 1]
                              ? (event.currentTarget.closest("tr")?.nextElementSibling?.querySelectorAll("input")[c] ??
                                null)
                              : null;
                            if (next instanceof HTMLInputElement) next.focus();
                            else addRow();
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
