import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const clientPath = new URL('../client.js', import.meta.url)

// The panel renders inside the host Settings dialog, so Escape must close the
// metric detail FIRST and never reach the settings dialog behind it. Two paths
// exist and each owns Escape differently; both are guarded here.
test('Escape closes the detail without leaking to the settings dialog', async () => {
  const source = await readFile(clientPath, 'utf8')

  // Fallback path (no host Modal): a capture-phase listener consumes the key
  // before anything outside the panel can see it.
  assert.match(
    source,
    /const onKeyDown = \(event\) => \{ if \(event\.key === "Escape"\) \{ event\.preventDefault\(\); event\.stopPropagation\(\); event\.stopImmediatePropagation\?\.\(\); setDetailKind\(null\); \} \}; document\.addEventListener\("keydown", onKeyDown, true\)/,
    'fallback must intercept Escape in the capture phase',
  )

  // Native path: the host Modal owns Escape and focus return, so the panel must
  // NOT also register its own handler — two handlers would fight over the key
  // and the Modal would never restore focus to the triggering bar.
  assert.match(
    source,
    /if \(!detailKind \|\| Modal !== null\) return undefined/,
    'own Escape handler must be skipped when the host Modal is available',
  )
  assert.match(
    source,
    /if \(Modal !== null\) return h\(Modal, \{ open: true, onClose, title, closeLabel: "关闭详情" \}, body\)/,
    'detail must delegate to the host Modal when present',
  )
})

test('the fallback overlay is viewport-fixed, never absolute inside the content column', async () => {
  const source = await readFile(clientPath, 'utf8')
  const rule = /\.um-detail-backdrop\{([^}]*)\}/.exec(source)
  assert.ok(rule, 'backdrop rule is present')
  assert.match(rule[1], /position:fixed/, 'backdrop must be fixed to the viewport')
  assert.doesNotMatch(rule[1], /position:absolute/, 'absolute would bury the card below the fold')
  // The card being invisible while the mask covered everything was the bug.
  assert.match(rule[1], /z-index:1000/, 'backdrop must sit above the settings dialog')
})

test('axis ticks never collide and always label the final day', async () => {
  const source = await readFile(clientPath, 'utf8')
  const start = source.split('\n').findIndex((line) => line.startsWith('    const tickIndexes = '))
  assert.ok(start >= 0, 'tickIndexes is present')
  let end = -1
  const lines = source.split('\n')
  for (let i = start + 1; i < lines.length; i++) { if (lines[i] === '    }') { end = i; break } }
  assert.ok(end > start, 'tickIndexes block closes')
  const tickIndexes = new Function(lines.slice(start, end + 1).join('\n') + '\nreturn tickIndexes')()

  for (const length of [1, 2, 3, 7, 14, 15, 30, 31, 45, 46, 60, 61, 90, 120, 180, 365]) {
    const ticks = [...tickIndexes(length)].sort((a, b) => a - b)
    assert.ok(ticks.every((t) => t >= 0 && t < length), `${length}: ticks in range`)
    assert.ok(ticks.includes(length - 1), `${length}: final day is labelled`)
    // Slots are ~18px (16 bar + 2 gap) at short ranges and a label is ~34px,
    // so adjacent ticks need enough pitch to keep "10/09" and "10/10" apart.
    const pitch = (length > 60 ? 6 : length > 30 ? 10 : 16) + (length > 120 ? 1 : 2)
    for (let i = 1; i < ticks.length; i++) {
      assert.ok(
        (ticks[i] - ticks[i - 1]) * pitch >= 34,
        `${length}: ticks ${ticks[i - 1]}/${ticks[i]} would overlap (${(ticks[i] - ticks[i - 1]) * pitch}px)`,
      )
    }
  }
})

// The models table groups by provider + route id on purpose, so one model
// reached over two routes is two rows. Rendering only the model name made that
// pair look like a duplicated entry, so the route has to be shown alongside it.
test('model rows name the route so same-model rows stay distinguishable', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(
    source,
    /tab === "models"[\s\S]{0,260}className: "um-cell-sub"[\s\S]{0,60}r\.provider/,
    'the model cell must render the provider as a secondary label',
  )
  assert.match(source, /\.um-cell-sub\{/, 'the secondary label needs a style rule')
})

// A 5-digit 万 value ("5148.5万") is ~95px at 23px, and the card's content box
// at the default three-column width is ~91px with the old 32px padding. With
// overflow-wrap:anywhere the unit character wrapped to a second line inside a
// fixed 83px card, spilling out of the border. The value must never wrap:
// nowrap keeps it on one line, the tighter padding makes ellipsis a
// never-needed fallback, and the detail modal (which owns full precision)
// gets the same guarantee.
test('metric values stay on one line at narrow card widths', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(source, /\.um-value\{[^}]*white-space:nowrap/, 'card value must not wrap')
  assert.doesNotMatch(source, /\.um-value\{[^}]*overflow-wrap:anywhere/, 'no anywhere-wrapping on the card value')
  assert.match(source, /\.um-detail-value\{[^}]*white-space:nowrap/, 'modal value must not wrap either')
  assert.match(source, /\.um-card\{[^}]*padding:20px 24px/, 'card padding widened the content box')
})
