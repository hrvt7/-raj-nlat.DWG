# QuoteView Inline Meta-Edit — Implementation Brief

**Dátum:** 2026-03-07
**Scope:** QuoteView Adatok kártya + árazási paraméterek inline szerkesztése
**Cél:** A pilot user az ajánlat létrehozása után közvetlenül szerkeszthesse a meta-adatokat és árazási paramétereket, anélkül hogy új ajánlatot kellene generálnia.

---

## 1. Current-State Audit

### 1.1 QuoteView props és adatfolyam

```
App.jsx:
  viewingQuote state → QuoteView prop: quote (READ-ONLY objektum)
  settings state     → QuoteView prop: settings
  handleStatusChange → QuoteView prop: onStatusChange (ez az egyetlen mutáció)
```

A `QuoteView` (App.jsx L97-338) jelenleg **ZERO lokális state-et** tart a quote adatokra — minden a `quote` propból jön. Nincs `onChange` vagy `onQuoteChange` callback.

### 1.2 Adatok kártya — jelenlegi renderelés (L256-268)

```jsx
{[
  ['Megrendelő',  quote.clientName || '—'],
  ['Dátum',       new Date(quote.createdAt).toLocaleDateString('hu-HU')],
  ['Ajánlat ID',  quote.id],
  ['ÁFA kulcs',   `${vatPct}%`],
].map(([k, v]) => (
  <div key={k}> <span>{k}</span> <span>{v}</span> </div>
))}
```

**Hiányzik:** `projectName` (ajánlat neve) — ez csak a page header-ben jelenik meg (L136): `quote.projectName`
**Hiányzik:** `hourlyRate` — csak az Óra KPI kártyában hint-elve (L171): `{fmt(rate)} Ft/ó`
**Hiányzik:** `markup_pct` — sehol nem jelenik meg a QuoteView-ban

### 1.3 Árazási modell (a recalc szempontjából kritikus)

A `quote` objektumban tárolt összegek:
- `quote.gross` = `totalMaterials + totalLabor + markupAmount` (nettó végösszeg)
- `quote.totalMaterials` = anyagköltség összesen (markup NÉLKÜL)
- `quote.totalLabor` = `totalHours × hourlyRate`
- `quote.totalHours` = összes munkaóra (fix, nem függ az óradíjtól)
- `quote.pricingData.hourlyRate` = óradíj (Ft/ó)
- `quote.pricingData.markup_pct` = árrés % (0-1 skála, pl. 0.15 = 15%)

**Recalc képlet hourlyRate / markup változáskor:**
```
newTotalLabor = quote.totalHours × newHourlyRate
newSubtotal   = quote.totalMaterials + newTotalLabor
newMarkup     = newSubtotal × newMarkupPct
newGross      = newSubtotal + newMarkup
```

`totalHours` és `totalMaterials` **NEM változnak** — ezek fix snapshotok.
`items[].hours` szintén fix — a renderelésnél a `rate` változóval szorzódik (L220).

### 1.4 Quote tárolás

- **localStorage:** `saveQuote(quote)` → `store.js L412-422` — upsert by `quote.id`
- **Remote sync:** `saveQuoteRemote(quote)` → Supabase (ha van session) — L646
- **App state:** `quotes` state array + `viewingQuote` state
- **Mutáció minta:** `handleStatusChange` (L688-696) — precedens: `setQuotes(prev => ...)` + `saveQuotes(updated)` + `setViewingQuote(prev => ({ ...prev, ... }))`

### 1.5 PDF export

`generatePdf(quote, settings, pdfLevel)` (L106) — a `quote` objektumot közvetlenül olvassa. Ha a `viewingQuote` state frissül, a következő PDF export a friss adatokkal generál. **Nincs cache-elés.**

---

## 2. Javasolt Minimum Solution

### 2.1 QuoteView belső szerkesztési state

Új lokális state a `QuoteView`-ban:

```
const [editName, setEditName]         = useState(quote.projectName || '')
const [editClient, setEditClient]     = useState(quote.clientName || '')
const [editRate, setEditRate]         = useState(quote.pricingData?.hourlyRate || 9000)
const [editMarkup, setEditMarkup]     = useState((quote.pricingData?.markup_pct || 0) * 100)  // %-ban
```

