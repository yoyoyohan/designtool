import { type DeskMode } from "./logoApi";
import type { LogoView } from "./logoStore";

export const CLEAR_BG_TAG = "clear-bg";

/** Show the stored crest as-is. Imported marks keep their original opaque look. */
export async function transparentSrc(src: string): Promise<string> {
  return src;
}

/** Left in place so older studio builds compile. Imported crests are no longer auto-cut. */
export async function persistTransparentCrests(
  _views: LogoView[],
  _mode: DeskMode,
): Promise<LogoView[] | null> {
  return null;
}
