import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const release='2026.11.07-104';
const image=`purelink/agentone:${release}`;
const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const knownHosts=path.resolve('output/demo/known_hosts');
const preflightOnly=process.argv.includes('--preflight-only');
if(!host||!user||!key)throw new Error('SSH-Ziel fehlt');

const command=`set -eu
preflightOnly=${preflightOnly?'1':'0'}
release='${release}'
image='${image}'
dir=/data/coolify/services/gohudyegrv06p4jikisfk2x1
file="$dir/docker-compose.yml"
backup="$dir/docker-compose.release104-preflight.backup.yml"
test -f "$file"
imageLines=$(sed -n 's/^[[:space:]]*image:[[:space:]]*//p' "$file" | tr -d '\\042\\047\\r' | grep '^purelink/agentone:' | wc -l)
releaseLines=$(grep -c 'AGENTONE_RELEASE' "$file" || true)
preflightImage=$(sed -n 's/^[[:space:]]*image:[[:space:]]*//p' "$file" | tr -d '\\042\\047\\r' | grep '^purelink/agentone:' | head -1)
echo "release-104 preflight image=$preflightImage imageLines=$imageLines releaseLines=$releaseLines"
test "$imageLines" -eq 4
test "$releaseLines" -eq 2
test -n "$preflightImage"
test "$(sed -n 's/^[[:space:]]*image:[[:space:]]*//p' "$file" | tr -d '\\042\\047\\r' | grep -F -x -c "$preflightImage")" -eq 4
if [ "$preflightOnly" -eq 1 ]; then echo "release-104 preflight passed for $preflightImage"; exit 0; fi
cp "$file" "$backup"
chmod 600 "$backup"
deploy_ok=0
rollback() {
  status=$?
  trap - EXIT
  if [ "$deploy_ok" -eq 0 ]; then
    cp "$backup" "$file"
    cd "$dir"
    if docker compose config --quiet && docker compose up -d --no-deps --force-recreate fressi-app fressi-access guenni-app guenni-access; then
      i=0
      restored=0
      while [ "$i" -lt 60 ]; do
        restored=$(docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | awk -F'|' -v old="$preflightImage" '$1 ~ /^(fressi|guenni)-(app|access)-/ && $2 == old && $3 ~ /\\(healthy\\)/ {count++} END {print count+0}')
        [ "$restored" -eq 4 ] && break
        i=$((i+1))
        sleep 2
      done
      [ "$restored" -eq 4 ] && echo 'release-104 rollback restored and healthy' >&2 || echo "release-104 rollback unhealthy: $restored/4" >&2
    else
      echo 'release-104 rollback recreate failed' >&2
    fi
    echo 'release-104 failed; preflight rollback attempted' >&2
  fi
  exit "$status"
}
trap rollback EXIT
sed -i -E "s#purelink/agentone:[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}-[0-9]+#$image#g" "$file"
sed -i -E "s/(AGENTONE_RELEASE:[[:space:]]*).*/\\1$release/g" "$file"
test "$(grep -F -c "$image" "$file")" -eq 4
test "$(grep -c "AGENTONE_RELEASE.*$release" "$file")" -eq 2
cd "$dir"
docker compose config --quiet
wait_pair() {
  prefix="$1"
  i=0
  ready=0
  while [ "$i" -lt 60 ]; do
    ready=$(docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | awk -F'|' -v prefix="$prefix" -v target="$image" '$1 ~ ("^" prefix "-(app|access)-") && $2 == target && $3 ~ /\\(healthy\\)/ {count++} END {print count+0}')
    [ "$ready" -eq 2 ] && break
    i=$((i+1))
    sleep 2
  done
  test "$ready" -eq 2
  cid=$(docker ps --format '{{.ID}}|{{.Names}}' | awk -F'|' -v prefix="$prefix-app" '$2 ~ ("^" prefix "-") {print $1; exit}')
  test -n "$cid"
  docker exec "$cid" node -e "fetch('http://127.0.0.1:4173/api/health').then(async response=>{const payload=await response.json();process.exit(response.ok&&payload.status==='ok'?0:1)}).catch(()=>process.exit(1))"
}
docker compose up -d --no-deps --force-recreate guenni-app guenni-access
wait_pair guenni
docker compose up -d --no-deps --force-recreate fressi-app fressi-access
wait_pair fressi
ready=$(docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | awk -F'|' -v target="$image" '$1 ~ /^(fressi|guenni)-(app|access)-/ && $2 == target && $3 ~ /\\(healthy\\)/ {count++} END {print count+0}')
test "$ready" -eq 4
docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | grep -E '^(fressi|guenni)-(app|access)-'
deploy_ok=1
trap - EXIT`;

const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:480_000});
if(result.status!==0)throw new Error(`Release-104-Rollout fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-1600)}`);
process.stdout.write(result.stdout||'');
