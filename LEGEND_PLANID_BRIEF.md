# legendPlanId Visszakötés — Implementation Brief

## 1. Current-State Audit

### A legend PDF feltöltés két útja

**Út A — Korábbi ProjectDetailView legend drop zone (DEAD CODE, `handleLegendFile`):**
```
User feltölt PDF-et a ProjectDetailView-ban
  └─ handleLegendFile (Projektek.jsx L614–627)
      ├─ savePlan(plan, file)          → plan record + blob mentve IndexedDB-be
      ├─ updateProject(projectId, { legendPlanId: id })  → project.legendPlanId beállítva
      └─ onLegendPanel({ projectId, legendPlanId: id })  → LegendPanel auto-load módban nyílik
```
**Eredmény:** plan record létrejön, legendPlanId beállítódik, LegendPanel auto-load + auto-extract.

**Út B — LegendPanel belső "PDF betöltése" gomb (ÉLŐ, `handleFileChange`):**
```
User feltölt PDF-et a LegendPanelen belül
  └─ handleFileChange (LegendPanel.jsx L410–419)
      └─ pdfjsLib.getDocument(arrayBuffer)  → pdfDoc state-be töltve
         (in-memory only — nincs savePlan, nincs updateProject)
```
**Eredmény:** PDF renderelve a canvason, szimbólumok kivághatók, de:
- **nincs plan record** — a blob nem kerül IndexedDB-be
- **nincs legendPlanId** — a project record nem frissül
- **nincs auto-extract** — a user manuálisan vágja a szimbólumokat (vagy nincs trigger)

### Hol veszti el a project.legendPlanId kapcsolatot

Pontosan a `handleFileChange`-nél (LegendPanel.jsx L410–419). Ez a függvény:
1. Beolvassa a PDF-et in-memory-be (`pdfjsLib.getDocument`)
2. Beállítja a `pdfDoc` state-et a canvas rendereléshez
3. **Nem ment plan recordot** (`savePlan` nincs hívva)
4. **Nem frissíti a project-et** (`updateProject` nincs hívva)
5. **Nem is tartja meg a raw File/Blob-ot** — csak az `arrayBuffer`-t adja tovább a pdf.js-nek

### LegendPanel importok — mit lát ma

```js
import { getPlanFile } from '../data/planStore.js'  // ← csak olvas, nem ír
```

Nincs importálva: `savePlan`, `generatePlanId`, `updateProject`.

### A két kód viszonya

| Aspektus | Út A (dead handleLegendFile) | Út B (élő handleFileChange) |
|----------|-------|-------|
| PDF → plan record | ✅ savePlan | ❌ nincs |
| project.legendPlanId | ✅ updateProject | ❌ nincs |
| LegendPanel nyitás | auto-load mód | manual mód (in-memory PDF) |
| Auto-extract trigger | ✅ (legendPlanId useEffect) | ❌ (user kézzel vág) |
| Blob megőrzés | ✅ IndexedDB | ❌ only in-memory |

---

## 2. Javasolt Minimum Solution

### Az onLegendSaved callback

**Ne a LegendPanel mentsen plan-t és frissítsen project-et.** A LegendPanel felelőssége a szimbólum-extrakció, nem a plan/project management. Ha a LegendPanel-be húzzuk be a `savePlan` + `updateProject` logikát, megsértjük a meglévő felelősség-elválasztást.

**Ehelyett: új `onLegendSaved` callback a LegendPanel → App.jsx → felé.**

A LegendPanel már rendelkezik a PDF blob-bal (`handleFileChange` → `arrayBuffer`). A megoldás:
1. LegendPanel megtartja az `File` objektumot a `handleFileChange`-ben
2. Az első sablonmentés (`handleSave` vagy `handleSaveAllExtracted`) után, ha nincs `legendPlanId`, a LegendPanel hív egy `onLegendSaved({ file })` callback-et
3. App.jsx fogadja ezt, végrehajtja a `savePlan` + `updateProject`-et, és beállítja a `legendPlanId`-t

**Probléma ezzel:** Ez túl nagy scope — App.jsx-ben új state management + plan save logika kellene.

### Egyszerűbb megoldás: LegendPanel maga végzi a plan save-et

A legkisebb scope: a `handleFileChange` kiegészítése úgy, hogy:
1. Megtartja a raw `File` objektumot egy ref-ben
2. Amikor az első sablon mentés megtörténik (`handleSave` vagy `handleSaveAllExtracted`), és `legendPlanId` prop null, a LegendPanel:
   - Hív `savePlan(planMeta, file)` → plan record létrejön
   - Hív `updateProject(projectId, { legendPlanId: planId })` → project frissül
   - Beállítja a belső `activeLegendPlanId` state-et → a további mentések már nem próbálják újra

