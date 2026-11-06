import test from 'node:test';
import assert from 'node:assert/strict';
import { adapterCatalog, checkAdapter } from './adapters.mjs';

test('catalog never exposes environment values',()=>{
  const secret='never-expose-this-secret';
  const catalog=adapterCatalog({CrewAI_OpenAI_API_Key:secret});
  assert.equal(JSON.stringify(catalog).includes(secret),false);
  assert.equal(catalog.find(item=>item.id==='openai').configured,true);
});

test('unconfigured and disabled adapters do not call live services',async()=>{
  const simulated=await checkAdapter('coolify','auto',{});
  assert.equal(simulated.status,'SIMULATED');
  const disabled=await checkAdapter('coolify','disabled',{});
  assert.equal(disabled.status,'DISABLED');
});

test('all adapters block writes',()=>{
  assert.ok(adapterCatalog({}).every(item=>item.writesBlocked));
});

test('recommended personal connector pack is preinstalled without secrets',()=>{
  const catalog=adapterCatalog({});
  for(const id of ['google-calendar','home-assistant','home-connector','spotify','apple-companion','apple-health','iphone-location','apple-shortcuts','caldav-carddav','personal-mail','gmail','twitch','ntfy','paperless','immich','mealie','actual-budget']){
    const item=catalog.find(entry=>entry.id===id);
    assert.ok(item,`${id} fehlt`);
    assert.equal(item.profile,'personal');
    assert.equal(item.preinstalled,true);
    assert.equal(item.writesBlocked,true);
  }
  assert.equal(catalog.find(item=>item.id==='bring-shopping').mode,'disabled');
});
