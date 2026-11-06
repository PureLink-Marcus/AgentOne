const query = new URLSearchParams(location.search);
const variant = ['cosmos','pixel','hybrid'].includes(query.get('variant')) ? query.get('variant') : 'hybrid';
const theme = query.get('theme') === 'light' ? 'light' : 'dark';
const level = query.get('level') === 'outside' ? 'outside' : 'inside';
const world = ['product','images','publish','sync'].includes(query.get('world')) ? query.get('world') : 'product';
const app = document.getElementById('app');
app.className = `app variant-${variant} theme-${theme} level-${level}`;

const worlds = [
  { id:'product', no:'01', name:'Produkttexte', code:'PRODUCT_COPY', meta:'4 Agenten · Run A-1842', value:'40%', state:'live' },
  { id:'images', no:'02', name:'Bild-Audit', code:'IMAGE_AUDIT', meta:'2 Agenten · 76 erledigt', value:'76%', state:'live' },
  { id:'publish', no:'03', name:'Publish', code:'PUBLISH', meta:'Gate #084 · Freigabe', value:'!', state:'warn' },
  { id:'sync', no:'04', name:'Kategorie-Sync', code:'CATEGORY_SYNC', meta:'Heute · 14:00', value:'—', state:'idle' },
];
const current = worlds.find(item => item.id === world) || worlds[0];
const titleByVariant = { cosmos:'Celestial Cartography', pixel:'Pixel Hive OS', hybrid:'PureLink Orbit Grid' };

function openWorld(id){
  const next = new URL(location.href);
  next.searchParams.set('level','inside');
  next.searchParams.set('world',id);
  if (window.parent !== window) window.parent.postMessage({ type:'agentone-screen', action:'open-world', world:id }, '*');
  else location.href = next.href;
}

function renderLeft(){
  document.getElementById('left').innerHTML = `
    <small class="project-label">PROJEKT</small><h2 class="project-title">Shop Content</h2><p class="project-sub">4 Welten · 12 aktive Runs</p>
    <div class="section-title"><span>WELTEN</span><b>04</b></div>
    ${worlds.map(item => `<button class="world-button ${item.id===world?'active':''} ${item.state==='warn'?'warn':''}" data-world="${item.id}"><i>A1</i><span><b>${item.name}</b><small class="world-meta">${item.meta}</small></span><strong>${item.value}</strong></button>`).join('')}
    <section class="scope-note"><b>${level==='outside'?'PROJEKTANSICHT':'WELTANSICHT'}</b><p>${level==='outside'?'Navigation und Vergleich. Diese Ebene besitzt keinen globalen AgentOne.':'AgentOne orchestriert ausschließlich diese Welt, ihr Team und ihre freigegebenen Connectoren.'}</p></section>`;
  document.querySelectorAll('.world-button').forEach(button => button.addEventListener('click', () => openWorld(button.dataset.world)));
}

function renderHead(){
  const outside = level === 'outside';
  const heading = outside ? 'Vier Welten. Vier AgentOne.' : (variant==='pixel' ? `${current.code} = ONE AGENTONE` : `${current.name}: eine Welt, ein AgentOne.`);
  const subtitle = outside ? 'Jede Welt führt ihr eigenes Team und ihre eigenen Connectoren.' : 'Agenten, Connectoren, Übergaben und Human Gates in einem gemeinsamen Arbeitsraum.';
  document.getElementById('page-head').innerHTML = `<div><small class="eyebrow">PURELINK / SHOP CONTENT / ${outside?'WELTEN':`WELT ${current.no}`}</small><h1>${heading}</h1><p>${subtitle}</p></div><div class="head-stats">${outside?'<span><small>AKTIV</small><b>3</b></span><span><small>GATES</small><b class="warn">1</b></span><span><small>AGENTEN</small><b>10</b></span>':'<span><small>FORTSCHRITT</small><b>48 / 120</b></span><span><small>KOSTEN</small><b>€ 8,42</b></span><span><small>FEHLER</small><b class="ok">0</b></span>'}</div>`;
}

function orbitalOverview(){
  return `<div class="workspace-label">PROJECT / SHOP_CONTENT / WORLD MAP · ${titleByVariant[variant].toUpperCase()}</div>
  <svg viewBox="0 0 900 670" role="img" aria-label="Vier Welten mit je einem AgentOne">
    <ellipse class="orbit-ring dash" cx="450" cy="350" rx="402" ry="286"/>
    <path class="flow dash" d="M316 258C405 208 493 210 580 258"/><path class="flow dash" d="M301 326C315 408 351 451 414 493"/><path class="flow dash" d="M615 323C641 403 680 449 745 486"/><path class="flow warn" d="M486 511C574 537 660 530 741 503"/>
    ${orbitalWorld(270,270,112,worlds[0],true,'ERP','SHOP',['R','C','A'])}
    ${orbitalWorld(642,266,96,worlds[1],false,'DAM','PIM',['V','Q'])}
    ${orbitalWorld(447,512,91,worlds[2],false,'ART','SHOP',['M','P'],true)}
    ${orbitalWorld(751,507,85,worlds[3],false,'PIM','ERP',['S'])}
  </svg>`;
}

