import React, { useState } from 'react'
import { C, fmt, Card, Button, Input, SectionHeader, ConfirmDialog, useToast } from '../components/ui.jsx'
import { saveSettings, saveMaterials, DEFAULT_MATERIALS, loadQuotes, saveQuotes, saveTemplates, saveCompanyLogo } from '../data/store.js'
import { CONTEXT_FACTORS } from '../data/workItemsDb.js'
import { loadProjects, saveAllProjects } from '../data/projectStore.js'
import { loadPlans, saveAllPlansMeta } from '../data/planStore.js'
import { loadTemplates } from '../data/legendStore.js'

const TABS = [
  { key: 'company',      label: 'Cégadatok' },
  { key: 'labor',        label: '⏱ Óradíjak' },
  // Produktivitás moved to workspace Beállítás tab (per-plan)
  { key: 'materials',    label: 'Anyagárlista' },
  { key: 'overhead',     label: '🚗 Overhead' },
  { key: 'quote',        label: '📄 Ajánlat' },
  { key: 'backup',       label: '💾 Mentés' },
]

export default function SettingsPage({ settings, onSettingsChange, materials, onMaterialsChange, onRestoreComplete }) {
  const [activeTab, setActiveTab] = useState('company')

  const updateSettings = (path, value) => {
    const keys = path.split('.')
    const newSettings = { ...settings }
    let obj = newSettings
    for (let i = 0; i < keys.length - 1; i++) {
      // Guard against undefined intermediates — create empty object if missing
      obj[keys[i]] = { ...(obj[keys[i]] || {}) }
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
      <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.border}`, marginBottom: 28, overflowX: 'auto', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '10px 12px', background: 'transparent', border: 'none',
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
      {/* Produktivitás tab moved to workspace */}
      {activeTab === 'overhead' && (
        <OverheadTab settings={settings} update={updateSettings} />
      )}
      {activeTab === 'quote' && (
        <QuoteTab settings={settings} update={updateSettings} />
      )}
      {activeTab === 'backup' && (
        <BackupTab settings={settings} materials={materials} onSettingsChange={onSettingsChange} onMaterialsChange={onMaterialsChange} onRestoreComplete={onRestoreComplete} />
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
  const c = settings?.company || {}
  const logoRef = React.useRef(null)

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) { alert('A logó mérete max. 500 KB lehet.'); return }
    const reader = new FileReader()
    reader.onload = ev => {
      saveCompanyLogo(ev.target.result)
      update('company.logo_base64', ev.target.result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <Card style={{ padding: 28, maxWidth: 640 }}>
      <SectionHeader title="Céges adatok (fejlécen megjelenik az ajánlatokon)" />

      {/* ── Logo upload ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 11, color: C.textSub, fontFamily: 'DM Mono', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Céges logó (PDF fejlécen jelenik meg)
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {/* Preview box */}
          <div style={{
            width: 160, height: 64, borderRadius: 8, border: `1.5px dashed ${c.logo_base64 ? C.accentBorder : C.border}`,
            background: c.logo_base64 ? '#0A0A0F' : C.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
          }}>
            {c.logo_base64
              ? <img src={c.logo_base64} alt="logó" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', padding: 4 }} />
              : <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub }}>Nincs logó</span>
            }
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              ref={logoRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              style={{ display: 'none' }}
              onChange={handleLogoUpload}
            />
            <button onClick={() => logoRef.current?.click()} style={{
              padding: '8px 16px', borderRadius: 7, cursor: 'pointer',
              background: C.accentDim, border: `1px solid ${C.accentBorder}`,
              color: C.accent, fontFamily: 'DM Mono', fontSize: 12, fontWeight: 500,
            }}>
              {c.logo_base64 ? '🔄 Logó cseréje' : '📁 Logó feltöltése'}
            </button>
            {c.logo_base64 && (
              <button onClick={() => { saveCompanyLogo(''); update('company.logo_base64', '') }} style={{
                padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
                background: C.redDim, border: '1px solid rgba(255,107,107,0.2)',
                color: C.red, fontFamily: 'DM Mono', fontSize: 11,
              }}>✕ Törlés</button>
            )}
            <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub }}>PNG / JPG / SVG · max 500 KB</span>
          </div>
        </div>
      </div>

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
  const l = settings?.labor || {}
  const hrFt = parseFloat(l.hourly_rate) || 0
  const minFt = hrFt / 60
  const markupPct  = parseFloat(l.markup_percent) || 15
  const markupType = l.markup_type || 'markup'
  const vatPct     = parseFloat(l.vat_percent) || 27

  // Live comparison: same subtotal shown with markup vs margin math
  const DEMO = 100000
  const markupResult = Math.round(DEMO * (1 + markupPct / 100))
  const marginResult = markupPct >= 100 ? '∞' : Math.round(DEMO / (1 - markupPct / 100)).toLocaleString('hu-HU')

  return (
    <div style={{ maxWidth: 680 }}>
      {/* --- Alapóradíj ---------------------------------------------------- */}
      <Card style={{ padding: 28, marginBottom: 18 }}>
        <SectionHeader title="Alapóradíj" />
        <FieldGroup>
          <Field label="Nettó óradíj (Ft/óra)">
            <Input value={l.hourly_rate} onChange={v => update('labor.hourly_rate', parseFloat(v) || 0)} type="number" suffix="Ft/ó" />
          </Field>
          <Field label="ÁFA kulcs">
            <Input value={vatPct} onChange={v => update('labor.vat_percent', parseFloat(v) || 27)} type="number" suffix="%" />
          </Field>
        </FieldGroup>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 8 }}>
          {[
            { label: 'Ft/perc',       value: minFt.toFixed(1) },
            { label: 'Nettó óradíj',  value: `${fmt(hrFt)} Ft` },
            { label: 'Bruttó óradíj', value: `${fmt(hrFt * (1 + vatPct / 100))} Ft` },
          ].map(stat => (
            <div key={stat.label} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: C.accent }}>{stat.value}</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, marginTop: 4 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* --- Markup vs Margin ------------------------------------------------ */}
      <Card style={{ padding: 28, marginBottom: 18 }}>
        <SectionHeader title="Árrés kalkuláció (Markup vs. Margin)" />
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, lineHeight: 1.7, marginBottom: 16,
          padding: '10px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <strong style={{ color: C.text }}>Markup</strong>: nettó × (1 + x%) → az összköltségre rakod rá az árrést.<br/>
          <strong style={{ color: C.text }}>Margin</strong>: nettó ÷ (1 − x%) → az eladási ár hány %-a a te bevételed.
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <Field label="Árrés mértéke (%)">
            <Input value={markupPct} onChange={v => update('labor.markup_percent', parseFloat(v) || 0)} type="number" suffix="%" style={{ maxWidth: 140 }} />
          </Field>
          <Field label="Kalkulációs módszer">
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { key: 'markup', label: 'Markup', tip: 'cost × (1+x%)' },
                { key: 'margin', label: 'Margin', tip: 'cost ÷ (1−x%)' },
              ].map(opt => (
                <button key={opt.key} onClick={() => update('labor.markup_type', opt.key)} title={opt.tip} style={{
                  padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontFamily: 'Syne', fontWeight: 700, fontSize: 13,
                  border: `1px solid ${markupType === opt.key ? C.accent : C.border}`,
                  background: markupType === opt.key ? C.accentDim : C.bg,
                  color: markupType === opt.key ? C.accent : C.textSub,
                  transition: 'all 0.15s',
                }}>{opt.label}</button>
              ))}
            </div>
          </Field>
        </div>
        {/* Live comparison table */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { mtype: 'markup', label: 'Markup eredmény', val: `${markupResult.toLocaleString('hu-HU')} Ft`, active: markupType === 'markup', formula: `100 000 × ${1 + markupPct/100}` },
            { mtype: 'margin', label: 'Margin eredmény',  val: `${marginResult} Ft`, active: markupType === 'margin',  formula: `100 000 ÷ ${1 - markupPct/100}` },
          ].map(c => (
            <div key={c.mtype} style={{ padding: '12px 16px', borderRadius: 8,
              background: c.active ? C.accentDim : C.bg,
              border: `1px solid ${c.active ? C.accent : C.border}`,
            }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: c.active ? C.accent : C.textSub, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: c.active ? C.accent : C.textMuted }}>{c.val}</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted, marginTop: 4 }}>{c.formula}</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textMuted }}>100 000 Ft nettó esetén</div>
            </div>
          ))}
        </div>
      </Card>

    </div>
  )
}

function MaterialsTab({ materials, onMaterialsChange }) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [editItem, setEditItem] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
  const toast = useToast()

  const categories = [
    { key: 'all',         label: 'Összes' },
    { key: 'doboz',       label: 'Dobozok' },
    { key: 'szerelvenyek',label: '🔌 Szerelvények' },
    { key: 'kabel',       label: '〰️ Kábelek' },
    { key: 'talca',       label: 'Kábeltálca' },
    { key: 'vedelem',     label: 'Védelem' },
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
    toast.show(item._isNew ? 'Anyag hozzáadva' : 'Anyag mentve', 'success')
  }

  const deleteItem = (code) => {
    const item = materials.find(m => m.code === code)
    setConfirmState({
      message: 'Törlöd ezt az anyagot?',
      detail: item ? `${item.name} (${item.code})` : code,
      confirmLabel: 'Törlés',
      onConfirm: () => {
        const updated = materials.filter(m => m.code !== code)
        onMaterialsChange(updated)
        saveMaterials(updated)
        setConfirmState(null)
        toast.show('Anyag törölve', 'success')
      }
    })
  }

  const resetMaterials = () => {
    setConfirmState({
      message: 'Visszaállítod az alapértelmezett anyagárlistát?',
      detail: 'A saját módosításaid elvesznek.',
      confirmLabel: 'Visszaállítás',
      onConfirm: () => {
        onMaterialsChange([...DEFAULT_MATERIALS])
        saveMaterials(DEFAULT_MATERIALS)
        setConfirmState(null)
        toast.show('Anyagárlista visszaállítva', 'success')
      }
    })
  }

  const bulkDiscount = (pct) => {
    const updated = materials.map(m => ({ ...m, discount: pct }))
    onMaterialsChange(updated)
    saveMaterials(updated)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 4 }}>Anyagárlista</div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub }}>
            {materials.length} tétel · Egyszer beállítod, minden ajánlatban ebből számol
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" size="sm" onClick={resetMaterials}>⟳ Alap</Button>
          <Button variant="secondary" size="sm" onClick={() => bulkDiscount(15)}>15% ked. mindenkire</Button>
          <Button size="sm" onClick={() => setEditItem({ _isNew: true, code: '', name: '', unit: 'db', price: 0, discount: 0, category: 'egyeb' })} icon="＋">Új anyag</Button>
        </div>
      </div>

      {/* Info box */}
      <div style={{ padding: '12px 16px', background: C.accentDim, border: `1px solid ${C.accentBorder}`, borderRadius: 8, marginBottom: 20, fontFamily: 'DM Mono', fontSize: 11, color: C.accent }}>
        Adj meg a nagykereskedőnél szokásos listaárakat és a kedvezményed. A végső ár automatikusan számolódik.
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
                      <button onClick={() => setEditItem({ ...m })} style={{ padding: '4px 8px', background: C.bgHover, border: `1px solid ${C.border}`, borderRadius: 6, color: C.textSub, fontSize: 11, cursor: 'pointer' }}>Szerkeszt</button>
                      <button onClick={() => deleteItem(m.code)} style={{ padding: '4px 8px', background: C.redDim, border: '1px solid rgba(255,107,107,0.15)', borderRadius: 6, color: C.red, fontSize: 11, cursor: 'pointer' }}>Törlés</button>
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

      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          detail={confirmState.detail}
          confirmLabel={confirmState.confirmLabel}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
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
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, width: '100%', maxWidth: 480 }} onClick={e => e.stopPropagation()}>
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


function ProductivityTab({ settings, update }) {
  const ctx = settings.context_defaults || {}

  // Calculate combined multiplier from 3 project-level factors
  let combined = 1.0
  for (const [factorKey, factorDef] of Object.entries(CONTEXT_FACTORS)) {
    const selectedKey = ctx[factorKey] ?? factorDef.defaultKey
    const opt = factorDef.options.find(o => o.key === selectedKey)
    if (opt) combined *= opt.factor
  }
  const combinedPct = ((combined - 1) * 100).toFixed(1)
  const combinedColor = combined <= 1.0 ? C.accent : combined <= 1.3 ? C.yellow : C.red

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Combined multiplier header */}
      <div style={{ padding: '18px 24px', marginBottom: 20, borderRadius: 12,
        background: C.accentDim, border: `1px solid ${C.accentBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.accent, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Kombinált projektszorzó
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, lineHeight: 1.6 }}>
            Az összes projekt-tényező szorzata – ez módosítja az összes normaidőt.<br/>
            1.00 = alap, &gt;1.00 = lassabb (nehezebb), &lt;1.00 = gyorsabb (könnyebb).<br/>
            <span style={{ color: C.textMuted }}>💡 A falanyag (GK / Ytong / Tégla / Beton) tételenként állítható a Takeoff fülön.</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 40, color: combinedColor, lineHeight: 1 }}>
            ×{combined.toFixed(3)}
          </div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: C.textSub, marginTop: 4 }}>
            {combined > 1 ? `+${combinedPct}%` : combinedPct + '%'} az alap normaidőhöz képest
          </div>
        </div>
      </div>

      {/* Group factors by their group field */}
      {(() => {
        const groups = []
        const seen = new Set()
        for (const [, factorDef] of Object.entries(CONTEXT_FACTORS)) {
          if (!seen.has(factorDef.group)) {
            seen.add(factorDef.group)
            groups.push({ group: factorDef.group, groupLabel: factorDef.groupLabel })
          }
        }
        return groups.map(({ group, groupLabel }) => (
          <Card key={group} style={{ padding: 24, marginBottom: 16 }}>
            <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 16,
              paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
              {groupLabel}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {Object.entries(CONTEXT_FACTORS).filter(([, fd]) => fd.group === group).map(([factorKey, factorDef]) => {
                const selectedKey = ctx[factorKey] ?? factorDef.defaultKey
                const selectedOpt = factorDef.options.find(o => o.key === selectedKey) || factorDef.options[0]
                return (
                  <div key={factorKey}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: C.text }}>
                        {factorDef.label}
                      </div>
                      <div style={{ fontFamily: 'DM Mono', fontSize: 12,
                        color: selectedOpt.factor === 1.0 ? C.textSub : selectedOpt.factor < 1 ? C.accent : C.yellow,
                        background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 10px', flexShrink: 0, marginLeft: 12 }}>
                        ×{selectedOpt.factor.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {factorDef.options.map(opt => {
                        const active = opt.key === selectedKey
                        return (
                          <button key={opt.key}
                            onClick={() => update(`context_defaults.${factorKey}`, opt.key)}
                            style={{
                              flex: 1, minWidth: 120, padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                              textAlign: 'left', outline: 'none', transition: 'all 0.15s',
                              background: active ? C.accentDim : C.bg,
                              border: `1px solid ${active ? C.accent : C.border}`,
                            }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{ fontSize: 13 }}>{opt.icon}</span>
                              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: active ? C.accent : C.text }}>{opt.label}</span>
                            </div>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: C.textMuted, lineHeight: 1.5 }}>×{opt.factor.toFixed(2)}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        ))
      })()}
    </div>
  )
}

function OverheadTab({ settings, update }) {
  const o = settings.overhead
  const totalPerVisit = o.minutes_per_visit + (o.travel_cost_per_visit / ((settings?.labor?.hourly_rate || 0) / 60))
  const totalMinutes = o.visits * o.minutes_per_visit
  const travelCost = o.visits * (o.travel_cost_per_visit || 0)
  const laborCost = (totalMinutes / 60) * (settings?.labor?.hourly_rate || 0)

  return (
    <div style={{ maxWidth: 620 }}>
      <Card style={{ padding: 28, marginBottom: 18 }}>
        <SectionHeader title="Overhead – kiszállás, felvonulás, pakolás" />
        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, lineHeight: 1.8, marginBottom: 20, padding: '10px 14px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          Ez az idő a NORMAIDŐKÖN felüli, projekt szintű ráfordítás: odautazás, szerszámok ki/bepakolás, helyszíni felvonulás.
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
            { label: 'Overhead munkadíj', value: `${fmt(laborCost)} Ft`, sub: `${o.visits} × ${o.minutes_per_visit} perc × ${fmt((settings?.labor?.hourly_rate || 0)/60)} Ft/perc` },
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

      <div style={{ marginTop: 28 }}>
        <SectionHeader title="Ajánlat alapértelmezett szövegek" />
        <p style={{ fontSize: 11, color: C.textSub, fontFamily: 'DM Mono', marginBottom: 16, lineHeight: 1.6 }}>
          Új ajánlat létrehozásakor ezek a szövegek kerülnek be alapértelmezettként. A meglévő ajánlatokat nem módosítják.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={lS2}>Alapértelmezett érvényesség szöveg</label>
            <textarea value={q.default_validity_text} onChange={e => update('quote.default_validity_text', e.target.value)}
              style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontFamily: 'DM Mono', fontSize: 12, outline: 'none', resize: 'vertical', minHeight: 60, lineHeight: 1.7 }}
              placeholder="pl. Az ajánlat kiállítástól számított 30 napig érvényes." />
          </div>
          <div>
            <label style={lS2}>Alapértelmezett fizetési feltételek</label>
            <textarea value={q.default_payment_terms_text} onChange={e => update('quote.default_payment_terms_text', e.target.value)}
              style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontFamily: 'DM Mono', fontSize: 12, outline: 'none', resize: 'vertical', minHeight: 60, lineHeight: 1.7 }}
              placeholder="pl. Fizetési feltételek: a teljesítést követően, számla ellenében, 8 napon belül." />
          </div>
          <div>
            <label style={lS2}>Alapértelmezett „Tartalmazza" szöveg</label>
            <textarea value={q.default_inclusions} onChange={e => update('quote.default_inclusions', e.target.value)}
              style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontFamily: 'DM Mono', fontSize: 12, outline: 'none', resize: 'vertical', minHeight: 60, lineHeight: 1.7 }}
              placeholder="pl. Munkadíj, kiszállás, apróanyag..." />
          </div>
          <div>
            <label style={lS2}>Alapértelmezett „Nem tartalmazza" szöveg</label>
            <textarea value={q.default_exclusions} onChange={e => update('quote.default_exclusions', e.target.value)}
              style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', color: C.text, fontFamily: 'DM Mono', fontSize: 12, outline: 'none', resize: 'vertical', minHeight: 60, lineHeight: 1.7 }}
              placeholder="pl. Anyagköltség, festés, glettelés..." />
          </div>
        </div>
      </div>
    </Card>
  )
}

