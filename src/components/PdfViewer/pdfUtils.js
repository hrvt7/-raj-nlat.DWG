// ── Map assembly to COUNT_CATEGORIES key ─────────────────────────────────────
// When users select an assembly from AssemblyDropdown (e.g. ASM-001), the marker
// must store the matching COUNT_CATEGORY key (socket, switch, light, etc.) so that
// EstimationPanel can count and price them correctly.
export function resolveCountCategory(assemblyId, assemblies) {
  if (!assemblyId?.startsWith?.('ASM-')) return assemblyId // already a category key
  const asm = assemblies?.find(a => a.id === assemblyId)
  if (!asm) return 'other'
  if (asm.category === 'vilagitas') return 'light'
  if (asm.category === 'elosztok') return 'elosztok'
  if (asm.category === 'kabeltalca') return 'conduit' // cable trays → conduit category (structural)
  if (asm.category === 'tuzjelzo') return 'light' // fire detectors are ceiling-mounted like lights
  if (asm.category === 'gyengaram') return 'socket' // data points are wall-mounted like sockets
  if (asm.category === 'szerelvenyek') {
    const up = (asm.name || '').toUpperCase()
    if (up.includes('DUGALJ') || up.includes('ALJZAT') || up.includes('SOCKET') || up.includes('KONNEKTOR')) return 'socket'
    if (up.includes('KAPCSOL') || up.includes('SWITCH') || up.includes('DIMMER') || up.includes('VÁLTÓ') || up.includes('VALTO')) return 'switch'
    return 'socket' // default for szerelvenyek
  }
  // Any other category (bontas, nyomvonal, dobozolas, kabelezes, kotesek, etc.)
  // is structural work — no cable route should be drawn to these
  return 'other'
}

// ── Migrate legacy markers ──────────────────────────────────────────────────
// Older markers stored assembly IDs (ASM-xxx) as category. Convert them to
// proper COUNT_CATEGORY keys while preserving the assembly ID in asmId.
export function migrateMarkers(markers, assemblies) {
  if (!markers?.length || !assemblies?.length) return markers
  let changed = false
  const migrated = markers.map(m => {
    if (m.category?.startsWith?.('ASM-')) {
      changed = true
      const resolved = resolveCountCategory(m.category, assemblies)
      return { ...m, category: resolved, asmId: m.asmId || m.category }
    }
    return m
  })
  return changed ? migrated : markers
}

export function formatDist(m) {
  if (m < 0.01) return `${(m * 1000).toFixed(1)} mm`
  if (m < 1) return `${(m * 100).toFixed(1)} cm`
  if (m < 100) return `${m.toFixed(2)} m`
  return `${m.toFixed(1)} m`
}

// ── Rotation-invariant coordinate helpers ─────────────────────────────────
// W, H are UNROTATED page dimensions (at 1× scale).
// Rotation is CW in degrees (0, 90, 180, 270).
//
// docToCanvas: unrotated document coords → rotated canvas coords
// canvasToDoc: rotated canvas coords → unrotated document coords
//
// These ensure markers are stored in rotation-invariant (doc) space and
// rendered correctly regardless of the current rotation.

export function docToCanvas(dx, dy, rot, W, H) {
  switch (rot) {
    case 90:  return { x: dy,     y: W - dx }
    case 180: return { x: W - dx, y: H - dy }
    case 270: return { x: H - dy, y: dx }
    default:  return { x: dx,     y: dy }
  }
}

export function canvasToDoc(cx, cy, rot, W, H) {
  switch (rot) {
    case 90:  return { x: W - cy, y: cx }
    case 180: return { x: W - cx, y: H - cy }
    case 270: return { x: cy,     y: H - cx }
    default:  return { x: cx,     y: cy }
  }
}

// ─── Drawing helpers (same as DXF overlay) ──────────────────────────────────

export function drawMarker(ctx, x, y, color, zoom, source) {
  const r = Math.max(6, 10 * Math.min(zoom, 1.5))
  const isDetection = source === 'detection'

  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color + (isDetection ? '20' : '40')
  ctx.fill()
  ctx.lineWidth = isDetection ? 1.5 : 2

  if (isDetection) {
    // Dashed border for auto-detected markers
    ctx.setLineDash([3, 3])
  }
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.setLineDash([]) // reset

  // Cross (manual) or dot (detection)
  if (isDetection) {
    // Small inner dot for detection markers
    ctx.beginPath()
    ctx.arc(x, y, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  } else {
    // Cross for manual markers
    const c = r * 0.5
    ctx.beginPath()
    ctx.moveTo(x - c, y); ctx.lineTo(x + c, y)
    ctx.moveTo(x, y - c); ctx.lineTo(x, y + c)
    ctx.stroke()
  }
}

export function drawMeasureLine(ctx, x1, y1, x2, y2, label, color) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.setLineDash([6, 3])
  ctx.stroke()
  ctx.setLineDash([])

  // Endpoints
  for (const [ex, ey] of [[x1, y1], [x2, y2]]) {
    ctx.beginPath()
    ctx.arc(ex, ey, 4, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  // Label
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  ctx.font = '600 12px "DM Mono", monospace'
  const tw = ctx.measureText(label).width
  ctx.fillStyle = 'rgba(0,0,0,0.8)'
  ctx.fillRect(mx - tw / 2 - 6, my - 18, tw + 12, 22)
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, mx, my - 7)
}
