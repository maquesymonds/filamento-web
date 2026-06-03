import gsap                                                        from 'gsap'
import { CONFIG }                                                 from './config.js'
import { setAnimationTime, getAnimationTime, getAnimationDuration, getCamera } from './experience.js'
import { showSectionText, hideSectionText, hideAllSectionText }     from './scroll.js'
import { jumpScrollTo, stopJourney, restartLoop, releaseApproachFreeze, jumpToContactFromStart, startJourney, advanceProjectStop } from './journey.js'
import { startJungle }                                            from './audio.js'
import { resetBeginButton, setIconClickFn, hideHeroText, activateHeroToNav } from './ui.js'
import { transitionRootsColorBack, transitionPetalColorsBack }    from './materials.js'
import { showButterflies, flyAwayButterflies }                     from './butterflies.js'
import { isPanelOpen }                                             from './projectPanel.js'

const _pill    = document.getElementById('nav-pill')
const _menuBtn = document.getElementById('nav-pill-menu-btn')
const _items   = document.querySelectorAll('.nav-pill-item')
const _sections = CONFIG.scroll.sections.filter(s => s.hasText)

function _close() {
  _pill?.classList.remove('open')
}

function _goToStart() {
  stopJourney()
  _sections.forEach(s => hideSectionText(s.id))
  _items.forEach(btn => btn.classList.remove('active'))
  _close()

  // Animate camera back to t=0, then start orbit
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

  // Smooth color transitions back to initial state
  transitionRootsColorBack(1.2, 'power2.inOut')

  // UI: brand rises from below, tagline shuffles, button reappears
  resetBeginButton()
}

// Smooth camera animation to any section — works forward and backward
function _animateTo(sectionId) {
  const section = _sections.find(s => s.id === sectionId)
  if (!section) return
  const dur = getAnimationDuration()
  if (!dur) return

  if (sectionId === 'studio') flyAwayButterflies(getCamera())

  const frame   = section.navFrame ?? section.startFrame
  const targetT = (frame / CONFIG.scroll.totalFrames) * dur
  const fromT   = getAnimationTime()
  if (Math.abs(fromT - targetT) < 0.01) return

  stopJourney()
  hideAllSectionText()

  const scrollHint = document.getElementById('scroll-hint')
  if (scrollHint) { scrollHint.style.opacity = '0'; scrollHint.style.pointerEvents = 'none' }

  // Duration proportional to distance, capped between 1.5–3s
  const distance = Math.abs(fromT - targetT)
  const tweenDur = Math.max(1.5, Math.min(3.0, distance * 3.0))

  const proxy = { t: fromT }
  gsap.to(proxy, {
    t:        targetT,
    duration: tweenDur,
    ease:     'power3.inOut',
    onUpdate() { setAnimationTime(proxy.t) },
    onComplete() {
      showSectionText(sectionId)
      jumpScrollTo(targetT)
      if (sectionId === 'process') showButterflies(getCamera())
      _items.forEach(btn => btn.classList.toggle('active', btn.dataset.section === sectionId))
      _close()
    },
  })
}

function _jumpTo(sectionId) {
  const section = _sections.find(s => s.id === sectionId)
  if (!section) return

  const duration = getAnimationDuration()
  if (!duration) return

  const frame = section.navFrame ?? section.startFrame
  const t = (frame / CONFIG.scroll.totalFrames) * duration

  stopJourney()

  const beginBtn   = document.getElementById('begin-btn')
  const scrollHint = document.getElementById('scroll-hint')
  if (beginBtn) { beginBtn.style.opacity = '0'; beginBtn.style.pointerEvents = 'none' }

  hideHeroText()
  startJungle()
  setAnimationTime(t)

  if (sectionId === 'studio') {
    // Arriving at Studio: show "Begin the journey" button so user can restart auto-play
    if (scrollHint) {
      scrollHint.style.pointerEvents = 'auto'
      gsap.to(scrollHint, { opacity: 1, duration: 0.5, ease: 'power2.out' })
    }
    jumpScrollTo(t)   // habilitar también el scroll (antes quedaba muerto al ir a Studio)
  } else {
    if (scrollHint) { scrollHint.style.opacity = '0'; scrollHint.style.pointerEvents = 'none' }
    jumpScrollTo(t)
  }

  if (sectionId === 'process') showButterflies(getCamera())

  hideAllSectionText(() => showSectionText(sectionId))

  _items.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === sectionId)
  })

  _close()
}

const _ARROW_SVG       = `<svg width="14" height="9" viewBox="0 0 14 9" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 1L1 4.5L4 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><line x1="1" y1="4.5" x2="13" y2="4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`
const _ARROW_RIGHT_SVG = `<svg width="14" height="9" viewBox="0 0 14 9" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 1L13 4.5L10 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><line x1="13" y1="4.5" x2="1" y2="4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`

const _FX2_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=[]{};<>,0123456789'

function _initBtnFx2(btn) {
  const span = btn.querySelector('span')
  if (!span) return
  const text = span.textContent
  span.innerHTML = [...text].map(ch =>
    `<i style="font-style:normal;display:inline-block">${ch === ' ' ? '&nbsp;' : ch}</i>`
  ).join('')
  const charEls = [...span.querySelectorAll('i')]
  const originals = charEls.map(el => el.innerHTML)
  let _running = false

  btn.addEventListener('mouseenter', () => {
    if (_running) return
    _running = true
    let done = 0
    charEls.forEach((el, i) => {
      let iter = 0
      const MAX = 10
      setTimeout(() => {
        const tick = () => {
          if (iter === MAX - 1) {
            el.innerHTML = originals[i]
            if (++done === charEls.length) _running = false
          } else {
            el.innerHTML = _FX2_CHARS[Math.floor(Math.random() * _FX2_CHARS.length)]
            iter++
            setTimeout(tick, 30)
          }
        }
        tick()
      }, (i + 1) * 20)
    })
  })
}