function BackupTab({ settings, materials, onSettingsChange, onMaterialsChange, onRestoreComplete }) {
  const [status, setStatus] = useState(null)
  const [confirmRestore, setConfirmRestore] = useState(null) // holds parsed backup for confirmation
  const fileInputRef = React.useRef(null)

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be re-selected
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)

        // Validate shape
        if (data._app !== 'TakeoffPro' || data._version !== 1) {
          setStatus({ type: 'error', msg: 'Nem kompatibilis backup fájl (hiányzó _app vagy _version).' })
          return
        }

        // Check that at least one data entity is present
        const hasData = data.settings || data.materials || data.projects || data.plans || data.templates || data.quotes
        if (!hasData) {
          setStatus({ type: 'error', msg: 'A backup fájl üres — nincs visszaállítható adat.' })
          return
        }

        // Show confirmation with summary
        setConfirmRestore(data)
      } catch (err) {
        setStatus({ type: 'error', msg: `Érvénytelen JSON fájl: ${err.message}` })
      }
    }
    reader.readAsText(file)
  }

  const applyRestore = () => {
    const data = confirmRestore
    if (!data) return

    try {
      if (data.settings) {
        saveSettings(data.settings)
        if (onSettingsChange) onSettingsChange(data.settings)
      }
      if (data.materials) {
        saveMaterials(data.materials)
        if (onMaterialsChange) onMaterialsChange(data.materials)
      }
      if (data.projects) saveAllProjects(data.projects)
      if (data.plans) saveAllPlansMeta(data.plans)
      if (data.templates) saveTemplates(data.templates)
      if (data.quotes) saveQuotes(data.quotes)

      setConfirmRestore(null)
      if (onRestoreComplete) onRestoreComplete()
      setStatus({ type: 'success', msg: `Visszaállítás kész — ${data._exportedAt ? new Date(data._exportedAt).toLocaleDateString('hu-HU') : 'ismeretlen dátumú'} backup betöltve.` })
      setTimeout(() => setStatus(null), 5000)
    } catch (err) {
      setStatus({ type: 'error', msg: `Visszaállítási hiba: ${err.message}` })
      setConfirmRestore(null)
    }
  }

  const handleExport = () => {
    try {
      const backup = {
        _version: 1,
        _exportedAt: new Date().toISOString(),
        _app: 'TakeoffPro',
        settings,
        materials,
        projects: loadProjects(),
        plans: loadPlans().map(p => ({ ...p })), // metadata only — no blob data
        templates: loadTemplates(),
        quotes: loadQuotes(),
      }
      const json = JSON.stringify(backup, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `takeoffpro-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setStatus({ type: 'success', msg: 'Mentés letöltve' })
      setTimeout(() => setStatus(null), 3000)
    } catch (err) {
      setStatus({ type: 'error', msg: `Hiba: ${err.message}` })
    }
  }

  return (
    <Card style={{ padding: 28, maxWidth: 600 }}>
      <SectionHeader title="Helyi mentés" />
      <p style={{ fontFamily: 'DM Mono', fontSize: 11, color: C.textSub, lineHeight: 1.7, marginBottom: 16 }}>
        Exportáld az összes konfigurációt és metaadatot egyetlen JSON fájlba.
      </p>

      {/* What's included / excluded */}
      <div style={{
        marginBottom: 20, padding: '12px 16px', borderRadius: 8,
        background: 'rgba(255,209,102,0.06)', border: '1px solid rgba(255,209,102,0.15)',
      }}>
        <div style={{ fontFamily: 'Syne', fontSize: 11, fontWeight: 700, color: '#FFD166', marginBottom: 8 }}>Mi kerül a backupba?</div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.textSub, lineHeight: 1.8 }}>
          ✓ Beállítások (munkadíj, ÁFA, cégadatok)<br/>
          ✓ Anyagkatalógus<br/>
          ✓ Projektek és tervrajz metaadatok<br/>
          ✓ Sablonok (jelmagyarázat alapján)<br/>
          ✓ Ajánlatok (összes adat)<br/>
          <span style={{ color: 'rgba(255,107,107,0.8)' }}>
          ✗ Feltöltött PDF/DXF/DWG fájlok (csak metaadatuk)<br/>
          ✗ Felmérési munkalapok (IndexedDB blob-ok)
          </span>
        </div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: C.muted, marginTop: 8, fontStyle: 'italic' }}>
          Visszaállítás után a tervrajz fájlokat újra kell feltölteni.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={handleExport} style={{
          background: C.accentDim, border: `1px solid ${C.accentBorder}`, borderRadius: 8,
          padding: '10px 20px', color: C.accent, fontFamily: 'Syne', fontWeight: 700,
          fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 15 }}>💾</span>
          Backup letöltése (.json)
        </button>
        <button onClick={() => fileInputRef.current?.click()} style={{
          background: 'rgba(76,201,240,0.08)', border: '1px solid rgba(76,201,240,0.2)', borderRadius: 8,
          padding: '10px 20px', color: '#4CC9F0', fontFamily: 'Syne', fontWeight: 700,
          fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 15 }}>📂</span>
          Visszaállítás fájlból
        </button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport}
          style={{ display: 'none' }} />
      </div>

      {/* Restore confirmation dialog */}
      {confirmRestore && (
        <ConfirmDialog
          message="Biztosan visszaállítod a backup-ot?"
          detail={`A jelenlegi adatok felülíródnak a ${confirmRestore._exportedAt ? new Date(confirmRestore._exportedAt).toLocaleDateString('hu-HU') + '-i' : ''} mentéssel. Ez nem vonható vissza.`}
          confirmLabel="Visszaállítás"
          onConfirm={applyRestore}
          onCancel={() => setConfirmRestore(null)}
        />
      )}

      {status && (
        <div style={{
          marginTop: 12, padding: '8px 14px', borderRadius: 6,
          fontFamily: 'DM Mono', fontSize: 11,
          background: status.type === 'success' ? 'rgba(0,229,160,0.10)' : 'rgba(255,107,107,0.10)',
          color: status.type === 'success' ? C.accent : '#FF6B6B',
          border: `1px solid ${status.type === 'success' ? 'rgba(0,229,160,0.25)' : 'rgba(255,107,107,0.25)'}`,
        }}>
          {status.msg}
        </div>
      )}
    </Card>
  )
}

const lS2 = { display: 'block', fontSize: 10, color: C.textSub, fontFamily: 'DM Mono', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }
