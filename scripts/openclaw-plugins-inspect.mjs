import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP,user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER,key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH,knownHosts=path.resolve('output/demo/known_hosts');
const command=`set -eu
for id in guenni fressi agentone-personal; do
  c=$(docker ps --format '{{.Names}}' | grep "^$id-gateway-" | head -1 || true)
  [ -n "$c" ] || continue
  echo "INSTANCE|$id"
  docker exec "$c" node dist/index.js plugins list --json 2>/dev/null || docker exec "$c" node dist/index.js plugins list 2>/dev/null || true
  echo "SKILLS|$id"
  docker exec "$c" node dist/index.js skills list --json 2>/dev/null || docker exec "$c" node dist/index.js skills list 2>/dev/null || true
done`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:90_000,maxBuffer:4_000_000});
process.stdout.write(result.stdout||'');if(result.status!==0)throw new Error('OpenClaw-Plugininventar konnte nicht gelesen werden');
