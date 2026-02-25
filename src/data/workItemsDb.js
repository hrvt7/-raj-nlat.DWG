// ─── TakeoffPro Normaidő Adatbázis v2.0 ─────────────────────────────────────
// Forrás: NECA labor units + magyar piaci tapasztalat
// P50 = normál körülmény (versenyképes ajánlathoz)
// P90 = nehéz körülmény (beton, berendezett, állványos)
// Overhead KÜLÖN → settings-ben

export const WORK_ITEM_CATEGORIES = [
  { key: 'bontas',       label: 'Bontás',               icon: 'BON', color: '#FF6B6B' },
  { key: 'nyomvonal',    label: 'Nyomvonalépítés',       icon: '⛏️',  color: '#FF9F43' },
  { key: 'dobozolas',    label: 'Dobozolás',             icon: 'DOB', color: '#FFD166' },
  { key: 'kabelezes',    label: 'Kábelezés',             icon: '〰️',  color: '#06D6A0' },
  { key: 'kotesek',      label: 'Kötések / Csatlakozók', icon: '🔗', color: '#118AB2' },
  { key: 'szerelvenyek', label: 'Szerelvényezés',        icon: '🔌', color: '#8338EC' },
  { key: 'vilagitas',    label: 'Világítás',             icon: 'VIL', color: '#FFD966' },
  { key: 'kabeltalca',   label: 'Kábeltálca',            icon: 'TAL', color: '#00E5A0' },
  { key: 'elosztok',     label: 'Elosztók / Védelem',    icon: 'ELO', color: '#FF6B6B' },
  { key: 'meres',        label: 'Mérési csomag',         icon: 'MER', color: '#4CC9F0' },
  { key: 'gyengaram',    label: 'Gyengeáram',            icon: '📡', color: '#A8DADC' },
]