Indoklás: a szerkesztés lokálisan történik, az `onSaveQuote` callback csak a véglegesítésnél hívódik.

### 2.2 Derived (számított) értékek

```
const newTotalLabor   = quote.totalHours * editRate
const newSubtotal     = (quote.totalMaterials || 0) + newTotalLabor
const newMarkupAmount = newSubtotal * (editMarkup / 100)
const newGross        = Math.round(newSubtotal + newMarkupAmount)
```

Ezek lecserélik a jelenlegi `net` / `rate` / stb. értékeket a renderben.

### 2.3 Adatok kártya átalakítás

Az iterált `[k, v]` tömb lecserélése explicit mezőkre:

| Mező | Jelenlegi | Új |
|------|-----------|-----|
| Ajánlat neve | header-ben, read-only | inline input, editName |
| Megrendelő | read-only, `'—'` ha üres | inline input, editClient |
| Óradíj | KPI hint, nincs explicit | number input (Ft/ó), editRate |
| Árrés | rejtett | number input (%), editMarkup |
| Dátum | read-only | read-only (marad) |
| Ajánlat ID | read-only | read-only (marad) |
| ÁFA kulcs | read-only | read-only (marad) |

### 2.4 "Mentés" gomb az Adatok kártyán

Egy egyszerű gomb az Adatok kártya alján:
- Csak akkor aktív, ha bármelyik szerkeszthető érték különbözik az eredeti `quote`-tól
- `onClick` → `onSaveQuote(updatedQuote)` callback

### 2.5 onSaveQuote callback (App.jsx)

Új prop a `QuoteView`-n: `onSaveQuote`

```
// App.jsx — az onStatusChange mintájára:
const handleSaveQuote = (updatedQuote) => {
  saveQuote(updatedQuote)
  setQuotes(loadQuotes())
  setViewingQuote(updatedQuote)
  if (session) saveQuoteRemote(updatedQuote).catch(...)
}
```

### 2.6 KPI kártyák + tételsor a derived értékeket használja

A hero KPI strip és az items renderelés a `newGross`, `newTotalLabor`, `editRate` stb. derived értékeket használja. Ez azt jelenti, hogy a KPI-k **élőben frissülnek** az input szerkesztése közben, mentés nélkül is (preview effect).

### 2.7 Header projectName

A header `{quote.projectName}` lecserélése `{editName}` értékre — az inline input az Adatok kártyán van, a header tükrözi.

---

## 3. Érintett fájlok

| Fájl | Módosítás | Sor-tartomány |
|------|-----------|---------------|
| `src/App.jsx` | QuoteView: lokális edit state, Adatok kártya átírás, derived árazás, header update | L97-338 (QuoteView fn) |
| `src/App.jsx` | `handleSaveQuote` callback + prop átadás | ~L688 után (új fn) + L867 (QuoteView hívás) |

**Összesen: 1 fájl (App.jsx), ~60-80 sor módosítás/bővítés.**

---

## 4. Regressziós kockázatok

| Kockázat | Valószínűség | Kezelés |
|----------|-------------|---------|
| KPI kártyák rossz értéket mutatnak a derived átállás után | Közepes | A derived értékek `useMemo`-val, explicit képlettel — smoke test |
| PDF export a régi quote-ot használja mentés előtt | Alacsony | `handlePdf` a `viewingQuote`-ot kapja propként → mentés után a friss quote-ot kapja |
| items tábla `rate` variable a régi értéket használja | Közepes | `rate` lecserélése `editRate`-re — a labor items renderelés frissül |
| `onStatusChange` felülírja az edit-változásokat | Alacsony | `onStatusChange` csak `status` mezőt módosít, nem érinti a meta/pricing mezőket |
| Remote sync fail | Alacsony | Meglévő catch pattern — localStorage mindig konzisztens marad |

---

## 5. Smoke Check Lista

