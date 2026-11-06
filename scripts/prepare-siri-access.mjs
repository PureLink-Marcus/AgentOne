import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../server/state.mjs';

const root=path.resolve('.'),master=path.join(root,'master','env','.env.master');
let env=loadEnv(root);
function ensure(name){if(env[name])return env[name];const value=crypto.randomBytes(32).toString('base64url');fs.appendFileSync(master,`\n${name}=${value}\n`,{encoding:'utf8'});env={...env,[name]:value};return value;}
function ensureSetting(name,value){if(env[name])return env[name];fs.appendFileSync(master,`\n${name}=${value}\n`,{encoding:'utf8'});env={...env,[name]:value};return value;}
ensureSetting('AGENTONE_INSTRUCTION_RECIPIENT','mw@ric2k.de');
ensureSetting('AGENTONE_INSTRUCTION_DELIVERY_MODE','manual-approved');
ensureSetting('AGENTONE_INSTRUCTION_INCLUDE_TASK_KEYS','true');
const instances=[
  {id:'guenni',name:'Günni',origin:env.AGENTONE_GUENNI_ORIGIN||'https://guenni.mwart.solutions',key:ensure('AGENTONE_GUENNI_SIRI_API_KEY')},
  {id:'fressi',name:'Fressi',origin:env.AGENTONE_FRESSI_ORIGIN||'https://fressi.mwart.solutions',key:ensure('AGENTONE_FRESSI_SIRI_API_KEY')}
];
const target=path.join(root,'output','demo','siri-private-access.txt');
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.writeFileSync(target,instances.map(item=>`${item.name}\nURL: ${item.origin}/agentone/siri/v1/execute\nAuthorization: Bearer ${item.key}\nContent-Type: application/json\nBody: {"intent":"home.lights.off","requestId":"Kurzbefehleingabe"}`).join('\n\n'),{encoding:'utf8',mode:0o600});
console.log(`Siri-Zugänge vorbereitet: ${instances.length}; private Ablage: ${target}`);
