import { EventEmitter } from 'node:events';
import https from 'node:https';
import type { TLSSocket } from 'node:tls';
import { X509Certificate, randomBytes, randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { createDevice, addMember, signEvent, verifyRoster, revokeMember, publicKeyOf } from './security.js';
import { validateEndpoint, profileSchema, presenceSchema } from './policy.js';
import { Store } from './store.js';
import { EMPTY_PRESENCE, type Identity, type Profile, type Endpoint, type Presence, type Snapshot, type Roster, type EventKind } from './types.js';

type Link={socket:WebSocket;id:string;cert:string;incoming:boolean;seen:number;presence:Presence;claim:{id:string;since:number};ready:boolean;frames:number;window:number};
type Options={allowLoopback?:boolean;heartbeatMs?:number;timeoutMs?:number};
const MAX_FRAME=1024*1024;
export class Peer extends EventEmitter {
  private server?:https.Server;
  private enrollment?:https.Server;
  private wss?:WebSocketServer;
  private timer?:ReturnType<typeof setInterval>;
  private links=new Map<string,Link>();
  private pending=new Map<string,WebSocket>();
  private invitations=new Map<string,number>();
  private addresses=new Map<string,Endpoint>();
  private presence:Presence={...EMPTY_PRESENCE};
  private claim:{id:string;since:number};
  private stopped=true;
  private error:string|null=null;
  constructor(public identity:Identity,public store:Store,private options:Options={}) {
    super();
    if(!verifyRoster(identity.roster,identity.ca))throw new Error('Grup üyeliği doğrulanamadı.');
    this.claim={id:identity.deviceId,since:Date.now()};
  }
  async start(){
    if(!this.stopped)return;
    const endpoint=validateEndpoint(this.identity.endpoint,!!this.options.allowLoopback);
    this.stopped=false;
    const tls={key:this.identity.key,cert:this.identity.cert,ca:this.identity.ca,minVersion:'TLSv1.3' as const};
    this.server=https.createServer({...tls,requestCert:true,rejectUnauthorized:true},(_q,r)=>{r.writeHead(404);r.end();});
    this.server.on('tlsClientError',()=>{});
    this.wss=new WebSocketServer({noServer:true,maxPayload:MAX_FRAME,perMessageDeflate:false});
    this.server.on('upgrade',(req,socket,head)=>{
      const s=req.socket as TLSSocket;
      if(!s.authorized || req.url!=='/peer'){socket.destroy();return;}
      const raw=s.getPeerCertificate().raw;
      if(!raw){socket.destroy();return;}
      this.wss!.handleUpgrade(req,socket,head,ws=>this.attach(ws,new X509Certificate(raw).toString(),true));
    });
    try{
      await new Promise<void>((resolve,reject)=>{this.server!.once('error',reject);this.server!.listen(endpoint.port,endpoint.host,()=>{this.server!.removeListener('error',reject);resolve();});});
      this.server.on('error',e=>{this.error=e.message;this.emit('change');});
      if(this.identity.adminKey){
        this.enrollment=https.createServer({...tls,requestCert:false},(req,res)=>{
          if(req.method!=='POST'||req.url!=='/join'){res.writeHead(404);res.end();return;}
          let size=0;const chunks:Buffer[]=[];
          req.setTimeout(10000,()=>req.destroy());
          req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>20000){req.destroy();return;}chunks.push(chunk);});
          req.on('end',()=>{
            try{
              const x=JSON.parse(Buffer.concat(chunks).toString());
              const token=z.string().length(64).parse(x.token);
              const expiry=this.invitations.get(token);
              if(!expiry||Date.now()>expiry)throw new Error('Davet geçersiz, süresi dolmuş veya kullanılmış.');
              const endpoint=validateEndpoint(x.endpoint,!!this.options.allowLoopback);
              const previous=this.identity.roster;
              const joined=addMember(this.identity,{deviceId:x.deviceId,publicKey:z.string().max(5000).parse(x.publicKey)},profileSchema.parse(x.profile),endpoint);
              try{this.emit('identity');}catch(e){this.identity.roster=previous;throw e;}
              this.invitations.delete(token);
              res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(joined));
              this.broadcastState();this.emit('change');
            }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e instanceof Error?e.message:'Kayıt başarısız.'}));}
          });
        });
        this.enrollment.requestTimeout=10000;this.enrollment.headersTimeout=10000;
        await new Promise<void>((resolve,reject)=>{this.enrollment!.once('error',reject);this.enrollment!.listen(endpoint.port+1,endpoint.host,()=>{this.enrollment!.removeListener('error',reject);resolve();});});
        this.enrollment.on('error',e=>{this.error=e.message;this.emit('change');});
      }
      this.tick();this.timer=setInterval(()=>this.tick(),this.options.heartbeatMs??2000);this.emit('change');
    }catch(e){await this.stop();throw e;}
  }
  async stop(){
    this.stopped=true;clearInterval(this.timer);this.timer=undefined;
    for(const l of this.links.values())l.socket.terminate();this.links.clear();
    for(const socket of this.pending.values())socket.terminate();this.pending.clear();
    this.wss?.clients.forEach(s=>s.terminate());this.wss?.close();
    await Promise.all([this.server,this.enrollment].filter(Boolean).map(s=>new Promise<void>(resolve=>{s!.close(()=>resolve());s!.closeAllConnections();})));
    this.server=undefined;this.enrollment=undefined;this.presence={...EMPTY_PRESENCE};this.emit('change');
  }
  private send(socket:WebSocket,data:unknown){if(socket.readyState===WebSocket.OPEN && socket.bufferedAmount<4*MAX_FRAME)socket.send(JSON.stringify(data));}
  private attach(socket:WebSocket,cert:string,incoming:boolean){
    let id:string;
    try{id=new X509Certificate(cert).subject.replace(/^CN=/,'');z.string().uuid().parse(id);}catch{socket.terminate();return;}
    if(id===this.identity.deviceId||id in this.identity.roster.revoked){socket.terminate();return;}
    const old=this.links.get(id);
    if(old && old.socket.readyState===WebSocket.OPEN){
      const preferredIncoming=this.identity.deviceId>id;
      if(old.incoming===preferredIncoming || incoming!==preferredIncoming){socket.terminate();return;}
      old.socket.terminate();
    }
    const now=Date.now();const link:Link={socket,id,cert,incoming,seen:now,presence:{...EMPTY_PRESENCE},claim:{id,since:now},ready:false,frames:0,window:now};
    this.links.set(id,link);
    socket.on('message',data=>{try{
      if(Date.now()-link.window>10000){link.window=Date.now();link.frames=0;}
      if(++link.frames>200)throw new Error('Çok fazla istek.');
      this.receive(link,JSON.parse(data.toString()));
    }catch{socket.close(1008,'Geçersiz ileti');}});
    socket.on('error',()=>{});
    socket.on('close',()=>{if(this.links.get(id)===link){this.links.delete(id);this.elect();this.emit('change');}});
    this.sendState(link);
  }
  private adoptRoster(roster:unknown){
    if(!verifyRoster(roster,this.identity.ca)||roster.groupId!==this.identity.groupId)throw new Error('Üyelik imzası geçersiz.');
    if(roster.version>this.identity.roster.version){
      this.identity.roster=roster;this.emit('identity');
      for(const [id,l] of this.links)if(id in roster.revoked)l.socket.terminate();
      if(this.identity.deviceId in roster.revoked){this.error='Bu gruptaki üyeliğiniz sona erdi.';void this.stop();}
    }
  }
  private receive(link:Link,x:any){
    if(!x || typeof x!=='object')throw new Error('Geçersiz paket.');
    if(x.type==='state'){
      this.adoptRoster(x.roster);
      const member=this.identity.roster.members.find(m=>m.id===link.id);
      if(!member || member.id in this.identity.roster.revoked || new X509Certificate(member.cert).fingerprint256!==new X509Certificate(link.cert).fingerprint256)throw new Error('Üye değil.');
      link.presence=presenceSchema.parse(x.presence);
      link.claim=z.object({id:z.string().uuid(),since:z.number().finite().min(0).max(Date.now()+60000)}).parse(x.claim);
      const heads=z.record(z.string().uuid(),z.number().int().min(0).max(2147483647)).parse(x.heads);
      this.addresses.set(link.id,validateEndpoint(x.endpoint,!!this.options.allowLoopback));
      link.ready=true;link.seen=Date.now();
      const events=this.store.missing(heads,this.identity.roster,24);
      if(events.length)this.send(link.socket,{type:'events',events});
      this.elect();this.emit('change');return;
    }
    if(!link.ready||link.id in this.identity.roster.revoked)throw new Error('El sıkışma gerekli.');
    if(x.type==='events'){
      if(!Array.isArray(x.events)||x.events.length>24)throw new Error('Büyük paket.');
      const ack:string[]=[];
      for(const e of x.events){try{this.store.append(e,this.identity.roster);ack.push(e.id);}catch(error){if(!(e?.author in this.identity.roster.revoked))throw error;}}
      this.send(link.socket,{type:'ack',ids:ack});this.emit('change');
    }else if(x.type==='ack'){
      const ids=z.array(z.string().max(100)).max(24).parse(x.ids);for(const id of ids)this.store.acknowledge(id,link.id);this.emit('change');
    }else if(x.type==='signal'){
      if(JSON.stringify(x.signal).length>65536)throw new Error('Büyük sinyal.');
      this.emit('signal',{from:link.id,signal:x.signal});
    }else throw new Error('Bilinmeyen paket.');
  }
  private sendState(link:Link){this.send(link.socket,{type:'state',roster:this.identity.roster,endpoint:this.identity.endpoint,heads:this.store.heads(),presence:this.presence,claim:this.claim});}
  private broadcastState(){for(const l of this.links.values())this.sendState(l);}
  private tick(){
    if(this.stopped)return;
    const now=Date.now();
    for(const l of this.links.values())if(now-l.seen>(this.options.timeoutMs??6000))l.socket.terminate();
    for(const member of this.identity.roster.members){
      if(member.id===this.identity.deviceId||member.id in this.identity.roster.revoked||this.links.has(member.id)||this.pending.has(member.id))continue;
      // Either peer can recover from a stale signed address. The lower ID's
      // outgoing connection wins if both endpoints are reachable.
      let endpoint:Endpoint;try{endpoint=validateEndpoint(this.addresses.get(member.id)??member.endpoint,!!this.options.allowLoopback);}catch{continue;}
      const options:WebSocket.ClientOptions & {servername:string}={key:this.identity.key,cert:this.identity.cert,ca:this.identity.ca,servername:member.id,rejectUnauthorized:true,minVersion:'TLSv1.3',handshakeTimeout:3000,maxPayload:MAX_FRAME,perMessageDeflate:false};
      const ws=new WebSocket(`wss://${endpoint.host}:${endpoint.port}/peer`,options);
      this.pending.set(member.id,ws);
      let cert='';
      ws.on('upgrade',res=>{const raw=(res.socket as TLSSocket).getPeerCertificate().raw;if(raw)cert=new X509Certificate(raw).toString();});
      ws.on('open',()=>{this.pending.delete(member.id);if(this.stopped){ws.terminate();return;}this.attach(ws,cert,false);});
      ws.on('error',()=>{});ws.on('close',()=>{if(this.pending.get(member.id)===ws)this.pending.delete(member.id);});
    }
    this.elect();this.broadcastState();
  }
  private elect(){
    const live=new Set([this.identity.deviceId,...[...this.links.values()].filter(l=>l.ready&&l.socket.readyState===WebSocket.OPEN).map(l=>l.id)]);
    const claims=[this.claim,...[...this.links.values()].filter(l=>l.ready).map(l=>l.claim)].filter(c=>live.has(c.id));
    if(!claims.length)this.claim={id:[...live].sort()[0],since:Date.now()};
    else this.claim=claims.sort((a,b)=>a.since-b.since||a.id.localeCompare(b.id))[0];
  }
  private append(kind:EventKind,payload:Record<string,unknown>){
    if(this.identity.recovering)throw new Error('Kurtarma sürüyor. Başka bir üye çevrimiçi olmalı.');
    if(this.identity.deviceId in this.identity.roster.revoked)throw new Error('Üyeliğiniz sona erdi.');
    const e=signEvent(this.identity,this.store.maxSeq(this.identity.deviceId)+1,this.store.maxClock()+1,kind,payload);
    this.store.append(e,this.identity.roster);this.broadcastState();this.emit('change');return e.id;
  }
  sendMessage(channel:string,text:string){if(!this.snapshot().channels.some(c=>c.id===channel&&c.type==='text'))throw new Error('Yazı kanalı bulunamadı.');return this.append('message',{channel,text});}
  updateProfile(profile:Profile){profile=profileSchema.parse(profile);this.append('profile',{...profile});this.identity.profile=profile;this.emit('identity');}
  addChannel(name:string,type:'text'|'voice'){if(this.snapshot().channels.length>=30)throw new Error('En fazla 30 kanal.');return this.append('channel',{id:randomUUID(),name,type});}
  setPresence(presence:Presence){this.presence=presenceSchema.parse(presence);this.broadcastState();this.emit('change');}
  sendSignal(id:string,signal:unknown){const l=this.links.get(id);if(!l?.ready)throw new Error('Katılımcıya ulaşılamıyor.');if(JSON.stringify(signal).length>65536)throw new Error('Büyük sinyal.');this.send(l.socket,{type:'signal',signal});}
  createInvite():string {
    if(this.identity.recovering)throw new Error('Kurtarma sürüyor.');
    if(!this.identity.adminKey)throw new Error('Davet oluşturmak için yönetici gerekli.');
    const token=randomBytes(32).toString('hex'),expires=Date.now()+15*60000;
    for(const [t,expiry] of this.invitations)if(expiry<Date.now())this.invitations.delete(t);
    if(this.invitations.size>=20)throw new Error('Çok fazla açık davet.');
    this.invitations.set(token,expires);
    return 'mola1.'+Buffer.from(JSON.stringify({v:1,groupId:this.identity.groupId,name:this.identity.roster.name,adminId:this.identity.deviceId,ca:this.identity.ca,endpoint:this.identity.endpoint,token,expires})).toString('base64url');
  }
  removeMember(id:string){if(this.identity.recovering)throw new Error('Kurtarma sürüyor.');revokeMember(this.identity,id,this.store.maxSeq(id));this.emit('identity');this.broadcastState();setTimeout(()=>this.links.get(id)?.socket.terminate(),100);this.emit('change');}
  updateAddress(id:string,endpoint:Endpoint){if(!this.identity.roster.members.some(m=>m.id===id))throw new Error('Üye yok.');this.addresses.set(id,validateEndpoint(endpoint,!!this.options.allowLoopback));this.links.get(id)?.socket.terminate();this.tick();}
  snapshot():Snapshot {
    const events=this.store.events(this.identity.roster);
    const channels:Snapshot['channels']=[{id:'genel',name:'genel',type:'text'},{id:'oyun',name:'oyun-sohbeti',type:'text'},{id:'lounge',name:'Takılma Odası',type:'voice'},{id:'gaming',name:'Oyun Odası',type:'voice'}];
    for(const e of events)if(e.kind==='channel'&&!channels.some(c=>c.id===e.payload.id)&&channels.length<30)channels.push(e.payload as any);
    const peers=this.identity.roster.members.filter(m=>!(m.id in this.identity.roster.revoked)).map(m=>{
      const profile=events.filter(e=>e.author===m.id&&e.kind==='profile').at(-1)?.payload as Profile|undefined;
      const link=this.links.get(m.id);
      return {id:m.id,profile:profile??m.profile,online:m.id===this.identity.deviceId||!!link?.ready,presence:m.id===this.identity.deviceId?this.presence:link?.presence??{...EMPTY_PRESENCE}};
    });
    return {groupId:this.identity.groupId,name:this.identity.roster.name,selfId:this.identity.deviceId,admin:!!this.identity.adminKey&&!this.identity.recovering,coordinator:this.claim.id,peers,events:events.map(e=>({...e,backedUp:this.store.isBackedUp(e.id)})),channels,endpoint:this.identity.endpoint,error:this.identity.recovering?'Kurtarma için bir mevcut üye çevrimiçi olmalı.':this.error};
  }
}

