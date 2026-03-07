# ProjectDetailView — Empty Project / First-Use Guidance Brief

> Scope: passzív guidance elem az üres/új projekt állapotra — a pilot readiness audit #2 friction pont.
> Cél: a user azonnal lássa a javasolt következő lépést.
> Nem cél: teljes onboarding rendszer, modal tutorial, tooltip séta, gamification.

---

## 1. Current-State Audit

### Amit a user lát egy friss projekt megnyitásakor

```
[← Vissza a projektekhez]
Projekt neve                          (h1 header)
0 tervrajz · 0 szimbólum sablon      (subtitle)

┌─────────────────────────────────────────┐
│  [+] Jelmagyarázat hozzáadása           │  ← dashed chip, kattintható
│  Szimbólum sablonok automatikus felism. │
└─────────────────────────────────────────┘

[📋 Korábbi detekciók  ▼]                   ← dropdown, üres

── Tervrajzok ──────────────────────
┌─────────────────────────────────────────┐
│  + Tervrajz hozzáadása                  │  ← drop zone
│  PDF, DXF, DWG · Húzd ide vagy kattints│
└─────────────────────────────────────────┘

    Még nincsenek tervrajzok
    Töltsd fel a PDF tervrajzokat fentebb
```

### Problémák

| # | Probléma | Hatás |
|---|----------|-------|
| 1 | Nincs vizuális sorrend: a user látja a jelmagyarázat chipet és a tervrajz feltöltést, de nem tudja melyikkel kezdjen | Bizonytalanság, random kattintás |
| 2 | Nincs állapotjelzés: a projekt "progressje" nem látható — 0 tervrajz és 0 sablon egyformán szürke | Nincs momentum-érzet |
| 3 | A "Korábbi detekciók" dropdown üres projektnél felesleges — helyet foglal, zajt ad | Vizuális zaj |
| 4 | Az empty state ("Még nincsenek tervrajzok") passzív — nem ad kontextust arról, mi történik tervrajz feltöltés után | Nincs forward guidance |

### Vizuális elrendezés sorrendje (felülről lefelé)

1. Back + header + subtitle
2. Legend chip (dashed / filled)
3. SelectionToolbar (0 kijelölés → hidden)
4. DetectionHistoryMini (üres → "Nincs korábbi detekció")
5. "Tervrajzok" section label
6. Upload drop zone
7. Plans grid / empty state

---

## 2. Javasolt Minimum Guidance Megoldás

### Megoldás: **Progress Hint Bar** (nem stepper, nem modal)

Egyetlen, kompakt, állapotfüggő hint sáv a header és a legend chip között, ami:
- szövegesen megmondja az aktuális következő lépést
- vizuálisan jelzi a projekt előrehaladását (3-4 lépés pöttyök)
- automatikusan frissül a projekt adataiból — nincs manuális state kezelés
- eltűnik amikor a projekt "aktívan használatban" (≥1 calc kész)

### Miért nem stepper / wizard / modal?

| Alternatíva | Elvetés oka |
|-------------|-------------|
| Full stepper | Túl nagy scope — routing, step state, validáció, back/next — 200+ sor |
| Modal tutorial | Zavaró, egyszeri, nem állapotfüggő — nem segít visszatérő usernél |
| Tooltip séta | JS library dependency (react-joyride stb.), törékeny, nem reaktív |
| **Hint bar** | **~40-50 sor, nincs dependency, állapotfüggő, passzív, nem blokkoló** ✅ |

### Hint Bar viselkedés

A hint bar egy `<div>` a header subtitle alatt, ami a projekt adataiból kiszámolt `phase` alapján mutat szöveget:

| Phase | Feltétel | Hint szöveg | Stílus |
|-------|----------|-------------|--------|
| `upload` | `plans.length === 0` | "① Töltsd fel a tervrajzokat — PDF, DXF vagy DWG" | accent border, upload ikon |
| `legend` | `plans.length > 0 && templates.length === 0` | "② Adj hozzá jelmagyarázatot a szimbólum felismeréshez" | blue border, book ikon |
| `work` | `templates.length > 0 && noCalcPlans > 0` | "③ Nyisd meg a tervrajzokat → detektálás → kalkuláció" | muted border, bolt ikon |
| `done` | `allPlansHaveCalc` | *(hint bar nem jelenik meg)* | — |

A phase-ek nem lépések — nem kell sorrendben haladni. A hint bar egyszerűen a leghasznosabb következő akciót javasolja.

### Vizuális terv

```
┌──────────────────────────────────────────────────────┐
│ ● ○ ○  ①  Töltsd fel a tervrajzokat                 │
│         PDF, DXF vagy DWG fájlok                     │
└──────────────────────────────────────────────────────┘
```

- 3 pötty (●/○) jelzi a 3 fázist — pure visual, nem kattintható
- Szürke/accent/blue háttér a phase alapján
- `display: none` ha phase === `done`

---

## 3. Miből számolható a projekt állapota

