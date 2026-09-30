import { canvasPng, knockoutOpaqueCrest } from "./logoOutline";
import { patchSharedLogo, type DeskMode } from "./logoApi";
import type { LogoView } from "./logoStore";

export const CLEAR_BG_TAG = "clear-bg";

const srcCache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function isSvg(src: string, mime?: string) {
  return (mime ?? "").includes("svg") || /\.svg(\?|$)/i.test(src);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that crest"));
    image.src = src;
  });
}

/** Return a blob URL if the crest had a paper box behind it. Otherwise keep the original src. */
export async function transparentSrc(src: string): Promise<string> {
  if (!src || isSvg(src)) return src;
  const cached = srcCache.get(src);
  if (cached) return cached;
  const inflight = pending.get(src);
  if (inflight) return inflight;
  const work = (async () => {
    try {
      const image = await loadImage(src);
      const cut = knockoutOpaqueCrest(image);
      if (!cut) {
        srcCache.set(src, src);
        return src;
      }
      const blob = await canvasPng(cut);
      const url = URL.createObjectURL(blob);
      srcCache.set(src, url);
      return url;
    } catch {
      srcCache.set(src, src);
      return src;
    }
  })();
  pending.set(src, work);
  try {
    return await work;
  } finally {
    pending.delete(src);
  }
}

export async function knockoutCrestBlob(blob: Blob): Promise<Blob | null> {
  if (blob.type.includes("svg")) return null;
  const src = URL.createObjectURL(blob);
  try {
    const image = await loadImage(src);
    const cut = knockoutOpaqueCrest(image);
    if (!cut) return null;
    return canvasPng(cut);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(src);
  }
}

/**
 * Write cut-out PNGs back to the shared desk so every coach gets transparent crests.
 * Keeps the boxed file as Original. No Supabase SQL.
 */
export async function persistTransparentCrests(
  views: LogoView[],
  mode: DeskMode,
): Promise<LogoView[] | null> {
  if (mode !== "shared") return null;
  const pendingViews = views.filter(
    (view) =>
      !view.id.startsWith("preview-") &&
      !view.tags.includes(CLEAR_BG_TAG) &&
      !isSvg(view.url),
  );
  if (pendingViews.length === 0) return null;
  let changed = false;
  const next = views.slice();
  const chunk = 3;
  for (let i = 0; i < pendingViews.length; i += chunk) {
    const slice = pendingViews.slice(i, i + chunk);
    const saved = await Promise.all(
      slice.map(async (view) => {
        try {
          const image = await loadImage(view.url);
          const cut = knockoutOpaqueCrest(image);
          if (!cut) return null;
          const blob = await canvasPng(cut);
          return patchSharedLogo(view.id, {
            image: blob,
            tags: [...view.tags.filter((tag) => tag !== CLEAR_BG_TAG), CLEAR_BG_TAG],
            history: "crop" as const,
          });
        } catch {
          return null;
        }
      }),
    );
    for (const view of saved) {
      if (!view) continue;
      const idx = next.findIndex((item) => item.id === view.id);
      if (idx >= 0) next[idx] = { ...next[idx], ...view, tags: view.tags };
      changed = true;
    }
  }
  return changed ? next : null;
}
