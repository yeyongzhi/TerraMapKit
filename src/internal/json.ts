export type JSONValue = null | boolean | number | string | readonly JSONValue[] | { readonly [key: string]: JSONValue }
export function copyJSON(value: unknown, frozen = false, ancestors = new Set<object>(), depth = 0): JSONValue {
  if (depth > 32) throw new RangeError('JSON metadata exceeds 32 levels')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (!value || typeof value !== 'object') throw new TypeError('Properties must contain JSON values')
  if (ancestors.has(value)) throw new TypeError('Circular JSON properties')
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError('Properties must be plain JSON objects')
  ancestors.add(value)
  let result: JSONValue
  if (Array.isArray(value)) result = Array.from(value, child => copyJSON(child, frozen, ancestors, depth + 1))
  else {
    const object: Record<string, JSONValue> = {}
    for (const [key, child] of Object.entries(value)) Object.defineProperty(object, key, { value: copyJSON(child, frozen, ancestors, depth + 1), enumerable: true, writable: true, configurable: true })
    result = object
  }
  ancestors.delete(value)
  return frozen ? Object.freeze(result) : result
}
