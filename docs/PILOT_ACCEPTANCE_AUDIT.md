# TakeoffPro — Pilot Acceptance Audit

> **Dátum:** 2026-03-07
> **Scope:** Teljes ajánlat (quote) rendszer — létrehozás, megjelenítés, export, beállítások
> **Cél:** Blokkoló hibák, inkonzisztenciák és edge case-ek azonosítása a pilot indítás előtt

---

## 1. Current-State Audit

### 1.1 Quote létrehozási útvonalak

| # | Útvonal | Fájl | ID generálás | outputMode forrás | Incl/Excl seed | Validity/Payment seed |
|---|---------|------|-------------|-------------------|----------------|----------------------|
| A | Per-plan (TakeoffWorkspace) | `TakeoffWorkspace.jsx` L1233 | `generateQuoteId()` ✅ | Project default → `'combined'` | outputMode-specifikus `‖` settings | settings |
| B | Merge quote (PdfMergePanel) | `PdfMergePanel.jsx` L140 | `'Q-' + Date.now().toString(36)` ⚠️ | Első plan project default → `'combined'` | outputMode-specifikus `‖` settings | settings |
| C | buildQuoteFromPlan (App.jsx) | `App.jsx` L984 | `generateQuoteId()` ✅ | Project default → `'combined'` | outputMode-specifikus `‖` settings | settings |

### 1.2 QuoteView (megjelenítés + szerkesztés)

- **Fájl:** `App.jsx` L131–248
- Szerkeszthető mezők: projectName, clientName, hourlyRate, markup_pct, outputMode, inclusions, exclusions, validityText, paymentTermsText
- isDirty check: összeveti az edit state-et az eredeti quote értékekkel
- Mentés: `handleMetaSave()` → `onSaveQuote(updated)` → `saveQuote()` → localStorage
- PDF: `handlePdf()` → `generatePdf(liveQuote, settings, pdfLevel, outputMode)`

### 1.3 PDF Export

- **Fájl:** `generatePdf.js` (459 sor)
- 3 részletességi szint: compact / summary / detailed
- outputMode figyelembevétele: modeNote banner, labor_only sorok szűrése
- Inclusions/Exclusions: zöld/sárga dobozok
- Validity/Payment: terms-box szekció
- Aláírási blokk: statikus szöveg

### 1.4 BOM Export

- **Fájl:** `bomExport.js` (111 sor)
- outputMode-független — mindig teljes anyaglista
- Aggregáció: `code+unit` (elsődleges) vagy `name+unit` (fallback)
- CSV: pontosvesző elválasztó, BOM marker, magyar formázás

### 1.5 Settings

- **Fájl:** `Settings.jsx` QuoteTab (L624–681)
- 7 beállítás: validity_days, footer_text, default_notes, default_validity_text, default_payment_terms_text, default_inclusions, default_exclusions
- Deep-merge: `loadSettings()` a `quote` sub-objectet külön mergeli `DEFAULT_SETTINGS.quote`-tal

---

## 2. Top 10 Pilot Risk Lista

### 🔴 BLOCKER (azonnali javítás szükséges)

**R1 — ReferenceError: `DEFAULT_VALIDITY_TEXT` / `DEFAULT_PAYMENT_TERMS_TEXT` törölt konstansok**
- **Súlyosság:** BLOCKER — runtime crash
- **Hol:** `App.jsx` L146, L147, L160, L161, L174, L175
- **Mi történt:** Task 21-ben a két konstanst eltávolítottuk App.jsx-ből, de a QuoteView 6 helyen még hivatkozik rájuk.
- **Hatás:** Bármely quote megnyitása `ReferenceError`-t dob. A build nem jelzi, mert Vite nem végez undefined-variable ellenőrzést JSX-ben.
- **Javítás:** A `?? DEFAULT_VALIDITY_TEXT` → `?? ''` (vagy `?? loadSettings().quote.default_validity_text`) csere mind a 6 helyen.

### 🟡 HIGH (funkció-hibás viselkedés)

