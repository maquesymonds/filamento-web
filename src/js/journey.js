// journey.js — Scroll-driven camera journey
// Clicking "Begin the journey" auto-plays the camera from frame 25 → 258 at
// constant speed, then hands scroll control to the user until frame 364.

import gsap                                               from 'gsap'
import { CONFIG }                                         from './config.js'
import { setAnimationTime, getAnimationTime, getAnimationDuration, getIntroEndTime, stopChipFloat, enableChipFloat, resetAnimations, playIntroCameraOrbit, killIntro } from './experience.js'
import { showSectionText, hideSectionText }               from './scroll.js'
import { playCircleOpen }                                 from './circleTransition.js'
import { resetBeginButton }                               from './ui.js'
import { getRenderer }                                    from './scene.js'
import { resetRootsColor }                                 from './materials.js'
import { playOneShot }                                     from './audio.js'
import { hideButterflies }                                 from './butterflies.js'
import { isPanelOpen }                                     from './projectPanel.js'

function _journeyEndTime() {
  const dur    = getAnimationDuration()
  const frames = CONFIG.scroll.totalFrames
  if (!dur || !frames) return dur
  return (CONFIG.journey.endFrame / frames) * dur
}

function _hideText(sectionId) {
  hideSectionText(sectionId)
}

// Exposed so the frame counter in main.js can show scroll-based frames during the hold
let _scrollFrame = 0
export function getScrollFrame() { return _scrollFrame }

// Called by the dev timeline scrubber — syncs internal scroll state so the
// wheel listener doesn't snap back to the old position on the next event.
let _seekFn           = null
let _autoPlayTween    = null
let _activeOnWheel    = null
let _activeTouchStart = null
let _activeTouchMove  = null
let _activeTouchEnd   = null
let _inertiaRafId     = null

// ── Paradas en cada proyecto (semillas) ──────────────────────────────────────
// El scroll maneja TODO el journey. En cada proyecto la cámara frena (como el
// freeze de Approach): se sigue con scroll hacia adelante (tras una breve pausa)
// o con el botón Continue, que la mueve (tween) hasta el siguiente proyecto.
// _projGliding solo es true durante ese tween del botón (lock momentáneo).
let _projectStopFn = null     // botón Continue → glide al siguiente proyecto
let _projectBackFn = null     // botón Back → glide al proyecto anterior
let _projGliding   = false    // true solo mientras corre el tween del botón
let _projectTween  = null     // tween activo del glide entre proyectos
export function advanceProjectStop() { return _projectStopFn ? _projectStopFn() : false }
export function retreatProjectStop() { return _projectBackFn ? _projectBackFn() : false }

// Suavizado del mouse wheel — la rueda manda saltos discretos grandes y
// espaciados (a tirones); el trackpad/touch mandan deltas chicos y continuos.
// Acumulamos el deltaY de la rueda y lo repartimos en varios frames vía rAF,
// alimentando el handler con pasos pequeños → movimiento fluido.
let _wheelAccum = 0
let _wheelRaf   = null
function _stopWheelSmooth() {
  if (_wheelRaf) { cancelAnimationFrame(_wheelRaf); _wheelRaf = null }
  _wheelAccum = 0
}

// Approach freeze — frame 170 stops the scroll until user clicks Continue
let _approachFrozen    = false
let _approachDone      = false
let _approachDecelling = false

// Section text show/hide timeouts — module-level so stopJourney() can cancel them
let _workTimeout    = null
let _studioTimeout  = null
let _processTimeout = null

// Returns true if the auto-play tween was resumed (caller should NOT also jump).
// Returns false if no tween was active (caller should jump to Work manually).
export function releaseApproachFreeze() {
  _approachFrozen    = false
  _approachDone      = true
  _approachDecelling = false

  if (_autoPlayTween) {
    // Kill any active deceleration tween and re-accelerate regardless of paused state
    gsap.killTweensOf(_autoPlayTween)
    _stopWheelSmooth()
    if (_activeOnWheel) {
      window.removeEventListener('wheel', _activeOnWheel)
      _activeOnWheel = null
    }
    _seekFn = null
    if (_autoPlayTween.paused()) _autoPlayTween.resume()
    gsap.to(_autoPlayTween, { timeScale: 1, duration: 1.0, ease: 'power2.in' })
    return true
  }
  return false
}

