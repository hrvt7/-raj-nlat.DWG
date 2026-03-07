# Implementation Brief — DetectionReviewPanel CTA Fix

## 1. Current-State Audit

### Jelenlegi CTA viselkedés (DetectionReviewPanel.jsx L841–854)

```
phase === 'done' → egyetlen CTA gomb:
  - szöveg: needsManual > 0 ? "Tovább a tervekhez" : "Tovább a kalkulációhoz"
  - onClick: onDone() || onClose()
```

**App.jsx L899 — `onDone` handler:**
```js
onDone={() => {
  setDetectPanelPlans(null)
  setDetectPanelProjectId(null)
  setDetectPanelExistingRun(null)
}}
```

Eredmény: **a panel bezárul, a user visszakerül a ProjectDetailView-ra.** Semmilyen navigáció nem történik. A "Tovább a kalkulációhoz" szöveg hamis ígéret.

### Létező, kihasználatlan infrastruktúra

**`onLocateDetection`** (App.jsx L900–938) **már kész és működik**:
- Elfogad egy `{ planId, pageNum, x, y }` target objektumot
- Megnyitja a plan-t a TakeoffWorkspace-ben (`setPage('projektek-workspace')`)
- Beállítja a `viewerFocusTarget`-et a specifikus markerre
- Kezeli a plan-váltást és a dirty state-et

Ez a callback jelenleg csak a review fázisban érhető el (egyedi detekció kattintással). A done fázis CTA-ja nem használja.

---

## 2. Javasolt Minimum CTA Viselkedés

### Két CTA állapot

| Állapot | Feltétel | Gomb szöveg | Gomb akció |
|---------|----------|-------------|------------|
| **A — Kész a kalkulációra** | `needsManual === 0` | "Megnyitás a workspace-ben" | `onLocateDetection({ planId: firstDetectedPlanId })` |
| **B — Kézi munka szükséges** | `needsManual > 0` | "Megnyitás a workspace-ben" | `onLocateDetection({ planId: firstDetectedPlanId })` |

**Mindkét esetben ugyanaz a CTA akció:** a user a workspace-be kerül az első detektált plan-nel. A különbség a guidance text-ben van (ami már létezik: L829–838), nem a CTA-ban.

### Miért nem kell különválasztani az A és B esetet?

A jelenlegi guidance text (L829–838) már tájékoztatja a usert:
- **A eset:** "✓ Minden kategória rendelkezik assembly-vel. A kalkuláció azonnal elérhető a tervben."
- **B eset:** "⚠ N kategória vár assembly hozzárendelésre. Nyisd meg a tervet és az Estimation panelen rendeld hozzá."

Mindkét esetben a logikus következő lépés: **nyisd meg a tervet**. A CTA szöveg egységesítése nem veszít információt, viszont mindig funkcionális akciót ad.

### Másodlagos CTA: "Bezárás"

A jelenlegi egyetlen CTA helyett **két gomb:**
- **Elsődleges (accent):** "Megnyitás a workspace-ben" → `onLocateDetection`
- **Másodlagos (ghost/border):** "Bezárás" → `onDone()` (megtartja a jelenlegi escape-path-t)

Ezzel a user dönthet: vagy továbblép, vagy bezár — de nem kerül zsákutcába.

---

## 3. Eset-mátrix: hova vigye a usert

### 3a — 1 plan

A leggyakoribb eset. A detekció egyetlen plan-en futott.

- **CTA akció:** `onLocateDetection({ planId: plans[0].id })`
- **Eredmény:** a workspace megnyílik ezzel a plan-nel
- **Detekciós markerek:** már mentve a plan annotációiba (L570–605 `savePlanAnnotations`)

### 3b — Több plan (2+)

A user a SelectionToolbar-ból indított detekciót több kijelölt plan-en.

- **CTA akció:** `onLocateDetection({ planId: firstPlanWithDetections })` — az első plan, amire van elfogadott detekció
- **Eredmény:** a workspace megnyílik az első releváns plan-nel
- **A többi plan:** a user a projektek oldalról érheti el, vagy a workspace plan-váltó mechanizmusával (ha van). **Ez nem a jelenlegi scope — a CTA nem ígér multi-plan workspace-t.**

