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

// ── Pixel ratio adaptativo ────────────────────────────────────────────────────
// Mide los FPS y baja la resolución de render si la máquina sufre (y la sube si
// va sobrada). Resuelve el "scroll trancado" en compus flojas / pantallas Retina
// sin sacrificar calidad en las buenas. El DPR baja hasta 1.0; sube hasta 2.0.
const _DPR_MAX  = Math.min(window.devicePixelRatio || 1, 2)
const _DPR_MIN  = 1.0
const _DPR_STEP = 0.25
let   _curDPR   = _DPR_MAX

function _applyDPR() {
  if (!_renderer) return
  _renderer.setPixelRatio(_curDPR)
  // Re-dimensiona canvas + composers de bloom/postpro (escuchan 'resize')
  window.dispatchEvent(new Event('resize'))
  console.log('[Perf] pixel ratio →', _curDPR.toFixed(2))
}

export function startLoop() {
  const clock = new THREE.Clock()
  let _prev = 0
  let _accT = 0, _accN = 0, _sinceAdjust = 0

  function loop() {
    _rafId = requestAnimationFrame(loop)
    const elapsed = clock.getElapsedTime()
    const dt = elapsed - _prev
    _prev = elapsed
    _tickListeners.forEach(fn => fn(elapsed))

    if (_renderer && _scene && _camera) {
      if (_renderFn) {
        _renderFn(_renderer, _scene, _camera)
      } else {
        _renderer.render(_scene, _camera)
      }
    }

    // ── Adaptación de calidad cada ~1s (con cooldown para no oscilar) ──
    _accT += dt; _accN++; _sinceAdjust += dt
    if (_accT >= 1.0) {
      const fps = _accN / _accT
      _accT = 0; _accN = 0
      if (_sinceAdjust >= 1.5 && _DPR_MAX > _DPR_MIN) {
        if (fps < 45 && _curDPR > _DPR_MIN) {
          _curDPR = Math.max(_DPR_MIN, _curDPR - _DPR_STEP); _applyDPR(); _sinceAdjust = 0
        } else if (fps > 57 && _curDPR < _DPR_MAX) {
          _curDPR = Math.min(_DPR_MAX, _curDPR + _DPR_STEP); _applyDPR(); _sinceAdjust = 0
        }
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
