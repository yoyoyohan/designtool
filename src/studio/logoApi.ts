import type { LogoRecord, LogoView } from "./logoStore";

const KEY = "ranking-studio:desk-key";

export type DeskMode = "shared" | "local" | "locked";

export type DeskStatus = {
  available: boolean;
  locked: boolean;
  authorized: boolean;
  count: number;
};

export class DeskAuthError extends Error {
  constructor() {
    super("Enter the sports business desk key to save for everyone");
    this.name = "DeskAuthError";
  }
}

export function getDeskKey(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setDeskKey(value: string) {
  window.localStorage.setItem(KEY, value.trim());
}

function headers(json = false): HeadersInit {
  const next: Record<string, string> = {};
  if (json) next["Content-Type"] = "application/json";
  const key = getDeskKey();
  if (key) next["X-Desk-Key"] = key;
  return next;
}

async function blobToBase64(image: Blob): Promise<{ imageBase64: string; mime: string }> {
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return { imageBase64: btoa(binary), mime: image.type || "image/png" };
}

export async function fetchDeskStatus(): Promise<DeskStatus> {
  try {
    const res = await fetch("/api/logos/status", { headers: headers() });
    if (!res.ok) return { available: false, locked: false, authorized: false, count: 0 };
    const data = (await res.json()) as { locked?: boolean; authorized?: boolean; count?: number };
    return {
      available: true,
      locked: Boolean(data.locked),
      authorized: Boolean(data.authorized),
      count: Number(data.count) || 0,
    };
  } catch {
    return { available: false, locked: false, authorized: false, count: 0 };
  }
}

export async function fetchSharedViews(): Promise<LogoView[] | null> {
  try {
    const res = await fetch("/api/logos");
    if (!res.ok) return null;
    const data = (await res.json()) as { logos?: LogoView[] };
    return Array.isArray(data.logos) ? data.logos : [];
  } catch {
    return null;
  }
}

async function write(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: headers(body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new DeskAuthError();
  if (!res.ok) throw new Error("The shared logo desk could not save that crest");
  return res.json();
}

export async function postSharedLogo(input: {
  id?: string;
  name: string;
  aliases: string[];
  tags: string[];
  image: Blob;
  uploadedAt?: number;
}): Promise<LogoView> {
  const image = await blobToBase64(input.image);
  return write("/api/logos", "POST", {
    id: input.id,
    name: input.name,
    aliases: input.aliases,
    tags: input.tags,
    uploadedAt: input.uploadedAt,
    ...image,
  });
}

export async function patchSharedLogo(
  id: string,
  patch: { name?: string; aliases?: string[]; tags?: string[]; image?: Blob },
): Promise<LogoView> {
  const image = patch.image ? await blobToBase64(patch.image) : {};
  return write(`/api/logos/${id}`, "PATCH", {
    name: patch.name,
    aliases: patch.aliases,
    tags: patch.tags,
    ...image,
  });
}

export async function deleteSharedLogo(id: string): Promise<void> {
  await write(`/api/logos/${id}`, "DELETE");
}

export async function pushLocalIfMissing(local: LogoRecord[], remote: LogoView[]): Promise<boolean> {
  const seen = new Set(remote.flatMap((row) => [row.id, row.name.toLowerCase()]));
  let pushed = false;
  for (const row of local) {
    if (seen.has(row.id) || seen.has(row.name.toLowerCase())) continue;
    try {
      await postSharedLogo(row);
      pushed = true;
    } catch (err) {
      if (err instanceof DeskAuthError) return pushed;
    }
  }
  return pushed;
}
