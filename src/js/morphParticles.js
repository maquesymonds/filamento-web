// morphParticles.js — Espiral de partículas alrededor de la flor grande
// Forma: dual helix (dos hélices entrelazadas).
// Todos los parámetros ajustables en tiempo real desde Theatre "Partículas Espiral".

import * as THREE from 'three'
import { sheet }  from './theatre.js'
import { types }  from '@theatre/core'
import { BLOOM_LAYER } from './materials.js'

// ── Shape — dual helix normalizado a caja unitaria ────────────────────────────
function _dualHelix(n) {
  const pts = [], turns = 5, radius = 15, height = 40
  for (let i = 0; i < n; i++) {
    const second = i % 2 === 0
    const angle  = (i / n) * Math.PI * 2 * turns
    const y      = (i / n) * height - height / 2
    const r      = radius + (second ? 5 : -5)
    pts.push(new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r))
  }
  // Normalise to unit bounding box
  const box    = new THREE.Box3().setFromPoints(pts)
  const size   = new THREE.Vector3(); box.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const centre = new THREE.Vector3(); box.getCenter(centre)
  return pts.map(p => p.clone().sub(centre).divideScalar(maxDim))
}

// ── Module state ──────────────────────────────────────────────────────────────
let _points = null
let _mat    = null

// ── Geometry ──────────────────────────────────────────────────────────────────
const COUNT = 6000

function _buildGeo() {
  const PALETTE = [
    0x00e5ff,   // cyan brillante
    0x00aaff,   // celeste
    0x0077ff,   // azul medio
    0x0033cc,   // azul profundo
    0x00ff99,   // verde menta
    0x00ffcc,   // verde agua / teal
    0x33dd66,   // verde brillante
  ].map(c => new THREE.Color(c))

  const pos  = new Float32Array(COUNT * 3)
  const col  = new Float32Array(COUNT * 3)
  const size = new Float32Array(COUNT)
  const rnd  = new Float32Array(COUNT * 3)

  const pts = _dualHelix(COUNT)

  for (let i = 0; i < COUNT; i++) {
    const p = pts[i]
    pos[i*3] = p.x; pos[i*3+1] = p.y; pos[i*3+2] = p.z

    const base = PALETTE[Math.floor(Math.random() * PALETTE.length)]
    const hsl  = { h: 0, s: 0, l: 0 }
    base.getHSL(hsl)
    hsl.h += (Math.random() - 0.5) * 0.05
    hsl.s  = Math.min(1, Math.max(0.7, hsl.s + (Math.random() - 0.5) * 0.3))
    hsl.l  = Math.min(0.9, Math.max(0.5, hsl.l + (Math.random() - 0.5) * 0.4))
    const c = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l)
    col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b

    size[i]    = 0.7 + Math.random() * 1.1
    rnd[i*3]   = Math.random() * 10
    rnd[i*3+1] = Math.random() * Math.PI * 2
    rnd[i*3+2] = 0.5 + 0.5 * Math.random()
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos,  3))
  geo.setAttribute('color',    new THREE.BufferAttribute(col,  3))
  geo.setAttribute('size',     new THREE.BufferAttribute(size, 1))
  geo.setAttribute('random',   new THREE.BufferAttribute(rnd,  3))
  return geo
}

// ── Shaders ───────────────────────────────────────────────────────────────────
const _VERT = /* glsl */`
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;
  uniform float uJitter;
  uniform float uSpeed;
  uniform vec3  uOffset;
  attribute float size;
  attribute vec3  random;
  varying vec3  vCol;
  varying float vR;

  void main() {
    vCol = color;
    vR   = random.z;

    vec3 p = position * uScale + uOffset;

    // Per-particle micro-jitter
    float t   = uTime * uSpeed * random.z;
    float ax  = t + random.y;
    float ay  = t * 0.75 + random.x;
    float amp = (0.6 + sin(random.x + t * 0.6) * 0.3) * random.z * uJitter * uScale;
    p.x += sin(ax + p.y * 0.06 + random.x * 0.1) * amp;
    p.y += cos(ay + p.z * 0.06 + random.y * 0.1) * amp;
    p.z += sin(ax * 0.85 + p.x * 0.06 + random.z * 0.1) * amp;

    vec4  mv    = modelViewMatrix * vec4(p, 1.0);
    float pulse = 0.9 + 0.1 * sin(uTime * 1.15 + random.y);
    gl_PointSize = uSize * size * pulse * (350.0 / -mv.z);
    gl_Position  = projectionMatrix * mv;
  }
`

