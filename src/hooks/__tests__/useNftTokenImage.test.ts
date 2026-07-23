import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

interface QueryOptions {
  queryKey?: unknown[]
  queryFn?: () => Promise<string | null>
  enabled?: boolean
}
const captured = vi.hoisted(() => ({ opts: {} as QueryOptions }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: QueryOptions) => {
    captured.opts = opts
    return { data: undefined }
  },
}))
const flags = vi.hoisted(() => ({ providerReady: true }))
vi.mock('../useProviderReady', () => ({ useProviderReady: () => flags.providerReady }))

const getErc721TokenURI = vi.hoisted(() => vi.fn())
vi.mock('@/services/core/NavigatorService', () => ({
  navigatorService: { getErc721TokenURI },
}))
// Isolate the metadata parsing from IPFS-URL resolution: a deterministic marker makes the
// resolved path assertable without depending on the gateway logic (covered in url.test.ts).
vi.mock('@/utils/url', () => ({
  resolveIpfsMedia: (u: string | undefined) => (u ? `resolved:${u}` : null),
}))

import { useNftTokenImage } from '../useNftTokenImage'

function runQueryFn(gateToken = '0xGATE', tokenId = '7') {
  renderHook(() => useNftTokenImage(gateToken, tokenId))
  return captured.opts.queryFn!()
}

beforeEach(() => {
  captured.opts = {}
  flags.providerReady = true
  getErc721TokenURI.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useNftTokenImage — config', () => {
  it('lowercases the gate address in the cache key and gates on the provider', () => {
    flags.providerReady = false
    renderHook(() => useNftTokenImage('0xABCDEF', '7'))
    expect(captured.opts.queryKey).toEqual(['nftTokenImage', '0xabcdef', '7'])
    expect(captured.opts.enabled).toBe(false)
  })
})

describe('useNftTokenImage — resolving the image', () => {
  it('returns null when the token has no URI', async () => {
    getErc721TokenURI.mockResolvedValue(null)
    expect(await runQueryFn()).toBeNull()
  })

  it('reads an inline data:application/json token URI and passes a data:image straight through', async () => {
    const uri = 'data:application/json,' + encodeURIComponent(
      JSON.stringify({ image: 'data:image/png;base64,AAAA' }),
    )
    getErc721TokenURI.mockResolvedValue(uri)
    expect(await runQueryFn()).toBe('data:image/png;base64,AAAA')
  })

  it('decodes a base64 data:application/json token URI', async () => {
    const uri = 'data:application/json;base64,' + btoa(
      JSON.stringify({ image: 'data:image/svg+xml;utf8,<svg/>' }),
    )
    getErc721TokenURI.mockResolvedValue(uri)
    expect(await runQueryFn()).toBe('data:image/svg+xml;utf8,<svg/>')
  })

  it('accepts the image_url and imageUrl field variants', async () => {
    getErc721TokenURI.mockResolvedValue(
      'data:application/json,' + encodeURIComponent(JSON.stringify({ image_url: 'ipfs://cid/a.png' })),
    )
    expect(await runQueryFn()).toBe('resolved:ipfs://cid/a.png')

    getErc721TokenURI.mockResolvedValue(
      'data:application/json,' + encodeURIComponent(JSON.stringify({ imageUrl: 'ipfs://cid/b.png' })),
    )
    expect(await runQueryFn()).toBe('resolved:ipfs://cid/b.png')
  })

  it('fetches remote metadata and resolves its ipfs image through the gateway', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ image: 'ipfs://cid/pic.png' }),
    }))
    getErc721TokenURI.mockResolvedValue('ipfs://metadata-cid')
    expect(await runQueryFn()).toBe('resolved:ipfs://cid/pic.png')
  })

  it('returns null when remote metadata fetch is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    getErc721TokenURI.mockResolvedValue('ipfs://metadata-cid')
    expect(await runQueryFn()).toBeNull()
  })

  it('returns null on malformed JSON in a data URI (untrusted contract)', async () => {
    getErc721TokenURI.mockResolvedValue('data:application/json,not-json{')
    expect(await runQueryFn()).toBeNull()
  })

  it('returns null when metadata carries no usable image field', async () => {
    getErc721TokenURI.mockResolvedValue(
      'data:application/json,' + encodeURIComponent(JSON.stringify({ name: 'no image here' })),
    )
    expect(await runQueryFn()).toBeNull()
  })

  it('returns null when the image field is present but empty', async () => {
    getErc721TokenURI.mockResolvedValue(
      'data:application/json,' + encodeURIComponent(JSON.stringify({ image: '   ' })),
    )
    expect(await runQueryFn()).toBeNull()
  })
})
