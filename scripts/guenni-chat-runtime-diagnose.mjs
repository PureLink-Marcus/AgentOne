import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP,user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER,key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH,knownHosts=path.resolve('output/demo/known_hosts');
if(!host||!user||!key)throw new Error('SSH-Ziel fehlt');
const diagnostic=Buffer.from(`const started=Date.now();const base=process.env.OPENAI_BASE_URL||'https://api.openai.com';const key=process.env.OPENAI_API_KEY||'';if(!key){console.log(JSON.stringify({configured:false}));process.exit(0)}fetch(base+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({model:'gpt-6-luna',store:false,reasoning:{effort:'low'},max_output_tokens:64,input:'Reply only OK'}),signal:AbortSignal.timeout(30000)}).then(async response=>{let data={};try{data=await response.json()}catch{};console.log(JSON.stringify({configured:true,http:response.status,latencyMs:Date.now()-started,errorType:data.error?.type||null,errorCode:data.error?.code||null,hasOutput:Boolean(data.output_text||data.output)}))}).catch(error=>console.log(JSON.stringify({configured:true,http:0,latencyMs:Date.now()-started,errorType:error.name,errorCode:null,hasOutput:false})))`,'utf8').toString('base64');
const command=`set -eu
c=$(docker ps --format '{{.Names}}' | grep '^guenni-access-' | head -1)
test -n "$c"
docker inspect -f 'container={{.Name}} image={{.Config.Image}} health={{.State.Health.Status}}' "$c"
docker exec "$c" node -e "eval(Buffer.from('${diagnostic}','base64').toString())"
docker logs --since 15m "$c" 2>&1 | grep -Ei 'voice\.chat|timeout|HTTP [45][0-9][0-9]|fetch failed' | tail -40 | sed -E 's/(Bearer |token[=: ]+|secret[=: ]+|api[-_]?key[=: ]+)[^ ]+/\\1[REDACTED]/gi' || true`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:60_000});
if(result.status!==0)throw new Error(`Chat-Diagnose fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-1000)}`);
process.stdout.write(result.stdout||'');
