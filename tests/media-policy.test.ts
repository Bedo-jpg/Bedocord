import {test} from 'node:test';
import assert from 'node:assert/strict';
import {broadcastWinner} from '../src/core/policy.js';
import {videoProfile} from '../src/core/media-policy.js';
test('partition merge keeps one deterministic broadcaster within a connected room',()=>{
 assert.equal(broadcastWinner([{id:'b',presence:{room:'lounge',screen:'z'}},{id:'a',presence:{room:'lounge',screen:'a'}},{id:'c',presence:{room:null,screen:'0'}}]),'a');
 assert.equal(broadcastWinner([{id:'b',presence:{room:null,screen:null}}]),null);
});
test('simultaneous broadcasts in separate rooms still choose one group-wide winner',()=>{
 assert.equal(broadcastWinner([{id:'a',presence:{room:'lounge',screen:'z'}},{id:'b',presence:{room:'gaming',screen:'a'}}]),'b');
});
test('economy screen mode caps sender bitrate and capture resolution',()=>{
 assert.deepEqual(videoProfile('economy'),{width:854,height:480,frameRate:20,maxBitrate:600000});
 assert.deepEqual(videoProfile('balanced'),{width:1280,height:720,frameRate:30,maxBitrate:1500000});
});
