/**
 * npm-usage — host half.
 *
 * Folds the durable session log into daily token / request / cache-hit / cost
 * figures and serves them to a native settings section.
 *
 * The data source is the host's public `sessionQuery` service, so nothing here
 * decodes session files or touches `$DSH_HOME/sessions`: the host already owns
 * decompression, ordering and interrupted-turn balancing.
 *
 * Unlike cc-switch-style dashboards, every session the host lists is counted,
 * including workspaces that were never registered. The question this panel
 * answers is "how much did I use today", and dropping an unregistered folder
 * would silently under-report the answer.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createAggregator } from './aggregate.js'
import { DEFAULT_PRICES, addCosts, buildPriceIndex, emptyCost, normalizeModelId } from './pricing.js'

export const name = 'npm-usage'
export const inject = ['sessionQuery', 'storage', 'webServer', 'timer']

const KV_NAME = 'npm_usage_prices'
const KV_VERSION = 0
const RECONCILE_INTERVAL_MS = 120000
const LIVE_DEBOUNCE_MS = 1500
/** Yield periodically so a long history cannot block the event loop. */
const BASELINE_CHUNK_MS = 8000

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function localDay(atMs) {
  const d = new Date(atMs)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayOffset(days) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return localDay(d.getTime())
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Parse `start` / `end` (YYYY-MM-DD); default to the last 30 days. */
function csvParam(params, ...names) {
  const values = []
  for (const name of names) {
    const raw = params?.[name]
    if (typeof raw !== 'string') continue
    for (const value of raw.split(',')) {
      const normalized = value.trim()
      if (normalized !== '' && !values.includes(normalized)) values.push(normalized)
    }
  }
  return values
}

export function scopeFromParams(params = {}) {
  const rawStart = typeof params.start === 'string' ? params.start.trim() : ''
  const rawEnd = typeof params.end === 'string' ? params.end.trim() : ''
  const end = DATE_PATTERN.test(rawEnd) ? rawEnd : localDay(Date.now())
  let start = DATE_PATTERN.test(rawStart) ? rawStart : ''
  if (start === '') {
    const days = Number(params.days)
    start = dayOffset(Number.isFinite(days) && days > 0 ? Math.min(days, 3660) - 1 : 29)
  }
  const dates = start > end ? { start: end, end: start } : { start, end }
  return {
    ...dates,
    providers: csvParam(params, 'provider', 'providers'),
    models: csvParam(params, 'model', 'models'),
  }
}

function sumCosts(costs) {
  const out = emptyCost()
  for (const cost of costs) if (isRecord(cost)) addCosts(out, cost)
  return out
}

function addTokenValues(target, tokens) {
  for (const bucket of ['input', 'output', 'cacheRead', 'cacheWrite']) {
    target[bucket] += Number(tokens?.[bucket]) || 0
  }
}

function tokenValues() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
}

function rowMatches(value, selected) {
  return selected.length === 0 || selected.includes(value ?? 'unknown')
}

