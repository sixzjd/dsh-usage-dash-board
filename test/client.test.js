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

// Two regressions in one rule: overflow-wrap:anywhere let "5148.5万" break
// between ".5" and "万" inside a fixed-height card, and the follow-up
// overflow:hidden fix then clipped the 23px glyphs top-and-bottom, because
// the 83px box never actually fit label+gap+value+padding anyway (it relies
// on overflow). The honest shape: cards grow (min-height), values never
// wrap, and nothing hides overflow.
test("metric values stay fully visible at narrow card widths", async () => {
  const source = await readFile(clientPath, "utf8")
  assert.match(source, /\.um-card\{[^}]*min-height:83px/, "card grows instead of clipping")
  // (?<!min-) keeps this from matching the min-height line above it.
  assert.doesNotMatch(source, /\.um-card\{[^}]*(?<!min-)height:83px/, "no fixed card height")
  assert.match(source, /\.um-value\{[^}]*white-space:nowrap/, "card value must not wrap")
  assert.doesNotMatch(source, /\.um-value\{[^}]*overflow/, "card value must not hide overflow")
  assert.doesNotMatch(source, /\.um-detail-value\{[^}]*overflow/, "modal value must not hide overflow")
  assert.match(source, /\.um-card\{[^}]*padding:20px 24px/, "card padding widened the content box")
})

// Two bugs shared one root: the grouped tables keyed rows on modelId OR
// provider, so the two qfmodel routes (qoder, qoder-global) collided on the
// same React key. Undefined diff behaviour then let a stale models-table row
// (4 cells: name+route / calls / tokens / cost) survive into the requests
// table (5 cells) when switching tabs - the "time column shows a model"
// screenshot. Keys must carry both dimensions.
test('grouped rows key on provider AND model, never one or the other', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(source, /h\("tr", \{ key: `\$\{r\.provider[^\n]*r\.modelId/,
    'grouped table key must join provider and modelId')
  assert.doesNotMatch(source, /key: `\$\{r\.modelId \|\| r\.provider/,
    'the || key form let two routes collide')
})

// The requests array arrives oldest-first; slice(0, 100) therefore showed the
// 100 OLDEST requests of the range and silently hid everything recent - a
// user's fresh deepseek calls existed in the data but could never appear.
// Newest-first (last 100, reversed) is what a request log means.
test('request log shows the newest requests, not the oldest', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(source, /\.slice\(-100\)\.reverse\(\)\.map/,
    'requests table must take the trailing 100 and reverse them')
  assert.doesNotMatch(source, /rows \|\| \[\]\)\.slice\(0, 100\)/,
    'leading slice showed stale history only')
})
