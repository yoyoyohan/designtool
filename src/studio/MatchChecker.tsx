import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeHex } from "./barStore";
import { normalizeLogoName } from "./logoStore";
import { NO_SCHOOL, type CheckedRow, type RowFix, type RowFixes } from "./rowFixes";
import "./MatchChecker.css";

type Props = {
  rows: CheckedRow[];
  fixes: RowFixes;
  schoolNames: string[];
  canUploadCrest: boolean;
  focus: { key: string; nonce: number } | null;
  /** `batch` groups repeated edits (like dragging a color) into one undo step. */
  onFix: (key: string, fix: RowFix | null, batch?: string) => void;
  onUploadCrest: (row: CheckedRow) => void;
};

const STATE_LABEL: Record<CheckedRow["matchState"], string> = {
  sure: "Matched",
  check: "Check",
  none: "No match",
  fixed: "Set by you",
};

const ORDER: Record<CheckedRow["matchState"], number> = { none: 0, check: 1, fixed: 2, sure: 3 };

export function MatchChecker({ rows, fixes, schoolNames, canUploadCrest, focus, onFix, onUploadCrest }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState("");
  const [miss, setMiss] = useState("");
  const listRef = useRef<HTMLOListElement>(null);

  const counts = useMemo(() => {
    const out = { sure: 0, check: 0, none: 0, fixed: 0 };
    rows.forEach((row) => {
      out[row.matchState] += 1;
    });
    return out;
  }, [rows]);

  const attention = counts.check + counts.none;
  const visible = useMemo(() => {
    const list = showAll || attention === 0 ? rows : rows.filter((row) => row.matchState === "check" || row.matchState === "none" || row.matchKey === openKey);
    return [...list].sort((a, b) => (showAll ? a.rank - b.rank : ORDER[a.matchState] - ORDER[b.matchState] || a.rank - b.rank));
  }, [rows, showAll, attention, openKey]);
  const nameKeys = useMemo(() => new Map(schoolNames.map((name) => [normalizeLogoName(name), name])), [schoolNames]);

  useEffect(() => {
    if (!focus) return;
    setOpenKey(focus.key);
    setShowAll(true);
    const row = rows.find((item) => item.matchKey === focus.key);
    setDraft(row?.team?.name ?? "");
    setMiss("");
    window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-key="${CSS.escape(focus.key)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [focus]);

  if (rows.length === 0) return null;

  function toggle(row: CheckedRow) {
    if (openKey === row.matchKey) {
      setOpenKey(null);
      return;
    }
    setOpenKey(row.matchKey);
    setDraft(row.team?.name ?? "");
    setMiss("");
  }

  function pick(row: CheckedRow, value: string) {
    const name = nameKeys.get(normalizeLogoName(value));
    if (!name) {
      setMiss(value.trim() ? `No school called “${value.trim()}” in the library yet. Add it under Logos and team colors.` : "");
      return;
    }
    setMiss("");
    setDraft(name);
    onFix(row.matchKey, { ...fixes[row.matchKey], team: name });
  }

  function setColor(row: CheckedRow, field: "primary" | "secondary", value: string) {
    onFix(row.matchKey, { ...fixes[row.matchKey], [field]: normalizeHex(value) }, `${row.matchKey}:${field}`);
  }

  return (
    <section className="match-check">
      <header className="match-head">
        <div>
          <span className="match-title">Schools</span>
          <span className="match-sum">
            {attention === 0 ? (
              <>All {rows.length} look right</>
            ) : (
              <>
                {counts.check ? <em className="is-check">{counts.check} to check</em> : null}
                {counts.check && counts.none ? " · " : null}
                {counts.none ? <em className="is-none">{counts.none} not found</em> : null}
              </>
            )}
          </span>
        </div>
        {attention > 0 ? (
          <button type="button" className="link-btn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Only ones to check" : `Show all ${rows.length}`}
          </button>
        ) : null}
      </header>

      {attention === 0 && !showAll && !openKey ? (
        <button type="button" className="match-all" onClick={() => setShowAll(true)}>
          Review or recolor a school
        </button>
      ) : (
        <ol className="match-list" ref={listRef}>
          {visible.map((row) => {
            const open = openKey === row.matchKey;
            const fix = fixes[row.matchKey];
            const shown = row.team?.name ?? row.teamQuery;
            const differs = normalizeLogoName(shown) !== row.matchKey;
            return (
              <li key={`${row.matchKey}-${row.sourceIndex}`} data-key={row.matchKey} className={`match-row is-${row.matchState}${open ? " is-open" : ""}`}>
                <button type="button" className="match-line" aria-expanded={open} onClick={() => toggle(row)}>
                  <span className="match-rank">{row.rank}</span>
                  <span className="match-crest" style={{ background: row.team?.primary ?? "var(--ui-line)" }}>
                    {row.team?.logoUrl ? <img src={row.team.logoUrl} alt="" /> : null}
                  </span>
                  <span className="match-names">
                    <b>{shown}</b>
                    {differs ? <small>you pasted “{row.teamQuery}”</small> : null}
                  </span>
                  <span className="match-chip">{STATE_LABEL[row.matchState]}</span>
                </button>
                {open ? (
                  <div className="match-edit">
                    <label className="match-field">
                      <span>This row is</span>
                      <div className="match-pick">
                        <input
                          list="match-schools"
                          value={draft}
                          placeholder="Type a school name"
                          onChange={(event) => {
                            setDraft(event.target.value);
                            setMiss("");
                            if (nameKeys.get(normalizeLogoName(event.target.value)) === event.target.value) pick(row, event.target.value);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") pick(row, draft);
                          }}
                        />
                        <button type="button" onClick={() => pick(row, draft)}>
                          Use
                        </button>
                      </div>
                    </label>
                    {miss ? <p className="match-miss">{miss}</p> : null}
                    <div className="match-actions">
                      {row.matchState === "check" && row.team ? (
                        <button type="button" onClick={() => onFix(row.matchKey, { ...fix, team: row.team!.name })}>
                          Yes, that's right
                        </button>
                      ) : null}
                      {fix?.team !== NO_SCHOOL ? (
                        <button type="button" onClick={() => onFix(row.matchKey, { ...fix, team: NO_SCHOOL })}>
                          Just show “{row.teamQuery}”
                        </button>
                      ) : null}
                    </div>
                    <div className="match-colors">
                      <label>
                        <input
                          type="color"
                          value={normalizeHex(row.team?.primary ?? "#3a3a40")}
                          onChange={(event) => setColor(row, "primary", event.target.value)}
                        />
                        Bar
                      </label>
                      <label>
                        <input
                          type="color"
                          value={normalizeHex(row.team?.secondary ?? "#ffffff", "#ffffff")}
                          onChange={(event) => setColor(row, "secondary", event.target.value)}
                        />
                        Second color
                      </label>
                      <span className="match-scope">This poster only</span>
                    </div>
                    <div className="match-actions">
                      {canUploadCrest ? (
                        <button type="button" onClick={() => onUploadCrest(row)}>
                          {row.team?.logoUrl ? "Replace crest…" : "Add crest…"}
                        </button>
                      ) : (
                        <p className="match-note">Crest uploads change every poster, so they need the desk key.</p>
                      )}
                      {fix ? (
                        <button type="button" className="is-quiet" onClick={() => onFix(row.matchKey, null)}>
                          Undo my changes
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      <datalist id="match-schools">
        {schoolNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </section>
  );
}
