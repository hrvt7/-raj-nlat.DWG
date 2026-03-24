---
name: ai-audit-pipeline
description: >
  Teljes körű weboldal audit + proposal + akció pipeline — GEO/SEO, Marketing és Sales
  elemzés, szolgáltatási ajánlat, megkeresési stratégia és akció tervek egyetlen paranccsal.
  Automatikusan detektálja a szintet: ha csak URL van, 5 oldalas diagnózist ad; ha partner
  adatlap is van csatolva, 15 oldalas teljes auditot. Használd ha a felhasználó bármit mond
  ami "audit", "teljes elemzés", "weboldal audit", "riport", "vizsgáld meg ezt az oldalt",
  "elemezd ezt a weboldalt", "nézd meg ezt a domaint", vagy bármilyen URL-t ad meg elemzésre.
allowed-tools: Read, Grep, Glob, Bash, WebFetch, Write, Agent, WebSearch
---
# AI Audit Pipeline — Automatikus Weboldal Elemzés

> Egy URL → automatikus szint detektálás → profi magyar PDF riport

---

## Parancsok

| Parancs | Mit csinál |
|---------|-----------|
| `/audit <url>` | Automatikus audit — ha csak URL van: 5 oldalas diagnózis (Szint 1). Ha partner adat is van csatolva: 15 oldalas teljes audit (Szint 2). |
| `/audit partner <domain>` | Üres partner adatlap sablon generálása (PDF) — ezt küldd el az ügyfélnek kitöltésre |
| `/audit compare <url>` | Havi delta riport — összehasonlítja a korábbi és jelenlegi auditot |

---

## FÁZIS 1: Felderítés + Szint Detektálás

### Szint Detektálás (ELSŐ LÉPÉS — mielőtt bármi mást csinálsz)

Mielőtt elindítod az auditot, ellenőrizd van-e csatolt partner adat:

1. Nézd meg a felhasználó üzenetét — van-e benne a URL-en kívül:
   - Csatolt fájl (PDF, MD, TXT, DOCX)
   - Beillesztett szöveg ami cég adatokat tartalmaz (forgalom, bevétel, vendégszám, stb.)
   - Hivatkozás egy fájlra (pl. "használd a ~/AuditUgyfelek/cegnev/partner.md fájlt")
2. Ha TALÁL partner adatot → **SZINT 2** (teljes audit, 15 oldal)
   Ha NEM talál partner adatot → **SZINT 1** (diagnózis, 5 oldal)
3. Jelezd a felhasználónak:
   - Szint 1: "Diagnózis mód — csak nyilvános adatokból dolgozom. Ha részletesebb auditot szeretnél, csatolj partner adatlapot."
   - Szint 2: "Teljes audit mód — a partner adatokat is felhasználom."

### Felderítés (mindkét szinten fut)

1. **Weboldal letöltése** — Homepage HTML fetch (WebFetch)
2. **Üzlettípus felismerése** — Szolgáltató / SaaS / E-commerce / Ügynökség / Helyi vállalkozás / Egyéb
3. **Kulcsoldalak kinyerése** — Sitemap.xml vagy belső linkek alapján (max 30 oldal)
4. **Alapadatok rögzítése** — Domain, cím, telefon, email, meta title/description, nyelvezet

---

## FÁZIS 2: GEO/SEO Elemzés (mindkét szinten fut)

Indítsd el az alábbi subagent-eket párhuzamosan az Agent tool-lal:

| Agent | Fájl | Feladata |
|-------|------|---------|
| geo-ai-visibility | `~/.claude/agents/geo-ai-visibility.md` | GEO audit, AI citability, crawler hozzáférés, llms.txt, brand mentions |
| geo-platform-analysis | `~/.claude/agents/geo-platform-analysis.md` | Platform-specifikus optimalizálás (ChatGPT, Perplexity, Google AIO) |
| geo-technical | `~/.claude/agents/geo-technical.md` | Technikai SEO, Core Web Vitals, crawlability, indexelhetőség |
| geo-content | `~/.claude/agents/geo-content.md` | Tartalom minőség, E-E-A-T, olvashatóság |
| geo-schema | `~/.claude/agents/geo-schema.md` | Schema markup detektálás, validálás, JSON-LD generálás, llms.txt generálás |

