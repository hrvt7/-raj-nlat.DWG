import React, { useState } from 'react'
import { C, fmt, Card, Button, Input, SectionHeader } from '../components/ui.jsx'
import { saveSettings, saveMaterials, DEFAULT_MATERIALS } from '../data/store.js'

const TABS = [
  { key: 'company',   label: '🏢 Cégadatok' },
  { key: 'labor',     label: '⏱ Óradíjak' },
  { key: 'materials', label: '📦 Anyagárlista' },
  { key: 'overhead',  label: '🚗 Overhead' },
  { key: 'quote',     label: '📄 Ajánlat' },
]

export default function SettingsPage({ settings, onSettingsChange, materials, onMaterialsChange }) {
  const [activeTab, setActiveTab] = useState('company')

  const updateSettings = (path, value) => {
    const keys = path.split('.')
    const newSettings = { ...settings }
    let obj = newSettings
    for (let i = 0; i < keys.length - 1; i++) {
      obj[keys[i]] = { ...obj[keys[i]] }
      obj = obj[keys[i]]
    }
    obj[keys[keys.length - 1]] = value
    onSettingsChange(newSettings)
    saveSettings(newSettings)
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Syne', fontSize: 24, fontWeight: 800, color: C.text }}>Beállítások</h1>
        <p style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, marginTop: 4 }}>
          Céges adatok, óradíjak, anyagárak – egyszer beállítod, mindig ebből számol
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 28 }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '10px 18px', background: 'transparent', border: 'none',
            borderBottom: activeTab === tab.key ? `2px solid ${C.accent}` : '2px solid transparent',
            color: activeTab === tab.key ? C.accent : C.textSub,
            fontFamily: 'Syne', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            transition: 'all 0.15s', whiteSpace: 'nowrap',
            marginBottom: -1
          }}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'company' && (
        <CompanyTab settings={settings} update={updateSettings} />
      )}
      {activeTab === 'labor' && (
        <LaborTab settings={settings} update={updateSettings} />
      )}
      {activeTab === 'materials' && (
        <MaterialsTab materials={materials} onMaterialsChange={onMaterialsChange} />
      )}
      {activeTab === 'overhead' && (
        <OverheadTab settings={settings} update={updateSettings} />
      )}
      {activeTab === 'quote' && (
        <QuoteTab settings={settings} update={updateSettings} />
      )}
    </div>
  )
}

function FieldGroup({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>{children}</div>
}
function Field({ label, children, full }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: 11, color: C.textSub, fontFamily: 'DM Mono', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
    </div>
  )
}

function CompanyTab({ settings, update }) {
  const c = settings.company
  return (
    <Card style={{ padding: 28, maxWidth: 640 }}>
      <SectionHeader title="Céges adatok (fejlécen megjelenik az ajánlatokon)" />
      <FieldGroup>
        <Field label="Cég neve" full><Input value={c.name} onChange={v => update('company.name', v)} placeholder="pl. Kovács Villanyszerelés Kft." /></Field>
        <Field label="Cím"><Input value={c.address} onChange={v => update('company.address', v)} placeholder="1234 Budapest, Fő utca 1." /></Field>
        <Field label="Adószám"><Input value={c.tax_number} onChange={v => update('company.tax_number', v)} placeholder="12345678-2-11" /></Field>
        <Field label="Telefon"><Input value={c.phone} onChange={v => update('company.phone', v)} placeholder="+36 20 123 4567" /></Field>
        <Field label="Email"><Input value={c.email} onChange={v => update('company.email', v)} placeholder="iroda@ceg.hu" /></Field>
        <Field label="Bankszámlaszám"><Input value={c.bank_account} onChange={v => update('company.bank_account', v)} placeholder="12345678-12345678-12345678" /></Field>
      </FieldGroup>
      <div style={{ padding: '12px 16px', background: C.accentDim, border: `1px solid ${C.accentBorder}`, borderRadius: 8, fontFamily: 'DM Mono', fontSize: 11, color: C.accent }}>
        ✓ Ezek az adatok minden PDF ajánlat fejlécén megjelennek
      </div>
    </Card>
  )
}

