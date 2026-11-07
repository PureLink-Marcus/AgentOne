import crypto from 'node:crypto';

const actions=new Set(['morning-briefing','mail-summary','home-summary','nudge-review']);
const states=new Set(['DRAFT','ACTIVE','PAUSED']);
const stable=value=>JSON.stringify(value,Object.keys(value).sort());
const hash=value=>crypto.createHash('sha256').update(stable(value)).digest('hex');

export function initRoutineStore(db){db.exec(`CREATE TABLE IF NOT EXISTS personal_routines(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT NOT NULL,action TEXT NOT NULL,schedule_time TEXT NOT NULL,days TEXT NOT NULL,timezone TEXT NOT NULL,state TEXT NOT NULL,simulation_hash TEXT,last_run_date TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS personal_routines_user ON personal_routines(user_id,updated_at DESC);CREATE TABLE IF NOT EXISTS personal_routine_runs(id TEXT PRIMARY KEY,routine_id TEXT NOT NULL,user_id TEXT NOT NULL,status TEXT NOT NULL,result TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT NOT NULL);`);migrateRoutineStore(db);}

export function normalizeRoutine(input={}){const title=String(input.title||'').trim().slice(0,80),action=String(input.action||''),scheduleTime=String(input.scheduleTime||''),days=[...new Set((Array.isArray(input.days)?input.days:[]).map(Number).filter(value=>Number.isInteger(value)&&value>=0&&value<=6))].sort(),timezone=String(input.timezone||'Europe/Berlin');if(title.length<2||!actions.has(action)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleTime)||!days.length||timezone!=='Europe/Berlin')throw Object.assign(new Error('invalid_routine'),{status:400});return {title,action,scheduleTime,days,timezone};}

export function simulateRoutine(input){const value=normalizeRoutine(input),simulation={...value,mode:'READ_ONLY',sources:{'morning-briefing':['mail','home','calendar'],'mail-summary':['mail'],'home-summary':['home'],'nudge-review':['nudges']}[value.action],mutations:[],requiresApproval:true};return {...simulation,hash:hash(simulation)};}

