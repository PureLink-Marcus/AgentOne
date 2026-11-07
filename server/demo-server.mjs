import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { mailConnectionOptions,mailErrorCode,normalizeMailPassword,publicMailError,publicMailFailure } from './mail-credentials.mjs';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { createState, loadEnv } from './state.mjs';
import { allowedModes, checkAdapter } from './adapters.mjs';
import { assertLocalOrigin, completeEntraAuthorization, cookie, createEntraAuthorization, createSession, entraConfig, getSession, parseCookies, requireSession, tokenHash, verifyAccountCredentials, verifyBasicAuth } from './security.mjs';
import { decryptDemoSecret, encryptDemoSecret, secretInventory } from './secrets.mjs';
import { getPersonalMailAccount, getPersonalService, initPostgres, listPersonalConnectors, listPersonalMailAccounts, listPersonalServices, postgresHealth, savePersonalConnector, savePersonalMailAccount, savePersonalService, updatePersonalMailSettings, updatePersonalMailTest, updatePersonalServiceTest } from './postgres.mjs';
import { personalReply } from './personal-ai.mjs';
import { createPlatformEngine } from './platform-engine.mjs';
import { createLiveEventBus, formatSseMessage } from './live-events.mjs';
import { classifyMail, emptyMailGroups } from './mail-classifier.mjs';
import { groupMailMessages,normalizeMailMessage } from './mail-calendar-sync.mjs';
import { approveMailRule, approveReplyDraft, buildMailBriefing, createMailRule, createReplyDraft } from './mail-workflow.mjs';
import { normalizePersonalService, personalServiceCatalog, testPersonalService } from './personal-services.mjs';
import { authorizeCompanion, companionStatus, createCompanionPairing, initCompanionStore, redeemCompanionPairing, revokeCompanion, storeCompanionEvent } from './personal-companion.mjs';
import { connectorAction, governanceSnapshot, initGovernanceStore, recordAudit } from './personal-governance.mjs';
import { applyNudgeFeedback, buildPersonalNudges, filterPersonalNudges, initNudgeStore, loadNudgeFeedbackProfile, loadNudgeSettings, quietNow, recordNudgeFeedback, resetNudgeFeedback, saveNudgeSettings } from './personal-nudges.mjs';
import { forgetMemoryEntry, initPersonalMemoryStore, listMemoryEntries, saveMemoryEntry } from './personal-memory.mjs';
import { createRoutine, deleteRoutine, dueRoutines, initRoutineStore, listRoutines, recordRoutineRun, setRoutineState, simulateStoredRoutine } from './personal-routines.mjs';
import { buildPersonalBrief } from './personal-intelligence.mjs';
import { buildHealthDigest, createHealthConsent, healthConnectorCapabilities, importAppleHealth } from './personal-health.mjs';
import { deleteHealthData, exportHealthData, getHealthConsent, healthStoreAuditSummary, initPersonalHealthStore, listHealthConsents, queryHealthMetrics, revokeHealthConsent, saveHealthConsent, storeHealthImport } from './personal-health-store.mjs';
import { GoogleSyncError, syncGoogleReadOnly } from './google-live-sync.mjs';
import { initPersonalPulseStore, listPersonalPulseDeliveries, planPersonalPulse, recordPersonalPulseDelivery, resetPersonalPulseDeliveries } from './personal-pulse.mjs';
import { appendPersonalEvents, applyPersonalEventRetention, deletePersonalEvents, exportPersonalEvents, initPersonalEventLedger, personalEventLedgerAuditSummary, queryPersonalEvents } from './personal-event-ledger.mjs';
import { appendCommandStep, commandTimeline, completeCommandRun, createCommandRun, initPersonalCommandStream, recordCommandError, recordCommandResult } from './personal-command-stream.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env=loadEnv(root);
const state=createState(root,env);
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
initRoutineStore(state.db);
initPersonalHealthStore(state.db);
initPersonalPulseStore(state.db);
initPersonalEventLedger(state.db);
initPersonalCommandStream(state.db);
const companionPepper=env.AGENTONE_SECRET_KEY||env.AGENTONE_INTERNAL_API_TOKEN||'agentone-local-companion';
const healthMasterKey=env.AGENTONE_HEALTH_MASTER_KEY||env.AGENTONE_DEMO_MASTER_KEY||'';
const healthCryptoReady=Boolean(healthMasterKey);
const healthCryptoEnv=healthCryptoReady?Object.freeze({AGENTONE_DEMO_MASTER_KEY:healthMasterKey}):Object.freeze({});
const healthEncrypt=value=>{if(!healthCryptoReady)throw Object.assign(new Error('Health-Verschlüsselung ist noch nicht konfiguriert'),{code:'HEALTH_ENCRYPTION_NOT_CONFIGURED',status:503});return encryptDemoSecret(value,healthCryptoEnv);};
const healthDecrypt=envelope=>{if(!healthCryptoReady)throw Object.assign(new Error('Health-Verschlüsselung ist noch nicht konfiguriert'),{code:'HEALTH_ENCRYPTION_NOT_CONFIGURED',status:503});return decryptDemoSecret(envelope,healthCryptoEnv);};
let routineRunnerBusy=false;async function runPersonalRoutines(){if(routineRunnerBusy)return;routineRunnerBusy=true;try{for(const routine of dueRoutines(state.db)){const startedAt=new Date().toISOString(),result={schema:'agentone.personal-routine-result/v1',action:routine.action,mode:'READ_ONLY',generatedAt:new Date().toISOString(),mutations:[]};recordRoutineRun(state.db,{id:crypto.randomUUID(),routine,result,startedAt});recordAudit(state.db,{userId:routine.userId,connectorId:'routines',action:'routine.'+routine.action,outcome:'OK',detail:JSON.stringify({routineId:routine.id,mode:'READ_ONLY'})});}}finally{routineRunnerBusy=false;}}setInterval(()=>void runPersonalRoutines(),30_000).unref();

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
async function testMailAccount(account,password,{scan=false}={}){
  const started=Date.now(),options=mailConnectionOptions(account,password),imap=new ImapFlow(options.imap);
  const result={testedAt:new Date().toISOString(),imap:{ok:false},smtp:{ok:false,optional:true},latencyMs:null,mode:'READ_ONLY'};
  try{await imap.connect();const boxes=await imap.list();result.imap={ok:true,mailboxes:boxes.length,specialUse:boxes.filter(box=>box.specialUse).map(box=>box.specialUse)};if(scan){const lock=await imap.getMailboxLock('INBOX');try{const exists=imap.mailbox.exists||0,from=Math.max(1,exists-49),messages=[];if(exists)for await(const message of imap.fetch(`${from}:*`,{envelope:true,internalDate:true,flags:true,size:true,source:{start:0,maxLength:65_536}})){let parsed=null;try{parsed=message.source?await simpleParser(message.source,{skipHtmlToText:true,skipTextToHtml:true,maxHtmlLengthToParse:0}):null;}catch{}const sender=parsed?.from?.value?.[0]?.address||message.envelope?.from?.[0]?.address||'',subject=String(parsed?.subject||message.envelope?.subject||'(ohne Betreff)').slice(0,180),normalized=normalizeMailMessage({provider:'imap',accountId:account.id,input:{id:message.uid,uid:message.uid,sender,subject,headers:parsed?.headers,receivedAt:message.internalDate,snippet:parsed?.text,labels:[...(message.flags||[])]}});messages.push({...normalized,uid:message.uid,date:normalized.receivedAt,size:message.size,signals:normalized.classificationSignals});}const groups=groupMailMessages(messages);result.scan={schema:'agentone.mail.scan/v2',readOnly:true,mutationsApplied:false,total:messages.length,groups,sync:{strategy:'imap-uid',uidValidity:String(imap.mailbox.uidValidity||''),lastUid:messages.at(-1)?.uid||null,window:50}};}finally{lock.release();}}}catch(error){error.mailStage='imap';throw error;}finally{await imap.logout().catch(()=>{});}
  try{const transport=nodemailer.createTransport(options.smtp);await transport.verify();result.smtp={ok:true,optional:true,sendTestPerformed:false};}catch(error){result.smtp={ok:false,optional:true,sendTestPerformed:false,code:mailErrorCode(error),error:publicMailError(error,account.provider)};}
  result.latencyMs=Date.now()-started;return result;
}

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
    const secret=encryptDemoSecret(rotatedRefreshToken||durableRefreshToken,env),saved=await savePersonalService(postgres,{userId,service,secret,lastTest,status:partial?'DEGRADED':'CONNECTED'}),summary=googleSyncSummary(lastTest);
    recordAudit(state.db,{userId,connectorId:'google',action:'google.sync',outcome:partial?'DEGRADED':'OK',detail:JSON.stringify({state:stateValue,messages:summary.gmail.messages,events:summary.calendar.events,selectedCalendars:summary.calendar.selected,failures:summary.failures.map(item=>({component:item.component,code:item.code})),secretsExposed:false})});
    return {service:saved,summary};
  }catch(error){
    const failure=publicGoogleFailure(error),testedAt=new Date().toISOString();
    const failedLastTest={...(existing?.lastTest||{}),ok:false,lastAttempt:{testedAt,ok:false,error:failure}},failedService={id:'google',label:existing?.label||'Google Mail und Kalender',endpoint:existing?.endpoint||'https://www.googleapis.com',username:existing?.username||'',capabilities:existing?.capabilities||['gmail.readonly','calendar.readonly'],settings:{...(existing?.settings||{}),readOnly:true,oauth:true,scopes:String(scope||'').split(/\s+/).filter(Boolean).length?String(scope).split(/\s+/).filter(Boolean):existing?.settings?.scopes||[]}};
    try{await savePersonalService(postgres,{userId,service:failedService,secret:encryptDemoSecret(rotatedRefreshToken||durableRefreshToken,env),lastTest:failedLastTest,status:'DEGRADED'});}catch{if(existing)await updatePersonalServiceTest(postgres,userId,'google',failedLastTest,'DEGRADED');}
    recordAudit(state.db,{userId,connectorId:'google',action:'google.sync',outcome:'ERROR',detail:JSON.stringify({code:failure.code,retryable:failure.retryable,secretsExposed:false})});
    throw Object.assign(new Error(failure.message),{status:failure.code==='AUTHORIZATION_REQUIRED'?401:failure.retryable?503:error?.status||422,googleFailure:failure});
  }
}

