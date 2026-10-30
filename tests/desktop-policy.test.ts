import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAction,privateInterfaces,allowMediaPermission} from '../src/desktop/policy.js';
test('IPC rejects unsupported operations, unbounded text and arbitrary media source data',()=>{
  assert.throws(()=>parseAction({type:'exec',command:'cmd.exe'}));
  assert.throws(()=>parseAction({type:'message',channel:'genel',text:'x'.repeat(4001)}));
  assert.throws(()=>parseAction({type:'create',name:'Ekip',profile:{name:'A',avatar:'x',color:'red'},endpoint:{host:'8.8.8.8',port:45871}}));
  assert.equal(parseAction({type:'message',channel:'genel',text:'Merhaba'}).type,'message');
});
test('first launch exposes only private non-loopback adapters and tolerates no network',()=>{
  assert.deepEqual(privateInterfaces({}),[]);
  const result=privateInterfaces({test:[{address:'26.1.2.3',family:'IPv4',internal:false},{address:'8.8.8.8',family:'IPv4',internal:false},{address:'127.0.0.1',family:'IPv4',internal:true}] } as any);
  assert.deepEqual(result,[{name:'test',host:'26.1.2.3'}]);
});
test('a saved group can request reconnect only on a private address',()=>{
 assert.equal(parseAction({type:'reconnect',endpoint:{host:'26.2.3.4',port:45871}}).type,'reconnect');
 assert.throws(()=>parseAction({type:'reconnect',endpoint:{host:'1.1.1.1',port:45871}}));
});
test('recovery import requires the new computer private endpoint',()=>{
 assert.throws(()=>parseAction({type:'recoveryImport',data:'{}',password:'123456789012'}));
 assert.equal(parseAction({type:'recoveryImport',data:'{}',password:'123456789012',endpoint:{host:'26.4.5.6',port:45871}}).type,'recoveryImport');
});
test('local group removal action accepts no injected paths',()=>{
 assert.equal(parseAction({type:'forgetGroup'}).type,'forgetGroup');
 assert.throws(()=>parseAction({type:'forgetGroup',path:'../other'}));
});
test('screen permission is granted only briefly after a source is chosen',()=>{
 const now=100_000;
 assert.equal(allowMediaPermission('display-capture','mola://app/index.html',0,now-1,now),true);
 assert.equal(allowMediaPermission('display-capture','mola://app',0,now-30_001,now),false);
 assert.equal(allowMediaPermission('display-capture','https://other.example/',0,now-1,now),false);
 assert.equal(allowMediaPermission('media','mola://app/index.html',now+1,0,now),true);
 assert.equal(allowMediaPermission('media','mola://app/index.html',0,now-1,now),false);
 assert.equal(allowMediaPermission('speaker-selection','mola://app/index.html',0,0,now),true);
 assert.equal(allowMediaPermission('speaker-selection','https://other.example/',0,0,now),false);
 assert.equal(allowMediaPermission('notifications','mola://app/index.html',now+1,now-1,now),false);
});
