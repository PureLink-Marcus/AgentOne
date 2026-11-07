import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const release='2026.11.07-100';
const archive=path.resolve('output/demo/agentone-release-2026.11.07-100.tgz');
const remoteDir=`/opt/agentone/releases/${release}`;
const knownHosts=path.resolve('output/demo/known_hosts');
if(!host||!user||!key)throw new Error('SSH-Zielkonfiguration unvollständig');
const common=['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`];
function run(bin,args,timeout=120_000){
  const result=spawnSync(bin,args,{encoding:'utf8',timeout});
  if(result.status!==0)throw new Error(`${bin} fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-1200)}`);
  return result.stdout.trim();
}
run('ssh',[...common,`${user}@${host}`,`mkdir -p ${remoteDir}`]);
run('scp',[...common,archive,`${user}@${host}:${remoteDir}/release.tgz`]);
const output=run('ssh',[...common,`${user}@${host}`,`cd ${remoteDir} && tar -xzf release.tgz && docker build --pull -t purelink/agentone:${release} . && docker image inspect purelink/agentone:${release} --format 'image={{.Id}} size={{.Size}}'`],600_000);
console.log(output.split(/\r?\n/).slice(-8).join('\n'));
console.log(`Release ${release} auf Hetzner gebaut.`);
