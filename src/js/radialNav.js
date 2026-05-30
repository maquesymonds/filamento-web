// ═══════════════════════════════════════════════════════════════════
//  radialNav.js — Radial / orbital right-side navigation experiment.
//  Toggle: add/remove class "use-radial-nav" on <body>.
//  Original #nav-pill is untouched — hidden via CSS when class active.
// ═══════════════════════════════════════════════════════════════════

import gsap from 'gsap'
import { CONFIG } from './config.js'
import { setAnimationTime, getAnimationTime, getAnimationDuration, getCamera } from './experience.js'
import { showSectionText, hideSectionText, hideAllSectionText } from './scroll.js'
import { jumpScrollTo, stopJourney } from './journey.js'
import { startJungle } from './audio.js'
import { resetBeginButton, hideHeroText } from './ui.js'
import { transitionRootsColorBack } from './materials.js'
import { playCircleOpen } from './circleTransition.js'
import { getRenderer } from './scene.js'
import { showButterflies } from './butterflies.js'

const _sections  = CONFIG.scroll.sections.filter(s => s.hasText)
const _nav       = document.getElementById('radial-nav')
const _items     = document.querySelectorAll('.rn-item')
const _soundNode = document.getElementById('radial-sound-node')

// ── Active state ──────────────────────────────────────────────────────────────
function _setActive(sectionId) {
  _items.forEach(btn =>
    btn.classList.toggle('active', btn.dataset.section === sectionId)
  )
}

function _clearActive() {
  _items.forEach(btn => btn.classList.remove('active'))
}

// ── Go to start (mirrors navPill logic) ───────────────────────────────────────
function _goToStart() {
  stopJourney()
  _sections.forEach(s => hideSectionText(s.id))
  _clearActive()

  const fromT = getAnimationTime()
  if (fromT > 0.001) {
    const proxy = { t: fromT }
    gsap.to(proxy, {
      t: 0,
      duration: 2.4,
      ease: 'power1.inOut',
      onUpdate() { setAnimationTime(proxy.t) },
    })
  } else {
    setAnimationTime(0)
  }

  transitionRootsColorBack(1.2, 'power2.inOut')
  resetBeginButton()
}

// ── Jump to section ───────────────────────────────────────────────────────────
function _jumpTo(sectionId) {
  const section = _sections.find(s => s.id === sectionId)
  if (!section) return

  const duration = getAnimationDuration()
  if (!duration) return

  const frame = section.navFrame ?? section.startFrame
  const t     = (frame / CONFIG.scroll.totalFrames) * duration

  stopJourney()
  hideHeroText()
  startJungle()

  const beginBtn   = document.getElementById('begin-btn')
  const scrollHint = document.getElementById('scroll-hint')
  if (beginBtn) { beginBtn.style.opacity = '0'; beginBtn.style.pointerEvents = 'none' }
  if (scrollHint) { gsap.killTweensOf(scrollHint); gsap.set(scrollHint, { opacity: 0 }); scrollHint.style.pointerEvents = 'none' }

  // Snap ALL text blocks + pollen to opacity 0 instantly before snapshot —
  // fadeout (0.55s) would bleed the old section text through the circle transition.
  document.querySelectorAll('.scroll-text-block').forEach(el => {
    gsap.killTweensOf(el)
    gsap.set(el, { opacity: 0 })
  })
  const _pollenEl = document.getElementById('pollen-text')
  if (_pollenEl) { gsap.killTweensOf(_pollenEl); gsap.set(_pollenEl, { opacity: 0 }) }
  const _discoverEl = document.getElementById('scroll-discover')
  if (_discoverEl) { gsap.killTweensOf(_discoverEl); gsap.set(_discoverEl, { opacity: 0 }) }

  setAnimationTime(t)

  const origin = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  playCircleOpen(getRenderer().domElement, origin, {
    duration: 1.4,
    onComplete: () => {
      if (sectionId === 'studio') {
        if (scrollHint) {
          scrollHint.style.pointerEvents = 'auto'
          gsap.to(scrollHint, { opacity: 1, duration: 0.5, ease: 'power2.out' })
        }
      } else {
        jumpScrollTo(t)
      }
      if (sectionId === 'process') showButterflies(getCamera())
      showSectionText(sectionId)
      _setActive(sectionId)
    },
  })
}

// ── Sound node — delegates click to original #sound-toggle ────────────────────
function _initSoundNode() {
  if (!_soundNode) return
  const _realToggle = document.getElementById('sound-toggle')

  _soundNode.addEventListener('click', () => _realToggle?.click())
  _soundNode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _realToggle?.click() }
  })

  // Mirror mute state visually
  window.addEventListener('filamento:mute',   () => _soundNode.classList.add('muted'))
  window.addEventListener('filamento:unmute', () => _soundNode.classList.remove('muted'))
}

// ── Public: sync active state from outside (journey, scroll) ─────────────────
export function setRadialActive(sectionId) { _setActive(sectionId) }
export function clearRadialActive()        { _clearActive() }

// ── Hamburger (mobile) ────────────────────────────────────────────────────────
function _initHamburger() {
  const btn  = document.getElementById('hamburger-btn')
  const menu = document.getElementById('hamburger-menu')
  if (!btn || !menu) return

  btn.addEventListener('click', () => {
    const isOpen = menu.classList.contains('open')
    menu.classList.toggle('open', !isOpen)
    btn.classList.toggle('open', !isOpen)
  })

  menu.querySelectorAll('.hm-item').forEach(item => {
    item.addEventListener('click', () => {
      _jumpTo(item.dataset.section)
      menu.classList.remove('open')
      btn.classList.remove('open')
    })
  })
}

// ── Public init ───────────────────────────────────────────────────────────────
export function initRadialNav() {
  if (!_nav) return

  _items.forEach(btn => {
    btn.addEventListener('click', () => _jumpTo(btn.dataset.section))
  })

  _initSoundNode()
  _initHamburger()

  // Expose _goToStart so navPill's setIconClickFn can be overridden if needed
  _nav.dataset.goToStart = 'true'
  _nav._goToStart = _goToStart
}
