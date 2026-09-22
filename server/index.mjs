import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = process.env.DATA_DIR || path.join(ROOT, "data");
const DIST = path.join(ROOT, "dist");
const META = path.join(DATA, "logos.json");
const IMAGES = path.join(DATA, "images");
const PORT = Number(process.env.PORT || 8787);
const STAFF_KEY = process.env.STAFF_KEY || "";
const MAX_BODY = 6 * 1024 * 1024;
const MIME_OK = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function ensureStore() {
  fs.mkdirSync(IMAGES, { recursive: true });
  if (!fs.existsSync(META)) fs.writeFileSync(META, `${JSON.stringify({ logos: [] }, null, 2)}\n`);
}

function readStore() {
  ensureStore();
  const parsed = JSON.parse(fs.readFileSync(META, "utf8"));
  return { logos: Array.isArray(parsed.logos) ? parsed.logos : [] };
}

function writeStore(store) {
  fs.writeFileSync(META, `${JSON.stringify(store, null, 2)}\n`);
}

function safeId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : null;
}

function newId() {
  return `logo-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function publicLogo(row) {
  return {
    id: row.id,
    name: row.name,
    aliases: row.aliases ?? [],
    tags: row.tags ?? [],
    uploadedAt: row.uploadedAt,
    updatedAt: row.updatedAt,
    url: `/api/logos/${row.id}/image?v=${row.updatedAt}`,
  };
}

function allowWrite(req) {
  if (!STAFF_KEY) return true;
  const got = req.headers["x-desk-key"];
  if (typeof got !== "string" || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(STAFF_KEY);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function send(res, status, body, headers = {}) {
  const json = typeof body === "object" && !Buffer.isBuffer(body);
  const data = json ? JSON.stringify(body) : body;
  res.writeHead(status, {
    "Content-Type": json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    ...headers,
  });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const err = new Error("too large");
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function strings(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function serveStatic(res, urlPath) {
  let next = urlPath === "/" ? "/index.html" : urlPath;
  let file = path.normalize(path.join(DIST, decodeURIComponent(next)));
  if (!file.startsWith(DIST)) {
    send(res, 403, "no");
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, "index.html");
  }
  if (!fs.existsSync(file)) {
    send(res, 404, "missing");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

ensureStore();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname === "/api/logos/status" && req.method === "GET") {
      const { logos } = readStore();
      send(res, 200, { locked: Boolean(STAFF_KEY), authorized: allowWrite(req), count: logos.length });
      return;
    }

    if (url.pathname === "/api/logos" && req.method === "GET") {
      send(res, 200, { logos: readStore().logos.map(publicLogo) });
      return;
    }

    const imageHit = url.pathname.match(/^\/api\/logos\/([^/]+)\/image$/);
    if (imageHit && req.method === "GET") {
      const id = safeId(imageHit[1]);
      const row = readStore().logos.find((item) => item.id === id);
      const file = id ? path.join(IMAGES, id) : "";
      if (!row || !file || !fs.existsSync(file)) {
        send(res, 404, "missing");
        return;
      }
      res.writeHead(200, {
        "Cache-Control": "no-cache",
        "Content-Type": MIME_OK.has(row.mime) ? row.mime : "image/png",
      });
      fs.createReadStream(file).pipe(res);
      return;
    }

    if (url.pathname === "/api/logos" && req.method === "POST") {
      if (!allowWrite(req)) {
        send(res, 401, { error: "desk-key" });
        return;
      }
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      const buf = Buffer.from(String(body.imageBase64 || ""), "base64");
      if (!buf.length) {
        send(res, 400, { error: "image" });
        return;
      }
      const id = safeId(body.id) || newId();
      ensureStore();
      fs.writeFileSync(path.join(IMAGES, id), buf);
      const now = Date.now();
      const row = {
        id,
        name: String(body.name || "Untitled crest").trim() || "Untitled crest",
        aliases: strings(body.aliases),
        tags: strings(body.tags),
        uploadedAt: Number(body.uploadedAt) || now,
        updatedAt: now,
        mime: MIME_OK.has(body.mime) ? body.mime : "image/png",
      };
      const store = readStore();
      store.logos = store.logos.filter((item) => item.id !== id);
      store.logos.push(row);
      writeStore(store);
      send(res, 200, publicLogo(row));
      return;
    }

    const itemHit = url.pathname.match(/^\/api\/logos\/([^/]+)$/);
    if (itemHit && req.method === "PATCH") {
      if (!allowWrite(req)) {
        send(res, 401, { error: "desk-key" });
        return;
      }
      const id = safeId(itemHit[1]);
      const store = readStore();
      const row = store.logos.find((item) => item.id === id);
      if (!row) {
        send(res, 404, { error: "missing" });
        return;
      }
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      if (body.name) row.name = String(body.name).trim() || row.name;
      if (Array.isArray(body.aliases)) row.aliases = strings(body.aliases);
      if (Array.isArray(body.tags)) row.tags = strings(body.tags);
      if (body.imageBase64) {
        const buf = Buffer.from(String(body.imageBase64), "base64");
        if (buf.length) fs.writeFileSync(path.join(IMAGES, id), buf);
        if (MIME_OK.has(body.mime)) row.mime = body.mime;
      }
      row.updatedAt = Date.now();
      writeStore(store);
      send(res, 200, publicLogo(row));
      return;
    }

    if (itemHit && req.method === "DELETE") {
      if (!allowWrite(req)) {
        send(res, 401, { error: "desk-key" });
        return;
      }
      const id = safeId(itemHit[1]);
      const store = readStore();
      store.logos = store.logos.filter((item) => item.id !== id);
      writeStore(store);
      const file = id ? path.join(IMAGES, id) : "";
      if (file && fs.existsSync(file)) fs.unlinkSync(file);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      serveStatic(res, url.pathname);
      return;
    }

    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, err?.status || 500, { error: err instanceof Error ? err.message : "server" });
  }
});

server.listen(PORT, () => {
  console.log(`Ranking Studio on ${PORT} · shared logos in ${DATA}`);
});
