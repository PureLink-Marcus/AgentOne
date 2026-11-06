import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const knownHosts=path.resolve('output/demo/known_hosts');
if(!host||!user||!key)throw new Error('SSH-Zielkonfiguration unvollständig');
const command=`
set -eu
containers=$(docker ps -a --format '{{.Names}}|{{.Image}}' | grep -E 'purelink/agentone|ghcr.io/openclaw/openclaw|postgres:17-alpine' | cut -d'|' -f1 || true)
if [ -z "$containers" ]; then echo 'NO_AGENTONE_CONTAINERS'; exit 2; fi
docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}' | grep -E 'purelink/agentone|ghcr.io/openclaw/openclaw|postgres:17-alpine' || true
for c in $containers; do
  image=$(docker inspect -f '{{.Config.Image}}' "$c")
  case "$image" in
    purelink/agentone:*)
      port=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$c" | sed -n 's/^PORT=//p')
      if [ "$port" = '8080' ]; then echo "PROXY|$c|$(docker exec "$c" wget -qO- http://127.0.0.1:8080/proxy-health)"; else echo "HEALTH|$c|$(docker exec "$c" wget -qO- http://127.0.0.1:4173/api/health)"; fi ;;
    postgres:17-alpine)
      echo "DATABASE|$c|$(docker exec "$c" sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null && psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT current_database() || chr(58) || count(*) FROM runtime_health GROUP BY current_database();"')" ;;
    ghcr.io/openclaw/openclaw:*)
      attempt=1
      until docker exec "$c" node dist/docker-healthcheck.js >/dev/null 2>&1; do
        if [ "$attempt" -ge 12 ]; then
          docker exec "$c" node dist/docker-healthcheck.js
          exit 1
        fi
        attempt=$((attempt + 1))
        sleep 5
      done
      echo "GATEWAY|$c|$(docker inspect -f '{{.State.Health.Status}}' "$c")" ;;
  esac
done
`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:90_000});
console.log((result.stdout||'').trim());
if(result.status!==0)throw new Error(`Remote Verifikation fehlgeschlagen (${result.status}): ${(result.stderr||'').slice(-800)}`);
