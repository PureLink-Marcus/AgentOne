import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});
const waitFor=async url=>{for(let attempt=0;attempt<80;attempt+=1){try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Source proxy did not start');};

test('Source Sync proxy is authenticated, exact-path, user-bound and origin-protected',async()=>{
  const upstreamPort=await freePort(),proxyPort=await freePort(),requests=[];
  const upstream=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;requests.push({url:req.url,method:req.method,headers:req.headers,body});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(req.method==='GET'?{schema:'agentone.personal-source-status/v1',sources:[],policy:{sideEffectFree:true,secretsExposed:false}}:{schema:'agentone.personal-source-refresh/v1',sources:[],policy:{readOnly:true,secretsExposed:false}}));});await new Promise(resolve=>upstream.listen(upstreamPort,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${proxyPort}`,child=spawn(process.execPath,['server/basic-proxy.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(proxyPort),UPSTREAM_URL:`http://127.0.0.1:${upstreamPort}`,PERSONAL_API_URL:`http://127.0.0.1:${upstreamPort}`,PERSONAL_API_TOKEN:'source-proxy-token',BASIC_AUTH_USER:'source-user',BASIC_AUTH_PASSWORD:'source-password-with-enough-length',ACCESS_SESSION_SECRET:'source-session-secret-with-enough-length',PUBLIC_ORIGIN:origin,AGENTONE_INSTANCE_TYPE:'personal'},stdio:'ignore'});
  try{
    await waitFor(`${origin}/proxy-health`);assert.equal((await fetch(`${origin}/agentone/sources`)).status,401);const login=await fetch(`${origin}/login`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin},body:'username=source-user&password=source-password-with-enough-length',redirect:'manual'}),cookie=login.headers.get('set-cookie').split(';')[0];
    const status=await fetch(`${origin}/agentone/sources`,{headers:{cookie,'x-agentone-user':'forged','x-agentone-internal-token':'forged'}});assert.equal(status.status,200);assert.equal((await status.json()).policy.sideEffectFree,true);assert.equal(requests.at(-1).url,'/api/internal/personal/sources');assert.equal(requests.at(-1).headers['x-agentone-user'],'source-user');assert.equal(requests.at(-1).headers['x-agentone-internal-token'],'source-proxy-token');
    const before=requests.length;assert.equal((await fetch(`${origin}/agentone/sources/refresh`,{method:'POST',headers:{cookie,origin:'https://evil.example','content-type':'application/json'},body:'{}'})).status,403);assert.equal((await fetch(`${origin}/agentone/sources?extra=1`,{headers:{cookie}})).status,404);assert.equal(requests.length,before);
    const refreshed=await fetch(`${origin}/agentone/sources/refresh`,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:'{"forged":true}'});assert.equal(refreshed.status,200);assert.equal((await refreshed.json()).policy.readOnly,true);assert.equal(requests.at(-1).url,'/api/internal/personal/sources/refresh');assert.equal(requests.at(-1).method,'POST');assert.equal(requests.at(-1).body,'{}');assert.equal(requests.at(-1).headers['x-agentone-user'],'source-user');
  }finally{child.kill();await new Promise(resolve=>upstream.close(resolve));}
});
