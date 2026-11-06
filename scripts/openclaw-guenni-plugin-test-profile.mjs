import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';
import { openClawPluginCatalog } from '../server/openclaw-plugin-catalog.generated.mjs';

const root=path.resolve('.');
const env=loadEnv(root);
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const knownHosts=path.resolve('output/demo/known_hosts');
const ssh=command=>spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:90_000,maxBuffer:8_000_000});
const lookup=ssh("docker ps --format '{{.Names}}' | grep '^guenni-gateway-' | head -1");
const container=String(lookup.stdout||'').trim();
if(!container)throw new Error('Günni OpenClaw Gateway nicht gefunden');

const requested=openClawPluginCatalog.filter(item=>item.status==='disabled').map(item=>item.id);
for(const id of requested)if(!/^[a-z0-9][a-z0-9-]*$/.test(id))throw new Error(`Ungültige Plugin-ID: ${id}`);
const batch=Buffer.from(JSON.stringify(requested.map(id=>({path:`plugins.entries.${id}.enabled`,value:true})))).toString('base64');
const configure=ssh(`set -u; c='${container}'; cfg=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/node/.openclaw"}}{{.Name}}{{end}}{{end}}' "$c"); ws=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/home/node/.openclaw/workspace"}}{{.Name}}{{end}}{{end}}' "$c"); test -n "$cfg"; test -n "$ws"; plugin_batch=$(printf '%s' '${batch}' | base64 -d); docker stop "$c" >/dev/null; rc=0; docker run --rm -e HOME=/home/node -e OPENCLAW_STATE_DIR=/home/node/.openclaw -e OPENCLAW_CONFIG_PATH=/home/node/.openclaw/openclaw.json -v "$cfg":/home/node/.openclaw -v "$ws":/home/node/.openclaw/workspace --entrypoint node ghcr.io/openclaw/openclaw:2026.10.8 dist/index.js config set --batch-json "$plugin_batch" || rc=$?; docker start "$c" >/dev/null; exit $rc`);
if(configure.status!==0)throw new Error(`Atomare Plugin-Konfiguration fehlgeschlagen: ${String(configure.stderr||configure.stdout||'').trim().slice(0,500)}`);
const attempts=requested.map(id=>({id,commandAccepted:true,message:'enabled in persistent OpenClaw config'}));
let inventoryResult;
for(let attempt=0;attempt<12;attempt+=1){
  await new Promise(resolve=>setTimeout(resolve,5_000));
  inventoryResult=ssh(`docker exec '${container}' node dist/index.js plugins list --json`);
  if(inventoryResult.status===0)break;
}
if(inventoryResult.status!==0)throw new Error('Plugin-Inventar nach Aktivierung nicht lesbar');
const inventory=JSON.parse(inventoryResult.stdout);
const plugins=inventory.plugins||[];
const gatewayResult=ssh(`docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' '${container}'`);
const gatewayState=String(gatewayResult.stdout||'').trim();
const runtimeChecks=[{id:'gateway-container-health',passed:gatewayResult.status===0&&/^running\|(healthy|starting)$/.test(gatewayState),message:gatewayState||String(gatewayResult.stderr||'').trim().slice(0,500)}];

const report={generatedAt:new Date().toISOString(),instance:'guenni',profile:'development-all-plugins',requested,attempts,summary:{total:plugins.length,loaded:plugins.filter(item=>item.status==='loaded').length,disabled:plugins.filter(item=>item.status==='disabled').length,runtimePassed:runtimeChecks.filter(item=>item.passed).length,runtimeFailed:runtimeChecks.filter(item=>!item.passed).length},plugins:plugins.map(item=>({id:item.id,status:item.status,diagnostics:item.diagnostics||[]})),runtimeChecks};
fs.writeFileSync(path.join(root,'output','demo','guenni-openclaw-plugin-test-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report.summary,null,2));
