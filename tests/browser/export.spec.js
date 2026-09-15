import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {diagram} from '../fixtures/diagram.js';
import {openExport} from './exportHelpers.js';

const dialog=page=>page.getByRole('dialog',{name:'Export media',exact:true});
const saved=page=>page.evaluate(()=>localStorage.getItem('event-flow-designer-state-v1'));
async function seed(page){
  const data=diagram();data.components[0].shape='roundedRectangle';
  data.messageFlows.push({...data.messageFlows[1],id:'finish',sequenceNumber:3,timing:'afterPrevious',messageText:'Finish'});
  Object.assign(data.settings,{animationSpeed:100,animationMode:'step',loopAnimation:false,showProcessingActionInPresentation:false});
  await page.goto('/');await page.locator('#importInput').setInputFiles({name:'Export sample.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
}
async function shortExport(page,format){
  await openExport(page,format);
  await page.locator('#exportSize').selectOption('640');
  await page.locator('#exportRange').selectOption('range');await page.locator('#exportThrough').selectOption('0');
  await expect(page.locator('#exportStatus')).toHaveText('Ready to export');
}
async function download(page,format,info){
  const count=page._exportDownloads.length,pending=page.waitForEvent('download');
  await page.getByRole('button',{name:['MP4','WEBM'].includes(format)?'Export video':'Export '+format,exact:true}).click();
  const result=await pending,file=info.outputPath('export.'+format.toLowerCase());
  expect(result.suggestedFilename()).toMatch(new RegExp('\\.'+format.toLowerCase()+'$'));
  await expect(page.locator('#exportStatus')).toContainText('Download started');
  await expect(dialog(page)).toBeVisible();await expect(page.getByRole('link',{name:'Download again',exact:true})).toBeVisible();
  await result.saveAs(file);expect(page._exportDownloads).toHaveLength(count+1);return readFile(file);
}
test.beforeEach(async({page})=>{
  page._exportErrors=[];page.on('pageerror',e=>page._exportErrors.push(e.message));
  page._exportDownloads=[];page.on('download',file=>page._exportDownloads.push(file));
});
test.afterEach(async({page})=>expect(page._exportErrors).toEqual([]));

test('one dialog adapts to all four formats, ranges keep groups together, and editing state stays unchanged',async({page})=>{
  await seed(page);await page.locator('.componentGroup[data-id="service"] .componentShape').click();
  const before=await saved(page),selection=await page.locator('.componentGroup.selected').getAttribute('data-id');
  await openExport(page,'PNG');await expect(page.locator('#exportAnimationSettings')).toBeHidden();await expect(page.locator('#exportSize')).toBeVisible();
  await page.getByRole('button',{name:'SVG',exact:true}).click();await expect(page.locator('#exportSize')).toBeHidden();
  await page.getByRole('button',{name:'GIF',exact:true}).click();await expect(page.locator('#exportLoop')).toBeVisible();
  await page.locator('#exportRange').selectOption('range');await expect(page.locator('#exportFrom option')).toHaveCount(2);
  await expect(page.locator('#exportFrom option').first()).toContainText('1 + 2');
  await page.locator('#exportFrom').selectOption('1');await page.locator('#exportThrough').selectOption('0');
  await expect(page.locator('#exportFrom')).toHaveValue('0');
  const beforeProcessing=await page.locator('#exportScrub').getAttribute('max');await page.locator('#exportProcessing').check();
  const afterProcessing=await page.locator('#exportScrub').getAttribute('max');expect(Number(afterProcessing)-Number(beforeProcessing)).toBeCloseTo(.9,5);
  await page.keyboard.press('Escape');await expect(dialog(page)).not.toBeVisible();
  expect(await saved(page)).toBe(before);await expect(page.locator('.componentGroup.selected')).toHaveAttribute('data-id',selection);
});

test('GIF downloads decode into distinct timed frames, loop, and preserve the diagram',async({page},info)=>{
  test.setTimeout(60000);await seed(page);const before=await saved(page);await shortExport(page,'GIF');
  const bytes=await download(page,'GIF',info);expect(bytes.subarray(0,6).toString()).toBe('GIF89a');
  const decoded=await page.evaluate(async data=>{
    const decoder=new ImageDecoder({data:Uint8Array.from(data),type:'image/gif'});await decoder.tracks.ready;await decoder.completed;
    const track=decoder.tracks.selectedTrack,result={count:track.frameCount,loop:track.repetitionCount===Infinity,duration:0,hashes:[],width:0,height:0};
    for(let i=0;i<track.frameCount;i++){
      const {image}=await decoder.decode({frameIndex:i});result.duration+=image.duration;result.width=image.displayWidth;result.height=image.displayHeight;
      if(i<8){const canvas=new OffscreenCanvas(image.displayWidth,image.displayHeight),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let hash=0;for(let j=0;j<pixels.length;j+=17)hash=(Math.imul(hash,31)+pixels[j])|0;result.hashes.push(hash);}
      image.close();
    }
    decoder.close();return result;
  },[...bytes]);
  expect(decoded.count).toBeGreaterThan(5);expect(decoded.loop).toBe(true);expect(decoded.width).toBe(640);expect(decoded.height).toBe(360);
  expect(decoded.duration/1e6).toBeCloseTo(2.2,1);expect(new Set(decoded.hashes).size).toBeGreaterThan(3);
  await page.getByRole('button',{name:'Close export dialog',exact:true}).click();expect(await saved(page)).toBe(before);
});

for(const format of ['mp4','webm'])test(`${format.toUpperCase()} downloads play and seek with fixed duration and changing frames`,async({page},info)=>{
  test.setTimeout(60000);await seed(page);await shortExport(page,'Video');
  const offered=await page.locator('#exportVideoFormat option').evaluateAll(nodes=>nodes.map(n=>n.value));
  test.skip(!offered.includes(format),`${format} encoder is unavailable on this browser`);
  await page.locator('#exportVideoFormat').selectOption(format);await expect(page.locator('#exportStatus')).toHaveText('Ready to export');
  const bytes=await download(page,format.toUpperCase(),info);
  if(format==='mp4')expect(bytes.subarray(4,8).toString()).toBe('ftyp');else expect(bytes.subarray(0,4).toString('hex')).toBe('1a45dfa3');
  const decoded=await page.evaluate(async ({data,format})=>{
    const url=URL.createObjectURL(new Blob([Uint8Array.from(data)],{type:format==='mp4'?'video/mp4':'video/webm'})),video=document.createElement('video');video.muted=true;video.preload='auto';document.body.appendChild(video);
    try{
      await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('Could not decode exported video'));video.src=url;});
      const result={duration:video.duration,width:video.videoWidth,height:video.videoHeight,hashes:[]};
      const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');
      for(const time of [.05,.3,.7]){
        await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=time;});ctx.drawImage(video,0,0);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let hash=0;for(let j=0;j<pixels.length;j+=17)hash=(Math.imul(hash,31)+pixels[j])|0;result.hashes.push(hash);
      }
      return result;
    }finally{video.remove();URL.revokeObjectURL(url);}
  },{data:[...bytes],format});
  expect(decoded.width).toBe(640);expect(decoded.height).toBe(360);expect(decoded.duration).toBeCloseTo(2.2,1);expect(new Set(decoded.hashes).size).toBe(3);
});