export function filterSnapshot(snapshot, scope) {
  const { start, end } = scope
  const providers = Array.isArray(scope.providers) ? scope.providers : []
  const models = Array.isArray(scope.models) ? scope.models : []
  const requests = (Array.isArray(snapshot.requests) ? snapshot.requests : []).filter((request) => {
    return request.date !== 'unknown' && request.date >= start && request.date <= end
      && rowMatches(request.provider, providers) && rowMatches(request.modelId, models)
  })
  const days = new Map()
  const modelGroups = new Map()
  const providerGroups = new Map()
  const tokens = tokenValues()
  const sessions = new Set()
  const turns = new Set()
  let earliest = null
  let latest = null

  for (const request of requests) {
    const requestTokens = request.tokens ?? tokenValues()
    const day = days.get(request.date) ?? {
      date: request.date, calls: 0, tokens: tokenValues(), cost: emptyCost(),
      sessions: new Set(), turns: new Set(),
    }
    day.calls += 1
    addTokenValues(day.tokens, requestTokens)
    addCosts(day.cost, request.cost ?? emptyCost())
    day.sessions.add(request.sessionId)
    const turn = String(request.id ?? '').split(':').slice(0, -1).join(':')
    day.turns.add(turn)
    days.set(request.date, day)

    const providerKey = request.provider ?? 'unknown'
    const modelKey = `${providerKey}\u0000${request.modelId ?? 'unknown'}`
    const provider = providerGroups.get(providerKey) ?? {
      provider: request.provider ?? null, calls: 0, tokens: tokenValues(), cost: emptyCost(),
    }
    provider.calls += 1
    addTokenValues(provider.tokens, requestTokens)
    addCosts(provider.cost, request.cost ?? emptyCost())
    providerGroups.set(providerKey, provider)

    const model = modelGroups.get(modelKey) ?? {
      modelId: request.modelId ?? 'unknown', provider: request.provider ?? null,
      calls: 0, tokens: tokenValues(), cost: emptyCost(),
    }
    model.calls += 1
    addTokenValues(model.tokens, requestTokens)
    addCosts(model.cost, request.cost ?? emptyCost())
    modelGroups.set(modelKey, model)

    addTokenValues(tokens, requestTokens)
    sessions.add(request.sessionId)
    turns.add(turn)
    if (request.time !== null && request.time !== undefined) {
      if (earliest === null || request.time < earliest) earliest = request.time
      if (latest === null || request.time > latest) latest = request.time
    }
  }
  const real = tokens.input + tokens.output + tokens.cacheWrite + tokens.cacheRead
  const cacheable = tokens.input + tokens.cacheWrite + tokens.cacheRead
  const dayList = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map((day) => ({
    date: day.date,
    calls: day.calls,
    sessions: day.sessions.size,
    turns: day.turns.size,
    tokens: day.tokens,
    realTokens: day.tokens.input + day.tokens.output + day.tokens.cacheWrite + day.tokens.cacheRead,
    hitRate: (day.tokens.input + day.tokens.cacheWrite + day.tokens.cacheRead) > 0
      ? day.tokens.cacheRead / (day.tokens.input + day.tokens.cacheWrite + day.tokens.cacheRead) : null,
    cost: day.cost,
  }))
  const modelList = [...modelGroups.values()].map((model) => ({
    ...model,
    realTokens: model.tokens.input + model.tokens.output + model.tokens.cacheWrite + model.tokens.cacheRead,
    hitRate: (model.tokens.input + model.tokens.cacheWrite + model.tokens.cacheRead) > 0
      ? model.tokens.cacheRead / (model.tokens.input + model.tokens.cacheWrite + model.tokens.cacheRead) : null,
    priced: model.cost.unpriced === 0,
  })).sort((a, b) => b.realTokens - a.realTokens)
  const providerList = [...providerGroups.values()].map((provider) => ({
    ...provider,
    realTokens: provider.tokens.input + provider.tokens.output + provider.tokens.cacheWrite + provider.tokens.cacheRead,
    hitRate: (provider.tokens.input + provider.tokens.cacheWrite + provider.tokens.cacheRead) > 0
      ? provider.tokens.cacheRead / (provider.tokens.input + provider.tokens.cacheWrite + provider.tokens.cacheRead) : null,
  })).sort((a, b) => b.realTokens - a.realTokens)
  return {
    scope: { start, end, providers, models },
    totals: {
      calls: requests.length,
      turns: turns.size,
      sessions: sessions.size,
      tokens,
      realTokens: real,
      hitRate: cacheable > 0 ? tokens.cacheRead / cacheable : null,
      cost: sumCosts(requests.map((request) => request.cost ?? emptyCost())),
    },
    days: dayList,
    providers: providerList,
    models: modelList,
    requests,
    allTime: {
      calls: requests.length,
      realTokens: real,
      earliest,
      latest,
      sessions: sessions.size,
    },
  }
}

// ---------------------------------------------------------------------------
// Loopback guard. These routes only ever expose this machine's own usage, but a
// DNS-rebound page must not be able to read them, so the socket peer AND the
// Host header both have to say loopback. Writes additionally need the capability
// token handed out by GET /pricing, which a cross-origin page cannot read.
// ---------------------------------------------------------------------------

