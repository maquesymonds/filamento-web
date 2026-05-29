import gsap from 'gsap'

// Transition 1: circle wipe from center — expands to cover, then shrinks to reveal.
// Usage: playCircleTransition(onMidpoint) — onMidpoint fires when screen is fully black.

const _overlay = document.createElement('div')
_overlay.id = 'circle-transition'
_overlay.style.cssText = `
  position: fixed;
  inset: 0;
  z-index: 999;
  background: #000;
  pointer-events: none;
  clip-path: circle(0% at 50% 50%);
`
document.body.appendChild(_overlay)

let _running = false

export function playCircleTransition(onMidpoint, { durationIn = 1.0, durationOut = 1.0 } = {}) {
  if (_running) return
  _running = true

  // Phase 1: circle expands to cover full screen
  gsap.to(_overlay, {
    duration: durationIn,
    ease: 'power2.in',
    clipPath: 'circle(150% at 50% 50%)',
    onComplete: () => {
      // Midpoint — screen fully black — reset happens here
      onMidpoint?.()

      // Phase 2: circle shrinks to reveal the new state
      gsap.to(_overlay, {
        duration: durationOut,
        ease: 'power2.out',
        clipPath: 'circle(0% at 50% 50%)',
        delay: 0.05,
        onComplete: () => { _running = false },
      })
    },
  })
}