function LaborTab({ settings, update }) {
  const l = settings.labor
  const hrFt = parseFloat(l.hourly_rate) || 0
  const minFt = hrFt / 60

  return (
    <div style={{ maxWidth: 640 }}>
      <Card style={{ padding: 28, marginBottom: 18 }}>
        <SectionHeader title="Alapóradíj" />
        <FieldGroup>
          <Field label="Nettó óradíj (Ft/óra)">
            <Input value={l.hourly_rate} onChange={v => update('labor.hourly_rate', parseFloat(v) || 0)} type="number" suffix="Ft/ó" />
          </Field>
          <Field label="Árrés szorzó">
            <Input value={l.default_margin} onChange={v => update('labor.default_margin', parseFloat(v) || 1)} type="number" placeholder="1.15" />
          </Field>
          <Field label="ÁFA kulcs">
            <Input value={l.vat_percent} onChange={v => update('labor.vat_percent', parseFloat(v) || 27)} type="number" suffix="%" />
          </Field>
          <div /> {/* spacer */}
        </FieldGroup>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 8 }}>
          {[
            { label: 'Ft/perc', value: minFt.toFixed(1) },
            { label: 'Nettó óradíj', value: `${fmt(hrFt)} Ft` },
            { label: 'Bruttó óradíj', value: `${fmt(hrFt * (1 + l.vat_percent/100))} Ft` },
          ].map(stat => (
            <div key={stat.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: C.accent }}>{stat.value}</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, marginTop: 4 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ padding: 28 }}>
        <SectionHeader title="Szorzók" />
        <FieldGroup>
          <Field label="Túlóra szorzó">
            <Input value={l.overtime_multiplier} onChange={v => update('labor.overtime_multiplier', parseFloat(v) || 1.3)} type="number" />
          </Field>
          <Field label="Hétvégi szorzó">
            <Input value={l.weekend_multiplier} onChange={v => update('labor.weekend_multiplier', parseFloat(v) || 1.5)} type="number" />
          </Field>
        </FieldGroup>
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textMuted, lineHeight: 1.8 }}>
          ℹ️ Ezek a szorzók az ajánlati varázslóban alkalmazhatók speciális projektekhez.
          Az alap kalkuláció az alap óradíjjal és a kontextus szorzókkal számol.
        </div>
      </Card>
    </div>
  )
}