**Miért ez a legjobb:**
- Nincs új callback chain
- Nincs App.jsx módosítás
- Nincs Projektek.jsx módosítás
- LegendPanel csak 2 új importot kap (`savePlan`, `generatePlanId` a planStore-ból + `updateProject` a projectStore-ból)
- A plan save csak akkor történik, ha a user ténylegesen sablonokat ment (nem waste ha csak megnyitja és bezárja)

### Alternatív megoldás (ELVETVE): handleFileChange-ben azonnal menteni

Probléma: ha a user megnyitja a PDF-et de nem ment sablont és bezár, felesleges plan record marad. A "ment sablont → akkor kösd be a plan-t" logika tisztább.

### Választott megoldás részletei

```
handleFileChange (L410):
  ├─ Meglévő: PDF betöltés in-memory
  └─ ÚJ: raw File mentése legendFileRef-be

handleSave / handleSaveAllExtracted:
  ├─ Meglévő: sablon mentés
  └─ ÚJ: ha legendPlanId prop null ÉS legendFileRef.current !== null ÉS projectId létezik:
      ├─ generatePlanId() → planId
      ├─ savePlan({ id: planId, name: '[Jelmagyarázat] filename', ... }, file)
      ├─ updateProject(projectId, { legendPlanId: planId })
      └─ belső state: setActiveLegendPlanId(planId) → megakadályozza a dupla mentést
```

### Kompatibilitás a meglévő templates-alapú működéssel

| Szcenárió | Viselkedés a fix után |
|-----------|----------------------|
| User nyitja a legend chip-et (nincs legend) → LegendPanel manual | `legendPlanId` prop = null, legendFileRef = null |
| User feltölt PDF-et a LegendPanelen belül | legendFileRef = File, pdfDoc = loaded |
| User ment sablonokat (handleSave / handleSaveAllExtracted) | sablonok mentve + **ÚJ:** plan saved, project.legendPlanId beállítva |
| User bezárja a LegendPanel-t | reload-on-close fut → project.legendPlanId frissül a chip-ben |
| User újra nyitja a legend chip-et | legendPlanId prop most már nem null → LegendPanel auto-load módban |
| User nyitja a legend chip-et (VAN legend, auto-load) | Változatlan — legendPlanId prop → auto-load useEffect → auto-extract |

---

## 3. Érintett Fájlok

| Fájl | Változás | Kockázat |
|------|----------|----------|
| `src/components/LegendPanel.jsx` | +2 import (savePlan, generatePlanId + updateProject), +1 useRef (legendFileRef), handleFileChange kiegészítés (File megőrzés), handleSave + handleSaveAllExtracted kiegészítés (plan save + project update) | **Közepes** — a két mentési függvény módosul, de a logika tiszta if-guard |
| `src/data/planStore.js` | **NINCS VÁLTOZÁS** — savePlan + generatePlanId már exportálva | — |
| `src/data/projectStore.js` | **NINCS VÁLTOZÁS** — updateProject már exportálva | — |
| `src/pages/Projektek.jsx` | **NINCS VÁLTOZÁS** — reload-on-close már a legendPlanId-t is frissíti (getProject) | — |
| `src/App.jsx` | **NINCS VÁLTOZÁS** | — |

**Összesen: 1 fájl módosítva.**

---

## 4. Regressziós Kockázatok

| Kockázat | Súlyosság | Mitigáció |
|----------|-----------|-----------|
| Dupla plan record ha user többször ment | **Nincs** — `activeLegendPlanId` state megakadályozza: az első sablon-mentés után nem fut újra a plan save | Guard: `if (!legendPlanId && !activeLegendPlanId && legendFileRef.current && projectId)` |
| savePlan meghívás rossz adattal | **Alacsony** — a plan shape pontosan a meglévő Projektek.jsx handleLegendFile mintáját követi | Másolandó shape: `{ id, name, fileName, fileType: 'pdf', fileSize, projectId, uploadedAt, createdAt }` |
| Auto-load useEffect triggerelődik a belső activeLegendPlanId-ra | **Nincs** — az auto-load useEffect a `legendPlanId` **prop**-ot figyeli, nem belső state-et. Az `activeLegendPlanId` belső state, nem prop. | A useEffect dependency: `[legendPlanId]` (prop) |
| handleFileChange elveszti az eredeti File objektumot | **Alacsony** — `legendFileRef.current = file` a függvény elején, az `arrayBuffer` olvasás nem fogyasztja el a File-t | File objects are reusable in JS |
| LegendPanel bezárás + reload nem frissíti a legendPlanId-t | **Nincs** — a `reload()` a ProjectDetailView-ban `getProject(projectId)`-t hív, ami a frissített localStorage-ból olvas | A `updateProject` szinkron localStorage write → `reload()` látja |
| Templates count mismatch | **Nincs** — a sablon mentés (handleSave/handleSaveAllExtracted) ÉS a plan save ugyanabban a hívásban történik, a templates state a meglévő logikával frissül | — |

