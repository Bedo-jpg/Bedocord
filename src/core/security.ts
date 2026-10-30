import forge from 'node-forge';
import { generateKeyPairSync, randomBytes, randomUUID, sign, verify, X509Certificate, scryptSync, createCipheriv, createDecipheriv, createPublicKey } from 'node:crypto';
import { z } from 'zod';
import { endpointSchema, eventSchema, profileSchema, validatePayload } from './policy.js';
import type { Device, Identity, Profile, Endpoint, Roster, ChatEvent, EventKind } from './types.js';

export function canonical(value: unknown): string {
  if (value===null || typeof value!=='object') return JSON.stringify(value);
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value as object).sort().map(k=>JSON.stringify(k)+':'+canonical((value as any)[k])).join(',')+'}';
}
function signed<T extends object>(data:T,key:string):T & {signature:string} { return {...data,signature:sign('sha256',Buffer.from(canonical(data)),key).toString('base64')}; }
export function verifySigned(data:any,publicKey:string):boolean {
  try { const {signature,...body}=data; return typeof signature==='string' && verify('sha256',Buffer.from(canonical(body)),publicKey,Buffer.from(signature,'base64')); } catch { return false; }
}
export function createDevice():Device {
  const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  return {deviceId:randomUUID(),key:keys.privateKey,publicKey:keys.publicKey};
}
function certificate(publicKey:string, subject:string, issuerCert:string|null, issuerKey:string, ca=false):string {
  const cert=forge.pki.createCertificate();
  cert.publicKey=forge.pki.publicKeyFromPem(publicKey);
  cert.serialNumber='01'+randomBytes(16).toString('hex');
  cert.validity.notBefore=new Date(Date.now()-86400000);
  cert.validity.notAfter=new Date(Date.now()+5*365*86400000);
  cert.setSubject([{name:'commonName',value:subject}]);
  cert.setIssuer(issuerCert ? forge.pki.certificateFromPem(issuerCert).subject.attributes : cert.subject.attributes);
  cert.setExtensions([{name:'basicConstraints',cA:ca,critical:true},{name:'keyUsage',digitalSignature:true,keyEncipherment:!ca,keyCertSign:ca,cRLSign:ca,critical:true},...(ca?[]:[{name:'extKeyUsage',serverAuth:true,clientAuth:true},{name:'subjectAltName',altNames:[{type:2,value:subject}]}])]);
  cert.sign(forge.pki.privateKeyFromPem(issuerKey),forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}
export function publicKeyOf(cert:string):string { return new X509Certificate(cert).publicKey.export({type:'spki',format:'pem'}).toString(); }
function signRoster(roster:Omit<Roster,'signature'>,key:string):Roster { return signed(roster,key); }
export function createGroup(name:string,profile:Profile,endpoint:Endpoint):Identity {
  name=z.string().trim().min(1).max(40).parse(name); profile=profileSchema.parse(profile);
  const root=createDevice(), device=createDevice(), groupId=randomUUID();
  const ca=certificate(root.publicKey,groupId,null,root.key,true);
  const cert=certificate(device.publicKey,device.deviceId,ca,root.key);
  const roster=signRoster({groupId,name,version:1,adminId:device.deviceId,members:[{id:device.deviceId,cert,profile,endpoint}],revoked:{}},root.key);
  return {groupId,deviceId:device.deviceId,key:device.key,cert,ca,adminKey:root.key,roster,profile,endpoint};
}
export function addMember(admin:Identity,device:Pick<Device,'deviceId'|'publicKey'> & {key?:string},profile:Profile,endpoint:Endpoint):Identity {
  if (!admin.adminKey) throw new Error('Yönetici gerekli.');
  profile=profileSchema.parse(profile); endpoint=endpointSchema.parse(endpoint);
  z.string().uuid().parse(device.deviceId);
  if (admin.roster.members.some(m=>m.id===device.deviceId)) throw new Error('Cihaz zaten kayıtlı.');
  if (admin.roster.members.filter(m=>!(m.id in admin.roster.revoked)).length>=10) throw new Error('Bu grup en fazla 10 kişilik.');
  const pub=createPublicKey(device.publicKey);
  if (pub.asymmetricKeyType!=='rsa' || (pub.asymmetricKeyDetails?.modulusLength??0)<2048) throw new Error('Geçersiz cihaz anahtarı.');
  const cert=certificate(device.publicKey,device.deviceId,admin.ca,admin.adminKey);
  const {signature,...previous}=admin.roster;
  admin.roster=signRoster({...previous,version:previous.version+1,members:[...previous.members,{id:device.deviceId,cert,profile,endpoint}]},admin.adminKey);
  return {groupId:admin.groupId,deviceId:device.deviceId,key:device.key??'',cert,ca:admin.ca,roster:admin.roster,profile,endpoint};
}
export function verifyRoster(input:unknown,ca:string):input is Roster {
  try {
    const member=z.object({id:z.string().uuid(),cert:z.string().max(8000),endpoint:endpointSchema,profile:profileSchema}).strict();
    const r=z.object({groupId:z.string().uuid(),name:z.string().min(1).max(40),version:z.number().int().min(1),adminId:z.string().uuid(),members:z.array(member).min(1).max(100),revoked:z.record(z.string().uuid(),z.number().int().min(0)),signature:z.string().max(1024)}).strict().parse(input);
    const caCert=new X509Certificate(ca);
    if (!verifySigned(r,publicKeyOf(ca)) || caCert.subject!==`CN=${r.groupId}` || !r.members.some(m=>m.id===r.adminId) || r.adminId in r.revoked) return false;
    if(new Set(r.members.map(m=>m.id)).size!==r.members.length || r.members.filter(m=>!(m.id in r.revoked)).length>10) return false;
    return r.members.every(m=>{const c=new X509Certificate(m.cert); return c.verify(caCert.publicKey) && c.checkHost(m.id)===m.id;});
  } catch { return false; }
}
export function revokeMember(admin:Identity,id:string,cutoff:number):Roster {
  if (!admin.adminKey || id===admin.roster.adminId || !admin.roster.members.some(m=>m.id===id)) throw new Error('Üye çıkarılamadı.');
  z.number().int().min(0).parse(cutoff);
  const {signature,...body}=admin.roster;
  admin.roster=signRoster({...body,version:body.version+1,revoked:{...body.revoked,[id]:cutoff}},admin.adminKey);
  return admin.roster;
}
export function rotateAdministrator(previous:Identity,endpoint:Endpoint):Identity {
  if(!previous.adminKey || previous.deviceId!==previous.roster.adminId)throw new Error('Yönetici kurtarma anahtarı gerekli.');
  endpoint=endpointSchema.parse(endpoint);
  const device=createDevice();
  const cert=certificate(device.publicKey,device.deviceId,previous.ca,previous.adminKey);
  const {signature,...body}=previous.roster;
  const roster=signRoster({...body,version:Math.max(body.version+1,Date.now()),adminId:device.deviceId,members:[...body.members,{id:device.deviceId,cert,endpoint,profile:previous.profile}],revoked:{...body.revoked,[previous.deviceId]:2147483647}},previous.adminKey);
  if(!verifyRoster(roster,previous.ca))throw new Error('Kurtarma üyeliği doğrulanamadı.');
  return {groupId:previous.groupId,deviceId:device.deviceId,key:device.key,cert,ca:previous.ca,adminKey:previous.adminKey,roster,endpoint,profile:previous.profile};
}
export function signEvent(identity:Identity,seq:number,clock:number,kind:EventKind,payload:Record<string,unknown>):ChatEvent {
  return signed({groupId:identity.groupId,id:`${identity.deviceId}:${seq}`,author:identity.deviceId,seq,clock,kind,payload:validatePayload(kind,payload),date:Date.now()},identity.key);
}
export function validateEvent(input:unknown,roster:Roster):ChatEvent {
  const event=eventSchema.parse(input);
  validatePayload(event.kind,event.payload);
  const member=roster.members.find(m=>m.id===event.author);
  if (!member || event.groupId!==roster.groupId || event.id!==`${event.author}:${event.seq}` || !verifySigned(event,publicKeyOf(member.cert))) throw new Error('Mesajın kimliği doğrulanamadı.');
  if (event.author in roster.revoked && event.seq>roster.revoked[event.author]) throw new Error('Üyelik sona erdi.');
  return event;
}
export function exportRecovery(identity:Identity,password:string):string {
  if(password.length<12 || password.length>256) throw new Error('Kurtarma parolası en az 12 karakter olmalı.');
  const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(password,salt,32);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(identity),'utf8'),cipher.final()]);
  return JSON.stringify({v:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});
}
export function importRecovery(text:string,password:string):Identity {
  if(text.length>200000 || password.length>256) throw new Error('Geçersiz kurtarma dosyası.');
  const x=JSON.parse(text); if(x.v!==1) throw new Error('Bilinmeyen kurtarma sürümü.');
  const key=scryptSync(password,Buffer.from(x.salt,'base64'),32);
  const dec=createDecipheriv('aes-256-gcm',key,Buffer.from(x.iv,'base64')); dec.setAuthTag(Buffer.from(x.tag,'base64'));
  const identity=JSON.parse(Buffer.concat([dec.update(Buffer.from(x.data,'base64')),dec.final()]).toString());
  if(!verifyRoster(identity.roster,identity.ca) || identity.groupId!==identity.roster.groupId || publicKeyOf(identity.cert)!==createPublicKey(identity.key).export({type:'spki',format:'pem'}).toString()) throw new Error('Geçersiz kimlik.');
  return identity;
}
