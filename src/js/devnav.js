// devnav.js — Dev-only quick-nav panel (toggle with N key)
// Lets you jump to any section without scrolling through the whole experience.

import { setAnimationTime, getAnimationDuration, getAnimationTime } from './experience.js'
import { showSectionText, hideSectionText }        from './scroll.js'
import { showCarousel, hideCarousel }              from './carousel.js'
import { enableEndScroll }                         from './journey.js'
import { CONFIG }                                  from './config.js'
import { onTick }                                  from './scene.js'

const STOPS = [
  { label: '① Intro',    frame: 0,   section: null    },
  { label: '② Studio',   frame: 30,  section: 'studio'  },
  { label: '③ Process',  frame: 90,  section: 'process' },
  { label: '④ Work',     frame: 160, section: 'work'    },
  { label: '⑤ Contact',  frame: 230, section: 'contact' },
  { label: '⑥ Final ↑',  frame: 245, section: null    },
]

export function initDevNav() {
  const { panel, frameDisplay } = _buildPanel()
  document.body.appendChild(panel)

  // Update frame counter every tick
  onTick(() => {
    const dur    = getAnimationDuration()
    const frames = CONFIG.scroll.totalFrames
    if (!dur || !frames) return
    const t     = getAnimationTime()
    const frame = Math.round((t / dur) * frames)
    frameDisplay.textContent = `frame  ${frame} / ${frames}`
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'n' || e.key === 'N') {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none'
    }
  })
}

function _jumpTo(frame, sectionId) {
  const dur    = getAnimationDuration()
  const frames = CONFIG.scroll.totalFrames
  if (!dur || !frames) return

  setAnimationTime((frame / frames) * dur)

  // Reset all text overlays
  CONFIG.scroll.sections.forEach(s => { if (s.hasText) hideSectionText(s.id) })

  if (sectionId) showSectionText(sectionId)

  showCarousel()

  // If jumping to the final section, activate the scroll scrub
  if (frame >= CONFIG.journey.endFrame) {
    const dur    = getAnimationDuration()
    const frames = CONFIG.scroll.totalFrames
    if (dur && frames) enableEndScroll((frame / frames) * dur)
  }
}

function _buildPanel() {
  const panel = document.createElement('div')
  panel.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 5px;
    background: rgba(0,0,0,0.75);
    border: 1px solid rgba(255,255,255,0.12);
    padding: 10px 12px;
    border-radius: 10px;
    font-family: monospace;
    font-size: 11px;
    backdrop-filter: blur(6px);
  `

  const label = document.createElement('div')
  label.textContent = 'DEV NAV  [N]'
  label.style.cssText = 'color:rgba(255,255,255,0.35); margin-bottom:4px; letter-spacing:0.08em;'
  panel.appendChild(label)

  // Live frame counter
  const frameDisplay = document.createElement('div')
  frameDisplay.textContent = 'frame  — / —'
  frameDisplay.style.cssText = `
    color: rgba(100,220,180,0.9);
    font-size: 12px;
    letter-spacing: 0.06em;
    padding: 4px 0 6px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    margin-bottom: 2px;
  `
  panel.appendChild(frameDisplay)

  STOPS.forEach(({ label: lbl, frame, section }) => {
    const btn = document.createElement('button')
    btn.textContent = lbl
    btn.style.cssText = `
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.85);
      padding: 5px 10px;
      border-radius: 5px;
      cursor: pointer;
      text-align: left;
      font-family: monospace;
      font-size: 11px;
      transition: background 0.15s;
    `
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.15)' })
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.07)' })
    btn.addEventListener('click', () => _jumpTo(frame, section))
    panel.appendChild(btn)
  })

  return { panel, frameDisplay }
}
