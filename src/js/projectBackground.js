// projectBackground.js — Atmospheric WebGL background for project panel
//
// Two-layer WebGL scene on a single canvas:
//   1. Fullscreen bg quad  — dark mirrored image + procedural fBm field
//   2. Image plane mesh    — project image, same wave lensing as bg
//
// The HTML text sits on top (z-index: 1+). The HTML <img> is hidden so
// the WebGL mesh is the only thing rendering the project image.

import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js'

// ── Constants ─────────────────────────────────────────────────────────────────
const WAVE_SIZE = 512
const NUM_DROPS = 8

const DROP_STRENGTH = 0.38
const DAMPING       = 0.88
const DROP_RADIUS   = 0.006

// ── State ─────────────────────────────────────────────────────────────────────
let _renderer = null
let _scene    = null
let _camera   = null
let _canvas   = null
let _gpu      = null
let _waveVar  = null
let _bgMat    = null
let _imgMat   = null
let _imgMesh  = null
let _fallback = null

const _dropUVs = Array.from({ length: NUM_DROPS }, () => new THREE.Vector2(-2, -2))
const _dropStr = new Float32Array(NUM_DROPS)
const _lastUV  = new THREE.Vector2(-2, -2)
const _mouseUV = new THREE.Vector2(0.5, 0.5)

const _parallax       = new THREE.Vector2(0, 0)
const _parallaxTarget = new THREE.Vector2(0, 0)
const _imgBasePos     = new THREE.Vector2(0, 0)   // mesh position without parallax

let _hover   = 0
let _target  = 0
let _running = false
let _rafId   = null
let _clock   = null

// ── GPGPU wave shader ─────────────────────────────────────────────────────────
const WAVE_SHADER = /* glsl */`
  uniform vec2  uMouseUV[${NUM_DROPS}];
  uniform float uDropStrength[${NUM_DROPS}];
  uniform float uDropRadius;
  uniform float uDamping;

  void main() {
    vec2  uv    = gl_FragCoord.xy / resolution.xy;
    vec2  texel = 1.0 / resolution.xy;
    vec4  c     = texture2D(wave, uv);
    float h     = c.r;
    float p     = c.g;

    float l  = texture2D(wave, uv - vec2(texel.x, 0.0)).r;
    float rg = texture2D(wave, uv + vec2(texel.x, 0.0)).r;
    float u  = texture2D(wave, uv - vec2(0.0, texel.y)).r;
    float d  = texture2D(wave, uv + vec2(0.0, texel.y)).r;

    float newH = (l + rg + u + d) * 0.5 - p;
    newH *= uDamping;

    float r2   = max(uDropRadius * uDropRadius, 1e-6);
    float drop = 0.0;
    for (int i = 0; i < ${NUM_DROPS}; i++) {
      vec2 dv = uv - uMouseUV[i];
      drop += exp(-dot(dv, dv) / r2) * uDropStrength[i];
    }
    newH += drop;

    gl_FragColor = vec4(newH, h, 0.0, 1.0);
  }
`

