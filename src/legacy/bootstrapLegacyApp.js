export function bootstrapLegacyApp(){
  'use strict';

  const STORAGE_KEY = 'event-flow-designer-state-v1';
  const HISTORY_LIMIT = 60;
  const GRID = 24;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 3.2;
  const MOVE_DURATIONS = { slow: 2200, normal: 1300, fast: 650 };
  const SHAPES = ['package','roundedRectangle','rectangle','ellipse','diamond','hexagon','triangle','pentagon','trapezoid','parallelogram','cylinder','queue','document','note','cloud','actor'];
  const LEGACY_PORT_DEFS = [
    ['top25','Top 25%','top',0.25], ['top50','Top center','top',0.50], ['top75','Top 75%','top',0.75],
    ['right25','Right 25%','right',0.25], ['right50','Right center','right',0.50], ['right75','Right 75%','right',0.75],
    ['bottom25','Bottom 25%','bottom',0.25], ['bottom50','Bottom center','bottom',0.50], ['bottom75','Bottom 75%','bottom',0.75],
    ['left25','Left 25%','left',0.25], ['left50','Left center','left',0.50], ['left75','Left 75%','left',0.75]
  ];
  const PORT_SIDES = [
    ['top','Top','width'], ['right','Right','height'], ['bottom','Bottom','width'], ['left','Left','height']
  ];
  const $ = (id) => document.getElementById(id);

  const els = {
    body: document.body,
    app: $('app'),
    main: $('main'),
    canvasWrap: $('canvasWrap'),
    svg: $('diagram'),
    viewport: $('viewport'),
    gridRect: $('gridRect'),
    connectionsLayer: $('connectionsLayer'),
    componentsLayer: $('componentsLayer'),
    overlayLayer: $('overlayLayer'),
    emptyHint: $('emptyHint'),
    emptyExampleBtn: $('emptyExampleBtn'),
    toast: $('toast'),
    flowList: $('flowList'),
    propertiesPanel: $('propertiesPanel'),
    flowEditorModal: $('flowEditorModal'),
    flowEditorBody: $('flowEditorBody'),
    flowEditorTitle: $('flowEditorTitle'),
    closeFlowEditorBtn: $('closeFlowEditorBtn'),
    okFlowEditorBtn: $('okFlowEditorBtn'),
    cancelFlowEditorBtn: $('cancelFlowEditorBtn'),
    editImagePreview: $('editImagePreview'),
    presentationImagePreview: $('presentationImagePreview'),
    presentationStepLabel: $('presentationStepLabel'),
    sideTitle: $('sideTitle'),
    closePanelBtn: $('closePanelBtn'),
    contextMenu: $('contextMenu'),
    modeStatus: $('modeStatus'),
    selectionStatus: $('selectionStatus'),
    animStatus: $('animStatus'),
    zoomDisplay: $('zoomDisplay'),
    importInput: $('importInput'),
    fillColor: $('fillColor'),
    lineColor: $('lineColor'),
    shapeButtons: Array.from(document.querySelectorAll('.shapeTool')),
    connectionStyleSelect: $('connectionStyleSelect'),
    modeSelect: $('modeSelect'),
    speedSelect: $('speedSelect'),
    gridBtn: $('gridBtn'),
    snapBtn: $('snapBtn'),
    selectModeBtn: $('selectModeBtn'),
    panModeBtn: $('panModeBtn')
  };

  let state = loadInitialState();
  let history = [];
  let historyIndex = -1;
  let clipboard = null;
  let drag = null;
  let connectSourceId = null;
  let connectSourcePortId = null;
  let connectChosenStyle = null;
  let connectPreviewPoint = null;
  let connectionChoiceOverlay = null;
  let suppressHistory = false;
  let toastTimer = null;
  let activeAnimationFrame = null;
  let inlineEditor = null;
  let flowEditorOriginal = null;
  let currentFileName = state.settings.diagramFileName || '';

  const animation = {
    running: false,
    paused: false,
    index: -1,
    phase: 'stopped',
    completed: new Set(),
    token: null,
    pathCache: null,
    startTime: 0,
    elapsedBeforePause: 0,
    autoTimer: null,
    measurePathEl: null
  };

  function removeMeasurePath(){
    if(animation.measurePathEl){
      const nodes = Array.isArray(animation.measurePathEl) ? animation.measurePathEl : [animation.measurePathEl];
      nodes.forEach(node => { try{ node.remove(); }catch{} });
      animation.measurePathEl = null;
    }
  }

  function defaultState(){
    return {
      components: [],
      messageFlows: [],
      settings: {
        animationMode: 'auto',
        animationSpeed: 'normal',
        autoContinueAfterArrival: false,
        autoContinueDelay: 1200,
        defaultConnectionStyle: 'arc',
        showGrid: true,
        snapToGrid: true,
        activeCanvasMode: 'select',
        zoom: 1,
        panX: 80,
        panY: 70,
        presentationImagePanelOpen: true,
        showInactiveConnectionsInPresentation: true,
        diagramFileName: 'event-flow-designer.json',
        flowPanelOpen: true,
        defaultShape: 'roundedRectangle'
      },
      ui: {
        selectedComponentIds: [],
        selectedFlowId: null,
        expandedFlowId: null,
        presentationMode: false
      }
    };
  }

  function loadInitialState(){
    const empty = defaultState();
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return empty;
      const parsed = JSON.parse(raw);
      validateImported(parsed, false);
      return mergeDefaults(parsed);
    }catch(err){
      console.warn('Could not load autosave', err);
      return empty;
    }
  }

  function mergeDefaults(parsed){
    const base = defaultState();
    const components = Array.isArray(parsed.components) ? parsed.components : [];
    const messageFlows = migrateMessageFlows(Array.isArray(parsed.messageFlows) ? parsed.messageFlows : []);
    return {
      components,
      messageFlows,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      ui: { ...base.ui, ...(parsed.ui || {}), selectedComponentIds: [], selectedFlowId: null }
    };
  }

  function migrateMessageFlows(flows){
    const cloned = flows.map(f => ({ ...f, hiddenInDrawingMode: !!f.hiddenInDrawingMode }));
    const hasLegacySubSteps = cloned.some(f => /^\d+\.\d+$/.test(String(f.sequenceNumber ?? '').trim()));
    if(hasLegacySubSteps){
      cloned.sort((a,b) => compareLegacySequences(a.sequenceNumber,b.sequenceNumber) || String(a.id || '').localeCompare(String(b.id || '')));
      let previousMajor = null;
      cloned.forEach((f, i) => {
        const parsed = parseLegacySequence(f.sequenceNumber);
        f.timing = (i > 0 && parsed.valid && previousMajor !== null && parsed.major === previousMajor) ? 'withPrevious' : 'afterPrevious';
        f.sequenceNumber = i + 1;
        previousMajor = parsed.valid ? parsed.major : null;
      });
    }else{
      cloned.forEach((f, i) => {
        f.timing = f.timing === 'withPrevious' ? 'withPrevious' : 'afterPrevious';
        if(!String(f.sequenceNumber ?? '').trim()) f.sequenceNumber = i + 1;
      });
    }
    if(cloned.length) cloned[0].timing = 'afterPrevious';
    return cloned;
  }

  function ensureMessageFlowDefaults(flows){
    flows.forEach((f, i) => {
      if(f.timing !== 'withPrevious') f.timing = 'afterPrevious';
      f.hiddenInDrawingMode = !!f.hiddenInDrawingMode;
      if(!String(f.sequenceNumber ?? '').trim()) f.sequenceNumber = i + 1;
    });
    if(flows.length) flows[0].timing = 'afterPrevious';
    return flows;
  }

  function parseLegacySequence(value){
    const raw = String(value ?? '').trim();
    const match = raw.match(/^(\d+)(?:\.(\d+))?$/);
    if(match) return { raw, major:Number(match[1]), sub:match[2] ? Number(match[2]) : 0, valid:true };
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? { raw, major:numeric, sub:0, valid:true } : { raw, major:Number.MAX_SAFE_INTEGER, sub:Number.MAX_SAFE_INTEGER, valid:false };
  }

  function compareLegacySequences(a,b){
    const pa = parseLegacySequence(a), pb = parseLegacySequence(b);
    if(pa.major !== pb.major) return pa.major - pb.major;
    if(pa.sub !== pb.sub) return pa.sub - pb.sub;
    return String(pa.raw).localeCompare(String(pb.raw), undefined, {numeric:true, sensitivity:'base'});
  }

  function saveLocal(silent=false){
    const copy = snapshot();
    copy.ui.selectedComponentIds = [];
    copy.ui.selectedFlowId = null;
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
      if(!silent) showToast('Saved locally');
    }catch(err){
      showToast('Could not save locally. The diagram may be too large.');
      console.error(err);
    }
  }

  function snapshot(){
    return JSON.parse(JSON.stringify({ components: state.components, messageFlows: state.messageFlows, settings: state.settings, ui: state.ui }));
  }

  function pushHistory(label='change'){
    if(suppressHistory) return;
    const snap = snapshot();
    history = history.slice(0, historyIndex + 1);
    history.push(snap);
    if(history.length > HISTORY_LIMIT) history.shift();
    historyIndex = history.length - 1;
    saveLocal(true);
  }

  function restoreSnapshot(snap){
    suppressHistory = true;
    state = mergeDefaults(JSON.parse(JSON.stringify(snap)));
    stopAnimation(false);
    renderAll();
    saveLocal(true);
    suppressHistory = false;
  }

  function undo(){
    if(historyIndex <= 0) return showToast('Nothing to undo');
    historyIndex--;
    restoreSnapshot(history[historyIndex]);
  }

  function redo(){
    if(historyIndex >= history.length - 1) return showToast('Nothing to redo');
    historyIndex++;
    restoreSnapshot(history[historyIndex]);
  }

  function id(prefix){ return `${prefix}_${Math.random().toString(36).slice(2,9)}_${Date.now().toString(36)}`; }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function snap(v){ return state.settings.snapToGrid ? Math.round(v / GRID) * GRID : v; }
  function escapeHtml(str){ return String(str ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
  function stripUiText(str){ return String(str ?? '').trim(); }

  function componentName(componentId){
    const c = findComponent(componentId);
    return c ? c.name : 'Missing component';
  }
  function findComponent(componentId){ return state.components.find(c => c.id === componentId); }
  function findFlow(flowId){ return state.messageFlows.find(f => f.id === flowId); }
  function parseSequence(value){
    const raw = String(value ?? '').trim();
    const numeric = Number(raw);
    if(raw && Number.isFinite(numeric)) return { raw, order:numeric, valid:true };
    return { raw, order:Number.MAX_SAFE_INTEGER, valid:false };
  }

  function compareSequences(a,b){
    const pa = parseSequence(a), pb = parseSequence(b);
    if(pa.order !== pb.order) return pa.order - pb.order;
    return String(pa.raw).localeCompare(String(pb.raw), undefined, {numeric:true, sensitivity:'base'});
  }

  function orderedFlows(){
    ensureMessageFlowDefaults(state.messageFlows);
    return [...state.messageFlows].sort((a,b) => compareSequences(a.sequenceNumber,b.sequenceNumber) || a.id.localeCompare(b.id));
  }

  function animationGroups(){
    const groups = [];
    orderedFlows().forEach((flow, i) => {
      const withPrevious = i > 0 && flow.timing === 'withPrevious' && groups.length;
      if(withPrevious){
        groups[groups.length - 1].flows.push(flow);
        groups[groups.length - 1].label = groups[groups.length - 1].flows.map(f => f.sequenceNumber || '?').join(' + ');
      }else{
        groups.push({ key: flow.id, label: String(flow.sequenceNumber || (i + 1)), flows: [flow] });
      }
    });
    return groups;
  }
  function selectedComponent(){ return state.ui.selectedComponentIds.length === 1 ? findComponent(state.ui.selectedComponentIds[0]) : null; }
  function selectedFlow(){ return state.ui.selectedFlowId ? findFlow(state.ui.selectedFlowId) : null; }

  function renderAll(){
    renderToolbarState();
    renderCanvas();
    renderFlowPanel();
    renderProperties();
    renderImagePanels();
    renderFlowEditorIfOpen();
    updateStatus();
    updateConnectionChoiceOverlayPosition();
  }

  function renderToolbarState(){
    document.body.classList.toggle('presentation', state.ui.presentationMode);
    document.body.classList.toggle('hideInactiveConnections', state.ui.presentationMode && !state.settings.showInactiveConnectionsInPresentation);
    document.body.classList.toggle('panelClosed', state.ui.presentationMode && !state.settings.presentationImagePanelOpen);
    document.body.classList.toggle('flowPanelClosed', !state.ui.presentationMode && !state.settings.flowPanelOpen);
    els.canvasWrap.classList.toggle('plain', state.ui.presentationMode || !state.settings.showGrid);
    els.selectModeBtn.classList.toggle('active', state.settings.activeCanvasMode === 'select');
    els.panModeBtn.classList.toggle('active', state.settings.activeCanvasMode === 'pan');
    els.gridBtn.classList.toggle('active', state.settings.showGrid);
    els.snapBtn.classList.toggle('active', state.settings.snapToGrid);
    els.zoomDisplay.textContent = `${Math.round(state.settings.zoom * 100)}%`;
    const presentationBtn = $('presentationBtn');
    if(presentationBtn){
      const presentationLabel = state.ui.presentationMode ? 'Close presentation mode' : 'Start presentation mode';
      presentationBtn.title = presentationLabel;
      presentationBtn.setAttribute('aria-label', presentationLabel);
      const label = presentationBtn.querySelector('.label');
      if(label) label.textContent = presentationLabel;
    }
    els.shapeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.shape === state.settings.defaultShape));
    if(els.connectionStyleSelect) els.connectionStyleSelect.value = selectedFlow()?.connectionStyle || state.settings.defaultConnectionStyle;
    els.modeSelect.value = state.settings.animationMode;
    els.speedSelect.value = state.settings.animationSpeed;
    els.sideTitle.textContent = state.ui.presentationMode ? 'Presentation' : 'Flow Steps';
    els.closePanelBtn.textContent = state.ui.presentationMode
      ? (state.settings.presentationImagePanelOpen ? 'Close panel' : 'Open image panel')
      : (state.settings.flowPanelOpen ? 'Hide panel' : 'Show flow panel');
    els.closePanelBtn.title = state.ui.presentationMode ? 'Close/reopen processing image panel' : 'Minimize/reopen flow steps panel';
    els.closePanelBtn.style.visibility = 'visible';
    const inactiveBtn = $('inactiveConnectionsBtn');
    if(inactiveBtn){
      const showInactive = !!state.settings.showInactiveConnectionsInPresentation;
      inactiveBtn.classList.toggle('active', showInactive);
      inactiveBtn.style.display = state.ui.presentationMode ? 'inline-flex' : 'none';
      inactiveBtn.setAttribute('aria-pressed', String(showInactive));
      inactiveBtn.setAttribute('aria-label', `Show inactive connectors: ${showInactive ? 'yes' : 'no'}`);
      inactiveBtn.title = `Show inactive connectors: ${showInactive ? 'yes' : 'no'}`;
      const label = inactiveBtn.querySelector('.label');
      if(label) label.textContent = `Show inactive connectors: ${showInactive ? 'Yes' : 'No'}`;
    }
  }

  function renderCanvas(){
    els.viewport.setAttribute('transform', `translate(${state.settings.panX},${state.settings.panY}) scale(${state.settings.zoom})`);
    els.gridRect.style.display = (state.settings.showGrid && !state.ui.presentationMode) ? 'block' : 'none';
    els.gridRect.setAttribute('x', -10000);
    els.gridRect.setAttribute('y', -10000);
    els.gridRect.setAttribute('width', 20000);
    els.gridRect.setAttribute('height', 20000);
    els.emptyHint.style.display = state.components.length ? 'none' : 'block';
    els.svg.style.cursor = cursorForMode();

    els.connectionsLayer.innerHTML = '';
    els.componentsLayer.innerHTML = '';
    els.overlayLayer.innerHTML = '';

    const flows = orderedFlows();
    flows.forEach(flow => renderFlow(flow, flows));
    [...state.components].sort((a,b) => (a.zIndex||0) - (b.zIndex||0)).forEach(renderComponent);
    renderAnimationOverlay();
    renderSelectedFlowEndpointHandles();
    renderSelectedFlowBendHandle();
    renderEndpointDragPreview();
    renderConnectionDraftPreview();
    if(drag?.type === 'selectBox') renderSelectionBox();
  }

  function cursorForMode(){
    if(drag?.type === 'pan') return 'grabbing';
    if(state.settings.activeCanvasMode === 'pan') return 'grab';
    if(state.settings.activeCanvasMode === 'connect') return connectSourceId ? 'crosshair' : 'cell';
    return 'default';
  }

  function renderComponent(c){
    const g = svgEl('g', { class: classNames('componentGroup', c.shape === 'package' && 'packageComponent', isSelectedComponent(c.id) && 'selected', animationSourceIds().has(c.id) && 'activeSource', animationTargetIds().has(c.id) && 'activeTarget', animationProcessingIds().has(c.id) && 'processing'), 'data-id': c.id, tabindex: 0 });
    g.appendChild(componentShapeEl(c));
    g.appendChild(componentTextEl(c));
    if(shouldShowPorts(c.id)) renderPorts(g, c);
    if(isSelectedComponent(c.id) && !state.ui.presentationMode) renderResizeHandles(g, c);
    els.componentsLayer.appendChild(g);
  }

  function packageHeaderHeight(c){
    return Math.min(48, Math.max(30, Number(c.height || 0) * .18));
  }

  function componentShapeEl(c){
    const common = { class: classNames('componentShape', c.shape === 'package' && 'packageShape'), fill: c.fillColor || '#ffffff', stroke: c.borderColor || '#334155', 'stroke-width': c.borderWidth || 2 };
    switch(c.shape){
      case 'rectangle': return svgEl('rect', { ...common, x:c.x, y:c.y, width:c.width, height:c.height, rx:3, ry:3 });
      case 'ellipse': return svgEl('ellipse', { ...common, cx:c.x+c.width/2, cy:c.y+c.height/2, rx:c.width/2, ry:c.height/2 });
      case 'diamond': return svgEl('polygon', { ...common, points:`${c.x+c.width/2},${c.y} ${c.x+c.width},${c.y+c.height/2} ${c.x+c.width/2},${c.y+c.height} ${c.x},${c.y+c.height/2}` });
      case 'hexagon': {
        const p = `${c.x+c.width*.22},${c.y} ${c.x+c.width*.78},${c.y} ${c.x+c.width},${c.y+c.height/2} ${c.x+c.width*.78},${c.y+c.height} ${c.x+c.width*.22},${c.y+c.height} ${c.x},${c.y+c.height/2}`;
        return svgEl('polygon', { ...common, points:p });
      }
      case 'triangle':
        return svgEl('polygon', { ...common, points:`${c.x+c.width/2},${c.y} ${c.x+c.width},${c.y+c.height} ${c.x},${c.y+c.height}` });
      case 'pentagon':
        return svgEl('polygon', { ...common, points:`${c.x+c.width/2},${c.y} ${c.x+c.width},${c.y+c.height*.38} ${c.x+c.width*.82},${c.y+c.height} ${c.x+c.width*.18},${c.y+c.height} ${c.x},${c.y+c.height*.38}` });
      case 'trapezoid':
        return svgEl('polygon', { ...common, points:`${c.x+c.width*.22},${c.y} ${c.x+c.width*.78},${c.y} ${c.x+c.width},${c.y+c.height} ${c.x},${c.y+c.height}` });
      case 'parallelogram':
        return svgEl('polygon', { ...common, points:`${c.x+c.width*.22},${c.y} ${c.x+c.width},${c.y} ${c.x+c.width*.78},${c.y+c.height} ${c.x},${c.y+c.height}` });
      case 'package': {
        const headerH = packageHeaderHeight(c);
        const group = svgEl('g', {});
        group.appendChild(svgEl('rect', { ...common, x:c.x, y:c.y, width:c.width, height:c.height, rx:16, ry:16 }));
        group.appendChild(svgEl('line', { class:'packageSeparator', x1:c.x, y1:c.y+headerH, x2:c.x+c.width, y2:c.y+headerH }));
        return group;
      }
      case 'queue': {
        const g = svgEl('g', {});
        const offset = Math.min(12, c.width*.08);
        g.appendChild(svgEl('rect', { ...common, x:c.x+offset, y:c.y, width:c.width-offset, height:c.height, rx:14, ry:14 }));
        g.appendChild(svgEl('path', { d:`M${c.x+offset*.35},${c.y+c.height*.22} L${c.x+offset},${c.y+c.height*.22} M${c.x+offset*.35},${c.y+c.height*.5} L${c.x+offset},${c.y+c.height*.5} M${c.x+offset*.35},${c.y+c.height*.78} L${c.x+offset},${c.y+c.height*.78}`, fill:'none', stroke:common.stroke, 'stroke-width':common['stroke-width'], 'stroke-linecap':'round' }));
        return g;
      }
      case 'note': {
        const fold = Math.min(24, c.width*.22, c.height*.28);
        const d = `M${c.x},${c.y} L${c.x+c.width-fold},${c.y} L${c.x+c.width},${c.y+fold} L${c.x+c.width},${c.y+c.height} L${c.x},${c.y+c.height} Z M${c.x+c.width-fold},${c.y} L${c.x+c.width-fold},${c.y+fold} L${c.x+c.width},${c.y+fold}`;
        return svgEl('path', { ...common, d });
      }
      case 'cloud': {
        const x=c.x, y=c.y, w=c.width, h=c.height;
        const d = `M${x+w*.22},${y+h*.78} C${x+w*.04},${y+h*.78} ${x+w*.02},${y+h*.52} ${x+w*.18},${y+h*.47} C${x+w*.17},${y+h*.28} ${x+w*.38},${y+h*.20} ${x+w*.50},${y+h*.32} C${x+w*.58},${y+h*.10} ${x+w*.86},${y+h*.23} ${x+w*.82},${y+h*.48} C${x+w*.98},${y+h*.48} ${x+w*.99},${y+h*.78} ${x+w*.78},${y+h*.78} Z`;
        return svgEl('path', { ...common, d });
      }
      case 'cylinder': {
        const h = Math.min(22, c.height * .22);
        const d = `M${c.x},${c.y+h/2} C${c.x},${c.y-h/6} ${c.x+c.width},${c.y-h/6} ${c.x+c.width},${c.y+h/2} L${c.x+c.width},${c.y+c.height-h/2} C${c.x+c.width},${c.y+c.height+h/6} ${c.x},${c.y+c.height+h/6} ${c.x},${c.y+c.height-h/2} Z M${c.x},${c.y+h/2} C${c.x},${c.y+h*1.22} ${c.x+c.width},${c.y+h*1.22} ${c.x+c.width},${c.y+h/2}`;
        return svgEl('path', { ...common, d });
      }
      case 'document': {
        const fold = Math.min(22, c.width*.18, c.height*.25);
        const wave = Math.min(10, c.height*.12);
        const d = `M${c.x},${c.y} L${c.x+c.width-fold},${c.y} L${c.x+c.width},${c.y+fold} L${c.x+c.width},${c.y+c.height-wave} Q${c.x+c.width*.75},${c.y+c.height+wave} ${c.x+c.width*.5},${c.y+c.height-wave/2} Q${c.x+c.width*.25},${c.y+c.height-wave*1.7} ${c.x},${c.y+c.height-wave/2} Z M${c.x+c.width-fold},${c.y} L${c.x+c.width-fold},${c.y+fold} L${c.x+c.width},${c.y+fold}`;
        return svgEl('path', { ...common, d });
      }
      case 'actor': {
        const cx = c.x + c.width/2, top = c.y + 8;
        const headR = Math.min(c.width, c.height) * .14;
        const bodyTop = top + headR*2 + 3;
        const bodyBottom = c.y + c.height - 12;
        const armY = bodyTop + (bodyBottom-bodyTop)*.25;
        const legY = bodyBottom;
        const d = `M${cx},${bodyTop} L${cx},${bodyBottom-22} M${c.x+12},${armY} L${c.x+c.width-12},${armY} M${cx},${bodyBottom-22} L${c.x+18},${legY} M${cx},${bodyBottom-22} L${c.x+c.width-18},${legY}`;
        const group = svgEl('g', {});
        group.appendChild(svgEl('rect', { ...common, x:c.x, y:c.y, width:c.width, height:c.height, rx:18, ry:18, opacity:.18 }));
        group.appendChild(svgEl('circle', { ...common, cx, cy: top+headR, r:headR, fill:'none', 'stroke-width':2.2 }));
        group.appendChild(svgEl('path', { ...common, d, fill:'none', 'stroke-linecap':'round', 'stroke-width':2.2 }));
        return group;
      }
      case 'roundedRectangle':
      default: return svgEl('rect', { ...common, x:c.x, y:c.y, width:c.width, height:c.height, rx:16, ry:16 });
    }
  }

  function componentTextEl(c){
    const isPackage = c.shape === 'package';
    const headerH = isPackage ? packageHeaderHeight(c) : c.height;
    const maxLines = isPackage ? 2 : 4;
    const lineHeight = isPackage ? 14 : 16;
    const y = isPackage ? c.y + headerH/2 : c.y + c.height/2;
    const text = svgEl('text', {
      class: classNames('componentText', isPackage && 'packageText'),
      x:c.x+c.width/2,
      y,
      fill:c.textColor || '#0f172a',
      'data-id': c.id
    });
    const lines = String(c.name || '').split('\n').slice(0,maxLines);
    lines.forEach((line, i) => {
      const tspan = svgEl('tspan', { x:c.x+c.width/2, dy: i === 0 ? -(lines.length-1)*lineHeight/2 : lineHeight });
      tspan.textContent = line || ' ';
      text.appendChild(tspan);
    });
    return text;
  }

  function shouldShowPorts(componentId){
    if(state.ui.presentationMode) return false;
    if(drag?.type === 'endpoint') return true;
    // While creating a connection from a selected source port, keep all ports visible
    // so the user can choose a target port without activating a separate connect tool.
    if(connectSourceId) return true;
    if(state.settings.activeCanvasMode === 'connect') return true;
    if(isSelectedComponent(componentId)) return true;
    const f = selectedFlow();
    return !!(f && (f.sourceComponentId === componentId || f.targetComponentId === componentId));
  }

  function renderPorts(g, c){
    for(const [portId] of portDefsForComponent(c)){
      const p = portPosition(c, portId);
      const pending = connectSourceId === c.id && connectSourcePortId === portId;
      g.appendChild(svgEl('circle', {
        class: classNames('componentPort', pending && 'sourcePortPending'),
        cx:p.x, cy:p.y, r:4.5,
        'data-id':c.id,
        'data-port':portId,
        'aria-label':`Connection port ${portLabel(portId, c)}`
      }));
    }
  }

  function portCountForLength(length){
    // Larger components expose more possible connection anchors while small ones stay uncluttered.
    return clamp(Math.round(Number(length || 0) / 55), 3, 12);
  }

  function makePortId(side, ratio){
    return `${side}:${Number(ratio).toFixed(3)}`;
  }

  function portDefsForComponent(c){
    const defs = [];
    for(const [side, sideLabel, dimension] of PORT_SIDES){
      const length = dimension === 'width' ? c.width : c.height;
      const count = portCountForLength(length);
      // Always include the exact centered edge anchor. Larger components still get additional anchors.
      const ratioSet = new Set([0.5]);
      for(let i=1; i<=count; i++) ratioSet.add(Number((i / (count + 1)).toFixed(3)));
      const ratios = Array.from(ratioSet).sort((a,b) => a-b);
      ratios.forEach((ratio, index) => {
        const percent = Math.round(ratio * 100);
        defs.push([makePortId(side, ratio), `${sideLabel} ${index+1}/${ratios.length} (${percent}%)`, side, ratio, index+1, ratios.length]);
      });
    }
    return defs;
  }

  function genericPortDefs(){
    return LEGACY_PORT_DEFS;
  }

  function parseDynamicPortId(portId){
    const match = String(portId || '').match(/^(top|right|bottom|left):([0-9]*\.?[0-9]+)$/);
    if(!match) return null;
    const ratio = clamp(Number(match[2]), 0.02, 0.98);
    const side = match[1];
    const sideLabel = side[0].toUpperCase() + side.slice(1);
    return [makePortId(side, ratio), `${sideLabel} ${Math.round(ratio*100)}%`, side, ratio];
  }

  function portDefById(c, portId){
    if(!portId) return null;
    if(c){
      const exact = portDefsForComponent(c).find(p => p[0] === portId);
      if(exact) return exact;
    }
    const dynamic = parseDynamicPortId(portId);
    if(dynamic) return dynamic;
    return LEGACY_PORT_DEFS.find(p => p[0] === portId) || null;
  }

  function portLabel(portId, component=null){
    return (portDefById(component, portId)?.[1]) || 'Auto / nearest port';
  }

  function portSelectHtml(field, selectedPortId, componentId=null){
    const component = componentId ? findComponent(componentId) : null;
    const defs = component ? portDefsForComponent(component) : genericPortDefs();
    const selectedDef = selectedPortId ? portDefById(component, selectedPortId) : null;
    const allDefs = selectedDef && !defs.some(([id]) => id === selectedPortId) ? [selectedDef, ...defs] : defs;
    const countInfo = component ? ` (${allDefs.length} available anchors)` : '';
    const options = [`<option value="">Auto / nearest port${countInfo}</option>`]
      .concat(allDefs.map(([id,label]) => `<option value="${id}" ${id===selectedPortId ? 'selected' : ''}>${escapeHtml(label)}</option>`));
    return `<select data-edit="${field}">${options.join('')}</select>`;
  }

  function portPosition(c, portId){
    const def = portDefById(c, portId) || ['right50','Right center','right',0.50];
    const side = def[2], ratio = def[3];
    if(side === 'top') return { x:c.x + c.width * ratio, y:c.y };
    if(side === 'right') return { x:c.x + c.width, y:c.y + c.height * ratio };
    if(side === 'bottom') return { x:c.x + c.width * ratio, y:c.y + c.height };
    return { x:c.x, y:c.y + c.height * ratio };
  }

  function nearestPortId(c, point){
    let bestId = makePortId('right', 0.5), bestDist = Infinity;
    for(const [portId] of portDefsForComponent(c)){
      const p = portPosition(c, portId);
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if(d < bestDist){ bestDist = d; bestId = portId; }
    }
    return bestId;
  }

  function centeredPortIdFromPoint(c, point){
    if(!c) return makePortId('right', 0.5);
    const p = point || center(c);
    const distances = [
      ['top', Math.abs(p.y - c.y)],
      ['right', Math.abs(p.x - (c.x + c.width))],
      ['bottom', Math.abs(p.y - (c.y + c.height))],
      ['left', Math.abs(p.x - c.x)]
    ];
    distances.sort((a,b) => a[1] - b[1]);
    return makePortId(distances[0][0], 0.5);
  }

  function bestPortToward(c, other){
    const pt = other ? center(other) : {x:c.x+c.width, y:c.y+c.height/2};
    return nearestPortId(c, pt);
  }

  function renderResizeHandles(g, c){
    const positions = {
      nw:[c.x,c.y], n:[c.x+c.width/2,c.y], ne:[c.x+c.width,c.y], e:[c.x+c.width,c.y+c.height/2], se:[c.x+c.width,c.y+c.height], s:[c.x+c.width/2,c.y+c.height], sw:[c.x,c.y+c.height], w:[c.x,c.y+c.height/2]
    };
    for(const [handle, [x,y]] of Object.entries(positions)){
      g.appendChild(svgEl('rect', { class:'resizeHandle', 'data-id':c.id, 'data-handle':handle, x:x-4, y:y-4, width:8, height:8, rx:2 }));
    }
  }

  function renderFlow(flow, allFlows){
    const source = findComponent(flow.sourceComponentId);
    const target = findComponent(flow.targetComponentId);
    if(!source || !target) return;
    const active = activeFlowIds().has(flow.id);
    const selected = state.ui.selectedFlowId === flow.id;
    const hiddenInDrawingMode = !!flow.hiddenInDrawingMode && !state.ui.presentationMode && !animation.running && !active;
    if(hiddenInDrawingMode) return;
    const pathData = connectionPath(flow, allFlows);
    const completed = animation.completed.has(flow.id);
    const path = svgEl('path', {
      id: `path-${flow.id}`,
      class: classNames('flowPath', selected && 'selected', active && 'active', completed && 'completed'),
      d: pathData.d,
      stroke: active ? '#f59e0b' : (selected ? '#2563eb' : (flow.style?.color || '#475569')),
      'stroke-width': active ? 4.2 : (flow.style?.thickness || 2.2),
      'marker-end': active ? 'url(#arrowActive)' : selected ? 'url(#arrowSelected)' : 'url(#arrow)',
      'data-id': flow.id
    });
    els.connectionsLayer.appendChild(path);
    if(active && animation.running){
      els.connectionsLayer.appendChild(svgEl('path', {
        class: 'activeConnectionOverlay activeConnectionPersistent',
        d: pathData.d,
        'marker-end': 'url(#arrowActive)'
      }));
    }

    const showEditLabels = !state.ui.presentationMode && !animation.running;
    if(showEditLabels){
      const seq = svgEl('text', { class:'seqLabel', x:pathData.labelX - 18, y:pathData.labelY - 14 });
      seq.textContent = `#${flow.sequenceNumber || ''}`;
      els.connectionsLayer.appendChild(seq);
      const label = svgEl('text', { class:'flowLabel editLabel', x:pathData.labelX, y:pathData.labelY, 'data-id':flow.id });
      label.textContent = flow.messageText || 'Message';
      els.connectionsLayer.appendChild(label);
    }
  }

  function renderSelectedFlowEndpointHandles(){
    if(state.ui.presentationMode || animation.running || drag?.type === 'endpoint') return;
    const flow = selectedFlow();
    if(!flow) return;
    const source = findComponent(flow.sourceComponentId);
    const target = findComponent(flow.targetComponentId);
    if(!source || !target) return;
    const pathData = connectionPath(flow, orderedFlows());
    const sourceHandle = svgEl('circle', {
      class:'flowEndpointHandle sourceEndpoint',
      cx:pathData.sourcePoint.x, cy:pathData.sourcePoint.y, r:7,
      'data-flow-id':flow.id,
      'data-end':'source',
      'aria-label':'Drag source connection point'
    });
    sourceHandle.appendChild(svgEl('title', {}));
    sourceHandle.querySelector('title').textContent = 'Drag source connection point';
    const targetHandle = svgEl('circle', {
      class:'flowEndpointHandle targetEndpoint',
      cx:pathData.targetPoint.x, cy:pathData.targetPoint.y, r:7,
      'data-flow-id':flow.id,
      'data-end':'target',
      'aria-label':'Drag target connection point'
    });
    targetHandle.appendChild(svgEl('title', {}));
    targetHandle.querySelector('title').textContent = 'Drag target connection point';
    els.overlayLayer.appendChild(sourceHandle);
    els.overlayLayer.appendChild(targetHandle);
  }

  function renderSelectedFlowBendHandle(){
    if(state.ui.presentationMode || animation.running || drag?.type === 'endpoint' || drag?.type === 'bend') return;
    const flow = selectedFlow();
    if(!flow) return;
    const style = flow.connectionStyle || 'arc';
    if(style !== 'arc' && style !== 'angular') return;
    const pathData = connectionPath(flow, orderedFlows());
    if(!pathData.controlPoint) return;
    els.overlayLayer.appendChild(svgEl('path', {
      class:'flowBendGuide',
      d:`M${pathData.sourcePoint.x},${pathData.sourcePoint.y} L${pathData.controlPoint.x},${pathData.controlPoint.y} L${pathData.targetPoint.x},${pathData.targetPoint.y}`
    }));
    const handle = svgEl('circle', {
      class:'flowBendHandle',
      cx:pathData.controlPoint.x, cy:pathData.controlPoint.y, r:7,
      'data-flow-id':flow.id,
      'aria-label':'Drag connection curve or elbow angle'
    });
    handle.appendChild(svgEl('title', {}));
    handle.querySelector('title').textContent = style === 'angular' ? 'Drag to adjust elbow angle' : 'Drag to adjust curve angle';
    els.overlayLayer.appendChild(handle);
  }

  function renderEndpointDragPreview(){
    if(drag?.type !== 'endpoint') return;
    const flow = findFlow(drag.flowId);
    if(!flow) return;
    const pathData = connectionPath(flow, orderedFlows());
    const current = drag.currentWorld || (drag.end === 'source' ? pathData.sourcePoint : pathData.targetPoint);
    const fixed = drag.end === 'source' ? pathData.targetPoint : pathData.sourcePoint;
    const d = drag.end === 'source'
      ? `M${current.x},${current.y} L${fixed.x},${fixed.y}`
      : `M${fixed.x},${fixed.y} L${current.x},${current.y}`;
    els.overlayLayer.appendChild(svgEl('path', { class:'endpointDragPreview', d, 'marker-end':'url(#arrowSelected)' }));
    els.overlayLayer.appendChild(svgEl('circle', { class:'endpointDragDot', cx:current.x, cy:current.y, r:7 }));
  }

  function renderConnectionDraftPreview(){
    if(state.ui.presentationMode || !connectSourceId || !connectChosenStyle) return;
    const source = findComponent(connectSourceId);
    if(!source) return;
    const sp = portPosition(source, connectSourcePortId || centeredPortIdFromPoint(source, center(source)));
    const tp = connectPreviewPoint || defaultConnectionPreviewPoint(source, connectSourcePortId);
    const d = draftConnectionPath(connectChosenStyle, sp, tp);
    els.overlayLayer.appendChild(svgEl('path', { class:'connectionDraftPreview', d, 'marker-end':'url(#arrowSelected)' }));
    els.overlayLayer.appendChild(svgEl('circle', { class:'connectionDraftDot', cx:tp.x, cy:tp.y, r:6 }));
  }

  function defaultConnectionPreviewPoint(source, portId){
    const sp = portPosition(source, portId || makePortId('right', 0.5));
    const side = (portDefById(source, portId)?.[2]) || 'right';
    const distance = Math.max(120, Math.min(220, Math.max(source.width, source.height) * .9));
    if(side === 'left') return { x:sp.x - distance, y:sp.y };
    if(side === 'top') return { x:sp.x, y:sp.y - distance };
    if(side === 'bottom') return { x:sp.x, y:sp.y + distance };
    return { x:sp.x + distance, y:sp.y };
  }

  function draftConnectionPath(style, sp, tp){
    const dx = tp.x - sp.x, dy = tp.y - sp.y;
    const mid = { x:(sp.x + tp.x)/2, y:(sp.y + tp.y)/2 };
    if(style === 'straight') return `M${sp.x},${sp.y} L${tp.x},${tp.y}`;
    if(style === 'angular'){
      const mx = mid.x;
      return `M${sp.x},${sp.y} L${mx},${sp.y} L${mx},${tp.y} L${tp.x},${tp.y}`;
    }
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const curve = clamp(len * .18, 30, 95);
    const cx = mid.x + nx * curve;
    const cy = mid.y + ny * curve;
    return `M${sp.x},${sp.y} Q${cx},${cy} ${tp.x},${tp.y}`;
  }

  function renderAnimationOverlay(){
    const flows = activeAnimatedFlows();
    if(!animation.running || !flows.length) return;

    flows.forEach(flow => {
      const source = findComponent(flow.sourceComponentId), target = findComponent(flow.targetComponentId);
      if(!source || !target) return;

      const activePathData = connectionPath(flow, orderedFlows());
      const cachedPath = animationPathCacheFor(flow.id);
      const activeConnectionD = cachedPath?.d || activePathData.d;
      // Always draw the current animation connection in the top overlay layer.
      // This path is independent from the normal flow layer and remains visible
      // even when inactive connections are hidden in presentation mode.
      els.overlayLayer.appendChild(svgEl('path', {
        class:'activeConnectionOverlay activeConnectionPersistent',
        d:activeConnectionD,
        'marker-end':'url(#arrowActive)'
      }));

      if(animation.phase === 'transfer' || animation.phase === 'arrived'){
        const point = animation.token?.[flow.id] || cachedPath?.targetPoint || activePathData.targetPoint;
        const g = svgEl('g', { class:'messageToken' });
        g.appendChild(svgEl('circle', { cx:point.x, cy:point.y, r:10, fill:'#f59e0b', stroke:'#fff', 'stroke-width':3 }));
        const labelBg = svgEl('rect', { x:point.x-80, y:point.y+16, width:160, height:24, rx:12, fill:'#ffffff', stroke:'#f59e0b', 'stroke-width':1.2 });
        g.appendChild(labelBg);
        const text = svgEl('text', { x:point.x, y:point.y+32, 'text-anchor':'middle', 'font-size':12, 'font-weight':800, fill:'#92400e' });
        text.textContent = flow.messageText || 'Message';
        g.appendChild(text);
        els.overlayLayer.appendChild(g);
      }

      if(animation.phase === 'processing'){
        els.overlayLayer.appendChild(processingBubble(target, flow.actionText || 'Processing…'));
      }
    });
  }

  function processingBubble(target, textValue){
    const width = Math.max(190, Math.min(320, target.width + 80));
    const lines = wrapText(textValue, 32).slice(0,5);
    const height = 24 + lines.length * 17;
    const x = target.x + target.width/2 - width/2;
    const y = target.y - height - 16;
    const g = svgEl('g', {});
    g.appendChild(svgEl('rect', { class:'actionBubble', x, y, width, height, rx:14 }));
    lines.forEach((line, i) => {
      const t = svgEl('text', { class:'actionText', x:x+width/2, y:y+24+i*17 });
      t.textContent = line;
      g.appendChild(t);
    });
    return g;
  }

  function renderSelectionBox(){
    const x = Math.min(drag.startWorld.x, drag.currentWorld.x);
    const y = Math.min(drag.startWorld.y, drag.currentWorld.y);
    const w = Math.abs(drag.startWorld.x - drag.currentWorld.x);
    const h = Math.abs(drag.startWorld.y - drag.currentWorld.y);
    els.overlayLayer.appendChild(svgEl('rect', { class:'selectionBox', x, y, width:w, height:h }));
  }

  function connectionPath(flow, allFlows=orderedFlows()){
    const s = findComponent(flow.sourceComponentId), t = findComponent(flow.targetComponentId);
    const duplicates = allFlows.filter(f => f.sourceComponentId === flow.sourceComponentId && f.targetComponentId === flow.targetComponentId);
    const dupIndex = Math.max(0, duplicates.findIndex(f => f.id === flow.id));
    const dupOffset = (dupIndex - (duplicates.length - 1)/2) * 24;

    if(s.id === t.id){
      const sourcePort = flow.sourcePortId || makePortId('right', 0.25);
      const targetPort = flow.targetPortId || makePortId('right', 0.75);
      const sp0 = portPosition(s, sourcePort);
      const tp0 = portPosition(t, targetPort);
      const r = 58 + dupIndex * 18;
      const sx = sp0.x, sy = sp0.y, tx = tp0.x, ty = tp0.y;
      const outward = Math.max(1, Math.sign((sx - (s.x+s.width/2)) || 1));
      const d = `M${sx},${sy} C${sx+outward*r},${sy-r} ${tx+outward*r},${ty+r} ${tx},${ty}`;
      return { d, labelX:sx+outward*r*.85, labelY:sy-r*.35, sourcePoint:{x:sx,y:sy}, targetPoint:{x:tx,y:ty} };
    }

    const sc = center(s), tc = center(t);
    const sp = flow.sourcePortId ? portPosition(s, flow.sourcePortId) : portPosition(s, bestPortToward(s, t));
    const tp = flow.targetPortId ? portPosition(t, flow.targetPortId) : portPosition(t, bestPortToward(t, s));
    const mid = { x:(sp.x + tp.x)/2, y:(sp.y + tp.y)/2 };
    const dx = tp.x-sp.x, dy = tp.y-sp.y;
    const len = Math.hypot(dx,dy) || 1;
    const nx = -dy/len, ny = dx/len;
    const style = flow.connectionStyle || 'arc';
    let d, labelX, labelY;

    if(style === 'straight'){
      // Keep the path endpoints exactly on the selected ports. Earlier versions
      // shifted the entire straight line for duplicate connections, which could
      // make the arrow look detached from the defined source/target point.
      d = `M${sp.x},${sp.y} L${tp.x},${tp.y}`;
      const labelOffset = dupOffset || 0;
      labelX = mid.x + nx * labelOffset;
      labelY = mid.y + ny * labelOffset - 8;
    }else if(style === 'angular'){
      const defaultCp = { x:mid.x + dupOffset, y:mid.y };
      const cp = validControlPoint(flow.controlPoint) || defaultCp;
      // The bend handle represents the center of an orthogonal elbow.
      // Dragging it moves the two right-angle turns while keeping the
      // connection anchored exactly to the selected source/target ports.
      d = `M${sp.x},${sp.y} L${cp.x},${sp.y} L${cp.x},${cp.y} L${tp.x},${cp.y} L${tp.x},${tp.y}`;
      const labelPoint = labelPointForAngularPath(sp, cp, tp);
      labelX = labelPoint.x;
      labelY = labelPoint.y - 8;
      return { d, labelX, labelY, sourcePoint:sp, targetPoint:tp, controlPoint:cp };
    }else{
      const curve = clamp(len * .18, 35, 120) + dupOffset;
      const defaultCp = { x:mid.x + nx * curve, y:mid.y + ny * curve };
      const cp = validControlPoint(flow.controlPoint) || defaultCp;
      d = `M${sp.x},${sp.y} Q${cp.x},${cp.y} ${tp.x},${tp.y}`;
      const labelPoint = quadraticPoint(sp, cp, tp, 0.5);
      labelX = labelPoint.x;
      labelY = labelPoint.y - 8;
      return { d, labelX, labelY, sourcePoint:sp, targetPoint:tp, controlPoint:cp };
    }
    return { d, labelX, labelY, sourcePoint:sp, targetPoint:tp };
  }

  function validControlPoint(point){
    if(!point || typeof point.x !== 'number' || typeof point.y !== 'number') return null;
    if(!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return { x:point.x, y:point.y };
  }

  function quadraticPoint(start, control, end, t=0.5){
    const u = 1 - t;
    return {
      x: u*u*start.x + 2*u*t*control.x + t*t*end.x,
      y: u*u*start.y + 2*u*t*control.y + t*t*end.y
    };
  }

  function labelPointForAngularPath(sp, cp, tp){
    const points = [
      sp,
      { x:cp.x, y:sp.y },
      { x:cp.x, y:cp.y },
      { x:tp.x, y:cp.y },
      tp
    ];
    // Use the midpoint of the longest visible segment. This keeps the label
    // attached to the actual elbow connector instead of placing it directly on
    // the draggable bend handle/control point.
    let best = null;
    for(let i=0; i<points.length-1; i++){
      const a = points[i], b = points[i+1];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if(length < 1) continue;
      if(!best || length > best.length){
        best = { length, point:{ x:(a.x + b.x)/2, y:(a.y + b.y)/2 } };
      }
    }
    return best?.point || { x:(sp.x + tp.x)/2, y:(sp.y + tp.y)/2 };
  }

  function center(c){ return { x:c.x+c.width/2, y:c.y+c.height/2 }; }

  function isPackageComponent(c){
    return !!c && c.shape === 'package';
  }

  function componentInsidePackage(pkg, candidate){
    if(!isPackageComponent(pkg) || !candidate || candidate.id === pkg.id) return false;
    const p = center(candidate);
    return p.x >= pkg.x && p.x <= pkg.x + pkg.width && p.y >= pkg.y && p.y <= pkg.y + pkg.height;
  }

  function expandMoveOriginalsForPackages(originals){
    const originalMap = new Map((originals || []).map(o => [o.id, o]));
    let changed = true;
    while(changed){
      changed = false;
      for(const original of Array.from(originalMap.values())){
        const pkg = findComponent(original.id);
        if(!isPackageComponent(pkg)) continue;
        state.components.forEach(candidate => {
          if(!originalMap.has(candidate.id) && componentInsidePackage(pkg, candidate)){
            originalMap.set(candidate.id, JSON.parse(JSON.stringify(candidate)));
            changed = true;
          }
        });
      }
    }
    return Array.from(originalMap.values());
  }

  function flowControlOriginalsForComponentMove(componentOriginals){
    const movedIds = new Set((componentOriginals || []).map(c => c.id));
    if(!movedIds.size) return [];
    return state.messageFlows
      .filter(flow => validControlPoint(flow.controlPoint) && (movedIds.has(flow.sourceComponentId) || movedIds.has(flow.targetComponentId)))
      .map(flow => ({ id: flow.id, controlPoint: { x: flow.controlPoint.x, y: flow.controlPoint.y } }));
  }

  function anchorPoint(c, tx, ty){
    const cx = c.x+c.width/2, cy = c.y+c.height/2;
    const dx = tx-cx, dy = ty-cy;
    if(Math.abs(dx) < .001 && Math.abs(dy) < .001) return {x:cx,y:cy};
    if(c.shape === 'ellipse'){
      const a = c.width/2, b = c.height/2;
      const scale = 1 / Math.sqrt((dx*dx)/(a*a) + (dy*dy)/(b*b));
      return { x:cx+dx*scale, y:cy+dy*scale };
    }
    const scale = Math.min(Math.abs((c.width/2)/dx) || Infinity, Math.abs((c.height/2)/dy) || Infinity);
    return { x:cx+dx*scale, y:cy+dy*scale };
  }

  function renderFlowPanel(){
    const editing = document.activeElement && els.flowList.contains(document.activeElement) && ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
    if(editing) return;
    const flows = orderedFlows();
    if(!flows.length){
      els.flowList.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px">No message flows yet. Use 🔗 Connect, then click source and target components.</div>';
      return;
    }
    els.flowList.innerHTML = flows.map(flow => flowItemHtml(flow)).join('');
  }

  function flowItemHtml(flow){
    const selected = state.ui.selectedFlowId === flow.id;
    const active = activeFlowIds().has(flow.id);
    const msg = flow.messageText || 'Message';
    const route = `${componentName(flow.sourceComponentId)} → ${componentName(flow.targetComponentId)}`;
    const timing = flow.timing === 'withPrevious' ? 'with previous' : 'after previous';
    const hidden = !!flow.hiddenInDrawingMode;
    const eyeTitle = hidden ? 'Show connector in drawing mode' : 'Hide connector in drawing mode';
    return `<div class="flowItem ${selected ? 'selected' : ''} ${active ? 'activeAnim' : ''} ${hidden ? 'hiddenConnector' : ''}" data-flow-id="${flow.id}">
      <div class="flowSummary" data-action="edit-flow" draggable="true" title="Click to edit this flow step">
        <span class="seqBadge">${escapeHtml(flow.sequenceNumber || '')}</span>
        <div class="flowTitle"><b>${escapeHtml(msg)}</b><span>${escapeHtml(route)}</span></div>
        <div class="indicators" title="${flow.actionText ? 'Processing action exists' : 'No processing action'}${flow.processingImageDataUrl ? ' / image attached' : ' / no image'}">
          <span class="timingBadge ${flow.timing === 'withPrevious' ? 'withPrevious' : ''}">${escapeHtml(timing)}</span><span>${flow.actionText ? '⚙' : '○'}</span><span>${flow.processingImageDataUrl ? '🖼' : ''}</span><button class="miniButton eyeButton ${hidden ? 'eyeOff active' : ''}" data-action="toggle-connector-visibility" type="button" title="${eyeTitle}" aria-label="${eyeTitle}" aria-pressed="${hidden ? 'true' : 'false'}">👁</button><button class="miniButton" data-action="edit-flow" type="button">Edit</button>
        </div>
      </div>
    </div>`;
  }

  function flowEditorHtml(flow){
    return `<div data-flow-id="${flow.id}" class="flowEditorContent">
      <div class="formRow"><label>Order</label><input data-edit="sequenceNumber" type="text" inputmode="decimal" value="${escapeHtml(flow.sequenceNumber || '')}" placeholder="e.g. 3"></div>
      <div class="formRow"><label>Timing</label><select data-edit="timing">
        <option value="afterPrevious" ${flow.timing !== 'withPrevious' ? 'selected' : ''}>After previous</option>
        <option value="withPrevious" ${flow.timing === 'withPrevious' ? 'selected' : ''}>With previous</option>
      </select></div>
      <div class="formRow"><label>Source</label>${componentSelectHtml('sourceComponentId', flow.sourceComponentId)}</div>
      <div class="formRow"><label>Target</label>${componentSelectHtml('targetComponentId', flow.targetComponentId)}</div>
      <div class="formRow"><label>Source port</label>${portSelectHtml('sourcePortId', flow.sourcePortId || '', flow.sourceComponentId)}</div>
      <div class="formRow"><label>Target port</label>${portSelectHtml('targetPortId', flow.targetPortId || '', flow.targetComponentId)}</div>
      <div class="formRow wide"><label>Message</label><input data-edit="messageText" type="text" value="${escapeHtml(flow.messageText || '')}" placeholder="Message name"></div>
      <div class="formRow wide"><label>Processing action</label><textarea data-edit="actionText" rows="4" placeholder="What does the target component do?">${escapeHtml(flow.actionText || '')}</textarea></div>
      <div class="formRow wide"><label>Notes</label><textarea data-edit="notes" rows="3" placeholder="Optional notes">${escapeHtml(flow.notes || '')}</textarea></div>
      <div class="formRow"><label>Style</label><select data-edit="connectionStyle">
        <option value="straight" ${flow.connectionStyle === 'straight' ? 'selected' : ''}>Straight</option>
        <option value="arc" ${flow.connectionStyle === 'arc' ? 'selected' : ''}>Curved</option>
        <option value="angular" ${flow.connectionStyle === 'angular' ? 'selected' : ''}>Elbow</option>
      </select></div>
      <div class="imageAttachmentStatus"><span>${flow.processingImageDataUrl ? 'Processing image attached. It will be shown in presentation mode.' : 'No processing image attached.'}</span><span>${flow.processingImageDataUrl ? '🖼' : '—'}</span></div>
      <div class="detailActions">
        <button data-action="upload-image" type="button">Upload / replace image</button>
        <button data-action="remove-image" type="button">Remove image</button>
        <button data-action="delete-flow" type="button" class="danger">Delete step</button>
      </div>
    </div>`;
  }

  function componentSelectHtml(field, selectedId){
    return `<select data-edit="${field}">${state.components.map(c => `<option value="${c.id}" ${c.id===selectedId ? 'selected' : ''}>${escapeHtml(c.name || 'Component')}</option>`).join('')}</select>`;
  }

  function renderProperties(){
    const comp = selectedComponent();
    const flow = selectedFlow();
    if(comp){
      els.propertiesPanel.innerHTML = `<div class="formRow wide"><label>Component name</label><input id="propName" type="text" value="${escapeHtml(comp.name)}"></div>
        <div class="formRow"><label>Shape</label><select id="propShape">
          ${SHAPES.map(s => `<option value="${s}" ${comp.shape===s?'selected':''}>${shapeLabel(s)}</option>`).join('')}
        </select></div>
        <div class="propGrid">
          <label class="small">Fill <input id="propFill" type="color" value="${comp.fillColor || '#ffffff'}"></label>
          <label class="small">Border <input id="propBorder" type="color" value="${comp.borderColor || '#334155'}"></label>
          <label class="small">Text <input id="propText" type="color" value="${comp.textColor || '#0f172a'}"></label>
        </div>
        <div class="detailActions"><button id="duplicatePropBtn">Duplicate</button></div>`;
      return;
    }
    if(flow){
      els.propertiesPanel.innerHTML = `<div class="formRow wide"><label>Message</label><input id="propMessage" type="text" value="${escapeHtml(flow.messageText || '')}"></div>
        <div class="formRow wide"><label>Processing action</label><textarea id="propAction" rows="3">${escapeHtml(flow.actionText || '')}</textarea></div>
        <div class="formRow"><label>Order</label><input id="propSequence" type="text" inputmode="decimal" value="${escapeHtml(flow.sequenceNumber || '')}" placeholder="e.g. 3"></div>
        <div class="formRow"><label>Timing</label><select id="propTiming">
          <option value="afterPrevious" ${flow.timing !== 'withPrevious' ? 'selected' : ''}>After previous</option>
          <option value="withPrevious" ${flow.timing === 'withPrevious' ? 'selected' : ''}>With previous</option>
        </select></div>
        <div class="formRow"><label>Connection</label><select id="propConnectionStyle">
          <option value="straight" ${flow.connectionStyle==='straight'?'selected':''}>Straight</option><option value="arc" ${flow.connectionStyle==='arc'?'selected':''}>Curved</option><option value="angular" ${flow.connectionStyle==='angular'?'selected':''}>Elbow</option>
        </select></div>
        <div class="formRow"><label>Source port</label>${portSelectHtml('propSourcePort', flow.sourcePortId || '', flow.sourceComponentId).replace('data-edit="propSourcePort"','id="propSourcePort"')}</div>
        <div class="formRow"><label>Target port</label>${portSelectHtml('propTargetPort', flow.targetPortId || '', flow.targetComponentId).replace('data-edit="propTargetPort"','id="propTargetPort"')}</div>
        <div class="propGrid"><label class="small">Line <input id="propLineColor" type="color" value="${flow.style?.color || '#475569'}"></label><label class="small">Text <input id="propLineText" type="color" value="${flow.style?.textColor || '#0f172a'}"></label></div>`;
      return;
    }
    els.propertiesPanel.innerHTML = `<div style="color:var(--muted);font-size:13px;line-height:1.45">Select a component or message flow to edit its properties. Double-click labels on the canvas to rename them directly.</div>`;
  }

  function shapeLabel(s){
    return ({
      package:'Package / visual group',
      roundedRectangle:'Rounded rectangle', rectangle:'Rectangle', ellipse:'Ellipse', diamond:'Diamond', hexagon:'Hexagon',
      triangle:'Triangle', pentagon:'Pentagon', trapezoid:'Trapezoid', parallelogram:'Parallelogram',
      cylinder:'Cylinder / database', queue:'Queue / stack', document:'Document', note:'Note', cloud:'Cloud', actor:'Actor / external system'
    }[s] || s);
  }

  function renderImagePanels(){
    const flows = activeFlows();
    const processing = state.ui.presentationMode && animation.running && animation.phase === 'processing' && flows.length;
    const images = processing ? flows.filter(f => f.processingImageDataUrl) : [];
    const label = processing
      ? `Step ${activeSequenceLabel()}: ${flows.length > 1 ? `${flows.length} simultaneous messages` : (flows[0].messageText || 'Message')}`
      : 'Processing image appears with the processing action';
    els.presentationStepLabel.textContent = label;
    els.presentationImagePreview.innerHTML = images.length
      ? images.map(f => `<div class="presentationImageItem"><img src="${f.processingImageDataUrl}" alt="Processing image for ${escapeHtml(f.messageText || 'message')}"><span>${escapeHtml(f.messageText || 'Message')}</span></div>`).join('')
      : 'No processing image shown for this phase';
  }

  function renderFlowEditorIfOpen(){
    if(!els.flowEditorModal?.classList.contains('open')) return;
    const editing = document.activeElement && els.flowEditorBody.contains(document.activeElement) && ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
    if(editing) return;
    const flow = selectedFlow();
    if(!flow) return closeFlowEditor();
    populateFlowEditor(flow);
  }

  function populateFlowEditor(flow){
    if(!flow) return;
    els.flowEditorTitle.textContent = `Edit step ${flow.sequenceNumber || ''}: ${flow.messageText || 'Message'}`;
    els.flowEditorBody.dataset.flowId = flow.id;
    els.flowEditorBody.innerHTML = flowEditorHtml(flow);
  }

  function openFlowEditor(flowId){
    const flow = findFlow(flowId);
    if(!flow) return;
    selectFlow(flowId);
    renderAll();
    flowEditorOriginal = JSON.parse(JSON.stringify(flow));
    populateFlowEditor(flow);
    els.flowEditorModal.classList.add('open');
    els.flowEditorModal.setAttribute('aria-hidden', 'false');
    const first = els.flowEditorBody.querySelector('[data-edit="messageText"]') || els.flowEditorBody.querySelector('input,select,textarea,button');
    if(first) first.focus({preventScroll:true});
  }

  function closeFlowEditor(mode='ok'){
    if(!els.flowEditorModal) return;
    const flowId = els.flowEditorBody?.dataset.flowId;
    const flow = flowId ? findFlow(flowId) : null;
    if(mode === 'cancel' && flow && flowEditorOriginal){
      Object.keys(flow).forEach(k => delete flow[k]);
      Object.assign(flow, JSON.parse(JSON.stringify(flowEditorOriginal)));
      saveLocal(true);
      renderAll();
    }else if(mode === 'ok' && flow && flowEditorOriginal){
      if(JSON.stringify(flow) !== JSON.stringify(flowEditorOriginal)) pushHistory('edit flow step');
      saveLocal(true);
      renderAll();
    }
    flowEditorOriginal = null;
    els.flowEditorModal.classList.remove('open');
    els.flowEditorModal.setAttribute('aria-hidden', 'true');
  }

  function onFlowEditorInput(e){
    const field = e.target.dataset.edit;
    if(!field) return;
    const flowId = els.flowEditorBody.dataset.flowId;
    const f = findFlow(flowId);
    if(!f) return;
    if(field === 'sequenceNumber') f[field] = e.target.value.trim();
    else if(field === 'timing') f.timing = e.target.value === 'withPrevious' ? 'withPrevious' : 'afterPrevious';
    else f[field] = e.target.value;
    if(field === 'sourceComponentId') f.sourcePortId = '';
    if(field === 'targetComponentId') f.targetPortId = '';
    state.ui.selectedFlowId = f.id;
    renderCanvas(); renderFlowPanel(); renderProperties(); renderImagePanels(); updateStatus(); saveLocal(true);
    if(field === 'sourceComponentId' || field === 'targetComponentId') populateFlowEditor(f);
  }

  function onFlowEditorClick(e){
    if(e.target === els.flowEditorModal || e.target.closest('[data-flow-editor-cancel]')) return closeFlowEditor('cancel');
    if(e.target.closest('[data-flow-editor-ok]')) return closeFlowEditor('ok');
    const action = e.target.closest('[data-action]')?.dataset.action;
    if(!action) return;
    const flowId = els.flowEditorBody.dataset.flowId;
    if(action === 'upload-image') return uploadImageForFlow(flowId);
    if(action === 'remove-image'){
      const f = findFlow(flowId);
      if(f){ f.processingImageDataUrl = ''; pushHistory('remove image'); renderAll(); populateFlowEditor(f); }
      return;
    }
    if(action === 'delete-flow'){
      state.messageFlows = state.messageFlows.filter(f => f.id !== flowId);
      flowEditorOriginal = null;
      closeFlowEditor('delete'); clearSelection(); pushHistory('delete flow'); renderAll();
    }
  }

  function updateStatus(){
    const mode = state.settings.activeCanvasMode === 'connect'
      ? (connectSourceId
        ? (connectChosenStyle
          ? `Connect: ${connectionStyleName(connectChosenStyle)} selected; choose target port or target component for ${componentName(connectSourceId)}`
          : `Connect: choose arrow shape for ${componentName(connectSourceId)}${connectSourcePortId ? ' / ' + portLabel(connectSourcePortId, findComponent(connectSourceId)) : ''}`)
        : 'Connect: click a source port or component')
      : state.settings.activeCanvasMode === 'pan' ? 'Pan mode' : 'Select mode';
    els.modeStatus.textContent = mode;
    const sc = state.ui.selectedComponentIds.length;
    els.selectionStatus.textContent = sc ? `${sc} component${sc>1?'s':''} selected` : state.ui.selectedFlowId ? '1 message flow selected' : 'No selection';
    els.animStatus.textContent = animation.running ? `Animation: step ${activeSequenceLabel() || animation.index + 1}, ${animation.phase}${activeFlows().length > 1 ? ' (' + activeFlows().length + ' simultaneous)' : ''}` : 'Animation stopped';
  }

  function isSelectedComponent(id){ return state.ui.selectedComponentIds.includes(id); }
  function classNames(...names){ return names.filter(Boolean).join(' '); }
  function svgEl(name, attrs){
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attrs || {}).forEach(([k,v]) => { if(v !== undefined && v !== null) el.setAttribute(k, String(v)); });
    return el;
  }

  function screenToWorld(evtOrPoint){
    const rect = els.svg.getBoundingClientRect();
    const clientX = evtOrPoint.clientX ?? evtOrPoint.x;
    const clientY = evtOrPoint.clientY ?? evtOrPoint.y;
    return {
      x: (clientX - rect.left - state.settings.panX) / state.settings.zoom,
      y: (clientY - rect.top - state.settings.panY) / state.settings.zoom
    };
  }

  function worldToScreen(point){
    const rect = els.svg.getBoundingClientRect();
    return {
      x: rect.left + state.settings.panX + point.x * state.settings.zoom,
      y: rect.top + state.settings.panY + point.y * state.settings.zoom
    };
  }

  function addComponent(x, y){
    const count = state.components.length + 1;
    const shape = state.settings.defaultShape || 'roundedRectangle';
    const isPackage = shape === 'package';
    const width = isPackage ? 320 : 170, height = isPackage ? 220 : 90;
    const c = {
      id: id('cmp'),
      name: isPackage ? `Package ${state.components.filter(c => c.shape === 'package').length + 1}` : `Component ${count}`,
      shape,
      x: snap(x - width/2), y: snap(y - height/2), width, height,
      fillColor: isPackage ? '#e0f2fe' : '#ffffff', borderColor: isPackage ? '#2563eb' : '#334155', textColor: isPackage ? '#1e3a8a' : '#0f172a', borderWidth: 2,
      zIndex: isPackage ? 0 : nextZ()
    };
    state.components.push(c);
    selectComponent(c.id, false);
    pushHistory('add component');
    renderAll();
    return c;
  }

  function nextZ(){ return Math.max(0, ...state.components.map(c => c.zIndex || 0)) + 1; }

  function addFlow(sourceId, targetId, sourcePortId=null, targetPortId=null, connectionStyle=null){
    if(!sourceId || !targetId) return;
    const f = {
      id: id('flow'),
      sourceComponentId: sourceId,
      targetComponentId: targetId,
      sourcePortId: sourcePortId || (sourceId === targetId ? makePortId('right', 0.25) : bestPortToward(findComponent(sourceId), findComponent(targetId))),
      targetPortId: targetPortId || (sourceId === targetId ? makePortId('right', 0.75) : bestPortToward(findComponent(targetId), findComponent(sourceId))),
      messageText: `Message ${state.messageFlows.length + 1}`,
      sequenceNumber: state.messageFlows.length + 1,
      timing: 'afterPrevious',
      hiddenInDrawingMode: false,
      actionText: '',
      processingImageDataUrl: '',
      notes: '',
      connectionStyle: connectionStyle || state.settings.defaultConnectionStyle || 'arc',
      controlPoint: null,
      style: { color:'#475569', thickness:2.2, textColor:'#0f172a' }
    };
    state.messageFlows.push(f);
    selectFlow(f.id);
    connectSourceId = null;
    connectSourcePortId = null;
    connectChosenStyle = null;
    connectPreviewPoint = null;
    hideConnectionChoiceOverlay();
    state.settings.activeCanvasMode = 'select';
    pushHistory('add flow');
    renderAll();
    showToast('Message flow created');
  }

  function selectComponent(componentId, additive){
    if(additive){
      if(isSelectedComponent(componentId)) state.ui.selectedComponentIds = state.ui.selectedComponentIds.filter(id => id !== componentId);
      else state.ui.selectedComponentIds.push(componentId);
    }else{
      state.ui.selectedComponentIds = [componentId];
    }
    state.ui.selectedFlowId = null;
  }

  function selectFlow(flowId){
    state.ui.selectedComponentIds = [];
    state.ui.selectedFlowId = flowId;
    state.ui.expandedFlowId = null;
  }

  function clearSelection(){
    state.ui.selectedComponentIds = [];
    state.ui.selectedFlowId = null;
  }

  function deleteSelection(){
    const ids = new Set(state.ui.selectedComponentIds);
    if(ids.size){
      state.components = state.components.filter(c => !ids.has(c.id));
      state.messageFlows = state.messageFlows.filter(f => !ids.has(f.sourceComponentId) && !ids.has(f.targetComponentId));
      clearSelection();
      pushHistory('delete components');
      renderAll();
      return;
    }
    if(state.ui.selectedFlowId){
      const idToDelete = state.ui.selectedFlowId;
      state.messageFlows = state.messageFlows.filter(f => f.id !== idToDelete);
      if(state.ui.expandedFlowId === idToDelete) state.ui.expandedFlowId = null;
      clearSelection();
      pushHistory('delete flow');
      renderAll();
    }
  }

  function duplicateSelection(){
    const selected = state.components.filter(c => state.ui.selectedComponentIds.includes(c.id));
    if(!selected.length) return showToast('Select one or more components to duplicate');
    const idMap = new Map();
    const copies = selected.map(c => {
      const copy = JSON.parse(JSON.stringify(c));
      copy.id = id('cmp');
      copy.name = `${c.name} copy`;
      copy.x += 28; copy.y += 28; copy.zIndex = nextZ() + idMap.size;
      idMap.set(c.id, copy.id);
      return copy;
    });
    const flowCopies = state.messageFlows.filter(f => idMap.has(f.sourceComponentId) && idMap.has(f.targetComponentId)).map(f => ({
      ...JSON.parse(JSON.stringify(f)), id:id('flow'), sourceComponentId:idMap.get(f.sourceComponentId), targetComponentId:idMap.get(f.targetComponentId), sequenceNumber:state.messageFlows.length + 1
    }));
    state.components.push(...copies);
    state.messageFlows.push(...flowCopies);
    state.ui.selectedComponentIds = copies.map(c => c.id);
    state.ui.selectedFlowId = null;
    pushHistory('duplicate');
    renderAll();
  }

  function copySelection(cut=false){
    const ids = new Set(state.ui.selectedComponentIds);
    if(!ids.size) return showToast('Select components to copy');
    clipboard = {
      components: state.components.filter(c => ids.has(c.id)).map(c => JSON.parse(JSON.stringify(c))),
      flows: state.messageFlows.filter(f => ids.has(f.sourceComponentId) && ids.has(f.targetComponentId)).map(f => JSON.parse(JSON.stringify(f)))
    };
    if(cut) deleteSelection();
    else showToast('Copied');
  }

  function pasteSelection(){
    if(!clipboard?.components?.length) return showToast('Clipboard is empty');
    const idMap = new Map();
    const offset = 36;
    const copies = clipboard.components.map(c => {
      const copy = JSON.parse(JSON.stringify(c));
      copy.id = id('cmp'); copy.x += offset; copy.y += offset; copy.zIndex = nextZ() + idMap.size;
      idMap.set(c.id, copy.id);
      return copy;
    });
    const flows = clipboard.flows.map(f => {
      const copy = JSON.parse(JSON.stringify(f));
      copy.id = id('flow'); copy.sourceComponentId = idMap.get(f.sourceComponentId); copy.targetComponentId = idMap.get(f.targetComponentId); copy.sequenceNumber = state.messageFlows.length + 1;
      return copy;
    }).filter(f => f.sourceComponentId && f.targetComponentId);
    state.components.push(...copies);
    state.messageFlows.push(...flows);
    state.ui.selectedComponentIds = copies.map(c => c.id);
    state.ui.selectedFlowId = null;
    pushHistory('paste');
    renderAll();
  }

  function normalizeSequences(){
    orderedFlows().forEach((f, i) => { f.sequenceNumber = i + 1; if(i === 0) f.timing = 'afterPrevious'; });
    pushHistory('normalize');
    renderAll();
  }

  function validateFlow(showSuccess=true){
    const errors = [];
    const names = new Set();
    state.components.forEach(c => {
      if(!stripUiText(c.name)) errors.push('A component has an empty name.');
    });
    state.messageFlows.forEach(f => {
      if(!findComponent(f.sourceComponentId)) errors.push(`Flow ${f.sequenceNumber || f.id} has a missing source component.`);
      if(!findComponent(f.targetComponentId)) errors.push(`Flow ${f.sequenceNumber || f.id} has a missing target component.`);
      if(!stripUiText(f.messageText)) errors.push(`Flow ${f.sequenceNumber || f.id} has no message text.`);
      if(!String(f.sequenceNumber ?? '').trim()) errors.push(`A flow has no sequence number.`);
      if(String(f.sequenceNumber ?? '').trim() && !parseSequence(f.sequenceNumber).valid) errors.push(`Sequence/order value ${f.sequenceNumber} is invalid. Use values like 3.`);
      if(f.timing !== 'afterPrevious' && f.timing !== 'withPrevious') errors.push(`Flow ${f.sequenceNumber || f.id} has an invalid timing option.`);
      if(names.has(String(f.sequenceNumber))) errors.push(`Sequence number ${f.sequenceNumber} is used more than once.`);
      names.add(String(f.sequenceNumber));
    });
    if(!state.messageFlows.length) errors.push('No message flows exist yet.');
    if(errors.length){
      showToast(errors[0]);
      alert('Validation issues:\n\n' + errors.map(e => `• ${e}`).join('\n'));
      return false;
    }
    if(showSuccess) showToast('Flow is valid');
    return true;
  }

  function activeGroup(){
    if(animation.index < 0) return null;
    return animationGroups()[animation.index] || null;
  }
  function activeFlows(){ return activeGroup()?.flows || []; }

  function activeAnimatedFlows(){
    // During transfer we also trust the cached path list. This makes the active
    // connection rendering robust even if the ordered flow list is re-rendered
    // while the animation frame is running.
    let flows = activeFlows();
    const cachedIds = (animation.pathCache?.paths || []).map(p => p.flowId);
    if(animation.running && cachedIds.length){
      const byId = new Map(flows.map(f => [f.id, f]));
      cachedIds.forEach(flowId => {
        const flow = findFlow(flowId);
        if(flow) byId.set(flow.id, flow);
      });
      flows = [...byId.values()];
    }
    return flows;
  }

  function activeFlow(){ return activeAnimatedFlows()[0] || null; }
  function activeFlowIds(){ return new Set(activeAnimatedFlows().map(f => f.id)); }
  function activeSequenceLabel(){ return activeGroup()?.label || activeFlow()?.sequenceNumber || ''; }
  function animationPathCacheFor(flowId){
    const paths = animation.pathCache?.paths || [];
    return paths.find(p => p.flowId === flowId) || null;
  }
  function animationSourceIds(){ return new Set(activeAnimatedFlows().map(f => f.sourceComponentId)); }
  function animationTargetIds(){ return new Set(activeAnimatedFlows().map(f => f.targetComponentId)); }
  function animationProcessingIds(){ return animation.phase === 'processing' ? new Set(activeAnimatedFlows().map(f => f.targetComponentId)) : new Set(); }
  function animationSourceId(){ return null; }
  function animationTargetId(){ return null; }
  function animationProcessingId(){ return null; }

  function startAnimation(){
    if(!validateFlow(false)) return;
    if(animation.autoTimer) clearTimeout(animation.autoTimer);
    animation.autoTimer = null;
    if(activeAnimationFrame) cancelAnimationFrame(activeAnimationFrame);
    activeAnimationFrame = null;
    clearSelection();
    animation.running = true;
    animation.paused = false;
    animation.index = 0;
    animation.phase = 'transfer';
    animation.completed = new Set();
    animation.token = {};
    animation.elapsedBeforePause = 0;
    beginTransfer();
    renderAll();
  }

  function stopAnimation(show=true){
    animation.running = false;
    animation.paused = false;
    animation.index = -1;
    animation.phase = 'stopped';
    animation.token = {};
    animation.pathCache = null;
    animation.elapsedBeforePause = 0;
    if(animation.autoTimer) clearTimeout(animation.autoTimer);
    animation.autoTimer = null;
    if(activeAnimationFrame) cancelAnimationFrame(activeAnimationFrame);
    activeAnimationFrame = null;
    removeMeasurePath();
    renderAll();
    if(show) showToast('Animation stopped');
  }

  function beginTransfer(){
    if(activeAnimationFrame) cancelAnimationFrame(activeAnimationFrame);
    removeMeasurePath();
    const flows = activeFlows();
    if(!flows.length) return completeAnimation();
    const all = orderedFlows();
    const paths = flows.map(flow => {
      const data = connectionPath(flow, all);
      const temp = svgEl('path', { d:data.d, fill:'none', stroke:'none', style:'opacity:0;pointer-events:none' });
      els.svg.appendChild(temp);
      const length = temp.getTotalLength ? temp.getTotalLength() : 1;
      temp.remove();
      return { flowId:flow.id, d:data.d, length, targetPoint:data.targetPoint };
    });
    animation.pathCache = { paths };
    animation.phase = 'transfer';
    animation.token = {};
    animation.startTime = performance.now();
    animation.elapsedBeforePause = 0;
    animateTransfer();
  }

  function animateTransfer(){
    const flows = activeFlows();
    const paths = animation.pathCache?.paths || [];
    if(!animation.running || animation.paused || !flows.length || !paths.length) return;
    removeMeasurePath();
    const measures = paths.map(path => {
      const temp = svgEl('path', { d:path.d, fill:'none', stroke:'none', style:'opacity:0;pointer-events:none' });
      els.svg.appendChild(temp);
      return { ...path, el:temp };
    });
    animation.measurePathEl = measures.map(m => m.el);
    const duration = MOVE_DURATIONS[state.settings.animationSpeed] || MOVE_DURATIONS.normal;
    const tick = (now) => {
      if(!animation.running || animation.paused){ removeMeasurePath(); return; }
      const elapsed = animation.elapsedBeforePause + (now - animation.startTime);
      const t = clamp(elapsed / duration, 0, 1);
      const tokens = {};
      measures.forEach(m => {
        const p = m.el.getPointAtLength(m.length * easeInOut(t));
        tokens[m.flowId] = { x:p.x, y:p.y };
      });
      animation.token = tokens;
      renderCanvas();
      if(t >= 1){
        removeMeasurePath();
        animation.phase = 'arrived';
        animation.token = Object.fromEntries(paths.map(path => [path.flowId, path.targetPoint]));
        renderAll();
        if(state.settings.animationMode === 'auto') scheduleAutoNext(650);
        return;
      }
      activeAnimationFrame = requestAnimationFrame(tick);
    };
    activeAnimationFrame = requestAnimationFrame(tick);
  }

  function easeInOut(t){ return t < .5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2; }

  function scheduleAutoNext(delay=700){
    if(animation.autoTimer) clearTimeout(animation.autoTimer);
    animation.autoTimer = null;
    if(state.settings.animationMode !== 'auto' || !animation.running) return;
    animation.autoTimer = setTimeout(() => {
      animation.autoTimer = null;
      if(state.settings.animationMode === 'auto' && animation.running) nextPhase();
    }, delay);
  }

  function nextPhase(){
    if(!animation.running) return startAnimation();
    const groups = animationGroups();
    const flows = activeFlows();
    if(!flows.length) return completeAnimation();
    if(animation.phase === 'transfer') return;
    if(animation.phase === 'arrived'){
      animation.phase = 'processing';
      animation.token = {};
      renderAll();
      if(state.settings.animationMode === 'auto') scheduleAutoNext(900);
      return;
    }
    if(animation.phase === 'processing'){
      flows.forEach(flow => animation.completed.add(flow.id));
      animation.index++;
      if(animation.index >= groups.length) return completeAnimation();
      beginTransfer();
      renderAll();
    }
    if(animation.phase === 'stopped') startAnimation();
  }

  function prevPhase(){
    if(!animation.running) return;
    if(animation.phase === 'processing'){
      animation.phase = 'arrived';
      animation.token = Object.fromEntries(activeFlows().map(flow => [flow.id, connectionPath(flow, orderedFlows()).targetPoint]));
    }else if(animation.phase === 'arrived'){
      animation.phase = 'transfer';
      beginTransfer();
      return;
    }else if(animation.phase === 'transfer' && animation.index > 0){
      const groups = animationGroups();
      animation.index--;
      (groups[animation.index]?.flows || []).forEach(flow => animation.completed.delete(flow.id));
      animation.phase = 'processing';
      animation.token = {};
    }
    renderAll();
  }

  function completeAnimation(){
    removeMeasurePath();
    const loopAuto = state.settings.animationMode === 'auto' && animation.running;
    animation.phase = 'completed';
    animation.token = {};
    if(loopAuto){
      animation.completed = new Set(orderedFlows().map(f => f.id));
      renderAll();
      if(animation.autoTimer) clearTimeout(animation.autoTimer);
      animation.autoTimer = setTimeout(() => {
        animation.autoTimer = null;
        if(state.settings.animationMode === 'auto' && animation.phase === 'completed') startAnimation();
      }, 900);
      return;
    }
    animation.running = false;
    animation.index = -1;
    renderAll();
    showToast('Animation completed');
  }

  function pauseResume(){
    if(!animation.running) return startAnimation();
    if(animation.paused){
      animation.paused = false;
      animation.startTime = performance.now();
      if(animation.phase === 'transfer') animateTransfer();
      showToast('Animation resumed');
    }else{
      animation.paused = true;
      animation.elapsedBeforePause += performance.now() - animation.startTime;
      if(activeAnimationFrame) cancelAnimationFrame(activeAnimationFrame);
      removeMeasurePath();
      showToast('Animation paused');
    }
    updateStatus();
  }

  function fitToScreen(){
    if(!state.components.length) return resetZoom();
    const bounds = diagramBounds();
    const rect = els.svg.getBoundingClientRect();
    const padding = 70;
    const zx = (rect.width - padding*2) / bounds.width;
    const zy = (rect.height - padding*2) / bounds.height;
    const z = clamp(Math.min(zx, zy), MIN_ZOOM, MAX_ZOOM);
    state.settings.zoom = z;
    state.settings.panX = rect.width/2 - (bounds.x + bounds.width/2) * z;
    state.settings.panY = rect.height/2 - (bounds.y + bounds.height/2) * z;
    saveLocal(true);
    renderAll();
  }

  function diagramBounds(){
    const boxes = state.components.map(c => ({ x:c.x, y:c.y, x2:c.x+c.width, y2:c.y+c.height }));
    if(!boxes.length) return {x:0,y:0,width:100,height:100};
    const x = Math.min(...boxes.map(b => b.x));
    const y = Math.min(...boxes.map(b => b.y));
    const x2 = Math.max(...boxes.map(b => b.x2));
    const y2 = Math.max(...boxes.map(b => b.y2));
    return { x, y, width:Math.max(1,x2-x), height:Math.max(1,y2-y) };
  }

  function setZoom(newZoom, centerClient){
    const old = state.settings.zoom;
    const z = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
    const rect = els.svg.getBoundingClientRect();
    const cx = centerClient?.x ?? rect.left + rect.width/2;
    const cy = centerClient?.y ?? rect.top + rect.height/2;
    const world = screenToWorld({x:cx, y:cy});
    state.settings.zoom = z;
    state.settings.panX = cx - rect.left - world.x * z;
    state.settings.panY = cy - rect.top - world.y * z;
    if(Math.abs(old-z) > .001) saveLocal(true);
    renderAll();
  }

  function resetZoom(){
    state.settings.zoom = 1;
    state.settings.panX = 80;
    state.settings.panY = 70;
    saveLocal(true);
    renderAll();
  }

  function diagramJsonString(){
    return JSON.stringify(snapshot(), null, 2);
  }

  function normalizedJsonFileName(name){
    let fileName = String(name || '').trim() || state.settings.diagramFileName || currentFileName || 'event-flow-designer.json';
    fileName = fileName.replace(/[\\/:*?"<>|]/g, '-');
    if(!fileName.toLowerCase().endsWith('.json')) fileName += '.json';
    return fileName;
  }

  function exportJson(){
    const data = diagramJsonString();
    downloadBlob(data, normalizedJsonFileName(currentFileName || state.settings.diagramFileName || 'event-flow-designer.json'), 'application/json');
  }

  async function loadDiagramFromText(text, sourceName='diagram'){
    try{
      const data = JSON.parse(text);
      validateImported(data, true);
      state = mergeDefaults(data);
      state.settings.diagramFileName = normalizedJsonFileName(sourceName || state.settings.diagramFileName);
      clearSelection();
      pushHistory('open/import');
      renderAll();
      showToast(`Loaded ${sourceName}`);
      return true;
    }catch(err){
      alert(`Import failed: ${err.message}`);
      return false;
    }
  }

  function importJson(file){
    const reader = new FileReader();
    reader.onload = async () => {
      const ok = await loadDiagramFromText(reader.result, file?.name || 'imported diagram');
      if(ok){
        currentFileName = file?.name || state.settings.diagramFileName || 'event-flow-designer.json';
        updateStatus();
      }
    };
    reader.readAsText(file);
  }

  function validateImported(data, strict){
    if(!data || typeof data !== 'object') throw new Error('JSON root must be an object.');
    if(!Array.isArray(data.components)) throw new Error('Missing components array.');
    if(!Array.isArray(data.messageFlows)) throw new Error('Missing messageFlows array.');
    if(strict){
      const ids = new Set(data.components.map(c => c.id));
      data.components.forEach(c => {
        if(!c.id || typeof c.x !== 'number' || typeof c.y !== 'number') throw new Error('Invalid component structure.');
      });
      data.messageFlows.forEach(f => {
        if(!f.id || !ids.has(f.sourceComponentId) || !ids.has(f.targetComponentId)) throw new Error('A message flow references a missing component.');
      });
    }
    return true;
  }

  function exportSvg(){
    const clone = els.svg.cloneNode(true);
    clone.querySelectorAll('.resizeHandle,.selectionBox').forEach(n => n.remove());
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', els.svg.clientWidth);
    clone.setAttribute('height', els.svg.clientHeight);
    const css = document.querySelector('style').textContent;
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
    downloadBlob(new XMLSerializer().serializeToString(clone), 'event-flow-designer.svg', 'image/svg+xml');
  }

  function exportPng(){
    const clone = els.svg.cloneNode(true);
    clone.querySelectorAll('.resizeHandle,.selectionBox').forEach(n => n.remove());
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const css = document.querySelector('style').textContent;
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
    const svgText = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgText], {type:'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = els.svg.clientWidth * 2;
      canvas.height = els.svg.clientHeight * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.scale(2,2);
      ctx.drawImage(img,0,0);
      URL.revokeObjectURL(url);
      canvas.toBlob(png => downloadBlob(png, 'event-flow-designer.png', 'image/png'));
    };
    img.onerror = () => showToast('PNG export failed');
    img.src = url;
  }

  function downloadBlob(content, filename, type){
    const blob = content instanceof Blob ? content : new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showToast(message){
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('show');
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  function connectionStyleName(style){
    return ({ straight:'Straight arrow', arc:'Curved arrow', angular:'Elbow arrow' }[style] || 'Arrow');
  }

  function resetConnectionDraft(keepConnectMode=false){
    connectSourceId = null;
    connectSourcePortId = null;
    connectChosenStyle = null;
    connectPreviewPoint = null;
    hideConnectionChoiceOverlay();
    if(!keepConnectMode) state.settings.activeCanvasMode = 'select';
  }

  function ensureConnectionChoiceOverlay(){
    if(connectionChoiceOverlay) return connectionChoiceOverlay;
    connectionChoiceOverlay = document.createElement('div');
    connectionChoiceOverlay.className = 'connectionChoiceOverlay';
    connectionChoiceOverlay.setAttribute('role', 'dialog');
    connectionChoiceOverlay.setAttribute('aria-label', 'Choose arrow shape');
    connectionChoiceOverlay.addEventListener('pointerdown', e => e.stopPropagation());
    connectionChoiceOverlay.addEventListener('click', onConnectionChoiceClick);
    els.canvasWrap.appendChild(connectionChoiceOverlay);
    return connectionChoiceOverlay;
  }

  function showConnectionChoiceOverlay(){
    const source = findComponent(connectSourceId);
    if(!source) return hideConnectionChoiceOverlay();
    const selected = connectChosenStyle || '';
    const overlay = ensureConnectionChoiceOverlay();
    overlay.innerHTML = `
      <div class="connectionChoiceTitle">Choose arrow shape</div>
      <div class="connectionChoiceHint">Source: ${escapeHtml(source.name || 'Component')} ${connectSourcePortId ? '· ' + escapeHtml(portLabel(connectSourcePortId, source)) : ''}</div>
      <div class="connectionChoiceButtons">
        <button type="button" data-connection-choice="straight" class="${selected === 'straight' ? 'active' : ''}" title="Straight arrow"><span class="arrowIcon">→</span><span>Straight</span></button>
        <button type="button" data-connection-choice="arc" class="${selected === 'arc' ? 'active' : ''}" title="Curved arrow"><span class="arrowIcon">⤴</span><span>Curved</span></button>
        <button type="button" data-connection-choice="angular" class="${selected === 'angular' ? 'active' : ''}" title="Elbow arrow"><span class="arrowIcon">┐</span><span>Elbow</span></button>
      </div>
      <div class="connectionChoiceHint">After choosing, click a target port or target component.</div>
      <div class="connectionChoiceActions"><button type="button" data-connection-cancel="true">Cancel</button></div>`;
    overlay.classList.add('open');
    updateConnectionChoiceOverlayPosition();
  }

  function hideConnectionChoiceOverlay(){
    if(connectionChoiceOverlay) connectionChoiceOverlay.classList.remove('open');
  }

  function updateConnectionChoiceOverlayPosition(){
    if(!connectionChoiceOverlay || !connectionChoiceOverlay.classList.contains('open')) return;
    const source = findComponent(connectSourceId);
    if(!source) return hideConnectionChoiceOverlay();
    const anchor = connectSourcePortId ? portPosition(source, connectSourcePortId) : center(source);
    const screen = worldToScreen(anchor);
    const wrap = els.canvasWrap.getBoundingClientRect();
    const width = connectionChoiceOverlay.offsetWidth || 250;
    const height = connectionChoiceOverlay.offsetHeight || 140;
    const left = clamp(screen.x - wrap.left + 14, 8, Math.max(8, wrap.width - width - 8));
    const top = clamp(screen.y - wrap.top - 26, 8, Math.max(8, wrap.height - height - 8));
    connectionChoiceOverlay.style.left = `${left}px`;
    connectionChoiceOverlay.style.top = `${top}px`;
  }

  function onConnectionChoiceClick(e){
    const cancel = e.target.closest('[data-connection-cancel]');
    if(cancel){
      resetConnectionDraft(true);
      showToast('Connection cancelled');
      renderAll();
      return;
    }
    const btn = e.target.closest('[data-connection-choice]');
    if(!btn) return;
    connectChosenStyle = btn.dataset.connectionChoice;
    const source = findComponent(connectSourceId);
    connectPreviewPoint = source ? defaultConnectionPreviewPoint(source, connectSourcePortId) : screenToWorld(e);
    hideConnectionChoiceOverlay();
    showToast(`${connectionStyleName(connectChosenStyle)} selected. Now click a target port or target component.`);
    updateStatus();
    renderCanvas();
  }

  function openInlineEditor(value, worldBox, onCommit, multiline=true){
    closeInlineEditor(false);
    const p = worldToScreen({x:worldBox.x, y:worldBox.y});
    inlineEditor = document.createElement(multiline ? 'textarea' : 'input');
    inlineEditor.className = 'inlineEditor';
    inlineEditor.value = value || '';
    inlineEditor.style.left = `${p.x}px`;
    inlineEditor.style.top = `${p.y}px`;
    inlineEditor.style.width = `${Math.max(120, worldBox.width * state.settings.zoom)}px`;
    inlineEditor.style.height = `${Math.max(34, worldBox.height * state.settings.zoom)}px`;
    document.body.appendChild(inlineEditor);
    inlineEditor.focus();
    inlineEditor.select();
    const commit = () => closeInlineEditor(true);
    inlineEditor.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if(e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)){ e.preventDefault(); commit(); }
      if(e.key === 'Escape'){ e.preventDefault(); closeInlineEditor(false); }
    });
    inlineEditor.addEventListener('blur', commit);
    inlineEditor._commit = onCommit;
  }

  function closeInlineEditor(commit){
    if(!inlineEditor) return;
    const editor = inlineEditor;
    inlineEditor = null;
    if(commit && editor._commit) editor._commit(editor.value);
    editor.remove();
  }

  function wrapText(text, maxChars){
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for(const word of words){
      if((line + ' ' + word).trim().length > maxChars && line){ lines.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    }
    if(line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function loadExample(){
    if(state.components.length || state.messageFlows.length){
      if(!confirm('Replace current diagram with the example?')) return;
    }
    state = defaultState();
    currentFileName = state.settings.diagramFileName || 'event-flow-designer.json';
    const comps = [
      {
        id:id('cmp'), name:'Web UI', shape:'roundedRectangle', x:84, y:196, width:150, height:84,
        fillColor:'#dbeafe', borderColor:'#2563eb', textColor:'#0f172a', borderWidth:2, zIndex:10
      },
      {
        id:id('cmp'), name:'Order Service', shape:'roundedRectangle', x:380, y:104, width:188, height:88,
        fillColor:'#ecfeff', borderColor:'#0891b2', textColor:'#0f172a', borderWidth:2, zIndex:12
      },
      {
        id:id('cmp'), name:'Inventory Service', shape:'roundedRectangle', x:830, y:88, width:192, height:88,
        fillColor:'#dcfce7', borderColor:'#16a34a', textColor:'#0f172a', borderWidth:2, zIndex:13
      },
      {
        id:id('cmp'), name:'Payment Service', shape:'roundedRectangle', x:830, y:256, width:192, height:88,
        fillColor:'#ffedd5', borderColor:'#ea580c', textColor:'#0f172a', borderWidth:2, zIndex:14
      },
      {
        id:id('cmp'), name:'Notification Service', shape:'roundedRectangle', x:380, y:284, width:186, height:88,
        fillColor:'#f3e8ff', borderColor:'#9333ea', textColor:'#0f172a', borderWidth:2, zIndex:15
      }
    ];
    state.components = comps;
    const byName = Object.fromEntries(comps.map(c => [c.name, c.id]));

    const defs = [
      {
        source:'Web UI', target:'Order Service', message:'Submit Order', action:'Validate order and create a new order',
        color:'#2563eb', sourcePortId:makePortId('right', 0.5), targetPortId:makePortId('left', 0.5),
        controlPoint:{ x:286, y:212 }
      },
      {
        source:'Order Service', target:'Inventory Service', message:'Reserve Stock', action:'Check availability and reserve items',
        color:'#16a34a', sourcePortId:makePortId('right', 0.34), targetPortId:makePortId('left', 0.34),
        controlPoint:{ x:692, y:96 }
      },
      {
        source:'Inventory Service', target:'Order Service', message:'Stock Reserved', action:'Update the order with the reservation result',
        color:'#0f766e', sourcePortId:makePortId('left', 0.72), targetPortId:makePortId('right', 0.7),
        controlPoint:{ x:700, y:220 }
      },
      {
        source:'Order Service', target:'Payment Service', message:'Payment Request', action:'Authorize the payment',
        color:'#d97706', sourcePortId:makePortId('right', 0.84), targetPortId:makePortId('left', 0.28),
        controlPoint:{ x:706, y:232 }
      },
      {
        source:'Payment Service', target:'Order Service', message:'Payment Authorized', action:'Mark the order as paid',
        color:'#b45309', sourcePortId:makePortId('left', 0.7), targetPortId:makePortId('right', 0.96),
        controlPoint:{ x:700, y:360 }
      },
      {
        source:'Order Service', target:'Notification Service', message:'Send Confirmation', action:'Create and dispatch the customer confirmation',
        color:'#9333ea', sourcePortId:makePortId('bottom', 0.42), targetPortId:makePortId('top', 0.56),
        controlPoint:{ x:480, y:246 }
      },
      {
        source:'Notification Service', target:'Web UI', message:'Confirmation Ready', action:'Show the order confirmation to the customer',
        color:'#7c3aed', sourcePortId:makePortId('left', 0.48), targetPortId:makePortId('bottom', 0.68),
        controlPoint:{ x:236, y:402 }
      }
    ];

    state.messageFlows = defs.map((d, i) => ({
      id:id('flow'),
      sourceComponentId:byName[d.source],
      targetComponentId:byName[d.target],
      messageText:d.message,
      sequenceNumber:i+1,
      actionText:d.action,
      processingImageDataUrl:'',
      notes:'',
      connectionStyle:'arc',
      style:{ color:d.color, thickness:2.8, textColor:'#0f172a' },
      sourcePortId:d.sourcePortId,
      targetPortId:d.targetPortId,
      timing:'afterPrevious',
      controlPoint:d.controlPoint,
      visibleInEditor:true
    }));

    fitInitialExample();
    pushHistory('example');
    renderAll();
  }

  function fitInitialExample(){
    state.settings.zoom = .82;
    state.settings.panX = 28;
    state.settings.panY = 34;
  }

  function align(direction){
    const selected = state.components.filter(c => state.ui.selectedComponentIds.includes(c.id));
    if(selected.length < 2) return showToast('Select multiple components');
    if(direction === 'horizontal'){
      const centerY = selected.reduce((sum, c) => sum + c.y + c.height / 2, 0) / selected.length;
      selected.forEach(c => c.y = Math.round(centerY - c.height / 2));
    }else if(direction === 'vertical'){
      const centerX = selected.reduce((sum, c) => sum + c.x + c.width / 2, 0) / selected.length;
      selected.forEach(c => c.x = Math.round(centerX - c.width / 2));
    }
    pushHistory('align'); renderAll();
  }

  function distributeH(){
    const selected = state.components.filter(c => state.ui.selectedComponentIds.includes(c.id)).sort((a,b)=>a.x-b.x);
    if(selected.length < 3) return showToast('Select at least three components');
    const firstCenter = selected[0].x + selected[0].width / 2;
    const lastCenter = selected[selected.length-1].x + selected[selected.length-1].width / 2;
    const step = (lastCenter - firstCenter) / (selected.length - 1);
    selected.forEach((c, i) => c.x = Math.round(firstCenter + step*i - c.width / 2));
    pushHistory('distribute'); renderAll();
  }

  function distributeV(){
    const selected = state.components.filter(c => state.ui.selectedComponentIds.includes(c.id)).sort((a,b)=>a.y-b.y);
    if(selected.length < 3) return showToast('Select at least three components');
    const firstCenter = selected[0].y + selected[0].height / 2;
    const lastCenter = selected[selected.length-1].y + selected[selected.length-1].height / 2;
    const step = (lastCenter - firstCenter) / (selected.length - 1);
    selected.forEach((c, i) => c.y = Math.round(firstCenter + step*i - c.height / 2));
    pushHistory('distribute'); renderAll();
  }

  function bringToFront(){
    state.ui.selectedComponentIds.forEach(cid => { const c = findComponent(cid); if(c) c.zIndex = nextZ(); });
    pushHistory('front'); renderAll();
  }

  function sendToBack(){
    state.ui.selectedComponentIds.forEach(cid => { const c = findComponent(cid); if(c) c.zIndex = 0; });
    state.components.sort((a,b)=>(a.zIndex||0)-(b.zIndex||0)).forEach((c,i)=>c.zIndex=i+1);
    pushHistory('back'); renderAll();
  }

  function uploadImageForFlow(flowId){
    const flow = findFlow(flowId);
    if(!flow) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if(!file) return;
      if(!/^image\/(png|jpeg|jpg|gif|svg\+xml|webp)$/.test(file.type)) return showToast('Unsupported image format');
      const reader = new FileReader();
      reader.onload = () => {
        flow.processingImageDataUrl = reader.result;
        pushHistory('upload image');
        renderAll();
        if(els.flowEditorModal?.classList.contains('open') && state.ui.selectedFlowId === flow.id) populateFlowEditor(flow);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function startConnectionFromSource(componentId, portId){
    const component = findComponent(componentId);
    if(!component || state.ui.presentationMode) return false;
    connectSourceId = componentId;
    connectSourcePortId = portId || nearestPortId(component, center(component));
    connectChosenStyle = null;
    connectPreviewPoint = null;
    state.settings.activeCanvasMode = 'select';
    state.ui.selectedComponentIds = [componentId];
    state.ui.selectedFlowId = null;
    renderAll();
    showConnectionChoiceOverlay();
    showToast('Choose an arrow shape, then click a target port or target component.');
    return true;
  }

  function handleConnectionPortClick(port){
    if(!port || state.ui.presentationMode) return false;
    const cid = port.componentId;
    const component = findComponent(cid);
    if(!component) return false;

    if(!connectSourceId || !connectChosenStyle){
      return startConnectionFromSource(cid, port.portId);
    }

    addFlow(connectSourceId, cid, connectSourcePortId, port.portId, connectChosenStyle);
    return true;
  }

  function onSvgPointerDown(e){
    closeContextMenu();
    if(e.button !== 0 && e.button !== 1) return;
    const target = e.target;
    const world = screenToWorld(e);

    if(state.settings.activeCanvasMode === 'pan' || e.button === 1 || (e.spaceKeyTempPan === true)){
      drag = { type:'pan', startX:e.clientX, startY:e.clientY, panX:state.settings.panX, panY:state.settings.panY };
      els.svg.setPointerCapture(e.pointerId);
      renderAll();
      return;
    }

    const bendHandle = target.closest?.('.flowBendHandle');
    if(bendHandle){
      const flow = findFlow(bendHandle.dataset.flowId);
      if(flow){
        selectFlow(flow.id);
        drag = {
          type:'bend',
          flowId:flow.id,
          startWorld:world,
          originalControlPoint: flow.controlPoint ? {...flow.controlPoint} : null,
          moved:false
        };
        els.svg.setPointerCapture(e.pointerId);
        renderAll();
        e.stopPropagation();
        return;
      }
    }

    const endpointHandle = target.closest?.('.flowEndpointHandle');
    if(endpointHandle){
      const flow = findFlow(endpointHandle.dataset.flowId);
      if(flow){
        selectFlow(flow.id);
        drag = {
          type:'endpoint',
          flowId:flow.id,
          end:endpointHandle.dataset.end === 'source' ? 'source' : 'target',
          currentWorld:world
        };
        els.svg.setPointerCapture(e.pointerId);
        renderAll();
        e.stopPropagation();
        return;
      }
    }

    const clickedPort = portFromTarget(target);
    if(clickedPort && handleConnectionPortClick(clickedPort)){
      e.stopPropagation();
      return;
    }

    const connectionComponentId = componentIdFromTarget(target);
    if(connectionComponentId && connectSourceId && connectChosenStyle){
      const component = findComponent(connectionComponentId);
      const targetPortId = component ? centeredPortIdFromPoint(component, world) : null;
      addFlow(connectSourceId, connectionComponentId, connectSourcePortId, targetPortId, connectChosenStyle);
      e.stopPropagation();
      return;
    }

    if(state.settings.activeCanvasMode === 'connect'){
      const cid = connectionComponentId;
      if(cid){
        const component = findComponent(cid);
        const clickedPortId = component ? centeredPortIdFromPoint(component, world) : null;
        if(!connectSourceId || !connectChosenStyle){
          startConnectionFromSource(cid, clickedPortId);
        }else{
          addFlow(connectSourceId, cid, connectSourcePortId, clickedPortId, connectChosenStyle);
        }
      }
      return;
    }

    if(target.classList.contains('resizeHandle')){
      const c = findComponent(target.dataset.id);
      drag = { type:'resize', id:c.id, handle:target.dataset.handle, startWorld:world, original:JSON.parse(JSON.stringify(c)) };
      els.svg.setPointerCapture(e.pointerId);
      e.stopPropagation();
      return;
    }

    const fid = flowIdFromTarget(target);
    if(fid){
      selectFlow(fid);
      drag = null;
      renderAll();
      return;
    }

    const cid = componentIdFromTarget(target);
    if(cid){
      if(!isSelectedComponent(cid)) selectComponent(cid, e.shiftKey || e.ctrlKey || e.metaKey);
      else if(e.shiftKey || e.ctrlKey || e.metaKey) selectComponent(cid, true);
      const clickedComponent = findComponent(cid);
      const selectedOriginals = expandMoveOriginalsForPackages(state.components.filter(c => state.ui.selectedComponentIds.includes(c.id)).map(c => JSON.parse(JSON.stringify(c))));
      drag = {
        type:'move',
        startWorld:world,
        originals:selectedOriginals,
        flowControlOriginals:flowControlOriginalsForComponentMove(selectedOriginals),
        clickCandidate:!(e.shiftKey || e.ctrlKey || e.metaKey),
        moved:false,
        startClientX:e.clientX,
        startClientY:e.clientY,
        clickComponentId:cid,
        clickPortId:clickedComponent ? centeredPortIdFromPoint(clickedComponent, world) : null
      };
      els.svg.setPointerCapture(e.pointerId);
      renderAll();
      return;
    }

    if(connectionChoiceOverlay && connectionChoiceOverlay.classList.contains('open')){
      resetConnectionDraft();
    }
    clearSelection();
    drag = { type:'selectBox', startWorld:world, currentWorld:world };
    els.svg.setPointerCapture(e.pointerId);
    renderAll();
  }

  function onSvgPointerMove(e){
    const world = screenToWorld(e);
    if(!drag){
      if(connectSourceId && connectChosenStyle){
        connectPreviewPoint = world;
        renderCanvas();
        updateStatus();
      }
      return;
    }
    if(drag.type === 'pan'){
      state.settings.panX = drag.panX + (e.clientX - drag.startX);
      state.settings.panY = drag.panY + (e.clientY - drag.startY);
      renderAll();
      return;
    }
    if(drag.type === 'endpoint'){
      drag.currentWorld = world;
      renderCanvas();
      updateStatus();
      return;
    }
    if(drag.type === 'bend'){
      const flow = findFlow(drag.flowId);
      if(flow){
        flow.controlPoint = { x:world.x, y:world.y };
        if(Math.hypot(world.x - drag.startWorld.x, world.y - drag.startWorld.y) > 1) drag.moved = true;
      }
      renderCanvas();
      updateStatus();
      return;
    }
    if(drag.type === 'move'){
      const dx = world.x - drag.startWorld.x, dy = world.y - drag.startWorld.y;
      if(Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY) > 4) drag.moved = true;
      drag.originals.forEach(orig => {
        const c = findComponent(orig.id);
        if(c){ c.x = snap(orig.x + dx); c.y = snap(orig.y + dy); }
      });
      (drag.flowControlOriginals || []).forEach(orig => {
        const flow = findFlow(orig.id);
        if(flow && orig.controlPoint){
          flow.controlPoint = { x: orig.controlPoint.x + dx, y: orig.controlPoint.y + dy };
        }
      });
      renderCanvas(); updateStatus();
      return;
    }
    if(drag.type === 'resize'){
      const c = findComponent(drag.id), o = drag.original;
      if(!c) return;
      const dx = world.x - drag.startWorld.x, dy = world.y - drag.startWorld.y;
      let x=o.x, y=o.y, w=o.width, h=o.height;
      if(drag.handle.includes('e')) w = o.width + dx;
      if(drag.handle.includes('s')) h = o.height + dy;
      if(drag.handle.includes('w')) { x = o.x + dx; w = o.width - dx; }
      if(drag.handle.includes('n')) { y = o.y + dy; h = o.height - dy; }
      c.x = snap(x); c.y = snap(y); c.width = Math.max(60, snap(w)); c.height = Math.max(44, snap(h));
      renderCanvas();
      return;
    }
    if(drag.type === 'selectBox'){
      drag.currentWorld = world;
      renderCanvas();
    }
  }

  function onSvgPointerUp(e){
    if(!drag) return;
    const finishedDrag = drag;

    if(finishedDrag.type === 'move'){
      const openConnectionOverlay = finishedDrag.clickCandidate && !finishedDrag.moved && finishedDrag.clickComponentId && !state.ui.presentationMode;
      drag = null;
      try{ els.svg.releasePointerCapture(e.pointerId); }catch{}
      if(openConnectionOverlay){
        startConnectionFromSource(finishedDrag.clickComponentId, finishedDrag.clickPortId);
        return;
      }
      if(finishedDrag.moved) pushHistory('move');
      renderAll();
      return;
    }

    if(finishedDrag.type === 'endpoint'){
      const changed = reconnectFlowEndpointFromPointer(finishedDrag, e);
      drag = null;
      try{ els.svg.releasePointerCapture(e.pointerId); }catch{}
      if(changed) pushHistory('reconnect endpoint');
      renderAll();
      return;
    }

    if(finishedDrag.type === 'bend'){
      drag = null;
      try{ els.svg.releasePointerCapture(e.pointerId); }catch{}
      if(finishedDrag.moved) pushHistory('adjust connection bend');
      renderAll();
      return;
    }

    if(finishedDrag.type === 'resize'){
      pushHistory('resize');
    }else if(finishedDrag.type === 'pan'){
      saveLocal(true);
    }else if(finishedDrag.type === 'selectBox'){
      selectByBox(finishedDrag.startWorld, finishedDrag.currentWorld);
      pushHistory('select');
    }
    drag = null;
    try{ els.svg.releasePointerCapture(e.pointerId); }catch{}
    renderAll();
  }

  function reconnectFlowEndpointFromPointer(endpointDrag, pointerEvent){
    const flow = findFlow(endpointDrag.flowId);
    if(!flow) return false;
    const drop = resolveComponentPortFromPointer(pointerEvent);
    if(!drop || !findComponent(drop.componentId)){
      showToast('Drop on a component or connection point to reconnect.');
      return false;
    }
    if(endpointDrag.end === 'source'){
      const changed = flow.sourceComponentId !== drop.componentId || flow.sourcePortId !== drop.portId;
      flow.sourceComponentId = drop.componentId;
      flow.sourcePortId = drop.portId;
      return changed;
    }
    const changed = flow.targetComponentId !== drop.componentId || flow.targetPortId !== drop.portId;
    flow.targetComponentId = drop.componentId;
    flow.targetPortId = drop.portId;
    return changed;
  }

  function resolveComponentPortFromPointer(pointerEvent){
    const el = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY) || pointerEvent.target;
    const explicitPort = portFromTarget(el);
    if(explicitPort) return explicitPort;
    const componentId = componentIdFromTarget(el);
    if(!componentId) return null;
    const component = findComponent(componentId);
    if(!component) return null;
    const world = screenToWorld(pointerEvent);
    return { componentId, portId:centeredPortIdFromPoint(component, world) };
  }

  function selectByBox(a,b){
    const box = { x:Math.min(a.x,b.x), y:Math.min(a.y,b.y), x2:Math.max(a.x,b.x), y2:Math.max(a.y,b.y) };
    state.ui.selectedComponentIds = state.components.filter(c => c.x < box.x2 && c.x+c.width > box.x && c.y < box.y2 && c.y+c.height > box.y).map(c => c.id);
    state.ui.selectedFlowId = null;
  }

  function portFromTarget(target){
    const portEl = target.closest?.('.componentPort');
    if(!portEl) return null;
    return { componentId: portEl.dataset.id, portId: portEl.dataset.port };
  }

  function componentIdFromTarget(target){
    return target.closest?.('.componentGroup')?.dataset.id || target.dataset?.id && findComponent(target.dataset.id)?.id;
  }
  function flowIdFromTarget(target){
    return target.closest?.('.flowPath,.flowLabel')?.dataset.id || target.dataset?.id && findFlow(target.dataset.id)?.id;
  }

  function onSvgDblClick(e){
    const cid = componentIdFromTarget(e.target);
    if(cid){
      const c = findComponent(cid);
      selectComponent(cid,false);
      openInlineEditor(c.name, { x:c.x+10, y:c.y+c.height/2-18, width:c.width-20, height:38 }, (value) => {
        c.name = value.trim() || c.name;
        pushHistory('rename component'); renderAll();
      });
      renderAll();
      return;
    }
    const fid = flowIdFromTarget(e.target);
    if(fid){
      const f = findFlow(fid);
      const p = connectionPath(f, orderedFlows());
      selectFlow(fid);
      openInlineEditor(f.messageText, { x:p.labelX-90, y:p.labelY-19, width:180, height:34 }, (value) => {
        f.messageText = value.trim() || f.messageText;
        pushHistory('rename message'); renderAll();
      }, false);
      renderAll();
    }
  }

  function onWheel(e){
    if(e.ctrlKey || e.metaKey){
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.925;
      setZoom(state.settings.zoom * factor, {x:e.clientX, y:e.clientY});
    }
  }

  let spaceDown = false;
  function onKeyDown(e){
    if(e.key === 'Escape' && els.flowEditorModal?.classList.contains('open')){ e.preventDefault(); closeFlowEditor(); return; }
    if(isTextEditing()) return;
    const mod = e.ctrlKey || e.metaKey;
    if(e.code === 'Space' && !spaceDown){
      spaceDown = true;
      if(state.ui.presentationMode){ e.preventDefault(); pauseResume(); }
      else { e.preventDefault(); state.settings._previousMode = state.settings.activeCanvasMode; state.settings.activeCanvasMode = 'pan'; renderAll(); }
      return;
    }
    if(mod && e.key.toLowerCase() === 'z' && !e.shiftKey){ e.preventDefault(); undo(); }
    else if((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')){ e.preventDefault(); redo(); }
    else if(mod && e.key.toLowerCase() === 'c'){ e.preventDefault(); copySelection(false); }
    else if(mod && e.key.toLowerCase() === 'x'){ e.preventDefault(); copySelection(true); }
    else if(mod && e.key.toLowerCase() === 'v'){ e.preventDefault(); pasteSelection(); }
    else if(mod && e.key.toLowerCase() === 'a'){ e.preventDefault(); state.ui.selectedComponentIds = state.components.map(c => c.id); state.ui.selectedFlowId = null; renderAll(); }
    else if(mod && e.key.toLowerCase() === 's'){ e.preventDefault(); saveLocal(false); }
    else if(mod && (e.key === '+' || e.key === '=')){ e.preventDefault(); setZoom(state.settings.zoom * 1.12); }
    else if(mod && e.key === '-'){ e.preventDefault(); setZoom(state.settings.zoom / 1.12); }
    else if(mod && e.key === '0'){ e.preventDefault(); resetZoom(); }
    else if(e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); deleteSelection(); }
    else if(e.key === 'Escape'){
      e.preventDefault();
      if(state.ui.presentationMode) togglePresentation(false);
      else { resetConnectionDraft(false); clearSelection(); renderAll(); }
    }
    else if(e.key === 'ArrowRight'){ e.preventDefault(); nextPhase(); }
    else if(e.key === 'ArrowLeft'){ e.preventDefault(); prevPhase(); }
  }

  function onKeyUp(e){
    if(e.code === 'Space' && spaceDown){
      spaceDown = false;
      if(!state.ui.presentationMode && state.settings._previousMode){
        state.settings.activeCanvasMode = state.settings._previousMode;
        delete state.settings._previousMode;
        renderAll();
      }
    }
  }

  function isTextEditing(){
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable;
  }

  function onContextMenu(e){
    const cid = componentIdFromTarget(e.target);
    const fid = flowIdFromTarget(e.target);
    if(!cid && !fid) return;
    e.preventDefault();
    if(cid && !isSelectedComponent(cid)) selectComponent(cid, false);
    if(fid) selectFlow(fid);
    els.contextMenu.style.display = 'block';
    els.contextMenu.style.left = `${e.clientX}px`;
    els.contextMenu.style.top = `${e.clientY}px`;
    renderAll();
  }

  function closeContextMenu(){ els.contextMenu.style.display = 'none'; }

  function togglePresentation(force){
    state.ui.presentationMode = typeof force === 'boolean' ? force : !state.ui.presentationMode;
    if(state.ui.presentationMode){
      state.settings.showGridBeforePresentation = state.settings.showGrid;
      resetConnectionDraft(false);
      clearSelection();
      fitToScreen();
    }else{
      state.settings.showGrid = state.settings.showGridBeforePresentation ?? state.settings.showGrid;
      renderAll();
    }
    saveLocal(true);
    renderAll();
  }

  function setupEvents(){
    $('addComponentBtn').addEventListener('click', () => {
      const rect = els.svg.getBoundingClientRect();
      const w = screenToWorld({x:rect.left + rect.width/2, y:rect.top + rect.height/2});
      addComponent(w.x, w.y);
    });
    $('connectBtn').addEventListener('click', () => { resetConnectionDraft(true); state.settings.activeCanvasMode = 'connect'; renderAll(); });
    $('selectModeBtn').addEventListener('click', () => { resetConnectionDraft(false); renderAll(); });
    $('panModeBtn').addEventListener('click', () => { resetConnectionDraft(true); state.settings.activeCanvasMode = 'pan'; renderAll(); });
    $('undoBtn').addEventListener('click', undo);
    $('redoBtn').addEventListener('click', redo);
    $('copyBtn').addEventListener('click', () => copySelection(false));
    $('pasteBtn').addEventListener('click', pasteSelection);
    $('deleteBtn').addEventListener('click', deleteSelection);
    $('zoomInBtn').addEventListener('click', () => setZoom(state.settings.zoom * 1.15));
    $('zoomOutBtn').addEventListener('click', () => setZoom(state.settings.zoom / 1.15));
    $('resetZoomBtn').addEventListener('click', resetZoom);
    $('fitBtn').addEventListener('click', fitToScreen);
    $('gridBtn').addEventListener('click', () => { state.settings.showGrid = !state.settings.showGrid; saveLocal(true); renderAll(); });
    $('snapBtn').addEventListener('click', () => { state.settings.snapToGrid = !state.settings.snapToGrid; saveLocal(true); renderAll(); });
    $('startBtn').addEventListener('click', startAnimation);
    $('stopBtn').addEventListener('click', () => stopAnimation());
    $('nextBtn').addEventListener('click', nextPhase);
    $('prevBtn').addEventListener('click', prevPhase);
    $('presentationBtn').addEventListener('click', () => togglePresentation());
    $('inactiveConnectionsBtn').addEventListener('click', () => {
      state.settings.showInactiveConnectionsInPresentation = !state.settings.showInactiveConnectionsInPresentation;
      saveLocal(true);
      renderAll();
    });
    $('sampleBtn').addEventListener('click', loadExample);
    els.emptyExampleBtn?.addEventListener('click', loadExample);
    $('exportBtn').addEventListener('click', exportJson);
    $('importBtn').addEventListener('click', () => els.importInput.click());
    $('exportSvgBtn').addEventListener('click', exportSvg);
    $('exportPngBtn').addEventListener('click', exportPng);
    $('normalizeBtn').addEventListener('click', normalizeSequences);
    $('validateBtn').addEventListener('click', () => validateFlow(true));
    $('normalizeToolbarBtn').addEventListener('click', normalizeSequences);
    $('alignHorizontalToolbarBtn')?.addEventListener('click', () => align('horizontal'));
    $('alignVerticalToolbarBtn')?.addEventListener('click', () => align('vertical'));
    $('distributeHToolbarBtn')?.addEventListener('click', distributeH);
    $('distributeVToolbarBtn')?.addEventListener('click', distributeV);
    els.closePanelBtn.addEventListener('click', () => {
      if(state.ui.presentationMode) state.settings.presentationImagePanelOpen = !state.settings.presentationImagePanelOpen;
      else state.settings.flowPanelOpen = !state.settings.flowPanelOpen;
      saveLocal(true);
      renderAll();
    });
    els.importInput.addEventListener('change', () => { const file = els.importInput.files?.[0]; if(file) importJson(file); els.importInput.value = ''; });
    els.shapeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const shape = btn.dataset.shape || 'roundedRectangle';
        state.settings.defaultShape = shape;
        const rect = els.svg.getBoundingClientRect();
        const w = screenToWorld({x:rect.left + Math.min(rect.width * .36, 420), y:rect.top + Math.min(rect.height * .36, 280)});
        const c = addComponent(w.x, w.y);
        c.shape = shape;
        saveLocal(true);
        renderAll();
      });
    });
    if(els.connectionStyleSelect) els.connectionStyleSelect.addEventListener('change', () => { const flow = selectedFlow(); if(flow){ flow.connectionStyle = els.connectionStyleSelect.value; pushHistory('connection style'); } else state.settings.defaultConnectionStyle = els.connectionStyleSelect.value; saveLocal(true); renderAll(); });
    els.modeSelect.addEventListener('change', () => { state.settings.animationMode = els.modeSelect.value; saveLocal(true); });
    els.speedSelect.addEventListener('change', () => { state.settings.animationSpeed = els.speedSelect.value; saveLocal(true); });
    if(els.fillColor) els.fillColor.addEventListener('input', () => { applyColor('fill', els.fillColor.value); });
    if(els.lineColor) els.lineColor.addEventListener('input', () => { applyColor('line', els.lineColor.value); });

    els.svg.addEventListener('pointerdown', onSvgPointerDown);
    els.svg.addEventListener('pointermove', onSvgPointerMove);
    els.svg.addEventListener('pointerup', onSvgPointerUp);
    els.svg.addEventListener('pointercancel', onSvgPointerUp);
    els.svg.addEventListener('dblclick', onSvgDblClick);
    els.svg.addEventListener('wheel', onWheel, { passive:false });
    els.svg.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('click', (e) => {
      if(!els.contextMenu.contains(e.target)) closeContextMenu();
      document.querySelectorAll('.menuGroup[open]').forEach(menu => {
        if(!menu.contains(e.target)) menu.removeAttribute('open');
      });
    });
    document.querySelectorAll('.menuGroup').forEach(menu => {
      menu.addEventListener('toggle', () => {
        if(menu.open){
          document.querySelectorAll('.menuGroup[open]').forEach(other => { if(other !== menu) other.removeAttribute('open'); });
        }
      });
    });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', () => renderAll());

    els.flowList.addEventListener('click', onFlowListClick);
    els.flowList.addEventListener('input', onFlowListInput);
    els.flowList.addEventListener('change', onFlowListInput);
    els.flowList.addEventListener('dragstart', onFlowDragStart);
    els.flowList.addEventListener('dragover', onFlowDragOver);
    els.flowList.addEventListener('drop', onFlowDrop);
    els.flowEditorModal.addEventListener('click', onFlowEditorClick);
    els.flowEditorBody.addEventListener('input', onFlowEditorInput);
    els.flowEditorBody.addEventListener('change', onFlowEditorInput);
    els.propertiesPanel.addEventListener('input', onPropertyInput);
    els.propertiesPanel.addEventListener('change', onPropertyInput);
    els.propertiesPanel.addEventListener('click', onPropertyClick);

    $('ctxDuplicate').addEventListener('click', () => { closeContextMenu(); duplicateSelection(); });
    $('ctxBringFront').addEventListener('click', () => { closeContextMenu(); bringToFront(); });
    $('ctxSendBack').addEventListener('click', () => { closeContextMenu(); sendToBack(); });
    $('ctxDelete').addEventListener('click', () => { closeContextMenu(); deleteSelection(); });
  }

  function applyColor(kind, color){
    const compIds = state.ui.selectedComponentIds;
    if(compIds.length){
      compIds.forEach(id => { const c = findComponent(id); if(c){ if(kind === 'fill') c.fillColor = color; else c.borderColor = color; } });
      renderCanvas(); saveLocal(true); return;
    }
    const f = selectedFlow();
    if(f){ f.style = f.style || {}; f.style.color = color; renderCanvas(); saveLocal(true); }
  }

  function onFlowListClick(e){
    const item = e.target.closest('.flowItem');
    if(!item) return;
    const flowId = item.dataset.flowId;
    const action = e.target.closest('[data-action]')?.dataset.action;
    if(action === 'toggle-connector-visibility'){
      e.preventDefault();
      e.stopPropagation();
      const flow = findFlow(flowId);
      if(!flow) return;
      flow.hiddenInDrawingMode = !flow.hiddenInDrawingMode;
      state.ui.selectedFlowId = flow.id;
      pushHistory(flow.hiddenInDrawingMode ? 'hide connector in drawing mode' : 'show connector in drawing mode');
      renderAll();
      showToast(flow.hiddenInDrawingMode ? 'Connector hidden in drawing mode' : 'Connector shown in drawing mode');
      return;
    }
    if(action === 'edit-flow' || (!action && e.target.closest('.flowSummary'))){
      openFlowEditor(flowId);
    }
  }

  function onFlowListInput(e){
    const field = e.target.dataset.edit;
    const item = e.target.closest('.flowItem');
    if(!field || !item) return;
    const f = findFlow(item.dataset.flowId);
    if(!f) return;
    if(field === 'sequenceNumber') f[field] = e.target.value.trim();
    else if(field === 'timing') f.timing = e.target.value === 'withPrevious' ? 'withPrevious' : 'afterPrevious';
    else f[field] = e.target.value;
    state.ui.selectedFlowId = f.id;
    renderCanvas(); renderImagePanels(); updateStatus(); saveLocal(true);
  }

  let draggedFlowId = null;
  function onFlowDragStart(e){
    const item = e.target.closest('.flowItem');
    if(!item) return;
    draggedFlowId = item.dataset.flowId;
    e.dataTransfer.effectAllowed = 'move';
  }
  function onFlowDragOver(e){
    if(draggedFlowId) e.preventDefault();
  }
  function onFlowDrop(e){
    e.preventDefault();
    const item = e.target.closest('.flowItem');
    if(!item || !draggedFlowId || item.dataset.flowId === draggedFlowId) return;
    const flows = orderedFlows();
    const from = flows.findIndex(f => f.id === draggedFlowId);
    const to = flows.findIndex(f => f.id === item.dataset.flowId);
    const [moved] = flows.splice(from,1);
    flows.splice(to,0,moved);
    flows.forEach((f,i)=>{ f.sequenceNumber=i+1; if(i===0) f.timing='afterPrevious'; });
    state.messageFlows.forEach(f => { if(!f.timing) f.timing='afterPrevious'; });
    draggedFlowId = null;
    pushHistory('reorder flows'); renderAll();
  }

  function onPropertyInput(e){
    const comp = selectedComponent();
    const flow = selectedFlow();
    if(comp){
      if(e.target.id === 'propName') comp.name = e.target.value;
      if(e.target.id === 'propShape') comp.shape = e.target.value;
      if(e.target.id === 'propFill') comp.fillColor = e.target.value;
      if(e.target.id === 'propBorder') comp.borderColor = e.target.value;
      if(e.target.id === 'propText') comp.textColor = e.target.value;
      renderCanvas(); renderFlowPanel(); saveLocal(true);
      return;
    }
    if(flow){
      if(e.target.id === 'propMessage') flow.messageText = e.target.value;
      if(e.target.id === 'propAction') flow.actionText = e.target.value;
      if(e.target.id === 'propSequence') flow.sequenceNumber = e.target.value.trim();
      if(e.target.id === 'propTiming') flow.timing = e.target.value === 'withPrevious' ? 'withPrevious' : 'afterPrevious';
      if(e.target.id === 'propConnectionStyle') flow.connectionStyle = e.target.value;
      if(e.target.id === 'propSourcePort') flow.sourcePortId = e.target.value || '';
      if(e.target.id === 'propTargetPort') flow.targetPortId = e.target.value || '';
      if(e.target.id === 'propLineColor') { flow.style = flow.style || {}; flow.style.color = e.target.value; }
      if(e.target.id === 'propLineText') { flow.style = flow.style || {}; flow.style.textColor = e.target.value; }
      renderCanvas(); renderFlowPanel(); renderImagePanels(); saveLocal(true);
    }
  }

  function onPropertyClick(e){
    if(e.target.id === 'duplicatePropBtn') duplicateSelection();
  }

  function initHistory(){
    history = [snapshot()];
    historyIndex = 0;
  }

  setupEvents();
  initHistory();
  renderAll();
  setTimeout(() => saveLocal(true), 300);
}