**R2 — PDF terms `\n` replacement dupla-escaped**
- **Súlyosság:** HIGH — PDF-ben nem törik a sor
- **Hol:** `generatePdf.js` L421, L423
- **Probléma:** `.replace(/\\n/g, '<br/>')` — ez a literal `\n` stringet keresi (backslash + n), nem a valódi newline-t. Összehasonlításul L205-206 helyesen `/\n/g`-t használ az inclusions/exclusions-nél.
- **Hatás:** Többsoros validity/payment szöveg a PDF-ben egyetlen sorba kerül.

**R3 — PdfMergePanel quote ID inkonzisztencia**
- **Súlyosság:** MEDIUM — nem blokkoló, de adatintegritási kockázat
- **Hol:** `PdfMergePanel.jsx` L140
- **Probléma:** `'Q-' + Date.now().toString(36)` ahelyett, hogy `generateQuoteId()`-t használna (mint a másik két útvonal).
- **Hatás:** Merge quote ID formátuma (`Q-lxyz123`) eltér a standard formától (`QT-2026-001`). Évszám-alapú szekvenciális számozás nem működik merge quote-oknál.

**R4 — PdfMergePanel hourlyRate/markup defaults eltérnek**
- **Súlyosság:** MEDIUM
- **Hol:** `PdfMergePanel.jsx` L162–163
- **Probléma:** `settings?.hourlyRate ?? 8000` és `settings?.markup ?? 0.15` — míg TakeoffWorkspace a saját belső `hourlyRate` és `markup` state-et használja (amit a UI-ból kap). A 8000 hardcoded fallback eltér a Settings-ben beállítható 9000-es defaulttól.

### 🟠 MEDIUM (inkonzisztencia, edge case)

**R5 — `OUTPUT_MODE_INCLEXCL` inline duplikáció**
- **Súlyosság:** MEDIUM — karbantartási kockázat
- **Hol:** `TakeoffWorkspace.jsx` L1229, `PdfMergePanel.jsx` L135
- **Probléma:** A `labor_only` exclusions szöveg 3 helyen van definiálva (App.jsx + TakeoffWorkspace + PdfMergePanel). Ha valaki az egyiket módosítja, a másik kettő nem követi.

**R6 — Merge quote mixed-project edge case**
- **Súlyosság:** MEDIUM
- **Hol:** `PdfMergePanel.jsx` L133–134
- **Probléma:** Merge quote-nál a `defaultQuoteOutputMode` az ELSŐ plan projektjéből jön: `plans.find(p => p.projectId)?.projectId`. Ha a kijelölt planok különböző projektekhez tartoznak (eltérő default outputMode-dal), az eredmény nem determinisztikus — a plan lista sorrendjétől függ.

**R7 — Régi quote-ok backward compatibility — inclusions/exclusions/validity hiánya**
- **Súlyosság:** LOW-MEDIUM
- **Hol:** `App.jsx` QuoteView L144–147
- **Probléma:** Régi quote-ok (Task 19/20/21 előtt létrehozva) nem tartalmaznak `inclusions`, `exclusions`, `validityText`, `paymentTermsText` mezőket. A QuoteView `??` fallback-kel kezeli, de a `DEFAULT_VALIDITY_TEXT` bug (R1) miatt ez most crash-el. Javítás után is: a régi quote-ok üres mezőkkel jelennek meg, ami zavarba ejtheti a felhasználót.

### 🟢 LOW (kozmetikai, nem-blokkoló)

**R8 — `quote.gross` nem bruttó, hanem nettó**
- **Súlyosság:** LOW — elnevezési zavar
- **Hol:** `App.jsx` L199, `TakeoffWorkspace.jsx` L1248, `PdfMergePanel.jsx` L153
- **Probléma:** `gross: Math.round(pricing.total)` — de ez ÁFA nélküli (nettó) összeg. A `gross` mező neve félrevezető. A QuoteView-ban `net` változó tartalmazza ugyanezt.

**R9 — PDF footer_text pozíció**
- **Súlyosság:** LOW
- **Hol:** `generatePdf.js` L424
- **Probléma:** A `footerText` (Settings-ből) a terms-box-on belülre kerül, a validity/payment szöveg után. Ha a felhasználó a footer-t külön látná szívesebben (pl. oldal alján), az most nem lehetséges.