**GEO pontszámítás:** AI Citability 25% | Brand Authority 20% | Tartalom & E-E-A-T 20% | Technikai alapok 15% | Strukturált adatok 10% | Platform optimalizálás 10%

### Citability Score (szkript-alapú)

A GEO AI Citability pontszámot NE becsüld — futtasd a citability_scorer.py szkriptet:

```bash
python3 ~/.claude/skills/geo/scripts/citability_scorer.py <url>
```

A szkript JSON-t ad vissza egy 0-100 pontszámmal. **HASZNÁLD EZT** az AI Citability kategóriában.
Ha hibát dob → AI becslés fallback, de jelezd: "Automatizált mérés nem volt lehetséges, becslés alapján."

### Brand Authority Score (szkript-alapú)

```bash
python3 ~/.claude/skills/geo/scripts/brand_scanner.py <domain>
```

YouTube, Reddit, Wikipedia, LinkedIn mention-ök alapján 0-100 pontszám. **HASZNÁLD EZT**.
Ha hibát dob → AI becslés fallback.

### Schema Markup + llms.txt Generálás (geo-schema agent)

A **geo-schema** agent felelős a schema markup elemzéséért és generálásáért:
- Ha NINCS schema markup (Strukturált adatok pontszám < 20) → generál JSON-LD-t a `~/.claude/skills/geo/schema/` template-ekből
- Ha NINCS llms.txt → generálja az ügyfél adataiból
- Mindkettőt CSATOLJA a PDF-hez mint **"Kész megoldás"**
→ JSON kulcsok: `schema_code`, `llms_txt`

---

## FÁZIS 3: Marketing Elemzés (mindkét szinten fut, de SZINT-FÜGGŐ agent szám)

### Szint 1: 2 agent fut párhuzamosan

| Agent | Fájl | Feladata |
|-------|------|---------|
| market-content | `~/.claude/agents/market-content.md` | Tartalom, üzenetek, brand, bizalom |
| market-technical | `~/.claude/agents/market-technical.md` | Technikai marketing: SEO infra, tracking, oldal struktúra |

Szint 1-ben a Versenypozíció és Növekedés pontszámot a market-content és market-technical becsli.

### Szint 2: 4 agent fut párhuzamosan

| Agent | Fájl | Feladata |
|-------|------|---------|
| market-content | `~/.claude/agents/market-content.md` | Tartalom, üzenetek, brand, bizalom |
| market-technical | `~/.claude/agents/market-technical.md` | Technikai marketing: SEO infra, tracking, oldal struktúra |
| market-competitive | `~/.claude/agents/market-competitive.md` | Versenytárs kutatás: 3-5 versenytárs, pozícionálás, gap-ek |
| market-strategy | `~/.claude/agents/market-strategy.md` | Stratégia, növekedés + **TULAJDONOS NYILATKOZAT KERESÉS** (kontextuális kutatás) |

**Marketing pontszámítás:**
- market-content → Tartalom & Üzenetek (25%) + Brand & Bizalom (10%)
- market-technical → SEO & Felfedezhetőség (20%)
- market-competitive → Versenypozíció (15%) — CSAK SZINT 2
- market-strategy → Konverzió Optimalizálás (20%) + Növekedés & Stratégia (10%) — CSAK SZINT 2

---

## FÁZIS 4: Sales Elemzés (CSAK SZINT 2)

> **Szint 1-ben NEM fut a Sales elemzés.**

4 agent fut párhuzamosan:

