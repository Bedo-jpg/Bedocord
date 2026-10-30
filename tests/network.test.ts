import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGroup,createDevice,addMember,exportRecovery,importRecovery,rotateAdministrator} from '../src/core/security.js';
import {Store} from '../src/core/store.js';
import {Peer,joinGroup} from '../src/core/peer.js';
import type {Identity} from '../src/core/types.js';
import https from 'node:https';

const profile={name:'Ada',avatar:'🪐',color:'#a78bfa'};
async function until(check:()=>boolean,ms=15000){const start=Date.now();while(!check()){if(Date.now()-start>ms)throw new Error('Koşul zaman aşımına uğradı');await new Promise(r=>setTimeout(r,80));}}
async function peer(identity:Identity){const s=await Store.open(':memory:');const p=new Peer(identity,s,{allowLoopback:true,heartbeatMs:120,timeoutMs:600});await p.start();return p;}

test('real mTLS peers replicate, survive coordinator loss, and merge offline messages',async()=>{
  const a=createGroup('Ekip',profile,{host:'127.0.0.1',port:47101});
  const b=addMember(a,createDevice(),{...profile,name:'Bora'},{host:'127.0.0.1',port:47103});
  const c=addMember(a,createDevice(),{...profile,name:'Cem'},{host:'127.0.0.1',port:47105});b.roster=a.roster;
  const pa=await peer(a),pb=await peer(b),pc=await peer(c);
  try{
    await until(()=>[pa,pb,pc].every(p=>p.snapshot().peers.filter(x=>x.online).length===3));
    pa.sendMessage('genel','ilk mesaj');
    await until(()=>pb.snapshot().events.some(e=>e.payload.text==='ilk mesaj')&&pa.snapshot().events[0]?.backedUp===true);
    assert.equal(pc.snapshot().events[0].payload.text,'ilk mesaj');
    await pa.stop();
    await until(()=>pb.snapshot().coordinator===pc.snapshot().coordinator && pb.snapshot().coordinator!==a.deviceId);
    pb.sendMessage('genel','Ada yokken');
    await until(()=>pc.snapshot().events.some(e=>e.payload.text==='Ada yokken'));
    await pb.stop();
    pb.sendMessage('genel','Bora çevrimdışı');
    pc.sendMessage('genel','Cem çevrimiçi');
    await pb.start();
    await until(()=>pb.snapshot().events.length===4 && pc.snapshot().events.length===4);
    assert.deepEqual(pb.snapshot().events.map(e=>e.id),pc.snapshot().events.map(e=>e.id));
    await pa.start();
    await until(()=>pa.snapshot().events.length===4);
  }finally{await Promise.all([pa,pb,pc].map(p=>p.stop()));[pa,pb,pc].forEach(p=>p.store.close());}
});

test('join invitation is single use, enrollment is persisted and normal peer auth uses group CA',async()=>{
  const a=createGroup('Davetli ekip',profile,{host:'127.0.0.1',port:47111});
  const pa=await peer(a);
  try{
    const invite=pa.createInvite();
    const b=await joinGroup(invite,{...profile,name:'Davetli'},{host:'127.0.0.1',port:47113},true);
    assert.equal(b.roster.members.length,2);
    await assert.rejects(()=>joinGroup(invite,profile,{host:'127.0.0.1',port:47115},true));
    const pb=await peer(b);
    try{await until(()=>pa.snapshot().peers.filter(x=>x.online).length===2);pb.sendMessage('genel','girdim');await until(()=>pa.snapshot().events.length===1);}finally{await pb.stop();pb.store.close();}
    const other=createGroup('Yabancı',profile,{host:'127.0.0.1',port:47117});
    await assert.rejects(()=>new Promise((resolve,reject)=>{const req=https.get({host:'127.0.0.1',port:47111,ca:a.ca,servername:a.deviceId,key:other.key,cert:other.cert,rejectUnauthorized:true},resolve);req.on('error',reject);}));
    assert.equal(pa.snapshot().peers.filter(x=>x.online).length,1);
  }finally{await pa.stop();pa.store.close();}
});