**R10 — handleMetaSave: `quote.gross = net` felülírás**
- **Súlyosság:** LOW
- **Hol:** `App.jsx` L199
- **Probléma:** A mentésnél `gross: net` — az ÁFA nélküli összeg kerül a `gross` mezőbe. Ez konzisztens a létrehozáskor használt logikával, de az elnevezés zavaró és a summary.grandTotal is nettó.

---

## 3. Acceptance Test Matrix

### 3.1 Quote létrehozás (3 útvonal × 3 outputMode)

| Teszt ID | Útvonal | outputMode | Elvárt eredmény | Státusz |
|----------|---------|-----------|-----------------|---------|
| **TC-01** | Per-plan (TakeoffWorkspace) | combined | Quote jön létre QT-YYYY-NNN ID-val, outputMode=combined, incl/excl üres, validity/payment settings-ből | ⬜ |
| **TC-02** | Per-plan (TakeoffWorkspace) | labor_only | outputMode=labor_only, exclusions tartalmazza az anyag-kizárás szöveget, validity/payment settings-ből | ⬜ |
| **TC-03** | Per-plan (TakeoffWorkspace) | split_material_labor | outputMode=split, incl/excl üres (settings fallback), validity/payment settings-ből | ⬜ |
| **TC-04** | Merge (PdfMergePanel) | combined | Quote jön létre, ID formátum? (jelenleg Q-xxx), outputMode=combined | ⬜ |
| **TC-05** | Merge (PdfMergePanel) | labor_only | outputMode=labor_only, exclusions szöveg helyes | ⬜ |
| **TC-06** | Merge (PdfMergePanel) | split_material_labor | outputMode=split, mezők helyesek | ⬜ |
| **TC-07** | buildQuoteFromPlan (App.jsx) | combined | QT-YYYY-NNN ID, mezők helyesek | ⬜ |
| **TC-08** | buildQuoteFromPlan (App.jsx) | labor_only | exclusions szöveg, outputMode helyes | ⬜ |
| **TC-09** | buildQuoteFromPlan (App.jsx) | split_material_labor | mezők helyesek | ⬜ |

### 3.2 QuoteView megjelenítés + szerkesztés

| Teszt ID | Teszt | Elvárt | Státusz |
|----------|-------|--------|---------|
| **TC-10** | Új quote megnyitása | Mezők kitöltve a seed értékekkel, nincs crash | ⬜ |
| **TC-11** | Régi quote (incl/excl/validity nélkül) megnyitása | Üres mezők, nincs crash (R1 javítás után) | ⬜ |
| **TC-12** | OutputMode váltás QuoteView-ban | Összegek újraszámolódnak, isDirty jelzés | ⬜ |
| **TC-13** | Inclusions/Exclusions szerkesztés | Szerkeszthető, isDirty jelzés, mentés működik | ⬜ |
| **TC-14** | Validity/Payment szerkesztés | Szerkeszthető, isDirty jelzés, mentés működik | ⬜ |
| **TC-15** | Mentés (handleMetaSave) | localStorage frissül, QuoteView megjelenés konzisztens | ⬜ |
| **TC-16** | Mentés nélküli PDF generálás | PDF az aktuális (nem mentett) értékeket használja | ⬜ |
| **TC-17** | Markup % szerkesztés | Nettó/bruttó összegek újraszámolódnak | ⬜ |
| **TC-18** | Óradíj szerkesztés | Labor + total összeg frissül | ⬜ |

### 3.3 PDF Export

| Teszt ID | Teszt | Elvárt | Státusz |
|----------|-------|--------|---------|
| **TC-20** | PDF compact — combined | Összesítő sor, nincs tételrészlet | ⬜ |
| **TC-21** | PDF summary — labor_only | Csak munkadíj sorok, modeNote banner | ⬜ |
| **TC-22** | PDF detailed — split_material_labor | Anyag és munkadíj külön táblázatban | ⬜ |
| **TC-23** | PDF inclusions/exclusions megjelenés | Zöld/sárga dobozok, sortörés működik | ⬜ |
| **TC-24** | PDF validity/payment sortörés | Többsoros szöveg helyesen törik (R2 javítás után) | ⬜ |
| **TC-25** | PDF footer_text megjelenés | Settings-ből jön, terms-box-ban | ⬜ |
| **TC-26** | PDF aláírási blokk | 2 aláírási mező, cégadatok | ⬜ |
| **TC-27** | PDF üres incl/excl + üres validity | Szekciók nem jelennek meg (conditional render) | ⬜ |