| Agent | Fájl | Feladata |
|-------|------|---------|
| sales-company | `~/.claude/agents/sales-company.md` | Cég kutatás, firmográfia, tech stack, növekedési jelek |
| sales-contacts | `~/.claude/agents/sales-contacts.md` | Döntéshozók keresése, buying committee, LinkedIn, személyre szabás |
| sales-opportunity | `~/.claude/agents/sales-opportunity.md` | BANT minősítés, opportunity assessment, pain pontok |
| sales-strategy | `~/.claude/agents/sales-strategy.md` | Outreach terv: csatorna, üzenet, timing, első email draft |

**Sales pontszámítás:**
- sales-company → Cég illeszkedés (25%)
- sales-contacts → Kapcsolati hozzáférés (20%)
- sales-opportunity → Lehetőség minőség (20%)
- sales-strategy → Megkeresési készenlét (20%)
- Versenypozíció (15%) → a market-competitive eredményéből számolva

### Lead Score (szkript-alapú, BANT + MEDDIC)

```bash
echo '<json>' | python3 ~/.claude/skills/sales/scripts/lead_scorer.py
```

BANT + MEDDIC átlag → Sales összpontszám súlyozó faktor. Ha hibát dob → AI becslés fallback.

---

## FÁZIS 5: Szintézis

1. Összes agent eredmény összegyűjtése
2. Pontszámok kiszámítása — GEO Score, Marketing Score, (Sales Score ha Szint 2)
3. **Finding címkézés** — MINDEN finding-hoz KÖTELEZŐ:

### Finding Címkézés (MINDKÉT SZINTBEN KÖTELEZŐ)

🔴 **TÉNY** — A forráskódból közvetlenül ellenőrizhető. Pl: "canonical URL rossz", "nincs schema", "nincs sitemap"
🟡 **ERŐS FELTÉTELEZÉS** — Nagyon valószínű de nem 100%. Pl: "a PDF menü rontja a mobil élményt"
🟢 **JAVASLAT** — Ötlet amit érdemes tesztelni. Pl: "Instagram stratégia növelhetné a láthatóságot"

**Szint 1:** CSAK 🔴 és max 1-2 🟡 — NINCS 🟢
**Szint 2:** Minden típus lehet, de mind CÍMKÉZVE

---

## SZINT ELÁGAZÁS

### → Ha SZINT 1: Ugorj a "SZINT 1 PDF" szekcióra
### → Ha SZINT 2: Folytasd a Fázis 6-tal

---

## FÁZIS 6-9: CSAK SZINT 2

> **🚨 STOP — Fázis 5 az audit FELE. A Fázis 6-8 a MÁSIK FELE. TILOS PDF-et generálni amíg Fázis 9 nem kész.**

### FÁZIS 6: Proposal Generálás — KÖTELEZŐ

3 tier-es csomag az audit findings-re szabva:
- **Alap** (150-300 EUR/hó) | **Standard** (300-600 EUR/hó) | **Prémium** (600-1200 EUR/hó)
- Mindegyikhez: mit tartalmaz, mit old meg, várható üzleti hatás
- **Ajánlott csomag** megjelölése
- **Várható üzleti hatás** — NEM "Becsült bevételi hatás"
→ JSON kulcsok: `proposal_packages`, `business_impact_summary`

### Várható Üzleti Hatás Kommunikáció — SZABÁLYOK

SOHA ne adj konkrét Ft/hó számot KIVÉVE ha mindhárom feltétel teljesül:
1. A partner adatlapból van VALÓS forgalmi adat (vendégszám, kosárérték)
2. Az állítás mögött van MÉRHETŐ technikai hiba (pl. canonical URL rossz)
3. A becslés tartománya legalább 3x széles (pl. nem "340-595K" hanem "alacsony százezres nagyságrend")

HELYETTE használd ezt a 3 szintű rendszert:

🟢 **ALACSONY ÜZLETI HATÁS**
"Ez a javítás javítja az oldal minőségét, de közvetlen bevételi hatása nehezen mérhető."
Pl: alt szövegek, GDPR cookie consent, kép optimalizáció