export function createRoutine(db,{id,userId,input}){const value=normalizeRoutine(input),now=new Date().toISOString();db.prepare('INSERT INTO personal_routines(id,user_id,title,action,schedule_time,days,timezone,state,simulation_hash,last_run_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,userId,value.title,value.action,value.scheduleTime,JSON.stringify(value.days),value.timezone,'DRAFT',null,null,now,now);return {id,...value,state:'DRAFT',simulationHash:null,lastRunDate:null,createdAt:now,updatedAt:now};}

const mapRow=row=>({...row,days:JSON.parse(row.days),scheduleTime:row.scheduleTime,simulationHash:row.simulationHash||null,lastRunDate:row.lastRunDate||null});
export function listRoutines(db,userId){return db.prepare('SELECT id,title,action,schedule_time as scheduleTime,days,timezone,state,simulation_hash as simulationHash,last_run_date as lastRunDate,created_at as createdAt,updated_at as updatedAt FROM personal_routines WHERE user_id=? ORDER BY updated_at DESC').all(userId).map(mapRow);}
export function simulateStoredRoutine(db,{userId,id}){const row=listRoutines(db,userId).find(item=>item.id===id);if(!row)throw Object.assign(new Error('routine_not_found'),{status:404});const simulation=simulateRoutine(row),now=new Date().toISOString();db.prepare('UPDATE personal_routines SET simulation_hash=?,state=?,updated_at=? WHERE id=? AND user_id=?').run(simulation.hash,'DRAFT',now,id,userId);return simulation;}
export function setRoutineState(db,{userId,id,state,simulationHash}){if(!states.has(state)||state==='DRAFT')throw Object.assign(new Error('invalid_routine_state'),{status:400});const row=listRoutines(db,userId).find(item=>item.id===id);if(!row)throw Object.assign(new Error('routine_not_found'),{status:404});if(state==='ACTIVE'&&(!row.simulationHash||row.simulationHash!==simulationHash))throw Object.assign(new Error('routine_simulation_changed'),{status:409});const updatedAt=new Date().toISOString();db.prepare('UPDATE personal_routines SET state=?,updated_at=? WHERE id=? AND user_id=?').run(state,updatedAt,id,userId);return {...row,state,updatedAt};}
export function deleteRoutine(db,{userId,id}){const row=listRoutines(db,userId).find(item=>item.id===id);if(!row)throw Object.assign(new Error('routine_not_found'),{status:404});if(row.state==='ACTIVE')throw Object.assign(new Error('active_routine_must_be_paused'),{status:409});db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM personal_routine_runs WHERE routine_id=? AND user_id=?').run(id,userId);const result=db.prepare('DELETE FROM personal_routines WHERE id=? AND user_id=?').run(id,userId);db.exec('COMMIT');if(result.changes!==1)throw Object.assign(new Error('routine_not_found'),{status:404});}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}return {deleted:true,id};}

export function berlinScheduleParts(date=new Date()){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value])),weekdays={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};return {day:weekdays[parts.weekday],time:`${parts.hour}:${parts.minute}`,date:`${parts.year}-${parts.month}-${parts.day}`};}
export function dueRoutines(db,date=new Date()){const now=berlinScheduleParts(date);return db.prepare("SELECT id,user_id as userId,title,action,schedule_time as scheduleTime,days,timezone,state,simulation_hash as simulationHash,last_run_date as lastRunDate FROM personal_routines WHERE state='ACTIVE'").all().map(mapRow).filter(item=>item.scheduleTime<=now.time&&item.days.includes(now.day)&&item.lastRunDate!==now.date).map(item=>({...item,dueDate:now.date,catchUp:item.scheduleTime!==now.time}));}
export function recordRoutineRun(db,{id,routine,result,status='COMPLETED',startedAt=new Date().toISOString(),finishedAt=new Date().toISOString()}){if(!runStates.has(status)||status==='RUNNING')throw routineError('invalid_run_status');let existing=routine?.dueDate?db.prepare(runSelect+' WHERE user_id=? AND routine_id=? AND due_date=? AND source=?').get(routine.userId,routine.id,routine.dueDate,'SCHEDULED'):null;if(existing)return mapRunRow(existing);let claim;if(routine?.dueDate){const projected=runningProjection(routine.action,startedAt),inserted=db.prepare('INSERT OR IGNORE INTO personal_routine_runs(id,routine_id,user_id,status,result,started_at,finished_at,due_date,source,claimed_at,updated_at,result_hash,error_code,inbox_state,snoozed_until,inbox_expires_at,recovery_count) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,routine.id,routine.userId,'RUNNING',JSON.stringify(projected),startedAt,startedAt,routine.dueDate,'SCHEDULED',startedAt,startedAt,resultHash(projected),null,'NEW',null,null,0);existing=db.prepare(runSelect+' WHERE user_id=? AND routine_id=? AND due_date=? AND source=?').get(routine.userId,routine.id,routine.dueDate,'SCHEDULED');if(inserted.changes!==1)return mapRunRow(existing);claim={claimed:true,run:mapRunRow(existing)};}else claim=claimManualRoutineRun(db,{id,userId:routine?.userId,routineId:routine?.id,now:startedAt});return status==='FAILED'?failRoutineRun(db,{userId:routine.userId,runId:claim.run.id,errorCode:result?.errorCode||'ROUTINE_EXECUTION_FAILED',now:finishedAt}):completeRoutineRun(db,{userId:routine.userId,runId:claim.run.id,result:{...result,action:routine.action,generatedAt:result?.generatedAt||finishedAt},now:finishedAt});}

const runStates=new Set(['RUNNING','COMPLETED','FAILED']);
const inboxStates=new Set(['NEW','READ','SNOOZED','DISMISSED']);
const idPattern=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const errorCodePattern=/^[A-Z][A-Z0-9_]{2,63}$/;
const dayMs=86_400_000;
const defaultStaleMs=15*60_000;
const defaultInboxDays=30;

function routineError(message,status=400,code=message){return Object.assign(new Error(message),{status,code});}
function identifier(value,name){const normalized=String(value??'').trim();if(!idPattern.test(normalized))throw routineError('invalid_'+name,400,'ROUTINE_INVALID_'+name.toUpperCase());return normalized;}
function instant(value,name='timestamp'){const date=value instanceof Date?value:new Date(value);if(!Number.isFinite(date.getTime()))throw routineError('invalid_'+name);return date;}
function iso(value,name){return instant(value,name).toISOString();}
function runTransaction(db,operation){db.exec('BEGIN IMMEDIATE');try{const result=operation();db.exec('COMMIT');return result;}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}}
function canonicalStable(value){if(value===undefined)return 'null';if(Array.isArray(value))return '['+value.map(canonicalStable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalStable(value[key])).join(',')+'}';return JSON.stringify(value);}
function resultHash(value){return crypto.createHash('sha256').update(canonicalStable(value)).digest('hex');}
function safeText(value,max=500){let text=String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);text=text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[EMAIL]');if(/(?:(?:password|passwort|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization)\s*[:=]\s*\S+|\bbearer\s+\S+|(?:sk|a1k|tskey|ghp)[_-][A-Za-z0-9_-]{12,})/i.test(text))return '[REDACTED]';return text;}
function safeCount(value,max=1_000_000){const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(max,Math.trunc(number))):0;}
function safeSource(source){if(!source||typeof source!=='object')return null;const id=safeText(source.id,80),status=safeText(source.status,32).toUpperCase();if(!id)return null;return {id,status:status||'UNKNOWN',records:safeCount(source.records),accounts:safeCount(source.accounts),calendars:safeCount(source.calendars),selectedCalendars:safeCount(source.selectedCalendars)};}
function safeFreshness(value){if(!value||typeof value!=='object'||Array.isArray(value))return null;const source=safeText(value.source,24).toLowerCase(),freshness=safeText(value.freshness,32).toUpperCase(),status=safeText(value.status,32).toUpperCase(),outcome=safeText(value.outcome,32).toUpperCase(),allowedSources=new Set(['mail','google','ics']),allowedFreshness=new Set(['FRESH','STALE_FALLBACK','NOT_CONNECTED','DEGRADED']);if(!allowedSources.has(source)||!allowedFreshness.has(freshness))return null;const timestamp=input=>{if(input==null||input==='')return null;try{return iso(input,'source_timestamp');}catch{return null;}},candidate=String(value.errorCode||''),errorCode=errorCodePattern.test(candidate)&&!/(?:PASSWORD|PASSWORT|SECRET|ACCESS_?TOKEN|REFRESH_?TOKEN|API_?KEY|CLIENT_?SECRET|AUTHORIZATION|BEARER|CREDENTIAL)/.test(candidate)?candidate:null;return {source,status:status||'UNKNOWN',freshness,lastSuccessAt:timestamp(value.lastSuccessAt),attemptedAt:timestamp(value.attemptedAt),outcome:outcome||'UNKNOWN',errorCode,accounts:safeCount(value.accounts,100)};}
function safeSignal(signal){if(!signal||typeof signal!=='object')return null;const id=safeText(signal.id,120),domain=safeText(signal.domain,40);if(!id||!domain)return null;const evidence=Array.isArray(signal.evidence)?signal.evidence:[],sourceIds=[...new Set(evidence.map(item=>safeText(item?.source,80)).filter(Boolean))].slice(0,12),actions=(Array.isArray(signal.actions)?signal.actions:[]).slice(0,8).map(action=>{const type=safeText(action?.type,60),target=safeText(action?.target,120),label=safeText(action?.label,80);if(!type||!label||!target||!/^(?:mail|calendar|health|tasks|home|nudges):/i.test(target))return null;return {type,target,label};}).filter(Boolean);return {id,domain,severity:signal.severity==='attention'?'attention':'info',title:safeText(signal.title,180),summary:safeText(signal.summary,700),confidence:Math.max(0,Math.min(1,Number(signal.confidence)||0)),evidenceCount:Math.min(500,evidence.length),sourceIds,actions,disclaimer:safeText(signal.disclaimer,280)};}
function safeInsight(insight){if(!insight||typeof insight!=='object')return null;const id=safeText(insight.id,120),domain=safeText(insight.domain,40),target=safeText(insight.target,120);if(!id||!domain)return null;return {id,domain,severity:insight.severity==='attention'?'attention':'info',title:safeText(insight.title,180),summary:safeText(insight.summary,700),confidence:Math.max(0,Math.min(1,Number(insight.confidence)||0)),evidenceCount:safeCount(insight.evidenceCount,1_000),sources:(Array.isArray(insight.sources)?insight.sources:[]).slice(0,12).map(value=>safeText(value,80)).filter(Boolean),target:/^(?:mail|calendar|health|tasks|home|nudges):/i.test(target)?target:null};}
function safeSummary(value){if(!value||typeof value!=='object'||Array.isArray(value))return safeText(value,700)||null;return {events:safeCount(value.events,100_000),signals:safeCount(value.signals,1_000),attention:safeCount(value.attention,1_000),informational:safeCount(value.informational,1_000),ledgerEvents:safeCount(value.ledgerEvents,100_000)};}

export function projectRoutineResult(input={}){
  const value=input&&typeof input==='object'&&!Array.isArray(input)?input:{},result={
    schema:safeText(value.schema||'agentone.personal-routine-result/v2',100),
    action:actions.has(String(value.action||''))?String(value.action):null,
    mode:'READ_ONLY',readOnly:true,status:safeText(value.status,32)||null,
    generatedAt:value.generatedAt?iso(value.generatedAt,'generatedAt'):null,
    commandRunId:idPattern.test(String(value.commandRunId||''))?String(value.commandRunId):null,
    title:safeText(value.title,180)||null,summary:safeSummary(value.summary),
    sources:(Array.isArray(value.sources)?value.sources:[]).slice(0,20).map(safeSource).filter(Boolean),
    sourceFreshness:(Array.isArray(value.sourceFreshness)?value.sourceFreshness:[]).slice(0,20).map(safeFreshness).filter(Boolean),
    signals:(Array.isArray(value.signals)?value.signals:[]).slice(0,20).map(safeSignal).filter(Boolean),
    insights:(Array.isArray(value.insights)?value.insights:[]).slice(0,20).map(safeInsight).filter(Boolean),
    overview:{total:safeCount(value.overview?.total),attention:safeCount(value.overview?.attention??value.summaryCounts?.attention),informational:safeCount(value.overview?.informational??value.summaryCounts?.informational),sourceCount:safeCount(value.overview?.sourceCount)},
    mutations:[],policy:{readOnly:true,bodyStored:false,rawHealthValuesStored:false,piiStored:false,medicalDiagnosis:false,secretsExposed:false},errorCode:errorCodePattern.test(String(value.errorCode||''))?String(value.errorCode):null,
  };
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>32*1024)throw routineError('routine_result_too_large',413,'ROUTINE_RESULT_TOO_LARGE');
  return result;
}

