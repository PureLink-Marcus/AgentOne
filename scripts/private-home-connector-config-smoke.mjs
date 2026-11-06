import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP,user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER,key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH,knownHosts=path.resolve('output/demo/known_hosts');
const command=`set -eu
for id in guenni fressi; do
  c=$(docker ps --format '{{.Names}}' | grep "^$id-app-" | head -1)
  test -n "$c"
  names=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$c" | cut -d= -f1)
  url=false; token=false
  echo "$names" | grep -qx HOME_CONNECTOR_URL && url=true
  echo "$names" | grep -qx HOME_CONNECTOR_TOKEN && token=true
  echo "$id|url=$url|token=$token"
done`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:30_000});
if(result.status!==0)throw new Error('Home-Connector-Konfiguration konnte nicht sicher geprüft werden');
const output=(result.stdout||'').trim();console.log(output);
if(!output.includes('guenni|url=true|token=true')||!output.includes('fressi|url=false|token=false'))throw new Error('Instanztrennung der Home-Connector-Konfiguration ist fehlerhaft');
