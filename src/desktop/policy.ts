import { z } from 'zod';
import { networkInterfaces } from 'node:os';
import { endpointSchema, profileSchema, validateEndpoint } from '../core/policy.js';
const common=z.object({}).strict();
const profile=profileSchema;
const endpoint=endpointSchema;
const actions=z.discriminatedUnion('type',[
 z.object({type:z.literal('state')}).strict(),
 z.object({type:z.literal('create'),name:z.string().trim().min(1).max(40),profile,endpoint}).strict(),
 z.object({type:z.literal('join'),invite:z.string().max(16000),profile,endpoint}).strict(),
 z.object({type:z.literal('reconnect'),endpoint}).strict(),
 z.object({type:z.literal('forgetGroup')}).strict(),
 z.object({type:z.literal('message'),channel:z.string().min(1).max(80),text:z.string().trim().min(1).max(4000)}).strict(),
 z.object({type:z.literal('channel'),name:z.string().trim().min(1).max(32),kind:z.enum(['text','voice'])}).strict(),
 z.object({type:z.literal('profile'),profile}).strict(),
 z.object({type:z.literal('presence'),presence:z.object({room:z.string().max(80).nullable(),muted:z.boolean(),deafened:z.boolean(),screen:z.string().max(100).nullable()}).strict()}).strict(),
 z.object({type:z.literal('signal'),peerId:z.string().uuid(),signal:z.unknown()}).strict(),
 z.object({type:z.literal('invite')}).strict(),
 z.object({type:z.literal('remove'),peerId:z.string().uuid()}).strict(),
 z.object({type:z.literal('address'),peerId:z.string().uuid(),endpoint}).strict(),
 z.object({type:z.literal('recoveryExport'),password:z.string().min(12).max(256)}).strict(),
 z.object({type:z.literal('recoveryImport'),data:z.string().max(200000),password:z.string().max(256),endpoint}).strict(),
 z.object({type:z.literal('sources')}).strict(),
 z.object({type:z.literal('screenChoice'),id:z.string().max(200),audio:z.boolean()}).strict(),
 z.object({type:z.literal('micArm')}).strict(),
 z.object({type:z.literal('preferences'),theme:z.enum(['dark','light']),accent:z.string().regex(/^#[0-9a-f]{6}$/i),fontSize:z.number().int().min(12).max(20),soundsEnabled:z.boolean()}).strict(),
 z.object({type:z.literal('autoStart'),enabled:z.boolean()}).strict()
]);
export type Action=z.infer<typeof actions>;
export function allowMediaPermission(permission:string,url:string,micArmedUntil:number,screenChosenAt:number,now=Date.now()):boolean {
 let origin:URL;
 try{origin=new URL(url);}catch{return false;}
 if(origin.protocol!=='mola:'||origin.hostname!=='app')return false;
 if(permission==='speaker-selection')return true;
 if(permission==='media')return now<micArmedUntil;
 if(permission==='display-capture')return screenChosenAt>0&&now>=screenChosenAt&&now-screenChosenAt<=30_000;
 return false;
}
export function parseAction(input:unknown):Action {
 const action=actions.parse(input);
 if('endpoint' in action)validateEndpoint(action.endpoint);
 if(action.type==='signal' && JSON.stringify(action.signal).length>65536)throw new Error('Büyük sinyal.');
 return action;
}
export function privateInterfaces(adapters:ReturnType<typeof networkInterfaces>) {
 const found:{name:string;host:string}[]=[];
 for(const [name,entries] of Object.entries(adapters)) for(const entry of entries??[]) {
  if(entry.family!=='IPv4'||entry.internal)continue;
  try{validateEndpoint({host:entry.address,port:45871});found.push({name,host:entry.address});}catch{}
 }
 return found.sort((a,b)=>Number(b.host.startsWith('26.'))-Number(a.host.startsWith('26.')));
}