function ensureColumn(db,table,name,declaration){const columns=new Set(db.prepare('PRAGMA table_info('+table+')').all().map(row=>row.name));if(!columns.has(name))db.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+declaration);}
function migrateRoutineStore(db){
  ensureColumn(db,'personal_routine_runs','due_date','TEXT');
  ensureColumn(db,'personal_routine_runs','source',"TEXT NOT NULL DEFAULT 'SCHEDULED'");
  ensureColumn(db,'personal_routine_runs','claimed_at','TEXT');
  ensureColumn(db,'personal_routine_runs','updated_at','TEXT');
  ensureColumn(db,'personal_routine_runs','result_hash','TEXT');
  ensureColumn(db,'personal_routine_runs','error_code','TEXT');
  ensureColumn(db,'personal_routine_runs','inbox_state',"TEXT NOT NULL DEFAULT 'NEW'");
  ensureColumn(db,'personal_routine_runs','snoozed_until','TEXT');
  ensureColumn(db,'personal_routine_runs','inbox_expires_at','TEXT');
  ensureColumn(db,'personal_routine_runs','recovery_count','INTEGER NOT NULL DEFAULT 0');
  db.exec("CREATE INDEX IF NOT EXISTS personal_routine_runs_user_started ON personal_routine_runs(user_id,started_at DESC);CREATE INDEX IF NOT EXISTS personal_routine_runs_inbox ON personal_routine_runs(user_id,inbox_state,inbox_expires_at,started_at DESC);CREATE UNIQUE INDEX IF NOT EXISTS personal_routine_runs_due ON personal_routine_runs(user_id,routine_id,due_date) WHERE source='SCHEDULED' AND due_date IS NOT NULL;");
  const legacy=db.prepare('SELECT id,result,started_at AS startedAt,finished_at AS finishedAt,updated_at AS updatedAt,result_hash AS resultHash,claimed_at AS claimedAt,inbox_expires_at AS inboxExpiresAt FROM personal_routine_runs WHERE result_hash IS NULL OR updated_at IS NULL OR claimed_at IS NULL OR inbox_expires_at IS NULL').all(),update=db.prepare('UPDATE personal_routine_runs SET result=?,result_hash=?,claimed_at=COALESCE(claimed_at,?),updated_at=COALESCE(updated_at,?),inbox_expires_at=COALESCE(inbox_expires_at,?) WHERE id=?');
  for(const row of legacy){let parsed={};try{parsed=JSON.parse(row.result||'{}');}catch{}let projected;try{projected=projectRoutineResult(parsed);}catch{projected=projectRoutineResult({status:'MIGRATED'});}let finished;try{finished=instant(row.finishedAt||row.startedAt);}catch{finished=new Date(0);}const expires=new Date(finished.getTime()+defaultInboxDays*dayMs).toISOString();update.run(JSON.stringify(projected),resultHash(projected),row.claimedAt||row.startedAt||finished.toISOString(),row.updatedAt||row.finishedAt||row.startedAt||finished.toISOString(),row.inboxExpiresAt||expires,row.id);}
}

