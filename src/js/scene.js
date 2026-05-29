// scene.js — WebGLRenderer, render loop, resize
// setRenderPipeline() permite swapear el render simple por bloom en 3 pasadas.

import * as THREE from 'three'
import { CONFIG } from './config.js'

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

export function initRenderer(canvas) {
  const cfg = CONFIG.renderer

  _renderer = new THREE.WebGLRenderer({
    canvas,
    antialias:            cfg.antialias,
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

export function startLoop() {
  const clock = new THREE.Clock()

  function loop() {
    _rafId = requestAnimationFrame(loop)
    const elapsed = clock.getElapsedTime()
    _tickListeners.forEach(fn => fn(elapsed))

    if (_renderer && _scene && _camera) {
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
