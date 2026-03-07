# PdfMergePanel — Empty-State Guidance Brief

> Scope: a PdfMergePanel "Nincsenek kalkulált elemek" zsákutcájának javítása — pilot readiness audit #3.
> Cél: a user lássa melyik terven hiányzik a kalkuláció, és egy kattintással megnyithassa.
> Nem cél: merge logika redesign, multi-plan workspace, automatikus kalkuláció, bundle refactor.

---

## 1. Current-State Audit

### Ami most történik

1. User kijelöl 2+ tervet a ProjectDetailView-ban
2. Kattint az "Ajánlat generálása" / "Közös ajánlat generálása" CTA-ra
3. `PdfMergePanel` megnyílik modálként
4. A panel betölti a terveket és végigiterál rajtuk:
   - Ha `plan.calcTakeoffRows` hiányzik → `noCalc` tömbbe kerül
   - Ha van → `mergedRows` + `perPlanSummary` tömbökbe kerül
5. Ha MINDEN terv `noCalc` → `mergedRows.length === 0` → az empty state:

```
         📭
   Nincsenek kalkulált elemek
   Nyisd meg a terveket és készíts
   kalkulációt, mielőtt ajánlatot generálsz.
```

### Ami hiányzik

| # | Hiányzik | Hatás |
|---|----------|-------|
| 1 | Nincs tervlista a hiányzó kalkulációkkal | A user nem tudja melyik tervnél kell dolgoznia |
| 2 | Nincs CTA a terv megnyitásához | A usernek be kell zárnia a panelt → visszamenni → megkeresni a tervet → megnyitni |
| 3 | Parciális eset gyenge: ha 3-ból 2 tervnek van calc, a "⚠ Nincs kalkuláció" badge kicsi és nem actionable | A user továbbra nem tud mit tenni a hiányzó tervvel |

### Kód referenciák

| Hely | Tartalom |
|------|----------|
| `PdfMergePanel.jsx` L36 | `const [plansWithoutCalc, setPlansWithoutCalc] = useState([])` — már kiszámítja! |
| `PdfMergePanel.jsx` L54-61 | `noCalc.push(plan)` — ha `!rows \|\| rows.length === 0` |
| `PdfMergePanel.jsx` L244-257 | plansWithoutCalc renderelése — piros badge, de nincs CTA |
| `PdfMergePanel.jsx` L262-274 | `mergedRows.length === 0` empty state — statikus szöveg, nincs plan lista |
| `PdfMergePanel.jsx` L24 | Props: `{ plans, materials, onClose, onSaved }` — **nincs** `onOpenPlan` callback |
| `App.jsx` L1101-1107 | Panel mount: `plans={mergePanelPlans}` — nincs plan-megnyitó callback |
| `App.jsx` L1003-1005 | `onOpenFile` minta: `setFelmeresFile(f); setFelmeresOpenPlan(plan); setPage('projektek-workspace')` |

---

## 2. Javasolt Minimum Solution

### Megoldás: `onOpenPlan` callback + bővített empty state + actionable plan lista

**Lépés 1 — Új prop: `onOpenPlan(plan)`**

A `PdfMergePanel` kap egy opcionális `onOpenPlan` callback-et. Ha a user kattint egy hiányzó tervre → `onOpenPlan(plan)` → a panel bezárul → a terv megnyílik a workspace-ben.

**Lépés 2 — App.jsx: `onOpenPlan` wiring**

```
onOpenPlan={(plan) => {
  setMergePanelPlans(null)          // bezárja a panelt
  // Nyissa meg a tervet a workspace-ben (ugyanaz mint handleOpenSaved)
  getPlanFile(plan.id) → setFelmeresFile → setFelmeresOpenPlan → setPage('projektek-workspace')
}}
```

Ez ugyanaz a flow mint a Projektek `handleOpenSaved` — a `getPlanFile` + `File` construction + `setPage` lépéseket duplikálja, de App.jsx szinten.

**Lépés 3 — Empty state bővítés**

A jelenlegi `📭 Nincsenek kalkulált elemek` blokk kiegészül:
- Tervlista: minden `plansWithoutCalc` terv neve + "Megnyitás →" CTA gomb
- Ha van onOpenPlan: a CTA gomb kattintható
- Ha nincs onOpenPlan: fallback a jelenlegi statikus szövegre (backward compatible)

**Lépés 4 — Parciális eset javítása**

A meglévő `plansWithoutCalc` renderelés (L244-257, a piros badge) szintén kap "Megnyitás →" gombot, nem csak badge-et.

### Vizuális terv — Full empty state

```
         📭
   Nincsenek kalkulált elemek

   A kijelölt tervekhez nincs még mentett kalkuláció.
   Nyisd meg a terveket és készíts kalkulációt:

   ┌──────────────────────────────────────────┐
   │ 📄 Földszint.pdf          [Megnyitás →]  │
   │ 📄 Emelet.dxf             [Megnyitás →]  │
   └──────────────────────────────────────────┘
```

### Vizuális terv — Parciális (2/3 kész, 1 hiányzik)