function MaterialsTab({ materials, onMaterialsChange }) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [editItem, setEditItem] = useState(null)

  const categories = [
    { key: 'all',         label: 'Összes' },
    { key: 'doboz',       label: '📦 Dobozok' },
    { key: 'szerelvenyek',label: '🔌 Szerelvények' },
    { key: 'kabel',       label: '〰️ Kábelek' },
    { key: 'talca',       label: '📐 Kábeltálca' },
    { key: 'vedelem',     label: '⚡ Védelem' },
    { key: 'egyeb',       label: 'Egyéb' },
  ]

  const filtered = materials.filter(m => {
    const matchCat = activeCategory === 'all' || m.category === activeCategory
    const matchSearch = !search || [m.name, m.code].some(v => v?.toLowerCase().includes(search.toLowerCase()))
    return matchCat && matchSearch
  })

  const saveItem = (item) => {
    let updated
    if (item._isNew) {
      const { _isNew, ...clean } = item
      updated = [...materials, clean]
    } else {
      updated = materials.map(m => m.code === item.code ? item : m)
    }
    onMaterialsChange(updated)
    saveMaterials(updated)
    setEditItem(null)
  }

  const deleteItem = (code) => {
    if (!confirm('Törlöd?')) return
    const updated = materials.filter(m => m.code !== code)
    onMaterialsChange(updated)
    saveMaterials(updated)
  }

  const resetMaterials = () => {
    if (!confirm('Visszaállítod az alapértelmezett anyagárlistát?')) return
    onMaterialsChange([...DEFAULT_MATERIALS])
    saveMaterials(DEFAULT_MATERIALS)
  }

  const bulkDiscount = (pct) => {
    const updated = materials.map(m => ({ ...m, discount: pct }))
    onMaterialsChange(updated)
    saveMaterials(updated)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 4 }}>Anyagárlista</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub }}>
            {materials.length} tétel · Egyszer beállítod, minden ajánlatban ebből számol
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={resetMaterials}>⟳ Alap</Button>
          <Button variant="secondary" size="sm" onClick={() => bulkDiscount(15)}>15% ked. mindenkire</Button>
          <Button size="sm" onClick={() => setEditItem({ _isNew: true, code: '', name: '', unit: 'db', price: 0, discount: 0, category: 'egyeb' })} icon="＋">Új anyag</Button>
        </div>
      </div>

      {/* Info box */}
      <div style={{ padding: '12px 16px', background: C.accentDim, border: `1px solid ${C.accentBorder}`, borderRadius: 8, marginBottom: 20, fontFamily: 'DM Mono', fontSize: 11, color: C.accent }}>
        💡 Adj meg a nagykereskedőnél szokásos listaárakat és a kedvezményed. A végső ár automatikusan számolódik.
        Minden ajánlatban ebből az adatból dolgozik a rendszer – nem kell minden alkalommal beírni.
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {categories.map(cat => {
          const cnt = cat.key === 'all' ? materials.length : materials.filter(m => m.category === cat.key).length
          const isActive = activeCategory === cat.key
          return (
            <button key={cat.key} onClick={() => setActiveCategory(cat.key)} style={{
              padding: '5px 12px', borderRadius: 20,
              background: isActive ? C.accent : C.bgCard,
              color: isActive ? '#09090B' : C.textSub,
              border: `1px solid ${isActive ? C.accent : C.border}`,
              fontFamily: 'Syne', fontWeight: 700, fontSize: 11, cursor: 'pointer',
            }}>{cat.label} ({cnt})</button>
          )
        })}
      </div>

      <div style={{ marginBottom: 12, maxWidth: 280 }}>
        <Input value={search} onChange={setSearch} placeholder="Keresés..." />
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.bgCard }}>
              {['Kód', 'Megnevezés', 'Egység', 'Listaár', 'Kedvezmény', 'Végső ár', ''].map(h => (
                <th key={h} style={{
                  padding: '10px 14px', textAlign: 'left', fontSize: 10,
                  color: C.textSub, fontFamily: 'DM Mono', fontWeight: 500,
                  borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase', letterSpacing: '0.06em'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => {
              const finalPrice = m.price * (1 - (m.discount || 0) / 100)
              return (
                <tr key={m.code}
                  style={{ borderBottom: `1px solid ${C.border}` }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 14px', fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted }}>{m.code}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'DM Mono', fontSize: 13, color: C.text }}>{m.name}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'DM Mono', fontSize: 12, color: C.textSub }}>{m.unit}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'DM Mono', fontSize: 12, color: C.textSub }}>
                    {fmt(m.price)} Ft
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {m.discount > 0 ? (
                      <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.accent, background: C.accentDim, padding: '2px 8px', borderRadius: 4 }}>
                        -{m.discount}%
                      </span>
                    ) : <span style={{ color: C.textMuted, fontSize: 12 }}>–</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.accent }}>
                      {fmt(finalPrice)} Ft
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => setEditItem({ ...m })} style={{ padding: '4px 8px', background: C.bgHover, border: `1px solid ${C.border}`, borderRadius: 6, color: C.textSub, fontSize: 11, cursor: 'pointer' }}>✏️</button>
                      <button onClick={() => deleteItem(m.code)} style={{ padding: '4px 8px', background: C.redDim, border: '1px solid rgba(255,107,107,0.15)', borderRadius: 6, color: C.red, fontSize: 11, cursor: 'pointer' }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {editItem && (
        <MaterialModal item={editItem} onSave={saveItem} onClose={() => setEditItem(null)} />
      )}
    </div>
  )
}

function MaterialModal({ item, onSave, onClose }) {
  const [form, setForm] = useState({ ...item })
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const finalPrice = (form.price || 0) * (1 - (form.discount || 0) / 100)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ background: '#111113', border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, width: '100%', maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: C.text, marginBottom: 22 }}>
          {form._isNew ? 'Új anyag' : 'Anyag szerkesztése'}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lS}>Megnevezés</label>
            <Input value={form.name} onChange={v => update('name', v)} />
          </div>
          <div>
            <label style={lS}>Kód</label>
            <Input value={form.code} onChange={v => update('code', v)} placeholder="MAT-XXX" />
          </div>
          <div>
            <label style={lS}>Egység</label>
            <select value={form.unit} onChange={e => update('unit', e.target.value)} style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 14px', color: C.text, fontFamily: 'DM Mono', fontSize: 13, outline: 'none' }}>
              <option value="db">db</option><option value="m">m</option><option value="m2">m²</option><option value="kg">kg</option>
            </select>
          </div>
          <div>
            <label style={lS}>Listaár (Ft)</label>
            <Input value={form.price} onChange={v => update('price', parseFloat(v) || 0)} type="number" suffix="Ft" />
          </div>
          <div>
            <label style={lS}>Kedvezmény (%)</label>
            <Input value={form.discount || 0} onChange={v => update('discount', parseFloat(v) || 0)} type="number" suffix="%" />
          </div>
          <div>
            <label style={lS}>Kategória</label>
            <select value={form.category} onChange={e => update('category', e.target.value)} style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 14px', color: C.text, fontFamily: 'DM Mono', fontSize: 13, outline: 'none' }}>
              {['doboz','szerelvenyek','kabel','talca','vedelem','egyeb'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 20, color: C.accent }}>{fmt(finalPrice)} Ft</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Mégse</Button>
          <Button onClick={() => onSave(form)}>Mentés</Button>
        </div>
      </div>
    </div>
  )
}
const lS = { display: 'block', fontSize: 10, color: C.textSub, fontFamily: 'DM Mono', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }

