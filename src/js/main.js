// main.js — Entry point
//
// Boot order:
//   1. Init renderer
//   2. Init Theatre.js (studio en dev)
//   3. Cargar GLB con progress bar
//   4. Build scene (aplica materiales físicos + env map)
//   5. Cargar PLY point cloud
//   6. Init bloom pipeline
//   7. Activar scene → render loop
//   8. UI: ocultar loader → reveal hero
//   9. Init scroll (espera filamento:ready)
//  10. Botón "Start" → playIntro → dispatch filamento:ready
//  11. Hover de cables en tick

import * as THREE from 'three'
import gsap from 'gsap'
import { initFilamentoLoader }                                   from './filamento-loader.js'
import { initTheatre }                                            from './theatre.js'
import { initAudio, startAmbient, startJungle, playGrowing, isSoundOn, playOneShot, playOnUnlock } from './audio.js'
import { initRenderer, startLoop, onTick, setRenderPipeline, getRenderer } from './scene.js'
import { loadGLB }                                               from './loaders.js'
import { initExperience, activateExperience, playIntro, playIntroCameraOrbit, getCamera, getScene, tickChipFloat, chipDragStart, chipDragMove, chipDragEnd, initOverviewCamera, toggleOverview, tickOverviewControls, isOverviewActive, getAnimationTime, getAnimationDuration, setAnimationTime } from './experience.js'
import { initScroll, showSectionText, hideSectionText }          from './scroll.js'
import { setLoadProgress, hideLoader, revealHero, setupBeginButton } from './ui.js'
import { CONFIG }                                                from './config.js'
import { startJourney, getScrollFrame, seekJourney, enableEndScroll } from './journey.js'
import { initNavPill }                                          from './navPill.js'
import { initRadialNav }                                        from './radialNav.js'
import { initPointCloud, updatePointCloudTime }                  from './pointcloud.js'
import { initBloom, renderBloom, renderBloomToTarget }           from './bloom.js'
import { initFilament, setFilamentProgress, tickFilament, isFilamentActive, getFilamentRT, renderFilament } from './postprocessing.js'
import { initParticles, tickParticles, initRaicesParticles, tickRaicesParticles } from './particles.js'
import { initMorphParticles, tickMorphParticles, setMorphParticlesVisible } from './morphParticles.js'
import { initAudioTrimmer }                                      from './audioTrimmer.js'
import { updateMaterialTime, raizUniforms, growRoots, transitionRootsColor, transitionPetalColors, initRipple, tickRipple, meshesSemillasArr, semillaPickerMeshes, semillaHoverEnter, semillaHoverLeave, semillaSetTilt, setSemillasVisible } from './materials.js'
import { initProjectPanel, openProjectPanel, isPanelOpen } from './projectPanel.js'
import { initSoundTimeline, markUserSound } from './soundTimeline.js'
import { initCircleTransition } from './circleTransition.js'
import { initPollenText } from './pollenText.js'
import { initButterflies, showButterflies, hideButterflies, tickButterflies, flyAwayButterflies } from './butterflies.js'
import { initIntroLoader, resolveLoader }                   from './introLoader.js'
import { sheet }                                                 from './theatre.js'
import { types }                                                 from '@theatre/core'

const _raycaster  = new THREE.Raycaster()
const _mouseHover = new THREE.Vector2()
let   _mouseActive = false
let   _prevElapsed = 0

