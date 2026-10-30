import type {Action} from '../desktop/policy.js';
import type {Snapshot} from '../core/types.js';
export interface AppState {snapshot:Snapshot|null;reconnect:{group:string;oldHost:string}|null;interfaces:{name:string;host:string}[];preferences:{theme:'dark'|'light';accent:string;fontSize:number;soundsEnabled:boolean};error:string|null}
declare global {interface Window {mola:{action:(action:Action)=>Promise<any>;onState:(fn:(state:AppState)=>void)=>()=>void;onSignal:(fn:(data:{from:string;signal:any})=>void)=>()=>void;onError:(fn:(message:string)=>void)=>()=>void}}}
export const api=window.mola;
