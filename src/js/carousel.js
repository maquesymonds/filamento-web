// carousel.js — 3D ring carousel attached to FLOR_GRANDE trunk
// Material: MeshPhysicalMaterial con imagen (map) + texto glitch (emissiveMap)
// Fondo: imagen real si item.image existe, sino canvas procedural por paleta

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import gsap from 'gsap'
import { CONFIG } from './config.js'
import { getNodeByName, getScene } from './experience.js'
import { sheet } from './theatre.js'
import { types } from '@theatre/core'

const _loader     = new THREE.TextureLoader()
const CARD_DEPTH  = 0.02   // physical thickness of each card
const _phosTex    = _loader.load('/images/Phos.webp')

let _group       = null
let _cards       = []
let _activeIndex = 0
let _visible     = false
let _n           = 0

// Tuning state — driven by Theatre panel
let _scaleActive   = 1.0
let _scaleInactive = 1.0
let _baseScaleX    = 1.0
let _baseScaleY    = 1.0

// Returns the front-face material (index 4 for BoxGeometry, or the material itself)
function _getFrontMat(mesh) {
  return Array.isArray(mesh.material) ? mesh.material[4] : mesh.material
}

let _glitchOffset    = 10
let _glitchIntensity = 0.65
let _borderRadius    = 48
let _borderOpacity   = 0.45
let _cardRadius      = 0.08   // 3D geometry corner radius

// Spiral helix
let _yStep = 0.15  // vertical gap between each card
let _xTilt = 0.0   // tilt each card to follow the helix slope

// Angle (radians) at which the camera faces the ring — used as the "front" reference.
// Card that currently faces camera on arrival = index 2 ("03"), so offset = (2/6)*2π.
let _frontAngle = (2 / 6) * Math.PI * 2

// Base position de FLOR_GRANDE en world space — calculada en initCarousel
const _basePos = new THREE.Vector3()

// ── Init ──────────────────────────────────────────────────────────────────────