const runSelect='SELECT id,routine_id AS routineId,user_id AS userId,status,result,started_at AS startedAt,finished_at AS finishedAt,due_date AS dueDate,source,claimed_at AS claimedAt,updated_at AS updatedAt,result_hash AS resultHash,error_code AS errorCode,inbox_state AS inboxState,snoozed_until AS snoozedUntil,inbox_expires_at AS inboxExpiresAt,recovery_count AS recoveryCount FROM personal_routine_runs';
function parseRunResult(value){let parsed={};try{parsed=JSON.parse(value||'{}');}catch{}try{return projectRoutineResult(parsed);}catch{return projectRoutineResult({status:'MIGRATED'});}}
function mapRunRow(row){const projected=parseRunResult(row.result);return {id:row.id,routineId:row.routineId,status:runStates.has(row.status)?row.status:'FAILED',source:row.source||'SCHEDULED',dueDate:row.dueDate||null,result:projected,resultHash:row.resultHash||resultHash(projected),errorCode:row.errorCode||null,inboxState:inboxStates.has(row.inboxState)?row.inboxState:'NEW',snoozedUntil:row.snoozedUntil||null,inboxExpiresAt:row.inboxExpiresAt||null,recoveryCount:Number(row.recoveryCount||0),startedAt:row.startedAt,finishedAt:row.finishedAt,updatedAt:row.updatedAt||row.finishedAt||row.startedAt};}
function routineOwnedRow(db,userId,id){return db.prepare('SELECT id,user_id AS userId,title,action,schedule_time AS scheduleTime,days,timezone,state,simulation_hash AS simulationHash,last_run_date AS lastRunDate,created_at AS createdAt,updated_at AS updatedAt FROM personal_routines WHERE id=? AND user_id=?').get(id,userId);}
function runningProjection(action,generatedAt){return projectRoutineResult({action,mode:'READ_ONLY',status:'RUNNING',generatedAt});}
function isStale(claimedAt,now,staleAfterMs){const claimed=Date.parse(claimedAt||'');return Number.isFinite(claimed)&&claimed<=now.getTime()-staleAfterMs;}

