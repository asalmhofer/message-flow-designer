// Compatibility entry point: both page formats use the same implementation.
import '../model/elementCatalog.js';
import '../canvas/umlRenderer.js';
import '../ui/elementLibrary.js';
import '../canvas/connectionPlacement.js';
import '../ui/connectedElements.js';
import '../storage/diagramDocument.js';
import '../canvas/imageExport.js';
import '../canvas/labelLayout.js';
import '../ui/icons.js';
import '../ui/appearanceInspector.js';
import '../ui/flowReorder.js';
import '../animation/motion.js';
import '../export/timeline.js';
import '../export/renderer.js';
import '../export/encoders.js';
import '../export/dialog.js';
import '../runtime/app.js';

export function bootstrapLegacyApp(){
  globalThis.bootstrapMessageFlow();
}
