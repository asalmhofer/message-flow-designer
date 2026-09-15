/* Classic script so exports also work when index.html is opened from disk. */
(function(root){
  'use strict';
  const properties = ['fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity','stroke-dasharray','stroke-dashoffset','stroke-linecap','stroke-linejoin','opacity','visibility','display','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline','paint-order','vector-effect','marker-start','marker-mid','marker-end'];
  function styledClone(svg){
    const clone = svg.cloneNode(true);
    const sources = [svg, ...svg.querySelectorAll('*')];
    const targets = [clone, ...clone.querySelectorAll('*')];
    sources.forEach((source, index) => {
      const computed = source.ownerDocument.defaultView.getComputedStyle(source);
      for(const property of properties){
        let value = computed.getPropertyValue(property);
        // Computed SVG references can contain the page URL; exports need local ids.
        value = value.replace(/url\(["']?[^)]*#([^"')]+)["']?\)/g, 'url(#$1)');
        if(value) targets[index].style.setProperty(property, value);
      }
      targets[index].style.removeProperty('filter');
      targets[index].removeAttribute('tabindex');
    });
    return clone;
  }
  function serializeSvg(svg){
    const clone=styledClone(svg);
    clone.querySelectorAll('.flowSelectionOutline,.componentSelectionOutline,.resizeHandle,.selectionBox,.componentPort,.flowEndpointHandle,.flowBendHandle,.connectionDraftPreview,.connectionDraftDot,.endpointDragPreview,.endpointDragDot,.placementPreview').forEach(node => node.remove());
    const width = Math.max(1, Math.round(svg.clientWidth));
    const height = Math.max(1, Math.round(svg.clientHeight));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', width);
    clone.setAttribute('height', height);
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
    clone.style.setProperty('background', '#ffffff');
    return { text:new XMLSerializer().serializeToString(clone), width, height };
  }
  async function renderPng(svg){
    const exported = serializeSvg(svg);
    const url = URL.createObjectURL(new Blob([exported.text], {type:'image/svg+xml;charset=utf-8'}));
    try{
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Could not render the diagram image.')); image.src = url; });
      const canvas = svg.ownerDocument.createElement('canvas');
      canvas.width = exported.width * 2;
      canvas.height = exported.height * 2;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the PNG file.')), 'image/png'));
    }finally{ URL.revokeObjectURL(url); }
  }
  root.MessageFlowImageExport = Object.freeze({ serializeSvg, renderPng, styledClone });
})(globalThis);