### 3c — Bundle jellegű flow (merge → ajánlat)

Ha a user végcélja ajánlat generálása:
- A jelenlegi CTA fix **NEM oldja meg** a per-plan → ajánlat hiányt. Ez a #2 friction pont, külön scope.
- A CTA a workspace-be visz, ahol a user annotálhat, árazhat. Az ajánlat generálás a merge flow-n keresztül marad elérhető.
- **Tudatos döntés:** a CTA-val NEM nyitunk merge panel-t és NEM hozunk létre ajánlatot. A scope kizárólag a "panel bezárás → workspace megnyitás" átmenet.

### `firstPlanWithDetections` meghatározása

```
A plans prop-ból és az allDetections state-ből:
1. Gyűjtsd ki azokat a planId-ket, amikre van elfogadott detekció
2. Az első ilyen planId az `onLocateDetection` target
3. Ha nincs elfogadott detekció (edge case: mind elutasítva): fallback → onDone() (bezárás)
```

Ez a logika a DetectionReviewPanel.jsx-en belül marad, nincs szükség App.jsx módosításra.

---

## 4. Legkisebb Javítható Scoped Lépés

**Egyetlen fájl: `DetectionReviewPanel.jsx`**

Módosítás scope:
1. A done fázis CTA section-jében (L841–854) a gomb onClick módosítása
2. Egy `firstDetectedPlanId` computed value hozzáadása
3. Másodlagos "Bezárás" gomb hozzáadása
4. CTA szöveg frissítése

**App.jsx:** NEM kell módosítani. Az `onLocateDetection` callback (L900–938) már létezik és kész.

---

## 5. Mi NEM Kerül Bele

- ❌ **App.jsx routing módosítás** — az `onLocateDetection` handler kész, nem nyúlunk hozzá
- ❌ **Per-plan → ajánlat shortcut** — ez a #2 friction pont, külön scope
- ❌ **Multi-plan workspace nézet** — a CTA az első releváns plan-t nyitja, nem csinál plan-összefűzést
- ❌ **Merge panel integrálás** — a CTA nem indít merge flow-t
- ❌ **DetectionReviewPanel belső state vagy detection logika** — nem nyúlunk a detect/review/apply fázisokhoz
- ❌ **CTA szöveg lokalizáció** — magyar marad, nincs i18n layer
- ❌ **onDone callback signature módosítás** — az App.jsx-ben a meglévő `onDone` handler érintetlen marad
- ❌ **Legend → Detection plan fallback** — ez a #3 friction pont, külön scope

---

## 6. Érintett Fájlok

| Fájl | Módosítás típusa | Scope |
|------|------------------|-------|
| `src/components/DetectionReviewPanel.jsx` | CTA section módosítás (L841–854) | ~15 sor |

**Nulla további fájl érintett.**

---

## 7. Regressziós Kockázatok

| Kockázat | Valószínűség | Mitigation |
|----------|-------------|------------|
| `onLocateDetection` hívás invalid `planId`-vel | Alacsony | A `plans` prop mindig valid (App.jsx tölti), és az `allDetections` a futott detekciókból jön |
| `onLocateDetection` hívás `planId` nélkül (edge: mind rejected) | Közepes | Fallback: ha nincs elfogadott detekció → a CTA `onDone()`-t hív (jelenlegi viselkedés) |
| Dirty state vesztés a workspace-ben | Alacsony | Az `onLocateDetection` handler (App.jsx L903-906) már kezeli: `showAutoSaveToast()` + dirty flag reset |
| Panel nem zárul be a CTA után | Közepes | Az `onLocateDetection` NEM zárja be a DetectionReviewPanel-t. Kell: a CTA `onLocateDetection` hívás után azonnal hívja a `setDetectPanelPlans(null)` cleanup-ot is. **Megoldás:** a CTA hívjon egy wrapper-t: `onLocateDetection(target); onDone()` — így a panel bezárul ÉS a workspace megnyílik |

### Kritikus kockázat: panel bezárás + workspace nyitás sorrend

