/**
 * Model display-name resolution for routing aliases.
 *
 * Some providers expose models under opaque route keys instead of real model
 * names. Qoder does this: the durable log records `{provider:"qoder",
 * model:"qfmodel"}`, while the actual model behind that route is
 * `Qwen3.8-Flash`. The route key is what the host writes into `request/header`
 * and what the upstream expects back, so it cannot be replaced at the source
 * without breaking the request — the real name only exists in the plugin's own
 * discovery catalog.
 *
 * This module reads that catalog so the panel can label a call with the model
 * it actually ran. It changes DISPLAY ONLY: grouping, totals and pricing keep
 * using the route key, so relabelling can never move a request between rows or
 * change what is counted.
 *
 * The catalog is another plugin's private cache file, not a published seam.
 * Everything here is therefore written to fail closed: a missing file, an
 * unexpected shape, an unreadable directory or an ambiguous mapping all resolve
 * to "no alias", which leaves the original route key on screen rather than
 * guessing.
 */

import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Only files whose name ends in `-catalog.json` are considered. The same
// directory holds `.qoder-probe.json` and `.qoder-host-heartbeat.json` (which
// carries a pid), and both also start with `version: 1` — the name filter keeps
// them out before the structural check even runs.
const CATALOG_SUFFIX = '-catalog.json'

// An alias worth showing must differ from the route key, and a display name
// this long is not a model name — it guards against a catalog that has been
// repurposed to carry prose.
const MAX_ALIAS_LENGTH = 64
const MAX_NAME_LENGTH = 120

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * The DSH home, honouring the same override the harness itself documents
 * (`$DSH_HOME`, then `~/.dsh`). A blank value counts as unset so it can never
 * resolve the home to the current working directory.
 */
export function resolveDshHome(env = process.env) {
  const configured = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  if (configured !== '') return configured
  const home = typeof env.HOME === 'string' && env.HOME.trim() !== ''
    ? env.HOME
    : (homedir?.() ?? '')
  if (home === '') return null
  return join(home, '.dsh')
}

/** Every profile's Qoder catalog path, across all profiles under the home. */
export async function findCatalogFiles(home) {
  if (typeof home !== 'string' || home === '') return []
  const profilesRoot = join(home, 'profiles')
  let profiles
  try {
    profiles = await readdir(profilesRoot, { withFileTypes: true })
  } catch {
    return []
  }
  const paths = []
  for (const entry of profiles) {
    if (!entry.isDirectory()) continue
    // A leading dot marks plugin-owned state directories, which is exactly
    // where the catalog lives; they are skipped by ordinary listing helpers.
    const stateDir = join(profilesRoot, entry.name, '.dsh-qoder-connect', 'state')
    let files
    try {
      files = await readdir(stateDir)
    } catch {
      continue
    }
    for (const file of files) {
      if (file.endsWith(CATALOG_SUFFIX)) paths.push(join(stateDir, file))
    }
  }
  return paths
}

/**
 * Pull `id -> name` out of one catalog file's parsed contents.
 *
 * Shape: `{version: 1, entries: {"pat:<hash>": {models: [{id, name, ...}]}}}`.
 * Entries are keyed per account and each holds a `pat:` identifier; only the
 * model rows are read out, so no account material can reach a caller.
 *
 * Returns null when the file is not a catalog at all, which is how the
 * structural check rejects unrelated JSON that happens to sit in the directory.
 */
export function parseCatalogFile(contents) {
  if (!isRecord(contents) || contents.version !== 1) return null
  if (!isRecord(contents.entries)) return null
  const rows = []
  let sawAnyEntry = false
  for (const account of Object.values(contents.entries)) {
    if (!isRecord(account)) continue
    if (!Array.isArray(account.models)) continue
    sawAnyEntry = true
    const fetchedAt = Number.isFinite(account.fetchedAtMs) ? account.fetchedAtMs : 0
    for (const model of account.models) {
      if (!isRecord(model)) continue
      const id = nonEmptyString(model.id)
      const name = nonEmptyString(model.name)
      if (id === null || name === null) continue
      if (id.length > MAX_ALIAS_LENGTH || name.length > MAX_NAME_LENGTH) continue
      rows.push({ id, name, fetchedAt })
    }
  }
  // `entries` present but no usable model rows is not a catalog we understand.
  return sawAnyEntry ? rows : null
}

