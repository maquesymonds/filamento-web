// scroll.js — Section text overlays con TypeShuffle en heading + cada línea

import gsap from 'gsap'
import { TypeShuffle } from './type-shuffle.js'
import { CONFIG } from './config.js'
import { playSectionAudio } from './sectionAudio.js'
import { setRadialActive } from './radialNav.js'
import { showPollenText, hidePollenText } from './pollenText.js'
import { getCamera } from './experience.js'

// Aviso "copied" que SIGUE al mouse (así no queda tapado por la caja del mail),
// con la tipografía del sitio. Se desvanece solo después de ~1.4s.
function _showCopyToast(text, x, y) {
  const t = document.createElement('div')
  t.textContent = text
  t.style.cssText = [
    'position:fixed',
    "font-family:'Chakra Petch', sans-serif", 'font-weight:300', 'font-size:12px',
    'letter-spacing:0.18em', 'text-transform:uppercase', 'color:rgba(255,255,255,0.92)',
    'text-shadow:0 0 10px rgba(77,217,192,0.65), 0 0 24px rgba(77,217,192,0.28)',
    'white-space:nowrap', 'pointer-events:none', 'z-index:99999',
    'opacity:0', 'transition:opacity 0.18s ease',
  ].join(';')
  const _move = (cx, cy) => { t.style.left = (cx + 14) + 'px'; t.style.top = (cy - 6) + 'px' }
  _move(x, y)
  document.body.appendChild(t)
  const _onMove = (e) => _move(e.clientX, e.clientY)
  window.addEventListener('mousemove', _onMove)
  requestAnimationFrame(() => { t.style.opacity = '1' })
  setTimeout(() => {
    t.style.opacity = '0'
    window.removeEventListener('mousemove', _onMove)
    setTimeout(() => t.remove(), 300)
  }, 1400)
}

// ── fx2 scramble effect for contact items ────────────────────────────────────
const _FX2 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=[]{};<>,0123456789'

function _initContactFx2(el) {
  const text = el.textContent
  el.innerHTML = [...text].map(ch =>
    `<i style="font-style:normal;display:inline-block">${ch === ' ' ? '&nbsp;' : ch}</i>`
  ).join('')
  const chars    = [...el.querySelectorAll('i')]
  const originals = chars.map(c => c.innerHTML)
  let _running = false

  el.addEventListener('mouseenter', () => {
    if (_running) return
    _running = true
    let done = 0
    chars.forEach((c, i) => {
      let iter = 0
      setTimeout(() => {
        const tick = () => {
          if (iter === 9) {
            c.innerHTML = originals[i]
            if (++done === chars.length) _running = false
          } else {
            c.innerHTML = _FX2[Math.floor(Math.random() * _FX2.length)]
            iter++
            setTimeout(tick, 30)
          }
        }
        tick()
      }, (i + 1) * 20)
    })
  })
}

// Work section FOV bump — mobile only (desktop stays as designed)
const WORK_FOV_MULT  = 1.12
const _IS_MOBILE     = window.matchMedia('(max-width: 768px)').matches
let _baseFov = null

// sectionId → block DOM element
const _blocks = {}
// sectionId → TypeShuffle[] (one per h2 + each p)
const _shuffles = {}
// sectionId → pending go-back reveal timer
const _goBackTimers = {}
// which section is currently visible (if any)
let _visibleSection = null

export function initScroll() {
  const layer = document.getElementById('scroll-text-layer')
  if (!layer) return

  CONFIG.scroll.sections
    .filter(s => s.hasText)
    .forEach(s => {
      const copy = CONFIG.scrollCopy[s.id]
      if (!copy) return

      const block = document.createElement('div')
      block.id = `text-${s.id}`
      block.className = 'scroll-text-block'

      if (copy.items?.length) {
        // ── Contact bracket items layout ─────────────────────────────
        block.classList.add('scroll-text-block--contact')
        const itemsRow = document.createElement('div')
        itemsRow.className = 'contact-items'
        copy.items.forEach(item => {
          const el = document.createElement('a')
          el.className = 'contact-item'
          el.href = item.href
          const isMail = /^mailto:/i.test(item.href)
          // mailto: NO debe abrir en pestaña nueva (deja pestaña en blanco). Solo http(s).
          if (!isMail) {
            el.target = '_blank'
            el.rel = 'noopener noreferrer'
          }
          // En DESKTOP el mailto suele no hacer nada (sin cliente de mail). Copiamos
          // el mail al portapapeles + aviso. En mobile se deja el mailto (funciona).
          if (isMail && !_IS_MOBILE) {
            const email = item.href.replace(/^mailto:/i, '')
            el.addEventListener('click', (e) => {
              e.preventDefault()
              navigator.clipboard?.writeText(email).catch(() => {})
              _showCopyToast('copied', e.clientX, e.clientY)
            })
          }
          el.textContent = `[ ${item.label} ]`
          itemsRow.appendChild(el)
        })
        block.appendChild(itemsRow)
      } else {
        // ── Standard heading + lines layout ──────────────────────────
        const heading = document.createElement('h2')
        heading.className = 'scroll-text-heading'
        heading.innerHTML = copy.heading
        block.appendChild(heading)

        const linesWrap = document.createElement('div')
        linesWrap.className = 'scroll-text-lines'
        const lines = (_IS_MOBILE && copy.mobileLines) ? copy.mobileLines : copy.lines
        lines.forEach(text => {
          const p = document.createElement('p')
          p.className = 'scroll-text-line'
          p.textContent = text
          linesWrap.appendChild(p)
        })
        block.appendChild(linesWrap)
      }

      layer.appendChild(block)

      _blocks[s.id] = block
      _shuffles[s.id] = Array.from(block.querySelectorAll('h2, p, .contact-item')).map(el => new TypeShuffle(el))

      if (s.id === 'contact') {
        _shuffles[s.id].forEach(ts => {
          ts.DOM.el.addEventListener('mouseenter', () => {
            if (!ts.isAnimating) ts.trigger('fx3')
          })
        })
      }
    })
}