for(const format of ['GIF','Video'])test(`cancelling ${format} work releases the job, prevents downloads, and allows another export`,async({page})=>{
  await seed(page);const before=await saved(page);await openExport(page,format);
  const start=page.getByRole('button',{name:format==='Video'?'Export video':'Export GIF',exact:true});
  test.skip(!await start.isEnabled(),'Video encoder is unavailable on this browser');
  await start.click();await expect.poll(()=>page.locator('#exportProgress').evaluate(el=>el.value)).toBeGreaterThan(0);
  await expect(page.locator('#exportPreviewPlay')).toBeDisabled();await expect(page.locator('#exportScrub')).toBeDisabled();
  await page.getByRole('button',{name:'Cancel export',exact:true}).click();
  await expect(page.locator('#exportStatus')).toContainText('Export cancelled');await expect(page.locator('#exportDownload')).toBeHidden();
  expect(page._exportDownloads).toHaveLength(0);
  await page.getByRole('button',{name:'PNG',exact:true}).click();await expect(page.locator('#exportStatus')).toHaveText('Ready to export');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export PNG',exact:true}).click();await pending;
  await expect(page.getByRole('link',{name:'Download again',exact:true})).toBeVisible();expect(page._exportDownloads).toHaveLength(1);
  await page.getByRole('button',{name:'Close export dialog',exact:true}).click();expect(await saved(page)).toBe(before);
});

test('presentation export includes heading and embedded images, preserves styles, and strips editing controls',async({page},info)=>{
  await seed(page);await openExport(page,'SVG');await page.locator('#exportComposition').selectOption('presentation');
  await expect(page.locator('#exportStatus')).toHaveText('Ready to export');
  const bytes=await download(page,'SVG',info),svg=bytes.toString();
  expect(svg).toContain('2 messages together');expect(svg).toContain('data:image/png;base64,');expect(svg).toContain('rgb(219, 234, 254)');
  expect(svg).not.toMatch(/resizeHandle|componentPort|componentSelectionOutline|fileMenu/);
});

