import type { ComponentType } from 'react'
import type { Navigator } from '@/types'

// ═══════════════════════════════════════════════════════════════════════════
// Navigator Plugin Registry
// ═══════════════════════════════════════════════════════════════════════════

export interface NavigatorPluginProps {
  navigator: Navigator
  daoId: string
  userAddress: string | null
  connected: boolean
}

const NAVIGATOR_PLUGINS: Record<string, ComponentType<NavigatorPluginProps>> = {}

export function registerNavigatorPlugin(type: string, component: ComponentType<NavigatorPluginProps>) {
  NAVIGATOR_PLUGINS[type] = component
}

export function getNavigatorPlugin(type: string): ComponentType<NavigatorPluginProps> | null {
  return NAVIGATOR_PLUGINS[type] || null
}

// ═══════════════════════════════════════════════════════════════════════════
// Register shipped plugins
// ═══════════════════════════════════════════════════════════════════════════

import { OnboarderPlugin } from './OnboarderPlugin'
import { ERC20TributePlugin } from './ERC20TributePlugin'
import { UnknownPlugin } from './UnknownPlugin'

registerNavigatorPlugin('OnboarderNavigator', OnboarderPlugin)
registerNavigatorPlugin('ERC20TributeNavigator', ERC20TributePlugin)

export { UnknownPlugin }