🟡 **KÖZEPES ÜZLETI HATÁS**
"Ez a javítás a keresési láthatóságot vagy a felhasználói élményt javítja. Az iparági tapasztalatok alapján mérhető forgalomnövekedést szokott hozni."
Pl: meta description, sitemap, schema markup, review widget

🔴 **MAGAS ÜZLETI HATÁS**
"Ez a javítás közvetlenül befolyásolja hogy az ügyfelek megtalálják-e és igénybe veszik-e a szolgáltatást. Az Ön [partner adatból: X vendég/hó, Y Ft/fő] adatai alapján a hatás [alacsony százezres / közepes százezres / milliós] nagyságrendű lehet, de a pontos szám a végrehajtás minőségétől függ."
Pl: online foglalás bevezetése, canonical URL javítás, catering landing oldal

A "Becsült bevételi hatás" szekció NÉV VÁLTOZÁS → **"Várható üzleti hatás"**
És mindig zárd ezzel:
"Ezek becslések — a tényleges hatás a végrehajtás minőségétől és ütemezésétől függ. A pontos méréshez Google Analytics bevezetése szükséges."

### FÁZIS 7: Akció Tervek — KÖTELEZŐ

- **Email szekvenciák**: welcome (3), nurture (5), konverzió (3)
- **30 napos social naptár**: platformok, heti poszt szám, pillérek, 1 minta hét
- **CRO javaslatok**: 5-8 landing page javítás
- **Funnel elemzés**: 4-5 stage, lemorzsolódás, javítás
- **Megkeresési stratégia**: csatorna, üzenet, 3 lépéses email szekvencia
- **Laikus réteg**: executive_layman_intro, top3_layman, business_impact_summary, simple_action_steps
→ JSON kulcsok: `email_sequences`, `social_calendar_summary`, `cro_recommendations`, `funnel_analysis`, `outreach_strategy`, `executive_layman_intro`, `top3_layman`, `business_impact_summary`, `simple_action_steps`

### FÁZIS 8: Stratégiai Anyagok — KÖTELEZŐ

- **ICP** (Ideális ügyfélprofil)
- **Akcióterv 3 szinten**: quick wins, középtáv, stratégiai
→ JSON kulcsok: `icp`, `action_plan`

### FÁZIS 9: JSON Completeness Check — KÖTELEZŐ

```
SZINT 2 KÖTELEZŐ KULCSOK:
☐ geo_score, marketing_score, sales_score
☐ findings (min. 5, mind CÍMKÉZVE 🔴/🟡/🟢)
☐ executive_layman_intro, top3_layman, business_impact_summary, simple_action_steps
☐ schema_code (ha Strukturált adatok < 20), llms_txt (ha nincs llms.txt)
☐ proposal_packages (3 tier)
☐ email_sequences, social_calendar_summary, cro_recommendations, funnel_analysis, outreach_strategy
☐ icp, action_plan
```

**Ha BÁRMELYIK hiányzik → pótold, NE generálj PDF-et.**

---

## SZINT 1 PDF — Diagnózis (5 oldal, csak URL-ből)

### Tiltólista (Szint 1-ben SOHA ne írd):
- ❌ "havi X-Y Ft bevételt hagy az asztalon"
- ❌ "havi X elvesztett foglalás/rendelés"
- ❌ "X%-os növekedés"
- ❌ "a vendégek 70%-a inkább online foglalna" (forrás nélkül)

### Helyette:
- ✅ "javítja az oldal Google-láthatóságát"
- ✅ "csökkenti a látogatók lemorzsolódását"
- ✅ "erősíti az online bizalmat"

### Szint 1 PDF struktúra:

**1. oldal — Címlap**
- Cégnév, URL, dátum
- GEO Score + Marketing Score (két gauge)
- Alul: "Diagnózis — kizárólag nyilvános adatok alapján"

**2. oldal — "Amit 2 percben tudnia kell"**
- Max 5 finding, LAIKUS NYELVEN
- Minden finding mellé KÖTELEZŐ címke: 🔴 TÉNY / 🟡 ERŐS FELTÉTELEZÉS
- Hatás: "javítja a Google-láthatóságot", "csökkenti a lemorzsolódást" — NEM Ft összeg

