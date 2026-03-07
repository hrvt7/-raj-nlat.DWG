# Sidebar "Új ajánlat" — Legacy Entry Point Kezelési Brief

> Scope: a Sidebar "Új ajánlat" menüpont legacy belépési pontjának scoped kezelése — pilot readiness audit #5.
> Cél: a user ne kerüljön a standalone TakeoffWorkspace-be, hanem a Projektek-alapú flow-ba kerüljön irányítva.
> Nem cél: teljes routing redesign, új workspace modell, sidebar átszervezés, standalone TakeoffWorkspace törlés.

---

## 1. Current-State Audit

### Mi történik most

1. User a Sidebar-ban kattint az **"+ Új ajánlat"** menüpontra
2. `Sidebar.jsx` L9: `{ key: 'new-quote', label: 'Új ajánlat', highlight: true }`
3. `Sidebar.jsx` L77-79: `handleNav('new-quote')` → `onNavigate('new-quote')`
4. `App.jsx` L685-695: `handleNavigate('new-quote')` → `setPage('new-quote')`
5. `App.jsx` L947-954: `page === 'new-quote'` → **standalone TakeoffWorkspace**:
   ```
   <TakeoffWorkspace
     settings={settings}
     materials={materials}
     initialData={prefillData}
     onSaved={quote => { setPrefillData(null); handleQuoteSaved(quote) }}
     onCancel={() => { setPrefillData(null); setPage('quotes') }}
   />
   ```
6. Ez a standalone workspace **nem kap**: `initialFile`, `planId`, `onDirtyChange`, `focusTarget`
7. `onCancel` → `setPage('quotes')` — visszaviszi az Ajánlatok oldalra
8. `onSaved` → `handleQuoteSaved(quote)` → az Ajánlatok listába kerül

### Mi a standalone vs. projektek-workspace különbség

| Jellemző | `page === 'new-quote'` (standalone) | `page === 'projektek-workspace'` |
|----------|------|------|
| `initialFile` | ❌ nincs — üres workspace indul | ✅ a kiválasztott PDF/DXF/DWG |
| `planId` | ❌ nincs — nincs plan binding | ✅ a terv ID-ja |
| `onDirtyChange` | ❌ nincs dirty tracking | ✅ van |
| `focusTarget` | ❌ nincs | ✅ van (detection-ből jövet) |
| `onSaved` | Ajánlat mentés + navigáció az Ajánlatok-ra | Plan save → vissza a Projektek-re |
| `onCancel` | Ajánlatok oldalra | N/A |
| Kontextus | Standalone, projekt nélkül | Projekten belül, plan-hez kötve |

### Miért zavaró ez

| # | Probléma | Hatás |
|---|----------|-------|
| 1 | A standalone workspace **nincs projekthez kötve** — a mentett ajánlat nem jelenik meg a projekt kontextusában | A user elveszíti a kapcsolatot a projekt és az ajánlat között |
| 2 | A user a Sidebar-ból indulva **nem tölt fel fájlt** — üres workspace-be kerül, amivel nem tud sokat csinálni | Zsákutca: a workspace fájl nélkül nem hasznos |
| 3 | A `highlight: true` + "+" prefix az "Új ajánlat"-ra vonzza a figyelmet mint **elsődleges CTA** — holott a helyes fő út a Projektek | Téves mentális modell: a user azt hiszi ez a fő belépési pont |
| 4 | Az `onCancel` → Ajánlatok oldalra visz, nem a Projektek-re | Navigációs inkonzisztencia a projektek-központú flow-val |
| 5 | A `prefillData` (L627, L951) mindig `null` — a standalone workspace sosem kap prefill adatot a jelenlegi flow-ban | Felesleges kódút, ami soha nem fut |

### Sidebar vizuális séma (most)

```
  📊 Dashboard
  📄 Ajánlatok
  ✨ + Új ajánlat        ← highlight: true, accent szín, LEGACY
  📋 Projektek            ← a helyes fő út
  ─────────────
  ⚡ Erősáram
  💧 Víz-Gáz-Fűtés 🔒
  ...
  ⚙ Beállítások
```

### Kód referenciák

| Hely | Tartalom |
|------|----------|
| `Sidebar.jsx` L9 | `{ key: 'new-quote', label: 'Új ajánlat', highlight: true }` |
| `Sidebar.jsx` L21 | `'new-quote': 'M12 5v14M5 12h14'` — plusz ikon SVG path |
| `Sidebar.jsx` L111 | `{item.highlight && !isActive ? \`+ ${item.label}\` : item.label}` |
| `App.jsx` L685-695 | `handleNavigate('new-quote')` → `setPage('new-quote')` |
| `App.jsx` L627 | `const [prefillData, setPrefillData] = useState(null)` |
| `App.jsx` L947-954 | Standalone TakeoffWorkspace: `initialData={prefillData}`, `onCancel → quotes` |
| `App.jsx` L956-970 | Projektek-workspace TakeoffWorkspace: `initialFile`, `planId`, `onDirtyChange` |

---

## 2. Javasolt Minimum Solution