function requestHeader(req, header) {
  const headers = isRecord(req) ? req.headers : null
  if (!isRecord(headers)) return undefined
  const value = headers[header]
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined
  return typeof value === 'string' ? value : undefined
}

function isLoopbackAddress(address) {
  if (typeof address !== 'string') return false
  const value = address.trim().toLowerCase()
  if (value === '::1' || value === 'localhost') return true
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return true
  return /^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)
}

function isTrustedLocalRequest(req) {
  if (!isLoopbackAddress(req?.socket?.remoteAddress)) return false
  const host = requestHeader(req, 'host')
  if (typeof host !== 'string' || host === '') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!(hostUrl.hostname === 'localhost' || isLoopbackAddress(hostUrl.hostname))) return false
  if (requestHeader(req, 'sec-fetch-site') === 'cross-site') return false
  const origin = requestHeader(req, 'origin')
  // The desktop shell forwards requests with Origin stripped, so an absent
  // Origin is allowed; a present one must still be this same loopback origin.
  if (origin === undefined || origin === '') return true
  if (origin.startsWith('dsh-app://')) return true
  try {
    const originUrl = new URL(origin)
    return originUrl.protocol === 'http:' && originUrl.host === host
  } catch {
    return false
  }
}

function tokenEquals(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req, limit = 256 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) return { tooLarge: true }
    chunks.push(chunk)
  }
  try {
    return { body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  } catch {
    return { invalid: true }
  }
}

// ---------------------------------------------------------------------------
// Prices: the seed table plus user edits, keyed by model id.
// ---------------------------------------------------------------------------

function sanitizeRates(raw) {
  const out = {}
  for (const bucket of ['input', 'output', 'cacheRead', 'cacheWrite']) {
    const n = Number(raw?.[bucket])
    if (!Number.isFinite(n) || n < 0) return null
    out[bucket] = String(n)
  }
  return out
}

/** Merge stored edits onto the seed table. Later rows win, so edits override. */
function mergePrices(stored) {
  const index = buildPriceIndex(DEFAULT_PRICES)
  if (!Array.isArray(stored)) return [...index.values()]
  for (const raw of stored) {
    if (!isRecord(raw) || typeof raw.modelId !== 'string') continue
    const id = raw.modelId.trim()
    const key = id.toLowerCase()
    const short = normalizeModelId(id)
    if (key === '') continue
    if (raw.removed === true) { index.delete(key); if (short !== '') index.delete(short); continue }
    const previous = index.get(key) ?? (short === '' ? undefined : index.get(short))
    const next = { ...(previous ?? {}), modelId: id }
    if (typeof raw.label === 'string' && raw.label !== '') next.label = raw.label
    const offPeak = sanitizeRates(raw.offPeak)
    if (offPeak !== null) next.offPeak = offPeak
    if (raw.peak === null) delete next.peak
    else { const peak = sanitizeRates(raw.peak); if (peak !== null) next.peak = peak }
    if (Array.isArray(raw.holidays)) {
      next.holidays = raw.holidays.filter((d) => typeof d === 'string' && DATE_PATTERN.test(d))
    }
    if (Number.isFinite(raw.effectiveFrom)) next.effectiveFrom = raw.effectiveFrom
    index.set(key, next)
    if (short !== '' && short !== key) index.set(short, next)
  }
  return [...index.values()]
}

function publicPrice(entry) {
  return {
    modelId: entry.modelId,
    label: entry.label ?? null,
    offPeak: entry.offPeak ?? null,
    peak: entry.peak ?? null,
    holidays: Array.isArray(entry.holidays) ? entry.holidays : [],
    effectiveFrom: Number.isFinite(entry.effectiveFrom) ? entry.effectiveFrom : null,
  }
}