**3. oldal — "3 azonnali teendő"**
- Max 3 quick win: mit / ki csinálja / mennyi idő / mennyibe kerül
- Csak javítás költsége — NEM bevételi becslés

**4. oldal — Scorecard (Audit Benchmark Score — heurisztikus értékelés)**
- GEO kategóriák (6 db), Marketing kategóriák (6 db), AI Platform Készenlét — becsült szint, AI Crawler hozzáférés (5 sor)
- **KÖTELEZŐ disclaimer a scorecard ALJÁN:**
  "A pontszámok heurisztikus értékelést tükröznek, nem egzakt mérést. A scoring az oldal forráskódjának, tartalmának és online jelenlétének automatikus elemzésén alapul. A számok célja az erősségek és gyengeségek közötti arányok bemutatása, nem pontos teljesítménymérés."

**5. oldal — Következő lépés**
- "Ez a diagnózis nyilvánosan elérhető adatokból készült."
- "Részletesebb elemzéshez szükséges: [forgalmi adatok, marketing büdzsé, célok]"
- "Töltse ki az alábbi adatlapot:" + CTA
- Ha van kész schema JSON-LD és/vagy llms.txt → MELLÉKELD mint "Kész megoldás"

### Szint 1 JSON kulcsok:
```
☐ geo_score, marketing_score (sales_score NINCS)
☐ findings (max 5, CÍMKÉZVE, NINCS Ft becslés)
☐ quick_wins (max 3)
☐ geo_categories, marketing_categories, geo_crawler_access, geo_platforms
☐ schema_code (ha kell), llms_txt (ha kell)
☐ competitors (ha van adat)
```

---

## SZINT 2 PDF — Teljes Audit (URL + partner adat)

A profi PDF NEM audit-log, hanem döntéshozói dokumentum. 3 TISZTÁN ELVÁLASZTOTT blokkra tagolódik.

### ═══ BLOKK A: AUDIT (8-10 oldal) ═══

**1. oldal — Címlap**
- Cégnév, URL, dátum, készítő
- GEO + Marketing + Sales Score (3 gauge)

**2. oldal — Vezetői összefoglaló ("Mit jelent ez az Ön vállalkozása számára?")**
- `executive_layman_intro`: 3-4 mondat laikus nyelven, analógiával
- 3 box (`top3_layman`): probléma + analógia + üzleti hatás szint (🔴/🟡/🟢) + javítás költsége
- Záró mondat: "Összességében ezek a hiányosságok jelentős mennyiségű potenciális vendéget és bevételt veszítenek el havonta. A pontos szám a javítások végrehajtása után, Google Analytics segítségével mérhető."
- **TILOS** konkrét Ft/hó összeg KIVÉVE ha a partner adatlapból VAN valós forgalmi adat ÉS a hiba mérhető — AKKOR adhatsz becslést de MINDIG tartománnyal és disclaimerrel

**3. oldal — "Mit tegyen először?"**
- `simple_action_steps`: 3-5 lépés, laikus nyelven, semmilyen technikai szó
- "Ha ezeket szeretné hogy mi megcsináljuk:" → link a Szolgáltatási ajánlat oldalra

**4. oldal — Elválasztó**
- "RÉSZLETES TECHNIKAI MELLÉKLET — Ha nem technikai szakember, nyugodtan ugorja át."

**5. oldal — Audit scope és módszertan**
- Audit dátuma, vizsgált oldalak száma, használt eszközök, mi NEM volt scope-ban

**6. oldal — Scorecard (Audit Benchmark Score — heurisztikus értékelés)**
- GEO + Marketing + Sales kategóriák, platformok (fejléc: "AI Platform Készenlét — becsült szint"), crawler access
- **KÖTELEZŐ disclaimer a scorecard ALJÁN:**
  "A pontszámok heurisztikus értékelést tükröznek, nem egzakt mérést. A scoring az oldal forráskódjának, tartalmának és online jelenlétének automatikus elemzésén alapul. A számok célja az erősségek és gyengeségek közötti arányok bemutatása, nem pontos teljesítménymérés."

