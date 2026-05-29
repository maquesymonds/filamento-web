// pixelReveal.js — WebGL image reveal effect
// Exact port of CodropsEmergingImages Variation 4 (UI nav index 3 = uType==3 in shader)
// Curtain wipe top→bottom, wavy sinusoidal edge, pixelation distortion + fill color band.
// Original by Yuri Artiukh (@akella) for Codrops.

import gsap from 'gsap'

// ── Vertex shader (pass-through) ──────────────────────────────────────────────
const VERT = `
  attribute vec2 aPos;
  attribute vec2 aUV;
  varying vec2 vUv;
  void main() {
    vUv = aUV;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

// ── Fragment shader — exact uType==3 from EmergeMaterial.js ───────────────────
const FRAG = `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D uTexture;
  uniform float     uProgress;
  uniform vec3      uFillColor;
  uniform vec2      uElementSize;
  uniform vec2      uTextureSize;

  float quadraticInOut(float t) {
    float p = 2.0 * t * t;
    return t < 0.5 ? p : -p + (4.0 * t) - 1.0;
  }

  void main() {
    // Texture cover (object-fit: cover) — same as original
    vec2 uv = vUv - vec2(0.5);
    float aspect1 = uTextureSize.x / uTextureSize.y;
    float aspect2 = uElementSize.x  / uElementSize.y;
    if (aspect1 > aspect2) { uv *= vec2(aspect2 / aspect1, 1.0); }
    else                   { uv *= vec2(1.0, aspect1 / aspect2); }
    uv += vec2(0.5);

    float imageAspect = uTextureSize.x / uTextureSize.y;

    // ── uType == 3 block (copied verbatim) ──────────────────────────
    float progress = quadraticInOut(1.0 - uProgress);
    float s = 50.0;
    vec2 gridSize = vec2(s, floor(s / imageAspect));

    // curtain
    float v = smoothstep(0.0, 1.0,
      vUv.y
      + sin(vUv.x * 4.0 + progress * 6.0)
        * mix(0.3, 0.1, abs(0.5 - vUv.x))
        * 0.5
        * smoothstep(0.0, 0.2, progress)
      + (1.0 - progress * 2.0)
    );

    float mixnewUV = (vUv.x * 3.0 + (1.0 - v) * 50.0) * progress;
    vec2  subUv    = mix(uv, floor(uv * gridSize) / gridSize, mixnewUV);

    vec4 color = texture2D(uTexture, subUv);
    color.a = mix(1.0, pow(v, 5.0), step(0.0, progress));
    color.a = pow(v, 1.0);
    color.rgb = mix(color.rgb, uFillColor, smoothstep(0.5, 0.0, abs(0.5 - color.a)) * progress);

    gl_FragColor = color;
  }
`

// ── helpers ───────────────────────────────────────────────────────────────────
function _compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[pixelReveal] shader:', gl.getShaderInfoLog(s))
  }
  return s
}

// ── playPixelReveal ───────────────────────────────────────────────────────────
// fillColor: [r,g,b] in 0-1 range. Default matches the Codrops demo (#403fb7).
export function playPixelReveal(imgEl, { duration = 1.5, fillColor = [0.251, 0.247, 0.718] } = {}) {
  if (!imgEl) return

  const run = () => {
    const wrap = imgEl.parentElement
    const w    = imgEl.offsetWidth
    const h    = imgEl.offsetHeight
    if (!w || !h) return

    // WebGL overlay canvas
    const canvas = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h
    Object.assign(canvas.style, {
      position:      'absolute',
      inset:         '0',
      width:         '100%',
      height:        '100%',
      borderRadius:  'inherit',
      zIndex:        '2',
      pointerEvents: 'none',
    })
    wrap.appendChild(canvas)

    const gl = canvas.getContext('webgl', { alpha: true })
           || canvas.getContext('experimental-webgl', { alpha: true })
    if (!gl) { canvas.remove(); imgEl.style.opacity = ''; return }

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)
    gl.viewport(0, 0, w, h)

    // Program
    const program = gl.createProgram()
    gl.attachShader(program, _compile(gl, gl.VERTEX_SHADER,   VERT))
    gl.attachShader(program, _compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(program)
    gl.useProgram(program)

    // Full-screen quad (TRIANGLE_STRIP)
    const quad = new Float32Array([-1,-1, 1,-1, -1,1, 1,1])
    const uvs  = new Float32Array([ 0, 0, 1, 0,  0,1, 1,1])

    const posBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)
    const aPosLoc = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(aPosLoc)
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0)

    const uvBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf)
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW)
    const aUVLoc = gl.getAttribLocation(program, 'aUV')
    gl.enableVertexAttribArray(aUVLoc)
    gl.vertexAttribPointer(aUVLoc, 2, gl.FLOAT, false, 0, 0)

    // Uniforms
    const uProgressLoc    = gl.getUniformLocation(program, 'uProgress')
    const uFillColorLoc   = gl.getUniformLocation(program, 'uFillColor')
    const uElementSizeLoc = gl.getUniformLocation(program, 'uElementSize')
    const uTextureSizeLoc = gl.getUniformLocation(program, 'uTextureSize')
    const uTextureLoc     = gl.getUniformLocation(program, 'uTexture')

    gl.uniform1i(uTextureLoc,     0)
    gl.uniform3fv(uFillColorLoc,  fillColor)
    gl.uniform2f(uElementSizeLoc, w, h)
    gl.uniform2f(uTextureSizeLoc, imgEl.naturalWidth, imgEl.naturalHeight)

    // Upload image as texture (FLIP_Y so top of image = vUv.y=1)
    const tex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgEl)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    // Hide the real <img> while the WebGL canvas plays
    imgEl.style.opacity = '0'

    const proxy = { p: 0 }
    gsap.to(proxy, {
      p:        1,
      duration,
      ease:     'none',
      onUpdate() {
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.uniform1f(uProgressLoc, proxy.p)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      },
      onComplete() {
        imgEl.style.opacity = ''
        gl.deleteTexture(tex)
        canvas.remove()
      },
    })
  }

  if (imgEl.complete && imgEl.naturalWidth) {
    run()
  } else {
    imgEl.addEventListener('load', run, { once: true })
  }
}
