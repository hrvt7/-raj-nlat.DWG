/**
 * localStorage concurrency guard — optimistic version-checked read-modify-write.
 *
 * Problem: Two browser tabs sharing the same localStorage can both read the
 * same state, mutate independently, and the later write silently overwrites
 * the earlier one (lost update).
 *
 * Solution: A monotonic version counter stored in a companion key (`<key>__v`).
 * Before writing, the version is re-checked; if another tab incremented it
 * between the initial read and the write, the mutation is retried against
 * fresh state.
 *
 * Remaining race window: Two tabs that read the *same* __v value within the
 * same sub-millisecond JS turn can still both proceed.  In practice this
 * reduces the conflict window from ~milliseconds (the old read-modify-write
 * gap) to ~microseconds (a single getItem + integer comparison).
 *
 * @module lsConcurrency
 */

/**
 * Perform a version-checked read-modify-write on a localStorage key.
 *
 * @param {string}   key         localStorage data key
 * @param {*}        fallback    value returned when key is absent or unparseable
 * @param {function} mutate      (currentData) => newData — should be side-effect-free
 * @param {function} writeFn     (newData) => void — performs the actual persistence
 * @param {number}   [maxRetries=3] attempts before forcing a best-effort write
 * @returns {*}      the mutated data that was written
 */
export function guardedWrite(key, fallback, mutate, writeFn, maxRetries = 3) {
  const vKey = key + '__v'
  let last

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 1. Snapshot version
    const v1 = localStorage.getItem(vKey) || '0'

    // 2. Read current data
    let data
    try {
      const raw = localStorage.getItem(key)
      data = raw !== null ? JSON.parse(raw) : fallback
    } catch {
      data = fallback
    }

    // 3. Apply mutation
    last = mutate(data)

    // 4. Re-check version — if changed, another tab wrote in between
    const v2 = localStorage.getItem(vKey) || '0'
    if (v1 !== v2 && attempt < maxRetries) continue // conflict → retry

    // 5. Write data, then bump version
    writeFn(last)
    try {
      localStorage.setItem(vKey, String((parseInt(v2, 10) || 0) + 1))
    } catch { /* version bump failure is non-fatal */ }
    return last
  }

  // Unreachable in practice — the loop always writes on the last attempt.
  return last
}
