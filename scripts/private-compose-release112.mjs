import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const release='2026.11.10-121',image=`purelink/agentone:${release}`,env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP,user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER,key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH,knownHosts=path.resolve('output/demo/known_hosts'),preflightOnly=process.argv.includes('--preflight-only');
const required=['AGENTONE_VAPID_PUBLIC_KEY','AGENTONE_VAPID_PRIVATE_KEY','AGENTONE_VAPID_SUBJECT','AGENTONE_PUSH_MASTER_KEY'];
if(!host||!user||!key)throw new Error('SSH-Ziel fehlt');if(required.some(name=>!String(env[name]||'')))throw new Error('Push-Secrets fehlen im Master-ENV');
const localSecret=path.join(os.tmpdir(),`agentone-release112-${crypto.randomBytes(8).toString('hex')}.env`),remoteSecret=`/tmp/agentone-release112-${crypto.randomBytes(8).toString('hex')}.env`;
fs.writeFileSync(localSecret,required.map(name=>`${name}=${env[name]}`).join('\n')+'\n',{encoding:'utf8',mode:0o600});
const common=['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`],target=`${user}@${host}`;
function run(bin,args,timeout=120_000){const result=spawnSync(bin,args,{encoding:'utf8',timeout});if(result.status!==0)throw new Error(`${bin} fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-1600)}`);return result.stdout||'';}
try{
  run('scp',[...common,localSecret,`${target}:${remoteSecret}`]);
  const command=`set -eu
preflightOnly=${preflightOnly?'1':'0'}
release='${release}'
image='${image}'
secretFile='${remoteSecret}'
dir=/data/coolify/services/gohudyegrv06p4jikisfk2x1
file="$dir/docker-compose.yml"
backup="$dir/docker-compose.release112-preflight.backup.yml"
chmod 600 "$secretFile"
set -a
. "$secretFile"
set +a
for name in AGENTONE_VAPID_PUBLIC_KEY AGENTONE_VAPID_PRIVATE_KEY AGENTONE_VAPID_SUBJECT AGENTONE_PUSH_MASTER_KEY; do eval "value=\$$name"; test -n "$value"; done
test -f "$file"
imageLines=$(sed -n 's/^[[:space:]]*image:[[:space:]]*//p' "$file" | tr -d '\\042\\047\\r' | grep '^purelink/agentone:' | wc -l)
releaseLines=$(grep -c 'AGENTONE_RELEASE' "$file" || true)
preflightImage=$(sed -n 's/^[[:space:]]*image:[[:space:]]*//p' "$file" | tr -d '\\042\\047\\r' | grep '^purelink/agentone:' | head -1)
echo "release-112 preflight image=$preflightImage imageLines=$imageLines releaseLines=$releaseLines pushSecrets=present"
test "$imageLines" -eq 4
test "$releaseLines" -eq 2
test -n "$preflightImage"
test "$(sed -n 's/^[[:space:]]*image:[[:space:]]*//p' "$file" | tr -d '\\042\\047\\r' | grep -F -x -c "$preflightImage")" -eq 4
if [ "$preflightOnly" -eq 1 ]; then rm -f "$secretFile"; echo "release-112 preflight passed for $preflightImage"; exit 0; fi
cp "$file" "$backup"
chmod 600 "$backup"
deploy_ok=0
rollback() {
  status=$?
  trap - EXIT
  rm -f "$secretFile"
  if [ "$deploy_ok" -eq 0 ]; then
    cp "$backup" "$file"
    cd "$dir"
    if docker compose config --quiet && docker compose up -d --no-deps --force-recreate fressi-app fressi-access guenni-app guenni-access; then
      i=0; restored=0
      while [ "$i" -lt 60 ]; do
        restored=$(docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | awk -F'|' -v old="$preflightImage" '$1 ~ /^(fressi|guenni)-(app|access)-/ && $2 == old && $3 ~ /\\(healthy\\)/ {count++} END {print count+0}')
        [ "$restored" -eq 4 ] && break
        i=$((i+1)); sleep 2
      done
      [ "$restored" -eq 4 ] && echo 'release-112 rollback restored and healthy' >&2 || echo "release-112 rollback unhealthy: $restored/4" >&2
    fi
    echo 'release-112 failed; preflight rollback attempted' >&2
  fi
  exit "$status"
}
trap rollback EXIT
tmp="$file.release112.tmp"
awk -v pub="$AGENTONE_VAPID_PUBLIC_KEY" -v priv="$AGENTONE_VAPID_PRIVATE_KEY" -v subject="$AGENTONE_VAPID_SUBJECT" -v master="$AGENTONE_PUSH_MASTER_KEY" '
  /^[[:space:]]*AGENTONE_VAPID_PUBLIC_KEY:/ {next}
  /^[[:space:]]*AGENTONE_VAPID_PRIVATE_KEY:/ {next}
  /^[[:space:]]*AGENTONE_VAPID_SUBJECT:/ {next}
  /^[[:space:]]*AGENTONE_PUSH_MASTER_KEY:/ {next}
  {print}
  /^[[:space:]]*AGENTONE_RELEASE:/ {
    match($0,/^[[:space:]]*/); indent=substr($0,1,RLENGTH)
    print indent "AGENTONE_VAPID_PUBLIC_KEY: " pub
    print indent "AGENTONE_VAPID_PRIVATE_KEY: " priv
    print indent "AGENTONE_VAPID_SUBJECT: " subject
    print indent "AGENTONE_PUSH_MASTER_KEY: " master
  }
' "$file" > "$tmp"
mv "$tmp" "$file"
chmod 600 "$file"
sed -i -E "s#purelink/agentone:[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}-[0-9]+#$image#g" "$file"
sed -i -E "s/(AGENTONE_RELEASE:[[:space:]]*).*/\\1$release/g" "$file"
test "$(grep -F -c "$image" "$file")" -eq 4
test "$(grep -c "AGENTONE_RELEASE.*$release" "$file")" -eq 2
for name in AGENTONE_VAPID_PUBLIC_KEY AGENTONE_VAPID_PRIVATE_KEY AGENTONE_VAPID_SUBJECT AGENTONE_PUSH_MASTER_KEY; do test "$(grep -c "^[[:space:]]*$name:" "$file")" -eq 2; done
cd "$dir"
docker compose config --quiet
wait_pair() {
  prefix="$1"; i=0; ready=0
  while [ "$i" -lt 60 ]; do
    ready=$(docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | awk -F'|' -v prefix="$prefix" -v target="$image" '$1 ~ ("^" prefix "-(app|access)-") && $2 == target && $3 ~ /\\(healthy\\)/ {count++} END {print count+0}')
    [ "$ready" -eq 2 ] && break
    i=$((i+1)); sleep 2
  done
  test "$ready" -eq 2
  cid=$(docker ps --format '{{.ID}}|{{.Names}}' | awk -F'|' -v prefix="$prefix-app" '$2 ~ ("^" prefix "-") {print $1; exit}')
  test -n "$cid"
  docker exec "$cid" node -e "fetch('http://127.0.0.1:4173/api/health').then(async response=>{const payload=await response.json();process.exit(response.ok&&payload.status==='ok'?0:1)}).catch(()=>process.exit(1))"
  docker exec "$cid" node -e "const e=process.env;process.exit(String(e.AGENTONE_VAPID_PUBLIC_KEY||'').length>=80&&String(e.AGENTONE_VAPID_PRIVATE_KEY||'').length>=40&&/^mailto:|^https:/.test(String(e.AGENTONE_VAPID_SUBJECT||''))&&String(e.AGENTONE_PUSH_MASTER_KEY||'').length>=32?0:1)"
}
docker compose up -d --no-deps --force-recreate guenni-app guenni-access
wait_pair guenni
docker compose up -d --no-deps --force-recreate fressi-app fressi-access
wait_pair fressi
ready=$(docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | awk -F'|' -v target="$image" '$1 ~ /^(fressi|guenni)-(app|access)-/ && $2 == target && $3 ~ /\\(healthy\\)/ {count++} END {print count+0}')
test "$ready" -eq 4
docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | grep -E '^(fressi|guenni)-(app|access)-'
rm -f "$secretFile"
deploy_ok=1
trap - EXIT`;
  process.stdout.write(run('ssh',[...common,target,command],480_000));
}finally{try{fs.unlinkSync(localSecret);}catch{}try{run('ssh',[...common,target,`rm -f '${remoteSecret}'`],30_000);}catch{}}