export function seekJourney(t) {
  if (_seekFn) _seekFn(t)
  else setAnimationTime(t)
}

// Nav-pill jump: reposition within active scroll, or activate scroll from t for the first time.
export function jumpScrollTo(t) {
  if (_seekFn) _seekFn(t)
  else enableEndScroll(t)
}

// Stop any active journey (auto-play tween + scroll listener) without triggering the loop.
export function stopJourney() {
  // Matar el intro si sigue corriendo: si no, su tween sobrescribe setAnimationTime
  // cada frame durante los ~4.5s post-Start y la nav (work/etc.) dispara la
  // transición radial pero la escena vuelve a Studio. No-op si el intro ya terminó.
  killIntro()
  if (_autoPlayTween) { _autoPlayTween.kill(); _autoPlayTween = null }
  if (_inertiaRafId)     { cancelAnimationFrame(_inertiaRafId);                         _inertiaRafId     = null }
  _stopWheelSmooth()
  if (_activeOnWheel)    { window.removeEventListener('wheel',      _activeOnWheel);    _activeOnWheel    = null }
  if (_activeTouchStart) { window.removeEventListener('touchstart', _activeTouchStart); _activeTouchStart = null }
  if (_activeTouchMove)  { window.removeEventListener('touchmove',  _activeTouchMove);  _activeTouchMove  = null }
  if (_activeTouchEnd)   { window.removeEventListener('touchend',   _activeTouchEnd);   _activeTouchEnd   = null }
  clearTimeout(_workTimeout);    _workTimeout    = null
  clearTimeout(_studioTimeout);  _studioTimeout  = null
  clearTimeout(_processTimeout); _processTimeout = null
  if (_projectTween) { _projectTween.kill(); _projectTween = null }
  _projectStopFn = null
  _projectBackFn = null
  _projGliding   = false
  _seekFn = null
  _approachFrozen = false
}

// Temporarily block the scroll listener — call after closing the project panel
// so residual wheel events don't bleed into the journey.
let _frozenUntil = 0
export function freezeScroll(ms = 800) {
  _frozenUntil = performance.now() + ms
}

// Bloqueo del scroll táctil mientras se interactúa con la flor (mobile).
// main.js lo activa en touchstart sobre la flor y lo desactiva al soltar.
let _scrollBlocked = false
export function setScrollBlocked(v) { _scrollBlocked = !!v }

