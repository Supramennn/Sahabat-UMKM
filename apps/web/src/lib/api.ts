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

export type StockBalancesResponse = { balances: StockBalance[] }

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
  outstanding: number | null
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

export type PurchaseOrdersResponse = {
  orders: PurchaseOrder[]
  pagination: { limit: number; offset: number; total: number }
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

/** Empat jenis impor PRD 6.8. Nilainya sama dengan kolom kind di tabel import_jobs. */
export type ImportKind = 'produk' | 'supplier' | 'saldo_awal' | 'penjualan'

export type ImportPreviewBase = {
  totalRows: number
  validRows: number
  problemRows: number
  problems: ImportProblem[]
  maxRowsPerImport: number
  exceedsRowLimit: boolean
}

export type ImportPreview = ImportPreviewBase & {
  sample: Array<{
    rowNumber: number
    sku: string
    name: string
    unitCode: string
    categoryName: string | null
    purchasePrice: number | null
    sellingPrice: number | null
    minStock: number | null
  }>
}

export type ImportResult = {
  replayed: boolean
  importJobId: number
  imported: number
  skipped: number
  categoriesCreated: number
  skippedRows: Array<{ rowNumber: number; sku: string; message: string }>
}

export type SupplierImportPreview = ImportPreviewBase & {
  sample: Array<{
    rowNumber: number
    name: string
    contactName: string | null
    phone: string | null
  }>
}

export type SupplierImportResult = {
  replayed: boolean
  importJobId: number
  imported: number
  skipped: number
  skippedRows: Array<{ rowNumber: number; name: string; message: string }>
}

export type OpeningImportPreview = ImportPreviewBase & {
  sample: Array<{
    rowNumber: number
    sku: string
    locationName: string
    quantity: number
    unitCost: number | null
    occurredOn: string | null
  }>
}

export type OpeningImportResult = {
  replayed: boolean
  importJobId: number
  imported: number
  totalQuantity: number
}

/** Satu pekerjaan impor di riwayat (PRD 6.8), beserta alasan tidak bisa dibatalkan. */
export type ImportJob = {
  id: number
  kind: ImportKind
  kindLabel: string
  fileName: string | null
  totalRows: number
  importedRows: number
  skippedRows: number
  createdAt: string
  createdByName: string | null
  cancelledAt: string | null
  cancelledByName: string | null
  status: 'selesai' | 'dibatalkan'
  cancelable: boolean
  cancelBlockedReason: string | null
}

export type ImportJobsResponse = {
  jobs: ImportJob[]
  pagination: { limit: number; offset: number; total: number }
}

export type CancelImportResult = { cancelled: number; replayed: boolean }

export type Sale = {
  id: number
  number: string
  soldOn: string
  locationName: string
  customerName: string | null
  paymentMethodLabel: string
  totalAmount: number
  costTotal: number
  grossProfit: number
  status: string
  statusLabel: string
  itemCount: number
}

export type SalesResponse = {
  sales: Sale[]
  pagination: { limit: number; offset: number; total: number }
}

export type SaleItem = {
  id: number
  productId: number
  productName: string
  sku: string
  unitCode: string
  quantity: number
  unitPrice: number
  discountAmount: number
  lineTotal: number
  unitCostSnapshot: number
  costTotal: number
  note: string | null
}

export type SaleDetail = {
  sale: Sale & {
    locationId: number
    customerId: number | null
    subtotal: number
    discountTotal: number
    cancelReason: string | null
    cancelledAt: string | null
    note: string | null
    createdByName: string
  }
  items: SaleItem[]
}

export type CreatedSale = {
  saleId: number
  number: string
  totalAmount: number
  costTotal: number
  grossProfit: number
  replayed: boolean
}

export type CancelledSale = {
  saleId: number
  number: string
  reversedMovements: number
  replayed: boolean
}

export type Customer = {
  id: number
  name: string
  phone: string | null
  note: string | null
  archived: boolean
  saleCount: number
  saleTotal: number
}

export type CustomersResponse = { customers: Customer[] }

export type PaymentMethod = { id: number; name: string; archived: boolean }

export type PaymentMethodsResponse = { paymentMethods: PaymentMethod[] }

export type SalesImportPreview = ImportPreviewBase & {
  sample: Array<{
    rowNumber: number
    soldOn: string
    sku: string
    quantity: number
    unitPrice: number
  }>
}

export type SalesImportResult = {
  replayed: boolean
  importJobId: number
  imported: number
  firstNumber: string | null
  lastNumber: string | null
  totalAmount: number
}

export type Expense = {
  id: number
  spentOn: string
  categoryName: string
  description: string
  amount: number
  reference: string | null
  purchaseOrderNumber: string | null
  createdByName: string
  attachmentCount: number
}

export type ExpensesResponse = {
  expenses: Expense[]
  summary: { totalAmount: number }
  pagination: { limit: number; offset: number; total: number }
}

export type ExpenseCategory = {
  id: number
  name: string
  archived: boolean
  expenseCount: number
  totalAmount: number
  looksLikeStockPurchase: boolean
}

export type ExpenseCategoriesResponse = { categories: ExpenseCategory[] }

export type ExpenseDetailResponse = {
  expense: Expense & {
    purchaseOrderId: number | null
    createdAt: string
  }
  attachments: Array<{
    id: number
    kind: string
    fileName: string
    contentType: string
    sizeBytes: number
    url: string
  }>
}

export type BillingPeriod = 'bulanan' | 'tahunan'

export type PaymentItem = {
  id: number
  number: string
  plan: 'usaha' | 'bisnis'
  planName: string
  period: BillingPeriod
  periodLabel: string
  amount: number
  status: 'menunggu' | 'dibayar' | 'gagal' | 'kedaluwarsa'
  statusLabel: string
  paymentMethod: string | null
  paymentMethodLabel: string | null
  redirectUrl: string | null
  createdAt: string
  paidAt: string | null
  expiresAt: string
}

export type SubscriptionResponse = {
  subscription: {
    plan: 'gratis' | 'usaha' | 'bisnis'
    status: 'aktif' | 'uji_coba'
    trialStartedAt: string | null
    trialEndsAt: string | null
    trialUsed: boolean
    currentPeriodEnd: string | null
    billingPeriod: BillingPeriod | null
  }
  plans: Array<{
    code: 'gratis' | 'usaha' | 'bisnis'
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
  }>
  pricingNote: string
  billingEnabled: boolean
  billing: {
    refundPolicyUrl: string | null
    yearlyMonths: number
  }
}

export type CheckoutResponse = { payment: PaymentItem }

export type PaymentsResponse = { payments: PaymentItem[] }

/* Notifikasi ------------------------------------------------------------------ */

export type NotificationItem = {
  id: number
  kind: string
  kindLabel: string
  title: string
  body: string
  href: string | null
  workspaceId: number | null
  read: boolean
  createdAt: string
}

export type NotificationsResponse = {
  notifications: NotificationItem[]
  total: number
  unreadCount: number
  limit: number
  offset: number
}

export type UnreadCountResponse = { unreadCount: number }

export type MarkReadResponse = { marked: number }

export type NotificationPreferencesResponse = {
  preferences: Array<{
    kind: string
    label: string
    description: string
    inApp: boolean
    email: boolean
  }>
  digestEnabled: boolean
}

/* Daftar periksa aktivasi (PRD 12) -------------------------------------------- */

export type ActivationStepKey = 'profil_usaha' | 'produk' | 'stok_awal' | 'transaksi'

export type OnboardingStep = {
  key: ActivationStepKey
  label: string
  detail: string
  href: string
  /** Kerja yang belum dikerjakan di dalam langkah; kosong saat langkah selesai. */
  sisa: string[]
  done: boolean
  skipped: boolean
}

export type OnboardingResponse = {
  langkah: OnboardingStep[]
  semuaSelesai: boolean
}

/* Berkas impor --------------------------------------------------------------- */

export interface ImportFilePayload {
  fileName: string
  content?: string
  contentBase64?: string
}

/**
 * Membaca berkas yang dipilih pengguna menjadi isi yang siap dikirim. XLSX dikirim
 * sebagai base64 karena JSON tidak membawa biner; CSV dikirim sebagai teks supaya
 * isinya bisa ditampilkan dan diperbaiki di kotak isian.
 *
 * Jenis berkas ditentukan dari penanda PK di awal isinya, sama seperti yang
 * diperiksa server, bukan dari nama berkas. Nama yang salah atau tanpa ekstensi
 * tidak membuat isi spreadsheet dibaca sebagai teks dan gagal dengan pesan kolom
 * yang membingungkan.
 */
export async function readImportPayload(file: File): Promise<ApiResult<ImportFilePayload>> {
  try {
    const penanda = new Uint8Array(await file.slice(0, 2).arrayBuffer())
    const xlsx = penanda[0] === 0x50 && penanda[1] === 0x4b

    if (xlsx) {
      if (file.size > 7_000_000) {
        return {
          ok: false,
          error: {
            error: 'berkas_terlalu_besar',
            message: 'Berkas XLSX lebih dari 7 MB. Pecah berkasnya menjadi beberapa bagian.',
          },
        }
      }

      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      const potongan = 8192
      for (let index = 0; index < bytes.length; index += potongan) {
        binary += String.fromCharCode(...bytes.subarray(index, index + potongan))
      }
      return { ok: true, data: { fileName: file.name, contentBase64: btoa(binary) } }
    }

    if (file.size > 5_000_000) {
      return {
        ok: false,
        error: {
          error: 'berkas_terlalu_besar',
          message: 'Berkas teks lebih dari 5 MB. Pecah berkasnya menjadi beberapa bagian.',
        },
      }
    }

    return { ok: true, data: { fileName: file.name, content: await file.text() } }
  } catch {
    return { ok: false, error: { error: 'berkas_tidak_bisa_dibaca', message: 'Berkas tidak bisa dibaca.' } }
  }
}

/** Template CSV sebagai teks, untuk diisi ke kotak isian di layar. */
export async function importTemplateCsv(
  workspaceId: number,
  kind: ImportKind,
): Promise<ApiResult<string>> {
  try {
    const response = await fetch(
      `${API_BASE}/api/workspaces/${workspaceId}/imports/templates/${kind}?format=csv`,
      { credentials: 'include' },
    )
    if (!response.ok) {
      return { ok: false, error: (await response.json().catch(() => ({}))) as ApiError }
    }
    return { ok: true, data: await response.text() }
  } catch {
    return { ok: false, error: { error: 'jaringan', message: 'Tidak bisa menghubungi server.' } }
  }
}

/**
 * Mengunduh template dari server. Template dibuat server, bukan di halaman, supaya
 * contoh kolomnya selalu sama dengan yang diterima validator impor.
 */
export async function downloadImportTemplate(
  workspaceId: number,
  kind: ImportKind,
  format: 'csv' | 'xlsx',
): Promise<ApiResult<true>> {
  try {
    const response = await fetch(
      `${API_BASE}/api/workspaces/${workspaceId}/imports/templates/${kind}?format=${format}`,
      { credentials: 'include' },
    )
    if (!response.ok) {
      return { ok: false, error: (await response.json().catch(() => ({}))) as ApiError }
    }

    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = `template-impor-${kind.replace(/_/g, '-')}.${format}`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    return { ok: true, data: true }
  } catch {
    return { ok: false, error: { error: 'jaringan', message: 'Tidak bisa menghubungi server.' } }
  }
}
