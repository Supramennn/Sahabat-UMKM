/**
 * Matriks izin dari PRD 8. Setiap endpoint memeriksa tabel ini di server.
 * Menyembunyikan tombol di tampilan bukan kontrol keamanan (PRD 8).
 *
 * Nilai yang dipakai:
 *   manage  boleh membuat, mengubah, dan menghapus
 *   count   boleh memasukkan angka hasil hitung tanpa menyetujui
 *   view    hanya boleh membaca
 *   purchase khusus laporan pembelian
 *   partial hanya sebagian, ditentukan per aturan di catatan
 *   none    tidak boleh
 */

export const roles = ['owner', 'admin', 'purchasing', 'staff', 'viewer'] as const
export type Role = (typeof roles)[number]

export const roleLabels: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  purchasing: 'Purchasing',
  staff: 'Staf',
  viewer: 'Viewer',
}

export const capabilities = [
  'subscription.manage',
  'workspace.delete',
  'members.manage',
  'products.manage',
  'locations.manage',
  'stock.movements',
  'stock.adjustments',
  'stock.opname',
  'suppliers.manage',
  'purchase_orders.create',
  'purchase_orders.approve',
  'sales.record',
  'expenses.manage',
  'reports.stock',
  'reports.sales',
  'reports.purchasing',
  'reports.debt',
  'reports.gross_profit',
  'reports.expenses',
  'data.export',
  'data.import',
  'audit_log.view',
] as const
export type Capability = (typeof capabilities)[number]

export type Grant = 'manage' | 'count' | 'view' | 'purchase' | 'partial' | 'none'

/**
 * stock.adjustments dipisah dari stock.movements karena keduanya tidak sama.
 * Staf boleh mencatat barang yang benar-benar keluar (PRD 8), tapi penyesuaian
 * mengubah catatan tanpa barang yang bergerak, jadi hanya Owner dan Admin.
 * Menyetujui hasil opname memakai izin yang sama, karena hasilnya adalah
 * penyesuaian.
 */

/**
 * B-02: Viewer boleh melihat PO, jadi ia boleh melihat harga beli supplier.
 * Karena itu Viewer tidak menerima laporan pembelian, utang supplier, dan
 * laba kotor, walaupun tabel PRD 8 menulis "Sesuai izin" untuk laporan keuangan.
 */
export const grants: Record<Role, Record<Capability, Grant>> = {
  owner: {
    'subscription.manage': 'manage',
    'workspace.delete': 'manage',
    'members.manage': 'manage',
    'products.manage': 'manage',
    'locations.manage': 'manage',
    'stock.movements': 'manage',
    'stock.adjustments': 'manage',
    'stock.opname': 'manage',
    'suppliers.manage': 'manage',
    'purchase_orders.create': 'manage',
    'purchase_orders.approve': 'manage',
    'sales.record': 'manage',
    'expenses.manage': 'manage',
    'reports.stock': 'view',
    'reports.sales': 'view',
    'reports.purchasing': 'view',
    'reports.debt': 'view',
    'reports.gross_profit': 'view',
    'reports.expenses': 'view',
    'data.export': 'manage',
    'data.import': 'manage',
    'audit_log.view': 'view',
  },
  admin: {
    'subscription.manage': 'none',
    'workspace.delete': 'none',
    'members.manage': 'partial',
    'products.manage': 'manage',
    'locations.manage': 'manage',
    'stock.movements': 'manage',
    'stock.adjustments': 'manage',
    'stock.opname': 'manage',
    'suppliers.manage': 'manage',
    'purchase_orders.create': 'manage',
    'purchase_orders.approve': 'manage',
    'sales.record': 'manage',
    'expenses.manage': 'manage',
    'reports.stock': 'view',
    'reports.sales': 'view',
    'reports.purchasing': 'view',
    'reports.debt': 'view',
    'reports.gross_profit': 'view',
    'reports.expenses': 'view',
    'data.export': 'manage',
    'data.import': 'manage',
    'audit_log.view': 'view',
  },
  purchasing: {
    // PRD 8 menulis "Pembelian saja" untuk laporan keuangan dan ekspor Purchasing,
    // jadi utang supplier dan laba kotor tidak termasuk (lihat tes permissions).
    'subscription.manage': 'none',
    'workspace.delete': 'none',
    'members.manage': 'none',
    'products.manage': 'view',
    'locations.manage': 'view',
    'stock.movements': 'none',
    'stock.adjustments': 'none',
    'stock.opname': 'none',
    'suppliers.manage': 'manage',
    'purchase_orders.create': 'manage',
    'purchase_orders.approve': 'partial',
    'sales.record': 'none',
    'expenses.manage': 'none',
    'reports.stock': 'view',
    'reports.sales': 'none',
    'reports.purchasing': 'purchase',
    'reports.debt': 'none',
    'reports.gross_profit': 'none',
    'reports.expenses': 'none',
    'data.export': 'partial',
    'data.import': 'none',
    'audit_log.view': 'none',
  },
  staff: {
    'subscription.manage': 'none',
    'workspace.delete': 'none',
    'members.manage': 'none',
    'products.manage': 'none',
    'locations.manage': 'none',
    'stock.movements': 'manage',
    'stock.adjustments': 'none',
    'stock.opname': 'count',
    'suppliers.manage': 'none',
    'purchase_orders.create': 'none',
    'purchase_orders.approve': 'none',
    'sales.record': 'manage',
    'expenses.manage': 'none',
    'reports.stock': 'none',
    'reports.sales': 'none',
    'reports.purchasing': 'none',
    'reports.debt': 'none',
    'reports.gross_profit': 'none',
    'reports.expenses': 'none',
    'data.export': 'none',
    'data.import': 'none',
    'audit_log.view': 'none',
  },
  viewer: {
    'subscription.manage': 'none',
    'workspace.delete': 'none',
    'members.manage': 'none',
    'products.manage': 'view',
    'locations.manage': 'view',
    'stock.movements': 'none',
    'stock.adjustments': 'none',
    'stock.opname': 'none',
    'suppliers.manage': 'view',
    'purchase_orders.create': 'none',
    'purchase_orders.approve': 'none',
    'sales.record': 'none',
    'expenses.manage': 'none',
    'reports.stock': 'view',
    'reports.sales': 'view',
    'reports.purchasing': 'none',
    'reports.debt': 'none',
    'reports.gross_profit': 'none',
    'reports.expenses': 'none',
    'data.export': 'none',
    'data.import': 'none',
    'audit_log.view': 'none',
  },
}

export function can(role: Role, capability: Capability, grant?: Grant): boolean {
  const effective = grant ?? grants[role][capability]
  return effective !== 'none'
}

export function grantFor(role: Role, capability: Capability): Grant {
  return grants[role][capability]
}

/**
 * B-01: Admin boleh mengajak staf, purchasing, dan viewer, tetapi tidak boleh
 * menetapkan peran Admin dan tidak boleh menyentuh peran Owner.
 */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (actor === 'owner') return true
  if (actor !== 'admin') return false
  return target !== 'owner' && target !== 'admin'
}
