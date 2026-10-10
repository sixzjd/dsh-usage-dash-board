# npm-usage

A local usage-analytics plugin for DeepSeek Harness: **Settings → Usage Statistics** shows token consumption, request count, cache hit rate and a daily trend.

All data comes from your local session logs. No network, no upload, no API key.

> The panel body is currently Chinese-only; the settings nav label follows your browser language. The full design notes live in [README.md](README.md).

## Why

DSH already reports per-turn token usage, but nothing aggregates across sessions. External tools like cc-switch do, at the cost of a separate desktop app that parses log files and guesses their format.

This plugin runs entirely inside DSH. The host exposes a public `sessionQuery` service that owns decompression, ordering and interrupted-turn balancing, so the plugin consumes structured events instead of parsing files — and it does not break when the log layout changes.

## Flow

```
durable session log
      │  ctx.sessionQuery.listSessions() / readSession()
      ▼
  event stream (decoded, ordered)
      │  assistant/message.usage  ▸ supersedes assistant/chunk for the same turn
      │  request/header / request/context  ▸ model and provider identity
      ▼
  fold into one row per (session, turn, step)
      │  bucket by local calendar day
      ▼
  daily / per-model aggregates + price-table costing
      │  GET /api/npm-usage/summary
      ▼
  native settings section (settings.section slot)
```

One call counts once: the final `assistant/message` usage **replaces** the streaming `assistant/chunk` for the same `turn:step` rather than adding to it, and an all-zero replay never overwrites a recorded real number.

## Metric definitions

Token buckets follow the host's documented **DISJOINT** semantics (`@deepseek-ai/dsh-llm`): `inputTokens` is uncached input only; cached input is reported separately.

| Metric | Formula |
|---|---|
| Tokens consumed | `input + output + cacheWrite + cacheRead` |
| Requests | calls carrying usage, deduplicated by `session:turn:step` |
| Cache hit rate | `cacheRead ÷ (input + cacheWrite + cacheRead)` |

> **Note**: OpenAI-style protocols do not report `cacheWriteTokens`, so that term is always 0 and the hit rate stays correct (the denominator omits it too). This is a missing upstream field, not a counting gap.

## Features

| Area | Content |
|---|---|
| Three summary cards | Tokens consumed / Requests / Cache hit rate; click to expand that metric's breakdown |
| Trend | Daily bar chart, switchable between Tokens and Requests; values appear on hover or keyboard focus only |
| Filters | Provider, model, range (7 / 30 / 90 days, custom start–end) |
| Request log | Per-call time, provider, model, tokens, cost |
| Providers / Models | Grouped totals and shares |
| Pricing | Editable price table, USD per million tokens across four buckets |

The X axis is filled with **every calendar day** in range, so idle days render as zero rather than being skipped — otherwise "two idle weeks then one burst" would read as "steady low usage with a spike".

## Install

```bash
dsh plugin --profile web add github:sixzjd/npm-usage
```

Not yet published to npm; once it is, `dsh plugin --profile web add npm-usage` also works.

Refresh the page after installing. The entry mounts into the settings page's `settings.section` slot.

## Built-in prices

DeepSeek's official peak/off-peak table ships as in-package constants, sourced from the official announcement:

| Model | Off-peak in / out / cacheRead | Peak in / out / cacheRead |
|---|---|---|
| `deepseek-v4-flash` | 0.15 / 0.6 / 0.003 | 0.44 / 1.32 / 0.014 |
| `deepseek-v4-pro` | 0.66 / 1.98 / 0.022 | 1.32 / 3.96 / 0.044 |

USD per million tokens. Peak hours are UTC `01:00–04:00` and `06:00–10:00` on Monday–Friday, excluding Chinese statutory holidays.

**Models with no public price are reported as unpriced and never receive a guessed rate.** You can add prices manually under Pricing.

## Development

```
client.js            browser half (the settings panel)
lib/index.js         host half entry
lib/plugin.js        scan, aggregation scheduling, persistence, HTTP routes
lib/aggregate.js     event fold and daily / per-model bucketing
lib/pricing.js       price table and peak-band resolution
locale/{en,zh}.json  plugin page display name (en.json must exist)
test/                node:test suite, no third-party dependencies
```

```bash
npm test     # 11 tests
npm run check
```

## Public seams used

| Seam | Purpose |
|---|---|
| `ctx.sessionQuery` | list sessions, read decoded event streams |
| `ctx.storage` (json backend, kv) | persist the price table under `$DSH_HOME/storages` |
| `ctx.webServer` | register `/api/npm-usage/*` |
| `ctx.timer` | periodic reconcile and live debouncing |
| `settings.section` slot | mount the settings section |
| `Modal` from `@deepseek-ai/dsh-client-ui-primitives` | metric detail dialog (falls back to a self-drawn overlay when absent) |

Only documented public services. No internal implementation details, and no direct reads of `$DSH_HOME/sessions`.

## Security boundaries

- Both routes require **loopback**: the socket peer and the `Host` header must both be loopback, and `Sec-Fetch-Site: cross-site` is rejected, which blocks DNS rebinding.
- The write route (saving prices) additionally requires a per-process token handed out by `GET /pricing`, which a cross-origin page cannot read.
- Responses contain usage numbers, model identifiers and session IDs (UUIDs). They do **not** contain prompts, reply bodies, session titles or workspace paths.

## Known limitations

- **Cost is an estimate** from the built-in or manual price table, not a provider invoice. Cache read/write and reasoning follow whichever buckets the upstream reports.
- An interrupted upstream request may carry only `assistant/chunk` usage with no final `assistant/message`; the chunk usage is kept. If the upstream reports no usage event at all, tokens cannot be recovered precisely from reply content.
- Sessions lacking `request/header` / `request/context` show their model as `unknown`; the plugin never infers a model from a provider name.
- The panel body is Chinese-only; only the settings nav label is localized.
- Every session the host lists is counted, not just registered workspaces.

## License

MIT
