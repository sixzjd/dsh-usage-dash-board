import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAliasMap,
  createAliasResolver,
  parseCatalogFile,
  resolveDshHome,
} from '../lib/catalog.js'
import { applyDisplayNames, filterSnapshot } from '../lib/plugin.js'

const model = (id, name, fetchedAt) => ({ id, name, fetchedAt })

test('a route id resolves to the display name the catalog carries', () => {
  const rows = parseCatalogFile({
    version: 1,
    entries: {
      'pat:abc123': {
        account: 'pat:abc123',
        source: 'qoder:discovery',
        fetchedAtMs: 1,
        models: [
          { id: 'qfmodel', name: 'Qwen3.8-Flash', contextWindow: 200000 },
          { id: 'dfmodel', name: 'DeepSeek-Flash' },
        ],
      },
    },
  })
  assert.ok(rows, 'the file parses as a catalog')
  const resolve = createAliasResolver(buildAliasMap([rows]))
  assert.equal(resolve.resolve('qfmodel'), 'Qwen3.8-Flash')
  assert.equal(resolve.resolve('dfmodel'), 'DeepSeek-Flash')
  assert.equal(resolve.resolve('unknown-route'), null)
  assert.equal(resolve.resolve(''), null)
  assert.equal(resolve.resolve(null), null)
})

// The catalog sits beside .qoder-probe.json and .qoder-host-heartbeat.json,
// which carries a pid. Both begin with `version: 1`, so only the structural
// check keeps them out of the alias table.
test('unrelated JSON in the same directory is rejected, not half-parsed', () => {
  assert.equal(parseCatalogFile({ version: 1, records: {} }), null)
  assert.equal(
    parseCatalogFile({
      version: 1,
      package: 'dsh-qoder-connect',
      pluginVersion: '0.2.3-alpha.1',
      registeredAt: 1791564844499,
      pid: 38865,
    }),
    null,
  )
  assert.equal(parseCatalogFile(null), null)
  assert.equal(parseCatalogFile([]), null)
  assert.equal(parseCatalogFile({ version: 2, entries: {} }), null)
  assert.equal(parseCatalogFile({ version: 1, entries: {} }), null)
})

// The file is keyed by `pat:<hash>`. Leaking a credential identifier into a
// payload the browser renders would expose it to anything reading the page.
test('account identifiers never reach the resolved rows', () => {
  const rows = parseCatalogFile({
    version: 1,
    entries: {
      'pat:supersecretvalue': {
        account: 'pat:supersecretvalue',
        fetchedAtMs: 5,
        models: [{ id: 'qfmodel', name: 'Qwen3.8-Flash' }],
      },
    },
  })
  const serialized = JSON.stringify(rows)
  assert.ok(!serialized.includes('supersecretvalue'), 'no PAT fragment in rows')
  assert.ok(!serialized.includes('account'), 'no account field in rows')
})

test('an ambiguous name for one route id is dropped rather than guessed', () => {
  // Two accounts fetched at the same instant and disagree: there is no way to
  // tell which label is right, and showing a wrong real model is worse than
  // showing the route key.
  const rows = [
    ...[model('qfmodel', 'Qwen3.8-Flash', 100), model('dmodel', 'DeepSeek-V4-Pro', 100)],
    ...[model('qfmodel', 'Something-Else', 100)],
  ]
  const map = buildAliasMap([rows])
  assert.equal(map.has('qfmodel'), false, 'conflicting id is omitted')
  assert.equal(map.get('dmodel'), 'DeepSeek-V4-Pro', 'unrelated id survives')
})

test('a fresher fetch wins over a stale label', () => {
  const map = buildAliasMap([
    [model('qmodel', 'Qwen3.7-Plus', 100)],
    [model('qmodel', 'Qwen4-Plus', 200)],
  ])
  assert.equal(map.get('qmodel'), 'Qwen4-Plus')
})

test('a name identical to the route id contributes nothing', () => {
  const map = buildAliasMap([[model('auto', 'Auto', 1)], [model('plain', 'plain', 1)]])
  assert.equal(map.has('plain'), false)
  assert.equal(map.get('auto'), 'Auto')
})

