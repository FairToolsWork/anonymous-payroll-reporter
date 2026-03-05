import {
    createReadStream,
    createWriteStream,
    readdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from 'fs'
import { parse } from 'jsonc-parser'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const BASE_DIR = resolve(__dirname, '..')
const DEMO_DIR = join(BASE_DIR, 'demo_files')
const ZIP_PATH = join(DEMO_DIR, 'anonymous-payroll-reporter-demo-files.zip')
const FIXED_MTIME = new Date('2024-01-01T00:00:00Z')

const INCLUDE = [/^DEMO-INSTRUCTIONS\.txt$/, /\.pdf$/i, /\.xlsx$/i]

const CONFIG_PATH = join(BASE_DIR, 'generate_fixtures', 'fixture_runs.json')
const TEMPLATE_PATH = join(
    BASE_DIR,
    'generate_fixtures',
    'instructions_template.md'
)
const WRANGLER_PATH = join(BASE_DIR, 'wrangler.jsonc')
const INSTRUCTIONS_FILENAME = 'DEMO-INSTRUCTIONS.txt'

function stripMarkdown(text) {
    return text
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^>\s?/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\r/g, '')
        .trim()
}

function readFormatNotice(formatName) {
    const source = join(
        BASE_DIR,
        'generate_fixtures',
        'formats',
        formatName,
        'README.md'
    )
    return stripMarkdown(readFileSync(source, 'utf8'))
}

function getProductionUrl() {
    const contents = readFileSync(WRANGLER_PATH, 'utf8')
    const config = parse(contents)
    const pattern = config?.routes?.[0]?.pattern
    if (!pattern) {
        return ''
    }
    const host = pattern.replace(/\/\*$/, '')
    return host ? `https://${host}` : ''
}

function buildInstructions() {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    const payrollStructure = config.default_payroll_structure
    const pensionStructure = config.default_pension_structure
    const payrollFormat = payrollStructure?.split('/formats/')[1]?.split('/')[0]
    const pensionFormat = pensionStructure?.split('/formats/')[1]?.split('/')[0]
    const template = stripMarkdown(readFileSync(TEMPLATE_PATH, 'utf8')).replace(
        '{{PRODUCTION_URL}}',
        getProductionUrl()
    )
    const notices = []

    if (payrollFormat) {
        notices.push(readFormatNotice(payrollFormat))
    }
    if (pensionFormat && pensionFormat !== payrollFormat) {
        notices.push(readFormatNotice(pensionFormat))
    }

    return [template, ...notices].filter(Boolean).join('\n\n') + '\n'
}

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
        readdirSync(DEMO_DIR)
    } catch {
        console.error(`Demo directory not found: ${DEMO_DIR}`)
        console.error('Run fixtures:generate first.')
        process.exit(1)
    }

    const instructionsPath = join(DEMO_DIR, INSTRUCTIONS_FILENAME)
    writeFileSync(instructionsPath, buildInstructions(), 'utf8')

    filenames = readdirSync(DEMO_DIR)

    const toInclude = filenames
        .filter((f) => INCLUDE.some((re) => re.test(f)))
        .sort()

    if (!toInclude.length) {
        console.error(
            'No demo files found in demo_files/. Run fixtures:generate first.'
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
            mtime: FIXED_MTIME,
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
