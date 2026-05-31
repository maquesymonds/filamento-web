// audio.js — Ambient arranca solo al cargar. Jungle se suma al apretar Start.

import { sheet } from './theatre.js'
import { types } from '@theatre/core'

let _ambient = null
let _jungle  = null
let _isOn    = true

// ── Bar visualizer icon ───────────────────────────────────────────────────────

const _REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 11 bars, symmetric bell-curve envelope, independent phases & speeds
const _N    = 11
const _BW   = 2.0   // bar width (logical px)
const _BG   = 2.2   // gap between bars (logical px)
const _ENV  = [0.20, 0.38, 0.58, 0.78, 0.94, 1.00, 0.94, 0.78, 0.58, 0.38, 0.20]
const _PHS  = [0.00, 1.10, 2.30, 0.70, 1.80, 0.30, 2.10, 0.90, 1.50, 0.40, 1.90]
const _SPD  = [3.2,  2.8,  4.0,  2.5,  3.5,  3.0,  3.7,  2.6,  3.1,  2.9,  3.6]
const _DOT  = 1.1   // dot radius when muted

let _waveCanvas  = null
let _waveCtx     = null
let _waveActive  = false
let _waveRAF     = null
let _waveTime    = 0
let _waveLastTS  = null

function _drawFrame(t) {
  if (!_waveCtx) return
  const dpr  = window.devicePixelRatio || 1
  const W    = _waveCanvas.width  / dpr
  const H    = _waveCanvas.height / dpr
  _waveCtx.clearRect(0, 0, W, H)

  const totalW = _N * _BW + (_N - 1) * _BG
  const ox     = (W - totalW) / 2   // left offset to center the row

  for (let i = 0; i < _N; i++) {
    const env = _ENV[i]
    const lx  = ox + i * (_BW + _BG)   // bar left edge
    const cx  = lx + _BW / 2           // bar center x

    // Color: dim teal on edges → near-white at center
    const r  = Math.round(77  + 143 * env)
    const g  = Math.round(217 +  33 * env)
    const b  = Math.round(192 +  48 * env)

    if (!_waveActive) {
      // ── Quiet: uniform dots ──
      _waveCtx.beginPath()
      _waveCtx.arc(cx, H / 2, _DOT, 0, Math.PI * 2)
      _waveCtx.fillStyle = `rgba(${r},${g},${b},${(0.30 + 0.35 * env).toFixed(2)})`
      _waveCtx.fill()
    } else {
      // ── Active: animated capsule bars ──
      const wave = (1 + Math.sin(_SPD[i] * t + _PHS[i])) / 2   // 0..1
      const barH = Math.max(_BW, wave * H * 0.88 * env)
      const y    = (H - barH) / 2
      const rad  = _BW / 2

      if (env > 0.65) {
        _waveCtx.shadowBlur  = 5
        _waveCtx.shadowColor = `rgba(${r},${g},${b},0.55)`
      }

      _waveCtx.beginPath()
      _waveCtx.roundRect(lx, y, _BW, barH, rad)
      _waveCtx.fillStyle = `rgba(${r},${g},${b},${(0.38 + 0.57 * env).toFixed(2)})`
      _waveCtx.fill()
      _waveCtx.shadowBlur = 0
    }
  }
}

function _waveLoop(ts) {
  if (!_waveActive) return
  if (_waveLastTS === null) _waveLastTS = ts
  _waveTime  += (ts - _waveLastTS) / 1000
  _waveLastTS = ts
  _drawFrame(_waveTime)
  _waveRAF = requestAnimationFrame(_waveLoop)
}

function _setSoundWaveActive(active) {
  _waveActive = active

  if (!active) {
    if (_waveRAF) { cancelAnimationFrame(_waveRAF); _waveRAF = null }
    _waveLastTS = null
    _drawFrame(0)
    return
  }

  if (_REDUCED_MOTION) {
    _drawFrame(1.2)   // static snapshot of the wave
    return
  }

  if (!_waveRAF) {
    _waveLastTS = null
    _waveRAF    = requestAnimationFrame(_waveLoop)
  }
}