function OverheadTab({ settings, update }) {
  const o = settings.overhead
  const totalPerVisit = o.minutes_per_visit + (o.travel_cost_per_visit / (settings.labor.hourly_rate / 60))
  const totalMinutes = o.visits * o.minutes_per_visit
  const travelCost = o.visits * (o.travel_cost_per_visit || 0)
  const laborCost = (totalMinutes / 60) * settings.labor.hourly_rate

  return (
    <div style={{ maxWidth: 620 }}>
      <Card style={{ padding: 28, marginBottom: 18 }}>
        <SectionHeader title="Overhead – kiszállás, felvonulás, pakolás" />
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, lineHeight: 1.8, marginBottom: 20, padding: '10px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          💡 Ez az idő a NORMAIDŐKÖN felüli, projekt szintű ráfordítás: odautazás, szerszámok ki/bepakolás, helyszíni felvonulás.
          A normaidők <strong style={{ color: C.text }}>NEM</strong> tartalmazzák – ez a leggyakoribb kalkulációs hiba a piacon.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={lS2}>Kiszállások száma</label>
            <select value={o.visits} onChange={e => update('overhead.visits', parseInt(e.target.value))}
              style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontFamily: 'Syne', fontWeight: 700, fontSize: 20, outline: 'none', textAlign: 'center' }}>
              {[1,2,3,5,7,10,15,20].map(n => <option key={n} value={n}>{n} db</option>)}
            </select>
          </div>
          <div>
            <label style={lS2}>Perc/kiszállás</label>
            <Input value={o.minutes_per_visit} onChange={v => update('overhead.minutes_per_visit', parseFloat(v) || 0)} type="number" suffix="perc" />
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4, fontFamily: 'DM Mono' }}>Tipikus: 40-60 perc</div>
          </div>
          <div>
            <label style={lS2}>Útiköltség/kiszállás</label>
            <Input value={o.travel_cost_per_visit || 0} onChange={v => update('overhead.travel_cost_per_visit', parseFloat(v) || 0)} type="number" suffix="Ft" />
          </div>
        </div>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { label: 'Össz overhead idő', value: `${totalMinutes} perc`, sub: `= ${(totalMinutes/60).toFixed(1)} óra` },
            { label: 'Overhead munkadíj', value: `${fmt(laborCost)} Ft`, sub: `${o.visits} × ${o.minutes_per_visit} perc × ${fmt(settings.labor.hourly_rate/60)} Ft/perc` },
            { label: 'Útiköltség összesen', value: `${fmt(travelCost)} Ft`, sub: `${o.visits} kiszállás × ${fmt(o.travel_cost_per_visit || 0)} Ft` },
          ].map(stat => (
            <div key={stat.label} style={{ background: C.accentDim, border: `1px solid ${C.accentBorder}`, borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.accent, marginBottom: 6 }}>{stat.label}</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: C.accent }}>{stat.value}</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, marginTop: 4 }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function QuoteTab({ settings, update }) {
  const q = settings.quote
  return (
    <Card style={{ padding: 28, maxWidth: 600 }}>
      <SectionHeader title="Ajánlat beállítások" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={lS2}>Érvényesség (napban)</label>
          <Input value={q.validity_days} onChange={v => update('quote.validity_days', parseInt(v) || 30)} type="number" suffix="nap" style={{ maxWidth: 160 }} />
        </div>
        <div>
          <label style={lS2}>Alap megjegyzés / lábléc szöveg</label>
          <textarea value={q.footer_text} onChange={e => update('quote.footer_text', e.target.value)}
            style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontFamily: 'DM Mono', fontSize: 12, outline: 'none', resize: 'vertical', minHeight: 80, lineHeight: 1.7 }} />
        </div>
        <div>
          <label style={lS2}>Alapértelmezett megjegyzés az ajánlatban</label>
          <textarea value={q.default_notes} onChange={e => update('quote.default_notes', e.target.value)}
            style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontFamily: 'DM Mono', fontSize: 12, outline: 'none', resize: 'vertical', minHeight: 60, lineHeight: 1.7 }}
            placeholder="pl. Az árajánlat tartalmazza a szükséges villanyszerelési munkákat..." />
        </div>
      </div>
    </Card>
  )
}

const lS2 = { display: 'block', fontSize: 10, color: C.textSub, fontFamily: 'DM Mono', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }
