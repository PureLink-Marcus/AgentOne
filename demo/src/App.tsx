import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Bootstrap, Integration, Page, Persona, Theme, World } from './types';
import { Platform } from './Platform';

const provisionLabels=['PureLink-Konto verifiziert','Persönliches Gateway geplant','Volume und Quellenbereich angelegt','Kanäle vorbereitet','AgentOne Personal gestartet'];
const channels=[['WEB','Live','live'],['TEAMS','Bereit','sim'],['OUTLOOK','Bereit','sim'],['WHATSAPP','Simulation','sim'],['TELEGRAM','Simulation','sim'],['SLACK','Simulation','sim'],['DISCORD','Simulation','sim']];
const agents=[['R','Research','18 Quellen'],['C','Content','4 Entwürfe'],['A','Audit','1 Review'],['P','Publisher','wartet']];

export default function App(){
  const initialQuery=useMemo(()=>new URLSearchParams(location.search),[]);
  const shot=initialQuery.get('shot')||'';
  const shotPage=shot.startsWith('personal')?'personal':shot.startsWith('admin')?'admin':shot.startsWith('integrations')?'integrations':'worlds';
  const initialPage=(['platform','worlds','personal','admin','integrations'].includes(initialQuery.get('page')||'')?initialQuery.get('page'):shotPage) as Page;
  const [data,setData]=useState<Bootstrap|null>(null);
  const [theme,setTheme]=useState<Theme>(initialQuery.get('theme')==='light'||shot.endsWith('light')?'light':'dark');
  const [page,setPage]=useState<Page>(initialPage);
  const [persona,setPersona]=useState<Persona|null>(null);
  const [auth,setAuth]=useState<'login'|'provision'|'app'>(initialQuery.get('demo')==='1'||Boolean(shot)?'app':'login');
  const [step,setStep]=useState(-1);
  const [selectedWorld,setSelectedWorld]=useState<World|null>(null);
  const [inside,setInside]=useState(initialQuery.get('inside')==='1'||shot.startsWith('inside'));
  const [toast,setToast]=useState('');
  const [inspect,setInspect]=useState<string|null>(null);
  const [instanceStatus,setInstanceStatus]=useState<Record<string,string>>({marcus:'ACTIVE',lea:'ACTIVE',tom:'DEGRADED'});
  const [platformEnv,setPlatformEnv]=useState<'agentone-main'|'agentone-dev'>('agentone-dev');
  const [personalEnv,setPersonalEnv]=useState<'agentone-personal-main'|'agentone-personal-dev'>('agentone-personal-dev');

  const refresh=()=>api.bootstrap().then(result=>{setData(result);setSelectedWorld(current=>current||result.worlds[0]);});
  useEffect(()=>{refresh().then(()=>{if(initialQuery.get('demo')==='1'||shot)setPersona(current=>current||{id:'marcus',name:'Marcus Wartenberg',email:'marcus@purelink.de',role:'Platform Admin',initials:'MW'});}).catch(error=>setToast(error.message));},[]);
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),3400);return()=>clearTimeout(id);},[toast]);

  async function login(credentials?:{username:string;password:string}){
    if(!persona&&!credentials)return;
    let activePersona=persona;
    try{const result=await api.login(activePersona?{personaId:activePersona.id}:credentials!);activePersona=result.persona;setPersona(activePersona);setAuth('provision');setStep(0);await refresh();}catch(error){setToast(String(error));setAuth('login');return;}
    for(let i=0;i<provisionLabels.length;i++) await new Promise<void>(resolve=>setTimeout(()=>{setStep(i);resolve();},520));
    setTimeout(()=>setAuth('app'),420);
  }

  if(!data)return <div className={`boot theme-${theme}`}><div className="boot-mark">A1</div><p>Hybrid Demo wird initialisiert …</p></div>;
  if(auth==='login')return <Login data={data} theme={theme} setTheme={setTheme} persona={persona} setPersona={setPersona} login={login}/>;
  if(auth==='provision')return <Provision persona={persona!} step={step} theme={theme}/>;

  return <div className={`app theme-${theme}`}>
    <header className="topbar">
      <div className="brand"><span>A1</span><div><b>AgentOne</b><small>CONTROL PLANE · HYBRID DEMO</small></div></div>
      <div className="env-switches">
        <EnvSwitch label="PLATFORM" value={platformEnv} values={['agentone-main','agentone-dev']} setValue={value=>setPlatformEnv(value as typeof platformEnv)}/>
        <EnvSwitch label="PERSONAL" value={personalEnv} values={['agentone-personal-main','agentone-personal-dev']} setValue={value=>setPersonalEnv(value as typeof personalEnv)}/>
      </div>
      <div className="top-actions"><span className="system-ok"><i/> SYSTEM NOMINAL</span><button onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?'☀':'◐'}</button><div className="avatar">{persona?.initials}</div></div>
    </header>
    <aside className="sidebar">
      <nav>
        <Nav icon="⌬" label="Plattform" active={page==='platform'} onClick={()=>setPage('platform')}/>
        <Nav icon="◉" label="Welten" active={page==='worlds'} onClick={()=>setPage('worlds')}/>
        <Nav icon="✦" label="AgentOne Personal" active={page==='personal'} onClick={()=>setPage('personal')} badge={data.events.filter(e=>e.unread).length}/>
        <Nav icon="⌁" label="Integrationen" active={page==='integrations'} onClick={()=>setPage('integrations')}/>
        <Nav icon="▦" label="Admin Control" active={page==='admin'} onClick={()=>setPage('admin')}/>
      </nav>
      <div className="sidebar-foot"><small>AKTIVE UMGEBUNG</small><b>{platformEnv}</b><b>{personalEnv}</b><span><i/> Demo lokal</span></div>
    </aside>
    <main className="main">
      {page==='platform'&&<Platform data={data} refresh={refresh} setToast={setToast}/>}
      {page==='worlds'&&selectedWorld&&<Worlds data={data} selected={selectedWorld} setSelected={world=>{setSelectedWorld(world);setInside(true);}} inside={inside} setInside={setInside} setToast={setToast}/>}
      {page==='personal'&&<Personal data={data} setToast={setToast}/>}
      {page==='integrations'&&<Integrations data={data} refresh={refresh} setToast={setToast}/>}
      {page==='admin'&&<Admin data={data} inspect={inspect} setInspect={setInspect} status={instanceStatus} setStatus={setInstanceStatus} refresh={refresh} setToast={setToast}/>}
    </main>
    {toast&&<div className="toast"><span>✓</span>{toast}</div>}
  </div>;
}

