import { afterAll, describe, expect, it } from 'vitest'
import { existsSync, rmSync, rmdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { storage } from '@/lib/airshot/infrastructure/storage'

const key = `uploads/__tests__/${randomUUID()}.bin`
const abs = join(storage.root, key)

afterAll(() => {
  if (existsSync(abs)) rmSync(abs)
  try {
    rmdirSync(dirname(abs))
    rmdirSync(join(storage.root, 'uploads', '__tests__'))
  } catch {
    // directorios compartidos con otros tests/runs: limpieza best-effort
  }
})

describe('StorageService (§3.5)', () => {
  it('save/open/exists/delete hacen roundtrip bajo data.root', () => {
    expect(storage.exists(key)).toBe(false)
    storage.save(key, Buffer.from('hola'))
    expect(storage.exists(key)).toBe(true)
    expect(storage.open(key).toString('utf8')).toBe('hola')
    storage.delete(key)
    expect(storage.exists(key)).toBe(false)
  })

  it('resolveUrl genera la ruta de media', () => {
    expect(storage.resolveUrl(key)).toBe(`/api/v1/media/${key}`)
    expect(storage.resolveUrl(null)).toBeNull()
  })

  it.each(['../escape.mp4', 'outputs/../../escape.mp4', 'outputs\\escape.mp4', ''])(
    'rechaza clave ilegal "%s"',
    (bad) => {
      expect(() => storage.abs(bad)).toThrowError()
    },
  )

  it('acepta claves normales dentro del root', () => {
    const ok = storage.abs('outputs/projects/p1/assemblies/j1/final.mp4')
    expect(ok.startsWith(storage.root)).toBe(true)
  })

  it('las claves generadas quedan dentro del root y son únicas', () => {
    const a = storage.sceneAsset('video', 'p1', 's1', 'ai', 'mp4')
    const b = storage.sceneAsset('video', 'p1', 's1', 'ai', 'mp4')
    expect(a).not.toBe(b)
    expect(storage.abs(a).startsWith(storage.root)).toBe(true)
  })
})
