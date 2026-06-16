import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProfileForm } from '../ProfileForm'

// Repro guard: clicking "Submit Profile Update Proposal" must call onSubmit
// (which opens the confirm dialog → wallet). Covers the plain-field path and the
// theme-only path added in the DAO-theming work.
describe('ProfileForm submit', () => {
  const baseProps = {
    currentProfile: { name: 'Old DAO' },
    minOfferingDisplay: '0',
    canSelfSponsor: true,
  }

  it('calls onSubmit when a normal field changes', () => {
    const onSubmit = vi.fn()
    render(<ProfileForm {...baseProps} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByPlaceholderText('Update DAO profile'), { target: { value: 'Update profile' } })
    fireEvent.change(screen.getByPlaceholderText('My Awesome DAO'), { target: { value: 'New DAO Name' } })

    fireEvent.click(screen.getByRole('button', { name: /submit profile update proposal/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].profile.name).toBe('New DAO Name')
  })

  it('calls onSubmit when only the color scheme changes', () => {
    const onSubmit = vi.fn()
    render(<ProfileForm {...baseProps} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByPlaceholderText('Update DAO profile'), { target: { value: 'Set colors' } })
    // Enable the Primary token in the theme editor
    fireEvent.click(screen.getByLabelText('Primary'))

    fireEvent.click(screen.getByRole('button', { name: /submit profile update proposal/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].profile.theme?.primary).toBeTruthy()
  })
})