function EnvSwitch({label,value,values,setValue}:{label:string,value:string,values:string[],setValue:(v:string)=>void}){
  return <label className="env-switch"><small>{label}</small><select value={value} onChange={e=>setValue(e.target.value)}>{values.map(v=><option key={v}>{v}</option>)}</select><i className={value.endsWith('-dev')?'dev':'main'}>{value.endsWith('-dev')?'DEV · MUTABLE':'MAIN · READ ONLY'}</i></label>;
}
function Nav({icon,label,active,onClick,badge}:{icon:string,label:string,active:boolean,onClick:()=>void,badge?:number}){return <button className={active?'active':''} onClick={onClick}><i>{icon}</i><span>{label}</span>{badge?<b>{badge}</b>:null}</button>}

function Login({data,theme,setTheme,persona,setPersona,login}:{data:Bootstrap;theme:Theme;setTheme:(t:Theme)=>void;persona:Persona|null;setPersona:(p:Persona)=>void;login:(credentials?:{username:string;password:string})=>void}){
  const [username,setUsername]=useState('marcus');const [password,setPassword]=useState('');
  return <div className={`login theme-${theme}`}>
    <div className="login-stars"/><div className="login-orbit a"/><div className="login-orbit b"/>
    <header><div className="brand"><span>A1</span><div><b>AgentOne</b><small>PURELINK AGENT PLATFORM</small></div></div><button className="theme-button" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?'HELL':'DUNKEL'}</button></header>
    <section className="login-copy"><span className="kicker">HYBRID DEMO · LOCAL CONTROL PLANE</span><h1>Jede Welt hat<br/>ihren <em>AgentOne.</em></h1><p>Agenten orchestrieren. Connectoren liefern Kontext.<br/>Du behältst Freigaben, Kosten und Ergebnisse im Blick.</p><div className="login-metrics"><span><b>04</b><small>WELTEN</small></span><span><b>12</b><small>AGENTEN</small></span><span><b>07</b><small>RUNS</small></span></div></section>
    <section className="login-card"><div className="login-card-head"><span>A1</span><div><small>{data.auth.passwordEnabled?'SICHERER ZUGANG':'DEMO-ZUGANG'}</small><b>{data.auth.passwordEnabled?'Bei AgentOne Personal anmelden':'PureLink Identität wählen'}</b></div></div><p>{data.auth.passwordEnabled?'Öffne deinen persönlichen Arbeitsraum mit deinem AgentOne-Konto.':'Im Demomodus wird derselbe Provisionierungsablauf wie beim Microsoft-365-Login simuliert.'}</p>{data.auth.passwordEnabled?<form className="credential-login" onSubmit={event=>{event.preventDefault();login({username,password});}}><label>Benutzername<input aria-label="Benutzername" value={username} onChange={event=>setUsername(event.target.value)} autoComplete="username" required/></label><label>Passwort<input aria-label="Passwort" type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" required/></label><button className="primary" type="submit">Sicher anmelden <span>→</span></button></form>:<><div className="persona-list">{data.personas.map(p=><button key={p.id} className={persona?.id===p.id?'selected':''} onClick={()=>setPersona(p)}><i>{p.initials}</i><span><b>{p.name}</b><small>{p.email} · {p.role}</small></span><strong>{persona?.id===p.id?'✓':'›'}</strong></button>)}</div><button className="primary" disabled={!persona} onClick={()=>login()}>Mit PureLink Demo fortfahren <span>→</span></button></>}{data.auth.enabled&&<a className="microsoft-login" href="/api/auth/entra/start"><span>▦</span> Mit Microsoft 365 anmelden <b>↗</b></a>}<div className="login-note"><i/> Tenant + PureLink-Domain · PKCE · serverseitige Session</div></section>
  </div>;
}

