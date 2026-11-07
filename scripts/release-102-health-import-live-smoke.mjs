import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const RELEASE='2026.11.07-102';
const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const sshUser=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const sshKey=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const origin=String(env.AGENTONE_GUENNI_ORIGIN||'https://guenni.mwart.solutions').replace(/\/$/,'');
const knownHosts=path.resolve('output/demo/known_hosts');
if(!host||!sshUser||!sshKey)throw new Error('SSH-Zielkonfiguration fehlt');
if(!/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(origin))throw new Error('Günni-Origin ist ungültig');

const publicResponse=await fetch(`${origin}/agentone/release.json?smoke=health-import-102`,{
  redirect:'manual',headers:{accept:'application/json'},signal:AbortSignal.timeout(20_000),
});
let publicAccess='AUTH_REQUIRED';
if(publicResponse.status===200){
  const payload=await publicResponse.json();
  assert.equal(payload.release,RELEASE);
  publicAccess='RELEASE_CONFIRMED';
}else{
  assert.ok([302,303,307,308,401].includes(publicResponse.status),`Unerwarteter öffentlicher Status ${publicResponse.status}`);
}

const containerProgram=String.raw`
const RELEASE='2026.11.07-102';
const origin='http://127.0.0.1:4173';
const token=String(process.env.AGENTONE_INTERNAL_API_TOKEN||'');
const user='release102-health-smoke-'+Date.now().toString(36)+'-'+process.pid.toString(36);
const baseHeaders={'x-agentone-internal-token':token,'x-agentone-user':user,accept:'application/json'};
let jobId=null,fixtureBytes=0,completedJob=null,cleanupMetrics=null,cleanupConsents=null,primaryError=null;
const fail=code=>Object.assign(new Error(code),{code});
async function request(url,options={},expected=[200]){
  const response=await fetch(origin+url,{...options,headers:{...baseHeaders,...(options.headers||{})},signal:AbortSignal.timeout(options.timeoutMs||180000)});
  const payload=await response.json().catch(()=>({}));
  if(!expected.includes(response.status))throw fail('LIVE_'+String(url).replace(/[^A-Za-z0-9]+/g,'_').toUpperCase()+'_'+response.status);
  return payload;
}
function collectKeys(value,keys=new Set()){
  if(Array.isArray(value)){for(const item of value)collectKeys(item,keys);return keys;}
  if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){keys.add(key);collectKeys(item,keys);}
  return keys;
}
async function cleanup(){
  try{
    const listed=await request('/api/internal/personal/health/import-jobs',{},[200]);
    for(const job of Array.isArray(listed.jobs)?listed.jobs:[])if(['QUEUED','RUNNING'].includes(job.state))await request('/api/internal/personal/health/import-jobs/'+encodeURIComponent(job.id),{method:'DELETE'},[200]);
    await request('/api/internal/personal/health/data',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({confirm:'DELETE_MY_HEALTH_DATA',includeConsents:true})},[200]);
    const status=await request('/api/internal/personal/health',{},[200]);
    cleanupMetrics=Number(status.store?.metrics);
    cleanupConsents=Array.isArray(status.consents)?status.consents.length:-1;
    if(cleanupMetrics!==0||cleanupConsents!==0)throw fail('LIVE_CLEANUP_INCOMPLETE');
  }catch(error){if(!primaryError)primaryError=error;else primaryError.cleanupCode=String(error?.code||'LIVE_CLEANUP_FAILED');}
}
try{
  if(token.length<16)throw fail('LIVE_INTERNAL_TOKEN_MISSING');
  const service=await request('/api/health',{},[200]);
  if(service.release!==RELEASE)throw fail('LIVE_RELEASE_MISMATCH');
  const health=await request('/api/internal/personal/health',{},[200]);
  if(health.encryptionReady!==true||health.policy?.userIsolated!==true||health.policy?.medicalDiagnosis!==false)throw fail('LIVE_HEALTH_POLICY_NOT_READY');
  const consentPayload=await request('/api/internal/personal/health/consents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scopes:['activity','sleep']})},[201]);
  const consentId=String(consentPayload.consent?.id||'');
  if(!consentId)throw fail('LIVE_CONSENT_MISSING');
  const now=new Date(),day=new Date(now.getTime()-2*86400000).toISOString().slice(0,10),previousDay=new Date(now.getTime()-3*86400000).toISOString().slice(0,10),marker=crypto.randomUUID();
  const prefix=Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="de_DE">\n<!--'+marker);
  const filler=Buffer.alloc(34*1024*1024,0x41);
  const suffix=Buffer.from('-->\n<Record type="HKQuantityTypeIdentifierStepCount" sourceName="AgentOne Release 102 Live Smoke" unit="count" creationDate="'+day+' 08:05:00 +0100" startDate="'+day+' 07:00:00 +0100" endDate="'+day+' 08:00:00 +0100" value="1234"/>\n<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="AgentOne Release 102 Live Smoke" value="HKCategoryValueSleepAnalysisAsleepDeep" creationDate="'+day+' 08:05:00 +0100" startDate="'+previousDay+' 23:30:00 +0100" endDate="'+day+' 00:30:00 +0100"/>\n</HealthData>');
  const xml=Buffer.concat([prefix,filler,suffix]);fixtureBytes=xml.length;filler.fill(0);
  if(fixtureBytes<=32*1024*1024||fixtureBytes>=512*1024*1024)throw fail('LIVE_FIXTURE_SIZE_INVALID');
  const created=await request('/api/internal/personal/health/import-jobs',{method:'POST',headers:{'content-type':'application/xml','x-agentone-health-file-name':'release-102-live-export.xml','x-agentone-health-consent-id':consentId,'x-agentone-human-actor':user,'x-agentone-human-action':'health-import-confirmed'},body:xml,timeoutMs:240000},[202]);
  xml.fill(0);jobId=String(created.job?.id||'');
  if(!jobId)throw fail('LIVE_JOB_ID_MISSING');
  for(let attempt=0;attempt<360;attempt+=1){
    const detail=await request('/api/internal/personal/health/import-jobs/'+encodeURIComponent(jobId),{},[200]);completedJob=detail.job;
    if(completedJob?.state==='COMPLETED')break;
    if(['FAILED','CANCELLED'].includes(completedJob?.state))throw fail('LIVE_JOB_'+completedJob.state);
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(completedJob?.state!=='COMPLETED')throw fail('LIVE_JOB_TIMEOUT');
  if(completedJob.result?.metrics!==2||completedJob.result?.recordsSeen!==2)throw fail('LIVE_JOB_RESULT_INVALID');
  const keys=[...collectKeys(completedJob)],forbiddenKeys=keys.filter(key=>/^(?:cipher|cipherPath|cipherIv|cipherTag|iv|tag|aad|path|userId|consentId|sourceHash|token|secret|credential|raw|rawData)$/i.test(key));
  if(forbiddenKeys.length)throw fail('LIVE_JOB_PROJECTION_UNSAFE');
  const serialized=JSON.stringify(completedJob);
  if(serialized.includes(token)||serialized.includes(consentId)||serialized.includes('1234')||serialized.includes('HKCategoryValueSleepAnalysisAsleepDeep'))throw fail('LIVE_JOB_VALUE_LEAK');
  const after=await request('/api/internal/personal/health',{},[200]);
  if(Number(after.store?.metrics)!==2)throw fail('LIVE_HEALTH_COUNT_INVALID');
}catch(error){primaryError=error;}finally{await cleanup();}
if(primaryError){process.stderr.write(JSON.stringify({ok:false,code:String(primaryError.code||'LIVE_HEALTH_IMPORT_FAILED'),cleanupCode:primaryError.cleanupCode||null,cleanupMetrics,cleanupConsents,secretsExposed:false})+'\n');process.exit(1);}
process.stdout.write(JSON.stringify({ok:true,release:RELEASE,fixtureBytes,jobState:completedJob.state,metrics:completedJob.result.metrics,reloadPersistence:'covered-locally',cleanupMetrics,cleanupConsents,userIsolation:'DEDICATED_TEST_USER',secretsExposed:false})+'\n');
`;

