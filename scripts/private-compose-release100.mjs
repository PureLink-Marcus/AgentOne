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
image99=$(grep -c "purelink/agentone:2026.11.07-99" "$file" || true)
image100=$(grep -c "purelink/agentone:2026.11.07-100" "$file" || true)
releaseLines=$(grep -c "AGENTONE_RELEASE" "$file" || true)
internalTokenLines=$(grep -c "AGENTONE_INTERNAL_API_TOKEN:" "$file" || true)
companionPepperLines=$(grep -c "AGENTONE_COMPANION_PEPPER:" "$file" || true)
companionPepperEnvLines=$(grep -c '^AGENTONE_COMPANION_PEPPER=' "$envfile" || true)
echo "preflight image99=$image99 image100=$image100 releaseLines=$releaseLines internalTokenLines=$internalTokenLines companionPepperLines=$companionPepperLines companionPepperEnvLines=$companionPepperEnvLines"
test "$((image99 + image100))" -eq 4
test "$releaseLines" -eq 2
test "$internalTokenLines" -eq 2
test "$companionPepperLines" -eq 2
test "$companionPepperEnvLines" -eq 1
for prefix in fressi-app guenni-app; do cid=$(docker ps --format '{{.ID}}|{{.Names}}' | awk -F'|' -v prefix="$prefix" '$2 ~ "^" prefix "-" {print $1; exit}'); test -n "$cid"; docker exec "$cid" node -e "const value=process.env.AGENTONE_ICS_MASTER_KEY||process.env.AGENTONE_DEMO_MASTER_KEY||'';process.exit(Buffer.byteLength(value,'utf8')>=16?0:1)"; done
if [ ! -f "$dir/docker-compose.release99.backup.yml" ]; then cp "$file" "$dir/docker-compose.release99.backup.yml"; fi
sed -i "s/purelink\\/agentone:2026.11.07-99/purelink\\/agentone:2026.11.07-100/g" "$file"
sed -i -E "s/(AGENTONE_RELEASE:[[:space:]]*).*/\\12026.11.07-100/g" "$file"
test "$(grep -c "purelink/agentone:2026.11.07-100" "$file")" -eq 4
test "$(grep -c "AGENTONE_RELEASE.*2026.11.07-100" "$file")" -eq 2
test "$(grep -c "AGENTONE_COMPANION_PEPPER:" "$file")" -eq 2
cd "$dir"
docker compose up -d --no-deps --force-recreate fressi-app fressi-access guenni-app guenni-access
i=0; ready=0
while [ "$i" -lt 60 ]; do ready=$(docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | awk -F'|' '$1 ~ /^(fressi|guenni)-(app|access)-/ && $2 == "purelink/agentone:2026.11.07-100" && $3 ~ /\\(healthy\\)/ {count++} END {print count+0}'); [ "$ready" -eq 4 ] && break; i=$((i+1)); sleep 2; done
docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | grep -E '^(fressi|guenni)-(app|access)-'
for prefix in fressi-app guenni-app; do cid=$(docker ps --format '{{.ID}}|{{.Names}}' | awk -F'|' -v prefix="$prefix" '$2 ~ "^" prefix "-" {print $1; exit}'); test -n "$cid"; docker exec "$cid" node -e "const pepper=process.env.AGENTONE_COMPANION_PEPPER||'';const master=process.env.AGENTONE_ICS_MASTER_KEY||process.env.AGENTONE_DEMO_MASTER_KEY||'';process.exit(Buffer.byteLength(pepper,'utf8')>=32&&Buffer.byteLength(master,'utf8')>=16?0:1)"; done
test "$ready" -eq 4`;

const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:180_000});
if(result.status!==0)throw new Error(`Release-100-Rollout fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-1200)}`);
process.stdout.write(result.stdout||'');