function _goToContactFromStart() {
  const beginBtn   = document.getElementById('begin-btn')
  const scrollHint = document.getElementById('scroll-hint')
  if (beginBtn)   { beginBtn.style.opacity = '0'; beginBtn.style.pointerEvents = 'none' }
  if (scrollHint) { gsap.killTweensOf(scrollHint); scrollHint.style.opacity = '0'; scrollHint.style.pointerEvents = 'none' }
  hideHeroText()
  activateHeroToNav()
  document.getElementById('radial-nav')?.classList.add('rn-active')
  const _hbBtn = document.getElementById('hamburger-btn')
  if (_hbBtn) gsap.to(_hbBtn, { opacity: 1, duration: 0.6, delay: 0.4, ease: 'power2.out', onComplete: () => { _hbBtn.style.pointerEvents = 'auto' } })
  startJungle()
  jumpToContactFromStart()
}

export function initNavPill() {
  if (!_pill || !_menuBtn) return

  // Apply hover scramble to the Start button
  const _beginBtn = document.getElementById('begin-btn')
  if (_beginBtn) _initBtnFx2(_beginBtn)

  // Logo/icon click should reset to the post-loader start state, not reload the page
  setIconClickFn(() => _goToStart())

  _menuBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    _pill.classList.toggle('open')
  })

  _items.forEach(btn => {
    btn.addEventListener('click', () => _jumpTo(btn.dataset.section))
  })

  document.addEventListener('click', (e) => {
    if (!_pill.contains(e.target)) _close()
  })

  // Go back + Continue buttons — injected in all section text blocks.
  _sections.forEach((s, idx) => {
    const block = document.getElementById(`text-${s.id}`)
    if (!block) return

    // ── Go back ──
    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'go-back-btn'
    if (idx === 0) {
      back.setAttribute('aria-label', 'Go back to start')
      back.innerHTML = `${_ARROW_SVG}<span>Go back</span>`
      back.addEventListener('click', () => _goToStart())
    } else {
      back.setAttribute('aria-label', `Go back to ${_sections[idx - 1].id}`)
      back.innerHTML = `${_ARROW_SVG}<span>Go back</span>`
      back.addEventListener('click', () => _animateTo(_sections[idx - 1].id))
    }
    block.appendChild(back)
    _initBtnFx2(back)

    // ── Continue (all sections except the last) / Back to start (last section) ──
    if (idx < _sections.length - 1) {
      const next = _sections[idx + 1]
      const cont = document.createElement('button')
      cont.type = 'button'
      cont.className = 'continue-btn'
      cont.setAttribute('aria-label', `Continue to ${next.id}`)
      cont.innerHTML = `<span>Continue</span>${_ARROW_RIGHT_SVG}`

      if (idx === 0) {
        // Studio → start the camera journey (was previously tied to scroll-hint button)
        cont.addEventListener('click', () => {
          _close()
          showButterflies(getCamera())
          startJourney(undefined, () => flyAwayButterflies(getCamera()))
        })
      } else if (s.id === 'process') {
        cont.addEventListener('click', () => {
          _close()
          hideSectionText('process')
          if (!releaseApproachFreeze()) _jumpTo('work')
        })
      } else if (s.id === 'work') {
        // Work → la cámara frena en cada proyecto (semilla). Continue mueve la
        // cámara al siguiente; tras el último salta a Contact. Si por algún
        // motivo no hay paradas activas (ej. salto de menú), cae al jump normal.
        cont.addEventListener('click', () => {
          _close()
          if (!advanceProjectStop()) _animateTo(next.id)
        })
      } else {
        cont.addEventListener('click', () => _animateTo(next.id))
      }

      block.appendChild(cont)
      _initBtnFx2(cont)
    } else {
      const restart = document.createElement('button')
      restart.type = 'button'
      restart.className = 'continue-btn'
      restart.setAttribute('aria-label', 'Back to start')
      restart.innerHTML = `<span>Back to start</span>${_ARROW_RIGHT_SVG}`
      restart.addEventListener('click', () => restartLoop())
      block.appendChild(restart)
      _initBtnFx2(restart)
    }
  })

  // Arrow key navigation — ← = Go back, → = Continue (de la sección visible).
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return

    // Con un proyecto abierto las flechas no navegan secciones.
    if (isPanelOpen()) return

    // ── Section navigation (experience running) ───────────────────
    // Bloque visible: usamos el estilo computado (robusto ante gsap/transiciones).
    const activeBlock = [...document.querySelectorAll('.scroll-text-block')]
      .find(b => {
        const cs = getComputedStyle(b)
        return cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.5
      })
    if (activeBlock) {
      e.preventDefault()
      const btn = e.key === 'ArrowLeft'
        ? activeBlock.querySelector('.go-back-btn')
        : activeBlock.querySelector('.continue-btn')
      btn?.click()
      return
    }

    // ── Start screen navigation ───────────────────────────────────
    // Solo ArrowRight → Begin (hacia adelante). El "ir a Contact desde el inicio"
    // (ArrowLeft / scroll arriba / swipe abajo) quedó deshabilitado para que el
    // usuario no caiga al final de la página sin querer.
    const beginBtn = document.getElementById('begin-btn')
    const onStart  = beginBtn && !beginBtn.disabled && parseFloat(beginBtn.style.opacity) > 0.5
    if (!onStart) return
    if (e.key === 'ArrowRight') { e.preventDefault(); beginBtn.click() }
  })
}
