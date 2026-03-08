// ─── TakeoffPro Settings Store ────────────────────────────────────────────────
// localStorage-alapú beállítás kezelés
// Minden céges adat itt tárolódik

import { WORK_ITEMS_DEFAULT, ASSEMBLIES_DEFAULT, ASSEMBLY_VARIANT_GROUPS, generateAssemblyId } from './workItemsDb.js'

const LS_KEYS = {
  SETTINGS:   'takeoffpro_settings',
  WORK_ITEMS: 'takeoffpro_work_items',
  ASSEMBLIES: 'takeoffpro_assemblies',
  MATERIALS:  'takeoffpro_materials',
  QUOTES:     'takeoffpro_quotes',
  TEMPLATES:  'takeoffpro_templates',
  ASM_STATS:  'takeoffpro_asm_stats',
}

// ─── Default settings ────────────────────────────────────────────────────────
export const DEFAULT_SETTINGS = {
  company: {
    name: '',
    address: '',
    tax_number: '',
    phone: '',
    email: '',
    bank_account: '',
    logo_url: '',
  },
  labor: {
    hourly_rate: 9000,       // Ft/óra
    overtime_multiplier: 1.3,
    weekend_multiplier: 1.5,
    // Markup vs Margin distinction (Phase 1.4)
    // markup_type: 'markup'  →  grandTotal = subtotal × (1 + pct/100)
    // markup_type: 'margin'  →  grandTotal = subtotal / (1 − pct/100)
    markup_percent: 15,
    markup_type: 'markup',   // 'markup' | 'margin'
    vat_percent: 27,
    // Labor difficulty mode: affects p50/p90 column selection + productivity multiplier
    difficulty_mode: 'normal',  // 'normal' | 'difficult' | 'very_difficult'
  },
  overhead: {
    visits: 2,
    minutes_per_visit: 50,  // kiszállás + felvonulás
    travel_cost_per_visit: 3500, // Ft
  },
  context_defaults: {
    // Group 1: Helyszíni körülmények
    wall_material:  'brick',
    access:         'empty',
    project_type:   'renovation',
    height:         'normal',
    // Group 2: Projekt komplexitás
    layout_complexity: 'normal',
    concurrent_trades: 'none',
    prefabrication:    'standard',
    // Group 3: Munkakörülmények
    overtime:           'normal',
    weather_environment:'normal',
    // Group 4: Tapasztalat & tervezés
    engineering_changes:'none',
    crew_experience:    'normal',
  },
  quote: {
    validity_days: 30,
    footer_text: 'Az ajánlat mennyiségkimutatáson alapul. Helyszíni felmérés alapján módosítható.',
    default_notes: '',
    default_validity_text: 'Az ajánlat kiállítástól számított 30 napig érvényes.',
    default_payment_terms_text: 'Fizetési feltételek: a teljesítést követően, számla ellenében, 8 napon belül.',
    default_inclusions: '',
    default_exclusions: '',
  }
}

