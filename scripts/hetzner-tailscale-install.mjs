import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const knownHosts=path.resolve('output/demo/known_hosts');
if(!host||!user||!key)throw new Error('SSH-Zielkonfiguration unvollständig');
const command=`set -eu
if command -v tailscale >/dev/null 2>&1; then tailscale version | head -1; systemctl enable --now tailscaled; echo TAILSCALE_READY_NOT_CONNECTED; exit 0; fi
. /etc/os-release
case "$ID" in ubuntu|debian) ;; *) echo "UNSUPPORTED_OS:$ID"; exit 2;; esac
install -d -m 0755 /usr/share/keyrings
curl -fsSL "https://pkgs.tailscale.com/stable/$ID/$VERSION_CODENAME.noarmor.gpg" -o /usr/share/keyrings/tailscale-archive-keyring.gpg
curl -fsSL "https://pkgs.tailscale.com/stable/$ID/$VERSION_CODENAME.tailscale-keyring.list" -o /etc/apt/sources.list.d/tailscale.list
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y tailscale
systemctl enable --now tailscaled
tailscale version | head -1
echo TAILSCALE_READY_NOT_CONNECTED`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:180_000});
console.log((result.stdout||'').trim());
if(result.status!==0)throw new Error(`Tailscale-Installation fehlgeschlagen (${result.status}): ${(result.stderr||'').slice(-600)}`);
