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
access=$(docker ps --format '{{.Names}}' | grep '^guenni-access-' | head -1)
app=$(docker ps --format '{{.Names}}' | grep '^guenni-app-' | head -1)
test -n "$access"
test -n "$app"
docker inspect -f 'role=access image={{.Config.Image}} health={{.State.Health.Status}}' "$access"
docker inspect -f 'role=app image={{.Config.Image}} health={{.State.Health.Status}}' "$app"
access_env=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$access")
app_env=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$app")
personal_url=false
personal_token=false
companion_secret=false
echo "$access_env" | grep -q '^PERSONAL_API_URL=.' && personal_url=true
echo "$access_env" | grep -q '^PERSONAL_API_TOKEN=.' && personal_token=true
echo "$app_env" | grep -Eq '^AGENTONE_(COMPANION_PEPPER|SECRET_KEY)=.{32,}$' && companion_secret=true
printf 'personalApiUrlConfigured=%s\npersonalApiTokenConfigured=%s\ncompanionSecretConfigured=%s\n' "$personal_url" "$personal_token" "$companion_secret"
echo '--- companion audit (redacted) ---'
docker logs --since 2h "$access" 2>&1 | grep 'companion.request' | tail -80 | sed -E 's/(a1d_[A-Za-z0-9_-]+|[0-9]{6})/[REDACTED]/g; s/(token|secret|password|authorization|cookie)[=:][^ ,}]+/\\1=[REDACTED]/Ig' || true`;

const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:60_000});
if(result.status!==0)throw new Error(`iPhone-Diagnose fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-1000)}`);
process.stdout.write(result.stdout||'');
