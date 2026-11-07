const ID=/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,191}$/;
const KEY=/^[a-f0-9]{64}$/;
const DOMAINS=new Set(['mail','calendar','health','planning','home','personal']);
const SEVERITIES=new Set(['info','attention']);
const WINDOWS=Object.freeze({'mail.daily-triage':'LETZTE 24 STUNDEN','calendar.next-24h':'NÄCHSTE 24 STUNDEN','health.weekly-pattern':'7 TAGE GEGEN 28-TAGE-BASIS','cross.recovery-schedule':'NÄCHSTE 24 STUNDEN + 35 TAGE','cross.mail-calendar-pressure':'NÄCHSTE 24 STUNDEN'});

function patternError(message,code='PERSONAL_PATTERN_INVALID',status=400){return Object.assign(new Error(message),{code,status});}
function identifier(value,field){const result=String(value??'').trim();if(!ID.test(result))throw patternError(`${field} ist ungültig`);return result;}
function text(value,max){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function number(value,min,max){const result=Number(value);return Number.isFinite(result)?Math.max(min,Math.min(max,result)):min;}
function instant(value=new Date()){const result=value instanceof Date?value:new Date(value);if(!Number.isFinite(result.getTime()))throw patternError('Zeitstempel ist ungültig');return result.toISOString();}
function safeSources(evidence=[]){const counts=new Map();for(const item of Array.isArray(evidence)?evidence.slice(0,200):[]){const source=text(item?.source,80);if(source)counts.set(source,(counts.get(source)||0)+1);}return [...counts].sort(([left],[right])=>left.localeCompare(right)).map(([id,count])=>Object.freeze({id,count}));}
function safeActions(actions=[]){return (Array.isArray(actions)?actions:[]).slice(0,4).flatMap(item=>{const type=text(item?.type,48),target=text(item?.target,100),label=text(item?.label,100);return type&&target&&label?[Object.freeze({type,target,label})]:[];});}

export function projectPersonalSignal(signal){
  if(!signal||typeof signal!=='object')throw patternError('Signal fehlt');
  const id=identifier(signal.id,'signal.id'),notificationKey=String(signal.notificationKey||'').toLowerCase();if(!KEY.test(notificationKey))throw patternError('notificationKey ist ungültig');
  const domain=DOMAINS.has(signal.domain)?signal.domain:'personal',severity=SEVERITIES.has(signal.severity)?signal.severity:'info',sources=safeSources(signal.evidence),evidenceCount=sources.reduce((sum,item)=>sum+item.count,0),confidence=number(signal.confidence,0,1);
  return Object.freeze({id,domain,severity,title:text(signal.title,180),summary:text(signal.summary,600),disclaimer:text(signal.disclaimer,300)||undefined,actions:Object.freeze(safeActions(signal.actions)),notificationKey,confidence,feedbackEffect:['confirmed','deprioritized'].includes(signal.feedbackEffect)?signal.feedbackEffect:null,why:Object.freeze({ruleId:id,window:WINDOWS[id]||'AKTUELLER DATENSTAND',evidenceCount,sources:Object.freeze(sources),confidencePercent:Math.round(confidence*100),counterEvidence:Object.freeze((Array.isArray(signal.counterEvidence)?signal.counterEvidence:[]).slice(0,5).map(value=>text(value,160)).filter(Boolean))})});
}

export function initPersonalPatternFeed(db){db.exec(`
  CREATE TABLE IF NOT EXISTS personal_pattern_feed(
    user_id TEXT NOT NULL,
    notification_key TEXT NOT NULL,
    signal_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    window_label TEXT NOT NULL,
    sources_json TEXT NOT NULL,
    evidence_count INTEGER NOT NULL,
    confidence REAL NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY(user_id,notification_key)
  );
  CREATE INDEX IF NOT EXISTS personal_pattern_feed_user_last ON personal_pattern_feed(user_id,last_seen_at DESC);
`);}

export function recordPersonalPatterns(db,{userId,signals=[],generatedAt=new Date()}={}){
  const owner=identifier(userId,'userId'),at=instant(generatedAt);if(!Array.isArray(signals)||signals.length>100)throw patternError('signals ist ungültig');
  const rows=signals.map(projectPersonalSignal),statement=db.prepare(`INSERT INTO personal_pattern_feed(user_id,notification_key,signal_id,domain,severity,title,summary,rule_id,window_label,sources_json,evidence_count,confidence,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,notification_key) DO UPDATE SET severity=excluded.severity,title=excluded.title,summary=excluded.summary,sources_json=excluded.sources_json,evidence_count=excluded.evidence_count,confidence=excluded.confidence,last_seen_at=excluded.last_seen_at`);
  db.exec('BEGIN IMMEDIATE');try{for(const row of rows)statement.run(owner,row.notificationKey,row.id,row.domain,row.severity,row.title,row.summary,row.why.ruleId,row.why.window,JSON.stringify(row.why.sources),row.why.evidenceCount,row.confidence,at,at);db.exec('COMMIT');}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
  return {recorded:rows.length,generatedAt:at};
}

export function listPersonalPatterns(db,{userId,limit=20,feedbackProfile={}}={}){
  const owner=identifier(userId,'userId'),safeLimit=Math.trunc(Number(limit));if(!Number.isInteger(safeLimit)||safeLimit<1||safeLimit>50)throw patternError('limit ist ungültig');
  return db.prepare(`SELECT notification_key AS notificationKey,signal_id AS signalId,domain,severity,title,summary,rule_id AS ruleId,window_label AS windowLabel,sources_json AS sourcesJson,evidence_count AS evidenceCount,confidence,first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt FROM personal_pattern_feed WHERE user_id=? ORDER BY last_seen_at DESC,notification_key DESC LIMIT ?`).all(owner,safeLimit).map(row=>{let sources=[];try{sources=JSON.parse(row.sourcesJson);}catch{}const decision=feedbackProfile[row.signalId]||null;return Object.freeze({signalId:row.signalId,domain:row.domain,severity:decision?.effect==='deprioritized'?'info':row.severity,title:row.title,summary:row.summary,why:Object.freeze({ruleId:row.ruleId,window:row.windowLabel,evidenceCount:Number(row.evidenceCount),sources:Object.freeze(Array.isArray(sources)?sources:[]),confidencePercent:Math.round(number(row.confidence,0,1)*100)}),feedback:decision?Object.freeze({value:decision.value,effect:decision.effect,createdAt:decision.createdAt}):null,state:['hidden','snoozed','wrong-cooldown'].includes(decision?.effect)?String(decision.effect).toUpperCase():'VISIBLE',firstSeenAt:row.firstSeenAt,lastSeenAt:row.lastSeenAt});});
}

export function applyPersonalPatternRetention(db,{userId,before}={}){const owner=identifier(userId,'userId'),threshold=instant(before),result=db.prepare('DELETE FROM personal_pattern_feed WHERE user_id=? AND last_seen_at<?').run(owner,threshold);return {deleted:Number(result.changes||0),before:threshold};}

export const personalPatternFeedInternals=Object.freeze({WINDOWS,safeSources});
