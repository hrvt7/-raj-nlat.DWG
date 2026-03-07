# Pilot-Readiness Audit — TakeoffPro

**Dátum:** 2026-03-07
**Scope:** Fő user journey, végponttól végpontig
**Cél:** Azonosítani a legnagyobb maradék friction pontokat, amelyek megakadályozzák, hogy egy pilot user gyorsan, magabiztosan és segítség nélkül végigmenjen a teljes flow-n.

---

## 1. Jelenlegi fő flow összefoglalás

```
Sidebar: Projektek
  → Projekt lista (grid) — új projekt létrehozás VAGY meglévő megnyitás
    → ProjectDetailView
      ├── Jelmagyarázat hozzáadása / szerkesztése (LegendPanel overlay)
      │     └── Detektálás indítása → DetectionReviewPanel overlay
      │           └── "Megnyitás a workspace-ben" → TakeoffWorkspace ✅
      ├── Tervrajz feltöltés (PDF / DXF / DWG)
      ├── Tervrajz megnyitás → TakeoffWorkspace (per-plan)
      │     └── Kalkuláció mentés → Save-success strip
      │           ├── "Ajánlat generálása" → QuoteView ✅
      │           └── "Vissza a projekthez" → ProjectDetailView
      ├── Terv kijelölés (1+) → SelectionToolbar
      │     ├── Szimbólumdetektálás → DetectionReviewPanel
      │     └── "Ajánlat generálása" / "Közös ajánlat generálása" → PdfMergePanel → QuoteView ✅
      └── Detection history → korábbi futás újranyitás

QuoteView:
  → KPI kártyák + tétellista + PDF export (3 részletezési szint) + státusz kezelés
```

Az eddigi munkák (legend chip, detection CTA, per-plan quote shortcut, multi-plan CTA/copy) után a fő happy-path összefüggő és végigmenő.

---

## 2. Top 5 maradék friction pont (prioritási sorrend)

### #1 — Ajánlat nem szerkeszthető a létrehozás után

**Probléma:**
A `QuoteView` read-only. Nincs mód a megrendelő nevét, az ajánlat nevét, egyedi tételeket vagy az óradíjat utólag módosítani. A per-plan quote shortcut üres `clientName`-mel hozza létre az ajánlatot — a user nem tudja pótolni. Ha az óradíj vagy árrés változik, az ajánlatot el kell dobni és újat generálni.

**Miért fontos pilot szempontból:**
A pilot user 100%-ban szükséges, hogy az ügyfél nevét, az ajánlat címét és az árakat finomhangolhassa. Enélkül az ajánlat nem küldésre kész, a PDF export hiányos.

**Legkisebb scoped javítás:**
Inline-edit a `QuoteView` "Adatok" kártyáján: `clientName`, `projectName` (ajánlat név), + `hourlyRate` / `markup` szerkesztése → `saveQuote()` hívás. Nem kell teljes tételsoros szerkesztés, csak a meta-adatok + globális árazási paraméterek.

---

### #2 — Üres projekt létrehozás: nincs guided onboarding

**Probléma:**
Új projekt létrehozás (ScannerSVG kártya) csak nevet kér, utána üres `ProjectDetailView`-ra dob. A user 3 dashed drop zone-t lát (legend + tervrajz feltöltés + nincs terv), de nincs sorrendi guidance arról, mit csináljon először. Különösen: a jelmagyarázat feltöltés és a tervrajz feltöltés egymás alatt van, de a flow sorrendje nem egyértelmű.

**Miért fontos pilot szempontból:**
Egy pilot user, aki először használja az appot, nem fogja tudni, hogy (1) először tervrajzot töltsön fel, aztán legendet, vagy fordítva. Nem fogja érteni, hogy a legend a detektáláshoz kell, de a terv megnyitásához nem szükséges.

**Legkisebb scoped javítás:**
Stepper indicator a `ProjectDetailView` tetején: `① Tervrajz feltöltés → ② Jelmagyarázat (opcionális) → ③ Kalkuláció`. Passzív, informatív — nem blokkolja a szabad navigációt, de megmutatja a javasolt sorrendet. Implementáció: egy 3-lépéses horizontal stepper component a header alá, ami a projekt állapotból (plans.length, legendPlanId, calcTotal bármely terven) számol aktuális lépést.

---

### #3 — PdfMergePanel "Nincsenek kalkulált elemek" zsákutca

**Probléma:**
Ha a user kijelöl 2+ tervet és rákattint "Közös ajánlat generálása", de a terveken nincs még mentett kalkuláció (`calcTotal` null), akkor a `PdfMergePanel` megnyílik, de üres: "📭 Nincsenek kalkulált elemek" + "Nyisd meg a terveket és készíts kalkulációt, mielőtt ajánlatot generálsz." Nincs CTA, ami visszaviszi a tervekhez, és nincs egyértelmű jelzés, melyik terv(ek)ről hiányzik a kalkuláció.

