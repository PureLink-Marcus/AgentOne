const state={style:'cosmos',level:'outside',world:'product'};
const frame=document.getElementById('screen');
const stage=document.getElementById('stage');
const breadcrumb=document.getElementById('breadcrumb');
const description=document.getElementById('description');
const worldSelect=document.getElementById('world');
const worldNames={product:'PRODUKTTEXTE',images:'BILD-AUDIT',publish:'PUBLISH',sync:'KATEGORIE-SYNC'};
const worldIds=['product','images','publish','sync'];
function url(){return state.level==='outside'?`../world-views/overview.html?style=${state.style}`:`../five-styles/index.html?style=${state.style}&brand=purelink&world=${state.world}`;}
function render(){document.querySelectorAll('[data-style]').forEach(b=>b.classList.toggle('active',b.dataset.style===state.style));document.querySelectorAll('[data-level]').forEach(b=>b.classList.toggle('active',b.dataset.level===state.level));worldSelect.value=state.world;worldSelect.disabled=state.level==='outside';breadcrumb.textContent=state.level==='outside'?'SHOP CONTENT / PROJEKTÜBERSICHT':`SHOP CONTENT / ${worldNames[state.world]} / WELT`;description.textContent=state.level==='outside'?'Vier Welten, jede mit einem eigenen AgentOne. Eine Welt anklicken, um hineinzuwechseln.':`${worldNames[state.world]}: AgentOne koordiniert Agenten, Connectoren, Übergaben und Gates innerhalb dieser Welt.`;frame.classList.remove('ready');frame.src=url();}
function scale(){const s=Math.min(stage.clientWidth/1440,stage.clientHeight/960);frame.style.transform=`translate(-50%,-50%) scale(${s})`;}
function wireWorldClicks(){if(state.level!=='outside')return;try{const doc=frame.contentDocument;const nodes=state.style==='cosmos'?doc.querySelectorAll('.world'):doc.querySelectorAll('.world-card');nodes.forEach((node,index)=>{node.style.cursor='pointer';node.setAttribute('tabindex','0');const open=()=>{state.world=worldIds[index]||'product';state.level='inside';render();};node.addEventListener('click',open);node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});});}catch(error){console.warn('World click wiring unavailable',error);}}
document.querySelectorAll('[data-style]').forEach(b=>b.addEventListener('click',()=>{state.style=b.dataset.style;render();}));
document.querySelectorAll('[data-level]').forEach(b=>b.addEventListener('click',()=>{state.level=b.dataset.level;render();}));
worldSelect.addEventListener('change',()=>{state.world=worldSelect.value;render();});
frame.addEventListener('load',()=>{wireWorldClicks();frame.classList.add('ready');});
window.addEventListener('message',event=>{if(event.data?.type==='agentone-open-world'){state.world=event.data.world;state.level='inside';render();}});
window.addEventListener('resize',scale);
window.addEventListener('keydown',event=>{if(event.target.matches('select,input,textarea'))return;if(event.key==='1'){state.style='cosmos';render();}if(event.key==='2'){state.style='pixel';render();}if(event.key.toLowerCase()==='o'){state.level='outside';render();}if(event.key.toLowerCase()==='i'){state.level='inside';render();}});
scale();render();