// Scrub the remaining animation (final camera rise) with the mouse wheel.
// Called once the journey auto-play lands at FLOR_GRANDE, or manually from devnav.
export function enableEndScroll(fromTime, startAt = fromTime) {
  const fullDur = getAnimationDuration()

  if (!fullDur) { console.warn('[Journey] fullDur=0, clip not loaded yet'); return }

  const fps          = CONFIG.scroll.totalFrames / fullDur
  const scrollEndFr  = CONFIG.journey.scrollEndFrame    ?? CONFIG.scroll.totalFrames
  const freezeFr     = CONFIG.journey.scrollFreezeFrame ?? CONFIG.scroll.totalFrames
  const targetFr     = CONFIG.journey.autoPlayEndFrame
  const scrollEnd    = scrollEndFr / fps
  const freezeTime   = freezeFr    / fps
  const totalRange   = scrollEnd   // full range always from 0

  // Contact text thresholds — absolute
  const contactShowT = (targetFr + 0.92 * (freezeFr - targetFr)) / fps
  const contactHideT = (targetFr + 0.85 * (freezeFr - targetFr)) / fps

  // `scroll` starts at startAt (may differ from fromTime on backward-loop arrival)
  let scroll   = startAt
  let t        = Math.min(startAt, freezeTime)
  let _cameraLocked = startAt >= freezeTime

  const studioEndTime  = (CONFIG.scroll.sections.find(s => s.id === 'studio')?.endFrame ?? 53)
    / CONFIG.scroll.totalFrames * fullDur
  const processEndTime = (CONFIG.scroll.sections.find(s => s.id === 'process')?.endFrame ?? 249)
    / CONFIG.scroll.totalFrames * fullDur
  const journeyEndTime = (CONFIG.journey.endFrame / CONFIG.scroll.totalFrames) * fullDur

  // Approach freeze — frame 170
  const approachFreezeTime = (CONFIG.journey.approachFreezeFrame ?? 170) / fps
  _approachFrozen = false
  _approachDone   = startAt > approachFreezeTime  // already past it (e.g. menu jump to Work/Contact)

  // Pre-init flags based on startAt
  let _studioShown   = startAt < studioEndTime
  let _processHidden = startAt >= processEndTime || startAt < studioEndTime
  let _contactShown  = startAt >= contactShowT
  let _transitioning = false
  let _chipStopped   = startAt >= journeyEndTime
  let _endAccum      = 0          // extra scroll needed at the end before loop fires
  if (_chipStopped) stopChipFloat()

  // Wire up the external seek function so the timeline scrubber can sync state
  _seekFn = (newT) => {
    scroll = Math.max(0, Math.min(scrollEnd, newT))
    t      = Math.min(scroll, freezeTime)
    setAnimationTime(t)
    _cameraLocked = scroll >= freezeTime
    _scrollFrame  = Math.max(0, Math.min(Math.round(scroll * fps), scrollEndFr))
  }

  // ── Paradas en cada proyecto (semillas) ────────────────────────────────────
  // _projFrames son los 4 proyectos [256,271,285,302]. _projPos es el índice del
  // proyecto en el que está la cámara (0..3), o length (=4) cuando está en Contact.
  // El scroll frena al cruzar cada proyecto hacia adelante (con una breve pausa);
  // Continue avanza al siguiente y Back retrocede al anterior (espejo), llegando
  // a Contact tras el último y volviendo a Contact→último proyecto con Back.
  const _projFrames      = (CONFIG.journey.projectStops ?? [256, 271, 285, 302]).map(f => f / fps)
  const _contactStopTime = ((CONFIG.scroll.sections.find(s => s.id === 'contact')?.navFrame) ?? 358) / fps
  const PROJ_COOLDOWN    = 450    // ms de pausa mínima en cada proyecto antes de poder seguir
  const PROJ_EPS         = 1.5 / fps
  let _projFrozen        = false  // true mientras está frenada en un proyecto
  let _projFreezeUntil   = 0      // timestamp hasta el cual se mantiene el freeze
  // Posición inicial según startAt (handoff 256 → 0; contact → length)
  let _projPos = 0
  for (let i = 0; i < _projFrames.length; i++) if (startAt >= _projFrames[i] - PROJ_EPS) _projPos = i
  if (startAt >= _contactStopTime - PROJ_EPS) _projPos = _projFrames.length

  // Glide genérico de la cámara a un tiempo destino; al terminar deja la cámara
  // frenada en ese proyecto (o suelta en Contact).
  const _glideTo = (toT, { toContact = false, fromContact = false, frozenPos = -1 } = {}) => {
    _projGliding = true
    if (fromContact) {                     // volviendo de Contact → restaurar texto Work
      _contactShown = false
      hideSectionText('contact')
      setTimeout(() => { if (!_contactShown) showSectionText('work') }, 300)
    }
    const tw = { v: scroll }
    _projectTween = gsap.to(tw, {
      v:        toT,
      duration: Math.max(1.0, Math.min(2.4, Math.abs(toT - scroll) * 3.0)),
      ease:     'power3.inOut',
      onUpdate() {
        scroll = tw.v
        t      = Math.min(scroll, freezeTime)
        setAnimationTime(t)
        _cameraLocked = scroll >= freezeTime
        _scrollFrame  = Math.max(0, Math.min(Math.round(scroll * fps), scrollEndFr))
      },
      onComplete() {
        _projectTween = null
        _projGliding  = false
        scroll        = toT
        if (toContact) {
          _projPos      = _projFrames.length
          _projFrozen   = false
          _contactShown = true
          hideSectionText('work')
          setTimeout(() => showSectionText('contact'), 300)
        } else {
          _projPos         = frozenPos
          _projFrozen      = true
          _projFreezeUntil = performance.now() + PROJ_COOLDOWN
        }
      },
    })
  }

  // Botón Continue → siguiente proyecto; tras el último, va a Contact.
  _projectStopFn = () => {
    if (_projGliding) return true
    const targetPos = _projPos + 1
    const toContact = targetPos >= _projFrames.length
    _glideTo(toContact ? _contactStopTime : _projFrames[targetPos], { toContact, frozenPos: targetPos })
    return true
  }

  // Botón Back → proyecto anterior (espejo). Desde Contact vuelve al último
  // proyecto; en el primero (256) devuelve false para que el caller haga el
  // go-back normal (a Approach/process).
  _projectBackFn = () => {
    if (_projGliding) return true
    const fromContact = _projPos >= _projFrames.length
    const targetPos   = fromContact ? _projFrames.length - 1 : _projPos - 1
    if (targetPos < 0) return false
    _glideTo(_projFrames[targetPos], { fromContact, frozenPos: targetPos })
    return true
  }

  clearTimeout(_workTimeout);    _workTimeout    = null
  clearTimeout(_studioTimeout);  _studioTimeout  = null
  clearTimeout(_processTimeout); _processTimeout = null

  const onWheel = (e) => {
    // Proyecto abierto → el scroll de fondo (viaje 3D) queda deshabilitado.
    if (isPanelOpen()) return
    // Solo mientras el botón Continue está moviendo la cámara (tween) ignoramos
    // el scroll; el resto del tiempo el scroll maneja todo el journey.
    if (_projGliding) return
    // Kill auto-play tween if running — user takes manual control
    if (_autoPlayTween) { _autoPlayTween.kill(); _autoPlayTween = null }
    // If intro was still playing, kill it and sync scroll to the current camera position
    if (killIntro()) {
      const cur = getAnimationTime()
      scroll = Math.max(scroll, cur)
      t      = Math.min(scroll, freezeTime)
    }

    if (_transitioning) return
    if (performance.now() < _frozenUntil) return

    // Cap per-event deltaY so a fast swipe can't skip the hold zone in one tick
    const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 60)
    // Clamp a >= 0: scrollear hacia atrás al principio se queda en el frame 0
    // (el "loop hacia atrás" al final quedó deshabilitado para que el usuario no
    //  caiga al final de la página sin querer).
    scroll = Math.max(0, Math.min(scrollEnd, scroll + delta * 0.012))

    // Soft brake at the end — accumulate extra forward scroll before looping
    if (scroll >= scrollEnd && delta > 0) _endAccum += Math.abs(delta)
    else if (delta < 0) _endAccum = Math.max(0, _endAccum - Math.abs(delta) * 0.4)

    // Approach freeze: stop at frame 170, show text — release on forward scroll or Continue btn
    if (!_approachDone && scroll >= approachFreezeTime) {
      if (!_approachFrozen) {
        _approachFrozen = true
        scroll = approachFreezeTime
        t = approachFreezeTime
        setAnimationTime(t)
        _scrollFrame = Math.round(approachFreezeTime * fps)
        if (_studioShown) { _studioShown = false; hideSectionText('studio') }
        if (_processHidden) { _processHidden = false; showSectionText('process') }
        return
      }

      if (e.deltaY > 0) {
        // Forward scroll — release freeze and continue normally below
        _approachFrozen = false
        _approachDone   = true
        if (_autoPlayTween?.paused()) {
          _autoPlayTween.resume()
          gsap.to(_autoPlayTween, { timeScale: 1, duration: 1.0, ease: 'power2.in' })
          return
        }
        // Scroll path: fall through so this event moves the camera forward
      } else {
        scroll = approachFreezeTime
        return
      }
    }
    // Scrolling backward past approach — clear frozen state
    if (_approachFrozen && scroll < approachFreezeTime) {
      _approachFrozen = false
    }

    // ── Paradas en proyectos (semillas) ──────────────────────────────────────
    // Al cruzar un proyecto hacia adelante, la cámara se clava ahí. Para seguir:
    // scroll hacia adelante (tras una breve pausa) o el botón Continue. Hacia
    // atrás libera y, al cruzar por debajo, baja de proyecto (re-frena al volver).
    if (_projFrozen) {
      if (delta < 0) {
        _projFrozen = false                                    // scroll atrás → libera
      } else if (performance.now() >= _projFreezeUntil) {
        _projFrozen = false                                    // pasó la pausa → sigue de largo
      } else {
        scroll = _projFrames[_projPos]                         // mantener frenado durante la pausa
      }
    } else {
      // Frame de cada posición (length = Contact) para ubicar _projPos por scroll.
      const _frameAt = (pos) => (pos < _projFrames.length ? _projFrames[pos] : _contactStopTime)
      // Bajar de proyecto al retroceder por debajo del actual (incluye salir de Contact).
      if (delta < 0) {
        while (_projPos > 0 && scroll < _frameAt(_projPos) - PROJ_EPS) _projPos--
      }
      const _aheadPos = _projPos + 1
      if (_aheadPos < _projFrames.length && delta > 0 && scroll >= _projFrames[_aheadPos]) {
        // Frenar al cruzar el próximo proyecto hacia adelante.
        _projPos         = _aheadPos
        _projFrozen      = true
        _projFreezeUntil = performance.now() + PROJ_COOLDOWN
        scroll           = _projFrames[_aheadPos]
      } else if (delta > 0 && scroll >= _contactStopTime - PROJ_EPS) {
        _projPos = _projFrames.length   // llegó a Contact por scroll → Back vuelve al último proyecto
      }
    }

    // Camera: scrub freely until freeze point, then lock
    t = Math.min(scroll, freezeTime)
    setAnimationTime(t)
    _cameraLocked = scroll >= freezeTime

    _scrollFrame = Math.max(0, Math.min(Math.round(scroll * fps), scrollEndFr))

    const progress = scroll / totalRange   // loop fires at 1.0 (frame 364)

    // Chip float: stop at FLOR_GRANDE going forward, re-enable going backward
    if (!_chipStopped && t >= journeyEndTime) {
      _chipStopped = true
      stopChipFloat()
    } else if (_chipStopped && t < journeyEndTime) {
      _chipStopped = false
      enableChipFloat()
    }

    // Studio ↔ Process text — bidirectional
    if (t < studioEndTime && !_studioShown) {
      _studioShown = true
      _processHidden = true
      clearTimeout(_workTimeout);    _workTimeout    = null
      clearTimeout(_processTimeout); _processTimeout = null
      hideSectionText('process')
      hideSectionText('work')
      clearTimeout(_studioTimeout)
      _studioTimeout = setTimeout(() => showSectionText('studio'), 600)
    } else if (t >= studioEndTime && _studioShown) {
      _studioShown = false
      clearTimeout(_studioTimeout); _studioTimeout = null
      hideSectionText('studio')
      if (t < processEndTime) {
        _processHidden = false
        clearTimeout(_processTimeout)
        _processTimeout = setTimeout(() => showSectionText('process'), 600)
      }
    }

    // Process ↔ Work text — bidirectional
    if (t >= processEndTime && !_processHidden) {
      _processHidden = true
      clearTimeout(_processTimeout); _processTimeout = null
      hideSectionText('process')
      _workTimeout = setTimeout(() => showSectionText('work'), 600)
    } else if (t >= studioEndTime && t < processEndTime && _processHidden && !_studioShown) {
      _processHidden = false
      clearTimeout(_workTimeout); _workTimeout = null
      hideSectionText('work')
      clearTimeout(_processTimeout)
      _processTimeout = setTimeout(() => showSectionText('process'), 600)
    }

    // Show Contact only when camera reaches the top, hide Work to avoid overlap
    if (t >= contactShowT && !_contactShown) {
      _contactShown = true
      hideSectionText('work')
      setTimeout(() => showSectionText('contact'), 600)
    } else if (t < contactHideT && _contactShown) {
      _contactShown = false
      hideSectionText('contact')
      setTimeout(() => showSectionText('work'), 600)
    }

    // Loop: fires only after the user scrolls through the hold period + intentional extra scroll
    if (progress >= 1.0 && _endAccum >= 220 && !_transitioning) {
      _transitioning = true
      _seekFn = null
      _stopWheelSmooth()
      window.removeEventListener('wheel', _activeOnWheel)
      // Mobile: remove touch listeners too — sin esto siguen activos y rompen el estado al reiniciar
      _stopInertia()
      if (_activeTouchStart) { window.removeEventListener('touchstart', _activeTouchStart); _activeTouchStart = null }
      if (_activeTouchMove)  { window.removeEventListener('touchmove',  _activeTouchMove);  _activeTouchMove  = null }
      if (_activeTouchEnd)   { window.removeEventListener('touchend',   _activeTouchEnd);   _activeTouchEnd   = null }

      // Reset scene before snapshot so canvas still shows frame 359 (not rendered yet)
      // but the mixer is already at 0 — inner circle will reveal the beginning state
      clearTimeout(_workTimeout);    _workTimeout    = null
      clearTimeout(_studioTimeout);  _studioTimeout  = null
      clearTimeout(_processTimeout); _processTimeout = null

      resetAnimations()     // resets LoopOnce actions + mixer to t=0 (identical to first load)
      resetRootsColor()     // snap color pulse back to initial green before circle opens
      _scrollFrame = 0      // reset counter so it goes back to 000
      enableChipFloat()     // re-enable chip float so the second loop feels identical to the first
      hideButterflies()     // hide butterflies so they don't appear at the start of the next loop
      CONFIG.scroll.sections.filter(s => s.hasText).forEach(s => hideSectionText(s.id))

      // Snap hint to opacity 0 — if the 2400ms timeout fired while navigating away,
      // the hint would otherwise remain visible during the circle transition.
      const _hintEl = document.getElementById('scroll-hint')
      if (_hintEl) { gsap.killTweensOf(_hintEl); gsap.set(_hintEl, { opacity: 0 }); _hintEl.style.pointerEvents = 'none' }

      // Snap pollen text to opacity 0 instantly — the 0.5s fade from hideSectionText('contact')
      // runs concurrently with the circle, making pollen visible through the transparent interior.
      const _pollenEl = document.getElementById('pollen-text')
      if (_pollenEl) gsap.set(_pollenEl, { opacity: 0 })

      // Start orbit NOW — hidden behind the circle transition (same as first load hidden by loader)
      playIntroCameraOrbit()
      playOneShot('/audio/Start.mp3', 0.8)

      const origin = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      playCircleOpen(getRenderer().domElement, origin, {
        duration:   2.0,   // match orbit duration (2s) so camera settles as circle opens
        onComplete: () => {
          resetBeginButton()
        },
      })
    }
  }

  // El listener crudo acumula el deltaY (capeado igual que antes, así NO avanza
  // más rápido); un rAF lo drena en pasos chicos hacia onWheel → la rueda deja
  // de ir a tirones. El step por frame está clampeado para que nunca salte.
  const WHEEL_SENS  = 0.38   // sensibilidad: <1 = cuesta más avanzar (menos distancia por notch)
  const WHEEL_DRAIN = 0.2    // fracción drenada por frame (ease-out)
  const WHEEL_STEP  = 8      // tope de deltaY alimentado por frame → sin saltos
  const _wheelSmooth = () => {
    let step = _wheelAccum * WHEEL_DRAIN
    step = Math.sign(step) * Math.min(Math.abs(step), WHEEL_STEP)
    if (Math.abs(_wheelAccum) > 0.5) {
      _wheelAccum -= step
      onWheel({ deltaY: step })
      _wheelRaf = requestAnimationFrame(_wheelSmooth)
    } else {
      _wheelAccum = 0
      _wheelRaf   = null
    }
  }
  const WHEEL_BUFMAX = 140   // tope del buffer → sin momentum de arrastre excesivo
  const _onWheelRaw = (e) => {
    if (isPanelOpen()) return
    // Capea cada evento (60) y aplica sensibilidad → cuesta más avanzar, sin trancar.
    _wheelAccum += Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 60) * WHEEL_SENS
    _wheelAccum = Math.max(-WHEEL_BUFMAX, Math.min(WHEEL_BUFMAX, _wheelAccum))
    if (!_wheelRaf) _wheelRaf = requestAnimationFrame(_wheelSmooth)
  }

  _stopWheelSmooth()
  _activeOnWheel = _onWheelRaw
  window.removeEventListener('wheel', _activeOnWheel)
  window.addEventListener('wheel', _activeOnWheel, { passive: true })

  // ── Touch support for mobile — con inercia ───────────────────────────────────
  const TOUCH_SENS = 0.7  // <1 = cuesta más avanzar en mobile (antes era 1.2)
  let _touchY   = null
  let _touchVel = 0       // velocity en px/frame

  const _stopInertia = () => {
    if (_inertiaRafId) { cancelAnimationFrame(_inertiaRafId); _inertiaRafId = null }
  }

  const _runInertia = () => {
    _touchVel *= 0.88                         // decay — 0.88 ≈ se detiene en ~400ms
    if (Math.abs(_touchVel) > 0.3) {
      onWheel({ deltaY: _touchVel * TOUCH_SENS })
      _inertiaRafId = requestAnimationFrame(_runInertia)
    } else {
      _inertiaRafId = null
    }
  }

  // Remove OLD listeners BEFORE reassigning — otherwise removeEventListener gets the new fn
  if (_activeTouchStart) window.removeEventListener('touchstart', _activeTouchStart)
  if (_activeTouchMove)  window.removeEventListener('touchmove',  _activeTouchMove)
  if (_activeTouchEnd)   window.removeEventListener('touchend',   _activeTouchEnd)

  _activeTouchStart = (e) => {
    if (isPanelOpen()) return                   // proyecto abierto → sin scroll de fondo
    if (_projGliding) return                    // botón Continue moviendo la cámara
    if (_scrollBlocked) return                  // interactuando con la flor → no scrollear
    if (e.target.closest('#pollen-text')) return
    _stopInertia()
    _touchVel = 0
    _touchY   = e.touches[0].clientY
  }

  _activeTouchMove = (e) => {
    if (isPanelOpen()) { _touchY = null; return }    // proyecto abierto → sin scroll de fondo
    if (_projGliding)  { _touchY = null; return }    // botón Continue moviendo la cámara
    if (_scrollBlocked) { _touchY = null; return }   // interactuando con la flor → no scrollear
    if (_touchY === null) return
    const y  = e.touches[0].clientY
    const dy = _touchY - y                    // positivo = swipe arriba = avanzar
    _touchY  = y
    _touchVel = dy                            // guarda velocidad para inercia
    if (Math.abs(dy) > 0.3) onWheel({ deltaY: dy * TOUCH_SENS })
  }

  _activeTouchEnd = () => {
    _touchY = null
    _stopInertia()
    if (Math.abs(_touchVel) > 1) _inertiaRafId = requestAnimationFrame(_runInertia)
  }

  window.addEventListener('touchstart', _activeTouchStart, { passive: true })
  window.addEventListener('touchmove',  _activeTouchMove,  { passive: true })
  window.addEventListener('touchend',   _activeTouchEnd,   { passive: true })

  console.log('[Journey] wheel scroll | freeze frame:', freezeFr, '(t=', freezeTime?.toFixed(3), ') | loop frame:', scrollEndFr, '(t=', scrollEnd?.toFixed(3), ')')
}

