import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';
const env=loadEnv(path.resolve('.')),host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP,user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER,key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH,knownHosts=path.resolve('output/demo/known_hosts');if(!host||!user||!key)throw new Error('SSH-Ziel fehlt');
const command=`set -eu
dir=/data/coolify/services/gohudyegrv06p4jikisfk2x1
file="$dir/docker-compose.yml"
test -f "$file"
test "$(grep -c "purelink/agentone:2026.11.07-85" "$file")" -eq 4
cp "$file" "$dir/docker-compose.release85.backup.yml"
sed -i "s/purelink\\/agentone:2026.11.07-85/purelink\\/agentone:2026.11.07-86/g" "$file"
test "$(grep -c "purelink/agentone:2026.11.07-86" "$file")" -eq 4
cd "$dir"
docker compose up -d --no-deps fressi-app fressi-access guenni-app guenni-access
i=0; ready=0
while [ "$i" -lt 60 ]; do ready=$(docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | awk -F'|' '$1 ~ /^(fressi|guenni)-(app|access)-/ && $2 == "purelink/agentone:2026.11.07-86" && $3 ~ /\\(healthy\\)/ {count++} END {print count+0}'); [ "$ready" -eq 4 ] && break; i=$((i+1)); sleep 2; done
docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | grep -E '^(fressi|guenni)-(app|access)-'
test "$ready" -eq 4`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:180_000});if(result.status!==0)throw new Error(`Release-86-Rollout fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-1200)}`);process.stdout.write(result.stdout||'');