export const WORK_ITEMS_DEFAULT = [
  // ─── BONTÁS ───────────────────────────────────────────────────────────────
  { code: 'BON-001', category: 'bontas',       name: 'Szerelvény bontása',          unit: 'db',  p50: 8,   p90: 15,  heightFactor: true,  desc: 'Dugalj/kapcsoló kiszedés, doboz bontása' },
  { code: 'BON-002', category: 'bontas',       name: 'Kábel kibontása (falban)',     unit: 'm',   p50: 5,   p90: 10,  heightFactor: false, desc: 'Falban lévő kábel kibontása, horony visszabontása' },
  { code: 'BON-003', category: 'bontas',       name: 'Kábeltálca bontása',          unit: 'm',   p50: 6,   p90: 12,  heightFactor: true,  desc: 'Kábeltálca leszedése tartókkal együtt' },
  { code: 'BON-004', category: 'bontas',       name: 'Elosztó tábla bontása',       unit: 'db',  p50: 120, p90: 180, heightFactor: false, desc: 'Komplett tábla bontása, kábel visszavágás' },

  // ─── NYOMVONALÉPÍTÉS ──────────────────────────────────────────────────────
  { code: 'NYO-001', category: 'nyomvonal',    name: 'Horonymarás (falba)',          unit: 'm',   p50: 12,  p90: 25,  heightFactor: true,  desc: 'Horonymaró géppel, 50×50mm horony' },
  { code: 'NYO-002', category: 'nyomvonal',    name: 'Horonymarás (mennyezetbe)',    unit: 'm',   p50: 18,  p90: 35,  heightFactor: false, desc: 'Mennyezeti horony, por+nehéz hozzáférés' },
  { code: 'NYO-003', category: 'nyomvonal',    name: 'Cső fektetés (falban)',        unit: 'm',   p50: 8,   p90: 16,  heightFactor: true,  desc: 'PVC cső lerakása horonybán rögzítéssel' },
  { code: 'NYO-004', category: 'nyomvonal',    name: 'Cső fektetés (mennyezeten)',   unit: 'm',   p50: 12,  p90: 22,  heightFactor: false, desc: 'Mennyezeti csőfektetés, bilincsezés' },
  { code: 'NYO-005', category: 'nyomvonal',    name: 'Horony visszavakolása',        unit: 'm',   p50: 8,   p90: 14,  heightFactor: true,  desc: 'Gipsz visszavakolás, simítás' },
  { code: 'NYO-006', category: 'nyomvonal',    name: 'Gipszkarton hasítása',         unit: 'm',   p50: 5,   p90: 10,  heightFactor: true,  desc: 'GK tábla hasítása cső/kábel számára' },

  // ─── DOBOZOLÁS ────────────────────────────────────────────────────────────
  { code: 'DOB-001', category: 'dobozolas',    name: 'Szerelvénydoboz (tégla)',      unit: 'db',  p50: 15,  p90: 30,  heightFactor: true,  desc: 'Üregelés, doboz behelyezése, rögzítése' },
  { code: 'DOB-002', category: 'dobozolas',    name: 'Szerelvénydoboz (beton)',      unit: 'db',  p50: 25,  p90: 50,  heightFactor: true,  desc: 'Fúrás, doboz rögzítése betonba' },
  { code: 'DOB-003', category: 'dobozolas',    name: 'Szerelvénydoboz (GK)',         unit: 'db',  p50: 8,   p90: 12,  heightFactor: true,  desc: 'Lyukkör, GK csapágyazott doboz' },
  { code: 'DOB-004', category: 'dobozolas',    name: 'Kötődoboz behelyezése',        unit: 'db',  p50: 12,  p90: 22,  heightFactor: true,  desc: 'Kötődoboz tégla/GK falba' },
  { code: 'DOB-005', category: 'dobozolas',    name: 'Elosztódoboz rögzítés',        unit: 'db',  p50: 20,  p90: 40,  heightFactor: false, desc: 'Falon kívüli/süllyesztett elosztódoboz' },

  // ─── KÁBELEZÉS ────────────────────────────────────────────────────────────
  { code: 'KAB-001', category: 'kabelezes',    name: 'Kábel NYM-J 3×1.5',           unit: 'm',   p50: 4,   p90: 8,   heightFactor: true,  desc: 'Falba/csőbe húzás, rögzítés' },
  { code: 'KAB-002', category: 'kabelezes',    name: 'Kábel NYM-J 3×2.5',           unit: 'm',   p50: 5,   p90: 9,   heightFactor: true,  desc: 'Falba/csőbe húzás, rögzítés' },
  { code: 'KAB-003', category: 'kabelezes',    name: 'Kábel NYY-J 3×2.5',           unit: 'm',   p50: 6,   p90: 11,  heightFactor: true,  desc: 'Tálcán/falon húzás, rögzítés' },
  { code: 'KAB-004', category: 'kabelezes',    name: 'Kábel NYY-J 5×2.5',           unit: 'm',   p50: 7,   p90: 13,  heightFactor: true,  desc: '3 fázisú kábel fektetés' },
  { code: 'KAB-005', category: 'kabelezes',    name: 'Kábel NYY-J 5×4',             unit: 'm',   p50: 8,   p90: 15,  heightFactor: true,  desc: '3 fázisú kábel fektetés' },
  { code: 'KAB-006', category: 'kabelezes',    name: 'Kábel NYY-J 5×6',             unit: 'm',   p50: 10,  p90: 18,  heightFactor: true,  desc: '3 fázisú kábel fektetés' },
  { code: 'KAB-007', category: 'kabelezes',    name: 'Kábel NYY-J 5×10',            unit: 'm',   p50: 12,  p90: 22,  heightFactor: true,  desc: '3 fázisú kábel fektetés' },
  { code: 'KAB-008', category: 'kabelezes',    name: 'Kábel NYY-J 5×16',            unit: 'm',   p50: 15,  p90: 28,  heightFactor: true,  desc: '3 fázisú kábel fektetés' },
  { code: 'KAB-009', category: 'kabelezes',    name: 'Kábel CYKY 3×1.5',            unit: 'm',   p50: 4,   p90: 8,   heightFactor: true,  desc: 'Falon kívüli húzás, csőben' },
  { code: 'KAB-010', category: 'kabelezes',    name: 'Kábel tálcán végtelen',       unit: 'm',   p50: 3,   p90: 6,   heightFactor: true,  desc: 'Tálcán húzás, kötözés (tálcaszerelés NEM benne)' },

  // ─── KÖTÉSEK ──────────────────────────────────────────────────────────────
  { code: 'KOT-001', category: 'kotesek',      name: 'Kábel végkészítés (1.5-4)',   unit: 'db',  p50: 8,   p90: 15,  heightFactor: false, desc: 'Kábel szigetelés, saru/csupaszítás, jelölés' },
  { code: 'KOT-002', category: 'kotesek',      name: 'Kábel végkészítés (6-16)',    unit: 'db',  p50: 12,  p90: 22,  heightFactor: false, desc: 'Kábel végkészítés közepes méret, saru' },
  { code: 'KOT-003', category: 'kotesek',      name: 'Kötődoboz bekötés (2 ér)',    unit: 'db',  p50: 10,  p90: 18,  heightFactor: false, desc: 'Kötődobozban toldás, csavarkötés' },
  { code: 'KOT-004', category: 'kotesek',      name: 'Kötődoboz bekötés (4+ ér)',   unit: 'db',  p50: 15,  p90: 25,  heightFactor: false, desc: 'Összetett kötődoboz bekötés' },
  { code: 'KOT-005', category: 'kotesek',      name: 'Tömszelence beépítés',        unit: 'db',  p50: 10,  p90: 18,  heightFactor: false, desc: 'IP védett kábelbemenet' },

  // ─── SZERELVÉNYEZÉS ───────────────────────────────────────────────────────
  { code: 'SZE-001', category: 'szerelvenyek', name: 'Dugalj 2P+F (alap)',          unit: 'db',  p50: 18,  p90: 32,  heightFactor: true,  desc: 'Bekötés, rögzítés, fedőlap (doboz NEM benne)' },
  { code: 'SZE-002', category: 'szerelvenyek', name: 'Dugalj 2P+F IP44',            unit: 'db',  p50: 22,  p90: 38,  heightFactor: true,  desc: 'IP44 szerelvény, tömítőkeret szerelése' },
  { code: 'SZE-003', category: 'szerelvenyek', name: 'Dugalj 3P+F+N (ipari)',       unit: 'db',  p50: 30,  p90: 55,  heightFactor: true,  desc: 'CEE dugalj, ipari rögzítés' },
  { code: 'SZE-004', category: 'szerelvenyek', name: 'Kapcsoló 1G',                 unit: 'db',  p50: 15,  p90: 28,  heightFactor: true,  desc: 'Egygangos kapcsoló bekötése, fedőlap' },
  { code: 'SZE-005', category: 'szerelvenyek', name: 'Kapcsoló 2G',                 unit: 'db',  p50: 18,  p90: 32,  heightFactor: true,  desc: 'Kétgangos kapcsoló bekötése' },
  { code: 'SZE-006', category: 'szerelvenyek', name: 'Váltókapcsoló',               unit: 'db',  p50: 20,  p90: 35,  heightFactor: true,  desc: 'Váltókapcsoló + plusz kábel hozzárendelés' },
  { code: 'SZE-007', category: 'szerelvenyek', name: 'Termosztát',                  unit: 'db',  p50: 25,  p90: 45,  heightFactor: true,  desc: 'Digitális termosztát bek.+programozás' },
  { code: 'SZE-008', category: 'szerelvenyek', name: 'Mozgásérzékelő',             unit: 'db',  p50: 30,  p90: 50,  heightFactor: true,  desc: 'Mozgásérzékelő bek.+beállítás' },
  { code: 'SZE-009', category: 'szerelvenyek', name: 'Csengő / ajtóhívó',          unit: 'db',  p50: 20,  p90: 35,  heightFactor: false, desc: 'Csengő szerelése, bekötése' },

  // ─── VILÁGÍTÁS ────────────────────────────────────────────────────────────
  { code: 'VIL-001', category: 'vilagitas',    name: 'Lámpatest mennyezeti (alap)', unit: 'db',  p50: 20,  p90: 38,  heightFactor: true,  desc: 'Mennyezetire szerelés, bekötés, dugalj/csatlakozó' },
  { code: 'VIL-002', category: 'vilagitas',    name: 'Lámpatest süllyesztett',      unit: 'db',  p50: 25,  p90: 45,  heightFactor: true,  desc: 'Downlight, GK vágás, rögzítés, bekötés' },
  { code: 'VIL-003', category: 'vilagitas',    name: 'Lámpatest fali',              unit: 'db',  p50: 22,  p90: 40,  heightFactor: true,  desc: 'Fali lámpa, doboz + szerelvény + bekötés' },
  { code: 'VIL-004', category: 'vilagitas',    name: 'Reflektor (kültéri/ipari)',   unit: 'db',  p50: 35,  p90: 65,  heightFactor: true,  desc: 'Ipari reflektor rögzítés, tömített bekötés' },
  { code: 'VIL-005', category: 'vilagitas',    name: 'LED szalag (m)',              unit: 'm',   p50: 12,  p90: 22,  heightFactor: true,  desc: 'LED szalag felragasztás, tápbekötés' },
  { code: 'VIL-006', category: 'vilagitas',    name: 'Vészvilágítás',              unit: 'db',  p50: 35,  p90: 60,  heightFactor: true,  desc: 'Vészvilágítás rögzítés, bekötés, teszt' },

  // ─── KÁBELTÁLCA ───────────────────────────────────────────────────────────
  { code: 'TAL-001', category: 'kabeltalca',   name: 'Kábeltálca 100×60',           unit: 'm',   p50: 12,  p90: 22,  heightFactor: true,  desc: 'Tartók + tálca + fedél szerelése' },
  { code: 'TAL-002', category: 'kabeltalca',   name: 'Kábeltálca 200×60',           unit: 'm',   p50: 14,  p90: 25,  heightFactor: true,  desc: 'Tartók + tálca + fedél szerelése' },
  { code: 'TAL-003', category: 'kabeltalca',   name: 'Kábeltálca 300×60',           unit: 'm',   p50: 16,  p90: 28,  heightFactor: true,  desc: 'Tartók + tálca + fedél szerelése' },
  { code: 'TAL-004', category: 'kabeltalca',   name: 'Kábeltálca 400×60',           unit: 'm',   p50: 18,  p90: 32,  heightFactor: true,  desc: 'Tartók + tálca + fedél szerelése' },
  { code: 'TAL-005', category: 'kabeltalca',   name: 'Kábeltálca 500×60',           unit: 'm',   p50: 20,  p90: 36,  heightFactor: true,  desc: 'Tartók + tálca + fedél szerelése' },
  { code: 'TAL-006', category: 'kabeltalca',   name: 'Kábeltálca 600×60',           unit: 'm',   p50: 22,  p90: 40,  heightFactor: true,  desc: 'Tartók + tálca + fedél szerelése' },
  { code: 'TAL-007', category: 'kabeltalca',   name: 'Kábeltálca ív / kanyar',      unit: 'db',  p50: 20,  p90: 35,  heightFactor: true,  desc: 'Ívdarab + tartó szerelése' },
  { code: 'TAL-008', category: 'kabeltalca',   name: 'Kábel spirálcső (m)',         unit: 'm',   p50: 6,   p90: 12,  heightFactor: false, desc: 'Flexibilis cső fektetés, rögzítés' },

  // ─── ELOSZTÓK / VÉDELEM ───────────────────────────────────────────────────
  { code: 'ELO-001', category: 'elosztok',     name: 'Kismegszakító beépítés',      unit: 'db',  p50: 8,   p90: 15,  heightFactor: false, desc: 'MCB bek. sínre, kábel bekötés, jelölés' },
  { code: 'ELO-002', category: 'elosztok',     name: 'FI-relé beépítés',            unit: 'db',  p50: 15,  p90: 25,  heightFactor: false, desc: 'RCD bek. sínre, kábel bekötés, jelölés' },
  { code: 'ELO-003', category: 'elosztok',     name: 'Elosztó tábla (kicsi, 12M)',  unit: 'db',  p50: 90,  p90: 160, heightFactor: false, desc: 'Falon kívüli tábla szerelés, sín, N/PE sín, ajtó' },
  { code: 'ELO-004', category: 'elosztok',     name: 'Elosztó tábla (közepes, 24M)',unit: 'db',  p50: 150, p90: 270, heightFactor: false, desc: 'Süllyesztett tábla, komplett felszerelés' },
  { code: 'ELO-005', category: 'elosztok',     name: 'Elosztó tábla (nagy, 36M+)', unit: 'db',  p50: 240, p90: 420, heightFactor: false, desc: 'Nagy tábla szerelés, betáblázás, jelölés' },
  { code: 'ELO-006', category: 'elosztok',     name: 'Táblán belüli bekötés',       unit: 'db',  p50: 6,   p90: 12,  heightFactor: false, desc: 'Egy kábel bekötése a táblán belül' },
  { code: 'ELO-007', category: 'elosztok',     name: 'Motorvédő relé',              unit: 'db',  p50: 20,  p90: 35,  heightFactor: false, desc: 'Motorvédő beépítés, bekötés, beállítás' },
  { code: 'ELO-008', category: 'elosztok',     name: 'Kontaktor beépítés',          unit: 'db',  p50: 18,  p90: 32,  heightFactor: false, desc: 'Kontaktor sínre, bekötés (vezérlés NEM benne)' },

  // ─── MÉRÉSI CSOMAG ────────────────────────────────────────────────────────
  { code: 'MER-001', category: 'meres',        name: 'Érintésvédelmi mérés (kör)',  unit: 'db',  p50: 8,   p90: 15,  heightFactor: false, desc: 'Egy áramkör érintésvédelmi mérése, dokumentálás' },
  { code: 'MER-002', category: 'meres',        name: 'Szigetelési mérés (kör)',     unit: 'db',  p50: 5,   p90: 10,  heightFactor: false, desc: 'Egy áramkör szigetelési mérése' },
  { code: 'MER-003', category: 'meres',        name: 'FI érzékenységi mérés',       unit: 'db',  p50: 5,   p90: 8,   heightFactor: false, desc: 'RCD kioldóáram mérése' },
  { code: 'MER-004', category: 'meres',        name: 'Mérési dokumentáció',         unit: 'db',  p50: 60,  p90: 90,  heightFactor: false, desc: 'Teljes mérési jkv. + átadási dok.' },

  // ─── GYENGEÁRAM ───────────────────────────────────────────────────────────
  { code: 'GYE-001', category: 'gyengaram',    name: 'Adatkábel Cat6 (m)',          unit: 'm',   p50: 5,   p90: 10,  heightFactor: true,  desc: 'Cat6 kábel fektetés, csőben/tálcán' },
  { code: 'GYE-002', category: 'gyengaram',    name: 'Adataljzat (RJ45)',           unit: 'db',  p50: 20,  p90: 35,  heightFactor: true,  desc: 'RJ45 aljzat szerelés, patchelés' },
  { code: 'GYE-003', category: 'gyengaram',    name: 'Patch panel (24 port)',       unit: 'db',  p50: 90,  p90: 150, heightFactor: false, desc: 'Patch panel rack-be, patchelés, jelölés' },
  { code: 'GYE-004', category: 'gyengaram',    name: 'TV aljzat',                   unit: 'db',  p50: 18,  p90: 30,  heightFactor: true,  desc: 'Koax aljzat szerelés, bekötés' },
  { code: 'GYE-005', category: 'gyengaram',    name: 'Kaputelefon egység',          unit: 'db',  p50: 45,  p90: 80,  heightFactor: false, desc: 'Kaputelefon szerelés, bekötés, teszt' },
  { code: 'GYE-006', category: 'gyengaram',    name: 'Füstérzékelő',               unit: 'db',  p50: 15,  p90: 25,  heightFactor: true,  desc: 'Füstérzékelő rögzítés, bekötés' },
]

