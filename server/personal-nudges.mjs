const levels={low:1,normal:2,high:3,critical:4};

export function initNudgeStore(db){db.exec(`CREATE TABLE IF NOT EXISTS personal_nudge_settings(user_id TEXT PRIMARY KEY,settings TEXT NOT NULL,updated_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS personal_nudge_feedback(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,nudge_id TEXT NOT NULL,value TEXT NOT NULL,created_at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS personal_nudge_feedback_user ON personal_nudge_feedback(user_id,created_at DESC);`);}

export function loadNudgeSettings(db,userId){const row=db.prepare('SELECT settings,updated_at as updatedAt FROM personal_nudge_settings WHERE user_id=?').get(userId);return {...normalizeNudgeSettings(row?JSON.parse(row.settings):{}),updatedAt:row?.updatedAt||null};}

export function saveNudgeSettings(db,userId,input){const settings=normalizeNudgeSettings(input),updatedAt=new Date().toISOString();db.prepare('INSERT INTO personal_nudge_settings(user_id,settings,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET settings=excluded.settings,updated_at=excluded.updated_at').run(userId,JSON.stringify(settings),updatedAt);return {...settings,updatedAt};}

export function recordNudgeFeedback(db,{id,userId,nudgeId,value}){if(!/^[a-z0-9][a-z0-9._-]{1,120}$/i.test(String(nudgeId||''))||!['helpful','not_helpful','wrong','later','never','dismissed'].includes(value))throw Object.assign(new Error('invalid_nudge_feedback'),{status:400});const createdAt=new Date().toISOString();db.prepare('INSERT INTO personal_nudge_feedback(id,user_id,nudge_id,value,created_at) VALUES(?,?,?,?,?)').run(id,userId,nudgeId,value,createdAt);return {id,nudgeId,value,createdAt};}

export function dismissedNudgeIds(db,userId){return new Set(db.prepare("SELECT DISTINCT nudge_id FROM personal_nudge_feedback WHERE user_id=? AND value IN ('dismissed','never') ORDER BY nudge_id ASC").all(userId).map(row=>row.nudge_id));}

export function loadNudgeFeedbackProfile(db,userId,{now=new Date(),laterHours=12,wrongHours=24}={}){
  const current=now instanceof Date?now:new Date(now);
  if(Number.isNaN(current.getTime()))throw new TypeError('now must be a valid date');
  const latest=new Map();
  for(const row of db.prepare('SELECT nudge_id as nudgeId,value,created_at as createdAt FROM personal_nudge_feedback WHERE user_id=? ORDER BY created_at ASC,id ASC').all(userId))latest.set(row.nudgeId,row);
  const decisions={};
  for(const [nudgeId,row] of latest){
    const createdAt=new Date(row.createdAt),age=current.getTime()-createdAt.getTime();
    let effect='none';
    if(row.value==='never'||row.value==='dismissed')effect='hidden';
    else if(row.value==='later'&&age<laterHours*3_600_000)effect='snoozed';
    else if(row.value==='wrong'&&age<wrongHours*3_600_000)effect='wrong-cooldown';
    else if(row.value==='not_helpful')effect='deprioritized';
    decisions[nudgeId]={value:row.value,effect,createdAt:row.createdAt};
  }
  return decisions;
}

export function applyNudgeFeedback(items,profile={}){
  return items.flatMap(item=>{
    const decision=profile[item.id];
    if(['hidden','snoozed','wrong-cooldown'].includes(decision?.effect))return [];
    if(decision?.effect==='deprioritized')return [{...item,severity:item.severity==='attention'?'info':item.severity,priority:item.priority==='critical'?'high':'low',feedbackEffect:'deprioritized'}];
    return [{...item,feedbackEffect:decision?.value==='helpful'?'confirmed':null}];
  });
}

export function resetNudgeFeedback(db,userId){const result=db.prepare('DELETE FROM personal_nudge_feedback WHERE user_id=?').run(userId);return {deleted:Number(result.changes||0)};}

export function normalizeNudgeSettings(input={}){
  const quietHours=/^(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(input.quietHours||''))?String(input.quietHours):'22:00-07:00';
  const minimumPriority=levels[input.minimumPriority]?input.minimumPriority:'normal';
  const channels=Array.isArray(input.channels)?[...new Set(input.channels.map(String))].filter(value=>['in-app','pwa','ntfy','telegram'].includes(value)):['in-app'];
  if(!channels.includes('in-app'))channels.unshift('in-app');
  return {enabled:input.enabled!==false,quietHours,minimumPriority,channels:channels.slice(0,4)};
}

export function quietNow(quietHours,date=new Date()){
  const [start,end]=quietHours.split('-').map(value=>{const [hour,minute]=value.split(':').map(Number);return hour*60+minute;}),now=date.getHours()*60+date.getMinutes();
  return start===end?false:start<end?now>=start&&now<end:now>=start||now<end;
}

export function buildPersonalNudges({connectors=[],mailAccounts=[],audit=[],gates=[]}={}){
  const items=[];
  if(!mailAccounts.length)items.push({id:'setup-mail',priority:'normal',category:'setup',title:'Postfach verbinden',summary:'Gmail oder IMAP read-only einrichten, damit das Briefing echte Nachrichten gruppieren kann.',action:'tools'});
  for(const connector of connectors.filter(item=>item.status==='DEGRADED').slice(0,3))items.push({id:'connector-'+connector.id,priority:'high',category:'connector',title:(connector.label||connector.id)+' prüfen',summary:'Die letzte Verbindungsprüfung ist fehlgeschlagen.',action:'tools'});
  for(const gate of gates.filter(item=>String(item.status).toUpperCase()==='PENDING').slice(0,3))items.push({id:'gate-'+gate.id,priority:'high',category:'approval',title:gate.title||'Freigabe erforderlich',summary:gate.reason||'Eine Aktion wartet auf deine Entscheidung.',action:'tasks'});
  const recentFailure=audit.find(item=>['ERROR','DENIED','FAILED'].includes(String(item.outcome).toUpperCase()));if(recentFailure)items.push({id:'audit-'+recentFailure.id,priority:'high',category:'security',title:'Verbindung benötigt Aufmerksamkeit',summary:String(recentFailure.action||'Connector-Prüfung')+' wurde nicht erfolgreich abgeschlossen.',action:'tools'});
  return items;
}

export function filterPersonalNudges(items,settings){const threshold=levels[settings.minimumPriority]||2;return settings.enabled?items.filter(item=>(levels[item.priority]||1)>=threshold):[];}
