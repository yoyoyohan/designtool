import { useEffect, useMemo, useRef, useState } from "react";
import { exportPosterPng, filenameFromTitle } from "./engine/exportPng";
import { loadSampleRegistry, loadUploadedRegistry, TEAMS_CSV_TEMPLATE } from "./engine/loadRegistry";
import { decorateRows } from "./engine/matchTeam";
import { parseTable } from "./engine/parseTable";
import { SIZE_PRESETS } from "./engine/presets";
import type { TeamRecord } from "./engine/types";
import { ThemeInspector } from "./inspector/ThemeInspector";
import { SAMPLE_RANKING_TABLE, SAMPLE_TABLE } from "./sampleTable";
import { RankingPoster } from "./templates/RankingPoster";
import { ORNAMENT_IDS, ORNAMENT_LABELS, type OrnamentId } from "./templates/ornaments";
import { DEFAULT_TOKENS } from "./theme/tokenMeta";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function App() {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [assetNote, setAssetNote] = useState("Loading sample pack…");
  const [tableText, setTableText] = useState(SAMPLE_TABLE);
  const [kicker, setKicker] = useState("");
  const [title, setTitle] = useState("Group B");
  const [subtitle, setSubtitle] = useState("2025 GMC Boys Soccer Tournament");
  const [presetId, setPresetId] = useState(SIZE_PRESETS[0].id);
  const [tokens, setTokens] = useState<Record<string, string>>({ ...DEFAULT_TOKENS });
  const [fitRows, setFitRows] = useState(true);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [dropHot, setDropHot] = useState(false);
  const [zoom, setZoom] = useState(0.4);
  const [lockFit, setLockFit] = useState(true);
  const [decorA, setDecorA] = useState<OrnamentId>("burst");
  const [decorB, setDecorB] = useState<OrnamentId>("soccer");
  const [decorASrc, setDecorASrc] = useState("");
  const [decorBSrc, setDecorBSrc] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const decoAFileRef = useRef<HTMLInputElement>(null);
  const decoBFileRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  const decoUrls = useRef<string[]>([]);
  const fitScale = useRef(0.4);
  const lockFitRef = useRef(true);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const preset = SIZE_PRESETS.find((item) => item.id === presetId) ?? SIZE_PRESETS[0];
  const parsed = useMemo(() => parseTable(tableText), [tableText]);
  const rows = useMemo(() => decorateRows(parsed, teams), [parsed, teams]);
  const unmatched = rows.filter((row) => !row.team);

  useEffect(() => {
    let cancelled = false;
    loadSampleRegistry()
      .then((pack) => {
        if (cancelled) return;
        setTeams(pack);
        setAssetNote(`Sample pack · ${pack.length} teams`);
      })
      .catch((err: unknown) => {
        if (!cancelled) setAssetNote(err instanceof Error ? err.message : "Sample pack failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    lockFitRef.current = lockFit;
  }, [lockFit]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measure = () => {
      const pad = 72;
      const next = Math.min(
        (stage.clientWidth - pad) / preset.width,
        (stage.clientHeight - pad) / preset.height,
        1,
      );
      const value = Number.isFinite(next) && next > 0 ? next : 0.4;
      fitScale.current = value;
      if (lockFitRef.current) setZoom(value);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [preset.width, preset.height]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      lockFitRef.current = false;
      setLockFit(false);
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      setZoom((prev) => clamp(prev * factor, 0.12, 3));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
    folderRef.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    return () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      decoUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function bumpZoom(factor: number) {
    lockFitRef.current = false;
    setLockFit(false);
    setZoom((prev) => clamp(prev * factor, 0.12, 3));
  }

  function fitToStage() {
    lockFitRef.current = true;
    setLockFit(true);
    setZoom(fitScale.current);
  }

  function setDecorationFile(slot: "a" | "b", file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    decoUrls.current.push(url);
    if (slot === "a") {
      setDecorASrc(url);
      setDecorA("burst");
    } else {
      setDecorBSrc(url);
      setDecorB("soccer");
    }
  }

  async function applyFiles(fileList: FileList | File[]) {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    const pack = await loadUploadedRegistry(fileList);
    objectUrls.current = pack.map((team) => team.logoUrl).filter((url) => url.startsWith("blob:"));
    setTeams(pack);
    const missingLogos = pack.filter((team) => !team.logoUrl).length;
    const missingColor = pack.filter((team) => team.primary === "#4a4a4a").length;
    setAssetNote(
      `Uploaded · ${pack.length} teams` +
        (missingLogos ? ` · ${missingLogos} without logos` : "") +
        (missingColor ? ` · ${missingColor} using default color` : ""),
    );
  }

  async function onExport() {
    const node = document.getElementById("ranking-artboard");
    if (!(node instanceof HTMLElement)) return;
    setBusy(true);
    setStatus("Exporting…");
    try {
      await exportPosterPng(node, filenameFromTitle(title), 2);
      setStatus("PNG downloaded");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([TEAMS_CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "teams.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">
          Ranking <span>Studio</span>
        </div>
        <div className={status.toLowerCase().includes("fail") ? "topbar-status is-error" : "topbar-status"}>
          {status || `${rows.length} rows · ${teams.length} teams in registry`}
        </div>
        <button type="button" className="export-btn" onClick={onExport} disabled={busy || rows.length === 0}>
          Export PNG
        </button>
      </header>

      <aside className="sidebar">
        <div className="panel-block">
          <h2 className="panel-label">Logos & colors</h2>
          <p className="hint">
            Drop a folder of logos plus a teams.csv (name, aliases, primary, secondary, logo). Sample pack is loaded now.
          </p>
          <div
            className={dropHot ? "dropzone is-hot" : "dropzone"}
            onDragOver={(e) => {
              e.preventDefault();
              setDropHot(true);
            }}
            onDragLeave={() => setDropHot(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropHot(false);
              if (e.dataTransfer.files.length) void applyFiles(e.dataTransfer.files);
            }}
          >
            Drop folder or files here
          </div>
          <div className="row-btns">
            <button type="button" className="ghost-btn" onClick={() => folderRef.current?.click()}>
              Upload folder
            </button>
            <button type="button" className="ghost-btn" onClick={() => filesRef.current?.click()}>
              Upload files
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
                objectUrls.current = [];
                void loadSampleRegistry().then((pack) => {
                  setTeams(pack);
                  setAssetNote(`Sample pack · ${pack.length} teams`);
                });
              }}
            >
              Reload sample
            </button>
            <button type="button" className="ghost-btn" onClick={downloadTemplate}>
              teams.csv template
            </button>
          </div>
          <input
            ref={folderRef}
            className="hidden-file"
            type="file"
            multiple
            onChange={(e) => {
              if (e.target.files?.length) void applyFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={filesRef}
            className="hidden-file"
            type="file"
            multiple
            accept=".csv,image/png,image/svg+xml,image/jpeg,image/webp,.json"
            onChange={(e) => {
              if (e.target.files?.length) void applyFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="pack-meta">{assetNote}</p>
          <div className="logo-strip">
            {teams.map((team) =>
              team.logoUrl ? (
                <img key={team.id} src={team.logoUrl} alt={team.name} title={team.name} />
              ) : (
                <span key={team.id} className="logo-fallback" title={team.name}>
                  {team.name.charAt(0)}
                </span>
              ),
            )}
          </div>
        </div>

        <div className="panel-block">
          <h2 className="panel-label">Graphic</h2>
          <div className="field">
            <label htmlFor="kicker">Kicker</label>
            <input id="kicker" value={kicker} onChange={(e) => setKicker(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="subtitle">Subtitle</label>
            <input id="subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="size">Size</label>
            <select id="size" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              {SIZE_PRESETS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="deco-a">Corner sticker 1</label>
            <select
              id="deco-a"
              value={decorASrc ? "custom" : decorA}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "custom") {
                  decoAFileRef.current?.click();
                  return;
                }
                setDecorASrc("");
                setDecorA(value as OrnamentId);
              }}
            >
              {ORNAMENT_IDS.map((id) => (
                <option key={id} value={id}>
                  {ORNAMENT_LABELS[id]}
                </option>
              ))}
              <option value="custom">Upload image…</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="deco-b">Corner sticker 2</label>
            <select
              id="deco-b"
              value={decorBSrc ? "custom" : decorB}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "custom") {
                  decoBFileRef.current?.click();
                  return;
                }
                setDecorBSrc("");
                setDecorB(value as OrnamentId);
              }}
            >
              {ORNAMENT_IDS.map((id) => (
                <option key={id} value={id}>
                  {ORNAMENT_LABELS[id]}
                </option>
              ))}
              <option value="custom">Upload image…</option>
            </select>
          </div>
          <input
            ref={decoAFileRef}
            className="hidden-file"
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            onChange={(e) => {
              setDecorationFile("a", e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={decoBFileRef}
            className="hidden-file"
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            onChange={(e) => {
              setDecorationFile("b", e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <p className="hint">Move stickers and the title/table in Appearance → Layout / Stickers.</p>
        </div>

        <div className="panel-block">
          <h2 className="panel-label">Table</h2>
          <p className="hint">
            Paste from Sheets. Ranked lists (1, team, rating…) and W/L/D tables both work. Team names match the logo pack.
          </p>
          <div className="row-btns">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setTableText(SAMPLE_TABLE);
                setTitle("Group B");
                setSubtitle("2025 GMC Boys Soccer Tournament");
              }}
            >
              GMC sample
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setTableText(SAMPLE_RANKING_TABLE);
                setTitle("NJ Boys Soccer");
                setSubtitle("Statewide rankings");
              }}
            >
              Top 20 sample
            </button>
          </div>
          <div className="field">
            <label htmlFor="table">Rankings</label>
            <textarea
              id="table"
              value={tableText}
              onChange={(e) => setTableText(e.target.value)}
              spellCheck={false}
            />
          </div>
          {teams.length > 0 && unmatched.length > 0 && (
            <ul className="warn-list">
              {unmatched.map((row) => (
                <li key={`${row.rank}-${row.teamQuery}`}>
                  No logo/color for “{row.teamQuery}”
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div
        className="stage"
        ref={stageRef}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target;
          if (target instanceof HTMLElement && target.closest(".zoom-bar")) return;
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const stage = stageRef.current;
          if (!stage) return;
          stage.scrollLeft -= event.clientX - drag.current.x;
          stage.scrollTop -= event.clientY - drag.current.y;
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
      >
        <div className="zoom-bar">
          <button type="button" onClick={() => bumpZoom(0.9)}>
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => bumpZoom(1.1)}>
            +
          </button>
          <button type="button" onClick={fitToStage}>
            Fit
          </button>
        </div>
        <div
          className="stage-sizer"
          style={{ width: preset.width * zoom, height: preset.height * zoom }}
        >
          <div
            className="stage-frame"
            style={{
              width: preset.width,
              height: preset.height,
              transform: `scale(${zoom})`,
            }}
          >
            <RankingPoster
              title={title}
              subtitle={subtitle}
              kicker={kicker}
              width={preset.width}
              height={preset.height}
              rows={rows}
              tokens={tokens}
              fitRows={fitRows}
              decorA={{ id: decorA, src: decorASrc || undefined }}
              decorB={{ id: decorB, src: decorBSrc || undefined }}
            />
          </div>
        </div>
      </div>

      <div className="inspector-slot">
        <ThemeInspector
          tokens={tokens}
          onChange={(id, value) => setTokens((prev) => ({ ...prev, [id]: value }))}
          onReset={() => setTokens({ ...DEFAULT_TOKENS })}
          fitRows={fitRows}
          onFitRows={setFitRows}
        />
      </div>
    </div>
  );
}
