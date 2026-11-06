import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
if(!host||!user||!key)throw new Error('SSH-Zielkonfiguration unvollständig');
const knownHosts=path.resolve('output/demo/known_hosts');
const args=['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=12','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,'id -un; docker version --format "docker={{.Server.Version}}"; docker compose version --short; df -h / | tail -1'];
const result=spawnSync('ssh',args,{encoding:'utf8',timeout:25_000});
if(result.status!==0)throw new Error(`SSH-Prüfung fehlgeschlagen: ${(result.stderr||'').slice(0,300)}`);
console.log(result.stdout.trim());
