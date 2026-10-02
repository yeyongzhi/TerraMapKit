import { Viewer } from 'cesium'

/**
 * Creates a native Cesium Viewer without overriding its constructor options.
 * The application supplies Widgets CSS and Cesium static resources and owns
 * the returned Viewer (call viewer.destroy() when it is no longer needed).
 * Requires a browser with DOM and WebGL; importing this module is safe in Node.
 * Invalid containers/options retain Cesium's native errors.
 */
export function createMap(
  container: string | HTMLElement,
  options?: Viewer.ConstructorOptions
): Viewer {
  return new Viewer(container, options)
}

/** The static entry point shares exactly the same implementation as createMap. */
export class MapKit {
  static readonly createMap = createMap
}
