import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP,user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER,key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH,knownHosts=path.resolve('output/demo/known_hosts'),results=[];
for(const id of ['guenni','fressi']){const command=`set -eu; c=$(docker ps --format '{{.Names}}' | grep '^${id}-gateway-' | head -1); test -n "$c"; docker exec "$c" node dist/index.js config get agents.entries`;const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:60_000});if(result.status!==0)throw new Error(`${id}: mail_reader nicht lesbar: ${String(result.stderr||result.stdout).slice(-200)}`);const text=result.stdout||'';for(const expected of ['mail_reader','workspaceAccess','none','session_status','group:fs','group:runtime','group:web'])if(!text.includes(expected))throw new Error(`${id}: mail_reader Grenze fehlt: ${expected}`);results.push({instance:id,mailReader:'ISOLATED',workspace:'none',allowedTools:['session_status']});}
console.log(JSON.stringify(results,null,2));
