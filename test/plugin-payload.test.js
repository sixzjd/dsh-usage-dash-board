import test from 'node:test'
import assert from 'node:assert/strict'
import { filterSnapshot, scopeFromParams } from '../lib/plugin.js'
import { createAggregator } from '../lib/aggregate.js'

const cost = (total, unpriced = 0) => ({
  currency: 'USD',
  input: total,
  output: '0',
  cacheRead: '0',
  cacheWrite: '0',
  total,
  priced: unpriced === 0 ? 1 : 0,
  unpriced,
})

function request(id, date, provider, modelId, input, total) {
  return {
    id, sessionId: id.split(':')[0], time: Date.parse(`${date}T12:00:00Z`), date,
    provider, modelId, tokens: { input, output: 0, cacheRead: 0, cacheWrite: 0 },
    realTokens: input, hitRate: 0, cost: cost(total), status: 'complete',
  }
}

test('normalizes inverted dates and parses comma-separated filters', () => {
  assert.deepEqual(scopeFromParams({
    start: '2026-10-09',
    end: '2026-10-01',
    provider: ' alpha, beta,alpha ',
    model: 'model-a, model-b',
  }), {
    start: '2026-10-01',
    end: '2026-10-09',
    providers: ['alpha', 'beta'],
    models: ['model-a', 'model-b'],
  })
})

test('filters requests and rebuilds totals and groups from selected rows', () => {
  const snapshot = {
    calls: 3,
    requests: [
      request('s1:1:1', '2026-10-01', 'alpha', 'model-a', 10, '1'),
      request('s1:2:1', '2026-10-02', 'beta', 'model-b', 20, '2'),
      request('s2:1:1', '2026-10-03', 'alpha', 'model-a', 30, '3'),
    ],
  }
  const result = filterSnapshot(snapshot, {
    start: '2026-10-01',
    end: '2026-10-02',
    providers: ['alpha'],
    models: [],
  })
  assert.equal(result.requests.length, 1)
  assert.equal(result.totals.calls, 1)
  assert.equal(result.totals.sessions, 1)
  assert.equal(result.totals.turns, 1)
  assert.equal(result.totals.realTokens, 10)
  assert.equal(result.totals.cost.total, '1')
  assert.deepEqual(result.providers.map(({ provider, calls }) => ({ provider, calls })), [
    { provider: 'alpha', calls: 1 },
  ])
  assert.deepEqual(result.models.map(({ modelId, calls }) => ({ modelId, calls })), [
    { modelId: 'model-a', calls: 1 },
  ])
  assert.deepEqual(result.days.map(({ date, calls }) => ({ date, calls })), [
    { date: '2026-10-01', calls: 1 },
  ])
  // allTime describes the whole snapshot, not the selected range: the scope
  // keeps one request while the snapshot carries three. realTokens falls back to
  // the scoped total because this partial fixture omits the unfiltered figure.
  assert.equal(result.allTime.calls, 3)
  assert.equal(result.allTime.realTokens, 10)
})

test('rebuilds priced daily cost when filtering requests', () => {
  const result = filterSnapshot({
    requests: [request('s1:1:1', '2026-10-01', 'alpha', 'model-a', 10, '1.25')],
  }, { start: '2026-10-01', end: '2026-10-01', providers: [], models: [] })

  assert.equal(result.days[0].cost.total, '1.25')
  assert.equal(result.totals.cost.total, '1.25')
})

test('preserves unknown model unpriced state in request and filtered aggregates', () => {
  const aggregator = createAggregator()
  aggregator.loadSession('session-unknown', [
    { type: 'request/context', time: 0, data: { provider: 'mystery', model: 'not-priced' } },
    { type: 'assistant/message', time: 0, data: { turn: 1, step: 1, usage: { inputTokens: 4 } } },
  ])
  const result = filterSnapshot(aggregator.snapshot(), {
    start: '1970-01-01', end: '1970-01-01', providers: [], models: [],
  })

  assert.equal(result.requests[0].cost.unpriced, 1)
  assert.equal(result.totals.cost.unpriced, 1)
  assert.equal(result.providers[0].cost.unpriced, 1)
  assert.equal(result.models[0].cost.unpriced, 1)
  assert.equal(result.models[0].priced, false)
})

test('allTime reports the unfiltered whole history, not the selected range', () => {
  // Regression: allTime was recomputed from the already-filtered rows, so a
  // 7-day window reported "all time" as 7 days and a provider filter narrowed
  // it further. The label contradicted its own name.
  const snapshot = {
    calls: 9,
    realTokens: 900,
    earliest: Date.parse('2026-09-01T12:00:00Z'),
    latest: Date.parse('2026-10-09T12:00:00Z'),
    sessions: 4,
    requests: [
      request('s1:1:1', '2026-09-01', 'alpha', 'model-a', 10, '1'),
      request('s2:1:1', '2026-09-20', 'beta', 'model-b', 20, '2'),
      request('s3:1:1', '2026-10-09', 'alpha', 'model-a', 30, '3'),
    ],
  }

  const narrow = filterSnapshot(snapshot, {
    start: '2026-10-01', end: '2026-10-31', providers: [], models: [],
  })

  // The range keeps only one request, but allTime must still describe all nine.
  assert.equal(narrow.requests.length, 1)
  assert.equal(narrow.totals.calls, 1)
  assert.equal(narrow.allTime.calls, 9)
  assert.equal(narrow.allTime.realTokens, 900)
  assert.equal(narrow.allTime.sessions, 4)
  assert.equal(narrow.allTime.earliest, snapshot.earliest)
  assert.equal(narrow.allTime.latest, snapshot.latest)

  // A provider filter must not shrink allTime either.
  const filtered = filterSnapshot(snapshot, {
    start: '2026-09-01', end: '2026-10-31', providers: ['alpha'], models: [],
  })
  assert.equal(filtered.totals.calls, 2)
  assert.equal(filtered.allTime.calls, 9)
})

test('allTime falls back to scoped rows when the snapshot lacks totals', () => {
  // Older or partial snapshots may not carry the unfiltered aggregates; the
  // field must degrade to something honest rather than report undefined.
  const result = filterSnapshot({
    requests: [request('s1:1:1', '2026-10-01', 'alpha', 'model-a', 10, '1')],
  }, { start: '2026-10-01', end: '2026-10-01', providers: [], models: [] })

  assert.equal(result.allTime.calls, 1)
  assert.equal(result.allTime.sessions, 1)
  assert.ok(Number.isFinite(result.allTime.earliest))
})
