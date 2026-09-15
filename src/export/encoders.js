(function(root){
  'use strict';
  const base=new URL('.',document.currentScript?.src || new URL('src/export/encoders.js',document.baseURI));
  const pending=new Map();
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  function library(file,global){
    if(root[global])return Promise.resolve(root[global]);
    if(!pending.has(file))pending.set(file,new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=new URL('../vendor/'+file,base).href;
      script.onload=()=>resolve(root[global]);script.onerror=()=>{pending.delete(file);script.remove();reject(new Error('Could not load the local export encoder. Reload the app and try again.'));};
      document.head.appendChild(script);
    }));
    return pending.get(file);
  }
  async function videoFormats(width,height){
    if(!root.VideoEncoder)return [];
    const media=await library('mediabunny.js','MessageFlowMedia');
    const candidates=[{id:'mp4',label:'MP4',codec:'avc',mime:'video/mp4'},{id:'webm',label:'WebM',codec:'vp9',mime:'video/webm'}];
    const supported=await Promise.all(candidates.map(async format=>{
      try{return await media.canEncodeVideo(format.codec,{width,height})?format:null;}catch{return null;}
    }));
    return supported.filter(Boolean);
  }
  function canvasFor(options){const canvas=document.createElement('canvas');canvas.width=options.width;canvas.height=options.height;return canvas;}
  async function gifSession(options,signal){
    // Local file pages cannot create file:// workers in some browsers.
    // They retain GIF export through the same encoder with per-frame yielding.
    if(location.protocol!=='file:' && root.Worker){
      const worker=new Worker(new URL('gifWorker.js',base));
      let rejectPending;
      const cancel=()=>{worker.terminate();rejectPending?.(new DOMException('Export cancelled','AbortError'));};
      signal.addEventListener('abort',cancel,{once:true});
      const send=(data,transfer=[])=>new Promise((resolve,reject)=>{
        signal.throwIfAborted();rejectPending=reject;
        worker.onmessage=event=>{rejectPending=null;event.data.error?reject(new Error(event.data.error)):resolve(event.data);};
        worker.onerror=event=>{event.preventDefault();reject(new Error('The GIF worker could not start. Reload and try again.'));};
        worker.postMessage(data,transfer);
      });
      try{await send({type:'init',options});}catch(error){signal.removeEventListener('abort',cancel);worker.terminate();throw error;}
      return {
        add:async(pixels,delay)=>{await send({type:'frame',buffer:pixels.buffer,delay},[pixels.buffer]);},
        finish:async()=>new Uint8Array((await send({type:'finish'})).buffer),
        dispose:()=>{signal.removeEventListener('abort',cancel);worker.terminate();}
      };
    }
    const gif=await library('gifenc.js','MessageFlowGif'),encoder=gif.GIFEncoder();
    return {
      add:async(pixels,delay)=>{
        signal.throwIfAborted();const palette=gif.quantize(pixels,256);
        encoder.writeFrame(gif.applyPalette(pixels,palette),options.width,options.height,{palette,delay,repeat:options.loop?0:-1});
        if(encoder.bytesView().length>256*1024*1024)throw new Error('This GIF is too large. Choose a smaller size or a shorter range.');
        await pause();
      },
      finish:async()=>{encoder.finish();return encoder.bytes();},dispose:()=>{}
    };
  }
  async function encode(renderer,options,{signal,onProgress=()=>{}}){
    signal.throwIfAborted();await renderer.prepare(signal);
    if(options.format==='svg')return new Blob([renderer.svgAt(0)],{type:'image/svg+xml'});
    const canvas=canvasFor(options);
    if(options.format==='png'){
      await renderer.draw(canvas,0,signal);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      signal.throwIfAborted();if(!blob)throw new Error('The PNG could not be created. Try a smaller size.');return blob;
    }
    const frames=root.MessageFlowExportTimeline.frames(renderer.timeline.duration,options.fps);
    if(options.format==='gif'){
      const session=await gifSession(options,signal);let centiseconds=0;
      try{
        for(let i=0;i<frames.length;i++){
          const frame=frames[i];await renderer.draw(canvas,frame.time,signal);
          // Error diffusion keeps 15 fps accurate on GIF's 10 ms timing grid.
          const end=Math.round((frame.time+frame.duration)*100),delay=Math.max(1,end-centiseconds)*10;centiseconds=end;
          await session.add(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,delay);
          onProgress((i+1)/frames.length);
        }
        signal.throwIfAborted();return new Blob([await session.finish()],{type:'image/gif'});
      }finally{session.dispose();}
    }
    const formats=await videoFormats(options.width,options.height),format=formats.find(f=>f.id===options.videoFormat);
    if(!format)throw new Error('This video format is unavailable at the selected resolution. Choose another format or size.');
    const media=root.MessageFlowMedia;
    const target=new media.BufferTarget();
    const output=new media.Output({format:format.id==='mp4'?new media.Mp4OutputFormat({fastStart:'in-memory'}):new media.WebMOutputFormat(),target});
    const source=new media.CanvasSource(canvas,{codec:format.codec,quality:new media.Quality({bitrate:Math.max(1000000,options.width*options.height*3)}),keyFrameInterval:2});
    output.addVideoTrack(source,{frameRate:options.fps});
    const abort=()=>{void output.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
    try{
      signal.throwIfAborted();await output.start();
      for(let i=0;i<frames.length;i++){
        const frame=frames[i];await renderer.draw(canvas,frame.time,signal);
        await source.add(frame.time,frame.duration);signal.throwIfAborted();onProgress((i+1)/frames.length);await pause();
      }
      await output.finalize();signal.throwIfAborted();return new Blob([target.buffer],{type:format.mime});
    }finally{
      signal.removeEventListener('abort',abort);
      if(output.state!=='finalized'&&output.state!=='canceled')await output.cancel();
    }
  }
  root.MessageFlowExportEncoders=Object.freeze({videoFormats,encode});
})(globalThis);
