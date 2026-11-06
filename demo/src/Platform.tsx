import { useMemo, useState } from 'react';
import { api } from './api';
import type { Bootstrap, EngineRun, World } from './types';

type ViewMode = 'orbit' | 'list';
type DrawerTab = 'overview' | 'steps' | 'events';

interface PlatformRun {
  id: string;
  title: string;
  world: World;
  state: string;
  progress: number;
  cost: number;
  gate: string | null;
  updatedAt: string;
  source: 'ENGINE' | 'SIMULATED';
  engine?: EngineRun;
}

const stageNames = ['Research', 'Transform', 'Audit', 'Human Gate', 'Publish'];

export function Platform({ data, refresh, setToast }: { data: Bootstrap; refresh:()=>void; setToast: (message: string) => void }) {
  const runs = useMemo<PlatformRun[]>(() => data.platform.runs.length ? data.platform.runs.map((run) => {
    const world=data.worlds.find((item)=>item.id===run.worldId) || data.worlds[0];
    const workflow=data.platform.workflows.find((item)=>item.id===run.workflowId);
    const gate=data.platform.gates.find((item)=>item.runId===run.id&&item.status==='PENDING');
    const completed=run.steps.filter((step)=>step.status==='COMPLETED').length;
    return {id:run.id,title:workflow?.name||run.workflowId,world,state:run.status,progress:Math.round(completed/Math.max(run.steps.length,1)*100),cost:run.budgetUsed,gate:gate?.id||null,updatedAt:new Date(run.updatedAt).toLocaleString('de-DE'),source:'ENGINE',engine:run};
  }) : data.worlds.map((world, index) => {
    const session = data.sessions.find((item) => item.world === world.name) || data.sessions[index];
    return {
      id: session?.id || `world-${world.id}`,
      title: session?.title || `${world.name} Workflow`,
      world,
      state: session?.status || world.state,
      progress: world.progress,
      cost: session?.cost ?? world.cost,
      gate: world.gate || (world.state === 'GATE' ? 'Freigabe erforderlich' : null),
      updatedAt: session?.updatedAt || 'kein Runtime-Zeitstempel',
      source: 'SIMULATED',
    };
  }), [data.platform, data.sessions, data.worlds]);
  const [view, setView] = useState<ViewMode>('orbit');
  const [selectedId, setSelectedId] = useState(runs[0]?.id || '');
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('overview');
  const [filter, setFilter] = useState<'ALL' | 'RUNNING' | 'GATE'>('ALL');
  const selected = runs.find((run) => run.id === selectedId) || runs[0];
  const visible = runs.filter((run) => filter === 'ALL' || (filter === 'GATE' ? Boolean(run.gate) : !run.gate));
  const eventRows = selected ? (data.platform.events.length ? data.platform.events.filter((event) => event.runId === selected.id) : data.events.filter((event) => event.worldId === selected.world.id)) : [];

  function select(run: PlatformRun) {
    setSelectedId(run.id);
    setDrawerTab('overview');
  }

  async function runAction(action:'start'|'pause'|'advance'){
    try{await api.runAction(selected.id,action,action==='advance'?{payload:{uiRequest:true},output:{simulated:true},cost:.1}:{});await refresh();setToast(`${selected.title}: ${action}`);}catch(error){setToast(error instanceof Error?error.message:String(error));}
  }

  async function decide(decision:'APPROVED'|'REJECTED'){
    if(!selected.gate)return;
    try{await api.gateDecision(selected.gate,decision);await refresh();setToast(`${selected.title}: ${decision}`);}catch(error){setToast(error instanceof Error?error.message:String(error));}
  }

  if (!selected) return <section className="platform-empty">Keine berechtigten Welten vorhanden.</section>;

  return <div className="page platform-page">
    <header className="platform-head">
      <div><small>AGENTONE PLATFORM / CONTROL PLANE</small><h1>Workflows bis zur letzten Übergabe.</h1><p>Welten, AgentOne-Orchestratoren, Runs, Gates und Handoffs in einer gemeinsamen Betriebsansicht.</p></div>
      <div className="platform-head-actions"><span className="simulation-label">{data.platform.runs.length?'PERSISTENT ENGINE':'SIMULATED DATASET'}</span><div className="view-switch"><button className={view === 'orbit' ? 'active' : ''} onClick={() => setView('orbit')}>Orbit</button><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Liste</button></div></div>
    </header>
    <section className="platform-kpis">
      <article><small>WELTEN</small><b>{data.worlds.length.toString().padStart(2, '0')}</b><span>je ein AgentOne</span></article>
      <article><small>RUNS</small><b>{runs.length.toString().padStart(2, '0')}</b><span>{runs.filter((run) => !run.gate).length} ohne Gate</span></article>
      <article className="warning"><small>HUMAN GATES</small><b>{runs.filter((run) => run.gate).length.toString().padStart(2, '0')}</b><span>Schreiben blockiert</span></article>
      <article><small>AGENTEN</small><b>{data.worlds.reduce((sum, world) => sum + world.agents, 0).toString().padStart(2, '0')}</b><span>isolierte Teams</span></article>
    </section>
    <section className="platform-toolbar" aria-label="Workflow-Filter">
      <div>{(['ALL', 'RUNNING', 'GATE'] as const).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'ALL' ? 'Alle Runs' : item === 'RUNNING' ? 'In Arbeit' : 'Offene Gates'}</button>)}</div>
      <span>{visible.length} VON {runs.length} · QUELLE: {data.platform.runs.length?'PLATFORM ENGINE':'DEMO-BOOTSTRAP'}</span>
    </section>
    <div className="platform-workspace">
      <section className={`platform-map ${view}`} aria-label={view === 'orbit' ? 'Interaktive Workflow-Orbits' : 'Workflow-Liste'}>
        {view === 'orbit' ? <OrbitView runs={visible} selectedId={selected.id} onSelect={select}/> : <ListView runs={visible} selectedId={selected.id} onSelect={select}/>}
      </section>
      <aside className="run-drawer" aria-label="Run-Details">
        <header><div className="drawer-orb">A1</div><div><small>{selected.world.code} / {selected.id}</small><h2>{selected.title}</h2></div><span className={selected.gate ? 'gate' : 'running'}>{selected.gate ? 'GATE' : 'RUNNING'}</span></header>
        <nav>{(['overview', 'steps', 'events'] as const).map((tab) => <button key={tab} className={drawerTab === tab ? 'active' : ''} onClick={() => setDrawerTab(tab)}>{tab === 'overview' ? 'Übersicht' : tab === 'steps' ? 'Schritte' : 'Ereignisse'}</button>)}</nav>
        {drawerTab === 'overview' && <div className="drawer-body">
          <div className="drawer-status"><div><small>FORTSCHRITT</small><b>{selected.progress}%</b></div><div><small>KOSTEN</small><b>€ {selected.cost.toFixed(2)}</b></div><div><small>STATUS</small><b>{selected.state}</b></div></div>
          <div className="drawer-progress"><i style={{ width: `${selected.progress}%` }}/></div>
          <section><small>AGENT-HANDOFFS</small><div className="handoff-chain"><i>R</i><span>18 Quellen</span><b>→</b><i>C</i><span>4 Entwürfe</span><b>→</b><i>A</i></div></section>
          <section><small>CONNECTOREN</small><div className="drawer-connectors">{selected.world.connectors.map((connector) => <span key={connector}>⌁ {connector}<b>READ</b></span>)}</div></section>
          {selected.gate ? <section className="gate-box"><small>HUMAN GATE · SCHREIBPFAD BLOCKIERT</small><h3>{selected.gate}</h3><p>Freigabe muss zum aktuellen Änderungshash passen. Erst danach kann ein isolierter Worker den Schritt übernehmen.</p><button onClick={()=>decide('APPROVED')}>Freigeben →</button><button onClick={()=>decide('REJECTED')}>Ablehnen</button></section> : <section className="checkpoint-box"><small>LETZTER CHECKPOINT</small><b>{selected.engine?.checkpoint?.stepId||'Noch kein Checkpoint'} · Schreibpfade bleiben gate-gebunden</b><span>{selected.updatedAt}</span></section>}
        </div>}
        {drawerTab === 'steps' && <div className="step-list">{(selected.engine?.steps||stageNames.map((name,index)=>({id:name,name,index,status:selected.progress>=(index+1)*20?'COMPLETED':'PENDING',risk:'READ'}))).map((step, index) => { const state = step.status==='COMPLETED'?'done':selected.gate&&index===selected.engine?.currentStep?'gate':index===selected.engine?.currentStep?'active':'waiting'; return <article key={step.id} className={state}><i>{state === 'done' ? '✓' : index + 1}</i><div><b>{step.name}</b><small>{step.risk} · {state === 'done' ? 'Checkpoint gespeichert' : state === 'gate' ? 'Wartet auf Mensch' : state === 'active' ? 'Bereit für Worker' : 'Noch nicht gestartet'}</small></div><span>{state.toUpperCase()}</span></article>;})}</div>}
        {drawerTab === 'events' && <div className="drawer-events">{eventRows.length ? eventRows.map((event) => <article key={event.id}><i className={event.type.includes('GATE')||event.type==='APPROVAL' ? 'warning' : ''}/><div><small>{event.createdAt} · {event.type}</small><b>{'title' in event?event.title:event.type}</b><p>{'summary' in event?event.summary:JSON.stringify(event.detail)}</p></div></article>) : <div className="drawer-empty">Keine Ereignisse für diesen Run.</div>}</div>}
        <footer><span><i/> {selected.source}</span><div>{selected.state==='RUNNING'?<><button onClick={()=>runAction('advance')}>Read-Schritt →</button><button onClick={()=>runAction('pause')}>Pause</button></>:!selected.gate&&<button onClick={()=>runAction('start')}>Start / Resume →</button>}</div></footer>
      </aside>
    </div>
  </div>;
}

