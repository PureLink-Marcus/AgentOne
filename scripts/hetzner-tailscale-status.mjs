import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const knownHosts=path.resolve('output/demo/known_hosts');
if(!host||!user||!key)throw new Error('SSH-Zielkonfiguration unvollständig');
const command=`if ! command -v tailscale >/dev/null 2>&1; then echo 'TAILSCALE_NOT_INSTALLED'; exit 0; fi; ip=$(tailscale ip -4 2>/dev/null || true); if [ -n "$ip" ]; then echo "TAILSCALE_CONNECTED|$ip"; else echo 'TAILSCALE_INSTALLED_NOT_CONNECTED'; fi`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:30_000});
if(result.status!==0)throw new Error(`Tailscale-Prüfung fehlgeschlagen (${result.status})`);
console.log((result.stdout||'').trim());
