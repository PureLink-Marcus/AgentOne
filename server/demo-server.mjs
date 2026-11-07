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
import { approveMailRule, approveReplyDraft, buildMailBriefing, createMailRule, createReplyDraft } from './mail-workflow.mjs';
import { normalizePersonalService, personalServiceCatalog, testPersonalService } from './personal-services.mjs';
import { authorizeCompanion, companionStatus, createCompanionPairing, initCompanionStore, redeemCompanionPairing, revokeCompanion, storeCompanionEvent } from './personal-companion.mjs';
import { connectorAction, governanceSnapshot, initGovernanceStore, recordAudit } from './personal-governance.mjs';
import { buildPersonalNudges, dismissedNudgeIds, filterPersonalNudges, initNudgeStore, loadNudgeSettings, quietNow, recordNudgeFeedback, saveNudgeSettings } from './personal-nudges.mjs';
import { forgetMemoryEntry, initPersonalMemoryStore, listMemoryEntries, saveMemoryEntry } from './personal-memory.mjs';
import { createRoutine, deleteRoutine, dueRoutines, initRoutineStore, listRoutines, recordRoutineRun, setRoutineState, simulateStoredRoutine } from './personal-routines.mjs';

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
const companionPepper=env.AGENTONE_SECRET_KEY||env.AGENTONE_INTERNAL_API_TOKEN||'agentone-local-companion';
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
  try{await imap.connect();const boxes=await imap.list();result.imap={ok:true,mailboxes:boxes.length,specialUse:boxes.filter(box=>box.specialUse).map(box=>box.specialUse)};if(scan){const lock=await imap.getMailboxLock('INBOX');try{const exists=imap.mailbox.exists||0,from=Math.max(1,exists-49),groups=emptyMailGroups();if(exists)for await(const message of imap.fetch(`${from}:*`,{envelope:true,internalDate:true,flags:true,size:true,source:{start:0,maxLength:65_536}})){let parsed=null;try{parsed=message.source?await simpleParser(message.source,{skipHtmlToText:true,skipTextToHtml:true,maxHtmlLengthToParse:0}):null;}catch{}const sender=parsed?.from?.value?.[0]?.address||message.envelope?.from?.[0]?.address||'',subject=String(parsed?.subject||message.envelope?.subject||'(ohne Betreff)').slice(0,180),classification=classifyMail({sender,subject,headers:parsed?.headers});groups[classification.category].push({uid:message.uid,sender,subject,date:message.internalDate,size:message.size,confidence:classification.confidence,signals:classification.signals});}for(const values of Object.values(groups))values.reverse();result.scan={readOnly:true,mutationsApplied:false,total:Object.values(groups).reduce((sum,values)=>sum+values.length,0),groups};}finally{lock.release();}}}catch(error){error.mailStage='imap';throw error;}finally{await imap.logout().catch(()=>{});}
  try{const transport=nodemailer.createTransport(options.smtp);await transport.verify();result.smtp={ok:true,optional:true,sendTestPerformed:false};}catch(error){result.smtp={ok:false,optional:true,sendTestPerformed:false,code:mailErrorCode(error),error:publicMailError(error,account.provider)};}
  result.latencyMs=Date.now()-started;return result;
}

