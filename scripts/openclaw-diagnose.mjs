import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';
import { redact } from '../server/secrets.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const knownHosts=path.resolve('output/demo/known_hosts');
const command=`c=$(docker ps -a --format '{{.Names}}|{{.Image}}' | grep 'ghcr.io/openclaw/openclaw:2026.10.8' | head -1 | cut -d'|' -f1); test -n "$c" && docker inspect -f '{{range .Mounts}}{{.Name}} -> {{.Destination}}{{println}}{{end}}' "$c" && docker logs --tail 80 "$c" 2>&1`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:45_000});
const secrets=Object.entries(env).filter(([name,value])=>/(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)/i.test(name)&&String(value).length>=8).map(([,value])=>String(value));
console.log(redact((result.stdout||result.stderr||'').trim(),secrets));
if(result.status!==0)process.exitCode=1;
