# Product-Flow Audit — Fő User Journey

## 1. Jelenlegi fő flow összefoglalása

```
Projektek lista
  └─ Projekt megnyitása → ProjectDetailView
       ├─ Tervrajz feltöltés (PDF/DXF/DWG drop zone)
       ├─ Legend chip: "Jelmagyarázat hozzáadása" / "N szimbólum sablon"
       │    └─ LegendPanel (manual PDF upload → auto-extract → sablonok mentése)
       │         └─ "Detektálás indítása" gomb → DetectionReviewPanel
       │              └─ "Tovább a tervekhez" / "Tovább a kalkulációhoz" → ??? (bezár)
       ├─ Plan kijelölés (checkbox) → SelectionToolbar
       │    ├─ "Detektálás" → DetectionReviewPanel
       │    ├─ "Összevonás" → PdfMergePanel → ajánlat mentés → Ajánlatok oldal
       │    └─ "Megnyitás" → TakeoffWorkspace (per-plan)
       │         └─ Mentés → vissza a Projektek-re (NEM ajánlat)
       └─ DetectionHistoryMini: régebbi detekciós futások megtekintése
```

**Ajánlat létrehozásának egyetlen útja ma:** Plan kijelölés → Összevonás → PdfMergePanel → `handleQuoteSaved`.

**Per-plan TakeoffWorkspace:** annotációk + árazás mentése a plan metadatába → visszatérés Projektek-re. Nem hoz létre ajánlatot.

---

## 2. Top 5 Friction Pont (prioritási sorrendben)

---

### #1 — DetectionReviewPanel CTA zsákutca

**Mi a probléma:**
A DetectionReviewPanel sikeroldala két CTA szöveget mutat:
- `needsManual > 0` → "Tovább a tervekhez"
- `needsManual === 0` → "Tovább a kalkulációhoz"

Mindkét gomb ugyanazt csinálja: `onDone()` → panel bezárás → vissza ProjectDetailView-ra. A "Tovább a kalkulációhoz" szöveg ígér egy következő lépést, de nincs ilyen — a user visszakerül a projekt nézetre és maga kell rájöjjön, mit csináljon most (plan kijelölés → megnyitás → workspace → árazás).

**Miért fontos:**
Ez a detekció utáni pillanat a legkritikusabb momentum: a user éppen automatizáltan kapott felismert elemeket, motivált a következő lépésre. Ha a CTA zsákutcába vezet, a momentum elveszik. A "Tovább a kalkulációhoz" hamis ígéret — UX trust issue.

**Legkisebb scoped következő lépés:**
A "Tovább a kalkulációhoz" CTA funkcionálisan is vigye tovább a user-t: `onDone` helyett hívjon egy `onLocateDetection`-t az **első olyan plan-re, aminek vannak detekciói** — így a user azonnal a TakeoffWorkspace-ben landol, nem a projektek oldalon. Ha `needsManual > 0`, a CTA marad "Tovább a tervekhez" (bezárás). **1 fájl: DetectionReviewPanel.jsx** — a CTA onClick logika módosítása.

---

### #2 — Nincs közvetlen út a per-plan workspace-ből ajánlatba

**Mi a probléma:**
A per-plan TakeoffWorkspace (`projektek-workspace` page) `onSaved` callback-je:
```js
onSaved={() => { setPage('projektek') }}
```
Ez a plan annotációit és árazását menti, majd visszavisz a projektek oldalra. A user nem tud innen egyetlen kattintással ajánlatot generálni. Az ajánlat létrehozásának egyetlen útja: vissza a projekthez → plan-ek kijelölése → Összevonás → PdfMergePanel.

**Miért fontos:**
Az egytervrajzos projekteknél (ami a leggyakoribb eset kisebb villamossági munkáknál) ez teljesen felesleges körbejárás. A user kész az árazással, de 4 extra kattintás kell az ajánlat generálásához. Ez a fő konverziós akadály: az "eladható workflow" ígérete itt törik el.

**Legkisebb scoped következő lépés:**
A per-plan TakeoffWorkspace save utáni dialógusban (vagy inline CTA-ként) kínáljunk egy "Ajánlat generálása" gombot, ami ugyanazt a `handleQuoteSaved` flow-t hívja mint a PdfMergePanel. **2 fájl: TakeoffWorkspace.jsx** (új CTA a save confirmation-ben) + **App.jsx** (projektek-workspace `onSaved` kibővítése `quote` opcionális paraméterrel).

---

### #3 — Legend → Detekció átmenet megszakad

**Mi a probléma:**
A LegendPanel "Detektálás indítása" gombja (L877–888) hívja `onRunDetection({ projectId, templateCount })`-t. Ez az App.jsx-ben nyitja a DetectionReviewPanel-t. **De:** a DetectionReviewPanel-nek kellenek a `plans` (kijelölt tervrajzok), amiket a ProjectDetailView-ban kellene kijelölni. Ha a user a LegendPanel-ből indít detekciót, nem volt plan kijelölés.

Az App.jsx kód (L892+):
```jsx
<DetectionReviewPanel plans={detectPanelPlans} ... />
```
A `detectPanelPlans` a SelectionToolbar-ból jön. Ha a user a legend chip-ből érkezett, ez üres.

