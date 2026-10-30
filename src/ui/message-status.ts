export function messageStatus(backedUp:boolean,memberCount:number):string {
 if(backedUp)return '✓ Başka cihaza yedeklendi';
 return memberCount>1?'✓ Bu cihazda · yedek bekliyor':'✓ Bu cihazda';
}
