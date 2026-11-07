import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP,user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER,key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH,knownHosts=path.resolve('output/demo/known_hosts'),release='2026.11.07-99';
if(!host||!user||!key)throw new Error('SSH-Ziel fehlt');
const databaseAudit=`
import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:8000,ssl:process.env.DATABASE_SSL==='require'?{rejectUnauthorized:true}:false});
const counts=(await pool.query("SELECT (SELECT COUNT(*)::int FROM personal_mail_accounts) accounts,(SELECT COUNT(*)::int FROM personal_mail_messages) messages,(SELECT COUNT(*)::int FROM personal_mail_sync_state) sync_states,(SELECT COUNT(DISTINCT user_id)::int FROM personal_mail_messages) users,(SELECT COUNT(*)::int FROM personal_mail_messages WHERE uid IS NULL OR uid_validity IS NULL) cursorless" )).rows[0];
const states=(await pool.query("SELECT status,last_mode AS mode,last_seen_count AS total,last_new_count AS new_count,failure_count,last_uid IS NOT NULL AS cursor_ready,uid_validity IS NOT NULL AS uidvalidity_ready FROM personal_mail_sync_state ORDER BY account_id" )).rows;
const forbidden=(await pool.query("SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='personal_mail_messages' AND column_name=ANY($1::text[])",[['body','source','snippet','html','text','attachments','raw_headers','secret','token']])).rows[0].count;
await pool.end();
const result={schema:'agentone.release99-mail-audit/v1',...counts,states,forbidden_content_columns:Number(forbidden),secretsExposed:false};
console.log(JSON.stringify(result));
if(Number(counts.accounts)<1||Number(counts.messages)<1||Number(counts.sync_states)<1||Number(counts.cursorless)!==0||Number(forbidden)!==0||states.some(item=>item.status!=='LIVE'||!item.cursor_ready||!item.uidvalidity_ready))process.exit(2);
`;
const payload=Buffer.from(databaseAudit).toString('base64'),command=`set -eu
for prefix in fressi-app guenni-app; do
  cid=$(docker ps --format '{{.ID}}|{{.Names}}' | awk -F'|' -v prefix="$prefix" '$2 ~ "^" prefix "-" {print $1; exit}')
  test -n "$cid"
  image=$(docker inspect "$cid" --format '{{.Config.Image}}')
  version=$(docker exec "$cid" printenv AGENTONE_RELEASE)
  errors=$(docker logs --since 20m "$cid" 2>&1 | grep -Eic '"outcome":"ERROR"|unhandled|uncaught|fatal' || true)
  echo "container|$prefix|$image|$version|$errors"
done
cid=$(docker ps --format '{{.ID}}|{{.Names}}' | awk -F'|' '$2 ~ /^guenni-app-/ {print $1; exit}')
printf '%s' '${payload}' | base64 -d | docker exec -i "$cid" node --input-type=module`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:90_000});
if(result.status!==0)throw new Error(`Release-99-Mail-Audit fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-1200)}`);
const lines=result.stdout.trim().split(/\r?\n/),containers=lines.filter(line=>line.startsWith('container|')).map(line=>{const [,name,image,version,errorCount]=line.split('|');return {name,image,version,errorCount:Number(errorCount)};}),database=JSON.parse(lines.findLast(line=>line.startsWith('{'))||'{}');
assert.equal(containers.length,2);for(const item of containers){assert.equal(item.image,`purelink/agentone:${release}`);assert.equal(item.version,release);assert.equal(item.errorCount,0);}assert.equal(database.schema,'agentone.release99-mail-audit/v1');
console.log(JSON.stringify({release,containers,database,secretsExposed:false},null,2));
