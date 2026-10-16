'use client'

import { useApp } from '../components/app-context'
import { AppShell } from '../components/shell'

export function ExpensesShell({
  activeHref,
  title,
  actions,
  children,
}: {
  activeHref: string
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const app = useApp()

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref={activeHref}
      breadcrumb="Pengeluaran"
      title={title}
      actions={actions}
    >
      {children}
    </AppShell>
  )
}