export function initCarousel() {
  const cfg   = CONFIG.carousel
  const trunk = getNodeByName(cfg.trunkNode)

  if (!trunk) {
    console.warn('[Carousel] Nodo no encontrado:', cfg.trunkNode, '— disponibles:', window.__filamentoNodes)
    return
  }

  // Transforms bakeados en vértices → getWorldPosition da 0,0,0.
  // Usamos el centro del bounding box para encontrar la posición visual real.
  new THREE.Box3().setFromObject(trunk).getCenter(_basePos)
  console.log('[Carousel] FLOR_GRANDE center →', _basePos.x.toFixed(2), _basePos.y.toFixed(2), _basePos.z.toFixed(2))

  _n     = cfg.items.length
  _group = new THREE.Group()
  _group.position.set(
    _basePos.x + (cfg.xOffset ?? 0),
    _basePos.y + cfg.yOffset,
    _basePos.z + (cfg.zOffset ?? 0),
  )
  _group.rotation.y = _frontAngle   // card 0 starts facing the camera

  for (let i = 0; i < _n; i++) {
    const angle = (i / _n) * Math.PI * 2
    const x     = Math.sin(angle) * cfg.radius
    const y     = (i - (_n - 1) / 2) * _yStep   // centered vertically around 0
    const z     = Math.cos(angle) * cfg.radius

    const mats = _makeCardMaterials(cfg.items[i], cfg.cardWidth, cfg.cardHeight)

    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(cfg.cardWidth, cfg.cardHeight, CARD_DEPTH, 6, _cardRadius),
      mats
    )

    mesh.position.set(x, y, z)
    mesh.rotation.y = angle
    mesh.rotation.x = _xTilt
    mesh.userData.cardIndex = i
    mesh.renderOrder = 2

    _cards.push(mesh)
    _group.add(mesh)
  }

  // Agregar a la escena directamente (no como hijo de FLOR_GRANDE)
  // para posicionar en world space con los controles de Theatre.js
  getScene().add(_group)
  _visible = true
  _updateScales()

  // ── Theatre.js — Carousel Ring ──────────────────────────────────
  const obj = sheet.object('Carousel Ring', {

    // Layout — posición world space
    xOffset:       types.number(cfg.xOffset ?? 0, { range: [-30, 30], nudgeMultiplier: 0.1 }),
    yOffset:       types.number(cfg.yOffset,       { range: [-20, 20], nudgeMultiplier: 0.1 }),
    zOffset:       types.number(cfg.zOffset ?? 0,  { range: [-30, 30], nudgeMultiplier: 0.1 }),
    radio:         types.number(cfg.radius,        { range: [0.01, 10], nudgeMultiplier: 0.02 }),
    tamano:        types.number(1.0, { range: [0.1, 5.0], nudgeMultiplier: 0.02 }),
    proporcionX:   types.number(1.0, { range: [0.2, 3.0], nudgeMultiplier: 0.02 }),
    proporcionY:   types.number(1.0, { range: [0.2, 3.0], nudgeMultiplier: 0.02 }),
    scaleActivo:   types.number(1.0, { range: [0.5, 2.5], nudgeMultiplier: 0.01 }),
    scaleInactivo: types.number(1.0, { range: [0.2, 2.0], nudgeMultiplier: 0.01 }),

    // Material vidrio
    opacidad:     types.number(1.0,  { range: [0, 1],   nudgeMultiplier: 0.01 }),
    transmission: types.number(1.0,  { range: [0, 1],   nudgeMultiplier: 0.01 }),
    roughness:    types.number(0.05, { range: [0, 1],   nudgeMultiplier: 0.01 }),
    clearcoat:    types.number(0.0,  { range: [0, 1],   nudgeMultiplier: 0.01 }),
    brillo:       types.number(0.6,  { range: [0, 3],   nudgeMultiplier: 0.05 }),

    // Spiral helix
    yStep:         types.number(0.15, { range: [0, 3],      nudgeMultiplier: 0.02 }),
    xTilt:         types.number(0.0,  { range: [-0.6, 0.6], nudgeMultiplier: 0.01 }),
    anguloInicial: types.number(120,  { range: [0, 360],    nudgeMultiplier: 1    }),

    // Chromatic aberration + borde
    glitchOffset:    types.number(10,   { range: [0, 40],  nudgeMultiplier: 0.5  }),
    glitchIntensity: types.number(0.65, { range: [0, 1],   nudgeMultiplier: 0.01 }),
    borderRadius:    types.number(48,   { range: [0, 120], nudgeMultiplier: 1    }),
    borderOpacity:   types.number(0.45, { range: [0, 1],   nudgeMultiplier: 0.01 }),

    // 3D geometry corner radius
    cornerRadius: types.number(0.08, { range: [0, 0.25], nudgeMultiplier: 0.005 }),

  })

  obj.onValuesChange((v) => {

    // Layout — offset relativo a la posición real de FLOR_GRANDE
    _group.position.set(
      _basePos.x + v.xOffset,
      _basePos.y + v.yOffset,
      _basePos.z + v.zOffset,
    )
    const r = Math.max(0.1, v.radio)
    _yStep = v.yStep
    _xTilt = v.xTilt
    _frontAngle = (v.anguloInicial / 180) * Math.PI
    _group.rotation.y = _frontAngle
    _cards.forEach((mesh, i) => {
      const angle = (i / _n) * Math.PI * 2
      const x = Math.sin(angle) * r
      const y = (i - (_n - 1) / 2) * _yStep
      const z = Math.cos(angle) * r
      mesh.position.set(x, y, z)
      mesh.rotation.y = angle
      mesh.rotation.x = _xTilt
    })

    // Escalas
    _scaleActive   = v.scaleActivo
    _scaleInactive = v.scaleInactivo
    _baseScaleX    = v.tamano * v.proporcionX
    _baseScaleY    = v.tamano * v.proporcionY
    _updateScales(true)

    // Material — only update the front face
    _cards.forEach(mesh => {
      const m = _getFrontMat(mesh)
      m.opacity           = v.opacidad
      m.transmission      = v.transmission
      m.roughness         = v.roughness
      m.clearcoat         = v.clearcoat
      m.emissiveIntensity = v.brillo
    })

    // Regen emissive si cambia el glitch o borde
    const needsRegen =
      _glitchOffset    !== v.glitchOffset    ||
      _glitchIntensity !== v.glitchIntensity ||
      _borderRadius    !== v.borderRadius    ||
      _borderOpacity   !== v.borderOpacity

    if (needsRegen) {
      _glitchOffset    = v.glitchOffset
      _glitchIntensity = v.glitchIntensity
      _borderRadius    = v.borderRadius
      _borderOpacity   = v.borderOpacity
      _refreshEmissiveMaps()
    }

    // Regen 3D geometry si cambia cornerRadius
    if (v.cornerRadius !== _cardRadius) {
      _cardRadius = v.cornerRadius
      const cfg2  = CONFIG.carousel
      _cards.forEach(mesh => {
        mesh.geometry.dispose()
        mesh.geometry = new RoundedBoxGeometry(cfg2.cardWidth, cfg2.cardHeight, CARD_DEPTH, 6, _cardRadius)
      })
    }
  })

  console.log('[Carousel] Inicializado —', _n, 'cards en', cfg.trunkNode)
}

