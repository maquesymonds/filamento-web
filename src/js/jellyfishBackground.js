// jellyfishBackground.js — WebGPU jellyfish scene for project panel background.
//
// Adapted from aurelia-master (Verlet physics + TSL shading).
// Two-canvas stack: this WebGPU canvas sits below #project-bg-canvas (WebGL wave).
//
// Usage:
//   initJellyfish()   — call once on page load (async bake happens in background)
//   showJellyfish()   — called when project panel opens
//   hideJellyfish()   — called when project panel closes

import * as THREE            from 'three/webgpu'
import { pass, mrt, output, float, vec4, Fn, clamp, vec3 } from 'three/tsl'
import { bloom }             from 'three/addons/tsl/display/BloomNode.js'
import { Lights }            from './jellyfish/lights.js'
import { VerletPhysics }     from './jellyfish/physics/verletPhysics.js'
import { Medusa }            from './jellyfish/medusa.js'
import { MedusaVerletBridge} from './jellyfish/medusaVerletBridge.js'
import { Background }        from './jellyfish/background.js'
import { Plankton }          from './jellyfish/plankton.js'
import { Godrays }           from './jellyfish/godrays.js'

const MEDUSA_COUNT = 5

// ── State ─────────────────────────────────────────────────────────────────────
let _canvas         = null
let _renderer       = null
let _scene          = null
let _camera         = null
let _physics        = null
let _bridge         = null
let _postProcessing = null
let _bloomPass      = null
let _running        = false
let _rafId          = null
let _elapsed        = 0
let _ready          = false
let _initStarted    = false

// ── Public API ────────────────────────────────────────────────────────────────
export function initJellyfish() {
  if (_initStarted) return
  _initStarted = true

  _canvas = document.getElementById('project-jelly-canvas')
  if (!_canvas) return

  if (!navigator.gpu) {
    console.warn('[Jellyfish] WebGPU not supported — background will be wave-only')
    return
  }

  _doInit().catch(e => console.error('[Jellyfish] Init failed:', e))
}

export function showJellyfish() {
  if (!_canvas) return
  _canvas.style.opacity = '1'
  if (_ready) _startLoop()
}

export function hideJellyfish() {
  if (!_canvas) return
  _canvas.style.opacity = '0'
  _stopLoop()
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function _doInit() {
  _renderer = new THREE.WebGPURenderer({ canvas: _canvas, antialias: true })
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  _renderer.setSize(window.innerWidth, window.innerHeight)
  _renderer.toneMapping = THREE.ACESFilmicToneMapping
  _renderer.toneMappingExposure = 2.2
  await _renderer.init()

  _camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.01, 30)
  _camera.position.set(0, 0, 15)
  _camera.lookAt(0, 0, 0)

  _scene = new THREE.Scene()
  _scene.background = new THREE.Color(0x000000)

  _physics = new VerletPhysics(_renderer)

  const lights = new Lights()
  _scene.add(lights.object)

  new Background(_renderer)
  _scene.environmentNode      = Background.envFunction
  _scene.environmentIntensity = 0.3
  // No backgroundNode — scene clears to black, which screen-blends to invisible

  await Medusa.initStatic(_physics)

  _bridge = new MedusaVerletBridge(_physics)

  // Fixed starting positions: spread wide across screen, staggered in depth and height
  const _startPos = [
    { x: -11, y: -22, z:  1 },   // far left
    { x:  -5, y:   2, z: -3 },   // left-center
    { x:   0, y: -12, z:  2 },   // center
    { x:   5, y:  10, z: -2 },   // right-center
    { x:  11, y:  -6, z:  3 },   // far right
  ]

  for (let i = 0; i < MEDUSA_COUNT; i++) {
    const medusa = new Medusa(_renderer, _physics, _bridge)
    const p = _startPos[i]
    medusa.transformationObject.position.set(p.x, p.y, p.z)
    medusa.needsPositionUpdate = true
    _scene.add(medusa.object)
    _physics.addObject(medusa)
  }
  _physics.addObject(_bridge)

  await _physics.bake()

  const plankton = new Plankton()
  _scene.add(plankton.object)

  const godrays = new Godrays(_bridge)
  _scene.add(godrays.object)

  // ── Post-processing with selective bloom ────────────────────────────────────
  const scenePass = pass(_scene, _camera)
  scenePass.setMRT(mrt({ output, bloomIntensity: float(0) }))

  const outputPass         = scenePass.getTextureNode()
  const bloomIntensityPass = scenePass.getTextureNode('bloomIntensity')

  _bloomPass = bloom(Fn(() => {
    const bloomIntensity = bloomIntensityPass.r
    const charge         = bloomIntensityPass.g
    const colorMask      = vec3(
      float(1.0).sub(charge.mul(0.5)),
      float(1.0).sub(charge),
      float(1.0)
    )
    return vec4(outputPass.rgb.mul(bloomIntensity).mul(colorMask), float(1))
  })())

  _postProcessing = new THREE.PostProcessing(_renderer)
  _postProcessing.outputColorTransform = false
  _postProcessing.outputNode = Fn(() => {
    const bloomIntensity = bloomIntensityPass.r
    const charge         = bloomIntensityPass.g
    const bloomMask      = clamp(bloomIntensity, 0, 1).oneMinus().add(charge)
    const finalBloom     = _bloomPass.rgb.mul(clamp(bloomMask, 0, 1))
    return vec4(outputPass.rgb.add(finalBloom), float(1)).renderOutput()
  })()

  _bloomPass.threshold.value = 0.001
  _bloomPass.strength.value  = 0.8
  _bloomPass.radius.value    = 1.0

  window.addEventListener('resize', _onResize)

  _ready = true
  // If showJellyfish was already called before init finished, start now
  if (parseFloat(_canvas.style.opacity) > 0) _startLoop()
}

// ── Render loop ───────────────────────────────────────────────────────────────
function _startLoop() {
  if (_running || !_ready) return
  _running = true
  let prevTime = performance.now()
  let frameInProgress = false

  const loop = async () => {
    if (!_running) return
    _rafId = requestAnimationFrame(loop)

    if (frameInProgress) return
    frameInProgress = true

    const now   = performance.now()
    const delta = Math.min((now - prevTime) / 1000, 0.05)
    _elapsed   += delta
    prevTime    = now

    // Gentle auto-camera drift — no OrbitControls needed
    _camera.position.x = Math.sin(_elapsed * 0.05) * 2.0
    _camera.position.y = Math.cos(_elapsed * 0.07) * 0.6
    _camera.lookAt(0, 0, 0)

    Medusa.updateStatic()
    await _physics.update(delta, _elapsed)

    // Sort medusae by camera distance (nearest last for correct alpha blending)
    _bridge.medusae.forEach(m => {
      m.distance = _camera.position.distanceTo(m.transformationObject.position)
    })
    const sorted = [..._bridge.medusae].sort((a, b) => a.distance - b.distance)
    let z = 10
    for (const m of sorted) {
      m.bell.geometryInside.object.renderOrder  = z++
      m.arms.object.renderOrder                 = z++
      m.tentacles.object.renderOrder            = z++
      m.bell.geometryOutside.object.renderOrder = z++
    }

    await _postProcessing.renderAsync()
    frameInProgress = false
  }

  _rafId = requestAnimationFrame(loop)
}

function _stopLoop() {
  _running = false
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null }
}

function _onResize() {
  if (!_renderer || !_camera) return
  _renderer.setSize(window.innerWidth, window.innerHeight)
  _camera.aspect = window.innerWidth / window.innerHeight
  _camera.updateProjectionMatrix()
}
