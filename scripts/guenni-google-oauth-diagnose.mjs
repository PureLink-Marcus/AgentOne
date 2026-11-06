import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const knownHosts=path.resolve('output/demo/known_hosts');
if(!host||!user||!key)throw new Error('SSH-Ziel fehlt');
const command=`set -eu
c=$(docker ps --format '{{.Names}}' | grep '^guenni-app-' | head -1)
test -n "$c"
values=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$c")
client=false; secret=false; redirect=''
echo "$values" | grep -q '^GMAIL_CLIENT_ID=.' && client=true
echo "$values" | grep -q '^GMAIL_CLIENT_SECRET=.' && secret=true
redirect=$(echo "$values" | sed -n 's/^GMAIL_REDIRECT_URI=//p' | head -1)
printf 'container=%s\nclientIdConfigured=%s\nclientSecretConfigured=%s\nredirectUri=%s\n' "$c" "$client" "$secret" "$redirect"
echo '--- oauth logs ---'
docker logs --since 2h "$c" 2>&1 | grep -Ei 'google|oauth|invalid|redirect|callback|token HTTP' | tail -80 | sed -E 's/(Bearer |token[=: ]+|client_secret[=: ]+)[A-Za-z0-9._~+\/-]+/\\1[REDACTED]/gi' || true`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:45_000});
if(result.status!==0)throw new Error(`OAuth-Diagnose fehlgeschlagen: ${(result.stderr||'').slice(-500)}`);
process.stdout.write(result.stdout||'');
