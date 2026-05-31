// projectPanel.js — Full-page project detail view
//
// Opening: WebGL circle-wipe from the 3D scene (circleTransition.js)
// Closing:  CSS clip-path circle that collapses back toward the click origin,
//           revealing the live 3D scene underneath.

import gsap                                              from 'gsap'
import { CONFIG }                                        from './config.js'
import { playCircleOpen, playCircleClose }               from './circleTransition.js'
import { getRenderer }                                   from './scene.js'
import { playPixelReveal }                               from './pixelReveal.js'
import { initProjectBackground, showProjectBackground,
         hideProjectBackground, refreshImagePosition }   from './projectBackground.js'
import { initJellyfish, showJellyfish, hideJellyfish }   from './jellyfishBackground.js'
import { freezeScroll }                                  from './journey.js'

let _panel         = null
let _open          = false
let _lastOrigin    = { x: 50, y: 50 }
let _mediaCursor   = null
let _mediaOverlay  = null
let _currentWebUrl = null

export function initProjectPanel() {
  _panel = document.getElementById('project-panel')
  if (!_panel) return
  initProjectBackground()
  initJellyfish()

  _panel.addEventListener('wheel', (e) => {
    e.stopPropagation()
    if (_open) closeProjectPanel()
  }, { passive: true })

  const _closeBtn = document.getElementById('project-panel-close')
  if (_closeBtn) _closeBtn.addEventListener('click', () => { if (_open) closeProjectPanel() })

  // ── Mobile swipe-left to close ────────────────────────────────────────────
  // Listeners on window so child elements don't block the events.
  let _swipeStartX   = null
  let _swipeStartY   = null
  let _swipeTracking = false   // true once horizontal dominance confirmed

  window.addEventListener('touchstart', (e) => {
    if (!_open) return
    _swipeStartX   = e.touches[0].clientX
    _swipeStartY   = e.touches[0].clientY
    _swipeTracking = false
  }, { passive: true })

  window.addEventListener('touchmove', (e) => {
    if (!_open || _swipeStartX === null) return
    const dx = e.touches[0].clientX - _swipeStartX
    const dy = e.touches[0].clientY - _swipeStartY
    if (!_swipeTracking && Math.abs(dx) > 8) {
      _swipeTracking = Math.abs(dx) > Math.abs(dy)
    }
    if (_swipeTracking && dx < 0) {
      _panel.style.transition = 'none'
      _panel.style.transform  = `translateX(${dx}px)`
      _panel.style.opacity    = String(Math.max(0, 1 + dx / (window.innerWidth * 0.55)))
    }
  }, { passive: true })

  window.addEventListener('touchend', (e) => {
    if (!_open || _swipeStartX === null) return
    const dx       = e.changedTouches[0].clientX - _swipeStartX
    const tracking = _swipeTracking
    _swipeStartX   = null
    _swipeTracking = false

    if (tracking && dx < -70) {
      // Commit — slide off then clean up (skip circle transition for swipe)
      _open = false
      freezeScroll(900)
      if (_mediaCursor)  _mediaCursor.classList.remove('visible')
      if (_mediaOverlay) _mediaOverlay.style.display = 'none'
      hideProjectBackground()
      hideJellyfish()
      const vid = document.getElementById('project-panel-video')
      if (vid) { vid.pause(); vid.currentTime = 0 }
      const _wordmark = document.getElementById('brand-wordmark')
      if (_wordmark) gsap.to(_wordmark, { opacity: 0.7, duration: 0.4, delay: 0.15, ease: 'power2.out' })
      const _icon = document.getElementById('brand-icon')
      if (_icon && _icon.classList.contains('is-visible')) {
        gsap.to(_icon, { opacity: 0.9, duration: 0.4, delay: 0.15, ease: 'power2.out', onStart: () => { _icon.style.pointerEvents = 'auto' } })
      }
      gsap.to(_panel, {
        x: -window.innerWidth, opacity: 0, duration: 0.22, ease: 'power2.in',
        onComplete() {
          _panel.style.display = 'none'
          gsap.set(_panel, { clearProps: 'x,opacity,transform,transition' })
        },
      })
    } else {
      // Cancel — snap back
      gsap.to(_panel, {
        x: 0, opacity: 1, duration: 0.38, ease: 'back.out(1.8)',
        onComplete() { _panel.style.transform = ''; _panel.style.opacity = ''; _panel.style.transition = '' },
      })
    }
  }, { passive: true })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _open) closeProjectPanel()
  })

  // Cursor element — follows mouse, appended to body
  _mediaCursor = document.createElement('div')
  _mediaCursor.className = 'project-media-cursor'
  _mediaCursor.innerHTML = '<span class="cursor-label">Click to see project</span><span class="cursor-dot"></span>'
  document.body.appendChild(_mediaCursor)

  // Transparent overlay — same position/size as the image-wrap, appended to body
  // so stacking context of #project-panel doesn't interfere
  _mediaOverlay = document.createElement('div')
  _mediaOverlay.style.cssText = [
    'position:fixed',
    'left:50%',
    'top:50%',
    'transform:translate(-50%,-50%)',
    'width:65vw',
    'max-width:900px',
    'aspect-ratio:16/9',
    'border-radius:12px',
    'z-index:200',
    'cursor:none',
    'display:none',
  ].join(';')
  document.body.appendChild(_mediaOverlay)

  _mediaOverlay.addEventListener('mousemove', (e) => {
    _mediaCursor.style.left = e.clientX + 'px'
    _mediaCursor.style.top  = e.clientY + 'px'
  })
  _mediaOverlay.addEventListener('mouseenter', () => {
    _mediaCursor.classList.add('visible')
  })
  _mediaOverlay.addEventListener('mouseleave', () => {
    _mediaCursor.classList.remove('visible')
  })
  _mediaOverlay.addEventListener('click', () => {
    if (_currentWebUrl) window.open(_currentWebUrl, '_blank', 'noopener')
  })
  _mediaOverlay.addEventListener('wheel', () => {
    if (_open) closeProjectPanel()
  }, { passive: true })
}

