import {
    createReadStream,
    createWriteStream,
    readdirSync,
    unlinkSync,
} from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const BASE_DIR = resolve(__dirname, '..')
const DEMO_DIR = join(BASE_DIR, 'pwa', 'demo')
const ZIP_PATH = join(DEMO_DIR, 'demo-files.zip')

const INCLUDE = [
    /^payslip-\d{4}-\d{2}\.pdf$/,
    /^nest-contribution-history\.xlsx$/,
]

/**
 * Minimal ZIP writer — no dependencies beyond Node built-ins.
 * Produces a ZIP with stored (uncompressed) entries, which is
 * sufficient for binary files that are already compressed.
 */

function crc32(buf) {
    const table = crc32.table || (crc32.table = buildCrcTable())
    let crc = 0xffffffff
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
    }
    return (crc ^ 0xffffffff) >>> 0
}

function buildCrcTable() {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        }
        t[n] = c
    }
    return t
}

function u16le(n) {
    const b = Buffer.alloc(2)
    b.writeUInt16LE(n, 0)
    return b
}

function u32le(n) {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(n >>> 0, 0)
    return b
}

function dosDateTime(date) {
    const d =
        (((date.getFullYear() - 1980) & 0x7f) << 9) |
        (((date.getMonth() + 1) & 0x0f) << 5) |
        (date.getDate() & 0x1f)
    const t =
        ((date.getHours() & 0x1f) << 11) |
        ((date.getMinutes() & 0x3f) << 5) |
        ((date.getSeconds() >> 1) & 0x1f)
    return { dosDate: d, dosTime: t }
}

async function buildZip(files) {
    const entries = []
    const parts = []
    let offset = 0

    for (const { name, data, mtime } of files) {
        const nameBuf = Buffer.from(name, 'utf8')
        const crc = crc32(data)
        const size = data.length
        const { dosDate, dosTime } = dosDateTime(mtime)

        const localHeader = Buffer.concat([
            Buffer.from([0x50, 0x4b, 0x03, 0x04]), // signature
            u16le(20), // version needed
            u16le(0), // flags
            u16le(0), // compression: stored
            u16le(dosTime),
            u16le(dosDate),
            u32le(crc),
            u32le(size), // compressed size
            u32le(size), // uncompressed size
            u16le(nameBuf.length),
            u16le(0), // extra field length
            nameBuf,
        ])

        entries.push({ name, nameBuf, crc, size, dosDate, dosTime, offset })
        parts.push(localHeader, data)
        offset += localHeader.length + size
    }

    const cdStart = offset
    for (const e of entries) {
        const cd = Buffer.concat([
            Buffer.from([0x50, 0x4b, 0x01, 0x02]), // central dir signature
            u16le(20), // version made by
            u16le(20), // version needed
            u16le(0), // flags
            u16le(0), // compression: stored
            u16le(e.dosTime),
            u16le(e.dosDate),
            u32le(e.crc),
            u32le(e.size),
            u32le(e.size),
            u16le(e.nameBuf.length),
            u16le(0), // extra
            u16le(0), // comment
            u16le(0), // disk start
            u16le(0), // internal attr
            u32le(0), // external attr
            u32le(e.offset),
            e.nameBuf,
        ])
        parts.push(cd)
        offset += cd.length
    }

    const cdSize = offset - cdStart
    const eocd = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x05, 0x06]), // end of central dir
        u16le(0), // disk number
        u16le(0), // disk with cd
        u16le(entries.length),
        u16le(entries.length),
        u32le(cdSize),
        u32le(cdStart),
        u16le(0), // comment length
    ])
    parts.push(eocd)

    return Buffer.concat(parts)
}

async function main() {
    let filenames
    try {
        filenames = readdirSync(DEMO_DIR)
    } catch {
        console.error(`Demo directory not found: ${DEMO_DIR}`)
        console.error('Run fixtures:generate first.')
        process.exit(1)
    }

    const toInclude = filenames
        .filter((f) => INCLUDE.some((re) => re.test(f)))
        .sort()

    if (!toInclude.length) {
        console.error(
            'No demo files found in pwa/demo/. Run fixtures:generate first.'
        )
        process.exit(1)
    }

    const files = toInclude.map((name) => {
        const fullPath = join(DEMO_DIR, name)
        const data = (() => {
            const chunks = []
            const fd = createReadStream(fullPath)
            return new Promise((resolve, reject) => {
                fd.on('data', (chunk) => chunks.push(chunk))
                fd.on('end', () => resolve(Buffer.concat(chunks)))
                fd.on('error', reject)
            })
        })()
        return { name, dataPromise: data }
    })

    const resolved = await Promise.all(
        files.map(async ({ name, dataPromise }) => ({
            name,
            data: await dataPromise,
            mtime: new Date(),
        }))
    )

    const zipBuf = await buildZip(resolved)

    await new Promise((resolve, reject) => {
        const ws = createWriteStream(ZIP_PATH)
        ws.on('finish', resolve)
        ws.on('error', reject)
        ws.end(zipBuf)
    })

    for (const { name } of resolved) {
        unlinkSync(join(DEMO_DIR, name))
    }

    console.log(
        `Created ${ZIP_PATH} with ${resolved.length} file(s): ${resolved.map((f) => f.name).join(', ')}`
    )
}

main()
