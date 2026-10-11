'use client'

import { useApp } from '@/components/app-context'
import { AppShell } from '@/components/shell'

interface SalesShellProps {
  activeHref: string
  title: string
  children: React.ReactNode
  actions?: React.ReactNode
}

export function SalesShell({ activeHref, title, children, actions }: SalesShellProps) {
  const app = useApp()

  return (
    <AppShell
      workspaceName={app.workspaceName}
      roleLabel={app.roleLabel}
      activeHref={activeHref}
      breadcrumb="Penjualan"
      title={title}
      actions={actions}
    >
      {children}
    </AppShell>
  )
}