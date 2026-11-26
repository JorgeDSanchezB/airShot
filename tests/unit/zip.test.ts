import { describe, expect, it } from 'vitest'
import { buildZip, crc32, readZip } from '@/lib/airshot/infrastructure/zip'

function readLocal(archive: Buffer, offset: number) {
  expect(archive.readUInt32LE(offset)).toBe(0x04034b50)
  const flags = archive.readUInt16LE(offset + 6)
  const crc = archive.readUInt32LE(offset + 14)
  const size = archive.readUInt32LE(offset + 18)
  const nameLength = archive.readUInt16LE(offset + 26)
  const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString('utf8')
  const data = archive.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size)
  return { flags, crc, name, data, next: offset + 30 + nameLength + size }
}

describe('buildZip', () => {
  it('produce entradas legibles con CRC y UTF-8 correctos', () => {
    const entries = [
      { name: 'video_16x9.mp4', data: Buffer.from([0, 1, 2, 3, 0xff]) },
      { name: 'metadatos/ñandú.json', data: Buffer.from('{"título":"prueba"}', 'utf8') },
    ]
    const archive = buildZip(entries)

    const localOffsets: number[] = []
    let offset = 0
    for (const entry of entries) {
      localOffsets.push(offset)
      const local = readLocal(archive, offset)
      expect(local.name).toBe(entry.name)
      expect(local.flags).toBe(0x0800)
      expect(local.data.equals(entry.data)).toBe(true)
      expect(local.crc).toBe(crc32(entry.data))
      offset = local.next
    }

    // directorio central: firmas y offsets relativos a las cabeceras locales
    let central = offset
    entries.forEach((entry, index) => {
      expect(archive.readUInt32LE(central)).toBe(0x02014b50)
      const nameLength = archive.readUInt16LE(central + 28)
      const name = archive.subarray(central + 46, central + 46 + nameLength).toString('utf8')
      expect(name).toBe(entry.name)
      expect(archive.readUInt32LE(central + 42)).toBe(localOffsets[index])
      central += 46 + nameLength
    })

    // EOCD al final: dos entradas y offset del directorio central coherente
    const eocd = archive.length - 22
    expect(archive.readUInt32LE(eocd)).toBe(0x06054b50)
    expect(archive.readUInt16LE(eocd + 10)).toBe(entries.length)
    expect(archive.readUInt32LE(eocd + 16)).toBe(offset)
  })

  it('es determinista para el mismo contenido', () => {
    const entries = [{ name: 'a.txt', data: Buffer.from('mismo') }]
    expect(buildZip(entries).equals(buildZip(entries))).toBe(true)
  })

  it('readZip recupera las entradas byte a byte', () => {
    const entries = [
      { name: 'project.json', data: Buffer.from('{"ok":true}') },
      { name: 'media/uploads/a/b.png', data: Buffer.from([1, 2, 3, 4]) },
    ]
    const parsed = readZip(buildZip(entries))
    expect(parsed.map((entry) => entry.name)).toEqual(entries.map((entry) => entry.name))
    for (let i = 0; i < entries.length; i++) expect(parsed[i].data.equals(entries[i].data)).toBe(true)
  })

  it('readZip rechaza rutas con .. y CRC corrupto', () => {
    expect(() => readZip(buildZip([{ name: 'media/../../evil.txt', data: Buffer.from('x') }]))).toThrow(/ruta ilegal/)
    const archive = buildZip([{ name: 'a.txt', data: Buffer.from('contenido') }])
    const dataStart = 30 + 'a.txt'.length
    archive[dataStart] ^= 0xff
    expect(() => readZip(archive)).toThrow(/CRC/)
  })
})
