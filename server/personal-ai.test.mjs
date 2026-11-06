import test from 'node:test';
import assert from 'node:assert/strict';
import { personalReply, responseText } from './personal-ai.mjs';

test('personal response text is extracted without returning provider metadata',()=>{
  assert.equal(responseText({output:[{content:[{type:'output_text',text:'Hallo'},{type:'other',text:'intern'}]}]}),'Hallo');
});

test('personal AI uses Luna first and falls back to Sol',async()=>{
  const calls=[];const fakeFetch=async(_url,init)=>{const body=JSON.parse(init.body);calls.push(body);return calls.length===1?{ok:false,status:429,json:async()=>({})}:{ok:true,status:200,json:async()=>({output:[{content:[{type:'output_text',text:'Fallback funktioniert.'}]}]})};};
  const result=await personalReply({prompt:'Test',apiKey:'not-a-real-key',fetchImpl:fakeFetch});
  assert.deepEqual(calls.map(call=>call.model),['gpt-6-luna','gpt-6.1-sol']);
  assert.equal(result.model,'gpt-6.1-sol');assert.equal(result.mode,'LIVE');
  assert.equal(JSON.stringify(result).includes('not-a-real-key'),false);
});

test('personal AI remains functional in simulator mode without a key',async()=>{
  const result=await personalReply({prompt:'Test',apiKey:''});assert.equal(result.mode,'SIMULATED');assert.equal(result.model,'simulator');
});
