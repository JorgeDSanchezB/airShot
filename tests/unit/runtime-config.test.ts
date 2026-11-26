import { describe, expect, it } from 'vitest'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { runtimeConfig } from '@/lib/airshot/services/misc'

// El payload de GET /config alimenta selects de la UI: si falta un grupo,
// componentes como el tab Ensamblaje revientan al leerlo.
describe('runtime config', () => {
  const payload = runtimeConfig()

  it('expone los grupos nuevos de límites', () => {
    expect(payload.translation).toEqual(airshotConfig.translation)
    expect(payload.transfer).toEqual(airshotConfig.transfer)
    expect(payload.batch).toEqual(airshotConfig.batch)
  })

  it('expone los aspectos y el estado de hwaccel del ensamblaje', () => {
    const assembly = payload.assembly as { aspects: string[]; hwaccel_enabled: boolean }
    expect(assembly.aspects).toEqual(Object.keys(airshotConfig.assembly.aspect_ratios))
    expect(assembly.hwaccel_enabled).toBe(airshotConfig.assembly.hwaccel.enabled)
  })

  it('nunca filtra storage ni security', () => {
    expect(payload).not.toHaveProperty('storage')
    expect(payload).not.toHaveProperty('security')
  })
})
