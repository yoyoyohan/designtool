import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LogoRecord, LogoView } from "./logoStore";

export type DeskMode = "shared" | "local" | "locked";

export type DeskStatus = {
  available: boolean;
  locked: boolean;
  authorized: boolean;
  count: number;
};

type LogoRow = {
  id: string;
  name: string;
  aliases: string[] | null;
  tags: string[] | null;
  mime: string | null;
  uploaded_at: number;
  updated_at: number;
  has_original?: boolean | null;
  has_previous?: boolean | null;
};

export type LogoHistory = "crop" | "replace" | "none";

export class DeskAuthError extends Error {
  constructor() {
    super("Enter the sports business desk key to save for everyone");
    this.name = "DeskAuthError";
  }
}

const BUCKET = "crests";

function clean(value?: string) {
  return (value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function projectUrl(raw: string) {
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return raw.replace(/\/rest\/v1.*$/i, "").replace(/\/+$/, "");
  }
}

function env() {
  const url = projectUrl(clean(import.meta.env.VITE_SUPABASE_URL));
  const anon = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);
  const email = clean(import.meta.env.VITE_DESK_EMAIL) || "desk@sportsbusiness.local";
  if (!url || !anon) return null;
  return { url, anon, email };
}

export function isDeskConfigured(): boolean {
  return Boolean(env());
}

export function deskBuildNote(): string {
  const url = clean(import.meta.env.VITE_SUPABASE_URL);
  const anon = clean(import.meta.env.VITE_SUPABASE_ANON_KEY);
  if (url && anon) {
    try {
      return `Connected to ${new URL(url).host}`;
    } catch {
      return "Supabase keys are in this build";
    }
  }
  return `Keys missing in this build · url ${url ? "yes" : "no"} · anon ${anon ? "yes" : "no"}`;
}

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  const cfg = env();
  if (!cfg) return null;
  if (!client) client = createClient(cfg.url, cfg.anon);
  return client;
}

function extFor(mime: string): string {
  if (mime.includes("svg")) return "svg";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

function publicUrl(id: string, mime: string, updatedAt: number): string {
  const cfg = env();
  if (!cfg) return "";
  return `${cfg.url}/storage/v1/object/public/${BUCKET}/${id}.${extFor(mime)}?v=${updatedAt}`;
}

function asView(row: LogoRow): LogoView {
  return {
    id: row.id,
    name: row.name,
    aliases: row.aliases ?? [],
    tags: row.tags ?? [],
    uploadedAt: Number(row.uploaded_at),
    updatedAt: Number(row.updated_at),
    url: publicUrl(row.id, row.mime || "image/png", Number(row.updated_at)),
    hasOriginal: Boolean(row.has_original),
    hasPrevious: Boolean(row.has_previous),
  };
}

function objectPath(id: string, mime: string, kind: "current" | "original" | "previous" = "current"): string {
  const ext = extFor(mime);
  if (kind === "original") return `${id}-original.${ext}`;
  if (kind === "previous") return `${id}-previous.${ext}`;
  return `${id}.${ext}`;
}

function writeFailed(message?: string): never {
  if (message?.toLowerCase().includes("row-level security") || message?.includes("401") || message?.includes("JWT")) {
    throw new DeskAuthError();
  }
  if (message?.includes("schema cache") && message.toLowerCase().includes("accent")) {
    throw new Error("Run the accent SQL in Supabase (supabase/accent.sql), then unlock again");
  }
  if (message?.includes("schema cache") && message.toLowerCase().includes("bars")) {
    throw new Error("Run the bars SQL in Supabase (supabase/schema.sql), then unlock again");
  }
  throw new Error(message || "The shared logo desk could not save that crest");
}

export function getDeskKey(): string {
  return "";
}

export async function setDeskKey(value: string) {
  const cfg = env();
  const supabase = getClient();
  if (!cfg || !supabase) throw new Error("Supabase is not configured yet");
  const { error } = await supabase.auth.signInWithPassword({
    email: cfg.email,
    password: value.trim(),
  });
  if (error) throw new DeskAuthError();
}

export async function fetchDeskStatus(): Promise<DeskStatus> {
  const supabase = getClient();
  if (!supabase) return { available: false, locked: false, authorized: false, count: 0 };
  const [{ data: sessionData }, { count }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.from("logos").select("id", { count: "exact", head: true }),
  ]);
  const authorized = Boolean(sessionData.session);
  return {
    available: true,
    locked: !authorized,
    authorized,
    count: count ?? 0,
  };
}

