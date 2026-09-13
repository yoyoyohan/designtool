import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { exportPosterPng, filenameFromTitle } from "./engine/exportPng";
import { loadSampleRegistry, loadUploadedRegistry } from "./engine/loadRegistry";
import { decorateRows } from "./engine/matchTeam";
import { parseTable, patchTableCell } from "./engine/parseTable";
import { SIZE_PRESETS } from "./engine/presets";
import type { TableColumnRole, TeamRecord } from "./engine/types";
import { ThemeInspector } from "./inspector/ThemeInspector";
import { SAMPLE_BOYS_LAX, SAMPLE_GIRLS_LAX, SAMPLE_RANKING_TABLE, SAMPLE_TABLE } from "./sampleTable";
import { TEMPLATES, tokensForTemplate, SAMPLE_HERO, type TemplateId } from "./templates/catalog";
import { RankingPoster, type PosterTextField } from "./templates/RankingPoster";
import { RankingGrid } from "./studio/RankingGrid";
import { ElementPop } from "./studio/ElementPop";
import { PostPreview, PREVIEW_FORMATS, formatFromPreset, type PreviewFormat } from "./studio/PostPreview";
import { usePosterDrag } from "./studio/usePosterDrag";
import { ORNAMENT_IDS, ORNAMENT_LABELS, type OrnamentId } from "./templates/ornaments";
import { addFileFont, addGoogleFont, applyExtraFonts, loadExtraFonts, saveExtraFonts, type ExtraFont } from "./theme/extraFonts";
import { DEFAULT_TOKENS } from "./theme/tokenMeta";

const STICKER_SLOTS = ["a", "b", "c", "d"] as const;
type StickerSlot = (typeof STICKER_SLOTS)[number];
type MediaSlot = "background" | "header" | "watermark" | "footer" | "hero";
type PickSlot = MediaSlot | StickerSlot;

