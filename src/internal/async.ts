/** Cancels observation, not necessarily the underlying Cesium network request. */
export class AsyncOperations {
  private readonly controllers = new Set<AbortController>()
  private disposed = false
  async run<T>(operation: PromiseLike<T>, signal?: AbortSignal, timeoutMs = 30000, late?: (value: T) => void): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) { void Promise.resolve(operation).catch(() => {}); throw new RangeError('timeoutMs must be 1–300000') }
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason ?? new Error('Operation cancelled'))
    this.controllers.add(controller)
    if (this.disposed) controller.abort(new Error('Owner disposed'))
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => controller.abort(new Error('Operation timed out')), timeoutMs)
    let off: (() => void) | undefined
    const observed = Promise.resolve(operation).then(value => { if (controller.signal.aborted) late?.(value); return value })
    try {
      return await Promise.race([observed, new Promise<never>((_resolve, reject) => {
        off = () => reject(controller.signal.reason)
        if (controller.signal.aborted) off(); else controller.signal.addEventListener('abort', off, { once: true })
      })])
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort)
      if (off) controller.signal.removeEventListener('abort', off)
      this.controllers.delete(controller)
    }
  }
  dispose(): void { this.disposed = true; for (const controller of this.controllers) controller.abort(new Error('Owner disposed')); this.controllers.clear() }
}
