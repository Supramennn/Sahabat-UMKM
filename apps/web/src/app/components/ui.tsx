'use client'

import { motion } from 'motion/react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { ENTER_EASE } from './motion'

/**
 * Kerangka halaman autentikasi. Satu kolom di ponsel, kartu dengan lebar
 * terbatas di desktop supaya baris isian tidak terlalu panjang untuk dibaca
 * (PRD 10).
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col gap-6 p-4 sm:p-8">
      <p className="text-lg font-semibold tracking-[-0.01em] text-primary">Sahabat UMKM</p>
      <div className="flex flex-1 items-start justify-center">{children}</div>
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
    <motion.div
      className="flex w-full max-w-[26rem] flex-col gap-4 rounded-surface border border-border-subtle bg-surface p-6 shadow-raised sm:p-8"
      initial={{ y: 10 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.26, ease: ENTER_EASE }}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="-mt-1 text-text-secondary">{subtitle}</p> : null}
      </div>
      {children}
    </motion.div>
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
    <div className="flex flex-col gap-1">
      <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor={id}>
        {label}
      </label>
      <input
        className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
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
        <p className="text-sm text-text-secondary" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface SelectFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  required?: boolean | undefined
  disabled?: boolean | undefined
  hint?: string | undefined
  error?: string | undefined
}

/** Isian pilihan dengan susunan label dan pesan galat yang sama dengan Field. */
export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  required,
  disabled,
  hint,
  error,
}: SelectFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[0.9375rem] font-medium text-text-primary" htmlFor={id}>
        {label}
      </label>
      <select
        className="min-h-touch w-full rounded-control border border-border-strong bg-surface px-3 text-base text-text-primary transition-colors duration-150 hover:border-text-secondary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-secondary"
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p className="text-sm text-text-secondary" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Kotak centang dengan label sebagai satu kesatuan yang bisa diklik, jadi
 * target sentuhnya memenuhi 44 px (PRD 10). Keterangan tambahan terhubung lewat
 * aria-describedby.
 */
export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  hint,
  ariaLabel,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  ariaLabel?: string
}) {
  const hintId = hint ? `${id}-hint` : undefined

  return (
    <label className="flex min-h-touch cursor-pointer items-start gap-3 py-1" htmlFor={id}>
      <input
        className="mt-1 size-5 shrink-0 cursor-pointer accent-secondary"
        id={id}
        name={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={hintId}
        // Dipakai bila beberapa kotak centang berlabel sama di satu halaman,
        // supaya pembaca layar tidak menyebut "Email" tanpa konteks.
        aria-label={ariaLabel}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[0.9375rem] font-medium text-text-primary">{label}</span>
        {hint ? (
          <span className="text-sm text-text-secondary" id={hintId}>
            {hint}
          </span>
        ) : null}
      </span>
    </label>
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
  const className = cx(
    'inline-flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-control border border-transparent px-4 text-base font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-background disabled:text-surface',
    variant === 'primary' && 'bg-secondary text-surface enabled:hover:bg-secondary-deep',
    variant === 'secondary' &&
      'border-border-strong bg-surface text-primary enabled:hover:border-text-secondary',
    variant === 'danger' && 'border-danger bg-surface text-danger enabled:hover:bg-danger-surface',
    full && 'w-full',
  )

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
  const className = cx(
    'flex items-start gap-2 rounded-control border px-3 py-3 text-[0.9375rem]',
    kind === 'error' && 'border-danger bg-danger-surface text-danger-ink',
    kind === 'success' && 'border-success bg-success-surface text-success-ink',
    kind === 'info' && 'border-border-strong bg-background text-text-primary',
  )

  const symbol = kind === 'error' ? '!' : kind === 'success' ? 'OK' : 'i'
  const word = kind === 'error' ? 'Gagal' : kind === 'success' ? 'Berhasil' : 'Informasi'

  return (
    <motion.div
      className={className}
      role={kind === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: ENTER_EASE }}
    >
      <span className="shrink-0 font-bold" aria-hidden="true">
        {symbol}
      </span>
      <span>
        <span className="visually-hidden">{word}: </span>
        {children}
      </span>
    </motion.div>
  )
}

/** Keadaan galat saat memuat data (PRD 10). */
export function ErrorState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-surface border border-border-subtle bg-surface p-4 shadow-raised"
      role="alert"
    >
      <p className="font-semibold text-text-primary">{title}</p>
      <p className="text-[0.9375rem] text-text-secondary">{body}</p>
      {action}
    </div>
  )
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      className="inline-flex min-h-touch items-center text-secondary underline underline-offset-4 transition-colors hover:text-secondary-deep"
      href={href}
    >
      {children}
    </Link>
  )
}

export function AuthLinkRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{children}</div>
}
