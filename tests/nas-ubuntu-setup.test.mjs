import test from "node:test";
import assert from "node:assert/strict";
import { buildUbuntuNasCommands } from "../public/nas-ubuntu-setup.mjs";

test("Ubuntu NAS setup commands use the configured private address and selected share", () => {
  const commands = buildUbuntuNasCommands("192.168.100.139", "share2");
  assert.match(commands.mount, /apt-get install -y cifs-utils/);
  assert.match(commands.mount, /\/\/192\.168\.100\.139\/share2 \/mnt\/nasne-share2/);
  assert.match(commands.persist, /x-systemd\.automount/);
  assert.match(commands.compose, /NAS_BACKUP_HOST_PATH=\/mnt\/nasne-share2 docker compose/);
  const internalShare = buildUbuntuNasCommands("192.168.1.20", "share1");
  assert.match(internalShare.compose, /NAS_BACKUP_HOST_PATH=\/mnt\/nasne-share1/);
});

test("Ubuntu NAS setup command generation rejects external hosts and shell input", () => {
  assert.throws(() => buildUbuntuNasCommands("example.com", "share2"), /家庭内LAN/);
  assert.throws(() => buildUbuntuNasCommands("192.168.1.10; touch \/tmp\/bad", "share2"), /家庭内LAN/);
  assert.throws(() => buildUbuntuNasCommands("192.168.1.10", "share2; touch \/tmp\/bad"), /保存先/);
});
