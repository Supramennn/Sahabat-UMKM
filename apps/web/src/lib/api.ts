/**
 * Klien API untuk sisi peramban.
 *
 * Semua panggilan memakai credentials: 'include' karena sesi memakai cookie
 * HttpOnly. Token tidak pernah menyentuh JavaScript, sehingga halaman tidak
 * perlu menangani penyimpanan token dan tidak ada token yang bisa dicuri lewat
 * penyisipan skrip.
 *
 * Semua balasan galat membawa bentuk yang sama, jadi satu komponen bisa
 * menampilkannya tanpa memeriksa bentuk per endpoint (PRD 10).
 */

export interface ApiError {
  error: string
  message?: string
  problems?: string[]
  fields?: Array<{ path: string; message: string }>
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }


/**
 * Host API harus sama dengan asal halaman. API hanya mengizinkan satu asal, jadi
 * memakai 127.0.0.1 sementara halaman dibuka lewat localhost membuat setiap
 * permintaan ditolak dan halaman tampak seperti jaringan bermasalah.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export { API_BASE }

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    return { ok: false, error: { error: 'jaringan', message: 'Tidak bisa menghubungi server.' } }
  }

  if (response.status === 204) {
    return { ok: true, data: undefined as T }
  }

  let parsed: unknown = {}
  try {
    parsed = await response.json()
  } catch {
    parsed = {}
  }

  if (!response.ok) {
    return { ok: false, error: parsed as ApiError }
  }

  return { ok: true, data: parsed as T }
}

export function apiGet<T>(path: string): Promise<ApiResult<T>> {
  return request<T>(path)
}

export function apiPost<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  // Body kosong tidak dikirim sama sekali, bukan dikirim sebagai undefined, karena
  // fetch akan memperlakukannya berbeda dan Content-Type jadi tidak perlu.
  if (body === undefined) {
    return request<T>(path, { method: 'POST' })
  }
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export function apiPatch<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
}

export function apiPut<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
}

export function apiDelete<T>(path: string): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'DELETE' })
}

/** Pesan yang bisa ditampilkan ke pengguna dari galat apa pun. */
export function errorMessage(error: ApiError, fallback = 'Terjadi kesalahan. Coba lagi.'): string {
  if (error.problems && error.problems.length > 0) {
    return error.problems.join(' ')
  }
  if (error.message) {
    return error.message
  }
  return fallback
}

export type SessionResponse = {
  user: {
    id: number
    email: string
    name: string
    emailVerified: boolean
    mfaRequiredAt: string | null
  }
  activeWorkspaceId: number | null
  workspaces: Array<{ id: number; name: string; slug: string; role: string }>
  mfaSatisfied: boolean
}

export type LoginResponse = {
  userId: number
  workspaceId: number | null
  mfaRequired: boolean
  /**
   * Owner dan Admin wajib MFA pada hari ke-30 (PRD 9). Sesi tetap terbit supaya
   * pengaturan akun bisa dibuka, tapi endpoint workspace akan menolak.
   */
  mfaSetupRequired: boolean
}

export type MfaVerifyResponse = { verified: boolean; workspaceId: number | null }

export type MfaSetupResponse = { secret: string; uri: string; expiresInMinutes: number }

export type RecoveryCodesResponse = { confirmed?: boolean; recoveryCodes: string[] }

export type DevicesResponse = {
  devices: Array<{
    id: string
    label: string
    user_agent: string | null
    last_seen_at: string
    active_sessions: number
    current_session: boolean
  }>
}

export type MessageResponse = { message: string }

export type WorkspaceResponse = {
  workspace: {
    id: number
    name: string
    slug: string
    businessType: string | null
    timezone: string
    currency: string
    status: string
    createdAt: string
  }
  role: string
  settings: { approvalRequired: boolean; approvalThresholdAmount: number | null }
}

export type ProductSummary = {
  id: number
  sku: string
  name: string
  unitCode: string
  status: string
  categoryId: number | null
  categoryName: string | null
  referencePurchasePrice: number | null
  sellingPrice: number | null
  averageCost: number
  minStock: number | null
  totalQuantity: number
  stockStatus: 'habis' | 'stok_rendah' | 'normal'
  stockStatusLabel: string
  photoKey: string | null
}

