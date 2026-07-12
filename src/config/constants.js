export const DEFAULT_SCHEMA_VERSION = 2;
export const STORAGE_KEY = 'event-flow-designer-state-v2';
export const GRID_SIZE = 24;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3.2;
export const MOVE_DURATIONS = Object.freeze({ slow: 2200, normal: 1300, fast: 650 });
export const DEFAULT_COMPONENT_SIZE = Object.freeze({ width: 160, height: 80 });
export const COMPONENT_TYPES = Object.freeze([
  'package','roundedRectangle','rectangle','ellipse','diamond','hexagon','triangle','pentagon','trapezoid','parallelogram','cylinder','queue','document','note','cloud','actor'
]);
export const CONNECTOR_TYPES = Object.freeze(['straight', 'arc', 'angular']);
export const EXECUTION_MODES = Object.freeze(['afterPrevious', 'withPrevious']);
