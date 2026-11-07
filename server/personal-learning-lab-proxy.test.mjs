import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port));});});
const waitFor=async url=>{for(let i=0;i<40;i++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Proxy wurde nicht bereit');};

test('Learning Lab proxy is authenticated, same-origin and binds human approval to the session user',async()=>{
  const upstreamPort=await freePort(),proxyPort=await freePort(),requests=[];
  const upstream=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    requests.push({url:req.url,method:req.method,headers:req.headers,body});
    res.writeHead(req.method==='GET'?200:201,{'content-type':'application/json'});
    res.end(JSON.stringify({schema:'agentone.personal-skills/v1',skills:[],secretsExposed:false}));
  });
  await new Promise(resolve=>upstream.listen(upstreamPort,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${proxyPort}`;
  const child=spawn(process.execPath,['server/basic-proxy.mjs'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(proxyPort),UPSTREAM_URL:`http://127.0.0.1:${upstreamPort}`,PERSONAL_API_URL:`http://127.0.0.1:${upstreamPort}`,PERSONAL_API_TOKEN:'learning-lab-internal-token',BASIC_AUTH_USER:'guenni',BASIC_AUTH_PASSWORD:'learning-lab-test-password',ACCESS_SESSION_SECRET:'learning-lab-session-secret-with-enough-length',PUBLIC_ORIGIN:origin,AGENTONE_INSTANCE_TYPE:'personal'},stdio:'ignore'});
  try{
    await waitFor(`${origin}/proxy-health`);
    assert.equal((await fetch(`${origin}/agentone/skills`)).status,401);
    const login=await fetch(`${origin}/login`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin},body:'username=guenni&password=learning-lab-test-password',redirect:'manual'}),cookie=login.headers.get('set-cookie').split(';')[0];
    const list=await fetch(`${origin}/agentone/skills`,{headers:{cookie,'x-agentone-user':'forged-user','x-agentone-internal-token':'forged-token'}});assert.equal(list.status,200);assert.match(list.headers.get('cache-control'),/no-store/);
    const crossSite=await fetch(`${origin}/agentone/skills/skill-1/approve`,{method:'POST',headers:{cookie,origin:'https://evil.example','content-type':'application/json'},body:'{"contentHash":"sha256:expected"}'});assert.equal(crossSite.status,403);
    const approve=await fetch(`${origin}/agentone/skills/skill-1/approve`,{method:'POST',headers:{cookie,origin,'content-type':'application/json','x-agentone-human-actor':'forged-user','x-agentone-human-action':'forged-action'},body:'{"contentHash":"sha256:expected"}'});assert.equal(approve.status,201);
    const activate=await fetch(`${origin}/agentone/skills/skill-1/activate`,{method:'POST',headers:{cookie,origin,'content-type':'application/json','x-agentone-human-actor':'forged-user','x-agentone-human-action':'forged-action'},body:'{}'});assert.equal(activate.status,201);
    const evaluate=await fetch(`${origin}/agentone/skills/skill-1/evaluate`,{method:'POST',headers:{cookie,origin,'content-type':'application/json','x-agentone-human-actor':'forged-user'},body:'{}'});assert.equal(evaluate.status,201);
    assert.equal(requests.length,4);
    for(const request of requests){assert.equal(request.headers['x-agentone-user'],'guenni');assert.equal(request.headers['x-agentone-internal-token'],'learning-lab-internal-token');assert.notEqual(request.headers['x-agentone-user'],'forged-user');}
    assert.equal(requests[0].url,'/api/internal/personal/skills');
    assert.equal(requests[1].url,'/api/internal/personal/skills/skill-1/approve');assert.equal(requests[1].headers['x-agentone-human-actor'],'guenni');assert.equal(requests[1].headers['x-agentone-human-action'],'skill-approve');
    assert.equal(requests[2].url,'/api/internal/personal/skills/skill-1/activate');assert.equal(requests[2].headers['x-agentone-human-actor'],'guenni');assert.equal(requests[2].headers['x-agentone-human-action'],'skill-activate');
    assert.equal(requests[3].url,'/api/internal/personal/skills/skill-1/evaluate');assert.equal(requests[3].headers['x-agentone-human-actor'],undefined);assert.equal(requests[3].headers['x-agentone-human-action'],undefined);
  }finally{child.kill();await new Promise(resolve=>upstream.close(resolve));}
});
