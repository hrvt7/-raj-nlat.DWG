# BOM Export — Implementation Brief v1.0

**Státusz:** Jóváhagyásra vár · **Scope:** MVP, belső dokumentum · **Dátum:** 2026-03-07

---

## 1. Executive Summary

Egyetlen új `generateBOM()` függvény a `src/utils/bomExport.js`-ben, amely a `quote.items` snapshot-ból kiszűri az anyag (`material` + `cable`) tételeket, név + egység alapján aggregálja, és UTF-8 BOM-os, pontosvesszős CSV-t tölt le. A UI egy új "Anyagjegyzék (BOM)" gomb a jobb oldali sidebar-ban, a PDF kártya alatt, saját kártyában. Az export **minden** outputMode-ban ugyanazt a teljes anyagjegyzéket adja (belső dokumentum, nem customer-facing). Nincs XLSX, nincs styling, nincs multi-sheet, nincs supplier adat.

---

## 2. Ajánlott adatforrás

**`quote.items`** — a persisted snapshot.

Indoklás:
- Már a localStorage-ban van, nincs újraszámítás.
- A `generatePdf.js` és `csvExport.js` is ezt használja — kipróbált, stabil forrás.
- A `computePricing().lines`-ból származik, de az újrahívása `assemblies`, `workItems`, `materials` context-et igényel, ami nem elérhető a QuoteView-ban.
- Az `assemblySummary` nem tartalmaz anyag-szintű bontást (csak aggregált `totalMaterials`, `totalLabor`), tehát tétel-szintű BOM-hoz nem alkalmas.

Mezők amiket használunk:

| Mező | Forrás | Leírás |
|------|--------|--------|
| `name` | `item.name` | Anyag neve |
| `qty` | `item.qty` | Mennyiség |
| `unit` | `item.unit` | Egység (db, m, csomag) |
| `unitPrice` | `item.unitPrice` | Nettó egységár (Ft) |
| `materialCost` | `item.materialCost` | Nettó összköltség (Ft) |
| `type` | `item.type` | Szűrés: `material` \| `cable` |

---

## 3. Ajánlott aggregációs szabály

**Kulcs: `name` + `unit`** (case-insensitive trim).

Indoklás:
- `cikkszám` / `code` nem érhető el a `quote.items`-ben — a `computePricing` nem továbbítja a `material.code`-ot a line-okba (csak `name`-et). Cikkszám alapú aggregáció a pricing pipeline módosítását igényelné, ami ki van zárva az MVP-ből.
- Név + egység az egyértelmű azonosító a jelenlegi adatmodellben. Pl. "Dugalj 2P+F Legrand Valena Life" + "db" = egyedi anyag.
- Az egységet is figyelembe vesszük, mert előfordulhat azonos nevű tétel eltérő egységgel (pl. "NYM-J 3×2.5" → "m" vs "tekercs").

Aggregáció:
- `qty`: összeadás
- `unitPrice`: súlyozott átlag (`sum(materialCost) / sum(qty)`)
- `materialCost`: összeadás

Megjegyzés 2. körhöz: ha a pricing pipeline-ba bekerül a `material.code`, az aggregáció kulcsa `code + unit`-ra módosul. Ez backward compatible, mert a fallback továbbra is `name + unit`.

---

## 4. Ajánlott oszlopok (MVP)

| # | Oszlop | Forrás | Formátum |
|---|--------|--------|----------|
| 1 | **Megnevezés** | aggregált `name` | szöveg |
| 2 | **Mennyiség** | aggregált `qty` | szám (2 tizedes) |
| 3 | **Egység** | `unit` | szöveg |
| 4 | **Egységár (Ft nettó)** | `unitPrice` (súlyozott átlag) | kerekített egész |
| 5 | **Összeg (Ft nettó)** | aggregált `materialCost` | kerekített egész |

Nem kerül bele:
- ÁFA (belső dokumentum, nettó elegendő)
- Munkadíj (BOM ≠ árajánlat)
- Cikkszám (nem elérhető a jelenlegi adatmodellben)
- Supplier / beszállító
- Kategória (nincs a quote item-ben; 2. kör)

Összesítő sor a végén:
- `ÖSSZESEN` | — | — | — | `sum(materialCost)` Ft

---

## 5. Ajánlott export formátum

**CSV** — pontosvesszős, UTF-8 BOM-mal.

Indoklás:
- A `csvExport.js`-ben már van működő `downloadCSV()` és `csvEsc()` helper. Újrafelhasználjuk.
- A magyar Excel pontosvesszőt vár szeparátornak, és a BOM-ot igényli UTF-8 felismeréshez — ez már megoldott.
- XLSX-hez `exceljs` vagy `xlsx` npm dep kellene. A projekt jelenleg zero-dep a PDF/CSV exportra (HTML + `window.print()`). Nem éri meg az MVP-ben betolni.
- A CSV megnyitható Excelben, Google Sheets-ben, LibreOffice-ban — elegendő lefedettség.