function Provision({persona,step,theme}:{persona:Persona;step:number;theme:Theme}){
  return <div className={`provision theme-${theme}`}><div className="provision-core"><div className="pulse-ring r1"/><div className="pulse-ring r2"/><div className="pulse-ring r3"/><span>A1</span></div><small>AGENTONE PERSONAL</small><h1>Dein persönlicher Arbeitsraum entsteht.</h1><p>{persona.name} · {persona.email}</p><div className="provision-steps">{provisionLabels.map((label,i)=><div key={label} className={i<step?'done':i===step?'active':''}><i>{i<step?'✓':i===step?'●':i+1}</i><span>{label}</span><b>{i<step?'BEREIT':i===step?'LÄUFT':'WARTET'}</b></div>)}</div></div>;
}

function PageHead({eyebrow,title,text,actions}:{eyebrow:string,title:string,text:string,actions?:React.ReactNode}){return <header className="page-head"><div><small>{eyebrow}</small><h1>{title}</h1><p>{text}</p></div>{actions&&<div className="page-actions">{actions}</div>}</header>}
function Metric({label,value,tone}:{label:string,value:string|number,tone?:string}){return <div className={`metric ${tone||''}`}><small>{label}</small><b>{value}</b></div>}

function Worlds({data,selected,setSelected,inside,setInside,setToast}:{data:Bootstrap;selected:World;setSelected:(w:World)=>void;inside:boolean;setInside:(v:boolean)=>void;setToast:(s:string)=>void}){
  const [run,setRun]=useState(48); const [running,setRunning]=useState(false);
  useEffect(()=>{if(!running)return;const id=setInterval(()=>setRun(v=>v>=61?(setRunning(false),61):v+1),420);return()=>clearInterval(id);},[running]);
  return <div className="page worlds-page">
    <PageHead eyebrow={`PURELINK / SHOP CONTENT / ${inside?'WELT '+selected.code:'WELTENKARTE'}`} title={inside?`${selected.name}: eine Welt, ein AgentOne.`:'Vier Welten. Vier AgentOne.'} text={inside?'Agenten, Connectoren, Übergaben und Human Gates in einem Arbeitsraum.':'Jede Welt führt ihr eigenes Team und ihre freigegebenen Connectoren.'} actions={<><button className="ghost" onClick={()=>setInside(!inside)}>{inside?'← Außenansicht':'Innenansicht →'}</button><button className="primary small" onClick={()=>{setRunning(!running);setToast(running?'Run pausiert':'Agentenlauf gestartet')}}>{running?'Pausieren':'Run starten'}</button></>}/>
    <div className="metric-row"><Metric label="AKTIVE RUNS" value={running?'08':'07'} tone="blue"/><Metric label="AGENTEN" value="12"/><Metric label="OFFENE GATES" value="01" tone="amber"/><Metric label="KOSTEN HEUTE" value="€ 16,40"/></div>
    <div className="world-layout">
      <section className="world-list"><header><span>WELTEN</span><b>04</b></header>{data.worlds.map((w,i)=><button key={w.id} className={selected.id===w.id?'active':''} onClick={()=>setSelected(w)}><i>A1</i><span><b>{w.name}</b><small>{w.agents} Agenten · {w.runs} Runs</small></span><strong className={w.state==='GATE'?'warn':''}>{w.state==='GATE'?'!':w.progress+'%'}</strong></button>)}<div className="boundary"><small>VERTRAUENSGRENZE</small><p>Jede Welt besitzt einen eigenen Orchestrator, Kontext und freigegebene Connectoren.</p></div></section>
      <section className={`galaxy ${inside?'inside':''}`}>
        <div className="grid-lines"/><div className="galaxy-label">{inside?'WORLD BOUNDARY / '+selected.code:'PROJECT / SHOP_CONTENT / ORBIT GRID'}</div>
        {!inside?data.worlds.map((w,i)=><WorldNode key={w.id} world={w} index={i} selected={selected.id===w.id} onClick={()=>setSelected(w)}/>):<InsideWorld world={selected} progress={run}/>}
        {!inside&&<svg className="connections" viewBox="0 0 900 620"><path d="M210 180 C350 100, 515 115, 655 205"/><path d="M235 210 C280 355, 390 440, 505 475"/><path d="M660 235 C690 355, 625 435, 530 485"/></svg>}
      </section>
      <section className="world-panel"><header><i>A1</i><div><small>AGENTONE DIESER WELT</small><b>{selected.name}</b></div><span>LIVE</span></header><div className="world-code">W-{selected.id.toUpperCase()} / {selected.code}</div><article className="chat user"><small>DU · 10:31</small><p>Was machen die Agenten gerade?</p></article><article className="chat agent"><small>AGENTONE · 10:31</small><p>Research hat Quellen an Content übergeben. Audit prüft den nächsten Batch parallel.</p><div className="handoff"><i>R</i><span>18 →</span><i>C</i><span>4 →</span><i>A</i></div><b>Keine offenen Konflikte</b></article><div className="next-step"><small>NÄCHSTER SCHRITT</small><b>MERGE → SNAPSHOT → GATE → PUSH</b></div><div className="connector-tags">{selected.connectors.map(c=><span key={c}>⌁ {c}</span>)}</div><footer><input aria-label="AgentOne fragen" placeholder="AgentOne dieser Welt fragen …"/><button onClick={()=>setToast('Demo-Nachricht an Welt-AgentOne übergeben')}>↑</button></footer></section>
    </div>
  </div>;
}

