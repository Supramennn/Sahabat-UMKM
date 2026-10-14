// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { Pagination } from '../src/app/penjualan/bagian'

/**
 * Penomoran halaman dipakai di semua modul dan menentukan berapa banyak data yang
 * bisa dibuka pengguna dari ponsel, jadi tombolnya diuji langsung, bukan hanya
 * fungsi formatnya.
 */

afterEach(() => {
  cleanup()
})

describe('Penomoran halaman', () => {
  it('menampilkan rentang data yang sedang dilihat', () => {
    render(createElement(Pagination, { total: 120, offset: 50, limit: 50, onChange: () => {} }))

    expect(screen.getByText('Menampilkan 51 sampai 100 dari 120 penjualan')).toBeTruthy()
  })

  it('menyembunyikan tombol sebelumnya di halaman pertama', () => {
    render(createElement(Pagination, { total: 120, offset: 0, limit: 50, onChange: () => {} }))

    expect(screen.queryByRole('button', { name: 'Sebelumnya' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Berikutnya' })).toBeTruthy()
  })

  it('menyembunyikan kedua tombol ketika semua data sudah muat', () => {
    render(createElement(Pagination, { total: 20, offset: 0, limit: 50, onChange: () => {} }))

    expect(screen.queryByRole('button', { name: 'Sebelumnya' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Berikutnya' })).toBeNull()
    expect(screen.getByText('Menampilkan 1 sampai 20 dari 20 penjualan')).toBeTruthy()
  })

  it('menyembunyikan tombol berikutnya di halaman terakhir', () => {
    render(createElement(Pagination, { total: 50, offset: 0, limit: 50, onChange: () => {} }))

    expect(screen.queryByRole('button', { name: 'Berikutnya' })).toBeNull()
  })

  it('memindahkan offset saat tombol ditekan', () => {
    const dipanggil: number[] = []
    const onChange = (offset: number) => dipanggil.push(offset)

    const { rerender } = render(
      createElement(Pagination, { total: 120, offset: 0, limit: 50, onChange }),
    )
    screen.getByRole('button', { name: 'Berikutnya' }).click()
    expect(dipanggil).toEqual([50])

    rerender(createElement(Pagination, { total: 120, offset: 50, limit: 50, onChange }))
    screen.getByRole('button', { name: 'Sebelumnya' }).click()
    expect(dipanggil).toEqual([50, 0])
  })

  it('tidak membuat halaman negatif saat menekan sebelumnya di offset paling awal', () => {
    const dipanggil: number[] = []
    render(
      createElement(Pagination, {
        total: 120,
        offset: 25,
        limit: 50,
        onChange: (offset: number) => dipanggil.push(offset),
      }),
    )

    screen.getByRole('button', { name: 'Sebelumnya' }).click()
    expect(dipanggil).toEqual([0])
  })
})