test('oversized or non-string fields are skipped without failing the file', () => {
  const rows = parseCatalogFile({
    version: 1,
    entries: {
      a: {
        fetchedAtMs: 1,
        models: [
          { id: 'good', name: 'Good Model' },
          { id: 'noName' },
          { id: 'empty', name: '   ' },
          { id: 42, name: 'numeric id' },
          { id: 'long', name: 'x'.repeat(500) },
          { id: 'notAObject' },
          null,
        ],
      },
    },
  })
  assert.deepEqual(rows.map((r) => r.id), ['good'])
})

test('a namespaced route id also resolves on its trailing segment', () => {
  const resolve = createAliasResolver(buildAliasMap([[model('qfmodel', 'Qwen3.8-Flash', 1)]]))
  assert.equal(resolve.resolve('vendor/qfmodel'), 'Qwen3.8-Flash')
  assert.equal(resolve.resolve('  qfmodel  '), 'Qwen3.8-Flash')
})

test('$DSH_HOME overrides, and a blank value never resolves to the cwd', () => {
  assert.equal(resolveDshHome({ DSH_HOME: '/srv/dsh' }), '/srv/dsh')
  assert.equal(resolveDshHome({ DSH_HOME: '   ', HOME: '/root' }), '/root/.dsh')
  assert.equal(resolveDshHome({ HOME: '/root' }), '/root/.dsh')
})

// The whole point of post-pass labelling: a display change must never move a
// request between rows or change what is counted.
test('labelling changes display only, never grouping or totals', () => {
  const snapshot = {
    calls: 2,
    realTokens: 30,
    requests: [
      { id: 's1:1:1', sessionId: 's1', date: '2026-10-09', provider: 'qoder', modelId: 'qfmodel', tokens: { input: 10, output: 0, cacheRead: 0, cacheWrite: 0 }, realTokens: 10, cost: { unpriced: 1 } },
      { id: 's2:1:1', sessionId: 's2', date: '2026-10-09', provider: 'qoder', modelId: 'qfmodel', tokens: { input: 20, output: 0, cacheRead: 0, cacheWrite: 0 }, realTokens: 20, cost: { unpriced: 1 } },
    ],
    models: [{ modelId: 'qfmodel', provider: 'qoder', calls: 2, tokens: { input: 30, output: 0, cacheRead: 0, cacheWrite: 0 }, realTokens: 30, cost: { unpriced: 2 } }],
    providers: [], days: [],
  }
  const scoped = filterSnapshot(snapshot, { start: '2026-10-01', end: '2026-10-31', providers: [], models: [] })
  const labelled = applyDisplayNames(scoped, (id) => (id === 'qfmodel' ? 'Qwen3.8-Flash' : null))

  assert.equal(labelled.requests.length, 2, 'row count unchanged')
  assert.equal(labelled.totals.calls, 2, 'totals unchanged')
  assert.equal(labelled.totals.realTokens, 30, 'token totals unchanged')
  assert.equal(labelled.models.length, 1, 'still one grouped model row')
  assert.equal(labelled.models[0].calls, 2, 'group still holds both calls')
  // The route id survives: it is what the next request and the price lookup use.
  assert.equal(labelled.requests[0].modelId, 'qfmodel')
  assert.equal(labelled.requests[0].displayName, 'Qwen3.8-Flash')
  assert.equal(labelled.models[0].displayName, 'Qwen3.8-Flash')
  // Originals are not mutated, so a cached snapshot cannot drift.
  assert.equal(scoped.requests[0].displayName, undefined)
})

test('rows with no alias gain no displayName field', () => {
  const scoped = { requests: [{ modelId: 'plain' }], models: [{ modelId: 'plain' }] }
  const out = applyDisplayNames(scoped, () => null)
  assert.equal('displayName' in out.requests[0], false)
  assert.equal('displayName' in out.models[0], false)
})

test('a missing resolver leaves the payload untouched', () => {
  const scoped = { requests: [{ modelId: 'qfmodel' }], models: [] }
  assert.equal(applyDisplayNames(scoped, undefined), scoped)
})
