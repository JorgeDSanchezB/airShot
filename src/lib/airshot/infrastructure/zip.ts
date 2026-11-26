// AirShot — infrastructure/zip.ts
// Escritor ZIP mínimo (método STORE, sin compresión) sin dependencias:
// mp4/jpg/png no se benefician de deflate y el paquete debe ser reproducible offline.

export type ZipEntry = { name: string; data: Buffer }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Fecha DOS fija (1980-01-01) para que el mismo contenido produzca el mismo zip. */
const DOS_TIME = 0
const DOS_DATE = (1 << 5) | 1
const UTF8_FLAG = 0x0800

export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)
    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(UTF8_FLAG, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(entry.data.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    name.copy(local, 30)
    locals.push(local, entry.data)

    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(UTF8_FLAG, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(entry.data.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    name.copy(central, 46)
    centrals.push(central)

    offset += local.length + entry.data.length
  }
  const centralSize = centrals.reduce((sum, buffer) => sum + buffer.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, ...centrals, eocd])
}

/** Lector del subconjunto que produce buildZip: solo STORE, CRC obligatorio. */
export function readZip(archive: Buffer): ZipEntry[] {
  if (archive.length < 22) throw new Error('zip truncado: falta EOCD')
  let eocd = -1
  const floor = Math.max(0, archive.length - 22 - 0xffff)
  for (let i = archive.length - 22; i >= floor; i--) {
    if (archive.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('zip sin fin de directorio central (EOCD)')
  const count = archive.readUInt16LE(eocd + 10)
  const cdSize = archive.readUInt32LE(eocd + 12)
  const cdOffset = archive.readUInt32LE(eocd + 16)
  if (cdOffset + cdSize > eocd) throw new Error('directorio central fuera de rango')
  const entries: ZipEntry[] = []
  let cursor = cdOffset
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > archive.length || archive.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`entrada ${i} del directorio central inválida`)
    }
    const method = archive.readUInt16LE(cursor + 10)
    const nameLength = archive.readUInt16LE(cursor + 28)
    const extraLength = archive.readUInt16LE(cursor + 30)
    const commentLength = archive.readUInt16LE(cursor + 32)
    const localOffset = archive.readUInt32LE(cursor + 42)
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    if (method !== 0) throw new Error(`método de compresión ${method} no soportado en "${name}" (solo STORE)`)
    if (name.length === 0 || name.startsWith('/') || name.includes('..') || name.includes('\\')) {
      throw new Error(`ruta ilegal dentro del zip: "${name}"`)
    }
    if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`cabecera local inválida en "${name}"`)
    }
    const localNameLength = archive.readUInt16LE(localOffset + 26)
    const localExtraLength = archive.readUInt16LE(localOffset + 28)
    const crc = archive.readUInt32LE(localOffset + 14)
    const size = archive.readUInt32LE(localOffset + 18)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const data = archive.subarray(dataStart, dataStart + size)
    if (data.length !== size) throw new Error(`datos truncados en "${name}"`)
    if (crc32(data) !== crc) throw new Error(`CRC inválido en "${name}"`)
    entries.push({ name, data: Buffer.from(data) })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}