function WorldNode({world,index,selected,onClick}:{world:World;index:number;selected:boolean;onClick:()=>void}){return <button className={`world-node n${index+1} ${selected?'selected':''} ${world.state==='GATE'?'gate':''}`} onClick={onClick}><span className="node-orbit"/><i>A1</i><b>{world.name}</b><small>{world.agents} AGENTS · {world.progress}%</small><em>{world.state}</em></button>}
function InsideWorld({world,progress}:{world:World;progress:number}){return <div className="inside-map"><div className="core-orbit o1"/><div className="core-orbit o2"/><div className="core"><span>A1</span><small>DIESE WELT</small></div>{agents.map((a,i)=><div key={a[0]} className={`agent-node a${i+1}`}><i>{a[0]}</i><b>{a[1]}</b><small>{a[2]}</small></div>)}<div className="connector-node c1">ERP<small>READ</small></div><div className="connector-node c2">SHOP<small>GATE</small></div><div className="run-progress"><span style={{width:`${Math.min(progress,100)}%`}}/><b>{progress} / 120</b><small>OUTPUTS</small></div></div>}

function Personal({data,setToast}:{data:Bootstrap;setToast:(s:string)=>void}){
  const [tab,setTab]=useState<'inbox'|'memory'|'sources'>('inbox');const [messages,setMessages]=useState<Array<{role:'assistant'|'user';text:string;model?:string}>>([{role:'assistant',text:'Guten Morgen. Drei Welten haben neue Ergebnisse. Publish wartet auf deine Freigabe.'}]);const [input,setInput]=useState('');const [sending,setSending]=useState(false);
  async function send(){const prompt=input.trim();if(!prompt||sending)return;setMessages(v=>[...v,{role:'user',text:prompt}]);setInput('');setSending(true);try{const result=await api.personalChat(prompt);setMessages(v=>[...v,{role:'assistant',text:result.text,model:`${result.mode} · ${result.model}`}]);}catch(error){setToast(String(error));}finally{setSending(false);}}
  return <div className="page personal-page"><PageHead eyebrow="AGENTONE PERSONAL / PERSÖNLICHER ARBEITSRAUM" title="Ein AgentOne für deine Themen." text="Ergebnisse aus allen berechtigten Welten, Quellen und Kanälen an einem Ort." actions={<button className="primary small" onClick={()=>setToast('Neue persönliche Aufgabe angelegt')}>+ Neue Aufgabe</button>}/>
    <div className="personal-grid"><section className="personal-nav"><div className="personal-id"><div className="personal-orb">A1</div><small>DEIN AGENTONE</small><b>Online · 7 Kanäle</b></div><button className={tab==='inbox'?'active':''} onClick={()=>setTab('inbox')}>Ergebnis-Inbox <b>2</b></button><button className={tab==='memory'?'active':''} onClick={()=>setTab('memory')}>Memory <span>28</span></button><button className={tab==='sources'?'active':''} onClick={()=>setTab('sources')}>Quellen <span>14</span></button><div className="topic-list"><small>THEMEN</small>{['Shop Content','Produktstrategie','Bildqualität','Release Operations'].map((t,i)=><span key={t}><i style={{background:['#005ae5','#8b5cf6','#10b981','#f59e0b'][i]}}/>{t}</span>)}</div></section>
      <section className="personal-content"><header><div><small>{tab.toUpperCase()}</small><h2>{tab==='inbox'?'Agentenergebnisse':tab==='memory'?'Was AgentOne behält':'Verbundene Wissensquellen'}</h2></div><span>HEUTE · 4 EREIGNISSE</span></header>{tab==='inbox'&&<div className="result-list">{data.events.map(e=><article key={e.id} className={e.unread?'unread':''}><i>{e.type==='APPROVAL'?'!':'✓'}</i><div><small>{data.worlds.find(w=>w.id===e.worldId)?.name} · {e.type}</small><h3>{e.title}</h3><p>{e.summary}</p><footer><span>{e.createdAt}</span><span>{e.sensitivity}</span><button onClick={()=>setToast('Ergebnis an AgentOne Personal übergeben')}>Weiterarbeiten →</button></footer></div></article>)}</div>}{tab==='memory'&&<Memory/>}{tab==='sources'&&<Sources data={data}/>}</section>
      <section className="personal-chat"><header><i>A1</i><div><small>AGENTONE PERSONAL</small><b>Dein täglicher Begleiter</b></div><span><i/> LIVE</span></header><div className="chat-stream">{messages.map((m,i)=><article key={i} className={m.role==='user'?'mine':'a1'}><small>{m.role==='user'?'DU':'AGENTONE'} · {m.model||'JETZT'}</small><p>{m.text}</p></article>)}{sending&&<article className="a1"><small>AGENTONE · LUNA</small><p>Ich denke nach …</p></article>}<div className="briefing"><small>HEUTIGES BRIEFING</small><div><span><b>2</b> neue Ergebnisse</span><span><b>1</b> offene Freigabe</span><span><b>0</b> Konflikte</span></div></div></div><footer><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} disabled={sending} placeholder="Frag deinen AgentOne …"/><button onClick={send} disabled={sending}>↑</button></footer></section>
    </div><div className="channel-strip"><small>KANÄLE</small>{channels.map(c=><span key={c[0]} className={c[2]}><i/>{c[0]}<b>{c[1]}</b></span>)}</div></div>;
}
function Memory(){return <div className="memory-grid">{[['Arbeitsstil','Kurze Statusupdates, Entscheidungen mit Kontext.'],['Freigaben','Produktions-Push immer mit Human Gate.'],['Prioritäten','Shop Content vor Kategorie-Sync.'],['Tagesbriefing','Werktags um 08:30 über Teams.']].map(x=><article key={x[0]}><small>MEMORY</small><h3>{x[0]}</h3><p>{x[1]}</p><button>Bearbeiten</button></article>)}</div>}
function Sources({data}:{data:Bootstrap}){return <div className="source-grid">{data.integrations.slice(0,8).map(i=><article key={i.id}><i className={i.status.toLowerCase()}/><div><b>{i.name}</b><small>{i.category}</small></div><span>{i.status}</span></article>)}</div>}