const STICKER_LABELS: Record<StickerSlot, string> = {
  a: "Sticker 1",
  b: "Sticker 2",
  c: "Sticker 3",
  d: "Sticker 4",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ImageTile({
  label,
  src,
  onPick,
  onClear,
}: {
  label: string;
  src: string;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div className="image-tile">
      <button type="button" className="image-tile-hit" onClick={onPick}>
        {src ? <img src={src} alt="" /> : <span>Upload</span>}
      </button>
      <div className="image-tile-meta">
        <span>{label}</span>
        {src ? (
          <button type="button" className="link-btn" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PanelFold({
  title,
  closedHint,
  openHint,
  children,
}: {
  title: string;
  closedHint: string;
  openHint: string;
  children: ReactNode;
}) {
  return (
    <details className="panel-fold">
      <summary>
        <span className="fold-copy">
          <span className="fold-title">{title}</span>
          <span className="fold-hint fold-hint-closed">{closedHint}</span>
          <span className="fold-hint fold-hint-open">{openHint}</span>
        </span>
        <span className="fold-plus" aria-hidden />
      </summary>
      {children}
    </details>
  );
}

type HistoryShot = {
  tableText: string;
  kicker: string;
  title: string;
  subtitle: string;
  handle: string;
  presetId: string;
  templateId: TemplateId;
  tokens: Record<string, string>;
  ornaments: Record<StickerSlot, OrnamentId>;
  stickerSrc: Record<StickerSlot, string>;
  media: Record<MediaSlot, string>;
  teams: TeamRecord[];
  assetNote: string;
};

function cloneShot(shot: HistoryShot): HistoryShot {
  return {
    ...shot,
    tokens: { ...shot.tokens },
    ornaments: { ...shot.ornaments },
    stickerSrc: { ...shot.stickerSrc },
    media: { ...shot.media },
    teams: shot.teams.map((team) => ({ ...team, aliases: [...team.aliases] })),
  };
}

export default function App() {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [assetNote, setAssetNote] = useState("Loading sample pack…");
  const [tableText, setTableText] = useState(SAMPLE_TABLE);
  const [kicker, setKicker] = useState("GMC");
  const [title, setTitle] = useState("Group B");
  const [subtitle, setSubtitle] = useState("2025 GMC Boys Soccer Tournament");
  const [handle, setHandle] = useState("@mthssportsbusiness");
  const [presetId, setPresetId] = useState(SIZE_PRESETS[0].id);
  const [templateId, setTemplateId] = useState<TemplateId>("slant");
  const [tokens, setTokens] = useState<Record<string, string>>({ ...DEFAULT_TOKENS });
  const [extraFonts, setExtraFonts] = useState<ExtraFont[]>(() => {
    const fonts = loadExtraFonts();
    applyExtraFonts(fonts);
    return fonts;
  });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [dropHot, setDropHot] = useState(false);
  const [zoom, setZoom] = useState(0.4);
  const [lockFit, setLockFit] = useState(true);
  const [ornaments, setOrnaments] = useState<Record<StickerSlot, OrnamentId>>({
    a: "burst",
    b: "soccer",
    c: "none",
    d: "none",
  });
  const [stickerSrc, setStickerSrc] = useState<Record<StickerSlot, string>>({
    a: "",
    b: "",
    c: "",
    d: "",
  });
  const [media, setMedia] = useState<Record<MediaSlot, string>>({
    background: "",
    header: "",
    watermark: "",
    footer: "",
    hero: "",
  });
  const stageRef = useRef<HTMLDivElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);
  const rowLogoRef = useRef<HTMLInputElement>(null);
  const pendingLogo = useRef<{ teamId: string | null; teamQuery: string } | null>(null);
  const pendingSlot = useRef<PickSlot>("background");
  const objectUrls = useRef<string[]>([]);
  const decoUrls = useRef<string[]>([]);
  const fitScale = useRef(0.4);
  const lockFitRef = useRef(true);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFormat, setPreviewFormat] = useState<PreviewFormat>("feed");
  const zoomRef = useRef(zoom);
  const tokensRef = useRef(tokens);
  zoomRef.current = zoom;
  tokensRef.current = tokens;

  const shotRef = useRef<HistoryShot>({
    tableText,
    kicker,
    title,
    subtitle,
    handle,
    presetId,
    templateId,
    tokens,
    ornaments,
    stickerSrc,
    media,
    teams,
    assetNote,
  });
  shotRef.current = {
    tableText,
    kicker,
    title,
    subtitle,
    handle,
    presetId,
    templateId,
    tokens,
    ornaments,
    stickerSrc,
    media,
    teams,
    assetNote,
  };
  const pastRef = useRef<HistoryShot[]>([]);
  const futureRef = useRef<HistoryShot[]>([]);
  const restoringRef = useRef(false);
  const tokenBatchRef = useRef(false);
  const fieldTouchRef = useRef<string | null>(null);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });

  const remember = useCallback(() => {
    if (restoringRef.current) return;
    pastRef.current.push(cloneShot(shotRef.current));
    if (pastRef.current.length > 40) pastRef.current.shift();
    futureRef.current = [];
    setHist({ undo: pastRef.current.length, redo: 0 });
  }, []);

  const rememberTokens = useCallback(() => {
    if (restoringRef.current || tokenBatchRef.current) return;
    remember();
    tokenBatchRef.current = true;
  }, [remember]);

  const touchField = useCallback(
    (id: string) => {
      if (fieldTouchRef.current === id) return;
      fieldTouchRef.current = id;
      remember();
    },
    [remember],
  );

  const applyShot = useCallback((shot: HistoryShot) => {
    restoringRef.current = true;
    setTableText(shot.tableText);
    setKicker(shot.kicker);
    setTitle(shot.title);
    setSubtitle(shot.subtitle);
    setHandle(shot.handle);
    setPresetId(shot.presetId);
    setTemplateId(shot.templateId);
    setTokens(shot.tokens);
    setOrnaments(shot.ornaments);
    setStickerSrc(shot.stickerSrc);
    setMedia(shot.media);
    setTeams(shot.teams);
    setAssetNote(shot.assetNote);
    queueMicrotask(() => {
      restoringRef.current = false;
    });
  }, []);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(cloneShot(shotRef.current));
    applyShot(prev);
    setHist({ undo: pastRef.current.length, redo: futureRef.current.length });
    setStatus("Undid last edit");
  }, [applyShot]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(cloneShot(shotRef.current));
    applyShot(next);
    setHist({ undo: pastRef.current.length, redo: futureRef.current.length });
    setStatus("Redid last edit");
  }, [applyShot]);

  const patchTokens = useCallback(
    (patch: Record<string, string>) => {
      rememberTokens();
      setTokens((prev) => ({ ...prev, ...patch }));
    },
    [rememberTokens],
  );

  usePosterDrag(stageRef, zoomRef, tokensRef, patchTokens, setPicked, rememberTokens);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (previewOpen) {
        setPreviewOpen(false);
        return;
      }
      setPicked(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen]);

  const preset = SIZE_PRESETS.find((item) => item.id === presetId) ?? SIZE_PRESETS[0];
  const previewFrame = PREVIEW_FORMATS.find((item) => item.id === previewFormat) ?? PREVIEW_FORMATS[0];
  const parsed = useMemo(() => parseTable(tableText), [tableText]);
  const rows = useMemo(() => decorateRows(parsed, teams), [parsed, teams]);
  const unmatched = rows.filter((row) => !row.team);

  useEffect(() => {
    applyExtraFonts(extraFonts);
    saveExtraFonts(extraFonts);
  }, [extraFonts]);

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

  useEffect(() => {
    const endBatch = () => {
      tokenBatchRef.current = false;
    };
    window.addEventListener("pointerup", endBatch);
    window.addEventListener("pointercancel", endBatch);
    return () => {
      window.removeEventListener("pointerup", endBatch);
      window.removeEventListener("pointercancel", endBatch);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      if (event.isComposing) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);

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

  function applyStateSample(kind: "boys" | "girls") {
    remember();
    const accent = kind === "boys" ? "#b7d4f4" : "#e8d4a8";
    if (templateId !== "board") setTemplateId("board");
    setTokens({
      ...tokensForTemplate("board"),
      "--poster-accent": accent,
      "--col-head-fg": accent,
    });
    if (kind === "boys") {
      setTableText(SAMPLE_BOYS_LAX);
      setKicker("FOR GAMES THROUGH 6.18.2026");
      setTitle("STATE TOP 15");
      setSubtitle("BOYS LACROSSE");
    } else {
      setTableText(SAMPLE_GIRLS_LAX);
      setKicker("FOR GAMES THROUGH 6.13.2026");
      setTitle("STATE TOP 15");
      setSubtitle("GIRLS LACROSSE");
    }
  }

  function applyTemplate(id: TemplateId) {
    const def = TEMPLATES.find((item) => item.id === id);
    if (!def || id === templateId) return;
    remember();
    setTemplateId(id);
    setTokens(tokensForTemplate(id));
    if (
      id === "board" &&
      (tableText === SAMPLE_TABLE || tableText === SAMPLE_RANKING_TABLE)
    ) {
      setTableText(SAMPLE_BOYS_LAX);
      setKicker("FOR GAMES THROUGH 6.18.2026");
      setTitle("STATE TOP 15");
      setSubtitle("BOYS LACROSSE");
    }
    setOrnaments((prev) => {
      const next = { ...prev };
      for (const slot of STICKER_SLOTS) {
        if (!stickerSrc[slot]) next[slot] = def.ornaments[slot];
      }
      return next;
    });
    setMedia((prev) => {
      const customHero = prev.hero && !prev.hero.startsWith("/sample/");
      if (def.hero) {
        return { ...prev, hero: customHero ? prev.hero : def.hero };
      }
      if (prev.hero.startsWith("/sample/")) {
        return { ...prev, hero: "" };
      }
      return prev;
    });
  }

  function pickFile(slot: PickSlot) {
    pendingSlot.current = slot;
    mediaFileRef.current?.click();
  }

  function pickRowLogo(teamId: string | null, teamQuery: string) {
    pendingLogo.current = { teamId, teamQuery };
    rowLogoRef.current?.click();
  }

  function applyRowLogo(file: File | undefined) {
    const hit = pendingLogo.current;
    pendingLogo.current = null;
    if (!file || !hit) return;
    remember();
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    setTeams((prev) => {
      if (hit.teamId && prev.some((team) => team.id === hit.teamId)) {
        return prev.map((team) =>
          team.id === hit.teamId ? { ...team, logoUrl: url, logoFile: file.name } : team,
        );
      }
      const slug = hit.teamQuery.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";
      return [
        ...prev,
        {
          id: `custom-${Date.now()}-${slug}`,
          name: hit.teamQuery,
          aliases: [],
          primary: "#444444",
          secondary: "#f3ead8",
          logoUrl: url,
          logoFile: file.name,
          source: "upload" as const,
        },
      ];
    });
    setAssetNote(`Logo updated · ${hit.teamQuery}`);
    setStatus(`Logo set · ${hit.teamQuery}`);
  }

  function onMediaFile(file: File | undefined) {
    if (!file) return;
    remember();
    const url = URL.createObjectURL(file);
    decoUrls.current.push(url);
    const slot = pendingSlot.current;
    if (slot === "a" || slot === "b" || slot === "c" || slot === "d") {
      setStickerSrc((prev) => ({ ...prev, [slot]: url }));
      return;
    }
    setMedia((prev) => ({ ...prev, [slot]: url }));
  }

  async function applyFiles(fileList: FileList | File[]) {
    remember();
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
      const result = await exportPosterPng(node, filenameFromTitle(title), 2);
      setStatus(result === "cancelled" ? "" : "PNG saved");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={[
        "studio",
        leftOpen ? "" : "is-left-closed",
        rightOpen ? "" : "is-right-closed",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="topbar">
        <div className="brand">
          Ranking <span>Studio</span>
        </div>
        <div className={status.toLowerCase().includes("fail") ? "topbar-status is-error" : "topbar-status"}>
          {status || "Click the poster to edit titles and names"}
        </div>
        <label className="size-field">
          <span>Size</span>
          <select
            id="size"
            value={presetId}
            onChange={(e) => {
              remember();
              setPresetId(e.target.value);
            }}
          >
            {SIZE_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="hist-btns">
          <button type="button" className="undo-btn" onClick={undo} disabled={hist.undo === 0} title="Undo (⌘Z)">
            Undo
          </button>
          <button type="button" className="undo-btn" onClick={redo} disabled={hist.redo === 0} title="Redo (⇧⌘Z)">
            Redo
          </button>
        </div>
        <button
          type="button"
          className="preview-btn"
          onClick={() => {
            setPreviewFormat(formatFromPreset(presetId));
            setPreviewOpen(true);
          }}
        >
          Preview post
        </button>
        <button type="button" className="export-btn" onClick={onExport} disabled={busy || rows.length === 0}>
          Export PNG
        </button>
      </header>

      <aside className="sidebar">
        <div className="sheet-head">
          <h2 className="panel-label">Setup</h2>
          <button type="button" className="sheet-toggle" onClick={() => setLeftOpen(false)} aria-label="Hide setup panel">
            Hide
          </button>
        </div>
        <div className="panel-block">
          <h2 className="panel-label">Look</h2>
          <div className="template-pills">
            {TEMPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === templateId ? "template-pill is-on" : "template-pill"}
                title={item.blurb}
                onClick={() => applyTemplate(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>

        <div className="panel-block">
          <h2 className="panel-label">Rankings</h2>
          <div
            className="field"
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              if (fieldTouchRef.current === "table") fieldTouchRef.current = null;
            }}
          >
            <RankingGrid
              value={tableText}
              onChange={(text) => {
                touchField("table");
                setTableText(text);
              }}
              onStructureChange={(text) => {
                remember();
                fieldTouchRef.current = null;
                setTableText(text);
              }}
              extras={
                <>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      remember();
                      setTableText(SAMPLE_TABLE);
                      setKicker("GMC");
                      setTitle("Group B");
                      setSubtitle("2025 GMC Boys Soccer Tournament");
                    }}
                  >
                    GMC sample
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      remember();
                      setTableText(SAMPLE_RANKING_TABLE);
                      setKicker("");
                      setTitle("NJ Boys Soccer");
                      setSubtitle("Statewide rankings");
                    }}
                  >
                    Top 20
                  </button>
                  <button type="button" className="link-btn" onClick={() => applyStateSample("boys")}>
                    Boys Top 15
                  </button>
                  <button type="button" className="link-btn" onClick={() => applyStateSample("girls")}>
                    Girls Top 15
                  </button>
                </>
              }
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

        <div className="panel-block photo-block">
          <h2 className="panel-label">Photo</h2>
          <ImageTile
            label="Featured photo"
            src={media.hero}
            onPick={() => pickFile("hero")}
            onClear={() => {
              remember();
              setMedia((prev) => ({ ...prev, hero: "" }));
            }}
          />
          <div className="row-btns">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                remember();
                setMedia((prev) => ({ ...prev, hero: SAMPLE_HERO }));
              }}
            >
              Sample photo
            </button>
          </div>
        </div>

        <PanelFold
          title="Team pack"
          closedHint="Logos, extra images, and stickers"
          openHint="Drop logos, or pick extra images and stickers"
        >
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
            Drop team logos here. Names come from the file names.
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
                remember();
                objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
                objectUrls.current = [];
                void loadSampleRegistry().then((pack) => {
                  setTeams(pack);
                  setAssetNote(`Sample pack · ${pack.length} teams`);
                });
              }}
            >
              Use sample logos
            </button>
          </div>
          <input
            ref={folderRef}
            className="hidden-file"
            type="file"
            multiple
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
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
            {teams.slice(0, 12).map((team) =>
              team.logoUrl ? (
                <img key={team.id} src={team.logoUrl} alt={team.name} title={team.name} />
              ) : (
                <span key={team.id} className="logo-fallback" title={team.name}>
                  {team.name.charAt(0)}
                </span>
              ),
            )}
          </div>
          <div className="image-grid">
            <ImageTile
              label="Background"
              src={media.background}
              onPick={() => pickFile("background")}
              onClear={() => {
                remember();
                setMedia((prev) => ({ ...prev, background: "" }));
              }}
            />
            <ImageTile
              label="Header mark"
              src={media.header}
              onPick={() => pickFile("header")}
              onClear={() => {
                remember();
                setMedia((prev) => ({ ...prev, header: "" }));
              }}
            />
            <ImageTile
              label="Watermark"
              src={media.watermark}
              onPick={() => pickFile("watermark")}
              onClear={() => {
                remember();
                setMedia((prev) => ({ ...prev, watermark: "" }));
              }}
            />
            <ImageTile
              label="Footer badge"
              src={media.footer}
              onPick={() => pickFile("footer")}
              onClear={() => {
                remember();
                setMedia((prev) => ({ ...prev, footer: "" }));
              }}
            />
          </div>
          {STICKER_SLOTS.map((slot) => (
            <div className="field" key={slot}>
              <label htmlFor={`deco-${slot}`}>{STICKER_LABELS[slot]}</label>
              <div className="sticker-row">
                <select
                  id={`deco-${slot}`}
                  value={stickerSrc[slot] ? "custom" : ornaments[slot]}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "custom") {
                      pickFile(slot);
                      return;
                    }
                    remember();
                    setStickerSrc((prev) => ({ ...prev, [slot]: "" }));
                    setOrnaments((prev) => ({ ...prev, [slot]: value as OrnamentId }));
                  }}
                >
                  {ORNAMENT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {ORNAMENT_LABELS[id]}
                    </option>
                  ))}
                  <option value="custom">Upload image…</option>
                </select>
                {stickerSrc[slot] ? (
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      remember();
                      setStickerSrc((prev) => ({ ...prev, [slot]: "" }));
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </PanelFold>
        <input
          ref={mediaFileRef}
          className="hidden-file"
          type="file"
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          onChange={(e) => {
            onMediaFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={rowLogoRef}
          className="hidden-file"
          type="file"
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          onChange={(e) => {
            applyRowLogo(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </aside>

      <div
        className="stage"
        ref={stageRef}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target;
          if (
            target instanceof HTMLElement &&
            target.closest(".zoom-bar, .element-pop, .sheet-tab, [data-drag], [data-resize], [data-text], [data-cell]")
          ) {
            return;
          }
          setPicked(null);
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
        {!leftOpen ? (
          <button type="button" className="sheet-tab is-left" onClick={() => setLeftOpen(true)}>
            Setup
          </button>
        ) : null}
        {!rightOpen ? (
          <button type="button" className="sheet-tab is-right" onClick={() => setRightOpen(true)}>
            Look
          </button>
        ) : null}
        {picked ? (
          <ElementPop
            part={picked}
            tokens={tokens}
            stageRef={stageRef}
            onChange={(id, value) => {
              rememberTokens();
              setTokens((prev) => ({ ...prev, [id]: value }));
            }}
            onPatch={patchTokens}
            onClose={() => setPicked(null)}
            onReplace={
              picked === "hero"
                ? () => pickFile("hero")
                : picked.startsWith("deco-")
                  ? () => pickFile(picked.slice(-1) as StickerSlot)
                  : undefined
            }
          />
        ) : null}
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
              handle={handle}
              width={preset.width}
              height={preset.height}
              rows={rows}
              tokens={tokens}
              templateId={templateId}
              live
              selected={picked}
              onText={(field: PosterTextField, value: string) => {
                const current =
                  field === "title" ? title : field === "subtitle" ? subtitle : field === "kicker" ? kicker : handle;
                if (value === current) return;
                remember();
                if (field === "title") setTitle(value);
                if (field === "subtitle") setSubtitle(value);
                if (field === "kicker") setKicker(value);
                if (field === "handle") setHandle(value);
              }}
              onRowEdit={(rowIndex: number, field: TableColumnRole, value: string) => {
                const next = patchTableCell(tableText, rowIndex, field, value);
                if (next === tableText) return;
                remember();
                setTableText(next);
              }}
              onLogoPick={pickRowLogo}
              media={{
                background: media.background || undefined,
                header: media.header || undefined,
                watermark: media.watermark || undefined,
                footer: media.footer || undefined,
                hero: media.hero || undefined,
              }}
              decorA={{ id: ornaments.a, src: stickerSrc.a || undefined }}
              decorB={{ id: ornaments.b, src: stickerSrc.b || undefined }}
              decorC={{ id: ornaments.c, src: stickerSrc.c || undefined }}
              decorD={{ id: ornaments.d, src: stickerSrc.d || undefined }}
            />
          </div>
        </div>
      </div>

      <div className="inspector-slot">
        <ThemeInspector
          tokens={tokens}
          extraFonts={extraFonts}
          onChange={(id, value) => {
            rememberTokens();
            setTokens((prev) => ({ ...prev, [id]: value }));
          }}
          onReset={() => {
            remember();
            setTokens(tokensForTemplate(templateId));
          }}
          onAddGoogleFont={async (family) => {
            const font = await addGoogleFont(family, extraFonts);
            setExtraFonts((prev) => (prev.some((item) => item.id === font.id) ? prev : [...prev, font]));
          }}
          onUploadFont={async (file) => {
            const font = await addFileFont(file, extraFonts);
            setExtraFonts((prev) => [...prev, font]);
          }}
          onHide={() => setRightOpen(false)}
        />
      </div>
      {previewOpen ? (
        <PostPreview
          handle={handle}
          title={title}
          format={previewFormat}
          onFormat={setPreviewFormat}
          onClose={() => setPreviewOpen(false)}
        >
          <RankingPoster
            title={title}
            subtitle={subtitle}
            kicker={kicker}
            handle={handle}
            width={previewFrame.width}
            height={previewFrame.height}
            rows={rows}
            tokens={tokens}
            templateId={templateId}
            artboardId="preview-artboard"
            media={{
              background: media.background || undefined,
              header: media.header || undefined,
              watermark: media.watermark || undefined,
              footer: media.footer || undefined,
              hero: media.hero || undefined,
            }}
            decorA={{ id: ornaments.a, src: stickerSrc.a || undefined }}
            decorB={{ id: ornaments.b, src: stickerSrc.b || undefined }}
            decorC={{ id: ornaments.c, src: stickerSrc.c || undefined }}
            decorD={{ id: ornaments.d, src: stickerSrc.d || undefined }}
          />
        </PostPreview>
      ) : null}
    </div>
  );
}