// ── Background plane shaders ──────────────────────────────────────────────────
const BG_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const BG_FRAG = /* glsl */`
  uniform sampler2D uImgTex;
  uniform sampler2D uWaveTex;
  uniform float     uHover;
  uniform float     uTime;
  uniform float     uAspect;
  uniform float     uWaveAmp;
  uniform vec2      uParallax;
  uniform vec3      uWaveTint;
  uniform vec3      uBaseTint;
  uniform float     uBgBrightness;
  varying vec2      vUv;

  vec2 mirrorTile(vec2 uv) {
    return 1.0 - abs(mod(uv, 2.0) - 1.0);
  }

  float hash(vec2 p) {
    p  = fract(p * vec2(127.34, 311.76));
    p += dot(p, p + 41.83);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i),               hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2  rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      v += a * vnoise(p);
      p  = rot * p * 2.1 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 t  = vec2(uTime * 0.038, uTime * 0.022);

    // ── Parallax layers — each drifts at different speed ─────────────────
    // Wave stays in screen UV (stable anchor)
    // Image bg: subtle, most anchored
    // Field:    mid drift
    // Ghost:    most drift — strongest depth illusion
    vec2 uvImg   = uv + uParallax * 0.25;
    vec2 uvField = uv + uParallax * 1.60;
    vec2 uvGhost = uv + uParallax * 2.80;

    uvImg.x += sin(uvImg.y * 7.2 + uTime * 0.16) * 0.003 * uHover;
    uvImg.y += cos(uvImg.x * 5.8 + uTime * 0.13) * 0.002 * uHover;

    // Wave gradient — sampled in stable screen UV
    vec2  texel = 1.0 / vec2(float(${WAVE_SIZE}));
    float h_c   = texture2D(uWaveTex, uv).r;
    float h_r1  = texture2D(uWaveTex, uv + vec2(texel.x,       0.0)).r;
    float h_r2  = texture2D(uWaveTex, uv + vec2(texel.x * 2.5, 0.0)).r;
    float h_u1  = texture2D(uWaveTex, uv + vec2(0.0, texel.y      )).r;
    float h_u2  = texture2D(uWaveTex, uv + vec2(0.0, texel.y * 2.5)).r;
    vec2  grad  = vec2(h_r1 * 0.7 + h_r2 * 0.3 - h_c,
                       h_u1 * 0.7 + h_u2 * 0.3 - h_c);

    // Image lensing + chromatic aberration — uses parallaxed image UV
    vec2  distUv = mirrorTile(uvImg + grad * uWaveAmp);
    vec2  caDir  = normalize(grad + vec2(0.0001));
    float ca     = length(grad) * 2.5;
    float r_img  = texture2D(uImgTex, mirrorTile(distUv + caDir * ca * 0.012)).r;
    float g_img  = texture2D(uImgTex, distUv).g;
    float b_img  = texture2D(uImgTex, mirrorTile(distUv - caDir * ca * 0.012)).b;
    vec3  imgCol = vec3(r_img, g_img, b_img);

    // Procedural field — two depth layers using parallaxed field UV
    vec2 fUv  = uvField * vec2(uAspect, 1.0);

    // Layer 1 — foreground: fine, fast, strongly wave-coupled
    vec2  fFore    = fUv + grad * 2.2;
    float largeFbm = fbm(fFore * 1.6 + t * 0.6);
    float fineFbm  = fbm(fFore * 5.5 + t * 1.4 + largeFbm * 0.35);
    float micro    = vnoise(fFore * 22.0 + t * 3.0);
    float field1   = largeFbm * 0.50 + fineFbm * 0.35 + micro * 0.15;
    field1 = smoothstep(0.28, 0.82, field1);

    // Layer 2 — background: coarser, counter-drift, shallow wave
    vec2  t2     = vec2(-uTime * 0.016, uTime * 0.027);
    vec2  fBack  = fUv * 0.65 + grad * 0.9;
    float field2 = fbm(fBack * 1.3 + t2);
    field2 = smoothstep(0.18, 0.78, field2);

    // Ghost image contamination — strongest parallax, independent drift
    vec2 tG      = vec2(uTime * 0.024, -uTime * 0.018);
    vec2 ghostUv = mirrorTile(uvGhost
      + grad * uWaveAmp * 3.0
      + vec2(fbm(uvGhost * 2.8 + tG) - 0.5, fbm(uvGhost * 2.8 + tG + 4.3) - 0.5) * 0.07
    );
    vec3 ghostCol = texture2D(uImgTex, ghostUv).rgb;

    // Compose
    vec3  col          = imgCol;
    float fieldCombined = field1 * 0.65 + field2 * 0.35;
    col += field1 * 0.026;
    col += field2 * 0.016;
    col += ghostCol * fieldCombined * 0.075;

    float waveEnergy = pow(abs(h_c), 1.5);
    col += uWaveTint          * waveEnergy * 0.45;
    col += uWaveTint * 0.50   * field1 * waveEnergy * 0.55;
    col += uWaveTint * 0.25   * field2 * waveEnergy * 0.30;

    // Vignette + global darkness
    vec2  cen = (uv - 0.5) * vec2(uAspect, 1.0);
    float vig = 1.0 - smoothstep(0.1, 0.72, length(cen));
    float b   = (0.032 + vig * 0.09) * (0.28 + uHover * 0.72) * uBgBrightness;

    gl_FragColor = vec4(col * b + uBaseTint, 1.0);
  }
`

