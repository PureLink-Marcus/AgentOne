import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';
import { redact } from '../server/secrets.mjs';

const env=loadEnv(path.resolve('.'));
const modelFlag=process.argv.find(value=>value.startsWith('--model='));
const requestedModel=modelFlag?.slice(8)||'';
if(requestedModel&&!/^openai\/gpt-6(?:\.1)?-(?:luna|sol|astra)$/.test(requestedModel))throw new Error('Nicht erlaubtes Smoke-Test-Modell');
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const knownHosts=path.resolve('output/demo/known_hosts');
const command=`set -eu; c=$(docker ps --format '{{.Names}}|{{.Image}}' | grep 'ghcr.io/openclaw/openclaw:2026.10.8' | head -1 | cut -d'|' -f1); test -n "$c"; docker exec "$c" openclaw infer model run ${requestedModel?`--model '${requestedModel}' `:''}--prompt 'Reply with exactly: smoke-ok' --json`;
const started=Date.now();
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:120_000});
const secrets=Object.entries(env).filter(([name,value])=>/(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)/i.test(name)&&String(value).length>=8).map(([,value])=>String(value));
const output=`${result.stdout||''}\n${result.stderr||''}`;
if(result.status!==0||!/smoke-ok/i.test(output)){
  console.error(redact(output.slice(-1500),secrets));
  throw new Error('OpenClaw/OpenAI-Inferenztest fehlgeschlagen');
}
const model=output.match(/"model"\s*:\s*"([^"]+)"/i)?.[1]||'configured-openai-model';
if(!/openai|gpt/i.test(model)&&!/openai/i.test(output))throw new Error('Der aktive Provider ist nicht als OpenAI erkennbar');
console.log(JSON.stringify({provider:'openai',model,result:'smoke-ok',latencyMs:Date.now()-started,secretsExposed:false},null,2));