// ─── Default materials ─────────────────────────────────────────────────────────
// Árak: 2025-2026 magyar piaci átlagárak (bruttó, Ft) – csak az árakat frissítettük
export const DEFAULT_MATERIALS = [
  // Szerelvény dobozok
  { code: 'MAT-001', name: 'Szerelvénydoboz 65mm (mélyített)', unit: 'db', price: 220, discount: 0, category: 'doboz' },
  { code: 'MAT-002', name: 'Szerelvénydoboz 65mm (normál)', unit: 'db', price: 160, discount: 0, category: 'doboz' },
  { code: 'MAT-003', name: 'Kötődoboz 80×80mm', unit: 'db', price: 290, discount: 0, category: 'doboz' },
  { code: 'MAT-004', name: 'Kötődoboz 100×100mm', unit: 'db', price: 480, discount: 0, category: 'doboz' },
  // Szerelvények
  { code: 'MAT-010', name: 'Dugalj 2P+F (fehér, alap)', unit: 'db', price: 750, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-011', name: 'Dugalj 2P+F IP44', unit: 'db', price: 1450, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-012', name: 'Kapcsoló 1G (fehér)', unit: 'db', price: 650, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-013', name: 'Kapcsoló 2G (fehér)', unit: 'db', price: 1100, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-014', name: 'Váltókapcsoló', unit: 'db', price: 900, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-015', name: 'Fedőlap (fehér)', unit: 'db', price: 320, discount: 0, category: 'szerelvenyek' },
  // Kábelek (Ft/m)
  { code: 'MAT-020', name: 'NYM-J 3×1.5', unit: 'm', price: 290, discount: 0, category: 'kabel' },
  { code: 'MAT-021', name: 'NYM-J 3×2.5', unit: 'm', price: 450, discount: 0, category: 'kabel' },
  { code: 'MAT-022', name: 'NYY-J 3×2.5', unit: 'm', price: 620, discount: 0, category: 'kabel' },
  { code: 'MAT-023', name: 'NYY-J 5×2.5', unit: 'm', price: 870, discount: 0, category: 'kabel' },
  { code: 'MAT-024', name: 'NYY-J 5×4', unit: 'm', price: 1600, discount: 0, category: 'kabel' },
  { code: 'MAT-025', name: 'NYY-J 5×6', unit: 'm', price: 2350, discount: 0, category: 'kabel' },
  { code: 'MAT-026', name: 'NYY-J 5×10', unit: 'm', price: 3900, discount: 0, category: 'kabel' },
  { code: 'MAT-027', name: 'CYKY 3×1.5', unit: 'm', price: 275, discount: 0, category: 'kabel' },
  // Kábeltálca (Ft/m)
  { code: 'MAT-030', name: 'Kábeltálca 100×60 (perforált)', unit: 'm', price: 1100, discount: 0, category: 'talca' },
  { code: 'MAT-031', name: 'Kábeltálca 200×60', unit: 'm', price: 1750, discount: 0, category: 'talca' },
  { code: 'MAT-032', name: 'Kábeltálca 300×60', unit: 'm', price: 2400, discount: 0, category: 'talca' },
  { code: 'MAT-033', name: 'Kábeltálca 400×60', unit: 'm', price: 3100, discount: 0, category: 'talca' },
  { code: 'MAT-034', name: 'Kábeltálca 500×60', unit: 'm', price: 3950, discount: 0, category: 'talca' },
  { code: 'MAT-035', name: 'Kábeltálca 600×60', unit: 'm', price: 4800, discount: 0, category: 'talca' },
  { code: 'MAT-036', name: 'Kábeltálca tartó', unit: 'db', price: 490, discount: 0, category: 'talca' },
  // Biztosítékok, megszakítók
  { code: 'MAT-040', name: 'Kismegszakító 1P 10A', unit: 'db', price: 1280, discount: 0, category: 'vedelem' },
  { code: 'MAT-041', name: 'Kismegszakító 1P 16A', unit: 'db', price: 1300, discount: 0, category: 'vedelem' },
  { code: 'MAT-042', name: 'Kismegszakító 3P 16A', unit: 'db', price: 4400, discount: 0, category: 'vedelem' },
  { code: 'MAT-043', name: 'FI-relé 2P 40A 30mA', unit: 'db', price: 10500, discount: 0, category: 'vedelem' },
  { code: 'MAT-044', name: 'FI-relé 4P 40A 30mA', unit: 'db', price: 18000, discount: 0, category: 'vedelem' },
  // Kismegszakítók bővítés
  { code: 'MAT-045', name: 'Kismegszakító 1P 20A', unit: 'db', price: 1400, discount: 0, category: 'vedelem' },
  { code: 'MAT-046', name: 'Kismegszakító 1P 32A', unit: 'db', price: 1750, discount: 0, category: 'vedelem' },
  { code: 'MAT-047', name: 'Kismegszakító 3P 20A', unit: 'db', price: 5300, discount: 0, category: 'vedelem' },
  { code: 'MAT-048', name: 'Kismegszakító 3P 32A', unit: 'db', price: 7200, discount: 0, category: 'vedelem' },
  // Ipari dugaljak (CEE)
  { code: 'MAT-050', name: 'CEE dugalj 1P+N+F 16A (IP44)', unit: 'db', price: 2400, discount: 0, category: 'ipari' },
  { code: 'MAT-051', name: 'CEE dugalj 1P+N+F 32A (IP44)', unit: 'db', price: 3500, discount: 0, category: 'ipari' },
  { code: 'MAT-052', name: 'CEE dugalj 3P+N+F 16A (IP44)', unit: 'db', price: 3700, discount: 0, category: 'ipari' },
  { code: 'MAT-053', name: 'CEE dugalj 3P+N+F 32A (IP44)', unit: 'db', price: 5800, discount: 0, category: 'ipari' },
  { code: 'MAT-054', name: 'CEE dugasz 3P+N+F 32A', unit: 'db', price: 5300, discount: 0, category: 'ipari' },
  // Elosztótáblák
  { code: 'MAT-060', name: 'Elosztótábla 12M süllyesztett', unit: 'db', price: 7000, discount: 0, category: 'elosztok' },
  { code: 'MAT-061', name: 'Elosztótábla 24M süllyesztett', unit: 'db', price: 11500, discount: 0, category: 'elosztok' },
  { code: 'MAT-062', name: 'Elosztótábla 36M süllyesztett', unit: 'db', price: 17000, discount: 0, category: 'elosztok' },
  { code: 'MAT-063', name: 'DIN sín 1m', unit: 'db', price: 580, discount: 0, category: 'elosztok' },
  { code: 'MAT-064', name: 'N/PE elosztó sín', unit: 'db', price: 490, discount: 0, category: 'elosztok' },
  // Gyengeáram
  { code: 'MAT-070', name: 'Adataljzat RJ45 Cat6 (fehér)', unit: 'db', price: 1200, discount: 0, category: 'gyengaram' },
  { code: 'MAT-071', name: 'TV/koax aljzat (fehér)', unit: 'db', price: 800, discount: 0, category: 'gyengaram' },
  { code: 'MAT-072', name: 'Füstérzékelő 230V (optikai)', unit: 'db', price: 4800, discount: 0, category: 'gyengaram' },
  { code: 'MAT-073', name: 'Kaputelefon szett (beltéri + kültéri)', unit: 'db', price: 38000, discount: 0, category: 'gyengaram' },
  { code: 'MAT-074', name: 'Adatkábel Cat6 UTP (doboz 305m)', unit: 'm', price: 160, discount: 0, category: 'gyengaram' },
  // Segédanyagok, kötések
  { code: 'MAT-080', name: 'WAGO 222-413 (3-pólusú)', unit: 'db', price: 210, discount: 0, category: 'seged' },
  { code: 'MAT-081', name: 'WAGO 222-415 (5-pólusú)', unit: 'db', price: 300, discount: 0, category: 'seged' },
  { code: 'MAT-082', name: 'Érjelölő spirál (csomag)', unit: 'csomag', price: 490, discount: 0, category: 'seged' },
  { code: 'MAT-083', name: 'Kábeltömítő M20', unit: 'db', price: 170, discount: 0, category: 'seged' },
  { code: 'MAT-084', name: 'Rugós bilincs 20mm', unit: 'db', price: 80, discount: 0, category: 'seged' },
  // Szerelvények bővítés
  { code: 'MAT-090', name: 'Mozgásérzékelős kapcsoló 230V (fehér)', unit: 'db', price: 5200, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-091', name: 'Digitális programozható termosztát 230V', unit: 'db', price: 14000, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-092', name: 'Csengő nyomógomb (fehér)', unit: 'db', price: 1600, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-093', name: 'Elektronikus csengő 230V', unit: 'db', price: 3800, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-094', name: 'Kábel 2×0.75mm² (csengőkábel, m)', unit: 'm', price: 190, discount: 0, category: 'kabel' },
  { code: 'MAT-095', name: 'Dupla dugalj keret (2×2P+F)', unit: 'db', price: 2500, discount: 0, category: 'szerelvenyek' },
  // Világítás anyagok
  { code: 'MAT-100', name: 'LED szalag 4000K 14W/m IP20 (m)', unit: 'm', price: 2400, discount: 0, category: 'vilagitas' },
  { code: 'MAT-101', name: 'LED szalag tápegység 60W 24V', unit: 'db', price: 3600, discount: 0, category: 'vilagitas' },
  { code: 'MAT-102', name: 'LED szalag alumínium profil (m)', unit: 'm', price: 1500, discount: 0, category: 'vilagitas' },
  { code: 'MAT-103', name: 'Vészvilágítás egység 1h önálló', unit: 'db', price: 14500, discount: 0, category: 'vilagitas' },
  { code: 'MAT-104', name: 'Kábeltálca fedél 100mm (m)', unit: 'm', price: 620, discount: 0, category: 'talca' },
  { code: 'MAT-105', name: 'Kábeltálca fedél 200mm (m)', unit: 'm', price: 950, discount: 0, category: 'talca' },
  { code: 'MAT-106', name: 'Kábeltálca fedél 300mm (m)', unit: 'm', price: 1250, discount: 0, category: 'talca' },
  // Speciális kábelek
  { code: 'MAT-110', name: 'NYY-J 5×16 (m)', unit: 'm', price: 6800, discount: 0, category: 'kabel' },
  { code: 'MAT-111', name: 'NYY-J 5×25 (m)', unit: 'm', price: 10500, discount: 0, category: 'kabel' },
  { code: 'MAT-112', name: 'NYY-J 3×6 (m)', unit: 'm', price: 1600, discount: 0, category: 'kabel' },
  { code: 'MAT-113', name: 'NYM-J 5×2.5 (m)', unit: 'm', price: 850, discount: 0, category: 'kabel' },
  // Védőcsövek
  { code: 'MAT-120', name: 'Védőcső PVC 20mm (m)', unit: 'm', price: 120, discount: 0, category: 'seged' },
  { code: 'MAT-121', name: 'Védőcső PVC 25mm (m)', unit: 'm', price: 155, discount: 0, category: 'seged' },
  { code: 'MAT-122', name: 'Gégecső 20mm flexibilis (m)', unit: 'm', price: 160, discount: 0, category: 'seged' },
  { code: 'MAT-123', name: 'Gégecső 25mm flexibilis (m)', unit: 'm', price: 220, discount: 0, category: 'seged' },
  { code: 'MAT-124', name: 'Kábelbilics 20mm', unit: 'db', price: 40, discount: 0, category: 'seged' },
  { code: 'MAT-125', name: 'Kábelsaru 6mm² (csomag/50)', unit: 'csomag', price: 2400, discount: 0, category: 'seged' },
  { code: 'MAT-126', name: 'Kábelsaru 10mm² (csomag/50)', unit: 'csomag', price: 2900, discount: 0, category: 'seged' },
  { code: 'MAT-127', name: 'Érjelölő gyűrű szett', unit: 'db', price: 580, discount: 0, category: 'seged' },
  { code: 'MAT-128', name: 'WAGO 221-412 (2-pólusú)', unit: 'db', price: 165, discount: 0, category: 'seged' },
  { code: 'MAT-129', name: 'WAGO 221-615 (5-pólusú leveres)', unit: 'db', price: 310, discount: 0, category: 'seged' },
  // Kiegészítő szerelvények
  { code: 'MAT-130', name: 'Dimmer kapcsoló (LED kompatibilis)', unit: 'db', price: 6500, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-131', name: 'Redőnykapcsoló', unit: 'db', price: 3200, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-132', name: 'Kulcsos kapcsoló', unit: 'db', price: 5500, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-133', name: 'USB-s dugalj (2×USB-A)', unit: 'db', price: 4800, discount: 0, category: 'szerelvenyek' },
  { code: 'MAT-134', name: 'Padlódoboz 4M (rozsdamentes)', unit: 'db', price: 13000, discount: 0, category: 'szerelvenyek' },
  // Kiegészítő védelem
  { code: 'MAT-140', name: 'Kismegszakító 1P 6A', unit: 'db', price: 1200, discount: 0, category: 'vedelem' },
  { code: 'MAT-141', name: 'Kismegszakító 1P 25A', unit: 'db', price: 1450, discount: 0, category: 'vedelem' },
  { code: 'MAT-142', name: 'Kismegszakító 3P 25A', unit: 'db', price: 5600, discount: 0, category: 'vedelem' },
  { code: 'MAT-143', name: 'Kismegszakító 3P 40A', unit: 'db', price: 8000, discount: 0, category: 'vedelem' },
  { code: 'MAT-144', name: 'Kismegszakító 3P 63A', unit: 'db', price: 11500, discount: 0, category: 'vedelem' },
  { code: 'MAT-145', name: 'FI-relé 2P 25A 30mA', unit: 'db', price: 9000, discount: 0, category: 'vedelem' },
  { code: 'MAT-146', name: 'Kombinált FI-MCB 1P+N 16A 30mA', unit: 'db', price: 13500, discount: 0, category: 'vedelem' },
  { code: 'MAT-147', name: 'Túlfeszültség-védő T2 3P+N', unit: 'db', price: 16000, discount: 0, category: 'vedelem' },
  { code: 'MAT-148', name: 'Főkapcsoló 3P 63A', unit: 'db', price: 7200, discount: 0, category: 'vedelem' },
  { code: 'MAT-149', name: 'Időrelé (lépcsőházi)', unit: 'db', price: 6000, discount: 0, category: 'vedelem' },
  // Elosztó kiegészítés
  { code: 'MAT-066', name: 'Elosztótábla 48M süllyesztett', unit: 'db', price: 23000, discount: 0, category: 'elosztok' },
  { code: 'MAT-067', name: 'Elosztó szekrény IP54 fém (fali)', unit: 'db', price: 85000, discount: 0, category: 'elosztok' },
  // Világítás kiegészítés
  { code: 'MAT-150', name: 'LED panel 60×60 40W 4000K', unit: 'db', price: 11000, discount: 0, category: 'vilagitas' },
  { code: 'MAT-151', name: 'LED downlight 7W süllyesztett', unit: 'db', price: 3800, discount: 0, category: 'vilagitas' },
  { code: 'MAT-152', name: 'LED csarnokvilágító 100W IP65', unit: 'db', price: 26000, discount: 0, category: 'vilagitas' },
  { code: 'MAT-153', name: 'LED fali lámpatest IP44', unit: 'db', price: 7500, discount: 0, category: 'vilagitas' },
  { code: 'MAT-154', name: 'Mennyezeti lámpatartó kampó', unit: 'db', price: 250, discount: 0, category: 'vilagitas' },
  // Gyengeáram kiegészítés
  { code: 'MAT-076', name: 'Koax kábel RG6 (m)', unit: 'm', price: 200, discount: 0, category: 'gyengaram' },
  { code: 'MAT-077', name: 'Riasztó mozgásérzékelő (PIR)', unit: 'db', price: 7500, discount: 0, category: 'gyengaram' },
  { code: 'MAT-078', name: 'Riasztó központ 8 zónás', unit: 'db', price: 45000, discount: 0, category: 'gyengaram' },
  { code: 'MAT-079', name: 'IP kamera PoE kültéri', unit: 'db', price: 30000, discount: 0, category: 'gyengaram' },
  // Ipari kiegészítés
  { code: 'MAT-056', name: 'CEE dugalj 3P+N+F 63A (IP44)', unit: 'db', price: 10500, discount: 0, category: 'ipari' },
  { code: 'MAT-057', name: 'Ipari elosztó (mobil, 4×16A+2×32A)', unit: 'db', price: 95000, discount: 0, category: 'ipari' },

  // ── Gyengeáram – Strukturált hálózat ──────────────────────────────────────
  { code: 'MAT-WE-CAT6A-JACK',  name: 'Cat6A keystone jack (árnyékolt)',       unit: 'db', price: 2800,  discount: 0, category: 'gyengaram_halozat' },
  { code: 'MAT-WE-CAT6A-CABLE', name: 'Cat6A S/FTP kábel (m)',                 unit: 'm',  price: 420,   discount: 0, category: 'gyengaram_halozat' },
  { code: 'MAT-WE-FIBER-CABLE', name: 'Optikai kábel OM3 4-szálas (m)',        unit: 'm',  price: 650,   discount: 0, category: 'gyengaram_halozat' },
  { code: 'MAT-WE-FIBER-PANEL', name: 'Optikai patch panel 12 portos',         unit: 'db', price: 18000, discount: 0, category: 'gyengaram_halozat' },
  { code: 'MAT-WE-FIBER-PIGTAIL',name:'Optikai pigtail SC/APC (db)',           unit: 'db', price: 1200,  discount: 0, category: 'gyengaram_halozat' },
  { code: 'MAT-WE-AP-BRACKET',  name: 'WiFi AP mennyezeti tartó',              unit: 'db', price: 3500,  discount: 0, category: 'gyengaram_halozat' },
  { code: 'MAT-WE-PATCH24',     name: 'Patch panel 24 port Cat6A',             unit: 'db', price: 22000, discount: 0, category: 'gyengaram_halozat' },
  { code: 'MAT-WE-SWITCH24',    name: 'Hálózati switch 24 port PoE managed',   unit: 'db', price: 185000,discount: 0, category: 'gyengaram_halozat' },
  { code: 'MAT-WE-UPS-RACK',    name: 'Rack UPS 1500VA online',                unit: 'db', price: 145000,discount: 0, category: 'gyengaram_halozat' },
  { code: 'MAT-WE-RACK',        name: '19" szerver szekrény 22U',              unit: 'db', price: 95000, discount: 0, category: 'gyengaram_halozat' },
  { code: 'MAT-WE-PSU-DIN24',   name: 'DIN tápegység 24V/2.5A',               unit: 'db', price: 12000, discount: 0, category: 'gyengaram_halozat' },
  { code: 'MAT-WE-PSU-12V',     name: 'Tápegység 12V/5A dobozos',             unit: 'db', price: 8500,  discount: 0, category: 'gyengaram_halozat' },

  // ── Gyengeáram – Biztonságtechnika ────────────────────────────────────────
  { code: 'MAT-WE-CAM-BRACKET', name: 'Kameratartó konzol (fali/mennyezeti)',  unit: 'db', price: 4500,  discount: 0, category: 'gyengaram_biztonsag' },
  { code: 'MAT-WE-ALARM-CABLE', name: 'Riasztó kábel 2×0.75+4×0.22 (m)',      unit: 'm',  price: 280,   discount: 0, category: 'gyengaram_biztonsag' },
  { code: 'MAT-WE-ALARM-BATT',  name: 'Riasztó központ akkumulátor 12V/7Ah',   unit: 'db', price: 6500,  discount: 0, category: 'gyengaram_biztonsag' },
  { code: 'MAT-WE-ALARM-SIREN', name: 'Kültéri sziréna LED villogóval',        unit: 'db', price: 14000, discount: 0, category: 'gyengaram_biztonsag' },
  { code: 'MAT-WE-REED',        name: 'Nyitásérzékelő reed kontakt (felületi)',unit: 'db', price: 2200,  discount: 0, category: 'gyengaram_biztonsag' },
  { code: 'MAT-WE-READER',      name: 'Proximity kártyaolvasó (MIFARE)',       unit: 'db', price: 25000, discount: 0, category: 'gyengaram_biztonsag' },
  { code: 'MAT-WE-ACCESS-CTRL', name: 'Beléptető vezérlő 2 ajtós',            unit: 'db', price: 65000, discount: 0, category: 'gyengaram_biztonsag' },
  { code: 'MAT-WE-PA-SPEAKER',  name: 'Mennyezeti PA hangszóró 6W',            unit: 'db', price: 12000, discount: 0, category: 'gyengaram_biztonsag' },
  { code: 'MAT-WE-INTERCOM',    name: 'IP kaputelefon kültéri egység',         unit: 'db', price: 85000, discount: 0, category: 'gyengaram_biztonsag' },
  { code: 'MAT-WE-INTERCOM-IN', name: 'IP kaputelefon beltéri monitor 7"',     unit: 'db', price: 55000, discount: 0, category: 'gyengaram_biztonsag' },
  { code: 'MAT-WE-NVR',        name: 'NVR 8 csatornás PoE',                  unit: 'db', price: 120000,discount: 0, category: 'gyengaram_biztonsag' },
  { code: 'MAT-WE-ELOCK',      name: 'Elektromos zár 12V (ajtónyitó)',       unit: 'db', price: 15000, discount: 0, category: 'gyengaram_biztonsag' },
  { code: 'MAT-WE-POE-INJ',    name: 'PoE injector 30W',                     unit: 'db', price: 8000,  discount: 0, category: 'gyengaram_halozat' },
  { code: 'MAT-WE-CAM-BOX',    name: 'Kültéri kameradoboz IP66',             unit: 'db', price: 12000, discount: 0, category: 'gyengaram_biztonsag' },

  // ── Tűzjelző – Érzékelők ─────────────────────────────────────────────────
  { code: 'MAT-FA-OPT-SMOKE',   name: 'Címezhető optikai füstérzékelő',       unit: 'db', price: 18000, discount: 0, category: 'tuzjelzo_erzekelo' },
  { code: 'MAT-FA-HEAT',        name: 'Címezhető hőérzékelő',                 unit: 'db', price: 16000, discount: 0, category: 'tuzjelzo_erzekelo' },
  { code: 'MAT-FA-MULTI',       name: 'Címezhető multiszenzoros érzékelő',     unit: 'db', price: 28000, discount: 0, category: 'tuzjelzo_erzekelo' },
  { code: 'MAT-FA-BASE',        name: 'Érzékelő aljzat (univerzális)',         unit: 'db', price: 3500,  discount: 0, category: 'tuzjelzo_erzekelo' },
  { code: 'MAT-FA-MCP',         name: 'Kézi jelzésadó (címezhető)',            unit: 'db', price: 22000, discount: 0, category: 'tuzjelzo_erzekelo' },
  { code: 'MAT-FA-SOUNDER',     name: 'Hang-fényjelző (piros, címezhető)',     unit: 'db', price: 35000, discount: 0, category: 'tuzjelzo_erzekelo' },

  // ── Tűzjelző – Központ & rendszer ─────────────────────────────────────────
  { code: 'MAT-FA-JYSTY',       name: 'JE-H(St)H E30 2×2×0.8 tűzjelző kábel (m)', unit: 'm',  price: 520,   discount: 0, category: 'tuzjelzo_kozpont' },
  { code: 'MAT-FA-PANEL',       name: 'Tűzjelző központ 2 hurkos',             unit: 'db', price: 380000,discount: 0, category: 'tuzjelzo_kozpont' },
  { code: 'MAT-FA-BATT',        name: 'Központ akkumulátor 12V/24Ah',          unit: 'db', price: 18000, discount: 0, category: 'tuzjelzo_kozpont' },
  { code: 'MAT-FA-REPEATER',    name: 'Kezelőegység (távoli kijelző)',          unit: 'db', price: 120000,discount: 0, category: 'tuzjelzo_kozpont' },
  { code: 'MAT-FA-IO-MODULE',   name: 'Címezhető I/O modul (relés)',           unit: 'db', price: 32000, discount: 0, category: 'tuzjelzo_kozpont' },
  { code: 'MAT-FA-FIRESTOP',    name: 'Tűzgátló habarcs készlet (1 áttörés)',  unit: 'db', price: 8500,  discount: 0, category: 'tuzjelzo_kozpont' },
  { code: 'MAT-FA-PIPE-E30',   name: 'Tűzálló védőcső 20mm E30',             unit: 'm',  price: 850,   discount: 0, category: 'tuzjelzo_kozpont' },
  { code: 'MAT-FA-JBOX-E30',   name: 'Tűzálló kötődoboz E30',               unit: 'db', price: 2800,  discount: 0, category: 'tuzjelzo_kozpont' },
  { code: 'MAT-FA-TRAY-E30',   name: 'Tűzálló kábeltálca 100mm E30',        unit: 'm',  price: 3500,  discount: 0, category: 'tuzjelzo_kozpont' },

  // ── Földelés / EPH ──────────────────────────────────────────────────────────
  { code: 'MAT-160', name: 'Földelő szonda 1.5m Cu-bevonat',        unit: 'db', price: 8500,  discount: 0, category: 'foldeles' },
  { code: 'MAT-161', name: 'EPH sín (egyenpotenciálú) Cu 10mm',     unit: 'db', price: 4200,  discount: 0, category: 'foldeles' },
  { code: 'MAT-162', name: 'EPH összekötő vezető 6mm² zöld-sárga',  unit: 'm',  price: 420,   discount: 0, category: 'foldeles' },
  { code: 'MAT-163', name: 'Földelő bilincs (szondához)',            unit: 'db', price: 1800,  discount: 0, category: 'foldeles' },

  // ── Védelem bővítés (Batch A) ───────────────────────────────────────────────
  { code: 'MAT-164', name: 'Fázissín (villás) 3P 12M',              unit: 'db', price: 3200,  discount: 0, category: 'vedelem' },
  { code: 'MAT-165', name: 'Túlfeszültség-védő T1+T2 3P+N',        unit: 'db', price: 45000, discount: 0, category: 'vedelem' },
  { code: 'MAT-166', name: 'Áramváltó 100/5A (DIN)',                 unit: 'db', price: 12000, discount: 0, category: 'vedelem' },
  { code: 'MAT-167', name: 'Digitális almérő 3F DIN',                unit: 'db', price: 18000, discount: 0, category: 'vedelem' },
]

// ─── Storage helpers ──────────────────────────────────────────────────────────

/** localStorage quota tracking — warns when usage exceeds threshold */
const LS_QUOTA_WARN_BYTES = 4 * 1024 * 1024  // 4 MB — warn before hitting 5 MB limit

function estimateLocalStorageUsage() {
  try {
    let total = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      total += (key?.length || 0) + (localStorage.getItem(key)?.length || 0)
    }
    return total * 2  // UTF-16 → 2 bytes per char
  } catch { return -1 }
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw)
  } catch (err) {
    console.warn(`[TakeoffPro] localStorage load failed for "${key}":`, err.message)
    return fallback
  }
}

