import { Cartesian2, Cartesian3, SceneMode, SceneTransforms, createGuid, type Viewer } from 'cesium'
import { CoordinateKit, type DegreesPoint } from '../coordinate/index.js'
import { assertViewer, finite, render } from '../internal/index.js'

export interface PopupOptions {
  id?: string
  position: DegreesPoint
  content: string | HTMLElement
  offset?: { x: number; y: number }
}
export interface PopupHandle {
  readonly id: string
  readonly element: HTMLElement
  update(options: Omit<PopupOptions, 'id'>): void
  setVisible(visible: boolean): void
  remove(): boolean
}

/** DOM overlay; strings are plain text, supplied elements are cloned. */
export class PopupKit {
  private disposed = false
  private readonly popups = new Map<string, { handle: PopupHandle; updateFrame: () => void }>()
  private offRender: (() => void) | undefined
  constructor(private readonly viewer: Viewer) {
    this.assertActive()
    if (!viewer.container?.ownerDocument) throw new Error('PopupKit requires a browser Viewer container')
  }
  private assertActive(): void { assertViewer(this.viewer, this.disposed, 'PopupKit') }
  addPopup(options: PopupOptions): PopupHandle {
    this.assertActive()
    const id = options.id ?? createGuid()
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('id must be non-empty')
    if (this.popups.has(id)) throw new Error(`Duplicate popup id: ${id}`)
    const document = this.viewer.container.ownerDocument
    const element = document.createElement('div')
    element.className = 'terra-map-popup'
    element.setAttribute('role', 'status')
    Object.assign(element.style, { position: 'absolute', zIndex: '10', transform: 'translate(-50%, -100%)', padding: '10px 14px', background: '#14243a', color: '#fff', border: '1px solid #557699', borderRadius: '8px', maxWidth: '320px', whiteSpace: 'pre-wrap', visibility: 'hidden' })
    let position = CoordinateKit.fromDegrees(options.position.longitude, options.position.latitude, options.position.height)
    let offset = { x: 0, y: -12 }, visible = true, removed = false
    const validate = (input: Omit<PopupOptions, 'id'>) => {
      const p = CoordinateKit.fromDegrees(input.position.longitude, input.position.latitude, input.position.height)
      const o = { x: finite(input.offset?.x ?? 0, 'offset.x'), y: finite(input.offset?.y ?? -12, 'offset.y') }
      const ElementType = document.defaultView?.HTMLElement
      if (typeof input.content !== 'string' && (!ElementType || !(input.content instanceof ElementType))) throw new TypeError('content must be text or an HTMLElement from the container document')
      const content = typeof input.content === 'string' ? document.createTextNode(input.content) : input.content.cloneNode(true)
      return { p, o, content }
    }
    const updateFrame = () => {
      if (removed || this.viewer.isDestroyed()) return
      const scene = this.viewer.scene
      const screen = SceneTransforms.worldToWindowCoordinates(scene, position, new Cartesian2())
      const canvas = scene.canvas, rect = canvas.getBoundingClientRect(), containerRect = this.viewer.container.getBoundingClientRect()
      let behind = false
      if (scene.mode === SceneMode.SCENE3D && scene.globe) {
        // Intersect the camera-to-anchor segment with the unit sphere in scaled ellipsoid space.
        const ellipsoid = scene.globe.ellipsoid
        const eye = ellipsoid.transformPositionToScaledSpace(this.viewer.camera.positionWC)
        const anchor = ellipsoid.transformPositionToScaledSpace(position)
        const direction = Cartesian3.subtract(anchor, eye, new Cartesian3())
        const a = Cartesian3.dot(direction, direction), b = 2 * Cartesian3.dot(eye, direction), c = Cartesian3.dot(eye, eye) - 1
        const discriminant = b * b - 4 * a * c
        if (a > 0 && discriminant > 0) {
          const t = (-b - Math.sqrt(discriminant)) / (2 * a)
          behind = t > 0 && t < 1 - 1e-7
        }
      }
      const show = visible && screen && !behind && screen.x >= 0 && screen.y >= 0 && screen.x <= rect.width && screen.y <= rect.height
      element.style.visibility = show ? 'visible' : 'hidden'
      if (show) {
        element.style.left = `${screen.x + rect.left - containerRect.left + this.viewer.container.scrollLeft - this.viewer.container.clientLeft + offset.x}px`
        element.style.top = `${screen.y + rect.top - containerRect.top + this.viewer.container.scrollTop - this.viewer.container.clientTop + offset.y}px`
      }
    }
    const update = (input: Omit<PopupOptions, 'id'>) => {
      this.assertActive(); if (removed) throw new Error('Popup was removed')
      const next = validate(input)
      position = next.p; offset = next.o; element.replaceChildren(next.content); render(this.viewer)
    }
    update(options)
    const handle: PopupHandle = Object.freeze({ id, element, update,
      setVisible: (value: boolean) => { this.assertActive(); if (removed) throw new Error('Popup was removed'); if (typeof value !== 'boolean') throw new TypeError('visible must be boolean'); visible = value; if (!value) element.style.visibility = 'hidden'; render(this.viewer) },
      remove: () => this.removePopup(handle)
    })
    this.viewer.container.appendChild(element)
    this.popups.set(id, { handle, updateFrame })
    if (!this.offRender) this.offRender = this.viewer.scene.postRender.addEventListener(() => {
      for (const popup of this.popups.values()) popup.updateFrame()
    })
    // Removal state is also reflected by map membership for retained handles.
    const originalUpdate = updateFrame
    this.popups.get(id)!.updateFrame = () => { removed = !this.popups.has(id); if (!removed) originalUpdate() }
    render(this.viewer)
    return handle
  }
  getPopup(id: string): PopupHandle | undefined { this.assertActive(); return this.popups.get(id)?.handle }
  removePopup(idOrHandle: string | PopupHandle): boolean {
    const id = typeof idOrHandle === 'string' ? idOrHandle : idOrHandle.id, popup = this.popups.get(id)
    if (!popup || typeof idOrHandle !== 'string' && popup.handle !== idOrHandle) return false
    this.popups.delete(id); popup.updateFrame(); popup.handle.element.remove()
    if (this.popups.size === 0) { this.offRender?.(); this.offRender = undefined }
    render(this.viewer); return true
  }
  clear(): void { for (const id of [...this.popups.keys()]) this.removePopup(id) }
  dispose(): void { if (!this.disposed) { this.clear(); this.disposed = true } }
}