function _applyWorkFov(entering) {
  if (!_IS_MOBILE) return
  const cam = getCamera()
  if (!cam) return
  if (entering) {
    _baseFov = cam.fov
    gsap.to(cam, { fov: _baseFov * WORK_FOV_MULT, duration: 1.2, ease: 'power2.inOut',
      onUpdate() { cam.updateProjectionMatrix() } })
  } else if (_baseFov !== null) {
    gsap.to(cam, { fov: _baseFov, duration: 1.0, ease: 'power2.inOut',
      onUpdate() { cam.updateProjectionMatrix() } })
    _baseFov = null
  }
}

const _discoverEl = () => document.getElementById('scroll-discover')

export function showSectionText(sectionId) {
  if (sectionId === 'contact') showPollenText()
  else hidePollenText()

  if (sectionId === 'work') _applyWorkFov(true)

  if (sectionId === 'studio') {
    const d = _discoverEl()
    if (d) { gsap.killTweensOf(d); gsap.to(d, { opacity: 1, duration: 1.2, ease: 'power2.out', delay: 0.5 }) }
  }

  _visibleSection = sectionId

  // Ensure no other section leaks through — hard-cut all others off
  Object.keys(_blocks).forEach(id => {
    if (id === sectionId) return
    const b = _blocks[id]
    if (b) { gsap.killTweensOf(b); gsap.set(b, { autoAlpha: 0 }) }
  })

  const block = _blocks[sectionId]
  if (!block) return

  gsap.killTweensOf(block)
  clearTimeout(_goBackTimers[sectionId])

  playSectionAudio(sectionId)
  setRadialActive(sectionId)

  requestAnimationFrame(() => {
    const shuffles = _shuffles[sectionId]
    if (shuffles) {
      shuffles.forEach(ts => { ts._lockWidths(); ts._preScramble() })
    }
    gsap.set(block, { autoAlpha: 1 })
    if (shuffles) {
      shuffles.forEach((ts, i) => setTimeout(() => ts.trigger('fx5'), i * 200))
    }

    // Reveal go-back + continue buttons smoothly after a short delay
    const navBtns = Array.from(block.querySelectorAll('.go-back-btn, .continue-btn'))
    navBtns.forEach(b => { gsap.killTweensOf(b); gsap.set(b, { opacity: 0 }); b.style.pointerEvents = 'none' })
    _goBackTimers[sectionId] = setTimeout(() => {
      navBtns.forEach(b => { gsap.to(b, { opacity: 1, duration: 0.7, ease: 'power2.out' }); b.style.pointerEvents = 'auto' })
    }, 2500)
  })
}

export function hideSectionText(sectionId) {
  if (sectionId === 'contact') hidePollenText()
  if (sectionId === 'work') _applyWorkFov(false)

  if (sectionId === 'studio') {
    const d = _discoverEl()
    if (d) { gsap.killTweensOf(d); gsap.to(d, { opacity: 0, duration: 0.5, ease: 'power2.in' }) }
  }

  if (_visibleSection === sectionId) _visibleSection = null

  const block = _blocks[sectionId]
  if (!block) return

  clearTimeout(_goBackTimers[sectionId])

  gsap.killTweensOf(block)
  gsap.to(block, { autoAlpha: 0, duration: 0.55, ease: 'power2.in' })

  // Reset nav buttons instantly so they're hidden when section re-appears
  block.querySelectorAll('.go-back-btn, .continue-btn').forEach(b => {
    gsap.killTweensOf(b)
    gsap.set(b, { opacity: 0 })
    b.style.pointerEvents = 'none'
  })
}

// Hide all section text blocks, then call onDone once the fade completes.
// If no section was visible the callback fires immediately (no wait needed).
export function hideAllSectionText(onDone) {
  const hadVisible = _visibleSection !== null
  Object.keys(_blocks).forEach(id => hideSectionText(id))
  if (hadVisible) {
    setTimeout(onDone, 580)   // just past the 550ms fade-out
  } else {
    onDone()
  }
}
