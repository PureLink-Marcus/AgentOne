import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP,user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER,key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH,token=env.AGENTONE_GUENNI_HOME_CONNECTOR_TOKEN,knownHosts=path.resolve('output/demo/known_hosts');
if(!host||!user||!key||!token)throw new Error('Home-Connector-Prüfkonfiguration fehlt');
const connectorUrl=String(env.AGENTONE_GUENNI_HOME_CONNECTOR_URL||'').replace(/\/$/,'');if(!connectorUrl.startsWith('http://'))throw new Error('Private Tailnet-Connector-URL fehlt');
const command=`set -eu; IFS= read -r token; health=$(curl --fail --silent --show-error --max-time 10 '${connectorUrl}/health'); printf 'HEALTH|%s\n' "$health"; capabilities=$(curl --fail --silent --show-error --max-time 10 -H "Authorization: Bearer $token" '${connectorUrl}/v1/capabilities'); printf 'CAPABILITIES|%s\n' "$capabilities"`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{input:`${token}\n`,encoding:'utf8',timeout:30_000});
if(result.status!==0){if(result.stdout)console.log(result.stdout.trim());throw new Error(`End-to-End-Prüfung fehlgeschlagen: ${(result.stderr||'').slice(-500)}`);}
const output=result.stdout||'';if(!output.includes('"status":"ok"')||!output.includes('"writeAccess":false'))throw new Error('Connector-Antwort entspricht nicht dem sicheren Read-only-Schema');
console.log(output.trim());