test('unsupported video shows a useful fallback, and empty diagrams cannot export',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,'VideoEncoder',{value:undefined});});await seed(page);await openExport(page,'Video');
  await expect(page.locator('#exportCapability')).toContainText('Video encoding is unavailable');await expect(page.getByRole('button',{name:'Export video',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'GIF',exact:true}).click();await expect(page.getByRole('button',{name:'Export GIF',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Close export dialog',exact:true}).click();
  await page.locator('#importInput').setInputFiles({name:'Empty.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({components:[],messageFlows:[]}))});
  await page.locator('#fileMenu').click();await page.getByRole('button',{name:'Export media…',exact:true}).click();
  await expect(page.getByRole('button',{name:'Export PNG',exact:true})).toBeDisabled();
  await expect(page.locator('#exportStatus')).toContainText('Add a component');
});

test('direct file opening can export GIF without a server or worker',async({page},info)=>{
  test.setTimeout(60000);
  const data=diagram();data.messageFlows=data.messageFlows.slice(0,1);data.settings.animationSpeed=100;
  await page.addInitScript(data=>localStorage.setItem('event-flow-designer-state-v1',JSON.stringify(data)),data);
  await page.goto(new URL('../../index.html',import.meta.url).href);
  await shortExport(page,'GIF');
  const bytes=await download(page,'GIF',info);expect(bytes.subarray(0,6).toString()).toBe('GIF89a');
});

for(const width of [1280,980,600])test(`export dialog fits at ${width}px with its actions visible`,async({page},info)=>{
  await page.setViewportSize({width,height:720});await seed(page);await openExport(page,'PNG');
  const box=await dialog(page).boundingBox(),action=await page.getByRole('button',{name:'Export PNG',exact:true}).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y+box.height).toBeLessThanOrEqual(720);expect(action.y+action.height).toBeLessThanOrEqual(720);
  await page.screenshot({path:info.outputPath('dialog.png')});
});

test('presentation opens the shared dialog with presentation framing and restores keyboard focus',async({page})=>{
  await seed(page);await page.locator('#presentationBtn').click();
  await page.locator('#playbackOptions > summary').click();await page.locator('#exportPresentationBtn').click();
  await expect(dialog(page)).toBeVisible();await expect(page.locator('#exportComposition')).toHaveValue('presentation');
  await expect(page.locator('#exportStatus')).toHaveText('Ready to export');
  await page.keyboard.press('Escape');await expect(dialog(page)).not.toBeVisible();
  await expect(page.locator('#playbackOptions > summary')).toBeFocused();
});

for(const format of ['PNG','SVG'])test(`${format} starts one download automatically and Download again reuses the completed file`,async({page},info)=>{
  await seed(page);await openExport(page,format);await page.locator('#exportFilename').fill('Release diagram');
  await page.evaluate(()=>{
    const encoders=window.MessageFlowExportEncoders;window.exportEncodeCount=0;
    window.MessageFlowExportEncoders={...encoders,encode(...args){window.exportEncodeCount++;return encoders.encode(...args);}};
  });
  const first=await download(page,format,info),again=page.getByRole('link',{name:'Download again',exact:true});
  expect(page._exportDownloads[0].suggestedFilename()).toBe('Release diagram.'+format.toLowerCase());
  await expect(page.locator('#exportPreview')).toBeVisible();
  const url=await again.getAttribute('href');
  const pending=page.waitForEvent('download');await again.click();const result=await pending;
  const repeated=info.outputPath('repeated.'+format.toLowerCase());await result.saveAs(repeated);
  expect(await readFile(repeated)).toEqual(first);expect(page._exportDownloads).toHaveLength(2);
  expect(await page.evaluate(()=>window.exportEncodeCount)).toBe(1);expect(await again.getAttribute('href')).toBe(url);
});

test('a failed export starts no download and a successful retry downloads automatically',async({page},info)=>{
  await seed(page);await openExport(page,'PNG');
  await page.evaluate(()=>{
    const encoders=window.MessageFlowExportEncoders;let fail=true;
    window.MessageFlowExportEncoders={...encoders,encode(...args){
      if(fail){fail=false;return Promise.reject(new Error('Could not create the image. Try again.'));}
      return encoders.encode(...args);
    }};
  });
  await page.getByRole('button',{name:'Export PNG',exact:true}).click();
  await expect(page.locator('#exportStatus')).toHaveText('Could not create the image. Try again.');
  expect(page._exportDownloads).toHaveLength(0);await expect(page.locator('#exportDownload')).toBeHidden();
  await expect(page.getByRole('button',{name:'Export PNG',exact:true})).toBeEnabled();
  const bytes=await download(page,'PNG',info);expect(bytes.subarray(1,4).toString()).toBe('PNG');
});
