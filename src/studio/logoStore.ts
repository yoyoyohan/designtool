import type { TeamRecord } from "../engine/types";
import {
  deleteSharedLogo,
  fetchDeskStatus,
  fetchSharedViews,
  patchSharedLogo,
  postSharedLogo,
  pushLocalIfMissing,
  revertSharedLogo,
  type DeskMode,
  type LogoHistory,
} from "./logoApi";

const DB_NAME = "ranking-studio-logos";
const STORE = "logos";
const DB_VERSION = 1;

export type LogoRecord = {
  id: string;
  name: string;
  aliases: string[];
  tags: string[];
  image: Blob;
  original?: Blob;
  previous?: Blob;
  uploadedAt: number;
  updatedAt: number;
};

export type LogoView = Omit<LogoRecord, "image" | "original" | "previous"> & {
  url: string;
  hasOriginal?: boolean;
  hasPrevious?: boolean;
};

export function normalizeLogoName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Three-letter codes like SHS collide across dozens of schools. Do not treat them as names. */
export function isSchoolCode(value: string): boolean {
  const key = normalizeLogoName(value);
  return Boolean(key) && key.length <= 4 && !key.includes(" ");
}

/** "Summit" hits "Summit" and "Summit High School", but not "Westfield". */
export function schoolNameHits(a: string, b: string): boolean {
  const left = normalizeLogoName(a);
  const right = normalizeLogoName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  if (isSchoolCode(short) && short !== long) return false;
  return ` ${long} `.includes(` ${short} `);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the logo library"));
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = work(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Logo library request failed"));
        tx.oncomplete = () => db.close();
      }),
  );
}

