import { useEffect, useRef, useState } from "react";
import { autoOutline, canvasPng, freehandOutline } from "./logoOutline";

type Props = {
  src: string;
  name: string;
  onCancel: () => void;
  onApply: (blob: Blob) => void;
};

type Mode = "square" | "auto" | "draw";

const OUT = 512;
const VIEW = 280;

export function LogoCropper({ src, name, onCancel, onApply }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const drawing = useRef(false);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("auto");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [tolerance, setTolerance] = useState(42);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReady(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setPoints([]);
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
    if (mode !== "square") return;
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
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
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (event.clientX - drag.current.x),
      y: drag.current.oy + (event.clientY - drag.current.y),
    });
  }

  function onPointerUp() {
    drawing.current = false;
    drag.current = null;
  }

  async function applySquare() {
    const image = imgRef.current;
    if (!image || !ready) return null;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const scale = (VIEW / Math.min(image.naturalWidth, image.naturalHeight)) * zoom;
    const drawW = image.naturalWidth * scale * (OUT / VIEW);
    const drawH = image.naturalHeight * scale * (OUT / VIEW);
    ctx.clearRect(0, 0, OUT, OUT);
    ctx.drawImage(
      image,
      (OUT - drawW) / 2 + offset.x * (OUT / VIEW),
      (OUT - drawH) / 2 + offset.y * (OUT / VIEW),
      drawW,
      drawH,
    );
    return canvasPng(canvas);
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
        blob = await applySquare();
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
        : "Drag to reposition. Zoom fills the square the way the bar crops a crest.";

  return (
    <div className="logo-crop-mask" role="dialog" aria-modal="true" aria-label={`Crop ${name}`}>
      <div className="logo-crop">
        <p className="logo-crop-title">Crop {name}</p>
        <p className="logo-crop-help">{help}</p>
        <div className="logo-crop-modes">
          <button type="button" className={mode === "auto" ? "is-on" : undefined} onClick={() => setMode("auto")}>
            Auto outline
          </button>
          <button type="button" className={mode === "draw" ? "is-on" : undefined} onClick={() => setMode("draw")}>
            Draw outline
          </button>
          <button type="button" className={mode === "square" ? "is-on" : undefined} onClick={() => setMode("square")}>
            Square
          </button>
        </div>
        <div
          className={mode === "draw" ? "logo-crop-view is-draw" : "logo-crop-view"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {mode === "auto" ? <canvas ref={previewRef} width={VIEW} height={VIEW} /> : null}
          <img
            ref={imgRef}
            src={src}
            alt=""
            crossOrigin="anonymous"
            draggable={false}
            hidden={mode === "auto"}
            onLoad={() => setReady(true)}
            style={
              mode === "square"
                ? { transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }
                : undefined
            }
          />
          {mode === "draw" && points.length > 1 ? (
            <svg className="logo-crop-path" viewBox={`0 0 ${VIEW} ${VIEW}`}>
              <polygon points={points.map((point) => `${point.x},${point.y}`).join(" ")} />
            </svg>
          ) : null}
        </div>
        {mode === "square" ? (
          <label className="logo-crop-zoom">
            <span>Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.02}
              value={zoom}
              onChange={(e) => setZoom(Number.parseFloat(e.target.value))}
            />
          </label>
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