A meglévő plan breakdown szekcióban:
```
   ✅ 📄 Földszint.pdf         45,000 Ft   12 elem
   ✅ 📄 Tetőtér.pdf           22,000 Ft    8 elem
   ⚠  📄 Emelet.dxf   Nincs kalkuláció   [Megnyitás →]
```

---

## 3. Miből állapítható meg, mely tervekhez nincs calcTotal

Már kiszámítja a PdfMergePanel: **`plansWithoutCalc` state** (L36, L54-61).

A logika: `for (const plan of plans) { if (!rows || rows.length === 0) noCalc.push(plan) }`.

Nincs szükség új adatlekérésre — a `plans` prop tartalmazza a teljes plan objektumokat a `calcTakeoffRows`, `calcTotal`, `calcItemCount` mezőkkel.

---

## 4. Érintett fájlok

| Fájl | Módosítás | ~LOC |
|------|-----------|------|
| `src/components/PdfMergePanel.jsx` | Új prop: `onOpenPlan`, empty state bővítés, parciális plan lista CTA | ~25-30 |
| `src/App.jsx` | `onOpenPlan` callback: panel bezárás + terv megnyitás (getPlanFile + setPage) | ~10-15 |

**Összesen: 2 fájl, ~35-45 sor.**

---

## 5. Regressziós kockázatok

| Kockázat | Valószínűség | Mitigation |
|----------|-------------|------------|
| `onOpenPlan` hiánya crasht okoz | Nincs — opcionális prop, `onOpenPlan &&` guard |
| Panel bezárás + terv megnyitás race condition | Alacsony — `setMergePanelPlans(null)` szinkron, `setPage` szinkron, a getPlanFile async de a `onOpenFile` pattern már bizonyított |
| `getPlanFile` fail (IndexedDB hiba) | Alacsony — a Projektek `handleOpenSaved` ugyanígy kezeli (catch → return), fallback: a panel bezárul de a terv nem nyílik meg |
| Parciális empty state: ha 3-ból 3-nak van calc, a noCalc rész nem jelenik meg | Helyes viselkedés — a meglévő logika már korrekt |
| A plan objektum nem tartalmazza a `fileType` / `fileName` mezőket | Alacsony — a Projektek `handleOpenSaved` ugyanezeket a mezőket használja, a `PlanCard` is |

---

## 6. Smoke Check Lista

| # | Teszt | Elvárt |
|---|-------|--------|
| 1 | 2 terv kijelölve, mindkettő calc nélkül → panel megnyílik | Bővített empty state tervlistával + CTA |
| 2 | "Megnyitás →" kattintás → panel bezárul, terv megnyílik workspace-ben | Navigáció helyes |
| 3 | 3 terv: 2 calc kész, 1 hiányzik → parciális state | 2 zöld badge + 1 piros "Megnyitás →" CTA |
| 4 | Parciális "Megnyitás →" → panel bezárul, hiányzó terv megnyílik | Navigáció helyes |
| 5 | Minden terv kész → empty state nem jelenik meg | Normál merge flow változatlan |
| 6 | `onOpenPlan` prop nélkül → fallback statikus szövegre | Backward compatible |
| 7 | Build: 0 hiba | `npm run build` |
| 8 | Tesztek: 85/85 zöld | `npx vitest run` |

---

## 7. Implementációs sorrend

| # | Lépés | Leírás |
|---|-------|--------|
| 1 | PdfMergePanel: `onOpenPlan` prop | Signature: `{ plans, materials, onClose, onSaved, onOpenPlan }` |
| 2 | Empty state bővítés | `mergedRows.length === 0` blokk: plan lista + "Megnyitás →" CTA gomb |
| 3 | Parciális plan lista CTA | `plansWithoutCalc` renderelés: "Megnyitás →" gomb hozzáadása |
| 4 | App.jsx: `onOpenPlan` callback | Panel bezárás + `getPlanFile` + `File` + `setFelmeresFile` + `setPage` |
| 5 | Build + test | `npm run build` → 0 hiba, `npx vitest run` → 85/85 |

---

## Execution Brief

**Scope**: PdfMergePanel empty-state bővítése + `onOpenPlan` callback a terv közvetlen megnyitásához.

**Input**: `plansWithoutCalc` (már kiszámított state), `onOpenPlan` (új opcionális prop).

**Output**: actionable tervlista "Megnyitás →" CTA-val, ami bezárja a panelt és megnyitja a hiányzó tervet.

**Nem nyúlunk**: merge logika, bundle model, pricing, TakeoffWorkspace handleSave, routing, Sidebar, LegendPanel, DetectionReviewPanel.

**LOC becslés**: ~35-45 sor, 2 fájl.

**Kockázat**: alacsony — opcionális prop, meglévő navigációs pattern (onOpenFile), a plansWithoutCalc már kiszámított.

---

## Mi NEM kerül bele

- Automatikus kalkuláció indítás a panelből
- Multi-plan batch workspace
- Bundle újragenerálás
- Inline calc preview a panelben
- Plan törlés/hozzáadás a panelből
- Merge logika módosítás
- Teljes onboarding rendszer
