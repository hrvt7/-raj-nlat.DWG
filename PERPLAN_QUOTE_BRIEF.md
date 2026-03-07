# Implementation Brief — Per-Plan Workspace → Ajánlat Shortcut

## 1. Current-State Audit

### A jelenlegi per-plan → quote útvonal

```
ProjectDetailView
  └─ Plan kiválasztás → "Megnyitás" → TakeoffWorkspace (projektek-workspace)
       └─ Annotálás, árazás → "💾 Kalkuláció mentése" (L1342)
            └─ handleSave (L1125):
                 ├─ if (planId) → per-plan save (L1139–1162):
                 │    ├─ savePlanAnnotations(planId, { markers, wallSplits, variantOverrides })
                 │    ├─ updatePlanMeta(planId, { calcTotal, calcItemCount, calcDate, calcTakeoffRows, calcPricing })
                 │    └─ onSaved() → App.jsx: setPage('projektek')  ← VISSZANAVIGÁL
                 │
                 └─ if (!planId) → full quote save (L1164–1225):
                      ├─ quote objektum build (pricing.lines → items, assemblySummary, quoteName, clientName)
                      ├─ saveQuote(quote)
                      └─ onSaved(quote) → App.jsx: handleQuoteSaved → setPage('quotes')
```

**A per-plan save után a user visszakerül a ProjectDetailView-ra.** Innen az ajánlat generálásig:

```
ProjectDetailView
  └─ Plan checkbox kijelölés
       └─ SelectionToolbar → "Összevonás" gomb
            └─ PdfMergePanel → ajánlat mentés → handleQuoteSaved → Ajánlatok oldal
```

**Összesen 4 extra kattintás:** checkbox → kijelölés → Összevonás → merge panel. Egyterves projektnél teljesen felesleges körbejárás.

### Miért hosszú és miért baj

1. A per-plan `handleSave` megmenti a **teljes árazási adatot** a plan metadatába (`calcTakeoffRows`, `calcPricing`), de **nem építi quote objektummá**
2. A per-plan save azonnal `onSaved()` → visszanavigál, nincs intermediary "sikeres mentés" állapot
3. A TakeoffWorkspace per-plan módban **nem kap `projectId` propot** — nem tudná a project nevét a quote-hoz csatolni
4. A `quoteName`/`clientName` inputok megjelennek per-plan módban is, de a save figyelmen kívül hagyja őket

---

## 2. Javasolt Minimum Solution

### Megközelítés: `onQuoteFromPlan` callback

A TakeoffWorkspace **ne generáljon maga ajánlatot** a per-plan flow-ban. Ehelyett:

1. A per-plan save sikeres befejezése után **ne navigáljon azonnal vissza**
2. Mutasson egy rövid save-success strip-et két CTA-val:
   - **"Ajánlat generálása"** (elsődleges) → hív egy új `onQuoteFromPlan(planId)` callback-et
   - **"Vissza a projekthez"** (másodlagos) → hívja a meglévő `onSaved()` callback-et (jelenlegi viselkedés)
3. Az App.jsx-ben az `onQuoteFromPlan` handler: plan metadatából kiolvassa a `calcTakeoffRows` + `calcPricing`-ot, ebből quote objektumot épít, és `handleQuoteSaved(quote)` → Ajánlatok oldal

### Miért ez a legkisebb scope

- **A TakeoffWorkspace-ben nem kell quote build logikát duplikálni** — csak egy callback-et hív
- **A quote build logika az App.jsx-be kerül**, a meglévő `handleQuoteSaved` mellé, mint egy `buildQuoteFromPlan(planId)` helper
- **A per-plan save mechanizmus érintetlen marad** — a plan metadata továbbra is mentődik
- **A full quote save path (L1164–1225) érintetlen** — a new-quote flow nem változik
- **Nincs routing változás** — az `onQuoteFromPlan` ugyanazt a `handleQuoteSaved`-et hívja

### Egyterves flow helyes következő lépés

```
TakeoffWorkspace (per-plan)
  └─ "💾 Kalkuláció mentése"
       └─ save success strip megjelenik:
            ├─ "📄 Ajánlat generálása" → onQuoteFromPlan(planId) → App.jsx: quote build → Ajánlatok
            └─ "← Vissza a projekthez" → onSaved() → App.jsx: projektek oldal (jelenlegi)
```

1 kattintás → ajánlat. Jelenlegi: 4 kattintás.

### Kompatibilitás a bundle / merge logikával

A merge flow **érintetlen marad**:
- A PdfMergePanel továbbra is a multi-plan → quote path
- Az `onQuoteFromPlan` **egyetlen plan** adatából épít ajánlatot — nem merge
- Ha a user többterves projekten dolgozik, az "Ajánlat generálása" a CTA az aktuális plan adatából generál — a user dönthet, hogy inkább a merge flow-t használja (Vissza a projekthez → kijelölés → Összevonás)
- A quote `source` mező: `'plan-takeoff'` (megkülönböztethető a `'takeoff-workspace'` és merge forrástól)

