import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadEnv } from '../server/state.mjs';

const env=loadEnv(path.resolve('.'));
const host=env.COOLIFY_HETZNER_SERVER_IP||env.COOLIFY_SERVER_IP;
const user=env.COOLIFY_HETZNER_SSH_USER||env.COOLIFY_SSH_USER;
const key=env.COOLIFY_HETZNER_SSH_KEY_PATH||env.COOLIFY_SSH_KEY_PATH;
const knownHosts=path.resolve('output/demo/known_hosts');
const result=spawnSync('ssh',['-i',key,'-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${user}@${host}`,'tailscale status --json'],{encoding:'utf8',timeout:30_000,maxBuffer:4_000_000});
if(result.status!==0)throw new Error('Tailscale-Status auf Hetzner nicht lesbar');
const status=JSON.parse(result.stdout);
const nodes=[status.Self,...Object.values(status.Peer||{})].filter(Boolean).map(node=>({hostName:node.HostName,dnsName:String(node.DNSName||'').replace(/\.$/,''),tailscaleIps:node.TailscaleIPs||[],online:Boolean(node.Online),keyExpiry:node.KeyExpiry||null}));
console.log(JSON.stringify(nodes.filter(node=>['agentone-hetzner','agentone-home-connector'].includes(node.hostName)),null,2));