// ── Image plane shaders ───────────────────────────────────────────────────────
// The image mesh lives in the same WebGL scene so the wave affects it too.
// vScreenUv is the fragment's position in screen UV [0,1] — used to sample
// the wave texture at the correct location on screen.
const IMG_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec2 vScreenUv;
  void main() {
    vUv = uv;
    vec4 pos    = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vScreenUv   = pos.xy * 0.5 + 0.5;
    gl_Position = pos;
  }
`

const IMG_FRAG = /* glsl */`
  uniform sampler2D uImgTex;
  uniform sampler2D uWaveTex;
  uniform float     uWaveAmp;
  uniform float     uProgress;   // 0 = hidden, 1 = fully revealed
  uniform float     uImgAspect;  // natural image width / height
  uniform vec2      uMeshSize;
  varying vec2      vUv;
  varying vec2      vScreenUv;

  float quadraticInOut(float t) {
    float p = 2.0 * t * t;
    return t < 0.5 ? p : -p + (4.0 * t) - 1.0;
  }

  void main() {
    // Border radius — correct SDF (d<0 inside, d=0 border, d>0 outside)
    float radius = 16.0;
    vec2  px = vUv * uMeshSize;
    vec2  p  = px - uMeshSize * 0.5;
    vec2  q  = abs(p) - uMeshSize * 0.5 + radius;
    float d  = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    float borderAlpha = 1.0 - smoothstep(-1.5, 1.5, d);
    if (borderAlpha <= 0.0) { gl_FragColor = vec4(0.0); return; }

    // ── Curtain reveal — ported exactly from pixelReveal.js (uType==3) ─────
    float progress = quadraticInOut(1.0 - uProgress);
    float s        = 50.0;
    vec2  gridSize = vec2(s, floor(s / max(uImgAspect, 0.01)));

    float v = smoothstep(0.0, 1.0,
      vUv.y
      + sin(vUv.x * 4.0 + progress * 6.0)
        * mix(0.3, 0.1, abs(0.5 - vUv.x)) * 0.5
        * smoothstep(0.0, 0.2, progress)
      + (1.0 - progress * 2.0)
    );

    vec2  zoomedUv = (vUv - 0.5) * 0.94 + 0.5;
    float mixVal = (zoomedUv.x * 3.0 + (1.0 - v) * 50.0) * progress;
    vec2  baseUv = mix(zoomedUv, floor(zoomedUv * gridSize) / gridSize, mixVal);

    // ── Wave distortion on top of the reveal UV ───────────────────────────
    vec2  texel = 1.0 / vec2(float(${WAVE_SIZE}));
    float h_c   = texture2D(uWaveTex, vScreenUv).r;
    float h_r   = texture2D(uWaveTex, vScreenUv + vec2(texel.x, 0.0)).r;
    float h_u   = texture2D(uWaveTex, vScreenUv + vec2(0.0, texel.y)).r;
    vec2  grad  = vec2(h_r - h_c, h_u - h_c);

    vec2  distUv = clamp(baseUv + grad * uWaveAmp * 3.5, 0.0, 1.0);
    vec2  caDir  = normalize(grad + vec2(0.0001));
    float caLen  = length(grad) * 2.5;

    float rCh = texture2D(uImgTex, clamp(distUv + caDir * caLen * 0.010, 0.0, 1.0)).r;
    float gCh = texture2D(uImgTex, distUv).g;
    float bCh = texture2D(uImgTex, clamp(distUv - caDir * caLen * 0.010, 0.0, 1.0)).b;
    vec3  imgCol = vec3(rCh, gCh, bCh);

    // Fill color band at the curtain edge (teal, matches bg atmosphere)
    vec3 fillColor = vec3(0.06, 0.35, 0.45);
    imgCol = mix(imgCol, fillColor, smoothstep(0.5, 0.0, abs(0.5 - v)) * progress);

    gl_FragColor = vec4(imgCol, v * borderAlpha);
  }