**7-8. oldal — Feltárt problémák (Top findings)**
- Severity: KRITIKUS / MAGAS / KÖZEPES
- Minden finding alá "Magyarul:" doboz a laikus analógiával
- Címkék: 🔴 TÉNY / 🟡 FELTÉTELEZÉS / 🟢 JAVASLAT

**9. oldal — Azonnali teendők + Várható üzleti hatás**
- 3-5 gyors javítás: mit / hatás szint (🔴/🟡/🟢) / munkaigény
- Várható üzleti hatás a 3 szintű rendszerrel (NEM konkrét Ft összeg)

**10. oldal — 30-90 napos fejlesztési terv**
- 30 nap / 60 nap / 90 nap oszlopok

### ═══ ELVÁLASZTÓ OLDAL ═══
"Szolgáltatási Ajánlat — Az alábbi rész a javasolt együttműködési kereteket tartalmazza."

### ═══ BLOKK B: SZOLGÁLTATÁSI AJÁNLAT (2-3 oldal) ═══

**11. oldal — 3 csomag (Alap / Standard / Prémium)**
- Árak, tartalom, várható üzleti hatás szint

**12. oldal — Versenytárs összehasonlítás**

### ═══ ELVÁLASZTÓ OLDAL ═══
"Marketing Műhelymunka Tervek — Részletes operatív anyagok a végrehajtáshoz."

### ═══ BLOKK C: OPERATÍV MELLÉKLETEK (3-4 oldal) ═══

**13. oldal — CRO javaslatok**

**14. oldal — Email szekvenciák + Megkeresési stratégia**

**15. oldal — Funnel elemzés + 30 napos tartalom naptár**

**16. oldal — Appendix**
- ICP, vizsgált URL-ek, módszertan, disclaimer

---

## Nyelvi Követelmények — KRITIKUS

A teljes audit riport **hibátlan magyar nyelven** készül:
- Minden ékezet tökéletes (á, é, í, ó, ö, ő, ú, ü, ű)
- Természetes, üzleti magyar nyelv — NEM fordítás-szagú
- Kerüld az AI-szagú fordulatokat
- Rövid, határozott mondatok

**Kerülendő:** "átfogó elemzésünk alapján", "szignifikáns javulás", "optimalizálási lehetőségek", "holisztikus", "komprehenzív", "leverálni"
**Preferált:** "Három komoly probléma van az oldallal.", "Ez 30-40%-os forgalomnövekedést hozhat", "Konkrétan ez hiányzik: ..."

---

## "Magyarul ez azt jelenti" — Analógiák Gyűjteménye

| Technikai fogalom | Laikus analógia |
|---|---|
| Canonical URL hiba | "A Google rossz oldalt mutat — mintha rossz telefonszám lenne a telefonkönyvben" |
| Schema markup hiányzik | "A Google nem tudja gépileg leolvasni a nyitvatartást, árat — mintha névjegykártya lenne szöveg nélkül" |
| Meta description hiányzik | "A Google-ben nem jelenik meg leírás az oldala alatt — üres, az emberek továbbgörgetnek" |
| Sitemap.xml hiányzik | "Nem adott térképet a Google-nek — vakon bolyong és sok oldalt nem talál meg" |
| Alt text hiányzik | "A képeinek nincs leírása — a Google vak a képekre" |
| Nincs hreflang | "A kétnyelvű oldal össze van keverve — a Google magyarul keresőknek angolul mutathatja" |
| Nincs online foglalás | "Csak telefonon lehet foglalni — aki nem tud hívni, elmegy a versenytárshoz" |
| Review-k nem jelennek meg | "Van 300+ jó értékelése de az oldalon semmi nem látszik — mintha díja lenne de nem tenné ki" |
| PDF menü | "Az étlap letölthető fájl — mobilon olvashatatlan és a Google sem indexeli" |
| AI keresőkben láthatatlan | "Ha valaki megkérdezi a ChatGPT-t hol egyenek, az éttermét nem fogja ajánlani" |
| Nincs GDPR/cookie consent | "Jogilag kötelező sütitájékoztató hiányzik — ez bírságot vonhat maga után" |
| Nincs email lista | "Nem gyűjti a vendégek email címét — nem tud visszahívni őket akcióval" |
| Core Web Vitals rossz | "Az oldal lassú — a látogatók 40%-a elmenekül ha 3 mp-nél tovább tölt" |

