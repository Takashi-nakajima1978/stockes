import { stat } from "node:fs/promises";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

const compress = promisify(gzip);

export function responseRepresentation(body) {
  let compressed;
  return { body, gzip() { compressed ||= compress(body); return compressed; } };
}

export function createCachedJsonSender() {
  const representations = new WeakMap();
  return async (res, statusCode, payload) => {
    let representation = representations.get(payload);
    if (!representation) {
      representation = responseRepresentation(Buffer.from(JSON.stringify(payload)));
      representations.set(payload, representation);
    }
    const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", vary: "Accept-Encoding" };
    let body = representation.body;
    if (res.shouldGzip && body.length >= 1024) {
      body = await representation.gzip();
      headers["content-encoding"] = "gzip";
    }
    if (res.destroyed) return;
    res.writeHead(statusCode, { ...headers, "content-length": body.length });
    res.end(body);
  };
}

export function createVersionedLoader({ limit = 16, now = Date.now } = {}) {
  const cached = new Map();
  const pending = new Map();
  return {
    clear() { cached.clear(); pending.clear(); },
    async load(name, files, build, ttl = 60000) {
      const versions = await Promise.all(files.map(async (file) => {
        try {
          const metadata = await stat(file);
          return `${metadata.ino}:${metadata.mtimeMs}:${metadata.size}`;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          return "missing";
        }
      }));
      const key = `${name}:${Math.floor(now() / ttl)}:${versions.join("|")}`;
      if (cached.get(name)?.key === key) return cached.get(name).value;
      if (!pending.has(key)) {
        const task = Promise.resolve().then(build).then((value) => {
          if (cached.size >= limit && !cached.has(name)) cached.delete(cached.keys().next().value);
          cached.set(name, { key, value });
          return value;
        }).finally(() => pending.delete(key));
        pending.set(key, task);
      }
      return pending.get(key);
    },
  };
}
