import { api } from './api.js';
import type { Snapshot, Presence } from '../core/types.js';
import { broadcastWinner,videoProfile,type VideoQuality } from '../core/media-policy.js';
type Link={pc:RTCPeerConnection;makingOffer:boolean;ignoreOffer:boolean;polite:boolean;audio:MediaStream;video:MediaStream;candidates:RTCIceCandidateInit[]};
export class MediaController {
  room:string|null=null;muted=false;deafened=false;screen:MediaStream|null=null;mic:MediaStream|null=null;
  microphoneId='';outputId='';quality:VideoQuality='balanced';
  onError:(message:string)=>void=()=>{};
  links=new Map<string,Link>();
  private pendingSignals=new Map<string,any[]>();
  snapshot:Snapshot|null=null;
  onChange:()=>void=()=>{};
  private presence():Presence{return {room:this.room,muted:this.muted,deafened:this.deafened,screen:this.screen?this.snapshot?.selfId??'paylasim':null};}
  private async publish(){if(this.snapshot)await api.action({type:'presence',presence:this.presence()});this.onChange();}
  async join(room:string){if(this.room===room)return;await this.leave();await api.action({type:'micArm'});this.mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,...(this.microphoneId?{deviceId:{exact:this.microphoneId}}:{})},video:false});this.mic.getAudioTracks().forEach(t=>t.enabled=!this.muted);this.room=room;await this.publish();this.sync(this.snapshot);}
  async setMicrophone(id:string){this.microphoneId=id;if(!this.room)return;await api.action({type:'micArm'});const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,...(id?{deviceId:{exact:id}}:{})}});stream.getAudioTracks().forEach(t=>t.enabled=!this.muted);const old=this.mic;this.mic=stream;for(const l of this.links.values())for(const sender of l.pc.getSenders())if(sender.track?.kind==='audio'&&old?.getTracks().includes(sender.track))await sender.replaceTrack(stream.getAudioTracks()[0]);old?.getTracks().forEach(t=>t.stop());this.onChange();}
  async setOutput(id:string){this.outputId=id;await Promise.all([...document.querySelectorAll('audio[data-mola-peer]')].map(el=>(el as HTMLAudioElement).setSinkId?.(id)));this.onChange();}
  setQuality(quality:VideoQuality){this.quality=quality;if(this.screen)void this.applyQuality();this.onChange();}
  private async applyQuality(){if(!this.screen)return;const p=videoProfile(this.quality);const track=this.screen.getVideoTracks()[0];try{await track.applyConstraints({width:{ideal:p.width,max:p.width},height:{ideal:p.height,max:p.height},frameRate:{ideal:p.frameRate,max:p.frameRate}});}catch{}for(const l of this.links.values())for(const sender of l.pc.getSenders())if(sender.track===track){try{const params=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];params.encodings[0].maxBitrate=p.maxBitrate;await sender.setParameters(params);}catch{}}}
  async leave(){this.room=null;await this.stopScreen();this.mic?.getTracks().forEach(t=>t.stop());this.mic=null;for(const l of this.links.values())l.pc.close();this.links.clear();this.pendingSignals.clear();await this.publish();}
  async setMute(value:boolean){this.muted=value;this.mic?.getAudioTracks().forEach(t=>t.enabled=!value);await this.publish();}
  async setDeafen(value:boolean){this.deafened=value;await this.publish();}
  async startScreen(sourceId:string,audio:boolean){if(!this.room)throw new Error('Önce ses odasına katılın.');await api.action({type:'screenChoice',id:sourceId,audio});const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio});this.screen=stream;const track=stream.getVideoTracks()[0];track.contentHint='detail';track.onended=()=>void this.stopScreen();for(const l of this.links.values())for(const t of stream.getTracks())l.pc.addTrack(t,stream);await this.applyQuality();await this.publish();}
  async stopScreen(){const old=this.screen;if(!old)return;this.screen=null;for(const l of this.links.values())for(const sender of l.pc.getSenders())if(old.getTracks().includes(sender.track!))l.pc.removeTrack(sender);old.getTracks().forEach(t=>t.stop());await this.publish();}
  sync(snapshot:Snapshot|null){this.snapshot=snapshot;if(!snapshot||!this.room)return;const live=new Set(snapshot.peers.filter(p=>p.id!==snapshot.selfId&&p.online&&p.presence.room===this.room).map(p=>p.id));for(const [id,l] of this.links)if(!live.has(id)){l.pc.close();this.links.delete(id);}
    for(const id of live){if(!this.links.has(id))this.connect(id);const queued=this.pendingSignals.get(id)??[];this.pendingSignals.delete(id);for(const signal of queued)void this.acceptSignal(id,signal).catch(()=>{});}
    const winner=broadcastWinner(snapshot.peers);
    if(this.screen&&winner&&winner!==snapshot.selfId)void this.stopScreen();this.onChange();
  }
  private connect(id:string){
    if(!this.snapshot)return;
    const pc=new RTCPeerConnection({iceServers:[]});
    const link:Link={pc,makingOffer:false,ignoreOffer:false,polite:this.snapshot.selfId>id,audio:new MediaStream(),video:new MediaStream(),candidates:[]};this.links.set(id,link);
    pc.onnegotiationneeded=async()=>{try{link.makingOffer=true;await pc.setLocalDescription();await api.action({type:'signal',peerId:id,signal:{description:pc.localDescription?.toJSON()}});}catch{}finally{link.makingOffer=false;}};
    pc.onicecandidate=event=>{if(event.candidate)void api.action({type:'signal',peerId:id,signal:{candidate:event.candidate.toJSON()}}).catch(()=>{});};
    pc.ontrack=event=>{(event.track.kind==='video'?link.video:link.audio).addTrack(event.track);event.track.onended=()=>this.onChange();this.onChange();};
    pc.oniceconnectionstatechange=()=>{if(pc.iceConnectionState==='failed'&&this.screen)this.onError('Yayın bağlantısı koptu. Radmin bağlantısını kontrol edin.');};
    for(const track of this.mic?.getTracks()??[])pc.addTrack(track,this.mic!);
    for(const track of this.screen?.getTracks()??[])pc.addTrack(track,this.screen!);
    if(this.screen)void this.applyQuality();
  }
  async acceptSignal(from:string,signal:any){if(!this.room||!this.snapshot?.peers.some(p=>p.id===from&&p.online))return;
    if(!this.snapshot.peers.some(p=>p.id===from&&p.presence.room===this.room)){const queued=this.pendingSignals.get(from)??[];if(queued.length<32)this.pendingSignals.set(from,[...queued,signal]);return;}
    if(!this.links.has(from))this.connect(from);const link=this.links.get(from)!;const pc=link.pc;
    if(signal?.description){const desc=signal.description as RTCSessionDescriptionInit;const collision=desc.type==='offer'&&(link.makingOffer||pc.signalingState!=='stable');link.ignoreOffer=!link.polite&&collision;if(link.ignoreOffer)return;await pc.setRemoteDescription(desc);for(const candidate of link.candidates.splice(0))await pc.addIceCandidate(candidate);if(desc.type==='offer'){await pc.setLocalDescription();await api.action({type:'signal',peerId:from,signal:{description:pc.localDescription?.toJSON()}});}}
    else if(signal?.candidate){if(!pc.remoteDescription){if(link.candidates.length<64)link.candidates.push(signal.candidate);return;}try{await pc.addIceCandidate(signal.candidate);}catch(e){if(!link.ignoreOffer)throw e;}}
  }
}