export function isPanelOpen() { return _open }

export function openProjectPanel(index, origin, threeCanvas) {
  if (!_panel) return
  const project = CONFIG.projects[index]
  if (!project) return

  _lastOrigin = origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  _populate(project)
  _hideTextElements()
  showProjectBackground(project.image || '', project.bgImage || project.image || '', project.bgTint, project.video || null)

  _open = true
  _panel.dataset.project = project.title.toLowerCase().replace(/\s+/g, '-')
  _panel.style.display  = 'flex'
  _panel.style.opacity  = '1'
  _panel.style.clipPath = ''

  // Re-read image-wrap rect after CSS (including per-project overrides) is applied
  setTimeout(() => { if (_open) refreshImagePosition() }, 80)

  const _wordmark = document.getElementById('brand-wordmark')
  if (_wordmark) gsap.to(_wordmark, { opacity: 0, duration: 0.3, ease: 'power2.in' })

  const _icon = document.getElementById('brand-icon')
  if (_icon) gsap.to(_icon, { opacity: 0, duration: 0.25, ease: 'power2.in', onComplete: () => { _icon.style.pointerEvents = 'none' } })

  showJellyfish()

  playCircleOpen(threeCanvas, _lastOrigin, {
    duration:   0.85,
    onComplete: _triggerTextReveal,
  })

  setTimeout(() => {
    const img = document.getElementById('project-panel-image')
    if (img && img.src) playPixelReveal(img, { duration: 1.5 })
  }, 120)
}

export function closeProjectPanel() {
  if (!_panel || !_open) return
  _open = false
  freezeScroll(900)   // block journey wheel for 900ms so panel-close scroll doesn't bleed
  if (_mediaCursor)  _mediaCursor.classList.remove('visible')
  if (_mediaOverlay) _mediaOverlay.style.display = 'none'
  hideProjectBackground()
  hideJellyfish()

  // Stop video decoding in background
  const vid = document.getElementById('project-panel-video')
  if (vid) { vid.pause(); vid.currentTime = 0 }

  const _wordmark = document.getElementById('brand-wordmark')
  if (_wordmark) gsap.to(_wordmark, { opacity: 0.7, duration: 0.5, delay: 0.4, ease: 'power2.out' })

  const _icon = document.getElementById('brand-icon')
  if (_icon && _icon.classList.contains('is-visible')) {
    gsap.to(_icon, { opacity: 0.9, duration: 0.5, delay: 0.4, ease: 'power2.out', onStart: () => { _icon.style.pointerEvents = 'auto' } })
  }

  const origin = _lastOrigin
  playCircleClose(getRenderer().domElement, origin, {
    duration:   0.75,
    onComplete: () => { _panel.style.display = 'none' },
  })
}