function orbitalWorld(x,y,r,item,selected,leftPort,rightPort,agents,warn=false){
  const offsets=[[-.58,-.22],[.52,-.35],[.55,.38]];
  return `<g class="world-target" data-world="${item.id}" transform="translate(${x} ${y})">
    <circle class="svg-halo" r="${r+24}"/><circle class="svg-world ${selected?'active':''} ${warn?'warn':''}" r="${r}"/><circle class="orbit-ring dash" r="${r*.67}"/>
    <circle class="svg-a1" r="${r*.32}"/><text class="svg-text" y="4">A1</text>
    ${agents.map((a,i)=>`<circle class="svg-agent ${warn&&i===1?'warn':''}" cx="${offsets[i][0]*r}" cy="${offsets[i][1]*r}" r="${r*.16}"/><text class="svg-meta" x="${offsets[i][0]*r}" y="${offsets[i][1]*r+3}">${a}</text>`).join('')}
    <rect class="svg-port" x="${-r-31}" y="-17" width="42" height="34" rx="${variant==='pixel'?0:5}"/><text class="svg-meta" x="${-r-10}" y="4">${leftPort}</text>
    <rect class="svg-port" x="${r-11}" y="-17" width="48" height="34" rx="${variant==='pixel'?0:5}"/><text class="svg-meta" x="${r+13}" y="4">${rightPort}</text>
    ${warn?`<path class="svg-gate" d="M0 ${-r-18}l8 8-8 8-8-8z"/>`:''}
    <text class="svg-world-name" y="${r+25}">${item.name.toUpperCase()}</text><text class="svg-world-meta" y="${r+43}">${item.meta.toUpperCase()}</text>
  </g>`;
}

function pixelOverview(){
  const data=[['product','PRODUCT_COPY','DB','SW',['R','C','A'],'LIVE · 40%'],['images','IMAGE_AUDIT','DAM','PIM',['V','Q'],'LIVE · 76%'],['publish','PUBLISH','ART','SW',['M','P'],'HUMAN_GATE'],['sync','CATEGORY_SYNC','PIM','ERP',['S'],'SCHEDULED']];
  return `<div class="workspace-label">PROJECTGRID::SHOP_CONTENT / 4 AUTONOMOUS WORLDS</div><div class="pixel-world-grid">${data.map((d,i)=>`<article class="pixel-world-card ${i===0?'selected':''} ${i===2?'warn':''}" data-world="${d[0]}"><header><span>WORLD_0${i+1}</span><b>${d[5]}</b></header><h2>${d[1]}</h2><div class="mini-graph"><i class="port l">${d[2]}</i><i class="agent a">${d[4][0]}</i>${d[4][1]?`<i class="agent b">${d[4][1]}</i>`:''}${d[4][2]?`<i class="agent c">${d[4][2]}</i>`:''}<strong>A1</strong><i class="port r">${d[3]}</i></div><footer><span>${d[4].length} AGENTS</span><span>${i===2?'GATE_084':'CONNECTORS OK'}</span><b>${worlds[i].value}</b></footer></article>`).join('')}</div>`;
}

function orbitalInside(){
  return `<div class="workspace-label">WORLD / ${current.code} / ${current.no} · ${titleByVariant[variant].toUpperCase()}</div>
  <svg viewBox="0 0 850 650" role="img" aria-label="AgentOne orchestriert die Welt ${current.name}">
    <circle class="orbit-ring" cx="425" cy="315" r="128"/><circle class="orbit-ring dash" cx="425" cy="315" r="235"/><circle class="orbit-ring" cx="425" cy="315" r="302"/>
    <path class="flow" d="M120 185C240 190 301 235 374 291"/><path class="flow" d="M120 453C240 444 304 385 377 339"/><path class="flow" d="M476 289C560 216 642 194 748 211"/><path class="flow" d="M475 340C566 394 645 420 748 430"/><path class="flow warn" d="M566 258C616 304 617 351 560 398"/>
    <circle class="svg-halo" cx="425" cy="315" r="120"/><circle class="svg-a1" cx="425" cy="315" r="58"/><text class="svg-text" x="425" y="311" style="font-size:19px">A1</text><text class="svg-meta" x="425" y="335">DIESE WELT</text>
    <circle class="svg-agent" cx="279" cy="285" r="39"/><text class="svg-text" x="279" y="282">R</text><text class="svg-meta" x="279" y="302">RESEARCH</text>
    <circle class="svg-agent" cx="575" cy="252" r="42"/><text class="svg-text" x="575" y="249">C</text><text class="svg-meta" x="575" y="269">CONTENT</text>
    <circle class="svg-agent warn" cx="568" cy="405" r="40"/><text class="svg-text" x="568" y="402">A</text><text class="svg-meta" x="568" y="422">AUDIT</text>
    ${svgPort(104,185,'ERP GRAPHQL','READ')}${svgPort(104,453,'PIM','READ')}${svgPort(750,211,'SHOPWARE','GATE',true)}${svgPort(750,430,'ARTEFAKTE','MERGE')}
    <rect class="svg-port" x="320" y="500" width="210" height="45" rx="22"/><circle cx="343" cy="522" r="5" fill="var(--green)"/><text class="svg-text" x="425" y="518" style="font-size:10px">4 BATCHES GEMERGED</text><text class="svg-meta" x="425" y="535">0 KONFLIKTE · AUDIT AKTIV</text>
  </svg>`;
}