Minden adat már elérhető a `ProjectDetailView`-ban:

| Adat | Forrás | Már betöltve? |
|------|--------|---------------|
| `plans.length` | `getPlansByProject(projectId)` → `plans` state | ✅ L571-574 |
| `templates.length` | `getTemplatesByProject(projectId)` → `templates` state | ✅ L575-576 |
| `plan.calcTotal` | Minden plan objektumon — `TakeoffWorkspace.handleSave` írja | ✅ PlanCard már olvassa L212-213 |
| `project.legendPlanId` | `getProject(projectId)` → `project` state | ✅ L569-570 |

**Nincs szükség új adatlekérésre vagy store-módosításra.**

A phase számolás:

```
const noCalcPlans = plans.filter(p => !(p.calcTotal > 0)).length
const phase =
  plans.length === 0 ? 'upload' :
  templates.length === 0 ? 'legend' :
  noCalcPlans > 0 ? 'work' : 'done'
```

---

## 4. Érintett fájlok

| Fájl | Módosítás | ~LOC |
|------|-----------|------|
| `src/pages/Projektek.jsx` | `ProjectDetailView` — phase számolás + `GuidanceHintBar` renderelés a header és legend chip közé | ~40-50 |

**Összesen: 1 fájl.**

Nem érintett: App.jsx, store-ok, routing, LegendPanel, TakeoffWorkspace, PdfMergePanel.

---

## 5. Regressziós kockázatok

| Kockázat | Valószínűség | Mitigation |
|----------|-------------|------------|
| Hint bar layout shift a meglévő elemeket tolja | Alacsony | `marginBottom: 12` és a legend chip `marginBottom: 12` már van — a hint bar közéjük kerül |
| Phase "legend" zavarja a usert aki legend nélkül akar dolgozni | Közepes | A hint bar pusztán szöveg, nem blokkolja a feltöltést — a "Tervrajzok" section változatlan marad alatta |
| Hint bar nem tűnik el calc után | Alacsony | Phase `done` → `return null` — a reload() hívás a PlanCard `calcTotal` frissülése után futna |
| `plans` state a legend plant is tartalmazhatja | Alacsony | Már kiszűrjük L573: `prjPlans.filter(p => p.id !== prj.legendPlanId)` |

---

## 6. Smoke Check Lista

| # | Teszt | Elvárt |
|---|-------|--------|
| 1 | Új üres projekt → ProjectDetailView | Hint bar megjelenik, phase=upload, "Töltsd fel a tervrajzokat" |
| 2 | 1+ tervrajz feltöltve, 0 template | Phase=legend, "Adj hozzá jelmagyarázatot" |
| 3 | 1+ tervrajz + 1+ template, nincs calcTotal | Phase=work, "Nyisd meg a tervrajzokat" |
| 4 | Minden tervrajznak van calcTotal > 0 | Hint bar eltűnik (phase=done) |
| 5 | Hint bar nem jelenik meg a plans grid-et zavaróan | Layout stabil, nincs ugrás |
| 6 | Hint bar pöttyök megfelelő állapotot mutatnak | ● ● ○ ha phase=work |
| 7 | Legend chip továbbra is működik (kattintás → onLegendPanel) | Nem változott |
| 8 | DetectionHistoryMini továbbra is működik | Nem változott |
| 9 | Build: 0 hiba | `npm run build` |
| 10 | Tesztek: 85/85 zöld | `npx vitest run` |

---

## 7. Implementációs sorrend

| # | Lépés | Leírás |
|---|-------|--------|
| 1 | Phase számolás | `const phase = ...` a `ProjectDetailView` renderben, a meglévő `plans` és `templates` state-ből |
| 2 | GuidanceHintBar komponens | Inline function vagy kis komponens (~30 sor), phase prop → szöveg + pöttyök |
| 3 | Renderelés pozicionálása | A header `<div>` és a legend chip `<div>` közé (L670 és L672 között) |
| 4 | Phase=done → null | Hint bar eltűnik ha minden plan calcTotal > 0 |
| 5 | Stílus | Konzisztens a meglévő design tokenekkel (C.accent, C.blue, C.muted, C.border, DM Mono, Syne) |
| 6 | Build + test | `npm run build` → 0 hiba, `npx vitest run` → 85/85 |

---

## Execution Brief

**Scope**: egyetlen `GuidanceHintBar` beillesztése a `ProjectDetailView`-ba.

**Input**: `plans` (already filtered), `templates` — mindkettő meglévő state.

**Kalkuláció**: `phase` derived variable: `upload → legend → work → done`.

**Output**: állapotfüggő hint sáv 3 pöttyel + szöveges javaslattal.

**Nem nyúlunk**: App.jsx, routing, store-ok, LegendPanel, DetectionReviewPanel, TakeoffWorkspace, PdfMergePanel, Sidebar, modálisok.

**LOC becslés**: ~40-50 sor, 1 fájl.

**Kockázat**: alacsony — pure UI, nincs state mutation, nincs új dependency.
