import test from 'node:test'
import assert from 'node:assert/strict'
import { createAggregator } from '../lib/aggregate.js'

function event(type, data, time) {
  return { type, time, data }
}

test('prefers assistant/message usage over the chunk for one request slot', () => {
  const aggregator = createAggregator()
  aggregator.loadSession('session-1', [
    event('request/header', {
      header: { config: { provider: 'alpha', model: 'model-a' } },
      turn: 1,
      step: 1,
    }, 1000),
    event('assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'usage', usage: { inputTokens: 2, outputTokens: 3 } },
    }, 2000),
    event('assistant/message', {
      turn: 1,
      step: 1,
      usage: { inputTokens: 20, outputTokens: 30, cacheReadTokens: 10 },
    }, 3000),
  ])

  const snapshot = aggregator.snapshot()
  assert.equal(snapshot.calls, 1)
  assert.equal(snapshot.requests.length, 1)
  assert.deepEqual(snapshot.requests[0], {
    id: 'session-1:1:1',
    sessionId: 'session-1',
    time: 3000,
    date: '1970-01-01',
    provider: 'alpha',
    modelId: 'model-a',
    tokens: { input: 20, output: 30, cacheRead: 10, cacheWrite: 0 },
    realTokens: 60,
    hitRate: 10 / 30,
    cost: {
      currency: 'USD',
      input: '0',
      output: '0',
      cacheRead: '0',
      cacheWrite: '0',
      total: '0',
      priced: 0,
      unpriced: 1,
    },
    status: 'complete',
  })
})

test('groups the same model separately for each provider', () => {
  const aggregator = createAggregator()
  aggregator.loadSession('session-1', [
    event('request/context', { provider: 'alpha', model: 'shared-model' }, 1000),
    event('assistant/message', {
      turn: 1, step: 1, usage: { inputTokens: 1, outputTokens: 2 },
    }, 1000),
    event('request/context', { provider: 'beta', model: 'shared-model' }, 2000),
    event('assistant/message', {
      turn: 2, step: 1, usage: { inputTokens: 3, outputTokens: 4 },
    }, 2000),
  ])

  const snapshot = aggregator.snapshot()
  assert.deepEqual(snapshot.providers.map(({ provider, calls, realTokens }) => ({ provider, calls, realTokens })), [
    { provider: 'beta', calls: 1, realTokens: 7 },
    { provider: 'alpha', calls: 1, realTokens: 3 },
  ])
  assert.deepEqual(snapshot.models
    .map(({ provider, modelId, calls, realTokens }) => ({ provider, modelId, calls, realTokens }))
    .sort((a, b) => a.provider.localeCompare(b.provider)), [
    { provider: 'alpha', modelId: 'shared-model', calls: 1, realTokens: 3 },
    { provider: 'beta', modelId: 'shared-model', calls: 1, realTokens: 7 },
  ])
})

test('reload clears the previous route and preserves an epoch timestamp of zero', () => {
  const aggregator = createAggregator()
  aggregator.loadSession('session-1', [
    event('request/context', { provider: 'stale-provider', model: 'stale-model' }, 10),
    event('assistant/message', {
      turn: 1, step: 1, usage: { inputTokens: 1 },
    }, 10),
  ])
  aggregator.loadSession('session-1', [
    event('assistant/message', {
      turn: 2, step: 1, usage: { inputTokens: 2 },
    }, 0),
  ])

  const request = aggregator.snapshot().requests[0]
  assert.equal(request.time, 0)
  assert.equal(request.date, '1970-01-01')
  assert.equal(request.provider, null)
  assert.equal(request.modelId, null)
})

test('unknown models retain an unpriced request cost marker', () => {
  const aggregator = createAggregator()
  aggregator.loadSession('session-unknown', [
    event('request/context', { provider: 'mystery', model: 'not-priced' }, 1000),
    event('assistant/message', {
      turn: 1, step: 1, usage: { inputTokens: 1 },
    }, 1000),
  ])

  const snapshot = aggregator.snapshot()
  assert.equal(snapshot.requests[0].cost.unpriced, 1)
  assert.equal(snapshot.models[0].priced, false)
})
