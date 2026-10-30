import {useEffect,useRef} from 'react';
import {X} from 'lucide-react';

export function LocalPreview({stream,onHide}:{stream:MediaStream;onHide:()=>void}){
 const videoRef=useRef<HTMLVideoElement>(null),canvasRef=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const video=videoRef.current,canvas=canvasRef.current;
  if(!video||!canvas)return;
  video.srcObject=stream;
  void video.play().catch(()=>{});
  const context=canvas.getContext('2d',{alpha:false});
  if(!context)return;
  context.imageSmoothingQuality='low';
  const draw=()=>{
   context.fillStyle='#140a06';context.fillRect(0,0,320,180);
   if(video.readyState<2||!video.videoWidth||!video.videoHeight)return;
   const scale=Math.min(320/video.videoWidth,180/video.videoHeight);
   const width=video.videoWidth*scale,height=video.videoHeight*scale;
   context.drawImage(video,(320-width)/2,(180-height)/2,width,height);
  };
  const timer=window.setInterval(draw,125);
  return()=>{window.clearInterval(timer);video.pause();video.srcObject=null;};
 },[stream]);
 return <div className="local-preview"><div className="local-preview-header"><span>🔴 Kendi yayının · düşük çözünürlük</span><button onClick={onHide} title="Ön izlemeyi gizle" aria-label="Ön izlemeyi gizle"><X size={15}/></button></div><video ref={videoRef} muted playsInline autoPlay className="preview-source"/><canvas ref={canvasRef} width={320} height={180} role="img" aria-label="Kendi ekran yayınının ön izlemesi"/></div>;
}
