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
backup="$dir/docker-compose.release103-preflight.backup.yml"
test -f "$file"
test -f "$envfile"
image102=$(grep -c "purelink/agentone:2026.11.07-102" "$file" || true)
image103=$(grep -c "purelink/agentone:2026.11.07-103" "$file" || true)
releaseLines=$(grep -c "AGENTONE_RELEASE" "$file" || true)
healthKeyLines=$(grep -c "AGENTONE_HEALTH_MASTER_KEY:" "$file" || true)
whoopStateLines=$(grep -c "WHOOP_OAUTH_STATE_SECRET:" "$file" || true)
whoopStateEnvLines=$(grep -c '^WHOOP_OAUTH_STATE_SECRET=' "$envfile" || true)
preflightImage=$(sed -n 's/^[[:space:]]*image:[[:space:]]*//p' "$file" | grep '^purelink/agentone:' | head -1 | tr -d '"\r')
echo "preflight image102=$image102 image103=$image103 releaseLines=$releaseLines healthKeyLines=$healthKeyLines whoopStateLines=$whoopStateLines whoopStateEnvLines=$whoopStateEnvLines"
test "$((image102 + image103))" -eq 4
test -n "$preflightImage"
test "$(grep -F -c "image: $preflightImage" "$file")" -eq 4
test "$releaseLines" -eq 2
test "$healthKeyLines" -eq 2
test "$whoopStateLines" -eq 0 -o "$whoopStateLines" -eq 2
test "$whoopStateEnvLines" -eq 0 -o "$whoopStateEnvLines" -eq 1
cp "$file" "$backup"
chmod 600 "$backup"
deploy_ok=0
rollback() {
  status=$?
  trap - EXIT
  if [ "$deploy_ok" -eq 0 ]; then
    cp "$backup" "$file"
    cd "$dir"
    if docker compose config --quiet; then
      if docker compose up -d --no-deps --force-recreate fressi-app fressi-access guenni-app guenni-access; then
        rollback_i=0
        restored=0
        while [ "$rollback_i" -lt 60 ]; do
          restored=$(docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | awk -F'|' -v image="$preflightImage" '$1 ~ /^(fressi|guenni)-(app|access)-/ && $2 == image && $3 ~ /\\(healthy\\)/ {count++} END {print count+0}')
          [ "$restored" -eq 4 ] && break
          rollback_i=$((rollback_i+1))
          sleep 2
        done
        if [ "$restored" -eq 4 ]; then echo 'preflight rollback restored and healthy' >&2; else echo "preflight rollback unhealthy: $restored/4 matching containers" >&2; fi
      else
        echo 'preflight rollback recreate failed' >&2
      fi
    fi
    echo 'release-103 failed; fresh preflight rollback attempted' >&2
  fi
  exit "$status"
}
trap rollback EXIT
if [ "$whoopStateEnvLines" -eq 0 ]; then whoopState=$(openssl rand -hex 32); printf '\nWHOOP_OAUTH_STATE_SECRET=%s\n' "$whoopState" >> "$envfile"; unset whoopState; fi
whoopStateLength=$(sed -n 's/^WHOOP_OAUTH_STATE_SECRET=//p' "$envfile" | tail -1 | tr -d '\r\n' | wc -c)
test "$whoopStateLength" -ge 32
chmod 600 "$envfile"
if [ "$whoopStateLines" -eq 0 ]; then sed -i '/^[[:space:]]*AGENTONE_HEALTH_MASTER_KEY:/a\      WHOOP_OAUTH_STATE_SECRET: \${WHOOP_OAUTH_STATE_SECRET}' "$file"; fi
test "$(grep -c "WHOOP_OAUTH_STATE_SECRET:" "$file")" -eq 2
sed -i "s/purelink\\/agentone:2026.11.07-102/purelink\\/agentone:2026.11.07-103/g" "$file"
sed -i -E "s/(AGENTONE_RELEASE:[[:space:]]*).*/\\12026.11.07-103/g" "$file"
test "$(grep -c "purelink/agentone:2026.11.07-103" "$file")" -eq 4
test "$(grep -c "AGENTONE_RELEASE.*2026.11.07-103" "$file")" -eq 2
cd "$dir"
docker compose config --quiet
wait_pair() {
  prefix="$1"
  i=0
  ready=0
  while [ "$i" -lt 60 ]; do
    ready=$(docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | awk -F'|' -v prefix="$prefix" '$1 ~ ("^" prefix "-(app|access)-") && $2 == "purelink/agentone:2026.11.07-103" && $3 ~ /\\(healthy\\)/ {count++} END {print count+0}')
    [ "$ready" -eq 2 ] && break
    i=$((i+1))
    sleep 2
  done
  test "$ready" -eq 2
  cid=$(docker ps --format '{{.ID}}|{{.Names}}' | awk -F'|' -v prefix="$prefix-app" '$2 ~ ("^" prefix "-") {print $1; exit}')
  test -n "$cid"
  docker exec "$cid" node -e "const health=process.env.AGENTONE_HEALTH_MASTER_KEY||'',state=process.env.WHOOP_OAUTH_STATE_SECRET||'';fetch('http://127.0.0.1:4173/api/health').then(async response=>{const payload=await response.json();process.exit(response.ok&&payload.status==='ok'&&Buffer.byteLength(health,'utf8')>=32&&Buffer.byteLength(state,'utf8')>=32?0:1)}).catch(()=>process.exit(1))"
}
docker compose up -d --no-deps --force-recreate guenni-app guenni-access
wait_pair guenni
docker compose up -d --no-deps --force-recreate fressi-app fressi-access
wait_pair fressi
ready=$(docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | awk -F'|' '$1 ~ /^(fressi|guenni)-(app|access)-/ && $2 == "purelink/agentone:2026.11.07-103" && $3 ~ /\\(healthy\\)/ {count++} END {print count+0}')
test "$ready" -eq 4
docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | grep -E '^(fressi|guenni)-(app|access)-'
deploy_ok=1
trap - EXIT`;

const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:480_000});
if(result.status!==0)throw new Error(`Release-103-Rollout fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-1200)}`);
process.stdout.write(result.stdout||'');