function save(key, value) {
  try {
    const json = JSON.stringify(value)
    localStorage.setItem(key, json)

    // Quota monitoring — warn if usage is high
    const usage = estimateLocalStorageUsage()
    if (usage > LS_QUOTA_WARN_BYTES) {
      const msg = `Tárhely közel a limithez: ${(usage / 1024 / 1024).toFixed(1)} MB / ~5 MB`
      console.warn(`[TakeoffPro] ${msg}`)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('takeoffpro:storage-error', {
          detail: { key, error: msg, type: 'quota-warning' }
        }))
      }
    }
  } catch (err) {
    console.error(`[TakeoffPro] localStorage save FAILED for "${key}":`, err.message)
    // Surface to user via custom event so UI can show notification
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('takeoffpro:storage-error', {
        detail: { key, error: err.message, type: 'write' }
      }))
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function loadSettings() {
  const stored = load(LS_KEYS.SETTINGS, {})
  const merged = { ...DEFAULT_SETTINGS, ...stored }

  // ── Migration: default_margin (multiplier) → markup_percent + markup_type ──
  if (stored?.labor?.default_margin != null && stored?.labor?.markup_percent == null) {
    const old = parseFloat(stored.labor.default_margin) || 1.15
    merged.labor = {
      ...merged.labor,
      markup_percent: Math.round((old - 1) * 100),
      markup_type: 'markup',
    }
    delete merged.labor.default_margin
    // Persist migration immediately
    saveSettings(merged)
  }

  // ── Deep-merge labor sub-object to avoid losing new fields ──
  if (stored?.labor) {
    merged.labor = { ...DEFAULT_SETTINGS.labor, ...stored.labor }
    if (stored.labor.default_margin != null) delete merged.labor.default_margin
  }

  // ── Deep-merge context_defaults so new NECA factors get their defaults ──
  if (stored?.context_defaults) {
    merged.context_defaults = { ...DEFAULT_SETTINGS.context_defaults, ...stored.context_defaults }
  }

  // ── Deep-merge quote sub-object so new default text fields appear ──
  if (stored?.quote) {
    merged.quote = { ...DEFAULT_SETTINGS.quote, ...stored.quote }
  }

  return merged
}
export function saveSettings(settings) {
  save(LS_KEYS.SETTINGS, settings)
}