### Megoldás: **Soft redirect — "Új ajánlat" → Projektek oldal navigáció**

Az "Új ajánlat" gomb nem a standalone workspace-be visz, hanem a Projektek oldalra irányít, opcionálisan egy rövid guidance hint-tel.

### Miért redirect és nem hide/disable?

| Opció | Előny | Hátrány | Döntés |
|-------|-------|---------|--------|
| **Hide** (eltávolítás) | Tiszta, nincs legacy kódút | A user elveszíti az "új ajánlat" mentális modellt, a gomb eltűnése zavart okoz visszatérő usernél | ❌ Nem javasolt (UX zavar) |
| **Disable** (szürke, kattinthatatlan) | A user látja hogy létezik | Frusztráló — miért van ott ha nem működik? Tooltip szükséges. | ❌ Nem javasolt (friction) |
| **Soft redirect** | Természetes flow: a gomb továbbra is "Új ajánlat" (a user intent helyes), de a Projektek oldalra visz ahol a helyes flow indul | A standalone workspace nem ér el többet — de ez a cél | ✅ **Javasolt** |

### Implementáció

**Lépés 1 — Sidebar.jsx: `new-quote` → `projektek` redirect**

A `MAIN_NAV` tömbben az `'new-quote'` kulcsot átírjuk `'projektek'`-re, de megtartjuk a highlight stílust és a "+" prefixet:

```
const MAIN_NAV = [
  { key: 'dashboard',  label: 'Dashboard' },
  { key: 'quotes',     label: 'Ajánlatok' },
  { key: 'projektek',  label: 'Új ajánlat', highlight: true },   // ← redirect
  { key: 'projektek',  label: 'Projektek' },
]
```

**Probléma**: két item ugyanazzal a `key`-jel → React key conflict + `active` state mindkettőnél aktív.

**Javított megoldás**:

```
const MAIN_NAV = [
  { key: 'dashboard',   label: 'Dashboard' },
  { key: 'quotes',      label: 'Ajánlatok' },
  { key: 'new-project', label: 'Új ajánlat', highlight: true, navTarget: 'projektek' },
  { key: 'projektek',   label: 'Projektek' },
]
```

- `key`: egyedi marad (React key + active state)
- `navTarget`: opcionális override — ha van, `handleNav(item.navTarget)` hívódik `handleNav(item.key)` helyett
- `active` state: `new-project` **sosem active** — a `page` soha nem lesz `'new-project'`, mindig `'projektek'`-re navigál
- `highlight: true`: megtartjuk — a gomb vizuálisan továbbra is kiemelkedik

**Lépés 2 — Sidebar.jsx: `handleNav` navTarget support**

A `handleNav` hívás:

```js
const handleNav = (key, tradeId) => {
  onNavigate(key, tradeId)
  ...
}
```

A `renderNavBtn` onClick:

```js
onClick={() => !locked && handleNav(item.navTarget || item.key, item.tradeId)
```

Ez 1 sor módosítás a renderNavBtn-ben.

**Lépés 3 — NAV_PATHS: `new-project` ikon**

```js
'new-project': 'M12 5v14M5 12h14',   // ugyanaz mint az eddigi new-quote plusz ikon
```

Ez megtartja a vizuális konzisztenciát.

**Lépés 4 (opcionális, de javasolt) — App.jsx cleanup**

A `page === 'new-quote'` ág most dead code lesz (soha nem érhető el a Sidebar-ból). Két lehetőség:

| Opció | Leírás |
|-------|--------|
| A) Megtartjuk | Backward compatible — ha más helyen is setPage('new-quote') hívódik (Dashboard? Quotes?) |
| B) Eltávolítjuk | Tisztább — de ellenőrizni kell minden setPage hívást |

**Javaslat**: A) Megtartjuk ebben a scope-ban, a dead code eltávolítás egy következő cleanup kör legyen.

### Vizuális terv — Sidebar (javított)

```
  📊 Dashboard
  📄 Ajánlatok
  ✨ + Új ajánlat        ← highlight: true, accent szín, DE projektek-re navigál
  📋 Projektek            ← a fő lista
  ─────────────
  ⚡ Erősáram
  ...
```

A user szempontjából semmi nem változik vizuálisan — ugyanaz a gomb, ugyanaz a szín, de kattintásra a Projektek oldalra kerül.

---

## 3. Érintett fájlok

| Fájl | Módosítás | ~LOC |
|------|-----------|------|
| `src/components/Sidebar.jsx` | `MAIN_NAV` átírás: `new-quote` → `new-project` + `navTarget: 'projektek'`; `NAV_PATHS` bővítés; `renderNavBtn` onClick: `navTarget` support | ~8-10 |

**Összesen: 1 fájl, ~8-10 sor.**

App.jsx-et ebben a scope-ban NEM módosítjuk (a standalone ág dead code marad, de nem töröljük).

---

## 4. Regressziós kockázatok

