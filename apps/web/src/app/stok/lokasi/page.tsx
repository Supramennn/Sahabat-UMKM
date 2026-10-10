'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useApp } from '../../components/app-context'
import { AppShell } from '../../components/shell'
import { Alert, ErrorState } from '../../components/ui'
import {
  apiGet,
  apiPost,
  errorMessage,
  type LocationsResponse,
} from '../../../lib/api'
import styles from '../stok.module.css'

/**
 * PRD 5: Stok > Lokasi. Saldo dihitung per produk per lokasi, jadi daftar lokasi
 * adalah tempat pengguna melihat dan mengelola tempat penyimpanan barang.
 *
 * Batas jumlah lokasi per paket belum ditampilkan karena paket belum ada; menambah
 * angka batas sekarang hanya akan mengabadikan perkiraan.
 */

export default function LocationsPage() {
  const app = useApp()

  const [locations, setLocations] = useState<LocationsResponse['locations'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  async function load() {
    const result = await apiGet<LocationsResponse>(`/api/workspaces/${app.workspaceId}/locations`)
    if (result.ok) {
      setLocations(result.data.locations)
      setError(null)
    } else {
      setError(errorMessage(result.error, 'Daftar lokasi tidak bisa dimuat.'))
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [app.workspaceId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(null)

    const result = await apiPost(`/api/workspaces/${app.workspaceId}/locations`, { name })
    setBusy(false)

    if (!result.ok) {
      setError(errorMessage(result.error, 'Lokasi tidak bisa ditambah.'))
      return
    }

    setName('')
    setSuccess('Lokasi sudah ditambahkan.')
    await load()
  }

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref="/stok/lokasi"
      breadcrumb="Stok"
      title="Lokasi"
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      {success ? <Alert kind="success">{success}</Alert> : null}

      {loading ? (
        <p role="status">Memuat daftar lokasi.</p>
      ) : locations && locations.length === 0 ? (
        <ErrorState
          title="Belum ada lokasi"
          body="Tambahkan gudang, toko, atau kedai supaya stok bisa dipisahkan per tempat."
        />
      ) : null}

      {!loading && locations && locations.length > 0 ? (
        <ul className={styles.list}>
          {locations.map((item) => (
            <li key={item.id} className={styles.card}>
              <span className={styles.cardName}>{item.name}</span>
              <span className={styles.cardMeta}>
                {item.isDefault ? 'Lokasi bawaan' : 'Lokasi tambahan'}
                {item.code ? ` · Kode ${item.code}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <form className={styles.form} onSubmit={onSubmit}>
        <h2 className={styles.cardName}>Tambah lokasi</h2>
        <div className={styles.filterGroup}>
          <label className={styles.label} htmlFor="nama-lokasi">
            Nama lokasi
          </label>
          <input
            className={styles.input}
            id="nama-lokasi"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="Contoh: Gudang Belakang"
          />
        </div>
        <button type="submit" className={styles.submit} disabled={busy || name.trim() === ''}>
          {busy ? 'Menyimpan' : 'Simpan lokasi'}
        </button>
      </form>
    </AppShell>
  )
}
