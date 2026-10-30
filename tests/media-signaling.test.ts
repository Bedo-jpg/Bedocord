import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Snapshot} from '../src/core/types.js';

test('voice offers and answers retain their SDP across the desktop bridge',async()=>{
 class Description {
  constructor(private kind:'offer'|'answer',private body:string){}
  get type(){return this.kind;}
  get sdp(){return this.body;}
  toJSON(){return {type:this.type,sdp:this.sdp};}
 }
 class Stream {
  getTracks(){return [{kind:'audio',enabled:true}];}
  getAudioTracks(){return this.getTracks();}
  getVideoTracks(){return [];}
 }
 class Connection {
  onnegotiationneeded:(()=>Promise<void>)|null=null;
  onicecandidate:unknown=null;
  ontrack:unknown=null;
  oniceconnectionstatechange:unknown=null;
  localDescription:Description|null=null;
  remoteDescription:{type:string;sdp:string}|null=null;
  signalingState='stable';
  addTrack(){}
  close(){}
  async setLocalDescription(){this.localDescription=new Description(this.remoteDescription?.type==='offer'?'answer':'offer','v=0\r\ns=bedocord\r\n');}
  async setRemoteDescription(value:{type:string;sdp:string}){this.remoteDescription=value;}
  async addIceCandidate(){}
 }
 const sent:any[]=[];
 const connections:Connection[]=[];
 Object.defineProperty(globalThis,'window',{configurable:true,value:{mola:{action:async(input:unknown)=>{sent.push(structuredClone(input));}}}});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>new Stream()}}});
 Object.defineProperty(globalThis,'MediaStream',{configurable:true,value:Stream});
 Object.defineProperty(globalThis,'RTCPeerConnection',{configurable:true,value:class extends Connection {constructor(){super();connections.push(this);}}});
 const {MediaController}=await import('../src/ui/media.js');
 const media=new MediaController();
 const presence={room:'room',muted:false,deafened:false,screen:null};
 media.snapshot={groupId:'group',name:'Bedocord',selfId:'self',admin:true,coordinator:'self',peers:[{id:'self',profile:{name:'Ben',avatar:'',color:''},online:true,presence},{id:'friend',profile:{name:'Arkadaş',avatar:'',color:''},online:true,presence}],events:[],channels:[{id:'room',name:'Ses',type:'voice'}],endpoint:{host:'127.0.0.1',port:45871},error:null} satisfies Snapshot;
 await media.join('room');
 assert.equal(connections.length,1);
 await connections[0].onnegotiationneeded?.();
 assert.deepEqual(sent.find(x=>x.type==='signal')?.signal.description,{type:'offer',sdp:'v=0\r\ns=bedocord\r\n'});
 await media.acceptSignal('friend',{description:{type:'offer',sdp:'v=0\r\ns=friend\r\n'}});
 assert.deepEqual(sent.filter(x=>x.type==='signal').at(-1)?.signal.description,{type:'answer',sdp:'v=0\r\ns=bedocord\r\n'});
});
