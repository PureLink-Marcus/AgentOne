import path from 'node:path';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const origin=String(env.AGENTONE_GUENNI_ORIGIN||'').replace(/\/$/,'');
const username=env.AGENTONE_GUENNI_USER;
const password=env.AGENTONE_GUENNI_PASSWORD;
if(!origin||!username||!password)throw new Error('Günni-Zugang für Diagnose fehlt');

const login=await fetch(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password}),redirect:'manual',signal:AbortSignal.timeout(20_000)});
if(login.status!==303)throw new Error(`Login HTTP ${login.status}`);
const cookie=String(login.headers.get('set-cookie')||'').split(';')[0];
if(!cookie)throw new Error('Sessioncookie fehlt');

const accountResponse=await fetch(origin+'/agentone/mail/accounts',{headers:{cookie,accept:'application/json'},signal:AbortSignal.timeout(20_000)});
if(!accountResponse.ok)throw new Error(`Konten HTTP ${accountResponse.status}`);
const accountPayload=await accountResponse.json();
const results=[];
for(const account of accountPayload.accounts||[]){
  const response=await fetch(origin+'/agentone/mail/accounts/'+encodeURIComponent(account.id)+'/scan',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},signal:AbortSignal.timeout(60_000)});
  const payload=await response.json().catch(()=>({}));
  const groups=payload.scan?.groups||{};
  results.push({provider:account.provider,status:response.ok?'CONNECTED':'DEGRADED',http:response.status,stage:payload.stage||null,code:payload.code||null,imap:payload.imap?.ok===true,smtp:payload.smtp?.ok===true,total:Number(payload.scan?.total||0),groups:{people:(groups.people||[]).length,newsletters:(groups.newsletters||[]).length,transactions:(groups.transactions||[]).length,spam:(groups.spam||[]).length}});
}
console.log(JSON.stringify({origin,plugin:accountPayload.plugin?.status||'UNKNOWN',accounts:results.length,results,secretsExposed:false,contentExposed:false},null,2));