---

## 5. Smoke Check Lista

1. **Build:** `npm run build` — 0 errors
2. **Új legend flow (teljes):** Nyiss projektet legend nélkül → kattints "Jelmagyarázat hozzáadása" → tölts fel PDF-et a LegendPanelen belül → vágj ki / auto-extract sablonokat → ments → zárd be a panelt → ellenőrizd: chip "Jelmagyarázat: N szimbólum" állapotba váltott
3. **Legend chip → Szerkesztés → auto-load:** Nyisd újra a legend chip-et → a LegendPanel auto-load módban nyíljon (PDF betöltve, nem üres canvas)
4. **Meglévő legend flow (nem törhet):** Nyiss projektet ahol VAN legendPlanId → kattints Szerkesztés → LegendPanel auto-load + sablonok láthatóak
5. **Bezárás reload:** Zárd be a LegendPanel-t → templates count frissüljön a chip-ben
6. **Dupla mentés guard:** Ments sablont, majd ments még egyet ugyanabban a session-ben → ne legyen dupla plan record
7. **Üres bezárás:** Nyisd meg a legend chip-et → tölts fel PDF-et → NE ments sablont → zárd be → ne legyen plan record létrehozva
8. **Tests:** `npx vitest run` — all green

---

## 6. Ajánlott Implementációs Sorrend

**Egyetlen atomi commit — egy lépés:**

### Lépés 1: LegendPanel legend plan binding

1. **Új importok:** `savePlan`, `generatePlanId` (planStore) + `updateProject` (projectStore)
2. **legendFileRef:** `useRef(null)` — raw File megőrzés
3. **activeLegendPlanId state:** `useState(legendPlanId || null)` — dupla mentés guard
4. **handleFileChange kiegészítés:** `legendFileRef.current = file` (a meglévő logika előtt)
5. **bindLegendPlan helper:** kiszervezett async függvény:
   - Guard: `if (!activeLegendPlanId && legendFileRef.current && projectId)`
   - `generatePlanId()` → planId
   - `savePlan(planMeta, legendFileRef.current)` → plan record mentve
   - `updateProject(projectId, { legendPlanId: planId })`
   - `setActiveLegendPlanId(planId)`
6. **handleSave kiegészítés:** sablon mentés után → `await bindLegendPlan()`
7. **handleSaveAllExtracted kiegészítés:** batch mentés után → `await bindLegendPlan()`

### NEM ebben a lépésben:
- Auto-extract trigger a manuálisan feltöltött PDF-re (feature, nem bug fix)
- Dead legend code cleanup (handleLegendFile stb.) — külön step
- LegendPanel UI redesign
- Projektek.jsx vagy App.jsx módosítás
- Új callback chain

---

## 7. Implementation Brief

### Scope
LegendPanel.jsx kiegészítése: a manuálisan feltöltött legend PDF mentése plan recordként és a project.legendPlanId visszakötése az első sablon-mentéskor.

### Mi változik
`src/components/LegendPanel.jsx`:
- +2 import: `{ savePlan, generatePlanId }` planStore-ból, `{ updateProject }` projectStore-ból
- +1 ref: `legendFileRef` (raw File megőrzés handleFileChange-ből)
- +1 state: `activeLegendPlanId` (dupla mentés guard, init: `legendPlanId` prop)
- +1 helper: `bindLegendPlan()` (plan save + project update, guarded)
- handleFileChange: +1 sor (`legendFileRef.current = file`)
- handleSave: +1 sor (`await bindLegendPlan()`)
- handleSaveAllExtracted: +1 sor (`await bindLegendPlan()`)

### Mi NEM változik
- App.jsx, Projektek.jsx, projectStore.js, planStore.js, legendStore.js
- LegendPanel UI (nincs vizuális változás)
- LegendPanel auto-load flow (legendPlanId prop path)
- Templates mentés logika (csak kiegészül a plan binding-gel)

### Deliverables
- 1 fájl módosítva (LegendPanel.jsx)
- ~20 sor hozzáadott kód
- Build: 0 errors expected
- Tests: all green expected
- Smoke: 8-pont ellenőrzés fent