function mailAudit(userId,provider,stage,outcome,code='OK'){
  const userHash=crypto.createHash('sha256').update(String(userId||'unknown')).digest('hex').slice(0,12);
  console.info(JSON.stringify({event:'agentone.mail.connection',at:new Date().toISOString(),userHash,provider:String(provider||'custom'),stage,outcome,code,secretsExposed:false}));
}

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
    const preferences=url.pathname.match(/^\/api\/internal\/personal\/mail\/accounts\/([^/]+)\/preferences$/);if(req.method==='PUT'&&preferences){const stored=await getPersonalMailAccount(postgres,userId,decodeURIComponent(preferences[1]));if(!stored)return json(res,404,{error:'mail_account_not_found'});const input=await body(req),requested=Array.isArray(input.connectors)?input.connectors.map(String):[],connectors=[...new Set(requested.filter(value=>['mail','calendar'].includes(value)))];if(!connectors.includes('mail'))connectors.unshift('mail');const settings={...(stored.settings||{}),connectors,calendarAuthorization:connectors.includes('calendar')?'REQUIRED':'OFF'};return json(res,200,{account:await updatePersonalMailSettings(postgres,userId,stored.id,settings),calendar:{enabled:connectors.includes('calendar'),status:connectors.includes('calendar')?'AUTHORIZATION_REQUIRED':'OFF',reason:connectors.includes('calendar')?'Google Kalender benötigt eine getrennte OAuth-Freigabe; das Gmail-App-Passwort wird nicht wiederverwendet.':null}});}
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
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/services')return json(res,200,{services:await listPersonalServices(postgres,userId),catalog:Object.entries(personalServiceCatalog).map(([id,item])=>({id,name:item.name,capabilities:item.capabilities}))});
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/services')try{const input=await body(req),normalized=normalizePersonalService(input);let lastTest,status='READY';try{lastTest=await testPersonalService(normalized.service,normalized.secret);status='CONNECTED';}catch(error){lastTest={testedAt:new Date().toISOString(),ok:false,error:String(error.message||error).slice(0,160)};status='DEGRADED';}const secret=encryptDemoSecret(normalized.secret,env),service=await savePersonalService(postgres,{userId,service:normalized.service,secret,lastTest,status});return json(res,201,{service});}catch(error){return json(res,error.status||422,{error:String(error.message||error).slice(0,180)});}
    const match=url.pathname.match(/^\/api\/internal\/personal\/services\/([^/]+)\/test$/);if(req.method==='POST'&&match){const stored=await getPersonalService(postgres,userId,decodeURIComponent(match[1]));if(!stored)return json(res,404,{error:'service_not_found'});try{const secret=decryptDemoSecret(stored,env),result=await testPersonalService(stored,secret);await updatePersonalServiceTest(postgres,userId,stored.id,result,'CONNECTED');return json(res,200,result);}catch(error){const failure={testedAt:new Date().toISOString(),ok:false,error:String(error.message||error).slice(0,160)};await updatePersonalServiceTest(postgres,userId,stored.id,failure,'DEGRADED');return json(res,422,failure);}}
    return json(res,405,{error:'method_not_allowed'});
  }
  if(url.pathname==='/api/internal/personal/google'&&req.method==='POST'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});try{const input=await body(req),accessToken=String(input.accessToken||''),refreshToken=String(input.refreshToken||'');if(!accessToken||!refreshToken)throw Object.assign(new Error('Google lieferte keinen dauerhaften Refresh-Token'),{status:422});const profileResponse=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(12_000)}),profile=await profileResponse.json();if(!profileResponse.ok)throw new Error(`Gmail Profil HTTP ${profileResponse.status}`);const service={id:'google',label:'Google Mail und Kalender',endpoint:'https://gmail.googleapis.com',username:String(profile.emailAddress||input.email||''),capabilities:['gmail.readonly','calendar.readonly'],settings:{readOnly:true,oauth:true,scopes:String(input.scope||'').split(' ').filter(Boolean)}},secret=encryptDemoSecret(refreshToken,env),lastTest={testedAt:new Date().toISOString(),ok:true,gmailProfile:true,messagesTotal:Number(profile.messagesTotal||0)};return json(res,201,{service:await savePersonalService(postgres,{userId,service,secret,lastTest,status:'CONNECTED'})});}catch(error){return json(res,error.status||422,{error:String(error.message||error).slice(0,180)});}
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
    if(req.method==='GET'&&url.pathname==='/api/internal/personal/nudges'){const settings=loadNudgeSettings(state.db,userId),dismissed=dismissedNudgeIds(state.db,userId),[connectors,mailAccounts]=await Promise.all([listPersonalConnectors(postgres,userId),listPersonalMailAccounts(postgres,userId)]),snapshot=platformSnapshot(),governance=governanceSnapshot(state.db,userId),items=filterPersonalNudges(buildPersonalNudges({connectors,mailAccounts,audit:governance.audit||[],gates:snapshot.gates||[]}),settings).filter(item=>!dismissed.has(item.id)),quiet=quietNow(settings.quietHours);return json(res,200,{settings,items,delivery:{quietNow:quiet,inApp:true,external:settings.enabled&&!quiet,deliverableCount:items.length},secretsExposed:false});}
    if(req.method==='PUT'&&url.pathname==='/api/internal/personal/nudges')return json(res,200,{settings:saveNudgeSettings(state.db,userId,await body(req))});
    if(req.method==='POST'&&url.pathname==='/api/internal/personal/nudges/feedback')try{const input=await body(req);return json(res,201,{feedback:recordNudgeFeedback(state.db,{id:crypto.randomUUID(),userId,nudgeId:String(input.nudgeId||''),value:String(input.value||'')})});}catch(error){return json(res,error.status||400,{error:String(error.message||error)});}
    return json(res,405,{error:'method_not_allowed'});
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
  if(url.pathname==='/api/internal/personal/dashboard'&&req.method==='GET'){
    if(!internalPersonal)return json(res,403,{error:'forbidden'});const userId=String(req.headers['x-agentone-user']||'').trim().slice(0,80);if(!userId)return json(res,400,{error:'user_required'});
    const [database,connectors,services,mail]=await Promise.all([postgresHealth(postgres),listPersonalConnectors(postgres,userId),listPersonalServices(postgres,userId),listPersonalMailAccounts(postgres,userId)]),platformState=platformSnapshot(),companion=companionStatus(state.db,userId),governance=governanceSnapshot(state.db,userId),runs=platformState.runs.filter(run=>!String(run.id).includes('-DEMO-')),runIds=new Set(runs.map(run=>run.id)),gates=platformState.gates.filter(gate=>runIds.has(gate.runId)),events=platformState.events.filter(event=>runIds.has(event.runId)),integrations=state.catalog().map(item=>({id:item.id,name:item.name,mode:item.mode,status:item.status,note:item.note||'',capabilities:item.capabilities}));
    return json(res,200,{schema:'agentone.dashboard/v1',release:env.AGENTONE_RELEASE||'local',generatedAt:new Date().toISOString(),database,platform:{workflows:platformState.workflows.length,runs,gates,events,activeRuns:runs.filter(run=>!['COMPLETED','FAILED','CANCELLED'].includes(run.status)).length,seedDataExcluded:true},integrations,personal:{connectors,services,mailAccounts:mail.map(item=>({id:item.id,label:item.label,provider:item.provider,status:item.status,lastTest:item.lastTest})),companion,governance},policy:{liveData:true,secretsExposed:false,writesRequireApproval:true}});
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
