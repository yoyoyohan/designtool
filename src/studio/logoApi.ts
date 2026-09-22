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
};

export class DeskAuthError extends Error {
  constructor() {
    super("Enter the sports business desk key to save for everyone");
    this.name = "DeskAuthError";
  }
}

const BUCKET = "crests";

function env() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const email = import.meta.env.VITE_DESK_EMAIL || "desk@sportsbusiness.local";
  if (!url || !anon) return null;
  return { url, anon, email };
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
  };
}

function objectPath(id: string, mime: string): string {
  return `${id}.${extFor(mime)}`;
}

function writeFailed(message?: string): never {
  if (message?.toLowerCase().includes("row-level security") || message?.includes("401") || message?.includes("JWT")) {
    throw new DeskAuthError();
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

export async function fetchSharedViews(): Promise<LogoView[] | null> {
  const supabase = getClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("logos")
    .select("id,name,aliases,tags,mime,uploaded_at,updated_at")
    .order("name");
  if (error) return null;
  return (data ?? []).map(asView);
}

async function requireClient(): Promise<SupabaseClient> {
  const supabase = getClient();
  if (!supabase) throw new Error("Supabase is not configured yet");
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new DeskAuthError();
  return supabase;
}

async function uploadImage(supabase: SupabaseClient, id: string, image: Blob): Promise<string> {
  const mime = image.type || "image/png";
  const path = objectPath(id, mime);
  const { error } = await supabase.storage.from(BUCKET).upload(path, image, {
    upsert: true,
    contentType: mime,
  });
  if (error) writeFailed(error.message);
  return mime;
}

export async function postSharedLogo(input: {
  id?: string;
  name: string;
  aliases: string[];
  tags: string[];
  image: Blob;
  uploadedAt?: number;
}): Promise<LogoView> {
  const supabase = await requireClient();
  const id = input.id || `logo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const mime = await uploadImage(supabase, id, input.image);
  const now = Date.now();
  const row = {
    id,
    name: input.name.trim() || "Untitled crest",
    aliases: input.aliases,
    tags: input.tags,
    mime,
    uploaded_at: input.uploadedAt ?? now,
    updated_at: now,
  };
  const { data, error } = await supabase.from("logos").upsert(row).select().single();
  if (error) writeFailed(error.message);
  return asView(data as LogoRow);
}

export async function patchSharedLogo(
  id: string,
  patch: { name?: string; aliases?: string[]; tags?: string[]; image?: Blob },
): Promise<LogoView> {
  const supabase = await requireClient();
  const { data: current, error: readError } = await supabase.from("logos").select("*").eq("id", id).maybeSingle();
  if (readError) writeFailed(readError.message);
  if (!current) throw new Error("That crest is not in the shared desk");
  let mime = current.mime || "image/png";
  if (patch.image) mime = await uploadImage(supabase, id, patch.image);
  const next = {
    name: (patch.name ?? current.name).trim() || current.name,
    aliases: patch.aliases ?? current.aliases,
    tags: patch.tags ?? current.tags,
    mime,
    updated_at: Date.now(),
  };
  const { data, error } = await supabase.from("logos").update(next).eq("id", id).select().single();
  if (error) writeFailed(error.message);
  return asView(data as LogoRow);
}

export async function deleteSharedLogo(id: string): Promise<void> {
  const supabase = await requireClient();
  const { data: current } = await supabase.from("logos").select("mime").eq("id", id).maybeSingle();
  const { error } = await supabase.from("logos").delete().eq("id", id);
  if (error) writeFailed(error.message);
  if (current?.mime) {
    await supabase.storage.from(BUCKET).remove([objectPath(id, current.mime)]);
  }
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
