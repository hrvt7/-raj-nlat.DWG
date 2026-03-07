# Legend Belépési Pont — Implementation Brief

## 1. Current-State Summary

### A legend flow jelenlegi állapota

**Teljes callback chain — ÉLŐ, de nincs trigger:**

```
ProjectDetailView
  └─ onLegendPanel({ projectId, legendPlanId })     ← nincs UI ami hívná
        │
        ▼
App.jsx L847
  └─ setLegendPanelData(data)
        │
        ▼
LegendPanel (modal overlay, L873–891)
  ├─ Ha legendPlanId megadva → auto-load PDF + auto-extract szimbólumok
  ├─ Ha nincs legendPlanId → manual mode (user tölti fel a PDF-et a panelen belül)
  └─ onRunDetection({ projectId }) → bezárja legend panelt, nyitja detect panelt
```

**LegendPanel interface (L141):**
```jsx
LegendPanel({ onClose, projectId, legendPlanId, onRunDetection })
```
- `legendPlanId` **opcionális** — ha null, a panel manuális módban indul (user PDF feltöltés a panelen belül)
- `projectId` — szükséges a sablonok projekthez kötéséhez

**Adatmodell:**
- `project.legendPlanId` — ha van, a projekt legendje már feltöltve (plan record létezik)
- `getTemplatesByProject(projectId)` → `templates[]` — ha length > 0, sablonok már vannak

**ProjectDetailView jelenleg ismeri:**
- `project` state — tartalmazza `legendPlanId`-t
- `templates` state — betöltve `reload()`-kor (L575)
- `onLegendPanel` prop — threadelve de UI nélkül

**A dead legend upload code (handleLegendFile, legendInputRef, legendDragging):**
- Jelen van de nem kapcsolódik semmilyen renderelt JSX-hez
- Ez a brief **nem foglalkozik** a dead code-dal — csak az új entry point-ot definiálja
- Ha szükséges, a dead code cleanup egy külön lépésben történik

---

## 2. Javasolt Minimális Legend Entry UX

### 2.1 Placement — hol legyen

**A header subtitle sor alá, a SelectionToolbar elé.**

Jelenlegi visual hierarchy:
```
┌─────────────────────────────────────────┐
│ ← Vissza a projektekhez                │
│                                         │
│ Projekt Neve                            │
│ 5 tervrajz · 3 szimbólum sablon        │
│                                         │  ← IDE kerül
│ ┌─ SelectionToolbar (ha van kijelölés) ─┘
│ ├─ DetectionHistoryMini                 │
│ ├─ Tervrajzok                           │
│ └─ Plans grid / Upload zone             │
└─────────────────────────────────────────┘
```

**Miért ide:**
- A legend a projekt szintű konfiguráció része (nem plan szintű)
- Logikailag a projekt header kontextusába tartozik
- Nem zavarja a plan-szintű SelectionToolbar-t (az interakciós kontextus más)
- Nem mozgatja el a DetectionHistoryMini-t (az a "múlt futások" kontextus)

### 2.2 UI elem — mit rendereljünk

**Egy kompakt, inline "action chip" — nem drop zone, nem teljes section.**

Két állapot:

**A) Nincs legend (project.legendPlanId === null && templates.length === 0):**
```
┌──────────────────────────────────────────────────┐
│  📋  Jelmagyarázat hozzáadása                    │
│      Szimbólum sablonok automatikus felismerése  │
└──────────────────────────────────────────────────┘
```
- Border: dashed, `C.border`
- Háttér: `C.bgCard`
- Hover: border → `rgba(76,201,240,0.4)` (C.blue tint)
- Kattintás → `onLegendPanel({ projectId })` (legendPlanId nélkül → LegendPanel manual módban indul)
- BookIcon (📋) ikon a bal oldalon

**B) Van legend/templates (project.legendPlanId !== null || templates.length > 0):**
```
┌──────────────────────────────────────────────────┐
│  ✓  Jelmagyarázat: 12 szimbólum sablon     [⟳]  │
└──────────────────────────────────────────────────┘
```
- Border: solid, `rgba(76,201,240,0.2)` (C.blue tint, alive)
- Háttér: `rgba(76,201,240,0.04)`
- Szöveg: `templates.length` + "szimbólum sablon"
- Jobb oldali `[⟳]` gomb: "Szerkesztés" tooltip → `onLegendPanel({ projectId, legendPlanId: project.legendPlanId })`
- Ha `project.legendPlanId` van → LegendPanel auto-load módban
- Ha nincs legendPlanId de van templates → LegendPanel manual módban (sablonok meglévő listával)

