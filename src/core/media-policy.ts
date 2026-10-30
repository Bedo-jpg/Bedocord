export function broadcastWinner(peers: {id:string;presence:{room:string|null;screen:string|null}}[]): string | null {
  return peers.filter(p=>p.presence.room && p.presence.screen).sort((a,b)=>a.presence.screen!.localeCompare(b.presence.screen!) || a.id.localeCompare(b.id))[0]?.id ?? null;
}
export type VideoQuality='balanced'|'economy';
export function videoProfile(quality:VideoQuality){return quality==='economy'?{width:854,height:480,frameRate:20,maxBitrate:600000}:{width:1280,height:720,frameRate:30,maxBitrate:1500000};}
