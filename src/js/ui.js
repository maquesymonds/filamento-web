// ui.js — Loader, hero overlay, reveal

import gsap from 'gsap'
import { TypeShuffle } from './type-shuffle.js'

let _taglineShuffle = null

export function setLoadProgress(_progress) { /* loader removed */ }

export function hideLoader() {
  return Promise.resolve()
}

export function revealHero() {
  const overlay = document.getElementById('hero-overlay')
  const btn     = document.getElementById('begin-btn')
  const brand   = document.querySelector('.brand-name')
  const tagline = document.querySelector('.hero-tagline')

  if (overlay) gsap.to(overlay, { opacity: 1, duration: 1.0, ease: 'power2.out' })
  if (btn)     gsap.to(btn,     { opacity: 1, duration: 0.8, delay: 0.8, ease: 'power2.out' })

  // Slide up from below the #hero-brand overflow:hidden mask
  if (brand) gsap.fromTo(brand, { y: '220%' }, { y: 0, duration: 2.4, ease: 'expo.out', delay: 0.35, force3D: true })

  if (tagline) {
    if (!_taglineShuffle) _taglineShuffle = new TypeShuffle(tagline)
    // Pre-scramble while invisible: lock widths + fill with colored random chars (opacity:0 per cell)
    // Same pattern as showSectionText — browser never paints the original white text
    _taglineShuffle._lockWidths()
    _taglineShuffle._preScramble()
    gsap.set(tagline, { opacity: 1 })
    setTimeout(() => _taglineShuffle.trigger('fx5'), 400)
  }
}

// onActivate: callback que se llama al hacer click. Persiste entre loops.
let _btnActivated = false
let _btnClickHandler = null
let _onIconClick = () => window.location.reload()

// Allows navPill.js to override the logo/icon click without circular imports.
export function setIconClickFn(fn) { _onIconClick = fn }

export function setupBeginButton(onActivate) {
  const btn   = document.getElementById('begin-btn')
  const hint  = document.getElementById('scroll-hint')
  const brand = document.querySelector('.brand-name')

  if (!btn) { onActivate?.(); return }

  _btnClickHandler = () => {
    if (_btnActivated) return
    _btnActivated = true
    btn.disabled  = true

    const tagline = document.querySelector('.hero-tagline')
    const icon    = document.getElementById('brand-icon')

    // ── Both texts slide down through the hero-brand mask ───────────
    // hero-brand has overflow:hidden — texts clip at its bottom edge.
    // ease: power3.in = accelerating fall, like gravity.
    // overwrite: true kills the resetBeginButton y→0 tween if Start is clicked early.
    if (tagline) gsap.to(tagline, { y: 80,  duration: 0.42, ease: 'power3.in', overwrite: true })
    if (brand)   gsap.to(brand,   { y: 180, duration: 0.58, ease: 'power3.in', overwrite: true,
      onComplete() {
        const wordmark = document.getElementById('brand-wordmark')

        // ── Star icon fades in after texts exit ─────────────────────
        if (icon) {
          icon.classList.add('is-visible')
          gsap.fromTo(icon, { opacity: 0, y: -8 }, { opacity: 0.9, y: 0, duration: 0.55, ease: 'power2.out' })
          icon.addEventListener('click', () => _onIconClick(), { once: true })
        }

        // ── Small centered wordmark fades in alongside the icon ──────
        if (wordmark) {
          gsap.fromTo(wordmark, { opacity: 0, y: -6 }, { opacity: 0.7, y: 0, duration: 0.55, ease: 'power2.out' })
        }
      },
    })

    // ── Start button disappears ───────────────────────────────────────
    gsap.to(btn, {
      opacity:    0,
      duration:   0.4,
      ease:       'power2.in',
      onComplete: () => { btn.style.display = 'none' },
    })

    // ── "Begin the journey" appears after the intro camera move ──────
    setTimeout(() => {
      if (hint) {
        hint.style.pointerEvents = 'auto'
        gsap.to(hint, { opacity: 1, duration: 0.8, ease: 'power2.out' })
      }
    }, 2400)

    onActivate?.()
  }

  btn.addEventListener('click', _btnClickHandler)
}

// Hides brand + tagline instantly — called when jumping to a section via nav.
export function hideHeroText() {
  const brand   = document.querySelector('.brand-name')
  const tagline = document.querySelector('.hero-tagline')
  if (brand)   gsap.set(brand,   { y: 180 })
  if (tagline) gsap.set(tagline, { y: 80 })
}

// Llamado desde el loop al volver al inicio — resetea el botón Start.
export function resetBeginButton() {
  _btnActivated = false
  // Hide radial nav — shown again only after next Start press
  document.getElementById('radial-nav')?.classList.remove('rn-active')
  // Hide hamburger on mobile — re-shown after next Start press
  const _hbBtn = document.getElementById('hamburger-btn')
  if (_hbBtn) { gsap.set(_hbBtn, { opacity: 0 }); _hbBtn.style.pointerEvents = 'none' }
  const btn     = document.getElementById('begin-btn')
  const hint    = document.getElementById('scroll-hint')
  const brand   = document.querySelector('.brand-name')
  const tagline = document.querySelector('.hero-tagline')
  const icon    = document.getElementById('brand-icon')

  // Snap brand below the mask, then animate up — identical to first load
  if (brand) {
    gsap.set(brand, { y: '220%', opacity: 1 })
    gsap.to(brand, { y: 0, duration: 2.4, ease: 'expo.out', delay: 0.2, force3D: true })
  }
  if (tagline) {
    gsap.set(tagline, { y: 0, opacity: 0 })
    if (_taglineShuffle) {
      _taglineShuffle._lockWidths()
      _taglineShuffle._preScramble()
      gsap.set(tagline, { opacity: 1 })
      setTimeout(() => _taglineShuffle.trigger('fx5'), 500)
    } else {
      gsap.set(tagline, { opacity: 1 })
    }
  }

  // Hide star icon + wordmark
  if (icon) {
    icon.classList.remove('is-visible')
    gsap.set(icon, { clearProps: 'opacity,y' })
  }
  const wordmark = document.getElementById('brand-wordmark')
  if (wordmark) gsap.set(wordmark, { opacity: 0, y: 0 })

  if (btn) {
    btn.style.display       = ''
    btn.style.pointerEvents = ''   // clear inline override set by _jumpTo in navPill/radialNav
    btn.disabled            = false
    gsap.fromTo(btn, { opacity: 0 }, { opacity: 1, duration: 0.8, delay: 0.4, ease: 'power2.out' })
  }
  if (hint) {
    hint.style.pointerEvents = 'none'
    gsap.to(hint, { opacity: 0, duration: 0.3 })
  }
}