### 2.3 Interaction flow

```
User nyit projektet
  ├─ Ha nincs legend → "Jelmagyarázat hozzáadása" chip megjelenik
  │   └─ Kattintás → LegendPanel megnyílik manual módban
  │       └─ User feltölt PDF-et a LegendPanelen belül
  │           └─ Auto-extract → sablonok mentve
  │               └─ "Detektálás indítása" gomb → detect panel
  │
  └─ Ha van legend → "Jelmagyarázat: N szimbólum" chip
      └─ [⟳] gomb → LegendPanel újra megnyílik
          └─ Sablonok szerkesztése / új PDF feltöltés
```

### 2.4 Kapcsolat a szomszédos elemekkel

| Elem | Kapcsolat a legend chiphez |
|------|---------------------------|
| SelectionToolbar | **Független.** A toolbar plan-szelekció alapú (checkbox), a legend chip projekt szintű. Nem zsúfolt: a toolbar csak kijelöléskor jelenik meg, a legend chip mindig. |
| DetectionHistoryMini | **Kiegészítő.** A legend chip fölötte van. Flow: legend → sablonok kész → detektálás indítása → history bejegyzés. Vizuálisan: legend chip → gap → DetectionHistoryMini → plans. |
| Plans grid | **Nincs direkt interakció.** A legend chip nem befolyásolja a plan kártyákat. |

### 2.5 Vertical spacing

```jsx
{/* ── Legend entry ── */}
<LegendChip />           // marginBottom: 12

{/* ── Selection toolbar ── */}
<SelectionToolbar />      // marginBottom: 0 (inherited)

{/* ── Detection history ── */}
<DetectionHistoryMini />  // marginBottom: 12

{/* ── Plans section ── */}
```

---

## 3. Érintett Fájlok

| Fájl | Változás | Kockázat |
|------|----------|----------|
| `src/pages/Projektek.jsx` | Új LegendChip JSX blokk a ProjectDetailView renderben (~15-20 sor inline JSX), L665 (`{/* Legend section removed */}` comment) helyre | **Alacsony** — csak JSX hozzáadás, meglévő state-ek és prop-ok felhasználása |
| `src/App.jsx` | **NINCS VÁLTOZÁS** — az `onLegendPanel` callback chain már működik | — |
| `src/components/LegendPanel.jsx` | **NINCS VÁLTOZÁS** — a panel már kezeli a legendPlanId=null esetet (manual mód) | — |
| `src/data/legendStore.js` | **NINCS VÁLTOZÁS** | — |
| `src/data/projectStore.js` | **NINCS VÁLTOZÁS** | — |

**Összesen: 1 fájl módosítva.**

---

## 4. Regressziós Kockázatok

| Kockázat | Súlyosság | Mitigáció |
|----------|-----------|-----------|
| LegendChip megtöri a ProjectDetailView layout-ot | **Alacsony** — inline JSX, a meglévő flexbox/block flow-ba illeszkedik | Smoke check: vizuális ellenőrzés üres projekt + teli projekt |
| onLegendPanel hívás rossz adattal | **Alacsony** — pontosan a meglévő `{ projectId, legendPlanId }` shape-et használjuk | LegendPanel már kezeli mindkét esetet (auto-load vs manual) |
| Templates count nem frissül LegendPanel bezárás után | **Közepes** — `reload()` a ProjectDetailView-ban nem hívódik automatikusan panel bezáráskor | Mitigáció: a `reload()` useCallback figyeli a `projectId`-t, de a LegendPanel bezárás nem triggereli. **Megoldás:** az `onLegendPanel` callback-ot egy wrapper-be csomagoljuk, ami bezáráskor `reload()`-ot hív, VAGY a LegendPanel onClose-t App.jsx-ben kibővítjük. **Ajánlott:** a legkisebb scope az, hogy a ProjectDetailView-ban egy `useEffect` figyeli, mikor tűnik el a legendPanelData (de ez nem elérhető innen). **Legegyszerűbb megoldás:** a legend chip onClick nem kell reload-ot — a user a chip-et látja, kattint, a panel nyílik. Bezárás után a user a plan grid-et látja. A templates.length badge akkor frissül, ha a user a projektből kimegy és visszajön (reload). **Elfogadható trade-off** a minimális scope érdekében, de ha javítani kell: egy `visibilitychange` vagy `focus` event-re reagáló reload a jövőben. |
| Dead legend code (handleLegendFile) összeütközik az új entry point-tal | **Nincs** — handleLegendFile soha nincs hívva JSX-ből. Az új chip közvetlenül `onLegendPanel`-t hív, nem `handleLegendFile`-t. |

