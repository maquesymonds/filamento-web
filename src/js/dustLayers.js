// dustLayers.js — Capas de polvo / niebla volumétrica.
// Un campo de THREE.Points (1 draw call) que la cámara atraviesa; los puntos se
// reciclan alrededor de la cámara → campo "infinito". Organizado en capas a
// distintas alturas, algunas más cargadas que otras (polvo de suelo denso,
// estratos altos tenues) para dar sensación de estar bajo tierra.

import * as THREE from 'three'
import { sheet }  from './theatre.js'
import { types }  from '@theatre/core'

const MAX_COUNT = 260

// Capas: yBias = banda de altura relativa | weight = opacidad relativa | sizeMul = tamaño
// Las de abajo son más densas y grandes (polvo pesado); las de arriba, tenues.
const LAYERS = [
  { yBias: -7, weight: 1.00, sizeMul: 1.5 },
  { yBias: -2, weight: 0.65, sizeMul: 1.1 },
  { yBias:  4, weight: 0.35, sizeMul: 0.9 },
  { yBias: 11, weight: 0.18, sizeMul: 0.7 },
]

let _scene   = null
let _points  = null
let _geo     = null
let _mat     = null
let _vel     = null          // Float32Array N*3 — deriva por punto
let _layerOf = null          // Uint8Array N — capa de cada punto

// Params (Theatre)
let _active  = true
let _count   = 130
let _radius  = 45            // alcance alrededor de la cámara
let _drift   = 0.18          // velocidad de deriva

// En mobile las motas se ven mucho más grandes (pixelRatio alto + FOV ancho +
// pantalla chica) → tamaño fijo en mobile, independiente del panel (que es desktop).
const _isMobile   = window.matchMedia('(max-width: 768px)').matches
const _mobileSize = 1

const _camPos = new THREE.Vector3()
const _tmp    = new THREE.Vector3()
const _fwd    = new THREE.Vector3()
const _right  = new THREE.Vector3()
const _up     = new THREE.Vector3()
let _tanHalf  = 0.5
let _aspect   = 1.6
let _reseed   = true   // primera vez: recolocar todo dentro del encuadre

// Textura suave (gradiente radial) para que cada punto sea una mota difusa
function _softTex() {
  const s = 128
  const c = document.createElement('canvas'); c.width = c.height = s
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const _vert = /* glsl */`
  attribute float aAlpha;
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = max(-mv.z, 1.0);
    gl_PointSize = uSize * aSize * uPixelRatio * (300.0 / dist);
    // Parpadeo lento de opacidad → el polvo "respira"
    vAlpha = aAlpha * (0.7 + 0.3 * sin(uTime * 0.4 + aPhase));
  }
`

const _frag = /* glsl */`
  uniform sampler2D uMap;
  uniform vec3  uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float a = tex.a * vAlpha * uOpacity;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor, a);
  }
`

function _rand(a, b) { return a + Math.random() * (b - a) }

// Reposiciona el punto i DENTRO del cono de visión de la cámara, a una profundidad
// aleatoria, llenando la pantalla. La banda vertical depende de su capa: las capas
// pesadas van abajo (polvo de suelo), las tenues arriba → estratos siempre visibles.
function _recycle(i, pos) {
  const li = _layerOf[i]
  const d  = _rand(4, _radius)                 // profundidad delante de la cámara
  const h  = d * _tanHalf * 1.15               // media altura del frustum a esa profundidad
  const w  = h * _aspect
  // centro vertical por capa: -0.6 (abajo, pesada) → +0.6 (arriba, tenue)
  const yc = -0.6 + (LAYERS.length > 1 ? li * (1.2 / (LAYERS.length - 1)) : 0)
  const ly = (yc + _rand(-0.4, 0.4)) * h
  const lx = _rand(-1, 1) * w
  pos[i * 3]     = _camPos.x + _fwd.x * d + _right.x * lx + _up.x * ly
  pos[i * 3 + 1] = _camPos.y + _fwd.y * d + _right.y * lx + _up.y * ly
  pos[i * 3 + 2] = _camPos.z + _fwd.z * d + _right.z * lx + _up.z * ly
}

export function initDustLayers(scene) {
  _scene = scene

  _geo = new THREE.BufferGeometry()
  const pos    = new Float32Array(MAX_COUNT * 3)
  const aAlpha = new Float32Array(MAX_COUNT)
  const aSize  = new Float32Array(MAX_COUNT)
  const aPhase = new Float32Array(MAX_COUNT)
  _vel     = new Float32Array(MAX_COUNT * 3)
  _layerOf = new Uint8Array(MAX_COUNT)

  for (let i = 0; i < MAX_COUNT; i++) {
    // Capas bajas más pobladas: sesga la elección hacia el índice 0
    const li = Math.min(LAYERS.length - 1, Math.floor(Math.pow(Math.random(), 1.6) * LAYERS.length))
    _layerOf[i] = li
    const layer = LAYERS[li]

    // Posición inicial dispersa alrededor del origen (la cámara las recicla luego)
    _tmp.set(_rand(-_radius, _radius), _rand(-_radius, _radius) + layer.yBias, _rand(-_radius, _radius))
    pos[i * 3] = _tmp.x; pos[i * 3 + 1] = _tmp.y; pos[i * 3 + 2] = _tmp.z

    aAlpha[i] = layer.weight * _rand(0.5, 1.0)
    aSize[i]  = layer.sizeMul * _rand(0.6, 1.6)
    aPhase[i] = Math.random() * Math.PI * 2

    // Deriva lenta y aleatoria
    _vel[i * 3]     = _rand(-1, 1)
    _vel[i * 3 + 1] = _rand(-0.4, 0.4)
    _vel[i * 3 + 2] = _rand(-1, 1)
  }

  _geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  _geo.setAttribute('aAlpha',   new THREE.BufferAttribute(aAlpha, 1))
  _geo.setAttribute('aSize',    new THREE.BufferAttribute(aSize, 1))
  _geo.setAttribute('aPhase',   new THREE.BufferAttribute(aPhase, 1))
  _geo.setDrawRange(0, _count)

  _mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap:        { value: _softTex() },
      uColor:      { value: new THREE.Color(0x7a8290) },
      uOpacity:    { value: 0.14 },
      uSize:       { value: 7.0 },
      uTime:       { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader:   _vert,
    fragmentShader: _frag,
    transparent: true,
    depthWrite:  false,
    depthTest:   true,
    blending:    THREE.NormalBlending,
  })

  _points = new THREE.Points(_geo, _mat)
  _points.frustumCulled = false   // siempre alrededor de la cámara
  _points.renderOrder   = 0
  scene.add(_points)

  _initTheatre()
}

