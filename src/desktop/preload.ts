import {contextBridge,ipcRenderer} from 'electron';
import type {Action} from './policy.js';
contextBridge.exposeInMainWorld('mola',{
 action:(input:Action)=>ipcRenderer.invoke('mola:action',input),
 onState:(fn:(state:unknown)=>void)=>{const listener=(_e:Electron.IpcRendererEvent,data:unknown)=>fn(data);ipcRenderer.on('mola:state',listener);return()=>ipcRenderer.removeListener('mola:state',listener);},
 onSignal:(fn:(signal:unknown)=>void)=>{const listener=(_e:Electron.IpcRendererEvent,data:unknown)=>fn(data);ipcRenderer.on('mola:signal',listener);return()=>ipcRenderer.removeListener('mola:signal',listener);},
 onError:(fn:(error:string)=>void)=>{const listener=(_e:Electron.IpcRendererEvent,data:string)=>fn(data);ipcRenderer.on('mola:error',listener);return()=>ipcRenderer.removeListener('mola:error',listener);}
});