function OrbitView({ runs, selectedId, onSelect }: { runs: PlatformRun[]; selectedId: string; onSelect: (run: PlatformRun) => void }) {
  return <div className="platform-orbit"><div className="platform-grid"/><div className="platform-core"><span>A1</span><small>CONTROL PLANE</small></div><svg viewBox="0 0 900 650" aria-hidden="true"><path d="M450 325 C300 130 180 120 120 200"/><path d="M450 325 C650 130 735 145 790 220"/><path d="M450 325 C260 470 170 520 115 500"/><path d="M450 325 C630 480 745 485 800 500"/></svg>{runs.map((run, index) => <button key={run.id} className={`platform-run-node p${index + 1} ${selectedId === run.id ? 'selected' : ''} ${run.gate ? 'gate' : ''}`} onClick={() => onSelect(run)}><i>A1</i><b>{run.world.name}</b><small>{run.title}</small><em>{run.gate ? 'HUMAN GATE' : `${run.progress}% · RUNNING`}</em><span style={{ '--progress': `${run.progress * 3.6}deg` } as React.CSSProperties}/></button>)}</div>;
}

function ListView({ runs, selectedId, onSelect }: { runs: PlatformRun[]; selectedId: string; onSelect: (run: PlatformRun) => void }) {
  return <div className="platform-table" role="table"><div className="platform-table-row head" role="row"><span>Welt / Workflow</span><span>Status</span><span>Fortschritt</span><span>Agenten</span><span>Kosten</span></div>{runs.map((run) => <button key={run.id} className={`platform-table-row ${selectedId === run.id ? 'selected' : ''}`} onClick={() => onSelect(run)} role="row"><span><i>A1</i><b>{run.world.name}<small>{run.title}</small></b></span><span><em className={run.gate ? 'gate' : 'running'}>{run.gate ? 'GATE' : run.state}</em></span><span><strong>{run.progress}%</strong><i className="mini-progress"><b style={{ width: `${run.progress}%` }}/></i></span><span>{run.world.agents}</span><span>€ {run.cost.toFixed(2)}</span></button>)}</div>;
}
