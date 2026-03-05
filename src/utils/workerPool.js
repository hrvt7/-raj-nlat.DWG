// ─── DXF Parser Worker Pool ────────────────────────────────────────────────
// Bounded pool of Web Workers for parallel DXF parsing.
// Prevents memory issues: max N concurrent workers (N = CPU cores / 2, max 4).
// FIFO queue for excess tasks.

let _instance = null

export class DxfParserPool {
  constructor() {
    this.maxWorkers = Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2)))
    this.workers = []
    this.idle = []
    this.queue = []        // FIFO: [{taskId, dxfText, resolve, reject}]
    this.pending = new Map() // taskId → {resolve, reject}
    this._nextId = 0

    for (let i = 0; i < this.maxWorkers; i++) {
      this._createWorker()
    }
  }

  _createWorker() {
    const w = new Worker(
      new URL('../workers/dxfParser.worker.js', import.meta.url),
      { type: 'module' }
    )
    w._poolId = this.workers.length
    w.onmessage = (e) => this._onMessage(w, e)
    w.onerror = (e) => this._onError(w, e)
    this.workers.push(w)
    this.idle.push(w)
  }

  /**
   * Parse a DXF text string. Returns a Promise with the parse result.
   * If all workers are busy, the task is queued (FIFO).
   * @param {string} dxfText - Raw DXF file content
   * @param {function} [onProgress] - Optional progress callback (pct: 0-100)
   * @returns {Promise<Object>} Parsed DXF data (blocks, lengths, layers, etc.)
   */
  parse(dxfText, onProgress) {
    return new Promise((resolve, reject) => {
      const taskId = `pool_${++this._nextId}`
      const task = { taskId, dxfText, resolve, reject, onProgress }

      if (this.idle.length > 0) {
        this._dispatch(this.idle.pop(), task)
      } else {
        this.queue.push(task)
      }
    })
  }

  _dispatch(worker, task) {
    worker._currentTask = task.taskId
    this.pending.set(task.taskId, task)
    worker.postMessage({ type: 'parse', text: task.dxfText })
  }

  _onMessage(worker, e) {
    const { type, data, pct, message } = e.data
    const taskId = worker._currentTask
    const task = this.pending.get(taskId)

    if (type === 'progress' && task?.onProgress) {
      task.onProgress(pct)
      return
    }

    if (type === 'result') {
      this.pending.delete(taskId)
      worker._currentTask = null
      task?.resolve(data)
      this._next(worker)
      return
    }

    if (type === 'error') {
      this.pending.delete(taskId)
      worker._currentTask = null
      task?.reject(new Error(message || 'DXF parse error'))
      this._next(worker)
      return
    }
  }

  _onError(worker, e) {
    const taskId = worker._currentTask
    const task = this.pending.get(taskId)
    if (task) {
      this.pending.delete(taskId)
      task.reject(new Error(e.message || 'Worker error'))
    }
    worker._currentTask = null
    this._next(worker)
  }

  _next(worker) {
    if (this.queue.length > 0) {
      this._dispatch(worker, this.queue.shift())
    } else {
      this.idle.push(worker)
    }
  }

  /**
   * Get pool status for UI display
   */
  get status() {
    return {
      maxWorkers: this.maxWorkers,
      idle: this.idle.length,
      active: this.maxWorkers - this.idle.length,
      queued: this.queue.length,
    }
  }

  /**
   * Terminate all workers (cleanup)
   */
  terminate() {
    for (const w of this.workers) w.terminate()
    this.workers = []
    this.idle = []
    this.queue = []
    this.pending.clear()
    _instance = null
  }
}

/**
 * Singleton accessor — always use this, not `new DxfParserPool()`
 */
export function getDxfParserPool() {
  if (!_instance) _instance = new DxfParserPool()
  return _instance
}