function Integrations({data,refresh,setToast}:{data:Bootstrap;refresh:()=>void;setToast:(s:string)=>void}){
  const [busy,setBusy]=useState(''); const groups=useMemo(()=>Array.from(new Set(data.integrations.map(i=>i.category))),[data]);
  async function mode(item:Integration,value:string){setBusy(item.id);try{await api.integrationMode(item.id,value);await refresh();setToast(`${item.name}: ${value}`)}catch(e){setToast(String(e))}finally{setBusy('')}}
  async function health(item:Integration){setBusy(item.id);try{const result=await api.integrationHealth(item.id);await refresh();setToast(`${item.name}: ${result.integration.status}`)}catch(e){setToast(String(e))}finally{setBusy('')}}
  return <div className="page integrations-page"><PageHead eyebrow="INTEGRATION LAB / SICHERE ADAPTER" title="Live, wenn sicher. Simulation, wenn nötig." text="Einheitliche Schemas halten alle Abläufe vollständig demonstrierbar." actions={<div className="legend"><span className="live">LIVE</span><span className="simulated">SIMULATED</span><span className="degraded">DEGRADED</span><span className="disabled">DISABLED</span></div>}/>
    <div className="integration-summary"><Metric label="KONFIGURIERT" value={data.integrations.filter(i=>i.configured).length}/><Metric label="LIVE" value={data.integrations.filter(i=>i.status==='LIVE').length} tone="green"/><Metric label="SIMULIERT" value={data.integrations.filter(i=>i.status==='SIMULATED').length} tone="blue"/><Metric label="SCHREIBPFAD" value="BLOCKIERT" tone="amber"/></div>
    {groups.map(group=><section className="integration-group" key={group}><header><h2>{group}</h2><span>{data.integrations.filter(i=>i.category===group).length} ADAPTER</span></header><div className="integration-grid">{data.integrations.filter(i=>i.category===group).map(item=><article key={item.id}><header><div className="integration-icon">⌁</div><div><h3>{item.name}</h3><small>{item.configured?'Konfiguration erkannt':'Konfiguration unvollständig'}</small></div><b className={item.status.toLowerCase()}>{item.status}</b></header><p>{item.note}</p><div className="capabilities">{item.capabilities.map(c=><span key={c}>{c}</span>)}</div><div className="requirements"><small>ERFORDERLICHE NAMEN</small><code>{item.requirements.join(' · ')}</code></div><footer><select aria-label={`${item.name} Modus`} value={item.mode} disabled={busy===item.id} onChange={e=>mode(item,e.target.value)}><option value="auto">AUTO</option><option value="live">LIVE</option><option value="simulated">SIMULATED</option><option value="disabled">DISABLED</option></select><button disabled={busy===item.id||item.mode==='disabled'} onClick={()=>health(item)}>{busy===item.id?'Prüfe …':'Healthcheck'}</button>{item.latency!==null&&<span>{item.latency} ms</span>}</footer></article>)}</div></section>)}
  </div>;
}

