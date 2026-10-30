import { app, BrowserWindow, ipcMain, protocol, net, safeStorage, session, desktopCapturer, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createGroup, exportRecovery, importRecovery, rotateAdministrator } from '../core/security.js';
import { Store } from '../core/store.js';
import { Peer, joinGroup } from '../core/peer.js';
import { parseAction, privateInterfaces, allowMediaPermission } from './policy.js';
import { forgetLocalGroup } from './group-local.js';
import type { Identity } from '../core/types.js';

protocol.registerSchemesAsPrivileged([{scheme:'mola',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const testPath=process.argv.find(x=>x.startsWith('--mola-data='))?.slice(12);
if(testPath)app.setPath('userData',testPath);
const base=()=>app.getPath('userData');
const identityFile=()=>join(base(),'identity.bin');
const prefFile=()=>join(base(),'preferences.json');
let win:BrowserWindow|null=null,peer:Peer|null=null,store:Store|null=null,pendingIdentity:Identity|null=null,chosen:{id:string;audio:boolean;time:number}|null=null,micArmed=0;
let recoveryTimer:ReturnType<typeof setTimeout>|null=null;
let preferences={theme:'dark' as 'dark'|'light',accent:'#ff8a00',fontSize:15,soundsEnabled:true};
function atomic(path:string,data:Buffer|string){mkdirSync(base(),{recursive:true});writeFileSync(path+'.tmp',data);renameSync(path+'.tmp',path);}
function persist(identity:Identity){if(!safeStorage.isEncryptionAvailable())throw new Error('Windows güvenli depolama hazır değil.');atomic(identityFile(),safeStorage.encryptString(JSON.stringify(identity)));}
function readIdentity():Identity|null{if(!existsSync(identityFile()))return null;if(!safeStorage.isEncryptionAvailable())throw new Error('Windows güvenli depolama açılamadı.');return JSON.parse(safeStorage.decryptString(readFileSync(identityFile())));}
function emitState(){if(win&&!win.isDestroyed())win.webContents.send('mola:state',state());if(peer?.identity.recovering&&!recoveryTimer&&peer.snapshot().peers.filter(p=>p.online).length>1)recoveryTimer=setTimeout(()=>void finishRecovery(),3000);}
async function finishRecovery(){
  const current=peer;
  if(!current?.identity.recovering)return;
  try{
    const next=rotateAdministrator(current.identity,current.identity.endpoint);
    await current.stop();current.store.close();peer=null;store=null;
    await mount(next);
  }catch(error){win?.webContents.send('mola:error',error instanceof Error?error.message:String(error));}
  finally{recoveryTimer=null;}
}
function state(){return {snapshot:peer?.snapshot()??null,reconnect:pendingIdentity?{group:pendingIdentity.roster.name,oldHost:pendingIdentity.endpoint.host}:null,interfaces:privateInterfaces(networkInterfaces()),preferences,error:null};}
async function mount(identity:Identity){
  const wasmpath=app.isPackaged?join(process.resourcesPath,'sql-wasm.wasm'):join(app.getAppPath(),'node_modules','sql.js','dist','sql-wasm.wasm');
  const nextStore=await Store.open(join(base(),`group-${identity.groupId}.sqlite`),wasmpath);
  const next=new Peer(identity,nextStore);
  next.on('change',emitState);next.on('identity',()=>persist(next.identity));next.on('signal',packet=>win?.webContents.send('mola:signal',packet));
  try{await next.start();}catch(e){nextStore.close();throw e;}
  const old=peer,oldStore=store;peer=next;store=nextStore;pendingIdentity=null;persist(identity);emitState();
  if(old){await old.stop();oldStore?.close();}
}
app.whenReady().then(async()=>{
  protocol.handle('mola',req=>{
    const url=new URL(req.url),name=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(url.hostname!=='app'||!['index.html','app.js','styles.css','logo.png','banner.png'].includes(name))return new Response('Not found',{status:404});
    return net.fetch(pathToFileURL(join(app.getAppPath(),'build',name)).toString());
  });
  try{if(existsSync(prefFile()))preferences={...preferences,...JSON.parse(readFileSync(prefFile(),'utf8'))};}catch{}
  session.defaultSession.setPermissionCheckHandler((webContents,permission,origin,details)=>
    !!win&&webContents?.id===win.webContents.id&&allowMediaPermission(permission,details.requestingUrl||origin,micArmed,chosen?.time??0));
  session.defaultSession.setPermissionRequestHandler((webContents,permission,cb,details)=>
    cb(!!win&&webContents.id===win.webContents.id&&allowMediaPermission(permission,details.requestingUrl,micArmed,chosen?.time??0)));
  session.defaultSession.setDisplayMediaRequestHandler(async(req,cb)=>{
    const request=chosen;chosen=null;
    if(!request||!allowMediaPermission('display-capture',req.securityOrigin,micArmed,request.time)){cb(null);return;}
    try{
      const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:1,height:1}});
      const source=sources.find(x=>x.id===request.id);
      cb(source?{video:source,audio:request.audio?'loopback':undefined}:null);
    }catch{cb(null);}
  });
  win=new BrowserWindow({width:1320,height:800,minWidth:800,minHeight:560,backgroundColor:'#1d0d07',title:'Bedocord',icon:join(app.getAppPath(),'build','logo.png'),webPreferences:{preload:join(app.getAppPath(),'build','preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('mola://app/'))event.preventDefault();});
  win.loadURL('mola://app/index.html');
  try{const identity=readIdentity();if(identity){pendingIdentity=identity;try{await mount(identity);}catch(error){win.webContents.once('did-finish-load',()=>win?.webContents.send('mola:error',error instanceof Error?error.message:String(error)));}}}catch(error){win.webContents.once('did-finish-load',()=>win?.webContents.send('mola:error',error instanceof Error?error.message:String(error)));}
  win.on('closed',()=>{win=null;void peer?.stop().then(()=>store?.close());});
});
ipcMain.handle('mola:action',async(event,input)=>{
  if(!win||event.sender.id!==win.webContents.id||!event.senderFrame?.url.startsWith('mola://app/'))throw new Error('İzin verilmeyen istek.');
  const a=parseAction(input);
  if(a.type==='state')return state();
  if(a.type==='reconnect'){if(!pendingIdentity||peer)throw new Error('Yeniden bağlanılacak grup yok.');pendingIdentity.endpoint=a.endpoint;await mount(pendingIdentity);return state();}
  if(a.type==='forgetGroup'){
    const groupId=peer?.identity.groupId??pendingIdentity?.groupId;
    if(!groupId)throw new Error('Kaldırılacak grup bulunamadı.');
    const current=peer,currentStore=store;
    if(current)await current.stop();
    currentStore?.close();
    peer=null;store=null;pendingIdentity=null;
    if(recoveryTimer){clearTimeout(recoveryTimer);recoveryTimer=null;}
    forgetLocalGroup(base(),groupId);
    emitState();return state();
  }
  if(a.type==='create'){if(peer)throw new Error('Bu cihazda grup zaten açık.');const id=createGroup(a.name,a.profile,a.endpoint);await mount(id);return state();}
  if(a.type==='join'){if(peer)throw new Error('Bu cihazda grup zaten açık.');const id=await joinGroup(a.invite,a.profile,a.endpoint);await mount(id);return state();}
  if(a.type==='recoveryImport'){if(peer)throw new Error('Grup zaten açık.');const identity=importRecovery(a.data,a.password);identity.endpoint=a.endpoint;identity.recovering=true;await mount(identity);return state();}
  if(a.type==='preferences'){preferences={theme:a.theme,accent:a.accent,fontSize:a.fontSize,soundsEnabled:a.soundsEnabled};atomic(prefFile(),JSON.stringify(preferences));emitState();return state();}
  if(a.type==='autoStart'){app.setLoginItemSettings({openAtLogin:a.enabled});return null;}
  if(a.type==='micArm'){micArmed=Date.now()+15000;return null;}
  if(a.type==='sources'){const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:200,height:112},fetchWindowIcons:true});return sources.map(s=>({id:s.id,name:s.name,thumbnail:s.thumbnail.toDataURL()}));}
  if(a.type==='screenChoice'){const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:1,height:1}});if(!sources.some(s=>s.id===a.id))throw new Error('Ekran bulunamadı.');chosen={id:a.id,audio:a.audio,time:Date.now()};return null;}
  if(!peer)throw new Error('Önce grup oluşturun veya davete katılın.');
  if(a.type==='message')return peer.sendMessage(a.channel,a.text);
  if(a.type==='channel')return peer.addChannel(a.name,a.kind);
  if(a.type==='profile')return peer.updateProfile(a.profile);
  if(a.type==='presence')return peer.setPresence(a.presence);
  if(a.type==='signal')return peer.sendSignal(a.peerId,a.signal);
  if(a.type==='invite')return peer.createInvite();
  if(a.type==='remove')return peer.removeMember(a.peerId);
  if(a.type==='address')return peer.updateAddress(a.peerId,a.endpoint);
  if(a.type==='recoveryExport')return exportRecovery(peer.identity,a.password);
  throw new Error('Bilinmeyen işlem.');
});
app.on('window-all-closed',()=>app.quit());
