import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messageStatus} from '../src/ui/message-status.js';

test('own message status distinguishes local save from peer backup',()=>{
 assert.equal(messageStatus(false,1),'✓ Bu cihazda');
 assert.equal(messageStatus(false,3),'✓ Bu cihazda · yedek bekliyor');
 assert.equal(messageStatus(true,3),'✓ Başka cihaza yedeklendi');
});
