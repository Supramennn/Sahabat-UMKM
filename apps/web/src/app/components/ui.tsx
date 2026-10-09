'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import styles from './components.module.css'

/**
 * Kerangka halaman autentikasi. Satu kolom di ponsel, kartu dengan lebar
 * Terbatas di desktop supaya baris isian tidak terlalu panjang untuk dibaca
 * (PRD 10).
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.authLayout}>
      <p className={styles.authBrand}>Sahabat UMKM</p>
      <div className={styles.authMain}>{children}</div>
    </div>
  )
}

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className={styles.authCard}>
      <div>
        <h1 className={styles.authTitle}>{title}</h1>
        {subtitle ? <p className={styles.authSubtitle}>{subtitle}</p> : null}
      </div>
      {children}
    </div>
  )
}

interface FieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  // Semua properti di bawah boleh bernilai undefined secara eksplisit. Formulir
  // meneruskan nilai yang dihitung, bukan hanya nilai yang dijamin ada, jadi
  // opsional di sini berarti "boleh tidak ada atau boleh undefined".
  type?: string | undefined
  autoComplete?: string | undefined
  required?: boolean | undefined
  disabled?: boolean | undefined
  hint?: string | undefined
  error?: string | undefined
  inputMode?: 'text' | 'email' | 'numeric' | 'tel' | undefined
}

/**
 * Isian dengan label yang terhubung lewat htmlFor, pesan galat yang terhubung
 * lewat aria-describedby, dan penanda aria-invalid. Galat selalu berupa teks,
 * bukan hanya warna (PRD 10).
 */
export function Field({
  id,
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  required,
  disabled,
  hint,
  error,
  inputMode,
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        className={styles.input}
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className={styles.fieldError} id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function Button({
  children,
  onClick,
  type = 'submit',
  variant = 'primary',
  disabled,
  full = false,
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  full?: boolean
}) {
  const className = [
    styles.button,
    variant === 'primary' ? styles.primary : '',
    variant === 'secondary' ? styles.secondary : '',
    variant === 'danger' ? styles.danger : '',
    full ? styles.full : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={className} type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

type AlertKind = 'error' | 'success' | 'info'

/**
 * Status selalu menyebut jenisnya lewat teks dan simbol, bukan hanya warna, agar
 * tetap terbaca oleh pengguna dengan penglihatan warna terbatas dan dalam mode
 * kontras paksa (PRD 10).
 */
export function Alert({ kind, children }: { kind: AlertKind; children: ReactNode }) {
  const className = [
    styles.alert,
    kind === 'error' ? styles.alertError : '',
    kind === 'success' ? styles.alertSuccess : '',
    kind === 'info' ? styles.alertInfo : '',
  ]
    .filter(Boolean)
    .join(' ')

  const symbol = kind === 'error' ? '!' : kind === 'success' ? 'OK' : 'i'
  const word = kind === 'error' ? 'Gagal' : kind === 'success' ? 'Berhasil' : 'Informasi'

  return (
    <div className={className} role={kind === 'error' ? 'alert' : 'status'}>
      <span className={styles.alertIcon} aria-hidden="true">
        {symbol}
      </span>
      <span>
        <span className={styles.visuallyHidden}>{word}: </span>
        {children}
      </span>
    </div>
  )
}

/** Keadaan galat saat memuat data (PRD 10). */
export function ErrorState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className={styles.state} role="alert">
      <p className={styles.stateTitle}>{title}</p>
      <p className={styles.stateBody}>{body}</p>
      {action}
    </div>
  )
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className={styles.link} href={href}>
      {children}
    </Link>
  )
}

export function AuthLinkRow({ children }: { children: ReactNode }) {
  return <div className={styles.linkRow}>{children}</div>
}
