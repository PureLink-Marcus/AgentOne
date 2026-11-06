import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP,user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER,key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH,knownHosts=path.resolve('output/demo/known_hosts');
const run=command=>spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:90_000,maxBuffer:8_000_000});
const summary={generatedAt:new Date().toISOString(),instances:{}};
for(const id of ['guenni','fressi','agentone-personal']){
  const lookup=run(`docker ps --format '{{.Names}}' | grep '^${id}-gateway-' | head -1`),container=(lookup.stdout||'').trim();if(!container)continue;
  const result=run(`docker exec '${container}' node dist/index.js plugins list --json`);if(result.status!==0)throw new Error(`${id}: Plugin-Liste nicht lesbar`);
  const parsed=JSON.parse(result.stdout),plugins=parsed.plugins||[];
  summary.instances[id]={total:plugins.length,loaded:plugins.filter(item=>item.status==='loaded').length,disabled:plugins.filter(item=>item.status==='disabled').length,plugins:plugins.map(item=>({id:item.id,name:item.name,status:item.status,description:item.description||'',tools:item.toolNames||[],channels:item.channelIds||[],providers:item.providerIds||[]}))};
}
fs.writeFileSync(path.resolve('output/demo/openclaw-plugin-inventory.json'),JSON.stringify(summary,null,2));
for(const [id,item] of Object.entries(summary.instances))console.log(`${id}|total=${item.total}|loaded=${item.loaded}|disabled=${item.disabled}`);