function _initWaveIcon() {
  _waveCanvas = document.querySelector('.sound-wave-icon')
  if (!_waveCanvas) return

  const dpr = window.devicePixelRatio || 1
  // Read CSS logical size
  const rect = _waveCanvas.getBoundingClientRect()
  const W    = rect.width  || 44
  const H    = rect.height || 14

  _waveCanvas.width  = W * dpr
  _waveCanvas.height = H * dpr
  _waveCtx = _waveCanvas.getContext('2d')
  _waveCtx.scale(dpr, dpr)

  _drawFrame(0)   // initial flat line
}

// ── Icon state — depends on both user intent AND effective volume ─────────────

function _updateIcon() {
  _setSoundWaveActive(_isOn)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initAudio() {
  _ambient        = new Audio('/audio/ambient.mp3')
  _ambient.loop   = true
  _ambient.volume = 0

  _jungle        = new Audio('/audio/jungle.mp3')
  _jungle.loop   = true
  _jungle.volume = 0

  const btn = document.getElementById('sound-toggle')
  if (btn) btn.addEventListener('click', _toggle)

  _initTheatreControls()
  _initSliders()

  // Init canvas after the DOM is ready (getBoundingClientRect needs layout)
  requestAnimationFrame(_initWaveIcon)

  // Don't attempt autoplay — browsers block it inconsistently.
  // Gesture unlock fires on the first user interaction (mouse move, touch, Start click).
  _setupGestureUnlock()
}

export async function startAmbient() {
  if (!_ambient || !_ambient.paused) return
  try {
    await _ambient.play()
    _isOn = true
    _applyVolumes()
  } catch (_) {
    // Blocked — gesture unlock will catch it on first interaction
  }
}

export function playGrowing() {
  const growing = new Audio('/audio/growing.mp3')
  growing.volume = 0
  growing.play().catch(() => {
    const events  = ['pointerdown', 'pointermove', 'keydown']
    const handler = () => {
      growing.play().catch(() => {})
      events.forEach(e => window.removeEventListener(e, handler))
    }
    events.forEach(e => window.addEventListener(e, handler, { once: true }))
  })
}

export async function startJungle() {
  if (!_jungle || !_isOn) return
  try { await _jungle.play() }
  catch (err) { console.warn('[Filamento audio] jungle blocked:', err) }
}

// ── Internal ──────────────────────────────────────────────────────────────────

let _pendingOneShots    = []
let _clearGestureUnlock = null
const _activeOneShots   = new Set()

export function playOneShot(src, volume = 1.0) {
  if (!_isOn) return
  const sfx = new Audio(src)
  sfx.volume = volume
  _activeOneShots.add(sfx)
  sfx.addEventListener('ended', () => _activeOneShots.delete(sfx), { once: true })
  sfx.play().catch(() => _activeOneShots.delete(sfx))
}

export function playOnUnlock(src, volume = 1.0) {
  if (_isOn) {
    playOneShot(src, volume)
  } else {
    _pendingOneShots.push({ src, volume })
  }
}

function _setupGestureUnlock() {
  const events     = ['pointerdown', 'touchstart', 'click', 'keydown']
  const _onGesture = async (e) => {
    // The sound button owns its own interactions via _toggle / click —
    // skip here so touchstart doesn't race with the click event.
    const btn = document.getElementById('sound-toggle')
    if (btn && btn.contains(e.target)) return
    if (!_ambient.paused) { _clearGestureUnlock?.(); _clearGestureUnlock = null; return }
    try {
      await _ambient.play()
      _isOn = true
      _applyVolumes()
      _updateIcon()
      _clearGestureUnlock?.()
      _clearGestureUnlock = null
      _pendingOneShots.forEach(({ src, volume }) => {
        const sfx = new Audio(src)
        sfx.volume = volume
        sfx.play().catch(() => {})
      })
      _pendingOneShots = []
    } catch (_) {}
  }
  events.forEach(e => window.addEventListener(e, _onGesture, { passive: true }))
  _clearGestureUnlock = () => events.forEach(e => window.removeEventListener(e, _onGesture))
}

export function isSoundOn() { return _isOn }

function _toggle() {
  if (_isOn) {
    // Muting
    if (_clearGestureUnlock) { _clearGestureUnlock(); _clearGestureUnlock = null }
    _isOn = false
    _applyVolumes()   // set volumes to 0 so Theatre.js can't sneak them back
    _ambient.pause()
    _jungle.pause()
    _activeOneShots.forEach(sfx => { sfx.pause(); sfx.currentTime = 0 })
    _activeOneShots.clear()
    _updateIcon()
    window.dispatchEvent(new CustomEvent('filamento:mute'))
  } else {
    // Unmuting: click IS a user gesture
    _isOn = true
    _applyVolumes()   // restore volumes before playing
    _updateIcon()
    _ambient.play().catch(() => {
      _isOn = false
      _applyVolumes()
      _updateIcon()
    })
    if (_jungle.currentTime > 0) _jungle.play().catch(() => {})
    window.dispatchEvent(new CustomEvent('filamento:unmute'))
  }
}

function _initSliders() {
  const ambientSlider = document.getElementById('slider-ambient')
  const jungleSlider  = document.getElementById('slider-jungle')
  const saveBtn       = document.getElementById('mixer-save')

  const saved = JSON.parse(localStorage.getItem('filamento-volumes') || 'null')
  if (saved) {
    if (ambientSlider) ambientSlider.value = saved.ambient
    if (jungleSlider)  jungleSlider.value  = saved.jungle
    if (_ambient) _ambient.volume = saved.ambient
    if (_jungle)  _jungle.volume  = saved.jungle
  }

  if (ambientSlider) {
    ambientSlider.addEventListener('input', () => {
      _tv = { ..._tv, ambient_volume: parseFloat(ambientSlider.value) }
      _applyVolumes()
      _updateIcon()
    })
  }

  if (jungleSlider) {
    jungleSlider.addEventListener('input', () => {
      _tv = { ..._tv, jungle_volume: parseFloat(jungleSlider.value) }
      _applyVolumes()
      _updateIcon()
    })
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      localStorage.setItem('filamento-volumes', JSON.stringify({
        ambient: parseFloat(ambientSlider?.value ?? 0.35),
        jungle:  parseFloat(jungleSlider?.value  ?? 0.6),
      }))
      saveBtn.textContent = 'Saved'
      saveBtn.classList.add('saved')
      setTimeout(() => {
        saveBtn.textContent = 'Save'
        saveBtn.classList.remove('saved')
      }, 1500)
    })
  }
}

// Last values seen from Theatre.js — used to restore on unmute
let _tv = { ambient_volume: 0.35, jungle_volume: 0.6, ambient_rate: 1.0, jungle_rate: 1.0 }

function _applyVolumes() {
  if (_ambient) _ambient.volume      = _isOn ? _tv.ambient_volume : 0
  if (_jungle)  _jungle.volume       = _isOn ? _tv.jungle_volume  : 0
}

function _initTheatreControls() {
  const audioObj = sheet.object('Audio', {
    ambient_volume: types.number(0.35, { range: [0, 1], nudgeMultiplier: 0.01 }),
    jungle_volume:  types.number(0.6,  { range: [0, 1], nudgeMultiplier: 0.01 }),
    ambient_rate:   types.number(1.0,  { range: [0.5, 2], nudgeMultiplier: 0.05 }),
    jungle_rate:    types.number(1.0,  { range: [0.5, 2], nudgeMultiplier: 0.05 }),
  })

  audioObj.onValuesChange((v) => {
    _tv = v
    _applyVolumes()
    if (_ambient) _ambient.playbackRate = v.ambient_rate
    if (_jungle)  _jungle.playbackRate  = v.jungle_rate
    _updateIcon()
  })
}
