const ALLOWED_SHARES = new Set(["nasne_home", "share1", "share2"]);

function isPrivateIpv4(value) {
  const parts = String(value || "").trim().split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

export function buildUbuntuNasCommands(host, share) {
  const address = String(host || "").trim();
  if (!isPrivateIpv4(address)) throw new Error("NASのIPアドレスは家庭内LANのIPv4アドレスで入力してください。");
  if (!ALLOWED_SHARES.has(share)) throw new Error("保存先はnasne_home、share1、share2から選択してください。");

  const mountPath = `/mnt/nasne-${share}`;
  const sharePath = `//${address}/${share}`;
  return {
    mount: `sudo apt-get update && sudo apt-get install -y cifs-utils
sudo mkdir -p ${mountPath}
sudo mount -t cifs ${sharePath} ${mountPath} -o guest,uid=$(id -u),gid=$(id -g),file_mode=0660,dir_mode=0770`,
    persist: `NAS_SHARE='${sharePath}'
MOUNT_POINT='${mountPath}'
ENTRY="$NAS_SHARE $MOUNT_POINT cifs guest,_netdev,nofail,x-systemd.automount,uid=$(id -u),gid=$(id -g),file_mode=0660,dir_mode=0770 0 0"
if ! grep -qF "$NAS_SHARE $MOUNT_POINT cifs" /etc/fstab; then
  printf '%s\\n' "$ENTRY" | sudo tee -a /etc/fstab >/dev/null
fi
sudo systemctl daemon-reload
sudo mount "$MOUNT_POINT"`,
    compose: `NAS_BACKUP_HOST_PATH=${mountPath} docker compose -f docker-compose.yml -f docker-compose.nas.yml up -d --build`,
  };
}
