export function centerOf(component){
  return { x: component.position.x + component.size.width / 2, y: component.position.y + component.size.height / 2 };
}

export function portPosition(component, port){
  const parsed = parsePort(port);
  const { x, y } = component.position;
  const { width, height } = component.size;
  switch(parsed.side){
    case 'top': return { x: x + width * parsed.ratio, y };
    case 'right': return { x: x + width, y: y + height * parsed.ratio };
    case 'bottom': return { x: x + width * parsed.ratio, y: y + height };
    case 'left': return { x, y: y + height * parsed.ratio };
    default: return centerOf(component);
  }
}

export function parsePort(port){
  if(!port) return { side: 'right', ratio: 0.5 };
  if(typeof port === 'object') return { side: port.side, ratio: Number(port.ratio ?? 0.5) };
  const [side, ratio] = String(port).split(':');
  return { side, ratio: Number(ratio || 0.5) };
}

export function makePort(side, ratio = 0.5){
  return `${side}:${Number(ratio).toFixed(2)}`;
}

export function getDynamicPorts(component){
  const horizontalCount = Math.max(3, Math.floor(component.size.width / 80));
  const verticalCount = Math.max(3, Math.floor(component.size.height / 60));
  const ratios = count => Array.from({ length: count }, (_, index) => (index + 1) / (count + 1));
  return [
    ...ratios(horizontalCount).map(ratio => ({ side: 'top', ratio })),
    ...ratios(verticalCount).map(ratio => ({ side: 'right', ratio })),
    ...ratios(horizontalCount).map(ratio => ({ side: 'bottom', ratio })),
    ...ratios(verticalCount).map(ratio => ({ side: 'left', ratio })),
  ];
}

export function calculateConnectorPath({ sourcePoint, targetPoint, routingType = 'arc', bendPoints = [] }){
  if(routingType === 'straight') return `M${sourcePoint.x},${sourcePoint.y} L${targetPoint.x},${targetPoint.y}`;
  const control = bendPoints[0] || midpoint(sourcePoint, targetPoint);
  if(routingType === 'angular') return `M${sourcePoint.x},${sourcePoint.y} L${control.x},${control.y} L${targetPoint.x},${targetPoint.y}`;
  return `M${sourcePoint.x},${sourcePoint.y} Q${control.x},${control.y} ${targetPoint.x},${targetPoint.y}`;
}

export function midpoint(a, b){ return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
