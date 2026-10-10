import test from 'node:test'
import assert from 'node:assert/strict'
import { pricingCandidates } from '../lib/plugin.js'

const resolver = { resolve: (id) => (id === 'qfmodel' ? 'Qwen3.8-Flash' : null) }

// Fold rows are keyed provider + route id, so one model reached over two
// routes arrives twice. Prices key off the model alone, so two form rows would
// edit the same index slot and the later write would silently win.
test('one model reached over two routes collapses to a single price row', () => {
  const rows = pricingCandidates([
    { modelId: 'qfmodel', provider: 'qoder', calls: 1938, realTokens: 450762875, priced: false },
    { modelId: 'qfmodel', provider: 'qoder-global', calls: 36, realTokens: 14569910, priced: false },
  ], resolver)

  assert.equal(rows.length, 1, 'exactly one editable row')
  assert.equal(rows[0].modelId, 'qfmodel')
  assert.equal(rows[0].calls, 1974, 'calls summed across both routes')
  assert.equal(rows[0].realTokens, 465332785, 'tokens summed across both routes')
  assert.equal(rows[0].displayName, 'Qwen3.8-Flash')
})

// The price is one index entry, so it is either set for every route or for
// none: a row must never look configured while another route is still unpriced.
test('a route still lacking a rate leaves the merged row unpriced', () => {
  const rows = pricingCandidates([
    { modelId: 'glm-5', provider: 'zhipuai', calls: 10, realTokens: 100, priced: true },
    { modelId: 'glm-5', provider: 'open', calls: 5, realTokens: 50, priced: false },
  ], resolver)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].priced, false, 'unpriced route dominates the merged row')
})

// buildPriceIndex keys on the trimmed lower-cased id, and mergePrices also
// writes the trailing segment, so `vendor/model` and a bare `model` address the
// same entry and must not produce two form rows either.
test('ids differing only by case or namespace share one row', () => {
  const rows = pricingCandidates([
    { modelId: 'OpenAI/GPT-OSS-120B', provider: 'nvidia', calls: 3, realTokens: 30, priced: false },
    { modelId: 'openai/gpt-oss-120b', provider: 'groq', calls: 4, realTokens: 40, priced: false },
  ], resolver)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].calls, 7)
})

test('distinct models stay distinct and sort by usage', () => {
  const rows = pricingCandidates([
    { modelId: 'small', provider: 'a', calls: 1, realTokens: 10, priced: true },
    { modelId: 'big', provider: 'b', calls: 9, realTokens: 9000, priced: false },
    { modelId: 'mid', provider: 'c', calls: 3, realTokens: 300, priced: true },
  ], resolver)
  assert.deepEqual(rows.map((r) => r.modelId), ['big', 'mid', 'small'])
})

test('malformed rows are skipped without dropping the good ones', () => {
  const rows = pricingCandidates([
    null,
    { modelId: '', provider: 'a', calls: 1, realTokens: 1 },
    { provider: 'a', calls: 1, realTokens: 1 },
    { modelId: 'good', provider: null, calls: undefined, realTokens: undefined, priced: undefined },
  ], resolver)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].modelId, 'good')
  assert.equal(rows[0].calls, 0, 'non-numeric counts become zero, not NaN')
  assert.equal(rows[0].realTokens, 0)
  assert.equal(rows[0].priced, true, 'only an explicit false marks unpriced')
})

test('a missing resolver still returns rows, just without display names', () => {
  const rows = pricingCandidates(
    [{ modelId: 'qfmodel', provider: 'a', calls: 1, realTokens: 1, priced: true }],
    undefined,
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].displayName, undefined)
})

test('internal grouping fields never reach the response', () => {
  const rows = pricingCandidates(
    [{ modelId: 'qfmodel', provider: 'a', calls: 1, realTokens: 1, priced: true }],
    resolver,
  )
  assert.equal('slots' in rows[0], false, 'index-slot bookkeeping stays private')
  assert.equal('providers' in rows[0], false)
})