export function loadWorkItems() {
  return load(LS_KEYS.WORK_ITEMS, WORK_ITEMS_DEFAULT)
}
export function saveWorkItems(items) {
  save(LS_KEYS.WORK_ITEMS, items)
}

export function loadAssemblies() {
  const stored = load(LS_KEYS.ASSEMBLIES, null)
  // Ha még nincs semmi mentve → adjuk vissza az összes alapértelmezett assembly-t (with derived countSelectable)
  if (!stored) {
    const NON_COUNT_CATS = ['kabelezes', 'kabeltalca', 'meres']
    const PKG_PAT = ['rendszer (komplett', 'komplett szett', 'központ', 'programozás', 'üzembe helyezés', 'szegmens', 'rack', 'patch panel', 'switch', 'nvr rendszer', 'ups', 'kontroller', 'átadás']
    for (const a of ASSEMBLIES_DEFAULT) {
      if (a.countSelectable !== undefined) continue
      if (a.variantOf || NON_COUNT_CATS.includes(a.category)) { a.countSelectable = false }
      else { const nl = (a.name || '').toLowerCase(); a.countSelectable = !PKG_PAT.some(p => nl.includes(p.toLowerCase())) }
    }
    return ASSEMBLIES_DEFAULT
  }

  let needsSave = false
  const defaultMap = new Map(ASSEMBLIES_DEFAULT.map(a => [a.id, a]))

  // 1) Migráció: hiányzó assembly-k hozzáadása
  const storedIds = new Set(stored.map(a => a.id))
  const missing = ASSEMBLIES_DEFAULT.filter(a => !storedIds.has(a.id))
  if (missing.length > 0) {
    stored.push(...missing)
    missing.forEach(a => storedIds.add(a.id))
    needsSave = true
  }

  // 2) Variáns/tags migráció: meglévő assembly-khez hozzáadjuk az új mezőket
  for (const asm of stored) {
    const def = defaultMap.get(asm.id)
    if (!def) continue
    // Tags migráció
    if (!asm.tags && def.tags) {
      asm.tags = [...def.tags]
      needsSave = true
    }
    // Variáns migráció
    if (!asm.variants && def.variants) {
      asm.variants = JSON.parse(JSON.stringify(def.variants))
      needsSave = true
    }
    // variantOf migráció
    if (!asm.variantOf && def.variantOf) {
      asm.variantOf = def.variantOf
      needsSave = true
    }
  }

  // 3) countSelectable migráció — derive for assemblies that don't have it
  const NON_COUNTABLE_CATS = ['kabelezes', 'kabeltalca', 'meres']
  const PACKAGE_PATTERNS = [
    'rendszer (komplett', 'komplett szett', 'központ', 'programozás',
    'üzembe helyezés', 'szegmens', 'rack', 'patch panel',
    'switch', 'nvr rendszer', 'ups', 'kontroller', 'átadás',
  ]
  for (const asm of stored) {
    if (asm.countSelectable !== undefined) continue
    if (asm.variantOf || NON_COUNTABLE_CATS.includes(asm.category)) {
      asm.countSelectable = false
    } else {
      const nl = (asm.name || '').toLowerCase()
      asm.countSelectable = !PACKAGE_PATTERNS.some(p => nl.includes(p.toLowerCase()))
    }
    needsSave = true
  }

  if (needsSave) save(LS_KEYS.ASSEMBLIES, stored)
  return stored
}
export function saveAssemblies(assemblies) {
  save(LS_KEYS.ASSEMBLIES, assemblies)
}

