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
  { key: 'tuzjelzo',    label: 'Tűzjelző / Tűzvédelem', icon: '🔥', color: '#E63946' },
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
  { code: 'GYE-007', category: 'gyengaram',    name: 'WiFi AP felszerelés',         unit: 'db',  p50: 25,  p90: 45,  heightFactor: true,  desc: 'Mennyezeti/fali AP rögzítés, PoE bekötés' },
  { code: 'GYE-008', category: 'gyengaram',    name: 'Kamerarendszer pont',         unit: 'db',  p50: 35,  p90: 60,  heightFactor: true,  desc: 'IP kamera rögzítés, kábel bekötés, PoE' },
  { code: 'GYE-009', category: 'gyengaram',    name: 'Riasztó mozgásérzékelő',      unit: 'db',  p50: 20,  p90: 35,  heightFactor: true,  desc: 'PIR érzékelő rögzítés, vezetékezés' },
  { code: 'GYE-010', category: 'gyengaram',    name: 'Riasztó központ bekötés',      unit: 'db',  p50: 120, p90: 200, heightFactor: false, desc: 'Riasztó központ szerelés, zónák bekötése, programozás' },

  // ─── BONTÁS KIEGÉSZÍTÉS ──────────────────────────────────────────────────
  { code: 'BON-005', category: 'bontas',       name: 'Védőcső bontás',              unit: 'm',   p50: 4,   p90: 8,   heightFactor: false, desc: 'Régi PVC/fém védőcső eltávolítása' },
  { code: 'BON-006', category: 'bontas',       name: 'Kötődoboz bontás',            unit: 'db',  p50: 6,   p90: 12,  heightFactor: false, desc: 'Régi kötődoboz leszedése, kábelvég szigetelése' },
  { code: 'BON-007', category: 'bontas',       name: 'Régi érintésvédelem bontás',  unit: 'db',  p50: 45,  p90: 80,  heightFactor: false, desc: 'Régi EPH háló, sín, kötések bontása' },

  // ─── NYOMVONAL KIEGÉSZÍTÉS ───────────────────────────────────────────────
  { code: 'NYO-007', category: 'nyomvonal',    name: 'Betonba vésés (flex)',         unit: 'm',   p50: 20,  p90: 40,  heightFactor: false, desc: 'Beton fal/mennyezet vésés flexszel/vágóval' },
  { code: 'NYO-008', category: 'nyomvonal',    name: 'Áttörés készítés (fal)',       unit: 'db',  p50: 15,  p90: 30,  heightFactor: false, desc: 'Fal áttörés D50-D100, fúrás+tömítés' },
  { code: 'NYO-009', category: 'nyomvonal',    name: 'Áttörés készítés (födém)',     unit: 'db',  p50: 25,  p90: 50,  heightFactor: false, desc: 'Födém áttörés D50-D100, mag.fúrás+tömítés' },
  { code: 'NYO-010', category: 'nyomvonal',    name: 'Gégecső fektetés',             unit: 'm',   p50: 6,   p90: 12,  heightFactor: true,  desc: 'Flexibilis gégecső lefektetés, rögzítés' },

  // ─── DOBOZOLÁS KIEGÉSZÍTÉS ───────────────────────────────────────────────
  { code: 'DOB-006', category: 'dobozolas',    name: 'Dupla doboz (beton)',          unit: 'db',  p50: 35,  p90: 65,  heightFactor: true,  desc: '2×doboz egymás mellé betonba, keret illesztés' },
  { code: 'DOB-007', category: 'dobozolas',    name: 'Falon kívüli doboz',          unit: 'db',  p50: 10,  p90: 18,  heightFactor: true,  desc: 'Felületre szerelt doboz rögzítése' },

  // ─── KÁBELEZÉS KIEGÉSZÍTÉS ───────────────────────────────────────────────
  { code: 'KAB-011', category: 'kabelezes',    name: 'Kábel NYY-J 5×25',            unit: 'm',   p50: 20,  p90: 38,  heightFactor: true,  desc: 'Fővezeték fektetés, nagy keresztmetszet' },
  { code: 'KAB-012', category: 'kabelezes',    name: 'Kábel földbe (NYY, homokágy)', unit: 'm',   p50: 8,   p90: 15,  heightFactor: false, desc: 'Földkábel fektetés homokágyba, fólia, jelzés' },
  { code: 'KAB-013', category: 'kabelezes',    name: 'Kábel csőbe húzás (meglévő)', unit: 'm',   p50: 6,   p90: 12,  heightFactor: false, desc: 'Kábel meglévő védőcsőbe húzása, kenés' },

  // ─── KÖTÉS KIEGÉSZÍTÉS ───────────────────────────────────────────────────
  { code: 'KOT-006', category: 'kotesek',      name: 'WAGO kötés készítés',         unit: 'db',  p50: 3,   p90: 5,   heightFactor: false, desc: 'Egy WAGO csatlakozó készítése (csupaszítás+kötés)' },
  { code: 'KOT-007', category: 'kotesek',      name: 'Sorkapocs bekötés',           unit: 'db',  p50: 5,   p90: 10,  heightFactor: false, desc: 'Egy ér sorkapocsra kötése, jelölés' },
  { code: 'KOT-008', category: 'kotesek',      name: 'Kábelsaru préselés',          unit: 'db',  p50: 4,   p90: 8,   heightFactor: false, desc: 'Kábelsaru felhelyezés hidraulikus préssel' },

  // ─── SZERELVÉNYEZÉS KIEGÉSZÍTÉS ──────────────────────────────────────────
  { code: 'SZE-010', category: 'szerelvenyek', name: 'Dupla dugalj keret',          unit: 'db',  p50: 25,  p90: 42,  heightFactor: true,  desc: '2 dugalj egy keretben, dupla bekötés' },
  { code: 'SZE-011', category: 'szerelvenyek', name: 'Redőnykapcsoló',              unit: 'db',  p50: 22,  p90: 38,  heightFactor: true,  desc: 'Motoros redőny kapcsoló bekötés + beállítás' },
  { code: 'SZE-012', category: 'szerelvenyek', name: 'Dimmer',                      unit: 'db',  p50: 22,  p90: 38,  heightFactor: true,  desc: 'Dimmer kapcsoló bekötés, terhelés ellenőrzés' },

  // ─── ELOSZTÓ KIEGÉSZÍTÉS ─────────────────────────────────────────────────
  { code: 'ELO-009', category: 'elosztok',     name: 'Túlfeszültség-védő',          unit: 'db',  p50: 12,  p90: 20,  heightFactor: false, desc: 'SPD beépítés DIN sínre, bekötés' },
  { code: 'ELO-010', category: 'elosztok',     name: 'Időrelé beépítés',            unit: 'db',  p50: 15,  p90: 25,  heightFactor: false, desc: 'Időrelé beépítés, programozás (lépcsőházi stb.)' },
  { code: 'ELO-011', category: 'elosztok',     name: 'Áramváltó beépítés',          unit: 'db',  p50: 20,  p90: 35,  heightFactor: false, desc: 'Mérőáramváltó beépítés, bekötés' },
  { code: 'ELO-012', category: 'elosztok',     name: 'Főkapcsoló beépítés',         unit: 'db',  p50: 15,  p90: 25,  heightFactor: false, desc: 'Főkapcsoló/leválasztó DIN sínre, bekötés' },

  // ─── VILÁGÍTÁS KIEGÉSZÍTÉS ───────────────────────────────────────────────
  { code: 'VIL-007', category: 'vilagitas',    name: 'LED panel 60×60',             unit: 'db',  p50: 30,  p90: 50,  heightFactor: true,  desc: 'LED panel álmennyezetbe, keret + bekötés' },
  { code: 'VIL-008', category: 'vilagitas',    name: 'Kültéri lámpa (IP65)',        unit: 'db',  p50: 30,  p90: 55,  heightFactor: true,  desc: 'Kültéri lámpatest rögzítés, tömített bekötés' },

  // ─── MÉRÉS KIEGÉSZÍTÉS ───────────────────────────────────────────────────
  { code: 'MER-005', category: 'meres',        name: 'Feszültségpróba (komplett)',   unit: 'db',  p50: 45,  p90: 75,  heightFactor: false, desc: 'Komplett feszültségpróba: feszültség alá helyezés, FI teszt, fázisellenőrzés' },
  { code: 'MER-006', category: 'meres',        name: 'Hurokimpedancia mérés',       unit: 'db',  p50: 5,   p90: 10,  heightFactor: false, desc: 'Hurokimpedancia mérés áramkörönként' },

  // ─── GYENGEÁRAM BŐVÍTÉS (hálózat, biztonság, rendszer) ──────────────────
  { code: 'GYE-011', category: 'gyengaram',    name: 'Adatpont Cat6A szerelés',     unit: 'db',  p50: 25,  p90: 40,  heightFactor: true,  desc: 'Cat6A keystone aljzat, árnyékolt, mérés' },
  { code: 'GYE-012', category: 'gyengaram',    name: 'Üvegszálas (OM3/OM4) végződtetés', unit: 'db', p50: 40, p90: 65,  heightFactor: false, desc: 'SC/LC csatlakozó hegesztés/mechanikus, mérés OTDR' },
  { code: 'GYE-013', category: 'gyengaram',    name: 'IP intercom egység',          unit: 'db',  p50: 35,  p90: 60,  heightFactor: true,  desc: 'SIP alapú kaputelefon/intercom, PoE, konfiguráció' },
  { code: 'GYE-014', category: 'gyengaram',    name: 'PA / hangosítás pont',        unit: 'db',  p50: 30,  p90: 50,  heightFactor: true,  desc: 'Mennyezeti hangszóró + 100V vonal bekötés' },
  { code: 'GYE-015', category: 'gyengaram',    name: 'Riasztó nyitásérzékelő',      unit: 'db',  p50: 15,  p90: 25,  heightFactor: false, desc: 'Mágneses nyitásérzékelő ajtóra/ablakra, bekötés' },
  { code: 'GYE-016', category: 'gyengaram',    name: 'Beléptetés kártyaolvasó',     unit: 'db',  p50: 30,  p90: 50,  heightFactor: true,  desc: 'RFID/NFC olvasó rögzítés, Wiegand bekötés' },
  { code: 'GYE-017', category: 'gyengaram',    name: 'Beléptetés kontroller',       unit: 'db',  p50: 90,  p90: 150, heightFactor: false, desc: '2-4 ajtós kontroller, zár kimenet, konfig' },
  { code: 'GYE-018', category: 'gyengaram',    name: '19" rack telepítés',          unit: 'db',  p50: 180, p90: 300, heightFactor: false, desc: 'Rack összaálítás, patch panel, switch, UPS, rendezés' },
  { code: 'GYE-019', category: 'gyengaram',    name: 'Switch 24p PoE telepítés',    unit: 'db',  p50: 45,  p90: 75,  heightFactor: false, desc: 'Rack-be, patchelés, VLAN alapkonfig' },
  { code: 'GYE-020', category: 'gyengaram',    name: 'UPS rackmount telepítés',     unit: 'db',  p50: 60,  p90: 100, heightFactor: false, desc: 'UPS rack-be, bekötés, teszt, monitoring' },
  { code: 'GYE-021', category: 'gyengaram',    name: 'DIN tápegység szerelés',      unit: 'db',  p50: 20,  p90: 35,  heightFactor: false, desc: '24V/12V tápegység DIN sínre, bekötés' },
  { code: 'GYE-022', category: 'gyengaram',    name: 'Kültéri kábel fektetés (földbe)', unit: 'm', p50: 12, p90: 20,  heightFactor: false, desc: 'Kültéri kábel védőcsőbe, homokágy, jelzés' },
  { code: 'GYE-023', category: 'gyengaram',    name: 'Villámvédelem EPH összekötés',unit: 'db',  p50: 45,  p90: 75,  heightFactor: false, desc: 'Épületen kívüli EPH, villámvédelmi csatlakozás' },
  { code: 'GYE-024', category: 'gyengaram',    name: 'EPH gyengeáram rendezés',     unit: 'db',  p50: 30,  p90: 50,  heightFactor: false, desc: 'Gyengeáramú EPH sín, gyűjtősín bekötés' },

  // ─── TŰZJELZŐ RENDSZER ──────────────────────────────────────────────────
  { code: 'TUZ-001', category: 'tuzjelzo',     name: 'Optikai füstérzékelő (címezhető)', unit: 'db', p50: 15, p90: 25, heightFactor: true,  desc: 'Címezhető optikai füstérzékelő aljzatba, cím beállítás' },
  { code: 'TUZ-002', category: 'tuzjelzo',     name: 'Hőérzékelő (címezhető)',      unit: 'db',  p50: 15,  p90: 25,  heightFactor: true,  desc: 'Fix/RoR hőérzékelő aljzatba, cím beállítás' },
  { code: 'TUZ-003', category: 'tuzjelzo',     name: 'Multiszenzoros érzékelő',     unit: 'db',  p50: 18,  p90: 30,  heightFactor: true,  desc: 'Optikai+hő kombinált érzékelő, aljzat, cím' },
  { code: 'TUZ-004', category: 'tuzjelzo',     name: 'Kézi jelzésadó',              unit: 'db',  p50: 20,  p90: 35,  heightFactor: true,  desc: 'Falra, süllyesztett/falon kívüli, fedél, bekötés' },
  { code: 'TUZ-005', category: 'tuzjelzo',     name: 'Hang-fényjelző (sziréna)',    unit: 'db',  p50: 25,  p90: 40,  heightFactor: true,  desc: 'Címezhető hangjelző + villogó rögzítés, bekötés' },
  { code: 'TUZ-006', category: 'tuzjelzo',     name: 'Tűzjelző hurok kábel (J-Y(St)Y)', unit: 'm', p50: 5, p90: 9, heightFactor: true,  desc: 'Tűzjelző kábel fektetés csőben/tálcán, hurok topológia' },
  { code: 'TUZ-007', category: 'tuzjelzo',     name: 'Tűzjelző központ telepítés',  unit: 'db',  p50: 240, p90: 400, heightFactor: false, desc: 'Központ rögzítés, tápbekötés, akku, hurok bekötés, program' },
  { code: 'TUZ-008', category: 'tuzjelzo',     name: 'Tűzjelző tábla kezelő',      unit: 'db',  p50: 45,  p90: 75,  heightFactor: false, desc: 'Távkezelő panel rögzítés, RS485 bekötés, program' },
  { code: 'TUZ-009', category: 'tuzjelzo',     name: 'I/O modul (bemeneti/kimeneti)', unit: 'db', p50: 25, p90: 40,  heightFactor: false, desc: 'Hurok I/O modul, relé kimenet, felügyeleti jel' },
  { code: 'TUZ-010', category: 'tuzjelzo',     name: 'Tűzgátló áttörés tömítés',   unit: 'db',  p50: 35,  p90: 60,  heightFactor: false, desc: 'EI90/EI120 tűzgátló tömítés áttörésnél, habarcs/mandzsetta' },
  { code: 'TUZ-011', category: 'tuzjelzo',     name: 'Érzékelő aljzat előkészítés',unit: 'db',  p50: 8,   p90: 15,  heightFactor: true,  desc: 'Aljzat felszerelés mennyezetre, kábel bevezető' },
  { code: 'TUZ-012', category: 'tuzjelzo',     name: 'Tűzjelző rendszer programozás (zóna)', unit: 'db', p50: 15, p90: 25, heightFactor: false, desc: 'Egy zóna programozása: eszköz cím, jellemzők, csoportok' },
  { code: 'TUZ-013', category: 'tuzjelzo',     name: 'Tűzjelző üzembe helyezés + próba', unit: 'db', p50: 120, p90: 200, heightFactor: false, desc: 'Komplett rendszer üzembe helyezés: hurok teszt, sziréna teszt, jegyzőkönyv' },
]

