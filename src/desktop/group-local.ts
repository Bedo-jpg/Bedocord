import {existsSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';

export function forgetLocalGroup(base:string,groupId:string){
 z.string().uuid().parse(groupId);
 for(const name of ['identity.bin',`group-${groupId}.sqlite`]){
  const path=join(base,name);
  if(existsSync(path))unlinkSync(path);
 }
}
