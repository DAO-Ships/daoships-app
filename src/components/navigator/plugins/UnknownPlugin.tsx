import type { NavigatorPluginProps } from './index'
import { Card } from '@/components/common/Card'
import { AddressDisplay } from '@/components/common/AddressDisplay'

// ═══════════════════════════════════════════════════════════════════════════
// UnknownPlugin - Fallback for unrecognized navigator types
// ═══════════════════════════════════════════════════════════════════════════

function getPermissionDescription(permission: number): string {
  if (permission === 0) return 'This navigator has no active permissions.'

  const parts: string[] = []
  if (permission & 1) parts.push('admin access to the DAO contract')
  if (permission & 2) parts.push('manager access to mint/burn shares and loot tokens')
  if (permission & 4) parts.push('governor access to submit and process proposals')

  return `This navigator has ${parts.join(', ')}.`
}

export function UnknownPlugin({ navigator }: NavigatorPluginProps) {
  return (
    <div className="space-y-5">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
        <p className="text-sm text-amber-400 font-medium">
          This navigator type is not yet supported in the UI.
        </p>
        <p className="text-xs text-amber-400/70 mt-1">
          You can still interact with this navigator directly through its contract.
        </p>
      </div>

      <Card header={<h3 className="text-sm font-semibold text-dao-text">Navigator Details</h3>}>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Contract Address</p>
            <AddressDisplay address={navigator.navigator_address} />
          </div>

          {navigator.navigator_type && (
            <div>
              <p className="text-dao-text-hint text-xs mb-0.5">Type</p>
              <p className="text-dao-text-secondary font-mono">{navigator.navigator_type}</p>
            </div>
          )}

          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Permission Level</p>
            <p className="text-dao-text-secondary">{navigator.permission}</p>
          </div>

          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Description</p>
            <p className="text-dao-text-muted">{getPermissionDescription(navigator.permission)}</p>
          </div>

          <div>
            <p className="text-dao-text-hint text-xs mb-0.5">Status</p>
            <p className="text-dao-text-secondary">
              {navigator.is_active ? 'Active' : 'Disabled'}
              {navigator.paused ? ' (Paused)' : ''}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
