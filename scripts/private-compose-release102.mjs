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
dir=/data/coolify/services/gohudyegrv06p4jikisfk2x1
file="$dir/docker-compose.yml"
envfile="$dir/.env"
test -f "$file"
test -f "$envfile"
image101=$(grep -c "purelink/agentone:2026.11.07-101" "$file" || true)
image102=$(grep -c "purelink/agentone:2026.11.07-102" "$file" || true)
releaseLines=$(grep -c "AGENTONE_RELEASE" "$file" || true)
internalTokenLines=$(grep -c "AGENTONE_INTERNAL_API_TOKEN:" "$file" || true)
healthKeyLines=$(grep -c "AGENTONE_HEALTH_MASTER_KEY:" "$file" || true)
healthKeyEnvLines=$(grep -c '^AGENTONE_HEALTH_MASTER_KEY=' "$envfile" || true)
echo "preflight image101=$image101 image102=$image102 releaseLines=$releaseLines internalTokenLines=$internalTokenLines healthKeyLines=$healthKeyLines healthKeyEnvLines=$healthKeyEnvLines"
test "$((image101 + image102))" -eq 4
test "$releaseLines" -eq 2
test "$internalTokenLines" -eq 2
test "$healthKeyLines" -eq 0 -o "$healthKeyLines" -eq 2
test "$healthKeyEnvLines" -eq 0 -o "$healthKeyEnvLines" -eq 1
if [ ! -f "$dir/docker-compose.release101.backup.yml" ]; then cp "$file" "$dir/docker-compose.release101.backup.yml"; fi
if [ ! -f "$dir/.env.release101.backup" ]; then cp "$envfile" "$dir/.env.release101.backup"; chmod 600 "$dir/.env.release101.backup"; fi
if [ "$healthKeyEnvLines" -eq 0 ]; then healthKey=$(openssl rand -hex 32); printf '\nAGENTONE_HEALTH_MASTER_KEY=%s\n' "$healthKey" >> "$envfile"; unset healthKey; fi
healthKeyLength=$(sed -n 's/^AGENTONE_HEALTH_MASTER_KEY=//p' "$envfile" | tail -1 | tr -d '\r\n' | wc -c)
test "$healthKeyLength" -ge 32
chmod 600 "$envfile"
if [ "$healthKeyLines" -eq 0 ]; then sed -i '/^[[:space:]]*AGENTONE_INTERNAL_API_TOKEN:/a\      AGENTONE_HEALTH_MASTER_KEY: \${AGENTONE_HEALTH_MASTER_KEY}' "$file"; fi
test "$(grep -c "AGENTONE_HEALTH_MASTER_KEY:" "$file")" -eq 2
sed -i "s/purelink\\/agentone:2026.11.07-101/purelink\\/agentone:2026.11.07-102/g" "$file"
sed -i -E "s/(AGENTONE_RELEASE:[[:space:]]*).*/\\12026.11.07-102/g" "$file"
test "$(grep -c "purelink/agentone:2026.11.07-102" "$file")" -eq 4
test "$(grep -c "AGENTONE_RELEASE.*2026.11.07-102" "$file")" -eq 2
cd "$dir"
docker compose up -d --no-deps --force-recreate fressi-app fressi-access guenni-app guenni-access
i=0; ready=0
while [ "$i" -lt 60 ]; do ready=$(docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | awk -F'|' '$1 ~ /^(fressi|guenni)-(app|access)-/ && $2 == "purelink/agentone:2026.11.07-102" && $3 ~ /\\(healthy\\)/ {count++} END {print count+0}'); [ "$ready" -eq 4 ] && break; i=$((i+1)); sleep 2; done
docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | grep -E '^(fressi|guenni)-(app|access)-'
for prefix in fressi-app guenni-app; do cid=$(docker ps --format '{{.ID}}|{{.Names}}' | awk -F'|' -v prefix="$prefix" '$2 ~ "^" prefix "-" {print $1; exit}'); test -n "$cid"; docker exec "$cid" node -e "const key=process.env.AGENTONE_HEALTH_MASTER_KEY||'';fetch('http://127.0.0.1:4173/api/health').then(async response=>{const payload=await response.json();process.exit(response.ok&&payload.status==='ok'&&Buffer.byteLength(key,'utf8')>=32?0:1)}).catch(()=>process.exit(1))"; done
test "$ready" -eq 4`;

const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:180_000});
if(result.status!==0)throw new Error(`Release-102-Rollout fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-1200)}`);
process.stdout.write(result.stdout||'');
