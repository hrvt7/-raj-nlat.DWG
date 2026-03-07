# Implementation Brief — Multi-Plan CTA/Copy Tisztítás

## 1. Current-State Audit

### "Összevonás" előfordulások a codebase-ben

| # | Fájl | Sor | Kontextus | Jelenlegi szöveg |
|---|------|-----|-----------|------------------|
| 1 | `Projektek.jsx` L127 | SelectionToolbar CTA gomb | `"Összevonás kalkulációhoz"` |
| 2 | `Projektek.jsx` L402 | ScannerSVG tags (projekt-kártya dekoráció) | `tags={['Tervrajzok', 'Kalkuláció', 'Összevonás']}` |
| 3 | `PdfMergePanel.jsx` L186 | Panel header cím | `"Összevonás kalkulációhoz"` |
| 4 | `PdfMergePanel.jsx` L272 | Üres állapot guidance | `"...mielőtt összevonod."` |
| 5 | `PdfMergePanel.jsx` L404 | Footer save gomb | `"📋 Árajánlat létrehozása"` ← **ez már jó!** |

### A jelenlegi flow

```
ProjectDetailView
  └─ Plan kijelölés (1 vagy több)
       └─ SelectionToolbar megjelenik:
            ├─ "Szimbólumdetektálás" (detekció CTA — ez OK)
            └─ "Összevonás kalkulációhoz" → PdfMergePanel
                 ├─ Header: "Összevonás kalkulációhoz"
                 ├─ Összesített lista: mergedRows
                 └─ Footer: "📋 Árajánlat létrehozása" ← ez viszont jó!
```

### Miért félrevezető

1. **Az "Összevonás" technikai terminus** — PDF merge-re utal. A user célja ajánlat generálása, nem fájlok összevonása. Az "Összevonás kalkulációhoz" nem kommunikálja, hogy ez az ajánlat-generálás belépési pontja.

2. **1 plan kijelölésnél értelmetlen** — Ha egyetlen terv van kijelölve, az "összevonás" szónak nincs értelme. Nincs mit összevonni. Mégis ugyanaz a CTA jelenik meg.

3. **A PdfMergePanel footer gombja ("Árajánlat létrehozása") már helyes** — a user csak akkor érti, hogy ajánlatot generál, amikor már a panelen belül van. A belépési pont (SelectionToolbar) és a panel header még a régi technikai nevet használja.

4. **Az ScannerSVG tag (`'Összevonás'`)** dekorációs elem az üres projektek oldalon, de megerősíti a félrevezető terminológiát.

---

## 2. Javasolt Minimum CTA/Copy Solution

### Alapelv: a belépési pont és a panel header tükrözze a végcélt

A user célja: **ajánlat generálása a kijelölt terv(ek)ből.** A CTA szöveg ezt mondja, nem a technikai mechanizmust.

### Szöveg-csere mátrix

| # | Hely | Jelenlegi | Javasolt | Megjegyzés |
|---|------|-----------|----------|------------|
| 1 | SelectionToolbar CTA (1 plan) | "Összevonás kalkulációhoz" | **"Ajánlat generálása"** | 1 plan → egyértelmű cél |
| 2 | SelectionToolbar CTA (2+ plan) | "Összevonás kalkulációhoz" | **"Közös ajánlat generálása"** | 2+ plan → közös ajánlat |
| 3 | ScannerSVG tag | `'Összevonás'` | **`'Árajánlat'`** | Dekorációs, de konzisztens |
| 4 | PdfMergePanel header (1 plan) | "Összevonás kalkulációhoz" | **"Ajánlat generálása"** | Panel cím = végcél |
| 5 | PdfMergePanel header (2+ plan) | "Összevonás kalkulációhoz" | **"Közös ajánlat · N terv"** | Plusz plan count |
| 6 | PdfMergePanel üres állapot | "...mielőtt összevonod." | **"...mielőtt ajánlatot generálsz."** | Guidance text |
| 7 | PdfMergePanel footer gomb | "📋 Árajánlat létrehozása" | **marad** | Már helyes |

### A count-alapú CTA logika

A SelectionToolbar-nak szüksége van a `count` prop-ra (már megkapja). A szöveg:

```
count === 1 ? "Ajánlat generálása" : "Közös ajánlat generálása"
```

A PdfMergePanel-nek szüksége van a `plans.length`-re (már elérhető). A header:

```
plans.length === 1
  ? "Ajánlat generálása"
  : `Közös ajánlat · ${plans.length} terv`
```

### Ikon

A jelenlegi `CalcIcon` a SelectionToolbar-ban maradhat — a számológép ikon passzol az ajánlat generáláshoz is. Alternatíva: `📋` emoji (konzisztens a footer gombbal), de ez kozmetikai és nem szükséges.

---

## 3. Érintett Fájlok

