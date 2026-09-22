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
import {
  HEAD_DEFAULTS,
  RankingPoster,
  visibleHeadFields,
  type PosterHeadField,
  type PosterHeadLabels,
  type PosterTextField,
} from "./templates/RankingPoster";
import { RankingGrid } from "./studio/RankingGrid";
import { LogoDatabase, type LogoEntry } from "./studio/LogoDatabase";
import {
  addLogo,
  aliasesAfterRename,
  applyLogoLibrary,
  blobFromUrl,
  deleteLogo,
  loadLogoLibrary,
  normalizeLogoName,
  parseTagList,
  titleFromFile,
  updateLogo,
  type LogoView,
} from "./studio/logoStore";
import { DeskAuthError, deskBuildNote, setDeskKey, type DeskMode } from "./studio/logoApi";
import { ElementPop } from "./studio/ElementPop";
import { PostPreview, PREVIEW_FORMATS, formatFromPreset, type PreviewFormat } from "./studio/PostPreview";
import { usePosterDrag } from "./studio/usePosterDrag";
import {
  deleteSave,
  downloadProject,
  listSaves,
  projectFromJson,
  readAutosave,
  readSave,
  savedAgo,
  writeAutosave,
  writeSave,
  type Project,
  type SaveMeta,
} from "./studio/projectStore";
import { ORNAMENT_IDS, ORNAMENT_LABELS, type OrnamentId } from "./templates/ornaments";
import { addFileFont, addGoogleFont, applyExtraFonts, loadExtraFonts, saveExtraFonts, type ExtraFont } from "./theme/extraFonts";
import { graphicBarFor } from "./theme/graphicBars";
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

const HEAD_FIELD_COPY: Record<PosterHeadField, string> = {
  rank: "Rank",
  team: "Team",
  rating: "Rating",
  off: "Off",
  def: "Def",
  w: "W",
  l: "L",
  d: "D",
  pts: "Pts",
  gf: "GF",
  ga: "GA",
  gd: "GD",
  move: "+/-",
  games: "GP",
};

type HistoryShot = {
  tableText: string;
  kicker: string;
  title: string;
  subtitle: string;
  handle: string;
  heads: PosterHeadLabels;
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
    heads: { ...shot.heads },
    tokens: { ...shot.tokens },
    ornaments: { ...shot.ornaments },
    stickerSrc: { ...shot.stickerSrc },
    media: { ...shot.media },
    teams: shot.teams.map((team) => ({ ...team, aliases: [...team.aliases] })),
  };
}