function personalSourceEvents({userId,mailAccounts=[],companion={},google=null}){
  const events=[];
  for(const account of mailAccounts){
    const groups=account.lastTest?.scan?.groups||{};
    for(const [category,items] of Object.entries(groups))for(const item of Array.isArray(items)?items:[]){
      const occurredAt=item.receivedAt||item.date;
      if(!occurredAt)continue;
      const labels=Array.isArray(item.labels)?item.labels.map(value=>String(value).toLowerCase()):[];
      const tags=[category,category==='people'?'person':null,category==='people'&&!labels.some(value=>value.includes('seen'))?'needs-reply':null,/\b(?:dringend|urgent|asap|sofort)\b/i.test(String(item.subject||''))?'urgent':null].filter(Boolean);
      events.push({userId,source:`mail.${account.provider||'imap'}`,kind:'mail.message',externalId:item.idempotencyKey||String(item.uid||item.providerId||''),occurredAt,title:item.subject||'',tags,provenance:{connectorId:account.id,importedAt:account.lastTest?.testedAt||occurredAt,rawRecordHash:item.idempotencyKey||null}});
    }
  }
  for(const item of google?.lastTest?.sync?.mail?.messages||[]){
    if(!item.receivedAt)continue;
    const labels=Array.isArray(item.labels)?item.labels.map(value=>String(value).toLowerCase()):[],category=String(item.category||'people');
    const tags=[category,category==='people'?'person':null,category==='people'&&labels.includes('unread')?'needs-reply':null,/\b(?:dringend|urgent|asap|sofort)\b/i.test(String(item.subject||''))?'urgent':null].filter(Boolean);
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
  const [mailAccounts,services]=await Promise.all([listPersonalMailAccounts(postgres,userId),listPersonalServices(postgres,userId)]),google=services.find(item=>item.id==='google'),companion=companionStatus(state.db,userId),events=personalSourceEvents({userId,mailAccounts,companion,google});
  let storedHealth=[];if(healthCryptoReady)try{storedHealth=queryHealthMetrics(state.db,{userId,limit:5_000,decrypt:healthDecrypt});}catch{}
  events.push(...storedHealth.map(item=>({userId,source:item.source,kind:'health.metric',externalId:item.id,occurredAt:item.startAt,metrics:{name:item.metric,value:item.value,unit:item.unit},sensitivity:'health',provenance:{connectorId:`health.${item.source}`,importedAt:item.provenance?.receivedAt||item.startAt,rawRecordHash:item.id,consentId:item.consentId}})));
  const ledgerWrite=appendPersonalEvents(state.db,{userId,events:ledgerInputEvents(events)});applyPersonalEventRetention(state.db,{userId,before:new Date(Date.now()-400*86_400_000)});const ledgerEvents=queryPersonalEvents(state.db,{userId,from:new Date(Date.now()-40*86_400_000),limit:5_000}),analysisEvents=intelligenceEventsFromLedger(ledgerEvents);
  const rawBrief=buildPersonalBrief({userId,events:analysisEvents,timeZone:'Europe/Berlin'}),feedbackProfile=loadNudgeFeedbackProfile(state.db,userId),signals=applyNudgeFeedback(rawBrief.signals,feedbackProfile),brief={...rawBrief,signals,summary:{attention:signals.filter(item=>item.severity==='attention').length,informational:signals.filter(item=>item.severity==='info').length}},googleSummary=googleSyncSummary(google?.lastTest||{}),googleMessages=googleSummary.gmail.messages,googleEvents=googleSummary.calendar.events;
  const mailMessages=mailAccounts.reduce((sum,account)=>sum+Number(account.lastTest?.scan?.total||0),0)+googleMessages,healthSummaries=(companion.events||[]).filter(item=>item.kind==='health').length,calendarSummaries=(companion.events||[]).filter(item=>item.kind==='calendar').length,calendarRecords=calendarSummaries+googleEvents,healthRecords=storedHealth.length+healthSummaries;
  const googleMailDegraded=google?.lastTest?.sync?.mail?.status==='DEGRADED',googleCalendarDegraded=google?.lastTest?.sync?.calendar?.status==='DEGRADED';
  const mailStatus=googleMailDegraded?'DEGRADED':mailMessages?'LIVE':google?.lastTest?.sync||mailAccounts.some(item=>item.status==='CONNECTED')?'CONNECTED':mailAccounts.length||google?'DEGRADED':'NOT_CONNECTED',calendarStatus=googleCalendarDegraded?'DEGRADED':calendarRecords?'LIVE':google?.lastTest?.sync?.calendar?'CONNECTED':google?'AUTHENTICATED':calendarSummaries?'LIVE':'NOT_CONNECTED';
  return {...brief,schema:'agentone.personal-intelligence/v1',sources:[{id:'mail',status:mailStatus,accounts:mailAccounts.length+(google?1:0),records:mailMessages},{id:'calendar',status:calendarStatus,calendars:googleSummary.calendar.calendars,selectedCalendars:googleSummary.calendar.selected,records:calendarRecords},{id:'health',status:healthRecords?'LIVE':healthCryptoReady?'READY':'PREPARED',records:healthRecords}],ledger:{...personalEventLedgerAuditSummary(state.db,userId),lastWrite:ledgerWrite,analysisWindowDays:40},capabilities:{health:healthConnectorCapabilities},feedback:{enabled:true,values:['helpful','not_helpful','wrong','later','never'],resetSupported:true},policy:{readOnly:true,medicalDiagnosis:false,externalWrites:false,secretsExposed:false},limitations:[google?.lastTest?.sync?'Google Mail und Kalender werden inkrementell und read-only synchronisiert.':'Google ist noch nicht per OAuth verbunden.',healthCryptoReady?'Apple Health XML/ZIP kann verschlüsselt und benutzergebunden importiert werden.':'Für Apple-Health-Import fehlt noch der Server-Master-Key.']};
}

const healthConsentScopes=new Set(['activity','sleep','vitals','body','workouts']);
function healthFailure(res,error){return json(res,error.status||400,{error:error.code||'HEALTH_REQUEST_FAILED',message:String(error.message||'Gesundheitsanfrage fehlgeschlagen').slice(0,180),secretsExposed:false,medicalDiagnosis:false});}

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
  if(url.pathname==='/api/internal/personal/mail/accounts'||url.pathname.startsWith('/api/internal/personal/mail/accounts/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/mail/accounts')return json(res,200,{accounts:await listPersonalMailAccounts(postgres,userId),plugin:{id:'imap',status:'LOADED',mode:'isolated-reader',smtpProvidedByPlugin:false}});
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/mail/accounts'){let input={};try{input=await body(req);const normalized=normalizeMailAccount(input),lastTest=await testMailAccount(normalized.account,normalized.password,{scan:true});const secret=encryptDemoSecret(normalized.password,env),account=await savePersonalMailAccount(postgres,{userId,account:normalized.account,secret,lastTest});mailAudit(userId,normalized.account.provider,'imap','CONNECTED');mailAudit(userId,normalized.account.provider,'smtp',lastTest.smtp.ok?'CONNECTED':'OPTIONAL_FAILED',lastTest.smtp.code);return json(res,201,{account,connection:lastTest});}catch(error){const provider=String(input.provider||'custom'),stage=error.mailStage||'validation',failure=error.status&&error.status<422?{stage,code:'INVALID_INPUT',error:String(error.message||error).slice(0,180)}:publicMailFailure(error,provider,stage);mailAudit(userId,provider,stage,'FAILED',failure.code);return json(res,error.status||422,failure);}}
    const preferences=url.pathname.match(/^\/api\/internal\/personal\/mail\/accounts\/([^/]+)\/preferences$/);if(req.method==='PUT'&&preferences){const stored=await getPersonalMailAccount(postgres,userId,decodeURIComponent(preferences[1]));if(!stored)return json(res,404,{error:'mail_account_not_found'});const input=await body(req),requested=Array.isArray(input.connectors)?input.connectors.map(String):[],connectors=[...new Set(requested.filter(value=>['mail','calendar'].includes(value)))];if(!connectors.includes('mail'))connectors.unshift('mail');const calendarIds=Array.isArray(input.calendarIds)?[...new Set(input.calendarIds.map(value=>String(value).trim()).filter(Boolean))].slice(0,50):stored.settings?.calendarIds||[];const settings={...(stored.settings||{}),connectors,calendarIds,calendarAuthorization:connectors.includes('calendar')?'REQUIRED':'OFF'};return json(res,200,{account:await updatePersonalMailSettings(postgres,userId,stored.id,settings),calendar:{enabled:connectors.includes('calendar'),selectedCalendarIds:calendarIds,status:connectors.includes('calendar')?'AUTHORIZATION_REQUIRED':'OFF',reason:connectors.includes('calendar')?'Google Kalender benötigt eine getrennte OAuth-Freigabe; das Gmail-App-Passwort wird nicht wiederverwendet.':null}});}
    const match=url.pathname.match(/^\/api\/internal\/personal\/mail\/accounts\/([^/]+)\/(test|scan)$/);if(req.method==='POST'&&match){const stored=await getPersonalMailAccount(postgres,userId,decodeURIComponent(match[1]));if(!stored)return json(res,404,{error:'mail_account_not_found'});try{const password=decryptDemoSecret(stored,env),account={...stored,imap:{host:stored.imapHost,port:stored.imapPort,secure:stored.imapSecure},smtp:{host:stored.smtpHost,port:stored.smtpPort,secure:stored.smtpSecure}},lastTest=await testMailAccount(account,password,{scan:match[2]==='scan'});await updatePersonalMailTest(postgres,userId,stored.id,lastTest,'CONNECTED');mailAudit(userId,stored.provider,'imap','CONNECTED');mailAudit(userId,stored.provider,'smtp',lastTest.smtp.ok?'CONNECTED':'OPTIONAL_FAILED',lastTest.smtp.code);return json(res,200,{account:{id:stored.id,status:'CONNECTED'},...lastTest});}catch(error){const failure={testedAt:new Date().toISOString(),imap:{ok:false},smtp:{ok:false,optional:true},...publicMailFailure(error,stored.provider,error.mailStage||'imap')};mailAudit(userId,stored.provider,failure.stage,'FAILED',failure.code);await updatePersonalMailTest(postgres,userId,stored.id,failure,'DEGRADED');return json(res,422,failure);}}
    return json(res,405,{error:'method_not_allowed'});
  }
  if(url.pathname==='/api/internal/personal/mail/workflows'||url.pathname.startsWith('/api/internal/personal/mail/workflows/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/mail/workflows'){const rows=state.db.prepare('SELECT id,kind,payload,state,hash,created_at as createdAt,updated_at as updatedAt FROM personal_mail_workflows WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').all(userId).map(row=>({...row,payload:JSON.parse(row.payload)}));return json(res,200,{workflows:rows});}
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/mail/workflows'){try{const input=await body(req),kind=String(input.kind||''),id=crypto.randomUUID(),now=new Date().toISOString();if(kind==='briefing'){const accounts=await listPersonalMailAccounts(postgres,userId),groups=emptyMailGroups();for(const account of accounts)for(const [category,items] of Object.entries(account.lastTest?.scan?.groups||{}))if(groups[category])groups[category].push(...items);return json(res,200,{briefing:buildMailBriefing(groups)});}const payload=kind==='rule'?createMailRule(input):kind==='draft'?createReplyDraft(input):null;if(!payload)return json(res,400,{error:'invalid_mail_workflow'});state.db.prepare('INSERT INTO personal_mail_workflows(id,user_id,kind,payload,state,hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,userId,kind,JSON.stringify(payload),payload.state,payload.hash,now,now);return json(res,201,{workflow:{id,kind,payload,state:payload.state,hash:payload.hash,createdAt:now}});}catch(error){return json(res,400,{error:String(error.message||error).slice(0,180)});}}
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
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});try{const input=await body(req),selectedCalendarIds=Object.hasOwn(input,'selectedCalendarIds')?input.selectedCalendarIds:null;if(selectedCalendarIds!==null&&!Array.isArray(selectedCalendarIds))return json(res,400,{error:'GOOGLE_CALENDAR_SELECTION_INVALID',message:'Kalenderauswahl muss eine Liste sein.',secretsExposed:false});const result=await syncStoredGoogleAccount({userId,selectedCalendarIds,initial:false});return json(res,200,{sync:result.summary});}catch(error){const failure=error.googleFailure||publicGoogleFailure(error);return json(res,error.status||422,{error:failure.code,message:failure.message,retryable:Boolean(failure.retryable),retryAfterSeconds:failure.retryAfterSeconds??null,secretsExposed:false});}
  }
  if(url.pathname==='/api/internal/personal/companion'||url.pathname.startsWith('/api/internal/personal/companion/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    try{
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/companion')return json(res,200,companionStatus(state.db,userId));
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/companion/pair')return json(res,201,{pairing:createCompanionPairing(state.db,{userId,pepper:companionPepper})});
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/companion/redeem'){const input=await body(req);return json(res,201,{device:redeemCompanionPairing(state.db,{userId,code:input.code,deviceName:input.deviceName,pepper:companionPepper})});}
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/companion/ingest'){const token=String(req.headers['x-agentone-device-token']||''),device=authorizeCompanion(state.db,{userId,deviceToken:token,pepper:companionPepper}),input=await body(req),scope={health:'health.summary',location:'location.temporary',calendar:'calendar.read',reminders:'reminders.read'}[input.kind];if(!scope||!device.scopes.includes(scope))return json(res,403,{error:'scope_not_granted'});return json(res,201,{event:storeCompanionEvent(state.db,{userId,deviceId:device.id,kind:input.kind,input:input.data})});}
      const deviceMatch=url.pathname.match(/^\/api\/internal\/personal\/companion\/devices\/([^/]+)$/);if(req.method==='DELETE'&&deviceMatch)return json(res,200,revokeCompanion(state.db,{userId,deviceId:decodeURIComponent(deviceMatch[1])}));
      return json(res,405,{error:'method_not_allowed'});
    }catch(error){return json(res,error.status||400,{error:String(error.message||error).slice(0,180)});}
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
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/pulse/delivery'){const input=await body(req),delivery=recordPersonalPulseDelivery(state.db,{userId,signalId:input.signalId,notificationKey:input.notificationKey,channel:input.channel||'in-app',externalOptIn,timeZone:'Europe/Berlin'});return json(res,delivery.delivered?201:200,{delivery});}
      if(req.method==='DELETE'&&url.pathname==='/api/internal/personal/pulse'){const input=await body(req);return json(res,200,{reset:resetPersonalPulseDeliveries(state.db,{userId,confirmation:input.confirmation})});}
      return json(res,405,{error:'method_not_allowed'});
    }catch(error){return json(res,error.status||400,{error:error.code||'PERSONAL_PULSE_FAILED',message:String(error.message||error).slice(0,160),secretsExposed:false});}
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
  if(url.pathname==='/api/internal/personal/commands/briefing'&&req.method==='POST'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    const run=createCommandRun(state.db,{userId,label:'Persönliches Tagesbild',mode:'controlled',source:'chat'});appendCommandStep(state.db,{userId,runId:run.id,type:'OBSERVE',summary:'Mail, Kalender und Health als minimierte Ereignisse laden'});const tool=appendCommandStep(state.db,{userId,runId:run.id,type:'TOOL',summary:'Persönliche Signale deterministisch auswerten',toolId:'personal.intelligence',operation:'build-briefing',access:'read',scopes:['mail.read','calendar.read','health.summary'],idempotent:true,input:{timeZone:'Europe/Berlin'}});
    try{const intelligence=await personalIntelligenceSnapshot(userId);recordCommandResult(state.db,{userId,runId:run.id,toolStepId:tool.id,summary:'Tagesbild aus persönlichen Quellen erstellt',output:{events:intelligence.eventCount,signals:intelligence.signals.length,attention:intelligence.summary.attention,ledgerEvents:intelligence.ledger?.total||0,sources:intelligence.sources.map(source=>({id:source.id,status:source.status,records:source.records||0}))}});completeCommandRun(state.db,{userId,runId:run.id});return json(res,200,{schema:'agentone.personal-briefing-run/v1',intelligence,commandStream:commandTimeline(state.db,{userId,runId:run.id}),secretsExposed:false});}catch(error){recordCommandError(state.db,{userId,runId:run.id,toolStepId:tool.id,code:'PERSONAL_BRIEFING_FAILED',message:'Persönliches Tagesbild konnte nicht erstellt werden',retryable:true});return json(res,500,{error:'personal_briefing_failed',commandStream:commandTimeline(state.db,{userId,runId:run.id}),detail:String(error.message||error).slice(0,120),secretsExposed:false});}
  }
  if(url.pathname==='/api/internal/personal/memory'||url.pathname.startsWith('/api/internal/personal/memory/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/memory')return json(res,200,{entries:listMemoryEntries(state.db,{userId,query:url.searchParams.get('q')||'',area:url.searchParams.get('area')||''}),policy:{provenanceRequired:true,expirySupported:true,forgetSupported:true,secretsExposed:false}});
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/memory')try{return json(res,201,{entry:saveMemoryEntry(state.db,{id:crypto.randomUUID(),userId,input:await body(req)})});}catch(error){return json(res,error.status||400,{error:String(error.message||error)});}
    const match=url.pathname.match(/^\/api\/internal\/personal\/memory\/([^/]+)$/);if(req.method==='DELETE'&&match)try{return json(res,200,forgetMemoryEntry(state.db,{userId,id:decodeURIComponent(match[1])}));}catch(error){return json(res,error.status||400,{error:String(error.message||error)});}
    return json(res,405,{error:'method_not_allowed'});
  }
  if(url.pathname==='/api/internal/personal/routines'||url.pathname.startsWith('/api/internal/personal/routines/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/routines')return json(res,200,{routines:listRoutines(state.db,userId),policy:{simulationRequired:true,readOnlyActions:true,timezone:'Europe/Berlin'}});
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/routines')try{return json(res,201,{routine:createRoutine(state.db,{id:crypto.randomUUID(),userId,input:await body(req)})});}catch(error){return json(res,error.status||400,{error:String(error.message||error)});}
    const simulation=url.pathname.match(/^\/api\/internal\/personal\/routines\/([^/]+)\/simulate$/);if(req.method==='POST'&&simulation)try{return json(res,200,{simulation:simulateStoredRoutine(state.db,{userId,id:decodeURIComponent(simulation[1])})});}catch(error){return json(res,error.status||400,{error:String(error.message||error)});}
    const stateMatch=url.pathname.match(/^\/api\/internal\/personal\/routines\/([^/]+)\/state$/);if(req.method==='PUT'&&stateMatch)try{const input=await body(req);return json(res,200,{routine:setRoutineState(state.db,{userId,id:decodeURIComponent(stateMatch[1]),state:String(input.state||''),simulationHash:String(input.simulationHash||'')})});}catch(error){return json(res,error.status||400,{error:String(error.message||error)});}
    const routineMatch=url.pathname.match(/^\/api\/internal\/personal\/routines\/([^/]+)$/);if(req.method==='DELETE'&&routineMatch)try{return json(res,200,deleteRoutine(state.db,{userId,id:decodeURIComponent(routineMatch[1])}));}catch(error){return json(res,error.status||400,{error:String(error.message||error)});}
    return json(res,405,{error:'method_not_allowed'});
  }
  if(url.pathname==='/api/internal/personal/health'||url.pathname.startsWith('/api/internal/personal/health/')){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    try{
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/health')return json(res,200,{schema:'agentone.health-status/v1',encryptionReady:healthCryptoReady,consents:healthCryptoReady?listHealthConsents(state.db,{userId,decrypt:healthDecrypt}):[],store:healthStoreAuditSummary(state.db,userId),capabilities:healthConnectorCapabilities,policy:{userIsolated:true,encryptedAtRest:true,medicalDiagnosis:false,secretsExposed:false}});
      if(!healthCryptoReady)return json(res,503,{error:'HEALTH_ENCRYPTION_NOT_CONFIGURED',message:'Health-Verschlüsselung ist noch nicht konfiguriert',secretsExposed:false,medicalDiagnosis:false});
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/health/consents')return json(res,200,{consents:listHealthConsents(state.db,{userId,decrypt:healthDecrypt}),secretsExposed:false});
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/health/consents'){
        const input=await body(req),scopes=[...new Set((Array.isArray(input.scopes)?input.scopes:[]).map(String).filter(value=>healthConsentScopes.has(value)))];
        if(!scopes.length)return json(res,400,{error:'HEALTH_CONSENT_SCOPES_REQUIRED',allowedScopes:[...healthConsentScopes]});
        const consent=createHealthConsent({userId,providers:['apple_health'],scopes,purpose:'Persönliche deskriptive Trend- und Planungsanalyse',expiresAt:input.expiresAt});
        return json(res,201,{consent:saveHealthConsent(state.db,{userId,consent,encrypt:healthEncrypt}),scopes,provider:'apple_health',secretsExposed:false});
      }
      const consentMatch=url.pathname.match(/^\/api\/internal\/personal\/health\/consents\/([^/]+)$/);
      if(req.method==='DELETE'&&consentMatch)return json(res,200,{consent:revokeHealthConsent(state.db,{userId,consentId:decodeURIComponent(consentMatch[1])}),dataRetainedUntilExplicitDeletion:true});
      if(req.method==='POST'&&url.pathname==='/api/internal/personal/health/apple-import'){
        const contentType=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
        if(!['application/xml','text/xml','application/zip','application/x-zip-compressed','application/octet-stream'].includes(contentType))return json(res,415,{error:'HEALTH_UPLOAD_TYPE_UNSUPPORTED'});
        const consentId=String(req.headers['x-agentone-health-consent-id']||'').trim();if(!consentId)return json(res,400,{error:'HEALTH_CONSENT_REQUIRED'});
        const consent=getHealthConsent(state.db,{userId,consentId,decrypt:healthDecrypt});
        if(consent.status!=='ACTIVE')return json(res,403,{error:'HEALTH_CONSENT_REQUIRED'});
        const data=await bodyBuffer(req),sourceHash=crypto.createHash('sha256').update(data).digest('hex'),parsed=importAppleHealth(data,{consent,maxBytes:32*1024*1024}),stored=storeHealthImport(state.db,{userId,provider:'apple_health',consentId,sourceHash,metrics:parsed.metrics,duplicateCount:parsed.duplicatesRemoved,metadata:{schema:'agentone.apple-health-import/v1',recordsSeen:parsed.recordsSeen,ignoredRecords:parsed.ignoredRecords,excludedByConsent:parsed.excludedByConsent,importedAt:parsed.importedAt},encrypt:healthEncrypt});
        const metrics=queryHealthMetrics(state.db,{userId,source:'apple_health',limit:5_000,decrypt:healthDecrypt}),digest=buildHealthDigest(metrics);
        return json(res,stored.alreadyImported?200:201,{schema:'agentone.apple-health-import-result/v1',import:{...stored,recordsSeen:parsed.recordsSeen,normalizedMetrics:parsed.metrics.length,duplicatesRemoved:parsed.duplicatesRemoved,ignoredRecords:parsed.ignoredRecords,excludedByConsent:parsed.excludedByConsent},digest,policy:{encryptedAtRest:true,sourceArchiveRetained:false,medicalDiagnosis:false,secretsExposed:false}});
      }
      if(req.method==='GET'&&url.pathname==='/api/internal/personal/health/digest'){
        const metrics=queryHealthMetrics(state.db,{userId,source:url.searchParams.get('source')||undefined,from:url.searchParams.get('from')||undefined,to:url.searchParams.get('to')||undefined,limit:5_000,decrypt:healthDecrypt});
        return json(res,200,{schema:'agentone.health-digest/v1',metricCount:metrics.length,digest:buildHealthDigest(metrics),policy:{medicalDiagnosis:false,secretsExposed:false}});
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
