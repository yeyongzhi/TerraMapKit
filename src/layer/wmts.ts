export interface WmtsLayerDescription { identifier: string; title: string; styles: string[]; formats: string[]; tileMatrixSets: string[]; tileTemplate: string | undefined }
/** Browser-only WMTS metadata parser. Projection and matrix label choice stays explicit. */
export function parseWmtsCapabilities(xml: string): readonly WmtsLayerDescription[] {
  if (typeof xml !== 'string' || !xml.trim() || xml.length > 2000000) throw new TypeError('Expected WMTS XML up to 2 MB')
  if (typeof DOMParser === 'undefined') throw new Error('DOMParser is required')
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length || document.getElementsByTagNameNS('*', 'parsererror').length) throw new TypeError('Malformed WMTS XML')
  const children = (parent: Element, name: string) => Array.from(parent.children).filter(c => c.localName === name)
  const result = Array.from(document.getElementsByTagNameNS('*', 'Layer')).map(layer => {
    const identifier = children(layer, 'Identifier')[0]?.textContent?.trim()
    if (!identifier) throw new TypeError('WMTS layer identifier is required')
    return { identifier, title: children(layer, 'Title')[0]?.textContent?.trim() ?? identifier, styles: children(layer, 'Style').map(s => children(s, 'Identifier')[0]?.textContent?.trim() ?? '').filter(Boolean), formats: children(layer, 'Format').map(s => s.textContent?.trim() ?? '').filter(Boolean), tileMatrixSets: children(layer, 'TileMatrixSetLink').map(s => children(s, 'TileMatrixSet')[0]?.textContent?.trim() ?? '').filter(Boolean), tileTemplate: children(layer, 'ResourceURL').find(s => s.getAttribute('resourceType') === 'tile')?.getAttribute('template') ?? undefined }
  })
  if (!result.length || result.length > 1000) throw new RangeError('WMTS capabilities must describe 1–1000 layers')
  return result
}
