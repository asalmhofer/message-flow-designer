/* Stream one frame at a time; keep encoding work off the editor's main thread. */
globalThis.importScripts('../vendor/gifenc.js');
let encoder,previous,delay=0,options;
function equal(a,b){
  if(!a||a.length!==b.length)return false;
  for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;
  return true;
}
function flush(){
  if(!previous)return;
  const palette=globalThis.MessageFlowGif.quantize(previous,256);
  const index=globalThis.MessageFlowGif.applyPalette(previous,palette);
  encoder.writeFrame(index,options.width,options.height,{palette,delay,repeat:options.loop?0:-1});
  if(encoder.bytesView().length>256*1024*1024)throw new Error('This GIF is too large. Choose a smaller size or a shorter range.');
}
globalThis.onmessage=({data})=>{
  try{
    if(data.type==='init'){options=data.options;encoder=globalThis.MessageFlowGif.GIFEncoder();}
    if(data.type==='frame'){
      const pixels=new Uint8Array(data.buffer);
      if(equal(previous,pixels))delay+=data.delay;
      else{flush();previous=pixels;delay=data.delay;}
    }
    if(data.type==='finish'){
      flush();encoder.finish();const bytes=encoder.bytes();
      globalThis.postMessage({buffer:bytes.buffer},[bytes.buffer]);return;
    }
    globalThis.postMessage({ok:true});
  }catch(error){globalThis.postMessage({error:error.message});}
};