Az `onLocateDetection` handler az App.jsx-ben `setPage('projektek-workspace')`-et hív (L916, L930). Az `onDone` handler `setDetectPanelPlans(null)`-t hív (L899). Mindkettő state update, tehát React batching-gel együtt futnak.

**De:** az `onLocateDetection` async (tartalmaz `await getPlanFile()`). Ha a `onDone` szinkron cleanup a panel unmount-ját triggereli mielőtt az async `onLocateDetection` lefut, a callback megszakadhat.

**Megoldás:** A CTA-ban NE hívjunk `onDone()`-t közvetlenül. Ehelyett:
1. Hívjuk `onLocateDetection(target)`-et (async, megnyitja a workspace-t)
2. A panel unmount-ját hagyjuk az `onLocateDetection` sikeres futása utánra — **de** a jelenlegi kód nem cleanup-olja a panelt az `onLocateDetection`-ből.

**Javasolt pattern:** A CTA onClick:
```
async () => {
  await onLocateDetection({ planId: firstDetectedPlanId })
  if (onDone) onDone()
}
```
Így: (1) workspace megnyílik, (2) majd a panel bezárul. A sorrend garantált.

---

## 8. Smoke Check Lista

1. **1 plan, mind elfogadva, van assembly** → CTA "Megnyitás a workspace-ben" → workspace megnyílik a plan-nel → markerek láthatóak
2. **1 plan, van rejected, van assembly** → CTA → workspace megnyílik → csak elfogadott markerek
3. **1 plan, needsManual > 0** → CTA → workspace megnyílik → Estimation panel mutatja a hiányzó assembly-ket
4. **2 plan, detekciók mindkettőn** → CTA → workspace az első detektált plan-nel nyílik
5. **Mind rejected (edge)** → CTA fallback → bezárás (jelenlegi viselkedés)
6. **"Bezárás" másodlagos gomb** → panel bezárul → visszakerülünk a ProjectDetailView-ra
7. **Reopen existing run** → done fázis → CTA ugyanúgy működik (a `plans` és `allDetections` az existingRun-ból jön)
8. **Legend → Detekció → done CTA** → workspace megnyílik (a plans az `onRunDetection` fallback-ből jön)

---

## 9. Implementációs Sorrend

**Egyetlen atomi lépés:**

1. **DetectionReviewPanel.jsx — done fázis CTA section (L841–854):**
   a. Számítsd ki `firstDetectedPlanId`:
      - `allDetections.filter(d => d.accepted !== false)` → első `planId`
      - Ha nincs: `null` (fallback eset)
   b. Elsődleges CTA gomb:
      - szöveg: "Megnyitás a workspace-ben"
      - onClick: ha `firstDetectedPlanId` → `await onLocateDetection({ planId }); onDone()`, egyébként `onDone()`
   c. Másodlagos CTA gomb:
      - szöveg: "Bezárás"
      - onClick: `onDone()` (jelenlegi viselkedés)
      - stílus: ghost/border variant (nem accent háttér)

2. **Build + test**

3. **Smoke check** (lista fent)

---

## 10. Rövid Végrehajtható Implementation Brief

```
SCOPE:      DetectionReviewPanel.jsx L841–854
FILES:      1 (DetectionReviewPanel.jsx)
LINES:      ~15 sor módosítás/hozzáadás
APP.JSX:    NEM módosul
CALLBACK:   meglévő onLocateDetection felhasználása
PATTERN:    async onClick → await onLocateDetection → onDone

LÉPÉSEK:
1. Adj hozzá egy computed value-t a done fázishoz:
   const firstDetectedPlanId = useMemo(() => {
     const accepted = allDetections.filter(d => d.accepted !== false)
     return accepted.length > 0 ? accepted[0].planId : null
   }, [allDetections])

2. Módosítsd a CTA section-t (L842–854):
   - Elsődleges gomb: "Megnyitás a workspace-ben"
     onClick: async → onLocateDetection({ planId: firstDetectedPlanId }) → onDone()
     Ha firstDetectedPlanId === null → fallback onDone()
   - Másodlagos gomb: "Bezárás" (ghost style) → onDone()

3. Build: 0 error
4. Test: 85/85 green
5. Smoke check: 8 eset (lista fent)
```