export function loadMaterials() {
  const stored = load(LS_KEYS.MATERIALS, null)
  if (!stored) return DEFAULT_MATERIALS

  // Migráció: új default anyagok hozzáadása (pl. gyengeáram/tűzjelző bővítés)
  const storedCodes = new Set(stored.map(m => m.code))
  const missing = DEFAULT_MATERIALS.filter(m => !storedCodes.has(m.code))
  if (missing.length > 0) {
    stored.push(...missing)
    save(LS_KEYS.MATERIALS, stored)
  }
  return stored
}
export function saveMaterials(materials) {
  save(LS_KEYS.MATERIALS, materials)
}

export function loadQuotes() {
  return load(LS_KEYS.QUOTES, [])
}
export function saveQuotes(quotes) {
  save(LS_KEYS.QUOTES, quotes)
}

export function saveQuote(quote) {
  const quotes = loadQuotes()
  const idx = quotes.findIndex(q => q.id === quote.id)
  if (idx >= 0) {
    quotes[idx] = quote
  } else {
    quotes.unshift(quote)
  }
  saveQuotes(quotes)
  return quote
}

export function generateQuoteId() {
  const year = new Date().getFullYear()
  const quotes = loadQuotes()
  const yearQuotes = quotes.filter(q => q.id?.startsWith(`QT-${year}`))
  const num = String(yearQuotes.length + 1).padStart(3, '0')
  return `QT-${year}-${num}`
}