function _initTheatre() {
  const obj = sheet.object('Polvo', {
    activo:    types.boolean(true),
    cantidad:  types.number(180,  { range: [0, MAX_COUNT], nudgeMultiplier: 5    }),
    opacidad:  types.number(0.45, { range: [0, 1.0],       nudgeMultiplier: 0.01 }),
    tamano:    types.number(14,   { range: [1, 40],        nudgeMultiplier: 0.5  }),
    alcance:   types.number(45,   { range: [10, 150],      nudgeMultiplier: 1    }),
    deriva:    types.number(0.18, { range: [0, 2],         nudgeMultiplier: 0.02 }),
    color:     types.rgba({ r: 0.67, g: 0.71, b: 0.78, a: 1 }),
  })
  obj.onValuesChange((v) => {
    _active  = v.activo
    _count   = Math.round(v.cantidad)
    _radius  = v.alcance
    _drift   = v.deriva
    if (_points) _points.visible = _active
    if (_geo) _geo.setDrawRange(0, _count)
    if (_mat) {
      _mat.uniforms.uOpacity.value = v.opacidad
      _mat.uniforms.uSize.value    = _isMobile ? _mobileSize : v.tamano
      _mat.uniforms.uColor.value.setRGB(v.color.r, v.color.g, v.color.b)
    }
  })
}

export function tickDustLayers(elapsed, dt, camera) {
  if (!_active || !_points || !camera) return
  _mat.uniforms.uTime.value = elapsed

  const safeDt = Math.min(dt, 0.05)
  camera.getWorldPosition(_camPos)
  camera.getWorldDirection(_fwd)
  _right.crossVectors(_fwd, camera.up).normalize()
  _up.crossVectors(_right, _fwd).normalize()
  if (camera.isPerspectiveCamera) {
    _tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)
    _aspect  = camera.aspect
  }

  const pos = _geo.attributes.position.array
  const r2  = _radius * _radius * 1.21   // (radius*1.1)^2

  for (let i = 0; i < _count; i++) {
    if (_reseed) { _recycle(i, pos); continue }   // primer frame: todo al encuadre

    // Deriva
    pos[i * 3]     += _vel[i * 3]     * _drift * safeDt
    pos[i * 3 + 1] += _vel[i * 3 + 1] * _drift * safeDt
    pos[i * 3 + 2] += _vel[i * 3 + 2] * _drift * safeDt

    // Vector cámara → punto
    const dx = pos[i * 3]     - _camPos.x
    const dy = pos[i * 3 + 1] - _camPos.y
    const dz = pos[i * 3 + 2] - _camPos.z
    const along = dx * _fwd.x + dy * _fwd.y + dz * _fwd.z   // proyección sobre el frente
    // Reciclar si quedó muy lejos O detrás de la cámara
    if (dx * dx + dy * dy + dz * dz > r2 || along < 3) _recycle(i, pos)
  }
  _reseed = false
  _geo.attributes.position.needsUpdate = true
}
