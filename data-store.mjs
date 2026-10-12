import { readFile, writeFile, rename, mkdir, stat, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function createSerialQueue() {
  let tail = Promise.resolve();
  return (task) => {
    const result = tail.then(() => task());
    tail = result.catch(() => {});
    return result;
  };
}

export function createDataStore(directory) {
  const root = path.resolve(directory);
  const exclusive = createSerialQueue();
  const parsed = new Map();
  const pending = new Map();
  const resolve = (file) => {
    const resolved = path.resolve(root, file);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("Invalid data path");
    return resolved;
  };
  return {
    directory: root,
    exclusive,
    invalidate() { parsed.clear(); pending.clear(); },
    async readJson(file) {
      const target = resolve(file);
      const info = await stat(target);
      const version = `${info.ino}:${info.mtimeMs}:${info.size}`;
      if (parsed.get(target)?.version === version) return structuredClone(parsed.get(target).value);
      const key = `${target}:${version}`;
      if (!pending.has(key)) {
        const task = readFile(target, "utf8").then((raw) => {
          const value = JSON.parse(raw);
          if (info.size < 16 * 1024 * 1024) {
            if (parsed.size >= 24) parsed.delete(parsed.keys().next().value);
            parsed.set(target, { version, value });
          }
          return value;
        }).finally(() => pending.delete(key));
        pending.set(key, task);
      }
      return structuredClone(await pending.get(key));
    },
    write(file, contents) {
      const target = resolve(file);
      return exclusive(async () => {
        await mkdir(path.dirname(target), { recursive: true });
        const temporary = `${target}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, contents, { mode: 0o600 });
          await rename(temporary, target);
          parsed.delete(target);
        } finally {
          await rm(temporary, { force: true });
        }
      });
    },
  };
}
