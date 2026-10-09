import { describe, expect, it } from 'vitest'
import { can, canAssignRole, capabilities, grantFor, grants, roles } from '../src/permissions.ts'

describe('kelengkapan matriks izin PRD 8', () => {
  it('semua peran punya nilai untuk semua kemampuan', () => {
    for (const role of roles) {
      for (const capability of capabilities) {
        expect(grants[role][capability], `${role} / ${capability}`).toBeDefined()
      }
    }
  })

  it('nilai semua berasal dari daftar yang dikenal', () => {
    const known = new Set(['manage', 'count', 'view', 'purchase', 'partial', 'none'])
    for (const role of roles) {
      for (const capability of capabilities) {
        expect(known.has(grants[role][capability])).toBe(true)
      }
    }
  })
})

describe('batas yang PRD 8 tetapkan', () => {
  it('hanya Owner yang mengelola langganan, faktur, dan hapus workspace', () => {
    for (const role of roles) {
      const expected = role === 'owner'
      expect(can(role, 'subscription.manage'), role).toBe(expected)
      expect(can(role, 'workspace.delete'), role).toBe(expected)
    }
  })

  it('hanya Owner dan Admin yang dapat menyusun PO', () => {
    expect(can('owner', 'purchase_orders.create')).toBe(true)
    expect(can('admin', 'purchase_orders.create')).toBe(true)
    expect(can('purchasing', 'purchase_orders.create')).toBe(true)
    expect(can('staff', 'purchase_orders.create')).toBe(false)
    expect(can('viewer', 'purchase_orders.create')).toBe(false)
  })

  it('Staf hanya boleh menghitung pada stok opname, bukan menyetujui', () => {
    expect(grantFor('staff', 'stock.opname')).toBe('count')
    expect(can('staff', 'stock.opname')).toBe(true)
    expect(can('staff', 'purchase_orders.approve')).toBe(false)
  })

  it('Purchasing tidak dapat memasukkan stok atau penjualan', () => {
    expect(can('purchasing', 'stock.movements')).toBe(false)
    expect(can('purchasing', 'sales.record')).toBe(false)
  })

  it('Viewer hanya membaca, tidak pernah mengubah', () => {
    const bisaUbah = capabilities.filter(
      (capability) => grantFor('viewer', capability) === 'manage' || grantFor('viewer', capability) === 'count',
    )
    expect(bisaUbah).toEqual([])
  })

  it('Purchasing hanya melihat laporan pembelian', () => {
    expect(grantFor('purchasing', 'reports.purchasing')).toBe('purchase')
    expect(can('purchasing', 'reports.gross_profit')).toBe(false)
    expect(can('purchasing', 'reports.debt')).toBe(false)
  })

  it('audit log hanya untuk Owner dan Admin', () => {
    expect(can('owner', 'audit_log.view')).toBe(true)
    expect(can('admin', 'audit_log.view')).toBe(true)
    for (const role of ['purchasing', 'staff', 'viewer'] as const) {
      expect(can(role, 'audit_log.view'), role).toBe(false)
    }
  })
})

describe('B-02, laporan keuangan untuk Viewer', () => {
  it('Viewer tidak melihat pembelian, utang, dan laba kotor', () => {
    expect(can('viewer', 'reports.purchasing')).toBe(false)
    expect(can('viewer', 'reports.debt')).toBe(false)
    expect(can('viewer', 'reports.gross_profit')).toBe(false)
  })

  it('Viewer tetap melihat posisi stok dan penjualan', () => {
    expect(can('viewer', 'reports.stock')).toBe(true)
    expect(can('viewer', 'reports.sales')).toBe(true)
  })
})

describe('B-01, Admin dan pengangkatan peran', () => {
  it('Owner dapat menetapkan semua peran', () => {
    for (const target of roles) {
      expect(canAssignRole('owner', target), target).toBe(true)
    }
  })

  it('Admin dapat mengangkat staf, purchasing, dan viewer', () => {
    expect(canAssignRole('admin', 'staff')).toBe(true)
    expect(canAssignRole('admin', 'purchasing')).toBe(true)
    expect(canAssignRole('admin', 'viewer')).toBe(true)
  })

  it('Admin tidak dapat menetapkan Admin atau Owner', () => {
    expect(canAssignRole('admin', 'admin')).toBe(false)
    expect(canAssignRole('admin', 'owner')).toBe(false)
  })

  it('Purchasing, Staf, dan Viewer tidak dapat menetapkan peran', () => {
    for (const actor of ['purchasing', 'staff', 'viewer'] as const) {
      expect(canAssignRole(actor, 'staff'), actor).toBe(false)
    }
  })

  it('tidak ada peran yang dapat mengangkat dirinya sendiri lebih tinggi', () => {
    for (const role of ['purchasing', 'staff', 'viewer'] as const) {
      expect(canAssignRole(role, 'owner'), role).toBe(false)
      expect(canAssignRole(role, 'admin'), role).toBe(false)
    }
  })
})
