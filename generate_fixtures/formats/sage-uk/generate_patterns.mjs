/**
 * Reads labels.json and writes the generated portion of
 * pwa/src/parse/formats/sage-uk/patterns.js.
 *
 * Usage:
 *   node generate_fixtures/formats/sage-uk/generate_patterns.mjs
 *
 * The generated section is delimited by marker comments so the
 * hand-authored section below it is left untouched on subsequent runs.
 */

import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..')

const LABELS_PATH = path.join(__dirname, 'labels.json')
const PATTERNS_PATH = path.join(
    PROJECT_ROOT,
    'pwa',
    'js',
    'parse',
    'formats',
    'sage-uk',
    'patterns.js'
)

const GENERATED_START =
    '    // <generated from labels.json — do not edit this section manually>'
const GENERATED_END = '    // </generated>'

/**
 * Escapes a plain label string for use as a regex prefix.
 * Spaces become \s+, regex special chars are escaped.
 * A hyphen surrounded by spaces (" - ") becomes \s*-\s* to allow
 * flexible whitespace around separators like "NEST Corporation - EE".
 *
 * @param {string} label
 * @returns {string}
 */
function labelToRegexPrefix(label) {
    return label
        .replace(/ - /g, '__HYPHEN__')
        .split(/( +)/)
        .map((part) => {
            if (/ +/.test(part)) {
                return '\\s+'
            }
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        })
        .join('')
        .replace(/__HYPHEN__/g, '\\s*-\\s*')
}

const labels = JSON.parse(readFileSync(LABELS_PATH, 'utf8'))

const INDENT = '    '
const generatedLines = [GENERATED_START]
const overrides = []
for (const entry of labels) {
    let pattern
    if (entry.patternOverride) {
        const overrideStr = entry.patternOverride
        const overrideMatch = overrideStr.match(/^\/(.*)\/([gimsuy]*)$/)
        if (!overrideMatch) {
            console.error(
                `labels.json entry '${entry.key}': patternOverride is not a valid regex literal: ${overrideStr}`
            )
            process.exit(1)
        }
        try {
            new RegExp(overrideMatch[1], overrideMatch[2])
        } catch (e) {
            console.error(
                `labels.json entry '${entry.key}': patternOverride contains an invalid regex: ${e.message}`
            )
            process.exit(1)
        }
        pattern = overrideStr
        overrides.push(entry.key)
    } else {
        const prefix = labelToRegexPrefix(entry.label)
        pattern = `/${prefix}${entry.patternSuffix}/${entry.patternFlags}`
    }
    if (entry.comment) {
        generatedLines.push(`${INDENT}// ${entry.comment}`)
    }
    generatedLines.push(`${INDENT}${entry.key}: ${pattern},`)
}
generatedLines.push(GENERATED_END)
const generatedBlock = generatedLines.join('\n')

const existing = readFileSync(PATTERNS_PATH, 'utf8')

const startIdx = existing.indexOf(GENERATED_START)
const endIdx = existing.indexOf(GENERATED_END, startIdx)

if (startIdx === -1 || endIdx === -1) {
    console.error(
        `Could not find generated section markers in ${PATTERNS_PATH}\n` +
            `Expected:\n  ${GENERATED_START}\n  ${GENERATED_END}`
    )
    process.exit(1)
}

const before = existing.slice(0, startIdx)
const after = existing.slice(endIdx + GENERATED_END.length)
const updated = before + generatedBlock + after

writeFileSync(PATTERNS_PATH, updated, 'utf8')
const overrideNote = overrides.length
    ? ` (${overrides.length} override${overrides.length > 1 ? 's' : ''}: ${overrides.join(', ')})`
    : ''
console.log(
    `patterns.js updated from labels.json (${labels.length} entries${overrideNote})`
)
