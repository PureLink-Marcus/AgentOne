import path from 'node:path';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const id=String(process.argv[2]||'').toLowerCase();
const names={fressi:'FRESSI',guenni:'GUENNI'};
const suffix=names[id];
if(!suffix)throw new Error('Instanz muss fressi oder guenni sein');

const origin=env[`AGENTONE_${suffix}_ORIGIN`]?.replace(/\/$/,'');
const username=env[`AGENTONE_${suffix}_USER`];
const password=env[`AGENTONE_${suffix}_PASSWORD`];
if(!origin||!username||!password)throw new Error(`${id}: Zugangskonfiguration fehlt`);

const login=await fetch(`${origin}/login`,{
  method:'POST',
  headers:{origin,'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({username,password}),
  redirect:'manual',
  signal:AbortSignal.timeout(20_000)
});
if(login.status!==303)throw new Error(`${id}: Login HTTP ${login.status}`);
const cookie=String(login.headers.get('set-cookie')||'').split(';')[0];
if(!cookie)throw new Error(`${id}: Sessioncookie fehlt`);

const created=await fetch(`${origin}/agentone/private-access/keys`,{
  method:'POST',
  headers:{cookie,origin,'content-type':'application/json'},
  body:JSON.stringify({label:process.argv.slice(3).join(' ')||'Erste Kommunikation'}),
  signal:AbortSignal.timeout(20_000)
});
if(created.status!==201)throw new Error(`${id}: Schlüssel HTTP ${created.status}`);
const {credential}=await created.json();

const verified=await fetch(`${origin}/agentone/instances.json`,{
  headers:{'x-agentone-login-key':credential.loginKey,authorization:`Bearer ${credential.apiKey}`},
  signal:AbortSignal.timeout(20_000)
});
if(!verified.ok)throw new Error(`${id}: Schlüsselprüfung HTTP ${verified.status}`);

console.log(JSON.stringify({instance:id,origin,label:credential.label,login_key:credential.loginKey,api_key:credential.apiKey,expires_with_session:true,verified:true},null,2));