export async function joinGroup(invite:string,profile:Profile,endpoint:Endpoint,allowLoopback=false):Promise<Identity>{
  if(invite.length>16000||!invite.startsWith('mola1.'))throw new Error('Geçersiz davet kodu.');
  const i=JSON.parse(Buffer.from(invite.slice(6),'base64url').toString());
  z.object({v:z.literal(1),groupId:z.string().uuid(),adminId:z.string().uuid(),ca:z.string().max(8000),token:z.string().length(64),expires:z.number().min(Date.now())}).passthrough().parse(i);
  const target=validateEndpoint(i.endpoint,allowLoopback);endpoint=validateEndpoint(endpoint,allowLoopback);profile=profileSchema.parse(profile);
  const device=createDevice();
  const body=JSON.stringify({token:i.token,deviceId:device.deviceId,publicKey:device.publicKey,profile,endpoint});
  const result=await new Promise<any>((resolve,reject)=>{
    const req=https.request({host:target.host,port:target.port+1,path:'/join',method:'POST',ca:i.ca,servername:i.adminId,rejectUnauthorized:true,minVersion:'TLSv1.3',timeout:10000,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
      let size=0;const chunks:Buffer[]=[];res.on('data',(c:Buffer)=>{size+=c.length;if(size>250000){res.destroy(new Error('Büyük yanıt.'));return;}chunks.push(c);});res.on('error',reject);res.on('end',()=>{try{const x=JSON.parse(Buffer.concat(chunks).toString());if(res.statusCode!==200)throw new Error(x.error??'Katılım başarısız.');resolve(x);}catch(e){reject(e);}});
    });req.on('timeout',()=>req.destroy(new Error('Yöneticiye ulaşılamadı. Radmin bağlantısını kontrol edin.')));req.on('error',reject);req.end(body);
  });
  if(result.groupId!==i.groupId || result.deviceId!==device.deviceId || result.ca!==i.ca || !verifyRoster(result.roster,i.ca) || publicKeyOf(result.cert)!==device.publicKey)throw new Error('Katılım yanıtı doğrulanamadı.');
  return {groupId:result.groupId,deviceId:device.deviceId,key:device.key,cert:result.cert,ca:i.ca,roster:result.roster,profile,endpoint};
}
