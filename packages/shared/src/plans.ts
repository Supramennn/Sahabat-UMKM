export const planCodes = ['gratis', 'usaha', 'bisnis'] as const
export type PlanCode = (typeof planCodes)[number]

export const planCatalog: Record<PlanCode, {
  name: string
  proposedMonthlyPrice: number
  activeProducts: number
  members: number
  locations: number
  sales: boolean
  returns: boolean
  stocktake: boolean
  xlsxExport: boolean
  multilevelApproval: boolean
  auditLogDays: number
}> = {
  gratis: {
    name: 'Gratis', proposedMonthlyPrice: 0, activeProducts: 100, members: 2,
    locations: 1, sales: false, returns: false, stocktake: false,
    xlsxExport: false, multilevelApproval: false, auditLogDays: 30,
  },
  usaha: {
    name: 'Usaha', proposedMonthlyPrice: 99000, activeProducts: 1000, members: 5,
    locations: 2, sales: true, returns: true, stocktake: true,
    xlsxExport: true, multilevelApproval: false, auditLogDays: 90,
  },
  bisnis: {
    name: 'Bisnis', proposedMonthlyPrice: 249000, activeProducts: 10000, members: 15,
    locations: 5, sales: true, returns: true, stocktake: true,
    xlsxExport: true, multilevelApproval: true, auditLogDays: 365,
  },
}

export const TRIAL_DAYS = 14

export function planLimitMessage(resource: 'produk' | 'anggota' | 'lokasi', limit: number): string {
  const names = { produk: 'produk aktif', anggota: 'anggota', lokasi: 'lokasi' }
  return `Batas paket untuk ${names[resource]} adalah ${limit}. Turunkan jumlah yang digunakan atau pilih paket lain di Pengaturan.`
}
