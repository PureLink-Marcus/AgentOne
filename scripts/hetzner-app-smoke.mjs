import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const knownHosts=path.resolve('output/demo/known_hosts');
const smoke=`(async()=>{
  const base='http://127.0.0.1:4173';
  const before=await fetch(base+'/api/bootstrap').then(r=>r.json());
  if(before.worlds.length||before.sessions.length||before.audit.length)throw new Error('anonymous boundary failed');
  const credentials=process.env.AGENTONE_LOGIN_USER&&process.env.AGENTONE_LOGIN_PASSWORD?{username:process.env.AGENTONE_LOGIN_USER,password:process.env.AGENTONE_LOGIN_PASSWORD}:{personaId:'marcus'};
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json','origin':base},body:JSON.stringify(credentials)});
  if(!login.ok)throw new Error('login failed '+login.status);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={cookie};
  const after=await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json());
  if(after.worlds.length!==4||after.sessions.length!==3)throw new Error('authenticated bootstrap failed');
  const platform=await fetch(base+'/api/platform/snapshot',{headers}).then(r=>r.json());
  if(platform.workflows.length!==4||platform.runs.length!==4||platform.gates.filter(g=>g.status==='PENDING').length!==1)throw new Error('platform engine snapshot failed');
  if(platform.runs.some(run=>!Array.isArray(run.steps)||run.steps.length<2))throw new Error('platform engine steps missing');
  const secrets=await fetch(base+'/api/admin/secrets',{headers}).then(r=>r.json());
  if(secrets.policy.valuesExposed!==false||secrets.secrets.some(s=>s.valueVisible!==false))throw new Error('secret boundary failed');
  const events=await fetch(base+'/api/events',{headers}).then(r=>r.json());
  let personalChat='SKIPPED';
  if(process.env.AGENTONE_SERVICE_NAME==='agentone-personal'){
    const chatResponse=await fetch(base+'/api/personal/chat',{method:'POST',headers:{...headers,'content-type':'application/json','origin':base},body:JSON.stringify({prompt:'Antworte ausschließlich mit: personal-smoke-ok'})});
    const chat=await chatResponse.json();if(!chatResponse.ok||!String(chat.text||'').toLowerCase().includes('personal-smoke-ok')||chat.mode!=='LIVE')throw new Error('personal live chat failed');personalChat={mode:chat.mode,model:chat.model,result:'personal-smoke-ok'};
  }
  const health=await fetch(base+'/api/health').then(r=>r.json());
  if(health.database.status!=='LIVE'||health.database.migrations!==5)throw new Error('database health failed');
  console.log(JSON.stringify({service:health.service,login:true,worlds:after.worlds.length,sessions:after.sessions.length,events:events.events.length,platform:{workflows:platform.workflows.length,runs:platform.runs.length,pendingGates:platform.gates.filter(g=>g.status==='PENDING').length},personalChat,secretValuesExposed:false,database:health.database.status,migrations:health.database.migrations}));
})().catch(error=>{console.error(error.message);process.exit(1)})`;
const encoded=Buffer.from(smoke).toString('base64');
const command=`set -eu; for c in $(docker ps --format '{{.Names}}|{{.Image}}' | grep 'purelink/agentone:2026.11.06-77' | grep -v -E '(jarvis-access|fressi-access|guenni-access|fressi-app|guenni-app)' | cut -d'|' -f1); do docker exec "$c" node -e "eval(Buffer.from('${encoded}','base64').toString())"; done`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:90_000});
console.log((result.stdout||'').trim());
if(result.status!==0)throw new Error(`Remote App-Smoke fehlgeschlagen: ${(result.stderr||'').slice(-1000)}`);
