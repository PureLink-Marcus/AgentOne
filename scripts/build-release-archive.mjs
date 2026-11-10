import crypto from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { spawnSync } from 'node:child_process';

const release=String(process.argv[2]||'').trim();
if(!/^\d{4}\.\d{2}\.\d{2}-\d{1,4}$/.test(release))throw new Error('Release muss dem Format YYYY.MM.DD-N entsprechen');
const root=path.resolve('.'),outputDir=path.join(root,'output','demo'),tarPath=path.join(outputDir,`.agentone-release-${release}.tar`),archivePath=path.join(outputDir,`agentone-release-${release}.tgz`);
const assets=[
  'output/connector/agentone-home-connector-raspberry.zip',
  'output/connector/agentone-home-connector-raspberry.zip.sig',
  'output/connector/home-connector-release.json',
  'output/connector/agentone-siri-shortcuts.zip',
  'output/connector/agentone-apple-companion.zip',
  'output/connector/AgentOne-Companion-unsigned.ipa',
  'output/connector/AgentOne-Companion-unsigned.ipa.sha256',
];
for(const asset of assets){const absolute=path.join(root,...asset.split('/'));if(!existsSync(absolute)||!statSync(absolute).isFile()||statSync(absolute).size<=0)throw new Error(`Release-Artefakt fehlt: ${asset}`);}
mkdirSync(outputDir,{recursive:true});rmSync(tarPath,{force:true});rmSync(archivePath,{force:true});
function run(bin,args){const result=spawnSync(bin,args,{cwd:root,encoding:'utf8'});if(result.status!==0)throw new Error(`${bin} fehlgeschlagen: ${(result.stderr||result.stdout||'').slice(-1200)}`);return result.stdout;}
try{
  const trackedChanges=run('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'status','--porcelain','--untracked-files=no']).trim();
  if(trackedChanges)throw new Error('Release-Archiv abgebrochen: getrackte Änderungen müssen vor dem Commit-gebundenen Build eingecheckt sein.');
  run('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'archive','--format=tar','--output',tarPath,'HEAD']);
  run('tar',['-rf',tarPath,...assets]);
  await pipeline(createReadStream(tarPath),createGzip({level:9}),createWriteStream(archivePath,{flags:'wx'}));
  const listing=run('tar',['-tzf',archivePath]).split(/\r?\n/).filter(Boolean),forbidden=listing.filter(name=>/(^|\/)\.env(?!\.example$)|\.env\.master$|private[_-]?key|id_(?:rsa|ed25519)(?:\.|$)|\.p(?:12|fx)$|master\/env\/sources\//i.test(name));
  if(forbidden.length)throw new Error(`Verbotene Release-Dateien: ${forbidden.join(', ')}`);
  for(const asset of assets)if(!listing.includes(asset))throw new Error(`Artefakt fehlt im Archiv: ${asset}`);
  const digest=crypto.createHash('sha256').update(readFileSync(archivePath)).digest('hex');
  process.stdout.write(JSON.stringify({release,archive:archivePath,files:listing.length,bytes:statSync(archivePath).size,sha256:digest,secretsIncluded:false})+'\n');
}finally{rmSync(tarPath,{force:true});}
