export function diagram(){
  return {
    components:[
      {id:'web',name:'Web UI',shape:'text',x:100,y:120,width:180,height:80,fillColor:'#dbeafe'},
      {id:'service',name:'Service',shape:'roundedRectangle',x:500,y:120,width:180,height:80,fillColor:'#dcfce7'},
    ],
    messageFlows:[
      {id:'request',sourceComponentId:'web',targetComponentId:'service',sequenceNumber:1,messageText:'Submit order',actionText:'Process order',notes:'Keep this note',connectionStyle:'arc',sourcePortId:'right50',targetPortId:'left50',hiddenInDrawingMode:true,controlPoint:{x:350,y:60},processingImageDataUrl:'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='},
      {id:'response',sourceComponentId:'service',targetComponentId:'web',sequenceNumber:2,messageText:'Accepted',timing:'withPrevious',connectionStyle:'straight'},
    ],
    settings:{zoom:0.82,panX:28,panY:34,animationMode:'auto',animationSpeed:50},
  };
}
