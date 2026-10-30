import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createGroup, createDevice, addMember, verifyRoster, signEvent, exportRecovery, importRecovery, revokeMember, rotateAdministrator } from '../src/core/security.js';
import { Store } from '../src/core/store.js';
import { validateEndpoint } from '../src/core/policy.js';

const profile = { name: 'Ada', avatar: '🪐', color: '#a78bfa' };
const endpoint = { host: '127.0.0.1', port: 45871 };

test('signed records reject tampering and cross-group messages; SQLite survives reopen and deduplicates', async () => {
  await mkdir('test-results',{recursive:true});
  const dir = await mkdtemp(join('test-results', 'mola-core-'));
  const a = createGroup('Bizim ekip', profile, endpoint);
  const b = createGroup('Diğer grup', profile, endpoint);
  const store = await Store.open(join(dir, 'chat.sqlite'));
  try {
    const e = signEvent(a, 1, 1, 'message', { channel: 'genel', text: 'Merhaba!' });
    assert.equal(store.append(e, a.roster), true);
    assert.equal(store.append(e, a.roster), false);
    assert.throws(() => store.append({ ...e, payload: { channel: 'genel', text: 'değiştirildi' } }, a.roster));
    assert.throws(() => store.append(signEvent(b, 1, 1, 'message', {channel:'genel',text:'yabancı'}), a.roster));
    assert.equal(store.isBackedUp(e.id), false);
    store.acknowledge(e.id, 'another-device');
    assert.equal(store.isBackedUp(e.id), true);
    store.close();
    const reopened = await Store.open(join(dir, 'chat.sqlite'));
    assert.equal(reopened.events(a.roster)[0].payload.text, 'Merhaba!');
    assert.equal(reopened.isBackedUp(e.id), true);
    reopened.close();
  } finally { await rm(dir, {recursive:true,force:true}); }
});

test('out of order events retain holes until filled and produce a deterministic history', async () => {
  const a = createGroup('Ekip', profile, endpoint);
  const s = await Store.open(':memory:');
  const e3 = signEvent(a,3,3,'message',{channel:'genel',text:'üç'});
  const e1 = signEvent(a,1,1,'message',{channel:'genel',text:'bir'});
  const e2 = signEvent(a,2,2,'message',{channel:'genel',text:'iki'});
  s.append(e3,a.roster); s.append(e1,a.roster);
  assert.equal(s.heads()[a.deviceId],1);
  s.append(e2,a.roster);
  assert.equal(s.heads()[a.deviceId],3);
  assert.deepEqual(s.events(a.roster).map(e=>e.payload.text),['bir','iki','üç']);
  s.close();
});

test('only CA-signed membership is accepted and revocation converges at cutoff', async () => {
  const a = createGroup('Ekip',profile,endpoint);
  const d = createDevice();
  const b = addMember(a,d, {...profile,name:'Bora'}, {...endpoint,port:45873});
  assert.equal(verifyRoster(b.roster, a.ca), true);
  assert.equal(verifyRoster({...b.roster, name:'forged'},a.ca), false);
  const s = await Store.open(':memory:');
  s.append(signEvent(b,1,1,'message',{channel:'genel',text:'önce'}),b.roster);
  s.append(signEvent(b,2,2,'message',{channel:'genel',text:'sonra'}),b.roster);
  const revoked = revokeMember(a,b.deviceId,1);
  assert.deepEqual(s.events(revoked).map(e=>e.payload.text),['önce']);
  assert.throws(()=>s.append(signEvent(b,3,3,'message',{channel:'genel',text:'yasak'}),revoked));
  s.close();
});

test('recovery uses authenticated encryption, rejects wrong password and does not expose keys', () => {
  const a = createGroup('Ekip',profile,endpoint);
  const backup = exportRecovery(a,'uzun-bir-kurtarma-parolasi');
  assert.equal(backup.includes('PRIVATE KEY'),false);
  assert.equal(importRecovery(backup,'uzun-bir-kurtarma-parolasi').groupId,a.groupId);
  assert.throws(()=>importRecovery(backup,'yanlis-parola'));
  assert.throws(()=>exportRecovery(a,'123'));
});

test('endpoint restrictions reject public, wildcard, multicast and invalid ports', () => {
  for (const host of ['0.0.0.0','8.8.8.8','224.0.0.1','example.com','127.0.0.1']) assert.throws(()=>validateEndpoint({host,port:45871}));
  assert.deepEqual(validateEndpoint({host:'26.1.2.3',port:45871}),{host:'26.1.2.3',port:45871});
  assert.throws(()=>validateEndpoint({host:'192.168.1.2',port:0}));
});

test('failed disk flush cannot acknowledge or keep an uncommitted message in memory',async()=>{
 const identity=createGroup('Ekip',profile,endpoint),store=await Store.open(':memory:');
 const event=signEvent(identity,1,1,'message',{channel:'genel',text:'kalıcı olmalı'});
 const flush=store.flush.bind(store);
 store.flush=()=>{throw new Error('Disk dolu');};
 assert.throws(()=>store.append(event,identity.roster),/Disk dolu/);
 assert.equal(store.events(identity.roster).length,0);
 store.flush=flush;
 assert.equal(store.append(event,identity.roster),true);
 store.close();
});
test('restored administrator gets a fresh author and keeps earlier author history',async()=>{
 const old=createGroup('Ekip',profile,endpoint),store=await Store.open(':memory:');
 store.append(signEvent(old,1,1,'message',{channel:'genel',text:'eski'}),old.roster);
 const restored=rotateAdministrator(importRecovery(exportRecovery(old,'uzun-bir-kurtarma-parolasi'),'uzun-bir-kurtarma-parolasi'),{host:'26.2.3.4',port:45871});
 assert.notEqual(restored.deviceId,old.deviceId);
 assert.equal(verifyRoster(restored.roster,restored.ca),true);
 store.append(signEvent(restored,1,2,'message',{channel:'genel',text:'yeni'}),restored.roster);
 assert.deepEqual(store.events(restored.roster).map(e=>e.payload.text),['eski','yeni']);
 store.close();
});