Fájlnév pattern: `{projectSlug}_BOM_{date}.csv`
Példa: `lakasfelujitas_BOM_2026-03-07.csv`

---

## 6. Ajánlott UI elhelyezés

Új kártya a jobb oldali sidebar-ban, **a PDF kártya alá** (L510 után, a `</div>` záró tag elé).

```
┌─────────────────────────┐
│  Metadata card          │
├─────────────────────────┤
│  Státusz card           │
├─────────────────────────┤
│  PDF Árajánlat card     │  ← meglévő
│   - Ajánlat mód        │
│   - Részletezési szint  │
│   - Preview             │
│   - [PDF letöltése]     │
├─────────────────────────┤
│  Anyagjegyzék (BOM)     │  ← ÚJ
│   - Leírás szöveg       │
│   - [CSV letöltése]     │
└─────────────────────────┘
```

A kártya dizájn követi a meglévő sidebar kártyákat:
- `background: C.bgCard`, `border: 1px solid C.border`, `borderRadius: 12`, `padding: 18`
- Cím: Syne 800, 12px
- Leírás: DM Mono 10px, muted — "Belső anyagjegyzék — minden anyag- és kábeltétel, outputMode-tól függetlenül."
- Gomb: teljes szélességű, C.yellow háttér, `#09090B` szöveg (megkülönböztetés a zöld PDF gombtól)

---

## 7. Érintett fájlok

| Fájl | Változás | Kockázat |
|------|----------|----------|
| **`src/utils/bomExport.js`** | ÚJ — `generateBOM(quote)` + `exportBOM(quote)` | Nincs regresszió (új fájl) |
| **`src/App.jsx`** | QuoteView sidebar: új BOM kártya (L510 környékén) | Alacsony — additive JSX, nem módosít meglévő logikát |

Nem érintett:
- `store.js` — nem kell új mező
- `generatePdf.js` — a BOM teljesen független
- `pricing.js` — nem nyúlunk a számítási motorhoz
- `csvExport.js` — a BOM export külön fájl, nem módosítjuk a meglévő quote CSV-t (az más struktúra)

---

## 8. Regressziós kockázatok

| Kockázat | Valószínűség | Kezelés |
|----------|-------------|---------|
| CSV sérti az Excel charset felismerést | Alacsony | UTF-8 BOM-ot használunk, mint a `csvExport.js` — kipróbált minta |
| Aggregáció téves egyezést produkál (eltérő anyag, azonos név) | Alacsony | A TakeoffPro material lista egyedi neveket használ. 2. körben code-alapú aggregáció javítja |
| Sidebar elcsúszik mobil nézetben | Alacsony | A QuoteView desktop-only (a mobile audit nem terjed ki erre az oldalra) |
| `materialCost` hiányzik régi quote-okból | Közepes | Fallback: `(unitPrice \|\| 0) * (qty \|\| 0)` — ez pontosan az eredeti számítás |

---

## 9. Smoke check lista

1. ☐ `combined` módban: BOM CSV letöltődik, minden anyag + kábel megjelenik, labor nem
2. ☐ `labor_only` módban: BOM CSV **ugyanazt** tartalmazza mint combined-ban (belső dok)
3. ☐ `split_material_labor` módban: BOM CSV **ugyanazt** tartalmazza
4. ☐ Aggregáció: azonos nevű tételek összevonva, qty összeadva, unitPrice súlyozott átlag
5. ☐ CSV megnyitása magyar Excel-ben: ékezetek helyesek, oszlopok elválasztva
6. ☐ Fájlnév tartalmazza a projekt slug-ot + dátumot
7. ☐ Összesítő sor a végén: anyagköltség összeg megegyezik a KPI-val
8. ☐ Üres items tömb: gomb letiltva vagy no-op (nem üres fájl letöltés)
9. ☐ Build: 0 hiba, 0 új warning

---

## 10. Ajánlott implementációs sorrend

```
1.  bomExport.js — generateBOM(quote): szűrés + aggregáció + CSV string
2.  bomExport.js — exportBOM(quote): fájlnév generálás + downloadCSV()
3.  App.jsx     — import + handleBom handler a QuoteView-ban
4.  App.jsx     — BOM kártya JSX a sidebar-ban (PDF kártya alatt)
5.  Build + smoke check
6.  Commit + push
```

Becsült méret: ~60 sor `bomExport.js` + ~25 sor sidebar JSX.
