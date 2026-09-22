const OUT = 512;
const PAD = 18;

function pixel(data: Uint8ClampedArray, i: number) {
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

function dist(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function drawSource(image: HTMLImageElement) {
  const side = Math.min(1024, Math.max(image.naturalWidth, image.naturalHeight, 1));
  const scale = side / Math.max(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  try {
    ctx.getImageData(0, 0, 1, 1);
  } catch {
    return null;
  }
  return { canvas, ctx };
}

function alreadyCut(data: Uint8ClampedArray) {
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 12) clear += 1;
  }
  return clear / (data.length / 4) > 0.08;
}

function floodBackground(ctx: CanvasRenderingContext2D, tolerance: number) {
  const { width: w, height: h } = ctx.canvas;
  const image = ctx.getImageData(0, 0, w, h);
  const { data } = image;
  if (alreadyCut(data)) return image;

  const samples = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), 0],
    [Math.floor(w / 2), h - 1],
    [0, Math.floor(h / 2)],
    [w - 1, Math.floor(h / 2)],
  ].map(([x, y]) => pixel(data, (y * w + x) * 4));

  const seen = new Uint8Array(w * h);
  const queue: number[] = [];

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (seen[idx]) return;
    const p = pixel(data, idx * 4);
    if (p.a < 12 || samples.some((bg) => dist(p, bg) <= tolerance)) {
      seen[idx] = 1;
      queue.push(idx);
    }
  };

  for (let x = 0; x < w; x += 1) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    push(0, y);
    push(w - 1, y);
  }

  while (queue.length) {
    const idx = queue.pop() as number;
    const x = idx % w;
    const y = (idx - x) / w;
    data[idx * 4 + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  return image;
}

function bounds(data: Uint8ClampedArray, w: number, h: number) {
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] < 16) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX: maxX + 1, maxY: maxY + 1 };
}

export function fitTransparent(source: CanvasImageSource, sw: number, sh: number, sx = 0, sy = 0): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = OUT;
  canvas.height = OUT;
  const ctx = canvas.getContext("2d");
  if (!ctx || sw < 1 || sh < 1) return canvas;
  const inner = OUT - PAD * 2;
  const scale = Math.min(inner / sw, inner / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.clearRect(0, 0, OUT, OUT);
  ctx.drawImage(source, sx, sy, sw, sh, (OUT - dw) / 2, (OUT - dh) / 2, dw, dh);
  return canvas;
}

export function autoOutline(image: HTMLImageElement, tolerance: number): HTMLCanvasElement | null {
  const drawn = drawSource(image);
  if (!drawn) return null;
  const cut = floodBackground(drawn.ctx, tolerance);
  drawn.ctx.putImageData(cut, 0, 0);
  const box = bounds(cut.data, drawn.canvas.width, drawn.canvas.height);
  if (!box) return fitTransparent(image, image.naturalWidth, image.naturalHeight);
  return fitTransparent(drawn.canvas, box.maxX - box.minX, box.maxY - box.minY, box.minX, box.minY);
}

export function freehandOutline(
  image: HTMLImageElement,
  points: { x: number; y: number }[],
  view: number,
): HTMLCanvasElement | null {
  if (points.length < 3) return null;
  const drawn = drawSource(image);
  if (!drawn) return null;
  const { canvas, ctx } = drawn;
  const scale = Math.min(view / image.naturalWidth, view / image.naturalHeight);
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  const ox = (view - dw) / 2;
  const oy = (view - dh) / 2;
  const toCanvas = (point: { x: number; y: number }) => ({
    x: ((point.x - ox) / scale) * (canvas.width / image.naturalWidth),
    y: ((point.y - oy) / scale) * (canvas.height / image.naturalHeight),
  });
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  const first = toCanvas(points[0]);
  ctx.moveTo(first.x, first.y);
  for (const point of points.slice(1)) {
    const next = toCanvas(point);
    ctx.lineTo(next.x, next.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const cut = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const box = bounds(cut.data, canvas.width, canvas.height);
  if (!box) return fitTransparent(canvas, canvas.width, canvas.height);
  return fitTransparent(canvas, box.maxX - box.minX, box.maxY - box.minY, box.minX, box.minY);
}

export function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not save that crest"))), "image/png", 1);
  });
}
