import path from 'node:path';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
async function session(origin,user,password){origin=String(origin||'').replace(/\/$/,'');const response=await fetch(`${origin}/login`,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:user,password}),redirect:'manual',signal:AbortSignal.timeout(20_000)});if(response.status!==303)throw new Error(`${origin}: Login HTTP ${response.status}`);const cookie=String(response.headers.get('set-cookie')||'').split(';')[0];if(!cookie)throw new Error(`${origin}: Sessioncookie fehlt`);return {origin,cookie};}
async function dashboard(target){const response=await fetch(`${target.origin}/agentone/dashboard`,{headers:{cookie:target.cookie},signal:AbortSignal.timeout(20_000)});if(!response.ok)throw new Error(`${target.origin}: Dashboard HTTP ${response.status}`);return response.json();}
const guenni=await session(env.AGENTONE_GUENNI_ORIGIN,env.AGENTONE_GUENNI_USER,env.AGENTONE_GUENNI_PASSWORD),purelink=await session(env.AGENTONE_ASSISTANT_ORIGIN,env.AGENTONE_MOBILE_USER||'marcus',env.AGENTONE_MOBILE_PASSWORD);
const [guenniDashboard,purelinkDashboard,home]=await Promise.all([dashboard(guenni),dashboard(purelink),fetch(`${guenni.origin}/agentone/home-assistant/dashboard`,{headers:{cookie:guenni.cookie},signal:AbortSignal.timeout(20_000)}).then(async response=>{if(!response.ok)throw new Error(`Home Dashboard HTTP ${response.status}`);return response.json();})]);
const result={auditedAt:new Date().toISOString(),targetRelease:'2026.11.06-77',instances:{guenni:{release:guenniDashboard.release,live:guenniDashboard.policy?.liveData===true},purelink:{release:purelinkDashboard.release,live:purelinkDashboard.policy?.liveData===true}},homeAssistant:{status:home.status,controlEnabled:home.controlEnabled,entities:home.summary?.entities,domains:home.summary?.domains},blockers:[]};
if(result.instances.purelink.release!==result.targetRelease)result.blockers.push('PURELINK_MAIN_DEPLOY_APPROVAL');
if(!result.homeAssistant.controlEnabled)result.blockers.push('RASPBERRY_ENABLE_HOME_CONTROL');
console.log(JSON.stringify(result,null,2));