const encoded=Buffer.from(containerProgram,'utf8').toString('base64');
const remoteCommand=`set -eu
cid=$(docker ps --format '{{.ID}}|{{.Names}}' | awk -F'|' '$2 ~ /^guenni-app-/ {print $1; exit}')
test -n "$cid"
code=$(printf '%s' '${encoded}' | base64 -d)
docker exec "$cid" node --input-type=module -e "$code"`;
const result=spawnSync('ssh',['-i',sshKey,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${sshUser}@${host}`,remoteCommand],{
  encoding:'utf8',timeout:360_000,maxBuffer:1024*1024,
});
if(result.status!==0){
  let safeFailure={ok:false,code:'LIVE_HEALTH_IMPORT_REMOTE_FAILED',secretsExposed:false};
  try{const line=String(result.stderr||result.stdout||'').trim().split(/\r?\n/).at(-1);const parsed=JSON.parse(line);safeFailure={ok:false,code:String(parsed.code||safeFailure.code).slice(0,80),cleanupCode:parsed.cleanupCode?String(parsed.cleanupCode).slice(0,80):null,cleanupMetrics:parsed.cleanupMetrics??null,cleanupConsents:parsed.cleanupConsents??null,secretsExposed:false};}catch{}
  throw new Error(JSON.stringify(safeFailure));
}
const line=String(result.stdout||'').trim().split(/\r?\n/).at(-1),report=JSON.parse(line);
assert.equal(report.ok,true);assert.equal(report.release,RELEASE);assert.equal(report.jobState,'COMPLETED');assert.equal(report.metrics,2);assert.equal(report.cleanupMetrics,0);assert.equal(report.cleanupConsents,0);assert.equal(report.secretsExposed,false);
process.stdout.write(JSON.stringify({...report,publicStatus:publicResponse.status,publicAccess,publicOrigin:origin})+'\n');