let _contactTransitioning = false

export function jumpToContactFromStart() {
  if (_contactTransitioning) return
  _contactTransitioning = true
  stopJourney()

  const fullDur = getAnimationDuration()
  if (!fullDur) { _contactTransitioning = false; return }

  const fps        = CONFIG.scroll.totalFrames / fullDur
  const freezeTime = (CONFIG.journey.scrollFreezeFrame ?? CONFIG.scroll.totalFrames) / fps

  CONFIG.scroll.sections.filter(s => s.hasText).forEach(s => hideSectionText(s.id))
  const _pollenEl = document.getElementById('pollen-text')
  if (_pollenEl) gsap.set(_pollenEl, { opacity: 0 })

  setAnimationTime(freezeTime)

  const origin = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  playCircleOpen(getRenderer().domElement, origin, {
    duration: 2.0,
    onComplete: () => {
      _contactTransitioning = false
      showSectionText('contact')
      enableEndScroll(0, freezeTime)
    },
  })
}

export function restartLoop() {
  stopJourney()
  _seekFn      = null
  _scrollFrame = 0

  resetAnimations()
  resetRootsColor()
  enableChipFloat()
  hideButterflies()

  CONFIG.scroll.sections.filter(s => s.hasText).forEach(s => hideSectionText(s.id))

  const _pollenEl = document.getElementById('pollen-text')
  if (_pollenEl) gsap.set(_pollenEl, { opacity: 0 })

  playIntroCameraOrbit()
  playOneShot('/audio/Start.mp3', 0.8)

  const origin = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  playCircleOpen(getRenderer().domElement, origin, {
    duration:   2.0,
    onComplete: () => { resetBeginButton() },
  })
}