1. ✅ Quote létrehozás per-plan shortcuttal → QuoteView megnyílik, clientName = '—', editálható
2. ✅ clientName kitöltése → "Mentés" → Ajánlatok listában a quote frissült névvel jelenik meg
3. ✅ projectName szerkesztése → header élőben frissül → mentés után a listában is friss
4. ✅ hourlyRate módosítása → KPI kártyák élőben frissülnek (munkadíj, bruttó) → labor items tábla is frissül
5. ✅ markup módosítása → gross = (materials + labor) × (1 + markup%) → KPI frissül
6. ✅ PDF export a mentett (friss) adatokkal generál
7. ✅ Státusz váltás nem töri el a szerkesztett mezőket
8. ✅ Böngésző reload → a módosított quote perzisztensen megmarad
9. ✅ PdfMergePanel-ből létrehozott quote is szerkeszthető (nem csak per-plan)
10. ✅ "Új ajánlat" (standalone workspace) quote is szerkeszthető

---

## 6. Implementációs sorrend

```
1. handleSaveQuote callback + prop (App.jsx ~L688 után + L867)
2. QuoteView lokális edit state (4 useState)
3. Derived árazás (4 const — newTotalLabor, newSubtotal, newMarkupAmount, newGross)
4. Adatok kártya: iterált [k,v] → explicit inline input mezők
5. Header projectName → editName
6. KPI kártyák: net/gross/rate → derived értékek
7. Labor items renderRow: rate → editRate
8. "Mentés" gomb az Adatok kártyán (dirty check + onSaveQuote hívás)
```

---

## 7. Implementation Brief — Végrehajtás

### Scope: 1 fájl — `src/App.jsx`

**A. handleSaveQuote (új fn, ~L688 után)**
```
Minta: handleStatusChange analógiája
Input: updatedQuote objektum
Logika: saveQuote(updated) → setQuotes(loadQuotes()) → setViewingQuote(updated) → remote sync
```

**B. QuoteView prop bővítés**
```
Jelenlegi:  QuoteView({ quote, settings, onBack, onStatusChange })
Új:         QuoteView({ quote, settings, onBack, onStatusChange, onSaveQuote })
Hívás:      <QuoteView ... onSaveQuote={handleSaveQuote} />
```

**C. QuoteView lokális state (L101 után)**
```
4 új useState: editName, editClient, editRate, editMarkup
Inicializálás: quote prop értékeiből
```

**D. Derived árazás (L110-113 lecserélés)**
```
Jelenlegi: net = quote.gross, rate = quote.pricingData.hourlyRate (read-only)
Új: newTotalLabor, newSubtotal, newMarkupAmount, newGross (derived editRate/editMarkup-ból)
vatPct marad settings-ből, vat és grossWithVat ebből számolódik
```

**E. Adatok kártya átírás (L256-268)**
```
Jelenlegi: iterált [k,v] tömb, 4 sor, mind read-only <span>
Új: explicit mezők:
  - Ajánlat neve: <input value={editName} onChange={...} />
  - Megrendelő: <input value={editClient} onChange={...} />
  - Óradíj: <input type="number" value={editRate} onChange={...} /> Ft/ó
  - Árrés: <input type="number" value={editMarkup} onChange={...} /> %
  - Dátum: read-only <span> (marad)
  - Ajánlat ID: read-only <span> (marad)
  - ÁFA kulcs: read-only <span> (marad)
  - "Mentés" gomb: dirty → onSaveQuote({ ...quote, projectName: editName, ... })
```

**F. Header + KPI + items tábla update**
```
Header L136: quote.projectName → editName
KPI L150: fmt(gross) → fmt(grossWithVat), fmt(net) → fmt(newGross)
KPI L158: quote.totalMaterials → marad (fix)
KPI L164: quote.totalLabor → fmt(newTotalLabor)
KPI L171: rate → editRate
Labor items L220: rate → editRate
```

### Ne nyúlj

- `items[]` tömb — line-item editing NINCS scope-ban
- `assemblySummary[]` — munkacsoport szerkesztés NINCS scope-ban
- `quote.totalHours` — fix snapshot, nem szerkeszthető
- `quote.totalMaterials` — fix snapshot, nem szerkeszthető
- `handleStatusChange` — meglévő logika érintetlen marad
- `generatePdf` — nem módosul, a friss quote-ot propként kapja
- Sidebar / routing / PdfMergePanel / TakeoffWorkspace — érintetlen
- Remote sync logika — meglévő pattern, csak hívás

---

*Készítette: QuoteView Inline Meta-Edit Brief · 2026-03-07*