// ─── Project Template System ──────────────────────────────────────────────────
// Teljes projekt sablon: assembly konfiguráció snapshot mentés/visszaállítás

export function loadTemplates() {
  return load(LS_KEYS.TEMPLATES, [])
}

export function saveTemplate(template) {
  const templates = loadTemplates()
  const now = new Date().toISOString()
  const existing = templates.findIndex(t => t.id === template.id)

  if (existing >= 0) {
    templates[existing] = { ...template, updatedAt: now }
  } else {
    templates.unshift({
      id: template.id || `TPL-${Date.now()}`,
      name: template.name,
      description: template.description || '',
      category: template.category || 'general', // residential, commercial, industrial
      assemblies: template.assemblies, // assembly id lista + quantity + variantKey
      settings: template.settings || {}, // context defaults, labor overrides
      createdAt: now,
      updatedAt: now,
    })
  }
  save(LS_KEYS.TEMPLATES, templates)
  return templates[existing >= 0 ? existing : 0]
}

export function deleteTemplate(templateId) {
  const templates = loadTemplates().filter(t => t.id !== templateId)
  save(LS_KEYS.TEMPLATES, templates)
  return templates
}

export function createTemplateFromQuote(quote, name) {
  // Árajánlatból sablon generálás – a hozzárendelt assembly-ket snapshotolja
  const assemblies = (quote.rooms || []).flatMap(room =>
    (room.items || []).map(item => ({
      assemblyId: item.assemblyId,
      variantKey: item.variantKey || null,
      quantity: item.quantity || 1,
      roomType: room.name || '',
    }))
  )
  return saveTemplate({
    name: name || `${quote.client_name || 'Projekt'} sablon`,
    description: `Generálva: ${quote.id || 'ismeretlen'} árajánlatból`,
    category: quote.project_type || 'general',
    assemblies,
    settings: {
      context: quote.context || {},
    },
  })
}

