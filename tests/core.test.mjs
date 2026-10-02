import assert from 'node:assert/strict'
import test from 'node:test'
import { createMap, MapKit } from 'terra-map-kit'
import { createMap as fromCore, MapKit as CoreKit } from 'terra-map-kit/core'

test('core can be imported without DOM and shares root/subpath exports', () => {
  assert.equal(typeof globalThis.window, 'undefined')
  assert.equal(typeof globalThis.document, 'undefined')
  assert.equal(createMap, fromCore)
  assert.equal(MapKit, CoreKit)
  assert.equal(MapKit.createMap, createMap)
})

test('invalid missing container retains the native Cesium error', () => {
  assert.throws(() => createMap(undefined), {
    name: 'DeveloperError',
    message: 'container is required.'
  })
})
