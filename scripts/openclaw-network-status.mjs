import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';
const env=loadEnv(path.resolve('.'));const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;const knownHosts=path.resolve('output/demo/known_hosts');
const command=`set -eu; for pattern in '^jarvis-access-' '^agentone-personal-gateway-'; do c=$(docker ps --format '{{.Names}}' | grep "$pattern" | head -1); test -n "$c"; echo "$c"; docker inspect -f '{{range $name,$net := .NetworkSettings.Networks}}{{println $name $net.IPAddress}}{{end}}' "$c"; done`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:30_000});
console.log((result.stdout||result.stderr||'').trim());if(result.status!==0)process.exit(result.status||1);