// ─── Assembly definíciók v2.1 ──────────────────────────────────────────────
// Önálló entitások saját azonosítóval
// itemType: 'material' (anyag) | 'workitem' (munkatétel)
export const ASSEMBLIES_DEFAULT = [
  {
    id: 'ASM-001',
    name: 'Dugalj teljes bekötés',
    category: 'szerelvenyek',
    description: 'Dugalj 2P+F komplett: doboz, szerelvény, fedőlap, kábel ráhagyás',
    components: [
      { itemCode: 'MAT-001', itemType: 'material', name: 'Szerelvénydoboz 65mm (mélyített)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'SZE-001', itemType: 'workitem', name: 'Dugalj 2P+F (alap)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-010', itemType: 'material', name: 'Dugalj 2P+F (fehér, alap)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 1, sortOrder: 3 },
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5 (ráhagyás)', unit: 'm', qty: 0.3, sortOrder: 4 },
    ],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-002',
    name: 'Kapcsoló teljes bekötés',
    category: 'szerelvenyek',
    description: 'Kapcsoló 1G komplett: doboz, szerelvény, fedőlap, kábel ráhagyás',
    components: [
      { itemCode: 'MAT-002', itemType: 'material', name: 'Szerelvénydoboz 65mm (normál)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'SZE-004', itemType: 'workitem', name: 'Kapcsoló 1G', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-012', itemType: 'material', name: 'Kapcsoló 1G (fehér)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 1, sortOrder: 3 },
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5 (ráhagyás)', unit: 'm', qty: 0.3, sortOrder: 4 },
    ],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-003',
    name: 'Lámpatest mennyezeti bekötés',
    category: 'vilagitas',
    description: 'Mennyezeti lámpatest komplett: tartódoboz, konzol, kábel, WAGO',
    components: [
      { itemCode: 'MAT-003', itemType: 'material', name: 'Kötődoboz 80×80mm', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'VIL-001', itemType: 'workitem', name: 'Lámpatest mennyezeti (alap)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5 (ráhagyás)', unit: 'm', qty: 0.5, sortOrder: 2 },
    ],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
]

// Assembly ID generátor
export function generateAssemblyId(assemblies) {
  const nums = assemblies.map(a => {
    const m = a.id?.match(/ASM-(\d+)/)
    return m ? parseInt(m[1]) : 0
  })
  const next = Math.max(0, ...nums) + 1
  return `ASM-${String(next).padStart(3, '0')}`
}

// ─── Kontextus szorzók ───────────────────────────────────────────────────────
export const CONTEXT_FACTORS = {
  wall_material: {
    label: 'Falanyag',
    options: [
      { key: 'drywall',  label: 'Gipszkarton',  factor: 0.8,  icon: '🟡' },
      { key: 'brick',    label: 'Tégla',         factor: 1.0,  icon: '🟠' },
      { key: 'concrete', label: 'Beton',         factor: 1.4,  icon: '🔴' },
      { key: 'ytong',    label: 'Ytong',         factor: 0.9,  icon: '🟡' },
    ]
  },
  access: {
    label: 'Hozzáférhetőség',
    options: [
      { key: 'empty',      label: 'Üres helyiség',    factor: 1.0,  icon: '🟢' },
      { key: 'occupied',   label: 'Berendezett',       factor: 1.15, icon: '🟡' },
      { key: 'restricted', label: 'Nehéz hozzáférés', factor: 1.3,  icon: '🔴' },
    ]
  },
  project_type: {
    label: 'Projekt típus',
    options: [
      { key: 'new_build',   label: 'Új építés',     factor: 0.9,  icon: '🟢' },
      { key: 'renovation',  label: 'Felújítás',     factor: 1.35, icon: '🟡' },
      { key: 'industrial',  label: 'Ipari',         factor: 1.5,  icon: '🔴' },
    ]
  },
  height: {
    label: 'Munkavégzési magasság',
    options: [
      { key: 'normal',    label: 'Normál (< 2.5m)', factor: 1.0,  icon: '🟢' },
      { key: 'ladder',    label: 'Létra (2.5-4m)',  factor: 1.35, icon: '🟡' },
      { key: 'scaffold',  label: 'Állvány (4m+)',   factor: 1.7,  icon: '🔴' },
    ]
  }
}