---

## 3. Érintett Fájlok

| Fájl | Módosítás típusa | Scope |
|------|------------------|-------|
| `src/components/TakeoffWorkspace.jsx` | Save-success strip + `onQuoteFromPlan` callback hívás | ~25 sor |
| `src/App.jsx` | `onQuoteFromPlan` prop + `buildQuoteFromPlan` helper | ~30 sor |

**2 fájl, ~55 sor összesen.**

### TakeoffWorkspace.jsx módosítások

1. **Új prop:** `onQuoteFromPlan` (opcionális callback)
2. **Új state:** `saveSuccess` boolean (save-success strip megjelenítéséhez)
3. **Per-plan save path (L1159–1161):** `onSaved()` hívás helyett → `setSaveSuccess(true)`
4. **Save-success strip renderelése:** a topbar save gomb helyén (vagy mellette), két CTA-val
5. **"Ajánlat generálása" onClick:** `onQuoteFromPlan(planId)` → a callback az App.jsx-ben generálja az ajánlatot
6. **"Vissza a projekthez" onClick:** `onSaved()` (jelenlegi viselkedés)

### App.jsx módosítások

1. **`buildQuoteFromPlan(planId)` helper:** plan metadatából + annotációkból quote objektumot épít
   - `getPlanMeta(planId)` → `calcTakeoffRows`, `calcPricing`, `name`
   - quote objektum build (L1196–1223 logika egyszerűsítve, `source: 'plan-takeoff'`)
   - `saveQuote(quote)` + `handleQuoteSaved(quote)`
2. **`onQuoteFromPlan` prop a projektek-workspace TakeoffWorkspace-nek:**
   ```
   onQuoteFromPlan={async (pid) => { await buildQuoteFromPlan(pid) }}
   ```

---

## 4. Mi NEM Kerül Bele

- ❌ **Full quote save path módosítás** — a new-quote flow (L1164–1225) érintetlen
- ❌ **PdfMergePanel / merge flow** — érintetlen
- ❌ **Multi-plan workspace** — a CTA egyetlen plan-re vonatkozik
- ❌ **Route redesign** — nincs új page/route, a `handleQuoteSaved` a meglévő `quotes` page-re navigál
- ❌ **quoteName/clientName UI módosítás** — a per-plan flow a plan nevét és a projekt nevét használja (automatikus)
- ❌ **TakeoffWorkspace quote build logika duplikálás** — a workspace nem épít quote-ot, csak callback-et hív
- ❌ **Quote edit / review intermediary screen** — a quote azonnal generálódik, a QuoteView-ban szerkeszthető utólag
- ❌ **Projekt név átadás a TakeoffWorkspace-nek** — a `buildQuoteFromPlan` helper a plan metadatából és a projekt store-ból olvassa ki

---

## 5. Regressziós Kockázatok

| Kockázat | Valószínűség | Mitigation |
|----------|-------------|------------|
| Per-plan save nem fut le a save-success strip előtt | Alacsony | A `setSaveSuccess(true)` a try block-ban van, a savePlanAnnotations + updatePlanMeta async await után |
| Plan metadatából hiányzik calcTakeoffRows | Közepes | A `buildQuoteFromPlan` guard: ha nincs `calcTakeoffRows` → toast hiba ("Mentsd el először a kalkulációt") |
| `onQuoteFromPlan` callback hiánya (new-quote flow) | Alacsony | A prop opcionális. A save-success strip csak `planId && saveSuccess` feltétellel jelenik meg. A new-quote flow-ban nincs `planId` → nem jelenik meg |
| Dupla quote generálás (gyors dupla kattintás) | Közepes | A "Ajánlat generálása" gomb disabled-re állítható a kattintás után (setSaving pattern) |
| Dirty state elvesztés navigáláskor | Alacsony | A per-plan save már lefutott → dirty state false. Az `onQuoteFromPlan` utáni navigálás nem veszít adatot |
| Quote nélküli plan metadata olvasás | Alacsony | A `buildQuoteFromPlan` helper a `getPlanMeta` return-ját validálja, és csak megkísérli a quote build-et ha van `calcPricing` |

### Kritikus kockázat: quote build adatforrás

A per-plan save menti: `calcTakeoffRows`, `calcPricing` (total, materialCost, laborCost, laborHours). A full quote save (L1164–1225) viszont használ plusz adatokat:
- `pricing.lines` → `items` (részletes tétel lista)
- `assemblySummary` (per-assembly breakdown)
- `context`, `cableEstimate`, `hourlyRate`, `markup`

**Ezek közül a `pricing.lines` és az assembly adatok nincsenek a plan metadatában.** A `calcTakeoffRows` és `calcPricing` csak összesítést tartalmaz.

**Megoldás:** A `buildQuoteFromPlan` helper **nem próbálja reprodukálni a teljes quote build-et.** Ehelyett:
- `calcTakeoffRows`-ból compute-olja az assemblySummary-t (a `computePricing` helper elérhető az App.jsx-ben)
- Vagy: a per-plan save kiegészítése: `calcPricingLines` mentése a plan metadatába is

