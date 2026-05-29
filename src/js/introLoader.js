// introLoader.js — Loader con TypeShuffle → movimiento a posición del brand title
//
// Secuencia:
//  1. "FILAMENTO" centrado en pantalla, TypeShuffle fx2 loopeando mientras cargan assets
//  2. Cuando assets listos: última iteración del shuffle se completa
//  3. La palabra se mueve hacia arriba-izquierda y crece hasta la posición del brand title
//  4. El velo negro se desvanece → se ve el hero (chip + overlay)

import gsap         from 'gsap'
import { TypeShuffle } from './type-shuffle.js'

let _veil     = null
let _wm       = null
let _ts       = null
let _ready    = false   // assets loaded
let _exiting  = false
let _onReveal = null

export function initIntroLoader() {
  _veil = document.getElementById('intro-veil')
  _wm   = document.getElementById('intro-wordmark')
  if (!_veil || !_wm) return

  // Center the wordmark in pixels (consistent units for animation)
  gsap.set(_wm, {
    position: 'fixed',
    top:      window.innerHeight / 2,
    left:     window.innerWidth  / 2,
    xPercent: -50,
    yPercent: -50,
    // opacity stays 0 (CSS) — revealed on first shuffled frame via onLineStart
  })

  _ts = new TypeShuffle(_wm)
  _loop()
}

// ── Shuffle loop ──────────────────────────────────────────────────────────────
function _loop() {
  if (_exiting) return
  _ts.trigger('fx6', {
    onLineStart() { gsap.set(_wm, { opacity: 1 }) },
    onComplete() {
      if (_exiting) return
      if (_ready) _exit()
      else setTimeout(_loop, 320)
    },
  })
}

// ── Called from main.js when all assets are ready ────────────────────────────
export function resolveLoader(onReveal) {
  _ready    = true
  _onReveal = onReveal
  // If shuffle already completed (waiting in the 320ms gap or done), exit now
  if (!_ts?.isAnimating && !_exiting) _exit()
}

// ── Exit: loader done → fade wordmark, reveal scene ──────────────────────────
function _exit() {
  _exiting = true

  const brand = document.querySelector('.brand-name')
  if (_wm) gsap.to(_wm, { opacity: 0, duration: 0.4, ease: 'power2.in' })
  if (brand) gsap.set(brand, { opacity: 1 })

  _onReveal?.()
  gsap.to(_veil, {
    opacity:  0,
    duration: 0.5,
    delay:    0.3,
    ease:     'power2.out',
    onComplete() {
      _veil.style.display = 'none'
      if (_wm) _wm.style.display = 'none'
    },
  })
}

// ── Move wordmark above veil, fade veil, swap at the end ─────────────────────
function _reveal() {
  const brand = document.querySelector('.brand-name')

  // Snapshot exact rendered position (includes x/y/scale transforms from _exit)
  const finalRect   = _wm.getBoundingClientRect()
  const endFontSz   = brand ? parseFloat(getComputedStyle(brand).fontSize) : null

  // Lift wordmark to body so the veil can't cover it.
  // Reset transforms → set position directly as top/left pixels so it doesn't jump.
  document.body.appendChild(_wm)
  gsap.set(_wm, {
    position: 'fixed',
    top:      finalRect.top,
    left:     finalRect.left,
    x: 0, y: 0, scale: 1,
    ...(endFontSz ? { fontSize: endFontSz } : {}),
    zIndex:   10000,
    opacity:  1,
  })

  // Fire hero (tagline, button, ambient) — brand-name stays opacity:0 from _exit
  _onReveal?.()

  // Fade the veil — wordmark floats above it, perfectly still and visible
  gsap.to(_veil, {
    opacity:  0,
    duration: 1.0,
    ease:     'power2.inOut',
    onComplete() {
      _veil.style.display = 'none'
      // Scene fully visible → instant swap: real brand-name on, proxy off
      if (brand) gsap.set(brand, { opacity: 1 })
      if (_wm)   _wm.style.display = 'none'
    },
  })
}