### 3.4 BOM Export

| Teszt ID | Teszt | Elvárt | Státusz |
|----------|-------|--------|---------|
| **TC-30** | BOM CSV — combined mód | Teljes anyaglista, outputMode-tól független | ⬜ |
| **TC-31** | BOM CSV — labor_only mód | Teljes anyaglista (BOM mindig teljes!) | ⬜ |
| **TC-32** | BOM CSV — üres quote (nincs material) | Üres CSV fejléccel, vagy hibaüzenet | ⬜ |
| **TC-33** | BOM aggregáció — duplicate material codes | Azonos code+unit sorok összevonva | ⬜ |

### 3.5 Settings → Quote seed

| Teszt ID | Teszt | Elvárt | Státusz |
|----------|-------|--------|---------|
| **TC-40** | Settings: default_validity_text módosítás | Mentés után új quote-ban megjelenik | ⬜ |
| **TC-41** | Settings: default_payment_terms_text módosítás | Mentés után új quote-ban megjelenik | ⬜ |
| **TC-42** | Settings: default_inclusions módosítás | combined mód quote-ban megjelenik (ha outputMode-specifikus üres) | ⬜ |
| **TC-43** | Settings: default_exclusions módosítás | labor_only mód quote-ban az outputMode-specifikus szöveg élvez elsőbbséget | ⬜ |
| **TC-44** | Settings: üres default szövegek | Új quote-ban üres mezők (nincs crash) | ⬜ |
| **TC-45** | Settings módosítás NEM hat meglévő quote-okra | Régi quote-ok változatlanok | ⬜ |

### 3.6 Edge case-ek

| Teszt ID | Teszt | Elvárt | Státusz |
|----------|-------|--------|---------|
| **TC-50** | Merge: planok eltérő projektekből (mixed default outputMode) | Egy outputMode kiválasztva, nem crash | ⬜ |
| **TC-51** | Merge: projekthez nem tartozó planok | outputMode='combined' fallback | ⬜ |
| **TC-52** | Quote: 0 óradíj | Labor=0, total=material, nincs NaN | ⬜ |
| **TC-53** | Quote: 0% markup | Markup=0, total=subtotal | ⬜ |
| **TC-54** | Quote: üres items tömb | Üres táblázat, 0 összegek, BOM üres | ⬜ |
| **TC-55** | localStorage törlés → loadSettings | DEFAULT_SETTINGS-ből jön minden | ⬜ |
| **TC-56** | Régi settings (quote sub-object nélkül) | Deep-merge pótol mindent | ⬜ |

---

## 4. Regressziós Ellenőrzőlista

Az alábbi listát minden új kiadás előtt végig kell futtatni:

- [ ] **Quote megnyitás:** Bármely meglévő quote megnyílik crash nélkül
- [ ] **Régi quote kompatibilitás:** Task 19/20/21 előtti quote-ok működnek (üres incl/excl/validity)
- [ ] **Quote létrehozás mind 3 útvonalon:** Per-plan, Merge, buildQuoteFromPlan
- [ ] **OutputMode konzisztencia:** Az outputMode kiválasztás hatása végig konzisztens (QuoteView → PDF → BOM)
- [ ] **Inclusions/Exclusions:** Seed helyes, szerkesztés működik, mentés persist, PDF megjelenít
- [ ] **Validity/Payment:** Seed helyes, szerkesztés működik, PDF sortörés helyes
- [ ] **PDF generálás:** Mindhárom szint (compact/summary/detailed) × mindhárom outputMode
- [ ] **BOM export:** CSV helyes, aggregáció működik, outputMode-független
- [ ] **Settings módosítás → új quote:** Default szövegek helyesek
- [ ] **Settings módosítás → meglévő quote:** Változatlan marad
- [ ] **isDirty jelzés:** Módosítás után megjelenik, mentés után eltűnik
- [ ] **Build:** `npm run build` — 0 hiba, 0 figyelmeztetés