---

## 5. Smoke Check Lista

1. **Build:** `npm run build` — 0 errors
2. **Üres projekt:** Nyiss meg egy projektet tervrajzok nélkül → "Jelmagyarázat hozzáadása" chip megjelenik
3. **Legend chip kattintás (nincs legend):** → LegendPanel megnyílik manual módban (PDF feltöltés lehetséges)
4. **LegendPanel bezárás:** → visszatérés ProjectDetailView-ba, chip továbbra is látható
5. **Létező legend-del:** Nyiss meg egy projektet ahol már van legendPlanId / templates → "Jelmagyarázat: N szimbólum" chip megjelenik
6. **Legend chip szerkesztés gomb:** → LegendPanel megnyílik, sablonok láthatóak
7. **Selection + legend együtt:** Jelölj ki 2 plan-t → SelectionToolbar megjelenik a legend chip ALATT, nem takarja el
8. **DetectionHistoryMini helye:** Továbbra is a plans grid fölött, a legend chip alatt
9. **Mobile nézet:** A chip responsive-e (text wrap, nem lóg ki)
10. **Tests:** `npx vitest run` — all green (nincs Projektek-specifikus test, de semmi nem törhet el)

---

## 6. Ajánlott Implementációs Sorrend

**Egyetlen atomi commit — egy lépés:**

### Lépés 1: LegendChip beillesztése

1. **Projektek.jsx — ProjectDetailView render szakasz (~L665 környéke):**
   - A `{/* Legend section removed */}` komment helyére inline JSX blokk:
   - Conditional rendering: `project.legendPlanId` / `templates.length` alapján
   - "Nincs legend" variáns: dashed border chip → `onLegendPanel({ projectId })`
   - "Van legend" variáns: solid border chip + szerkesztés gomb → `onLegendPanel({ projectId, legendPlanId: project.legendPlanId })`

2. **Nincs új state** — `project` és `templates` már elérhetőek a meglévő state-ekből

3. **Nincs új import** — BookIcon már definiálva Projektek.jsx-ben (L78)

### NEM ebben a lépésben:
- Dead legend code (handleLegendFile, legendInputRef, legendDragging) takarítás — külön step
- Legend upload drop zone visszaállítás — nem szükséges, LegendPanel saját upload-ot kezel
- Templates count auto-refresh panel bezárás után — elfogadható trade-off, a user navigációra frissül
- ProjectCard-on legend badge — cosmetic, külön step
- LegendPanel módosítás — nem szükséges, már kezeli mindkét esetet

---

## 7. Implementation Brief

### Scope
Egyetlen inline JSX blokk hozzáadása a ProjectDetailView renderéhez — a legend callback chain aktiválása egy minimális CTA chip-pel.

### Mi változik
`src/pages/Projektek.jsx` — ProjectDetailView return() blokkja:
- A `{/* Legend section removed */}` (L665) komment helye → LegendChip JSX (~15-20 sor)
- Két variáns: "add legend" (nincs legend) / "view legend" (van legend/templates)
- onClick → `onLegendPanel({ projectId, legendPlanId? })`

### Mi NEM változik
- App.jsx (callback chain already wired)
- LegendPanel.jsx (already handles both modes)
- legendStore.js / projectStore.js (no data model changes)
- Dead legend code (handleLegendFile etc.) — untouched, cleanup later
- SelectionToolbar, DetectionHistoryMini — untouched

### Felhasznált meglévő erőforrások
- `project` state → `project.legendPlanId` (null check)
- `templates` state → `templates.length` (count)
- `onLegendPanel` prop (already threaded)
- `BookIcon` component (already in file, L78)
- Color constants: `C.blue`, `C.bgCard`, `C.border`, `C.text`, `C.muted`

### Deliverables
- 1 fájl módosítva (Projektek.jsx)
- ~15-20 sor hozzáadott JSX
- Build: 0 errors expected
- Tests: all green expected
- Smoke: 10-pont ellenőrzés fent

### A legend chip és a dead code viszonya
A dead `handleLegendFile` (L614–627) NEM ütközik az új chip-pel. Az új chip közvetlenül `onLegendPanel`-t hív. A dead code egy korábbi legend upload drop zone maradványa, ami a LegendPanel-en kívüli feltöltést kezelte. Az új design a LegendPanel-re bízza a feltöltést — ez a helyes flow, mert a LegendPanel auto-extract-et is kezel azonnal feltöltés után.
