import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const authKey=env.TAILSCALE_HETZNER_AUTH_KEY;
const knownHosts=path.resolve('output/demo/known_hosts');
if(!host||!user||!key)throw new Error('SSH-Zielkonfiguration unvollständig');
if(!authKey||!/^tskey-/.test(authKey))throw new Error('TAILSCALE_HETZNER_AUTH_KEY fehlt oder ist ungültig');
const command=`set -eu; IFS= read -r TS_AUTH_KEY; export TS_AUTH_KEY; tailscale up --auth-key="$TS_AUTH_KEY" --hostname=agentone-hetzner --accept-dns=true; unset TS_AUTH_KEY; ip=$(tailscale ip -4); test -n "$ip"; echo "TAILSCALE_CONNECTED|$ip"`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{input:`${authKey}\n`,encoding:'utf8',timeout:60_000});
if(result.status!==0)throw new Error(`Hetzner-Tailnet-Beitritt fehlgeschlagen (${result.status}): ${(result.stderr||'').slice(-500)}`);
console.log((result.stdout||'').trim());
