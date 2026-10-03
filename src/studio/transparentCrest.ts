import { canvasPng, keyPlateInPlace } from "./logoOutline";
import { type DeskMode } from "./logoApi";
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

/**
 * Show the stored crest. If it still has a paper plate, key only that plate so the
 * drawing sits on the bar. The file in the desk is left as the original.
 */
export async function transparentSrc(src: string): Promise<string> {
  if (!src || isSvg(src)) return src;
  const cached = srcCache.get(src);
  if (cached) return cached;
  const inflight = pending.get(src);
  if (inflight) return inflight;
  const work = (async () => {
    try {
      const image = await loadImage(src);
      const keyed = keyPlateInPlace(image);
      if (!keyed) {
        srcCache.set(src, src);
        return src;
      }
      const url = URL.createObjectURL(await canvasPng(keyed));
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

/** Left in place so older studio builds compile. The desk file is never rewritten. */
export async function persistTransparentCrests(
  _views: LogoView[],
  _mode: DeskMode,
): Promise<LogoView[] | null> {
  return null;
}