function svgPort(x,y,name,meta,warn=false){return `<g transform="translate(${x} ${y})"><rect class="svg-port ${warn?'warn':''}" x="-62" y="-31" width="124" height="62" rx="${variant==='pixel'?0:7}" ${warn?'style="stroke:var(--amber)"':''}/><text class="svg-text" y="-4" style="font-size:9px">${name}</text><text class="svg-meta" y="15">CONNECTOR · ${meta}</text></g>`;}

function pixelInside(){
  return `<div class="workspace-label">WORLD_BOUNDARY::${current.code}</div><div class="node-map"><span class="wire w1"></span><span class="wire w2"></span><span class="wire w3"></span><span class="wire w4"></span>${node('erp','DB','ERP_GQL','READ')}${node('pim','API','PIM','READ')}${node('research','R','RESEARCH','T-48')}${node('content','C','CONTENT','T-49')}${node('audit','A','AUDIT','PEER_REVIEW')}${node('shop','SW','SHOPWARE','GATE_084')}${node('files','FS','ARTIFACTS','MERGE')}${node('core','A1','WORLD_CORE','ORCHESTRATING')}</div>`;
}
function node(cls,icon,name,meta){return `<div class="node ${cls}"><i>${icon}</i><b>${name}</b><small>${meta}</small></div>`;}

function renderWorkspace(){
  const workspace=document.getElementById('workspace');
  workspace.innerHTML = level==='outside' ? (variant==='pixel'?pixelOverview():orbitalOverview()) : (variant==='pixel'?pixelInside():orbitalInside());
  workspace.querySelectorAll('[data-world]').forEach(node=>{node.style.cursor='pointer';node.addEventListener('click',()=>openWorld(node.dataset.world));});
}

function renderMatrix(){
  const done=level==='outside'?72:48, active=level==='outside'?14:6;
  document.getElementById('matrix').innerHTML=`<div><small>${level==='outside'?'PROJEKT-OUTPUT':'OUTPUT-MATRIX'}</small><b>${done} fertig · ${active} aktiv · ${120-done-active} geplant</b></div><div class="cells">${Array.from({length:120},(_,i)=>`<i class="${i<done?'done':i<done+active?'active':''}"></i>`).join('')}</div><em>${variant.toUpperCase()} · ${theme.toUpperCase()} · ${level.toUpperCase()}</em>`;
}

function renderRight(){
  const right=document.getElementById('right');
  if(level==='outside'){
    right.innerHTML=`<section class="project-status"><small>PROJEKTSTATUS</small><h2>Shop Content</h2>${worlds.map(item=>`<div class="status-row ${item.id==='product'?'active':''} ${item.state==='warn'?'warn':''}"><i class="a1-badge">A1</i><span><b>${item.name}</b><small>${item.meta}</small></span><strong>${item.value}</strong></div>`).join('')}<div class="project-callout"><small>NÄCHSTE AKTION</small><p>Publish benötigt eine menschliche Freigabe. Die anderen Welten laufen unabhängig weiter.</p><button>Gate #084 öffnen</button></div></section>`;
  }else{
    right.innerHTML=`<header class="right-head"><i class="a1-badge">A1</i><div><small>AGENTONE DIESER WELT</small><b>${current.name}</b></div><span class="live">LIVE</span></header><div class="scope">SHOP CONTENT / W-${current.no} / ${current.code}</div><article class="message user"><small>DU · 10:31</small><p>Was machen die Agenten gerade?</p></article><article class="message a1"><small>AGENTONE · 10:31</small><p>Research hat vier Quellenpakete an Content übergeben. Audit prüft den nächsten Batch parallel.</p><div class="handoffs"><i>R</i><span>48 →</span><i>C</i><span>1 Review →</span><i>A</i></div><strong>Keine offenen Konflikte</strong></article><article class="message user"><small>DU · 10:32</small><p>Danach Staging vorbereiten.</p></article><article class="message a1"><small>AGENTONE · 10:32</small><p>Geplant. Vor dem Push stoppt Gate #084 zur Freigabe.</p></article><div class="action-box"><small>NÄCHSTER SCHRITT</small><b>MERGE → SNAPSHOT → GATE #084 → PUSH</b></div><footer class="right-input"><span>AgentOne dieser Welt fragen …</span><button>↑</button></footer>`;
  }
}

renderLeft();renderHead();renderWorkspace();renderMatrix();renderRight();
