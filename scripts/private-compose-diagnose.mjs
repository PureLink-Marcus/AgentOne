import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const knownHosts=path.resolve('output/demo/known_hosts');
if(!host||!user||!key)throw new Error('SSH-Ziel fehlt');
const command=`set -eu
c=$(docker ps --format '{{.Names}}' | grep '^guenni-app-' | head -1)
test -n "$c"
docker inspect -f 'container={{.Name}} project={{index .Config.Labels "com.docker.compose.project"}} workingDir={{index .Config.Labels "com.docker.compose.project.working_dir"}} configFiles={{index .Config.Labels "com.docker.compose.project.config_files"}} image={{.Config.Image}}' "$c"
cd /data/coolify/services/gohudyegrv06p4jikisfk2x1
grep -n 'purelink/agentone' docker-compose.yml || true
grep -n '^  [a-z].*:' docker-compose.yml | head -20`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:30_000});
if(result.status!==0)throw new Error(`Compose-Diagnose fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-500)}`);
process.stdout.write(result.stdout||'');