// ── API pública ───────────────────────────────────────────────────────────────

export function showCarousel() {
  if (!_group) return
  _visible       = true
  _group.visible = true
  _cards.forEach((mesh, i) => {
    gsap.to(_getFrontMat(mesh), { opacity: 1, duration: 0.7, delay: i * 0.08, ease: 'power2.out' })
  })
  _updateScales()
}

export function hideCarousel() {
  if (!_group || !_visible) return
  _visible = false
  gsap.to(_cards.map(m => _getFrontMat(m)), {
    opacity:    0,
    duration:   0.35,
    ease:       'power2.in',
    onComplete: () => { _group.visible = false },
  })
}

export function rotateToIndex(index) {
  if (!_group) return
  _activeIndex = ((index % _n) + _n) % _n
  const targetY = _frontAngle - (_activeIndex / _n) * Math.PI * 2
  gsap.to(_group.rotation, { y: targetY, duration: 0.9, ease: 'power3.inOut' })
  _updateScales()
}

export function nextCard()       { rotateToIndex(_activeIndex + 1) }
export function prevCard()       { rotateToIndex(_activeIndex - 1) }
export function isVisible()      { return _visible }
export function getActiveIndex() { return _activeIndex }

export function rotateRing(deltaRad) {
  if (!_group) return
  _group.rotation.y += deltaRad
}

// Set ring to an absolute rotation driven by progress (0→1), synced with camera rise.
// Detects which card is currently at the front and updates active scale.
export function setRingRotationByProgress(progress, totalTurns = 1) {
  if (!_group) return

  const rot = _frontAngle + progress * Math.PI * 2 * totalTurns
  _group.rotation.y = rot

  // Which card is currently facing front (angle closest to -rot mod 2π)?
  const TAU = Math.PI * 2
  const normalised = ((rot % TAU) + TAU) % TAU
  const cardStep   = TAU / _n
  const frontIdx   = Math.round(normalised / cardStep) % _n

  if (frontIdx !== _activeIndex) {
    _activeIndex = frontIdx
    _updateScales()
  }
}

export function hitTest(raycaster) {
  if (!_group || !_visible) return -1
  const hits = raycaster.intersectObjects(_cards)
  return hits.length > 0 ? hits[0].object.userData.cardIndex : -1
}

// ── Material ──────────────────────────────────────────────────────────────────

function _makeCardMaterials(item, cardW, cardH) {
  // Same material family as florGrandeMaterial — iridescent transmission glass
  return new THREE.MeshPhysicalMaterial({
    color:                     new THREE.Color(0xffffff),
    map:                       _phosTex,
    emissive:                  new THREE.Color(0xffffff),
    emissiveIntensity:         0.5,
    emissiveMap:               _makeEmissiveMap(item, cardW, cardH),
    iridescence:               1.0,
    iridescenceIOR:            1.5,
    iridescenceThicknessRange: [100, 400],
    transmission:              0.6,
    thickness:                 0.3,
    ior:                       1.5,
    roughness:                 0.05,
    metalness:                 0.0,
    transparent:               true,
    opacity:                   1.0,
    side:                      THREE.DoubleSide,
    depthWrite:                false,
  })
}

