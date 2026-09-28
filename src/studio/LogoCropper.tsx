import { useEffect, useRef, useState } from "react";
import {
  autoOutline,
  canvasPng,
  containFrameCrop,
  freehandOutline,
  rasterizeFrameCrop,
  type FrameCrop,
} from "./logoOutline";

type Props = {
  src: string;
  name: string;
  onCancel: () => void;
  onApply: (blob: Blob) => void;
};

type Mode = "frame" | "auto" | "draw";

const OUT = 512;
const VIEW = 280;

export function LogoCropper({ src, name, onCancel, onApply }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const drawing = useRef(false);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("frame");
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [crop, setCrop] = useState<FrameCrop>({ cx: 0.5, cy: 0.5, w: 1 });
  const [frame, setFrame] = useState({ left: 0, top: 0, w: 160, h: 160 });
  const [tolerance, setTolerance] = useState(42);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sized = useRef(false);

  useEffect(() => {
    sized.current = false;
    setReady(false);
    setPoints([]);
    setCrop({ cx: 0.5, cy: 0.5, w: 1 });
  }, [src]);

  useEffect(() => {
    if (mode !== "auto" || !ready || !imgRef.current || !previewRef.current) return;
    const cut = autoOutline(imgRef.current, tolerance);
    const canvas = previewRef.current;
    const ctx = canvas.getContext("2d");
    if (!cut || !ctx) return;
    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.drawImage(cut, 0, 0, VIEW, VIEW);
  }, [mode, tolerance, ready, src]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || mode !== "frame") return undefined;
    const layout = () => {
      const stageW = stage.clientWidth;
      const stageH = stage.clientHeight;
      const frameH = Math.min(stageH * 0.62, stageW * 0.62);
      const frameW = frameH;
      setFrame({ left: (stageW - frameW) / 2, top: (stageH - frameH) / 2, w: frameW, h: frameH });
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [mode, ready]);

  function onImageLoad(image: HTMLImageElement) {
    if (!image.naturalWidth) return;
    setNatural({ w: image.naturalWidth, h: image.naturalHeight });
    if (!sized.current) {
      sized.current = true;
      setCrop(containFrameCrop(image.naturalWidth, image.naturalHeight));
    }
    setReady(true);
  }

  function bindImage(image: HTMLImageElement | null) {
    imgRef.current = image;
    if (image?.complete && image.naturalWidth) onImageLoad(image);
  }

  function viewPoint(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === "draw") {
      drawing.current = true;
      setPoints([viewPoint(event)]);
      return;
    }
    if (mode !== "frame") return;
    drag.current = { x: event.clientX, y: event.clientY, cx: crop.cx, cy: crop.cy };
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (mode === "draw" && drawing.current) {
      const next = viewPoint(event);
      setPoints((prev) => {
        const last = prev[prev.length - 1];
        if (last && Math.hypot(next.x - last.x, next.y - last.y) < 2) return prev;
        return [...prev, next];
      });
      return;
    }
    if (!drag.current || mode !== "frame") return;
    setCrop((prev) => ({
      ...prev,
      cx: drag.current!.cx + (event.clientX - drag.current!.x) / frame.w,
      cy: drag.current!.cy + (event.clientY - drag.current!.y) / frame.h,
    }));
  }

  function onPointerUp() {
    drawing.current = false;
    drag.current = null;
    setDragging(false);
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (mode !== "frame") return;
    event.preventDefault();
    const next = Math.min(4, Math.max(0.1, crop.w * (event.deltaY < 0 ? 1.05 : 1 / 1.05)));
    setCrop((prev) => ({ ...prev, w: next }));
  }

  async function apply() {
    const image = imgRef.current;
    if (!image || !ready) return;
    setBusy(true);
    try {
      let blob: Blob | null = null;
      if (mode === "auto") {
        const cut = autoOutline(image, tolerance);
        blob = cut ? await canvasPng(cut) : null;
      } else if (mode === "draw") {
        const cut = freehandOutline(image, points, VIEW);
        blob = cut ? await canvasPng(cut) : null;
      } else {
        blob = await canvasPng(rasterizeFrameCrop(image, crop, OUT));
      }
      if (blob) onApply(blob);
    } finally {
      setBusy(false);
    }
  }

  const help =
    mode === "auto"
      ? "Drops the flat background and keeps the crest. Raise Drop more if a halo stays."
      : mode === "draw"
        ? "Trace around the crest with your finger or mouse, then save."
        : "Drag to move. Scale fills the bar the way the roster crop does. Outside the frame stays faded.";

  const imgW = crop.w * frame.w;
  const dimStyle = {
    width: `${imgW}px`,
    left: `${frame.left + crop.cx * frame.w}px`,
    top: `${frame.top + crop.cy * frame.h}px`,
  };
  const fullStyle = {
    width: `${imgW}px`,
    left: `${crop.cx * frame.w}px`,
    top: `${crop.cy * frame.h}px`,
  };

  return (
    <div className="logo-crop-mask" role="dialog" aria-modal="true" aria-label={`Crop ${name}`}>
      <div className="logo-crop">
        <p className="logo-crop-title">Crop {name}</p>
        <p className="logo-crop-help">{help}</p>
        <div className="logo-crop-modes">
          <button type="button" className={mode === "frame" ? "is-on" : undefined} onClick={() => setMode("frame")}>
            Frame
          </button>
          <button type="button" className={mode === "auto" ? "is-on" : undefined} onClick={() => setMode("auto")}>
            Auto outline
          </button>
          <button type="button" className={mode === "draw" ? "is-on" : undefined} onClick={() => setMode("draw")}>
            Draw outline
          </button>
        </div>

        {mode === "frame" ? (
          <div
            ref={stageRef}
            className={dragging ? "logo-crop-stage is-dragging" : "logo-crop-stage"}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            <img className="logo-crop-placed is-dim" src={src} alt="" draggable={false} style={dimStyle} />
            <div
              className="logo-crop-frame"
              style={{ left: frame.left, top: frame.top, width: frame.w, height: frame.h }}
            >
              <img className="logo-crop-placed" src={src} alt="" draggable={false} style={fullStyle} />
            </div>
            <img ref={bindImage} src={src} alt="" crossOrigin="anonymous" hidden onLoad={(event) => onImageLoad(event.currentTarget)} />
          </div>
        ) : (
          <div
            className={mode === "draw" ? "logo-crop-view is-draw" : "logo-crop-view"}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {mode === "auto" ? <canvas ref={previewRef} width={VIEW} height={VIEW} /> : null}
            <img
              ref={bindImage}
              src={src}
              alt=""
              crossOrigin="anonymous"
              draggable={false}
              hidden={mode === "auto"}
              onLoad={(event) => onImageLoad(event.currentTarget)}
            />
            {mode === "draw" && points.length > 1 ? (
              <svg className="logo-crop-path" viewBox={`0 0 ${VIEW} ${VIEW}`}>
                <polygon points={points.map((point) => `${point.x},${point.y}`).join(" ")} />
              </svg>
            ) : null}
          </div>
        )}

        {mode === "frame" ? (
          <div className="logo-crop-controls">
            <label className="logo-crop-zoom">
              <span>Scale</span>
              <input
                type="range"
                min={10}
                max={400}
                step={1}
                value={Math.round(crop.w * 100)}
                onChange={(event) => setCrop((prev) => ({ ...prev, w: Number(event.target.value) / 100 }))}
              />
            </label>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setCrop(containFrameCrop(natural.w, natural.h))}
            >
              Reset
            </button>
          </div>
        ) : null}
        {mode === "auto" ? (
          <label className="logo-crop-zoom">
            <span>Drop background</span>
            <input
              type="range"
              min={12}
              max={96}
              step={1}
              value={tolerance}
              onChange={(e) => setTolerance(Number.parseInt(e.target.value, 10))}
            />
          </label>
        ) : null}
        {mode === "draw" ? (
          <button type="button" className="ghost-btn logo-crop-clear" onClick={() => setPoints([])}>
            Clear outline
          </button>
        ) : null}
        <div className="logo-crop-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => void apply()}
            disabled={!ready || busy || (mode === "draw" && points.length < 3)}
          >
            {busy ? "Saving…" : "Save crop"}
          </button>
        </div>
      </div>
    </div>
  );
}