export default function App() {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [logoViews, setLogoViews] = useState<LogoView[]>([]);
  const [logoMode, setLogoMode] = useState<DeskMode>("local");
  const [logoDeskNote, setLogoDeskNote] = useState("");
  const revokeLogos = useRef<(() => void) | null>(null);
  const logoOverrides = useRef<Record<string, string>>({});
  const [assetNote, setAssetNote] = useState("Loading sample pack…");
  const [tableText, setTableText] = useState(SAMPLE_TABLE);
  const [kicker, setKicker] = useState("GMC");
  const [title, setTitle] = useState("Group B");
  const [subtitle, setSubtitle] = useState("2025 GMC Boys Soccer Tournament");
  const [handle, setHandle] = useState("@mthssportsbusiness");
  const [heads, setHeads] = useState<PosterHeadLabels>({});
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
  const [logoDeskOpen, setLogoDeskOpen] = useState(false);
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
    heads,
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
    heads,
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
    setHeads(shot.heads);
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

  const project: Project = {
    version: 1,
    tableText,
    kicker,
    title,
    subtitle,
    handle,
    heads,
    presetId,
    templateId,
    tokens,
    ornaments,
    stickerSrc,
    media,
  };
  const projectRef = useRef(project);
  projectRef.current = project;

  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [saveName, setSaveName] = useState("");
  const [autosavedAt, setAutosavedAt] = useState<number | null>(null);
  const restoredRef = useRef(false);
  const projectFileRef = useRef<HTMLInputElement>(null);

  const applyProject = useCallback((next: Project) => {
    restoringRef.current = true;
    setTableText(next.tableText);
    setKicker(next.kicker);
    setTitle(next.title);
    setSubtitle(next.subtitle);
    setHandle(next.handle);
    setHeads(next.heads);
    setPresetId(next.presetId);
    setTemplateId(next.templateId);
    setTokens(next.tokens);
    setOrnaments(next.ornaments);
    setStickerSrc(next.stickerSrc);
    setMedia(next.media);
    queueMicrotask(() => {
      restoringRef.current = false;
    });
  }, []);

  // Pick up where the last visit left off, so closing the tab is never destructive.
  useEffect(() => {
    const saved = readAutosave();
    if (saved) {
      applyProject(saved);
      setStatus("Picked up where you left off");
    }
    restoredRef.current = true;
    setSaves(listSaves());
  }, [applyProject]);

  // Autosave trails the edits rather than firing on every keystroke.
  useEffect(() => {
    if (!restoredRef.current) return;
    const timer = window.setTimeout(() => {
      if (writeAutosave(projectRef.current)) setAutosavedAt(Date.now());
    }, 900);
    return () => window.clearTimeout(timer);
  }, [tableText, kicker, title, subtitle, handle, heads, presetId, templateId, tokens, ornaments, stickerSrc, media]);

  const onSaveRankings = useCallback(() => {
    const name = saveName.trim() || title.trim() || "Untitled rankings";
    const result = writeSave(name, projectRef.current);
    if (!result.ok) {
      setStatus("Could not save — the browser is out of storage room");
      return;
    }
    setSaves(listSaves());
    setSaveName("");
    setStatus(
      result.droppedImages > 0
        ? `Saved "${name}" — uploaded photos were too large to keep`
        : `Saved "${name}"`,
    );
  }, [saveName, title]);

  const onOpenSave = useCallback(
    (meta: SaveMeta) => {
      const found = readSave(meta.id);
      if (!found) {
        setStatus("That save could not be opened");
        return;
      }
      remember();
      applyProject(found);
      setSaveName(meta.name);
      setStatus(`Opened "${meta.name}"`);
    },
    [applyProject, remember],
  );

  const onDeleteSave = useCallback((meta: SaveMeta) => {
    deleteSave(meta.id);
    setSaves(listSaves());
    setStatus(`Deleted "${meta.name}"`);
  }, []);

  const onImportProject = useCallback(
    async (file: File) => {
      const found = projectFromJson(await file.text());
      if (!found) {
        setStatus("That file is not a Ranking Studio save");
        return;
      }
      remember();
      applyProject(found);
      setStatus(`Loaded ${file.name}`);
    },
    [applyProject, remember],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (previewOpen) {
        setPreviewOpen(false);
        return;
      }
      if (logoDeskOpen) {
        setLogoDeskOpen(false);
        return;
      }
      setPicked(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen, logoDeskOpen]);

  const preset = SIZE_PRESETS.find((item) => item.id === presetId) ?? SIZE_PRESETS[0];
  const previewFrame = PREVIEW_FORMATS.find((item) => item.id === previewFormat) ?? PREVIEW_FORMATS[0];
  const parsed = useMemo(() => parseTable(tableText), [tableText]);
  const matchedTeams = useMemo(() => applyLogoLibrary(teams, logoViews), [teams, logoViews]);
  const rows = useMemo(() => decorateRows(parsed, matchedTeams), [parsed, matchedTeams]);
  const usedLogoNames = useMemo(() => rows.map((row) => row.teamQuery), [rows]);
  const unmatched = rows.filter((row) => !row.team && !graphicBarFor(row.teamQuery));
  const headFields = useMemo(() => visibleHeadFields(rows), [rows]);

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
    loadLogoLibrary()
      .then((loaded) => {
        if (cancelled) {
          loaded.revoke();
          return;
        }
        revokeLogos.current?.();
        revokeLogos.current = loaded.revoke;
        setLogoViews(withOverrides(loaded.views));
        setLogoMode(loaded.mode);
        setLogoDeskNote(loaded.note || (loaded.mode === "local" ? deskBuildNote() : ""));
      })
      .catch(() => {
        if (!cancelled) setAssetNote("Logo library could not open in this browser");
      });
    return () => {
      cancelled = true;
      revokeLogos.current?.();
    };
  }, []);

  function withOverrides(views: LogoView[]) {
    const extras = Object.entries(logoOverrides.current)
      .filter(([key]) => !views.some((view) => normalizeLogoName(view.name) === key))
      .map(([key, url]) => ({
        id: `preview-${key}`,
        name: key,
        aliases: [],
        tags: [],
        uploadedAt: Date.now(),
        updatedAt: Date.now(),
        url,
      }));
    return [
      ...views.map((view) => {
        const hit = logoOverrides.current[normalizeLogoName(view.name)];
        return hit ? { ...view, url: hit } : view;
      }),
      ...extras,
    ];
  }

  function paintLogoNow(name: string, aliases: string[], image: Blob, id?: string) {
    const url = URL.createObjectURL(image);
    logoOverrides.current[normalizeLogoName(name)] = url;
    aliases.forEach((alias) => {
      logoOverrides.current[normalizeLogoName(alias)] = url;
    });
    setLogoViews((prev) => {
      const keys = new Set([name, ...aliases].map(normalizeLogoName));
      const row: LogoView = {
        id: id || `preview-${Date.now()}`,
        name,
        aliases,
        tags: [],
        uploadedAt: Date.now(),
        updatedAt: Date.now(),
        url,
      };
      const idx = prev.findIndex(
        (item) => item.id === id || keys.has(normalizeLogoName(item.name)) || item.aliases.some((alias) => keys.has(normalizeLogoName(alias))),
      );
      if (idx < 0) return [row, ...prev];
      const next = prev.slice();
      next[idx] = { ...prev[idx], ...row, id: id || prev[idx].id, tags: prev[idx].tags };
      return next;
    });
  }

  async function refreshLogos() {
    const loaded = await loadLogoLibrary();
    revokeLogos.current?.();
    revokeLogos.current = loaded.revoke;
    setLogoViews(withOverrides(loaded.views));
    setLogoMode(loaded.mode);
    setLogoDeskNote(loaded.note || (loaded.mode === "local" ? deskBuildNote() : ""));
    return loaded.mode;
  }

  async function ingestLibrary(fileList: FileList | File[], tag = "") {
    const files = Array.from(fileList).filter((file) => /\.(svg|png|jpe?g|webp)$/i.test(file.name));
    if (files.length === 0) return;
    try {
      for (const file of files) {
        const name = titleFromFile(file);
        paintLogoNow(name, [], file);
        await addLogo({
          name,
          image: file,
          tags: tag ? [tag] : [],
        });
      }
      const mode = await refreshLogos();
      setAssetNote(`Library · ${files.length} added`);
      setStatus(shareStatus(`Saved ${files.length} crest${files.length === 1 ? "" : "s"}`, mode));
    } catch (err) {
      reportLogoError(err);
    }
  }

  function shareStatus(message: string, mode = logoMode) {
    if (mode === "local") return `${message} · this computer only`;
    if (mode === "locked") return `${message} · enter the desk key to share`;
    return `${message} · saved for everyone`;
  }

  function reportLogoError(err: unknown) {
    setStatus(err instanceof DeskAuthError ? err.message : err instanceof Error ? err.message : "Logo save failed");
  }

  async function upsertLogoEntry(
    entry: LogoEntry,
    patch: { name?: string; aliases?: string[]; tags?: string[]; image?: Blob },
  ) {
    const name = patch.name ?? entry.name;
    const aliases = aliasesAfterRename(entry.name, name, patch.aliases ?? entry.aliases);
    const next = { ...patch, name, aliases };
    if (next.image) paintLogoNow(name, aliases, next.image, entry.libraryId ?? undefined);
    try {
      if (entry.libraryId) {
        await updateLogo(entry.libraryId, next);
      } else {
        const image = next.image ?? (entry.url ? await blobFromUrl(entry.url) : null);
        if (!image) return;
        await addLogo({
          name,
          aliases,
          tags: (next.tags ?? entry.tags).filter((tag) => tag !== "Sample" && tag !== "Upload"),
          image,
        });
      }
      const mode = await refreshLogos();
      setStatus(shareStatus(`Updated ${name}`, mode));
    } catch (err) {
      reportLogoError(err);
    }
  }

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
    const accent = kind === "boys" ? "#b4caef" : "#e6d09a";
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
    const name = hit.teamQuery.trim() || titleFromFile(file);
    paintLogoNow(name, [hit.teamQuery], file);
    const existing = logoViews.find(
      (logo) => logo.name.toLowerCase() === hit.teamQuery.trim().toLowerCase(),
    );
    void (existing
      ? updateLogo(existing.id, { image: file })
      : addLogo({
          name: hit.teamQuery.trim() || titleFromFile(file),
          image: file,
          aliases: hit.teamQuery ? [hit.teamQuery] : [],
          tags: [templateId === "movers" ? "Movers" : "State"],
        })
    )
      .then(() => refreshLogos())
      .then((mode) => {
        setAssetNote(`Logo updated · ${hit.teamQuery}`);
        setStatus(shareStatus(`Logo saved · ${hit.teamQuery}`, mode));
      })
      .catch(reportLogoError);
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
    const files = Array.from(fileList);
    const hasCsv = files.some((file) => file.name.toLowerCase().endsWith(".csv"));
    if (hasCsv) {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      const pack = await loadUploadedRegistry(files);
      objectUrls.current = pack.map((team) => team.logoUrl).filter((url) => url.startsWith("blob:"));
      setTeams(pack);
    }
    await ingestLibrary(files);
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
        <div className={status.toLowerCase().includes("fail") || status.toLowerCase().includes("could not") ? "topbar-status is-error" : "topbar-status"}>
          {status || "Paste rankings, click the poster to edit, then Save or Export PNG"}
        </div>
        <div className="save-flag" title="Your work is kept in this browser automatically">
          {autosavedAt ? `Kept ${savedAgo(autosavedAt)}` : "Keeping your work"}
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
        <button type="button" className="preview-btn" onClick={() => setLogoDeskOpen(true)}>
          Logos{logoViews.length ? ` · ${logoViews.length}` : ""}
        </button>
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
          {busy ? "Exporting…" : "Export PNG"}
        </button>
      </header>

      <aside className="sidebar">
        <div className="sheet-head">
          <h2 className="panel-label">Setup</h2>
          <button type="button" className="sheet-toggle" onClick={() => setLeftOpen(false)} aria-label="Hide setup panel">
            Hide
          </button>
        </div>
        <ol className="coach-steps">
          <li>Paste rankings</li>
          <li>Pick a look</li>
          <li>Click the poster to edit</li>
          <li>Fix crests in Logos</li>
          <li>Save or export</li>
        </ol>
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
          <p className="panel-hint">Paste from Sheets, or start from a sample. Missing Off or Def columns stay hidden.</p>
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

        <div className="panel-block">
          <h2 className="panel-label">Logo library</h2>
          <p className="panel-hint">
            {logoMode === "shared"
              ? "Shared desk. A replace here shows up for every sports business computer."
              : logoMode === "locked"
                ? "Look only. Type the sports business key and the crop tools appear."
                : "This computer only until Supabase keys are on the Render build."}
          </p>
          <LogoDatabase
            logos={logoViews}
            teams={teams}
            usedNames={usedLogoNames}
            note={
              logoViews.length
                ? `${assetNote} · ${logoViews.length} saved`
                : assetNote
            }
            shareMode={logoMode}
            shareNote={logoDeskNote}
            deskOpen={logoDeskOpen}
            onDeskOpen={() => setLogoDeskOpen(true)}
            onDeskClose={() => setLogoDeskOpen(false)}
            onUnlock={(key) => {
              void setDeskKey(key)
                .then(() => refreshLogos())
                .then((mode) => {
                  setStatus(mode === "locked" ? "That key did not match" : "Desk unlocked · edits save for everyone");
                })
                .catch((err) => {
                  setStatus(err instanceof Error ? err.message : "That key did not match");
                });
            }}
            onUpload={(files) => void ingestLibrary(files)}
            onSaveMeta={(entry, name, aliases, tags) => {
              void upsertLogoEntry(entry, {
                name,
                aliases: parseTagList(aliases),
                tags: parseTagList(tags),
              });
            }}
            onReplace={(entry, file) => {
              void upsertLogoEntry(entry, { image: file });
            }}
            onCrop={(entry, blob) => {
              void upsertLogoEntry(entry, { image: blob });
            }}
            onDelete={(entry) => {
              if (!entry.libraryId) return;
              void deleteLogo(entry.libraryId)
                .then(() => refreshLogos())
                .then((mode) => setStatus(shareStatus(`Deleted ${entry.name}`, mode)))
                .catch(reportLogoError);
            }}
          />
          <div className="row-btns">
            {logoMode === "locked" ? null : (
              <>
            <button type="button" className="ghost-btn" onClick={() => folderRef.current?.click()}>
              Upload folder
            </button>
            <button type="button" className="ghost-btn" onClick={() => filesRef.current?.click()}>
              Upload files
            </button>
              </>
            )}
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
        </div>

        <div className="panel-block">
          <h2 className="panel-label">Words on the poster</h2>
          <p className="panel-hint">Click the poster to type, or edit here. Column labels follow whatever you pasted.</p>
          <div className="word-fields">
            <label>
              Sport line
              <input
                value={subtitle}
                onChange={(event) => {
                  touchField("subtitle");
                  setSubtitle(event.target.value);
                }}
                placeholder="Boys lacrosse"
              />
            </label>
            <label>
              Title
              <input
                value={title}
                onChange={(event) => {
                  touchField("title");
                  setTitle(event.target.value);
                }}
                placeholder="State Top 15"
              />
            </label>
            <label>
              Date line
              <input
                value={kicker}
                onChange={(event) => {
                  touchField("kicker");
                  setKicker(event.target.value);
                }}
                placeholder="For games through…"
              />
            </label>
            <label>
              Handle
              <input
                value={handle}
                onChange={(event) => {
                  touchField("handle");
                  setHandle(event.target.value);
                }}
                placeholder="@yourhandle"
              />
            </label>
          </div>
          {headFields.length > 0 ? (
            <div className="head-fields">
              <p className="head-fields-label">Table labels</p>
              <div className="head-fields-grid">
                {headFields.map((field) => (
                  <label key={field}>
                    {HEAD_FIELD_COPY[field]}
                    <input
                      value={heads[field] ?? HEAD_DEFAULTS[field]}
                      onChange={(event) => {
                        touchField(`head-${field}`);
                        setHeads((prev) => ({ ...prev, [field]: event.target.value }));
                      }}
                      placeholder={HEAD_DEFAULTS[field]}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="panel-block">
          <h2 className="panel-label">Keep this week</h2>
          <p className="panel-hint">
            This browser keeps your last edit automatically. Name a week to open it again later, or download a file to take home.
          </p>
          <div className="save-row">
            <input
              type="text"
              className="save-name"
              value={saveName}
              placeholder={title.trim() || "Week 4 rankings"}
              onChange={(event) => setSaveName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                onSaveRankings();
              }}
            />
            <button type="button" className="save-btn" onClick={onSaveRankings}>
              Save
            </button>
          </div>
          {saves.length > 0 ? (
            <ul className="save-list">
              {saves.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="save-open"
                    onClick={() => onOpenSave(item)}
                    title={`Open "${item.name}"`}
                  >
                    <span className="save-open-name">{item.name}</span>
                    <span className="save-open-when">{savedAgo(item.savedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="save-delete"
                    onClick={() => onDeleteSave(item)}
                    aria-label={`Delete ${item.name}`}
                    title={`Delete "${item.name}"`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="save-extras">
            <button
              type="button"
              className="link-btn"
              onClick={() => downloadProject(projectRef.current, saveName || title)}
            >
              Download a copy
            </button>
            <button type="button" className="link-btn" onClick={() => projectFileRef.current?.click()}>
              Open a file
            </button>
          </div>
          <input
            ref={projectFileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onImportProject(file);
            }}
          />
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
          title="Extra images"
          closedHint="Background, watermarks, and stickers"
          openHint="These sit behind or around the board, not on the team bars"
        >
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
              headLabels={heads}
              onHead={(field: PosterHeadField, value: string) => {
                if ((heads[field] ?? HEAD_DEFAULTS[field]) === value) return;
                remember();
                setHeads((prev) => ({ ...prev, [field]: value }));
              }}
              onRowEdit={(rowIndex: number, field: TableColumnRole, value: string) => {
                const next = patchTableCell(tableText, rowIndex, field, value);
                if (next === tableText) return;
                remember();
                setTableText(next);
              }}
              onLogoPick={logoMode === "locked" ? undefined : pickRowLogo}
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
            headLabels={heads}
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
