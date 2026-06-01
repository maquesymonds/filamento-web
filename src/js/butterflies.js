// butterflies.js — Butterfly swarm that follows the camera during the journey.
// Appears on Begin click, flies in front of the camera, flies away at frame 258.

import * as THREE from 'three'
import { sheet }  from './theatre.js'
import { types }  from '@theatre/core'

const MAX_COUNT = 20   // total butterfly objects created; Theatre controls how many are active

const BASE = '/textures/butterflies/'

const TYPES = [
  { body: 'body1.webp', wing: 'wings1.webp', bW: 0.35, bH: 1.1, wW: 1.4, wH: 1.4, wX: 0.60, hue: 0.00 },
]

let _scene       = null
let _butterflies = []
let _state       = 'hidden'  // 'hidden' | 'active' | 'flying-away'
let _activeCount = 14
let _flyTimer    = 0
const FLY_DURATION = 2.2     // seconds before butterflies are hidden after fly-away

// Live-tweakable params (updated by Theatre.js onValuesChange)
let _attract    = 0.004
let _velLimit   = 0.10
let _scaleMult  = 1.0
let _mobileMult = 1.0
let _spreadH    = 1.0   // factor de dispersión horizontal (más chico en mobile)
let _spreadV    = 1.0   // factor de dispersión vertical
let _flapMult   = 0.45
let _targetDist = 18
let _driftAmp   = 3.5
let _lerpSpeed  = 0.05

// Reusable vectors
const _camDir  = new THREE.Vector3()
const _right   = new THREE.Vector3()
const _up      = new THREE.Vector3()
const _rawTgt  = new THREE.Vector3()
const _smooth  = new THREE.Vector3()
const _pTgt    = new THREE.Vector3()

// Shared materials per texture
const _loader   = new THREE.TextureLoader()
const _texCache = {}
const _matCache = {}

function _tex(name) {
  if (!_texCache[name]) {
    const t = _loader.load(BASE + name)
    t.colorSpace = THREE.SRGBColorSpace
    _texCache[name] = t
  }
  return _texCache[name]
}

// Body — plain material, slightly bright so bloom picks up a hint of glow
function _bodyMat(name) {
  if (!_matCache['body_' + name]) {
    _matCache['body_' + name] = new THREE.MeshBasicMaterial({
      map: _tex(name), transparent: true, depthWrite: false, alphaTest: 0.05, side: THREE.DoubleSide,
    })
  }
  return _matCache['body_' + name]
}

// ── Iridescent wing shader ────────────────────────────────────────────────────
// hue shifts with the angle between the wing normal and the view direction,
// so each wing-flap cycle pulses through the spectrum like a real butterfly.

const _IRID_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vUv      = uv;
    vNormal  = normalize(normalMatrix * normal);
    vec4 mv  = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const _IRID_FRAG = /* glsl */`
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uHueShift;
  uniform float uStrength;
  uniform float uBoost;
  uniform float uSpeed;
  uniform float uRange;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  vec3 hsl2rgb(float h, float s, float l) {
    h = fract(h);
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c * 0.5;
    vec3 rgb;
    if      (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
    else                   rgb = vec3(c, 0.0, x);
    return rgb + m;
  }

  void main() {
    vec4 tex = texture2D(uMap, vUv);
    if (tex.a < 0.05) discard;

    float facing = abs(dot(normalize(vNormal), normalize(vViewDir)));
    float hue    = fract(facing * uRange + uTime * uSpeed + uHueShift);
    vec3 irid    = hsl2rgb(hue, 0.9, 0.62);

    vec3 col = mix(tex.rgb, irid, uStrength);
    col *= uBoost;

    gl_FragColor = vec4(col, tex.a);
  }
`

// Shared uniforms — one object per param, all wing materials reference the same value.
// Theatre.js writes to these objects; every material sees the change immediately.
const _iridTime     = { value: 0    }
const _iridStrength = { value: 0.55 }   // iridescence blend vs original texture
const _iridBoost    = { value: 2.2  }   // emissive multiplier → drives bloom brightness
const _iridSpeed    = { value: 0.07 }   // hue animation speed
const _iridRange    = { value: 2.2  }   // how many full hue cycles across the facing angle