export function claimDueRoutineRun(db,{id,routine,now=new Date(),staleAfterMs=defaultStaleMs}={}){
  const runId=identifier(id,'run_id'),owner=identifier(routine?.userId,'user_id'),routineId=identifier(routine?.id,'routine_id'),at=instant(now),atIso=at.toISOString();
  if(!Number.isInteger(staleAfterMs)||staleAfterMs<60_000||staleAfterMs>24*60*60_000)throw routineError('invalid_stale_window');
  return runTransaction(db,()=>{
    const stored=routineOwnedRow(db,owner,routineId);if(!stored||stored.state!=='ACTIVE')throw routineError('routine_not_active',409,'ROUTINE_NOT_ACTIVE');
    const current=berlinScheduleParts(at),days=JSON.parse(stored.days),dueDate=String(routine?.dueDate||current.date);
    if(dueDate!==current.date||!days.includes(current.day)||stored.scheduleTime>current.time||stored.lastRunDate===dueDate)throw routineError('routine_not_due',409,'ROUTINE_NOT_DUE');
    const existing=db.prepare(runSelect+' WHERE user_id=? AND routine_id=? AND due_date=? AND source=?').get(owner,routineId,dueDate,'SCHEDULED');
    if(existing){
      if(existing.status==='RUNNING'&&isStale(existing.claimedAt||existing.startedAt,at,staleAfterMs)){
        const result=runningProjection(stored.action,atIso);
        db.prepare("UPDATE personal_routine_runs SET status='RUNNING',result=?,started_at=?,finished_at=?,claimed_at=?,updated_at=?,result_hash=?,error_code=NULL,inbox_state='NEW',snoozed_until=NULL,inbox_expires_at=NULL,recovery_count=recovery_count+1 WHERE id=? AND user_id=?").run(JSON.stringify(result),atIso,atIso,atIso,atIso,resultHash(result),existing.id,owner);
        return {claimed:true,recovered:true,run:mapRunRow(db.prepare(runSelect+' WHERE id=? AND user_id=?').get(existing.id,owner))};
      }
      return {claimed:false,recovered:false,reason:existing.status==='RUNNING'?'ALREADY_RUNNING':'ALREADY_TERMINAL',run:mapRunRow(existing)};
    }
    const result=runningProjection(stored.action,atIso);
    db.prepare('INSERT INTO personal_routine_runs(id,routine_id,user_id,status,result,started_at,finished_at,due_date,source,claimed_at,updated_at,result_hash,error_code,inbox_state,snoozed_until,inbox_expires_at,recovery_count) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(runId,routineId,owner,'RUNNING',JSON.stringify(result),atIso,atIso,dueDate,'SCHEDULED',atIso,atIso,resultHash(result),null,'NEW',null,null,0);
    return {claimed:true,recovered:false,run:mapRunRow(db.prepare(runSelect+' WHERE id=? AND user_id=?').get(runId,owner))};
  });
}

export function claimManualRoutineRun(db,{id,userId,routineId,now=new Date()}={}){
  const runId=identifier(id,'run_id'),owner=identifier(userId,'user_id'),target=identifier(routineId,'routine_id'),atIso=iso(now,'now');
  return runTransaction(db,()=>{const stored=routineOwnedRow(db,owner,target);if(!stored||stored.state!=='ACTIVE')throw routineError('routine_not_active',409,'ROUTINE_NOT_ACTIVE');const result=runningProjection(stored.action,atIso);db.prepare('INSERT INTO personal_routine_runs(id,routine_id,user_id,status,result,started_at,finished_at,due_date,source,claimed_at,updated_at,result_hash,error_code,inbox_state,snoozed_until,inbox_expires_at,recovery_count) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(runId,target,owner,'RUNNING',JSON.stringify(result),atIso,atIso,null,'MANUAL',atIso,atIso,resultHash(result),null,'NEW',null,null,0);return {claimed:true,recovered:false,readOnly:true,run:mapRunRow(db.prepare(runSelect+' WHERE id=? AND user_id=?').get(runId,owner))};});
}

function terminalRun(db,{userId,runId,status,result,errorCode,now,inboxDays=defaultInboxDays}){
  const owner=identifier(userId,'user_id'),id=identifier(runId,'run_id'),at=instant(now||new Date()),atIso=at.toISOString();
  if(!runStates.has(status)||status==='RUNNING')throw routineError('invalid_run_status');
  if(!Number.isInteger(inboxDays)||inboxDays<1||inboxDays>90)throw routineError('invalid_inbox_expiry');
  const code=errorCode==null?null:String(errorCode);if(code&&!errorCodePattern.test(code))throw routineError('invalid_error_code');
  return runTransaction(db,()=>{const current=db.prepare(runSelect+' WHERE id=? AND user_id=?').get(id,owner);if(!current)throw routineError('routine_run_not_found',404,'ROUTINE_RUN_NOT_FOUND');if(current.status!=='RUNNING')throw routineError('routine_run_not_running',409,'ROUTINE_RUN_NOT_RUNNING');const base=parseRunResult(current.result),projected=projectRoutineResult(status==='FAILED'?{...base,...result,status,errorCode:code}:{...base,...result,status}),expires=new Date(at.getTime()+inboxDays*dayMs).toISOString(),updated=db.prepare("UPDATE personal_routine_runs SET status=?,result=?,finished_at=?,updated_at=?,result_hash=?,error_code=?,inbox_state='NEW',snoozed_until=NULL,inbox_expires_at=? WHERE id=? AND user_id=? AND status='RUNNING'").run(status,JSON.stringify(projected),atIso,atIso,resultHash(projected),code,expires,id,owner);if(updated.changes!==1)throw routineError('routine_run_not_running',409,'ROUTINE_RUN_NOT_RUNNING');if(current.source==='SCHEDULED'&&/^\d{4}-\d{2}-\d{2}$/.test(String(current.dueDate||'')))db.prepare('UPDATE personal_routines SET last_run_date=?,updated_at=? WHERE id=? AND user_id=?').run(current.dueDate,atIso,current.routineId,owner);return mapRunRow(db.prepare(runSelect+' WHERE id=? AND user_id=?').get(id,owner));});
}

export function completeRoutineRun(db,{userId,runId,result={},now=new Date(),inboxDays=defaultInboxDays}={}){return terminalRun(db,{userId,runId,status:'COMPLETED',result,now,inboxDays});}
export function failRoutineRun(db,{userId,runId,errorCode='ROUTINE_EXECUTION_FAILED',now=new Date(),inboxDays=defaultInboxDays}={}){return terminalRun(db,{userId,runId,status:'FAILED',result:{errorCode},errorCode,now,inboxDays});}

export function recoverStaleRoutineRuns(db,{userId,now=new Date(),staleAfterMs=defaultStaleMs,limit=100}={}){
  const owner=userId==null?null:identifier(userId,'user_id'),at=instant(now),atIso=at.toISOString();
  if(!Number.isInteger(staleAfterMs)||staleAfterMs<60_000||staleAfterMs>24*60*60_000)throw routineError('invalid_stale_window');
  if(!Number.isInteger(limit)||limit<1||limit>500)throw routineError('invalid_limit');
  const cutoff=new Date(at.getTime()-staleAfterMs).toISOString();
  return runTransaction(db,()=>{const rows=owner?db.prepare(runSelect+" WHERE user_id=? AND status='RUNNING' AND COALESCE(claimed_at,started_at)<=? ORDER BY started_at LIMIT ?").all(owner,cutoff,limit):db.prepare(runSelect+" WHERE status='RUNNING' AND COALESCE(claimed_at,started_at)<=? ORDER BY started_at LIMIT ?").all(cutoff,limit);return rows.flatMap(row=>{const rowOwner=row.userId,routine=routineOwnedRow(db,rowOwner,row.routineId),result=runningProjection(routine?.action,atIso),updated=db.prepare("UPDATE personal_routine_runs SET result=?,started_at=?,finished_at=?,claimed_at=?,updated_at=?,result_hash=?,error_code=NULL,inbox_state='NEW',snoozed_until=NULL,inbox_expires_at=NULL,recovery_count=recovery_count+1 WHERE id=? AND user_id=? AND status='RUNNING' AND COALESCE(claimed_at,started_at)<=?").run(JSON.stringify(result),atIso,atIso,atIso,atIso,resultHash(result),row.id,rowOwner,cutoff);return updated.changes===1?[{...mapRunRow(db.prepare(runSelect+' WHERE id=? AND user_id=?').get(row.id,rowOwner)),recovered:true}]:[];});});
}

export function listRoutineRuns(db,{userId,routineId,status,inboxState,limit=50,includeExpired=false,now=new Date()}={}){
  const owner=identifier(userId,'user_id');if(!Number.isInteger(limit)||limit<1||limit>100)throw routineError('invalid_limit');const clauses=['user_id=?'],params=[owner];
  if(routineId){clauses.push('routine_id=?');params.push(identifier(routineId,'routine_id'));}if(status){if(!runStates.has(status))throw routineError('invalid_run_status');clauses.push('status=?');params.push(status);}if(inboxState){if(!inboxStates.has(inboxState))throw routineError('invalid_inbox_state');clauses.push('inbox_state=?');params.push(inboxState);}if(!includeExpired){clauses.push('(inbox_expires_at IS NULL OR inbox_expires_at>?)');params.push(iso(now,'now'));}params.push(limit);return db.prepare(runSelect+' WHERE '+clauses.join(' AND ')+' ORDER BY started_at DESC,id DESC LIMIT ?').all(...params).map(mapRunRow);
}

export function listRoutineInbox(db,{userId,limit=50,now=new Date()}={}){
  const owner=identifier(userId,'user_id'),atIso=iso(now,'now');if(!Number.isInteger(limit)||limit<1||limit>100)throw routineError('invalid_limit');return db.prepare(runSelect+" WHERE user_id=? AND status<>'RUNNING' AND inbox_state<>'DISMISSED' AND (inbox_expires_at IS NULL OR inbox_expires_at>?) AND (inbox_state<>'SNOOZED' OR snoozed_until<=?) ORDER BY CASE inbox_state WHEN 'NEW' THEN 0 WHEN 'SNOOZED' THEN 1 ELSE 2 END,started_at DESC,id DESC LIMIT ?").all(owner,atIso,atIso,limit).map(mapRunRow);
}

export function setRoutineRunInboxState(db,{userId,runId,state,snoozedUntil,now=new Date()}={}){
  const owner=identifier(userId,'user_id'),id=identifier(runId,'run_id'),next=String(state||''),at=instant(now),atIso=at.toISOString();if(!inboxStates.has(next))throw routineError('invalid_inbox_state');const row=db.prepare(runSelect+' WHERE id=? AND user_id=?').get(id,owner);if(!row)throw routineError('routine_run_not_found',404,'ROUTINE_RUN_NOT_FOUND');if(row.status==='RUNNING')throw routineError('routine_run_not_finished',409,'ROUTINE_RUN_NOT_FINISHED');if(row.inboxExpiresAt&&Date.parse(row.inboxExpiresAt)<=at.getTime())throw routineError('routine_run_expired',410,'ROUTINE_RUN_EXPIRED');let snooze=null;if(next==='SNOOZED'){snooze=iso(snoozedUntil,'snoozedUntil');const millis=Date.parse(snooze);if(millis<=at.getTime()||millis>at.getTime()+defaultInboxDays*dayMs||(row.inboxExpiresAt&&millis>=Date.parse(row.inboxExpiresAt)))throw routineError('invalid_snooze_window');}db.prepare('UPDATE personal_routine_runs SET inbox_state=?,snoozed_until=?,updated_at=? WHERE id=? AND user_id=?').run(next,snooze,atIso,id,owner);return mapRunRow(db.prepare(runSelect+' WHERE id=? AND user_id=?').get(id,owner));
}

export function applyRoutineRunRetention(db,{userId,before,now=new Date(),limit=500}={}){
  const owner=identifier(userId,'user_id'),cutoff=iso(before,'before'),atIso=iso(now,'now');if(!Number.isInteger(limit)||limit<1||limit>5_000)throw routineError('invalid_limit');return runTransaction(db,()=>{const ids=db.prepare("SELECT id FROM personal_routine_runs WHERE user_id=? AND status<>'RUNNING' AND (finished_at<? OR (inbox_expires_at IS NOT NULL AND inbox_expires_at<=?)) ORDER BY finished_at LIMIT ?").all(owner,cutoff,atIso,limit).map(row=>row.id),remove=db.prepare('DELETE FROM personal_routine_runs WHERE id=? AND user_id=?');let deleted=0;for(const id of ids)deleted+=Number(remove.run(id,owner).changes);return {userId:owner,deleted};});
}

export const personalRoutineInternals=Object.freeze({resultHash,canonicalStable,defaultStaleMs,defaultInboxDays});
