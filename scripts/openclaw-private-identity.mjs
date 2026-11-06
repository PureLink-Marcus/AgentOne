import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadEnv} from '../server/state.mjs';
import {redact} from '../server/secrets.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP,user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER,key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH,knownHosts=path.resolve('output/demo/known_hosts');
for(const [id,label] of [['fressi','Fressi'],['guenni','Günni']]){
  const value=Buffer.from(JSON.stringify([{path:'agents.entries.main.identity',value:{name:label,theme:`${label} ist dein persönlicher Assistent auf Basis von AgentOne. Sprich direkt, freundlich, natürlich und auf Deutsch.`,emoji:'✦'}}])).toString('base64');
  const command=`set -eu; c=$(docker ps -a --format '{{.Names}}' | grep '^${id}-gateway-' | head -1); test -n "$c"; cfg=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/node/.openclaw"}}{{.Name}}{{end}}{{end}}' "$c"); ws=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/node/.openclaw/workspace"}}{{.Name}}{{end}}{{end}}' "$c"); batch=$(printf '%s' '${value}' | base64 -d); docker stop "$c" >/dev/null; docker run --rm -e HOME=/home/node -e OPENCLAW_STATE_DIR=/home/node/.openclaw -e OPENCLAW_CONFIG_PATH=/home/node/.openclaw/openclaw.json -v "$cfg":/home/node/.openclaw -v "$ws":/home/node/.openclaw/workspace --entrypoint node ghcr.io/openclaw/openclaw:2026.10.8 dist/index.js config set --batch-json "$batch"; docker start "$c" >/dev/null; echo ${id.toUpperCase()}_IDENTITY_${label}`;
  const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:120_000});
  const secrets=Object.entries(env).filter(([name,value])=>/(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)/i.test(name)&&String(value).length>=8).map(([,value])=>String(value));console.log(redact(`${result.stdout||''}\n${result.stderr||''}`.trim(),secrets));if(result.status!==0)throw new Error(`${id}: Identity-Konfiguration fehlgeschlagen (${result.status})`);
}
