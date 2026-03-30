import { useState, useCallback } from 'react'
import { quais } from 'quais'
import { baseService } from '@/services/core/BaseService'
import QuaiVaultJson from '@/config/abi/QuaiVault.json'

export type EnableModuleStep = 'idle' | 'checking' | 'proposing' | 'approving' | 'done'

export function useEnableModule() {
  const [step, setStep] = useState<EnableModuleStep>('idle')
  const [isEnabling, setIsEnabling] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const [needsMoreApprovals, setNeedsMoreApprovals] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enable = useCallback(async (vaultAddress: string, daoShipAddress: string, threshold: number = 1) => {
    setIsEnabling(true)
    setError(null)
    setStep('checking')

    try {
      const signer = baseService.requireSigner()
      const vault = new quais.Contract(vaultAddress, QuaiVaultJson.abi, signer)

      // Check if module is already enabled
      const alreadyEnabled = await vault.isModuleEnabled(daoShipAddress)
      if (alreadyEnabled) {
        setStep('done')
        setIsEnabled(true)
        setIsEnabling(false)
        return
      }

      // Propose enableModule(daoShipAddress) as a vault transaction
      // Uses encodeFunctionData for correct selector + encoding
      setStep('proposing')
      const vaultIface = new quais.Interface(QuaiVaultJson.abi)
      const enableModuleCalldata = vaultIface.encodeFunctionData('enableModule', [daoShipAddress])

      const proposeTx = await vault.proposeTransaction(
        vaultAddress,          // to: vault itself (self-call)
        0,                     // value: 0
        enableModuleCalldata,  // enableModule(address) encoded
      )
      const proposeReceipt = await proposeTx.wait()

      // Parse TransactionProposed event to get txHash
      let txHash: string | null = null
      for (const log of proposeReceipt.logs) {
        try {
          const parsed = vaultIface.parseLog(log)
          if (parsed?.name === 'TransactionProposed') {
            txHash = parsed.args.txHash
            break
          }
        } catch {
          // not our event
        }
      }

      if (!txHash) {
        throw new Error('TransactionProposed event not found in receipt')
      }

      // Branch based on vault threshold
      setStep('approving')
      if (threshold <= 1) {
        // Single-owner vault: approve and execute in one step
        const approveTx = await vault.approveAndExecute(txHash)
        await approveTx.wait()
        setStep('done')
        setIsEnabled(true)
      } else {
        // Multisig vault: submit launcher's approval, remaining owners finish via QuaiVault
        const approveTx = await vault.approveTransaction(txHash)
        await approveTx.wait()
        setStep('done')
        setNeedsMoreApprovals(true)
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to enable vault module'
      setError(message)
    } finally {
      setIsEnabling(false)
    }
  }, [])

  const reset = useCallback(() => {
    setStep('idle')
    setIsEnabling(false)
    setIsEnabled(false)
    setNeedsMoreApprovals(false)
    setError(null)
  }, [])

  return { enable, step, isEnabling, isEnabled, needsMoreApprovals, error, reset }
}
