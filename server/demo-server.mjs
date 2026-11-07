import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { mailConnectionOptions,mailErrorCode,normalizeMailPassword,publicMailError,publicMailFailure } from './mail-credentials.mjs';
import nodemailer from 'nodemailer';
import { createState, loadEnv } from './state.mjs';
import { allowedModes, checkAdapter } from './adapters.mjs';
import { assertLocalOrigin, completeEntraAuthorization, cookie, createEntraAuthorization, createSession, entraConfig, getSession, parseCookies, requireSession, tokenHash, verifyAccountCredentials, verifyBasicAuth } from './security.mjs';
import { decryptDemoSecret, encryptDemoSecret, secretInventory } from './secrets.mjs';
import { getPersonalMailAccount, getPersonalMailMessage, getPersonalMailSyncState, getPersonalService, initPostgres, listDuePersonalMailSyncs, listPersonalConnectors, listPersonalMailAccounts, listPersonalMailMessages, listPersonalServices, persistPersonalMailSync, postgresHealth, recordPersonalMailSyncFailure, savePersonalConnector, savePersonalMailAccount, savePersonalService, updatePersonalMailSettings, updatePersonalMailTest, updatePersonalServiceTest } from './postgres.mjs';
import { personalReply } from './personal-ai.mjs';
import { createPlatformEngine } from './platform-engine.mjs';
import { createLiveEventBus, formatSseMessage } from './live-events.mjs';
import { classifyMail, emptyMailGroups } from './mail-classifier.mjs';
import { groupMailMessages } from './mail-calendar-sync.mjs';
import { fetchSingleImapInsightContent, syncImapMailbox } from './personal-imap-sync.mjs';
import { createPersonalMailInsight, personalMailInsightAuditProjection, publicPersonalMailInsightError } from './personal-mail-insight.mjs';
import { approveMailRule, approveReplyDraft, buildMailBriefing, createMailRule, createReplyDraft } from './mail-workflow.mjs';
import { normalizePersonalService, personalServiceCatalog, testPersonalService } from './personal-services.mjs';
import { authorizeCompanion, companionDeviceStatus, companionStatus, createCompanionPairing, initCompanionStore, redeemCompanionPairing, revokeCompanion, storeCompanionEvent } from './personal-companion.mjs';
import { connectorAction, governanceSnapshot, initGovernanceStore, recordAudit } from './personal-governance.mjs';
import { applyNudgeFeedback, buildPersonalNudges, filterPersonalNudges, initNudgeStore, loadNudgeFeedbackProfile, loadNudgeSettings, quietNow, recordNudgeFeedback, resetNudgeFeedback, saveNudgeSettings } from './personal-nudges.mjs';
import { forgetMemoryEntry, initPersonalMemoryStore, listMemoryEntries } from './personal-memory.mjs';
import { approveMemoryCandidate, initPersonalMemoryReviewStore, listMemoryAreaPolicies, listMemoryCandidates, rejectMemoryCandidate, setMemoryAreaPolicy, stageMemoryCandidate } from './personal-memory-review.mjs';
import { claimDueRoutineRun, claimManualRoutineRun, completeRoutineRun, createRoutine, deleteRoutine, dueRoutines, failRoutineRun, initRoutineStore, listRoutineInbox, listRoutines, setRoutineRunInboxState, setRoutineState, simulateStoredRoutine } from './personal-routines.mjs';
import { buildRoutineBriefingResult } from './personal-routine-briefing.mjs';
import { buildPersonalBrief } from './personal-intelligence.mjs';
import { buildHealthDigest, createHealthConsent, healthConnectorCapabilities, importAppleHealth } from './personal-health.mjs';
import { buildPersonalHealthComparison } from './personal-health-comparison.mjs';
import { deleteHealthData, exportHealthData, getHealthConsent, healthStoreAuditSummary, initPersonalHealthStore, listHealthConsents, queryHealthMetrics, revokeHealthConsent, saveDerivedHealthSignal, saveHealthConsent, storeHealthImport } from './personal-health-store.mjs';
import { buildPersonalHealthTrends } from './personal-health-trends.mjs';
import { GoogleSyncError, syncGoogleReadOnly } from './google-live-sync.mjs';
import { initPersonalPulseStore, listPersonalPulseDeliveries, planPersonalPulse, recordPersonalPulseDelivery, resetPersonalPulseDeliveries } from './personal-pulse.mjs';
import { appendPersonalEvents, applyPersonalEventRetention, deletePersonalEvents, exportPersonalEvents, initPersonalEventLedger, personalEventLedgerAuditSummary, queryPersonalEvents, replacePersonalEvents } from './personal-event-ledger.mjs';
import { appendCommandStep, approveCommandGate, cancelCommandRun, completeCommandRun, createCommandRun, initPersonalCommandStream, listCommandRuns, publicCommandTimeline, recordCommandError, recordCommandResult } from './personal-command-stream.mjs';
import { fetchIcsCalendar, parseIcsCalendar, publicIcsError } from './ics-calendar-sync.mjs';
import { getPersonalIcsFeedCredential, getPersonalIcsStatus, initPersonalIcsStore, listDuePersonalIcsFeedUsers, recordPersonalIcsFailure, removePersonalIcsState, savePersonalIcsFeedSuccess, savePersonalIcsUploadState } from './personal-ics-store.mjs';
import { buildPersonalCalendarPlan, calendarPlanWindow } from './personal-calendar-plan.mjs';
import { googleSnapshotLedgerEvents, icsSnapshotLedgerEvents } from './personal-calendar-sources.mjs';
import { initWhoopConnectionStore, listDueWhoopConnections } from './whoop-connection-store.mjs';
import { completeWhoopAuthorization, disconnectWhoop, publicWhoopError, startWhoopAuthorization, syncWhoopConnection, whoopConfigFromEnv, whoopStatus } from './whoop-service.mjs';
import { activatePersonalBriefingSkill, approvePersonalBriefingDraft, createPersonalBriefingDraft, evaluatePersonalBriefingDraft, executePersonalBriefingSkill, initPersonalLearningLabStore, listPersonalBriefingExecutions, listPersonalBriefingSkills, rollbackPersonalBriefingSkill } from './personal-learning-lab-store.mjs';
import { attachHealthImportCommand, cancelHealthImportJob, claimNextHealthImportJob, completeHealthImportJob, failHealthImportJob, getHealthImportJob, getHealthImportJobInternal, initHealthImportJobStore, listHealthImportJobs, receiveHealthImportJob, safeHealthImportFailure, updateHealthImportJobProgress } from './personal-health-import-jobs.mjs';
import { runHealthImportWorker } from './personal-health-import-runner.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env=loadEnv(root);
const state=createState(root,env);
const healthImportQuarantineDir=path.join(path.dirname(state.databasePath),'health-import-quarantine');
const dist=path.join(root,'dist','demo');
const host=env.HOST||'127.0.0.1';
const port=Number(env.PORT||4173);
const postgres=await initPostgres(env);
const failedLogins=new Map();
const platform=createPlatformEngine(state.db);
const liveEvents=createLiveEventBus();
state.db.prepare('DELETE FROM user_sessions WHERE expires_at < ?').run(new Date().toISOString());
state.db.prepare('DELETE FROM auth_pending WHERE expires_at < ?').run(new Date().toISOString());
state.db.exec(`CREATE TABLE IF NOT EXISTS personal_mail_workflows(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL,hash TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
initCompanionStore(state.db);
initGovernanceStore(state.db);
initNudgeStore(state.db);
initPersonalMemoryStore(state.db);
initPersonalMemoryReviewStore(state.db);
initRoutineStore(state.db);
initPersonalHealthStore(state.db);
initWhoopConnectionStore(state.db);
initHealthImportJobStore(state.db,{quarantineDir:healthImportQuarantineDir});
initPersonalPulseStore(state.db);
initPersonalEventLedger(state.db);
initPersonalCommandStream(state.db);
initPersonalIcsStore(state.db);
initPersonalLearningLabStore(state.db);
const companionPepper=String(env.AGENTONE_COMPANION_PEPPER||env.AGENTONE_SECRET_KEY||'');
const companionPepperReady=Buffer.byteLength(companionPepper,'utf8')>=32;
const productionRuntime=String(env.NODE_ENV||'').toLowerCase()==='production';
const healthMasterKey=env.AGENTONE_HEALTH_MASTER_KEY||(!productionRuntime?env.AGENTONE_DEMO_MASTER_KEY:'')||'';
const healthImportMasterKey=String(env.AGENTONE_HEALTH_MASTER_KEY||'');
const healthImportCryptoReady=Buffer.byteLength(healthImportMasterKey,'utf8')>=32;
const healthCryptoReady=Buffer.byteLength(String(healthMasterKey),'utf8')>=32;
const healthCryptoEnv=healthCryptoReady?Object.freeze({AGENTONE_DEMO_MASTER_KEY:healthMasterKey}):Object.freeze({});
const healthEncrypt=value=>{if(!healthCryptoReady)throw Object.assign(new Error('Health-Verschlüsselung ist noch nicht konfiguriert'),{code:'HEALTH_ENCRYPTION_NOT_CONFIGURED',status:503});return encryptDemoSecret(value,healthCryptoEnv);};
const healthDecrypt=envelope=>{if(!healthCryptoReady)throw Object.assign(new Error('Health-Verschlüsselung ist noch nicht konfiguriert'),{code:'HEALTH_ENCRYPTION_NOT_CONFIGURED',status:503});return decryptDemoSecret(envelope,healthCryptoEnv);};
const whoopConfig=whoopConfigFromEnv(env);
const whoopMasterSecret=String(env.WHOOP_TOKEN_MASTER_KEY||env.AGENTONE_HEALTH_MASTER_KEY||'');
const whoopTokenCryptoReady=Buffer.byteLength(whoopMasterSecret,'utf8')>=32;
const activeHealthImportWorkers=new Map();let healthImportQueueBusy=false;
function healthImportCommandResult(job,result){
  if(!job.commandRunId||!job.commandStepId)return;
  recordCommandResult(state.db,{userId:job.userId,runId:job.commandRunId,toolStepId:job.commandStepId,summary:result.alreadyImported?'Identisches Health-Archiv war bereits importiert':'Health-Daten verschlüsselt importiert',output:{alreadyImported:Boolean(result.alreadyImported),recordsSeen:Number(result.recordsSeen)||0,normalizedMetrics:Number(result.metrics)||0,inserted:Number(result.inserted)||0,updated:Number(result.updated)||0,unchanged:Number(result.unchanged)||0,duplicatesRemoved:Number(result.duplicatesRemoved)||0,excludedByConsent:Number(result.excludedByConsent)||0}});
  completeCommandRun(state.db,{userId:job.userId,runId:job.commandRunId});
}
async function runHealthImportQueue(){
  if(healthImportQueueBusy||!healthImportCryptoReady)return;healthImportQueueBusy=true;let job=null,processed=false;
  try{
    job=claimNextHealthImportJob(state.db);if(!job)return;processed=true;
    const consent=getHealthConsent(state.db,{userId:job.userId,consentId:job.consentId,decrypt:healthDecrypt});
    if(consent.status!=='ACTIVE')throw Object.assign(new Error('Aktive Gesundheitsfreigabe fehlt'),{code:'HEALTH_CONSENT_REQUIRED',status:403});
    const controller=new AbortController(),active={controller,child:null};activeHealthImportWorkers.set(job.id,active);
    const result=await runHealthImportWorker(job,{consent,masterSecret:healthImportMasterKey,databasePath:state.databasePath,signal:controller.signal,onPhase:(phase,percent,child)=>{active.child=child;try{updateHealthImportJobProgress(state.db,{jobId:job.id,phase,percent});}catch{}}});
    const latest=getHealthImportJobInternal(state.db,{jobId:job.id});
    if(latest.state==='CANCELLED')return;
    try{healthImportCommandResult(latest,result);}catch{}
    await completeHealthImportJob(state.db,{jobId:job.id,result,quarantineDir:healthImportQuarantineDir});
    state.audit(job.userId,'HEALTH_IMPORT_JOB_COMPLETED',job.id,`sourceHash=${job.sourceHash}; bytes=${job.bytesReceived}`);
  }catch(error){
    if(job){
      let latest;try{latest=getHealthImportJobInternal(state.db,{jobId:job.id});}catch{}
      if(latest?.state==='COMPLETED'){
        const result=latest.resultJson?JSON.parse(latest.resultJson):{};try{healthImportCommandResult(latest,result);}catch{}
        await completeHealthImportJob(state.db,{jobId:job.id,result,quarantineDir:healthImportQuarantineDir}).catch(()=>{});
      }else if(latest?.state!=='CANCELLED'){
        const failure=safeHealthImportFailure(error);
        if(job.commandRunId&&job.commandStepId)try{recordCommandError(state.db,{userId:job.userId,runId:job.commandRunId,toolStepId:job.commandStepId,code:failure.code,message:failure.message,retryable:false});}catch{}
        await failHealthImportJob(state.db,{jobId:job.id,error:failure,quarantineDir:healthImportQuarantineDir}).catch(()=>{});
        state.audit(job.userId,'HEALTH_IMPORT_JOB_FAILED',job.id,`sourceHash=${job.sourceHash}; bytes=${job.bytesReceived}; code=${failure.code}`);
      }
    }
  }finally{if(job)activeHealthImportWorkers.delete(job.id);healthImportQueueBusy=false;if(processed)setTimeout(()=>void runHealthImportQueue(),0).unref();}
}
setInterval(()=>void runHealthImportQueue(),1_000).unref();setTimeout(()=>void runHealthImportQueue(),250).unref();
const icsMasterSecret=String(env.AGENTONE_ICS_MASTER_KEY||env.AGENTONE_DEMO_MASTER_KEY||'');
const icsCryptoReady=Buffer.byteLength(icsMasterSecret,'utf8')>=16;
const icsDerivedKey=icsCryptoReady?crypto.createHmac('sha256',Buffer.from(icsMasterSecret,'utf8')).update('agentone:ics-feed:v1').digest():null;
function icsFeedAad(userId){return Buffer.from('agentone:ics-feed:v1:'+String(userId),'utf8');}
function encryptIcsFeed(userId,value){if(!icsCryptoReady)throw Object.assign(new Error('Kalender-Verschlüsselung ist nicht konfiguriert'),{code:'ICS_ENCRYPTION_NOT_CONFIGURED',status:503});const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',icsDerivedKey,iv);cipher.setAAD(icsFeedAad(userId));const ciphertext=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);return {ciphertext:ciphertext.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),algorithm:'AES-256-GCM'};}
function decryptIcsFeed(userId,envelope){if(!icsCryptoReady)throw Object.assign(new Error('Kalender-Verschlüsselung ist nicht konfiguriert'),{code:'ICS_ENCRYPTION_NOT_CONFIGURED',status:503});if(String(envelope?.algorithm||'').toUpperCase()!=='AES-256-GCM')throw Object.assign(new Error('Kalender-Credential ist beschädigt'),{code:'ICS_CREDENTIAL_CORRUPT',status:500});const decipher=crypto.createDecipheriv('aes-256-gcm',icsDerivedKey,Buffer.from(envelope.iv,'base64'));decipher.setAAD(icsFeedAad(userId));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]).toString('utf8');}
function safeRoutineFailureCode(error){const code=String(error?.code||'ROUTINE_EXECUTION_FAILED').toUpperCase();return /^[A-Z][A-Z0-9_]{2,63}$/.test(code)?code:'ROUTINE_EXECUTION_FAILED';}
async function executePersonalRoutine({routine,claim,source='schedule'}){
  const userId=routine.userId;let commandRun=null,tool=null;
  try{
    commandRun=createCommandRun(state.db,{userId,label:`Routine · ${routine.title||routine.action}`,mode:'controlled',source});
    appendCommandStep(state.db,{userId,runId:commandRun.id,type:'OBSERVE',summary:'Freigegebene persönliche Quellen read-only prüfen'});
    tool=appendCommandStep(state.db,{userId,runId:commandRun.id,type:'TOOL',summary:'Minimiertes persönliches Briefing erzeugen',toolId:'personal.routines',operation:'briefing.build',access:'read',scopes:['personal.read','routine.read'],idempotent:true,input:{routineId:routine.id,action:routine.action,readOnly:true}});
    const intelligence=await personalIntelligenceSnapshot(userId),result=buildRoutineBriefingResult({routine,intelligence,commandRunId:commandRun.id});
    recordCommandResult(state.db,{userId,runId:commandRun.id,toolStepId:tool.id,summary:'Read-only Routine-Ergebnis sicher erstellt',output:{routineId:routine.id,action:routine.action,events:result.summary.events,signals:result.summary.signals,attention:result.summary.attention,sources:result.sources.map(item=>({id:item.id,status:item.status})),readOnly:true,secretsExposed:false}});
    completeCommandRun(state.db,{userId,runId:commandRun.id});
    const completed=completeRoutineRun(state.db,{userId,runId:claim.run.id,result});
    recordAudit(state.db,{userId,connectorId:'routines',action:'routine.'+routine.action,outcome:'OK',detail:JSON.stringify({routineId:routine.id,routineRunId:claim.run.id,commandRunId:commandRun.id,source,mode:'READ_ONLY',events:result.summary.events,signals:result.summary.signals,secretsExposed:false})});
    return {run:completed,commandStream:publicCommandTimeline(state.db,{userId,runId:commandRun.id})};
  }catch(error){
    const code=safeRoutineFailureCode(error);
    if(commandRun&&tool)try{recordCommandError(state.db,{userId,runId:commandRun.id,toolStepId:tool.id,code,message:'Persönliches Routine-Briefing konnte nicht erstellt werden',retryable:true});}catch{}
    let failed=null;try{failed=failRoutineRun(state.db,{userId,runId:claim.run.id,errorCode:code});}catch{}
    try{recordAudit(state.db,{userId,connectorId:'routines',action:'routine.'+routine.action,outcome:'ERROR',detail:JSON.stringify({routineId:routine.id,routineRunId:claim.run.id,commandRunId:commandRun?.id||null,source,code,secretsExposed:false})});}catch{}
    error.routineRun=failed;throw error;
  }
}
let routineRunnerBusy=false;async function runPersonalRoutines(){if(routineRunnerBusy)return;routineRunnerBusy=true;try{for(const routine of dueRoutines(state.db)){try{const claim=claimDueRoutineRun(state.db,{id:crypto.randomUUID(),routine});if(claim.claimed)await executePersonalRoutine({routine,claim,source:'schedule'});}catch{}}}finally{routineRunnerBusy=false;}}
setInterval(()=>void runPersonalRoutines(),30_000).unref();setTimeout(()=>void runPersonalRoutines(),500).unref();

function seedPlatform(){
  const templates=[
    {id:'product-content',name:'Produkttexte aktualisieren',steps:[{id:'research',risk:'READ'},{id:'draft',risk:'READ'},{id:'audit',risk:'READ'},{id:'publish',risk:'WRITE'}]},
    {id:'image-audit',name:'Bild-Audit',steps:[{id:'discover',risk:'READ'},{id:'classify',risk:'READ'},{id:'review',risk:'READ'}]},
    {id:'safe-publish',name:'Sicher publizieren',steps:[{id:'snapshot',risk:'READ'},{id:'push',risk:'DEPLOY'}]},
    {id:'category-sync',name:'Kategorie-Sync',steps:[{id:'compare',risk:'READ'},{id:'sync',risk:'WRITE'}]},
  ];
  for(const item of templates)platform.defineWorkflow({...item,version:1});
  if(platform.listRuns().length)return;
  const definitions=[
    {id:'RUN-DEMO-PRODUCT',workflowId:'product-content',worldId:'product',budgetLimit:20,input:{scope:'Herbstkollektion'}},
    {id:'RUN-DEMO-IMAGES',workflowId:'image-audit',worldId:'images',budgetLimit:12,input:{scope:'120 Assets'}},
    {id:'RUN-DEMO-PUBLISH',workflowId:'safe-publish',worldId:'publish',budgetLimit:10,input:{target:'staging'}},
    {id:'RUN-DEMO-SYNC',workflowId:'category-sync',worldId:'sync',budgetLimit:8,input:{mode:'read-only'}},
  ];
  for(const definition of definitions)platform.createRun(definition);
  platform.start('RUN-DEMO-PRODUCT');
  platform.executeCurrentStep('RUN-DEMO-PRODUCT',{payload:{collection:'autumn'},output:{sources:18},cost:.42,actor:'seed-worker'});
  platform.start('RUN-DEMO-IMAGES');
  platform.executeCurrentStep('RUN-DEMO-IMAGES',{payload:{batch:1},output:{assets:120},cost:.3,actor:'seed-worker'});
  platform.start('RUN-DEMO-PUBLISH');
  platform.executeCurrentStep('RUN-DEMO-PUBLISH',{payload:{target:'staging'},output:{snapshot:'sha256:demo'},cost:.25,actor:'seed-worker'});
  platform.requestGate('RUN-DEMO-PUBLISH',{snapshot:'sha256:demo',target:'staging'},'agentone');
}
seedPlatform();

function platformSnapshot(){
  const runs=platform.listRuns();
  return {workflows:platform.listWorkflows(),runs,gates:platform.listGates(),events:runs.flatMap(run=>platform.events(run.id).map(event=>({...event,runId:run.id,worldId:run.worldId}))),eventCursor:liveEvents.stats().sequence};
}

function publishRun(session,run,type,detail={}){
  return liveEvents.publish({userId:session.userId,worldId:run.worldId,type,runId:run.id,traceId:`TRACE-${run.id}`,...detail});
}

function json(res,status,data,headers={}){
  const body=JSON.stringify(data);
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers});
  res.end(body);
}
async function body(req){
  let data='';
  for await(const chunk of req){ data+=chunk; if(data.length>100_000) throw new Error('Request zu groß'); }
  return data ? JSON.parse(data) : {};
}
async function bodyBuffer(req,max=32*1024*1024){
  const declared=req.headers['content-length'];
  if(declared!=null&&(!/^\d+$/.test(String(declared))||Number(declared)<=0))throw Object.assign(new Error('Ungültige Upload-Größe'),{code:'HEALTH_UPLOAD_SIZE_INVALID',status:400});
  if(declared!=null&&Number(declared)>max)throw Object.assign(new Error('Apple-Health-Datei ist größer als 32 MiB'),{code:'HEALTH_UPLOAD_TOO_LARGE',status:413});
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(new Error('Apple-Health-Datei ist größer als 32 MiB'),{code:'HEALTH_UPLOAD_TOO_LARGE',status:413});chunks.push(chunk);}
  if(!size)throw Object.assign(new Error('Apple-Health-Datei fehlt'),{code:'HEALTH_UPLOAD_EMPTY',status:400});
  return Buffer.concat(chunks,size);
}
async function icsBodyBuffer(req,max=4*1024*1024){
  const declared=req.headers['content-length'];
  if(declared!=null&&(!/^\d+$/.test(String(declared))||Number(declared)<=0))throw Object.assign(new Error('Kalenderdatei fehlt'),{code:'ICS_UPLOAD_SIZE_INVALID',status:400});
  if(declared!=null&&Number(declared)>max)throw Object.assign(new Error('Kalenderdatei ist größer als 4 MiB'),{code:'ICS_TOO_LARGE',status:413});
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>max)throw Object.assign(new Error('Kalenderdatei ist größer als 4 MiB'),{code:'ICS_TOO_LARGE',status:413});chunks.push(chunk);}
  if(!size)throw Object.assign(new Error('Kalenderdatei fehlt'),{code:'ICS_EMPTY',status:400});
  return Buffer.concat(chunks,size);
}
const ICS_SYNC_INTERVAL_MS=15*60_000,icsFeedLocks=new Set();
function nextIcsAttempt(failureCount=0,now=Date.now()){const failures=Math.max(0,Math.min(5,Number(failureCount)||0)),delay=Math.min(6*60*60_000,ICS_SYNC_INTERVAL_MS*(2**failures));return new Date(now+delay).toISOString();}
function icsAtomic(operation){const savepoint='ics_'+crypto.randomBytes(6).toString('hex');state.db.exec(`SAVEPOINT ${savepoint}`);try{const result=operation();state.db.exec(`RELEASE SAVEPOINT ${savepoint}`);return result;}catch(error){try{state.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);state.db.exec(`RELEASE SAVEPOINT ${savepoint}`);}catch{}throw error;}}
function icsStatusPayload(userId){const stored=getPersonalIcsStatus(state.db,{userId}),feedConfigured=stored.sourceType==='FEED';let feedConnected=false,credentialError=null;if(feedConfigured&&icsCryptoReady)try{feedConnected=Boolean(getPersonalIcsFeedCredential(state.db,{userId,decrypt:envelope=>decryptIcsFeed(userId,envelope)}));}catch(error){credentialError=String(error.code||'ICS_CREDENTIAL_CORRUPT');}const unavailable=feedConfigured&&!feedConnected,status=unavailable?'DEGRADED':stored.status,lastErrorCode=unavailable?(credentialError||'ICS_ENCRYPTION_NOT_CONFIGURED'):stored.lastErrorCode;return {schema:'agentone.ics-calendar-status/v2',...stored,status,lastErrorCode,feedConfigured,feedConnected,cryptoReady:icsCryptoReady,nextSyncAt:stored.nextAttemptAt||null,source:stored.sourceType==='FEED'?{type:'https-ics',endpointHash:stored.endpointHash}:stored.sourceType==='UPLOAD'?{type:'upload'}:null,policy:{readOnly:true,feedUrlEncrypted:true,feedUrlReturned:false,syncIntervalMinutes:15,maxUploadBytes:4*1024*1024,descriptionStored:false,locationStored:false,attendeesStored:false,userIsolated:true,secretsExposed:false}};}
function safeIcsFailure(error){const publicFailure=publicIcsError(error);if(publicFailure.code!=='ICS_SYNC_FAILED'||!error?.code)return publicFailure;const code=String(error.code),messages={ICS_ENCRYPTION_NOT_CONFIGURED:'Kalender-Verschlüsselung ist noch nicht konfiguriert.',ICS_FEED_NOT_CONNECTED:'Es ist noch kein privater Kalenderlink verbunden.',ICS_SYNC_BUSY:'Dieser Kalender wird bereits synchronisiert.',ICS_STORE_CORRUPT:'Die gespeicherte Kalenderverbindung muss neu eingerichtet werden.',ICS_STORE_DECRYPT_FAILED:'Die gespeicherte Kalenderverbindung muss neu eingerichtet werden.'};return {provider:'ics-calendar',code,message:messages[code]||'Kalender konnte nicht verarbeitet werden.',retryable:code==='ICS_SYNC_BUSY',secretsExposed:false};}
async function syncPersonalIcsFeed(userId,{feedUrl=null,reason='manual'}={}){
  if(icsFeedLocks.has(userId))throw Object.assign(new Error('Kalender wird bereits synchronisiert'),{code:'ICS_SYNC_BUSY',status:409});
  const previous=getPersonalIcsStatus(state.db,{userId}),connecting=typeof feedUrl==='string'&&feedUrl.trim().length>0;
  icsFeedLocks.add(userId);const attemptedAt=new Date().toISOString();let credential=feedUrl;
  try{
    if(!icsCryptoReady)throw Object.assign(new Error('Kalender-Verschlüsselung ist noch nicht konfiguriert'),{code:'ICS_ENCRYPTION_NOT_CONFIGURED',status:503});
    if(!connecting)credential=getPersonalIcsFeedCredential(state.db,{userId,decrypt:envelope=>decryptIcsFeed(userId,envelope)});
    if(!credential)throw Object.assign(new Error('Kalenderlink fehlt'),{code:'ICS_FEED_NOT_CONNECTED',status:409});
    const snapshot=await fetchIcsCalendar({url:credential,accountId:'ics-feed',calendarId:'personal-ics',defaultTimeZone:'Europe/Berlin',retentionDays:400,retentionLimit:10_000,maxBytes:4*1024*1024}),events=icsSnapshotLedgerEvents(userId,snapshot,{sourceAccount:'ics-feed',connectorId:'ics-feed'});let stored;
    const ledger=replacePersonalEvents(state.db,{userId,source:'calendar.ics',events},{onReplaced:()=>{stored=savePersonalIcsFeedSuccess(state.db,{userId,feedUrl:credential,endpointHash:snapshot.source.endpointHash,eventCount:events.length,importedAt:snapshot.syncedAt,lastAttemptAt:attemptedAt,lastSuccessAt:snapshot.syncedAt,nextAttemptAt:nextIcsAttempt(0),encrypt:value=>encryptIcsFeed(userId,value)});recordAudit(state.db,{userId,connectorId:'calendar-ics',action:'ICS_FEED_SYNC',outcome:'OK',detail:JSON.stringify({reason,events:events.length,endpointHash:snapshot.source.endpointHash,deduplicated:snapshot.stats.deduplicated,expired:snapshot.stats.expired,secretsExposed:false})});}});
    return {...icsStatusPayload(userId),status:stored.status,eventCount:stored.eventCount,stats:snapshot.stats,ledger};
  }catch(error){
    const code=String(error.code||'ICS_SYNC_FAILED');let failed=previous;if(code!=='ICS_FEED_NOT_CONNECTED'&&(!connecting||previous.status==='NOT_CONNECTED'))failed=recordPersonalIcsFailure(state.db,{userId,lastAttemptAt:attemptedAt,errorCode:code,nextAttemptAt:nextIcsAttempt(Number(previous.failureCount||0)+1)});recordAudit(state.db,{userId,connectorId:'calendar-ics',action:'ICS_FEED_SYNC',outcome:'ERROR',detail:JSON.stringify({reason,code,preservedEvents:Number(previous.eventCount||0),secretsExposed:false})});error.icsStatus=failed;throw error;
  }finally{icsFeedLocks.delete(userId);}
}
let icsSchedulerBusy=false;async function syncDuePersonalIcsFeeds(){if(icsSchedulerBusy||!icsCryptoReady)return;icsSchedulerBusy=true;try{for(const item of listDuePersonalIcsFeedUsers(state.db,{asOf:new Date(),limit:25}))try{await syncPersonalIcsFeed(item.userId,{reason:'scheduled'});}catch{}}finally{icsSchedulerBusy=false;}}
setInterval(()=>void syncDuePersonalIcsFeeds(),5*60_000).unref();setTimeout(()=>void syncDuePersonalIcsFeeds(),45_000).unref();
function whoopPublicViewModel(userId){return whoopStatus({db:state.db,userId,config:whoopConfig,tokenCryptoReady:whoopTokenCryptoReady&&healthCryptoReady});}
function whoopHuman(req,userId,expected){return String(req.headers['x-agentone-human-actor']||'')===userId&&String(req.headers['x-agentone-human-action']||'')===expected;}
function whoopRedirect(res,location){res.writeHead(303,{location,'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'});res.end();}
async function whoopCallbackInput(req,maxBytes=4*1024){
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(String(req.headers['content-type']||'')))throw Object.assign(new Error('Ungültige WHOOP-Rückgabe'),{code:'WHOOP_CALLBACK_INVALID',status:400});
  const declared=String(req.headers['content-length']??'');if(declared&&(!/^\d+$/.test(declared)||Number(declared)<=0||Number(declared)>maxBytes))throw Object.assign(new Error('Ungültige WHOOP-Rückgabe'),{code:'WHOOP_CALLBACK_INVALID',status:400});
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>maxBytes)throw Object.assign(new Error('Ungültige WHOOP-Rückgabe'),{code:'WHOOP_CALLBACK_INVALID',status:400});chunks.push(chunk);}if(!size)throw Object.assign(new Error('Ungültige WHOOP-Rückgabe'),{code:'WHOOP_CALLBACK_INVALID',status:400});
  let input;try{input=JSON.parse(Buffer.concat(chunks,size).toString('utf8'));}catch{throw Object.assign(new Error('Ungültige WHOOP-Rückgabe'),{code:'WHOOP_CALLBACK_INVALID',status:400});}
  if(!input||typeof input!=='object'||Array.isArray(input))throw Object.assign(new Error('Ungültige WHOOP-Rückgabe'),{code:'WHOOP_CALLBACK_INVALID',status:400});const keys=Object.keys(input),allowed=new Set(['code','state','error']);if(keys.some(key=>!allowed.has(key))||!keys.includes('state')||Boolean(keys.includes('code'))===Boolean(keys.includes('error')))throw Object.assign(new Error('Ungültige WHOOP-Rückgabe'),{code:'WHOOP_CALLBACK_INVALID',status:400});
  const stateValue=typeof input.state==='string'?input.state:'',code=typeof input.code==='string'?input.code:'',providerError=typeof input.error==='string'?input.error:'';if(stateValue.length<40||stateValue.length>4_096||(keys.includes('code')&&(code.length<1||code.length>4_096))||(keys.includes('error')&&(providerError.length<1||providerError.length>256)))throw Object.assign(new Error('Ungültige WHOOP-Rückgabe'),{code:'WHOOP_CALLBACK_INVALID',status:400});return{code:code||null,state:stateValue,providerError:providerError||null};
}
let whoopSchedulerBusy=false;async function syncDueWhoopConnections(){if(whoopSchedulerBusy||!whoopConfig.configured||!whoopTokenCryptoReady||!healthCryptoReady)return;whoopSchedulerBusy=true;try{for(const item of listDueWhoopConnections(state.db,{asOf:new Date(),limit:10}))try{const result=await syncWhoopConnection({db:state.db,userId:item.userId,config:whoopConfig,masterSecret:whoopMasterSecret,encryptHealth:healthEncrypt,decryptHealth:healthDecrypt,reason:'scheduled'});recordAudit(state.db,{userId:item.userId,connectorId:'whoop',action:'WHOOP_SYNC',outcome:result.status,detail:JSON.stringify({reason:'scheduled',metrics:result.metrics,failures:result.failures.length,secretsExposed:false})});}catch(error){const failure=publicWhoopError(error);recordAudit(state.db,{userId:item.userId,connectorId:'whoop',action:'WHOOP_SYNC',outcome:'ERROR',detail:JSON.stringify({reason:'scheduled',code:failure.error,retryable:failure.retryable,secretsExposed:false})});}}finally{whoopSchedulerBusy=false;}}
setInterval(()=>void syncDueWhoopConnections(),5*60_000).unref();setTimeout(()=>void syncDueWhoopConnections(),60_000).unref();
function publicIntegration(item){ return {...item,requirements:item.requirements.map(String)}; }
function loginKey(req){return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();}
function loginBlocked(key){const now=Date.now();const entry=failedLogins.get(key);if(!entry||now-entry.since>15*60_000){failedLogins.delete(key);return false;}return entry.count>=6;}
function recordLoginFailure(key){const now=Date.now();const entry=failedLogins.get(key);failedLogins.set(key,!entry||now-entry.since>15*60_000?{count:1,since:now}:{count:entry.count+1,since:entry.since});}

const mailPresets={
  '1blu':{imap:{host:'imap.1blu.de',port:993,secure:true},smtp:{host:'smtp.1blu.de',port:465,secure:true}},
  gmail:{imap:{host:'imap.gmail.com',port:993,secure:true},smtp:{host:'smtp.gmail.com',port:465,secure:true}},
  custom:null
};
function safeMailHost(value){const host=String(value||'').trim().toLowerCase();if(!/^(?=.{4,253}$)(?!localhost$)(?!\d+\.\d+\.\d+\.\d+$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(host))throw Object.assign(new Error('Ungültiger Mailserver'),{status:400});return host;}
function normalizeMailAccount(input){
  const provider=['1blu','gmail','custom'].includes(String(input.provider))?String(input.provider):'custom',preset=mailPresets[provider];
  const email=String(input.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Object.assign(new Error('Gültige E-Mail-Adresse fehlt'),{status:400});
  const password=normalizeMailPassword(provider,input.password);if(password.length<6||password.length>512)throw Object.assign(new Error('Postfachpasswort fehlt oder ist unvollständig'),{status:400});
  if(provider==='gmail'&&password.length!==16)throw Object.assign(new Error('Gmail benötigt ein 16-stelliges Google-App-Passwort. Das normale Google-Passwort wird nicht verwendet.'),{status:400});
  const imap=preset?.imap||{host:safeMailHost(input.imapHost),port:Number(input.imapPort||993),secure:true},smtp=preset?.smtp||{host:safeMailHost(input.smtpHost),port:Number(input.smtpPort||465),secure:Number(input.smtpPort||465)===465};
  if(![993].includes(imap.port)||![465,587].includes(smtp.port))throw Object.assign(new Error('Nur IMAP 993 sowie SMTP 465/587 sind zugelassen'),{status:400});
  const requested=Array.isArray(input.connectors)?input.connectors.map(String):String(input.connectors||'mail').split(','),connectors=[...new Set(requested.filter(value=>['mail','calendar'].includes(value)))];if(!connectors.includes('mail'))connectors.unshift('mail');
  return {password,account:{id:String(input.id||crypto.randomUUID()),provider,label:String(input.label||email).trim().slice(0,80),email,username:String(input.username||email).trim().slice(0,180),imap,smtp,settings:{readOnly:true,grouping:true,spamReview:true,personDetection:true,openClawAgent:'mail_reader',connectors,calendarAuthorization:connectors.includes('calendar')?'REQUIRED':'OFF'}}};
}
function runtimeMailAccount(stored){return {...stored,imap:{host:stored.imapHost,port:stored.imapPort,secure:stored.imapSecure},smtp:{host:stored.smtpHost,port:stored.smtpPort,secure:stored.smtpSecure}};}
function compactMailGroups(messages=[]){const groups=groupMailMessages(messages);return Object.fromEntries(Object.entries(groups).map(([category,items])=>[category,items.slice(0,3)]));}
async function testMailAccount(account,password){
  const started=Date.now(),options=mailConnectionOptions(account,password),imap=new ImapFlow(options.imap);
  const result={testedAt:new Date().toISOString(),imap:{ok:false},smtp:{ok:false,optional:true},latencyMs:null,mode:'READ_ONLY'};
  try{await imap.connect();const boxes=await imap.list();result.imap={ok:true,mailboxes:boxes.length,specialUse:boxes.filter(box=>box.specialUse).map(box=>box.specialUse)};}catch(error){error.mailStage='imap';throw error;}finally{await imap.logout().catch(()=>{});}
  try{const transport=nodemailer.createTransport(options.smtp);await transport.verify();result.smtp={ok:true,optional:true,sendTestPerformed:false};}catch(error){result.smtp={ok:false,optional:true,sendTestPerformed:false,code:mailErrorCode(error),error:publicMailError(error,account.provider)};}
  result.latencyMs=Date.now()-started;return result;
}

const mailSyncLocks=new Set();
async function syncPersonalMailAccount(userId,accountId,{reason='manual'}={}){
  const lockKey=`${userId}\u0000${accountId}`;
  if(mailSyncLocks.has(lockKey))throw Object.assign(new Error('Postfach wird bereits synchronisiert'),{status:409,code:'MAIL_SYNC_BUSY',retryable:true});
  mailSyncLocks.add(lockKey);const started=Date.now();let stored;
  try{
    stored=await getPersonalMailAccount(postgres,userId,accountId);if(!stored)throw Object.assign(new Error('Postfach nicht gefunden'),{status:404,code:'MAIL_ACCOUNT_NOT_FOUND',retryable:false});
    const password=decryptDemoSecret(stored,env),account=runtimeMailAccount(stored),options=mailConnectionOptions(account,password),client=new ImapFlow(options.imap),cursor=await getPersonalMailSyncState(postgres,userId,accountId);
    let result;
    try{await client.connect();result=await syncImapMailbox({client,account,cursor,maxInitial:500,maxIncremental:2_000});}catch(error){error.mailStage='imap';throw error;}finally{await client.logout().catch(()=>{});}
    const persisted=await persistPersonalMailSync(postgres,{userId,accountId,messages:result.messages,cursor:result.cursor,mode:result.mode,replace:result.replace,intervalMinutes:15}),listing=await listPersonalMailMessages(postgres,{userId,accountId,limit:100});
    const scan={schema:'agentone.mail.scan/v3',readOnly:true,mutationsApplied:false,total:persisted.stored,groups:compactMailGroups(listing.messages),summary:listing.summary,sync:{strategy:'imap-uidvalidity',mode:result.mode,reason:result.reason,uidValidity:result.cursor.uidValidity,lastUid:result.cursor.lastUid,fetched:result.fetched,newCount:persisted.newCount,deduplicatedCount:Math.max(0,result.fetched-persisted.newCount),lastSuccessAt:persisted.state.lastSuccessAt,nextSyncAt:persisted.state.nextSyncAt},policy:{bodyFetched:false,bodyStored:false,attachmentsFetched:false,providerMutations:false,retentionDays:180,maxMessages:2_500,secretsExposed:false}};
    const lastTest={...(stored.lastTest||{}),testedAt:new Date().toISOString(),imap:{...(stored.lastTest?.imap||{}),ok:true},latencyMs:Date.now()-started,mode:'READ_ONLY',scan};
    await updatePersonalMailTest(postgres,userId,accountId,lastTest,'CONNECTED');mailAudit(userId,stored.provider,'imap-sync','CONNECTED',result.mode.toUpperCase());recordAudit(state.db,{userId,connectorId:`mail:${accountId}`,action:'mail.sync',outcome:'OK',detail:JSON.stringify({reason,mode:result.mode,fetched:result.fetched,newCount:persisted.newCount,stored:persisted.stored,uidValidityChanged:result.reason==='uid_validity_changed',providerMutations:false,secretsExposed:false})});
    return {...lastTest,messages:listing.messages,summary:listing.summary,sync:persisted.state};
  }catch(error){
    if(stored&&error.code!=='MAIL_SYNC_BUSY'){
      const publicFailure=publicMailFailure(error,stored.provider,error.mailStage||'imap'),retryable=error.retryable===true||(!Object.hasOwn(error,'retryable')&&['TIMEOUT','NETWORK_OR_TLS','CONNECTION_FAILED'].includes(publicFailure.code)),failure={...publicFailure,retryable},code=String(error.code||publicFailure.code||'MAIL_SYNC_FAILED').slice(0,80),sync=await recordPersonalMailSyncFailure(postgres,{userId,accountId,code:publicFailure.code||code,retryable}).catch(()=>null);
      const lastTest={...(stored.lastTest||{}),testedAt:new Date().toISOString(),lastAttempt:{ok:false,code:failure.code||code,stage:failure.stage||'imap'},syncFailure:{code:failure.code||code,retryable,nextSyncAt:sync?.nextSyncAt||null},latencyMs:Date.now()-started,mode:'READ_ONLY'};
      await updatePersonalMailTest(postgres,userId,accountId,lastTest,'DEGRADED').catch(()=>{});mailAudit(userId,stored.provider,'imap-sync','FAILED',failure.code||code);recordAudit(state.db,{userId,connectorId:`mail:${accountId}`,action:'mail.sync',outcome:'ERROR',detail:JSON.stringify({reason,code:failure.code||code,retryable,nextSyncAt:sync?.nextSyncAt||null,secretsExposed:false})});error.mailFailure=failure;error.syncState=sync;
    }
    throw error;
  }finally{mailSyncLocks.delete(lockKey);}
}

async function fetchPersonalMailInsightContent(userId,stored,input){
  const password=decryptDemoSecret(stored,env),account=runtimeMailAccount(stored),options=mailConnectionOptions(account,password),client=new ImapFlow(options.imap);
  const abort=()=>{try{client.close();}catch{}};input.signal?.addEventListener('abort',abort,{once:true});
  try{await client.connect();return await fetchSingleImapInsightContent({client,uid:input.uid,uidValidity:input.uidValidity,maxBytes:input.maxBytes,signal:input.signal});}
  catch(error){error.mailStage='imap-insight';throw error;}
  finally{input.signal?.removeEventListener('abort',abort);if(!client.isClosed)await client.logout().catch(()=>abort());}
}

let mailSchedulerBusy=false;
async function syncDuePersonalMailAccounts(){if(mailSchedulerBusy||!postgres.pool)return;mailSchedulerBusy=true;try{for(const item of await listDuePersonalMailSyncs(postgres,{limit:20}))try{await syncPersonalMailAccount(item.userId,item.accountId,{reason:'scheduled'});}catch{}}finally{mailSchedulerBusy=false;}}
setInterval(()=>void syncDuePersonalMailAccounts(),5*60_000).unref();setTimeout(()=>void syncDuePersonalMailAccounts(),60_000).unref();
function publicMailSyncState(stateValue){if(!stateValue)return {status:'NOT_SYNCED',lastUid:null,cursor:null,newCount:0,deduplicatedCount:0,lastSuccessAt:null,nextSyncAt:null};return {status:stateValue.status||'NOT_SYNCED',lastUid:stateValue.lastUid??null,cursor:{lastUid:stateValue.lastUid??null,uidValidity:stateValue.uidValidity||null},newCount:Number(stateValue.newCount||0),deduplicatedCount:0,lastSuccessAt:stateValue.lastSuccessAt||null,nextSyncAt:stateValue.nextSyncAt||null,mode:stateValue.mode||null,failureCount:Number(stateValue.failureCount||0),lastErrorCode:stateValue.lastErrorCode||null};}
function aggregateMailSyncStates(states=[]){const values=states.filter(Boolean),dates=(field,order)=>values.map(item=>item[field]).filter(Boolean).sort(order);return {status:values.some(item=>item.status==='DEGRADED')?'DEGRADED':values.some(item=>item.status==='LIVE')?'LIVE':values.length?'NOT_SYNCED':'NOT_CONNECTED',lastUid:null,cursor:{accounts:values.length},newCount:values.reduce((sum,item)=>sum+Number(item.newCount||0),0),deduplicatedCount:0,lastSuccessAt:dates('lastSuccessAt',(a,b)=>String(b).localeCompare(String(a)))[0]||null,nextSyncAt:dates('nextSyncAt',(a,b)=>String(a).localeCompare(String(b)))[0]||null};}

function mailAudit(userId,provider,stage,outcome,code='OK'){
  const userHash=crypto.createHash('sha256').update(String(userId||'unknown')).digest('hex').slice(0,12);
  console.info(JSON.stringify({event:'agentone.mail.connection',at:new Date().toISOString(),userHash,provider:String(provider||'custom'),stage,outcome,code,secretsExposed:false}));
}

function publicGoogleFailure(error){
  if(error instanceof GoogleSyncError)return error.toPublicJSON();
  return {provider:'google',stage:'sync',code:'GOOGLE_SYNC_FAILED',retryable:false,retryAfterSeconds:null,message:'Google-Synchronisierung fehlgeschlagen; technische Details wurden redigiert.',secretsExposed:false};
}

function persistableGoogleSync(result){
  const {token:ignoredToken,...snapshot}=result;
  return {...snapshot,syncedAt:new Date().toISOString()};
}

function googleSyncSummary(lastTest={}){
  const sync=lastTest?.sync,mail=sync?.mail,calendar=sync?.calendar;
  return {
    schema:'agentone.google-sync-summary/v1',
    ok:Boolean(lastTest?.ok),
    state:String(lastTest?.state||(!sync?'NOT_SYNCED':'CONNECTED')),
    syncedAt:sync?.syncedAt||lastTest?.testedAt||null,
    gmail:{status:mail?.status||null,messages:Array.isArray(mail?.messages)?mail.messages.length:0,total:Number(mail?.profile?.messagesTotal||0),fetched:Number(mail?.changes?.fetched||0),mode:mail?.mode||null},
    calendar:{status:calendar?.status||null,calendars:Array.isArray(calendar?.calendars)?calendar.calendars.length:0,selected:Array.isArray(calendar?.selectedCalendarIds)?calendar.selectedCalendarIds.length:0,events:Array.isArray(calendar?.events)?calendar.events.length:0,fullFallbacks:Number(calendar?.stats?.fullFallbacks||0)},
    failures:Array.isArray(sync?.failures)?sync.failures.map(item=>({component:item.component,code:item.code,message:item.message,retryable:Boolean(item.retryable)})):[],
    lastError:lastTest?.lastAttempt?.ok===false?lastTest.lastAttempt.error||null:null,
    policy:{readOnly:true,messageBodiesPersisted:false,calendarDetailsMinimized:true,secretsExposed:false},
  };
}

function publicPersonalService(service){
  if(service?.id!=='google')return service;
  return {...service,lastTest:googleSyncSummary(service.lastTest)};
}

async function syncStoredGoogleAccount({userId,refreshToken=null,scope='',selectedCalendarIds=null,initial=false}={}){
  const existing=await getPersonalService(postgres,userId,'google');
  const storedRefreshToken=existing?decryptDemoSecret(existing,env):'';
  const durableRefreshToken=String(refreshToken||storedRefreshToken||'');
  if(!durableRefreshToken)throw Object.assign(new Error('Google muss erneut verbunden werden.'),{status:422,code:'AUTHORIZATION_REQUIRED'});
  if(!env.GMAIL_CLIENT_ID||!env.GMAIL_CLIENT_SECRET)throw Object.assign(new Error('Google OAuth ist serverseitig noch nicht vollständig konfiguriert.'),{status:503,code:'GOOGLE_CONFIGURATION_REQUIRED'});
  const previousSync=existing?.lastTest?.sync||{},requestedSelection=Array.isArray(selectedCalendarIds)
    ? [...new Set(selectedCalendarIds.map(value=>String(value).trim()).filter(Boolean))].slice(0,50)
    : Array.isArray(existing?.settings?.selectedCalendarIds)?existing.settings.selectedCalendarIds:[];
  let rotatedRefreshToken='';
  try{
    const result=await syncGoogleReadOnly({
      accountId:'google',clientId:env.GMAIL_CLIENT_ID,clientSecret:env.GMAIL_CLIENT_SECRET,refreshToken:durableRefreshToken,
      selectedCalendarIds:requestedSelection,cursors:previousSync.cursors||{},previousMessages:previousSync.mail?.messages||[],previousEvents:previousSync.calendar?.events||[],
      onRotatedRefreshToken:value=>{rotatedRefreshToken=String(value||'');},
      gmail:{maxMessages:200,retentionDays:90,retentionLimit:5_000},
      calendar:{selectPrimaryByDefault:initial&&!existing&&!requestedSelection.length,maxEventsPerCalendar:1_000,retentionDays:400,retentionLimit:10_000},
    });
    const snapshot=persistableGoogleSync(result),partial=snapshot.status==='PARTIAL',records=snapshot.mail.messages.length+snapshot.calendar.events.length,stateValue=partial?'DEGRADED':records?'LIVE_DATA':'SYNCED_EMPTY',lastTest={testedAt:snapshot.syncedAt,ok:!partial,state:stateValue,sync:snapshot,lastAttempt:{testedAt:snapshot.syncedAt,ok:!partial,error:partial?snapshot.failures[0]||null:null}};
    const requestedScopes=String(scope||'').split(/\s+/).filter(Boolean),service={id:'google',label:'Google Mail und Kalender',endpoint:'https://www.googleapis.com',username:snapshot.mail.profile.emailAddress||existing?.username||'',capabilities:['gmail.readonly','calendar.readonly'],settings:{...(existing?.settings||{}),readOnly:true,oauth:true,scopes:requestedScopes.length?requestedScopes:existing?.settings?.scopes||[],calendars:snapshot.calendar.calendars,selectedCalendarIds:snapshot.calendar.selectedCalendarIds,cursorSchema:'agentone.google-sync/v1'}};
    const secret=encryptDemoSecret(rotatedRefreshToken||durableRefreshToken,env),saved=await savePersonalService(postgres,{userId,service,secret,lastTest,status:partial?'DEGRADED':'CONNECTED'}),summary=googleSyncSummary(lastTest),calendarLedger=replacePersonalEvents(state.db,{userId,source:'calendar.google',events:googleSnapshotLedgerEvents(userId,snapshot)});
    recordAudit(state.db,{userId,connectorId:'google',action:'google.sync',outcome:partial?'DEGRADED':'OK',detail:JSON.stringify({state:stateValue,messages:summary.gmail.messages,events:summary.calendar.events,selectedCalendars:summary.calendar.selected,failures:summary.failures.map(item=>({component:item.component,code:item.code})),secretsExposed:false})});
    return {service:saved,summary,calendarLedger};
  }catch(error){
    const failure=publicGoogleFailure(error),testedAt=new Date().toISOString();
    const failedLastTest={...(existing?.lastTest||{}),ok:false,lastAttempt:{testedAt,ok:false,error:failure}},failedService={id:'google',label:existing?.label||'Google Mail und Kalender',endpoint:existing?.endpoint||'https://www.googleapis.com',username:existing?.username||'',capabilities:existing?.capabilities||['gmail.readonly','calendar.readonly'],settings:{...(existing?.settings||{}),readOnly:true,oauth:true,scopes:String(scope||'').split(/\s+/).filter(Boolean).length?String(scope).split(/\s+/).filter(Boolean):existing?.settings?.scopes||[]}};
    try{await savePersonalService(postgres,{userId,service:failedService,secret:encryptDemoSecret(rotatedRefreshToken||durableRefreshToken,env),lastTest:failedLastTest,status:'DEGRADED'});}catch{if(existing)await updatePersonalServiceTest(postgres,userId,'google',failedLastTest,'DEGRADED');}
    recordAudit(state.db,{userId,connectorId:'google',action:'google.sync',outcome:'ERROR',detail:JSON.stringify({code:failure.code,retryable:failure.retryable,secretsExposed:false})});
    throw Object.assign(new Error(failure.message),{status:failure.code==='AUTHORIZATION_REQUIRED'?401:failure.retryable?503:error?.status||422,googleFailure:failure});
  }
}

function personalSourceEvents({userId,mailAccounts=[],mailMessages=[],companion={},google=null}){
  const events=[];
  const accountsById=new Map(mailAccounts.map(account=>[account.id,account]));
  if(mailMessages.length)for(const item of mailMessages){const account=accountsById.get(item.accountId)||{},category=String(item.category||'people'),occurredAt=item.receivedAt;if(!occurredAt)continue;const labels=Array.isArray(item.labels)?item.labels.map(value=>String(value).toLowerCase()):[],tags=[category,category==='people'?'person':null,category==='people'&&(item.unread||!labels.some(value=>value.includes('seen')))?'needs-review':null,/\b(?:dringend|urgent|asap|sofort)\b/i.test(String(item.subject||''))?'urgent':null].filter(Boolean);events.push({userId,source:`mail.${account.provider||'imap'}`,kind:'mail.message',externalId:item.idempotencyKey||item.id,occurredAt,title:item.subject||'',tags,provenance:{connectorId:item.accountId,importedAt:occurredAt,rawRecordHash:item.idempotencyKey||item.id||null}});}
  else for(const account of mailAccounts){
    const groups=account.lastTest?.scan?.groups||{};
    for(const [category,items] of Object.entries(groups))for(const item of Array.isArray(items)?items:[]){
      const occurredAt=item.receivedAt||item.date;
      if(!occurredAt)continue;
      const labels=Array.isArray(item.labels)?item.labels.map(value=>String(value).toLowerCase()):[];
      const tags=[category,category==='people'?'person':null,category==='people'&&!labels.some(value=>value.includes('seen'))?'needs-review':null,/\b(?:dringend|urgent|asap|sofort)\b/i.test(String(item.subject||''))?'urgent':null].filter(Boolean);
      events.push({userId,source:`mail.${account.provider||'imap'}`,kind:'mail.message',externalId:item.idempotencyKey||String(item.uid||item.providerId||''),occurredAt,title:item.subject||'',tags,provenance:{connectorId:account.id,importedAt:account.lastTest?.testedAt||occurredAt,rawRecordHash:item.idempotencyKey||null}});
    }
  }
  for(const item of google?.lastTest?.sync?.mail?.messages||[]){
    if(!item.receivedAt)continue;
    const labels=Array.isArray(item.labels)?item.labels.map(value=>String(value).toLowerCase()):[],category=String(item.category||'people');
    const tags=[category,category==='people'?'person':null,category==='people'&&labels.includes('unread')?'needs-review':null,/\b(?:dringend|urgent|asap|sofort)\b/i.test(String(item.subject||''))?'urgent':null].filter(Boolean);
    events.push({userId,source:'mail.gmail',kind:'mail.message',externalId:item.idempotencyKey,occurredAt:item.receivedAt,title:item.subject||'',tags,provenance:{connectorId:'google',importedAt:google.lastTest?.sync?.syncedAt||item.receivedAt,rawRecordHash:item.idempotencyKey||null}});
  }
  for(const item of google?.lastTest?.sync?.calendar?.events||[]){
    if(!item.start)continue;
    events.push({userId,source:'calendar.google',kind:'calendar.event',externalId:item.idempotencyKey,occurredAt:item.start,title:item.title||'',metrics:{durationMinutes:item.end?Math.max(0,Math.round((new Date(item.end)-new Date(item.start))/60_000)):0,endAt:item.end||item.start},provenance:{connectorId:'google',importedAt:google.lastTest?.sync?.syncedAt||item.updatedAt||item.start,rawRecordHash:item.revisionKey||item.idempotencyKey}});
  }
  for(const item of companion.events||[]){
    const payload=item.payload||{},connectorId='iphone-companion';
    if(item.kind==='calendar'&&payload.nextAt)events.push({userId,source:'calendar.apple',kind:'calendar.event',externalId:`${item.createdAt}:calendar`,occurredAt:payload.nextAt,title:payload.nextTitle||'',metrics:{durationMinutes:0,endAt:payload.nextAt},provenance:{connectorId,importedAt:item.createdAt}});
    if(item.kind==='health'){
      const occurredAt=/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date||''))?`${payload.date}T12:00:00.000Z`:item.createdAt;
      if(Number.isFinite(Number(payload.sleepMinutes)))events.push({userId,source:'apple_health',kind:'health.metric',externalId:`${item.createdAt}:sleep`,occurredAt,metrics:{name:'sleep_minutes',value:Number(payload.sleepMinutes),unit:'min'},sensitivity:'health',provenance:{connectorId,importedAt:item.createdAt}});
      if(Number.isFinite(Number(payload.steps)))events.push({userId,source:'apple_health',kind:'health.metric',externalId:`${item.createdAt}:steps`,occurredAt,metrics:{name:'steps',value:Number(payload.steps),unit:'count'},sensitivity:'health',provenance:{connectorId,importedAt:item.createdAt}});
    }
  }
  return events;
}

function ledgerInputEvents(events){return events.map(event=>{const {importedAt:ignoredImportedAt,...provenance}=event.provenance||{};return {userId:event.userId,source:event.source,sourceAccount:provenance.connectorId||'default',sourceEventId:event.externalId,occurredAt:event.occurredAt,type:event.kind,summary:event.title||event.kind,structuredPayload:{...(event.metrics||{}),tags:Array.isArray(event.tags)?event.tags:[]},provenance,sensitivity:event.sensitivity||'personal',consentId:provenance.consentId,confidence:event.confidence??1};});}
function intelligenceEventsFromLedger(events){return events.map(event=>{const {tags=[],...metrics}=event.structuredPayload||{};return {userId:event.userId,source:event.source,kind:event.type,externalId:event.sourceEventId||event.eventId,occurredAt:event.occurredAt,title:event.summary,metrics,tags:Array.isArray(tags)?tags:[],sensitivity:event.sensitivity,provenance:event.provenance};});}

async function personalIntelligenceSnapshot(userId){
  const [mailAccounts,services,durableMail]=await Promise.all([listPersonalMailAccounts(postgres,userId),listPersonalServices(postgres,userId),listPersonalMailMessages(postgres,{userId,limit:200})]),google=services.find(item=>item.id==='google'),companion=companionStatus(state.db,userId),events=personalSourceEvents({userId,mailAccounts,mailMessages:durableMail.messages,companion,google});
  let storedHealth=[];if(healthCryptoReady)try{storedHealth=queryHealthMetrics(state.db,{userId,limit:5_000,decrypt:healthDecrypt});}catch{}
  events.push(...storedHealth.map(item=>({userId,source:item.source,kind:'health.metric',externalId:item.id,occurredAt:item.startAt,metrics:{name:item.metric,value:item.value,unit:item.unit},sensitivity:'health',provenance:{connectorId:`health.${item.source}`,importedAt:item.provenance?.receivedAt||item.startAt,rawRecordHash:item.id,consentId:item.consentId}})));
  const ledgerWrite=appendPersonalEvents(state.db,{userId,events:ledgerInputEvents(events)});applyPersonalEventRetention(state.db,{userId,before:new Date(Date.now()-400*86_400_000)});const ledgerEvents=queryPersonalEvents(state.db,{userId,from:new Date(Date.now()-40*86_400_000),limit:5_000}),analysisEvents=intelligenceEventsFromLedger(ledgerEvents);
  const rawBrief=buildPersonalBrief({userId,events:analysisEvents,timeZone:'Europe/Berlin'}),feedbackProfile=loadNudgeFeedbackProfile(state.db,userId),signals=applyNudgeFeedback(rawBrief.signals,feedbackProfile),brief={...rawBrief,signals,summary:{attention:signals.filter(item=>item.severity==='attention').length,informational:signals.filter(item=>item.severity==='info').length}},googleSummary=googleSyncSummary(google?.lastTest||{}),googleMessages=googleSummary.gmail.messages,googleEvents=googleSummary.calendar.events;
  const icsState=icsStatusPayload(userId),icsUsable=['LIVE','DEGRADED'].includes(icsState.status)&&(!icsState.feedConfigured||icsState.feedConnected),icsEvents=icsUsable?Number(icsState.eventCount||0):0,durableMailCount=Number(durableMail.summary.total||0),mailMessages=(durableMailCount||mailAccounts.reduce((sum,account)=>sum+Number(account.lastTest?.scan?.total||0),0))+googleMessages,healthSummaries=(companion.events||[]).filter(item=>item.kind==='health').length,calendarSummaries=(companion.events||[]).filter(item=>item.kind==='calendar').length,calendarRecords=calendarSummaries+googleEvents+icsEvents,healthRecords=storedHealth.length+healthSummaries;
  const googleMailDegraded=google?.lastTest?.sync?.mail?.status==='DEGRADED',googleCalendarDegraded=google?.lastTest?.sync?.calendar?.status==='DEGRADED';
  const mailStatus=googleMailDegraded?'DEGRADED':mailMessages?'LIVE':google?.lastTest?.sync||mailAccounts.some(item=>item.status==='CONNECTED')?'CONNECTED':mailAccounts.length||google?'DEGRADED':'NOT_CONNECTED',calendarStatus=googleCalendarDegraded||['ERROR','DEGRADED'].includes(icsState.status)?'DEGRADED':calendarRecords?'LIVE':google?.lastTest?.sync?.calendar?'CONNECTED':google?'AUTHENTICATED':calendarSummaries?'LIVE':'NOT_CONNECTED';
  return {...brief,schema:'agentone.personal-intelligence/v1',sources:[{id:'mail',status:mailStatus,accounts:mailAccounts.length+(google?1:0),records:mailMessages},{id:'calendar',status:calendarStatus,calendars:googleSummary.calendar.calendars+(icsUsable?1:0),selectedCalendars:googleSummary.calendar.selected+(icsUsable?1:0),records:calendarRecords,ics:icsStatusPayload(userId)},{id:'health',status:healthRecords?'LIVE':healthCryptoReady?'READY':'PREPARED',records:healthRecords}],ledger:{...personalEventLedgerAuditSummary(state.db,userId),lastWrite:ledgerWrite,analysisWindowDays:40},capabilities:{health:healthConnectorCapabilities},feedback:{enabled:true,values:['helpful','not_helpful','wrong','later','never'],resetSupported:true},policy:{readOnly:true,medicalDiagnosis:false,externalWrites:false,secretsExposed:false},limitations:[google?.lastTest?.sync?'Google Mail und Kalender werden inkrementell und read-only synchronisiert.':'Google ist noch nicht per OAuth verbunden.','Private Apple-/Google-iCal-Dateien und verschlüsselte HTTPS-Feeds können read-only synchronisiert werden; Beschreibung, Ort und Teilnehmer werden verworfen.',healthCryptoReady?'Apple Health XML/ZIP kann verschlüsselt und benutzergebunden importiert werden.':'Für Apple-Health-Import fehlt noch der Server-Master-Key.']};
}

const healthConsentScopes=new Set(['activity','sleep','vitals','body','workouts']);
const healthEmptyQueryKeys=new Set();
const healthDigestQueryKeys=new Set(['source','from','to']);
const healthMetricSources=new Set(['apple_health','whoop']);
const healthComparisonQueryKeys=new Set(['periodDays','minimumCoverageDays','timeZone']);
const healthComparisonTimeZones=new Set(['Europe/Berlin','UTC']);
function healthQueryError(code='HEALTH_QUERY_INVALID'){return Object.assign(new Error('Ungültige Health-Anfrageparameter'),{code,status:400});}
function assertHealthQuery(searchParams,allowed,code='HEALTH_QUERY_INVALID'){for(const key of searchParams.keys())if(!allowed.has(key)||searchParams.getAll(key).length!==1)throw healthQueryError(code);}
function healthDigestOptions(searchParams){
  assertHealthQuery(searchParams,healthDigestQueryKeys);
  const source=searchParams.get('source')||undefined;if(source&&!healthMetricSources.has(source))throw healthQueryError();
  const timestamp=name=>{const value=searchParams.get(name);if(value===null)return undefined;const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(value),instant=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value),parsed=new Date(dateOnly?`${value}T00:00:00.000Z`:value);if((!dateOnly&&!instant)||!Number.isFinite(parsed.getTime())||(dateOnly&&parsed.toISOString().slice(0,10)!==value)||(instant&&parsed.toISOString()!==value))throw healthQueryError();return value;};
  const from=timestamp('from'),to=timestamp('to');if(from&&to&&new Date(from)>new Date(to))throw healthQueryError();return {source,from,to};
}
function healthComparisonOptions(searchParams){
  const invalid=()=>healthQueryError('HEALTH_COMPARISON_QUERY_INVALID');
  assertHealthQuery(searchParams,healthComparisonQueryKeys,'HEALTH_COMPARISON_QUERY_INVALID');
  const integer=(name,fallback,max)=>{const raw=searchParams.get(name);if(raw===null)return fallback;if(!/^[1-9]\d{0,1}$/.test(raw))throw invalid();const value=Number(raw);if(value>max)throw invalid();return value;};
  const periodDays=integer('periodDays',14,90),minimumCoverageDays=integer('minimumCoverageDays',Math.min(3,periodDays),periodDays),timeZone=searchParams.get('timeZone')||'Europe/Berlin';
  if(!healthComparisonTimeZones.has(timeZone))throw invalid();
  return {periodDays,minimumCoverageDays,timeZone};
}
function healthFailure(res,error){return json(res,error.status||400,{error:error.code||'HEALTH_REQUEST_FAILED',message:String(error.message||'Gesundheitsanfrage fehlgeschlagen').slice(0,180),...(error.commandStream?{commandStream:error.commandStream}:{}),secretsExposed:false,medicalDiagnosis:false});}

function learningError(message,code='LEARNING_REQUEST_INVALID',status=400){return Object.assign(new Error(message),{code,status});}
function learningBody(input,allowed){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key)))throw learningError('Ungültige Learning-Lab-Anfrage');return input;}
function learningHumanPrincipal(req,userId,action){const actor=String(req.headers['x-agentone-human-actor']||''),humanAction=String(req.headers['x-agentone-human-action']||'');if(actor!==userId||humanAction!==`skill-${action}`)throw learningError('Menschliche Bestätigung erforderlich','LEARNING_HUMAN_GATE_REQUIRED',403);return {kind:'human',authenticated:true,userId};}
function learningBriefingEvents(intelligence){
  const generatedAt=String(intelligence?.generatedAt||new Date().toISOString()),signals=Array.isArray(intelligence?.signals)?intelligence.signals:[],sourceName=domain=>domain==='mail'?'mail':domain==='health'?'health':'calendar';
  const events=signals.slice(0,100).map((signal,index)=>({id:`signal-${index}-${String(signal.notificationKey||signal.id||index).replace(/[^a-zA-Z0-9._:-]/g,'-').slice(0,80)}`,source:sourceName(String(signal.domain||'')),kind:/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(String(signal.id||''))?String(signal.id):'personal-signal',occurredAt:generatedAt,title:String(signal.title||'Persönlicher Hinweis'),urgency:signal.severity==='attention'?'high':'normal',actionRequired:signal.severity==='attention',unread:signal.domain==='mail'&&signal.severity==='attention',confidence:Number.isFinite(Number(signal.confidence))?Number(signal.confidence):1}));
  if(events.length)return events;
  return (Array.isArray(intelligence?.sources)?intelligence.sources:[]).slice(0,3).map((source,index)=>({id:`source-${index}-${String(source.id||'unknown').replace(/[^a-zA-Z0-9._:-]/g,'-')}`,source:sourceName(String(source.id||'')),kind:'source-status',occurredAt:generatedAt,title:`${String(source.id||'Quelle')}: ${String(source.status||'UNKNOWN')} · ${Number(source.records||0)} Datensätze`,urgency:['DEGRADED','ERROR'].includes(String(source.status||''))?'high':'normal',actionRequired:['DEGRADED','ERROR'].includes(String(source.status||'')),unread:false,confidence:1}));
}
function learningLabView(userId){
  const skills=listPersonalBriefingSkills(state.db,{userId}),executions=listPersonalBriefingExecutions(state.db,{userId,limit:100});
  return {schema:'agentone.personal-learning-lab/v1',skills:skills.map(skill=>{const last=executions.find(item=>item.candidateId===skill.id),rollbackTarget=skill.active?skills.filter(item=>item.status==='ACTIVE'&&item.version<skill.version).sort((a,b)=>b.version-a.version)[0]:null;return {...skill,name:'Persönliches Briefing',evaluation:{...(skill.evaluation||{}),status:skill.test?.passed?'PASS':'NOT_RUN',attestationId:skill.evaluation?.outputHash||'',testedAt:skill.test?.testedAt||null},provenance:{source:'AGENTONE_BUILTIN',publisher:'learning-release-worker'},lastExecution:last?{status:'COMPLETED',executedAt:last.createdAt,runId:last.executionId}:null,rollbackAvailable:Boolean(rollbackTarget),rollbackTargetVersion:rollbackTarget?.version||null,actions:{rollback:{available:Boolean(rollbackTarget),targetVersion:rollbackTarget?.version||null}}};}),executions,policy:{serverDefinedSkillsOnly:true,deterministicEvaluation:true,humanExactHashApproval:true,readOnlyExecution:true,userIsolated:true,secretsExposed:false}};
}
function learningFailure(res,error){return json(res,error.status||400,{error:error.code||'LEARNING_REQUEST_FAILED',message:'Learning-Lab-Aktion konnte nicht abgeschlossen werden.',secretsExposed:false});}

async function api(req,res,url){
  const internalPersonal=req.headers['x-agentone-internal-token']&&req.headers['x-agentone-internal-token']===env.AGENTONE_INTERNAL_API_TOKEN;
  if(url.pathname==='/api/internal/personal/connectors'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});
    const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);
    if(!userId)return json(res,400,{error:'user_required'});
    if(req.method==='GET')return json(res,200,{connectors:await listPersonalConnectors(postgres,userId)});
    if(req.method==='PUT'){
      const input=await body(req),id=String(input.id||''),status=String(input.status||'');
      const permissions=Array.isArray(input.permissions)?[...new Set(input.permissions.map(String))].filter(value=>/^[a-z][a-z0-9._-]{1,40}$/.test(value)).slice(0,20):[];
      if(!/^[a-z][a-z0-9-]{1,30}$/.test(id)||!['OFF','PREPARED','CONNECTED','DEGRADED'].includes(status))return json(res,400,{error:'invalid_connector_state'});
      return json(res,200,{connector:await savePersonalConnector(postgres,{userId,id,status,permissions})});
    }
    return json(res,405,{error:'method_not_allowed'});
  }
  if(url.pathname==='/api/internal/personal/mail/messages'&&req.method==='GET'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    try{
      const accountId=String(url.searchParams.get('accountId')||'').trim(),result=await listPersonalMailMessages(postgres,{userId,accountId,category:url.searchParams.get('category')||'',query:url.searchParams.get('q')||'',threadKey:url.searchParams.get('threadKey')||'',limit:url.searchParams.get('limit')||50}),accounts=accountId?[{id:accountId}]:await listPersonalMailAccounts(postgres,userId),states=await Promise.all(accounts.map(item=>getPersonalMailSyncState(postgres,userId,item.id))),syncStates=Object.fromEntries(accounts.map((item,index)=>[item.id,publicMailSyncState(states[index])])),sync=accountId?publicMailSyncState(states[0]):aggregateMailSyncStates(states);
      return json(res,200,{schema:'agentone.personal-mail-review/v1',...result,sync,syncStates,policy:{readOnly:true,bodyStored:false,snippetsStored:false,attachmentsStored:false,providerMutations:false,userIsolated:true,secretsExposed:false}});
    }catch(error){return json(res,error.status||400,{error:error.code||'MAIL_REVIEW_QUERY_INVALID',message:String(error.message||error).slice(0,180),secretsExposed:false});}
  }
  if(url.pathname==='/api/internal/personal/mail/insight'&&req.method==='POST'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    let run=null,tool=null;
    try{
      const input=await body(req),accountId=String(input.accountId||'').trim(),uid=Number(input.uid),uidValidity=String(input.uidValidity||'').trim(),mode=String(input.mode||'local').toLowerCase();
      if(mode!=='local')return json(res,400,{error:'MAIL_INSIGHT_MODE_UNAVAILABLE',message:'Diese Version analysiert Mailinhalte ausschließlich lokal und deterministisch.',secretsExposed:false});
      const [stored,message]=await Promise.all([getPersonalMailAccount(postgres,userId,accountId),getPersonalMailMessage(postgres,{userId,accountId,uid,uidValidity})]);if(!stored||!message)return json(res,404,{error:'MAIL_INSIGHT_NOT_FOUND',message:'Die ausgewählte Nachricht ist nicht mehr verfügbar.',secretsExposed:false});
      run=createCommandRun(state.db,{userId,label:'Ausgewählte Mail lokal analysieren',mode:'controlled',source:'chat'});appendCommandStep(state.db,{userId,runId:run.id,type:'OBSERVE',summary:'Exakte Mail-Identität und UIDVALIDITY prüfen'});tool=appendCommandStep(state.db,{userId,runId:run.id,type:'TOOL',summary:'Eine ausgewählte Nachricht read-only und flüchtig analysieren',toolId:'personal.mail-insight',operation:'mail.insight.local',access:'read',scopes:['mail.read'],idempotent:true,input:{accountRef:crypto.createHash('sha256').update(accountId).digest('hex').slice(0,16),messageRef:crypto.createHash('sha256').update(`${uidValidity}:${uid}`).digest('hex').slice(0,16),bodyPersisted:false}});
      const result=await createPersonalMailInsight({request:{userId,accountId,uid,uidValidity},account:{userId,id:stored.id,uidValidity},message,fetchMessage:params=>fetchPersonalMailInsightContent(userId,stored,params)}),audit=personalMailInsightAuditProjection(result);
      recordCommandResult(state.db,{userId,runId:run.id,toolStepId:tool.id,summary:'Lokale Einmalanalyse abgeschlossen',output:{classification:result.insight.classification,actionRequired:result.insight.actionRequired,calendarDraft:Boolean(result.calendarDraft),contentBytes:result.source.contentBytes,bodyStored:false,providerMutations:false}});completeCommandRun(state.db,{userId,runId:run.id});recordAudit(state.db,{userId,connectorId:`mail:${accountId}`,action:'mail.insight.local',outcome:'OK',detail:JSON.stringify(audit)});
      return json(res,200,{...result,analysisMode:'LOCAL_DETERMINISTIC',commandStream:publicCommandTimeline(state.db,{userId,runId:run.id})});
    }catch(error){const failure=publicPersonalMailInsightError(error);if(run&&tool)try{recordCommandError(state.db,{userId,runId:run.id,toolStepId:tool.id,code:failure.error,message:failure.message,retryable:failure.retryable});}catch{}recordAudit(state.db,{userId,connectorId:'mail-insight',action:'mail.insight.local',outcome:'ERROR',detail:JSON.stringify({code:failure.error,retryable:failure.retryable,secretsExposed:false,bodyStored:false})});return json(res,failure.status,{...failure,commandStream:run?publicCommandTimeline(state.db,{userId,runId:run.id}):null});}
  }
  if(url.pathname==='/api/internal/personal/mail/accounts'||url.pathname.startsWith('/api/internal/personal/mail/accounts/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/mail/accounts')return json(res,200,{accounts:await listPersonalMailAccounts(postgres,userId),plugin:{id:'imap',status:'LOADED',mode:'isolated-reader',smtpProvidedByPlugin:false}});
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/mail/accounts'){
      let input={};try{
        input=await body(req);const normalized=normalizeMailAccount(input),connection=await testMailAccount(normalized.account,normalized.password),secret=encryptDemoSecret(normalized.password,env);let account=await savePersonalMailAccount(postgres,{userId,account:normalized.account,secret,lastTest:connection}),sync=null,syncFailure=null;
        mailAudit(userId,normalized.account.provider,'imap','CONNECTED');mailAudit(userId,normalized.account.provider,'smtp',connection.smtp.ok?'CONNECTED':'OPTIONAL_FAILED',connection.smtp.code);
        try{sync=await syncPersonalMailAccount(userId,account.id,{reason:'account-created'});}catch(error){syncFailure=error.mailFailure||publicMailFailure(error,normalized.account.provider,error.mailStage||'imap');account=(await listPersonalMailAccounts(postgres,userId)).find(item=>item.id===account.id)||account;}
        return json(res,201,{account,connection,sync:sync?{scan:sync.scan,state:sync.sync,summary:sync.summary}:null,syncFailure});
      }catch(error){const provider=String(input.provider||'custom'),stage=error.mailStage||'validation',failure=error.status&&error.status<422?{stage,code:'INVALID_INPUT',error:String(error.message||error).slice(0,180)}:publicMailFailure(error,provider,stage);mailAudit(userId,provider,stage,'FAILED',failure.code);return json(res,error.status||422,failure);}
    }
    const preferences=url.pathname.match(/^\/api\/internal\/personal\/mail\/accounts\/([^/]+)\/preferences$/);if(req.method==='PUT'&&preferences){const stored=await getPersonalMailAccount(postgres,userId,decodeURIComponent(preferences[1]));if(!stored)return json(res,404,{error:'mail_account_not_found'});const input=await body(req),requested=Array.isArray(input.connectors)?input.connectors.map(String):[],connectors=[...new Set(requested.filter(value=>['mail','calendar'].includes(value)))];if(!connectors.includes('mail'))connectors.unshift('mail');const calendarIds=Array.isArray(input.calendarIds)?[...new Set(input.calendarIds.map(value=>String(value).trim()).filter(Boolean))].slice(0,50):stored.settings?.calendarIds||[];const settings={...(stored.settings||{}),connectors,calendarIds,calendarAuthorization:connectors.includes('calendar')?'REQUIRED':'OFF'};return json(res,200,{account:await updatePersonalMailSettings(postgres,userId,stored.id,settings),calendar:{enabled:connectors.includes('calendar'),selectedCalendarIds:calendarIds,status:connectors.includes('calendar')?'AUTHORIZATION_REQUIRED':'OFF',reason:connectors.includes('calendar')?'Google Kalender benötigt eine getrennte OAuth-Freigabe; das Gmail-App-Passwort wird nicht wiederverwendet.':null}});}
    const match=url.pathname.match(/^\/api\/internal\/personal\/mail\/accounts\/([^/]+)\/(test|scan)$/);if(req.method==='POST'&&match){
      const stored=await getPersonalMailAccount(postgres,userId,decodeURIComponent(match[1]));if(!stored)return json(res,404,{error:'mail_account_not_found'});
      const action=match[2],run=createCommandRun(state.db,{userId,label:action==='scan'?'Postfach aktualisieren':'Mail-Verbindung prüfen',mode:'controlled',source:'chat'});
      appendCommandStep(state.db,{userId,runId:run.id,type:'OBSERVE',summary:action==='scan'?'Read-only Postfach-Metadaten laden':'IMAP und optional SMTP prüfen'});
      const tool=appendCommandStep(state.db,{userId,runId:run.id,type:'TOOL',summary:action==='scan'?'Nachrichten read-only gruppieren':'Provider-Verbindung ohne Testmail prüfen',toolId:'personal.mail',operation:action==='scan'?'mail.scan':'mail.connection-test',access:'read',scopes:['mail.read'],idempotent:true,input:{accountRef:crypto.createHash('sha256').update(stored.id).digest('hex').slice(0,16),provider:stored.provider}});
      try{
        let lastTest;if(action==='scan')lastTest=await syncPersonalMailAccount(userId,stored.id,{reason:'manual'});else{const password=decryptDemoSecret(stored,env),account=runtimeMailAccount(stored);lastTest=await testMailAccount(account,password);await updatePersonalMailTest(postgres,userId,stored.id,{...(stored.lastTest||{}),...lastTest},'CONNECTED');mailAudit(userId,stored.provider,'imap','CONNECTED');mailAudit(userId,stored.provider,'smtp',lastTest.smtp.ok?'CONNECTED':'OPTIONAL_FAILED',lastTest.smtp.code);}
        const groups=lastTest.scan?.groups||{};recordCommandResult(state.db,{userId,runId:run.id,toolStepId:tool.id,summary:action==='scan'?'Postfach inkrementell und read-only aktualisiert':'Mail-Verbindung geprüft',output:{messages:Number(lastTest.scan?.total||0),newMessages:Number(lastTest.scan?.sync?.newCount||0),mode:lastTest.scan?.sync?.mode||null,groups:Object.fromEntries(Object.entries(groups).map(([key,items])=>[key,Array.isArray(items)?items.length:0])),imapReady:Boolean(lastTest.imap?.ok),smtpReady:Boolean(lastTest.smtp?.ok)},latencyMs:lastTest.latencyMs});completeCommandRun(state.db,{userId,runId:run.id});
        return json(res,200,{account:{id:stored.id,status:'CONNECTED'},...lastTest,commandStream:publicCommandTimeline(state.db,{userId,runId:run.id})});
      }catch(error){
        const failure={testedAt:new Date().toISOString(),imap:{ok:false},smtp:{ok:false,optional:true},...(error.mailFailure||publicMailFailure(error,stored.provider,error.mailStage||'imap'))};mailAudit(userId,stored.provider,failure.stage,'FAILED',failure.code);if(action!=='scan')await updatePersonalMailTest(postgres,userId,stored.id,{...(stored.lastTest||{}),...failure},'DEGRADED');recordCommandError(state.db,{userId,runId:run.id,toolStepId:tool.id,code:failure.code||'MAIL_CONNECTION_FAILED',message:'Mail-Verbindung konnte nicht geprüft werden',retryable:Boolean(failure.retryable)||['NETWORK_ERROR','TIMEOUT','CONNECTION_FAILED'].includes(String(failure.code||''))});
        return json(res,error.status||422,{...failure,sync:error.syncState||null,commandStream:publicCommandTimeline(state.db,{userId,runId:run.id})});
      }
    }
    return json(res,405,{error:'method_not_allowed'});
  }
  if(url.pathname==='/api/internal/personal/mail/workflows'||url.pathname.startsWith('/api/internal/personal/mail/workflows/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/mail/workflows'){const rows=state.db.prepare('SELECT id,kind,payload,state,hash,created_at as createdAt,updated_at as updatedAt FROM personal_mail_workflows WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').all(userId).map(row=>({...row,payload:JSON.parse(row.payload)}));return json(res,200,{workflows:rows});}
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/mail/workflows'){try{const input=await body(req),kind=String(input.kind||''),id=crypto.randomUUID(),now=new Date().toISOString();if(kind==='briefing'){const durable=await listPersonalMailMessages(postgres,{userId,limit:200});let groups=groupMailMessages(durable.messages);if(!durable.messages.length){const accounts=await listPersonalMailAccounts(postgres,userId);groups=emptyMailGroups();for(const account of accounts)for(const [category,items] of Object.entries(account.lastTest?.scan?.groups||{}))if(groups[category])groups[category].push(...items);}return json(res,200,{briefing:buildMailBriefing(groups),source:durable.messages.length?'durable-mail-repository':'last-scan-fallback',records:Number(durable.summary.total||0),policy:{bodyRead:false,providerMutations:false,secretsExposed:false}});}const payload=kind==='rule'?createMailRule(input):kind==='draft'?createReplyDraft(input):null;if(!payload)return json(res,400,{error:'invalid_mail_workflow'});state.db.prepare('INSERT INTO personal_mail_workflows(id,user_id,kind,payload,state,hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,userId,kind,JSON.stringify(payload),payload.state,payload.hash,now,now);return json(res,201,{workflow:{id,kind,payload,state:payload.state,hash:payload.hash,createdAt:now}});}catch(error){return json(res,400,{error:String(error.message||error).slice(0,180)});}}
    const match=url.pathname.match(/^\/api\/internal\/personal\/mail\/workflows\/([^/]+)\/approve$/);if(req.method==='PUT'&&match){try{const row=state.db.prepare('SELECT id,kind,payload,state,hash FROM personal_mail_workflows WHERE id=? AND user_id=?').get(decodeURIComponent(match[1]),userId);if(!row)return json(res,404,{error:'workflow_not_found'});const input=await body(req),payload=JSON.parse(row.payload),approved=row.kind==='rule'?approveMailRule(payload,String(input.hash||'')):approveReplyDraft(payload,String(input.hash||'')),now=new Date().toISOString();state.db.prepare('UPDATE personal_mail_workflows SET payload=?,state=?,updated_at=? WHERE id=?').run(JSON.stringify(approved),approved.state,now,row.id);return json(res,200,{workflow:{id:row.id,kind:row.kind,payload:approved,state:approved.state,hash:row.hash,updatedAt:now}});}catch(error){return json(res,409,{error:String(error.message||error).slice(0,180)});}}
    return json(res,405,{error:'method_not_allowed'});
  }
  if(url.pathname==='/api/internal/personal/services'||url.pathname.startsWith('/api/internal/personal/services/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/services')return json(res,200,{services:(await listPersonalServices(postgres,userId)).map(publicPersonalService),catalog:Object.entries(personalServiceCatalog).map(([id,item])=>({id,name:item.name,capabilities:item.capabilities}))});
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/services')try{const input=await body(req),normalized=normalizePersonalService(input);let lastTest,status='READY';try{lastTest=await testPersonalService(normalized.service,normalized.secret);status='CONNECTED';}catch(error){lastTest={testedAt:new Date().toISOString(),ok:false,error:String(error.message||error).slice(0,160)};status='DEGRADED';}const secret=encryptDemoSecret(normalized.secret,env),service=await savePersonalService(postgres,{userId,service:normalized.service,secret,lastTest,status});return json(res,201,{service});}catch(error){return json(res,error.status||422,{error:String(error.message||error).slice(0,180)});}
    const match=url.pathname.match(/^\/api\/internal\/personal\/services\/([^/]+)\/test$/);if(req.method==='POST'&&match){const stored=await getPersonalService(postgres,userId,decodeURIComponent(match[1]));if(!stored)return json(res,404,{error:'service_not_found'});try{const secret=decryptDemoSecret(stored,env),result=await testPersonalService(stored,secret);await updatePersonalServiceTest(postgres,userId,stored.id,result,'CONNECTED');return json(res,200,result);}catch(error){const failure={testedAt:new Date().toISOString(),ok:false,error:String(error.message||error).slice(0,160)};await updatePersonalServiceTest(postgres,userId,stored.id,failure,'DEGRADED');return json(res,422,failure);}}
    return json(res,405,{error:'method_not_allowed'});
  }
  if(url.pathname==='/api/internal/personal/google'&&req.method==='POST'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});try{const input=await body(req),result=await syncStoredGoogleAccount({userId,refreshToken:String(input.refreshToken||''),scope:String(input.scope||''),initial:true});return json(res,201,{service:publicPersonalService(result.service),sync:result.summary});}catch(error){const failure=error.googleFailure||publicGoogleFailure(error);return json(res,error.status||422,{error:failure.code,message:failure.message,retryable:Boolean(failure.retryable),retryAfterSeconds:failure.retryAfterSeconds??null,secretsExposed:false});}
  }
  if(url.pathname==='/api/internal/personal/google/sync'&&req.method==='POST'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    let input={};try{input=await body(req);}catch{return json(res,400,{error:'GOOGLE_SYNC_INPUT_INVALID',message:'Synchronisierungsanfrage ist ungültig.',secretsExposed:false});}
    const selectedCalendarIds=Object.hasOwn(input,'selectedCalendarIds')?input.selectedCalendarIds:null;if(selectedCalendarIds!==null&&!Array.isArray(selectedCalendarIds))return json(res,400,{error:'GOOGLE_CALENDAR_SELECTION_INVALID',message:'Kalenderauswahl muss eine Liste sein.',secretsExposed:false});
    const run=createCommandRun(state.db,{userId,label:'Google Mail und Kalender synchronisieren',mode:'controlled',source:'chat'});appendCommandStep(state.db,{userId,runId:run.id,type:'OBSERVE',summary:'Ausgewählte Google-Quellen und lokalen Sync-Stand prüfen'});const tool=appendCommandStep(state.db,{userId,runId:run.id,type:'TOOL',summary:'Gmail-Metadaten und Kalender read-only synchronisieren',toolId:'personal.google',operation:'google.sync',access:'read',scopes:['gmail.metadata.read','calendar.read'],idempotent:true,input:{selection:selectedCalendarIds===null?'stored':'explicit',selectedCount:Array.isArray(selectedCalendarIds)?selectedCalendarIds.length:null}});
    try{const result=await syncStoredGoogleAccount({userId,selectedCalendarIds,initial:false}),summary=result.summary;recordCommandResult(state.db,{userId,runId:run.id,toolStepId:tool.id,summary:summary.state==='DEGRADED'?'Google mit Teilerfolg synchronisiert':'Google-Quellen synchronisiert',output:{state:summary.state,messages:summary.gmail.messages,events:summary.calendar.events,selectedCalendars:summary.calendar.selected,failures:summary.failures.map(item=>({component:item.component,code:item.code}))}});completeCommandRun(state.db,{userId,runId:run.id});return json(res,200,{sync:summary,commandStream:publicCommandTimeline(state.db,{userId,runId:run.id})});}catch(error){const failure=error.googleFailure||publicGoogleFailure(error);recordCommandError(state.db,{userId,runId:run.id,toolStepId:tool.id,code:failure.code||'GOOGLE_SYNC_FAILED',message:'Google-Synchronisierung konnte nicht abgeschlossen werden',retryable:Boolean(failure.retryable)});return json(res,error.status||422,{error:failure.code,message:failure.message,retryable:Boolean(failure.retryable),retryAfterSeconds:failure.retryAfterSeconds??null,commandStream:publicCommandTimeline(state.db,{userId,runId:run.id}),secretsExposed:false});}
  }
  if(url.pathname==='/api/internal/personal/companion'||url.pathname.startsWith('/api/internal/personal/companion/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    if(!companionPepperReady)return json(res,503,{error:'COMPANION_SECRET_NOT_CONFIGURED',message:'Der iPhone-Dienst ist serverseitig nicht sicher konfiguriert.',secretsExposed:false});
    try{
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/companion')return json(res,200,companionStatus(state.db,userId));
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/companion/status'){const token=String(req.headers['x-agentone-device-token']||'');return json(res,200,companionDeviceStatus(state.db,{userId,deviceToken:token,pepper:companionPepper}));}
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/companion/pair'){const input=await body(req),scopes=Array.isArray(input.scopes)?input.scopes:undefined,pairing=createCompanionPairing(state.db,{userId,pepper:companionPepper,scopes});recordAudit(state.db,{userId,connectorId:'apple-companion',action:'companion.pair.created',outcome:'OK',detail:JSON.stringify({expiresAt:pairing.expiresAt,scopes:pairing.scopes,secretsExposed:false})});return json(res,201,{pairing});}
      if(req.method==='POST'&&(url.pathname==='/api/internal/personal/companion/confirm'||url.pathname==='/api/internal/personal/companion/redeem')){const input=await body(req),device=redeemCompanionPairing(state.db,{userId,code:input.code,deviceName:input.deviceName,pepper:companionPepper});recordAudit(state.db,{userId,connectorId:'apple-companion',action:'companion.pair.confirmed',outcome:'OK',detail:JSON.stringify({deviceId:device.deviceId,scopes:device.scopes,secretsExposed:false})});return json(res,201,{device,status:'CONNECTED',secretsExposed:false});}
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/companion/ingest'){const token=String(req.headers['x-agentone-device-token']||''),device=authorizeCompanion(state.db,{userId,deviceToken:token,pepper:companionPepper}),input=await body(req),scope={health:'health.summary',location:'location.temporary',calendar:'calendar.read',reminders:'reminders.read'}[input.kind];if(!scope||!device.scopes.includes(scope))return json(res,403,{error:'scope_not_granted'});const event=storeCompanionEvent(state.db,{userId,deviceId:device.id,kind:input.kind,input:input.data});recordAudit(state.db,{userId,connectorId:'apple-companion',action:'companion.event.ingested',outcome:'OK',detail:JSON.stringify({deviceId:device.id,eventId:event.id,kind:event.kind,expiresAt:event.expiresAt,secretsExposed:false})});return json(res,201,{event});}
      if(req.method==='DELETE'&&url.pathname==='/api/internal/personal/companion/self'){const token=String(req.headers['x-agentone-device-token']||''),device=authorizeCompanion(state.db,{userId,deviceToken:token,pepper:companionPepper}),result=revokeCompanion(state.db,{userId,deviceId:device.id});recordAudit(state.db,{userId,connectorId:'apple-companion',action:'companion.device.self-revoked',outcome:result.revoked?'OK':'NOT_FOUND',detail:JSON.stringify({eventsDeleted:result.eventsDeleted,secretsExposed:false})});return json(res,result.revoked?200:404,{revoked:result.revoked,alreadyRevoked:result.alreadyRevoked,eventsDeleted:result.eventsDeleted,selfRevoked:true,secretsExposed:false});}
      const deviceMatch=url.pathname.match(/^\/api\/internal\/personal\/companion\/devices\/([^/]+)$/);if(req.method==='DELETE'&&deviceMatch){const result=revokeCompanion(state.db,{userId,deviceId:decodeURIComponent(deviceMatch[1])});recordAudit(state.db,{userId,connectorId:'apple-companion',action:'companion.device.revoked',outcome:result.revoked?'OK':'NOT_FOUND',detail:JSON.stringify({deviceId:result.deviceId,eventsDeleted:result.eventsDeleted,secretsExposed:false})});return json(res,result.revoked?200:404,result);}
      return json(res,405,{error:'method_not_allowed'});
    }catch(error){const retryAfter=Number(error.retryAfterSeconds);return json(res,error.status||400,{error:error.code||'COMPANION_REQUEST_FAILED',message:String(error.message||error).slice(0,180),retryAfterSeconds:Number.isFinite(retryAfter)?retryAfter:null,secretsExposed:false},Number.isFinite(retryAfter)?{'retry-after':String(Math.max(1,Math.ceil(retryAfter)))}:{});}
  }
  if(url.pathname==='/api/internal/personal/governance'||url.pathname.startsWith('/api/internal/personal/governance/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/governance')return json(res,200,governanceSnapshot(state.db,userId));
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/governance/audit'){const input=await body(req);return json(res,201,{audit:recordAudit(state.db,{userId,connectorId:input.connectorId,action:input.action,outcome:input.outcome,detail:input.detail})});}
    const match=url.pathname.match(/^\/api\/internal\/personal\/governance\/([^/]+)\/actions$/);if(req.method==='POST'&&match)try{const input=await body(req),connectorId=decodeURIComponent(match[1]),result=connectorAction(state.db,{userId,connectorId,action:input.action,detail:input.detail});if(result.action==='ROTATE'){const stored=await getPersonalService(postgres,userId,connectorId);if(stored){const plaintext=decryptDemoSecret(stored,env),secret=encryptDemoSecret(plaintext,env);await savePersonalService(postgres,{userId,service:{...stored,settings:{...(stored.settings||{}),credentialVersion:result.credentialVersion,rotatedAt:result.updatedAt}},secret,lastTest:stored.lastTest,status:stored.status});}}return json(res,200,{result});}catch(error){return json(res,error.status||400,{error:String(error.message||error).slice(0,180)});}
    return json(res,405,{error:'method_not_allowed'});
  }
  if(url.pathname==='/api/internal/personal/nudges'||url.pathname==='/api/internal/personal/nudges/feedback'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/nudges'){const settings=loadNudgeSettings(state.db,userId),feedbackProfile=loadNudgeFeedbackProfile(state.db,userId),[connectors,mailAccounts]=await Promise.all([listPersonalConnectors(postgres,userId),listPersonalMailAccounts(postgres,userId)]),snapshot=platformSnapshot(),governance=governanceSnapshot(state.db,userId),items=applyNudgeFeedback(filterPersonalNudges(buildPersonalNudges({connectors,mailAccounts,audit:governance.audit||[],gates:snapshot.gates||[]}),settings),feedbackProfile),quiet=quietNow(settings.quietHours);return json(res,200,{settings,items,delivery:{quietNow:quiet,inApp:true,external:settings.enabled&&!quiet,deliverableCount:items.length},secretsExposed:false});}
    if(req.method==='PUT'&&url.pathname==='/api/internal/personal/nudges')return json(res,200,{settings:saveNudgeSettings(state.db,userId,await body(req))});
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/nudges/feedback')try{const input=await body(req);return json(res,201,{feedback:recordNudgeFeedback(state.db,{id:crypto.randomUUID(),userId,nudgeId:String(input.nudgeId||''),value:String(input.value||'')})});}catch(error){return json(res,error.status||400,{error:String(error.message||error)});}
    if(req.method==='DELETE'&&url.pathname==='/api/internal/personal/nudges/feedback')return json(res,200,{feedback:resetNudgeFeedback(state.db,userId),reset:true});
    return json(res,405,{error:'method_not_allowed'});
  }
  if(url.pathname==='/api/internal/personal/pulse'||url.pathname.startsWith('/api/internal/personal/pulse/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    try{
      const settings=loadNudgeSettings(state.db,userId),externalOptIn=settings.channels.filter(channel=>channel!=='in-app');
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/pulse'){const intelligence=await personalIntelligenceSnapshot(userId),plan=planPersonalPulse(state.db,{userId,signals:intelligence.signals,channels:settings.channels,externalOptIn,quietHours:settings.quietHours,timeZone:'Europe/Berlin',dailyLimit:3});return json(res,200,{...plan,history:listPersonalPulseDeliveries(state.db,userId,{limit:20}),policy:{automatic:true,deduplicated:true,externalOptInRequired:true,secretsExposed:false}});}
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/pulse/delivery'){
        const input=await body(req),channel=String(input.channel||'in-app'),intelligence=await personalIntelligenceSnapshot(userId),plan=planPersonalPulse(state.db,{userId,signals:intelligence.signals,channels:settings.channels,externalOptIn,quietHours:settings.quietHours,timeZone:'Europe/Berlin',dailyLimit:3}),planned=plan.items.find(item=>item.id===String(input.signalId||'')&&item.notificationKey===String(input.notificationKey||'')&&item.channels.includes(channel));
        if(!planned)return json(res,409,{error:'PERSONAL_PULSE_DELIVERY_NOT_PLANNED',message:'Dieser Hinweis ist nicht mehr zur Zustellung freigegeben.',secretsExposed:false});
        const delivery=recordPersonalPulseDelivery(state.db,{userId,signalId:planned.id,notificationKey:planned.notificationKey,channel,externalOptIn,timeZone:'Europe/Berlin'});return json(res,delivery.delivered?201:200,{delivery});
      }
      if(req.method==='DELETE'&&url.pathname==='/api/internal/personal/pulse'){const input=await body(req);return json(res,200,{reset:resetPersonalPulseDeliveries(state.db,{userId,confirmation:input.confirmation})});}
      return json(res,405,{error:'method_not_allowed'});
    }catch(error){return json(res,error.status||400,{error:error.code||'PERSONAL_PULSE_FAILED',message:String(error.message||error).slice(0,160),secretsExposed:false});}
  }
  if(url.pathname==='/api/internal/personal/calendar/ics'||url.pathname==='/api/internal/personal/calendar/ics/import'||url.pathname==='/api/internal/personal/calendar/ics/feed'||url.pathname==='/api/internal/personal/calendar/ics/sync'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    try{
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/calendar/ics')return json(res,200,icsStatusPayload(userId));
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/calendar/ics/import'){
        const contentType=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();if(!['text/calendar','text/plain','application/octet-stream'].includes(contentType))return json(res,415,{error:'ICS_UPLOAD_TYPE_UNSUPPORTED',message:'Bitte eine .ics-Kalenderdatei auswählen.',secretsExposed:false});
        const snapshot=parseIcsCalendar(await icsBodyBuffer(req),{accountId:'ics-upload',calendarId:'personal-ics',defaultTimeZone:'Europe/Berlin',retentionDays:400,retentionLimit:10_000,maxBytes:4*1024*1024}),events=icsSnapshotLedgerEvents(userId,snapshot);
        let status;const ledger=replacePersonalEvents(state.db,{userId,source:'calendar.ics',events},{onReplaced:()=>{status=savePersonalIcsUploadState(state.db,{userId,eventCount:events.length,importedAt:snapshot.syncedAt});recordAudit(state.db,{userId,connectorId:'calendar-ics',action:'ICS_IMPORT',outcome:'OK',detail:JSON.stringify({events:events.length,deduplicated:snapshot.stats.deduplicated,expired:snapshot.stats.expired,secretsExposed:false})});}});
        return json(res,201,{...icsStatusPayload(userId),status:status.status,eventCount:status.eventCount,importedAt:status.importedAt,stats:snapshot.stats,ledger});
      }
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/calendar/ics/feed'){
        const contentType=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();if(contentType!=='application/json')return json(res,415,{error:'ICS_FEED_TYPE_UNSUPPORTED',message:'Kalender-Feed muss als JSON übergeben werden.',secretsExposed:false});
         const input=await body(req);if(typeof input.url!=='string'||!input.url.trim())return json(res,400,{error:'ICS_FEED_URL_REQUIRED',message:'Eine öffentliche HTTPS- oder webcal-ICS-Adresse ist erforderlich.',secretsExposed:false});
         return json(res,201,await syncPersonalIcsFeed(userId,{feedUrl:input.url,reason:'connect'}));
      }
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/calendar/ics/sync'){
        return json(res,200,await syncPersonalIcsFeed(userId,{reason:'manual'}));
      }
      if(req.method==='DELETE'&&url.pathname==='/api/internal/personal/calendar/ics'){
        const input=await body(req);if(input.confirm!=='REMOVE_ICS_CALENDAR')return json(res,409,{error:'ICS_REMOVE_CONFIRMATION_REQUIRED'});const removed=icsAtomic(()=>{const deleted=deletePersonalEvents(state.db,{userId,source:'calendar.ics'}),credential=removePersonalIcsState(state.db,{userId});recordAudit(state.db,{userId,connectorId:'calendar-ics',action:'ICS_REMOVE',outcome:'OK',detail:JSON.stringify({events:deleted.deleted,credentialRemoved:credential.removed,secretsExposed:false})});return {deleted,credential};});return json(res,200,{...icsStatusPayload(userId),removed});
      }
      return json(res,405,{error:'method_not_allowed'});
    }catch(error){const failure=safeIcsFailure(error),code=error.code||failure.code||'ICS_SYNC_FAILED',calendar=icsStatusPayload(userId);if(!error.icsStatus)recordAudit(state.db,{userId,connectorId:'calendar-ics',action:'ICS_REQUEST',outcome:'ERROR',detail:JSON.stringify({code,secretsExposed:false})});return json(res,error.status||400,{...failure,error:code,status:error.icsStatus?.status||calendar.status,calendar});}
  }
  if(url.pathname==='/api/internal/personal/calendar/plan'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});if(req.method!=='GET')return json(res,405,{error:'method_not_allowed'});
    try{
      const allowed=new Set(['date','timeZone','workdayStart','workdayEnd','minFreeMinutes']);if([...url.searchParams.keys()].some(key=>!allowed.has(key)||url.searchParams.getAll(key).length!==1))return json(res,400,{error:'CALENDAR_PLAN_QUERY_INVALID',secretsExposed:false});
      const options={date:url.searchParams.get('date')||undefined,timeZone:url.searchParams.get('timeZone')||'Europe/Berlin',workdayStart:url.searchParams.get('workdayStart')||'08:00',workdayEnd:url.searchParams.get('workdayEnd')||'18:00',minFreeMinutes:url.searchParams.has('minFreeMinutes')?Number(url.searchParams.get('minFreeMinutes')):30},window=calendarPlanWindow(options),events=queryPersonalEvents(state.db,{userId,type:'calendar.event',from:window.queryFrom,to:window.queryTo,limit:5_000}),plan=buildPersonalCalendarPlan({...options,events});
      return json(res,200,plan);
    }catch(error){return json(res,error.status||400,{error:error.code||'CALENDAR_PLAN_FAILED',message:String(error.message||error).slice(0,160),secretsExposed:false});}
  }
  if(url.pathname==='/api/internal/personal/events'||url.pathname.startsWith('/api/internal/personal/events/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    try{
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/events')return json(res,200,{schema:'agentone.personal-events/v1',summary:personalEventLedgerAuditSummary(state.db,userId),events:queryPersonalEvents(state.db,{userId,source:url.searchParams.get('source')||undefined,type:url.searchParams.get('type')||undefined,from:url.searchParams.get('from')||undefined,to:url.searchParams.get('to')||undefined,limit:Number(url.searchParams.get('limit')||200)}),policy:{immutable:true,minimized:true,userIsolated:true,secretsExposed:false}});
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/events/export'){const input=await body(req);if(input.confirm!=='EXPORT_MY_PERSONAL_EVENTS')return json(res,409,{error:'EVENT_LEDGER_EXPORT_CONFIRMATION_REQUIRED'});return json(res,200,exportPersonalEvents(state.db,{userId,source:input.source||undefined}),{'content-disposition':'attachment; filename="agentone-personal-events.json"'});}
      if(req.method==='DELETE'&&url.pathname==='/api/internal/personal/events'){const input=await body(req);if(input.confirm!=='DELETE_MY_PERSONAL_EVENTS')return json(res,409,{error:'EVENT_LEDGER_DELETE_CONFIRMATION_REQUIRED'});return json(res,200,{deleted:deletePersonalEvents(state.db,{userId,source:input.source||undefined,confirmAll:!input.source}),irreversible:true});}
      return json(res,405,{error:'method_not_allowed'});
    }catch(error){return json(res,error.status||400,{error:error.code||'EVENT_LEDGER_FAILED',message:String(error.message||error).slice(0,160),secretsExposed:false});}
  }
  if(url.pathname==='/api/internal/personal/skills'||url.pathname.startsWith('/api/internal/personal/skills/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    try{
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/skills'){if([...url.searchParams.keys()].length)throw learningError('Query-Parameter sind nicht erlaubt');return json(res,200,learningLabView(userId));}
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/skills'){
        learningBody(await body(req),new Set());if(listPersonalBriefingSkills(state.db,{userId}).length)throw learningError('Der integrierte Briefing-Skill ist bereits vorhanden','LEARNING_DRAFT_EXISTS',409);
        const skill=createPersonalBriefingDraft(state.db,{userId,sourceRunId:`learning-${crypto.randomUUID()}`});recordAudit(state.db,{userId,connectorId:'learning-lab',action:'skill.draft.created',outcome:'OK',detail:JSON.stringify({candidateId:skill.id,skillId:skill.skillId,version:skill.version,contentHash:skill.contentHash,secretsExposed:false})});return json(res,201,{skill,...learningLabView(userId)});
      }
      const actionMatch=url.pathname.match(/^\/api\/internal\/personal\/skills\/([^/]+)\/(evaluate|approve|activate|execute|rollback)$/);if(req.method!=='POST'||!actionMatch)return json(res,405,{error:'method_not_allowed'});
      const candidateId=decodeURIComponent(actionMatch[1]),action=actionMatch[2],current=listPersonalBriefingSkills(state.db,{userId}).find(item=>item.id===candidateId);if(!current)throw learningError('Skill wurde nicht gefunden','LEARNING_CANDIDATE_NOT_FOUND',404);
      if(action==='evaluate'){
        learningBody(await body(req),new Set());const skill=evaluatePersonalBriefingDraft(state.db,{userId,candidateId});recordAudit(state.db,{userId,connectorId:'learning-lab',action:'skill.evaluated',outcome:'OK',detail:JSON.stringify({candidateId,version:skill.version,contentHash:skill.contentHash,passed:skill.test?.passed===true,secretsExposed:false})});return json(res,200,{skill});
      }
      if(action==='approve'){
        const input=learningBody(await body(req),new Set(['contentHash'])),principal=learningHumanPrincipal(req,userId,'approve'),skill=approvePersonalBriefingDraft(state.db,{userId,candidateId,contentHash:String(input.contentHash||''),principal});recordAudit(state.db,{userId,connectorId:'learning-lab',action:'skill.approved',outcome:'OK',detail:JSON.stringify({candidateId,version:skill.version,contentHash:skill.contentHash,actor:userId,secretsExposed:false})});return json(res,200,{skill});
      }
      if(action==='activate'){
        learningBody(await body(req),new Set());const principal=learningHumanPrincipal(req,userId,'activate'),skill=activatePersonalBriefingSkill(state.db,{userId,candidateId,principal});recordAudit(state.db,{userId,connectorId:'learning-lab',action:'skill.activated',outcome:'OK',detail:JSON.stringify({candidateId,version:skill.version,contentHash:skill.contentHash,actor:userId,worker:'learning-release-worker',secretsExposed:false})});return json(res,200,{skill});
      }
      if(action==='execute'){
        learningBody(await body(req),new Set());if(!current.active||current.status!=='ACTIVE')throw learningError('Nur der aktive Skill kann ausgeführt werden','LEARNING_TRANSITION_DENIED',409);
        const run=createCommandRun(state.db,{userId,label:'Learning Lab · Persönliches Briefing',mode:'controlled',source:'chat'});appendCommandStep(state.db,{userId,runId:run.id,type:'OBSERVE',summary:'Minimierte Mail-, Kalender- und Health-Signale laden'});const tool=appendCommandStep(state.db,{userId,runId:run.id,type:'TOOL',summary:'Freigegebenen Briefing-Skill deterministisch und read-only ausführen',toolId:'personal.learning-lab',operation:'personal-briefing.v1',access:'read',scopes:['mail.read','calendar.read','health.summary'],idempotent:true,input:{candidateId,contentHash:current.contentHash}});
        try{const intelligence=await personalIntelligenceSnapshot(userId),events=learningBriefingEvents(intelligence),execution=executePersonalBriefingSkill(state.db,{userId,executionId:run.id,input:{events}});recordCommandResult(state.db,{userId,runId:run.id,toolStepId:tool.id,summary:'Briefing-Skill ohne Mutation ausgeführt',output:{skillId:execution.skill.id,version:execution.skill.version,events:execution.overview.total,actionRequired:execution.overview.actionRequired,sourceCount:Object.values(execution.overview.bySource).filter(Boolean).length,inputHash:execution.inputHash,outputHash:execution.outputHash,readOnly:true}});completeCommandRun(state.db,{userId,runId:run.id});recordAudit(state.db,{userId,connectorId:'learning-lab',action:'skill.executed',outcome:'OK',detail:JSON.stringify({candidateId,version:execution.skill.version,executionId:execution.executionId,eventCount:execution.overview.total,inputHash:execution.inputHash,outputHash:execution.outputHash,readOnly:true,secretsExposed:false})});return json(res,200,{schema:'agentone.personal-learning-execution/v1',execution,commandStream:publicCommandTimeline(state.db,{userId,runId:run.id}),secretsExposed:false});}catch(error){try{recordCommandError(state.db,{userId,runId:run.id,toolStepId:tool.id,code:error.code||'LEARNING_EXECUTION_FAILED',message:'Learning-Lab-Briefing konnte nicht ausgeführt werden',retryable:false});}catch{}throw error;}
      }
      const input=learningBody(await body(req),new Set(['contentHash','targetVersion','reason'])),principal=learningHumanPrincipal(req,userId,'rollback');if(String(input.contentHash||'')!==current.contentHash)throw learningError('Rollback bezieht sich nicht auf den aktiven Content Hash','LEARNING_APPROVAL_HASH_MISMATCH',409);const result=rollbackPersonalBriefingSkill(state.db,{userId,candidateId,targetVersion:Number(input.targetVersion),reason:String(input.reason||'Manueller Rollback im Learning Lab'),principal});recordAudit(state.db,{userId,connectorId:'learning-lab',action:'skill.rolled_back',outcome:'OK',detail:JSON.stringify({candidateId,fromVersion:current.version,targetVersion:result.active.version,contentHash:current.contentHash,actor:userId,secretsExposed:false})});return json(res,200,result);
    }catch(error){return learningFailure(res,error);}
  }
  if(url.pathname==='/api/internal/personal/commands'&&req.method==='GET'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});return json(res,200,{schema:'agentone.command-run-list/v1',runs:listCommandRuns(state.db,{userId,limit:url.searchParams.get('limit')||20}),secretsExposed:false});
  }
  const commandMatch=url.pathname.match(/^\/api\/internal\/personal\/commands\/([0-9a-f-]{36})$/i);if(commandMatch&&req.method==='GET'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});try{return json(res,200,publicCommandTimeline(state.db,{userId,runId:commandMatch[1]}));}catch(error){return json(res,error.status===404?404:400,{error:error.code||'COMMAND_NOT_FOUND',secretsExposed:false});}
  }
  if(url.pathname==='/api/internal/personal/commands/briefing'&&req.method==='POST'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    const run=createCommandRun(state.db,{userId,label:'Persönliches Tagesbild',mode:'controlled',source:'chat'});appendCommandStep(state.db,{userId,runId:run.id,type:'OBSERVE',summary:'Mail, Kalender und Health als minimierte Ereignisse laden'});const tool=appendCommandStep(state.db,{userId,runId:run.id,type:'TOOL',summary:'Persönliche Signale deterministisch auswerten',toolId:'personal.intelligence',operation:'build-briefing',access:'read',scopes:['mail.read','calendar.read','health.summary'],idempotent:true,input:{timeZone:'Europe/Berlin'}});
    try{const intelligence=await personalIntelligenceSnapshot(userId);recordCommandResult(state.db,{userId,runId:run.id,toolStepId:tool.id,summary:'Tagesbild aus persönlichen Quellen erstellt',output:{events:intelligence.eventCount,signals:intelligence.signals.length,attention:intelligence.summary.attention,ledgerEvents:intelligence.ledger?.total||0,sources:intelligence.sources.map(source=>({id:source.id,status:source.status,records:source.records||0}))}});completeCommandRun(state.db,{userId,runId:run.id});return json(res,200,{schema:'agentone.personal-briefing-run/v1',intelligence,commandStream:publicCommandTimeline(state.db,{userId,runId:run.id}),secretsExposed:false});}catch(error){recordCommandError(state.db,{userId,runId:run.id,toolStepId:tool.id,code:'PERSONAL_BRIEFING_FAILED',message:'Persönliches Tagesbild konnte nicht erstellt werden',retryable:true});return json(res,500,{error:'personal_briefing_failed',commandStream:publicCommandTimeline(state.db,{userId,runId:run.id}),detail:'Persönliches Tagesbild konnte nicht erstellt werden.',secretsExposed:false});}
  }
  if(url.pathname==='/api/internal/personal/memory'||url.pathname.startsWith('/api/internal/personal/memory/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/memory')return json(res,200,{entries:listMemoryEntries(state.db,{userId,query:url.searchParams.get('q')||'',area:url.searchParams.get('area')||''}),policy:{provenanceRequired:true,expirySupported:true,forgetSupported:true,secretsExposed:false}});
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/memory')try{
      const candidate=stageMemoryCandidate(state.db,{userId,operation:'ADD',input:await body(req),provenanceClass:'owner',evidenceHashes:[]});
      recordAudit(state.db,{userId,connectorId:'personal-memory',action:'memory.legacy-write.staged',outcome:'PENDING',detail:JSON.stringify({candidateId:candidate.id,operation:candidate.operation,area:candidate.area,contentIncluded:false,secretsExposed:false})});
      return json(res,202,{candidate,reviewRequired:true,directWrite:false,secretsExposed:false});
    }catch(error){return json(res,error.status||400,{error:error.code||'MEMORY_REVIEW_STAGE_FAILED',message:'Memory-Vorschlag konnte nicht vorgemerkt werden.',secretsExposed:false});}
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/memory/candidates')try{return json(res,200,{candidates:listMemoryCandidates(state.db,{userId,state:url.searchParams.get('state')||'',limit:Math.min(100,Number(url.searchParams.get('limit'))||100)}),policies:listMemoryAreaPolicies(state.db,{userId}),policy:{humanApprovalRequired:true,contentInAudit:false,secretsExposed:false}});}catch(error){return json(res,error.status||400,{error:error.code||'MEMORY_REVIEW_FAILED',message:'Memory-Prüfliste konnte nicht geladen werden.',secretsExposed:false});}
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/memory/candidates')try{const input=await body(req),candidate=stageMemoryCandidate(state.db,{userId,operation:input.operation||'ADD',input:input.input,targetEntryId:input.targetEntryId||null,provenanceClass:input.provenanceClass||'owner',evidenceHashes:input.evidenceHashes||[]});recordAudit(state.db,{userId,connectorId:'personal-memory',action:'memory.candidate.staged',outcome:'PENDING',detail:JSON.stringify({candidateId:candidate.id,operation:candidate.operation,area:candidate.area,contentIncluded:false,secretsExposed:false})});return json(res,201,{candidate,reviewRequired:true,secretsExposed:false});}catch(error){return json(res,error.status||400,{error:error.code||'MEMORY_REVIEW_STAGE_FAILED',message:'Memory-Vorschlag konnte nicht vorgemerkt werden.',secretsExposed:false});}
    const decision=url.pathname.match(/^\/api\/internal\/personal\/memory\/candidates\/([^/]+)\/(approve|reject)$/);if(req.method==='POST'&&decision)try{const input=await body(req),params={userId,id:decodeURIComponent(decision[1]),candidateHash:String(input.candidateHash||''),actor:{type:'human',id:userId}},result=decision[2]==='approve'?approveMemoryCandidate(state.db,params):rejectMemoryCandidate(state.db,params);recordAudit(state.db,{userId,connectorId:'personal-memory',action:`memory.candidate.${decision[2]}`,outcome:result.candidate.state,detail:JSON.stringify({candidateId:result.candidate.id,operation:result.candidate.operation,contentIncluded:false,secretsExposed:false})});return json(res,200,{...result,secretsExposed:false});}catch(error){return json(res,error.status||400,{error:error.code||'MEMORY_REVIEW_DECISION_FAILED',message:'Memory-Entscheidung konnte nicht abgeschlossen werden.',secretsExposed:false});}
    const areaPolicy=url.pathname.match(/^\/api\/internal\/personal\/memory\/policies\/([^/]+)$/);if(req.method==='POST'&&areaPolicy)try{const input=await body(req),policy=setMemoryAreaPolicy(state.db,{userId,area:decodeURIComponent(areaPolicy[1]),enabled:input.enabled,actor:{type:'human',id:userId}});return json(res,200,{policy,secretsExposed:false});}catch(error){return json(res,error.status||400,{error:error.code||'MEMORY_POLICY_FAILED',message:'Memory-Bereich konnte nicht geändert werden.',secretsExposed:false});}
    const match=url.pathname.match(/^\/api\/internal\/personal\/memory\/([^/]+)$/);if(req.method==='DELETE'&&match)try{return json(res,200,forgetMemoryEntry(state.db,{userId,id:decodeURIComponent(match[1])}));}catch(error){return json(res,error.status||400,{error:String(error.message||error)});}
    return json(res,405,{error:'method_not_allowed'});
  }
  if(url.pathname==='/api/internal/personal/routines'||url.pathname.startsWith('/api/internal/personal/routines/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/routines')return json(res,200,{routines:listRoutines(state.db,userId),policy:{simulationRequired:true,readOnlyActions:true,timezone:'Europe/Berlin'}});
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/routines')try{return json(res,201,{routine:createRoutine(state.db,{id:crypto.randomUUID(),userId,input:await body(req)})});}catch(error){return json(res,error.status||400,{error:String(error.message||error)});}
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/routines/runs')try{const raw=url.searchParams.get('limit'),limit=raw===null?20:Number(raw);return json(res,200,{runs:listRoutineInbox(state.db,{userId,limit}),policy:{readOnly:true,retentionDays:30,userBound:true,secretsExposed:false},secretsExposed:false});}catch(error){return json(res,error.status||400,{error:error.code||'ROUTINE_RUN_LIST_FAILED',message:'Routine-Verlauf konnte nicht geladen werden.',secretsExposed:false});}
    const runState=url.pathname.match(/^\/api\/internal\/personal\/routines\/runs\/([^/]+)\/state$/);if(req.method==='PUT'&&runState)try{const input=await body(req),run=setRoutineRunInboxState(state.db,{userId,runId:decodeURIComponent(runState[1]),state:String(input.state||''),snoozedUntil:input.snoozedUntil});recordAudit(state.db,{userId,connectorId:'routines',action:'routine.inbox.'+run.inboxState.toLowerCase(),outcome:'OK',detail:JSON.stringify({routineRunId:run.id,inboxState:run.inboxState,secretsExposed:false})});return json(res,200,{run,secretsExposed:false});}catch(error){return json(res,error.status||400,{error:error.code||'ROUTINE_INBOX_STATE_FAILED',message:'Inbox-Status konnte nicht gespeichert werden.',secretsExposed:false});}
    const manualRun=url.pathname.match(/^\/api\/internal\/personal\/routines\/([^/]+)\/run$/);if(req.method==='POST'&&manualRun){const routineId=decodeURIComponent(manualRun[1]),routine=listRoutines(state.db,userId).find(item=>item.id===routineId);if(!routine)return json(res,404,{error:'ROUTINE_NOT_FOUND',message:'Routine wurde nicht gefunden.',secretsExposed:false});try{const claim=claimManualRoutineRun(state.db,{id:crypto.randomUUID(),userId,routineId}),result=await executePersonalRoutine({routine:{...routine,userId},claim,source:'api'});return json(res,200,{...result,secretsExposed:false});}catch(error){return json(res,error.status||500,{error:safeRoutineFailureCode(error),message:'Routine konnte nicht abgeschlossen werden.',run:error.routineRun||null,secretsExposed:false});}}
    const simulation=url.pathname.match(/^\/api\/internal\/personal\/routines\/([^/]+)\/simulate$/);if(req.method==='POST'&&simulation)try{return json(res,200,{simulation:simulateStoredRoutine(state.db,{userId,id:decodeURIComponent(simulation[1])})});}catch(error){return json(res,error.status||400,{error:String(error.message||error)});}
    const stateMatch=url.pathname.match(/^\/api\/internal\/personal\/routines\/([^/]+)\/state$/);if(req.method==='PUT'&&stateMatch)try{const input=await body(req);return json(res,200,{routine:setRoutineState(state.db,{userId,id:decodeURIComponent(stateMatch[1]),state:String(input.state||''),simulationHash:String(input.simulationHash||'')})});}catch(error){return json(res,error.status||400,{error:String(error.message||error)});}
    const routineMatch=url.pathname.match(/^\/api\/internal\/personal\/routines\/([^/]+)$/);if(req.method==='DELETE'&&routineMatch)try{return json(res,200,deleteRoutine(state.db,{userId,id:decodeURIComponent(routineMatch[1])}));}catch(error){return json(res,error.status||400,{error:String(error.message||error)});}
    return json(res,405,{error:'method_not_allowed'});
  }
  if(url.pathname==='/api/internal/personal/whoop/status'||url.pathname==='/api/internal/personal/whoop/start'||url.pathname==='/api/internal/personal/whoop/callback'||url.pathname==='/api/internal/personal/whoop/sync'||url.pathname==='/api/internal/personal/whoop/connection'){
    if(!internalPersonal)return json(res,403,{error:'forbidden',secretsExposed:false});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required',secretsExposed:false});
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/whoop/status')try{return json(res,200,whoopPublicViewModel(userId));}catch(error){const failure=publicWhoopError(error);return json(res,failure.status,failure);}
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/whoop/start'){
      if(!whoopHuman(req,userId,'whoop-oauth-start-confirmed'))return json(res,403,{error:'COMMAND_HUMAN_GATE_REQUIRED',message:'Menschliche Bestätigung erforderlich.',secretsExposed:false});
      try{if(!whoopTokenCryptoReady||!healthCryptoReady)throw Object.assign(new Error('WHOOP-Tokenablage ist nicht konfiguriert'),{code:'WHOOP_TOKEN_ENCRYPTION_NOT_CONFIGURED',status:503});const start=startWhoopAuthorization({db:state.db,userId,config:whoopConfig});recordAudit(state.db,{userId,connectorId:'whoop',action:'WHOOP_OAUTH_START',outcome:'OK',detail:JSON.stringify({expiresAt:start.expiresAt,scopes:start.scopes,secretsExposed:false})});return whoopRedirect(res,start.authorizationUrl);}catch(error){const failure=publicWhoopError(error);recordAudit(state.db,{userId,connectorId:'whoop',action:'WHOOP_OAUTH_START',outcome:'ERROR',detail:JSON.stringify({code:failure.error,secretsExposed:false})});return json(res,failure.status,failure);}
    }
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/whoop/callback'){
      try{if(!whoopTokenCryptoReady||!healthCryptoReady)throw Object.assign(new Error('WHOOP-Tokenablage ist nicht konfiguriert'),{code:'WHOOP_TOKEN_ENCRYPTION_NOT_CONFIGURED',status:503});const input=await whoopCallbackInput(req),result=await completeWhoopAuthorization({db:state.db,userId,config:whoopConfig,masterSecret:whoopMasterSecret,...input,encryptHealth:healthEncrypt});recordAudit(state.db,{userId,connectorId:'whoop',action:'WHOOP_OAUTH_CALLBACK',outcome:'OK',detail:JSON.stringify({scopes:result.consent.scopes,secretsExposed:false})});return whoopRedirect(res,'/?whoop=connected');}catch(error){const failure=publicWhoopError(error);recordAudit(state.db,{userId,connectorId:'whoop',action:'WHOOP_OAUTH_CALLBACK',outcome:'ERROR',detail:JSON.stringify({code:failure.error,secretsExposed:false})});return whoopRedirect(res,`/?whoop=error&code=${encodeURIComponent(failure.error)}`);}
    }
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/whoop/sync'){
      if(!whoopHuman(req,userId,'whoop-sync-confirmed'))return json(res,403,{error:'COMMAND_HUMAN_GATE_REQUIRED',message:'Menschliche Bestätigung erforderlich.',secretsExposed:false});
      const run=createCommandRun(state.db,{userId,label:'WHOOP sicher synchronisieren',mode:'controlled',source:'api'});appendCommandStep(state.db,{userId,runId:run.id,type:'OBSERVE',summary:'WHOOP-Freigabe, Cursor und verschlüsselte Verbindung prüfen'});const tool=appendCommandStep(state.db,{userId,runId:run.id,type:'TOOL',summary:'WHOOP-Daten inkrementell und read-only synchronisieren',toolId:'personal.whoop',operation:'whoop.sync',access:'write',scopes:['whoop.read','health.write'],idempotent:true,input:{provider:'whoop',incremental:true,rawRecords:false}});
      try{approveCommandGate(state.db,{userId,runId:run.id,toolStepId:tool.id,payloadHash:tool.payloadHash,actor:{kind:'human',id:userId},verifyHuman:()=>true});const result=await syncWhoopConnection({db:state.db,userId,config:whoopConfig,masterSecret:whoopMasterSecret,encryptHealth:healthEncrypt,decryptHealth:healthDecrypt,reason:'manual'});recordCommandResult(state.db,{userId,runId:run.id,toolStepId:tool.id,summary:result.status==='LIVE'?'WHOOP-Daten synchronisiert':'WHOOP-Daten mit Teilerfolg synchronisiert',output:{status:result.status,metrics:result.metrics,inserted:result.stored.inserted,updated:result.stored.updated,unchanged:result.stored.unchanged,failures:result.failures}});completeCommandRun(state.db,{userId,runId:run.id});recordAudit(state.db,{userId,connectorId:'whoop',action:'WHOOP_SYNC',outcome:result.status,detail:JSON.stringify({reason:'manual',metrics:result.metrics,failures:result.failures.length,secretsExposed:false})});return json(res,200,{...result,commandStream:publicCommandTimeline(state.db,{userId,runId:run.id})});}catch(error){const failure=publicWhoopError(error);try{recordCommandError(state.db,{userId,runId:run.id,toolStepId:tool.id,code:failure.error,message:failure.message,retryable:failure.retryable});}catch{}recordAudit(state.db,{userId,connectorId:'whoop',action:'WHOOP_SYNC',outcome:'ERROR',detail:JSON.stringify({reason:'manual',code:failure.error,retryable:failure.retryable,secretsExposed:false})});return json(res,failure.status,{...failure,commandStream:publicCommandTimeline(state.db,{userId,runId:run.id})});}
    }
    if(req.method==='DELETE'&&url.pathname==='/api/internal/personal/whoop/connection'){
      if(!whoopHuman(req,userId,'whoop-disconnect-confirmed'))return json(res,403,{error:'COMMAND_HUMAN_GATE_REQUIRED',message:'Menschliche Bestätigung erforderlich.',secretsExposed:false});
      const run=createCommandRun(state.db,{userId,label:'WHOOP-Verbindung widerrufen',mode:'controlled',source:'api'});appendCommandStep(state.db,{userId,runId:run.id,type:'OBSERVE',summary:'WHOOP-Verbindung und Freigabe prüfen'});const tool=appendCommandStep(state.db,{userId,runId:run.id,type:'TOOL',summary:'WHOOP-Zugriff beim Anbieter widerrufen',toolId:'personal.whoop',operation:'whoop.disconnect',access:'write',scopes:['whoop.revoke'],idempotent:true,input:{provider:'whoop',healthDataDeletion:false}});
      try{approveCommandGate(state.db,{userId,runId:run.id,toolStepId:tool.id,payloadHash:tool.payloadHash,actor:{kind:'human',id:userId},verifyHuman:()=>true});const result=await disconnectWhoop({db:state.db,userId,config:whoopConfig,masterSecret:whoopMasterSecret}),confirmed=result.providerRevocationConfirmed===true,summary=result.alreadyDisconnected?'WHOOP war bereits lokal getrennt':confirmed?'WHOOP-Zugriff beim Anbieter widerrufen':'Lokale WHOOP-Verbindung entfernt; Provider-Widerruf unbestätigt';recordCommandResult(state.db,{userId,runId:run.id,toolStepId:tool.id,summary,output:{disconnected:result.disconnected,alreadyDisconnected:result.alreadyDisconnected||false,providerRevocationConfirmed:confirmed,providerReviewRequired:Boolean(result.providerReviewRequired),providerStatus:result.providerStatus||null,dataRetainedUntilExplicitDeletion:true}});completeCommandRun(state.db,{userId,runId:run.id});recordAudit(state.db,{userId,connectorId:'whoop',action:'WHOOP_DISCONNECT',outcome:'OK',detail:JSON.stringify({alreadyDisconnected:Boolean(result.alreadyDisconnected),providerRevocationConfirmed:confirmed,providerReviewRequired:Boolean(result.providerReviewRequired),dataRetained:true,secretsExposed:false})});return json(res,200,{...result,commandStream:publicCommandTimeline(state.db,{userId,runId:run.id})});}catch(error){const failure=publicWhoopError(error);try{recordCommandError(state.db,{userId,runId:run.id,toolStepId:tool.id,code:failure.error,message:failure.message,retryable:failure.retryable});}catch{}recordAudit(state.db,{userId,connectorId:'whoop',action:'WHOOP_DISCONNECT',outcome:'ERROR',detail:JSON.stringify({code:failure.error,retryable:failure.retryable,secretsExposed:false})});return json(res,failure.status,{...failure,commandStream:publicCommandTimeline(state.db,{userId,runId:run.id})});}
    }
    return json(res,405,{error:'method_not_allowed',secretsExposed:false});
  }
  if(url.pathname==='/api/internal/personal/health'||url.pathname.startsWith('/api/internal/personal/health/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    try{
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/health'){assertHealthQuery(url.searchParams,healthEmptyQueryKeys);return json(res,200,{schema:'agentone.health-status/v1',encryptionReady:healthCryptoReady,importJobsReady:healthImportCryptoReady,consents:healthCryptoReady?listHealthConsents(state.db,{userId,decrypt:healthDecrypt}):[],store:healthStoreAuditSummary(state.db,userId),capabilities:healthConnectorCapabilities,policy:{userIsolated:true,encryptedAtRest:true,persistentImportJobs:healthImportCryptoReady,medicalDiagnosis:false,secretsExposed:false}});}
      if(!healthCryptoReady)return json(res,503,{error:'HEALTH_ENCRYPTION_NOT_CONFIGURED',message:'Health-Verschlüsselung ist noch nicht konfiguriert',secretsExposed:false,medicalDiagnosis:false});
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/health/consents'){assertHealthQuery(url.searchParams,healthEmptyQueryKeys);return json(res,200,{consents:listHealthConsents(state.db,{userId,decrypt:healthDecrypt}),secretsExposed:false});}
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/health/consents'){
        const input=await body(req),scopes=[...new Set((Array.isArray(input.scopes)?input.scopes:[]).map(String).filter(value=>healthConsentScopes.has(value)))];
        if(!scopes.length)return json(res,400,{error:'HEALTH_CONSENT_SCOPES_REQUIRED',allowedScopes:[...healthConsentScopes]});
        const consent=createHealthConsent({userId,providers:['apple_health'],scopes,purpose:'Persönliche deskriptive Trend- und Planungsanalyse',expiresAt:input.expiresAt});
        return json(res,201,{consent:saveHealthConsent(state.db,{userId,consent,encrypt:healthEncrypt}),scopes,provider:'apple_health',secretsExposed:false});
      }
      const consentMatch=url.pathname.match(/^\/api\/internal\/personal\/health\/consents\/([^/]+)$/);
      if(req.method==='DELETE'&&consentMatch)return json(res,200,{consent:revokeHealthConsent(state.db,{userId,consentId:decodeURIComponent(consentMatch[1])}),dataRetainedUntilExplicitDeletion:true});
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/health/import-jobs'){
        assertHealthQuery(url.searchParams,healthEmptyQueryKeys);return json(res,200,{jobs:listHealthImportJobs(state.db,{userId}),secretsExposed:false});
      }
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/health/import-jobs'){
        assertHealthQuery(url.searchParams,healthEmptyQueryKeys);
        const humanActor=String(req.headers['x-agentone-human-actor']||''),humanAction=String(req.headers['x-agentone-human-action']||'');
        if(humanActor!==userId||humanAction!=='health-import-confirmed')return json(res,403,{error:'COMMAND_HUMAN_GATE_REQUIRED',message:'Menschliche Bestätigung erforderlich.',secretsExposed:false});
        const consentId=String(req.headers['x-agentone-health-consent-id']||'').trim();if(!consentId)return json(res,400,{error:'HEALTH_CONSENT_REQUIRED',message:'Gesundheitsfreigabe fehlt.',secretsExposed:false});
        const consent=getHealthConsent(state.db,{userId,consentId,decrypt:healthDecrypt});
        if(consent.status!=='ACTIVE'||(consent.expiresAt&&Date.parse(consent.expiresAt)<=Date.now()))return json(res,403,{error:'HEALTH_CONSENT_REQUIRED',message:'Aktive Gesundheitsfreigabe fehlt.',secretsExposed:false});
        const received=await receiveHealthImportJob(req,{db:state.db,userId,consentId,fileName:req.headers['x-agentone-health-file-name'],contentType:req.headers['content-type'],contentLength:req.headers['content-length'],quarantineDir:healthImportQuarantineDir,masterSecret:healthImportMasterKey});
        if(received.created){
          const internal=getHealthImportJobInternal(state.db,{jobId:received.job.id});
          try{
            const run=createCommandRun(state.db,{userId,label:'Apple Health sicher importieren',mode:'controlled',source:'api'});
            appendCommandStep(state.db,{userId,runId:run.id,type:'OBSERVE',summary:'Dateityp, aktive Freigabe und Quellhash prüfen'});
            const tool=appendCommandStep(state.db,{userId,runId:run.id,type:'TOOL',summary:'Freigegebene Health-Bereiche verschlüsselt importieren',toolId:'personal.health',operation:'health.apple-import-job',access:'write',scopes:consent.scopes.map(scope=>`health.${scope}.write`),idempotent:true,input:{provider:'apple_health',sourceHash:internal.sourceHash,bytes:internal.bytesReceived,contentType:internal.mediaType}});
            approveCommandGate(state.db,{userId,runId:run.id,toolStepId:tool.id,payloadHash:tool.payloadHash,actor:{kind:'human',id:humanActor},verifyHuman:actor=>actor.id===userId&&humanAction==='health-import-confirmed'});
            attachHealthImportCommand(state.db,{userId,jobId:internal.id,runId:run.id,stepId:tool.id});
          }catch(error){await failHealthImportJob(state.db,{jobId:internal.id,error,quarantineDir:healthImportQuarantineDir});throw error;}
          setTimeout(()=>void runHealthImportQueue(),0).unref();
        }
        return json(res,202,{job:received.created?getHealthImportJob(state.db,{userId,jobId:received.job.id}):received.job,secretsExposed:false});
      }
      const importJobMatch=url.pathname.match(/^\/api\/internal\/personal\/health\/import-jobs\/([^/]+)$/);
      if(req.method==='GET'&&importJobMatch){assertHealthQuery(url.searchParams,healthEmptyQueryKeys);return json(res,200,{job:getHealthImportJob(state.db,{userId,jobId:decodeURIComponent(importJobMatch[1])}),secretsExposed:false});}
      if(req.method==='DELETE'&&importJobMatch){
        assertHealthQuery(url.searchParams,healthEmptyQueryKeys);const jobId=decodeURIComponent(importJobMatch[1]);getHealthImportJob(state.db,{userId,jobId});const internal=getHealthImportJobInternal(state.db,{jobId});
        activeHealthImportWorkers.get(jobId)?.controller.abort();
        const job=await cancelHealthImportJob(state.db,{userId,jobId,quarantineDir:healthImportQuarantineDir});
        if(job.state==='CANCELLED'){
          if(internal.commandRunId)try{cancelCommandRun(state.db,{userId,runId:internal.commandRunId,actor:{kind:'human',id:userId},reason:'Health-Import vom Benutzer abgebrochen'});}catch{}
          state.audit(userId,'HEALTH_IMPORT_JOB_CANCELLED',jobId,`sourceHash=${internal.sourceHash}; bytes=${internal.bytesReceived}`);
        }
        return json(res,200,{job,secretsExposed:false});
      }
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/health/apple-import'){
        const contentType=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
        if(!['application/xml','text/xml','application/zip','application/x-zip-compressed','application/octet-stream'].includes(contentType))return json(res,415,{error:'HEALTH_UPLOAD_TYPE_UNSUPPORTED'});
        const consentId=String(req.headers['x-agentone-health-consent-id']||'').trim();if(!consentId)return json(res,400,{error:'HEALTH_CONSENT_REQUIRED'});
        const consent=getHealthConsent(state.db,{userId,consentId,decrypt:healthDecrypt});
        if(consent.status!=='ACTIVE')return json(res,403,{error:'HEALTH_CONSENT_REQUIRED'});
        const data=await bodyBuffer(req),sourceHash=crypto.createHash('sha256').update(data).digest('hex'),run=createCommandRun(state.db,{userId,label:'Apple Health sicher importieren',mode:'controlled',source:'chat'});
        appendCommandStep(state.db,{userId,runId:run.id,type:'OBSERVE',summary:'Dateityp, aktive Freigabe und Quellhash prüfen'});
        const tool=appendCommandStep(state.db,{userId,runId:run.id,type:'TOOL',summary:'Freigegebene Health-Bereiche verschlüsselt importieren',toolId:'personal.health',operation:'health.apple-import',access:'write',scopes:consent.scopes.map(scope=>`health.${scope}.write`),idempotent:true,input:{provider:'apple_health',sourceHash,bytes:data.length,contentType}});
        try{
          const humanActor=String(req.headers['x-agentone-human-actor']||''),humanAction=String(req.headers['x-agentone-human-action']||'');approveCommandGate(state.db,{userId,runId:run.id,toolStepId:tool.id,payloadHash:tool.payloadHash,actor:{kind:'human',id:humanActor},verifyHuman:actor=>actor.id===userId&&humanAction==='health-import-confirmed'});
          const parsed=importAppleHealth(data,{consent,maxBytes:32*1024*1024}),stored=storeHealthImport(state.db,{userId,provider:'apple_health',consentId,sourceHash,metrics:parsed.metrics,duplicateCount:parsed.duplicatesRemoved,metadata:{schema:'agentone.apple-health-import/v1',recordsSeen:parsed.recordsSeen,ignoredRecords:parsed.ignoredRecords,excludedByConsent:parsed.excludedByConsent,importedAt:parsed.importedAt},encrypt:healthEncrypt}),metrics=queryHealthMetrics(state.db,{userId,source:'apple_health',limit:5_000,decrypt:healthDecrypt}),digest=buildHealthDigest(metrics);
          recordCommandResult(state.db,{userId,runId:run.id,toolStepId:tool.id,summary:stored.alreadyImported?'Identisches Health-Archiv war bereits importiert':'Health-Daten verschlüsselt importiert',output:{alreadyImported:Boolean(stored.alreadyImported),recordsSeen:parsed.recordsSeen,normalizedMetrics:parsed.metrics.length,duplicatesRemoved:parsed.duplicatesRemoved,ignoredRecords:parsed.ignoredRecords,excludedByConsent:parsed.excludedByConsent}});completeCommandRun(state.db,{userId,runId:run.id});
          return json(res,stored.alreadyImported?200:201,{schema:'agentone.apple-health-import-result/v1',import:{...stored,recordsSeen:parsed.recordsSeen,normalizedMetrics:parsed.metrics.length,duplicatesRemoved:parsed.duplicatesRemoved,ignoredRecords:parsed.ignoredRecords,excludedByConsent:parsed.excludedByConsent},digest,commandStream:publicCommandTimeline(state.db,{userId,runId:run.id}),policy:{encryptedAtRest:true,sourceArchiveRetained:false,medicalDiagnosis:false,secretsExposed:false}});
        }catch(error){try{recordCommandError(state.db,{userId,runId:run.id,toolStepId:tool.id,code:error.code||'HEALTH_IMPORT_FAILED',message:'Apple-Health-Import konnte nicht abgeschlossen werden',retryable:false});}catch{}error.commandStream=publicCommandTimeline(state.db,{userId,runId:run.id});throw error;}
      }
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/health/digest'){
        const options=healthDigestOptions(url.searchParams),metrics=queryHealthMetrics(state.db,{userId,...options,limit:5_000,decrypt:healthDecrypt});
        return json(res,200,{schema:'agentone.health-digest/v1',metricCount:metrics.length,digest:buildHealthDigest(metrics),policy:{medicalDiagnosis:false,secretsExposed:false}});
      }
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/health/comparison'){
        const options=healthComparisonOptions(url.searchParams),metrics=queryHealthMetrics(state.db,{userId,limit:5_000,decrypt:healthDecrypt});
        return json(res,200,buildPersonalHealthComparison(metrics,{...options,now:new Date()}));
      }
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/health/trends'){
        assertHealthQuery(url.searchParams,healthEmptyQueryKeys);const report=buildPersonalHealthTrends({userId,timeZone:'Europe/Berlin',now:new Date(),loadMetrics:options=>queryHealthMetrics(state.db,{...options,decrypt:healthDecrypt}),saveDerivedSignal:input=>saveDerivedHealthSignal(state.db,{...input,encrypt:healthEncrypt})});
        recordAudit(state.db,{userId,connectorId:'personal-health',action:'health.trends.read',outcome:'OK',detail:JSON.stringify({available:report.trends.filter(item=>item.status==='available').length,sources:report.sources.map(item=>({id:item.id,status:item.status,available:item.availableTrendCount})),rawRecordsIncluded:false,secretsExposed:false})});return json(res,200,report);
      }
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/health/export'){
        const input=await body(req);if(input.confirm!=='EXPORT_MY_HEALTH_DATA')return json(res,409,{error:'HEALTH_EXPORT_CONFIRMATION_REQUIRED'});
        return json(res,200,exportHealthData(state.db,{userId,decrypt:healthDecrypt}),{'content-disposition':'attachment; filename="agentone-health-export.json"'});
      }
      if(req.method==='DELETE'&&url.pathname==='/api/internal/personal/health/data'){
        const input=await body(req);if(input.confirm!=='DELETE_MY_HEALTH_DATA')return json(res,409,{error:'HEALTH_DELETE_CONFIRMATION_REQUIRED'});
        return json(res,200,{deleted:deleteHealthData(state.db,{userId,source:input.source||undefined,from:input.from||undefined,to:input.to||undefined,includeConsents:input.includeConsents===true}),irreversible:true});
      }
      return json(res,405,{error:'method_not_allowed'});
    }catch(error){return healthFailure(res,error);}
  }
  if(url.pathname==='/api/internal/personal/dashboard'&&req.method==='GET'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    const [database,connectors,services,mail]=await Promise.all([postgresHealth(postgres),listPersonalConnectors(postgres,userId),listPersonalServices(postgres,userId),listPersonalMailAccounts(postgres,userId)]),platformState=platformSnapshot(),companion=companionStatus(state.db,userId),governance=governanceSnapshot(state.db,userId),runs=platformState.runs.filter(run=>!String(run.id).includes('-DEMO-')),runIds=new Set(runs.map(run=>run.id)),gates=platformState.gates.filter(gate=>runIds.has(gate.runId)),events=platformState.events.filter(event=>runIds.has(event.runId)),integrations=state.catalog().map(item=>({id:item.id,name:item.name,mode:item.mode,status:item.status,note:item.note||'',capabilities:item.capabilities}));
    return json(res,200,{schema:'agentone.dashboard/v1',release:env.AGENTONE_RELEASE||'local',generatedAt:new Date().toISOString(),database,platform:{workflows:platformState.workflows.length,runs,gates,events,activeRuns:runs.filter(run=>!['COMPLETED','FAILED','CANCELLED'].includes(run.status)).length,seedDataExcluded:true},integrations,personal:{connectors,services,mailAccounts:mail.map(item=>({id:item.id,label:item.label,provider:item.provider,status:item.status,lastTest:item.lastTest})),companion,governance},policy:{liveData:true,secretsExposed:false,writesRequireApproval:true}});
  }
  if(url.pathname==='/api/internal/personal/intelligence'&&req.method==='GET'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    try{return json(res,200,await personalIntelligenceSnapshot(userId));}catch(error){return json(res,500,{error:'personal_intelligence_failed',detail:String(error.message||error).slice(0,140),secretsExposed:false});}
  }
  const internalIntegrationMatch=url.pathname.match(/^\/api\/internal\/integrations\/([a-z0-9-]+)\/health$/);
  if(req.method==='POST'&&internalIntegrationMatch){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});
    const existing=state.catalog().find(item=>item.id===internalIntegrationMatch[1]);if(!existing)return json(res,404,{error:'integration_not_found'});
    const result=await checkAdapter(existing.id,existing.mode,env),integration=state.setIntegration(existing.id,{status:result.status,latency:result.latency,checkedAt:new Date().toISOString()});
    state.audit(String(req.headers['x-agentone-user']||'internal-user'),'HEALTH_CHECK',existing.id,`${result.status}; ${result.note}`);
    return json(res,200,{integration:{...publicIntegration(integration),note:result.note},sample:result.sample,secretValuesExposed:false});
  }
  const internalGateMatch=url.pathname.match(/^\/api\/internal\/platform\/gates\/([^/]+)\/decision$/);
  if(req.method==='POST'&&internalGateMatch){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});
    try{const input=await body(req),actor=String(req.headers['x-agentone-user']||'internal-user').slice(0,80),gate=platform.decideGate(decodeURIComponent(internalGateMatch[1]),{decision:String(input.decision||''),actor}),run=platform.getRun(gate.runId);state.audit(actor,`GATE_${gate.status}`,gate.id,`Run ${run.id} · Hash ${gate.payloadHash}`);return json(res,200,{gate,run,secretValuesExposed:false});}catch(error){return json(res,error.status||409,{error:String(error.message||error).slice(0,180)});}
  }
  assertLocalOrigin(req,[env.AGENTONE_PUBLIC_ORIGIN]);
  if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{status:'ok',service:env.AGENTONE_SERVICE_NAME||'agentone',release:env.AGENTONE_RELEASE||'local',database:await postgresHealth(postgres)});
  if(req.method==='GET'&&url.pathname==='/api/auth/config')return json(res,200,entraConfig(env));
  if(req.method==='GET'&&url.pathname==='/api/auth/me'){
    const session=getSession(state,req); return json(res,200,{authenticated:Boolean(session),user:session?{id:session.userId,email:session.email,name:session.name,role:session.role}:null});
  }
  if(req.method==='GET'&&url.pathname==='/api/auth/entra/start'){
    if(!entraConfig(env).enabled)return json(res,503,{error:'Microsoft Entra ist nicht vollständig konfiguriert'});
    const auth=createEntraAuthorization(state,env);
    res.writeHead(302,{location:auth.url,'set-cookie':cookie('a1_oidc',auth.state,{maxAge:600,secure:env.COOKIE_SECURE==='true'})});return res.end();
  }
  if(req.method==='GET'&&url.pathname==='/api/auth/entra/callback'){
    try{
      const user=await completeEntraAuthorization(state,env,{code:url.searchParams.get('code'),stateValue:url.searchParams.get('state'),cookieState:parseCookies(req.headers.cookie).a1_oidc});
      const token=createSession(state,user,user.role);
      state.audit(user.email,'ENTRA_LOGIN','agentone-personal','Microsoft Entra Login erfolgreich');
      res.writeHead(302,{location:'/', 'set-cookie':[cookie('a1_session',token,{secure:env.COOKIE_SECURE==='true'}),cookie('a1_oidc','',{maxAge:0,secure:env.COOKIE_SECURE==='true'})]});return res.end();
    }catch(error){
      state.audit('anonymous','ENTRA_LOGIN_FAILED','identity',String(error.message||error).slice(0,120));
      res.writeHead(302,{location:'/?authError=entra'});return res.end();
    }
  }
  if(req.method==='GET'&&url.pathname==='/api/bootstrap'){
    const inventory=secretInventory(env);
    const session=getSession(state,req); const isAdmin=session?.role==='Platform Admin';
    return json(res,200,{personas:state.personas,worlds:session?state.worlds:[],integrations:session?state.catalog().map(publicIntegration):[],sessions:isAdmin?state.sessions:[],events:session?state.events:[],platform:session?platformSnapshot():{workflows:[],runs:[],gates:[],events:[],eventCursor:0},audit:isAdmin?state.listAudit():[],instances:isAdmin?state.listInstances():[],auth:entraConfig(env),secretStats:isAdmin?{total:inventory.length,configured:inventory.filter(item=>item.configured).length,exposed:0}:{total:0,configured:0,exposed:0},stats:session?{users:isAdmin?3:1,gateways:isAdmin?3:1,activeRuns:platform.listRuns().filter(run=>!['COMPLETED','FAILED','CANCELLED'].includes(run.status)).length,monthlyCost:platform.listRuns().reduce((sum,run)=>sum+run.budgetUsed,0)}:{users:0,gateways:0,activeRuns:0,monthlyCost:0},database:'SQLite · lokal · Demo'});
  }
  if(req.method==='GET'&&url.pathname==='/api/session-keys'){
    const session=requireSession(state,req);return json(res,200,{keys:state.listSessionKeys(session.tokenHash)});
  }
  if(req.method==='POST'&&url.pathname==='/api/session-keys'){
    const session=requireSession(state,req),input=await body(req);const key=state.createSessionKey(session.tokenHash,input.label);state.audit(session.email,'SESSION_API_KEY_CREATE',key.loginKey,key.label);return json(res,201,{credential:key});
  }
  const sessionKeyMatch=url.pathname.match(/^\/api\/session-keys\/(a1l_[A-Za-z0-9_-]+)$/);
  if(req.method==='DELETE'&&sessionKeyMatch){const session=requireSession(state,req);const result=state.revokeSessionKey(session.tokenHash,sessionKeyMatch[1]);state.audit(session.email,'SESSION_API_KEY_REVOKE',sessionKeyMatch[1],result.revoked?'widerrufen':'nicht gefunden');return json(res,result.revoked?200:404,result);}
  if(req.method==='POST'&&url.pathname==='/api/login'){
    const input=await body(req); const auth=entraConfig(env); let persona;
    if(auth.passwordEnabled){
      const key=loginKey(req);
      if(loginBlocked(key))return json(res,429,{error:'Anmeldung vorübergehend gesperrt. Bitte später erneut versuchen.'});
      if(!req.headers.origin){recordLoginFailure(key);return json(res,403,{error:'Anmeldung nicht möglich'});}
      if(!verifyAccountCredentials(input,env)){
        recordLoginFailure(key);state.audit('anonymous','PASSWORD_LOGIN_FAILED','agentone-personal','Ungültige Anmeldedaten');
        return json(res,403,{error:'Benutzername oder Passwort ist falsch'});
      }
      failedLogins.delete(key);persona=state.personas.find(p=>p.id==='marcus');
    }else persona=state.personas.find(p=>p.id===input.personaId);
    if(!persona||!/@purelink\.(de|com)$/i.test(persona.email)) return json(res,403,{error:'Konto ist nicht für diese Demo zugelassen'});
    state.db.prepare(`INSERT INTO provisioning(persona_id,status,updated_at) VALUES(?,?,?) ON CONFLICT(persona_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`).run(persona.id,'ACTIVE',new Date().toISOString());
    const token=createSession(state,persona,persona.role);
    state.audit(persona.email,'PROVISION','personal-gateway',`Dedizierte Demo-Instanz für ${persona.id} idempotent bereitgestellt`);
    return json(res,200,{ok:true,user:persona.name,persona,steps:['PureLink-Konto verifiziert','Persönliches Gateway geplant','Volume und Quellenbereich angelegt','Kanäle vorbereitet','AgentOne Personal gestartet']},{'set-cookie':cookie('a1_session',token,{secure:env.COOKIE_SECURE==='true'})});
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/logout'){
    const token=parseCookies(req.headers.cookie).a1_session;if(token)state.db.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(tokenHash(token));
    return json(res,200,{ok:true},{'set-cookie':cookie('a1_session','',{maxAge:0,secure:env.COOKIE_SECURE==='true'})});
  }
  if(req.method==='GET'&&url.pathname==='/api/platform/snapshot'){
    requireSession(state,req);
    return json(res,200,platformSnapshot());
  }
  if(req.method==='GET'&&url.pathname==='/api/platform/events'){
    const session=requireSession(state,req);
    const worldIds=url.searchParams.get('worlds')?.split(',').filter(Boolean);
    const since=Number(url.searchParams.get('since')||req.headers['last-event-id']||0);
    if(!Number.isInteger(since)||since<0)return json(res,400,{error:'Ungültiger Event-Cursor'});
    res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','connection':'keep-alive','x-accel-buffering':'no'});
    res.write('retry: 5000\n\n');
    const subscription=liveEvents.subscribe({userId:session.userId,worldIds,since,onEvent:event=>res.write(formatSseMessage(event)),onHeartbeat:heartbeat=>res.write(formatSseMessage(heartbeat)),onError:()=>res.end()});
    req.on('close',()=>subscription.unsubscribe());
    return;
  }
  let platformMatch=url.pathname.match(/^\/api\/platform\/runs\/([^/]+)\/(start|pause|advance)$/);
  if(req.method==='POST'&&platformMatch){
    const session=requireSession(state,req);
    const [,runId,action]=platformMatch;
    let run;
    if(action==='start')run=platform.start(runId);
    else if(action==='pause')run=platform.pause(runId,session.email);
    else{
      const input=await body(req);
      const current=platform.getRun(runId);const step=current.steps[current.currentStep];
      if(!step) return json(res,409,{error:'Kein auszuführender Schritt vorhanden'});
      if(step.risk!=='READ')return json(res,403,{error:'Schreibende und deployende Schritte benötigen einen Worker mit gültigem Human Gate'});
      run=platform.executeCurrentStep(runId,{payload:input.payload||{},output:input.output||{simulated:true},cost:Math.min(Math.max(Number(input.cost)||0,0),5),actor:session.email});
    }
    state.audit(session.email,`RUN_${action.toUpperCase()}`,runId,`${run.status} · Schritt ${run.currentStep}`);
    publishRun(session,run,`RUN_${action.toUpperCase()}`,{status:run.status,currentStep:run.currentStep});
    return json(res,200,{run});
  }
  platformMatch=url.pathname.match(/^\/api\/platform\/runs\/([^/]+)\/budget$/);
  if(req.method==='POST'&&platformMatch){
    const session=requireSession(state,req,{admin:true});const input=await body(req);
    const run=platform.increaseBudget(platformMatch[1],input.limit,session.email);
    state.audit(session.email,'RUN_BUDGET_INCREASE',run.id,`Budget auf ${run.budgetLimit} erhöht`);
    publishRun(session,run,'BUDGET_INCREASED',{budgetLimit:run.budgetLimit});
    return json(res,200,{run});
  }
  platformMatch=url.pathname.match(/^\/api\/platform\/runs\/([^/]+)\/gates$/);
  if(req.method==='POST'&&platformMatch){
    const session=requireSession(state,req);const input=await body(req);
    const gate=platform.requestGate(platformMatch[1],input.payload||{},session.email);const run=platform.getRun(platformMatch[1]);
    state.audit(session.email,'GATE_REQUEST',gate.id,`Run ${run.id} · Payload ${gate.payloadHash}`);
    publishRun(session,run,'GATE_REQUESTED',{gateId:gate.id,status:gate.status});
    return json(res,200,{gate,run});
  }
  platformMatch=url.pathname.match(/^\/api\/platform\/gates\/([^/]+)\/decision$/);
  if(req.method==='POST'&&platformMatch){
    const session=requireSession(state,req,{admin:true});const input=await body(req);
    const gate=platform.decideGate(platformMatch[1],{decision:input.decision,actor:session.email});const run=platform.getRun(gate.runId);
    state.audit(session.email,`GATE_${gate.status}`,gate.id,`Run ${run.id} · Hash ${gate.payloadHash}`);
    publishRun(session,run,`GATE_${gate.status}`,{gateId:gate.id,status:gate.status});
    return json(res,200,{gate,run});
  }
  let match=url.pathname.match(/^\/api\/integrations\/([^/]+)\/mode$/);
  if(req.method==='POST'&&match){
    requireSession(state,req,{admin:true});
    const input=await body(req); if(!allowedModes.has(input.mode)) return json(res,400,{error:'Ungültiger Modus'});
    const integration=state.setIntegration(match[1],{mode:input.mode,status:input.mode==='disabled'?'DISABLED':'SIMULATED',latency:null,checkedAt:new Date().toISOString()});
    if(!integration)return json(res,404,{error:'Integration nicht gefunden'});
    state.audit('demo-admin','INTEGRATION_MODE',match[1],`Modus auf ${input.mode} gesetzt`);
    return json(res,200,{integration:publicIntegration(integration)});
  }
  match=url.pathname.match(/^\/api\/integrations\/([^/]+)\/health$/);
  if(req.method==='POST'&&match){
    requireSession(state,req);
    const existing=state.catalog().find(item=>item.id===match[1]); if(!existing)return json(res,404,{error:'Integration nicht gefunden'});
    const result=await checkAdapter(existing.id,existing.mode,env);
    const integration=state.setIntegration(existing.id,{status:result.status,latency:result.latency,checkedAt:new Date().toISOString()});
    state.audit('demo-admin','HEALTH_CHECK',existing.id,`${result.status}; ${result.note}`);
    return json(res,200,{integration:{...publicIntegration(integration),note:result.note},sample:result.sample});
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/action'){
    const session=requireSession(state,req,{admin:true});
    const input=await body(req); const allowed=new Set(['restart','suspend','rebuild','quarantine','restore']);
    if(!allowed.has(input.action))return json(res,400,{error:'Aktion im Demomodus nicht erlaubt'});
    const statuses={restart:'ACTIVE',suspend:'SUSPENDED',rebuild:'ACTIVE',quarantine:'QUARANTINED',restore:'ACTIVE'};
    const quarantineUntil=input.action==='quarantine'?new Date(Date.now()+30*24*60*60*1000).toISOString():null;
    const instance=state.setInstance(String(input.instanceId),statuses[input.action],{quarantineUntil,incrementGeneration:input.action==='rebuild'});
    const audit=state.audit(session.email,input.action.toUpperCase(),String(input.instanceId||'unknown'),`Simulierte Adminaktion; neuer Status ${statuses[input.action]}`);
    return json(res,200,{ok:true,status:statuses[input.action],instance,audit});
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/session-access'){
    const session=requireSession(state,req,{admin:true});
    const input=await body(req); if(!state.sessions.some(s=>s.id===input.sessionId))return json(res,404,{error:'Session nicht gefunden'});
    const audit=state.audit(session.email,'SESSION_CONTENT_VIEW',input.sessionId,'Vollständige Sessionansicht im Demomodus geöffnet');
    return json(res,200,{audit});
  }
  if(req.method==='GET'&&url.pathname==='/api/admin/secrets'){
    const session=requireSession(state,req,{admin:true});
    state.audit(session.email,'SECRET_INVENTORY_VIEW','secret-registry','Secret-Metadaten ohne Werte geöffnet');
    return json(res,200,{secrets:secretInventory(env),policy:{valuesExposed:false,browserAccess:false,productionWrites:false}});
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/secrets/demo'){
    const session=requireSession(state,req,{admin:true}); const input=await body(req);
    if(!/^DEMO_[A-Z0-9_]{3,50}$/.test(String(input.name||''))||typeof input.value!=='string'||input.value.length<8)return json(res,400,{error:'Nur DEMO_* Namen und Werte ab 8 Zeichen sind erlaubt'});
    const record=encryptDemoSecret(input.value,env);state.db.prepare(`INSERT INTO secret_vault(name,ciphertext,iv,tag,algorithm,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,tag=excluded.tag,algorithm=excluded.algorithm,updated_at=excluded.updated_at`).run(input.name,record.ciphertext,record.iv,record.tag,record.algorithm,new Date().toISOString());
    const audit=state.audit(session.email,'DEMO_SECRET_UPSERT',input.name,'Verschlüsseltes Demo-Secret gespeichert; Wert nicht protokolliert');
    return json(res,200,{ok:true,name:input.name,algorithm:record.algorithm,audit});
  }
  if(req.method==='GET'&&url.pathname==='/api/events'){
    const session=requireSession(state,req);return json(res,200,{events:state.listEvents(session.userId)});
  }
  if(req.method==='POST'&&url.pathname==='/api/personal/chat'){
    const session=requireSession(state,req);const input=await body(req);const prompt=String(input.prompt||'').trim();
    if(!prompt||prompt.length>2000)return json(res,400,{error:'Nachricht muss zwischen 1 und 2000 Zeichen lang sein'});
    const result=await personalReply({prompt,apiKey:env.OPENAI_API_KEY||env.CrewAI_OpenAI_API_Key||env.STICKER_OPENAI_API_KEY,primaryModel:env.AGENTONE_PERSONAL_MODEL,fallbackModel:env.AGENTONE_PERSONAL_FALLBACK_MODEL});
    state.audit(session.email,'PERSONAL_CHAT','agentone-personal',`${result.mode} · ${result.model}`);
    return json(res,200,result);
  }
  return json(res,404,{error:'API-Endpunkt nicht gefunden'});
}

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/',`http://${host}:${port}`);
    if(url.pathname!=='/api/health'&&!verifyBasicAuth(req,env)){res.writeHead(401,{'www-authenticate':'Basic realm="AgentOne Personal", charset="UTF-8"','cache-control':'no-store','content-type':'text/plain; charset=utf-8'});return res.end('Anmeldung erforderlich');}
    if(url.pathname.startsWith('/api/'))return await api(req,res,url);
    if(url.pathname==='/'&&!url.search&&env.AGENTONE_DEFAULT_PAGE){res.writeHead(302,{location:`/?page=${encodeURIComponent(env.AGENTONE_DEFAULT_PAGE)}`,'cache-control':'no-store'});return res.end();}
    let file=path.join(dist,url.pathname==='/'?'index.html':url.pathname);
    if(!path.resolve(file).startsWith(path.resolve(dist)))return json(res,403,{error:'Pfad nicht erlaubt'});
    if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html');
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':path.extname(file)==='.html'?'no-store':'public, max-age=3600','x-content-type-options':'nosniff'});
    fs.createReadStream(file).pipe(res);
  }catch(error){json(res,Number(error.status)||500,{error:String(error.message||error).slice(0,180)});}
});
server.listen(port,host,()=>console.log(`AgentOne Hybrid Demo: http://${host}:${port}`));
