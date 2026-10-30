export type SoundKind='message'|'join'|'leave'|'mute'|'unmute'|'screenOn'|'screenOff';
export type Note={frequency:number;duration:number;offset:number};

const patterns:Record<SoundKind,Note[]>={
 message:[{frequency:650,duration:.07,offset:0},{frequency:880,duration:.09,offset:.06}],
 join:[{frequency:420,duration:.09,offset:0},{frequency:620,duration:.11,offset:.08}],
 leave:[{frequency:570,duration:.09,offset:0},{frequency:360,duration:.11,offset:.08}],
 mute:[{frequency:330,duration:.08,offset:0}],
 unmute:[{frequency:530,duration:.08,offset:0}],
 screenOn:[{frequency:440,duration:.07,offset:0},{frequency:770,duration:.12,offset:.06}],
 screenOff:[{frequency:760,duration:.07,offset:0},{frequency:400,duration:.12,offset:.06}]
};
export function soundPattern(kind:SoundKind):readonly Note[]{return patterns[kind];}

let context:AudioContext|null=null;
export function unlockSounds(){
 try{context??=new AudioContext();if(context.state==='suspended')void context.resume().catch(()=>{});}catch{}
}
export async function setSoundOutput(id:string){
 unlockSounds();
 const audio=context as (AudioContext & {setSinkId?:(sinkId:string)=>Promise<void>})|null;
 if(audio?.setSinkId)await audio.setSinkId(id);
}
export function playSound(kind:SoundKind,enabled:boolean){
 if(!enabled)return;
 unlockSounds();
 const audio=context;
 if(!audio)return;
 if(audio.state==='suspended'){void audio.resume().then(()=>{if(audio.state==='running')schedule(audio,kind);}).catch(()=>{});return;}
 if(audio.state==='running')schedule(audio,kind);
}
function schedule(audio:AudioContext,kind:SoundKind){
 const start=audio.currentTime;
 for(const note of soundPattern(kind)){
  const oscillator=audio.createOscillator(),gain=audio.createGain();
  oscillator.type='sine';oscillator.frequency.value=note.frequency;
  oscillator.connect(gain);gain.connect(audio.destination);
  const at=start+note.offset;
  gain.gain.setValueAtTime(0,at);
  gain.gain.linearRampToValueAtTime(.035,at+.009);
  gain.gain.exponentialRampToValueAtTime(.001,at+note.duration);
  oscillator.start(at);oscillator.stop(at+note.duration+.01);
  oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
 }
}