**Miért fontos:**
A "Jelmagyarázat → Sablonok kész → Detektálás indítása" a leglogikusabb happy path. Ha ez nem működik (üres plan lista → nincs mit detektálni), a user kénytelen bezárni, kijelölni plan-eket, majd újra indítani. A flow megszakadása azt jelzi, hogy a legend és a detection külön szigetként működik, nem integrált pipeline.

**Legkisebb scoped következő lépés:**
A `onRunDetection` handler az App.jsx-ben: ha `detectPanelPlans` üres, automatikusan betöltse az adott projekt összes tervrajzát (`getPlansByProject(projectId)`), és azokkal nyissa a DetectionReviewPanel-t. **1 fájl: App.jsx** — `handleRunDetection` kiegészítése fallback plan betöltéssel.

---

### #4 — PdfMergePanel az egyetlen ajánlat-generáló, de a neve és UX-e félrevezető

**Mi a probléma:**
A PdfMergePanel ("Összevonás") az egyetlen path, ami `handleQuoteSaved`-et hív és tényleges ajánlatot hoz létre. De:
- A neve "Összevonás" — ez PDF merge-re utal, nem ajánlat generálásra
- Csak kijelölt plan-ekre elérhető a SelectionToolbar-ból
- Egyetlen plan kijelölésekor nincs "merge" értelme — a user nem gondolja, hogy ez az ajánlat útja

**Miért fontos:**
Az ajánlat az egész alkalmazás végcélja (Árajánlat.DWG = árajánlat). Ha ennek a legfontosabb funkciónak a belépési pontja egy "Összevonás" gomb, amit 2+ plan kijelölése után lát a user, az a workflow utolsó mérföldje rejtve marad.

**Legkisebb scoped következő lépés:**
Egyelőre: a SelectionToolbar-ban az "Összevonás" gomb mellett (vagy helyett, ha 1 plan van kijelölve) legyen egy "Ajánlat készítése" CTA, ami ugyanazt a merge panel-t nyitja. **1 fájl: Projektek.jsx** — SelectionToolbar CTA szöveg/logika módosítása plan count alapján.

---

### #5 — Templates count nem frissül LegendPanel bezárás után (részleges fix)

**Mi a probléma:**
A `legendPanelOpen` → `reload()` mechanizmus frissíti a `project` state-et (beleértve `legendPlanId`-t), de a `templates` state (`getTemplatesByProject`) is újratöltődik a `reload()`-ban. **Azonban:** ha a LegendPanel-ben mentett sablonokat a user nem a "Mentés" gombbal, hanem az "Összes mentése" gombbal menti, és utána azonnal bezárja a panelt, a `reload()` aszinkron timing miatt a chip "0 szimbólum sablon"-t mutathat egy pillanatra, mielőtt frissül.

A `reload` callback (Projektek.jsx ~L575) `getProject` + `getTemplatesByProject` + `getPlansByProject`-et hív — mindhárom szinkron localStorage read, tehát a timing issue valójában minimális. **De:** a chip vizuálisan "ugrik" (0 → N), ami nem smooth.

**Miért fontos:**
Ez kozmetikai, de a felhasználói bizalmat érinti: ha a user sablonokat mentett és a chip nem mutatja azonnal, azt gondolhatja, hogy elvesztek. Az "Összevonás" és "Detektálás" gombok is a templates.length-re reagálnak, tehát a stale count funkcionális következményekkel is járhat (üres detection run).

**Legkisebb scoped következő lépés:**
A `reload` hívás kiegészítése egy minimális delay-jel (50ms setTimeout) vagy a LegendPanel `onClose` callback-jének kibővítése: `onClose({ templatesChanged: true })` → feltételes reload. **1 fájl: App.jsx** — legendPanel onClose wrapper. De ez alacsony prioritás — a jelenlegi megoldás funkcionálisan működik.

---

## 3. Egyetlen ajánlott következő implementációs lépés

**→ #1: DetectionReviewPanel CTA zsákutca fix.**

**Indoklás:**
- Legkisebb scope (1 fájl, ~10 sor)
- Legnagyobb UX hatás (a detekció utáni momentum megőrzése)
- Nem nyit új architektúra-kört
- A meglévő `onLocateDetection` callback már létezik és működik
- A "Tovább a kalkulációhoz" CTA-t funkcionálisan is értelmessé teszi
- Közvetlenül javítja a "demo-flow" minőségét: legend → detect → **azonnal a workspace-ben** ahelyett, hogy visszadobja a user-t

A többi friction pont (per-plan → ajánlat shortcut, legend → detect plan fallback, merge naming) mind nagyobb scope és/vagy App.jsx routing módosítást igényel.

---

## 4. Flow mátrix — jelenlegi vs. ideális

| Lépés | Jelenlegi | Ideális |
|-------|-----------|---------|
| Legend → Detect | ⚠ Detect plan lista üres ha legend-ből jön | Auto-fill projekt plan-jeivel |
| Detect → Workspace | ❌ CTA bezár, user keresgél | CTA → első detektált plan a workspace-ben |
| Workspace → Ajánlat | ❌ Nincs közvetlen út, 4 extra kattintás | "Ajánlat generálása" CTA save után |
| Merge → Ajánlat | ✅ Működik | ✅ (de a "Merge" név félrevezető) |
| Legend chip refresh | ✅ Működik (reload-on-close) | ✅ |
| Per-plan save | ✅ Mentés OK | ⚠ Visszavisz projektre, nem kínál ajánlatot |
