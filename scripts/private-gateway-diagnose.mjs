import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const knownHosts=path.resolve('output/demo/known_hosts');
const command=`set -eu; c=$(docker ps -a --format '{{.Names}}' | grep '^fressi-gateway-' | head -1); test -n "$c"; docker inspect -f 'name={{.Name}} status={{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}} finished={{.State.FinishedAt}} restart={{.RestartCount}}' "$c"; docker logs --tail 80 "$c" 2>&1 | sed -E 's/(token|secret|password|api[-_]?key)[=:][^ ]+/\\1=[REDACTED]/Ig'`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:40_000});
process.stdout.write((result.stdout||'').slice(-8000));
if(result.status!==0)throw new Error(`Gatewaydiagnose fehlgeschlagen: ${(result.stderr||'').slice(-500)}`);