export async function fetchSharedViews(): Promise<{ views: LogoView[]; error?: string } | null> {
  const supabase = getClient();
  if (!supabase) return null;
  const full = await supabase
    .from("logos")
    .select("id,name,aliases,tags,mime,uploaded_at,updated_at,has_original,has_previous")
    .order("name");
  if (!full.error) return { views: (full.data ?? []).map((row) => asView(row as LogoRow)) };
  const { data, error } = await supabase
    .from("logos")
    .select("id,name,aliases,tags,mime,uploaded_at,updated_at")
    .order("name");
  if (error) return { views: [], error: error.message };
  return { views: (data ?? []).map((row) => asView(row as LogoRow)) };
}

async function requireClient(): Promise<SupabaseClient> {
  const supabase = getClient();
  if (!supabase) throw new Error("Supabase is not configured yet");
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new DeskAuthError();
  return supabase;
}

async function uploadImage(
  supabase: SupabaseClient,
  id: string,
  image: Blob,
  kind: "current" | "original" | "previous" = "current",
): Promise<string> {
  const mime = image.type || "image/png";
  const path = objectPath(id, mime, kind);
  const { error } = await supabase.storage.from(BUCKET).upload(path, image, {
    upsert: true,
    contentType: mime,
  });
  if (error) writeFailed(error.message);
  return mime;
}

async function downloadStored(supabase: SupabaseClient, id: string, kind: "original" | "previous", mimeHint?: string) {
  const guessed = [mimeHint || "image/png", "image/png", "image/svg+xml", "image/jpeg", "image/webp"];
  const seen = new Set<string>();
  for (const mime of guessed) {
    const path = objectPath(id, mime, kind);
    if (seen.has(path)) continue;
    seen.add(path);
    const { data } = await supabase.storage.from(BUCKET).download(path);
    if (data) return data;
  }
  return null;
}

async function updateLogoRow(
  supabase: SupabaseClient,
  id: string,
  next: Record<string, unknown>,
): Promise<LogoRow> {
  const { data, error } = await supabase.from("logos").update(next).eq("id", id).select().single();
  if (!error) return data as LogoRow;
  if (!String(error.message).includes("has_original")) writeFailed(error.message);
  const { has_original: _o, has_previous: _p, ...plain } = next;
  const retry = await supabase.from("logos").update(plain).eq("id", id).select().single();
  if (retry.error) writeFailed(retry.error.message);
  return retry.data as LogoRow;
}