// ─── Assembly Statistics ──────────────────────────────────────────────────────
// Használati statisztika: melyik assembly-t hányszor rendelték hozzá

export function loadAsmStats() {
  return load(LS_KEYS.ASM_STATS, {})
}

export function trackAsmUsage(assemblyId, variantKey = null) {
  const stats = loadAsmStats()
  const key = variantKey ? `${assemblyId}::${variantKey}` : assemblyId

  if (!stats[key]) {
    stats[key] = { count: 0, lastUsed: null, firstUsed: new Date().toISOString() }
  }
  stats[key].count += 1
  stats[key].lastUsed = new Date().toISOString()

  save(LS_KEYS.ASM_STATS, stats)
  return stats[key]
}

export function getTopAssemblies(limit = 10) {
  const stats = loadAsmStats()
  return Object.entries(stats)
    .map(([key, data]) => {
      const [assemblyId, variantKey] = key.split('::')
      return { assemblyId, variantKey: variantKey || null, ...data }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function getAssemblyUsageCount(assemblyId) {
  const stats = loadAsmStats()
  // Összesíti az assembly összes variánsának használatát
  return Object.entries(stats)
    .filter(([key]) => key === assemblyId || key.startsWith(`${assemblyId}::`))
    .reduce((sum, [, data]) => sum + data.count, 0)
}
