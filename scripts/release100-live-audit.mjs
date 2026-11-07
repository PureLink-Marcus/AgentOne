import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.')),host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP,user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER,key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH,knownHosts=path.resolve('output/demo/known_hosts'),release='2026.11.07-100';
if(!host||!user||!key)throw new Error('SSH-Ziel fehlt');
const sqliteAudit=`
import { DatabaseSync } from 'node:sqlite';
import { listPersonalBriefingExecutions,listPersonalBriefingSkills } from './server/personal-learning-lab-store.mjs';
const db=new DatabaseSync('/data/agentone-demo.sqlite',{readOnly:true});
const users=db.prepare("SELECT DISTINCT user_id FROM personal_learning_lab_skills ORDER BY user_id").all().map(row=>row.user_id);
let active=0,skills=0,executions=0,valid=true;
for(const userId of users){const userSkills=listPersonalBriefingSkills(db,{userId}),userExecutions=listPersonalBriefingExecutions(db,{userId,limit:100});skills+=userSkills.length;active+=userSkills.filter(item=>item.active&&item.status==='ACTIVE').length;executions+=userExecutions.length;if(userSkills.some(item=>JSON.stringify(item).match(/procedure|prompt|payload|evidence|client_secret|password=/i)))valid=false;}
const executionColumns=db.prepare("PRAGMA table_info(personal_learning_lab_executions)").all().map(row=>row.name),forbiddenColumns=executionColumns.filter(name=>/procedure|prompt|payload|evidence|secret|body/i.test(name));
const result={schema:'agentone.release100-learning-audit/v1',users:users.length,skills,active,executions,lifecycleValid:valid,forbiddenExecutionColumns:forbiddenColumns.length,secretsExposed:false};
console.log(JSON.stringify(result));db.close();if(!valid||forbiddenColumns.length)process.exit(2);
`;
const payload=Buffer.from(sqliteAudit).toString('base64'),command=`set -eu
for prefix in fressi-app guenni-app; do
  cid=$(docker ps --format '{{.ID}}|{{.Names}}' | awk -F'|' -v prefix="$prefix" '$2 ~ "^" prefix "-" {print $1; exit}')
  test -n "$cid"
  image=$(docker inspect "$cid" --format '{{.Config.Image}}')
  version=$(docker exec "$cid" printenv AGENTONE_RELEASE)
  errors=$(docker logs --since 30m "$cid" 2>&1 | grep -Eic '"outcome":"ERROR"|unhandled|uncaught|fatal' || true)
  echo "container|$prefix|$image|$version|$errors"
  printf '%s' '${payload}' | base64 -d | docker exec -i "$cid" node --input-type=module | sed "s/^/audit|$prefix|/"
done`;
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,command],{encoding:'utf8',timeout:90_000});
if(result.status!==0)throw new Error(`Release-100-Live-Audit fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-1200)}`);
const lines=result.stdout.trim().split(/\r?\n/),containers=lines.filter(line=>line.startsWith('container|')).map(line=>{const [,name,image,version,errorCount]=line.split('|');return {name,image,version,errorCount:Number(errorCount)};}),audits=lines.filter(line=>line.startsWith('audit|')).map(line=>{const [,name,...json]=line.split('|');return {name,...JSON.parse(json.join('|'))};});
assert.equal(containers.length,2);for(const item of containers){assert.equal(item.image,`purelink/agentone:${release}`);assert.equal(item.version,release);assert.equal(item.errorCount,0);}assert.equal(audits.length,2);for(const audit of audits){assert.equal(audit.schema,'agentone.release100-learning-audit/v1');assert.equal(audit.lifecycleValid,true);assert.equal(audit.forbiddenExecutionColumns,0);assert.equal(audit.secretsExposed,false);}const guenni=audits.find(item=>item.name==='guenni-app');assert.ok(guenni?.skills>=1);assert.ok(guenni?.active>=1);assert.ok(guenni?.executions>=1);
console.log(JSON.stringify({release,containers,audits,secretsExposed:false},null,2));
