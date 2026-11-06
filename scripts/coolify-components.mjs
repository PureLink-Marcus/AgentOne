import path from 'node:path';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const base=String(env.COOLIFY_HETZNER_URL||env.COOLIFY_URL||'').replace(/\/$/,'');
const token=env.COOLIFY_HETZNER_API_TOKEN||env.COOLIFY_API_TOKEN;
const apiBase=base.endsWith('/api/v1')?base:`${base}/api/v1`;
const response=await fetch(`${apiBase}/services/sir37msobwojpocmdw3l6sbp`,{headers:{authorization:`Bearer ${token}`,accept:'application/json'}});
if(!response.ok)throw new Error(`HTTP ${response.status}`);
const service=await response.json();
const components=[];
for(const listName of ['applications','databases'])for(const item of service[listName]||[])components.push({kind:listName==='applications'?'application':'database',uuid:item.uuid,name:item.name||item.human_name||item.service_name,status:item.status,url:item.fqdn||item.url||null,image:item.image});
console.log(JSON.stringify({uuid:service.uuid,name:service.name,status:service.status,components},null,2));