async function boot() {

  // ── 0. Intro loader — TypeShuffle loop while assets load ────────────────
  initIntroLoader()

  // ── 1. Renderer + audio ──────────────────────────────────────────────────
  const canvas = document.getElementById('filamento-canvas')
  initRenderer(canvas)
  initAudio()
  initRipple(getRenderer())

  // ── 2. Theatre.js ────────────────────────────────────────────────────────
  await initTheatre()

  // ── 3. Cargar GLB ────────────────────────────────────────────────────────
  let glb
  try {
    glb = await loadGLB(CONFIG.assets.model, setLoadProgress)
  } catch (err) {
    console.error('[Filamento] Error cargando el modelo:', err)
    glb = { scene: null, cameras: [], animations: [] }
  }

  // ── 4. Build scene (env map + materiales físicos) ────────────────────────
  initExperience(glb)

  // ── Sound timeline dev panel (toggle with S) ─────────────────────────────
  initSoundTimeline({
    getTotalFrames:  () => CONFIG.scroll.totalFrames || 360,
    getCurrentFrame: () => {
      const dur = getAnimationDuration()
      const tf  = CONFIG.scroll.totalFrames || 360
      return dur ? Math.round(getAnimationTime() * tf / dur) : 0
    },
  })

  // Set frame-counter total (totalFrames is computed inside initExperience)
  const _fcTotal = document.getElementById('frame-total')
  if (_fcTotal) {
    const total = CONFIG.scroll.totalFrames ?? Math.round(getAnimationDuration() * 24)
    _fcTotal.textContent = String(total).padStart(3, '0')
  }

  // ── Dev timeline scrubber ────────────────────────────────────────────────
  const _tlTrack  = document.getElementById('dev-timeline-track')
  const _tlFill   = document.getElementById('dev-timeline-fill')
  const _tlHandle = document.getElementById('dev-timeline-handle')
  const _tlFrame  = document.getElementById('dev-timeline-frame')

  if (_tlTrack) {
    const _tlTotal = CONFIG.scroll.totalFrames ?? Math.round(getAnimationDuration() * 24)

    // Section markers
    const _tlMarkers = [
      { frame: CONFIG.scroll.introFrames,            label: 'Start' },
      ...CONFIG.scroll.sections.filter(s => s.hasText).map(s => ({
        frame: s.navFrame ?? s.startFrame, label: s.id.charAt(0).toUpperCase() + s.id.slice(1),
      })),
      { frame: CONFIG.journey.scrollFreezeFrame,     label: 'Freeze' },
      { frame: CONFIG.journey.scrollEndFrame,        label: 'Loop'   },
    ]
    _tlMarkers.forEach(({ frame, label }) => {
      const pct = (frame / _tlTotal) * 100
      const m = document.createElement('div')
      m.className = 'dev-timeline-marker'
      m.style.left = `${pct}%`
      const lbl = document.createElement('span')
      lbl.textContent = label
      m.appendChild(lbl)
      _tlTrack.appendChild(m)
    })

    // Drag logic
    let _tlDragging = false
    const _tlSeek = (clientX) => {
      const rect = _tlTrack.getBoundingClientRect()
      const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const t    = pct * getAnimationDuration()
      seekJourney(t)
    }
    _tlTrack.addEventListener('mousedown', (e) => { _tlDragging = true; _tlSeek(e.clientX) })
    window.addEventListener('mousemove',  (e) => { if (_tlDragging) _tlSeek(e.clientX) })
    window.addEventListener('mouseup',    ()  => { _tlDragging = false })

    // Tick update — hooked into the existing onTick below via module-level ref
    window.__updateDevTimeline = () => {
      const dur  = getAnimationDuration()
      if (!dur) return
      const t    = getAnimationTime()
      const pct  = (t / dur) * 100
      _tlFill.style.width   = `${pct}%`
      _tlHandle.style.left  = `${pct}%`
      const frame = Math.round(t * (_tlTotal / dur))
      if (_tlFrame) _tlFrame.textContent = `${String(frame).padStart(3, '0')} / ${String(_tlTotal).padStart(3, '0')}`
    }
  }

  // ── 5. PLY point cloud ───────────────────────────────────────────────────
  await initPointCloud(getScene())

  // ── 5b. GPU particle system ──────────────────────────────────────────────
  await initParticles(getScene(), getRenderer())
  await initRaicesParticles(getScene(), getRenderer())
  initMorphParticles(getScene())

  // ── 6. Bloom pipeline ────────────────────────────────────────────────────
  initBloom(getRenderer(), getScene())
  initFilament(getRenderer())

  setRenderPipeline((renderer, scene, camera) => {
    if (isFilamentActive()) {
      renderBloomToTarget(renderer, scene, camera, getFilamentRT())
      renderFilament(renderer)
    } else {
      renderBloom(renderer, scene, camera)
    }
  })

  // ── 7. Activar + render loop ─────────────────────────────────────────────
  activateExperience()
  initOverviewCamera()
  initButterflies(getScene())
  startLoop()

  // Pre-compile shaders + pre-upload textures to GPU while veil is up.
  // Prevents the ~1s stutter when FLOR_GRANDE first enters the camera frustum.
  const _warmupCam = new THREE.PerspectiveCamera(160, 1, 0.01, 10000)
  _warmupCam.position.set(0, 0, 0)
  getRenderer().compile(getScene(), _warmupCam)

  const _TEX_MAPS = ['map','normalMap','roughnessMap','metalnessMap','emissiveMap',
                     'envMap','aoMap','alphaMap','bumpMap','lightMap','transmissionMap']
  const _renderer = getRenderer()
  getScene().traverse((obj) => {
    if (!obj.isMesh) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    mats.forEach(mat => {
      _TEX_MAPS.forEach(key => { if (mat[key]) _renderer.initTexture(mat[key]) })
    })
  })

  // ── 8. UI ────────────────────────────────────────────────────────────────
  // Signal assets ready — introLoader fires reveal when its animation completes
  resolveLoader(() => {
    startAmbient()
    playOnUnlock('/audio/Start.mp3', 0.8)
    playIntroCameraOrbit()
    revealHero()
    growRoots({ duration: 10, ease: CONFIG.intro.ease })
  })

  // ── 9. Scroll ────────────────────────────────────────────────────────────
  initScroll()
  initAudioTrimmer()

  // ── 10. Botón "Start" ────────────────────────────────────────────────────
  initNavPill()
  initRadialNav() // RADIAL NAV EXPERIMENT — active when <body class="use-radial-nav">
  initPollenText()
  setupBeginButton(() => {
    startJungle()
    showSectionText('studio')
    transitionRootsColor(CONFIG.intro.duration, CONFIG.intro.ease)
    // Show radial nav + mark Studio as active
    document.getElementById('radial-nav')?.classList.add('rn-active')
    document.querySelectorAll('.rn-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === 'studio')
    })
    // Show hamburger on mobile smoothly after Start
    const _hbBtn = document.getElementById('hamburger-btn')
    if (_hbBtn) gsap.to(_hbBtn, { opacity: 1, duration: 0.6, delay: 0.4, ease: 'power2.out', onComplete: () => { _hbBtn.style.pointerEvents = 'auto' } })
    playIntro(() => {
      window.dispatchEvent(new CustomEvent('filamento:ready'))
      enableEndScroll(getAnimationTime())

      // Show butterflies on first scroll (mirrors the "Continue" button path)
      let _butterfliesShown = false
      window.addEventListener('wheel', () => {
        if (_butterfliesShown) return
        _butterfliesShown = true
        showButterflies(getCamera())
      }, { once: true, passive: true })
    })
  })

  // ── 11. "Begin the journey" — auto-play de cámara ───────────────────────
  // No { once: true } — el listener persiste para que funcione en cada loop
  const journeyBtn = document.getElementById('scroll-hint')
  if (journeyBtn) {
    journeyBtn.addEventListener('click', () => {
      journeyBtn.style.pointerEvents = 'none'
      gsap.to(journeyBtn, { opacity: 0, duration: 0.4, ease: 'power2.in' })
      showButterflies(getCamera())
      startJourney(undefined, () => flyAwayButterflies(getCamera()))
    })
  }

  // ── 12. Init project panel + circle transition ───────────────────────────
  initProjectPanel()
  initCircleTransition()

  // ── Brand icon glitch sound ──────────────────────────────────────────────
  ;(async () => {
    const _glitchCtx = new (window.AudioContext || window.webkitAudioContext)()
    const _glitchBuf = await fetch('/audio/Glitch.mp3')
      .then(r => r.arrayBuffer())
      .then(b => _glitchCtx.decodeAudioData(b))
      .catch(() => null)

    document.getElementById('brand-icon')?.addEventListener('mouseenter', () => {
      if (!_glitchBuf) return
      const src  = _glitchCtx.createBufferSource()
      const gain = _glitchCtx.createGain()
      gain.gain.value = 2.2
      src.buffer = _glitchBuf
      src.connect(gain)
      gain.connect(_glitchCtx.destination)
      _glitchCtx.resume().then(() => src.start())
    })
  })()

  // ── 13. Chip drag + semilla click ───────────────────────────────────────
  canvas.style.cursor = 'grab'
  let _pointerDownPos  = null
  let _isDragging      = false
  let _hoveredSemIdx   = -1
  const _semCursor     = document.getElementById('semilla-cursor')
  const _semCursorLabel = _semCursor?.querySelector('.cursor-label')

  canvas.addEventListener('pointerdown', (e) => {
    if (isPanelOpen()) return
    _pointerDownPos = { x: e.clientX, y: e.clientY }
    _isDragging = false
    chipDragStart(e.clientX, e.clientY)
    canvas.setPointerCapture(e.pointerId)
    canvas.style.cursor = 'grabbing'
  })

  window.addEventListener('pointermove', (e) => {
    if (_pointerDownPos) {
      const dx = e.clientX - _pointerDownPos.x
      const dy = e.clientY - _pointerDownPos.y
      if (Math.sqrt(dx * dx + dy * dy) > 5) _isDragging = true
    }
    chipDragMove(e.clientX, e.clientY)
  }, { passive: true })

  const _endDrag = (e) => {
    // Short tap (no drag) → check for semilla click
    const _contactActive = parseFloat(document.getElementById('text-contact')?.style.opacity) === 1
    if (!_isDragging && _pointerDownPos && e && !isPanelOpen() && !_contactActive) {
      const cam = getCamera()
      if (cam && meshesSemillasArr.length > 0) {
        const mouse = new THREE.Vector2(
          (e.clientX / window.innerWidth)  * 2 - 1,
          -(e.clientY / window.innerHeight) * 2 + 1,
        )
        // Use invisible picker spheres (equal radius, one per semilla) instead of
        // the actual semilla geometry. This eliminates all size-bias issues —
        // semilla1 is much larger than 2/3/4 so its geometry dominated click area.
        const rc = new THREE.Raycaster()
        rc.setFromCamera(mouse, cam)
        const _pickers = semillaPickerMeshes.length > 0 ? semillaPickerMeshes : meshesSemillasArr
        const hits = rc.intersectObjects(_pickers, false)
        if (hits.length > 0) {
          const idx = hits[0].object.userData.semillaIndex
          if (idx !== undefined) {
            playOneShot('/audio/WhooshWater.mp3', 0.7)
            const _dur = getAnimationDuration()
            const _tf  = CONFIG.scroll.totalFrames || 360
            markUserSound('WhooshWater.mp3', _dur ? getAnimationTime() * _tf / _dur : 0)
            openProjectPanel(idx, { x: e.clientX, y: e.clientY }, getRenderer().domElement)
          }
        }
      }
    }
    _pointerDownPos = null
    _isDragging = false
    chipDragEnd()
    canvas.style.cursor = 'grab'
  }

  window.addEventListener('pointerup',     _endDrag)
  window.addEventListener('pointercancel', _endDrag)

  let _butterflyPreview = false
  window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') { toggleOverview(); return }
    if (e.key === 'b' || e.key === 'B') {
      _butterflyPreview = !_butterflyPreview
      if (_butterflyPreview) showButterflies(getCamera())
      else hideButterflies()
    }
  })

  // ── Hover cables (actualiza rayo del mouse en cada frame) ────────────────
  window.addEventListener('mousemove', (e) => {
    _mouseHover.x =  (e.clientX / window.innerWidth)  * 2 - 1
    _mouseHover.y = -(e.clientY / window.innerHeight) * 2 + 1
    _mouseActive  = true
  })
  window.addEventListener('mouseout', () => { _mouseActive = false })

  // ── Frame counter refs ───────────────────────────────────────────────────
  const _fcCurrent = document.getElementById('frame-current')
  const _fcEl      = document.getElementById('frame-counter')

  // Declared before onTick to avoid TDZ — assigned below after scene is ready
  let _maskMesh        = null
  const _maskFrameStart = 257
  let _semillasShown   = true

  // ── Tick: tiempos de shaders + hover ────────────────────────────────────
  onTick((elapsed) => {
    const dt = elapsed - _prevElapsed
    _prevElapsed = elapsed

    // Live frame counter — uses scroll-based frame during hold (shows 360–364 beyond anim end)
    const _fps    = CONFIG.scroll.totalFrames / (getAnimationDuration() || 1)
    const _animFr = Math.round(getAnimationTime() * _fps)
    if (_fcCurrent && !isPanelOpen()) {
      const scrollFr = getScrollFrame()
      const frame    = Math.max(_animFr, scrollFr)
      _fcCurrent.textContent = String(frame).padStart(3, '0')
    }
    if (_fcEl) _fcEl.style.opacity = isPanelOpen() ? '0' : '1'

    // Root mask — auto show/hide based on current frame
    if (_maskMesh) _maskMesh.visible = _animFr >= _maskFrameStart

    // Spiral particles — visible from frame 200 onward
    setMorphParticlesVisible(_animFr >= 200)

    // Semillas — fade out when camera approaches flower (frame 336+)
    const _semShouldShow = _animFr < 336
    if (_semShouldShow !== _semillasShown) {
      _semillasShown = _semShouldShow
      setSemillasVisible(_semShouldShow)
    }

    // Fly away butterflies when reaching FLOR_GRANDE (frame 249) on scroll path
    if (_animFr >= 249) flyAwayButterflies(getCamera())

    // Dev timeline
    window.__updateDevTimeline?.()

    // ── Filament Stretch: ramp-in 215→232, hold 232→260, top-to-bottom wipe 250→260
    const _filFps  = CONFIG.scroll.totalFrames / (getAnimationDuration() || 1)
    const _filFr   = Math.max(Math.round(getAnimationTime() * _filFps), getScrollFrame())
    const _FS = 211, _FM = 228, _FE = 256, _WS = 246
    let _filProg = 0, _wipeY = 0
    if (_filFr >= _FS && _filFr <= _FE) {
      _filProg = _filFr <= _FM
        ? (_filFr - _FS) / (_FM - _FS)   // ramp up 215→232
        : 1.0                              // hold at full from 232→260
      if (_filFr >= _WS)
        _wipeY = (_filFr - _WS) / (_FE - _WS)  // top-to-bottom wipe 250→260
    }
    setFilamentProgress(_filProg, _wipeY)
    tickFilament(elapsed)

    updateMaterialTime(elapsed)
    updatePointCloudTime(elapsed)
    tickChipFloat(elapsed, _animFr)
    tickOverviewControls()

    const cam = getCamera()
    if (cam) {
      if (_mouseActive) {
        _raycaster.setFromCamera(_mouseHover, cam)
        raizUniforms.uMouseRayOrigin.value.copy(_raycaster.ray.origin)
        raizUniforms.uMouseRayDir.value.copy(_raycaster.ray.direction)
      } else {
        raizUniforms.uMouseRayOrigin.value.set(99999, 99999, 99999)
      }
      tickParticles(elapsed, dt, _raycaster, _mouseActive, cam)
      tickRaicesParticles(elapsed, dt, _raycaster, _mouseActive, cam)
      tickMorphParticles(elapsed, dt)
      tickRipple(_mouseHover, _mouseActive, cam)
      tickButterflies(elapsed, dt, cam)

      // Semilla hover — glow, iridescence burst, UV parallax tilt, custom cursor
      const _contactNow = parseFloat(document.getElementById('text-contact')?.style.opacity) === 1
      if (_mouseActive && !isPanelOpen() && !_isDragging && !_contactNow) {
        const _pickTargets = semillaPickerMeshes.length > 0 ? semillaPickerMeshes : meshesSemillasArr
        const semHits = _raycaster.intersectObjects(_pickTargets, false)
        const newIdx  = semHits.length > 0 ? (semHits[0].object.userData.semillaIndex ?? -1) : -1

        if (newIdx !== _hoveredSemIdx) {
          if (_hoveredSemIdx >= 0) semillaHoverLeave(_hoveredSemIdx)
          if (newIdx >= 0) semillaHoverEnter(newIdx)
          _hoveredSemIdx = newIdx
          if (_semCursor) {
            if (newIdx >= 0) {
              if (_semCursorLabel) _semCursorLabel.textContent = CONFIG.projects[newIdx]?.title ?? 'View'
              _semCursor.classList.add('visible')
            } else {
              _semCursor.classList.remove('visible')
            }
          }
        }

        canvas.style.cursor = _hoveredSemIdx >= 0 ? 'none' : 'grab'

        if (_hoveredSemIdx >= 0) {
          semillaSetTilt(_hoveredSemIdx, _mouseHover.x, _mouseHover.y)
          if (_semCursor) {
            _semCursor.style.left = `${(_mouseHover.x * 0.5 + 0.5) * window.innerWidth}px`
            _semCursor.style.top  = `${(-_mouseHover.y * 0.5 + 0.5) * window.innerHeight}px`
          }
        }
      } else {
        if (_hoveredSemIdx >= 0) {
          semillaHoverLeave(_hoveredSemIdx)
          _hoveredSemIdx = -1
        }
        if (_semCursor) _semCursor.classList.remove('visible')
      }
    }
  })

  // ── Panel Theatre: Render (exposición) ───────────────────────────────────
  const renderObj = sheet.object('Render', {
    exposicion: types.number(1.0, { range: [0, 3], nudgeMultiplier: 0.05 }),
  })
  renderObj.onValuesChange((v) => {
    getRenderer().toneMappingExposure = v.exposicion
  })

  // ── Panel Theatre: Cámara FOV (focal length → fov) ───────────────────────
  const APERTURA_V_MM = 23.7762
  const focalAFov = (mm) => 2 * Math.atan(APERTURA_V_MM / (2 * mm)) * 180 / Math.PI
  const camaraObj = sheet.object('Cámara FOV', {
    focalLength: types.number(50, { range: [10, 200], nudgeMultiplier: 1 }),
  })
  camaraObj.onValuesChange((v) => {
    const baseFov  = focalAFov(v.focalLength)
    const isMobile = window.innerWidth <= 768
    const fov      = isMobile ? baseFov * (CONFIG.cameraFovMultiplierMobile ?? 1.2) : baseFov
    const cam      = getCamera()
    if (cam) { cam.fov = fov; cam.updateProjectionMatrix() }
  })

  // ── Plano negro (máscara de raíces) ─────────────────────────────────────
  // Aparece al llegar al frame 257 para tapar las raíces del chip.
  // No se pueden ocultar directamente porque comparten objeto con FLOR_GRANDE.
  // Posición / rotación / escala ajustables en tiempo real desde Theatre.js.
  const _maskGeo = new THREE.PlaneGeometry(1, 1)
  const _maskMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, depthWrite: true, transparent: false, opacity: 1.0 })
  _maskMesh = new THREE.Mesh(_maskGeo, _maskMat)
  _maskMesh.renderOrder = 999
  _maskMesh.layers.enable(1)  // also present in bloom pass so glow doesn't bleed through
  _maskMesh.visible = false
  getScene().add(_maskMesh)

  // Pre-compile mask shader so first appearance at frame 257 doesn't stutter
  getRenderer().compile(getScene(), getCamera())

  const _maskObj = sheet.object('Máscara 3D', {
    posX:   types.number(0,   { range: [-20, 20],    nudgeMultiplier: 0.05 }),
    posY:   types.number(0,   { range: [-20, 20],    nudgeMultiplier: 0.05 }),
    posZ:   types.number(0,   { range: [-20, 20],    nudgeMultiplier: 0.05 }),
    rotX:   types.number(0,   { range: [-180, 180],  nudgeMultiplier: 1    }),
    rotY:   types.number(0,   { range: [-180, 180],  nudgeMultiplier: 1    }),
    rotZ:   types.number(0,   { range: [-180, 180],  nudgeMultiplier: 1    }),
    scaleX: types.number(4,   { range: [0.1, 40],    nudgeMultiplier: 0.1  }),
    scaleY: types.number(4,   { range: [0.1, 40],    nudgeMultiplier: 0.1  }),
  })
  _maskObj.onValuesChange((v) => {
    _maskMesh.position.set(v.posX, v.posY, v.posZ)
    _maskMesh.rotation.set(
      v.rotX * Math.PI / 180,
      v.rotY * Math.PI / 180,
      v.rotZ * Math.PI / 180,
    )
    _maskMesh.scale.set(v.scaleX, v.scaleY, 1)
  })

}

boot()