function _wingMat(name, hueShift) {
  const key = 'wing_' + name + '_' + hueShift
  if (!_matCache[key]) {
    _matCache[key] = new THREE.ShaderMaterial({
      uniforms: {
        uMap:      { value: _tex(name) },
        uTime:     _iridTime,
        uHueShift: { value: hueShift },
        uStrength: _iridStrength,
        uBoost:    _iridBoost,
        uSpeed:    _iridSpeed,
        uRange:    _iridRange,
      },
      vertexShader:   _IRID_VERT,
      fragmentShader: _IRID_FRAG,
      transparent:    true,
      depthWrite:     false,
      side:           THREE.DoubleSide,
    })
  }
  return _matCache[key]
}

function _rnd(max, neg = false) {
  return neg ? Math.random() * 2 * max - max : Math.random() * max
}
function _clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }

// ── Butterfly instance ────────────────────────────────────────────────────────
class Butterfly {
  constructor() {
    const t = TYPES[Math.floor(Math.random() * TYPES.length)]

    const wingMat = _wingMat(t.wing, t.hue)

    const lm = new THREE.Mesh(new THREE.PlaneGeometry(t.wW, t.wH), wingMat)
    lm.position.x = -t.wX
    lm.layers.enable(1)   // bloom layer
    this.lw = new THREE.Object3D()
    this.lw.add(lm)

    const rm = new THREE.Mesh(new THREE.PlaneGeometry(t.wW, t.wH), wingMat)
    rm.rotation.y = Math.PI
    rm.position.x = t.wX
    rm.layers.enable(1)   // bloom layer
    this.rw = new THREE.Object3D()
    this.rw.add(rm)

    const body = new THREE.Mesh(new THREE.PlaneGeometry(t.bW, t.bH), _bodyMat(t.body))
    if (t.bY) body.position.y = t.bY

    const inner = new THREE.Object3D()
    inner.add(body, this.lw, this.rw)
    inner.rotation.set(Math.PI / 2, Math.PI, 0)

    this.o3d = new THREE.Object3D()
    this.o3d.add(inner)

    this.vel       = new THREE.Vector3(_rnd(0.2, true), _rnd(0.2, true), _rnd(0.2, true))
    this.phase     = Math.random() * Math.PI * 2
    this.fspd      = 1.2 + Math.random() * 0.8
    this.baseScale = 1.0

    // Unique wandering offset — keeps each butterfly in its own personal space
    this.wPhase  = Math.random() * Math.PI * 2
    this.wFreq   = 0.12 + Math.random() * 0.18
    this.wAmpH   = 2.5  + Math.random() * 4.0   // horizontal spread
    this.wAmpV   = 1.5  + Math.random() * 2.5   // vertical spread

    // Escape direction set when flyAway is triggered
    this.flyDir  = new THREE.Vector3()
  }

  scatter(center) {
    const dir = new THREE.Vector3(_rnd(1, true), _rnd(1, true), _rnd(1, true)).normalize()
    this.o3d.position.copy(center).addScaledVector(dir, 5 + Math.random() * 15)
    this.vel.set(_rnd(0.15, true), _rnd(0.15, true), _rnd(0.15, true))
    this.baseScale = 0.15 + Math.pow(Math.random(), 0.6) * 1.85
    this.o3d.scale.setScalar(this.baseScale * _scaleMult * _mobileMult)
  }

