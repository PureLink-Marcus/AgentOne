import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const knownHosts=path.resolve('output/demo/known_hosts');
const command=`set -eu; c=$(docker ps -a --format '{{.Names}}' | grep '^fressi-gateway-' | head -1); test -n "$c"; docker start "$c" >/dev/null; i=0; while [ $i -lt 30 ]; do s=$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$c"); [ "$s" = 'running|healthy' ] && { echo "FRESSI_GATEWAY|$s"; exit 0; }; i=$((i+1)); sleep 2; done; docker inspect -f 'FRESSI_GATEWAY|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|exit={{.State.ExitCode}}' "$c"; exit 1`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:80_000});
process.stdout.write(result.stdout||'');
if(result.status!==0)throw new Error(`Fressi-Gateway konnte nicht repariert werden: ${(result.stderr||'').slice(-600)}`);