export async function postSharedLogo(input: {
  id?: string;
  name: string;
  aliases: string[];
  tags: string[];
  image: Blob;
  original?: Blob;
  uploadedAt?: number;
}): Promise<LogoView> {
  const supabase = await requireClient();
  const id = input.id || `logo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const mime = await uploadImage(supabase, id, input.image);
  await uploadImage(supabase, id, input.original ?? input.image, "original");
  const now = Date.now();
  const row = {
    id,
    name: input.name.trim() || "Untitled crest",
    aliases: input.aliases,
    tags: input.tags,
    mime,
    uploaded_at: input.uploadedAt ?? now,
    updated_at: now,
    has_original: true,
    has_previous: false,
  };
  const { data, error } = await supabase.from("logos").upsert(row).select().single();
  if (error && String(error.message).includes("has_original")) {
    const { has_original: _o, has_previous: _p, ...plain } = row;
    const retry = await supabase.from("logos").upsert(plain).select().single();
    if (retry.error) writeFailed(retry.error.message);
    return asView(retry.data as LogoRow);
  }
  if (error) writeFailed(error.message);
  return asView(data as LogoRow);
}

export async function patchSharedLogo(
  id: string,
  patch: { name?: string; aliases?: string[]; tags?: string[]; image?: Blob; history?: LogoHistory },
): Promise<LogoView> {
  const supabase = await requireClient();
  const { data: current, error: readError } = await supabase.from("logos").select("*").eq("id", id).maybeSingle();
  if (readError) writeFailed(readError.message);
  if (!current) throw new Error("That crest is not in the shared desk");
  let mime = current.mime || "image/png";
  let hasOriginal = Boolean(current.has_original);
  let hasPrevious = Boolean(current.has_previous);
  const history = patch.history ?? (patch.image ? "crop" : "none");
  if (patch.image) {
    if (history === "crop") {
      if (!hasOriginal) {
        const live = await supabase.storage.from(BUCKET).download(objectPath(id, mime));
        await uploadImage(supabase, id, live.data ?? patch.image, "original");
      }
      const live = await supabase.storage.from(BUCKET).download(objectPath(id, mime));
      if (live.data) await uploadImage(supabase, id, live.data, "previous");
      hasOriginal = true;
      hasPrevious = true;
    } else if (history === "replace") {
      await uploadImage(supabase, id, patch.image, "original");
      hasOriginal = true;
      hasPrevious = false;
    }
    mime = await uploadImage(supabase, id, patch.image);
  }
  const next = {
    name: (patch.name ?? current.name).trim() || current.name,
    aliases: patch.aliases ?? current.aliases,
    tags: patch.tags ?? current.tags,
    mime,
    updated_at: Date.now(),
    has_original: hasOriginal,
    has_previous: hasPrevious,
  };
  return asView(await updateLogoRow(supabase, id, next));
}

export async function revertSharedLogo(id: string, to: "original" | "previous"): Promise<LogoView> {
  const supabase = await requireClient();
  const { data: current, error: readError } = await supabase.from("logos").select("*").eq("id", id).maybeSingle();
  if (readError) writeFailed(readError.message);
  if (!current) throw new Error("That crest is not in the shared desk");
  const blob = await downloadStored(supabase, id, to, current.mime || "image/png");
  if (!blob) throw new Error(to === "original" ? "No original crest is stored for that school" : "Nothing left to undo");
  return patchSharedLogo(id, { image: blob, history: "none" });
}

export async function deleteSharedLogo(id: string): Promise<void> {
  const supabase = await requireClient();
  const { data: current } = await supabase.from("logos").select("mime").eq("id", id).maybeSingle();
  const { error } = await supabase.from("logos").delete().eq("id", id);
  if (error) writeFailed(error.message);
  if (current?.mime) {
    const mime = current.mime as string;
    await supabase.storage.from(BUCKET).remove([
      objectPath(id, mime),
      objectPath(id, mime, "original"),
      objectPath(id, mime, "previous"),
    ]);
  }
}

export type SharedBar = {
  id: string;
  name: string;
  aliases: string[];
  primary: string;
  secondary: string;
  accent: string;
  updatedAt: number;
};

type BarRow = {
  id: string;
  name: string;
  aliases: string[] | null;
  bar_fill: string;
  name_ink: string;
  accent?: string | null;
  updated_at: number;
};

function asBar(row: BarRow): SharedBar {
  return {
    id: row.id,
    name: row.name,
    aliases: row.aliases ?? [],
    primary: row.bar_fill,
    secondary: row.name_ink,
    accent: row.accent ?? "",
    updatedAt: Number(row.updated_at),
  };
}

export async function fetchSharedBars(): Promise<{ bars: SharedBar[]; error?: string } | null> {
  const supabase = getClient();
  if (!supabase) return null;
  const full = await supabase
    .from("bars")
    .select("id,name,aliases,bar_fill,name_ink,accent,updated_at")
    .order("name");
  if (!full.error) return { bars: (full.data ?? []).map((row) => asBar(row as BarRow)) };
  const { data, error } = await supabase
    .from("bars")
    .select("id,name,aliases,bar_fill,name_ink,updated_at")
    .order("name");
  if (error) return { bars: [], error: error.message };
  return { bars: (data ?? []).map((row) => asBar(row as BarRow)) };
}

export async function upsertSharedBar(input: SharedBar): Promise<SharedBar> {
  const supabase = await requireClient();
  const row = {
    id: input.id,
    name: input.name.trim() || "Untitled school",
    aliases: input.aliases,
    bar_fill: input.primary,
    name_ink: input.secondary,
    accent: input.accent || "",
    updated_at: Date.now(),
  };
  const { data, error } = await supabase.from("bars").upsert(row).select().single();
  if (!error) return asBar(data as BarRow);
  if (!String(error.message).toLowerCase().includes("accent")) writeFailed(error.message);
  const { accent: _accent, ...plain } = row;
  const retry = await supabase.from("bars").upsert(plain).select().single();
  if (retry.error) writeFailed(retry.error.message);
  return asBar({ ...(retry.data as BarRow), accent: input.accent });
}

export async function pushBarsIfMissing(catalog: SharedBar[], remote: SharedBar[]): Promise<boolean> {
  const seen = new Set(remote.flatMap((row) => [row.id, row.name.toLowerCase()]));
  const missing = catalog.filter((row) => !seen.has(row.id) && !seen.has(row.name.toLowerCase()));
  if (missing.length === 0) return false;
  const chunk = 25;
  for (let i = 0; i < missing.length; i += chunk) {
    const slice = missing.slice(i, i + chunk);
    const results = await Promise.allSettled(slice.map((row) => upsertSharedBar(row)));
    if (results.some((item) => item.status === "rejected" && item.reason instanceof DeskAuthError)) {
      return true;
    }
  }
  return true;
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