  tick(dt, sharedTarget, elapsed, camRight, camUp) {
    // Apply live scale multiplier
    this.o3d.scale.setScalar(this.baseScale * _scaleMult * _mobileMult)

    // Wing flap
    this.phase += this.fspd * _flapMult * dt
    const t  = Math.abs(Math.sin(this.phase))
    const wr = -Math.PI / 6 + t * (Math.PI / 2 - 0.1 + Math.PI / 6)
    this.lw.rotation.y =  wr
    this.rw.rotation.y = -wr

    // Personal target = shared target + unique sinusoidal offset in camera space
    const ox = Math.sin(elapsed * this.wFreq       + this.wPhase)        * this.wAmpH * _spreadH
    const oy = Math.cos(elapsed * this.wFreq * 0.7 + this.wPhase + 1.57) * this.wAmpV * _spreadV
    _pTgt.copy(sharedTarget)
      .addScaledVector(camRight, ox)
      .addScaledVector(camUp,    oy)

    // Steer toward personal target
    const dx  = _pTgt.x - this.o3d.position.x
    const dy  = _pTgt.y - this.o3d.position.y
    const dz  = _pTgt.z - this.o3d.position.z
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1

    this.vel.x = _clamp(this.vel.x + _attract * dx / len, -_velLimit, _velLimit)
    this.vel.y = _clamp(this.vel.y + _attract * dy / len, -_velLimit, _velLimit)
    this.vel.z = _clamp(this.vel.z + _attract * dz / len, -_velLimit, _velLimit)

    this.o3d.lookAt(
      this.o3d.position.x + this.vel.x,
      this.o3d.position.y + this.vel.y,
      this.o3d.position.z + this.vel.z,
    )
    this.o3d.position.add(this.vel)
  }
}

