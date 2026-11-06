import path from 'node:path';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),origin=env.AGENTONE_GUENNI_ORIGIN;
const login=await fetch(`${origin}/login`,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.AGENTONE_GUENNI_USER,password:env.AGENTONE_GUENNI_PASSWORD}),redirect:'manual',signal:AbortSignal.timeout(20_000)});
if(login.status!==303)throw new Error(`Login HTTP ${login.status}`);
const cookie=String(login.headers.get('set-cookie')||'').split(';')[0];
const response=await fetch(`${origin}/agentone/home-assistant/dashboard`,{headers:{cookie,accept:'application/json'},signal:AbortSignal.timeout(20_000)}),dashboard=await response.json();
if(!response.ok)throw new Error(`Dashboard HTTP ${response.status}`);
const media=(dashboard.groups||[]).flatMap(group=>group.entities||[]).filter(item=>item.entity_id?.startsWith('media_player.')).map(item=>({entityId:item.entity_id,name:item.attributes?.friendly_name||item.entity_id,state:item.state,volume:typeof item.attributes?.volume_level==='number'?item.attributes.volume_level:null,groupMembers:item.attributes?.group_members||[]}));
console.log(JSON.stringify({release:'2026.11.06-77',readOnly:true,media:media.filter(item=>/sonos/i.test(item.entityId+' '+item.name)||item.groupMembers.length),allNumericVolumes:media.filter(item=>typeof item.volume==='number').map(item=>({entityId:item.entityId,name:item.name,state:item.state,volume:item.volume}))},null,2));
