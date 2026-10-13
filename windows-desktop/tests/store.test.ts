import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppStore, createDefaultState } from '../src/main/store'

describe('AppStore', () => {
  it('starts with the original eleven funds', () => {
    const state = createDefaultState()
    expect(state.funds).toHaveLength(11)
    expect(state.settings.alwaysOnTop).toBe(true)
    expect(state.settings.windowOpacity).toBe(0.94)
  })

  it('persists an intentionally empty fund list', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fund-valuation-store-'))
    const store = new AppStore(directory)
    const state = createDefaultState()
    state.funds = []
    await store.save(state)
    const restored = await store.load()
    expect(restored.funds).toEqual([])
    expect(JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')).version).toBe(1)
  })

  it('persists floating-window preferences', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fund-valuation-store-'))
    const store = new AppStore(directory)
    const state = createDefaultState()
    state.settings.alwaysOnTop = false
    state.settings.windowOpacity = 0.72
    await store.save(state)

    const restored = await store.load()
    expect(restored.settings.alwaysOnTop).toBe(false)
    expect(restored.settings.windowOpacity).toBe(0.72)
  })
})
