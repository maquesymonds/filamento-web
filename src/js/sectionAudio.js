// ─────────────────────────────────────────────────────────────────────────────
//  sectionAudio.js — Reproduce el fragmento de digitalText.mp3 de cada sección
// ─────────────────────────────────────────────────────────────────────────────

import { isSoundOn } from './audio.js'

const SEGMENTS = {
  studio:  { start: 1.19, end: 6 },
  process: { start: 1.12, end: 5 },
  work:    { start: 1.81, end: 4 },
  contact: { start: 1.63, end: 3 },
}

const _audio = new Audio('/audio/digitalText.mp3')
_audio.preload = 'auto'
let _stopTimeout = null

export function playSectionAudio(sectionId) {
  if (!isSoundOn()) return

  const seg = SEGMENTS[sectionId]
  if (!seg) return

  clearTimeout(_stopTimeout)
  _audio.pause()
  _audio.currentTime = seg.start
  _audio.play().catch(() => {})

  const duration = (seg.end - seg.start) * 1000
  _stopTimeout = setTimeout(() => _audio.pause(), duration)
}

export function stopSectionAudio() {
  clearTimeout(_stopTimeout)
  _audio.pause()
}

// Stop immediately when the user mutes
window.addEventListener('filamento:mute', stopSectionAudio)