| Kockázat | Valószínűség | Mitigation |
|----------|-------------|------------|
| React key conflict (két `'projektek'` key) | Nincs — a `new-project` egyedi key |
| Active state mindkettőnél zöld | Nincs — `page` sosem `'new-project'`, mindig `'projektek'` |
| Dashboard / Quotes "Új ajánlat" link → `setPage('new-quote')` | Közepes — ellenőrizni kell van-e más belépési pont | Scope: **csak** a Sidebar-t módosítjuk, App.jsx standalone ág marad fallback-nek |
| `highlight` stílus (`item.highlight`) eltűnik | Nincs — `highlight: true` megmarad a `new-project` itemen |
| `navTarget` más itemeknél undefined → `undefined || item.key` → eredeti viselkedés | Nincs — az `||` fallback garantálja a backward compatibility-t |
| Standalone TakeoffWorkspace dead code | Alacsony kockázat — nem zavarja a működést, de helyet foglal | Cleanup kör javasolt (nem ebben a scope-ban) |
| Mobile sidebar: az "Új ajánlat" kattintás után a sidebar bezárul + navigál | Helyes — a `handleNav` → `onMobileClose()` továbbra is fut |

### Ellenőrizendő: más belépési pontok

Meg kell nézni, van-e más hely ami `setPage('new-quote')`-ot hív:

| Hely | Hívás | Hatás |
|------|-------|-------|
| `App.jsx` L704 | `'new-quote': 'Új ajánlat'` — top bar breadcrumb label | Nem navigáció, csak label — nem érintett |
| Dashboard `onNavigate` | Potenciális `setPage('new-quote')` — ellenőrizni kell | Ha igen, az a standalone ág fallback-ként továbbra is működik |
| Quotes `onNavigate` | Potenciális `setPage('new-quote')` — ellenőrizni kell | Ugyanaz |

A standalone ág megtartása ezért fontos: más belépési pontok még használhatják.

---

## 5. Smoke Check Lista

| # | Teszt | Elvárt |
|---|-------|--------|
| 1 | Sidebar "Új ajánlat" kattintás | Projektek oldalra navigál (nem standalone workspace-be) |
| 2 | Sidebar "Projektek" kattintás | Projektek oldalra navigál (változatlan) |
| 3 | Sidebar "Új ajánlat" active state | Sosem zöld/active — a `page` mindig `'projektek'` lesz |
| 4 | Sidebar "Projektek" active state | Zöld/active ha `page === 'projektek'` (változatlan) |
| 5 | Sidebar "Új ajánlat" vizuális stílus | Highlight megmarad: accent szín, "+" prefix, plusz ikon |
| 6 | Mobile sidebar "Új ajánlat" | Navigál + sidebar bezárul |
| 7 | Dashboard/Quotes "Új ajánlat" link (ha létezik) | Standalone workspace továbbra is működik (fallback) |
| 8 | Collapsed sidebar: "Új ajánlat" | Ikon megjelenik, tooltip-ként nem mutat hibát |
| 9 | Build: 0 hiba | `npm run build` |
| 10 | Tesztek: 85/85 zöld | `npx vitest run` |

---

## 6. Implementációs sorrend

| # | Lépés | Leírás |
|---|-------|--------|
| 1 | `Sidebar.jsx`: `MAIN_NAV` módosítás | `new-quote` → `{ key: 'new-project', label: 'Új ajánlat', highlight: true, navTarget: 'projektek' }` |
| 2 | `Sidebar.jsx`: `NAV_PATHS` bővítés | `'new-project': 'M12 5v14M5 12h14'` (plusz ikon, ugyanaz) |
| 3 | `Sidebar.jsx`: `renderNavBtn` onClick | `handleNav(item.navTarget \|\| item.key, item.tradeId)` |
| 4 | Ellenőrzés: más `setPage('new-quote')` hívások | Dashboard, Quotes oldalon — ha vannak, a standalone ág fallback marad |
| 5 | Build + test | `npm run build` → 0 hiba, `npx vitest run` → 85/85 |

---

## 7. Execution Brief

**Scope**: Sidebar "Új ajánlat" menüpont soft redirect a Projektek oldalra.

**Input**: `MAIN_NAV` konfigurációs tömb, `renderNavBtn` onClick handler.

**Output**: az "Új ajánlat" kattintás a Projektek oldalra navigál. Vizuális megjelenés változatlan (highlight, "+", plusz ikon).

**Nem nyúlunk**: App.jsx standalone TakeoffWorkspace ág (dead code marad fallback-nek), routing, workspace modell, más oldalak `setPage('new-quote')` hívásai, Sidebar layout/collapse/mobile logika.

**LOC becslés**: ~8-10 sor, 1 fájl.

**Kockázat**: nagyon alacsony — konfigurációs szintű módosítás, nincs state mutation, nincs új dependency, nincs layout változás.

---

## Mi NEM kerül bele

- App.jsx standalone TakeoffWorkspace eltávolítása (dead code cleanup)
- Dashboard / Quotes "Új ajánlat" belépési pontok módosítása
- Sidebar átszervezés (menüpont sorrend, csoportosítás)
- Új routing modell
- Új workspace modell
- Modal / toast guidance az "Új ajánlat" kattintásra
- `prefillData` state eltávolítása
- Standalone TakeoffWorkspace props cleanup