export type ProductsResponse = {
  products: ProductSummary[]
  pagination: { limit: number; offset: number; total: number }
}

export type StockBalance = {
  productId: number
  productName: string
  sku: string
  unitCode: string
  locationId: number
  locationName: string
  quantity: number
  minStock: number | null
  status: 'habis' | 'stok_rendah' | 'normal'
  statusLabel: string
  earliestExpiry: string | null
}

export type StockMovement = {
  id: number
  kind: string
  kindLabel: string
  quantity: number
  unitCost: number | null
  balanceBefore: number
  balanceAfter: number
  reasonCode: string
  reference: string | null
  note: string | null
  occurredOn: string
  productId: number
  productName: string
  unitCode: string
  locationId: number
  locationName: string
  actorName: string | null
}

export type StockCount = {
  countId: number
  locationId: number
  locationName: string
  status: string
  startedAt?: string
  note: string | null
  countedItems?: number
  totalItems?: number
}

export type StockCountDetail = {
  count: StockCount
  items: Array<{
    itemId: number
    productId: number
    productName: string
    sku: string
    unitCode: string
    systemQuantity: number
    countedQuantity: number
    variance: number | null
    counted: boolean
  }>
}

export type Location = {
  id: number
  name: string
  code: string | null
  archived: boolean
  isDefault: boolean
}

export type LocationsResponse = { locations: Location[] }

export type StockAlert = {
  productId: number
  productName: string
  sku: string
  unitCode: string
  locationId: number
  locationName: string
  quantity: number
  minStock: number | null
  status: 'habis' | 'stok_rendah' | 'normal'
  statusLabel: string
  earliestExpiry: string | null
  reasons: string[]
}

export type AlertsResponse = { withinDays: number; alerts: StockAlert[] }

export type Category = { id: number; name: string; productCount: number }

export type Supplier = {
  id: number
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  paymentTermDays: number | null
  note: string | null
  archived: boolean
  outstanding: number
}

export type SuppliersResponse = { suppliers: Supplier[] }

export type PurchaseOrder = {
  id: number
  number: string
  status: string
  statusLabel: string
  orderedOn: string
  expectedOn: string | null
  totalAmount: number
  receivedTotal: number
  orderedTotal: number
  note: string | null
  supplierId: number
  supplierName: string
  locationId: number
  locationName: string
  createdByName: string
}

export type PurchaseOrderItem = {
  id: number
  productId: number
  productName: string
  sku: string
  unitCode: string
  quantity: number
  unitPrice: number
  discountAmount: number
  lineTotal: number
  receivedQuantity: number
  outstanding: number
  note: string | null
}

export type PurchaseOrderDetail = {
  order: PurchaseOrder
  items: PurchaseOrderItem[]
  receipts: Array<{ receiptId: number; number: string; receivedOn: string; receivedByName: string }>
  revisions: Array<{ revisionNumber: number; reason: string; changedByName: string }>
}

export type GoodsReceipt = {
  receiptId: number
  number: string
  receivedOn: string
  supplierName: string
  locationName: string
  purchaseOrderId: number | null
  orderNumber: string | null
}

export type SupplierDebt = {
  supplierId: number
  supplierName: string
  purchaseOrderId: number | null
  orderNumber: string | null
  dueOn: string | null
  receivedValue: number
  paidValue: number
  outstanding: number
  overdueDays: number | null
}

export type CategoriesResponse = { categories: Category[] }

export type ImportProblem = { rowNumber: number; message: string }

export type ImportPreview = {
  totalRows: number
  validRows: number
  problemRows: number
  problems: ImportProblem[]
  sample: Array<{ rowNumber: number; sku: string; name: string; unitCode: string }>
  maxRowsPerImport: number
  exceedsRowLimit: boolean
}

export type ImportResult = {
  replayed: boolean
  imported: number
  skipped: number
  categoriesCreated: number
  skippedRows: Array<{ rowNumber: number; sku: string; message: string }>
}