| Fájl | Módosítás típusa | Scope |
|------|------------------|-------|
| `src/pages/Projektek.jsx` | SelectionToolbar CTA szöveg + ScannerSVG tag | ~3 sor |
| `src/components/PdfMergePanel.jsx` | Header cím + üres állapot guidance | ~3 sor |

**2 fájl, ~6 sor szöveg-csere.** Nulla logikai változás.

### Kiegészítés: SelectionToolbar prop bővítés

A jelenlegi `SelectionToolbar` nem kap `count`-ot a CTA szöveg döntéséhez — **de de, megkapja** (L111: `{ count, onDetect, onMerge, onDeselect }`). Tehát a count-alapú CTA szöveg prop nélkül megoldható.

---

## 4. Mi NEM Kerül Bele

- ❌ **Merge logika refaktor** — a PdfMergePanel belső működése (row merge, pricing compute) érintetlen
- ❌ **Bundle redesign** — a bundleId, sourceType mezők érintetlenek
- ❌ **Új route vagy navigációs változás** — a flow ugyanaz marad, csak a copy változik
- ❌ **Callback/prop átnevezés** — `onMerge`, `onMergePanel`, `mergePanelPlans` maradnak a jelenlegi nevükön (kód refaktor, nem scope)
- ❌ **1 plan speciális kezelés** — a MergePanel 1 plan-nel is ugyanúgy fut, nem kap külön logikát
- ❌ **PdfMergePanel footer gomb** — már helyes ("📋 Árajánlat létrehozása"), nem nyúlunk hozzá
- ❌ **Icon csere** — marad CalcIcon a SelectionToolbar-ban

---

## 5. Regressziós Kockázatok

| Kockázat | Valószínűség | Mitigation |
|----------|-------------|------------|
| Szöveg-csere elrontja a layout-ot | Nagyon alacsony | A magyar szövegek hasonló hosszúságúak, flexbox layout kezeli |
| `count` prop elérhetőség a SelectionToolbar-ban | Nulla | A `count` prop már létezik (L111), használva van (L123) |
| `plans.length` elérhetőség a PdfMergePanel-ben | Nulla | A `plans` prop kötelező (L24), használva van (L189) |
| ScannerSVG tag csere vizuális hatás | Nagyon alacsony | Dekorációs elem, nincs funkcionális hatása |

**Nulla logikai módosítás → nulla logikai kockázat.** Kizárólag copy/szöveg csere.

---

## 6. Smoke Check Lista

1. **1 plan kijelölés → SelectionToolbar** → "Ajánlat generálása" CTA szöveg
2. **2 plan kijelölés → SelectionToolbar** → "Közös ajánlat generálása" CTA szöveg
3. **1 plan → CTA kattintás → PdfMergePanel header** → "Ajánlat generálása"
4. **2+ plan → CTA kattintás → PdfMergePanel header** → "Közös ajánlat · 2 terv"
5. **PdfMergePanel üres állapot szöveg** → "...mielőtt ajánlatot generálsz."
6. **PdfMergePanel footer gomb** → "📋 Árajánlat létrehozása" (változatlan)
7. **ScannerSVG tag** → "Árajánlat" (nem "Összevonás")
8. **Funkcionális: merge flow** → ajánlat generálás ugyanúgy működik (kattintás → save → Ajánlatok oldal)

---

## 7. Implementációs Sorrend

### Egyetlen atomi lépés

1. **Projektek.jsx L127:** SelectionToolbar CTA szöveg → count-alapú
2. **Projektek.jsx L402:** ScannerSVG tag `'Összevonás'` → `'Árajánlat'`
3. **PdfMergePanel.jsx L186:** Header cím → plans.length-alapú
4. **PdfMergePanel.jsx L272:** Üres állapot guidance szöveg
5. **Build + test**
6. **Smoke check** (lista fent)

---

## 8. Rövid Végrehajtható Implementation Brief

```
SCOPE:      Multi-plan CTA/copy tisztítás
FILES:      2 (Projektek.jsx, PdfMergePanel.jsx)
LINES:      ~6 sor szöveg-csere
LOGIKA:     Nulla módosítás — kizárólag copy

LÉPÉSEK:

1. Projektek.jsx — SelectionToolbar CTA (L127):
   label: count === 1 ? "Ajánlat generálása" : "Közös ajánlat generálása"

2. Projektek.jsx — ScannerSVG tag (L402):
   tags={['Tervrajzok', 'Kalkuláció', 'Árajánlat']}

3. PdfMergePanel.jsx — Header cím (L186):
   plans.length === 1
     ? "Ajánlat generálása"
     : `Közös ajánlat · ${plans.length} terv`

4. PdfMergePanel.jsx — Üres állapot guidance (L272):
   "Nyisd meg a terveket és készíts kalkulációt, mielőtt ajánlatot generálsz."

5. Build: 0 error
6. Test: 85/85 green
7. Smoke: 8 eset (lista fent)
```
