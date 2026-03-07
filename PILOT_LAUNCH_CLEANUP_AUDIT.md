# Pilot-Launch Cleanup Audit

> Scope: a pilot indítás előtt olcsón lezárható maradék technikai/UX adósságok.
> Nem cél: új feature, nagy architektúra-kör, routing redesign.
> Állapot: audit — implementáció nincs ebben a dokumentumban.

---

## Összefoglaló

5 cleanup pont, prioritási sorrendben. Mindegyik kicsi (1-15 LOC), alacsony kockázatú, és konkrét user confusion-t vagy dead code-ot szüntet meg.

---

## #1 — Dead state: `prefillData` / `setPrefillData` (App.jsx)

**Mi a probléma**

A `prefillData` state (App.jsx L627) és a hozzá tartozó `setPrefillData` három helyen referált — de soha, sehol nem kap értéket `null`-on kívül:

| Hely | Hívás | Eredmény |
|------|-------|----------|
| L627 | `useState(null)` | Mindig null |
| L951 | `initialData={prefillData}` | Mindig null → standalone TakeoffWorkspace üres indul |
| L952 | `setPrefillData(null)` | No-op |
| L953 | `setPrefillData(null)` | No-op |

Nincs kódút ami `setPrefillData(valami)` hívna bármilyen értékkel.

**Miért érdemes pilot előtt javítani**

