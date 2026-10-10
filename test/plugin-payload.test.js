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
  assert.equal(result.allTime.calls, 1)
  assert.equal(result.allTime.realTokens, 10)
})
