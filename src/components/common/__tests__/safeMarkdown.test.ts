import { describe, it, expect } from 'vitest'
import { stripBidiControls } from '@/utils/sanitize'

// SafeMarkdown's auto-linker uses the matched substring as BOTH the href and the
// visible label. Proposal descriptions and Poster content are permissionlessly
// attacker-authored, so bidi overrides let a link read as one domain while pointing at
// another, and zero-width characters split homographs invisibly.

describe('stripBidiControls', () => {
  it('removes RIGHT-TO-LEFT OVERRIDE', () => {
    expect(stripBidiControls('https://exam‮moc.elpmaxe')).not.toContain('‮')
  })

  it.each([
    ['​', 'zero-width space'],
    ['‌', 'zero-width non-joiner'],
    ['‍', 'zero-width joiner'],
    ['‎', 'left-to-right mark'],
    ['‏', 'right-to-left mark'],
    ['‪', 'left-to-right embedding'],
    ['‭', 'left-to-right override'],
    ['⁦', 'left-to-right isolate'],
    ['⁩', 'pop directional isolate'],
    ['﻿', 'byte order mark'],
  ])('removes %s (%s)', (char) => {
    expect(stripBidiControls(`a${char}b`)).toBe('ab')
  })

  it('leaves ordinary text untouched', () => {
    const text = 'Fund the treasury — see https://daoships.org for details (100% of it).'
    expect(stripBidiControls(text)).toBe(text)
  })

  it('preserves non-Latin scripts, which are legitimate content', () => {
    const text = 'Проект 提案 مشروع'
    expect(stripBidiControls(text)).toBe(text)
  })

  it('handles empty input', () => {
    expect(stripBidiControls('')).toBe('')
  })
})
