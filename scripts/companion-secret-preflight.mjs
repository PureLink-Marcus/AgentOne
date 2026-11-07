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
file=/data/coolify/services/gohudyegrv06p4jikisfk2x1/docker-compose.yml
test -f "$file"
echo "compose-internal-token-lines|$(grep -c 'AGENTONE_INTERNAL_API_TOKEN:' "$file" || true)"
echo "compose-companion-pepper-lines|$(grep -c 'AGENTONE_COMPANION_PEPPER:' "$file" || true)"
awk '/AGENTONE_INTERNAL_API_TOKEN:/ {match($0,/[^ ]/); print "compose-env-indent|" RSTART-1}' "$file"
for prefix in fressi-app guenni-app; do
  cid=$(docker ps --format '{{.ID}}|{{.Names}}' | awk -F'|' -v prefix="$prefix" '$2 ~ "^" prefix "-" {print $1; exit}')
  test -n "$cid"
  state=$(docker exec "$cid" node -e "const value=process.env.AGENTONE_COMPANION_PEPPER||process.env.AGENTONE_SECRET_KEY||'';process.stdout.write(Buffer.byteLength(value,'utf8')>=32?'READY':'MISSING')")
  echo "$prefix|$state"
  test "$state" = READY
done`;

const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:30_000});
if(result.status!==0)throw new Error(`Companion-Secret-Preflight fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-800)}`);
process.stdout.write(result.stdout||'');