function Admin({data,inspect,setInspect,status,setStatus,refresh,setToast}:{data:Bootstrap;inspect:string|null;setInspect:(s:string|null)=>void;status:Record<string,string>;setStatus:(v:Record<string,string>)=>void;refresh:()=>void;setToast:(s:string)=>void}){
  const [secrets,setSecrets]=useState<Array<{name:string;group:string;configured:boolean;classification:string;source:string;valueVisible:boolean;rotation:string}>>([]);
  const instances=data.personas.map((p,i)=>({...p,status:status[p.id],version:'2026.10.'+(28-i),uptime:['18d 04h','7d 11h','2h 18m'][i],storage:['2.8 GB','1.4 GB','980 MB'][i],cost:['€ 48,20','€ 31,60','€ 18,90'][i]}));
  async function action(id:string,value:string){try{const result=await api.adminAction(id,value);setStatus({...status,[id]:result.status});await refresh();setToast(`${id}: ${value} → ${result.status}`)}catch(e){setToast(String(e))}}
  async function openSession(id:string){await api.auditSession(id);await refresh();setInspect(id)}
  return <div className="page admin-page"><PageHead eyebrow="ADMIN CONTROL CENTER / FLEET" title="Drei Benutzer. Drei Vertrauensgrenzen." text="Instanzen, Sessions, Kosten und Audit zentral steuern." actions={<button className="ghost" onClick={()=>refresh()}>↻ Aktualisieren</button>}/><div className="metric-row"><Metric label="BENUTZER" value={data.stats.users}/><Metric label="GATEWAYS" value={data.stats.gateways} tone="blue"/><Metric label="SECRETS KONFIGURIERT" value={`${data.secretStats.configured}/${data.secretStats.total}`} tone="green"/><Metric label="SECRETS EXPONIERT" value={data.secretStats.exposed} tone="amber"/></div>
    <section className="admin-section"><header><div><small>PERSONAL GATEWAYS</small><h2>Instanzen</h2></div><span>Ein Container pro Benutzer</span></header><div className="instance-table"><div className="tr th"><span>BENUTZER</span><span>STATUS</span><span>VERSION</span><span>UPTIME</span><span>SPEICHER</span><span>KOSTEN</span><span>AKTION</span></div>{instances.map(x=><div className="tr" key={x.id}><span className="user-cell"><i>{x.initials}</i><b>{x.name}<small>{x.email}</small></b></span><span><b className={`status ${x.status.toLowerCase()}`}><i/>{x.status}</b></span><span>{x.version}</span><span>{x.uptime}</span><span>{x.storage}</span><span>{x.cost}</span><span><select aria-label={`${x.name} Aktion`} defaultValue="" onChange={e=>{if(e.target.value)action(x.id,e.target.value);e.target.value=''}}><option value="" disabled>Aktion …</option><option value="restart">Neustart</option><option value="suspend">Sperren</option><option value="rebuild">Runtime neu</option><option value="quarantine">Quarantäne</option><option value="restore">Wiederherstellen</option></select></span></div>)}</div></section>
    <div className="admin-columns"><section className="admin-section sessions"><header><div><small>ADMIN-VOLLSICHT · AUDITIERT</small><h2>Aktive Sessions</h2></div><span>{data.sessions.length} SESSIONS</span></header>{data.sessions.map(s=><button key={s.id} onClick={()=>openSession(s.id)}><i className={s.status.toLowerCase()}/><span><b>{s.title}</b><small>{s.id} · {s.user} · {s.world}</small></span><em>{s.messages} MSG</em><strong>€ {s.cost.toFixed(2).replace('.',',')}</strong></button>)}</section><section className="admin-section audit"><header><div><small>UNVERÄNDERBAR</small><h2>Audit Log</h2></div><span>LIVE</span></header>{data.audit.length?data.audit.slice(0,6).map(a=><article key={a.id}><i>✓</i><div><b>{a.action}</b><p>{a.detail}</p><small>{a.actor} · {new Date(a.createdAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</small></div></article>):<div className="empty">Noch keine Adminaktionen in dieser Demo.</div>}</section></div>
    <section className="admin-section secret-registry"><header><div><small>SERVERSEITIG · WERTE MASKIERT</small><h2>Secret Registry</h2></div><button className="ghost" onClick={async()=>{try{const result=await api.secrets();setSecrets(result.secrets);setToast(`${result.secrets.length} Secret-Namen geladen · 0 Werte exponiert`)}catch(e){setToast(String(e))}}}>Inventar laden</button></header>{secrets.length?<div className="secret-grid">{secrets.map(secret=><article key={secret.name}><i className={secret.configured?'configured':''}/><div><b>{secret.name}</b><small>{secret.group} · {secret.source}</small></div><span>{secret.configured?'KONFIGURIERT':'FEHLT'}</span></article>)}</div>:<div className="empty">Nur Metadaten werden angezeigt. Werte verlassen den Server nie.</div>}</section>
    {inspect&&<SessionModal session={data.sessions.find(s=>s.id===inspect)!} close={()=>setInspect(null)}/>}</div>;
}
function SessionModal({session,close}:{session:Bootstrap['sessions'][number];close:()=>void}){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><section className="session-modal"><header><div><small>SESSION CONTENT VIEW · AUDITIERT</small><h2>{session.title}</h2><p>{session.id} · {session.user} · {session.world}</p></div><button onClick={close}>×</button></header><div className="trace"><span className="done"><i/>USER INPUT<small>10:31:04 · 180 ms</small></span><span className="done"><i/>AGENTONE PLAN<small>10:31:05 · 920 ms</small></span><span className="done"><i/>TOOL · ERP GRAPHQL<small>10:31:06 · 241 ms</small></span><span className="active"><i/>HANDOFF · CONTENT<small>10:31:07 · running</small></span><span><i/>AUDIT REVIEW<small>queued</small></span></div><article className="session-message"><small>USER · 10:31</small><p>Aktualisiere die Produkttexte der Herbstkollektion und markiere unsichere Angaben.</p></article><article className="session-message agent"><small>AGENTONE · 10:31</small><p>Ich habe Research und Content parallel gestartet. Produktionszugriffe bleiben gesperrt; das Ergebnis landet zunächst im Review.</p><div className="tool-call">⌁ ERP_GRAPHQL · product_catalog · READ ONLY</div></article><footer><span>Secrets redacted · Vollzugriff im Audit protokolliert</span><button onClick={close}>Schließen</button></footer></section></div>}
