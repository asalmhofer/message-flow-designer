globalThis.bootstrapMessageFlow = function bootstrapMessageFlow(){
  'use strict';
  if(document.getElementById('app')?.dataset.initialized) return;
  document.getElementById('app').dataset.initialized = 'true';

  const STORAGE_KEY = 'event-flow-designer-state-v1';
  const HISTORY_LIMIT = 60;
  const GRID = 24;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 3.2;
  const MIN_MOVE_DURATION = 550;
  const MAX_MOVE_DURATION = 2600;
  const elements = globalThis.MessageFlowElements;
  const SHAPES = elements.entries.map(e => e.id);
  let library = null;
  let connectedPicker = null;
  let connectedDraft = null;
  let connectTarget = null;
  let precisePortsId = null;
  let nameMessageFlowId = null;
  let appearance = null;
  let flowReorder = null;
  let exportDialog = null;
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
  const icon = globalThis.MessageFlowIcons.svg;
  const textMeasure = document.createElement('canvas').getContext('2d');
  let labelPlacements = new Map();
  let editorViewport = null;
  let presentationAutoFit = true;
  let presentationFitFrame = null;
  let presentationOwnsFullscreen = false;
  let lastLabelClick = null;

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
    labelsLayer: $('labelsLayer'),
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
    sidePanelResizeHandle: $('sidePanelResizeHandle'),
    contextMenu: $('contextMenu'),
    modeStatus: $('modeStatus'),
    selectionStatus: $('selectionStatus'),
    animStatus: $('animStatus'),
    zoomDisplay: $('zoomDisplay'),
    importInput: $('importInput'),
    fillColor: $('fillColor'),
    lineColor: $('lineColor'),
    connectionStyleSelect: $('connectionStyleSelect'),
    modeSelect: $('modeSelect'),
    speedSelect: $('speedSelect'),
    speedDisplay: $('speedDisplay'),
    gridBtn: $('gridBtn'),
    snapBtn: $('snapBtn'),
    selectModeBtn: $('selectModeBtn'),
    panModeBtn: $('panModeBtn')
  };

  const documents = globalThis.MessageFlowDocuments;
  const autosave = documents.createAutosaveRepository(() => localStorage, STORAGE_KEY);
  let saveError = '';
  let state = loadInitialState();
  let history = [];
  let historyIndex = -1;
  let clipboard = null;
  let drag = null;
  let lastComponentClick = null;
  let placement = null;
  let sidebarTab = 'flow';
  let connectSourceId = null;
  let connectSourcePortId = null;
  let connectChosenStyle = null;
  let connectPreviewPoint = null;
  let suppressHistory = false;
  let toastTimer = null;
  let activeAnimationFrame = null;
  const motion = globalThis.MessageFlowMotion;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const feedback = {kind:null,elapsed:0,duration:0,started:0,frame:null};
  let inlineEditor = null;
  let flowEditorOriginalAll = null;
  let currentFileName = state.settings.diagramFileName || '';

  const animation = {
    running: false,
    paused: false,
    index: -1,
    phase: 'stopped',
    phaseInspection: false,
    manualWaiting: false,
    completed: new Set(),
    token: null,
    pathCache: null,
    startTime: 0,
    elapsedBeforePause: 0,
    transferProgress: 0,
    transferDuration: 0,
    autoTimer: null,
    autoDeadline: 0,
    autoRemaining: 0,
    measurePathEl: null
  };



  function normalizeAnimationSpeed(value){
    if(typeof value === 'string'){
      const legacy = value.toLowerCase();
      if(legacy === 'slow') return 25;
      if(legacy === 'normal') return 50;
      if(legacy === 'fast') return 82;
    }
    const numeric = Number(value);
    if(!Number.isFinite(numeric)) return 50;
    return Math.max(1, Math.min(100, Math.round(numeric)));
  }

  function speedToRangeValue(value){
    return normalizeAnimationSpeed(value);
  }

  function speedDisplayLabel(value){
    return `${normalizeAnimationSpeed(value)}%`;
  }

  function durationForAnimationSpeed(value){
    const speed = normalizeAnimationSpeed(value);
    const ratio = (speed - 1) / 99;
    return Math.round(MAX_MOVE_DURATION - ratio * (MAX_MOVE_DURATION - MIN_MOVE_DURATION));
  }

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
        animationSpeed: 50,
        loopAnimation: true,
        autoContinueAfterArrival: false,
        autoContinueDelay: 1200,
        defaultConnectionStyle: 'arc',
        showGrid: true,
        snapToGrid: true,
        focusSelectedFlow: false,
        activeCanvasMode: 'select',
        zoom: 1,
        panX: 80,
        panY: 70,
        presentationPanelOpen: false,
        presentationPanelWidth: 320,
        presentationPanelTab: 'details',
        showInactiveConnectionsInPresentation: true,
        showTokenMessageInPresentation: true,
        showProcessingActionInPresentation: false,
        diagramFileName: 'Untitled diagram.json',
        flowPanelOpen: true,
        flowPanelWidth: 390,
        diagramTheme: 'technical',
        diagramPalette: 'blue',
        defaultShape: 'umlComponent'
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
      const result = autosave.load();
      if(result.error) saveError = result.recovered ? 'Recovery copy loaded. Autosave paused.' : 'Autosave could not be loaded. Original data preserved.';
      return result.document ? mergeDefaults(result.document) : empty;
    }catch(err){
      saveError = `Autosave unavailable: ${err.message}`;
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
      settings: { ...base.settings, ...(parsed.settings || {}), diagramTheme:parsed.settings?.diagramTheme || 'custom', flowPanelOpen: (parsed.settings && Object.prototype.hasOwnProperty.call(parsed.settings, 'flowPanelOpen')) ? parsed.settings.flowPanelOpen : true },
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
    if(drag && ['label','move','resize'].includes(drag.type)) return;
    if(flowEditorOriginalAll) return;
    const copy = snapshot();
    copy.ui.selectedComponentIds = [];
    copy.ui.selectedFlowId = null;
    try{
      autosave.save(copy);
      saveError = '';
      renderSaveStatus();
      if(!silent) showToast('Saved locally');
    }catch(err){
      saveError = err.message;
      renderSaveStatus();
      if(!silent) showToast('Autosave failed. Export JSON to keep a copy.');
    }
  }

  function renderSaveStatus(){
    const status = $('saveStatus');
    status.textContent = saveError ? 'Autosave needs attention' : 'Saved on this device';
    status.title = saveError || 'Export JSON for a portable backup.';
    status.classList.toggle('saveError', !!saveError);
    $('storageNotice').hidden = !saveError;
    $('storageNoticeText').textContent = saveError;
    $('recoveryBtn').hidden = autosave.recoveryText() === null;
    $('retrySaveBtn').textContent = autosave.recoveryText() === null ? 'Retry save' : 'Resume autosave';
  }

  function snapshot(){
    elements.sync(state.components);
    const settings = state.ui.presentationMode && editorViewport ? {...state.settings,...editorViewport} : state.settings;
    return JSON.parse(JSON.stringify({ schemaVersion:1, components: state.components, messageFlows: state.messageFlows, settings, ui: state.ui }));
  }

  function pushHistory(_label='change'){
    if(suppressHistory || flowEditorOriginalAll) return;
    const snap = snapshot();
    history = history.slice(0, historyIndex + 1);
    history.push(snap);
    if(history.length > HISTORY_LIMIT) history.shift();
    historyIndex = history.length - 1;
    saveLocal(true);
  }

  function restoreSnapshot(snap){
    onFlowDragEnd();
    appearance?.close(true);
    resetConnectionDraft(false);
    drag = null;
    suppressHistory = true;
    state = mergeDefaults(JSON.parse(JSON.stringify(snap)));
    currentFileName = state.settings.diagramFileName;
    state.settings.activeCanvasMode = 'select';
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


  function setAnimationModeUi(mode){
    if(!els.modeSelect) return;
    const selectedMode = mode === 'auto' ? 'auto' : 'step';
    els.modeSelect.querySelectorAll('input[name="animationMode"]').forEach(input => {
      const active = input.value === selectedMode;
      input.checked = active;
      input.closest('.playModeOption')?.classList.toggle('active', active);
    });
  }

  function resizeFlowPanelFromPointer(e){
    const rect = els.main.getBoundingClientRect();
    const presentation = state.ui.presentationMode;
    const field = presentation ? 'presentationPanelWidth' : 'flowPanelWidth';
    const width = clamp(rect.right - e.clientX, presentation ? 240 : 280, Math.min(presentation ? 480 : 620, rect.width * (presentation ? .44 : .62)));
    state.settings[field] = Math.round(width);
    document.documentElement.style.setProperty(presentation ? '--presentation-side-w' : '--side-w', `${state.settings[field]}px`);
    queuePresentationFit();
  }

  function startFlowPanelResize(e){
    if(!els.sidePanelResizeHandle || !(state.ui.presentationMode ? state.settings.presentationPanelOpen : state.settings.flowPanelOpen)) return;
    e.preventDefault();
    els.sidePanelResizeHandle.setPointerCapture?.(e.pointerId);
    els.sidePanelResizeHandle.closest('.sidePanel')?.classList.add('resizing');
    resizeFlowPanelFromPointer(e);
    const move = (ev) => resizeFlowPanelFromPointer(ev);
    const up = () => {
      els.sidePanelResizeHandle.closest('.sidePanel')?.classList.remove('resizing');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      saveLocal(true);
      renderAll();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once:true });
  }

  function renderAll(){
    renderToolbarState();
    renderCanvas();
    renderFlowPanel();
    renderProperties(); associateLabels(els.propertiesPanel);
    renderImagePanels();
    renderFlowEditorIfOpen();
    updateStatus();
  }

  function renderToolbarState(){
    renderSidebarTabs();
    document.body.dataset.diagramTheme = state.settings.diagramTheme;
    $('diagramTheme').value = state.settings.diagramTheme;
    $('diagramPalette').value = state.settings.diagramPalette;
    $('diagramPalette').disabled = state.settings.diagramTheme !== 'soft';
    if(state.ui.presentationMode) library?.close();
    $('selectionTools').hidden = state.ui.selectedComponentIds.length < 2 || !!placement || !!connectSourceId;
    $('undoBtn').disabled = historyIndex <= 0;
    $('redoBtn').disabled = historyIndex >= history.length - 1;
    $('copyBtn').disabled = !state.ui.selectedComponentIds.length;
    $('pasteBtn').disabled = !clipboard?.components?.length;
    $('deleteBtn').disabled = !state.ui.selectedComponentIds.length && !state.ui.selectedFlowId;
    if(document.activeElement !== $('diagramName')) $('diagramName').value = (state.settings.diagramFileName || 'Untitled diagram').replace(/\.json$/i, '');
    document.body.classList.toggle('presentation', state.ui.presentationMode);
    document.body.classList.toggle('focusFlow', !state.ui.presentationMode && !animation.running && !!state.ui.selectedFlowId && state.settings.focusSelectedFlow === true);
    $('focusFlowBtn').setAttribute('aria-pressed', String(state.settings.focusSelectedFlow === true));
    $('focusFlowBtn').classList.toggle('active', state.settings.focusSelectedFlow === true);
    document.body.classList.toggle('hideInactiveConnections', state.ui.presentationMode && !state.settings.showInactiveConnectionsInPresentation);
    document.body.classList.toggle('panelClosed', state.ui.presentationMode && !state.settings.presentationPanelOpen);
    document.body.classList.toggle('flowPanelClosed', !state.ui.presentationMode && !state.settings.flowPanelOpen);
    els.canvasWrap.classList.toggle('plain', state.ui.presentationMode || !state.settings.showGrid);
    els.selectModeBtn.classList.toggle('active', state.settings.activeCanvasMode === 'select' && !placement);
    els.panModeBtn.classList.toggle('active', state.settings.activeCanvasMode === 'pan');
    els.gridBtn.classList.toggle('active', state.settings.showGrid);
    els.snapBtn.classList.toggle('active', state.settings.snapToGrid);
    els.gridBtn.setAttribute('aria-pressed', String(state.settings.showGrid));
    els.snapBtn.setAttribute('aria-pressed', String(state.settings.snapToGrid));
    $('connectBtn').classList.toggle('active', state.settings.activeCanvasMode === 'connect');
    els.zoomDisplay.textContent = `${Math.round(state.settings.zoom * 100)}%`;
    const panelWidth = clamp(Number(state.settings.flowPanelWidth) || 390, 280, 620);
    state.settings.flowPanelWidth = panelWidth;
    document.documentElement.style.setProperty('--side-w', `${panelWidth}px`);
    document.documentElement.style.setProperty('--presentation-side-w', `${state.settings.presentationPanelWidth}px`);
    renderPresentationControls();
    const presentationBtn = $('presentationBtn');
    if(presentationBtn){
      const presentationLabel = state.ui.presentationMode ? 'Close presentation mode' : 'Start presentation mode';
      presentationBtn.title = presentationLabel;
      presentationBtn.setAttribute('aria-label', presentationLabel);
      const label = presentationBtn.querySelector('.label');
      if(label) label.textContent = state.ui.presentationMode ? 'Exit' : 'Present';
      presentationBtn.querySelector('[data-icon]').innerHTML = icon(state.ui.presentationMode ? 'close' : 'screen');
    }
    document.querySelectorAll('.shapeTool').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.shape === placement?.shape);
      btn.setAttribute('aria-pressed', String(btn.dataset.shape === placement?.shape));
    });
    if(els.connectionStyleSelect) els.connectionStyleSelect.value = selectedFlow()?.connectionStyle || state.settings.defaultConnectionStyle;
    setAnimationModeUi(state.settings.animationMode);
    const isAutoMode = state.settings.animationMode === 'auto';
    const startButton = $('startBtn');
    const startLabel = animation.manualWaiting ? 'Play next message' : !animation.running ? 'Start animation' : animation.paused ? 'Resume animation' : 'Pause animation';
    startButton.innerHTML = icon(animation.running && !animation.paused && !animation.manualWaiting ? 'pause' : 'play');
    startButton.title = startLabel;
    startButton.setAttribute('aria-label', startLabel);
    $('loopAnimation').checked = state.settings.loopAnimation !== false;
    const groups = animationGroups();
    const messageIndex = currentMessageIndex();
    $('prevMessageBtn').disabled = messageIndex <= 0;
    const readyToPlay = !isAutoMode && ['ready','stopped'].includes(animation.phase);
    $('nextMessageBtn').disabled = !groups.length || manualMessageBusy() || (!readyToPlay && messageIndex >= groups.length - 1);
    $('nextMessageBtn').title = manualMessageBusy() ? 'Wait for this message to finish, or resume playback' : readyToPlay ? 'Play this message (Right arrow)' : 'Next message (Right arrow)';
    $('playbackModeHint').textContent = isAutoMode ? 'Auto continues through the flow.' : animation.phaseInspection ? 'Inspecting individual phases. Next message returns to message playback.' : 'Next plays one message, then waits. Messages marked Together play as a group.';
    for(const field of ['showTokenMessageInPresentation','showProcessingActionInPresentation']) $(field).checked = state.settings[field];
    startButton.disabled = !groups.length;
    $('stopBtn').disabled = !animation.running && animation.index < 0;
    const prevBtn = $('prevBtn');
    const nextBtn = $('nextBtn');
    if(prevBtn){ prevBtn.disabled = isAutoMode || animation.paused || !animation.running || (animation.phase === 'transfer' && animation.index === 0); prevBtn.title = isAutoMode ? 'Choose Manual to inspect phases' : 'Previous phase'; }
    if(nextBtn){ nextBtn.disabled = isAutoMode || animation.paused || animation.phase === 'transfer'; nextBtn.title = isAutoMode ? 'Choose Manual to inspect phases' : 'Next phase'; }
    state.settings.animationSpeed = normalizeAnimationSpeed(state.settings.animationSpeed);
    if(els.speedSelect){
      els.speedSelect.value = speedToRangeValue(state.settings.animationSpeed);
      if(els.speedDisplay) els.speedDisplay.textContent = speedDisplayLabel(state.settings.animationSpeed);
    }
    els.sideTitle.textContent = state.ui.presentationMode ? 'Presentation' : 'Flow Steps';
    const panelOpen = state.ui.presentationMode ? state.settings.presentationPanelOpen : state.settings.flowPanelOpen;
    els.closePanelBtn.innerHTML = icon(panelOpen ? 'next' : 'previous');
    els.closePanelBtn.classList.toggle('expanded', panelOpen);
    els.closePanelBtn.classList.toggle('collapsed', !panelOpen);
    els.closePanelBtn.setAttribute('aria-label', panelOpen ? 'Collapse panel' : 'Expand panel');
    els.closePanelBtn.title = state.ui.presentationMode
      ? (panelOpen ? 'Close presentation panel' : 'Open presentation panel')
      : (panelOpen ? 'Collapse flow panel' : 'Expand flow panel');
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

  function renderSidebarTabs(){
    for(const tab of ['flow', 'properties']){
      const active = sidebarTab === tab;
      $(tab + 'Tab').setAttribute('aria-selected', String(active));
      $(tab + 'Tab').tabIndex = active ? 0 : -1;
      $(tab + 'Pane').hidden = state.ui.presentationMode || !active;
    }
    $('flowCount').textContent = state.messageFlows.length;
  }

  function setSidebarTab(tab){
    sidebarTab = tab;
    renderSidebarTabs();
  }

  function renderCanvas(){
    elements.sync(state.components);
    els.viewport.setAttribute('transform', `translate(${state.settings.panX},${state.settings.panY}) scale(${state.settings.zoom})`);
    els.gridRect.style.display = (state.settings.showGrid && !state.ui.presentationMode) ? 'block' : 'none';
    els.gridRect.setAttribute('x', -10000);
    els.gridRect.setAttribute('y', -10000);
    els.gridRect.setAttribute('width', 20000);
    els.gridRect.setAttribute('height', 20000);
    els.emptyHint.style.display = state.components.length || placement ? 'none' : 'block';
    els.svg.style.cursor = cursorForMode();

    els.connectionsLayer.innerHTML = '';
    els.componentsLayer.innerHTML = '';
    $('annotationsLayer').innerHTML = '';
    for(const c of state.components){
      const target = findComponent(c.annotatedElementId);
      if(c.shape === 'umlComment' && target){
        const a = elements.boundary(c,center(target)).point, b = elements.boundary(target,center(c)).point;
        $('annotationsLayer').appendChild(svgEl('path',{class:'annotationLink',d:`M${a.x},${a.y}L${b.x},${b.y}`,fill:'none',stroke:'#94a3b8','stroke-width':1.2,'stroke-dasharray':'5 4'}));
      }
    }
    els.labelsLayer.innerHTML = '';
    els.overlayLayer.innerHTML = '';

    const flows = orderedFlows();
    flows.forEach(flow => renderFlow(flow, flows));
    [...state.components].sort((a,b) => Number(elements.attached(a.shape))-Number(elements.attached(b.shape)) || (a.zIndex||0) - (b.zIndex||0)).forEach(renderComponent);
    renderFlowLabels(flows);
    renderAnimationOverlay();
    renderSelectedFlowEndpointHandles();
    renderSelectedFlowBendHandle();
    renderEndpointDragPreview();
    renderConnectionDraftPreview();
    renderConnectedPreview();
    renderPlacementPreview();
    if(drag?.type === 'selectBox') renderSelectionBox();
    renderNameMessageAction();
  }

  function cursorForMode(){
    if(drag?.type === 'pan') return 'grabbing';
    if(state.ui.presentationMode) return 'grab';
    if(drag?.copyDrag) return 'copy';
    if(placement) return 'crosshair';
    if(state.settings.activeCanvasMode === 'pan') return 'grab';
    if(state.settings.activeCanvasMode === 'connect') return connectSourceId ? 'crosshair' : 'cell';
    return 'default';
  }

  function renderComponent(c){
    const flow = selectedFlow();
    const endpoint = !state.ui.presentationMode && flow && [flow.sourceComponentId, flow.targetComponentId].includes(c.id);
    const g = svgEl('g', { class: classNames('componentGroup', c.shape === 'package' && 'packageComponent', isSelectedComponent(c.id) && 'selected', endpoint && 'flowEndpointSelected', animationSourceIds().has(c.id) && 'activeSource', animationTargetIds().has(c.id) && 'activeTarget', animationProcessingIds().has(c.id) && 'processing'), 'data-id': c.id, tabindex: 0, role:'button', 'aria-label':`Component: ${c.name}` });
    if(isSelectedComponent(c.id) && !state.ui.presentationMode) g.appendChild(svgEl('rect',{class:'componentSelectionOutline',x:c.x-5,y:c.y-5,width:c.width+10,height:c.height+10,rx:4,fill:'none',stroke:'#818cf8','stroke-width':1,'pointer-events':'none'}));
    g.appendChild(componentShapeEl(c));
    g.appendChild(componentTextEl(c));
    renderComponentFeedback(g,c);
    if(canConnect(c) && !elements.attached(c.shape) && !state.ui.presentationMode && !animation.running && !placement && !connectSourceId && state.settings.activeCanvasMode==='select') renderQuickConnect(g,c);
    if(shouldShowPorts(c.id)) renderPorts(g, c);
    if(isSelectedComponent(c.id) && !state.ui.presentationMode && !elements.attached(c.shape)) renderResizeHandles(g, c);
    els.componentsLayer.appendChild(g);
  }

  function componentShapeEl(c){
    const common = { class: classNames('componentShape', c.shape === 'package' && 'packageShape'), fill: c.fillColor || '#ffffff', 'fill-opacity':c.fillOpacity ?? (c.shape==='package'?.38:1), stroke: c.borderStyle==='none'?'none':(c.borderColor || '#334155'), 'stroke-width': c.borderWidth ?? 2, 'stroke-opacity':c.borderOpacity ?? 1, 'stroke-dasharray':dashPattern(c.borderStyle,c.borderWidth ?? 2) };
    const uml = globalThis.MessageFlowUml.render(c,common,svgEl);
    if(uml) return uml;
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
      case 'text':
        return svgEl('rect', { ...common, class:'componentShape textItemShape', x:c.x, y:c.y, width:c.width, height:c.height, rx:6, ry:6, fill:c.fillColor || 'transparent', stroke:c.borderStyle==='none'?'none':(c.borderColor || 'transparent'), 'stroke-width':c.borderWidth ?? 0 });
      case 'queue': {
        const g = svgEl('g', {});
        const offset = Math.min(12, c.width*.08);
        g.appendChild(svgEl('rect', { ...common, x:c.x+offset, y:c.y, width:c.width-offset, height:c.height, rx:14, ry:14 }));
        g.appendChild(svgEl('path', { d:`M${c.x+offset*.35},${c.y+c.height*.22} L${c.x+offset},${c.y+c.height*.22} M${c.x+offset*.35},${c.y+c.height*.5} L${c.x+offset},${c.y+c.height*.5} M${c.x+offset*.35},${c.y+c.height*.78} L${c.x+offset},${c.y+c.height*.78}`, ...common, fill:'none', 'stroke-linecap':'round' }));
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
        group.appendChild(svgEl('circle', { ...common, cx, cy: top+headR, r:headR, fill:'none' }));
        group.appendChild(svgEl('path', { ...common, d, fill:'none', 'stroke-linecap':'round' }));
        return group;
      }
      case 'roundedRectangle':
      default: return svgEl('rect', { ...common, x:c.x, y:c.y, width:c.width, height:c.height, rx:state.settings.diagramTheme === 'soft' ? 12 : 6, ry:state.settings.diagramTheme === 'soft' ? 12 : 6 });
    }
  }

  function attachmentAt(point,shape){
    return state.components.filter(c=>elements.canOwn(c,shape)).map(owner=>{
      const a=elements.boundary(owner,point),inside=point.x>=owner.x && point.x<=owner.x+owner.width && point.y>=owner.y && point.y<=owner.y+owner.height;
      return {ownerId:owner.id,attachment:{side:a.side,ratio:a.ratio},distance:Math.hypot(point.x-a.point.x,point.y-a.point.y),inside,port:owner.shape==='umlPort'};
    }).filter(a=>a.inside || a.distance<=32/state.settings.zoom).sort((a,b)=>Number(b.port)-Number(a.port) || a.distance-b.distance).map(({ownerId,attachment})=>({ownerId,attachment}))[0] || null;
  }

  function remapAttachments(copies,idMap){
    for(const c of copies){
      if(idMap.has(c.ownerId)) c.ownerId=idMap.get(c.ownerId);
      else if(c.ownerId){c.attachment.ratio=Math.min(.95,c.attachment.ratio+.12);}
      if(idMap.has(c.annotatedElementId)) c.annotatedElementId=idMap.get(c.annotatedElementId);
      else if(c.annotatedElementId && !findComponent(c.annotatedElementId)) delete c.annotatedElementId;
    }
  }

  function applyDiagramTheme(theme,palette){
    state.settings.diagramTheme=theme;state.settings.diagramPalette=palette;
    state.components.forEach(resetComponentAppearance);
    state.messageFlows.forEach(f=>f.style={...f.style,color:theme==='monochrome'?'#525252':'#64748b',textColor:theme==='monochrome'?'#181818':'#202b3c',thickness:1.7,lineStyle:'solid',opacity:1,textOpacity:1});
    pushHistory('diagram theme');renderAll();showToast('Diagram style applied');
  }

  function elementProperties(c){
    if(elements.attached(c.shape)) return `<p class="propertyHint">Attached to its owner. Drag along the boundary to reposition.</p><div class="formRow"><label>Owner</label><select id="propOwner">${state.components.filter(o=>elements.canOwn(o,c.shape)&&o.id!==c.id).map(o=>`<option value="${escapeHtml(o.id)}" ${o.id===c.ownerId?'selected':''}>${escapeHtml(o.name)}</option>`).join('')}</select></div><div class="formRow"><label>Side</label><select id="propAttachmentSide">${['top','right','bottom','left'].map(side=>`<option ${c.attachment.side===side?'selected':''}>${side}</option>`).join('')}</select></div><div class="formRow"><label>Position (%)</label><input id="propAttachmentRatio" type="number" min="0" max="100" value="${Math.round(c.attachment.ratio*100)}"></div>`;
    const annotation=c.shape==='umlComment' ? `<div class="formRow"><label>Annotates</label><select id="propAnnotation"><option value="">No link</option>${state.components.filter(o=>o.id!==c.id).map(o=>`<option value="${escapeHtml(o.id)}" ${c.annotatedElementId===o.id?'selected':''}>${escapeHtml(o.name)}</option>`).join('')}</select></div>` : '';
    const kind=c.shape==='umlNode' ? `<div class="formRow"><label>Node kind</label><select id="propNodeKind">${[['node','Node'],['device','Device'],['executionEnvironment','Execution environment']].map(([id,label])=>`<option value="${id}" ${(c.nodeKind||'node')===id?'selected':''}>${label}</option>`).join('')}</select></div>` : '';
    return kind+`<div class="formRow"><label>Stereotype (optional)</label><input id="propStereotype" value="${escapeHtml(c.stereotype||'')}" placeholder="e.g. service"></div><div class="formRow"><label>Details (optional)</label><textarea id="propDetails" rows="3" placeholder="A short description">${escapeHtml(c.details||'')}</textarea></div>`+annotation;
  }

  function textPlacement(c,padding=16){
    const align=c.textAlign || 'center';
    return {anchor:align==='left'?'start':align==='right'?'end':'middle',x:align==='left'?c.x+padding:align==='right'?c.x+c.width-padding:c.x+c.width/2};
  }

  function componentAppearance(c){
    const attached=elements.attached(c.shape),isText=c.shape === 'text',isPackage=c.shape==='package';
    const detailed=c.shape.startsWith('uml') || attached || isPackage || c.stereotype || c.details;
    // Resolve omitted legacy values so a new shape inherits what the source displays.
    return {
      fillColor:c.fillColor || (isText?'transparent':'#ffffff'),fillOpacity:c.fillOpacity ?? (isPackage?.38:1),
      borderColor:c.borderColor || (isText?'transparent':'#334155'),borderWidth:c.borderWidth ?? (isText?0:2),
      borderStyle:c.borderStyle || 'solid',borderOpacity:c.borderOpacity ?? 1,
      textColor:c.textColor || (detailed?'#202b3c':'#0f172a'),textOpacity:c.textOpacity ?? 1,
      fontSize:c.fontSize ?? (isText?18:isPackage?13:attached?12:14),fontWeight:c.fontWeight ?? (attached?500:600),
      textAlign:c.textAlign || (isPackage?'left':c.shape==='umlPort'&&c.attachment?.side==='left'?'right':c.shape==='umlPort'&&c.attachment?.side==='right'?'left':'center')
    };
  }

  function elementText(c){
    const g=svgEl('g',{}),{textColor:color,fontSize:size,fontWeight:weight}=componentAppearance(c);
    function text(value,x,y,font=size,anchor='middle',bold=weight){
      const t=svgEl('text',{class:'elementText',x,y,fill:color,'fill-opacity':c.textOpacity ?? 1,'text-anchor':anchor,'dominant-baseline':'middle'});
      t.style.fontSize=font+'px';t.style.fontWeight=bold;t.textContent=value;g.appendChild(t);
    }
    if(elements.attached(c.shape)){
      const side=c.attachment?.side || 'right',cx=c.x+c.width/2,cy=c.y+c.height/2;
      const x=c.shape==='umlPort' ? cx+(side==='left'?-14:side==='right'?14:0):cx;
      const y=c.shape==='umlPort' && ['left','right'].includes(side)?cy-15:cy+(side==='top'?-25:29);
      text(c.name,x,y,size,c.textAlign?textPlacement(c).anchor:c.shape==='umlPort'&&side==='left'?'end':c.shape==='umlPort'&&side==='right'?'start':'middle',weight);return g;
    }
    if(c.shape==='package'){
      const width=Math.min(c.width-20,Math.max(100,c.width*.48)),font=size,align=c.textAlign || 'left';
      text(wrapMeasured(c.name,width-20,font,1)[0],c.x+(align==='left'?12:align==='right'?width-12:width/2),c.y+14,font,align==='left'?'start':align==='right'?'end':'middle');return g;
    }
    const kind=c.shape==='umlNode' && c.nodeKind && c.nodeKind!=='node' ? c.nodeKind : '';
    const type=kind || c.stereotype || (c.shape==='umlComponent'?'component':c.shape==='umlArtifact'?'artifact':'');
    const top=c.y+(c.shape==='umlNode'?24:12),width=Math.max(40,c.width-(['umlComponent','umlArtifact'].includes(c.shape)?76:40));
    const pos=textPlacement(c,20);if(['umlComponent','umlArtifact'].includes(c.shape)&&c.textAlign==='right')pos.x-=36;
    if(c.shape==='umlNode' && (!c.textAlign||c.textAlign==='center'))pos.x-=8;
    const metaSize=size*11/14,detailSize=size*12/14,detailLineHeight=detailSize+4;
    let y=type?top+metaSize:top+size/2+4;
    if(type){text('«'+wrapMeasured(type,width,metaSize,1)[0]+'»',pos.x,y,metaSize,pos.anchor,500);y+=size/2+metaSize+5;}
    if(kind&&c.stereotype){text('«'+wrapMeasured(c.stereotype,width,metaSize,1)[0]+'»',pos.x,y,metaSize,pos.anchor,500);y+=metaSize+7;}
    const lineHeight=size+4,lines=wrapMeasured(c.name,width,size,Math.max(1,Math.min(2,Math.floor((c.y+c.height-y-8)/lineHeight))));
    for(const line of lines){text(line,pos.x,y,size,pos.anchor);y+=lineHeight;}
    if(c.details){y+=6;for(const line of wrapMeasured(c.details,c.width-40,detailSize,Math.max(0,Math.floor((c.y+c.height-y-8)/detailLineHeight)))){text(line,pos.x,y,detailSize,pos.anchor,400);y+=detailLineHeight;}}
    return g;
  }

  function componentTextEl(c){
    if(c.shape.startsWith('uml') || elements.attached(c.shape) || c.shape === 'package' || c.stereotype || c.details) return elementText(c);
    const size=componentAppearance(c).fontSize,lineHeight=size+4,pos=textPlacement(c);
    const maxLines=Math.max(1,Math.floor((c.height-24)/lineHeight));
    const text=svgEl('text',{class:classNames('componentText',c.shape==='text'&&'textItemText'),x:pos.x,y:c.y+c.height/2,fill:c.textColor||'#0f172a','fill-opacity':c.textOpacity ?? 1,'data-id':c.id});
    text.style.fontSize=size+'px';text.style.fontWeight=c.fontWeight ?? 600;text.style.textAnchor=pos.anchor;
    const lines=wrapMeasured(c.name||'',Math.max(24,c.width-32),size,maxLines);
    lines.forEach((line,i)=>{const span=svgEl('tspan',{x:pos.x,dy:i===0?-(lines.length-1)*lineHeight/2:lineHeight});span.textContent=line||' ';text.appendChild(span);});
    return text;
  }

  function shouldShowPorts(componentId){
    if(connectedDraft)return false;
    if(['package','text','note','umlComment'].includes(findComponent(componentId)?.shape)) return false;
    if(state.ui.presentationMode) return false;
    if(drag?.type === 'endpoint') return true;
    // While creating a connection from a selected source port, keep all ports visible
    // so the user can choose a target port without activating a separate connect tool.
    if(connectSourceId) return true;
    if(state.settings.activeCanvasMode === 'connect') return true;
    if(precisePortsId===componentId && isSelectedComponent(componentId)) return true;
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
        tabindex:0, role:'button',
        'aria-label':`Connect ${c.name}: ${portLabel(portId, c)}`
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
    if(elements.attached(c.shape)) return [[makePortId(c.attachment?.side || 'right',0.5),'Connection']];
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
    const hiddenInDrawingMode = !!flow.hiddenInDrawingMode && !state.ui.presentationMode && !animation.running;
    if(hiddenInDrawingMode) return;
    const pathData = connectionPath(flow, allFlows);
    const color=active?'#f59e0b':(flow.style?.color || '#475569'),opacity=flow.style?.lineStyle==='none'?0:(flow.style?.opacity ?? 1);
    const markerId='flow-arrow-'+allFlows.indexOf(flow),marker=svgEl('marker',{id:markerId,viewBox:'0 0 10 10',refX:10,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});
    marker.appendChild(svgEl('path',{d:'M0,0 L10,5 L0,10 z',fill:color,'fill-opacity':opacity}));els.connectionsLayer.appendChild(marker);
    if(selected && !state.ui.presentationMode && !animation.running && opacity>0)els.connectionsLayer.appendChild(svgEl('path',{class:'flowSelectionOutline',d:pathData.d,fill:'none',stroke:'#818cf8','stroke-width':Number(flow.style?.thickness ?? 1.7)+5,'stroke-opacity':.2,'pointer-events':'none','vector-effect':'non-scaling-stroke'}));
    const completed = animation.completed.has(flow.id);
    const path = svgEl('path', {
      id: `path-${flow.id}`,
      class: classNames('flowPath', selected && 'selected', active && 'active', completed && 'completed'),
      d: pathData.d,
      'stroke-dasharray':dashPattern(flow.style?.lineStyle,flow.style?.thickness ?? 1.7),
      'stroke-opacity':flow.style?.lineStyle==='none'?0:(flow.style?.opacity ?? 1),
      stroke: active ? '#f59e0b' : (selected ? '#2563eb' : (flow.style?.color || '#475569')),
      'stroke-width': active ? 4.2 : (flow.style?.thickness || 2.2),
      'marker-end':`url(#${markerId})`,
      'data-id': flow.id
    });
    path.style.stroke = color;
    path.style.strokeWidth = active ? '2.8' : String(flow.style?.thickness || 1.7);
    els.connectionsLayer.appendChild(path);

  }

  function wrapMeasured(value, width, fontSize, maxLines=2){
    if(maxLines <= 0) return [];
    textMeasure.font = `600 ${fontSize}px Segoe UI, Arial, sans-serif`;
    const lines = [];
    for(const paragraph of String(value).split('\n')){
      let line = '';
      for(const word of paragraph.split(/\s+/)){
        const combined = line ? `${line} ${word}` : word;
        if(textMeasure.measureText(combined).width <= width){ line = combined; continue; }
        if(line) lines.push(line);
        line = '';
        for(const char of word){
          if(textMeasure.measureText(line+char).width > width && line){ lines.push(line); line = ''; }
          line += char;
        }
      }
      lines.push(line || ' ');
    }
    const shown = lines.slice(0,maxLines);
    if(lines.length > maxLines){
      let last = shown.at(-1).trimEnd();
      while(last && textMeasure.measureText(last+'…').width > width) last = last.slice(0,-1);
      shown[shown.length-1] = last+'…';
    }
    return shown;
  }

  function renderFlowLabels(flows){
    labelPlacements = new Map();
    if(state.ui.presentationMode || animation.running) return;
    const fontSize = Math.max(15, Math.min(22, 13/state.settings.zoom));
    const items = flows.filter(flow => !flow.hiddenInDrawingMode).map(flow => {
      const path = connectionPath(flow, flows);
      const lines = wrapMeasured(flow.messageText || 'Message', 200, fontSize, 2);
      const width = Math.max(90, ...lines.map(line => textMeasure.measureText(line).width + 48));
      return {id:flow.id, anchor:{x:path.labelX,y:path.labelY}, width, height:lines.length*(fontSize+4)+16, offset:validControlPoint(flow.labelOffset), lines, fontSize};
    });
    labelPlacements = globalThis.MessageFlowLabels.layoutLabels(items, state.components.filter(c => c.shape !== 'package'));
    for(const item of items){
      const flow = findFlow(item.id), box = labelPlacements.get(item.id);
      const selected = state.ui.selectedFlowId === flow.id;
      const g = svgEl('g', {class:classNames('flowLabelGroup',selected && 'selected'), 'data-id':flow.id, tabindex:0, role:'button', 'aria-label':`Message label: ${flow.messageText}. Drag to position; Enter to rename.`});
      g.style.fontSize = `${fontSize}px`;
      const title = svgEl('title',{}); title.textContent = flow.messageText || 'Message'; g.appendChild(title);
      g.appendChild(svgEl('rect',{class:'flowLabelBackground',x:box.x,y:box.y,width:box.width,height:box.height,rx:7}));
      const sequence = svgEl('text',{class:'labelSequence',x:box.x+14,y:box.y+box.height/2,'dominant-baseline':'middle','text-anchor':'middle','font-size':11});
      sequence.textContent = flow.sequenceNumber;
      g.appendChild(sequence);
      const text = svgEl('text',{class:'flowLabel editLabel',x:box.x+32,y:box.y+box.height/2,'font-size':fontSize,fill:flow.style?.textColor || '#1e293b','fill-opacity':flow.style?.textOpacity ?? 1,'data-id':flow.id});
      text.style.fill = flow.style?.textColor || '#1e293b';
      item.lines.forEach((line,index) => {
        const span = svgEl('tspan',{x:box.x+32,dy:index === 0 ? -(item.lines.length-1)*(fontSize+4)/2 : fontSize+4});
        span.textContent = line; text.appendChild(span);
      });
      g.appendChild(text); els.labelsLayer.appendChild(g);
    }
  }

  function renderSelectedFlowEndpointHandles(){
    if(state.ui.presentationMode || animation.running || drag?.type === 'endpoint') return;
    const flow = selectedFlow();
    if(!flow || flow.hiddenInDrawingMode) return;
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
    if(!flow || flow.hiddenInDrawingMode) return;
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
    if(state.ui.presentationMode || !connectSourceId || !connectChosenStyle || connectedDraft) return;
    const source = findComponent(connectSourceId);
    if(!source) return;
    const sp = portPosition(source, connectSourcePortId || centeredPortIdFromPoint(source, center(source)));
    const tp = connectPreviewPoint || defaultConnectionPreviewPoint(source, connectSourcePortId);
    let d = draftConnectionPath(connectChosenStyle, sp, tp);
    if(connectTarget){
      const target=findComponent(connectTarget.componentId);
      const preview={id:'connection-preview',sourceComponentId:source.id,targetComponentId:target.id,sourcePortId:connectSourcePortId,targetPortId:connectTarget.portId,connectionStyle:connectChosenStyle};
      d=connectionPath(preview,[...orderedFlows(),preview]).d;
      els.overlayLayer.appendChild(svgEl('rect',{class:'connectionTargetOutline',x:target.x-4/state.settings.zoom,y:target.y-4/state.settings.zoom,width:target.width+8/state.settings.zoom,height:target.height+8/state.settings.zoom,rx:6/state.settings.zoom}));
    }
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

  function renderComponentFeedback(group,component){
    const source = animation.running && animation.phase === 'transfer' && animationSourceIds().has(component.id);
    const target = activeAnimatedFlows().some(flow => flow.targetComponentId === component.id);
    const arrival = target && feedback.kind === 'arrived' && feedback.elapsed < feedback.duration;
    if(!reducedMotion.matches && (arrival || (source && animation.transferProgress < .16))){
      const t = arrival ? feedback.elapsed / feedback.duration : animation.transferProgress / .16;
      const inset = arrival ? 3 + t * 9 : 4;
      group.appendChild(svgEl('rect',{
        class:arrival?'arrivalPulse':'departureCue',x:component.x-inset,y:component.y-inset,
        width:component.width+inset*2,height:component.height+inset*2,rx:7,
        fill:'none',stroke:'#d98b16','stroke-width':1.5,opacity:(1-t)*.75,'pointer-events':'none'
      }));
    }
    if(animationProcessingIds().has(component.id)){
      const width = Math.min(48,component.width-12),x=component.x+(component.width-width)/2,y=component.y+component.height+5;
      group.appendChild(svgEl('rect',{class:'processingIndicator',x,y,width,height:3,rx:1.5,fill:'#f2e5cb','pointer-events':'none'}));
      group.appendChild(svgEl('rect',{class:'processingProgress',x,y,width:width*(reducedMotion.matches ? .5 : Math.max(.06,feedback.elapsed/900)),height:3,rx:1.5,fill:'#c98718','pointer-events':'none'}));
    }
  }

  function canConnect(component){return !!component && !['package','text','note','umlComment'].includes(component.shape);}

  function renderQuickConnect(group,component){
    const z=state.settings.zoom,rotation={right:0,bottom:90,left:180,top:270};
    for(const [side] of PORT_SIDES){
      const point=portPosition(component,makePortId(side,.5));
      point.x+=(side==='right'?24:side==='left'?-24:0)/z;point.y+=(side==='bottom'?24:side==='top'?-24:0)/z;
      const handle=svgEl('g',{class:'quickConnect','data-id':component.id,'data-side':side,role:'button',tabindex:0,
        'aria-label':`Add or connect ${component.name} ${side}`,transform:`translate(${point.x} ${point.y}) scale(${1/z})`});
      const title=svgEl('title');title.textContent='Drag to connect · click to add a component';handle.append(title);
      // The transparent bridge keeps hover active between the edge and arrow.
      // Precise ports and resize handles render above it and keep their own hits.
      handle.append(svgEl('rect',{x:-24,y:-16,width:40,height:32,fill:'transparent',transform:`rotate(${rotation[side]})`}),svgEl('circle',{r:11,class:'quickConnectFace'}),svgEl('path',{d:'M-4 0H4M0 -4L4 0L0 4',transform:`rotate(${rotation[side]})`}));
      group.append(handle);
    }
  }

  function resetFeedback(){
    if(feedback.frame) cancelAnimationFrame(feedback.frame);
    Object.assign(feedback,{kind:null,frame:null,elapsed:0,duration:0});
  }

  function startPhaseFeedback(kind,duration){
    resetFeedback();
    Object.assign(feedback,{kind,duration});
    runPhaseFeedback();
  }

  function runPhaseFeedback(){
    if(!feedback.kind || feedback.elapsed >= feedback.duration || animation.paused) return;
    if(feedback.frame) cancelAnimationFrame(feedback.frame);
    feedback.started = performance.now()-feedback.elapsed;
    const tick = now => {
      feedback.frame = null;
      if(animation.paused) return;
      feedback.elapsed = Math.min(feedback.duration,now-feedback.started);
      renderCanvas(); renderPlaybackProgress();
      if(feedback.elapsed < feedback.duration) feedback.frame = requestAnimationFrame(tick);
    };
    feedback.frame = requestAnimationFrame(tick);
  }

  function renderPlaybackProgress(){
    const active = activeFlowIds();
    const phase = animation.phase;
    const status = animation.manualWaiting ? 'Completed' : ({transfer:'Sending',arrived:'Received',processing:'Processing'})[phase];
    const progress = phase === 'transfer' ? (reducedMotion.matches ? .08 : animation.transferProgress*.75)
      : phase === 'processing' ? .8 + (reducedMotion.matches ? 0 : Math.min(1,feedback.elapsed/900)*.2)
      : phase === 'arrived' ? (processingPhaseEnabled() ? .8 : 1) : 0;
    const update = (node,ids) => {
      const done = ids.every(id => animation.completed.has(id));
      const playing = animation.running && ids.some(id => active.has(id));
      const label = done ? 'Completed' : playing ? (animation.paused ? 'Paused · ' : '') + status : '';
      node.dataset.playbackState = done ? 'completed' : playing ? phase : 'idle';
      node.style.setProperty('--step-progress',done ? 1 : playing ? progress : 0);
      const mark = node.querySelector('.stepCompletion');
      mark.hidden = !done;
      const meter = node.querySelector('.stepProgress');
      meter.setAttribute('aria-label',label || 'Not played');
      meter.setAttribute('aria-valuenow',Math.round((done ? 1 : playing ? progress : 0)*100));
      const caption = node.querySelector('.flowTiming');
      if(caption && label) caption.textContent = label;
    };
    els.flowList.querySelectorAll('.flowItem').forEach(node => update(node,[node.dataset.flowId]));
    const groups = animationGroups();
    $('presentationTimeline').querySelectorAll('.timelineMessage').forEach(node => update(node,groups[Number(node.dataset.presentationGroup)].flows.map(f=>f.id)));
  }

  function stepProgressHtml(){
    return '<span class="stepProgress" role="progressbar" aria-label="Not played" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></span>';
  }

  function stepCompletionHtml(){
    return `<span class="stepCompletion" title="Completed" aria-label="Completed" hidden>${icon('check')}</span>`;
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
        'stroke-opacity':animation.phase === 'transfer' ? .3 : .8,
        'marker-end':'url(#arrowActive)'
      }));

      if(animation.phase === 'transfer' && !reducedMotion.matches){
        const progress = motion.travelProgress(animation.transferProgress);
        const tail = Math.min(.22,progress);
        els.overlayLayer.appendChild(svgEl('path',{
          class:'messageTrace',d:activeConnectionD,pathLength:1,
          'stroke-dasharray':`${tail} ${1-tail}`,'stroke-dashoffset':-(progress-tail)
        }));
      }

      if(animation.phase === 'transfer' || animation.phase === 'arrived'){
        const point = animation.token?.[flow.id] || cachedPath?.targetPoint || activePathData.targetPoint;
        const g = svgEl('g', { class:'messageToken' });
        const scale=presentationLabelScale();
        g.appendChild(svgEl('circle', { cx:point.x, cy:point.y, r:6*scale, fill:'#d98b16', stroke:'#fff', 'stroke-width':2*scale }));
        if(!state.ui.presentationMode || state.settings.showTokenMessageInPresentation){
        const {lines,width}=tokenLabel(flow);
        const label=svgEl('g',{class:'tokenLabel',transform:`translate(${point.x} ${point.y}) scale(${scale})`});
        label.appendChild(svgEl('rect',{x:-width/2,y:16,width,height:12+lines.length*17,rx:6,fill:'#fff',stroke:'#e5c68e','stroke-width':1}));
        const text=svgEl('text',{x:0,y:32,'text-anchor':'middle','font-size':12,'font-weight':600,fill:'#92400e'});
        lines.forEach((line,index)=>{const span=svgEl('tspan',{x:0,dy:index?17:0});span.textContent=line;text.appendChild(span);});
        label.appendChild(text);g.appendChild(label);
        }
        els.overlayLayer.appendChild(g);
      }

    });
    if(animation.phase === 'processing' && processingPhaseEnabled()) renderProcessingCallouts(flows);
  }

  function presentationLabelScale(zoom=state.settings.zoom){return state.ui.presentationMode?Math.max(1,14/(12*zoom)):1;}

  function tokenLabel(flow){
    const lines=wrapMeasured(flow.messageText || 'Message',190,13,2);
    return {lines,width:Math.max(90,...lines.map(line=>textMeasure.measureText(line).width+24))};
  }

  function processingItems(flows,scale=presentationLabelScale()){
    return flows.map(flow => {
      const target = findComponent(flow.targetComponentId);
      const width = Math.max(180, Math.min(280,target.width+60));
      const heading = flows.filter(f=>f.targetComponentId===target.id).length>1 ? wrapMeasured(flow.messageText || 'Message',width-24,11,1)[0] : '';
      const lines = wrapMeasured(flow.actionText || 'Processing…',width-24,12,4);
      return {id:flow.id,target,scale,width:width*scale,height:(24+lines.length*17+(heading?18:0))*scale,heading,lines,text:flow.actionText || 'Processing…'};
    });
  }

  function renderProcessingCallouts(flows){
    const items=processingItems(flows);
    const rect = els.svg.getBoundingClientRect(), z = state.settings.zoom;
    const bottom=state.ui.presentationMode?12:90;
    const viewport = {x:(12-state.settings.panX)/z,y:(12-state.settings.panY)/z,width:(rect.width-24)/z,height:Math.max(0,rect.height-12-bottom)/z};
    const boxes = globalThis.MessageFlowLabels.layoutCallouts(items,state.components,viewport);
    for(const item of items) els.overlayLayer.appendChild(processingBubble(item,boxes.get(item.id)));
  }

  function processingBubble(item, box){
    const {x,y,width,height} = box;
    const {target,heading,lines,scale=1} = item;
    const g = svgEl('g', {class:'processingCallout','data-flow-id':item.id});
    const title = svgEl('title',{}); title.textContent = item.text; g.appendChild(title);
    const cx=target.x+target.width/2,cy=target.y+target.height/2;
    const end={x:clamp(cx,x,x+width),y:clamp(cy,y,y+height)};
    const start={x:clamp(end.x,target.x,target.x+target.width),y:clamp(end.y,target.y,target.y+target.height)};
    g.appendChild(svgEl('path',{class:'actionLeader',d:`M${start.x},${start.y} L${end.x},${end.y}`}));
    g.appendChild(svgEl('rect', { class:'actionBubble', x, y, width, height, rx:14*scale }));
    if(heading){
      const text = svgEl('text',{class:'actionText actionHeading',x:x+width/2,y:y+22*scale});text.style.fontSize=`${11*scale}px`;text.textContent=heading;g.appendChild(text);
    }
    lines.forEach((line, i) => {
      const t = svgEl('text', { class:'actionText', x:x+width/2, y:y+(24+i*17+(heading?18:0))*scale });
      t.style.fontSize=`${12*scale}px`;
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

  function connectionPath(flow, allFlows=orderedFlows(), lookup=findComponent){
    const s = lookup(flow.sourceComponentId), t = lookup(flow.targetComponentId);
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

  function expandMoveOriginalsForPackages(originals){
    const originalMap=new Map((originals || []).map(o=>[o.id,o]));
    const ids=elements.descendants([...originalMap.keys()],state.components,true);
    return state.components.filter(c=>ids.has(c.id)).map(c=>originalMap.get(c.id) || JSON.parse(JSON.stringify(c)));
  }

  function flowControlOriginalsForComponentMove(componentOriginals){
    const movedIds = new Set((componentOriginals || []).map(c => c.id));
    if(!movedIds.size) return [];
    return state.messageFlows
      .filter(flow => validControlPoint(flow.controlPoint) && (movedIds.has(flow.sourceComponentId) || movedIds.has(flow.targetComponentId)))
      .map(flow => ({ id: flow.id, controlPoint: { x: flow.controlPoint.x, y: flow.controlPoint.y } }));
  }

  function renderFlowPanel(force=false){
    if(flowReorder?.active()) return;
    const editing = document.activeElement && els.flowList.contains(document.activeElement) && ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
    if(editing && !force) return;
    const focusedFlowId = document.activeElement?.closest('.flowItem')?.dataset.flowId;
    const focusedAction = document.activeElement?.dataset.action;
    const focusedField = document.activeElement?.dataset.edit;
    const flows = orderedFlows();
    if(!flows.length){
      els.flowList.innerHTML = '<div class="flowEmpty">Connect your components to build a flow. Select a component, then drag a connection handle to its destination.</div>';
      return;
    }
    els.flowList.innerHTML = animationGroups().map(group => group.flows.length > 1
      ? `<div class="parallelGroup" role="group" aria-label="${group.flows.length} simultaneous messages"><div class="parallelLabel">Together · ${group.flows.length} messages</div>${group.flows.map(flowItemHtml).join('')}</div>`
      : flowItemHtml(group.flows[0])).join('');
    associateLabels(els.flowList);
    if(focusedFlowId && focusedAction){
      const item = Array.from(els.flowList.querySelectorAll('.flowItem')).find(row => row.dataset.flowId === focusedFlowId);
      Array.from(item?.querySelectorAll('button') || []).find(button => button.dataset.action === focusedAction)?.focus({preventScroll:true});
    }
    if(focusedFlowId && focusedField){
      const item = Array.from(els.flowList.querySelectorAll('.flowItem')).find(row => row.dataset.flowId === focusedFlowId);
      Array.from(item?.querySelectorAll('[data-edit]') || []).find(input => input.dataset.edit === focusedField)?.focus({preventScroll:true});
    }
  }

  function flowItemHtml(flow){
    const selected=state.ui.selectedFlowId===flow.id,active=activeFlowIds().has(flow.id),expanded=state.ui.expandedFlowId===flow.id;
    const route=`${componentName(flow.sourceComponentId)} → ${componentName(flow.targetComponentId)}`,n=escapeHtml(flow.sequenceNumber),hidden=!!flow.hiddenInDrawingMode;
    return `<div class="flowItem ${selected?'selected':''} ${active?'activeAnim':''} ${hidden?'hiddenConnector':''}" data-flow-id="${flow.id}" data-timing="${flow.timing || 'afterPrevious'}">
      <div class="flowSummary" data-action="select-flow"><button class="flowDragHandle" data-action="drag-flow" type="button" title="Drag to reorder; Alt + ↑ / ↓ to move" aria-label="Reorder step ${n}">${icon('grip')}</button><span class="seqBadge">${n}</span><div class="flowTitle"><span class="flowName">${escapeHtml(flow.messageText||'Message')}</span><span class="flowRoute" title="${escapeHtml(route)}">${escapeHtml(route)}</span></div><button class="expandStep" data-action="toggle-details" aria-label="Details for step ${n}" aria-expanded="${expanded}" aria-controls="details-${flow.id}" title="Step overview">${icon(expanded?'up':'down')}</button></div>
      <div class="flowCardFooter"><span class="flowTimingWrap">${stepCompletionHtml()}<span class="flowTiming">${flow.sequenceNumber===1?'First message':flow.timing==='withPrevious'?'Together with previous':'After previous'}${hidden?' · Connection hidden':''}</span></span><div class="flowCardActions"><button type="button" data-action="toggle-connector-visibility" aria-label="${hidden?'Show':'Hide'} connection for step ${n}" aria-pressed="${!hidden}" title="${hidden?'Show':'Hide'} while editing; playback is unchanged">${icon(hidden?'eyeOff':'eye')}</button><button type="button" data-action="edit-flow" aria-label="Edit step ${n}" title="Edit step">${icon('pencil')}</button></div></div>
      ${expanded?flowDetailsHtml(flow):''}${stepProgressHtml()}</div>`;
  }

  function flowDetailsHtml(flow){
    const flows=orderedFlows(),first=flows[0]?.id===flow.id,last=flows.at(-1)?.id===flow.id;
    return `<div class="stepDetails" id="details-${flow.id}"><div class="stepReadout"><strong>Processing action</strong><p>${escapeHtml(flow.actionText||'No processing action')}</p>${flow.notes?`<strong>Notes</strong><p>${escapeHtml(flow.notes)}</p>`:''}</div>${flow.processingImageDataUrl?`<img class="stepImage" src="${escapeHtml(flow.processingImageDataUrl)}" alt="Processing image for ${escapeHtml(flow.messageText)}">`:''}<div class="moveStepActions"><button data-action="move-up" ${first?'disabled':''}>${icon('up')}Move up</button><button data-action="move-down" ${last?'disabled':''}>${icon('down')}Move down</button></div><div class="detailActions"><button data-action="start-here">${icon('play')}Play from here</button><button data-action="reset-label" ${flow.labelOffset?'':'disabled'}>${icon('reset')}Reset label position</button><button data-action="delete-flow" class="danger">${icon('trash')}Delete step</button></div></div>`;
  }

  function flowEditorHtml(flow){
    const first=orderedFlows()[0]?.id===flow.id;
    return `<div data-flow-id="${flow.id}" class="flowEditorContent"><section class="flowEditorSection" aria-label="Message and processing details">
      <div class="formRow wide"><label>Message</label><input data-edit="messageText" type="text" value="${escapeHtml(flow.messageText||'')}" placeholder="Message name"></div>
      <div class="formRow"><label>Source</label>${componentSelectHtml('sourceComponentId',flow.sourceComponentId)}</div><div class="formRow"><label>Target</label>${componentSelectHtml('targetComponentId',flow.targetComponentId)}</div>
      <div class="formRow wide"><label>Timing</label><select data-edit="timing" ${first?'disabled':''}><option value="afterPrevious" ${flow.timing!=='withPrevious'?'selected':''}>${first?'First message':'After previous'}</option><option value="withPrevious" ${flow.timing==='withPrevious'?'selected':''}>With previous</option></select></div>
      <div class="formRow wide"><label>Processing action</label><textarea data-edit="actionText" rows="3" placeholder="What happens at the destination?">${escapeHtml(flow.actionText||'')}</textarea></div><div class="formRow wide"><label>Notes</label><textarea data-edit="notes" rows="2" placeholder="Optional context">${escapeHtml(flow.notes||'')}</textarea></div></section>
      <details class="flowEditorAdvanced"><summary>Routing and step order</summary><section class="flowEditorSection" aria-label="Connection routing"><div class="formRow"><label>Source port</label>${portSelectHtml('sourcePortId',flow.sourcePortId||'',flow.sourceComponentId)}</div><div class="formRow"><label>Target port</label>${portSelectHtml('targetPortId',flow.targetPortId||'',flow.targetComponentId)}</div><div class="formRow"><label>Style</label><select data-edit="connectionStyle">${[['straight','Straight'],['arc','Curved'],['angular','Elbow']].map(([v,l])=>`<option value="${v}" ${flow.connectionStyle===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="formRow"><label>Order</label><div class="stepOrderSpinner"><button data-action="step-order-up" aria-label="Move step up" ${first?'disabled':''}>${icon('up')}</button><span data-step-order-display>${escapeHtml(flow.sequenceNumber)}</span><button data-action="step-order-down" aria-label="Move step down" ${orderedFlows().at(-1)?.id===flow.id?'disabled':''}>${icon('down')}</button></div></div></section></details>
      <details class="flowEditorAdvanced"><summary>Processing image${flow.processingImageDataUrl?' · Attached':''}</summary><section class="flowEditorSection flowEditorImageSection" aria-label="Processing image">${flow.processingImageDataUrl?`<img class="stepImage" src="${escapeHtml(flow.processingImageDataUrl)}" alt="Processing image">`:'<p class="propertyHint">Add an image to show while this step is processing.</p>'}<div class="detailActions"><button data-action="upload-image" type="button">Upload / replace image</button><button data-action="remove-image" type="button" ${flow.processingImageDataUrl?'':'disabled'}>Remove image</button></div></section></details></div>`;
  }

  function componentSelectHtml(field, selectedId){
    return `<select data-edit="${field}">${state.components.map(c => `<option value="${c.id}" ${c.id===selectedId ? 'selected' : ''}>${escapeHtml(c.name || 'Component')}</option>`).join('')}</select>`;
  }

  function dashPattern(style,width=1.5){return style==='dashed'?`${width*4} ${width*3}`:style==='dotted'?`${width} ${width*2}`:'none';}

  function resetComponentAppearance(comp){
    for(const key of ['fillOpacity','borderOpacity','textOpacity','borderStyle','fontSize','fontWeight','textAlign'])delete comp[key];
    Object.assign(comp,elements.style(state.settings.diagramTheme,state.settings.diagramPalette,comp.shape));
  }

  function setupAppearance(){
    appearance=globalThis.MessageFlowAppearance.create({panel:els.propertiesPanel,
      getTargets:()=>state.ui.selectedComponentIds.length?state.ui.selectedComponentIds.map(id=>{const c=findComponent(id);return {model:c,defaults:c?componentAppearance(c):null};}).filter(t=>t.model):selectedFlow()?[{model:selectedFlow().style ||= {}}]:[],
      preview:()=>{renderCanvas();},commit:()=>{pushHistory('edit appearance');renderToolbarState();},
      reset:()=>{state.ui.selectedComponentIds.forEach(id=>resetComponentAppearance(findComponent(id)));const f=selectedFlow();if(f)f.style={color:state.settings.diagramTheme==='monochrome'?'#525252':'#64748b',textColor:'#202b3c',thickness:1.7};pushHistory('reset appearance');renderAll();}});
  }

  function renderProperties(){
    const comp=selectedComponent(),flow=selectedFlow(),count=state.ui.selectedComponentIds.length;
    if(count>1){els.propertiesPanel.innerHTML=`<div class="inspectorSelection"><strong>${count} elements selected</strong><span>Shared appearance · mixed values are shown</span></div>${appearance.html()}`;return;}
    if(comp){
      els.propertiesPanel.innerHTML=`<section class="inspectorSection" aria-label="Element"><div class="inspectorHeading"><h3>Element</h3><span>${escapeHtml(shapeLabel(comp.shape))}</span></div><div class="formRow wide"><label>Component name</label><input id="propName" type="text" value="${escapeHtml(comp.name)}"></div><div class="formRow wide"><label>Shape</label><select id="propShape">${SHAPES.filter(s=>elements.attached(comp.shape)?s===comp.shape:!elements.attached(s)).map(s=>`<option value="${s}" ${comp.shape===s?'selected':''}>${shapeLabel(s)}</option>`).join('')}</select></div><details class="inspectorAdvanced"><summary>${elements.attached(comp.shape)?'Attachment':'UML and details'}</summary>${elementProperties(comp)}</details></section>${appearance.html()}${elements.attached(comp.shape)?'':`<details class="inspectorAdvanced inspectorSection"><summary>Layout</summary><div class="inspectorColumns"><label class="inspectorField">Width<input id="propWidth" type="number" min="40" max="4000" value="${comp.width}"></label><label class="inspectorField">Height<input id="propHeight" type="number" min="30" max="4000" value="${comp.height}"></label></div></details>`}<div class="detailActions"><button id="duplicatePropBtn">${icon('copy')}Duplicate</button></div>`;return;
    }
    if(flow){
      els.propertiesPanel.innerHTML=`<section class="inspectorSection"><div class="inspectorHeading"><h3>Step ${escapeHtml(flow.sequenceNumber)}</h3><button type="button" id="editSelectedFlow">${icon('pencil')}Edit step</button></div><strong>${escapeHtml(flow.messageText||'Message')}</strong><p class="propertyHint">${escapeHtml(componentName(flow.sourceComponentId))} → ${escapeHtml(componentName(flow.targetComponentId))}</p><div class="formRow"><label>Connection</label><select id="propConnectionStyle"><option value="straight" ${flow.connectionStyle==='straight'?'selected':''}>Straight</option><option value="arc" ${flow.connectionStyle==='arc'?'selected':''}>Curved</option><option value="angular" ${flow.connectionStyle==='angular'?'selected':''}>Elbow</option></select></div></section>${appearance.html(true)}<button id="resetLabelBtn" ${flow.labelOffset?'':'disabled'}>${icon('reset')}Reset label position</button>`;return;
    }
    els.propertiesPanel.innerHTML='<div class="inspectorEmpty">Select an element or connection to edit its properties.</div>';
  }

  function shapeLabel(s){ return elements.get(s).name; }

  function renderImagePanels(){
    const groups = animationGroups(), index = currentMessageIndex();
    const flows = groups[index]?.flows || [];
    const ordered = orderedFlows();
    const positions = flows.map(f => ordered.findIndex(item => item.id === f.id)+1);
    const count = positions.length > 1 ? positions[0] + '–' + positions.at(-1) : positions[0];
    const counter = flows.length ? (flows.length > 1 ? 'Messages ' : 'Message ') + count + ' of ' + ordered.length : ordered.length + ' messages';
    const phase = ({transfer:'Sending',arrived:'Received',processing:'Processing',completed:'Finished',ready:'Ready',stopped:'Ready'})[animation.phase] || 'Ready';
    const phaseLabel = animation.manualWaiting ? 'Waiting for Next' : animation.paused ? 'Paused · ' + phase : phase;
    $('playbackCounter').textContent = counter;
    $('playbackPhase').textContent = ordered.length ? phaseLabel : 'Connect components to play';
    $('playbackSummary').title = counter + ' · ' + $('playbackPhase').textContent;
    $('presentationSummary').hidden = !state.ui.presentationMode;
    $('presentationCounter').textContent = counter;
    $('presentationPhase').textContent = phaseLabel;
    $('presentationMessage').textContent = [...new Set(flows.map(f => f.messageText))].join(' | ') || 'Your flow, one message at a time';
    $('presentationMessage').title=$('presentationMessage').textContent;
    $('presentationRoute').textContent = flows.length > 1 ? flows.map(f => f.messageText).join(' · ') : flows.length ? componentName(flows[0].sourceComponentId) + ' → ' + componentName(flows[0].targetComponentId) : 'Choose a message below or press Play to begin.';
    $('presentationRoute').title=$('presentationRoute').textContent;
    els.presentationStepLabel.textContent = flows.length > 1 ? 'Simultaneous messages' : 'Message details';
    $('presentationDetails').innerHTML = flows.length ? flows.map(f => '<section class="storyMessage">'
      + (flows.length > 1 ? '<h3>' + escapeHtml(f.messageText) + '</h3><p class="storyRoute">' + escapeHtml(componentName(f.sourceComponentId) + ' → ' + componentName(f.targetComponentId)) + '</p>' : '')
      + (f.actionText ? '<span class="storyLabel">Processing action</span><p>' + escapeHtml(f.actionText) + '</p>' : '')
      + (f.notes ? '<span class="storyLabel">Notes</span><p class="storyNote">' + escapeHtml(f.notes) + '</p>' : '')
      + (!f.actionText && !f.notes ? '<p class="storyNote">No additional details for this message.</p>' : '') + '</section>').join('') : '<p class="storyNote">Add connections in the editor to tell your story.</p>';
    const images = flows.filter(f => f.processingImageDataUrl);
    els.presentationImagePreview.hidden = !images.length;
    els.presentationImagePreview.innerHTML = images.map(f => '<figure class="storyImage"><img src="' + escapeHtml(f.processingImageDataUrl) + '" alt="Processing image for ' + escapeHtml(f.messageText) + '">' + (flows.length > 1 ? '<figcaption>' + escapeHtml(f.messageText) + '</figcaption>' : '') + '</figure>').join('');
    const focusedGroup = document.activeElement?.dataset.presentationGroup;
    $('presentationTimeline').innerHTML = groups.map((group,i) => {
      const names = group.flows.map(f => f.messageText || 'Message').join(' + ');
      // Keep the navigation name stable as its nested progress value changes.
      return `<button class="timelineMessage" data-presentation-group="${i}" aria-label="${escapeHtml(group.label+'. '+names)}" aria-current="${i===index?'step':'false'}"><span class="timelineNumber">${escapeHtml(group.label)}</span><span class="timelineText">${escapeHtml(names)}${group.flows.length>1?'<small>Together</small>':''}</span>${stepCompletionHtml()}${stepProgressHtml()}</button>`;
    }).join('');
    renderPlaybackProgress();
    if(focusedGroup !== undefined) $('presentationTimeline').querySelector('[data-presentation-group="' + focusedGroup + '"]')?.focus({preventScroll:true});
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
    const opened=[...els.flowEditorBody.querySelectorAll('details')].map(d=>d.open);
    els.flowEditorBody.innerHTML = flowEditorHtml(flow);
    els.flowEditorBody.querySelectorAll('details').forEach((d,i)=>d.open=opened[i] || false);
    associateLabels(els.flowEditorBody);
  }

  function associateLabels(container){
    container.querySelectorAll('.formRow').forEach((row, index) => {
      const label = row.querySelector('label');
      const control = row.querySelector('input,select,textarea');
      if(label && control){
        if(!control.id) control.id = `${container.id}-field-${index}`;
        label.htmlFor = control.id;
      }
    });
  }

  function openFlowEditor(flowId){
    const flow = findFlow(flowId);
    if(!flow) return;
    stopAnimation(false);
    selectFlow(flowId);
    renderAll();
    flowEditorOriginalAll = JSON.parse(JSON.stringify(state.messageFlows));
    els.flowEditorBody.innerHTML='';
    populateFlowEditor(flow);
    els.flowEditorModal.classList.add('open');
    els.flowEditorModal.setAttribute('aria-hidden', 'false');
    els.app.inert = true;
    const first = els.flowEditorBody.querySelector('[data-edit="messageText"]') || els.flowEditorBody.querySelector('input,select,textarea,button');
    if(first) first.focus({preventScroll:true});
  }

  function closeFlowEditor(mode='ok'){
    if(!els.flowEditorModal) return;
    const flowId = els.flowEditorBody?.dataset.flowId;
    const original = flowEditorOriginalAll;
    if(mode==='ok'){const flow=findFlow(flowId);if(flow)flow.messageText=flow.messageText.trim() || 'Message';}
    const changed = original && JSON.stringify(state.messageFlows) !== JSON.stringify(original);
    if(mode === 'cancel' && original) state.messageFlows = original;
    flowEditorOriginalAll = null;
    els.flowEditorModal.classList.remove('open');
    els.flowEditorModal.setAttribute('aria-hidden', 'true');
    els.app.inert = false;
    if(mode === 'ok' && changed) pushHistory('edit flow step');
    renderAll();
    saveLocal(true);
    const trigger = Array.from(els.flowList.querySelectorAll('.flowItem')).find(item => item.dataset.flowId === flowId)?.querySelector('button[data-action="edit-flow"]');
    (trigger || $('addComponentBtn')).focus({preventScroll:true});
  }

  function onFlowEditorInput(e){
    // Hiding the dialog can emit a final change event after Cancel restored state.
    if(!flowEditorOriginalAll) return;
    const field = e.target.dataset.edit;
    if(!field) return;
    const flowId = els.flowEditorBody.dataset.flowId;
    const f = findFlow(flowId);
    if(!f) return;
    if(field === 'sequenceNumber') f[field] = e.target.value.trim();
    else if(field === 'timing') f.timing = e.target.value === 'withPrevious' && orderedFlows()[0]?.id!==f.id ? 'withPrevious' : 'afterPrevious';
    else f[field] = e.target.value;
    if(field === 'sourceComponentId') f.sourcePortId = '';
    if(field === 'targetComponentId') f.targetPortId = '';
    state.ui.selectedFlowId = f.id;
    renderCanvas(); renderFlowPanel(); renderProperties(); associateLabels(els.propertiesPanel); renderImagePanels(); updateStatus(); saveLocal(true);
    if(field === 'sourceComponentId' || field === 'targetComponentId') populateFlowEditor(f);
  }

  function moveFlowStepFromEditor(flowId, direction){
    const flows = orderedFlows();
    const index = flows.findIndex(f => f.id === flowId);
    if(index < 0) return;
    const targetIndex = clamp(index + direction, 0, flows.length - 1);
    if(targetIndex === index) return showToast(direction < 0 ? 'Step is already first' : 'Step is already last');
    const [moved] = flows.splice(index, 1);
    flows.splice(targetIndex, 0, moved);
    flows.forEach((f, i) => { f.sequenceNumber = i + 1; if(i === 0) f.timing = 'afterPrevious'; });
    state.ui.selectedFlowId = flowId;
    renderCanvas();
    renderFlowPanel();
    populateFlowEditor(findFlow(flowId));
    updateStatus();
    saveLocal(true);
  }

  function onFlowEditorClick(e){
    if(e.target === els.flowEditorModal || e.target.closest('[data-flow-editor-cancel]')) return closeFlowEditor('cancel');
    if(e.target.closest('[data-flow-editor-ok]')) return closeFlowEditor('ok');
    const action = e.target.closest('[data-action]')?.dataset.action;
    if(!action) return;
    const flowId = els.flowEditorBody.dataset.flowId;
    if(action === 'step-order-up') return moveFlowStepFromEditor(flowId, -1);
    if(action === 'step-order-down') return moveFlowStepFromEditor(flowId, 1);
    if(action === 'upload-image') return uploadImageForFlow(flowId);
    if(action === 'remove-image'){
      const f = findFlow(flowId);
      if(f){ f.processingImageDataUrl = ''; pushHistory('remove image'); renderAll(); populateFlowEditor(f); }
      return;
    }
    if(action === 'delete-flow'){
      state.messageFlows = state.messageFlows.filter(f => f.id !== flowId);
      renumberFlows();
      clearSelection(); closeFlowEditor('ok');
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
    els.animStatus.textContent = animation.running ? `${animation.paused ? 'Paused' : 'Animation'}: step ${activeSequenceLabel() || animation.index + 1}, ${animation.phase}${activeFlows().length > 1 ? ' (' + activeFlows().length + ' simultaneous)' : ''}` : 'Animation stopped';
    const hint = placement ? (elements.attached(placement.shape) ? `Place ${shapeLabel(placement.shape).toLowerCase()} on a component${placement.shape === 'umlPort' ? '' : ' or port'} · Esc to cancel` : `Place ${shapeLabel(placement.shape).toLowerCase()} · click to place · Esc to cancel`)
      : connectedDraft ? 'Choose an element to add and connect · Esc to cancel'
      : connectSourceId ? 'Drop on a component to connect, or on empty space to add one · Esc to cancel'
      : state.settings.activeCanvasMode === 'connect' ? 'Choose a source connection handle, then a destination' : '';
    $('drawingHint').textContent = hint;
    $('drawingHint').hidden = !hint;
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

  function beginPlacement(shape=state.settings.defaultShape){
    resetConnectionDraft(false);
    state.settings.defaultShape = shape;
    const rect = els.svg.getBoundingClientRect();
    placement = {shape, point:screenToWorld({x:rect.left + rect.width/2, y:rect.top + rect.height/2})};
    renderAll();
    els.svg.focus({preventScroll:true});
  }

  function placementComponent(){
    if(!placement?.point) return null;
    const {shape,point} = placement, {width,height} = elements.get(shape);
    const c={shape,name:shapeLabel(shape),x:snap(point.x-width/2),y:snap(point.y-height/2),width,height,fillColor:'#eff6ff',borderColor:'#2563eb',textColor:'#2563eb'};
    if(elements.attached(shape)){
      const attachment=attachmentAt(point,shape);
      if(attachment){Object.assign(c,attachment);elements.sync([...state.components,c]);}
    }
    return c;
  }

  function renderPlacementPreview(){
    els.overlayLayer.querySelector('.placementPreview')?.remove();
    const c = placementComponent();
    if(!c) return;
    const g = svgEl('g', {class:'placementPreview', 'aria-hidden':'true'});
    g.append(componentShapeEl(c), componentTextEl(c));
    els.overlayLayer.appendChild(g);
  }

  function commitPlacement(point){
    if(!placement) return;
    const shape=placement.shape;
    if(elements.attached(shape) && !attachmentAt(point,shape)){showToast('Place this element on a component'+(shape==='umlPort'?'':' or port'));return;}
    state.settings.defaultShape=shape;
    placement=null;
    addComponent(point.x,point.y);
    library?.used(shape);
    els.svg.focus({preventScroll:true});
  }

  function addComponent(x,y){
    const shape=state.settings.defaultShape || 'umlComponent',c=buildComponent(shape,x,y);
    state.components.push(c); elements.sync(state.components);
    selectComponent(c.id,false);pushHistory('add element');renderAll();return c;
  }

  function buildComponent(shape,x,y){
    const entry=elements.get(shape),{width,height}=entry;
    const count=state.components.filter(c=>c.shape===shape).length+1;
    const c={id:id('cmp'),name:entry.name+' '+count,shape,x:snap(x-width/2),y:snap(y-height/2),width,height,
      ...elements.style(state.settings.diagramTheme,state.settings.diagramPalette,shape),zIndex:shape==='package'?0:nextZ()};
    if(elements.attached(shape)) Object.assign(c,attachmentAt({x,y},shape));
    if(shape==='umlNode') c.nodeKind='node';
    return c;
  }

  function nextZ(){ return Math.max(0, ...state.components.map(c => c.zIndex || 0)) + 1; }

  function addFlow(sourceId, targetId, sourcePortId=null, targetPortId=null, connectionStyle=null, commit=true){
    if(!sourceId || !targetId) return;
    renumberFlows();
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
      style: { color:'#64748b', thickness:1.7, textColor:'#202b3c' }
    };
    state.messageFlows.push(f);
    selectFlow(f.id);
    resetConnectionDraft(false,false);
    if(commit){
      nameMessageFlowId=f.id;
      pushHistory('add flow');renderAll();showToast('Message flow created');
    }
    return f;
  }

  function openConnectedPicker(point=null){
    const source=findComponent(connectSourceId);if(!source)return;
    const side=portDefById(source,connectSourcePortId)?.[2]||'right';
    const shape=canConnect({shape:source.shape})&&!elements.attached(source.shape)?source.shape:'umlComponent';
    connectedDraft={sourceId:source.id,sourcePortId:connectSourcePortId,side,point,shape,reverse:false,style:connectChosenStyle,previewId:id('preview'),viewport:{panX:state.settings.panX,panY:state.settings.panY,zoom:state.settings.zoom}};
    connectTarget=null;library?.close();
    const preview=connectedComponent();
    const rect=els.svg.getBoundingClientRect();
    // Reveal the neighbour; only zoom out if the element itself cannot fit.
    state.settings.zoom=clamp(Math.min(state.settings.zoom,(rect.width-104)/Math.max(preview.width,210),(rect.height-144)/Math.max(preview.height,132)),MIN_ZOOM,MAX_ZOOM);
    const z=state.settings.zoom;
    const left=preview.x*z+state.settings.panX,top=preview.y*z+state.settings.panY;
    const right=left+Math.max(preview.width,210)*z,bottom=top+Math.max(preview.height,132)*z;
    state.settings.panX+=left<80?80-left:right>rect.width-24?rect.width-24-right:0;
    state.settings.panY+=top<24?24-top:bottom>rect.height-120?rect.height-120-bottom:0;
    connectedPicker.open({sourceName:source.name,point:{...worldToScreen({x:preview.x,y:preview.y+preview.height/2}),width:preview.width*state.settings.zoom},shape});
    renderAll();
  }

  function connectedComponent(){
    if(!connectedDraft)return null;
    const {sourceId,side,point,shape}=connectedDraft,source=findComponent(sourceId);if(!source)return null;
    const entry=elements.get(shape),size=shape===source.shape?source:entry;
    const box=globalThis.MessageFlowConnectionPlacement.place(source,side,point,size,state.components,state.settings.snapToGrid?GRID:0);
    return {id:connectedDraft.previewId,shape,name:entry.name,...box,...componentAppearance(source)};
  }

  function renderConnectedPreview(){
    const component=connectedComponent();if(!component)return;
    const source=findComponent(connectedDraft.sourceId),a=portPosition(source,connectedDraft.sourcePortId),port=nearestPortId(component,a);
    const group=svgEl('g',{class:'connectedPreview','aria-hidden':'true'});
    const padding=6/state.settings.zoom+(component.borderWidth || 0)/2;
    group.append(svgEl('rect',{class:'connectedPreviewOutline',x:component.x-padding,y:component.y-padding,width:component.width+padding*2,height:component.height+padding*2,rx:6/state.settings.zoom}));
    group.append(componentShapeEl(component),componentTextEl(component));els.overlayLayer.append(group);
    const flow={id:'preview',sourceComponentId:source.id,targetComponentId:component.id,sourcePortId:connectedDraft.sourcePortId,targetPortId:port,connectionStyle:connectedDraft.style};
    if(connectedDraft.reverse){[flow.sourceComponentId,flow.targetComponentId]=[flow.targetComponentId,flow.sourceComponentId];[flow.sourcePortId,flow.targetPortId]=[flow.targetPortId,flow.sourcePortId];}
    els.overlayLayer.append(svgEl('path',{class:'connectionDraftPreview',d:connectionPath(flow,[flow],id=>id===source.id?source:component).d,'marker-end':'url(#arrowSelected)'}));
  }

  function commitConnectedComponent(shape,reverse){
    if(!connectedDraft || !findComponent(connectedDraft.sourceId))return;
    Object.assign(connectedDraft,{shape,reverse});
    const draft={...connectedDraft},box=connectedComponent(),source=findComponent(draft.sourceId);
    const component=buildComponent(shape,box.x+box.width/2,box.y+box.height/2);
    Object.assign(component,componentAppearance(source),{x:box.x,y:box.y,width:box.width,height:box.height});state.components.push(component);
    const port=nearestPortId(component,portPosition(source,draft.sourcePortId));
    const flow=reverse?addFlow(component.id,source.id,port,draft.sourcePortId,draft.style,false):addFlow(source.id,component.id,draft.sourcePortId,port,draft.style,false);
    selectComponent(component.id,false);nameMessageFlowId=flow.id;library?.used(shape);
    pushHistory('add connected component');renderAll();
    const createdAt=historyIndex;
    openInlineEditor(component.name,{x:component.x+10,y:component.y+component.height/2-18,width:component.width-20,height:38},value=>{
      if(!findComponent(component.id))return;
      component.name=value.trim()||component.name;
      // Initial naming belongs to the creation, so one Undo removes both objects.
      if(historyIndex===createdAt){history[historyIndex]=snapshot();saveLocal(true);}else pushHistory('rename component');
      renderAll();
    },false);
    showToast('Component and connection created');
  }

  function renderNameMessageAction(){
    const button=$('nameMessageAction');if(!button)return;
    const flow=findFlow(nameMessageFlowId),box=labelPlacements.get(nameMessageFlowId);
    button.hidden=!flow||!box||state.ui.presentationMode||animation.running||!!connectSourceId||!!placement||!(state.ui.selectedFlowId===flow.id||isSelectedComponent(flow.sourceComponentId)||isSelectedComponent(flow.targetComponentId));
    if(button.hidden)return;
    const point=worldToScreen({x:box.x+box.width/2,y:box.y+box.height}),rect=els.svg.getBoundingClientRect();
    button.style.left=`${clamp(point.x-56,rect.left+8,rect.right-120)}px`;button.style.top=`${clamp(point.y+8,rect.top+8,rect.bottom-50)}px`;
  }

  function selectComponent(componentId, additive){
    sidebarTab = 'properties';
    if(additive){
      if(isSelectedComponent(componentId)) state.ui.selectedComponentIds = state.ui.selectedComponentIds.filter(id => id !== componentId);
      else state.ui.selectedComponentIds.push(componentId);
    }else{
      state.ui.selectedComponentIds = [componentId];
    }
    state.ui.selectedFlowId = null;
  }

  function selectFlow(flowId){
    lastComponentClick = null;
    sidebarTab = 'flow';
    state.ui.selectedComponentIds = [];
    state.ui.selectedFlowId = flowId;
  }

  function clearSelection(){
    lastComponentClick = null;
    state.ui.selectedComponentIds = [];
    state.ui.selectedFlowId = null;
  }

  function deleteSelection(){
    const ids = elements.descendants(state.ui.selectedComponentIds,state.components);
    if(ids.size){
      state.components = state.components.filter(c => !ids.has(c.id));
      state.components.forEach(c=>{if(ids.has(c.annotatedElementId))delete c.annotatedElementId;});
      state.messageFlows = state.messageFlows.filter(f => !ids.has(f.sourceComponentId) && !ids.has(f.targetComponentId));
      renumberFlows();
      clearSelection();
      pushHistory('delete components');
      renderAll();
      return;
    }
    if(state.ui.selectedFlowId){
      const idToDelete = state.ui.selectedFlowId;
      state.messageFlows = state.messageFlows.filter(f => f.id !== idToDelete);
      renumberFlows();
      if(state.ui.expandedFlowId === idToDelete) state.ui.expandedFlowId = null;
      clearSelection();
      pushHistory('delete flow');
      renderAll();
    }
  }

  function duplicateSelection(){
    const copyIds = elements.descendants(state.ui.selectedComponentIds,state.components,true);
    const selected = state.components.filter(c => copyIds.has(c.id));
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
    remapAttachments(copies,idMap);
    state.components.push(...copies);
    const existingFlows = orderedFlows();
    state.messageFlows.push(...flowCopies);
    renumberFlows([...existingFlows, ...flowCopies]);
    state.ui.selectedComponentIds = copies.map(c => c.id);
    state.ui.selectedFlowId = null;
    pushHistory('duplicate');
    renderAll();
  }

  function copySelection(cut=false){
    const ids = elements.descendants(state.ui.selectedComponentIds,state.components,true);
    if(!ids.size) return showToast('Select components to copy');
    clipboard = {
      components: state.components.filter(c => ids.has(c.id)).map(c => JSON.parse(JSON.stringify(c))),
      flows: state.messageFlows.filter(f => ids.has(f.sourceComponentId) && ids.has(f.targetComponentId)).map(f => JSON.parse(JSON.stringify(f)))
    };
    if(cut){state.ui.selectedComponentIds=[...ids];deleteSelection();}
    else { showToast('Copied'); renderToolbarState(); }
  }

  function pasteSelection(){
    if(!clipboard?.components?.length) return showToast('Clipboard is empty');
    if(clipboard.components.some(c=>c.ownerId && !clipboard.components.some(o=>o.id===c.ownerId) && !findComponent(c.ownerId))) return showToast('The copied attachment needs its original owner. Copy its component as well.');
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
    remapAttachments(copies,idMap);
    state.components.push(...copies);
    const existingFlows = orderedFlows();
    state.messageFlows.push(...flows);
    renumberFlows([...existingFlows, ...flows]);
    state.ui.selectedComponentIds = copies.map(c => c.id);
    state.ui.selectedFlowId = null;
    pushHistory('paste');
    renderAll();
  }

  function renumberFlows(flows=orderedFlows()){
    flows.forEach((f, i) => { f.sequenceNumber = i + 1; if(i === 0) f.timing = 'afterPrevious'; });
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
  function animationSourceIds(){ return new Set(animation.running && animation.phase === 'transfer' ? activeAnimatedFlows().map(f => f.sourceComponentId) : []); }
  function animationTargetIds(){ return new Set(animation.running && ['arrived','processing'].includes(animation.phase) && !animation.manualWaiting ? activeAnimatedFlows().map(f => f.targetComponentId) : []); }
  function processingPhaseEnabled(){ return !state.ui.presentationMode || state.settings.showProcessingActionInPresentation; }
  function animationProcessingIds(){ return animation.running && !animation.manualWaiting && animation.phase === 'processing' && processingPhaseEnabled() ? new Set(activeAnimatedFlows().map(f => f.targetComponentId)) : new Set(); }

  function finishManualMessage(){
    if(animation.autoTimer) clearTimeout(animation.autoTimer);
    animation.autoTimer = null;
    animation.autoRemaining = 0;
    activeFlows().forEach(flow => animation.completed.add(flow.id));
    if(animation.index >= animationGroups().length - 1) return completeAnimation();
    animation.manualWaiting = true;
    renderAll();
  }

  function reconcileProcessingPhase(){
    if(processingPhaseEnabled() || !animation.running) return;
    if(animation.phase === 'processing'){
      if(animation.autoTimer) clearTimeout(animation.autoTimer);
      animation.autoTimer = null;
      animation.autoRemaining = 0;
      animation.phase = 'arrived';
      animation.token = Object.fromEntries(activeFlows().map(flow => [flow.id, connectionPath(flow, orderedFlows()).targetPoint]));
      // Paused playback settles the message only after Resume, without another delay.
      if(!animation.paused && state.settings.animationMode === 'auto') return nextPhase();
    }
    if(animation.phase === 'arrived' && state.settings.animationMode === 'step' && !animation.phaseInspection && !animation.paused && !animation.manualWaiting) finishManualMessage();
  }

  function currentMessageIndex(){
    const groups = animationGroups();
    const selected = groups.findIndex(group => group.flows.some(flow => flow.id === state.ui.selectedFlowId));
    if(!animation.running && selected >= 0) return selected;
    if(animation.index >= 0 && animation.index < groups.length) return animation.index;
    return selected;
  }

  function previewMessage(index){
    const groups = animationGroups();
    if(!groups[index]) return;
    resetFeedback();
    if(animation.autoTimer) clearTimeout(animation.autoTimer);
    if(activeAnimationFrame) cancelAnimationFrame(activeAnimationFrame);
    animation.autoTimer = null; activeAnimationFrame = null;
    removeMeasurePath();
    animation.running = false; animation.paused = false;
    animation.manualWaiting = false; animation.phaseInspection = false;
    animation.phase = 'ready'; animation.index = index;
    animation.pathCache = null; animation.token = {}; animation.completed = new Set();
    clearSelection(); renderAll();
  }

  function jumpToMessage(index){
    if(!animationGroups()[index]) return;
    if(animation.running && !animation.paused) startAnimation(index);
    else previewMessage(index);
  }

  function moveMessage(direction){
    const index = currentMessageIndex();
    if(state.settings.animationMode === 'step'){
      if(direction < 0) return previewMessage(index - 1);
      if(manualMessageBusy()) return;
      const nextIndex = ['ready','stopped'].includes(animation.phase) ? Math.max(0,index) : index + 1;
      if(animationGroups()[nextIndex]) startAnimation(nextIndex);
      return;
    }
    jumpToMessage(index < 0 ? 0 : index + direction);
  }

  function manualMessageBusy(){
    return state.settings.animationMode === 'step' && animation.running && !animation.manualWaiting
      && (animation.paused || animation.phase === 'transfer' || !animation.phaseInspection);
  }

  function startAnimation(index=animation.phase === 'completed' ? 0 : currentMessageIndex(), phaseInspection=false){
    if(!validateFlow(false)) return;
    const continuing = animation.manualWaiting && index === animation.index + 1;
    resetFeedback();
    if(animation.autoTimer) clearTimeout(animation.autoTimer);
    animation.autoTimer = null;
    if(activeAnimationFrame) cancelAnimationFrame(activeAnimationFrame);
    activeAnimationFrame = null;
    resetConnectionDraft(false);
    clearSelection();
    animation.running = true;
    animation.paused = false;
    animation.phaseInspection = phaseInspection;
    animation.manualWaiting = false;
    animation.index = clamp(index, 0, animationGroups().length-1);
    animation.phase = 'transfer';
    if(!continuing) animation.completed = new Set();
    animation.token = {};
    animation.elapsedBeforePause = 0;
    beginTransfer();
    renderAll();
  }

  function stopAnimation(show=true){
    resetFeedback();
    animation.running = false;
    animation.paused = false;
    animation.phaseInspection = false;
    animation.manualWaiting = false;
    animation.index = -1;
    animation.completed = new Set();
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
    resetFeedback();
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
      const start = temp.getPointAtLength(0);
      temp.remove();
      return { flowId:flow.id, d:data.d, length, sourcePoint:{x:start.x,y:start.y}, targetPoint:data.targetPoint };
    });
    animation.pathCache = { paths };
    animation.transferDuration = motion.transferDuration(durationForAnimationSpeed(state.settings.animationSpeed),paths.map(path=>path.length));
    animation.transferProgress = 0;
    animation.phase = 'transfer';
    animation.token = Object.fromEntries(paths.map(path => [path.flowId,path.sourcePoint]));
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
    const duration = animation.transferDuration;
    const tick = (now) => {
      if(!animation.running || animation.paused){ removeMeasurePath(); return; }
      const elapsed = animation.elapsedBeforePause + (now - animation.startTime);
      const t = clamp(elapsed / duration, 0, 1);
      animation.transferProgress = t;
      const tokens = {};
      measures.forEach(m => {
        const p = m.el.getPointAtLength(m.length * (reducedMotion.matches ? (t >= 1 ? 1 : 0) : motion.travelProgress(t)));
        tokens[m.flowId] = { x:p.x, y:p.y };
      });
      animation.token = tokens;
      renderCanvas(); renderPlaybackProgress();
      if(t >= 1){
        removeMeasurePath();
        animation.phase = 'arrived';
        startPhaseFeedback('arrived',430);
        animation.token = Object.fromEntries(paths.map(path => [path.flowId, path.targetPoint]));
        renderAll();
        activeAnimationFrame = null;
        scheduleAutoNext(650);
        return;
      }
      activeAnimationFrame = requestAnimationFrame(tick);
    };
    activeAnimationFrame = requestAnimationFrame(tick);
  }

  function scheduleAutoNext(delay=700){
    if(animation.autoTimer) clearTimeout(animation.autoTimer);
    animation.autoTimer = null;
    animation.autoRemaining = delay;
    animation.autoDeadline = performance.now() + delay;
    if(!animation.running || animation.paused || animation.manualWaiting || (state.settings.animationMode !== 'auto' && animation.phaseInspection)) return;
    if(state.settings.animationMode === 'step' && animation.phase === 'arrived' && !processingPhaseEnabled()) return finishManualMessage();
    animation.autoTimer = setTimeout(() => {
      animation.autoTimer = null;
      if(animation.running && !animation.paused){
        if(state.settings.animationMode === 'step' && animation.phase === 'processing') return finishManualMessage();
        if(animation.phase === 'completed'){
          if(state.settings.animationMode === 'auto' && state.settings.loopAnimation !== false) startAnimation();
          else completeAnimation();
        }
        else nextPhase();
      }
    }, delay);
  }

  function nextPhase(){
    if(animation.paused) return;
    if(!animation.running) return startAnimation(undefined, animation.phaseInspection);
    const groups = animationGroups();
    const flows = activeFlows();
    if(!flows.length) return completeAnimation();
    if(animation.phase === 'transfer') return;
    if(animation.phase === 'arrived' && processingPhaseEnabled()){
      animation.phase = 'processing';
      startPhaseFeedback('processing',900);
      animation.token = {};
      renderAll();
      scheduleAutoNext(900);
      return;
    }
    if(animation.phase === 'processing' || animation.phase === 'arrived'){
      flows.forEach(flow => animation.completed.add(flow.id));
      animation.index++;
      if(animation.index >= groups.length) return completeAnimation();
      beginTransfer();
      renderAll();
    }
    if(animation.phase === 'stopped') startAnimation();
  }

  function prevPhase(){
    if(animation.paused) return;
    if(!animation.running) return;
    resetFeedback();
    if(animation.phase === 'processing'){
      animation.phase = 'arrived';
      animation.token = Object.fromEntries(activeFlows().map(flow => [flow.id, connectionPath(flow, orderedFlows()).targetPoint]));
    }else if(animation.phase === 'arrived'){
      animation.phase = 'transfer';
      beginTransfer();
      renderAll();
      return;
    }else if(animation.phase === 'transfer' && animation.index > 0){
      if(activeAnimationFrame) cancelAnimationFrame(activeAnimationFrame);
      activeAnimationFrame = null;
      removeMeasurePath();
      animation.pathCache = null;
      const groups = animationGroups();
      animation.index--;
      (groups[animation.index]?.flows || []).forEach(flow => animation.completed.delete(flow.id));
      animation.phase = processingPhaseEnabled() ? 'processing' : 'arrived';
      animation.token = processingPhaseEnabled() ? {} : Object.fromEntries(activeFlows().map(flow => [flow.id, connectionPath(flow, orderedFlows()).targetPoint]));
    }
    renderAll();
  }

  function inspectPhase(direction){
    if(state.settings.animationMode === 'auto' || animation.paused) return;
    if(direction > 0 && animation.phase === 'transfer') return;
    if(animation.autoTimer) clearTimeout(animation.autoTimer);
    animation.autoTimer = null;
    animation.phaseInspection = true;
    animation.manualWaiting = false;
    if(direction > 0) nextPhase();
    else prevPhase();
    renderToolbarState();
  }

  function completeAnimation(){
    removeMeasurePath();
    animation.manualWaiting = false;
    animation.index = Math.max(0,animationGroups().length-1);
    const loopAuto = state.settings.animationMode === 'auto' && animation.running && state.settings.loopAnimation !== false;
    animation.phase = 'completed';
    animation.token = {};
    if(loopAuto){
      animation.completed = new Set(orderedFlows().map(f => f.id));
      renderAll();
      scheduleAutoNext(900);
      return;
    }
    animation.running = false;
    renderAll();
    showToast('Animation completed');
  }

  function pauseResume(){
    if(animation.manualWaiting) return moveMessage(1);
    if(!animation.running) return startAnimation();
    if(animation.paused){
      animation.paused = false;
      runPhaseFeedback();
      animation.startTime = performance.now();
      if(animation.phase === 'transfer') animateTransfer();
      else scheduleAutoNext(animation.autoRemaining || 0);
      showToast('Animation resumed');
    }else{
      animation.paused = true;
      if(feedback.frame){
        cancelAnimationFrame(feedback.frame); feedback.frame = null;
        feedback.elapsed = Math.min(feedback.duration,performance.now()-feedback.started);
      }
      if(animation.phase === 'transfer') animation.elapsedBeforePause += performance.now() - animation.startTime;
      if(animation.autoTimer){
        animation.autoRemaining = Math.max(0, animation.autoDeadline - performance.now());
        clearTimeout(animation.autoTimer);
        animation.autoTimer = null;
      }
      if(activeAnimationFrame) cancelAnimationFrame(activeAnimationFrame);
      removeMeasurePath();
      showToast('Animation paused');
    }
    renderToolbarState();
    renderImagePanels();
    renderPlaybackProgress();
    updateStatus();
  }

  function renderPresentationControls(){
    const open=state.settings.presentationPanelOpen,tab=state.settings.presentationPanelTab;
    $('presentationDetailsBtn').setAttribute('aria-expanded',String(open));
    $('presentationDetailsBtn').setAttribute('aria-label',open?'Hide presentation details':'Show presentation details');
    $('presentationDetailsBtn').title=open?'Hide presentation panel':'Show details and flow overview';
    $('presentationFitBtn').setAttribute('aria-pressed',String(presentationAutoFit));
    $('presentationZoomValue').textContent=`${Math.round(state.settings.zoom*100)}%`;
    const fullscreen=!!document.fullscreenElement,button=$('presentationFullscreenBtn');
    button.disabled=!document.fullscreenEnabled && !fullscreen;
    button.setAttribute('aria-label',fullscreen?'Exit full screen':'Enter full screen');
    button.title=button.disabled?'Full screen is unavailable in this browser':fullscreen?'Exit full screen':'Enter full screen';
    button.querySelector('[data-icon]').innerHTML=icon(fullscreen?'exitFullscreen':'fullscreen');
    button.querySelector('.label').textContent=fullscreen?'Windowed':'Full screen';
    for(const name of ['details','flow']){
      const active=tab===name,node=$(name==='details'?'presentationDetailsTab':'presentationFlowTab');
      node.setAttribute('aria-selected',String(active));node.tabIndex=active?0:-1;
      $(name==='details'?'presentationDetailsPanel':'presentationFlowPanel').hidden=!active;
    }
  }

  function setPresentationTab(tab,focus=false){
    state.settings.presentationPanelTab=tab;renderPresentationControls();saveLocal(true);
    if(focus)$(tab==='details'?'presentationDetailsTab':'presentationFlowTab').focus();
  }

  function togglePresentationPanel(){
    state.settings.presentationPanelOpen=!state.settings.presentationPanelOpen;
    renderAll();refitPresentation();saveLocal(true);
    if(!state.settings.presentationPanelOpen)$('presentationDetailsBtn').focus();
  }

  async function togglePresentationFullscreen(){
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else{
        await document.documentElement.requestFullscreen();
        presentationOwnsFullscreen=true;
        if(!state.ui.presentationMode){await document.exitFullscreen();presentationOwnsFullscreen=false;}
      }
    }catch{showToast('Full screen could not start. You can still use presentation in this window.');}
  }

  function queuePresentationFit(){
    if(!state.ui.presentationMode || !presentationAutoFit || presentationFitFrame!==null)return;
    presentationFitFrame=requestAnimationFrame(()=>{presentationFitFrame=null;refitPresentation();});
  }

  function refitPresentation(){
    if(!state.ui.presentationMode || !presentationAutoFit)return;
    const rect=els.svg.getBoundingClientRect(),padding=24;
    if(rect.width<=padding*2||rect.height<=padding*2)return;
    const components=Array.from(els.componentsLayer.children,el=>el.getBBox());
    const paths=new Map(Array.from(els.connectionsLayer.querySelectorAll('.flowPath'),el=>[el.dataset.id,el.getBBox()]));
    const groups=animationGroups();
    function boundsAt(zoom){
      const boxes=[...components,...paths.values()],scale=presentationLabelScale(zoom);
      if(state.settings.showTokenMessageInPresentation){
        for(const flow of orderedFlows()){
          const box=paths.get(flow.id);if(!box)continue;
          const label=tokenLabel(flow),width=label.width*scale,height=(12+label.lines.length*17)*scale;
          boxes.push({x:box.x-width/2,y:box.y+16*scale,width:box.width+width,height:box.height+height});
        }
      }
      if(state.settings.showProcessingActionInPresentation){
        for(const group of groups){
          const callouts=globalThis.MessageFlowLabels.layoutCallouts(processingItems(group.flows,scale),state.components);
          boxes.push(...callouts.values());
        }
      }
      if(!boxes.length)return {x:0,y:0,width:640,height:360};
      const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
      return {x,y,width:Math.max(1,Math.max(...boxes.map(b=>b.x+b.width))-x),height:Math.max(1,Math.max(...boxes.map(b=>b.y+b.height))-y)};
    }
    // Labels have a minimum screen size, so their world-space bounds depend on zoom.
    // Find the largest fit once for all messages; playback never moves the camera.
    let low=.01,high=MAX_ZOOM;
    for(let i=0;i<22;i++){
      const zoom=(low+high)/2,bounds=boundsAt(zoom);
      if(bounds.width*zoom<=rect.width-padding*2 && bounds.height*zoom<=rect.height-padding*2)low=zoom;
      else high=zoom;
    }
    const bounds=boundsAt(low);
    state.settings.zoom=low;
    state.settings.panX=rect.width/2-(bounds.x+bounds.width/2)*low;
    state.settings.panY=rect.height/2-(bounds.y+bounds.height/2)*low;
    renderCanvas();renderToolbarState();
  }

  function fitToScreen(){
    if(state.ui.presentationMode){
      presentationAutoFit = true;
      refitPresentation();
      return;
    }
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
    if(!state.ui.presentationMode) labelPlacements.forEach(b => boxes.push({x:b.x,y:b.y,x2:b.x+b.width,y2:b.y+b.height}));
    if(!boxes.length) return {x:0,y:0,width:100,height:100};
    const x = Math.min(...boxes.map(b => b.x));
    const y = Math.min(...boxes.map(b => b.y));
    const x2 = Math.max(...boxes.map(b => b.x2));
    const y2 = Math.max(...boxes.map(b => b.y2));
    return { x, y, width:Math.max(1,x2-x), height:Math.max(1,y2-y) };
  }

  function setZoom(newZoom, centerClient){
    if(state.ui.presentationMode) presentationAutoFit = false;
    const old = state.settings.zoom;
    const z = clamp(newZoom, state.ui.presentationMode ? .01 : MIN_ZOOM, MAX_ZOOM);
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
    if(state.ui.presentationMode){setZoom(1);return;}
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
      const candidate = mergeDefaults(documents.normalizeDiagram(JSON.parse(text)));
      candidate.settings.diagramFileName = normalizedJsonFileName(sourceName || candidate.settings.diagramFileName);
      stopAnimation(false);
      resetConnectionDraft(false);
      sidebarTab = 'flow';
      state = candidate;
      currentFileName = candidate.settings.diagramFileName;
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

  function exportSnapshot(){
    const exportDoc=snapshot(),flows=orderedFlows(),host=svgEl('svg',{width:1,height:1,'aria-hidden':'true'});
    host.style.cssText='position:fixed;left:-10000px;top:0;pointer-events:none';
    // Capture portable geometry synchronously, without changing state or the live SVG.
    document.body.appendChild(host);
    try{
      const components=[...state.components].sort((a,b)=>Number(elements.attached(a.shape))-Number(elements.attached(b.shape)) || (a.zIndex||0)-(b.zIndex||0)).map(c=>{
        const group=svgEl('g',{});group.append(componentShapeEl(c),componentTextEl(c));host.appendChild(group);
        const b=group.getBBox(),clone=globalThis.MessageFlowImageExport.styledClone(group);
        clone.setAttribute('class','componentGroup');
        group.remove();
        return {...JSON.parse(JSON.stringify(c)),markup:new XMLSerializer().serializeToString(clone),bounds:{x:b.x,y:b.y,width:b.width,height:b.height}};
      });
      const paths=flows.map(flow=>{
        const path=connectionPath(flow,flows),measure=svgEl('path',{d:path.d});host.appendChild(measure);
        const b=measure.getBBox(),length=measure.getTotalLength();measure.remove();
        return {...JSON.parse(JSON.stringify(flow)),...path,length,bounds:{x:b.x,y:b.y,width:b.width,height:b.height}};
      });
      const rect=els.svg.getBoundingClientRect();
      return {components,flows:paths,settings:exportDoc.settings,presentation:state.ui.presentationMode,selectedIndex:Math.max(0,currentMessageIndex()),
        name:(currentFileName || 'Message flow').replace(/\.json$/i,''),
        viewport:{x:-state.settings.panX/state.settings.zoom,y:-state.settings.panY/state.settings.zoom,width:rect.width/state.settings.zoom,height:rect.height/state.settings.zoom}};
    }finally{host.remove();}
  }

  function openExport(){
    if(inlineEditor)closeInlineEditor(true);
    $('fileMenu').open=false;$('playbackOptions').open=false;
    exportDialog.open(exportSnapshot());
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

  function resetConnectionDraft(keepConnectMode=false,restoreView=true){
    if(restoreView&&connectedDraft?.viewport)Object.assign(state.settings,connectedDraft.viewport);
    connectedPicker?.close();connectedDraft=null;connectTarget=null;precisePortsId=null;nameMessageFlowId=null;
    lastComponentClick = null;
    placement = null;
    connectSourceId = null;
    connectSourcePortId = null;
    connectChosenStyle = null;
    connectPreviewPoint = null;
    if(!keepConnectMode) state.settings.activeCanvasMode = 'select';
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

  function loadExample(){
    if(state.components.length || state.messageFlows.length){
      if(!confirm('Replace current diagram with the example?')) return;
    }
    resetConnectionDraft(false);
    sidebarTab = 'flow';
    state = defaultState();
    state.settings.diagramFileName = 'Order flow example.json';
    currentFileName = state.settings.diagramFileName || 'event-flow-designer.json';
    const exampleProcessingImage = (title, subtitle, icon, color) => {
      const escapeXml = value => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f8fafc"/>
            <stop offset="100%" stop-color="#e0f2fe"/>
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#0f172a" flood-opacity="0.16"/>
          </filter>
        </defs>
        <rect width="960" height="540" rx="28" fill="url(#bg)"/>
        <rect x="88" y="84" width="784" height="372" rx="34" fill="#ffffff" filter="url(#shadow)"/>
        <circle cx="190" cy="270" r="76" fill="${color}" opacity="0.16"/>
        <circle cx="190" cy="270" r="52" fill="${color}"/>
        <text x="190" y="292" text-anchor="middle" font-size="58" font-family="Arial, sans-serif">${escapeXml(icon)}</text>
        <text x="300" y="230" font-size="42" font-weight="800" fill="#0f172a" font-family="Inter, Arial, sans-serif">${escapeXml(title)}</text>
        <text x="300" y="288" font-size="24" fill="#334155" font-family="Inter, Arial, sans-serif">${escapeXml(subtitle)}</text>
        <path d="M300 328 H790" stroke="#e2e8f0" stroke-width="3" stroke-linecap="round"/>
        <text x="300" y="374" font-size="22" fill="#64748b" font-family="Inter, Arial, sans-serif">Processing action shown during presentation</text>
      </svg>`;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    };
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
        controlPoint:{ x:286, y:212 },
        image:exampleProcessingImage('Validate order', 'Create order and reserve an order ID', '📝', '#2563eb')
      },
      {
        source:'Order Service', target:'Inventory Service', message:'Reserve Stock', action:'Check availability and reserve items',
        color:'#16a34a', sourcePortId:makePortId('right', 0.34), targetPortId:makePortId('left', 0.34),
        controlPoint:{ x:692, y:96 },
        image:exampleProcessingImage('Reserve stock', 'Check item availability in inventory', '📦', '#16a34a')
      },
      {
        source:'Inventory Service', target:'Order Service', message:'Stock Reserved', action:'Update the order with the reservation result',
        color:'#0f766e', sourcePortId:makePortId('left', 0.72), targetPortId:makePortId('right', 0.7),
        controlPoint:{ x:700, y:220 },
        image:exampleProcessingImage('Confirm reservation', 'Return stock reservation result', '✅', '#0f766e')
      },
      {
        source:'Order Service', target:'Payment Service', message:'Payment Request', action:'Authorize the payment',
        color:'#d97706', sourcePortId:makePortId('right', 0.84), targetPortId:makePortId('left', 0.28),
        controlPoint:{ x:706, y:232 },
        image:exampleProcessingImage('Authorize payment', 'Send payment request to provider', '💳', '#d97706')
      },
      {
        source:'Payment Service', target:'Order Service', message:'Payment Authorized', action:'Mark the order as paid',
        color:'#b45309', sourcePortId:makePortId('left', 0.7), targetPortId:makePortId('right', 0.96),
        controlPoint:{ x:700, y:360 },
        image:exampleProcessingImage('Payment authorized', 'Mark the order as paid', '🔐', '#b45309')
      },
      {
        source:'Order Service', target:'Notification Service', message:'Send Confirmation', action:'Create and dispatch the customer confirmation',
        color:'#9333ea', sourcePortId:makePortId('bottom', 0.42), targetPortId:makePortId('top', 0.56),
        controlPoint:{ x:480, y:246 },
        image:exampleProcessingImage('Prepare confirmation', 'Create the customer confirmation message', '✉️', '#9333ea')
      },
      {
        source:'Notification Service', target:'Web UI', message:'Confirmation Ready', action:'Show the order confirmation to the customer',
        color:'#7c3aed', sourcePortId:makePortId('left', 0.48), targetPortId:makePortId('bottom', 0.68),
        controlPoint:{ x:236, y:402 },
        image:exampleProcessingImage('Show confirmation', 'Display the confirmation in the Web UI', '🖥️', '#7c3aed')
      }
    ];

    state.messageFlows = defs.map((d, i) => ({
      id:id('flow'),
      sourceComponentId:byName[d.source],
      targetComponentId:byName[d.target],
      messageText:d.message,
      sequenceNumber:i+1,
      actionText:d.action,
      processingImageDataUrl:d.image || '',
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
    const session = flowEditorOriginalAll;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if(!file) return;
      if(!/^image\/(png|jpeg|jpg|gif|svg\+xml|webp)$/.test(file.type)) return showToast('Unsupported image format');
      const reader = new FileReader();
      reader.onload = () => {
        if(session !== flowEditorOriginalAll || findFlow(flowId) !== flow) return;
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
    lastComponentClick = null;
    const component = findComponent(componentId);
    if(!canConnect(component) || state.ui.presentationMode) return false;
    connectSourceId = componentId;
    connectSourcePortId = portId || nearestPortId(component, center(component));
    placement = null;
    connectChosenStyle = state.settings.defaultConnectionStyle || 'arc';
    connectPreviewPoint = portPosition(component, connectSourcePortId);
    state.settings.activeCanvasMode = 'connect';
    state.ui.selectedComponentIds = [componentId];
    state.ui.selectedFlowId = null;
    renderAll();
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
    if(e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    const target = e.target;
    const world = screenToWorld(e);

    if(state.ui.presentationMode || state.settings.activeCanvasMode === 'pan' || e.button === 1 || e.button === 2 || (e.spaceKeyTempPan === true)){
      drag = { type:'pan', startX:e.clientX, startY:e.clientY, panX:state.settings.panX, panY:state.settings.panY };
      els.svg.setPointerCapture(e.pointerId);
      renderAll();
      return;
    }

    if(state.ui.presentationMode) return;
    const quickHandle=target.closest?.('.quickConnect');
    if(quickHandle){
      startConnectionFromSource(quickHandle.dataset.id,makePortId(quickHandle.dataset.side,.5));
      drag={type:'connection',quick:true,startClientX:e.clientX,startClientY:e.clientY,moved:false};
      els.svg.setPointerCapture(e.pointerId);e.preventDefault();return;
    }
    if(placement){
      e.preventDefault();
      commitPlacement(world);
      return;
    }

    const label = target.closest?.('.flowLabelGroup');
    if(label){
      const flow = findFlow(label.dataset.id), box = labelPlacements.get(label.dataset.id);
      if(!flow || !box) return;
      const path = connectionPath(flow);
      selectFlow(flow.id);
      drag = {type:'label', flowId:flow.id, startWorld:world, startClientX:e.clientX, startClientY:e.clientY,
        original:flow.labelOffset ? {...flow.labelOffset} : null,
        origin:{x:box.x+box.width/2-path.labelX,y:box.y+box.height/2-path.labelY}, moved:false};
      els.svg.setPointerCapture(e.pointerId);
      e.preventDefault(); renderAll(); return;
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
    if(clickedPort){
      if(connectSourceId) handleConnectionPortClick(clickedPort);
      else {
        startConnectionFromSource(clickedPort.componentId, clickedPort.portId);
        drag = {type:'connection', startClientX:e.clientX, startClientY:e.clientY, moved:false};
        els.svg.setPointerCapture(e.pointerId);
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const connectionComponentId = componentIdFromTarget(target);
    if(connectionComponentId && connectSourceId && connectChosenStyle){
      const destination=resolveComponentPortFromPointer(e);
      if(destination)addFlow(connectSourceId, destination.componentId, connectSourcePortId, destination.portId, connectChosenStyle);
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
      sidebarTab = 'properties';
      const ctrlDragCopy = (e.ctrlKey || e.metaKey) && !e.shiftKey;
      if(ctrlDragCopy){
        const baseIds = isSelectedComponent(cid) ? [...state.ui.selectedComponentIds] : [cid];
        // A modifier click toggles selection; only crossing the drag threshold copies.
        drag = {
          type:'move', startWorld:world, originals:[], pendingCopyIds:baseIds,
          previousSelection:[...state.ui.selectedComponentIds], previousFlow:state.ui.selectedFlowId,
          modifiedClick:true, clickComponentId:cid, moved:false,
          startClientX:e.clientX, startClientY:e.clientY
        };
        els.svg.setPointerCapture(e.pointerId);
        renderAll();
        return;
      }
      if(!isSelectedComponent(cid)) selectComponent(cid, e.shiftKey || e.ctrlKey || e.metaKey);
      else if(e.shiftKey || e.ctrlKey || e.metaKey) selectComponent(cid, true);
      const selectedOriginals = expandMoveOriginalsForPackages(state.components.filter(c => state.ui.selectedComponentIds.includes(c.id)).map(c => JSON.parse(JSON.stringify(c))));
      drag = {
        type:'move',
        startWorld:world,
        originals:selectedOriginals,
        flowControlOriginals:flowControlOriginalsForComponentMove(selectedOriginals),
        clickComponentId:cid,
        modifiedClick:e.shiftKey || e.ctrlKey || e.metaKey,
        moved:false,
        startClientX:e.clientX,
        startClientY:e.clientY
      };
      els.svg.setPointerCapture(e.pointerId);
      renderAll();
      return;
    }

    clearSelection();
    drag = { type:'selectBox', startWorld:world, currentWorld:world };
    els.svg.setPointerCapture(e.pointerId);
    renderAll();
  }

  function beginComponentCopyDrag(){
    const copyIds = elements.descendants(drag.pendingCopyIds,state.components,true);
    const idMap = new Map();
    const copies = state.components.filter(c => copyIds.has(c.id)).map(c => {
      const copy = JSON.parse(JSON.stringify(c));
      copy.id = id('cmp'); copy.zIndex = nextZ() + idMap.size;
      idMap.set(c.id,copy.id);
      return copy;
    });
    const flowCopies = orderedFlows().filter(f => idMap.has(f.sourceComponentId) && idMap.has(f.targetComponentId)).map(f => ({
      ...JSON.parse(JSON.stringify(f)), id:id('flow'),
      sourceComponentId:idMap.get(f.sourceComponentId), targetComponentId:idMap.get(f.targetComponentId)
    }));
    remapAttachments(copies,idMap);
    const existingFlows = orderedFlows();
    state.components.push(...copies);
    state.messageFlows.push(...flowCopies);
    renumberFlows([...existingFlows,...flowCopies]);
    state.ui.selectedComponentIds = copies.map(c => c.id);
    state.ui.selectedFlowId = null;
    drag.originals = JSON.parse(JSON.stringify(copies));
    drag.flowControlOriginals = flowControlOriginalsForComponentMove(drag.originals);
    drag.copyDrag = true;
    drag.copiedComponentIds = copies.map(c => c.id);
    drag.copiedFlowIds = flowCopies.map(f => f.id);
    delete drag.pendingCopyIds;
  }

  function onSvgPointerMove(e){
    const world = screenToWorld(e);
    if(connectedDraft)return;
    if(placement && !drag){
      placement.point = world;
      renderPlacementPreview();
      return;
    }
    if(!drag){
      if(connectSourceId && connectChosenStyle){
        updateConnectionPreview(e,world);
        updateStatus();
      }
      return;
    }
    if(drag.type === 'label'){
      if(Math.hypot(e.clientX-drag.startClientX,e.clientY-drag.startClientY) > 4) drag.moved = true;
      if(drag.moved){
        findFlow(drag.flowId).labelOffset = {x:drag.origin.x + world.x-drag.startWorld.x,y:drag.origin.y + world.y-drag.startWorld.y};
        renderCanvas();
      }
      return;
    }
    if(drag.type === 'pan'){
      if(state.ui.presentationMode && Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>1) presentationAutoFit = false;
      state.settings.panX = drag.panX + (e.clientX - drag.startX);
      state.settings.panY = drag.panY + (e.clientY - drag.startY);
      renderAll();
      return;
    }
    if(drag.type === 'connection'){
      if(Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY) > 4) drag.moved = true;
      updateConnectionPreview(e,world);
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
      if(!drag.moved) return;
      if(drag.pendingCopyIds) beginComponentCopyDrag();
      drag.originals.forEach(orig => {
        const c = findComponent(orig.id);
        if(c){
          if(elements.attached(c.shape)){
            if(!drag.originals.some(o=>o.id===c.ownerId)){
              const a=elements.boundary(findComponent(c.ownerId),{x:orig.x+orig.width/2+dx,y:orig.y+orig.height/2+dy});
              c.attachment={side:a.side,ratio:a.ratio};
            }
          }else{c.x=snap(orig.x+dx);c.y=snap(orig.y+dy);}
        }
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
      c.x = snap(x); c.y = snap(y); c.width = Math.max(c.shape.startsWith('uml')?130:60, snap(w)); c.height = Math.max(c.shape.startsWith('uml')?80:44, snap(h));
      renderCanvas();
      return;
    }
    if(drag.type === 'selectBox'){
      drag.currentWorld = world;
      renderCanvas();
    }
  }

  function cancelGeometryDrag(){
    const cancelled=drag;
    if(!cancelled || !['move','resize'].includes(cancelled.type)) return false;
    drag=null;
    if(cancelled.copyDrag){
      const ids=new Set(cancelled.copiedComponentIds);
      state.components=state.components.filter(c=>!ids.has(c.id));
      state.messageFlows=state.messageFlows.filter(f=>!cancelled.copiedFlowIds.includes(f.id));
      state.ui.selectedComponentIds = cancelled.previousSelection;
      state.ui.selectedFlowId = cancelled.previousFlow;
    }else{
      for(const original of cancelled.originals || [cancelled.original]){
        const c=findComponent(original.id);if(c)Object.assign(c,original);
      }
      for(const original of cancelled.flowControlOriginals || []){
        const f=findFlow(original.id);if(f)f.controlPoint={...original.controlPoint};
      }
    }
    saveLocal(true);renderAll();return true;
  }

  function onSvgPointerUp(e){
    if(!drag) return;
    if(e.type === 'pointercancel' && cancelGeometryDrag()) return;
    const finishedDrag = drag;
    if(finishedDrag.type === 'label'){
      drag = null;
      try{ els.svg.releasePointerCapture(e.pointerId); }catch{}
      if(e.type === 'pointercancel'){
        if(finishedDrag.original) findFlow(finishedDrag.flowId).labelOffset = finishedDrag.original;
        else delete findFlow(finishedDrag.flowId).labelOffset;
        saveLocal(true);
      }else if(finishedDrag.moved){
        pushHistory('move label'); lastLabelClick = null;
      }else{
        const doubleClick = lastLabelClick?.id === finishedDrag.flowId && e.timeStamp-lastLabelClick.time < 450;
        lastLabelClick = {id:finishedDrag.flowId,time:e.timeStamp};
        if(doubleClick){ lastLabelClick = null; renameFlow(finishedDrag.flowId); return; }
      }
      renderAll(); focusFlowLabel(finishedDrag.flowId); return;
    }
    if(finishedDrag.type === 'connection'){
      drag = null;
      try{ els.svg.releasePointerCapture(e.pointerId); }catch{}
      if(e.type === 'pointercancel') resetConnectionDraft(false);
      else if(finishedDrag.moved){
        const drop = resolveComponentPortFromPointer(e);
        if(drop) addFlow(connectSourceId, drop.componentId, connectSourcePortId, drop.portId, connectChosenStyle);
        else {
          const hit=document.elementFromPoint(e.clientX,e.clientY);
          if(hit && els.svg.contains(hit) && !componentIdFromTarget(hit))openConnectedPicker(screenToWorld(e));
          else resetConnectionDraft(false);
        }
      }
      else if(finishedDrag.quick)openConnectedPicker();
      renderAll();
      return;
    }

    if(finishedDrag.type === 'move'){
      drag = null;
      try{ els.svg.releasePointerCapture(e.pointerId); }catch{}
      if(finishedDrag.pendingCopyIds){
        selectComponent(finishedDrag.clickComponentId, true);
        lastComponentClick = null;
        renderAll();
        return;
      }
      if(!finishedDrag.moved && finishedDrag.clickComponentId && !finishedDrag.modifiedClick){
        selectComponent(finishedDrag.clickComponentId, false);
        const doubleClick = lastComponentClick?.id === finishedDrag.clickComponentId
          && e.timeStamp - lastComponentClick.time < 450
          && Math.hypot(e.clientX - lastComponentClick.x, e.clientY - lastComponentClick.y) < 5;
        lastComponentClick = {id:finishedDrag.clickComponentId, time:e.timeStamp, x:e.clientX, y:e.clientY};
        if(doubleClick){
          lastComponentClick = null;
          renameComponent(finishedDrag.clickComponentId);
          return;
        }
      }else lastComponentClick = null;
      if(finishedDrag.moved) pushHistory(finishedDrag.copyDrag ? 'copy by ctrl-drag' : 'move');
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

    drag = null;
    if(finishedDrag.type === 'resize'){
      pushHistory('resize');
    }else if(finishedDrag.type === 'pan'){
      saveLocal(true);
    }else if(finishedDrag.type === 'selectBox'){
      selectByBox(finishedDrag.startWorld, finishedDrag.currentWorld);
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
    const rect=els.svg.getBoundingClientRect();
    if(!el || !els.svg.contains(el) || pointerEvent.clientX<rect.left || pointerEvent.clientX>rect.right || pointerEvent.clientY<rect.top || pointerEvent.clientY>rect.bottom)return null;
    const explicitPort = portFromTarget(el);
    if(explicitPort && canConnect(findComponent(explicitPort.componentId))) return explicitPort;
    const componentId = componentIdFromTarget(el);
    const component = findComponent(componentId);
    const world = screenToWorld(pointerEvent),source=findComponent(connectSourceId);
    let target=canConnect(component)?component:null;
    if(!target){
      const margin=18/state.settings.zoom;
      target=state.components.filter(c=>canConnect(c)&&c.id!==connectSourceId)
        .map(c=>({c,d:Math.hypot(Math.max(c.x-world.x,0,world.x-c.x-c.width),Math.max(c.y-world.y,0,world.y-c.y-c.height))}))
        .filter(item=>item.d<=margin).sort((a,b)=>a.d-b.d)[0]?.c;
    }
    if(!target)return null;
    const toward=source?portPosition(source,connectSourcePortId):world;
    return {componentId:target.id,portId:nearestPortId(target,toward)};
  }

  function updateConnectionPreview(event,world){
    connectTarget=resolveComponentPortFromPointer(event);
    connectPreviewPoint=connectTarget?portPosition(findComponent(connectTarget.componentId),connectTarget.portId):world;
    els.overlayLayer.querySelectorAll('.connectionDraftPreview,.connectionDraftDot,.connectionTargetOutline').forEach(node=>node.remove());
    renderConnectionDraftPreview();
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
    if(!target)return null;
    return target.closest?.('.componentGroup')?.dataset.id || target.dataset?.id && findComponent(target.dataset.id)?.id;
  }
  function flowIdFromTarget(target){
    return target.closest?.('.flowPath,.flowLabel,.flowLabelGroup')?.dataset.id || target.dataset?.id && findFlow(target.dataset.id)?.id;
  }

  function renameComponent(cid){
    const c = findComponent(cid);
    if(!c) return;
    selectComponent(cid,false);
    openInlineEditor(c.name, { x:c.x+10, y:c.y+c.height/2-18, width:c.width-20, height:38 }, (value) => {
      c.name = value.trim() || c.name;
      pushHistory('rename component'); renderAll();
    }, false);
    renderAll();
  }

  function focusFlowLabel(flowId){
    Array.from(els.labelsLayer.querySelectorAll('.flowLabelGroup')).find(label => label.dataset.id === flowId)?.focus({preventScroll:true});
  }

  function renameFlow(flowId){
    const f = findFlow(flowId), box = labelPlacements.get(flowId);
    if(!f || !box) return;
    selectFlow(flowId);
    openInlineEditor(f.messageText, box, value => {
      f.messageText = value.trim() || f.messageText;
      pushHistory('rename message'); renderAll();
    }, false);
  }

  function resetLabel(flowId){
    const flow = findFlow(flowId);
    if(!flow?.labelOffset) return;
    delete flow.labelOffset;
    pushHistory('reset label position'); renderAll();
  }

  function onSvgDblClick(e){
    if(inlineEditor || state.ui.presentationMode || placement || connectSourceId || portFromTarget(e.target)) return;
    // Selection repaints SVG children between clicks. Hit-test the current node
    // because the browser may dispatch the double-click on their SVG ancestor.
    const target = document.elementFromPoint(e.clientX, e.clientY) || e.target;
    const cid = componentIdFromTarget(target);
    if(cid){
      renameComponent(cid);
      return;
    }
    const fid = flowIdFromTarget(target);
    if(fid){
      renameFlow(fid);
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
    if(exportDialog?.isOpen()) return;
    if(connectedPicker?.isOpen())return;
    if(e.key === 'Escape' && cancelGeometryDrag()){e.preventDefault();return;}
    if(els.flowEditorModal?.classList.contains('open')){
      if(e.key === 'Escape'){ e.preventDefault(); closeFlowEditor('cancel'); }
      if(e.key === 'Tab'){
        const controls = Array.from(els.flowEditorModal.querySelectorAll('button,input,select,textarea')).filter(el => !el.disabled && el.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
      return;
    }
    if(e.key === 'Escape' && drag?.type === 'label'){
      e.preventDefault();
      const flow = findFlow(drag.flowId);
      if(drag.original) flow.labelOffset = drag.original;
      else delete flow.labelOffset;
      drag = null; saveLocal(true); renderAll(); return;
    }
    if(e.key === 'Escape' && library?.isOpen()){ e.preventDefault(); library.close(true); return; }
    if(isTextEditing()) return;
    const focusedLabel = e.target.closest?.('.flowLabelGroup');
    if(focusedLabel && !e.ctrlKey && !e.metaKey && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.key)){
      e.preventDefault();
      const flowId = focusedLabel.dataset.id;
      if(e.key === 'Enter') return renameFlow(flowId);
      const f = findFlow(flowId), box = labelPlacements.get(flowId), path = connectionPath(f);
      const amount = e.shiftKey ? 20 : 5;
      f.labelOffset = {x:box.x+box.width/2-path.labelX + (e.key === 'ArrowRight' ? amount : e.key === 'ArrowLeft' ? -amount : 0),
        y:box.y+box.height/2-path.labelY + (e.key === 'ArrowDown' ? amount : e.key === 'ArrowUp' ? -amount : 0)};
      selectFlow(flowId); pushHistory('move label'); renderAll(); focusFlowLabel(flowId); return;
    }
    const keyboardQuick=e.target.closest?.('.quickConnect');
    if(keyboardQuick && (e.key==='Enter'||e.key===' ')){
      e.preventDefault();startConnectionFromSource(keyboardQuick.dataset.id,makePortId(keyboardQuick.dataset.side,.5));openConnectedPicker();return;
    }
    const keyboardPort = portFromTarget(e.target);
    if(keyboardPort && (e.key === 'Enter' || e.key === ' ')){
      e.preventDefault();
      handleConnectionPortClick(keyboardPort);
      renderAll();
      Array.from(els.svg.querySelectorAll('.componentPort')).find(port => port.dataset.id === keyboardPort.componentId && port.dataset.port === keyboardPort.portId)?.focus();
      return;
    }
    if(e.target.closest?.('button,summary,a') && (e.key === ' ' || e.key === 'Enter')) return;
    if(placement && ['Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
      e.preventDefault();
      if(!placement.point){
        const rect = els.svg.getBoundingClientRect();
        placement.point = screenToWorld({x:rect.left + rect.width/2, y:rect.top + rect.height/2});
      }
      if(e.key === 'Enter') commitPlacement(placement.point);
      else {
        placement.point.x += e.key === 'ArrowRight' ? GRID : e.key === 'ArrowLeft' ? -GRID : 0;
        placement.point.y += e.key === 'ArrowDown' ? GRID : e.key === 'ArrowUp' ? -GRID : 0;
        renderPlacementPreview();
      }
      return;
    }
    if(e.target.closest?.('.componentGroup') && e.key === 'Enter'){
      e.preventDefault();
      const cid = componentIdFromTarget(e.target);
      selectComponent(cid, false);precisePortsId=cid;renderAll();
      Array.from(els.svg.querySelectorAll('.componentPort')).find(port => port.dataset.id === cid)?.focus();
      return;
    }
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
      if(state.ui.presentationMode && document.fullscreenElement) void document.exitFullscreen().catch(()=>{});
      else if(state.ui.presentationMode) togglePresentation(false);
      else { if(drag?.type === 'connection') drag = null; resetConnectionDraft(false); clearSelection(); renderAll(); }
    }
    else if(e.key === 'ArrowRight' && state.ui.presentationMode){ e.preventDefault(); moveMessage(1); }
    else if(e.key === 'ArrowLeft' && state.ui.presentationMode){ e.preventDefault(); moveMessage(-1); }
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
    const next = typeof force === 'boolean' ? force : !state.ui.presentationMode;
    if(next === state.ui.presentationMode) return;
    const selectedIndex = currentMessageIndex();
    state.ui.presentationMode = next;
    if(state.ui.presentationMode){
      presentationAutoFit = true;
      editorViewport = {zoom:state.settings.zoom,panX:state.settings.panX,panY:state.settings.panY};
      resetConnectionDraft(false);
      clearSelection();
      if(!animation.running && animationGroups().length) previewMessage(Math.max(0,selectedIndex));
      reconcileProcessingPhase();
      renderAll();
      fitToScreen();
    }else{
      if(presentationOwnsFullscreen && document.fullscreenElement) void document.exitFullscreen().catch(()=>{});
      presentationOwnsFullscreen = false;
      stopAnimation(false);
      if(editorViewport) Object.assign(state.settings, editorViewport);
      editorViewport = null;
      renderAll();
    }
    saveLocal(true);
    renderAll();
  }

  function setupEvents(){
    reducedMotion.addEventListener('change',() => {renderCanvas();renderPlaybackProgress();});
    globalThis.MessageFlowIcons.hydrate();
    library = globalThis.MessageFlowLibrary.create({panel:$('elementLibrary'),button:$('addComponentBtn'),icon,choose:beginPlacement,
      cancel:()=>{if(placement){placement=null;renderAll();}},
      preview:entry=>{const c={shape:entry.id,x:4,y:4,width:entry.width,height:entry.height,...elements.style('technical')};return `<svg viewBox="0 0 ${c.width+8} ${c.height+8}" aria-hidden="true">${componentShapeEl(c).outerHTML}</svg>`;}
    });
    $('diagramTheme').addEventListener('change',e=>applyDiagramTheme(e.target.value,$('diagramPalette').value));
    $('diagramPalette').addEventListener('change',e=>applyDiagramTheme('soft',e.target.value));
    $('diagramName').addEventListener('change', e => {
      state.settings.diagramFileName = normalizedJsonFileName(e.target.value || 'Untitled diagram');
      currentFileName = state.settings.diagramFileName;
      pushHistory('rename diagram'); renderToolbarState();
    });
    $('diagramName').addEventListener('keydown', e => { if(e.key === 'Enter') e.target.blur(); });
    for(const tab of ['flow','properties']){
      $(tab + 'Tab').addEventListener('click', () => setSidebarTab(tab));
      $(tab + 'Tab').addEventListener('keydown', e => {
        if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
          e.preventDefault(); e.stopPropagation();
          const next = e.key === 'Home' ? 'flow' : e.key === 'End' ? 'properties' : tab === 'flow' ? 'properties' : 'flow';
          setSidebarTab(next); $(next + 'Tab').focus();
        }
      });
    }
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
    $('focusFlowBtn').addEventListener('click', () => { state.settings.focusSelectedFlow = !state.settings.focusSelectedFlow; saveLocal(true); renderAll(); });
    $('startBtn').addEventListener('click', pauseResume);
    $('loopAnimation').addEventListener('change', e => { state.settings.loopAnimation = e.target.checked; saveLocal(true); });
    $('stopBtn').addEventListener('click', () => stopAnimation());
    $('prevMessageBtn').addEventListener('click', () => moveMessage(-1));
    $('nextMessageBtn').addEventListener('click', () => moveMessage(1));
    $('presentationTimeline').addEventListener('click', e => {
      const button = e.target.closest('[data-presentation-group]');
      if(button) jumpToMessage(Number(button.dataset.presentationGroup));
    });
    $('nextBtn').addEventListener('click', () => inspectPhase(1));
    $('prevBtn').addEventListener('click', () => inspectPhase(-1));
    $('presentationBtn').addEventListener('click', () => togglePresentation());
    $('presentationDetailsBtn').addEventListener('click',togglePresentationPanel);
    $('presentationFullscreenBtn').addEventListener('click',()=>void togglePresentationFullscreen());
    $('presentationFitBtn').addEventListener('click',fitToScreen);
    $('presentationZoomOutBtn').addEventListener('click',()=>setZoom(state.settings.zoom/1.15));
    $('presentationZoomInBtn').addEventListener('click',()=>setZoom(state.settings.zoom*1.15));
    for(const tab of ['details','flow']){
      const button=$(tab==='details'?'presentationDetailsTab':'presentationFlowTab');
      button.addEventListener('click',()=>setPresentationTab(tab));
      button.addEventListener('keydown',event=>{
        if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
          event.preventDefault();event.stopPropagation();
          setPresentationTab(event.key==='Home'?'details':event.key==='End'?'flow':tab==='details'?'flow':'details',true);
        }
      });
    }
    document.addEventListener('fullscreenchange',()=>{
      if(!document.fullscreenElement) presentationOwnsFullscreen=false;
      renderToolbarState();queuePresentationFit();
    });
    connectedPicker=globalThis.MessageFlowConnectedElements.create({
      entries:elements.entries.filter(entry=>canConnect({shape:entry.id})&&!elements.attached(entry.id)),icon,
      preview:entry=>{const c={shape:entry.id,x:4,y:4,width:entry.width,height:entry.height,...elements.style('technical')};return `<svg viewBox="0 0 ${c.width+8} ${c.height+8}" aria-hidden="true">${componentShapeEl(c).outerHTML}</svg>`;},
      onPreview:(shape,reverse)=>{if(connectedDraft){Object.assign(connectedDraft,{shape,reverse});renderCanvas();}},
      onChoose:commitConnectedComponent,
      onCancel:()=>{const source=connectSourceId;resetConnectionDraft(false);renderAll();Array.from(els.componentsLayer.children).find(el=>el.dataset.id===source)?.focus({preventScroll:true});}
    });
    const nameMessageButton=document.createElement('button');nameMessageButton.id='nameMessageAction';nameMessageButton.className='nameMessageAction';nameMessageButton.type='button';nameMessageButton.textContent='Name message';nameMessageButton.hidden=true;
    document.body.append(nameMessageButton);nameMessageButton.addEventListener('click',()=>{const flowId=nameMessageFlowId;nameMessageFlowId=null;nameMessageButton.hidden=true;renameFlow(flowId);});
    $('inactiveConnectionsBtn').addEventListener('click', () => {
      state.settings.showInactiveConnectionsInPresentation = !state.settings.showInactiveConnectionsInPresentation;
      saveLocal(true);
      renderAll();
    });
    for(const field of ['showTokenMessageInPresentation','showProcessingActionInPresentation']){
      $(field).addEventListener('change', event => {
        state.settings[field] = event.target.checked;
        if(field === 'showProcessingActionInPresentation') reconcileProcessingPhase();
        saveLocal(true);
        renderAll();
        refitPresentation();
      });
    }
    $('sampleBtn').addEventListener('click', loadExample);
    els.emptyExampleBtn?.addEventListener('click', loadExample);
    $('exportBtn').addEventListener('click', exportJson);
    $('importBtn').addEventListener('click', () => els.importInput.click());
    exportDialog=globalThis.MessageFlowExportDialog.create();
    $('exportVisualBtn').addEventListener('click',openExport);
    $('exportPresentationBtn').addEventListener('click',openExport);
    $('recoveryBtn').addEventListener('click', () => downloadBlob(autosave.recoveryText() || '', 'message-flow-recovery.json', 'application/json'));
    $('retrySaveBtn').addEventListener('click', () => {
      try{ autosave.resume(snapshot()); saveError = ''; }
      catch(err){ saveError = err.message; }
      renderSaveStatus();
    });
    $('validateBtn').addEventListener('click', () => validateFlow(true));
    $('alignHorizontalToolbarBtn')?.addEventListener('click', () => align('horizontal'));
    $('alignVerticalToolbarBtn')?.addEventListener('click', () => align('vertical'));
    $('distributeHToolbarBtn')?.addEventListener('click', distributeH);
    $('distributeVToolbarBtn')?.addEventListener('click', distributeV);
    els.closePanelBtn.addEventListener('click', () => {
      if(state.ui.presentationMode){togglePresentationPanel();return;}
      state.settings.flowPanelOpen = !state.settings.flowPanelOpen;
      saveLocal(true);
      renderAll();
    });
    els.importInput.addEventListener('change', () => { const file = els.importInput.files?.[0]; if(file) importJson(file); els.importInput.value = ''; });
    if(els.connectionStyleSelect) els.connectionStyleSelect.addEventListener('change', () => { const flow = selectedFlow(); if(flow){ flow.connectionStyle = els.connectionStyleSelect.value; pushHistory('connection style'); } else state.settings.defaultConnectionStyle = els.connectionStyleSelect.value; saveLocal(true); renderAll(); });
    els.modeSelect?.addEventListener('change', (e) => {
      const input = e.target.closest?.('input[name="animationMode"]');
      if(!input) return;
      state.settings.animationMode = input.value === 'auto' ? 'auto' : 'step';
      animation.phaseInspection = false;
      animation.manualWaiting = false;
      if(animation.autoTimer) clearTimeout(animation.autoTimer);
      animation.autoTimer = null;
      if(animation.running && !animation.paused && animation.phase !== 'transfer') scheduleAutoNext(animation.phase === 'arrived' ? 650 : 900);
      if(animation.phase === 'completed' && state.settings.animationMode === 'step') completeAnimation();
      saveLocal(true);
      renderAll();
    });
    els.sidePanelResizeHandle?.addEventListener('pointerdown', startFlowPanelResize);
    els.speedSelect.addEventListener('input', () => { state.settings.animationSpeed = Number(els.speedSelect.value); if(els.speedDisplay) els.speedDisplay.textContent = speedDisplayLabel(state.settings.animationSpeed); saveLocal(true); });
    if(els.fillColor) els.fillColor.addEventListener('input', () => { applyColor('fill', els.fillColor.value); });
    if(els.lineColor) els.lineColor.addEventListener('input', () => { applyColor('line', els.lineColor.value); });

    els.svg.addEventListener('pointerdown', onSvgPointerDown);
    els.svg.addEventListener('pointermove', onSvgPointerMove);
    els.svg.addEventListener('pointerup', onSvgPointerUp);
    els.svg.addEventListener('pointercancel', onSvgPointerUp);
    els.svg.addEventListener('pointerleave', () => { if(placement && !drag){ placement.point = null; renderPlacementPreview(); } });
    els.svg.addEventListener('dragover', e => {
      if(!placement) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
      placement.point = screenToWorld(e); renderPlacementPreview();
    });
    els.svg.addEventListener('drop', e => {
      if(!placement) return;
      e.preventDefault(); commitPlacement(screenToWorld(e));
    });
    els.svg.addEventListener('contextmenu', (e) => e.preventDefault());
    els.svg.addEventListener('dblclick', onSvgDblClick);
    els.svg.addEventListener('wheel', onWheel, { passive:false });
    els.svg.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('click', (e) => {
      if(!els.contextMenu.contains(e.target)) closeContextMenu();
      document.querySelectorAll('.menuGroup[open]').forEach(menu => {
        if(!menu.contains(e.target) || (menu.id !== 'playbackOptions' && e.target.closest('.menuPanel button,.menuPanel a'))) menu.removeAttribute('open');
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
    window.addEventListener('resize', () => {renderAll();queuePresentationFit();});
    new ResizeObserver(queuePresentationFit).observe(els.svg);

    setupAppearance();
    flowReorder=globalThis.MessageFlowReorder.create({list:els.flowList,commit:(ids,id)=>{renumberFlows(ids.map(findFlow));selectFlow(id);pushHistory('reorder flows');renderAll();focusFlowGrip(id);showToast('Step order updated');},cancelled:(id,cancel)=>{renderFlowPanel(true);focusFlowGrip(id);if(cancel)showToast('Move cancelled');}});
    els.flowList.addEventListener('dblclick',e=>{const row=e.target.closest('.flowItem');if(row&&!e.target.closest('button,input,select,textarea'))openFlowEditor(row.dataset.flowId);});
    els.flowList.addEventListener('click', onFlowListClick);
    els.flowList.addEventListener('keydown',e=>{
      const item=e.target.closest('.flowItem');
      if(item&&e.target.matches('.flowDragHandle')&&e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){
        e.preventDefault();e.stopPropagation();moveFlowInList(item.dataset.flowId,e.key==='ArrowUp'?-1:1);
      }
    });
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
    if(e.target.matches('input,textarea,select,label')) return;
    const action = e.target.closest('[data-action]')?.dataset.action;
    if(action === 'reset-label') return resetLabel(flowId);
    if(action === 'start-here') return startAnimation(animationGroups().findIndex(group => group.flows.some(f => f.id === flowId)));
    if(action === 'drag-flow'){
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if(action === 'toggle-details'){
      selectFlow(flowId);
      state.ui.expandedFlowId = state.ui.expandedFlowId === flowId ? null : flowId;
      renderAll();
      return;
    }
    if(action === 'move-up' || action === 'move-down') return moveFlowInList(flowId, action === 'move-up' ? -1 : 1);
    if(action === 'upload-image') return uploadImageForFlow(flowId);
    if(action === 'remove-image'){
      findFlow(flowId).processingImageDataUrl = '';
      pushHistory('remove image'); renderAll(); return;
    }
    if(action === 'delete-flow'){
      selectFlow(flowId); deleteSelection(); return;
    }
    if(action === 'toggle-connector-visibility'){
      e.preventDefault();
      e.stopPropagation();
      const flow = findFlow(flowId);
      if(!flow) return;
      flow.hiddenInDrawingMode = !flow.hiddenInDrawingMode;
      selectFlow(flow.id);
      pushHistory(flow.hiddenInDrawingMode ? 'hide connector in drawing mode' : 'show connector in drawing mode');
      renderAll();
      showToast(flow.hiddenInDrawingMode ? 'Connector hidden in drawing mode' : 'Connector shown in drawing mode');
      return;
    }
    if(action === 'edit-flow') return openFlowEditor(flowId);
    selectFlow(flowId); renderToolbarState(); renderCanvas(); renderProperties(); associateLabels(els.propertiesPanel); updateStatus();
    els.flowList.querySelectorAll('.flowItem').forEach(row=>row.classList.toggle('selected',row.dataset.flowId===flowId));
  }

  function moveFlowInList(flowId, direction){
    const flows = orderedFlows();
    const from = flows.findIndex(f => f.id === flowId);
    const to = from + direction;
    if(from < 0 || to < 0 || to >= flows.length) return;
    const [moved] = flows.splice(from, 1);
    flows.splice(to, 0, moved);
    renumberFlows(flows);
    selectFlow(flowId);
    pushHistory('reorder flows'); renderAll();
    const row = Array.from(els.flowList.querySelectorAll('.flowItem')).find(item => item.dataset.flowId === flowId);
    row?.scrollIntoView({block:'nearest'});
    row?.querySelector('.flowDragHandle')?.focus({preventScroll:true});
  }

  function focusFlowGrip(id){
    const row=[...els.flowList.querySelectorAll('.flowItem')].find(c=>c.dataset.flowId===id);
    row?.querySelector('.flowDragHandle')?.focus({preventScroll:true});
  }

  function onFlowDragEnd(){flowReorder?.cancel();}

  function onPropertyInput(e){
    const comp = selectedComponent();
    const flow = selectedFlow();
    if(comp){
      if(e.target.id === 'propName') comp.name = e.target.value;
      if(['propWidth','propHeight'].includes(e.target.id)){
        if(!e.target.checkValidity()){if(e.type==='change')e.target.reportValidity();return;}
        comp[e.target.id==='propWidth'?'width':'height']=Number(e.target.value);
      }
      if(e.target.id === 'propShape'){
        const shape=e.target.value;
        if(!elements.canOwn({shape},'umlPort') && state.components.some(c=>c.ownerId===comp.id)){showToast('Remove attached ports and interfaces before changing to this shape');e.target.value=comp.shape;return;}
        comp.shape=shape;
        if(shape!=='umlComment')delete comp.annotatedElementId;
      }
      if(e.target.id === 'propStereotype') comp.stereotype=e.target.value;
      if(e.target.id === 'propDetails') comp.details=e.target.value;
      if(e.target.id === 'propNodeKind') comp.nodeKind=e.target.value;
      if(e.target.id === 'propAnnotation') comp.annotatedElementId=e.target.value;
      if(e.target.id === 'propOwner'){comp.ownerId=e.target.value;elements.sync(state.components);}
      if(e.target.id === 'propAttachmentSide') comp.attachment.side=e.target.value;
      if(e.target.id === 'propAttachmentRatio') comp.attachment.ratio=Math.max(0,Math.min(100,Number(e.target.value)))/100;
      if(e.target.id === 'propFill') comp.fillColor = e.target.value;
      if(e.target.id === 'propBorder') comp.borderColor = e.target.value;
      if(e.target.id === 'propText') comp.textColor = e.target.value;
      renderCanvas(); renderFlowPanel(); saveLocal(true);
      if(e.type === 'change'){pushHistory('edit component');if(['propShape','propNodeKind','propOwner'].includes(e.target.id))renderAll();}
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
      if(e.type === 'change') pushHistory('edit flow properties');
    }
  }

  function onPropertyClick(e){
    if(e.target.closest('#editSelectedFlow'))return openFlowEditor(state.ui.selectedFlowId);
    if(e.target.closest('#resetLabelBtn')) return resetLabel(state.ui.selectedFlowId);
    if(e.target.id === 'duplicatePropBtn') duplicateSelection();
  }

  function initHistory(){
    history = [snapshot()];
    historyIndex = 0;
  }

  setupEvents();
  initHistory();
  renderAll();
  renderSaveStatus();
  setTimeout(() => saveLocal(true), 300);
};
if(typeof document !== 'undefined' && document.currentScript) globalThis.bootstrapMessageFlow();
