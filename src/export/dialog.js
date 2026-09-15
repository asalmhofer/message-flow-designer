(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function create(){
    const dialog=document.createElement('dialog');dialog.id='exportDialog';dialog.className='exportDialog';dialog.setAttribute('aria-labelledby','exportTitle');
    dialog.innerHTML=`<header class="exportHead"><div><span class="exportEyebrow">SHARE YOUR FLOW</span><h2 id="exportTitle">Export media</h2></div><button type="button" id="exportClose" aria-label="Close export dialog">${root.MessageFlowIcons.svg('close')}</button></header>
      <div class="exportBody"><section class="exportPreviewSection" aria-label="Export preview"><div class="exportPreviewStage"><canvas id="exportPreview" width="960" height="540" aria-label="Diagram export preview"></canvas><img id="exportResultImage" alt="Exported animation preview" hidden><video id="exportResultVideo" controls playsinline aria-label="Exported video preview" hidden></video></div><div class="exportPreviewControls" id="exportPreviewControls"><button type="button" id="exportPreviewPlay" aria-label="Play export preview">${root.MessageFlowIcons.svg('play')}</button><input id="exportScrub" type="range" min="0" max="1" step="0.01" value="0" aria-label="Preview time"><output id="exportTime">0:00 / 0:00</output></div><p class="exportPreviewNote" id="exportPreviewNote">A clean composition, without editor controls.</p><p class="exportSummary" id="exportSummary"></p></section>
      <form class="exportSettings" id="exportSettings"><fieldset class="exportFormats"><legend>Format</legend><div role="group" aria-label="Export format">${['video','gif','png','svg'].map(f=>`<button type="button" data-export-format="${f}" aria-pressed="false">${f==='video'?'Video':f.toUpperCase()}</button>`).join('')}</div></fieldset>
      <label class="exportField">Filename<input id="exportFilename" required maxlength="150" autocomplete="off"></label>
      <div class="exportColumns"><label class="exportField">Composition<select id="exportComposition"><option value="diagram">Diagram only</option><option value="presentation">Presentation</option></select></label><label class="exportField">Framing<select id="exportFraming"><option value="fit">Fit diagram</option><option value="viewport">Current view</option></select></label></div>
      <div id="exportStoryOptions" class="exportChecks" hidden><label><input id="exportDetails" type="checkbox" checked>Processing details</label><label><input id="exportImages" type="checkbox" checked>Processing images</label></div>
      <label class="exportField" id="exportSizeField">Size<select id="exportSize"></select></label>
      <label class="exportField" id="exportVideoField">Video format<select id="exportVideoFormat"><option value="">Checking support…</option></select></label>
      <div id="exportAnimationSettings"><div class="exportSectionTitle">Animation</div><label class="exportField">Steps<select id="exportRange"><option value="all">Entire flow</option><option value="range">Selected range</option></select></label><div class="exportColumns" id="exportRangeFields" hidden><label class="exportField">From<select id="exportFrom"></select></label><label class="exportField">Through<select id="exportThrough"></select></label></div>
      <label class="exportField">Speed <output id="exportSpeedValue">50%</output><input id="exportSpeed" type="range" min="1" max="100" value="50" aria-label="Export speed"></label>
      <div class="exportChecks"><label><input id="exportTokenNames" type="checkbox" checked>Message names beside tokens</label><label><input id="exportProcessing" type="checkbox">Show processing phase</label><small>When off, processing and its delay are skipped.</small><label><input id="exportInactive" type="checkbox" checked>Show inactive connections</label><label id="exportLoopField"><input id="exportLoop" type="checkbox" checked>Loop GIF</label></div>
      <details class="exportAdvanced"><summary>Timing and motion</summary><div class="exportColumns"><label class="exportField">Frame rate<select id="exportFps"><option value="10">10 fps</option><option value="15">15 fps</option><option value="24">24 fps</option><option value="30">30 fps</option></select></label><label class="exportField">Hold final frame<select id="exportHold"><option value="0">None</option><option value="0.5">0.5 seconds</option><option value="1" selected>1 second</option><option value="2">2 seconds</option></select></label></div><label class="exportCheck"><input id="exportReduced" type="checkbox">Reduced motion</label></details></div>
      <p class="exportCapability" id="exportCapability"></p></form></div>
      <footer class="exportFooter"><div class="exportStatus"><span id="exportStatus" role="status">Ready to export</span><progress id="exportProgress" max="1" value="0" hidden></progress></div><button type="button" id="exportCancel">Close</button><button type="button" id="exportStart" class="primary">Export</button><a id="exportDownload" class="exportDownload" hidden>Download</a></footer>`;
    document.body.appendChild(dialog);
    const $=id=>dialog.querySelector('#'+id);
    let snapshot,format='video',renderer,version=0,drawSequence=0,previewRun=0,previewAbort,job,objectUrl,lastFocus,previewFrame,previewTime=0,previewStarted=0,formats=[],checking=false;
    const animated=()=>format==='video'||format==='gif';
    const extension=()=>format==='video'?$('exportVideoFormat').value||'mp4':format;
    const clock=value=>`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;
    function options(){
      const ranged=$('exportRange').value==='range';
      const width=format==='svg'?1280:Number($('exportSize').value);
      return {format,width,height:Math.round(width*9/16/2)*2,composition:$('exportComposition').value,framing:$('exportFraming').value,
        details:$('exportDetails').checked,images:$('exportImages').checked,start:ranged?Number($('exportFrom').value):0,end:ranged?Number($('exportThrough').value):Infinity,
        speed:Number($('exportSpeed').value),processing:$('exportProcessing').checked,tokenNames:$('exportTokenNames').checked,inactive:$('exportInactive').checked,
        fps:Number($('exportFps').value),hold:Number($('exportHold').value),loop:$('exportLoop').checked,reducedMotion:$('exportReduced').checked,videoFormat:$('exportVideoFormat').value};
    }
    function stopPreview(){++previewRun;if(previewFrame)cancelAnimationFrame(previewFrame);previewFrame=null;$('exportPreviewPlay').setAttribute('aria-label','Play export preview');$('exportPreviewPlay').innerHTML=root.MessageFlowIcons.svg('play');}
    function clearResult(){
      $('exportResultVideo').pause();$('exportResultVideo').removeAttribute('src');$('exportResultVideo').load();
      $('exportResultImage').removeAttribute('src');$('exportResultImage').hidden=true;$('exportResultVideo').hidden=true;
      $('exportPreview').hidden=false;$('exportDownload').hidden=true;$('exportStart').hidden=false;
      if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;
    }
    function controls(){
      $('exportAnimationSettings').hidden=!animated();$('exportPreviewControls').hidden=!animated()||!!objectUrl;
      $('exportVideoField').hidden=format!=='video';$('exportSizeField').hidden=format==='svg';$('exportLoopField').hidden=format!=='gif';
      $('exportStoryOptions').hidden=$('exportComposition').value!=='presentation';
      $('exportRangeFields').hidden=$('exportRange').value!=='range';
      $('exportStart').textContent=`Export ${format==='video'?'video':format.toUpperCase()}`;
      $('exportStart').disabled=!!job||checking||(format==='video'&&!formats.length)||!snapshot.components.length;
      $('exportPreviewPlay').disabled=!!job;$('exportScrub').disabled=!!job;
      $('exportSpeedValue').textContent=$('exportSpeed').value+'%';
    }
    async function draw(time,expected=version){
      if(!renderer || expected!==version || !dialog.open)return;
      const sequence=++drawSequence;
      previewTime=Math.max(0,Math.min(renderer.timeline.duration,time));$('exportScrub').value=String(previewTime);
      $('exportTime').textContent=clock(previewTime)+' / '+clock(renderer.timeline.duration);
      try{
        const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
        await renderer.draw(canvas,previewTime,previewAbort.signal);
        if(expected===version && sequence===drawSequence && dialog.open)$('exportPreview').getContext('2d').drawImage(canvas,0,0);
        return true;
      }catch(error){if(error.name!=='AbortError'&&expected===version)$('exportStatus').textContent=error.message;return false;}
    }
    async function refresh({probe=false}={}){
      const mine=++version;stopPreview();previewAbort?.abort();previewAbort=new AbortController();clearResult();controls();
      $('exportStatus').textContent='Preparing preview…';
      try{
        const opts=options();renderer=root.MessageFlowExportRenderer.create(snapshot,opts);
        $('exportScrub').max=String(renderer.timeline.duration);
        $('exportSummary').textContent=format==='svg'?'Vector image · scales without losing detail':`${opts.width} × ${opts.height}${animated()?` · ${opts.fps} fps · ${renderer.timeline.duration.toFixed(1)} seconds`:''}`;
        $('exportPreviewNote').textContent=format==='gif'?'GIF uses a limited colour palette; video preserves more image detail.':'A clean composition, without editor controls.';
        if(probe && format==='video'){
          checking=true;controls();$('exportCapability').textContent='Checking video support…';
          const supported=await root.MessageFlowExportEncoders.videoFormats(opts.width,opts.height);
          if(mine!==version)return;
          const previous=$('exportVideoFormat').value;formats=supported;
          $('exportVideoFormat').innerHTML=supported.map(f=>`<option value="${f.id}">${f.label}</option>`).join('')||'<option value="">Unavailable</option>';
          if(supported.some(f=>f.id===previous))$('exportVideoFormat').value=previous;
          checking=false;controls();
          $('exportCapability').textContent=supported.length?(supported[0].id==='mp4'?'MP4 available · encoded locally.':'WebM available in this browser. MP4 encoding is unavailable.'):'Video encoding is unavailable here. Open the app in a browser with WebCodecs support, or choose GIF, PNG, or SVG.';
        }else if(format!=='video'){$('exportCapability').textContent='Created on this device. Nothing is uploaded.';checking=false;controls();}
        await renderer.prepare(previewAbort.signal);
        if(mine!==version)return;
        const drawn=await draw(0,mine);
        if(drawn&&mine===version)$('exportStatus').textContent=snapshot.components.length?'Ready to export':'Add a component to your diagram first.';
      }catch(error){if(mine===version&&error.name!=='AbortError'){checking=false;controls();$('exportStatus').textContent=error.message;}}
    }
    function choose(value){
      if(job)return;format=value;
      dialog.querySelectorAll('[data-export-format]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.exportFormat===format));
      const sizes=format==='gif'?[[640,'Small · 640 px'],[960,'Standard · 960 px'],[1280,'Large · 1280 px']]:[[640,'360p · 640 × 360'],[1280,'720p · 1280 × 720'],[1920,'1080p · 1920 × 1080'],...(format==='png'?[[2560,'1440p · 2560 × 1440']]:[])];
      $('exportSize').innerHTML=sizes.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
      $('exportSize').value=format==='gif'?'960':'1920';$('exportFps').value=format==='gif'?'15':'30';
      void refresh({probe:true});
    }
    function fileName(){return ($('exportFilename').value.trim().replace(/[\\/:*?"<>|]/g,'-').replace(/\.(png|svg|gif|mp4|webm)$/i,'')||'Message flow')+'.'+extension();}
    async function start(){
      if(job||checking||$('exportStart').disabled)return;
      if(!$('exportSettings').reportValidity())return;
      ++version;stopPreview();previewAbort?.abort();job=new AbortController();const activeJob=job;
      clearResult();dialog.querySelectorAll('form input,form select,form button').forEach(el=>el.disabled=true);
      $('exportProgress').hidden=false;$('exportProgress').value=0;$('exportCancel').textContent='Cancel export';$('exportClose').disabled=true;controls();
      $('exportStatus').textContent='Preparing export…';
      try{
        const opts=options(),exportRenderer=root.MessageFlowExportRenderer.create(snapshot,opts);
        const blob=await root.MessageFlowExportEncoders.encode(exportRenderer,opts,{signal:activeJob.signal,onProgress:value=>{
          $('exportProgress').value=value;$('exportStatus').textContent=value>=1?'Finishing file…':`Exporting · ${Math.round(value*100)}%`;
        }});
        activeJob.signal.throwIfAborted();objectUrl=URL.createObjectURL(blob);
        $('exportDownload').href=objectUrl;$('exportDownload').download=fileName();$('exportDownload').textContent='Download again';$('exportDownload').hidden=false;$('exportStart').hidden=true;
        if(format==='video'){$('exportResultVideo').src=objectUrl;$('exportResultVideo').hidden=false;$('exportPreview').hidden=true;}
        if(format==='gif'){$('exportResultImage').src=objectUrl;$('exportResultImage').hidden=false;$('exportPreview').hidden=true;}
        $('exportDownload').click();
        $('exportStatus').textContent=`Download started · ${(blob.size/1024/1024).toFixed(2)} MB`;
        $('exportDownload').focus();
      }catch(error){$('exportStatus').textContent=activeJob.signal.aborted||error.name==='AbortError'?'Export cancelled. Your diagram is unchanged.':error.message;}
      finally{
        job=null;previewAbort=new AbortController();$('exportProgress').hidden=true;$('exportCancel').textContent='Close';$('exportClose').disabled=false;
        dialog.querySelectorAll('form input,form select,form button').forEach(el=>el.disabled=false);
        dialog.querySelectorAll('[data-export-format="video"],[data-export-format="gif"]').forEach(el=>el.disabled=!snapshot.flows.length);controls();
      }
    }
    function close(){
      if(job){job.abort();return;}
      ++version;stopPreview();previewAbort?.abort();clearResult();dialog.close();lastFocus?.focus({preventScroll:true});
    }
    $('exportClose').addEventListener('click',close);$('exportCancel').addEventListener('click',close);$('exportStart').addEventListener('click',()=>void start());
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('keydown',event=>event.stopPropagation());
    $('exportSettings').addEventListener('submit',event=>{event.preventDefault();void start();});
    dialog.querySelectorAll('[data-export-format]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.exportFormat)));
    $('exportSettings').addEventListener('input',event=>{
      if(event.target.id==='exportFilename'){if(objectUrl)$('exportDownload').download=fileName();return;}
      if(event.target.id==='exportFrom' && Number($('exportThrough').value)<Number($('exportFrom').value))$('exportThrough').value=$('exportFrom').value;
      if(event.target.id==='exportThrough' && Number($('exportFrom').value)>Number($('exportThrough').value))$('exportFrom').value=$('exportThrough').value;
      void refresh({probe:format==='video'});
    });
    $('exportScrub').addEventListener('input',()=>{stopPreview();$('exportResultVideo').pause();$('exportResultImage').hidden=true;$('exportResultVideo').hidden=true;$('exportPreview').hidden=false;void draw(Number($('exportScrub').value));});
    $('exportPreviewPlay').addEventListener('click',()=>{
      if(previewFrame){stopPreview();return;}
      if(!renderer||job)return;
      $('exportResultImage').hidden=true;$('exportResultVideo').hidden=true;$('exportResultVideo').pause();$('exportPreview').hidden=false;
      if(previewTime>=renderer.timeline.duration)previewTime=0;
      previewStarted=performance.now()-previewTime*1000;$('exportPreviewPlay').setAttribute('aria-label','Pause export preview');$('exportPreviewPlay').innerHTML=root.MessageFlowIcons.svg('pause');
      const run=++previewRun;
      const tick=async now=>{const time=Math.min(renderer.timeline.duration,(now-previewStarted)/1000);await draw(time);if(run!==previewRun)return;if(time>=renderer.timeline.duration)stopPreview();else previewFrame=requestAnimationFrame(tick);};
      previewFrame=requestAnimationFrame(tick);
    });
    return {
      isOpen:()=>dialog.open,
      open(data){
        snapshot=data;lastFocus=document.activeElement?.closest('details')?.querySelector('summary')||document.activeElement;formats=[];checking=false;$('exportFilename').value=data.name;
        $('exportComposition').value=data.presentation?'presentation':'diagram';$('exportFraming').value='fit';$('exportRange').value='all';
        $('exportSpeed').value=String(data.settings.animationSpeed||50);$('exportProcessing').checked=!!data.settings.showProcessingActionInPresentation;
        $('exportTokenNames').checked=data.settings.showTokenMessageInPresentation!==false;$('exportInactive').checked=data.settings.showInactiveConnectionsInPresentation!==false;
        const groups=root.MessageFlowExportTimeline.groups(data.flows),choices=groups.map((flows,i)=>`<option value="${i}">${esc(flows.map(f=>f.sequenceNumber).join(' + ')+'. '+flows.map(f=>f.messageText).join(' + '))}</option>`).join('');
        $('exportFrom').innerHTML=choices;$('exportThrough').innerHTML=choices;$('exportFrom').value=String(data.selectedIndex);$('exportThrough').value=String(groups.length-1);
        dialog.querySelectorAll('[data-export-format="video"],[data-export-format="gif"]').forEach(el=>el.disabled=!data.flows.length);
        dialog.showModal();choose(data.flows.length?'video':'png');$('exportFilename').focus();
      }
    };
  }
  root.MessageFlowExportDialog=Object.freeze({create});
})(globalThis);