---

## 5. Javasolt Javítási Prioritási Sorrend

| Prio | Risk | Javítás | Becsült méret |
|------|------|---------|---------------|
| **P0** | R1 | `DEFAULT_VALIDITY_TEXT`/`DEFAULT_PAYMENT_TERMS_TEXT` referencia javítás (6 sor) | XS (5 perc) |
| **P1** | R2 | PDF terms `\n` escape javítás (`/\\n/g` → `/\n/g`) | XS (2 perc) |
| **P2** | R3 | PdfMergePanel ID generálás → `generateQuoteId()` | XS (5 perc) |
| **P3** | R5 | `OUTPUT_MODE_INCLEXCL` kiemelés közös utils-ba | S (20 perc) |
| **P4** | R4 | PdfMergePanel hourlyRate/markup defaults egységesítés | S (15 perc) |
| **P5** | R6 | Merge mixed-project: warning UI vagy explicit outputMode választó | M (45 perc) |
| **P6** | R8/R10 | `gross` mező átnevezés `netTotal`-ra (breaking change — migrációval) | M (60 perc) |
| **P7** | R7 | Régi quote migration: Settings-ből pótolni a hiányzó mezőket betöltéskor | S (20 perc) |
| **P8** | R9 | Footer pozíció konfigurálhatóság | L (opcionális) |

---

## 6. Top 3 Legfontosabb Javítandó Pont

### 🥇 1. `DEFAULT_VALIDITY_TEXT` / `DEFAULT_PAYMENT_TERMS_TEXT` crash fix (R1)
**Miért:** Egyetlen quote sem nyitható meg. Bármely felhasználó azonnal szembesül a hibával. Runtime ReferenceError — a legdurvább kategória.

### 🥈 2. PDF `\n` escape fix (R2)
**Miért:** A validity/payment szöveg a PDF-ben nem törik sorba. Az ajánlat PDF az ügyfélnek készül — ez az elsődleges output. Törött PDF = hiteltelenség.

### 🥉 3. PdfMergePanel `generateQuoteId()` + hourlyRate defaults (R3 + R4)
**Miért:** A merge quote nem standard ID-t kap, ami a quote-lista rendezésnél és keresésnél okozhat zavart. A 8000 vs 9000 hardcoded default eltérés pedig rosszul számolt árat eredményezhet.

---

## 7. Az Egyetlen Legjobb Következő Implementációs Kör

### "Micro-fix sprint" — P0–P4 együtt (becsült: ~50 perc)

**Tartalom:**
1. ✅ R1 fix — QuoteView 6 referencia javítás (`?? ''` vagy settings fallback)
2. ✅ R2 fix — `generatePdf.js` L421, L423: `/\\n/g` → `/\n/g`
3. ✅ R3 fix — `PdfMergePanel.jsx`: `generateQuoteId()` import + használat
4. ✅ R5 fix — `OUTPUT_MODE_INCLEXCL` kiemelés `src/data/quoteDefaults.js`-be, import mindhárom fájlban
5. ✅ R4 fix — PdfMergePanel defaults: settings-ből (`loadSettings()`) konzisztensen

**Miért ez a kör:**
- Minden XS/S méretű javítás, egyenként 2–20 perc
- Együtt ~50 perc, egyetlen commit
- Eliminálja a BLOCKER crash-t + a 4 legfontosabb inkonzisztenciát
- Utána a rendszer stabil pilot-ra alkalmas állapotba kerül
- A maradék (R6–R9) opcionális finomhangolás, ami nem blokkolja a pilot-ot

**Nem tartalmazza (és nem is kell most):**
- R6 mixed-project warning (ritka edge case, alacsony prioritás)
- R8 `gross` átnevezés (breaking change, gondos migráció kell)
- R9 footer pozíció (kozmetikai)