---

## Minőségi Kapuk

- Max 30 oldal / audit, 30 mp timeout, robots.txt tiszteletben tartva
- Ha agent nem ad vissza adatot → "Nem elérhető", NEM kitalált adat
- PDF generálás előtt MINDIG JSON validitás ellenőrzés

### SPA / JavaScript-renderelt Oldalak — KRITIKUS

A WebFetch **NEM futtat JavaScript-et**. Sok modern oldal (Next.js, React, Angular, Vue) 404-et ad nyers HTTP kéréssel.

**SZABÁLYOK:**
1. Ha aloldal 404-et ad WebFetch-csel → **NE jelöld automatikusan hibásnak**
2. Ha Next.js/React/Angular/Vue → SPA-gyanús
3. **SOHA ne írj "X oldal nem működik" vagy "X oldal 404-et ad" ha JS framework-öt használ**
4. Ehelyett: "Az oldal JavaScript-tel renderel, az automatikus ellenőrzés korlátozott."

### Kontextuális Kutatás Üzleti Javaslatok Előtt — KRITIKUS

**MIELŐTT üzleti modell javaslatot tennél (delivery, új szolgáltatás, stb.):**
1. Keresni a tulajdonos nyilatkozatait: `WebSearch "[cég neve]" interjú OR podcast OR nyilatkozat`
2. Ha a tulajdonos KIFEJEZETTEN elmondta hogy valamit NEM csinál → **TILOS javasolni**
3. Ha nincs info → "Előzetes egyeztetés szükséges"

---

## Hibakezelés

- Weboldal nem elérhető → jelezd, ne folytasd
- Agent timeout → folytasd a többivel, jelöld a hiányzó területet
- PDF generálás sikertelen → mentsd a JSON-t, jelezd a problémát
- Nincs weasyprint/jinja2 → `pip install weasyprint jinja2 --break-system-packages`
- Mac-en: `brew install cairo pango gdk-pixbuf libffi`

---

## Végrehajtási Sorrend

### SZINT 1 (5 oldalas diagnózis — 7 agent):
1. WebFetch URL → HTML
2. Üzlettípus + alapadatok
3. GEO agentek (5 db párhuzamosan): geo-ai-visibility, geo-platform-analysis, geo-technical, geo-content, geo-schema
4. Marketing agentek (2 db párhuzamosan): market-content, market-technical
5. Pontszámok, findings (CÍMKÉZVE), JSON → `/tmp/audit-data-<domain>.json`
   > A JSON-ban `"audit_level": "szint1"` legyen!
6. PDF generálás (5 oldalas):
   ```bash
   python3 ~/.claude/skills/ai-audit-pipeline/scripts/generate_full_audit_pdf.py /tmp/audit-data-<domain>.json "AUDIT-DIAGNOZIS-<domain>.pdf" --lite
   ```
7. Kimásolás → link

### SZINT 2 (16+ oldalas teljes audit — 13 agent):
1. WebFetch URL → HTML
2. Üzlettípus + alapadatok
3. GEO agentek (5 db párhuzamosan): geo-ai-visibility, geo-platform-analysis, geo-technical, geo-content, geo-schema
4. Marketing agentek (4 db párhuzamosan): market-content, market-technical, market-competitive, market-strategy
5. Sales agentek (4 db párhuzamosan): sales-company, sales-contacts, sales-opportunity, sales-strategy
6. Pontszámok, findings (CÍMKÉZVE), köztes JSON → `/tmp/audit-data-<domain>.json`
   > ⛔ CHECKPOINT: "Audit adatok kész (6/12). Most jönnek a proposal-ok és akció tervek..."
