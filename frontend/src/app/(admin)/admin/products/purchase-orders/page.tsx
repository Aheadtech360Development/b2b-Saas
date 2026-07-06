'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { ClipboardIcon, TruckIcon, CheckCircleIcon, DollarSignIcon, DownloadIcon } from '@/components/ui/icons'

interface PurchaseOrderItem {
  id: string
  product_name: string
  sku: string
  color: string
  size: string
  quantity_ordered: number
  quantity_received: number
  unit_cost: number
  total_cost: number
}

interface PurchaseOrder {
  id: string
  po_number: string
  supplier_name: string
  supplier_email?: string
  supplier_phone?: string
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
  items: PurchaseOrderItem[]
  subtotal: number
  tax: number
  shipping_cost: number
  total: number
  notes?: string
  expected_date?: string
  created_at: string
  received_at?: string
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '.08em', color: '#7A7880', display: 'block', marginBottom: '5px',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #E2E0DA',
  borderRadius: '6px', fontSize: '14px', fontFamily: 'var(--font-jakarta)',
  boxSizing: 'border-box',
}
const cellInput: React.CSSProperties = {
  padding: '7px 8px', border: '1px solid #E2E0DA', borderRadius: '5px', fontSize: '12px',
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  draft:     { label: 'Draft',     bg: 'rgba(156,163,175,.15)', color: '#9CA3AF' },
  sent:      { label: 'Sent',      bg: 'rgba(26,92,255,.1)',    color: '#1A5CFF' },
  partial:   { label: 'Partial',   bg: 'rgba(217,119,6,.1)',    color: '#D97706' },
  received:  { label: 'Received',  bg: 'rgba(5,150,105,.1)',    color: '#059669' },
  cancelled: { label: 'Cancelled', bg: 'rgba(232,36,42,.1)',    color: '#E8242A' },
}

function generatePONumber() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `PO-${y}${m}${day}-${rand}`
}

