import path from 'node:path';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const origin=String(env.AGENTONE_GUENNI_ORIGIN||'').replace(/\/$/,'');
const login=await fetch(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.AGENTONE_GUENNI_USER,password:env.AGENTONE_GUENNI_PASSWORD}),redirect:'manual',signal:AbortSignal.timeout(20_000)});
if(login.status!==303)throw new Error(`Login HTTP ${login.status}`);
const cookie=String(login.headers.get('set-cookie')||'').split(';')[0];
if(!cookie)throw new Error('Sessioncookie fehlt');

async function read(route){const response=await fetch(origin+route,{headers:{cookie,accept:'application/json'},signal:AbortSignal.timeout(30_000)});const payload=await response.json().catch(()=>({}));return {ok:response.ok,status:response.status,payload};}
const [connectors,mail,services,home,plugins,localModels,google]=await Promise.all([
  read('/agentone/personal/connectors'),read('/agentone/mail/accounts'),read('/agentone/services'),read('/agentone/home-connector/status'),read('/agentone/openclaw/plugins'),read('/agentone/local-models/status'),read('/agentone/google/status')
]);
const connectorRows=connectors.payload.connectors||[],serviceRows=services.payload.services||[],mailRows=mail.payload.accounts||[];
console.log(JSON.stringify({origin,http:{connectors:connectors.status,mail:mail.status,services:services.status,home:home.status,plugins:plugins.status,localModels:localModels.status,google:google.status},connectors:{total:connectorRows.length,connected:connectorRows.filter(item=>item.status==='CONNECTED').length,prepared:connectorRows.filter(item=>item.status==='PREPARED').length,degraded:connectorRows.filter(item=>item.status==='DEGRADED').length},mail:{plugin:mail.payload.plugin?.status||'UNKNOWN',accounts:mailRows.length,connected:mailRows.filter(item=>item.status==='CONNECTED').length,withVisibleScan:mailRows.filter(item=>item.lastTest?.scan?.total>0).length},services:{accounts:serviceRows.length,connected:serviceRows.filter(item=>item.status==='CONNECTED').length},home:{status:home.payload.status||'UNKNOWN',schema:home.payload.schema||null,authenticated:home.payload.test?.authenticated===true},plugins:{total:plugins.payload.summary?.total||0,loaded:plugins.payload.summary?.loaded||0,disabled:plugins.payload.summary?.disabled||0},localModels:{status:localModels.payload.status||'UNKNOWN',available:(localModels.payload.models||[]).filter(item=>item.available).length},google:{configured:google.payload.configured===true},secretsExposed:false,contentExposed:false},null,2));