**Javasolt:** A per-plan save (TakeoffWorkspace L1148) kiegészítése:
```
updatePlanMeta(planId, {
  ...existing fields...,
  calcPricingLines: pricing.lines,   // ÚJ
  calcAssemblySummary: assemblySummary, // ÚJ (a handleSave-ben kiszámolva)
})
```
Így a `buildQuoteFromPlan` helpernek elég a plan metadatát olvasnia. **Ez a TakeoffWorkspace handleSave-be kerül, a per-plan save path-ba, +2 mező.**

---

## 6. Smoke Check Lista

1. **Per-plan save → save-success strip megjelenik** — "Kalkuláció mentve" üzenet + két CTA
2. **"Ajánlat generálása" CTA → quote létrejön** → Ajánlatok oldal → QuoteView az új ajánlattal
3. **"Vissza a projekthez" CTA → jelenlegi viselkedés** → ProjectDetailView
4. **Quote tartalom helyes** — total, items, assemblySummary megegyezik a workspace árazással
5. **New-quote flow érintetlen** — a save-success strip NEM jelenik meg (nincs planId)
6. **Dupla kattintás védelem** — az "Ajánlat generálása" gomb disabled-re vált kattintás után
7. **Plan metadata bővítés** — `calcPricingLines` + `calcAssemblySummary` mentésre kerül
8. **Edge: üres takeoff (0 sor)** — a handleSave guard (L1126) továbbra is blokkol → save-success nem jelenik meg

---

## 7. Implementációs Sorrend

### Lépés 1: TakeoffWorkspace.jsx — per-plan save metadata bővítés

A handleSave per-plan path-ban (L1148) az `updatePlanMeta` hívás kiegészítése `calcPricingLines` és `calcAssemblySummary` mezőkkel.

**Előfeltétel:** Az `assemblySummary` kiszámolása. Ez jelenleg csak a full quote save path-ban (L1175–1193) történik. **Mozgatni kell a save közös részébe**, vagy újra kell számolni a per-plan path-ban is.

**Javasolt:** Az assemblySummary számolás (L1175–1193) kiemelése a handleSave elé, `useMemo`-ba, hogy mindkét path használhassa. De ez refactor — **alternatíva:** a per-plan path-ban is inline kiszámolni.

### Lépés 2: TakeoffWorkspace.jsx — save-success strip

1. `saveSuccess` state hozzáadása
2. Per-plan save: `onSaved()` → `setSaveSuccess(true)`
3. Topbar-ban: ha `saveSuccess && planId` → save-success strip renderelés
4. Két CTA: "Ajánlat generálása" + "Vissza a projekthez"

### Lépés 3: App.jsx — buildQuoteFromPlan helper + onQuoteFromPlan prop

1. `buildQuoteFromPlan(planId)` helper: plan metadatából quote build
2. `onQuoteFromPlan` prop a projektek-workspace TakeoffWorkspace-nek
3. A callback: `await buildQuoteFromPlan(planId)` → quote objektum → `handleQuoteSaved(quote)`

### Lépés 4: Build + test + smoke

---

## 8. Rövid Végrehajtható Implementation Brief

```
SCOPE:      Per-plan workspace → ajánlat shortcut
FILES:      2 (TakeoffWorkspace.jsx, App.jsx)
LINES:      ~55 sor módosítás/hozzáadás
PATTERN:    save-success strip + onQuoteFromPlan callback

LÉPÉSEK:

1. TakeoffWorkspace.jsx — per-plan save metadata bővítés:
   updatePlanMeta(planId, {
     ...existing...,
     calcPricingLines: pricing.lines,
     calcAssemblySummary: <inline assembly summary>,
   })

2. TakeoffWorkspace.jsx — save-success state + strip:
   - const [saveSuccess, setSaveSuccess] = useState(false)
   - Per-plan save: onSaved() helyett → setSaveSuccess(true)
   - Topbar-ban: saveSuccess && planId → strip:
     - "📄 Ajánlat generálása" → onQuoteFromPlan?.(planId)
     - "← Vissza a projekthez" → onSaved?.()
   - Új prop: onQuoteFromPlan (opcionális)

3. App.jsx — buildQuoteFromPlan + onQuoteFromPlan prop:
   - buildQuoteFromPlan(planId):
     - const meta = getPlanMeta(planId)
     - Guard: if (!meta.calcPricing) → toast + return
     - quote = { id, projectName, items: meta.calcPricingLines,
       assemblySummary: meta.calcAssemblySummary, gross, totals,
       source: 'plan-takeoff', ... }
     - saveQuote(quote) + handleQuoteSaved(quote)
   - projektek-workspace TakeoffWorkspace:
     - onQuoteFromPlan={(pid) => buildQuoteFromPlan(pid)}

4. Build: 0 error
5. Test: 85/85 green
6. Smoke: 8 eset (lista fent)
```
