import { spawnSync } from 'node:child_process';

for(const script of ['coolify-deploy.mjs','coolify-routes.mjs','coolify-start-jarvis.mjs']){
  const result=spawnSync(process.execPath,[`scripts/${script}`],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
}
await new Promise(resolve=>setTimeout(resolve,30_000));
let initialized;
for(let attempt=1;attempt<=9;attempt++){
  initialized=spawnSync(process.execPath,['scripts/openclaw-initialize.mjs'],{stdio:attempt===9?'inherit':'ignore'});
  if(initialized.status===0)break;
  await new Promise(resolve=>setTimeout(resolve,10_000));
}
if(initialized?.status!==0)process.exit(initialized?.status||1);
console.log('AgentOne-Rollout inklusive dynamischer Trusted-Proxy-Konfiguration abgeschlossen.');