export function apply(ctx) {
  const storage = ctx.get('storage')
  const webServer = ctx.get('webServer')
  const sessionQuery = ctx.get('sessionQuery')

  const writeToken = randomBytes(32).toString('base64url')
  let prices = mergePrices(null)
  let aggregator = createAggregator({ prices })
  let kvUnit = null
  let revision = 0
  let cached = null
  let cachedRevision = -1
  let scan = { started: false, done: false, total: 0, loaded: 0, failed: 0 }
  let baselineRunning = false
  let baselinePromise = null
  let disposed = false
  const livePending = new Set()
  let liveScheduled = false

  function bump() {
    revision += 1
    cached = null
    cachedRevision = -1
  }

  function snapshot() {
    if (cached !== null && cachedRevision === revision) return cached
    cached = aggregator.snapshot()
    cachedRevision = revision
    return cached
  }

  function payload(scope) {
    return {
      ok: true,
      revision,
      generatedAt: Date.now(),
      scan,
      ...filterSnapshot(snapshot(), scope),
    }
  }

  // --- persistence ---------------------------------------------------------

  async function loadPrices() {
    try {
      const backend = storage?.backend?.get?.('json')
      if (backend?.kv === undefined) return
      kvUnit = await backend.kv.open({ name: KV_NAME, version: KV_VERSION, tables: [], hasGlobal: true })
      if (disposed) { await kvUnit.close().catch(() => {}); kvUnit = null; return }
      const snap = await kvUnit.loadAll()
      const stored = snap?.global?.prices
      if (Array.isArray(stored)) {
        prices = mergePrices(stored)
        aggregator = createAggregator({ prices })
        bump()
      }
    } catch (error) {
      console.error('[npm-usage] price storage unavailable:', error)
      kvUnit = null
    }
  }

  let writeChain = Promise.resolve()
  function persistPrices() {
    if (kvUnit === null || kvUnit === undefined) return writeChain
    const rows = prices.map(publicPrice)
    writeChain = writeChain
      .then(() => kvUnit.setGlobal({ prices: rows }))
      .catch((error) => console.error('[npm-usage] price persist failed:', error))
    return writeChain
  }

  // --- scanning ------------------------------------------------------------

  async function listSessionIds() {
    const records = await sessionQuery.listSessions()
    const ids = []
    if (!Array.isArray(records)) return null
    for (const record of records) {
      const sid = record?.header?.id
      if (typeof sid === 'string') ids.push(sid)
    }
    return ids
  }

  async function loadOne(sid, target = aggregator) {
    const snap = await sessionQuery.readSession(sid)
    if (disposed) return
    if (!isRecord(snap) || !Array.isArray(snap.events)) {
      throw new Error(`sessionQuery.readSession(${sid}) returned malformed data`)
    }
    const events = snap.events
    target.loadSession(sid, events)
  }

  async function runBaseline() {
    // A second caller waits for the run in flight rather than returning early:
    // the pricing route answers only once the NEW price table has been folded,
    // otherwise it would report numbers from the table the user just replaced.
    if (baselineRunning && baselinePromise !== null) return baselinePromise
    if (disposed) return
    baselineRunning = true
    baselinePromise = (async () => {
      scan = { started: true, done: false, total: 0, loaded: 0, failed: 0 }
      bump()
      const nextAggregator = createAggregator({ prices })
      let complete = false
      try {
        const ids = await listSessionIds()
        if (ids === null) {
          scan = { ...scan, failed: 1 }
          throw new Error('sessionQuery.listSessions() returned a non-array')
        }
        scan = { ...scan, total: ids.length }
        let chunkStart = Date.now()
        for (const sid of ids) {
          if (disposed) return
          try {
            await loadOne(sid, nextAggregator)
            scan = { ...scan, loaded: scan.loaded + 1 }
          } catch (error) {
            scan = { ...scan, failed: scan.failed + 1 }
            console.error(`[npm-usage] session read failed (${sid}):`, error)
          }
          if (Date.now() - chunkStart > BASELINE_CHUNK_MS) {
            chunkStart = Date.now()
            // `timeout` rejects when the fiber is disposed, which is a normal end.
            await ctx.timeout(0).catch(() => {})
          }
        }
        complete = scan.failed === 0
      } catch (error) {
        console.error('[npm-usage] baseline failed:', error)
      } finally {
        if (complete && !disposed) aggregator = nextAggregator
        scan = { ...scan, done: true }
        baselineRunning = false
        baselinePromise = null
        bump()
      }
    })()
    return baselinePromise
  }

  // Live updates are debounced and reload the touched session from the host
  // rather than folding the event here: the durable log is the single truth, and
  // a partial fold could disagree with what the next baseline produces.
  function scheduleLive(sid) {
    livePending.add(sid)
    if (liveScheduled) return
    liveScheduled = true
    ctx.timeout(async () => {
      liveScheduled = false
      const pending = [...livePending]
      livePending.clear()
      for (const id of pending) {
        if (disposed) return
        try {
          await loadOne(id)
          bump()
        } catch (error) {
          console.error(`[npm-usage] live reload failed (${id}):`, error)
        }
      }
    }, LIVE_DEBOUNCE_MS)
  }

  // --- routes --------------------------------------------------------------

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/api/npm-usage/summary',
    handler: (req, res) => {
      if (req.method !== 'GET') { res.statusCode = 405; res.end(); return }
      if (!isTrustedLocalRequest(req)) { sendJson(res, 403, { ok: false, message: 'untrusted' }); return }
      const params = Object.fromEntries(new URL(req.url ?? '/', 'http://x').searchParams)
      sendJson(res, 200, payload(scopeFromParams(params)))
    },
  }))

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/api/npm-usage/pricing',
    handler: async (req, res) => {
      if (!isTrustedLocalRequest(req)) { sendJson(res, 403, { ok: false, message: 'untrusted' }); return }
      if (req.method === 'GET') {
        sendJson(res, 200, {
          ok: true,
          token: writeToken,
          prices: prices.map(publicPrice),
          models: snapshot().models.map((model) => ({
            modelId: model.modelId,
            provider: model.provider,
            calls: model.calls,
            realTokens: model.realTokens,
            priced: model.priced,
          })),
        })
        return
      }
      if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
      if (!tokenEquals(requestHeader(req, 'x-npm-usage-token'), writeToken)) {
        sendJson(res, 403, { ok: false, message: 'bad-token' })
        return
      }
      const parsed = await readJsonBody(req)
      if (parsed.tooLarge === true || parsed.invalid === true) {
        sendJson(res, 400, { ok: false, message: parsed.tooLarge ? 'too-large' : 'bad-body' })
        return
      }
      const rows = isRecord(parsed.body) && Array.isArray(parsed.body.prices) ? parsed.body.prices : null
      if (rows === null) { sendJson(res, 400, { ok: false, message: 'bad-prices' }); return }
      prices = mergePrices(rows)
      // The baseline publishes a fresh aggregator only after every session has
      // been read successfully, so keep the current view until then.
      await persistPrices()
      await runBaseline()
      sendJson(res, 200, { ok: true, revision, count: prices.length })
    },
  }))

  // --- lifecycle -----------------------------------------------------------

  ctx.on('session/event', (session, event) => {
    if (disposed || !scan.done) return
    const type = event?.type
    if (type !== 'assistant/message' && type !== 'assistant/chunk' && type !== 'request/header' && type !== 'request/context') return
    const sid = session?.id
    if (typeof sid !== 'string') return
    scheduleLive(sid)
  })

  ctx.on('session/flush', (session) => {
    if (disposed || !scan.done) return
    const sid = session?.id
    if (typeof sid === 'string') scheduleLive(sid)
  })

  ctx.effect(() => {
    const stop = ctx.interval(() => { void runBaseline() }, RECONCILE_INTERVAL_MS)
    return stop
  })

  ctx.effect(() => async () => {
    disposed = true
    const unit = kvUnit
    kvUnit = null
    await writeChain.catch(() => {})
    await unit?.close().catch(() => {})
  })

  void (async () => {
    await loadPrices()
    await runBaseline()
  })()
}

export default { name, inject, apply }
