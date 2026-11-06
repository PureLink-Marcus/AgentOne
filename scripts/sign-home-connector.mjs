import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('.'),privatePath=path.join(root,'master','env','home-connector-update-private.pem'),publicPath=path.join(root,'connector','raspberry','update-public.pem'),zipPath=path.join(root,'output','connector','agentone-home-connector-raspberry.zip'),signaturePath=path.join(root,'output','connector','agentone-home-connector-raspberry.zip.sig'),manifestPath=path.join(root,'output','connector','home-connector-release.json');
let privateKey;if(fs.existsSync(privatePath))privateKey=crypto.createPrivateKey(fs.readFileSync(privatePath));else{const pair=crypto.generateKeyPairSync('ed25519');privateKey=pair.privateKey;fs.writeFileSync(privatePath,privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});}
const publicKey=crypto.createPublicKey(privateKey);fs.writeFileSync(publicPath,publicKey.export({type:'spki',format:'pem'}));
if(!fs.existsSync(zipPath)){console.log('Update-Schlüsselpaar vorbereitet.');process.exit(0);}
const body=fs.readFileSync(zipPath),signature=crypto.sign(null,body,privateKey),sha256=crypto.createHash('sha256').update(body).digest('hex');fs.writeFileSync(signaturePath,signature);fs.writeFileSync(manifestPath,JSON.stringify({schema:'agentone.home-connector.release/v1',release:'2026.11.06-79',connectorSchema:'agentone.home-connector/v4',algorithm:'Ed25519',sha256,packageUrl:'https://guenni.mwart.solutions/agentone/downloads/home-connector-raspberry.zip',signatureUrl:'https://guenni.mwart.solutions/agentone/downloads/home-connector-raspberry.zip.sig'},null,2));console.log(`Connector-Release signiert: ${sha256}`);