Dead state növeli a kódkomplexitást és félrevezeti a fejlesztőt, aki azt hiszi létezik egy prefill flow. Ha a standalone workspace ágat később eltávolítjuk (cleanup #2-vel együtt), ez is kikerül — de addig zavaró.

**Legkisebb scoped javítás**

`prefillData`, `setPrefillData` state eltávolítása (L627), és a 3 referencia helyettesítése `null`-lal az L951-953-ban. ~4 LOC törlés.

---

## #2 — Dead route: standalone `page === 'new-quote'` ág (App.jsx)

**Mi a probléma**

A Sidebar soft redirect (`da99400`) óta `setPage('new-quote')` sehol nem hívódik a codebase-ben:

```
grep -r "setPage('new-quote')" src/ → 0 találat
```

Az App.jsx L941-954 standalone TakeoffWorkspace ág elérhetetlen dead code (10 LOC + a conditional branch).

A breadcrumb label map (L704) `'new-quote': 'Új ajánlat'` szintén dead.

**Miért érdemes pilot előtt javítani**

A dead route nem okoz runtime hibát, de:
- A conditional branch (`page === 'new-quote' || page === 'projektek-workspace'`) feleslegesen komplex
- Ha valaki véletlenül `setPage('new-quote')`-ot hív (pl. jövőbeli feature), a standalone workspace váratlanul megnyílik projekt kontextus nélkül
- A pilot review során a kód auditáló félreérthetné az aktív route-nak

**Legkisebb scoped javítás**

- L941: `(page === 'new-quote' || page === 'projektek-workspace')` → `page === 'projektek-workspace'`
- L947-954: standalone ág eltávolítása (a ternary operátor egyszerűsödik)
- L704: `'new-quote': 'Új ajánlat'` sor törlése
- L658-661: `plans` route redirect useEffect törlése (szintén dead — a `plans` page már nem létezik)
- Összesen: ~15 LOC törlés, 0 LOC hozzáadás

**Dependency**: cleanup #1 (prefillData) ezzel együtt végezhető el.

---

## #3 — Hiányzó user feedback: rossz fájlformátum feltöltéskor (Projektek.jsx)

**Mi a probléma**

A `handlePlanFiles` (L598-618) csendben eldobja a nem-engedélyezett fájlokat:

```js
const accepted = Array.from(files).filter(f => isAllowedPlan(f.name))
if (accepted.length === 0) return  // ← csendes return, nincs feedback
```

Ha a user egy `.jpg`, `.png`, `.xlsx` vagy bármilyen nem-PDF/DXF/DWG fájlt dob be, semmi nem történik — nincs hibaüzenet, nincs toast, nincs vizuális jelzés.

**Miért érdemes pilot előtt javítani**

A pilot userek magyar villanyszerelők, nem power userek. Ha bedob egy rossz fájlt és semmi nem történik, azt gondolhatja hogy a rendszer lefagyott, vagy a fájl "feltöltődött" de nem látja. Ez az #1 support ticket forrás.

**Legkisebb scoped javítás**

A meglévő `showToast` callback-et (App.jsx L727) átadni a Projektek-nek prop-ként, és a `handlePlanFiles`-ban:

```js
const rejected = Array.from(files).filter(f => !isAllowedPlan(f.name))
if (rejected.length > 0 && accepted.length === 0) {
  showToast?.('⚠', 'Csak PDF, DXF és DWG fájlok tölthetők fel.')
  return
}
```

~5 LOC + 1 prop threading.

---

## #4 — Hiányzó empty project validáció: "Detektálás" és "Ajánlat" CTA-k (Projektek.jsx)

**Mi a probléma**

A `SelectionToolbar` (L111) "Detektálás indítása" és "Összesített ajánlat" CTA-k akkor is megjelennek, ha a user 0 tervet jelölt ki, vagy ha az összes kijelölt terv már kész:

- `selectedCount > 0` a feltétel, de nem vizsgálja, hogy a terveknél van-e `parseResult` (detektáláshoz) vagy `calcTotal` (ajánlathoz)
- Az üres projekt scenario (0 plan) nem érinti, mert akkor nincs mit kijelölni — de a parciális scenario (pl. 3 terv, mind kész) fölöslegesen mutatja a "Detektálás" CTA-t

**Miért érdemes pilot előtt javítani**

Nem kritikus — a CTA-k nem törnek el, csak feleslegesek lehetnek. De pilot review szempontjából zavaró ha a "Detektálás" gomb aktív, holott nincs mit detektálni.

**Legkisebb scoped javítás**

A CTA-knál `disabled` state hozzáadása:
- "Detektálás": disabled ha minden kijelölt tervnél van `parseResult`
- "Ajánlat": disabled ha van kijelölt terv `calcTotal` nélkül

~6-8 LOC.

---

## #5 — Sidebar active state: "Új ajánlat" sosem active (vizuális minor)

**Mi a probléma**

A soft redirect (cleanup `da99400`) óta az "Új ajánlat" gomb `key: 'new-project'`, de a `page` sosem lesz `'new-project'` — mindig `'projektek'`-re navigál. Ezért az "Új ajánlat" gomb **sosem kap active state-et** (zöld háttér + border).

Ez vizuálisan helyes viselkedés (a "Projektek" lesz active), de a user számára zavaró lehet: kattintott az "Új ajánlat"-ra, de a "Projektek" világít.

**Miért érdemes pilot előtt javítani**

Alacsony prioritás — a user gyorsan megszokja. De ha zavarónak bizonyul a pilot feedback alapján, a javítás egyszerű.

**Legkisebb scoped javítás**

Két opció:
- **A) Accept**: nem javítjuk, a "Projektek" active state helyes, az "Új ajánlat" egy shortcut
- **B) Merge**: az "Új ajánlat" és "Projektek" menüpontokat összevonjuk egyetlen "Projektek" ponttá a highlight stílussal → `{ key: 'projektek', label: 'Projektek', highlight: true }`

Javaslat: **A) Accept** — a pilot feedback alapján dönthetünk.

---

## Ajánlott következő implementációs lépés

**#1 + #2 együtt**: `prefillData` dead state + standalone `new-quote` route eltávolítása.

Indoklás:
- Összefüggő dead code → egy commit
- ~20 LOC törlés, 0 LOC hozzáadás
- 0 kockázat — nincs élő kódút ami bármelyiket használná
- A pilot review-ra tiszta routing marad
- A #3 (fájl feedback) és #4 (CTA validation) utána jöhetnek külön commitként

---

## Prioritás összefoglaló

| # | Cleanup | Effort | Risk | Pilot impact |
|---|---------|--------|------|-------------|
| 1 | `prefillData` dead state | ~4 LOC | 0 | Kód tisztaság |
| 2 | Standalone `new-quote` dead route | ~15 LOC | 0 | Kód tisztaság + routing egyszerűsödés |
| 3 | Rossz fájlformátum feedback | ~5 LOC + 1 prop | Alacsony | **Magas** — #1 support ticket megelőzés |
| 4 | CTA disabled state | ~6-8 LOC | Alacsony | Közepes — vizuális zavar csökkentés |
| 5 | Sidebar active state | 0 vagy ~3 LOC | 0 | Alacsony — accept, pilot feedback alapján |