7. Proposal generálás (3 tier)
8. Akció tervek (email, social, CRO, funnel, outreach)
9. Laikus réteg (executive_layman_intro, top3_layman, simple_action_steps)
10. Stratégiai anyagok (ICP, akcióterv)
11. JSON completeness check → ha hiányzik valami, pótold
12. PDF generálás (16+ oldalas) → kimásolás → link

> **CONTEXT LIMIT:** Ha elfogy a 6. lépés után → mentsd JSON-t, jelezd: "Audit 1. rész kész. Folytasd `/audit proposal <url>`"
> **DE: Ha van context → TILOS megállni. A 7-10 KÖTELEZŐ.**

### Context Window Kezelés

A Szint 2 audit 13 agent-et futtat. Ha a context window elfogy:

1. A GEO agentek (5 db) MINDIG lefutnak — ezek a legfontosabbak
2. A Marketing agentek (4 db) MINDIG lefutnak
3. A Sales agentek (4 db) futnak HA van elég context
4. Ha a Sales agentek nem futnak le → jelezd: "A Sales elemzés a context limit miatt nem készült el. Futtasd újra: `/audit sales <url>`"

A fázisok HELYES sorrendje:
- GEO agentek → szintézis részbeni → Marketing agentek → szintézis bővítés → Sales agentek → végső szintézis
- Vagy ha van elég context: mind a 13 párhuzamosan → szintézis egyben

---

## Havi Delta Riport (`/audit compare <url>`)

Havi csomagos ügyfeleknek. Összehasonlítja a korábbi és jelenlegi auditot.

1. Korábbi JSON: `~/AuditUgyfelek/[domain]/baseline.json`
2. Futtasd újra az auditot (Fázis 1-5, proposal NEM kell)
3. Hasonlítsd össze kategóriánként
4. Delta PDF: pontszám változás, "Ami javult" (zöld), "Ami hátravan" (piros), következő hónap prioritásai
5. LAIKUS NYELVEN: "A Google keresőben a csillagok mostmár megjelennek — ez a schema markup javításnak köszönhető."

### Baseline mentés:
Teljes audit után → `~/AuditUgyfelek/[domain]/baseline.json`
Ha létezik korábbi → `~/AuditUgyfelek/[domain]/audit-YYYY-MM-DD.json`

---

## Partner Adatlap Generálás (`/audit partner <domain>`)

Futtatás:
```bash
python3 ~/.claude/skills/ai-audit-pipeline/scripts/generate_partner_form.py "<Cégnév>" "PARTNER-ADATLAP-<domain>.pdf"
```

A PDF-et másold a felhasználó output mappájába.

### Partner Adatlap tartalma (referencia):

```
PARTNER ADATLAP — [Cégnév]

CÉGADATOK
Cégnév: _______________
Kapcsolattartó: _______________
Email: _______________
Telefon: _______________

FORGALMI ADATOK
Havi vendégszám / rendelésszám: _______________
Átlagos számlaérték: _______________ Ft
Legerősebb / leggyengébb időszak: _______________
Online vs. helyszíni arány: _____ % / _____ %

DIGITÁLIS JELENLÉT
Google Analytics: igen / nem
Google Cégprofil: igen / nem
Havi weboldal látogató (kb.): _______________
Facebook / Instagram követők: _______________

MARKETING
Havi marketing költés (kb.): _______________ Ft
Van webfejlesztő / marketinges: igen / nem — Ki: _______________

CÉLOK
3 legnagyobb üzleti probléma:
1. _______________
2. _______________
3. _______________
Mit szeretne elérni 6 hónapon belül: _______________
```
