/* Small, local outline icon set shared by both entry points. */
(function(root){
  'use strict';
  const paths = {
    workflow:'M3 3h6v6H3zM15 15h6v6h-6zM6 9v7a2 2 0 002 2h7M9 6h7a2 2 0 012 2v7',
    pencil:'M14 5l5 5M4 20l4-1L21 6a2 2 0 00-3-3L5 16z',
    eyeOff:'M3 3l18 18M10 5a12 12 0 012 0c6 0 10 7 10 7a17 17 0 01-3 4M6 6a24 24 0 00-4 6s4 7 10 7a12 12 0 005-1M10 10a3 3 0 004 4',
    star:'M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
    search:'M16 16l5 5M18 10a8 8 0 11-16 0 8 8 0 0116 0',
    palette:'M12 3a9 9 0 100 18h2a2 2 0 001-4 2 2 0 012-3h2a3 3 0 003-3 9 9 0 00-10-8M7 8h.01M12 6h.01M17 8h.01M6 13h.01',
    select:'M5 3l14 9-7 1-3 7z',
    hand:'M8 12V7a2 2 0 014 0v5-8a2 2 0 014 0v8-5a2 2 0 014 0v8c0 4-2 7-6 7h-1c-3 0-4-2-6-5l-3-4a2 2 0 013-2l1 1',
    plus:'M12 5v14M5 12h14', minus:'M5 12h14',
    connect:'M4 4h5v5H4zM15 15h5v5h-5zM9 6h6a3 3 0 013 3v6',
    undo:'M8 4L3 9l5 5M3 9h11a6 6 0 010 12',
    redo:'M16 4l5 5-5 5M21 9H10a6 6 0 000 12',
    play:'M8 4l12 8-12 8z', pause:'M8 5v14M16 5v14', stop:'M6 6h12v12H6z',
    previous:'M15 5l-7 7 7 7', next:'M9 5l7 7-7 7',
    phasePrevious:'M5 5v14M18 5l-9 7 9 7z', phaseNext:'M19 5v14M6 5l9 7-9 7z',
    down:'M6 9l6 6 6-6', up:'M6 15l6-6 6 6',
    close:'M6 6l12 12M18 6L6 18',
    grip:'M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01',
    image:'M4 4h16v16H4zM4 16l5-5 5 5 3-3 3 3M15 8h.01',
    settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
    eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM15 12a3 3 0 11-6 0 3 3 0 016 0',
    fit:'M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5',
    reset:'M4 9a8 8 0 111 9M4 4v5h5',
    trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
    copy:'M8 8h12v13H8zM16 8V3H3v13h5',
    check:'M5 12l4 4L19 6',
    grid:'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
    focus:'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5M8 12h8M12 8v8',
    screen:'M3 4h18v13H3zM8 21h8M12 17v4',
    panel:'M3 4h18v16H3zM15 4v16',
    fullscreen:'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5',
    exitFullscreen:'M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3',
    repeat:'M4 8h13l-3-3M20 16H7l3 3M20 8v4M4 16v-4'
  };
  function svg(name){
    return `<svg class="uiIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.settings}"/></svg>`;
  }
  function hydrate(container=document){
    container.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = svg(el.dataset.icon); });
  }
  root.MessageFlowIcons = Object.freeze({svg, hydrate});
})(globalThis);
