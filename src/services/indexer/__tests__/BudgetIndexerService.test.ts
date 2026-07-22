import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeClient, type MockClient } from './supabaseMock'

const holder = vi.hoisted(() => ({ client: null as MockClient | null }))
vi.mock('@/config/supabase', () => ({
  get supabase() {
    return holder.client
  },
}))

import { budgetIndexerService } from '../BudgetIndexerService'

beforeEach(() => {
  holder.client = null
})

describe('listBudgets', () => {
  it('scopes to a navigator (lowercased) only when one is given', async () => {
    const client = makeClient({ ds_budgets: { data: [], error: null } })
    holder.client = client
    await budgetIndexerService.listBudgets('dao-1', '0xNAV')
    expect(client.queries[0].eqArg('navigator_address')).toBe('0xnav')
  })

  it('omits the navigator filter when none is given', async () => {
    const client = makeClient({ ds_budgets: { data: [], error: null } })
    holder.client = client
    await budgetIndexerService.listBudgets('dao-1')
    expect(client.queries[0].eqArg('navigator_address')).toBeUndefined()
  })
})

describe('getBudget', () => {
  it('composes the id `${navigator.toLowerCase()}-${budgetId}` and returns null when absent', async () => {
    const client = makeClient({ ds_budgets: { data: null, error: null } })
    holder.client = client
    const budget = await budgetIndexerService.getBudget('0xNAV', '9')
    expect(budget).toBeNull()
    expect(client.queries[0].eqArg('id')).toBe('0xnav-9')
  })
})

describe('listDisbursements', () => {
  it('bounds the feed to 25 rows, newest first, filtering by budget when given', async () => {
    const client = makeClient({ ds_budget_disbursements: { data: [], error: null } })
    holder.client = client
    await budgetIndexerService.listDisbursements('0xNAV', '3')
    const q = client.queries[0]
    expect(q.eqArg('navigator_address')).toBe('0xnav')
    expect(q.eqArg('budget_id')).toBe('3')
    expect(q.limited).toBe(25)
    expect(q.orders).toContainEqual(['block_number', { ascending: false }])
  })

  it('omits the budget filter when no budgetId is given', async () => {
    const client = makeClient({ ds_budget_disbursements: { data: [], error: null } })
    holder.client = client
    await budgetIndexerService.listDisbursements('0xNAV')
    expect(client.queries[0].eqArg('budget_id')).toBeUndefined()
  })
})

describe('listModuleEvents', () => {
  it('orders by block_number then log_index (both descending) so row 0 is current state', async () => {
    const client = makeClient({ ds_vault_module_events: { data: [], error: null } })
    holder.client = client
    await budgetIndexerService.listModuleEvents('dao-1')
    expect(client.queries[0].orders).toEqual([
      ['block_number', { ascending: false }],
      ['log_index', { ascending: false }],
    ])
  })

  it('throws on error rather than reporting an empty module timeline', async () => {
    holder.client = makeClient({
      ds_vault_module_events: { data: null, error: { message: 'x' } },
    })
    await expect(budgetIndexerService.listModuleEvents('dao-1')).rejects.toThrow(
      '[BudgetIndexerService] listModuleEvents: x',
    )
  })
})