// ── Shared char set ───────────────────────────────────────────────────────────
const _FX_CHARS  = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O',
  'P','Q','R','S','T','U','V','W','X','Y','Z','!','@','#','$','&','*','(',')','_',
  '+','=','/','[',']','{','}',';',':','<','>',',','0','1','2','3','4','5','6','7','8','9']
const _FX1_PUNCT = ['*', '-', "'", '"']

function _randChar() {
  return _FX_CHARS[Math.floor(Math.random() * _FX_CHARS.length)]
}

// Tokenize text into words / spaces / newlines
function _tokenize(text) {
  const tokens = []
  let word = ''
  for (const ch of text) {
    if (ch === '\n') {
      if (word) { tokens.push({ type: 'word', text: word }); word = '' }
      tokens.push({ type: 'newline' })
    } else if (ch === ' ') {
      if (word) { tokens.push({ type: 'word', text: word }); word = '' }
      tokens.push({ type: 'space' })
    } else {
      word += ch
    }
  }
  if (word) tokens.push({ type: 'word', text: word })
  return tokens
}

// Build DOM: each word wrapped in inline-block so line breaks only occur between
// words, never inside them (prevents mid-word breaks after per-char spans are added).
function _buildSpans(el, text) {
  el.innerHTML = ''
  const charItems = []   // { span, ch } for animation
  let pos = 0

  for (const token of _tokenize(text)) {
    if (token.type === 'newline') {
      el.appendChild(document.createElement('br'))
      continue
    }
    if (token.type === 'space') {
      const sp = document.createElement('span')
      sp.innerHTML = '&nbsp;'
      el.appendChild(sp)
      continue
    }
    // Word wrapper — keeps all char spans in one unbreakable unit
    const wordEl = document.createElement('span')
    wordEl.style.display    = 'inline-block'
    wordEl.style.whiteSpace = 'nowrap'
    el.appendChild(wordEl)

    for (const ch of token.text) {
      const span = document.createElement('span')
      span.style.display  = 'inline-block'
      span.textContent    = ch   // real char for width measurement
      wordEl.appendChild(span)
      charItems.push({ span, ch, pos: pos++ })
    }
  }
  return charItems
}

// Lock each char span to its real pixel width (el must be in DOM, even opacity:0)
function _lockWidths(charItems) {
  for (const { span } of charItems) {
    const w = span.getBoundingClientRect().width
    if (w > 0) { span.style.width = w + 'px'; span.style.textAlign = 'center' }
  }
}

// ── fx2 scramble ──────────────────────────────────────────────────────────────
function _scrambleReveal(el, text) {
  const MAX     = 7    // iterations per char
  const SPEED   = 22   // ms per iteration
  const STAGGER = 6    // ms between chars — keeps wave tight

  const charItems = _buildSpans(el, text)
  _lockWidths(charItems)
  for (const { span } of charItems) span.textContent = ' '
  el.style.opacity = '1'

  for (const { span, ch, pos } of charItems) {
    ;((spanRef, origChar, delay) => {
      setTimeout(() => {
        let iter = 0
        const step = () => {
          if (iter === MAX - 1) {
            spanRef.textContent   = origChar
            spanRef.style.opacity = '0'
            setTimeout(() => { spanRef.style.opacity = '1' }, 80)
          } else {
            spanRef.textContent = _randChar()
          }
          iter++
          if (iter < MAX) setTimeout(step, SPEED)
        }
        step()
      }, delay)
    })(span, ch, (pos + 1) * STAGGER)
  }
}

// ── fx1 wave ──────────────────────────────────────────────────────────────────
function _waveReveal(el, text) {
  const MAX   = 28
  const SPEED = 12

  const charItems = _buildSpans(el, text)
  _lockWidths(charItems)

  const EMPTY  = ' '
  const caches = charItems.map(() => EMPTY)
  for (const { span } of charItems) span.textContent = EMPTY
  el.style.opacity = '1'

  const loop = (i, iteration = 0) => {
    const { span, ch } = charItems[i]
    const prevCache = caches[i]

    if (iteration === MAX - 1) {
      span.textContent = ch
      caches[i] = ch
    } else if (i === 0) {
      const newCh = iteration < 9
        ? _FX1_PUNCT[Math.floor(Math.random() * _FX1_PUNCT.length)]
        : _randChar()
      span.textContent = newCh
      caches[i] = newCh
    } else {
      span.textContent = caches[i - 1]
      caches[i] = caches[i - 1]
    }

    if (prevCache !== EMPTY) iteration++
    if (iteration < MAX) setTimeout(() => loop(i, iteration), SPEED)
  }

  setTimeout(() => {
    for (let i = 0; i < charItems.length; i++) loop(i, 0)
  }, 200)
}

