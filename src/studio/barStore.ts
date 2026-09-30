import type { TeamRecord } from "../engine/types";
import { GRAPHIC_BAR_SCHOOLS, graphicBarFor } from "../theme/graphicBars";
import {
  fetchDeskStatus,
  fetchSharedBars,
  pushBarsIfMissing,
  upsertSharedBar,
  type SharedBar,
} from "./logoApi";
import { normalizeLogoName } from "./logoStore";

const DB_NAME = "ranking-studio-bars";
const STORE = "bars";
const DB_VERSION = 1;

export type BarRecord = SharedBar;

export function barIdFor(name: string): string {
  return `bar-${normalizeLogoName(name).replace(/\s+/g, "-") || "school"}`;
}

export function normalizeHex(value: string, fallback = "#3a3a40"): string {
  const hex = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
  }
  return fallback;
}

export function colorSwatch(value: string): string {
  return normalizeHex(value, "#111111");
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
    req.onerror = () => reject(req.error ?? new Error("Could not open the bar colors"));
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = work(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Bar color request failed"));
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function listBars(): Promise<BarRecord[]> {
  const rows = await run("readonly", (store) => store.getAll());
  return (rows ?? []).filter((row) => row && typeof row.id === "string" && row.primary);
}

export async function putBar(record: BarRecord): Promise<BarRecord> {
  const next = { ...record, updatedAt: Date.now() };
  await run("readwrite", (store) => store.put(next));
  return next;
}

export function mergeBars(...lists: BarRecord[][]): BarRecord[] {
  const map = new Map<string, BarRecord>();
  for (const list of lists) {
    for (const bar of list) {
      map.set(normalizeLogoName(bar.name), bar);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function catalogBars(teams: TeamRecord[]): BarRecord[] {
  const map = new Map<string, BarRecord>();
  for (const team of teams) {
    map.set(normalizeLogoName(team.name), {
      id: barIdFor(team.name),
      name: team.name,
      aliases: team.aliases,
      primary: normalizeHex(team.primary),
      secondary: normalizeHex(team.secondary, "#f3ead8"),
      updatedAt: 0,
    });
  }
  for (const school of GRAPHIC_BAR_SCHOOLS) {
    const key = normalizeLogoName(school.name);
    const prev = map.get(key);
    map.set(key, {
      id: prev?.id ?? barIdFor(school.name),
      name: prev?.name ?? school.name,
      aliases: prev?.aliases ?? [],
      primary: school.primary,
      secondary: school.secondary,
      updatedAt: 0,
    });
  }
  return [...map.values()];
}

export function findBar(bars: BarRecord[], ...names: string[]): BarRecord | null {
  const keys = names.map(normalizeLogoName).filter(Boolean);
  if (keys.length === 0) return null;
  return (
    bars.find((bar) => {
      const barKeys = [bar.name, ...bar.aliases].map(normalizeLogoName);
      return keys.some((key) => barKeys.includes(key));
    }) ?? null
  );
}

/** Desk colours win, then the published graphic, then the pack guess. */
export function applyBarColors(teams: TeamRecord[], bars: BarRecord[]): TeamRecord[] {
  const next = teams.map((team) => {
    const desk = findBar(bars, team.name, ...team.aliases);
    const graphic = graphicBarFor(team.name);
    return {
      ...team,
      primary: desk?.primary ?? graphic?.primary ?? team.primary,
      secondary: desk?.secondary ?? graphic?.secondary ?? team.secondary,
    };
  });
  const covered = new Set(next.flatMap((team) => [team.name, ...team.aliases].map(normalizeLogoName)));
  for (const bar of bars) {
    if (covered.has(normalizeLogoName(bar.name))) continue;
    if (bar.aliases.some((alias) => covered.has(normalizeLogoName(alias)))) continue;
    next.push({
      id: bar.id,
      name: bar.name,
      aliases: bar.aliases,
      primary: bar.primary,
      secondary: bar.secondary,
      logoUrl: "",
      logoFile: "",
      source: "upload",
    });
    covered.add(normalizeLogoName(bar.name));
  }
  return next;
}

export async function loadBars(teams: TeamRecord[]): Promise<{ bars: BarRecord[]; note?: string }> {
  const catalog = catalogBars(teams);
  const local = await listBars();
  const remote = await fetchSharedBars();
  if (remote) {
    if (!remote.error) {
      const status = await fetchDeskStatus();
      if (status.authorized) await pushBarsIfMissing(catalog, remote.bars);
    }
    const latest = remote.error ? remote : ((await fetchSharedBars()) ?? remote);
    return {
      bars: mergeBars(catalog, local, latest.bars),
      note: latest.error,
    };
  }
  return { bars: mergeBars(catalog, local) };
}

export async function saveBar(input: {
  name: string;
  aliases: string[];
  primary: string;
  secondary: string;
  id?: string;
}): Promise<BarRecord> {
  const record: BarRecord = {
    id: input.id || barIdFor(input.name),
    name: input.name.trim() || "Untitled school",
    aliases: input.aliases,
    primary: normalizeHex(input.primary),
    secondary: normalizeHex(input.secondary, "#ffffff"),
    updatedAt: Date.now(),
  };
  await putBar(record);
  try {
    return await upsertSharedBar(record);
  } catch (err) {
    if ((await fetchDeskStatus()).available) throw err;
    return record;
  }
}
