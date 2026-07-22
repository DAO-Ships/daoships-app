import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { NotificationContainer } from '../NotificationContainer'
import { notificationManager } from '@/services/utils/NotificationManager'

// NotificationContainer was mounted TWICE — once in Layout.tsx and once in App.tsx.
// Each instance independently subscribes to notificationManager and renders its own
// fixed top-right stack, so every toast in the app appeared twice, stacked. Present
// since the initial commit.

afterEach(() => {
  cleanup()
  notificationManager.dismissAll()
})

describe('NotificationContainer rendering', () => {
  it('renders a notification once per mounted container', () => {
    render(<NotificationContainer />)
    act(() => {
      notificationManager.notify('info', 'Submitted', 'Proposal submitted', 0)
    })
    expect(screen.getAllByText('Proposal submitted')).toHaveLength(1)
  })

  it('renders the SAME notification twice when mounted twice — the bug being guarded', () => {
    render(
      <>
        <NotificationContainer />
        <NotificationContainer />
      </>,
    )
    act(() => {
      notificationManager.notify('info', 'Duplicated', 'Duplicated toast', 0)
    })
    // One notification in the manager, two copies on screen. This is exactly what users
    // saw for every toast; the source check below is what actually prevents it.
    expect(notificationManager.getNotifications()).toHaveLength(1)
    expect(screen.getAllByText('Duplicated toast')).toHaveLength(2)
  })
})

describe('NotificationContainer is mounted exactly once in the app', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.tsx$/.test(full)) out.push(full)
    }
    return out
  }

  it('has a single <NotificationContainer /> mount site across src', () => {
    const mounts = walk(join(process.cwd(), 'src'))
      .filter((f) => readFileSync(f, 'utf8').includes('<NotificationContainer'))

    expect(mounts.map((f) => f.replace(`${process.cwd()}/`, ''))).toEqual(['src/App.tsx'])
  })
})