**Miért fontos pilot szempontból:**
Ez egy természetes "türelmetlen user" útvonal: kijelöl, megnyomja az ajánlat gombot, és falba ütközik. Ha nincs egyértelmű javító CTA, bezárja a panelt és nem tudja, mi a következő lépés.

**Legkisebb scoped javítás:**
Az üres állapot bővítése: (a) per-plan sor ahelyett, hogy melyiknek van/nincs kalkulációja (zöld pipa / szürke kérdőjel), (b) "Terv megnyitása" link a hiányzó kalkulációjú tervre, ami `onClose()` + `onOpenFile(plan)` hív.

---

### #4 — DWG konverzió hiba nem kommunikálja a hibát / retry lehetőséget

**Probléma:**
A `TakeoffWorkspace` DWG → DXF konverziója CloudConvert-en keresztül történik. Ha a konverzió sikertelen (hálózat, quota, formátum), a `dwgStatus` nem `done`-ra áll, hanem a user egy forever-loading állapotban ragad, vagy a workspace PDF fallbackre próbálkozik — ami DWG-re nem működik.

**Miért fontos pilot szempontból:**
Villanyszerelők gyakran DWG-t kapnak a tervezőtől. Ha az első DWG megnyitás sikertelen, és nincs hibaüzenet vagy retry, a user azt gondolja, hogy az app nem támogatja a formátumot.

**Legkisebb scoped javítás:**
Explicit error state a `parsePending` render ágban: ha `dwgStatus === 'error'` → "DWG konverzió sikertelen" + retry gomb + "Exportáld DXF-ként az AutoCAD-ből" secondary CTA. Ehhez a `dwgStatus` állapotkezelésben kell egy `'error'` ágat kezelni.

---

### #5 — Sidebar "Új ajánlat" megnyitja a régi standalone TakeoffWorkspace-t

**Probléma:**
A Sidebar-ban van egy "Új ajánlat" (`new-quote`) menüpont, ami a `page === 'new-quote'` ágon fut és egy standalone `TakeoffWorkspace`-t nyit meg `initialData`/`prefillData`-val, `planId` nélkül. Ez egy teljesen izolált workspace — nem kötődik projekthez, nem tud a legend/detection flow-ról, nincs per-plan save. Ez a régi (pre-projektek) belépési pont, ami zavaró, mert a user számára kétféle workspace van: a projektek-ből nyitott (planId-vel, per-plan save, quote shortcut) és a standalone (quote save, nincs planId).

**Miért fontos pilot szempontból:**
Ha a pilot user a Sidebar-ból nyitja meg az "Új ajánlat"-ot, nem a projektek flow-ba kerül. Ha már hozzászokott a projektekhez, meglepő, hogy nincs legend/detection/projekt kontextus. Ha nem szokott hozzá, kétféle workflow-t tanul meg.

**Legkisebb scoped javítás:**
Két opció:
(A) Az "Új ajánlat" Sidebar-elem navigáljon a Projektek oldalra egy vizuális hinttel ("Ajánlatot a projektekből tudsz létrehozni"). Minimum: `onNavigate('projektek')` + toast.
(B) Rejtsd el az "Új ajánlat" menüpontot, ha a user-nek van legalább 1 projektje. Legacy path marad elérhető, de nem prominens.
Ajánlott: (A), mert nem bújtat el semmit, csak redirect.

---

## 3. Ajánlott következő implementációs lépés

**#1 — QuoteView inline meta-edit** (Ajánlat nem szerkeszthető)

**Indoklás:**
- A többi friction pont workaround-olható (pl. a user tud tervet egyesével megnyitni, a DWG konverzió ritka, a standalone workspace aktívan nem árt).
- De ha az ajánlat a létrehozás után nem szerkeszthető, az ajánlat PDF **soha nem küldésre kész**, mert a `clientName` üres marad (per-plan shortcut), és az árak nem finomhangolhatók.
- Ez a legkisebb effort / legnagyobb pilot-impact javítás: ~60 sor a QuoteView-ban, 0 új fájl, 0 route, 0 callback-lánc.

**Scope:**
1. `QuoteView` Adatok kártyán: `clientName`, `projectName` → inline-editable inputok
2. `pricingData.hourlyRate`, `pricingData.markup_pct` → inline-editable number inputok
3. Módosítás → `saveQuote(updated)` + `setQuotes(loadQuotes())` + `setViewingQuote(updated)`
4. Árak automatikus újraszámolása az új hourlyRate/markup alapján
5. PDF export az aktuális (szerkesztett) adatokkal

---

*Készítette: TakeoffPro Pilot Audit · 2026-03-07*