`

// ── Image plane geometry (rebuilt on resize) ──────────────────────────────────
function _makeImgPlane() {
  if (_imgMesh) { _scene.remove(_imgMesh); _imgMesh.geometry.dispose(); _imgMesh = null }
  // Placeholder 1×1 — _repositionImgMesh() sets real size after DOM layout
  const geo = new THREE.PlaneGeometry(1, 1)
  _imgMesh  = new THREE.Mesh(geo, _imgMat)
  _imgMesh.renderOrder = 1
  _imgMesh.visible     = false
  _scene.add(_imgMesh)
}

// Read the actual CSS layout rect, position the mesh to match, then hide the wrap
function _repositionImgMesh() {
  const wrap = document.getElementById('project-panel-image-wrap')
  if (!wrap || !_imgMesh) return

  // Temporarily restore display so getBoundingClientRect works
  const prev = wrap.style.display
  wrap.style.display = ''
  const rect = wrap.getBoundingClientRect()
  wrap.style.display = 'none'   // hide wrap — WebGL mesh replaces it visually

  if (rect.width === 0 || rect.height === 0) { wrap.style.display = prev; return }

  const W = window.innerWidth
  const H = window.innerHeight

  // Pixel rect → NDC  (WebGL Y is up, DOM Y is down)
  const ndcX0 = (rect.left   / W) * 2 - 1
  const ndcX1 = (rect.right  / W) * 2 - 1
  const ndcY0 = 1 - (rect.bottom / H) * 2
  const ndcY1 = 1 - (rect.top    / H) * 2

  const ndcW = ndcX1 - ndcX0
  const ndcH = ndcY1 - ndcY0

  const cx = (ndcX0 + ndcX1) / 2
  const cy = (ndcY0 + ndcY1) / 2

  _imgMesh.geometry.dispose()
  _imgMesh.geometry = new THREE.PlaneGeometry(ndcW, ndcH)
  _imgMesh.position.set(cx, cy, 0)
  _imgBasePos.set(cx, cy)   // store so parallax can offset from here

  if (_imgMat) _imgMat.uniforms.uMeshSize.value.set(rect.width, rect.height)
}

// ── Public API ────────────────────────────────────────────────────────────────
export function initProjectBackground() {
  _canvas = document.getElementById('project-bg-canvas')
  if (!_canvas) return

  _renderer = new THREE.WebGLRenderer({ canvas: _canvas, alpha: false, antialias: false })
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  _renderer.setSize(window.innerWidth, window.innerHeight)

  _scene  = new THREE.Scene()
  _camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  _clock  = new THREE.Clock()

  _fallback = new THREE.DataTexture(new Uint8Array([25, 25, 30, 255]), 1, 1)
  _fallback.needsUpdate = true

  // ── GPGPU ───────────────────────────────────────────────────────────────────
  _gpu = new GPUComputationRenderer(WAVE_SIZE, WAVE_SIZE, _renderer)
  const initTex = _gpu.createTexture()
  _waveVar = _gpu.addVariable('wave', WAVE_SHADER, initTex)
  _gpu.setVariableDependencies(_waveVar, [_waveVar])
  Object.assign(_waveVar.material.uniforms, {
    uMouseUV:      { value: _dropUVs    },
    uDropStrength: { value: _dropStr    },
    uDropRadius:   { value: DROP_RADIUS },
    uDamping:      { value: DAMPING     },
  })
  const err = _gpu.init()
  if (err) console.error('[PanelBg GPGPU]', err)

  const waveTex = _gpu.getCurrentRenderTarget(_waveVar).texture

  // ── Background plane ────────────────────────────────────────────────────────
  _bgMat = new THREE.ShaderMaterial({
    uniforms: {
      uImgTex:   { value: _fallback                   },
      uWaveTex:  { value: waveTex                     },
      uHover:     { value: 0                                      },
      uTime:      { value: 0                                      },
      uAspect:    { value: window.innerWidth / window.innerHeight },
      uWaveAmp:   { value: 0.14                                   },
      uParallax:  { value: new THREE.Vector2(0, 0)                },
      uWaveTint:     { value: new THREE.Color(0.03, 0.12, 0.55) },
      uBaseTint:     { value: new THREE.Color(0.01, 0.02, 0.10) },
      uBgBrightness: { value: 1.0 },
    },
    vertexShader:   BG_VERT,
    fragmentShader: BG_FRAG,
    depthWrite:     false,
  })
  const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), _bgMat)
  bgMesh.renderOrder = 0
  _scene.add(bgMesh)

  // ── Image plane ─────────────────────────────────────────────────────────────
  _imgMat = new THREE.ShaderMaterial({
    uniforms: {
      uImgTex:    { value: _fallback                   },
      uWaveTex:   { value: waveTex                     },
      uWaveAmp:   { value: 0.22                        },
      uProgress:  { value: 0                           },
      uImgAspect: { value: 16 / 9                      },
      uMeshSize:  { value: new THREE.Vector2(800, 450) },
    },
    vertexShader:   IMG_VERT,
    fragmentShader: IMG_FRAG,
    depthWrite:     false,
    depthTest:      false,
    transparent:    true,
  })
  _makeImgPlane()

  window.addEventListener('mousemove', _onMouse)
  window.addEventListener('resize',    _onResize)
}

function _curtainReveal() {
  if (!_imgMat) return
  _imgMat.uniforms.uProgress.value = 0
  const t0 = performance.now()
  const animate = () => {
    const p = Math.min((performance.now() - t0) / 1500, 1)
    if (_imgMat) _imgMat.uniforms.uProgress.value = p
    if (p < 1) requestAnimationFrame(animate)
  }
  requestAnimationFrame(animate)
}

// imgUrl   — static texture for the image mesh (cover/portada, curtain reveal)
// bgUrl    — texture for the fullscreen bg quad (behind jellyfish); falls back to imgUrl
// tint     — optional { wave, base, brightness } to override water color
// videoUrl — base path (no extension) to use as VideoTexture instead of imgUrl
export function showProjectBackground(imgUrl, bgUrl, tint, videoUrl) {
  if (!_renderer) return
  _canvas.style.display = 'block'
  _target = 1
  _clock.start()
  _startLoop()

  // Hide HTML image and video — WebGL mesh takes over rendering
  const htmlImg = document.getElementById('project-panel-image')
  if (htmlImg) htmlImg.style.visibility = 'hidden'

  // Measure DOM rect after two frames so the panel flex layout is fully applied
  requestAnimationFrame(() => requestAnimationFrame(() => _repositionImgMesh()))

  // Apply water tint (or reset to default blue if not supplied)
  if (_bgMat) {
    _bgMat.uniforms.uWaveTint.value.setRGB(
      tint?.wave ? ((tint.wave >> 16 & 0xff) / 255) : 0.03,
      tint?.wave ? ((tint.wave >>  8 & 0xff) / 255) : 0.12,
      tint?.wave ? ((tint.wave       & 0xff) / 255) : 0.55,
    )
    _bgMat.uniforms.uBaseTint.value.setRGB(
      tint?.base ? ((tint.base >> 16 & 0xff) / 255) : 0.01,
      tint?.base ? ((tint.base >>  8 & 0xff) / 255) : 0.02,
      tint?.base ? ((tint.base       & 0xff) / 255) : 0.10,
    )
    _bgMat.uniforms.uBgBrightness.value = tint?.brightness ?? 1.0
  }

  if (!imgUrl && !bgUrl && !videoUrl) return

  const loader = new THREE.TextureLoader()

  if (videoUrl) {
    // Feed the hidden <video> element into WebGL as a live texture
    const vidEl = document.getElementById('project-panel-video')
    if (vidEl && _imgMat && _imgMesh) {
      const vidTex = new THREE.VideoTexture(vidEl)
      vidTex.minFilter = THREE.LinearFilter
      _imgMat.uniforms.uImgTex.value    = vidTex
      _imgMat.uniforms.uImgAspect.value = 16 / 9
      _imgMesh.visible = true
      _curtainReveal()
    }
  } else if (imgUrl) {
    // Load static cover image → image mesh
    loader.load(imgUrl, (tex) => {
      tex.minFilter = THREE.LinearFilter
      if (_imgMat) {
        _imgMat.uniforms.uImgTex.value    = tex
        _imgMat.uniforms.uImgAspect.value = tex.image.width / tex.image.height
      }
      if (_imgMesh) _imgMesh.visible = true
      _curtainReveal()
    })
  }

  // Load background image → bg quad only (falls back to cover if no bgUrl)
  const bgSrc = bgUrl || imgUrl
  if (bgSrc) {
    loader.load(bgSrc, (tex) => {
      tex.minFilter = THREE.LinearFilter
      if (_bgMat) _bgMat.uniforms.uImgTex.value = tex
    })
  }
}

export function hideProjectBackground() {
  _target = 0
  for (let i = 0; i < NUM_DROPS; i++) { _dropUVs[i].set(-2, -2); _dropStr[i] = 0 }
  _lastUV.set(-2, -2)

  if (_imgMesh) _imgMesh.visible = false
  if (_imgMat)  _imgMat.uniforms.uProgress.value = 0

  setTimeout(() => {
    _stopLoop()
    if (_canvas) _canvas.style.display = 'none'
    _hover = 0
  }, 700)
}

export function isProjectBgActive() { return _running }

export function refreshImagePosition() {
  requestAnimationFrame(() => {
    _repositionImgMesh()
  })
}

// ── Loop ──────────────────────────────────────────────────────────────────────
function _startLoop() {
  if (_running) return
  _running = true
  ;(function loop() {
    if (!_running) return
    _rafId = requestAnimationFrame(loop)

    _hover += (_target - _hover) * 0.028

    // Smooth parallax — cinematic camera drift
    _parallaxTarget.x = (_mouseUV.x - 0.5) * 0.08
    _parallaxTarget.y = (_mouseUV.y - 0.5) * 0.08
    _parallax.x += (_parallaxTarget.x - _parallax.x) * 0.06
    _parallax.y += (_parallaxTarget.y - _parallax.y) * 0.06

    // Image mesh drifts in opposite direction (counter-parallax = deeper depth)
    if (_imgMesh && _imgMesh.visible) {
      _imgMesh.position.x = _imgBasePos.x - _parallax.x * 1.2
      _imgMesh.position.y = _imgBasePos.y - _parallax.y * 1.2
    }

    const delta = _lastUV.distanceTo(_mouseUV)
    if (delta > 0.0003) {
      for (let i = 0; i < NUM_DROPS; i++) {
        _dropUVs[i].lerpVectors(_lastUV.x < -1 ? _mouseUV : _lastUV, _mouseUV, i / (NUM_DROPS - 1))
        _dropStr[i] = DROP_STRENGTH
      }
      _lastUV.copy(_mouseUV)
    } else {
      for (let i = 0; i < NUM_DROPS; i++) _dropStr[i] = 0
    }

    _gpu.compute()
    const waveTex = _gpu.getCurrentRenderTarget(_waveVar).texture

    if (_bgMat) {
      _bgMat.uniforms.uWaveTex.value  = waveTex
      _bgMat.uniforms.uHover.value    = _hover
      _bgMat.uniforms.uTime.value     = _clock.getElapsedTime()
      _bgMat.uniforms.uParallax.value.copy(_parallax)
    }
    if (_imgMat) {
      _imgMat.uniforms.uWaveTex.value = waveTex
    }

    _renderer.render(_scene, _camera)
  })()
}

function _stopLoop() {
  _running = false
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null }
}

function _onMouse(e) {
  _mouseUV.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight)
}

// Mobile: drive el ripple desde un drag (coords de pantalla, igual que el mouse).
export function setPointerUV(clientX, clientY) {
  _mouseUV.set(clientX / window.innerWidth, 1 - clientY / window.innerHeight)
}

function _onResize() {
  if (!_renderer) return
  _renderer.setSize(window.innerWidth, window.innerHeight)
  if (_bgMat) _bgMat.uniforms.uAspect.value = window.innerWidth / window.innerHeight
  requestAnimationFrame(() => _repositionImgMesh())
}
