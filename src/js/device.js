// device.js — Detección de dispositivos de baja potencia ("low-end").
//
// "Low-end" = pocos núcleos de CPU o poca RAM, según las señales (aproximadas)
// que expone el navegador. Se usa para cargar assets livianos (videos -mobile)
// y suavizar efectos (bloom) en computadoras viejas donde el recorrido se traba.
//
// Las señales son heurísticas, no exactas:
//   navigator.hardwareConcurrency → núcleos lógicos de CPU. Casi siempre presente
//     (Safari lo capa a un máximo, pero igual sirve para distinguir flojas).
//   navigator.deviceMemory → RAM aprox en GB (0.25..8). SOLO Chromium; en
//     Safari/Firefox es undefined → en ese caso NO lo contamos en contra para
//     no penalizar a navegadores que no lo exponen.

function _detectLowEnd() {
  const cores = navigator.hardwareConcurrency || 8   // sin dato → asumimos buena
  const ram   = navigator.deviceMemory               // GB, o undefined
  const fewCores = cores <= 4
  const lowRam   = ram !== undefined && ram <= 4
  return fewCores || lowRam
}

// Pantalla chica (celular/tablet en vertical).
export const IS_MOBILE_VIEWPORT = window.matchMedia('(max-width: 768px)').matches

// PC/notebook de baja potencia (independiente del tamaño de pantalla).
export const IS_LOW_END = _detectLowEnd()

// Override manual por URL para testear/comparar:
//   ?lite=1 → fuerza modo lite (bloom a media res + videos -mobile)
//   ?lite=0 → fuerza modo normal (aunque sea mobile/low-end)
// Sin el parámetro, decide solo (mobile || low-end).
function _liteOverride() {
  const p = new URLSearchParams(window.location.search).get('lite')
  if (p === '1' || p === 'true')  return true
  if (p === '0' || p === 'false') return false
  return null
}

// Modo "lite": cargar assets livianos y bajar efectos.
// Vale tanto para mobile como para una PC floja.
const _override = _liteOverride()
export const USE_LITE_MODE = _override !== null
  ? _override
  : (IS_MOBILE_VIEWPORT || IS_LOW_END)
