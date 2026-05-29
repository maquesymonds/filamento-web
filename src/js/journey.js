// journey.js — Scroll-driven camera journey
// Clicking "Begin the journey" auto-plays the camera from frame 25 → 258 at
// constant speed, then hands scroll control to the user until frame 364.

import gsap                                               from 'gsap'
import { CONFIG }                                         from './config.js'
import { setAnimationTime, getAnimationTime, getAnimationDuration, getIntroEndTime, stopChipFloat, enableChipFloat, resetAnimations, playIntroCameraOrbit } from './experience.js'
import { showSectionText, hideSectionText }               from './scroll.js'
import { playCircleOpen }                                 from './circleTransition.js'
import { resetBeginButton }                               from './ui.js'
import { getRenderer }                                    from './scene.js'
import { resetRootsColor }                                 from './materials.js'
import { playOneShot }                                     from './audio.js'
import { hideButterflies }                                 from './butterflies.js'

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
let _seekFn        = null
let _autoPlayTween = null
let _activeOnWheel = null

// Approach freeze — frame 170 stops the scroll until user clicks Continue
let _approachFrozen    = false
let _approachDone      = false
let _approachDecelling = false

// Returns true if the auto-play tween was resumed (caller should NOT also jump).
// Returns false if no tween was active (caller should jump to Work manually).
export function releaseApproachFreeze() {
  _approachFrozen    = false
  _approachDone      = true
  _approachDecelling = false

  if (_autoPlayTween) {
    // Kill any active deceleration tween and re-accelerate regardless of paused state
    gsap.killTweensOf(_autoPlayTween)
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
  if (_autoPlayTween) { _autoPlayTween.kill(); _autoPlayTween = null }
  if (_activeOnWheel) { window.removeEventListener('wheel', _activeOnWheel); _activeOnWheel = null }
  _seekFn = null
  _approachFrozen = false
}

// Temporarily block the scroll listener — call after closing the project panel
// so residual wheel events don't bleed into the journey.
let _frozenUntil = 0
export function freezeScroll(ms = 800) {
  _frozenUntil = performance.now() + ms
}

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

  let _workTimeout = null

  const onWheel = (e) => {
    // Kill auto-play tween if running — user takes manual control
    if (_autoPlayTween) { _autoPlayTween.kill(); _autoPlayTween = null }

    if (_transitioning) return
    if (performance.now() < _frozenUntil) return

    // Cap per-event deltaY so a fast swipe can't skip the hold zone in one tick
    const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 60)
    scroll = Math.min(scrollEnd, scroll + delta * 0.012)

    // Soft brake at the end — accumulate extra forward scroll before looping
    if (scroll >= scrollEnd && delta > 0) _endAccum += Math.abs(delta)
    else if (delta < 0) _endAccum = Math.max(0, _endAccum - Math.abs(delta) * 0.4)

    // Backward loop: user scrolls up past the very beginning
    if (scroll < 0 && !_transitioning) {
      _transitioning = true
      _seekFn = null
      window.removeEventListener('wheel', onWheel)

      CONFIG.scroll.sections.filter(s => s.hasText).forEach(s => hideSectionText(s.id))
      const _pollenEl = document.getElementById('pollen-text')
      if (_pollenEl) gsap.set(_pollenEl, { opacity: 0 })

      setAnimationTime(freezeTime)

      const origin = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      playCircleOpen(getRenderer().domElement, origin, {
        duration: 2.0,
        onComplete: () => {
          showSectionText('contact')
          enableEndScroll(0, freezeTime)
        },
      })
      return
    }

    scroll = Math.max(0, scroll)

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
      clearTimeout(_workTimeout)
      _workTimeout = null
      hideSectionText('process')
      hideSectionText('work')
      showSectionText('studio')
    } else if (t >= studioEndTime && _studioShown) {
      _studioShown = false
      hideSectionText('studio')
      if (t < processEndTime) {
        _processHidden = false
        showSectionText('process')
      }
    }

    // Process ↔ Work text — bidirectional
    if (t >= processEndTime && !_processHidden) {
      _processHidden = true
      hideSectionText('process')
      _workTimeout = setTimeout(() => showSectionText('work'), 600)
    } else if (t >= studioEndTime && t < processEndTime && _processHidden && !_studioShown) {
      _processHidden = false
      clearTimeout(_workTimeout)
      _workTimeout = null
      hideSectionText('work')
      showSectionText('process')
    }

    // Show Contact only when camera reaches the top, hide Work to avoid overlap
    if (t >= contactShowT && !_contactShown) {
      _contactShown = true
      hideSectionText('work')
      showSectionText('contact')
    } else if (t < contactHideT && _contactShown) {
      _contactShown = false
      hideSectionText('contact')
      showSectionText('work')
    }

    // Loop: fires only after the user scrolls through the hold period + intentional extra scroll
    if (progress >= 1.0 && _endAccum >= 220 && !_transitioning) {
      _transitioning = true
      _seekFn = null
      window.removeEventListener('wheel', onWheel)

      // Reset scene before snapshot so canvas still shows frame 359 (not rendered yet)
      // but the mixer is already at 0 — inner circle will reveal the beginning state
      resetAnimations()     // resets LoopOnce actions + mixer to t=0 (identical to first load)
      resetRootsColor()     // snap color pulse back to initial green before circle opens
      _scrollFrame = 0      // reset counter so it goes back to 000
      enableChipFloat()     // re-enable chip float so the second loop feels identical to the first
      hideButterflies()     // hide butterflies so they don't appear at the start of the next loop
      CONFIG.scroll.sections.filter(s => s.hasText).forEach(s => hideSectionText(s.id))

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

  _activeOnWheel = onWheel
  window.removeEventListener('wheel', _activeOnWheel)   // no duplicates
  window.addEventListener('wheel', _activeOnWheel, { passive: true })
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

  hideSectionText('studio')
  showSectionText('process')
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
    ease:     CONFIG.journey.ease,
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
