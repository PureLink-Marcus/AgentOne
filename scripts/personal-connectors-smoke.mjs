import path from 'node:path';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const instances=[
  {id:'guenni',origin:env.AGENTONE_GUENNI_ORIGIN,user:env.AGENTONE_GUENNI_USER,password:env.AGENTONE_GUENNI_PASSWORD},
  {id:'fressi',origin:env.AGENTONE_FRESSI_ORIGIN,user:env.AGENTONE_FRESSI_USER,password:env.AGENTONE_FRESSI_PASSWORD},
];

async function session(instance){
  const response=await fetch(`${instance.origin}/login`,{method:'POST',headers:{origin:instance.origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:instance.user,password:instance.password}),redirect:'manual',signal:AbortSignal.timeout(15_000)});
  if(response.status!==303)throw new Error(`${instance.id}: Login ${response.status}`);
  return response.headers.get('set-cookie')?.split(';')[0]||'';
}

async function request(instance,cookie,method='GET',body){
  const response=await fetch(`${instance.origin}/agentone/personal/connectors`,{method,headers:{cookie,origin:instance.origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15_000)});
  const payload=await response.json();if(!response.ok)throw new Error(`${instance.id}: Connector API ${response.status} ${payload.error||''}`);return payload;
}

const guenni=instances[0],fressi=instances[1],guenniCookie=await session(guenni),fressiCookie=await session(fressi);
await request(guenni,guenniCookie,'PUT',{id:'calendar',status:'PREPARED',permissions:['calendar.read','calendar.drafts']});
await request(guenni,guenniCookie,'PUT',{id:'home',status:'PREPARED',permissions:['home.status','home.routines']});
const guenniState=await request(guenni,guenniCookie),fressiState=await request(fressi,fressiCookie);
const calendar=guenniState.connectors.find(item=>item.id==='calendar');
const home=guenniState.connectors.find(item=>item.id==='home');
if(calendar?.status!=='PREPARED'||calendar.permissions.length!==2)throw new Error('Günni: Kalenderfreigaben wurden nicht persistent gespeichert');
if(home?.status!=='PREPARED'||home.permissions.length!==2)throw new Error('Günni: Home-Connector-Freigaben wurden nicht persistent gespeichert');
if(fressiState.connectors.some(item=>item.id==='calendar'&&item.status==='PREPARED'))throw new Error('Connector-Status ist nicht instanzgetrennt');
if(fressiState.connectors.some(item=>item.id==='home'&&item.status==='PREPARED'))throw new Error('Home-Connector-Status ist nicht instanzgetrennt');
console.log(JSON.stringify({guenni:{calendar:calendar.status,home:home.status,permissions:calendar.permissions.length+home.permissions.length},fressi:{calendar:'OFF',home:'OFF'},secretsExposed:false},null,2));