function newId(): string {
  return `logo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listLogos(): Promise<LogoRecord[]> {
  const rows = await run("readonly", (store) => store.getAll());
  return (rows ?? []).filter((row) => row && typeof row.id === "string" && row.image instanceof Blob);
}

export async function getLogo(id: string): Promise<LogoRecord | null> {
  const row = await run("readonly", (store) => store.get(id));
  return row && row.image instanceof Blob ? row : null;
}

export async function addLogo(input: {
  name: string;
  image: Blob;
  original?: Blob;
  aliases?: string[];
  tags?: string[];
}): Promise<LogoRecord> {
  const now = Date.now();
  const record: LogoRecord = {
    id: newId(),
    name: input.name.trim() || "Untitled crest",
    aliases: input.aliases ?? [],
    tags: input.tags ?? [],
    image: input.image,
    original: input.original ?? input.image,
    uploadedAt: now,
    updatedAt: now,
  };
  await run("readwrite", (store) => store.put(record));
  try {
    const shared = await postSharedLogo({ ...record, original: record.original });
    return { ...record, id: shared.id, name: shared.name, aliases: shared.aliases, tags: shared.tags };
  } catch (err) {
    if ((await fetchDeskStatus()).available) throw err;
    return record;
  }
}

export async function updateLogo(
  id: string,
  patch: Partial<Pick<LogoRecord, "name" | "aliases" | "tags" | "image">> & { history?: LogoHistory },
): Promise<LogoRecord | null> {
  const current = await getLogo(id);
  const history = patch.history ?? (patch.image ? "crop" : "none");
  let fallback: LogoRecord | null = null;
  if (current) {
    fallback = {
      ...current,
      ...patch,
      name: (patch.name ?? current.name).trim() || current.name,
      updatedAt: Date.now(),
    };
    if (patch.image && history === "crop") {
      fallback.original = current.original ?? current.image;
      fallback.previous = current.image;
      fallback.image = patch.image;
    } else if (patch.image && history === "replace") {
      fallback.original = patch.image;
      fallback.previous = undefined;
      fallback.image = patch.image;
    }
    await run("readwrite", (store) => store.put(fallback));
  }
  try {
    await patchSharedLogo(id, patch);
  } catch (err) {
    if ((await fetchDeskStatus()).available) throw err;
  }
  return fallback;
}

export async function revertLogo(id: string, to: "original" | "previous"): Promise<LogoRecord | null> {
  const current = await getLogo(id);
  const blob = to === "original" ? current?.original : current?.previous;
  if (current && blob) {
    const next: LogoRecord = {
      ...current,
      image: blob,
      previous: to === "previous" ? undefined : current.previous,
      updatedAt: Date.now(),
    };
    await run("readwrite", (store) => store.put(next));
  }
  try {
    await revertSharedLogo(id, to);
  } catch (err) {
    if ((await fetchDeskStatus()).available) throw err;
    if (!blob) throw new Error(to === "original" ? "No original crest is stored for that school" : "Nothing left to undo");
  }
  return current ? getLogo(id) : null;
}

export async function deleteLogo(id: string): Promise<void> {
  await run("readwrite", (store) => store.delete(id));
  try {
    await deleteSharedLogo(id);
  } catch (err) {
    if ((await fetchDeskStatus()).available) throw err;
  }
}

export async function replaceLogoLibrary(files: File[]): Promise<number> {
  const remote = await fetchSharedViews();
  const local = await listLogos();
  const ids = [...new Set([...local.map((row) => row.id), ...(remote?.views ?? []).map((view) => view.id)])];
  for (const id of ids) {
    await deleteLogo(id);
  }
  const images = files.filter((file) => /\.(svg|png|jpe?g|webp)$/i.test(file.name));
  for (const file of images) {
    await addLogo({ name: titleFromFile(file), image: file, tags: [] });
  }
  return images.length;
}

export async function loadLogoLibrary(): Promise<{
  views: LogoView[];
  mode: DeskMode;
  revoke: () => void;
  note?: string;
}> {
  const remote = await fetchSharedViews();
  const local = await listLogos();
  if (remote) {
    if (!remote.error) await pushLocalIfMissing(local, remote.views);
    const latest = remote.error ? remote : ((await fetchSharedViews()) ?? remote);
    const views = latest.views.map((view) => {
      const loc = local.find((row) => row.id === view.id);
      return {
        ...view,
        hasOriginal: view.hasOriginal || Boolean(loc?.original),
        hasPrevious: view.hasPrevious || Boolean(loc?.previous),
      };
    });
    const status = await fetchDeskStatus();
    const seen = new Set(views.flatMap((row) => [row.id, row.name.toLowerCase()]));
    const pending = local.filter((row) => !seen.has(row.id) && !seen.has(row.name.toLowerCase()));
    const extra = viewsFromRecords(pending);
    return {
      views: [...views, ...extra.views],
      mode: status.authorized ? "shared" : "locked",
      revoke: extra.revoke,
      note: latest.error,
    };
  }
  const { views, revoke } = viewsFromRecords(local);
  return { views, mode: "local", revoke };
}

export function titleFromFile(file: File): string {
  return file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function viewsFromRecords(records: LogoRecord[]): { views: LogoView[]; revoke: () => void } {
  const views = records.map((record) => ({
    id: record.id,
    name: record.name,
    aliases: record.aliases,
    tags: record.tags,
    uploadedAt: record.uploadedAt,
    updatedAt: record.updatedAt,
    url: URL.createObjectURL(record.image),
    hasOriginal: Boolean(record.original),
    hasPrevious: Boolean(record.previous),
  }));
  return {
    views,
    revoke: () => views.forEach((view) => URL.revokeObjectURL(view.url)),
  };
}

function logoHitsTeam(logo: LogoView, team: TeamRecord): boolean {
  const teamNames = [team.name, team.logoFile.replace(/\.[^.]+$/, "")];
  if (teamNames.some((name) => schoolNameHits(logo.name, name))) return true;
  const logoNames = [logo.name, ...logo.aliases.filter((alias) => !isSchoolCode(alias))];
  const names = [...teamNames, ...team.aliases.filter((alias) => !isSchoolCode(alias))];
  return logoNames.some((key) => names.some((name) => schoolNameHits(key, name)));
}

/** Overlay library crests onto the matching pack without changing team ids. */
export function applyLogoLibrary(teams: TeamRecord[], logos: LogoView[]): TeamRecord[] {
  const used = new Set<string>();
  const next = teams.map((team) => {
    const hit = logos.find((logo) => logoHitsTeam(logo, team));
    if (!hit) return team;
    used.add(hit.id);
    return { ...team, logoUrl: hit.url, logoFile: hit.name };
  });
  for (const logo of logos) {
    if (used.has(logo.id)) continue;
    next.push({
      id: `logo-${logo.id}`,
      name: logo.name,
      aliases: logo.aliases,
      primary: "#4a4a4a",
      secondary: "#f3ead8",
      accent: "",
      logoUrl: logo.url,
      logoFile: logo.name,
      source: "upload",
    });
  }
  return next;
}

export function logoIsInUse(logo: LogoView, teamQueries: string[]): boolean {
  const keys = [logo.name, ...logo.aliases].map(normalizeLogoName).filter(Boolean);
  return teamQueries.some((query) => keys.includes(normalizeLogoName(query)));
}

export function aliasesAfterRename(prevName: string, nextName: string, aliases: string[]): string[] {
  const next = [...aliases];
  const keys = new Set(next.map(normalizeLogoName));
  const prevKey = normalizeLogoName(prevName);
  if (prevKey && prevKey !== normalizeLogoName(nextName) && !keys.has(prevKey)) {
    next.push(prevName);
  }
  return next;
}

export function parseTagList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function blobFromUrl(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not read that crest");
  return res.blob();
}
