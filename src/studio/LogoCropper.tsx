import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  name: string;
  onCancel: () => void;
  onApply: (blob: Blob) => void;
};

const OUT = 512;
const VIEW = 280;

export function LogoCropper({ src, name, onCancel, onApply }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReady(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [src]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (event.clientX - drag.current.x),
      y: drag.current.oy + (event.clientY - drag.current.y),
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  async function apply() {
    const image = imgRef.current;
    if (!image || !ready) return;
    setBusy(true);
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      return;
    }
    const scale = (VIEW / Math.min(image.naturalWidth, image.naturalHeight)) * zoom;
    const drawW = image.naturalWidth * scale * (OUT / VIEW);
    const drawH = image.naturalHeight * scale * (OUT / VIEW);
    const dx = (OUT - drawW) / 2 + offset.x * (OUT / VIEW);
    const dy = (OUT - drawH) / 2 + offset.y * (OUT / VIEW);
    ctx.clearRect(0, 0, OUT, OUT);
    ctx.drawImage(image, dx, dy, drawW, drawH);
    canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (blob) onApply(blob);
      },
      "image/png",
      1,
    );
  }

  return (
    <div className="logo-crop-mask" role="dialog" aria-modal="true" aria-label={`Crop ${name}`}>
      <div className="logo-crop">
        <p className="logo-crop-title">Crop {name}</p>
        <p className="logo-crop-help">Drag to reposition. Zoom fills the square the way the bar crops a crest.</p>
        <div
          className="logo-crop-view"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={() => setReady(true)}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            }}
          />
        </div>
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
        <div className="logo-crop-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary-btn" onClick={() => void apply()} disabled={!ready || busy}>
            {busy ? "Saving…" : "Save crop"}
          </button>
        </div>
      </div>
    </div>
  );
}