// ─── Assembly definíciók v3.0 ──────────────────────────────────────────────
// Önálló entitások saját azonosítóval
// itemType: 'material' (anyag) | 'workitem' (munkatétel)
// 36 komplett assembly – profi magyar villanyszerelői sablonok
export const ASSEMBLIES_DEFAULT = [

  // ══════════════════════════════════════════════════════════════════════
  // SZERELVÉNYEZÉS
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ASM-001',
    name: 'Dugalj 2P+F alap (komplett)',
    category: 'szerelvenyek',
    description: 'Süllyesztett dugalj komplett: mélyített doboz, dugalj, fedőlap, kábel ráhagyás. Leggyakoribb egység lakásfelújításhoz.',
    components: [
      { itemCode: 'MAT-001', itemType: 'material', name: 'Szerelvénydoboz 65mm (mélyített)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-010', itemType: 'material', name: 'Dugalj 2P+F (fehér, alap)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 0.3, waste_pct: 15, sortOrder: 3 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 2, sortOrder: 4 },
      { itemCode: 'SZE-001', itemType: 'workitem', name: 'Dugalj 2P+F (alap) szerelése', unit: 'db', qty: 1, sortOrder: 5 },
    ],
    variants: [
      { key: 'alap', label: 'Alap 2P+F', isDefault: true, description: 'Standard fehér süllyesztett dugalj' },
      { key: 'ip44', label: 'IP44 nedves', isDefault: false, description: 'Fürdőszoba, konyha, kültéri', refId: 'ASM-004' },
      { key: 'dupla', label: 'Dupla (2×2P+F)', isDefault: false, description: 'Kettős dugalj egy keretben', refId: 'ASM-005' },
      { key: 'cee_16a', label: 'CEE 16A (1F)', isDefault: false, description: 'Ipari egyfázisú', refId: 'ASM-011' },
      { key: 'cee_32a', label: 'CEE 32A (3F)', isDefault: false, description: 'Ipari háromfázisú', refId: 'ASM-012' },
    ],
    tags: ['dugalj', 'szerelvény', 'lakás', 'alap'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-002',
    name: 'Kapcsoló 1G (komplett)',
    category: 'szerelvenyek',
    description: 'Egygangos nyomókapcsoló komplett: normál doboz, kapcsoló, fedőlap, kábel ráhagyás.',
    components: [
      { itemCode: 'MAT-002', itemType: 'material', name: 'Szerelvénydoboz 65mm (normál)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-012', itemType: 'material', name: 'Kapcsoló 1G (fehér)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.3, waste_pct: 15, sortOrder: 3 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 2, sortOrder: 4 },
      { itemCode: 'SZE-004', itemType: 'workitem', name: 'Kapcsoló 1G szerelése', unit: 'db', qty: 1, sortOrder: 5 },
    ],
    variants: [
      { key: '1g', label: '1 gangos', isDefault: true, description: 'Egygangos nyomókapcsoló' },
      { key: '2g', label: '2 gangos', isDefault: false, description: 'Kétgangos (2 kör)', refId: 'ASM-006' },
      { key: 'valto', label: 'Váltó (2 helyes)', isDefault: false, description: '2 helyes kapcsolás', refId: 'ASM-007' },
      { key: 'mozgas', label: 'Mozgásérzékelős', isDefault: false, description: 'PIR szenzoros', refId: 'ASM-008' },
      { key: 'termostat', label: 'Termosztát', isDefault: false, description: 'Digitális programozható', refId: 'ASM-010' },
    ],
    tags: ['kapcsoló', 'szerelvény', 'lakás'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-004',
    name: 'Dugalj IP44 (nedves helyiség)',
    category: 'szerelvenyek',
    description: 'IP44 védett dugalj komplett: mélyített doboz, IP44 dugalj, tömítőkeret. Fürdőszoba, konyha, külső falak.',
    components: [
      { itemCode: 'MAT-001', itemType: 'material', name: 'Szerelvénydoboz 65mm (mélyített)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-011', itemType: 'material', name: 'Dugalj 2P+F IP44', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 0.3, waste_pct: 15, sortOrder: 2 },
      { itemCode: 'MAT-083', itemType: 'material', name: 'Kábeltömítő M20', unit: 'db', qty: 1, sortOrder: 3 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 2, sortOrder: 4 },
      { itemCode: 'SZE-002', itemType: 'workitem', name: 'Dugalj 2P+F IP44 szerelése', unit: 'db', qty: 1, sortOrder: 5 },
    ],
    variantOf: 'ASM-001',
    tags: ['dugalj', 'IP44', 'nedves'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-005',
    name: 'Dupla dugalj (2×2P+F)',
    category: 'szerelvenyek',
    description: 'Kettős dugalj egy keretben: 2 mélyített doboz, 2 dugalj, dupla fedőkeret. Hálószoba, konyha standard.',
    components: [
      { itemCode: 'MAT-001', itemType: 'material', name: 'Szerelvénydoboz 65mm (mélyített)', unit: 'db', qty: 2, sortOrder: 0 },
      { itemCode: 'MAT-010', itemType: 'material', name: 'Dugalj 2P+F (fehér, alap)', unit: 'db', qty: 2, sortOrder: 1 },
      { itemCode: 'MAT-095', itemType: 'material', name: 'Dupla dugalj keret (2×2P+F)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 0.5, waste_pct: 15, sortOrder: 3 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 3, sortOrder: 4 },
      { itemCode: 'SZE-001', itemType: 'workitem', name: 'Dugalj 2P+F szerelése', unit: 'db', qty: 2, sortOrder: 5 },
    ],
    variantOf: 'ASM-001',
    tags: ['dugalj', 'dupla', 'keret'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-006',
    name: 'Kapcsoló 2G (komplett)',
    category: 'szerelvenyek',
    description: 'Kétgangos kapcsoló (2 kör, 1 dobozból): normál doboz, 2G kapcsoló, fedőlap.',
    components: [
      { itemCode: 'MAT-002', itemType: 'material', name: 'Szerelvénydoboz 65mm (normál)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-013', itemType: 'material', name: 'Kapcsoló 2G (fehér)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.5, waste_pct: 15, sortOrder: 3 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 3, sortOrder: 4 },
      { itemCode: 'SZE-005', itemType: 'workitem', name: 'Kapcsoló 2G szerelése', unit: 'db', qty: 1, sortOrder: 5 },
    ],
    variantOf: 'ASM-002',
    tags: ['kapcsoló', '2G', 'dupla'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-007',
    name: 'Váltókapcsoló pár (2 helyes kapcsolás)',
    category: 'szerelvenyek',
    description: '2 helyes kapcsolás: 2 váltókapcsoló, 2 doboz, 2 fedőlap + összekötő kábel ráhagyás. Lépcsőfordulók, folyosók.',
    components: [
      { itemCode: 'MAT-002', itemType: 'material', name: 'Szerelvénydoboz 65mm (normál)', unit: 'db', qty: 2, sortOrder: 0 },
      { itemCode: 'MAT-014', itemType: 'material', name: 'Váltókapcsoló (fehér)', unit: 'db', qty: 2, sortOrder: 1 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 2, sortOrder: 2 },
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 1.0, waste_pct: 15, sortOrder: 3 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 4, sortOrder: 4 },
      { itemCode: 'SZE-006', itemType: 'workitem', name: 'Váltókapcsoló szerelése', unit: 'db', qty: 2, sortOrder: 5 },
    ],
    variantOf: 'ASM-002',
    tags: ['kapcsoló', 'váltó', 'lépcsőház'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-008',
    name: 'Mozgásérzékelős kapcsoló',
    category: 'szerelvenyek',
    description: 'PIR mozgásérzékelős kapcsoló komplett: mélyített doboz, szenzoros kapcsoló, fedőlap. Folyosó, garázs.',
    components: [
      { itemCode: 'MAT-001', itemType: 'material', name: 'Szerelvénydoboz 65mm (mélyített)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-090', itemType: 'material', name: 'Mozgásérzékelős kapcsoló 230V', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.3, waste_pct: 15, sortOrder: 3 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 2, sortOrder: 4 },
      { itemCode: 'SZE-008', itemType: 'workitem', name: 'Mozgásérzékelő szerelése+beállítása', unit: 'db', qty: 1, sortOrder: 5 },
    ],
    variantOf: 'ASM-002',
    tags: ['kapcsoló', 'mozgásérzékelő', 'PIR'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-009',
    name: 'Csengő rendszer (nyomógomb + egység)',
    category: 'szerelvenyek',
    description: 'Bejárati csengő komplett: nyomógomb dobozzal, csengő egység, összekötő kábel, bekötés.',
    components: [
      { itemCode: 'MAT-002', itemType: 'material', name: 'Szerelvénydoboz 65mm (normál)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-092', itemType: 'material', name: 'Csengő nyomógomb (fehér)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-093', itemType: 'material', name: 'Elektronikus csengő 230V', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-094', itemType: 'material', name: 'Kábel 2×0.75mm² (csengőkábel)', unit: 'm', qty: 5, waste_pct: 15, sortOrder: 3 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 1, sortOrder: 4 },
      { itemCode: 'SZE-009', itemType: 'workitem', name: 'Csengő/ajtóhívó szerelése', unit: 'db', qty: 1, sortOrder: 5 },
    ],
    tags: ['csengő', 'ajtóhívó', 'bejárat'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-010',
    name: 'Digitális termosztát (komplett)',
    category: 'szerelvenyek',
    description: 'Szobatermosztát bekötés: mélyített doboz, programozható termosztát, bekötés + programozás.',
    components: [
      { itemCode: 'MAT-001', itemType: 'material', name: 'Szerelvénydoboz 65mm (mélyített)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-091', itemType: 'material', name: 'Digitális programozható termosztát 230V', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.3, waste_pct: 15, sortOrder: 2 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 2, sortOrder: 3 },
      { itemCode: 'SZE-007', itemType: 'workitem', name: 'Termosztát bekötés+programozás', unit: 'db', qty: 1, sortOrder: 4 },
    ],
    variantOf: 'ASM-002',
    tags: ['termosztát', 'fűtés', 'hőszabályozás'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-011',
    name: 'CEE 16A ipari dugalj (1 fázis)',
    category: 'szerelvenyek',
    description: 'Ipari CEE 16A egyfázisú dugalj: IP44 CEE szerelvény, bekötés. Garázsok, műhelyek, mosógép-mosogatógép körök.',
    components: [
      { itemCode: 'MAT-050', itemType: 'material', name: 'CEE dugalj 1P+N+F 16A (IP44)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 0.5, waste_pct: 15, sortOrder: 1 },
      { itemCode: 'MAT-083', itemType: 'material', name: 'Kábeltömítő M20', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-004', itemType: 'material', name: 'Kötődoboz 100×100mm', unit: 'db', qty: 1, sortOrder: 3 },
      { itemCode: 'SZE-003', itemType: 'workitem', name: 'Ipari dugalj szerelése', unit: 'db', qty: 1, sortOrder: 4 },
    ],
    variantOf: 'ASM-001',
    tags: ['dugalj', 'CEE', 'ipari', '16A'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-012',
    name: 'CEE 32A ipari dugalj (3 fázis)',
    category: 'szerelvenyek',
    description: 'Háromfázisú ipari CEE 32A dugalj: IP44, 5-pólusú. Villanytűzhely, nagy gépek, ipari berendezések.',
    components: [
      { itemCode: 'MAT-053', itemType: 'material', name: 'CEE dugalj 3P+N+F 32A (IP44)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-023', itemType: 'material', name: 'NYY-J 5×2.5', unit: 'm', qty: 0.5, waste_pct: 15, sortOrder: 1 },
      { itemCode: 'MAT-083', itemType: 'material', name: 'Kábeltömítő M20', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-004', itemType: 'material', name: 'Kötődoboz 100×100mm', unit: 'db', qty: 1, sortOrder: 3 },
      { itemCode: 'SZE-003', itemType: 'workitem', name: 'Ipari dugalj szerelése', unit: 'db', qty: 1, sortOrder: 4 },
    ],
    variantOf: 'ASM-001',
    tags: ['dugalj', 'CEE', 'ipari', '32A', '3F'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ══════════════════════════════════════════════════════════════════════
  // VILÁGÍTÁS
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ASM-003',
    name: 'Mennyezeti lámpatest (komplett bekötés)',
    category: 'vilagitas',
    description: 'Mennyezeti lámpatest bekötés: kötődoboz, kábel ráhagyás, WAGO kötők. Ár a lámpatestet NEM tartalmazza.',
    components: [
      { itemCode: 'MAT-003', itemType: 'material', name: 'Kötődoboz 80×80mm', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.5, waste_pct: 15, sortOrder: 1 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 3, sortOrder: 2 },
      { itemCode: 'VIL-001', itemType: 'workitem', name: 'Lámpatest mennyezeti bekötése', unit: 'db', qty: 1, sortOrder: 3 },
    ],
    variants: [
      { key: 'mennyezeti', label: 'Mennyezeti', isDefault: true, description: 'Mennyezeti lámpatest bekötés' },
      { key: 'sullyesztett', label: 'Süllyesztett', isDefault: false, description: 'GK downlight', refId: 'ASM-013' },
      { key: 'fali', label: 'Fali', isDefault: false, description: 'Fali lámpatest', refId: 'ASM-014' },
      { key: 'led_szalag', label: 'LED szalag (5m)', isDefault: false, description: 'LED szalag rendszer', refId: 'ASM-015' },
      { key: 'vesz', label: 'Vészvilágítás', isDefault: false, description: 'Vészvilágítás egység', refId: 'ASM-016' },
      { key: 'kulteri', label: 'Kültéri reflektor', isDefault: false, description: 'IP44 reflektor', refId: 'ASM-017' },
    ],
    tags: ['lámpa', 'világítás', 'bekötés'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-013',
    name: 'Downlight süllyesztett (komplett bekötés)',
    category: 'vilagitas',
    description: 'GK-ba süllyesztett downlight: lyukkör vágás, rugós rögzítés, bekötés. Ár a lámpatestet NEM tartalmazza.',
    components: [
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.4, waste_pct: 15, sortOrder: 0 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 2, sortOrder: 1 },
      { itemCode: 'VIL-002', itemType: 'workitem', name: 'Lámpatest süllyesztett (GK) szerelése', unit: 'db', qty: 1, sortOrder: 2 },
    ],
    variantOf: 'ASM-003',
    tags: ['lámpa', 'downlight', 'süllyesztett'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-014',
    name: 'Fali lámpatest (komplett bekötés)',
    category: 'vilagitas',
    description: 'Fali lámpatest bekötés: kötődoboz, kábel ráhagyás, WAGO. Folyosó, hálószoba, fürdő.',
    components: [
      { itemCode: 'MAT-003', itemType: 'material', name: 'Kötődoboz 80×80mm', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.4, waste_pct: 15, sortOrder: 1 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 2, sortOrder: 2 },
      { itemCode: 'VIL-003', itemType: 'workitem', name: 'Lámpatest fali bekötése', unit: 'db', qty: 1, sortOrder: 3 },
    ],
    variantOf: 'ASM-003',
    tags: ['lámpa', 'fali', 'folyosó'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-015',
    name: 'LED szalag rendszer (5m)',
    category: 'vilagitas',
    description: 'LED szalag komplett 5 folyóméter: alu profil, LED szalag, tápegység, kábel. Rejtett világítás, konyhapult.',
    components: [
      { itemCode: 'MAT-100', itemType: 'material', name: 'LED szalag 4000K 14W/m IP20', unit: 'm', qty: 5, sortOrder: 0 },
      { itemCode: 'MAT-102', itemType: 'material', name: 'LED szalag alumínium profil', unit: 'm', qty: 5, sortOrder: 1 },
      { itemCode: 'MAT-101', itemType: 'material', name: 'LED szalag tápegység 60W 24V', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 1.0, waste_pct: 15, sortOrder: 3 },
      { itemCode: 'MAT-003', itemType: 'material', name: 'Kötődoboz 80×80mm', unit: 'db', qty: 1, sortOrder: 4 },
      { itemCode: 'VIL-005', itemType: 'workitem', name: 'LED szalag felszerelése', unit: 'm', qty: 5, sortOrder: 5 },
    ],
    variantOf: 'ASM-003',
    tags: ['LED', 'szalag', 'rejtett'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-016',
    name: 'Vészvilágítás egység',
    category: 'vilagitas',
    description: 'Önálló vészvilágítás: egység rögzítése, bekötés, funkcionális teszt. MSZ EN 1838 követelmény szerint.',
    components: [
      { itemCode: 'MAT-103', itemType: 'material', name: 'Vészvilágítás egység 1h önálló', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.5, waste_pct: 15, sortOrder: 1 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 2, sortOrder: 2 },
      { itemCode: 'VIL-006', itemType: 'workitem', name: 'Vészvilágítás rögzítés+bekötés+teszt', unit: 'db', qty: 1, sortOrder: 3 },
    ],
    variantOf: 'ASM-003',
    tags: ['vészvilágítás', 'biztonság'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-017',
    name: 'Kültéri reflektor IP44',
    category: 'vilagitas',
    description: 'Kültéri vagy ipari reflektor felszerelése: tartórögzítés, tömített bekötés, IP44. Ár a reflektort NEM tartalmazza.',
    components: [
      { itemCode: 'MAT-004', itemType: 'material', name: 'Kötődoboz 100×100mm', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 0.5, waste_pct: 15, sortOrder: 1 },
      { itemCode: 'MAT-083', itemType: 'material', name: 'Kábeltömítő M20', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 2, sortOrder: 3 },
      { itemCode: 'VIL-004', itemType: 'workitem', name: 'Reflektor (kültéri/ipari) szerelése', unit: 'db', qty: 1, sortOrder: 4 },
    ],
    variantOf: 'ASM-003',
    tags: ['reflektor', 'kültéri', 'IP44'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ══════════════════════════════════════════════════════════════════════
  // ELOSZTÓK / VÉDELEM
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ASM-018',
    name: 'Kis elosztó 12M (komplett, 4 kör + FI)',
    category: 'elosztok',
    description: '12 modulos elosztó komplett felszerelve: tábla, DIN sín, N/PE sín, 1×FI 2P, 4×MCB 1P 16A. Kisebb lakásrész.',
    components: [
      { itemCode: 'MAT-060', itemType: 'material', name: 'Elosztótábla 12M süllyesztett', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-063', itemType: 'material', name: 'DIN sín 1m', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-064', itemType: 'material', name: 'N/PE elosztó sín', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-043', itemType: 'material', name: 'FI-relé 2P 40A 30mA', unit: 'db', qty: 1, sortOrder: 3 },
      { itemCode: 'MAT-041', itemType: 'material', name: 'Kismegszakító 1P 16A', unit: 'db', qty: 4, sortOrder: 4 },
      { itemCode: 'MAT-082', itemType: 'material', name: 'Érjelölő spirál (csomag)', unit: 'csomag', qty: 1, sortOrder: 5 },
      { itemCode: 'ELO-003', itemType: 'workitem', name: 'Elosztó tábla (kicsi, 12M) szerelése', unit: 'db', qty: 1, sortOrder: 6 },
      { itemCode: 'ELO-002', itemType: 'workitem', name: 'FI-relé beépítés', unit: 'db', qty: 1, sortOrder: 7 },
      { itemCode: 'ELO-001', itemType: 'workitem', name: 'Kismegszakító beépítés', unit: 'db', qty: 4, sortOrder: 8 },
    ],
    variants: [
      { key: '12m', label: '12M (4 kör)', isDefault: true, description: 'Kisebb lakásrész' },
      { key: '24m', label: '24M (8 kör)', isDefault: false, description: 'Kisebb lakás teljes', refId: 'ASM-019' },
      { key: '36m', label: '36M+ (12 kör)', isDefault: false, description: 'Nagyobb lakás / iroda', refId: 'ASM-020' },
    ],
    tags: ['elosztó', 'tábla', 'védelem'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-019',
    name: 'Közepes elosztó 24M (komplett, 8 kör + 2 FI)',
    category: 'elosztok',
    description: '24 modulos elosztó komplett: tábla, 2×FI 2P, 6×MCB 16A + 2×MCB 20A. Kisebb lakás teljes villamos táblája.',
    components: [
      { itemCode: 'MAT-061', itemType: 'material', name: 'Elosztótábla 24M süllyesztett', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-063', itemType: 'material', name: 'DIN sín 1m', unit: 'db', qty: 2, sortOrder: 1 },
      { itemCode: 'MAT-064', itemType: 'material', name: 'N/PE elosztó sín', unit: 'db', qty: 2, sortOrder: 2 },
      { itemCode: 'MAT-043', itemType: 'material', name: 'FI-relé 2P 40A 30mA', unit: 'db', qty: 2, sortOrder: 3 },
      { itemCode: 'MAT-041', itemType: 'material', name: 'Kismegszakító 1P 16A', unit: 'db', qty: 6, sortOrder: 4 },
      { itemCode: 'MAT-045', itemType: 'material', name: 'Kismegszakító 1P 20A', unit: 'db', qty: 2, sortOrder: 5 },
      { itemCode: 'MAT-082', itemType: 'material', name: 'Érjelölő spirál (csomag)', unit: 'csomag', qty: 1, sortOrder: 6 },
      { itemCode: 'ELO-004', itemType: 'workitem', name: 'Elosztó tábla (közepes, 24M) szerelése', unit: 'db', qty: 1, sortOrder: 7 },
      { itemCode: 'ELO-002', itemType: 'workitem', name: 'FI-relé beépítés', unit: 'db', qty: 2, sortOrder: 8 },
      { itemCode: 'ELO-001', itemType: 'workitem', name: 'Kismegszakító beépítés', unit: 'db', qty: 8, sortOrder: 9 },
    ],
    variantOf: 'ASM-018',
    tags: ['elosztó', '24M', 'lakás'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-020',
    name: 'Nagy elosztó 36M+ (komplett, 12 kör + 3 FI)',
    category: 'elosztok',
    description: '36 modulos tábla komplett: 2×FI 2P + 1×FI 4P, 8×MCB 16A + 4×MCB 20A. Nagyobb lakás / kisiroda teljes táblacsere.',
    components: [
      { itemCode: 'MAT-062', itemType: 'material', name: 'Elosztótábla 36M süllyesztett', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-063', itemType: 'material', name: 'DIN sín 1m', unit: 'db', qty: 3, sortOrder: 1 },
      { itemCode: 'MAT-064', itemType: 'material', name: 'N/PE elosztó sín', unit: 'db', qty: 3, sortOrder: 2 },
      { itemCode: 'MAT-043', itemType: 'material', name: 'FI-relé 2P 40A 30mA', unit: 'db', qty: 2, sortOrder: 3 },
      { itemCode: 'MAT-044', itemType: 'material', name: 'FI-relé 4P 40A 30mA', unit: 'db', qty: 1, sortOrder: 4 },
      { itemCode: 'MAT-041', itemType: 'material', name: 'Kismegszakító 1P 16A', unit: 'db', qty: 8, sortOrder: 5 },
      { itemCode: 'MAT-045', itemType: 'material', name: 'Kismegszakító 1P 20A', unit: 'db', qty: 4, sortOrder: 6 },
      { itemCode: 'MAT-082', itemType: 'material', name: 'Érjelölő spirál (csomag)', unit: 'csomag', qty: 2, sortOrder: 7 },
      { itemCode: 'ELO-005', itemType: 'workitem', name: 'Elosztó tábla (nagy, 36M+) szerelése', unit: 'db', qty: 1, sortOrder: 8 },
      { itemCode: 'ELO-002', itemType: 'workitem', name: 'FI-relé beépítés', unit: 'db', qty: 3, sortOrder: 9 },
      { itemCode: 'ELO-001', itemType: 'workitem', name: 'Kismegszakító beépítés', unit: 'db', qty: 12, sortOrder: 10 },
    ],
    variantOf: 'ASM-018',
    tags: ['elosztó', '36M', 'nagy'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-021',
    name: 'Egy kör bővítés táblán (MCB + bekötés)',
    category: 'elosztok',
    description: 'Meglévő táblába egy új áramkör bővítése: MCB 1P 16A beépítés, kábel bekötés, jelölés.',
    components: [
      { itemCode: 'MAT-041', itemType: 'material', name: 'Kismegszakító 1P 16A', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-082', itemType: 'material', name: 'Érjelölő spirál (csomag)', unit: 'csomag', qty: 1, sortOrder: 1 },
      { itemCode: 'ELO-001', itemType: 'workitem', name: 'Kismegszakító beépítés', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'ELO-006', itemType: 'workitem', name: 'Táblán belüli kábel bekötés', unit: 'db', qty: 2, sortOrder: 3 },
    ],
    tags: ['bővítés', 'MCB', 'elosztó'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-022',
    name: 'FI-relé bővítés (meglévő táblába)',
    category: 'elosztok',
    description: 'Meglévő táblába FI-relé utólagos beépítése: 2P 40A/30mA, sínre, kábel átvezetéssel.',
    components: [
      { itemCode: 'MAT-043', itemType: 'material', name: 'FI-relé 2P 40A 30mA', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-082', itemType: 'material', name: 'Érjelölő spirál (csomag)', unit: 'csomag', qty: 1, sortOrder: 1 },
      { itemCode: 'ELO-002', itemType: 'workitem', name: 'FI-relé beépítés', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'ELO-006', itemType: 'workitem', name: 'Táblán belüli kábel bekötés', unit: 'db', qty: 4, sortOrder: 3 },
    ],
    tags: ['FI-relé', 'bővítés', 'RCD'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ══════════════════════════════════════════════════════════════════════
  // KÁBELTÁLCA
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ASM-023',
    name: 'Kábeltálca 100mm rendszer (10m)',
    category: 'kabeltalca',
    description: '100mm széles kábeltálca 10 folyóméter: tálca + fedél + tartók. Irodai / ipari erős- és gyengeáram elválasztás.',
    components: [
      { itemCode: 'MAT-030', itemType: 'material', name: 'Kábeltálca 100×60', unit: 'm', qty: 10, sortOrder: 0 },
      { itemCode: 'MAT-104', itemType: 'material', name: 'Kábeltálca fedél 100mm', unit: 'm', qty: 10, sortOrder: 1 },
      { itemCode: 'MAT-036', itemType: 'material', name: 'Kábeltálca tartó', unit: 'db', qty: 8, sortOrder: 2 },
      { itemCode: 'MAT-084', itemType: 'material', name: 'Rugós bilincs 20mm', unit: 'db', qty: 20, sortOrder: 3 },
      { itemCode: 'TAL-001', itemType: 'workitem', name: 'Kábeltálca 100×60 szerelése', unit: 'm', qty: 10, sortOrder: 4 },
    ],
    variants: [
      { key: '100mm', label: '100mm', isDefault: true, description: 'Irodai / könnyű' },
      { key: '200mm', label: '200mm', isDefault: false, description: 'Szerver terem / gépészet', refId: 'ASM-024' },
      { key: '300mm', label: '300mm', isDefault: false, description: 'Ipari / fő ágak', refId: 'ASM-025' },
    ],
    tags: ['kábeltálca', 'ipari', 'tálca'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-024',
    name: 'Kábeltálca 200mm rendszer (10m)',
    category: 'kabeltalca',
    description: '200mm széles kábeltálca 10 folyóméter: tálca + fedél + tartók. Gépészeti szoba, szerver terem.',
    components: [
      { itemCode: 'MAT-031', itemType: 'material', name: 'Kábeltálca 200×60', unit: 'm', qty: 10, sortOrder: 0 },
      { itemCode: 'MAT-105', itemType: 'material', name: 'Kábeltálca fedél 200mm', unit: 'm', qty: 10, sortOrder: 1 },
      { itemCode: 'MAT-036', itemType: 'material', name: 'Kábeltálca tartó', unit: 'db', qty: 8, sortOrder: 2 },
      { itemCode: 'MAT-084', itemType: 'material', name: 'Rugós bilincs 20mm', unit: 'db', qty: 25, sortOrder: 3 },
      { itemCode: 'TAL-002', itemType: 'workitem', name: 'Kábeltálca 200×60 szerelése', unit: 'm', qty: 10, sortOrder: 4 },
    ],
    variantOf: 'ASM-023',
    tags: ['kábeltálca', '200mm', 'szerver'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-025',
    name: 'Kábeltálca 300mm rendszer (10m)',
    category: 'kabeltalca',
    description: '300mm széles kábeltálca 10 folyóméter: tálca + fedél + tartók. Fő elosztó ágak, nagy ipari objektumok.',
    components: [
      { itemCode: 'MAT-032', itemType: 'material', name: 'Kábeltálca 300×60', unit: 'm', qty: 10, sortOrder: 0 },
      { itemCode: 'MAT-106', itemType: 'material', name: 'Kábeltálca fedél 300mm', unit: 'm', qty: 10, sortOrder: 1 },
      { itemCode: 'MAT-036', itemType: 'material', name: 'Kábeltálca tartó', unit: 'db', qty: 10, sortOrder: 2 },
      { itemCode: 'MAT-084', itemType: 'material', name: 'Rugós bilincs 20mm', unit: 'db', qty: 30, sortOrder: 3 },
      { itemCode: 'TAL-003', itemType: 'workitem', name: 'Kábeltálca 300×60 szerelése', unit: 'm', qty: 10, sortOrder: 4 },
    ],
    variantOf: 'ASM-023',
    tags: ['kábeltálca', '300mm', 'ipari'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ══════════════════════════════════════════════════════════════════════
  // GYENGEÁRAM
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ASM-026',
    name: 'Adataljzat RJ45 Cat6 (komplett)',
    category: 'gyengaram',
    description: 'Hálózati adataljzat süllyesztett: doboz, Cat6 keystone aljzat, fedőlap, patchelés.',
    components: [
      { itemCode: 'MAT-002', itemType: 'material', name: 'Szerelvénydoboz 65mm (normál)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-070', itemType: 'material', name: 'Adataljzat RJ45 Cat6 (fehér)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-074', itemType: 'material', name: 'Adatkábel Cat6 UTP', unit: 'm', qty: 0.3, waste_pct: 15, sortOrder: 3 },
      { itemCode: 'GYE-002', itemType: 'workitem', name: 'Adataljzat RJ45 szerelés+patchelés', unit: 'db', qty: 1, sortOrder: 4 },
    ],
    tags: ['adataljzat', 'RJ45', 'Cat6'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-027',
    name: 'TV/koax aljzat (komplett)',
    category: 'gyengaram',
    description: 'TV antenna aljzat süllyesztett: doboz, koax aljzat, fedőlap, csatlakozó bekötés.',
    components: [
      { itemCode: 'MAT-002', itemType: 'material', name: 'Szerelvénydoboz 65mm (normál)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-071', itemType: 'material', name: 'TV/koax aljzat (fehér)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'GYE-004', itemType: 'workitem', name: 'TV aljzat szerelése', unit: 'db', qty: 1, sortOrder: 3 },
    ],
    tags: ['TV', 'koax', 'antenna'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-028',
    name: 'Füstérzékelő 230V (komplett)',
    category: 'gyengaram',
    description: 'Optikai füstérzékelő bekötés 230V hálózatra: mennyezeti rögzítés, bekötés, teszt. MSZ EN 54 szerint.',
    components: [
      { itemCode: 'MAT-072', itemType: 'material', name: 'Füstérzékelő 230V (optikai)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.5, waste_pct: 15, sortOrder: 1 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 2, sortOrder: 2 },
      { itemCode: 'GYE-006', itemType: 'workitem', name: 'Füstérzékelő rögzítés+bekötés', unit: 'db', qty: 1, sortOrder: 3 },
    ],
    tags: ['füstérzékelő', 'tűzvédelem'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-029',
    name: 'Kaputelefon rendszer (komplett szett)',
    category: 'gyengaram',
    description: 'Kaputelefon komplett szett: kültéri + beltéri egység szerelése, bekötés, beállítás, teszt.',
    components: [
      { itemCode: 'MAT-073', itemType: 'material', name: 'Kaputelefon szett (beltéri + kültéri)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-094', itemType: 'material', name: 'Kábel 2×0.75mm² (csengőkábel)', unit: 'm', qty: 8, waste_pct: 15, sortOrder: 1 },
      { itemCode: 'MAT-002', itemType: 'material', name: 'Szerelvénydoboz 65mm (normál)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'GYE-005', itemType: 'workitem', name: 'Kaputelefon egység szerelése+tesztelése', unit: 'db', qty: 1, sortOrder: 3 },
    ],
    tags: ['kaputelefon', 'beléptetés'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ══════════════════════════════════════════════════════════════════════
  // NAGYGÉP CSATLAKOZÁSOK (kábelezés / kötések)
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ASM-030',
    name: 'Villanytűzhely csatlakozás (3F, CEE 32A)',
    category: 'kabelezes',
    description: 'Háromfázisú villanytűzhely dedikált kör: NYY-J 5×2.5, CEE 32A 3F dugalj, MCB 3P 32A. ~10m kábellel számolva.',
    components: [
      { itemCode: 'MAT-023', itemType: 'material', name: 'NYY-J 5×2.5', unit: 'm', qty: 10, waste_pct: 15, sortOrder: 0 },
      { itemCode: 'MAT-053', itemType: 'material', name: 'CEE dugalj 3P+N+F 32A (IP44)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-048', itemType: 'material', name: 'Kismegszakító 3P 32A', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-004', itemType: 'material', name: 'Kötődoboz 100×100mm', unit: 'db', qty: 1, sortOrder: 3 },
      { itemCode: 'MAT-083', itemType: 'material', name: 'Kábeltömítő M20', unit: 'db', qty: 2, sortOrder: 4 },
      { itemCode: 'KAB-004', itemType: 'workitem', name: 'NYY-J 5×2.5 fektetése', unit: 'm', qty: 10, sortOrder: 5 },
      { itemCode: 'SZE-003', itemType: 'workitem', name: 'Ipari dugalj szerelése', unit: 'db', qty: 1, sortOrder: 6 },
      { itemCode: 'ELO-001', itemType: 'workitem', name: 'Kismegszakító beépítés', unit: 'db', qty: 1, sortOrder: 7 },
    ],
    tags: ['tűzhely', '3F', 'CEE'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-031',
    name: 'Bojler / vízmelegítő bekötés (1F, 20A)',
    category: 'kabelezes',
    description: 'Villanybojler dedikált kör: NYM-J 3×2.5, MCB 1P 20A, végpontnál WAGO kötés. ~6m kábellel számolva.',
    components: [
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 6, waste_pct: 15, sortOrder: 0 },
      { itemCode: 'MAT-045', itemType: 'material', name: 'Kismegszakító 1P 20A', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-003', itemType: 'material', name: 'Kötődoboz 80×80mm', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-081', itemType: 'material', name: 'WAGO 222-415 (5-pólusú)', unit: 'db', qty: 2, sortOrder: 3 },
      { itemCode: 'KAB-002', itemType: 'workitem', name: 'Kábel NYM-J 3×2.5 fektetése', unit: 'm', qty: 6, sortOrder: 4 },
      { itemCode: 'ELO-001', itemType: 'workitem', name: 'Kismegszakító beépítés', unit: 'db', qty: 1, sortOrder: 5 },
      { itemCode: 'KOT-003', itemType: 'workitem', name: 'Kötődoboz bekötés', unit: 'db', qty: 1, sortOrder: 6 },
    ],
    tags: ['bojler', 'vízmelegítő', 'dedikált'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-032',
    name: 'Klíma / légkondicionáló bekötés (1F, 16A)',
    category: 'kabelezes',
    description: 'Klímaberendezés dedikált kör: NYM-J 3×2.5, MCB 1P 16A, kültéri+beltéri egység kábelvég. ~8m kábellel.',
    components: [
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 8, waste_pct: 15, sortOrder: 0 },
      { itemCode: 'MAT-041', itemType: 'material', name: 'Kismegszakító 1P 16A', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-004', itemType: 'material', name: 'Kötődoboz 100×100mm', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-083', itemType: 'material', name: 'Kábeltömítő M20', unit: 'db', qty: 2, sortOrder: 3 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 3, sortOrder: 4 },
      { itemCode: 'KAB-002', itemType: 'workitem', name: 'Kábel NYM-J 3×2.5 fektetése', unit: 'm', qty: 8, sortOrder: 5 },
      { itemCode: 'ELO-001', itemType: 'workitem', name: 'Kismegszakító beépítés', unit: 'db', qty: 1, sortOrder: 6 },
      { itemCode: 'KOT-001', itemType: 'workitem', name: 'Kábelvégkészítés (1.5–4)', unit: 'db', qty: 4, sortOrder: 7 },
    ],
    tags: ['klíma', 'légkondicionáló'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ══════════════════════════════════════════════════════════════════════
  // TIPIKUS KÖRÖK
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ASM-033',
    name: 'Dugaljkör – 5 dugalj (anyagok + bekötések)',
    category: 'kabelezes',
    description: 'Tipikus szobai dugaljkör 5 dugaljjal: 5× doboz+dugalj+fedőlap, 4× kötődoboz, WAGO kötők. Kábel KÜLÖN mérendő.',
    components: [
      { itemCode: 'MAT-001', itemType: 'material', name: 'Szerelvénydoboz 65mm (mélyített)', unit: 'db', qty: 5, sortOrder: 0 },
      { itemCode: 'MAT-010', itemType: 'material', name: 'Dugalj 2P+F (fehér, alap)', unit: 'db', qty: 5, sortOrder: 1 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 5, sortOrder: 2 },
      { itemCode: 'MAT-003', itemType: 'material', name: 'Kötődoboz 80×80mm', unit: 'db', qty: 4, sortOrder: 3 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 15, sortOrder: 4 },
      { itemCode: 'SZE-001', itemType: 'workitem', name: 'Dugalj 2P+F szerelése', unit: 'db', qty: 5, sortOrder: 5 },
      { itemCode: 'KOT-003', itemType: 'workitem', name: 'Kötődoboz bekötés (2 ér)', unit: 'db', qty: 4, sortOrder: 6 },
    ],
    tags: ['dugaljkör', 'tipikus', '5db'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-034',
    name: 'Fénykör – 3 lámpa + 1 kapcsoló',
    category: 'kabelezes',
    description: 'Tipikus szobai fénykör: 3 mennyezeti lámpa + 1 egygangos kapcsoló, kötődobozok, WAGO. Kábel KÜLÖN mérendő.',
    components: [
      { itemCode: 'MAT-003', itemType: 'material', name: 'Kötődoboz 80×80mm', unit: 'db', qty: 3, sortOrder: 0 },
      { itemCode: 'MAT-002', itemType: 'material', name: 'Szerelvénydoboz 65mm (normál)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-012', itemType: 'material', name: 'Kapcsoló 1G (fehér)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 1, sortOrder: 3 },
      { itemCode: 'MAT-080', itemType: 'material', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', qty: 12, sortOrder: 4 },
      { itemCode: 'VIL-001', itemType: 'workitem', name: 'Lámpatest mennyezeti bekötése', unit: 'db', qty: 3, sortOrder: 5 },
      { itemCode: 'SZE-004', itemType: 'workitem', name: 'Kapcsoló 1G szerelése', unit: 'db', qty: 1, sortOrder: 6 },
      { itemCode: 'KOT-003', itemType: 'workitem', name: 'Kötődoboz bekötés (2 ér)', unit: 'db', qty: 3, sortOrder: 7 },
    ],
    tags: ['fénykör', 'tipikus', 'lámpa'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ══════════════════════════════════════════════════════════════════════
  // MÉRÉSI CSOMAGOK
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ASM-035',
    name: 'Mérési csomag – kis (10 kör)',
    category: 'meres',
    description: 'Érintésvédelmi mérés 10 áramkörig: érintésvéd. + szigetelési + FI mérés, mérési jkv. MSZ HD 60364 szerint.',
    components: [
      { itemCode: 'MER-001', itemType: 'workitem', name: 'Érintésvédelmi mérés (körönként)', unit: 'db', qty: 10, sortOrder: 0 },
      { itemCode: 'MER-002', itemType: 'workitem', name: 'Szigetelési mérés (körönként)', unit: 'db', qty: 10, sortOrder: 1 },
      { itemCode: 'MER-003', itemType: 'workitem', name: 'FI érzékenységi mérés', unit: 'db', qty: 3, sortOrder: 2 },
      { itemCode: 'MER-004', itemType: 'workitem', name: 'Mérési dokumentáció (jkv.)', unit: 'db', qty: 1, sortOrder: 3 },
    ],
    variants: [
      { key: 'kis', label: 'Kis (10 kör)', isDefault: true, description: 'Érintésvédelem 10 körig' },
      { key: 'nagy', label: 'Nagy (25 kör + átadás)', isDefault: false, description: 'Teljes átadási csomag', refId: 'ASM-036' },
    ],
    tags: ['mérés', 'érintésvédelem', 'dokumentáció'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-036',
    name: 'Mérési csomag – nagy (25 kör, átadás)',
    category: 'meres',
    description: 'Teljes átadási méréscsomag 25 körig: érintésvéd. + szigetelési + FI mérések + teljes mérési jkv. + átadási dokumentáció.',
    components: [
      { itemCode: 'MER-001', itemType: 'workitem', name: 'Érintésvédelmi mérés (körönként)', unit: 'db', qty: 25, sortOrder: 0 },
      { itemCode: 'MER-002', itemType: 'workitem', name: 'Szigetelési mérés (körönként)', unit: 'db', qty: 25, sortOrder: 1 },
      { itemCode: 'MER-003', itemType: 'workitem', name: 'FI érzékenységi mérés', unit: 'db', qty: 6, sortOrder: 2 },
      { itemCode: 'MER-004', itemType: 'workitem', name: 'Mérési dokumentáció + átadási jkv.', unit: 'db', qty: 1, sortOrder: 3 },
    ],
    variantOf: 'ASM-035',
    tags: ['mérés', 'átadás', 'nagy'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ══════════════════════════════════════════════════════════════════════
  // GYENGEÁRAM – Strukturált hálózat
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ASM-037',
    assemblyCode: 'WE-001',
    name: 'Adatpont Cat6 UTP (komplett)',
    category: 'gyengaram',
    description: 'Strukturált adatpont: Cat6 UTP kábel, keystone aljzat, fedőlap, doboz, patchelés + mérés.',
    overheadType: 'visit',
    symbolIds: ['DATPT', 'DATA-OUTLET', 'RJ45'],
    components: [
      { itemCode: 'MAT-001', itemType: 'material', name: 'Szerelvénydoboz 65mm (mélyített)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-070', itemType: 'material', name: 'Adataljzat RJ45 Cat6 (fehér)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-074', itemType: 'material', name: 'Adatkábel Cat6 UTP', unit: 'm', qty: 30, waste_pct: 10, sortOrder: 3 },
      { itemCode: 'GYE-002', itemType: 'workitem', name: 'Adataljzat (RJ45) szerelés', unit: 'db', qty: 1, sortOrder: 4 },
      { itemCode: 'GYE-001', itemType: 'workitem', name: 'Adatkábel Cat6 fektetés', unit: 'm', qty: 30, sortOrder: 5 },
    ],
    tags: ['adatpont', 'cat6', 'hálózat', 'strukturált'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-038',
    assemblyCode: 'WE-002',
    name: 'Adatpont Cat6A S/FTP (komplett)',
    category: 'gyengaram',
    description: 'Árnyékolt adatpont: Cat6A kábel, árnyékolt keystone, patchelés, Fluke mérés.',
    overheadType: 'visit',
    symbolIds: ['DATPT-6A', 'DATA-OUTLET-STP'],
    components: [
      { itemCode: 'MAT-001', itemType: 'material', name: 'Szerelvénydoboz 65mm (mélyített)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-WE-CAT6A-JACK', itemType: 'material', name: 'Adataljzat Cat6A árnyékolt', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-WE-CAT6A-CABLE', itemType: 'material', name: 'Adatkábel Cat6A S/FTP', unit: 'm', qty: 30, waste_pct: 10, sortOrder: 3 },
      { itemCode: 'GYE-011', itemType: 'workitem', name: 'Adatpont Cat6A szerelés', unit: 'db', qty: 1, sortOrder: 4 },
    ],
    variantOf: 'ASM-037',
    tags: ['adatpont', 'cat6a', 'árnyékolt'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-039',
    assemblyCode: 'WE-003',
    name: 'Üvegszálas adatpont (OM3/OM4)',
    category: 'gyengaram',
    description: 'Optikai adatpont: üvegszálas kábel, SC/LC végződtetés, hegesztés vagy mechanikus csatlakozó.',
    overheadType: 'visit',
    symbolIds: ['FIBER-PT', 'FO-OUTLET'],
    components: [
      { itemCode: 'MAT-WE-FIBER-CABLE', itemType: 'material', name: 'Üvegszálas kábel OM3/OM4', unit: 'm', qty: 50, waste_pct: 5, sortOrder: 0 },
      { itemCode: 'MAT-WE-FIBER-PANEL', itemType: 'material', name: 'Optikai fali kötődoboz 4SC', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-WE-FIBER-PIGTAIL', itemType: 'material', name: 'Pigtail SC/PC OM3 (szett)', unit: 'db', qty: 2, sortOrder: 2 },
      { itemCode: 'GYE-012', itemType: 'workitem', name: 'Üvegszálas végződtetés', unit: 'db', qty: 2, sortOrder: 3 },
    ],
    tags: ['fiber', 'üvegszál', 'optika'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-040',
    assemblyCode: 'WE-004',
    name: 'WiFi AP pont (PoE)',
    category: 'gyengaram',
    description: 'Mennyezeti/fali WiFi AP: Cat6 kábel, PoE bekötés, AP rögzítés, alapkonfig.',
    overheadType: 'visit',
    symbolIds: ['WIFI-AP', 'WAP', 'ACCESS-POINT'],
    components: [
      { itemCode: 'MAT-074', itemType: 'material', name: 'Adatkábel Cat6 UTP', unit: 'm', qty: 30, waste_pct: 10, sortOrder: 0 },
      { itemCode: 'MAT-WE-AP-BRACKET', itemType: 'material', name: 'AP tartókonzol', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'GYE-007', itemType: 'workitem', name: 'WiFi AP felszerelés', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'GYE-001', itemType: 'workitem', name: 'Adatkábel Cat6 fektetés', unit: 'm', qty: 30, sortOrder: 3 },
    ],
    tags: ['wifi', 'AP', 'hálózat', 'PoE'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-041',
    assemblyCode: 'WE-005',
    name: 'TV csatlakozópont (koax)',
    category: 'gyengaram',
    description: 'TV/SAT koax aljzat komplett: doboz, koax aljzat, fedőlap, RG6 kábel.',
    overheadType: 'visit',
    symbolIds: ['TV-PT', 'COAX-OUTLET'],
    components: [
      { itemCode: 'MAT-002', itemType: 'material', name: 'Szerelvénydoboz 65mm (normál)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-071', itemType: 'material', name: 'TV/koax aljzat (fehér)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-015', itemType: 'material', name: 'Fedőlap (fehér)', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-076', itemType: 'material', name: 'Koax kábel RG6', unit: 'm', qty: 20, waste_pct: 10, sortOrder: 3 },
      { itemCode: 'GYE-004', itemType: 'workitem', name: 'TV aljzat szerelés', unit: 'db', qty: 1, sortOrder: 4 },
    ],
    tags: ['TV', 'koax', 'antenna'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ══════════════════════════════════════════════════════════════════════
  // GYENGEÁRAM – Biztonságtechnika
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ASM-042',
    assemblyCode: 'WE-006',
    name: 'CCTV kamera pont (IP PoE)',
    category: 'gyengaram',
    description: 'IP kamera pont: Cat6 kábel PoE-val, konzol, kamera rögzítés, NVR-hez patchelés.',
    overheadType: 'visit',
    symbolIds: ['CCTV', 'IP-CAM', 'CAMERA'],
    components: [
      { itemCode: 'MAT-074', itemType: 'material', name: 'Adatkábel Cat6 UTP', unit: 'm', qty: 40, waste_pct: 10, sortOrder: 0 },
      { itemCode: 'MAT-079', itemType: 'material', name: 'IP kamera PoE kültéri', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-WE-CAM-BRACKET', itemType: 'material', name: 'Kamerakonzol fali/mennyezeti', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'GYE-008', itemType: 'workitem', name: 'Kamerarendszer pont', unit: 'db', qty: 1, sortOrder: 3 },
      { itemCode: 'GYE-001', itemType: 'workitem', name: 'Adatkábel Cat6 fektetés', unit: 'm', qty: 40, sortOrder: 4 },
    ],
    tags: ['kamera', 'CCTV', 'biztonság', 'PoE'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-043',
    assemblyCode: 'WE-007',
    name: 'IP kaputelefon / intercom',
    category: 'gyengaram',
    description: 'SIP/IP alapú kaputelefon: kültéri panel, beltéri monitor, PoE tápellátás.',
    overheadType: 'visit',
    symbolIds: ['INTERCOM', 'DOORBELL-IP'],
    components: [
      { itemCode: 'MAT-073', itemType: 'material', name: 'Kaputelefon szett (beltéri + kültéri)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-074', itemType: 'material', name: 'Adatkábel Cat6 UTP', unit: 'm', qty: 25, waste_pct: 10, sortOrder: 1 },
      { itemCode: 'GYE-013', itemType: 'workitem', name: 'IP intercom egység', unit: 'db', qty: 1, sortOrder: 2 },
    ],
    tags: ['kaputelefon', 'intercom', 'IP'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-044',
    assemblyCode: 'WE-008',
    name: 'PA / hangosítás pont',
    category: 'gyengaram',
    description: 'Mennyezeti hangszóró 100V vonalon: hangszóró, transzformátor, 2 eres kábel.',
    overheadType: 'visit',
    symbolIds: ['PA-SPEAKER', 'SPEAKER'],
    components: [
      { itemCode: 'MAT-WE-PA-SPEAKER', itemType: 'material', name: 'Mennyezeti hangszóró 100V 6W', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-094', itemType: 'material', name: 'Kábel 2×0.75mm²', unit: 'm', qty: 25, waste_pct: 10, sortOrder: 1 },
      { itemCode: 'GYE-014', itemType: 'workitem', name: 'PA / hangosítás pont', unit: 'db', qty: 1, sortOrder: 2 },
    ],
    tags: ['PA', 'hangosítás', 'hangszóró'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-045',
    assemblyCode: 'WE-009',
    name: 'Riasztó PIR érzékelő pont',
    category: 'gyengaram',
    description: 'Riasztó mozgásérzékelő: PIR szenzor, 4 eres kábel, bekötés zónára.',
    overheadType: 'visit',
    symbolIds: ['PIR', 'ALARM-PIR', 'MOTION'],
    components: [
      { itemCode: 'MAT-077', itemType: 'material', name: 'Riasztó mozgásérzékelő (PIR)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-WE-ALARM-CABLE', itemType: 'material', name: 'Riasztó kábel 2×0.5+2×0.22', unit: 'm', qty: 20, waste_pct: 10, sortOrder: 1 },
      { itemCode: 'GYE-009', itemType: 'workitem', name: 'Riasztó mozgásérzékelő', unit: 'db', qty: 1, sortOrder: 2 },
    ],
    tags: ['riasztó', 'PIR', 'mozgásérzékelő'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-046',
    assemblyCode: 'WE-010',
    name: 'Riasztó nyitásérzékelő pont',
    category: 'gyengaram',
    description: 'Mágneses nyitásérzékelő ajtóra/ablakra: szenzor + mágnes, 4 eres kábel.',
    overheadType: 'visit',
    symbolIds: ['REED', 'DOOR-CONTACT', 'MAG-SENSOR'],
    components: [
      { itemCode: 'MAT-WE-REED', itemType: 'material', name: 'Mágneses nyitásérzékelő (süllyesztett)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-WE-ALARM-CABLE', itemType: 'material', name: 'Riasztó kábel 2×0.5+2×0.22', unit: 'm', qty: 15, waste_pct: 10, sortOrder: 1 },
      { itemCode: 'GYE-015', itemType: 'workitem', name: 'Riasztó nyitásérzékelő', unit: 'db', qty: 1, sortOrder: 2 },
    ],
    tags: ['riasztó', 'nyitásérzékelő', 'reed'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-047',
    assemblyCode: 'WE-011',
    name: 'Riasztó központ (8 zóna)',
    category: 'gyengaram',
    description: 'Riasztó központ telepítés: központ, akku, doboz, bekötés, programozás, teszt.',
    overheadType: 'project',
    symbolIds: ['ALARM-PANEL'],
    components: [
      { itemCode: 'MAT-078', itemType: 'material', name: 'Riasztó központ 8 zónás', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-WE-ALARM-BATT', itemType: 'material', name: 'Akkumulátor 12V 7Ah', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-WE-ALARM-SIREN', itemType: 'material', name: 'Beltéri sziréna', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'GYE-010', itemType: 'workitem', name: 'Riasztó központ bekötés', unit: 'db', qty: 1, sortOrder: 3 },
    ],
    tags: ['riasztó', 'központ', 'rendszer'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-048',
    assemblyCode: 'WE-012',
    name: 'Kaputelefon pont (hagyományos)',
    category: 'gyengaram',
    description: 'Hagyományos 2 vezetékes kaputelefon: kültéri + beltéri egység, kábel, bekötés.',
    overheadType: 'visit',
    symbolIds: ['DOORBELL', 'INTERCOM-LEGACY'],
    components: [
      { itemCode: 'MAT-073', itemType: 'material', name: 'Kaputelefon szett (beltéri + kültéri)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-094', itemType: 'material', name: 'Kábel 2×0.75mm²', unit: 'm', qty: 20, waste_pct: 10, sortOrder: 1 },
      { itemCode: 'GYE-005', itemType: 'workitem', name: 'Kaputelefon egység', unit: 'db', qty: 1, sortOrder: 2 },
    ],
    tags: ['kaputelefon', 'hagyományos'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-049',
    assemblyCode: 'WE-013',
    name: 'Beléptetés kártyaolvasó pont',
    category: 'gyengaram',
    description: 'RFID/NFC kártyaolvasó: olvasó, kábel, Wiegand bekötés kontrollerhez.',
    overheadType: 'visit',
    symbolIds: ['ACCESS-READER', 'CARD-READER'],
    components: [
      { itemCode: 'MAT-WE-READER', itemType: 'material', name: 'RFID kártyaolvasó (Mifare)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-WE-ALARM-CABLE', itemType: 'material', name: 'Riasztó kábel 2×0.5+2×0.22', unit: 'm', qty: 25, waste_pct: 10, sortOrder: 1 },
      { itemCode: 'GYE-016', itemType: 'workitem', name: 'Beléptetés kártyaolvasó', unit: 'db', qty: 1, sortOrder: 2 },
    ],
    tags: ['beléptetés', 'kártyaolvasó', 'RFID'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-050',
    assemblyCode: 'WE-014',
    name: 'Beléptetés kontroller (2-4 ajtó)',
    category: 'gyengaram',
    description: 'Beléptetés kontroller: 2-4 ajtós, zár kimenetek, RS485, programozás.',
    overheadType: 'project',
    symbolIds: ['ACCESS-CTRL'],
    components: [
      { itemCode: 'MAT-WE-ACCESS-CTRL', itemType: 'material', name: 'Beléptetés kontroller 2-4 ajtó', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-WE-PSU-12V', itemType: 'material', name: 'Tápegység 12V 5A dobozos', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'GYE-017', itemType: 'workitem', name: 'Beléptetés kontroller', unit: 'db', qty: 1, sortOrder: 2 },
    ],
    tags: ['beléptetés', 'kontroller'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ══════════════════════════════════════════════════════════════════════
  // GYENGEÁRAM – Infrastruktúra / Rack
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ASM-051',
    assemblyCode: 'WE-015',
    name: 'Strukturált rack 19" (komplett)',
    category: 'gyengaram',
    description: '19" rack felállítás: rack szekrény, patch panel, switch, UPS, kábel rendezés.',
    overheadType: 'project',
    symbolIds: ['RACK', 'SERVER-RACK'],
    components: [
      { itemCode: 'MAT-WE-RACK', itemType: 'material', name: '19" rack szekrény 22U', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-WE-PATCH24', itemType: 'material', name: 'Patch panel 24 port Cat6', unit: 'db', qty: 2, sortOrder: 1 },
      { itemCode: 'MAT-WE-SWITCH24', itemType: 'material', name: 'Switch 24p PoE+ managed', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'MAT-WE-UPS-RACK', itemType: 'material', name: 'UPS 1500VA rackmount', unit: 'db', qty: 1, sortOrder: 3 },
      { itemCode: 'GYE-018', itemType: 'workitem', name: '19" rack telepítés', unit: 'db', qty: 1, sortOrder: 4 },
    ],
    tags: ['rack', 'szekrény', 'infrastruktúra'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-052',
    assemblyCode: 'WE-016',
    name: 'Patch panel 24 port',
    category: 'gyengaram',
    description: 'Patch panel rack-be: 24 port Cat6, patchelés, jelölés.',
    overheadType: 'visit',
    symbolIds: [],
    components: [
      { itemCode: 'MAT-WE-PATCH24', itemType: 'material', name: 'Patch panel 24 port Cat6', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'GYE-003', itemType: 'workitem', name: 'Patch panel (24 port)', unit: 'db', qty: 1, sortOrder: 1 },
    ],
    tags: ['patch', 'panel', 'rack'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-053',
    assemblyCode: 'WE-017',
    name: 'Switch 24p PoE telepítés',
    category: 'gyengaram',
    description: 'Managed switch rack-be: patchelés, VLAN alapkonfig, PoE beállítás.',
    overheadType: 'visit',
    symbolIds: [],
    components: [
      { itemCode: 'MAT-WE-SWITCH24', itemType: 'material', name: 'Switch 24p PoE+ managed', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'GYE-019', itemType: 'workitem', name: 'Switch 24p PoE telepítés', unit: 'db', qty: 1, sortOrder: 1 },
    ],
    tags: ['switch', 'PoE', 'hálózat'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-054',
    assemblyCode: 'WE-018',
    name: 'UPS rackmount telepítés',
    category: 'gyengaram',
    description: 'UPS rack-be: bekötés, akkuteszt, monitoring szoftver.',
    overheadType: 'project',
    symbolIds: [],
    components: [
      { itemCode: 'MAT-WE-UPS-RACK', itemType: 'material', name: 'UPS 1500VA rackmount', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'GYE-020', itemType: 'workitem', name: 'UPS rackmount telepítés', unit: 'db', qty: 1, sortOrder: 1 },
    ],
    tags: ['UPS', 'szünetmentes'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-055',
    assemblyCode: 'WE-019',
    name: 'DIN sín tápegység 24V',
    category: 'gyengaram',
    description: '24V tápegység DIN sínre: bekötés, biztosíték, jelölés.',
    overheadType: 'visit',
    symbolIds: ['PSU-DIN'],
    components: [
      { itemCode: 'MAT-WE-PSU-DIN24', itemType: 'material', name: 'DIN tápegység 24V 2.5A', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-040', itemType: 'material', name: 'Kismegszakító 1P 10A', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'GYE-021', itemType: 'workitem', name: 'DIN tápegység szerelés', unit: 'db', qty: 1, sortOrder: 2 },
    ],
    tags: ['tápegység', 'DIN', '24V'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ══════════════════════════════════════════════════════════════════════
  // TŰZJELZŐ RENDSZER
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ASM-056',
    assemblyCode: 'FA-001',
    name: 'Optikai füstérzékelő pont (címezhető)',
    category: 'tuzjelzo',
    description: 'Címezhető optikai füstérzékelő: aljzat + érzékelő fej, J-Y(St)Y kábel, cím beállítás.',
    overheadType: 'visit',
    symbolIds: ['SMOKE-DET', 'OPT-SMOKE', 'SD'],
    components: [
      { itemCode: 'MAT-FA-OPT-SMOKE', itemType: 'material', name: 'Optikai füstérzékelő (címezhető)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-FA-BASE', itemType: 'material', name: 'Érzékelő aljzat (standard)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-FA-JYSTY', itemType: 'material', name: 'J-Y(St)Y 2×2×0.8 tűzjelző kábel', unit: 'm', qty: 20, waste_pct: 10, sortOrder: 2 },
      { itemCode: 'TUZ-011', itemType: 'workitem', name: 'Érzékelő aljzat előkészítés', unit: 'db', qty: 1, sortOrder: 3 },
      { itemCode: 'TUZ-001', itemType: 'workitem', name: 'Optikai füstérzékelő szerelés', unit: 'db', qty: 1, sortOrder: 4 },
      { itemCode: 'TUZ-006', itemType: 'workitem', name: 'Tűzjelző kábel fektetés', unit: 'm', qty: 20, sortOrder: 5 },
    ],
    tags: ['tűzjelző', 'füstérzékelő', 'optikai', 'címezhető'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-057',
    assemblyCode: 'FA-002',
    name: 'Hőérzékelő pont (címezhető)',
    category: 'tuzjelzo',
    description: 'Címezhető hőérzékelő (fix/RoR): aljzat, érzékelő, kábel, cím beállítás. Konyha, garázs.',
    overheadType: 'visit',
    symbolIds: ['HEAT-DET', 'HD'],
    components: [
      { itemCode: 'MAT-FA-HEAT', itemType: 'material', name: 'Hőérzékelő fix/RoR (címezhető)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-FA-BASE', itemType: 'material', name: 'Érzékelő aljzat (standard)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-FA-JYSTY', itemType: 'material', name: 'J-Y(St)Y 2×2×0.8 tűzjelző kábel', unit: 'm', qty: 20, waste_pct: 10, sortOrder: 2 },
      { itemCode: 'TUZ-011', itemType: 'workitem', name: 'Érzékelő aljzat előkészítés', unit: 'db', qty: 1, sortOrder: 3 },
      { itemCode: 'TUZ-002', itemType: 'workitem', name: 'Hőérzékelő szerelés', unit: 'db', qty: 1, sortOrder: 4 },
      { itemCode: 'TUZ-006', itemType: 'workitem', name: 'Tűzjelző kábel fektetés', unit: 'm', qty: 20, sortOrder: 5 },
    ],
    variantOf: 'ASM-056',
    tags: ['tűzjelző', 'hőérzékelő', 'címezhető'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-058',
    assemblyCode: 'FA-003',
    name: 'Multiszenzoros érzékelő pont',
    category: 'tuzjelzo',
    description: 'Kombinált optikai+hő érzékelő: maximális érzékenység, speciális helyiségekhez.',
    overheadType: 'visit',
    symbolIds: ['MULTI-DET', 'MSD'],
    components: [
      { itemCode: 'MAT-FA-MULTI', itemType: 'material', name: 'Multiszenzoros érzékelő (címezhető)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-FA-BASE', itemType: 'material', name: 'Érzékelő aljzat (standard)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-FA-JYSTY', itemType: 'material', name: 'J-Y(St)Y 2×2×0.8 tűzjelző kábel', unit: 'm', qty: 20, waste_pct: 10, sortOrder: 2 },
      { itemCode: 'TUZ-011', itemType: 'workitem', name: 'Érzékelő aljzat előkészítés', unit: 'db', qty: 1, sortOrder: 3 },
      { itemCode: 'TUZ-003', itemType: 'workitem', name: 'Multiszenzoros érzékelő szerelés', unit: 'db', qty: 1, sortOrder: 4 },
      { itemCode: 'TUZ-006', itemType: 'workitem', name: 'Tűzjelző kábel fektetés', unit: 'm', qty: 20, sortOrder: 5 },
    ],
    variantOf: 'ASM-056',
    tags: ['tűzjelző', 'multiszenzor', 'kombinált'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-059',
    assemblyCode: 'FA-004',
    name: 'Kézi jelzésadó pont',
    category: 'tuzjelzo',
    description: 'Kézi tűzjelzésadó: falra szerelés (1.2-1.4m), falon kívüli/süllyesztett, kábel.',
    overheadType: 'visit',
    symbolIds: ['MCP', 'MANUAL-CALL', 'PULL-STATION'],
    components: [
      { itemCode: 'MAT-FA-MCP', itemType: 'material', name: 'Kézi jelzésadó (címezhető, visszaállítható)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-FA-JYSTY', itemType: 'material', name: 'J-Y(St)Y 2×2×0.8 tűzjelző kábel', unit: 'm', qty: 20, waste_pct: 10, sortOrder: 1 },
      { itemCode: 'TUZ-004', itemType: 'workitem', name: 'Kézi jelzésadó szerelés', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'TUZ-006', itemType: 'workitem', name: 'Tűzjelző kábel fektetés', unit: 'm', qty: 20, sortOrder: 3 },
    ],
    tags: ['tűzjelző', 'kézi jelzésadó', 'MCP'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-060',
    assemblyCode: 'FA-005',
    name: 'Hang-fényjelző (sziréna + villogó)',
    category: 'tuzjelzo',
    description: 'Címezhető hang-fényjelző: sziréna + piros villogó, mennyezeti/fali, kábel.',
    overheadType: 'visit',
    symbolIds: ['SOUNDER', 'BEACON', 'ALARM-BELL'],
    components: [
      { itemCode: 'MAT-FA-SOUNDER', itemType: 'material', name: 'Hang-fényjelző (címezhető)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-FA-JYSTY', itemType: 'material', name: 'J-Y(St)Y 2×2×0.8 tűzjelző kábel', unit: 'm', qty: 25, waste_pct: 10, sortOrder: 1 },
      { itemCode: 'TUZ-005', itemType: 'workitem', name: 'Hang-fényjelző szerelés', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'TUZ-006', itemType: 'workitem', name: 'Tűzjelző kábel fektetés', unit: 'm', qty: 25, sortOrder: 3 },
    ],
    tags: ['tűzjelző', 'sziréna', 'hang-fényjelző'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-061',
    assemblyCode: 'FA-006',
    name: 'Tűzjelző központ telepítés (1-2 hurok)',
    category: 'tuzjelzo',
    description: 'Tűzjelző központ: rögzítés, 230V bekötés, akku, hurok bekötés, programozás, üzembe helyezés.',
    overheadType: 'project',
    symbolIds: ['FACP', 'FIRE-PANEL'],
    components: [
      { itemCode: 'MAT-FA-PANEL', itemType: 'material', name: 'Tűzjelző központ 1-2 hurok', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-FA-BATT', itemType: 'material', name: 'Akkumulátor 12V 18Ah (2db)', unit: 'db', qty: 1, sortOrder: 1 },
      { itemCode: 'MAT-040', itemType: 'material', name: 'Kismegszakító 1P 10A', unit: 'db', qty: 1, sortOrder: 2 },
      { itemCode: 'TUZ-007', itemType: 'workitem', name: 'Tűzjelző központ telepítés', unit: 'db', qty: 1, sortOrder: 3 },
    ],
    tags: ['tűzjelző', 'központ', 'FACP'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-062',
    assemblyCode: 'FA-007',
    name: 'Tűzjelző távkezelő panel',
    category: 'tuzjelzo',
    description: 'Távkezelő/ismétlő panel: falra, RS485 bekötés, programozás.',
    overheadType: 'visit',
    symbolIds: ['FIRE-REPEATER'],
    components: [
      { itemCode: 'MAT-FA-REPEATER', itemType: 'material', name: 'Távkezelő/ismétlő panel', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-FA-JYSTY', itemType: 'material', name: 'J-Y(St)Y 2×2×0.8 tűzjelző kábel', unit: 'm', qty: 30, waste_pct: 10, sortOrder: 1 },
      { itemCode: 'TUZ-008', itemType: 'workitem', name: 'Tűzjelző tábla kezelő', unit: 'db', qty: 1, sortOrder: 2 },
    ],
    tags: ['tűzjelző', 'távkezelő', 'ismétlő'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-063',
    assemblyCode: 'FA-008',
    name: 'I/O modul (bemeneti/kimeneti)',
    category: 'tuzjelzo',
    description: 'Hurok I/O modul: felügyeleti bemenet vagy relé kimenet, pl. lift visszahívás, klíma leállítás.',
    overheadType: 'visit',
    symbolIds: ['IO-MODULE', 'RELAY-MODULE'],
    components: [
      { itemCode: 'MAT-FA-IO-MODULE', itemType: 'material', name: 'Címezhető I/O modul (1 be / 1 ki)', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'MAT-FA-JYSTY', itemType: 'material', name: 'J-Y(St)Y 2×2×0.8 tűzjelző kábel', unit: 'm', qty: 15, waste_pct: 10, sortOrder: 1 },
      { itemCode: 'TUZ-009', itemType: 'workitem', name: 'I/O modul bekötés', unit: 'db', qty: 1, sortOrder: 2 },
    ],
    tags: ['tűzjelző', 'I/O', 'modul', 'relé'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-064',
    assemblyCode: 'FA-009',
    name: 'Tűzgátló áttörés tömítés',
    category: 'tuzjelzo',
    description: 'EI90/EI120 tűzgátló tömítés kábel áttörésnél: tűzálló habarcs/mandzsetta.',
    overheadType: 'visit',
    symbolIds: ['FIRESTOP', 'FIRE-SEAL'],
    components: [
      { itemCode: 'MAT-FA-FIRESTOP', itemType: 'material', name: 'Tűzgátló tömítőanyag készlet', unit: 'db', qty: 1, sortOrder: 0 },
      { itemCode: 'TUZ-010', itemType: 'workitem', name: 'Tűzgátló áttörés tömítés', unit: 'db', qty: 1, sortOrder: 1 },
    ],
    tags: ['tűzgátló', 'áttörés', 'tömítés', 'EI90'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-065',
    assemblyCode: 'FA-010',
    name: 'Tűzjelző zóna programozás (10 eszköz)',
    category: 'tuzjelzo',
    description: '10 eszköz programozása: cím, zóna, csoportok, logika, szöveges leírások.',
    overheadType: 'project',
    symbolIds: [],
    components: [
      { itemCode: 'TUZ-012', itemType: 'workitem', name: 'Tűzjelző programozás (zónánként)', unit: 'db', qty: 10, sortOrder: 0 },
    ],
    tags: ['tűzjelző', 'programozás', 'zóna'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'ASM-066',
    assemblyCode: 'FA-011',
    name: 'Tűzjelző üzembe helyezés + átadás',
    category: 'tuzjelzo',
    description: 'Komplett rendszer üzembe helyezés: hurok teszt, érzékelő teszt, sziréna teszt, jegyzőkönyv, átadás.',
    overheadType: 'project',
    symbolIds: [],
    components: [
      { itemCode: 'TUZ-013', itemType: 'workitem', name: 'Tűzjelző üzembe helyezés', unit: 'db', qty: 1, sortOrder: 0 },
    ],
    tags: ['tűzjelző', 'üzembe helyezés', 'átadás'],
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

// ─── NECA 24 Produktivitási Faktor – Magyar villanyszerelő adaptáció ─────────
// Forrás: NECA Manual of Labor Units + Trimble/McCormick/Sage enterprise rendszerek
// 12 faktor, 4 csoport – szorzatuk adja a végső produktivitási tényezőt
// Alap (minden factor = default opció): szorzó = 1.0
export const WALL_FACTORS = {
  drywall:  0.80,   // Gipszkarton
  ytong:    0.90,   // Ytong / pórusbeton
  brick:    1.00,   // Tégla (referencia)
  concrete: 1.45,   // Vasbeton
  steel:    1.20,   // Acélszerkezet (gyengeáram/tűzjelző: kábeltartó, bilincs)
  outdoor:  0.95,   // Kültéri (szabad hozzáférés, de időjárás)
}

export const CONTEXT_FACTORS = {

  // ── Helyszíni körülmények (projekt szintű) ─────────────────────────────────
  access: {
    label: 'Hozzáférhetőség / berendezettség',
    group: 'helyszin',
    groupLabel: 'Helyszíni körülmények',
    desc: 'Mennyire kell a felszerelés körül dolgozni, helyet csinálni.',
    defaultKey: 'empty',
    options: [
      { key: 'empty',      label: 'Üres helyiség',      factor: 1.00, icon: '🟢', desc: 'Nincs akadályozó bútorzat' },
      { key: 'occupied',   label: 'Berendezett',         factor: 1.15, icon: '🟡', desc: 'Bútorzat körül kell dolgozni' },
      { key: 'restricted', label: 'Nehéz hozzáférés',   factor: 1.30, icon: '🔴', desc: 'Szűk tér, gépek, korlátozott mozgás' },
      { key: 'ceiling_void', label: 'Álmennyezet felett', factor: 1.25, icon: '🟠', desc: 'Álmennyezeti térben, szűk hely, por' },
      { key: 'fire_stop',  label: 'Tűzgátló áttörés',   factor: 1.35, icon: '🔴', desc: 'Tűzgátló tömítéssel kombinált átvezetés' },
    ]
  },
  project_type: {
    label: 'Projekt típus',
    group: 'helyszin',
    groupLabel: 'Helyszíni körülmények',
    desc: 'Az épület állapota és a feladat jellege.',
    defaultKey: 'renovation',
    options: [
      { key: 'new_build',  label: 'Új építés',          factor: 0.90, icon: '🟢', desc: 'Tiszta nyomvonalak, koordinált munkafázis' },
      { key: 'renovation', label: 'Felújítás',           factor: 1.35, icon: '🟡', desc: 'Meglévő szerkezetek, váratlan akadályok' },
      { key: 'industrial', label: 'Ipari / üzemi',       factor: 1.50, icon: '🔴', desc: 'Erős szerkezeti elvárások, IP fokozat' },
      { key: 'hazardous',  label: 'Veszélyes zóna (Ex)', factor: 1.40, icon: '🔴', desc: 'Robbanásbiztos szerelvények, speciális előírások' },
    ]
  },
  height: {
    label: 'Munkavégzési magasság',
    group: 'helyszin',
    groupLabel: 'Helyszíni körülmények',
    desc: 'Magasabb munka lassabb – létra, állvány állandó felszerelés.',
    defaultKey: 'normal',
    options: [
      { key: 'normal',   label: 'Normál (≤ 2.5m)',      factor: 1.00, icon: '🟢', desc: 'Kézzel elérhető, nincs segédeszköz' },
      { key: 'ladder',   label: 'Létra (2.5–4m)',        factor: 1.35, icon: '🟡', desc: 'Anyagmozgatás létrán/állványon' },
      { key: 'scaffold', label: 'Állvány (4m felett)',   factor: 1.70, icon: '🔴', desc: 'Állványszerelés + felszedés is benne' },
    ]
  },

}

// ─── Összetett produktivitási szorzó számítása ──────────────────────────────
// context_defaults alapján kiszámolja a kombinált szorzót
export function calcProductivityFactor(contextDefaults = {}) {
  let combined = 1.0
  for (const [factorKey, factorDef] of Object.entries(CONTEXT_FACTORS)) {
    const selectedKey = contextDefaults[factorKey] ?? factorDef.defaultKey
    const opt = factorDef.options.find(o => o.key === selectedKey)
    if (opt) combined *= opt.factor
  }
  return combined
}

// ─── Variant System helpers ──────────────────────────────────────────────────
// Enterprise-level assembly variant management


// ─── Assembly component formula evaluátor ──────────────────────────────────
// qty_formula: string like "COUNT * 0.3 + 2", "METER * 0.1"
// Variables: COUNT (device/takeoff count), METER (cable meters or 0)
// Returns evaluated qty or fallback to component.qty
export function evalQtyFormula(formula, vars = {}) {
  if (!formula || typeof formula !== 'string') return null
  try {
    const { COUNT = 1, METER = 0, FLOOR = 1 } = vars
    // Safe eval: only allow numbers, operators, parens, and our variables
    const safe = formula
      .replace(/COUNT/g, String(COUNT))
      .replace(/METER/g, String(METER))
      .replace(/FLOOR/g, String(FLOOR))
      .replace(/[^0-9.+\-*/()\s]/g, '')
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + safe + ')')()
    return typeof result === 'number' && isFinite(result) ? result : null
  } catch {
    return null
  }
}

// Get effective qty for a component (formula takes priority over fixed qty)
export function getComponentQty(component, vars = {}) {
  if (component.qty_formula) {
    const result = evalQtyFormula(component.qty_formula, vars)
    if (result !== null) return result
  }
  return component.qty || 0
}

/**
 * Get active components for an assembly considering variant selection
 * @param {Object} assembly - The assembly object
 * @param {string} [variantKey] - Optional variant key; if omitted uses default
 * @returns {Array} components array
 */
export function getAssemblyComponents(assembly, variantKey) {
  if (!assembly.variants || assembly.variants.length === 0) {
    return assembly.components || []
  }
  if (variantKey) {
    const variant = assembly.variants.find(v => v.key === variantKey)
    if (variant) return variant.components
  }
  // Return default variant or first
  const def = assembly.variants.find(v => v.isDefault) || assembly.variants[0]
  return def ? def.components : (assembly.components || [])
}

/**
 * Check assembly completeness (has both materials and workitems)
 */
export function getAssemblyCompleteness(assembly) {
  const comps = assembly.components || []
  const hasMaterials = comps.some(c => c.itemType === 'material')
  const hasWorkitems = comps.some(c => c.itemType === 'workitem')
  const hasName = !!assembly.name?.trim()
  const hasDescription = !!assembly.description?.trim()
  const hasCategory = !!assembly.category

  const checks = [
    { key: 'name', label: 'Név megadva', ok: hasName },
    { key: 'description', label: 'Leírás megadva', ok: hasDescription },
    { key: 'category', label: 'Kategória beállítva', ok: hasCategory },
    { key: 'materials', label: 'Anyagok hozzáadva', ok: hasMaterials },
    { key: 'workitems', label: 'Munkatételek hozzáadva', ok: hasWorkitems },
    { key: 'components', label: 'Min. 2 komponens', ok: comps.length >= 2 },
  ]
  const score = checks.filter(c => c.ok).length
  const total = checks.length
  return { checks, score, total, percent: Math.round((score / total) * 100) }
}

/**
 * Assembly variant group definitions - maps which assemblies are related
 */
export const ASSEMBLY_VARIANT_GROUPS = {
  dugalj: {
    label: 'Dugalj variánsok',
    description: 'Dugalj típusok: alap, IP44, dupla, ipari',
    parentId: 'ASM-001',
    variantIds: ['ASM-001', 'ASM-004', 'ASM-005', 'ASM-011', 'ASM-012'],
  },
  kapcsolo: {
    label: 'Kapcsoló variánsok',
    description: 'Kapcsoló típusok: 1G, 2G, váltó, mozgásérzékelős, termosztát',
    parentId: 'ASM-002',
    variantIds: ['ASM-002', 'ASM-006', 'ASM-007', 'ASM-008', 'ASM-010'],
  },
  lampatest: {
    label: 'Lámpatest variánsok',
    description: 'Lámpatest bekötés típusok: mennyezeti, süllyesztett, fali, LED, vész, kültéri',
    parentId: 'ASM-003',
    variantIds: ['ASM-003', 'ASM-013', 'ASM-014', 'ASM-015', 'ASM-016', 'ASM-017'],
  },
  eloszto: {
    label: 'Elosztó tábla variánsok',
    description: 'Elosztó tábla méretek: 12M, 24M, 36M+',
    parentId: 'ASM-018',
    variantIds: ['ASM-018', 'ASM-019', 'ASM-020'],
  },
  kabeltalca: {
    label: 'Kábeltálca variánsok',
    description: 'Kábeltálca szélességek: 100mm, 200mm, 300mm',
    parentId: 'ASM-023',
    variantIds: ['ASM-023', 'ASM-024', 'ASM-025'],
  },
  meres: {
    label: 'Mérési csomag variánsok',
    description: 'Mérési csomagok: kis (10 kör), nagy (25 kör)',
    parentId: 'ASM-035',
    variantIds: ['ASM-035', 'ASM-036'],
  },
}
