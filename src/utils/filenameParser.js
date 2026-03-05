// ─── Filename Metadata Parser ─────────────────────────────────────────────────
// Extracts floor and discipline from DXF/PDF filenames using pattern matching.
// Pure function — no side effects, fully testable.
//
// Examples:
//   pince_vilagitas.pdf        → { floor: 'Pince',     discipline: 'Világítás' }
//   alaprajz_fsz_erosaram.dxf  → { floor: 'Fsz',       discipline: 'Erősáram' }
//   tuzjelzo_1em.pdf           → { floor: '1. emelet', discipline: 'Tűzjelző' }
//   projekt_final_v3.pdf       → { floor: null,        discipline: null }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize: lowercase + strip accents + collapse separators to spaces.
 */
function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .replace(/[_\-.\s]+/g, ' ')       // collapse separators
    .trim()
}

// ── Floor patterns ────────────────────────────────────────────────────────────
const FLOOR_PATTERNS = [
  { re: /\bpince\b/,                          floor: 'Pince'       },
  { re: /\bfsz\b|\bfold\s*szint\b/,           floor: 'Fsz'         },
  { re: /\b1\s*em(elet)?\b|\b1\s*\.\s*em\b/, floor: '1. emelet'   },
  { re: /\b2\s*em(elet)?\b|\b2\s*\.\s*em\b/, floor: '2. emelet'   },
  { re: /\b3\s*em(elet)?\b|\b3\s*\.\s*em\b/, floor: '3. emelet'   },
  { re: /\b4\s*em(elet)?\b|\b4\s*\.\s*em\b/, floor: '4. emelet'   },
  { re: /\bteto\b|\bteto\s*szint\b/,          floor: 'Tető'        },
]

// ── Discipline patterns ───────────────────────────────────────────────────────
const DISCIPLINE_PATTERNS = [
  { re: /\bvilagitas\b/,                              discipline: 'Világítás'   },
  { re: /\berosaram\b/,                               discipline: 'Erősáram'    },
  { re: /\bkabelt(alca)?\b|\bkabel\s*talca\b/,        discipline: 'Kábeltálca'  },
  { re: /\btuzjelzo\b|\btuz\s*jelzo\b/,               discipline: 'Tűzjelző'    },
  { re: /\bgyengearam\b|\bgyenge\s*aram\b/,           discipline: 'Gyengeáram'  },
]

/**
 * Parse floor and discipline from a filename.
 *
 * @param {string} filename - Full filename including extension (e.g. 'pince_vilagitas.pdf')
 * @returns {{ floor: string|null, discipline: string|null }}
 */
export function parseFilenameMetadata(filename) {
  // Strip extension, normalize
  const base = (filename || '').replace(/\.[^/.]+$/, '')
  const n = norm(base)

  let floor = null
  let discipline = null

  for (const { re, floor: f } of FLOOR_PATTERNS) {
    if (re.test(n)) { floor = f; break }
  }

  for (const { re, discipline: d } of DISCIPLINE_PATTERNS) {
    if (re.test(n)) { discipline = d; break }
  }

  return { floor, discipline }
}