// ── Theatre.js watcher — keeps live params in sync ───────────────────────────
function _initTheatre() {
  const obj = sheet.object('Mariposas', {
    cantidad:       types.number(14,    { range: [0, MAX_COUNT],  nudgeMultiplier: 1      }),
    tamano:         types.number(1.0,   { range: [0.1, 5.0],     nudgeMultiplier: 0.05   }),
    velocidad:      types.number(0.22,  { range: [0.01, 2.0],    nudgeMultiplier: 0.01   }),
    atraccion:      types.number(0.008, { range: [0.001, 0.1],   nudgeMultiplier: 0.001  }),
    aleteo:         types.number(1.0,   { range: [0.1, 4.0],     nudgeMultiplier: 0.05   }),
    distancia:      types.number(18,    { range: [3, 60],         nudgeMultiplier: 1      }),
    deriva:         types.number(3.5,   { range: [0, 15],         nudgeMultiplier: 0.5    }),
    suavidad:       types.number(0.05,  { range: [0.01, 0.3],    nudgeMultiplier: 0.005  }),
    // ── Iridiscencia ───────────────────────────────────────────
    iridiscencia:   types.number(0.55,  { range: [0, 1],          nudgeMultiplier: 0.05   }),
    bloom_brillo:   types.number(2.2,   { range: [0, 6],          nudgeMultiplier: 0.1    }),
    hue_velocidad:  types.number(0.07,  { range: [0, 0.5],        nudgeMultiplier: 0.005  }),
    hue_rango:      types.number(2.2,   { range: [0, 8],          nudgeMultiplier: 0.1    }),
  })

  obj.onValuesChange((v) => {
    _attract    = v.atraccion
    _velLimit   = v.velocidad
    _scaleMult  = v.tamano
    _flapMult   = v.aleteo
    _targetDist = v.distancia
    _driftAmp   = v.deriva
    _lerpSpeed  = v.suavidad

    // Iridiscencia — se propaga a todos los wing materials automáticamente
    _iridStrength.value = v.iridiscencia
    _iridBoost.value    = v.bloom_brillo
    _iridSpeed.value    = v.hue_velocidad
    _iridRange.value    = v.hue_rango

    const n = Math.round(v.cantidad)
    _activeCount = n
    for (let i = 0; i < _butterflies.length; i++) {
      _butterflies[i].o3d.visible = _state === 'active' && i < n
    }
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initButterflies(scene) {
  _scene = scene
  const isMobile = window.innerWidth <= 768
  // En mobile: más grandes y MENOS dispersas a lo ancho (la pantalla es angosta
  // y vertical), así entran más mariposas en cuadro en vez de irse de los lados.
  _mobileMult = isMobile ? 0.75 : 0.55
  _spreadH    = isMobile ? 0.40 : 1.0
  _spreadV    = isMobile ? 0.75 : 1.0
  for (let i = 0; i < MAX_COUNT; i++) {
    const b = new Butterfly()
    _butterflies.push(b)
    b.o3d.visible = false
    scene.add(b.o3d)
  }
  _initTheatre()
}

export function showButterflies(camera) {
  if (!_scene) return
  _state = 'active'
  _flyTimer = 0
  camera.getWorldDirection(_camDir)
  const center = camera.position.clone().addScaledVector(_camDir, 12)
  _smooth.copy(center)
  for (let i = 0; i < _butterflies.length; i++) {
    _butterflies[i].scatter(center)
    _butterflies[i].o3d.visible = i < _activeCount
  }
}

export function hideButterflies() {
  _state = 'hidden'
  for (const b of _butterflies) b.o3d.visible = false
}

export function flyAwayButterflies(camera) {
  if (_state !== 'active') return
  _state = 'flying-away'
  _flyTimer = 0

  camera.getWorldDirection(_camDir)
  _right.crossVectors(_camDir, camera.up).normalize()
  _up.crossVectors(_right, _camDir).normalize()

  for (const b of _butterflies) {
    if (!b.o3d.visible) continue
    // Each butterfly banks to its own random escape direction: spread sideways, upward bias
    const rx = (Math.random() - 0.5) * 2.0   // strong horizontal spread
    const ry =  Math.random() * 0.9 + 0.1    // slight-to-strong upward
    const rz = (Math.random() - 0.3) * 0.6   // some forward, some backward
    b.flyDir.set(0, 0, 0)
      .addScaledVector(_right, rx)
      .addScaledVector(_up,    ry)
      .addScaledVector(_camDir, rz)
      .normalize()
  }
}

export function tickButterflies(elapsed, dt, camera) {
  if (_state === 'hidden') return

  // Update iridescent shader time — shared by all wing materials
  _iridTime.value = elapsed

  const safeDt = Math.min(dt, 0.05)

  camera.getWorldDirection(_camDir)
  _right.crossVectors(_camDir, camera.up).normalize()
  _up.crossVectors(_right, _camDir).normalize()

  if (_state === 'flying-away') {
    _flyTimer += safeDt
    // Acceleration ramps up over time so they zoom off convincingly
    const accel = 0.06 + _flyTimer * 0.18

    for (let i = 0; i < _activeCount; i++) {
      const b = _butterflies[i]
      if (!b.o3d.visible) continue

      // Faster wing flap as they escape
      b.phase += b.fspd * _flapMult * safeDt * 2.5
      const t  = Math.abs(Math.sin(b.phase))
      const wr = -Math.PI / 6 + t * (Math.PI / 2 - 0.1 + Math.PI / 6)
      b.lw.rotation.y =  wr
      b.rw.rotation.y = -wr

      // Accelerate along escape direction — no velocity cap so they zoom off
      b.vel.addScaledVector(b.flyDir, accel * safeDt)

      b.o3d.lookAt(
        b.o3d.position.x + b.vel.x,
        b.o3d.position.y + b.vel.y,
        b.o3d.position.z + b.vel.z,
      )
      b.o3d.position.add(b.vel)
    }

    if (_flyTimer >= FLY_DURATION) {
      _state = 'hidden'
      for (const b of _butterflies) b.o3d.visible = false
    }
    return
  }

  // _state === 'active': normal camera-follow behaviour
  // Shared anchor: a point in front of the camera, with gentle group drift
  _rawTgt.copy(camera.position).addScaledVector(_camDir, _targetDist)
  _rawTgt.addScaledVector(_right, Math.sin(elapsed * 0.28) * _driftAmp * 0.3 * _spreadH)
  _rawTgt.addScaledVector(_up,    Math.sin(elapsed * 0.19) * _driftAmp * 0.2 * _spreadV)

  _smooth.lerp(_rawTgt, _lerpSpeed)

  for (let i = 0; i < _activeCount; i++) {
    _butterflies[i].tick(safeDt, _smooth, elapsed, _right, _up)
  }
}
