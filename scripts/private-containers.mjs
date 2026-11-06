import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';
const env=loadEnv(path.resolve('.'));const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;const knownHosts=path.resolve('output/demo/known_hosts');
const command=`docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}' | grep -E '(fressi|guenni)' || true`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:30_000});process.stdout.write(result.stdout||'');if(result.status!==0)throw new Error('Containerstatus konnte nicht gelesen werden');
