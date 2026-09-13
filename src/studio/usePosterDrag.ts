import { useEffect, useRef } from "react";

const MOVE: Record<string, { x: string; y: string }> = {
  header: { x: "--title-x", y: "--title-y" },
  board: { x: "--list-x", y: "--list-y" },
  hero: { x: "--hero-x", y: "--hero-y" },
  "deco-a": { x: "--deco-a-x", y: "--deco-a-y" },
  "deco-b": { x: "--deco-b-x", y: "--deco-b-y" },
  "deco-c": { x: "--deco-c-x", y: "--deco-c-y" },
  "deco-d": { x: "--deco-d-x", y: "--deco-d-y" },
};

const SIZE: Record<string, string> = {
  hero: "--hero-size",
  "deco-a": "--deco-a-size",
  "deco-b": "--deco-b-size",
  "deco-c": "--deco-c-size",
  "deco-d": "--deco-d-size",
};

function readPx(tokens: Record<string, string>, id: string): number {
  const n = Number.parseFloat(tokens[id] ?? "");
  return Number.isFinite(n) ? n : 0;
}

type Axis = "both" | "x" | "y";

type Session = {
  part: string;
  kind: "move" | "resize";
  axis: Axis;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origSize: number;
  origH: number;
  lockH: boolean;
  moved: boolean;
};

function axisOf(handle: Element): Axis {
  const raw = handle.getAttribute("data-axis");
  return raw === "x" || raw === "y" || raw === "both" ? raw : "both";
}

export function usePosterDrag(
  stageRef: React.RefObject<HTMLDivElement | null>,
  zoomRef: React.RefObject<number>,
  tokensRef: React.RefObject<Record<string, string>>,
  onTokens: (patch: Record<string, string>) => void,
  onSelect: (part: string | null) => void,
  onGestureStart?: () => void,
) {
  const session = useRef<Session | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest(".zoom-bar, .element-pop, .sheet-tab")) return;

      const handle = target.closest("[data-resize]");
      const partEl = target.closest("[data-drag]");
      const part = partEl?.getAttribute("data-drag") ?? handle?.getAttribute("data-resize");
      if (!part) return;

      onSelect(part);

      const editing = Boolean(target.closest("[data-cell], [data-text], [data-logo]"));
      if (editing && !handle) return;

      event.preventDefault();
      event.stopPropagation();
      const tokens = tokensRef.current ?? {};
      const move = MOVE[part];
      const box = partEl instanceof HTMLElement ? partEl : null;
      session.current = {
        part,
        kind: handle ? "resize" : "move",
        axis: handle ? axisOf(handle) : "both",
        startX: event.clientX,
        startY: event.clientY,
        origX: move ? readPx(tokens, move.x) : 0,
        origY: move ? readPx(tokens, move.y) : 0,
        origSize: readPx(tokens, SIZE[part] ?? ""),
        origH: part === "hero" ? readPx(tokens, "--hero-h") || (box?.offsetHeight ?? 0) : 0,
        lockH: part === "hero" && readPx(tokens, "--hero-h") > 0,
        moved: false,
      };
      onGestureStart?.();
      stage.setPointerCapture(event.pointerId);
    };

    const onMove = (event: PointerEvent) => {
      const drag = session.current;
      if (!drag) return;
      const zoom = zoomRef.current || 1;
      const dx = (event.clientX - drag.startX) / zoom;
      const dy = (event.clientY - drag.startY) / zoom;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;

      if (drag.kind === "resize") {
        if (drag.part === "hero") {
          if (drag.axis === "y") {
            onTokens({ "--hero-h": `${Math.max(40, Math.round(drag.origH + dy))}px` });
            return;
          }
          if (drag.axis === "x") {
            onTokens({ "--hero-size": `${Math.max(40, Math.round(drag.origSize + dx))}px` });
            return;
          }
          const d = Math.round(dx);
          const patch: Record<string, string> = {
            "--hero-size": `${Math.max(40, drag.origSize + d)}px`,
          };
          if (drag.lockH) patch["--hero-h"] = `${Math.max(40, drag.origH + d)}px`;
          onTokens(patch);
          return;
        }
        const token = SIZE[drag.part];
        if (!token) return;
        onTokens({ [token]: `${Math.max(40, Math.round(drag.origSize + dx))}px` });
        return;
      }
      const move = MOVE[drag.part];
      if (!move) return;
      onTokens({
        [move.x]: `${Math.round(drag.origX + dx)}px`,
        [move.y]: `${Math.round(drag.origY + dy)}px`,
      });
    };

    const onUp = () => {
      session.current = null;
    };

    stage.addEventListener("pointerdown", onDown, true);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    return () => {
      stage.removeEventListener("pointerdown", onDown, true);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
    };
  }, [onGestureStart, onSelect, onTokens, stageRef, tokensRef, zoomRef]);
}
