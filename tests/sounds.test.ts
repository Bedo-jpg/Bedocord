import {test} from 'node:test';
import assert from 'node:assert/strict';
import {soundPattern} from '../src/ui/sounds.js';
import {parseAction} from '../src/desktop/policy.js';

test('short, distinct cues exist for all requested actions',()=>{
 const kinds=['message','join','leave','mute','unmute','screenOn','screenOff'] as const;
 const signatures=kinds.map(kind=>{
  const notes=soundPattern(kind);
  assert.ok(notes.length>=1 && notes.length<=3);
  assert.ok(notes.every(note=>note.frequency>=180&&note.frequency<=1100&&note.duration<=0.15));
  return JSON.stringify(notes);
 });
 assert.equal(new Set(signatures).size,kinds.length);
});

test('sound preference must be a boolean',()=>{
 const base={type:'preferences',theme:'dark',accent:'#ff8a00',fontSize:15};
 assert.equal(parseAction({...base,soundsEnabled:false}).type,'preferences');
 assert.throws(()=>parseAction({...base,soundsEnabled:'false'}));
});