// ── hide / reveal ─────────────────────────────────────────────────────────────
const _TEXT_IDS = [
  'project-panel-company',
  'project-panel-date',
  'project-panel-category',
  'project-panel-title',
  'project-panel-desc',
]

function _hideTextElements() {
  for (const id of _TEXT_IDS) {
    const el = document.getElementById(id)
    if (el) el.style.opacity = '0'
  }
  const hint = document.querySelector('.project-page-hint')
  if (hint) hint.style.opacity = '0'
}

function _triggerTextReveal() {
  if (!_open) return

  const hint = document.querySelector('.project-page-hint')
  if (hint) {
    const text = hint.textContent.trim()
    if (text) _waveReveal(hint, text)
  }

  const entries = [
    { id: 'project-panel-company',  delay:   0 },
    { id: 'project-panel-date',     delay:  25 },
    { id: 'project-panel-category', delay:  50 },
    { id: 'project-panel-title',    delay:  90 },
    { id: 'project-panel-desc',     delay: 160 },
  ]
  for (const { id, delay } of entries) {
    const el = document.getElementById(id)
    if (!el) continue
    const text = el.textContent.trim()
    if (!text) continue
    setTimeout(() => {
      if (!_open) return
      _scrambleReveal(el, text)
    }, delay)
  }
}

// ── populate ──────────────────────────────────────────────────────────────────
function _populate(p) {
  _setText('project-panel-title',    p.title)
  _setText('project-panel-date',     p.date)
  _setText('project-panel-company',  p.company)
  _setText('project-panel-category', p.category)
  _setText('project-panel-desc',     p.description)

  const hint = document.getElementById('project-panel-hint')
  if (hint) {
    if (p.webUrl) {
      hint.textContent = 'Click to see project'
      hint.href        = p.webUrl
      hint.dataset.hasLink = 'true'
    } else {
      hint.textContent = 'Scroll to close'
      hint.removeAttribute('href')
      hint.dataset.hasLink = 'false'
    }
  }

  const webLink  = document.getElementById('project-panel-web')
  const caseLink = document.getElementById('project-panel-case')
  const linksRow = document.getElementById('project-panel-links')
  const imgWrap = document.getElementById('project-panel-image-wrap')
  const img     = document.getElementById('project-panel-image')
  const vid     = document.getElementById('project-panel-video')
  const srcWebm = document.getElementById('project-panel-video-webm')
  const srcMp4  = document.getElementById('project-panel-video-mp4')

  if (webLink)  { webLink.href  = p.webUrl        || '#'; _show(webLink,  !!p.webUrl)        }
  if (caseLink) { caseLink.href = p.caseStudyUrl  || '#'; _show(caseLink, !!p.caseStudyUrl)  }
  if (linksRow) _show(linksRow, !!(p.webUrl || p.caseStudyUrl))

  // Store URL for media click + show overlay only when there's a link.
  // Delay pointer-events so the click that opened the panel doesn't immediately
  // land on the overlay and navigate away before the user sees the panel.
  _currentWebUrl = p.webUrl || null
  if (imgWrap) imgWrap.classList.toggle('has-link', !!_currentWebUrl)
  if (_mediaOverlay) {
    if (_currentWebUrl) {
      _mediaOverlay.style.display       = 'block'
      _mediaOverlay.style.pointerEvents = 'none'
      setTimeout(() => { if (_open) _mediaOverlay.style.pointerEvents = 'auto' }, 600)
    } else {
      _mediaOverlay.style.display = 'none'
    }
  }

  // Video element stays hidden — WebGL VideoTexture reads from it
  if (p.video && vid && srcWebm && srcMp4) {
    srcWebm.src = ''
    srcMp4.src  = p.video + '.mp4'
    vid.load()
    vid.play().catch(() => {})
  }

  if (imgWrap) {
    imgWrap.style.display = (p.image || p.video) ? '' : 'none'
    if (img) img.style.display = ''
  }
}

function _setText(id, val) {
  const el = document.getElementById(id)
  if (el) el.textContent = val ?? ''
}

function _show(el, visible) {
  el.style.display = visible ? '' : 'none'
}
