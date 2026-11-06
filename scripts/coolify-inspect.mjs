import path from 'node:path';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const base=String(env.COOLIFY_HETZNER_URL||env.COOLIFY_URL||'').replace(/\/$/,'');
const token=env.COOLIFY_HETZNER_API_TOKEN||env.COOLIFY_API_TOKEN;
if(!base||!token)throw new Error('Coolify URL oder API-Token fehlt');
const apiBase=base.endsWith('/api/v1')?base:`${base}/api/v1`;
async function get(route){
  const response=await fetch(`${apiBase}${route}`,{headers:{authorization:`Bearer ${token}`,accept:'application/json'},signal:AbortSignal.timeout(15_000)});
  const text=await response.text();
  if(!response.ok)throw new Error(`${route}: HTTP ${response.status} ${text.slice(0,160)}`);
  return text?JSON.parse(text):null;
}
function compact(item){
  return Object.fromEntries(['uuid','name','description','status','ip','fqdn','server_uuid','project_uuid','environment_name','environment_uuid','type'].filter(key=>item?.[key]!==undefined).map(key=>[key,item[key]]));
}
const health=await fetch(`${apiBase}/health`,{signal:AbortSignal.timeout(10_000)}).then(async response=>({status:response.status,body:(await response.text()).slice(0,120)}));
const [servers,projects,resources]=await Promise.all([get('/servers'),get('/projects'),get('/resources')]);
console.log(JSON.stringify({endpoint:new URL(apiBase).origin,health,servers:(servers||[]).map(compact),projects:(projects||[]).map(project=>({...compact(project),environments:(project.environments||[]).map(compact)})),resources:(resources||[]).map(compact)},null,2));
