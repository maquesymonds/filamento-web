// scene.js — WebGLRenderer, render loop, resize
// setRenderPipeline() permite swapear el render simple por bloom en 3 pasadas.

import * as THREE from 'three'
import { CONFIG } from './config.js'
import { USE_LITE_MODE } from './device.js'

const toneMappingMap = {
  ACESFilmic: THREE.ACESFilmicToneMapping,
  Linear:     THREE.LinearToneMapping,
  Reinhard:   THREE.ReinhardToneMapping,
  Cineon:     THREE.CineonToneMapping,
}

let _renderer      = null
let _camera        = null
let _scene         = null
let _rafId         = null
let _tickListeners = []
let _renderFn      = null
let _renderPaused  = false

export function initRenderer(canvas) {
  const cfg = CONFIG.renderer

  // MSAA (antialias) es caro en GPUs integradas. En low-end/mobile lo apagamos:
  // a pixelRatio 2 el aliasing casi no se nota y la ganancia de FPS es grande.
  _renderer = new THREE.WebGLRenderer({
    canvas,
    antialias:            cfg.antialias && !USE_LITE_MODE,
    alpha:                cfg.alpha,
    preserveDrawingBuffer: true,   // needed to snapshot the frame for circle transition
  })

  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  _renderer.setSize(window.innerWidth, window.innerHeight)
  _renderer.toneMapping         = toneMappingMap[cfg.toneMapping] ?? THREE.ACESFilmicToneMapping
  _renderer.toneMappingExposure = cfg.toneMappingExposure

  window.addEventListener('resize', _onResize)

  return _renderer
}

export function setThreeScene(threeScene) { _scene  = threeScene }
export function setCamera(camera)         { _camera = camera     }
export function getRenderer()             { return _renderer     }

// Swapea el render simple por una pipeline customizada (ej: bloom en 3 pasadas).
// fn recibe (renderer, scene, camera).
export function setRenderPipeline(fn) { _renderFn = fn }

export function onTick(fn) { _tickListeners.push(fn) }

// Pausa SOLO el render principal (escena + bloom de 3 pasadas, la pasada más
// cara). Los _tickListeners siguen corriendo, así el estado NO se desincroniza.
// Se usa mientras el panel de proyecto tapa toda la pantalla: la escena 3D no se
// ve, así que no tiene sentido dibujarla. Hay que reanudar antes de revelarla.
export function setMainRenderPaused(paused) { _renderPaused = paused }

// Fuerza un render inmediato (1 frame). Se usa al reanudar, justo antes de la
// transición de cierre, para que el snapshot del círculo tome el frame actual
// (con la escena en su estado real) y no el último frame viejo del buffer.
export function renderMainOnce() {
  if (!_renderer || !_scene || !_camera) return
  if (_renderFn) _renderFn(_renderer, _scene, _camera)
  else           _renderer.render(_scene, _camera)
}

export function startLoop() {
  const clock = new THREE.Clock()

  function loop() {
    _rafId = requestAnimationFrame(loop)
    const elapsed = clock.getElapsedTime()
    _tickListeners.forEach(fn => fn(elapsed))

    if (_renderer && _scene && _camera && !_renderPaused) {
      if (_renderFn) {
        _renderFn(_renderer, _scene, _camera)
      } else {
        _renderer.render(_scene, _camera)
      }
    }
  }

  loop()
}

export function stopLoop() {
  if (_rafId) cancelAnimationFrame(_rafId)
}

function _onResize() {
  if (!_renderer || !_camera) return
  const w = window.innerWidth
  const h = window.innerHeight
  _renderer.setSize(w, h)
  if (_camera.isPerspectiveCamera) {
    _camera.aspect = w / h
    _camera.updateProjectionMatrix()
  }
}