/**
 * Merge rows from every catalog into one lookup.
 *
 * The freshest fetch wins per id. Two ids that disagree on the same name with
 * equal freshness is an ambiguous mapping, and an ambiguous mapping is dropped:
 * showing the wrong real model is worse than showing the route key.
 */
export function buildAliasMap(catalogs) {
  // id -> {name, fetchedAt}
  const best = new Map()
  const ambiguous = new Set()
  for (const rows of catalogs) {
    for (const row of rows) {
      const current = best.get(row.id)
      if (current === undefined) {
        best.set(row.id, { name: row.name, fetchedAt: row.fetchedAt })
        continue
      }
      if (current.name === row.name) {
        if (row.fetchedAt > current.fetchedAt) current.fetchedAt = row.fetchedAt
        continue
      }
      if (row.fetchedAt > current.fetchedAt) {
        // A newer fetch replaced the label; the older one is simply stale.
        best.set(row.id, { name: row.name, fetchedAt: row.fetchedAt })
        ambiguous.delete(row.id)
        continue
      }
      if (row.fetchedAt === current.fetchedAt) ambiguous.add(row.id)
    }
  }
  const map = new Map()
  for (const [id, entry] of best) {
    if (ambiguous.has(id)) continue
    // A name that adds no information is dropped. The comparison is
    // case-insensitive on purpose: Qoder's `auto -> Auto` differs only in
    // capitalisation, and relabelling `auto` as `Auto` is not a real model
    // name - it just hides a key that was already readable.
    if (entry.name.toLowerCase() === id.toLowerCase()) continue
    map.set(id, entry.name)
  }
  return map
}

/**
 * Read every catalog and return `routeKey -> displayName`.
 *
 * Never throws: an unreadable home yields an empty map, so a machine without
 * the Qoder plugin behaves exactly like one with no aliases at all.
 */
export async function loadModelAliases(options = {}) {
  const home = options.home ?? resolveDshHome(options.env ?? process.env)
  const paths = options.paths ?? await findCatalogFiles(home)
  const read = options.readFile ?? readFile
  // Carry the path alongside the rows so `sources` needs no second read: a
  // re-read would race with the owning plugin rewriting the file, and the
  // answer would then disagree with the rows already in hand.
  const catalogs = await Promise.all(paths.map(async (path) => {
    try {
      const text = await read(path, 'utf8')
      const rows = parseCatalogFile(JSON.parse(text))
      return rows === null ? null : { path, rows }
    } catch {
      // Absent, unparseable or an unexpected shape: this file contributes nothing.
      return null
    }
  }))
  const usable = catalogs.filter((entry) => entry !== null && entry.rows.length > 0)
  return {
    aliases: buildAliasMap(usable.map((entry) => entry.rows)),
    // Which files actually contributed, so the panel can say where a name came
    // from and a stale path stays discoverable in the UI.
    sources: usable.map((entry) => entry.path),
    filesFound: paths.length,
  }
}

/** A resolver that returns the display name for a route key, or null. */
export function createAliasResolver(initial) {
  let aliases = initial instanceof Map ? initial : new Map()
  return {
    replace(next) {
      aliases = next instanceof Map ? next : new Map()
    },
    size() {
      return aliases.size
    },
    /**
     * Resolve one model id by exact match, case-insensitively.
     *
     * Deliberately not matching the trailing segment of a namespaced id. The
     * catalog carries no provider field, so `vendor/dmodel` matching the Qoder
     * key `dmodel` would label another vendor's model with a Qoder name - a
     * wrong label on screen, which is the one outcome this whole module exists
     * to avoid. Qoder logs its route keys bare, so dropping the tail match
     * costs no real resolution; verified against the live model rows.
     */
    resolve(modelId) {
      if (typeof modelId !== 'string' || modelId === '') return null
      const trimmed = modelId.trim()
      const exact = aliases.get(trimmed)
      if (exact !== undefined) return exact
      return aliases.get(trimmed.toLowerCase()) ?? null
    },
  }
}
