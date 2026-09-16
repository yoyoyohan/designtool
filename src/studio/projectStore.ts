import type { OrnamentId } from "../templates/ornaments";
import type { PosterHeadLabels } from "../templates/RankingPoster";
import type { TemplateId } from "../templates/catalog";

export type StickerSlot = "a" | "b" | "c" | "d";
export type MediaSlot = "background" | "header" | "watermark" | "footer" | "hero";

/*
  A project is everything the coach typed or chose — the table, the wording, the look. The
  team logo pack is deliberately left out: the sample pack reloads itself on boot, and an
  uploaded pack would blow the browser's storage budget many times over.
*/
export type Project = {
  version: 1;
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
};

export type SaveMeta = {
  id: string;
  name: string;
  savedAt: number;
};

const AUTOSAVE_KEY = "ranking-studio:autosave";
const INDEX_KEY = "ranking-studio:saves";
const SAVE_PREFIX = "ranking-studio:save:";

/*
  Uploaded artwork arrives as data URLs that can run to megabytes, and blob URLs die with the
  page that made them. Either one can push a save past the browser's quota, so drop them and
  keep the pasted rankings, which are the part worth protecting.
*/
const IMAGE_BUDGET = 1_500_000;

function isTransient(value: string): boolean {
  return value.startsWith("blob:");
}

function stripHeavyImages<T extends string>(
  slots: Record<T, string>,
  budget: { left: number },
): { kept: Record<T, string>; dropped: number } {
  const kept = {} as Record<T, string>;
  let dropped = 0;
  for (const key of Object.keys(slots) as T[]) {
    const value = slots[key] ?? "";
    if (!value || isTransient(value)) {
      kept[key] = "";
      if (value) dropped += 1;
      continue;
    }
    if (value.startsWith("data:")) {
      if (value.length > budget.left) {
        kept[key] = "";
        dropped += 1;
        continue;
      }
      budget.left -= value.length;
    }
    kept[key] = value;
  }
  return { kept, dropped };
}

export type Trimmed = {
  project: Project;
  droppedImages: number;
};

export function trimForStorage(project: Project): Trimmed {
  const budget = { left: IMAGE_BUDGET };
  const media = stripHeavyImages(project.media, budget);
  const stickers = stripHeavyImages(project.stickerSrc, budget);
  return {
    project: { ...project, media: media.kept, stickerSrc: stickers.kept },
    droppedImages: media.dropped + stickers.dropped,
  };
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<Project>;
  return typeof p.tableText === "string" && typeof p.templateId === "string" && !!p.tokens;
}

/* Older saves predate some fields, so fill the gaps rather than refuse to open them. */
function normalize(raw: Project): Project {
  return {
    ...raw,
    version: 1,
    heads: raw.heads ?? {},
    ornaments: raw.ornaments ?? { a: "none", b: "none", c: "none", d: "none" },
    stickerSrc: raw.stickerSrc ?? { a: "", b: "", c: "", d: "" },
    media: raw.media ?? { background: "", header: "", watermark: "", footer: "", hero: "" },
  };
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readAutosave(): Project | null {
  const raw = readJson<Project>(AUTOSAVE_KEY);
  return raw && isProject(raw) ? normalize(raw) : null;
}

export function writeAutosave(project: Project): boolean {
  return writeJson(AUTOSAVE_KEY, trimForStorage(project).project);
}

export function clearAutosave(): void {
  try {
    window.localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export function listSaves(): SaveMeta[] {
  const index = readJson<SaveMeta[]>(INDEX_KEY);
  if (!Array.isArray(index)) return [];
  return index.filter((item) => item && typeof item.id === "string").sort((a, b) => b.savedAt - a.savedAt);
}

export function readSave(id: string): Project | null {
  const raw = readJson<Project>(`${SAVE_PREFIX}${id}`);
  return raw && isProject(raw) ? normalize(raw) : null;
}

export type SaveResult = { ok: true; meta: SaveMeta; droppedImages: number } | { ok: false };

export function writeSave(name: string, project: Project): SaveResult {
  const clean = name.trim() || "Untitled rankings";
  const existing = listSaves().find((item) => item.name.toLowerCase() === clean.toLowerCase());
  const meta: SaveMeta = {
    id: existing?.id ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: clean,
    savedAt: Date.now(),
  };
  const trimmed = trimForStorage(project);
  if (!writeJson(`${SAVE_PREFIX}${meta.id}`, trimmed.project)) return { ok: false };
  const index = [meta, ...listSaves().filter((item) => item.id !== meta.id)];
  if (!writeJson(INDEX_KEY, index)) return { ok: false };
  return { ok: true, meta, droppedImages: trimmed.droppedImages };
}

export function deleteSave(id: string): void {
  try {
    window.localStorage.removeItem(`${SAVE_PREFIX}${id}`);
  } catch {
    // Fall through and still drop it from the index.
  }
  writeJson(INDEX_KEY, listSaves().filter((item) => item.id !== id));
}

export function projectFromJson(text: string): Project | null {
  try {
    const raw = JSON.parse(text) as Project;
    return isProject(raw) ? normalize(raw) : null;
  } catch {
    return null;
  }
}

export function downloadProject(project: Project, name: string): void {
  const blob = new Blob([JSON.stringify(trimForStorage(project).project, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rankings"}.json`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function savedAgo(savedAt: number): string {
  const secs = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
