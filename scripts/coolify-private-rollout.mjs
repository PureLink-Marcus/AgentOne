import { spawnSync } from 'node:child_process';
const run=(file,quiet=false)=>spawnSync(process.execPath,[`scripts/${file}`],{stdio:quiet?'ignore':'inherit'});
let result=run('coolify-private-deploy.mjs');if(result.status!==0)process.exit(result.status||1);
await new Promise(resolve=>setTimeout(resolve,45_000));
for(let attempt=1;attempt<=8;attempt++){result=run('openclaw-private-initialize.mjs',attempt<8);if(result.status===0)break;await new Promise(resolve=>setTimeout(resolve,10_000));}
if(result.status!==0)process.exit(result.status||1);
await new Promise(resolve=>setTimeout(resolve,35_000));
result=run('private-domain-smoke.mjs');if(result.status!==0)process.exit(result.status||1);
console.log('Fressi und Günni vollständig ausgerollt und geprüft.');