export function startJourney(onComplete, onAutoPlayEnd) {
  const fullDur            = getAnimationDuration()
  const fps                = CONFIG.scroll.totalFrames / fullDur
  const introEndTime       = getIntroEndTime()
  const targetTime         = CONFIG.journey.autoPlayEndFrame / fps
  const chipStopTime       = CONFIG.journey.endFrame / fps  // frame 249 — FLOR_GRANDE
  const approachFreezeTime = (CONFIG.journey.approachFreezeFrame ?? 170) / fps
  const approachDecelTime  = approachFreezeTime - (55 / fps)   // start decelerating 55 frames before

  // Reset approach freeze state for a fresh journey
  _approachFrozen = false
  _approachDone   = false
  // Reset project-stop state (por si quedó de un loop anterior)
  if (_projectTween) { _projectTween.kill(); _projectTween = null }
  _projGliding   = false

  hideSectionText('studio')
  setTimeout(() => showSectionText('process'), 600)
  onComplete?.()

  // Auto-play at constant speed from intro end → frame 258
  let _processHandled  = false
  let _chipHandled     = false
  let _approachHandled = false
  _approachDecelling   = false

  const proxy = { t: introEndTime }
  _autoPlayTween = gsap.to(proxy, {
    t:        targetTime,
    duration: CONFIG.journey.duration,
    ease:     'power2.out',
    onUpdate() {
      // Cap at freeze frame while decelerating
      if (_approachDecelling) {
        proxy.t = Math.min(proxy.t, approachFreezeTime)
      }
      setAnimationTime(proxy.t)

      // Approach: start smooth deceleration 30 frames before freeze point
      if (!_approachDone && !_approachHandled && proxy.t >= approachDecelTime) {
        _approachHandled   = true
        _approachDecelling = true
        gsap.to(_autoPlayTween, {
          timeScale: 0,
          duration:  2.8,
          ease:      'power4.out',
          onComplete() {
            _approachFrozen = true
            _autoPlayTween?.pause()
            _approachDecelling = false
          },
        })
        return
      }

      // Chip float stops at FLOR_GRANDE (frame 249)
      if (!_chipHandled && proxy.t >= chipStopTime) {
        _chipHandled = true
        stopChipFloat()
      }

      // Swap process → work text as we pass frame 249
      if (!_processHandled && proxy.t >= chipStopTime) {
        _processHandled = true
        hideSectionText('process')
        setTimeout(() => showSectionText('work'), 600)
      }
    },
    onComplete() {
      _autoPlayTween = null
      onAutoPlayEnd?.()
      // Set up fresh scroll from where auto-play landed
      enableEndScroll(targetTime)
    },
  })
}