// ── Canvas: fondo procedural ──────────────────────────────────────────────────

function _makeProceduralMap(item, cardW, cardH) {
  const W = 1024
  const H = Math.round(W / (cardW / cardH))

  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')

  const [c0, c1, c2] = item.palette ?? ['#0a0a1a', '#1a1a3a', '#050508']

  // Fondo base oscuro
  ctx.fillStyle = c2
  ctx.fillRect(0, 0, W, H)

  // Blob principal — luz difusa desde arriba izquierda
  const g1 = ctx.createRadialGradient(W * 0.25, H * 0.28, 0, W * 0.5, H * 0.5, W * 0.72)
  g1.addColorStop(0,   _hex2rgba(c0, 0.9))
  g1.addColorStop(0.5, _hex2rgba(c1, 0.4))
  g1.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, W, H)

  // Blob secundario — contraste desde abajo derecha
  const g2 = ctx.createRadialGradient(W * 0.78, H * 0.75, 0, W * 0.6, H * 0.6, W * 0.6)
  g2.addColorStop(0,   _hex2rgba(c1, 0.7))
  g2.addColorStop(0.6, _hex2rgba(c0, 0.2))
  g2.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.fillStyle = g2
  ctx.fillRect(0, 0, W, H)

  // Manchas orgánicas para textura de fluido
  const blobs = [
    { x: 0.15, y: 0.6,  r: 0.25, c: c0, a: 0.35 },
    { x: 0.7,  y: 0.2,  r: 0.20, c: c1, a: 0.30 },
    { x: 0.5,  y: 0.85, r: 0.22, c: c1, a: 0.25 },
    { x: 0.85, y: 0.55, r: 0.18, c: c0, a: 0.28 },
  ]
  blobs.forEach(b => {
    const gb = ctx.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r * W)
    gb.addColorStop(0,   _hex2rgba(b.c, b.a))
    gb.addColorStop(1,   'rgba(0,0,0,0)')
    ctx.fillStyle = gb
    ctx.fillRect(0, 0, W, H)
  })

  // Viñeta oscura en los bordes
  const vignette = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.2, W * 0.5, H * 0.5, W * 0.75)
  vignette.addColorStop(0,   'rgba(0,0,0,0)')
  vignette.addColorStop(1,   'rgba(0,0,0,0.55)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)

  return new THREE.CanvasTexture(canvas)
}

// ── Canvas: small number only (no painted border — 3D geometry handles shape) ──

function _makeEmissiveMap(item, cardW, cardH) {
  const W = 512
  const H = Math.round(W / (cardW / cardH))

  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')

  // Fully black — emissive off everywhere except the number
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  // Small number top-left
  ctx.fillStyle    = 'rgba(255,255,255,0.85)'
  ctx.font         = `300 ${Math.round(H * 0.10)}px sans-serif`
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(item.number ?? '', 22, 18)

  return new THREE.CanvasTexture(canvas)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _refreshEmissiveMaps() {
  const cfg = CONFIG.carousel
  _cards.forEach((mesh, i) => {
    const m = _getFrontMat(mesh)
    m.emissiveMap?.dispose()
    m.emissiveMap = _makeEmissiveMap(cfg.items[i], cfg.cardWidth, cfg.cardHeight)
    m.needsUpdate = true
  })
}

function _updateScales(immediate = false) {
  _cards.forEach((mesh) => {
    if (immediate) {
      mesh.scale.set(_baseScaleX * _scaleActive, _baseScaleY * _scaleActive, 1)
    } else {
      gsap.to(mesh.scale, {
        x: _baseScaleX * _scaleActive,
        y: _baseScaleY * _scaleActive,
        duration: 0.7,
        ease: 'power2.out',
      })
    }
  })
}

// Convierte hex '#rrggbb' a 'rgba(r,g,b,a)'
function _hex2rgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function _rrect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h,     x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y,         x + r, y)
  ctx.closePath()
}
