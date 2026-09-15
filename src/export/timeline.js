/* Pure export timeline: real time never controls encoded frame timestamps. */
(function(root){
  'use strict';
  function groups(flows){
    const result=[];
    for(const flow of flows){
      if(flow.timing==='withPrevious' && result.length) result.at(-1).push(flow);
      else result.push([flow]);
    }
    return result;
  }
  function build(flows,{start=0,end=Infinity,speed=50,processing=false,hold=1}={}){
    const all=groups(flows),first=Math.max(0,Math.min(all.length-1,Number(start)||0));
    const last=Math.max(first,Math.min(all.length-1,Number(end)));
    const base=2600-(Math.max(1,Math.min(100,Number(speed)||50))-1)/99*2050;
    const phases=[],entries=[];let time=0;
    const add=(phase,duration,group,index)=>{const end=Math.round((time+duration)*1e6)/1e6;phases.push({phase,start:time,end,duration:end-time,flows:group,index});time=end;};
    for(let index=first;index<=last && all[index];index++){
      const group=all[index],begin=time;
      add('transfer',root.MessageFlowMotion.transferDuration(base,group.map(f=>f.length))/1000,group,index);
      add('arrived',.65,group,index);
      if(processing)add('processing',.9,group,index);
      entries.push({index,start:begin,end:time,flows:group});
    }
    if(entries.length)add('completed',Math.max(0,Number(hold)||0),entries.at(-1).flows,entries.at(-1).index);
    return {phases,entries,duration:time,first,last};
  }
  function at(timeline,time){
    const phase=timeline.phases.find(p=>time<p.end) || timeline.phases.at(-1);
    if(!phase)return {phase:'ready',progress:0,flows:[],completed:[]};
    const progress=phase.duration?Math.max(0,Math.min(1,(time-phase.start)/phase.duration)):1;
    const completed=timeline.entries.filter(e=>e.end<=time).flatMap(e=>e.flows.map(f=>f.id));
    return {...phase,progress,completed};
  }
  function frames(duration,fps){
    const count=Math.max(1,Math.ceil(duration*fps));
    return Array.from({length:count},(_,i)=>({time:i/fps,duration:Math.min(1/fps,Math.max(.001,duration-i/fps))}));
  }
  root.MessageFlowExportTimeline=Object.freeze({groups,build,at,frames});
})(globalThis);
