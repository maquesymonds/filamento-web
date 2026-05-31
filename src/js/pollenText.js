// pollenText.js — Floating scattered letters above the Contact flower.
// Each letter has its own vertical offset + CSS float animation.
// Mouse proximity pushes letters away (repulsion via GSAP + CSS vars).

import gsap from 'gsap'

const _IS_MOBILE = window.matchMedia('(max-width: 768px)').matches
const PHRASE  = _IS_MOBILE ? 'CLICK THE POLLEN' : 'PLAY WITH THE POLLEN'
const RADIUS  = 130   // px — repulsion radius
const MAX_PUSH = 38   // px — max displacement

let _el      = null
let _letters = []   // [{ outer: spanEl, char: spanEl }]
let _shown   = false

// ── Build ─────────────────────────────────────────────────────────────────────
function _build() {
  _el.innerHTML = ''
  _letters = []

  PHRASE.split(' ').forEach((word, wi, arr) => {
    const wordSpan = document.createElement('span')
    wordSpan.className = 'pt-word'

    word.split('').forEach(char => {
      // Outer: GSAP controls push transform
      const outer = document.createElement('span')
      outer.className = 'pt-letter'

      // Inner: CSS float animation
      const inner = document.createElement('span')
      inner.className = 'pt-char'
      inner.textContent = char

      const oy  = ((Math.random() - 0.5) * 14).toFixed(1)
      const del = (Math.random() * 3.5).toFixed(2)
      const dur = (3.2 + Math.random() * 2.8).toFixed(2)

      inner.style.setProperty('--oy',    `${oy}px`)
      inner.style.setProperty('--delay', `${del}s`)
      inner.style.setProperty('--dur',   `${dur}s`)

      outer.appendChild(inner)
      wordSpan.appendChild(outer)
      _letters.push({ outer, inner })
    })

    _el.appendChild(wordSpan)

    // Gap between words
    if (wi < arr.length - 1) {
      const gap = document.createElement('span')
      gap.className = 'pt-gap'
      _el.appendChild(gap)
    }
  })
}

// ── Repulsion (shared by mouse + touch) ───────────────────────────────────────
function _repulse(clientX, clientY) {
  if (!_shown) return

  _letters.forEach(({ outer, inner }) => {
    const rect = outer.getBoundingClientRect()
    const cx   = rect.left + rect.width  / 2
    const cy   = rect.top  + rect.height / 2
    const dx   = cx - clientX
    const dy   = cy - clientY
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < RADIUS && dist > 0) {
      const force  = (1 - dist / RADIUS) * MAX_PUSH
      const pushX  = (dx / dist) * force
      const pushY  = (dy / dist) * force
      const bright = 0.82 + (1 - dist / RADIUS) * 0.18
      gsap.to(outer, { x: pushX, y: pushY, duration: 0.35, ease: 'power2.out', overwrite: true })
      gsap.to(inner, { opacity: bright,    duration: 0.3,  overwrite: true })
    } else {
      gsap.to(outer, { x: 0, y: 0, duration: 1.1, ease: 'elastic.out(1, 0.45)', overwrite: true })
      gsap.to(inner, { opacity: 0.82,      duration: 0.6,  overwrite: true })
    }
  })
}

function _onMouseMove(e) { _repulse(e.clientX, e.clientY) }

function _onTouchMove(e) {
  if (!_shown) return
  const t = e.touches[0]
  if (t) _repulse(t.clientX, t.clientY)
}

// ── Public API ────────────────────────────────────────────────────────────────
export function showPollenText() {
  if (!_el) return
  _shown = true
  gsap.to(_el, { opacity: 1, duration: 0.8, ease: 'power2.out', overwrite: true })
}

export function hidePollenText() {
  _shown = false
  if (!_el) return
  gsap.to(_el, { opacity: 0, duration: 0.5, ease: 'power2.in', overwrite: true })
}

export function initPollenText() {
  _el = document.getElementById('pollen-text')
  if (!_el) return
  _build()
  window.addEventListener('mousemove', _onMouseMove, { passive: true })
  window.addEventListener('touchmove',  _onTouchMove, { passive: true })
}
