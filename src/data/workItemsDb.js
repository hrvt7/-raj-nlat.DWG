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
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 0.3, sortOrder: 3 },
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
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.3, sortOrder: 3 },
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
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 0.3, sortOrder: 2 },
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
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 0.5, sortOrder: 3 },
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
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.5, sortOrder: 3 },
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
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 1.0, sortOrder: 3 },
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
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.3, sortOrder: 3 },
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
      { itemCode: 'MAT-094', itemType: 'material', name: 'Kábel 2×0.75mm² (csengőkábel)', unit: 'm', qty: 5, sortOrder: 3 },
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
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.3, sortOrder: 2 },
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
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 0.5, sortOrder: 1 },
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
      { itemCode: 'MAT-023', itemType: 'material', name: 'NYY-J 5×2.5', unit: 'm', qty: 0.5, sortOrder: 1 },
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
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.5, sortOrder: 1 },
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
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.4, sortOrder: 0 },
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
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.4, sortOrder: 1 },
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
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 1.0, sortOrder: 3 },
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
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.5, sortOrder: 1 },
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
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 0.5, sortOrder: 1 },
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
      { itemCode: 'MAT-074', itemType: 'material', name: 'Adatkábel Cat6 UTP', unit: 'm', qty: 0.3, sortOrder: 3 },
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
      { itemCode: 'MAT-020', itemType: 'material', name: 'NYM-J 3×1.5', unit: 'm', qty: 0.5, sortOrder: 1 },
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
      { itemCode: 'MAT-094', itemType: 'material', name: 'Kábel 2×0.75mm² (csengőkábel)', unit: 'm', qty: 8, sortOrder: 1 },
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
      { itemCode: 'MAT-023', itemType: 'material', name: 'NYY-J 5×2.5', unit: 'm', qty: 10, sortOrder: 0 },
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
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 6, sortOrder: 0 },
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
      { itemCode: 'MAT-021', itemType: 'material', name: 'NYM-J 3×2.5', unit: 'm', qty: 8, sortOrder: 0 },
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

// ─── Variant System helpers ──────────────────────────────────────────────────
// Enterprise-level assembly variant management

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