function StatusBadge({ status }: { status: string }) {
  const cfg = (STATUS_CONFIG[status] ?? STATUS_CONFIG.draft)!
  return (
    <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

// ── Receive Modal ──────────────────────────────────────────────────────────────

function ReceiveModal({
  po,
  onClose,
  onReceive,
}: {
  po: PurchaseOrder
  onClose: () => void
  onReceive: (po: PurchaseOrder, qtys: Record<string, number>) => void
}) {
  const [qtys, setQtys] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {}
    po.items.forEach(i => { init[i.id] = i.quantity_ordered - i.quantity_received })
    return init
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '680px', padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontFamily: 'var(--font-bebas)', fontSize: '24px', color: '#2A2830' }}>RECEIVE INVENTORY — {po.po_number}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#aaa' }}>✕</button>
        </div>
        <p style={{ fontSize: '13px', color: '#7A7880', marginBottom: '18px' }}>
          Enter quantities received for each item. This will update your inventory levels.
        </p>

        <div style={{ border: '1px solid #E2E0DA', borderRadius: '8px', overflow: 'hidden', marginBottom: '22px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F3EF' }}>
                {['Product', 'Color / Size', 'Ordered', 'Qty Received'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em', color: '#7A7880', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {po.items.map(item => (
                <tr key={item.id} style={{ borderTop: '1px solid #F4F3EF' }}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{item.product_name}</div>
                    <div style={{ fontSize: '11px', color: '#aaa', fontFamily: 'monospace' }}>{item.sku}</div>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '13px' }}>{item.color} / {item.size}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 700 }}>{item.quantity_ordered}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <input
                      type="number"
                      value={qtys[item.id] ?? 0}
                      onChange={e => setQtys(q => ({ ...q, [item.id]: parseInt(e.target.value) || 0 }))}
                      min="0"
                      max={item.quantity_ordered}
                      style={{ width: '80px', padding: '8px 10px', border: '1.5px solid #1A5CFF', borderRadius: '6px', fontSize: '14px', textAlign: 'center', fontWeight: 700 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '11px 22px', border: '1px solid #E2E0DA', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            Cancel
          </button>
          <button onClick={() => onReceive(po, qtys)}
            style={{ padding: '11px 22px', background: '#059669', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>
            ✓ Confirm Receipt &amp; Update Inventory
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  const [showReceive, setShowReceive] = useState(false)

  const [form, setForm] = useState({
    supplier_name: '',
    supplier_email: '',
    supplier_phone: '',
    expected_date: '',
    notes: '',
    items: [{ sku: '', product_name: '', color: '', size: '', quantity_ordered: 1, unit_cost: 0 }],
  })

  useEffect(() => {
    const saved: PurchaseOrder[] = JSON.parse(localStorage.getItem('af_purchase_orders') || '[]')
    setOrders(saved)
  }, [])

  const addItem = () => setForm(f => ({
    ...f,
    items: [...f.items, { sku: '', product_name: '', color: '', size: '', quantity_ordered: 1, unit_cost: 0 }],
  }))

  const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))

  const updateItem = (i: number, field: string, value: string | number) =>
    setForm(f => ({ ...f, items: f.items.map((item, idx) => idx === i ? { ...item, [field]: value } : item) }))

  const subtotal = form.items.reduce((s, i) => s + i.quantity_ordered * i.unit_cost, 0)

  const handleCreate = (status: 'draft' | 'sent') => {
    if (!form.supplier_name.trim()) { alert('Supplier name required'); return }
    if (form.items.some(i => !i.sku && !i.product_name)) { alert('All items need SKU or product name'); return }

    const po: PurchaseOrder = {
      id: crypto.randomUUID(),
      po_number: generatePONumber(),
      supplier_name: form.supplier_name,
      supplier_email: form.supplier_email,
      supplier_phone: form.supplier_phone,
      status,
      items: form.items.map(i => ({ id: crypto.randomUUID(), ...i, quantity_received: 0, total_cost: i.quantity_ordered * i.unit_cost })),
      subtotal,
      tax: 0,
      shipping_cost: 0,
      total: subtotal,
      notes: form.notes,
      expected_date: form.expected_date,
      created_at: new Date().toISOString(),
    }

    const next = [po, ...orders]
    setOrders(next)
    localStorage.setItem('af_purchase_orders', JSON.stringify(next))
    setShowCreate(false)
    setForm({ supplier_name: '', supplier_email: '', supplier_phone: '', expected_date: '', notes: '', items: [{ sku: '', product_name: '', color: '', size: '', quantity_ordered: 1, unit_cost: 0 }] })
  }

  const handleReceive = async (po: PurchaseOrder, receivedQtys: Record<string, number>) => {
    for (const item of po.items) {
      const qty = receivedQtys[item.id] || 0
      if (qty > 0 && item.sku) {
        try {
          await apiClient.post('/api/v1/admin/inventory/adjust', { sku: item.sku, quantity_change: qty, reason: `PO ${po.po_number} received` })
        } catch {
          console.error('Inventory adjust failed for', item.sku)
        }
      }
    }
    const next = orders.map(o => o.id === po.id ? {
      ...o,
      status: 'received' as const,
      received_at: new Date().toISOString(),
      items: o.items.map(i => ({ ...i, quantity_received: receivedQtys[i.id] ?? i.quantity_ordered })),
    } : o)
    setOrders(next)
    localStorage.setItem('af_purchase_orders', JSON.stringify(next))
    setShowReceive(false)
    setSelectedPO(null)
  }

  const stats = {
    open: orders.filter(o => ['draft', 'sent'].includes(o.status)).length,
    pending: orders.filter(o => o.status === 'partial').length,
    received: orders.filter(o => o.status === 'received').length,
    total_value: orders.reduce((s, o) => s + o.total, 0),
  }

  return (
    <div style={{ fontFamily: 'var(--font-jakarta)' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-bebas)', fontSize: '32px', letterSpacing: '.02em', color: '#2A2830', lineHeight: 1 }}>PURCHASE ORDERS</h1>
          <p style={{ fontSize: '13px', color: '#7A7880', marginTop: '4px' }}>Manage incoming inventory from suppliers</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={{ padding: '10px 18px', border: '1px solid #E2E0DA', borderRadius: '8px', background: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <DownloadIcon size={14} color="#2A2830" /> Export
          </button>
          <button onClick={() => setShowCreate(true)}
            style={{ background: '#1A5CFF', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>
            + Create Purchase Order
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="admin-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '24px' }}>
        {([
          { label: 'Open POs',        value: String(stats.open),     icon: <ClipboardIcon size={24} color="#1A5CFF" />, color: '#1A5CFF' },
          { label: 'Pending Receipt', value: String(stats.pending),  icon: <TruckIcon size={24} color="#D97706" />, color: '#D97706' },
          { label: 'Received',        value: String(stats.received), icon: <CheckCircleIcon size={24} color="#059669" />, color: '#059669' },
          { label: 'Total Value',     value: `$${stats.total_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: <DollarSignIcon size={24} color="#2A2830" />, color: '#2A2830' },
        ]).map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #E2E0DA', borderRadius: '10px', padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {s.icon}
              <div>
                <div style={{ fontFamily: 'var(--font-bebas)', fontSize: '28px', color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: '#7A7880', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table / Empty state */}
      {orders.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E0DA', borderRadius: '10px', padding: '60px', textAlign: 'center' }}>
          <div style={{ marginBottom: '12px' }}><ClipboardIcon size={48} color="#aaa" /></div>
          <h3 style={{ fontFamily: 'var(--font-bebas)', fontSize: '22px', color: '#2A2830', marginBottom: '8px' }}>NO PURCHASE ORDERS YET</h3>
          <p style={{ fontSize: '14px', color: '#7A7880', marginBottom: '20px' }}>Create your first purchase order to track incoming inventory</p>
          <button onClick={() => setShowCreate(true)}
            style={{ background: '#1A5CFF', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
            + Create Purchase Order
          </button>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E0DA', borderRadius: '10px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F3EF', borderBottom: '2px solid #E2E0DA' }}>
                {['PO Number', 'Supplier', 'Items', 'Expected Date', 'Total', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.06em', color: '#7A7880', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(po => (
                <tr key={po.id} style={{ borderBottom: '1px solid #F4F3EF' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 700, color: '#1A5CFF', fontSize: '14px', cursor: 'pointer' }} onClick={() => setSelectedPO(po)}>
                      {po.po_number}
                    </div>
                    <div style={{ fontSize: '11px', color: '#aaa' }}>{new Date(po.created_at).toLocaleDateString()}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#2A2830' }}>{po.supplier_name}</div>
                    {po.supplier_email && <div style={{ fontSize: '12px', color: '#7A7880' }}>{po.supplier_email}</div>}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#2A2830' }}>
                    {po.items.length} items · {po.items.reduce((s, i) => s + i.quantity_ordered, 0)} units
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#2A2830' }}>
                    {po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '14px 16px', fontFamily: 'var(--font-bebas)', fontSize: '18px', color: '#2A2830' }}>
                    ${po.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '14px 16px' }}><StatusBadge status={po.status} /></td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setSelectedPO(po)}
                        style={{ padding: '6px 12px', border: '1px solid #E2E0DA', borderRadius: '6px', background: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        View
                      </button>
                      {['sent', 'partial'].includes(po.status) && (
                        <button onClick={() => { setSelectedPO(po); setShowReceive(true) }}
                          style={{ padding: '6px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          Receive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CREATE PO MODAL ── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}
          onClick={() => setShowCreate(false)}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '860px', padding: '28px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '22px' }}>
              <h2 style={{ fontFamily: 'var(--font-bebas)', fontSize: '26px', color: '#2A2830' }}>CREATE PURCHASE ORDER</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#aaa' }}>✕</button>
            </div>

            {/* Supplier */}
            <div style={{ background: '#F4F3EF', borderRadius: '8px', padding: '18px', marginBottom: '20px' }}>
              <div style={{ fontFamily: 'var(--font-bebas)', fontSize: '14px', letterSpacing: '.1em', color: '#7A7880', marginBottom: '14px' }}>SUPPLIER INFORMATION</div>
              <div className="checkout-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>Supplier Name *</label>
                  <input value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                    placeholder="e.g. Gildan Wholesale" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input value={form.supplier_email} onChange={e => setForm(f => ({ ...f, supplier_email: e.target.value }))}
                    placeholder="supplier@example.com" type="email" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Expected Date</label>
                  <input value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))}
                    type="date" style={inputStyle} />
                </div>
              </div>
            </div>

            {/* Items */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontFamily: 'var(--font-bebas)', fontSize: '14px', letterSpacing: '.1em', color: '#7A7880' }}>ORDER ITEMS</div>
                <button onClick={addItem}
                  style={{ padding: '6px 14px', background: '#1A5CFF', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  + Add Item
                </button>
              </div>
              <div style={{ border: '1px solid #E2E0DA', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F4F3EF' }}>
                      {['SKU', 'Product Name', 'Color', 'Size', 'Qty', 'Unit Cost', 'Total', ''].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em', color: '#7A7880', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((item, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #F4F3EF' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <input value={item.sku} onChange={e => updateItem(i, 'sku', e.target.value)}
                            placeholder="BPS-NVY-M" style={{ ...cellInput, width: '100px' }} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <input value={item.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)}
                            placeholder="Business Polo Shirt" style={{ ...cellInput, width: '160px' }} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <input value={item.color} onChange={e => updateItem(i, 'color', e.target.value)}
                            placeholder="Navy" style={{ ...cellInput, width: '80px' }} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <select value={item.size} onChange={e => updateItem(i, 'size', e.target.value)}
                            style={{ ...cellInput, width: '70px' }}>
                            <option value="">—</option>
                            {['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <input type="number" value={item.quantity_ordered}
                            onChange={e => updateItem(i, 'quantity_ordered', parseInt(e.target.value) || 0)}
                            min="1" style={{ ...cellInput, width: '60px', textAlign: 'center' }} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <span style={{ fontSize: '12px', color: '#aaa' }}>$</span>
                            <input type="number" value={item.unit_cost}
                              onChange={e => updateItem(i, 'unit_cost', parseFloat(e.target.value) || 0)}
                              min="0" step="0.01" style={{ ...cellInput, width: '70px' }} />
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: '13px', color: '#2A2830' }}>
                          ${(item.quantity_ordered * item.unit_cost).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {form.items.length > 1 && (
                            <button onClick={() => removeItem(i)}
                              style={{ background: 'none', border: 'none', color: '#E8242A', cursor: 'pointer', fontSize: '16px' }}>🗑️</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <div style={{ background: '#F4F3EF', borderRadius: '8px', padding: '14px 20px', minWidth: '240px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#7A7880', marginBottom: '6px' }}>
                    <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700, color: '#2A2830', borderTop: '1px solid #E2E0DA', paddingTop: '8px', marginTop: '6px' }}>
                    <span>Total</span><span>${subtotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '22px' }}>
              <label style={labelStyle}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3} placeholder="Internal notes for this purchase order..."
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)}
                style={{ padding: '11px 22px', border: '1px solid #E2E0DA', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={() => handleCreate('draft')}
                style={{ padding: '11px 22px', border: '1px solid #E2E0DA', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 700, color: '#2A2830' }}>
                Save as Draft
              </button>
              <button onClick={() => handleCreate('sent')}
                style={{ padding: '11px 22px', background: '#1A5CFF', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
                Send to Supplier →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW PO DETAIL MODAL ── */}
      {selectedPO && !showReceive && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}
          onClick={() => setSelectedPO(null)}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '780px', padding: '28px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-bebas)', fontSize: '26px', color: '#2A2830', marginBottom: '6px' }}>{selectedPO.po_number}</h2>
                <StatusBadge status={selectedPO.status} />
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {['sent', 'partial'].includes(selectedPO.status) && (
                  <button onClick={() => setShowReceive(true)}
                    style={{ padding: '9px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>
                    ✓ Receive Inventory
                  </button>
                )}
                <button onClick={() => setSelectedPO(null)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#aaa' }}>✕</button>
              </div>
            </div>

            <div className="checkout-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', background: '#F4F3EF', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
              {[
                { label: 'Supplier', value: selectedPO.supplier_name },
                { label: 'Expected Date', value: selectedPO.expected_date ? new Date(selectedPO.expected_date).toLocaleDateString() : '—' },
                { label: 'Created', value: new Date(selectedPO.created_at).toLocaleDateString() },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#aaa', marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ border: '1px solid #E2E0DA', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F4F3EF' }}>
                    {['SKU', 'Product', 'Color', 'Size', 'Ordered', 'Received', 'Unit Cost', 'Total'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em', color: '#7A7880', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedPO.items.map(item => (
                    <tr key={item.id} style={{ borderTop: '1px solid #F4F3EF' }}>
                      <td style={{ padding: '12px 14px', fontSize: '12px', fontFamily: 'monospace', color: '#7A7880' }}>{item.sku}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: '13px' }}>{item.product_name}</td>
                      <td style={{ padding: '12px 14px', fontSize: '13px' }}>{item.color}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ background: '#F4F3EF', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>{item.size}</span>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, fontSize: '14px' }}>{item.quantity_ordered}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px', color: item.quantity_received >= item.quantity_ordered ? '#059669' : item.quantity_received > 0 ? '#D97706' : '#aaa' }}>
                          {item.quantity_received}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '13px', color: '#7A7880' }}>${item.unit_cost.toFixed(2)}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, fontFamily: 'var(--font-bebas)', fontSize: '16px' }}>${item.total_cost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ background: '#F4F3EF', borderRadius: '8px', padding: '14px 20px', minWidth: '220px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontFamily: 'var(--font-bebas)', color: '#2A2830' }}>
                  <span>TOTAL</span><span>${selectedPO.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
            {selectedPO.notes && (
              <div style={{ marginTop: '16px', padding: '12px 16px', background: '#F4F3EF', borderRadius: '8px', fontSize: '13px', color: '#7A7880' }}>
                <strong>Notes:</strong> {selectedPO.notes}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RECEIVE INVENTORY MODAL ── */}
      {selectedPO && showReceive && (
        <ReceiveModal
          po={selectedPO}
          onClose={() => { setShowReceive(false); setSelectedPO(null) }}
          onReceive={handleReceive}
        />
      )}
    </div>
  )
}
