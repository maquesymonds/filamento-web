// seed.js — PRNG determinístico (mulberry32) que reemplaza Math.random con una
// semilla fija. Así todos los sistemas de puntos/partículas (y cualquier cosa que
// use random en su init) se generan SIEMPRE igual en cada carga, en vez de
// aparecer en posiciones distintas. Debe importarse PRIMERO (antes que cualquier
// módulo que use random), por eso es el primer import de main.js.

let _s = 0x9e3779b9 >>> 0   // semilla fija → layout reproducible

Math.random = function () {
  _s = (_s + 0x6D2B79F5) | 0
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
