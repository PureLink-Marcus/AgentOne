import { createHash } from 'node:crypto';

const EXECUTABLE_ACTIONS=new Set(['morning-briefing','mail-summary','nudge-review']);
const SOURCE_IDS=new Set(['mail','calendar','health']);
const SIGNAL_COPY=Object.freeze({
  'mail.daily-triage':Object.freeze({domain:'mail',title:'Posteingang ausgewertet',summary:'Neue Nachrichten wurden nach Handlungsbedarf und Herkunft gebündelt.',target:'tools:mail'}),
  'calendar.next-24h':Object.freeze({domain:'calendar',title:'Die nächsten 24 Stunden',summary:'Termine, Belegung und mögliche Überschneidungen wurden read-only geprüft.',target:'tasks:planning'}),
  'health.weekly-pattern':Object.freeze({domain:'health',title:'Persönliches Gesundheitsmuster',summary:'Der eigene Verlauf wurde quellen- und methodengetrennt mit der persönlichen Basis verglichen.',target:'tools:health'}),
  'cross.recovery-schedule':Object.freeze({domain:'planning',title:'Tageslast und Körpermuster',summary:'Terminlast und persönliche Verlaufssignale wurden gemeinsam geprüft; es wurde nichts verändert.',target:'tasks:planning'}),
});

function routineBriefingError(message,code='ROUTINE_BRIEFING_INVALID',status=400){return Object.assign(new Error(message),{code,status});}
function safeTimestamp(value){const date=value instanceof Date?value:new Date(value);if(!Number.isFinite(date.getTime()))throw routineBriefingError('generatedAt ist ungültig');return date.toISOString();}
function safeInteger(value,max=1_000_000){const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(max,Math.trunc(number))):0;}
function safeConfidence(value){const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(1,Math.round(number*1000)/1000)):0;}
function safeStatus(value){const status=String(value||'UNKNOWN').toUpperCase();return /^[A-Z][A-Z0-9_]{1,39}$/.test(status)?status:'UNKNOWN';}
function safeId(value,max=191){const id=String(value||'').trim();return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)&&id.length<=max?id:null;}
function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';}
function digest(value){return createHash('sha256').update(canonical(value)).digest('hex');}

export function buildRoutineBriefingResult({routine,intelligence,commandRunId=null,now=new Date()}={}){
  if(!routine||typeof routine!=='object')throw routineBriefingError('Routine fehlt');
  const action=String(routine.action||'');
  if(!EXECUTABLE_ACTIONS.has(action))throw routineBriefingError('Diese Routine besitzt noch keinen echten read-only Ausführungspfad','ROUTINE_ACTION_NOT_EXECUTABLE',409);
  if(!intelligence||typeof intelligence!=='object')throw routineBriefingError('Personal Intelligence fehlt');
  const generatedAt=safeTimestamp(intelligence.generatedAt||now),summaryInput=intelligence.summary&&typeof intelligence.summary==='object'?intelligence.summary:{};
  const sources=(Array.isArray(intelligence.sources)?intelligence.sources:[]).filter(source=>SOURCE_IDS.has(String(source?.id))).map(source=>Object.freeze({
    id:String(source.id),
    status:safeStatus(source.status),
    records:safeInteger(source.records),
    accounts:safeInteger(source.accounts,100),
    calendars:safeInteger(source.calendars,100),
  }));
  const allowedDomains=action==='mail-summary'?new Set(['mail']):action==='nudge-review'?new Set(['mail','calendar','health','planning']):new Set(['mail','calendar','health','planning']);
  const insights=[];
  for(const signal of Array.isArray(intelligence.signals)?intelligence.signals:[]){
    const copy=SIGNAL_COPY[String(signal?.id||'')];if(!copy||!allowedDomains.has(copy.domain))continue;
    const evidence=Array.isArray(signal.evidence)?signal.evidence:[],evidenceSources=[...new Set(evidence.map(item=>String(item?.source||'')).filter(source=>/^[a-z][a-z0-9._-]{1,79}$/i.test(source)))].slice(0,12);
    insights.push(Object.freeze({id:String(signal.id),domain:copy.domain,severity:signal.severity==='attention'?'attention':'info',title:copy.title,summary:copy.summary,confidence:safeConfidence(signal.confidence),evidenceCount:Math.min(1000,evidence.length),sources:evidenceSources,target:copy.target}));
  }
  const filteredSources=action==='mail-summary'?sources.filter(source=>source.id==='mail'):sources;
  const projection={
    schema:'agentone.personal-routine-result/v2',
    routineId:safeId(routine.id)||'routine',
    action,
    mode:'READ_ONLY',
    generatedAt,
    commandRunId:safeId(commandRunId),
    title:action==='mail-summary'?'Dein Postfach seit dem letzten Lauf':action==='nudge-review'?'Neue persönliche Hinweise':'Dein geplanter Überblick',
    summary:Object.freeze({
      events:safeInteger(intelligence.eventCount,100_000),
      signals:insights.length,
      attention:insights.filter(item=>item.severity==='attention').length,
      informational:insights.filter(item=>item.severity==='info').length,
      ledgerEvents:safeInteger(intelligence.ledger?.total,100_000),
    }),
    sources:Object.freeze(filteredSources),
    insights:Object.freeze(insights.slice(0,12)),
    mutations:Object.freeze([]),
    policy:Object.freeze({readOnly:true,bodyStored:false,rawHealthValuesStored:false,piiStored:false,medicalDiagnosis:false,secretsExposed:false}),
  };
  return Object.freeze({...projection,contentHash:digest(projection)});
}

export const personalRoutineBriefingInternals=Object.freeze({EXECUTABLE_ACTIONS,SIGNAL_COPY,canonical,digest});