const _FRAG = /* glsl */`
  uniform float uBrightness;
  uniform float uOpacity;
  varying vec3  vCol;
  varying float vR;

  void main() {
    vec2  uv   = gl_PointCoord - 0.5;
    float d    = length(uv);
    float blob = exp(-d * d * 20.0);
    float glow = exp(-d * d *  6.0) * 0.35;
    float alpha = (blob + glow) * uOpacity;
    if (alpha < 0.01) discard;

    vec3 finalColor = mix(vCol, vec3(1.0, 0.98, 0.95), blob * 0.35);
    gl_FragColor    = vec4(finalColor * uBrightness, alpha);
  }
`

// ── Public API ────────────────────────────────────────────────────────────────
export function initMorphParticles(scene) {
  _mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:       { value: 0 },
      uSize:       { value: 0.09 },
      uScale:      { value: 3.0 },
      uOffset:     { value: new THREE.Vector3(0, 0, 0) },
      uJitter:     { value: 0.08 },
      uSpeed:      { value: 0.25 },
      uBrightness: { value: 1.8 },
      uOpacity:    { value: 1.0 },
    },
    vertexShader:   _VERT,
    fragmentShader: _FRAG,
    transparent:    true,
    depthWrite:     false,
    vertexColors:   true,
    blending:       THREE.AdditiveBlending,
  })

  _points = new THREE.Points(_buildGeo(), _mat)
  _points.frustumCulled = false
  _points.visible = false   // hidden until frame 200
  _points.layers.enable(BLOOM_LAYER)
  scene.add(_points)

  _initTheatre()
}

export function tickMorphParticles(elapsed) {
  if (_mat) _mat.uniforms.uTime.value = elapsed
}

export function setMorphParticlesVisible(v) {
  if (_points) _points.visible = v
}

// ── Theatre panel ─────────────────────────────────────────────────────────────
function _initTheatre() {
  const obj = sheet.object('Partículas Espiral', {
    posX:      types.number(0,    { range: [-15, 15],    nudgeMultiplier: 0.1   }),
    posY:      types.number(0,    { range: [-15, 15],    nudgeMultiplier: 0.1   }),
    posZ:      types.number(0,    { range: [-15, 15],    nudgeMultiplier: 0.1   }),
    escala:    types.number(3.0,  { range: [0.1, 20],    nudgeMultiplier: 0.1   }),
    tamano:    types.number(0.09, { range: [0.005, 0.5], nudgeMultiplier: 0.005 }),
    brillo:    types.number(1.8,  { range: [0.1, 5],     nudgeMultiplier: 0.1   }),
    opacidad:  types.number(1.0,  { range: [0, 1],       nudgeMultiplier: 0.01  }),
    jitter:    types.number(0.08, { range: [0, 0.5],     nudgeMultiplier: 0.005 }),
    velocidad: types.number(0.25, { range: [0, 2],       nudgeMultiplier: 0.02  }),
    bloom:     types.boolean(true),
  })

  obj.onValuesChange((v) => {
    if (!_mat || !_points) return
    _mat.uniforms.uOffset.value.set(v.posX, v.posY, v.posZ)
    _mat.uniforms.uScale.value      = v.escala
    _mat.uniforms.uSize.value       = v.tamano
    _mat.uniforms.uBrightness.value = v.brillo
    _mat.uniforms.uOpacity.value    = v.opacidad
    _mat.uniforms.uJitter.value     = v.jitter
    _mat.uniforms.uSpeed.value      = v.velocidad
    if (v.bloom) _points.layers.enable(BLOOM_LAYER)
    else         _points.layers.disable(BLOOM_LAYER)
  })
}
