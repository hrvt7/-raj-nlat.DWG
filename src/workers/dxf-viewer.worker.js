// ─── dxf-viewer Web Worker ────────────────────────────────────────────────────
// Offloads heavy DXF parsing (geometry, blocks, text rendering) to a background
// thread so the main UI thread never freezes, even for large 100+ MB DXF files.
//
// Usage in DxfViewerCanvas.jsx:
//   workerFactory: () => new Worker(
//     new URL('../workers/dxf-viewer.worker.js', import.meta.url),
//     { type: 'module' }
//   )
import { DxfViewer } from 'dxf-viewer'

DxfViewer.SetupWorker()
