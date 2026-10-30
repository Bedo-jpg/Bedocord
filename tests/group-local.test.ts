import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {forgetLocalGroup} from '../src/desktop/group-local.js';

test('forgetting a group removes only its local identity and history',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bedocord-forget-'));
 const id='9c7a1000-0000-4000-8000-000000000001';
 const other='9c7a1000-0000-4000-8000-000000000002';
 try{
  writeFileSync(join(dir,'identity.bin'),'secret');
  writeFileSync(join(dir,`group-${id}.sqlite`),'history');
  writeFileSync(join(dir,`group-${other}.sqlite`),'other');
  writeFileSync(join(dir,'preferences.json'),'prefs');
  forgetLocalGroup(dir,id);
  assert.equal(existsSync(join(dir,'identity.bin')),false);
  assert.equal(existsSync(join(dir,`group-${id}.sqlite`)),false);
  assert.equal(readFileSync(join(dir,`group-${other}.sqlite`),'utf8'),'other');
  assert.equal(readFileSync(join(dir,'preferences.json'),'utf8'),'prefs');
  assert.throws(()=>forgetLocalGroup(dir,'../preferences'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