test('ten authenticated members converge after every member posts and coordinator leaves', {timeout:60000}, async()=>{
  const identities:Identity[]=[createGroup('Onlu ekip',profile,{host:'127.0.0.1',port:47201})];
  for(let n=1;n<10;n++)identities.push(addMember(identities[0],createDevice(),{...profile,name:`Kişi ${n}`},{host:'127.0.0.1',port:47201+n*2}));
  for(const i of identities)i.roster=identities[0].roster;
  const peers:Peer[]=[];
  try{
    for(const identity of identities)peers.push(await peer(identity));
    await until(()=>peers.every(p=>p.snapshot().peers.filter(x=>x.online).length===10),30000);
    peers.forEach((p,n)=>p.sendMessage('genel',`mesaj ${n}`));
    await until(()=>peers.every(p=>p.snapshot().events.length===10),30000);
    const coordinator=peers.find(p=>p.identity.deviceId===peers[0].snapshot().coordinator)!;
    await coordinator.stop();
    const rest=peers.filter(p=>p!==coordinator);
    await until(()=>rest.every(p=>p.snapshot().coordinator===rest[0].snapshot().coordinator&&p.snapshot().coordinator!==coordinator.identity.deviceId),15000);
    assert.equal(new Set(rest.map(p=>p.snapshot().events.map(e=>e.id).join(','))).size,1);
  }finally{await Promise.all(peers.map(p=>p.stop()));peers.forEach(p=>p.store.close());}
});

test('member whose private address changed reconnects through a known peer', {timeout:15000}, async()=>{
  let a:Identity,b:Identity;
  do {a=createGroup('Ekip',profile,{host:'127.0.0.1',port:47301});b=addMember(a,createDevice(),{...profile,name:'Bora'},{host:'127.0.0.1',port:47303});}while(b.deviceId<a.deviceId);
  b.endpoint={host:'127.0.0.1',port:47305};
  const pa=await peer(a),pb=await peer(b);
  try{await until(()=>pa.snapshot().peers.filter(x=>x.online).length===2,5000);pb.sendMessage('genel','Yeni adres');await until(()=>pa.snapshot().events.length===1,5000);}
  finally{await pa.stop();await pb.stop();pa.store.close();pb.store.close();}
});

test('recovered admin joins old peer and signs new events without colliding with old history', {timeout:15000}, async()=>{
 const a=createGroup('Ekip',profile,{host:'127.0.0.1',port:47401});
 const b=addMember(a,createDevice(),{...profile,name:'Bora'},{host:'127.0.0.1',port:47403});
 const backup=exportRecovery(a,'uzun-bir-kurtarma-parolasi');
 const pa=await peer(a),pb=await peer(b);
 try{
  await until(()=>pa.snapshot().peers.filter(p=>p.online).length===2);
  pa.sendMessage('genel','yedeğin sonrası');
  await until(()=>pb.snapshot().events.length===1);
  await pa.stop();
  const old=importRecovery(backup,'uzun-bir-kurtarma-parolasi');old.endpoint={host:'127.0.0.1',port:47405};old.recovering=true;
  const restore=await peer(old);
  try{
   await until(()=>restore.snapshot().peers.filter(p=>p.online).length===2);
   assert.throws(()=>restore.sendMessage('genel','erken'));
   await until(()=>restore.snapshot().events.length===1);
   const newId=rotateAdministrator(restore.identity,restore.identity.endpoint);
   await restore.stop();restore.store.close();
   const fresh=await peer(newId);
   try{await until(()=>pb.snapshot().peers.some(p=>p.id===fresh.identity.deviceId&&p.online));fresh.sendMessage('genel','kurtarma sonrası');await until(()=>pb.snapshot().events.length===2);assert.deepEqual(pb.snapshot().events.map(e=>e.payload.text),['yedeğin sonrası','kurtarma sonrası']);}
   finally{await fresh.stop();fresh.store.close();}
  }finally{await restore.stop();}
 }finally{await pa.stop();await pb.stop();pa.store.close();pb.store.close();}
});
