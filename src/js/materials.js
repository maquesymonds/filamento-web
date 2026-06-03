// materials.js — Materiales físicos, shaders de cables/aura, movimiento de plantas,
// ripple GPGPU en semillas. Todos los paneles conectados a Theatre.js.

import * as THREE from 'three'
import gsap from 'gsap'
import { types } from '@theatre/core'
import { sheet } from './theatre.js'
import { CONFIG } from './config.js'

export const BLOOM_LAYER = 1

// ── Uniforms compartidos ──────────────────────────────────────────────────────

export const movimientoUniforms = {
  u_time:         { value: 0.0 },
  u_maxDisp:      { value: 0.05 },
  u_breathSpeed:  { value: 2.0 },
  u_breathFreq:   { value: 5.0 },
  u_wobbleSpeed:  { value: 1.5 },
  u_wobbleFreq:   { value: 15.0 },
  u_wobbleBlend:  { value: 0.4 },
  u_swaySpeed:    { value: 1.0 },
  u_swayFreq:     { value: 2.5 },
  u_swayAmp:      { value: 0.1 },
  u_anchorHeight: { value: 0.3 },
}

export const raizUniforms = {
  uTime:              { value: 0.0 },
  uCrecimientoActual: { value: 0.0 },
  uLargoPunta:        { value: 2.0 },
  uSpeed:             { value: 1.5 },
  uWavelength:        { value: 30.0 },
  uPulseWidth:        { value: 0.15 },
  uColorOscuro:       { value: new THREE.Color(0x050505) },
  uColorPulse:        { value: new THREE.Color(0x0c3926) },
  uPulseIntensity:    { value: 3.0 },
  uMouseRayOrigin:    { value: new THREE.Vector3(99999, 99999, 99999) },
  uMouseRayDir:       { value: new THREE.Vector3(0, 0, -1) },
  uHoverRadius:       { value: 2.5 },
  uSwaySpeed:         { value: 0.164 },
  uSwayFreq:          { value: 0.55 },
  uSwayAmp:           { value: 0.228 },
  uAnchorEnd:         { value: 10.0 },
  uThicknessScale:    { value: 0.0 },
  uBrightness:        { value: 1.0 },
  uSwayYScale:        { value: 0.3 },
  uPulseSharpness:    { value: 1.0 },
  // Aura holográfica — leídos por raizAuraMaterial (misma ref de objeto)
  uAuraAmp:           { value: 1.5 },
  uAuraNoiseScale:    { value: 2.0 },
  uAuraNoiseSpeed:    { value: 0.5 },
  uAuraHoverBoost:    { value: 2.0 },
  uAuraGlow:          { value: 0.8 },
  uAuraBase:          { value: 0.25 },
  uAuraPulseBoost:    { value: 1.2 },
  uAuraFresnelPow:    { value: 2.5 },
  uAuraColor:         { value: new THREE.Color(0x0c3926) },
  uAuraOpacity:       { value: 1.0 },
}

// ── GLSL simplex noise (compartido entre shaders) ─────────────────────────────
const _SNOISE_GLSL = `
  vec4 _permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 _taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float _snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = _permute(_permute(_permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0+1.0;
    vec4 s1 = floor(b1)*2.0+1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = _taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
`

// ── ShaderMaterial de FLOR_GRANDE_RAICES ─────────────────────────────────────

export const raizFGUniforms = {
  uTime:              { value: 0.0 },
  uCrecimientoActual: { value: 1.05 },
  uLargoPunta:        { value: 0.205 },
  uSpeed:             { value: 0.65 },
  uWavelength:        { value: 0.386 },
  uPulseWidth:        { value: 0.36 },
  uColorOscuro:       { value: new THREE.Color(0x050505) },
  uColorPulse:        { value: new THREE.Color(0x0c3926) },
  uPulseIntensity:    { value: 2.5 },
}

export const raizFGMaterial = new THREE.ShaderMaterial({
  uniforms: raizFGUniforms,
  side: THREE.DoubleSide,
  vertexShader: `
    attribute float aPulse;
    varying float vDist;
    void main() {
      vDist = aPulse;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying float vDist;
    uniform float uTime;
    uniform float uCrecimientoActual;
    uniform float uLargoPunta;
    uniform float uSpeed;
    uniform float uWavelength;
    uniform float uPulseWidth;
    uniform vec3  uColorOscuro;
    uniform vec3  uColorPulse;
    uniform float uPulseIntensity;

    void main() {
      if (vDist > uCrecimientoActual) discard;
      float u_repeating = fract((vDist / uWavelength) - (uTime * uSpeed));
      float dist_pulse  = abs(u_repeating - 0.5);
      float pulse = 1.0 - smoothstep(0.0, uPulseWidth, dist_pulse);
      float mascara_punta = smoothstep(uCrecimientoActual - uLargoPunta, uCrecimientoActual, vDist);
      pulse *= (1.0 - mascara_punta);
      gl_FragColor = vec4(mix(uColorOscuro, uColorPulse * uPulseIntensity, pulse), 1.0);
    }
  `,
})

const raizFGObj = sheet.object('Raíz Flor Grande', {
  crecimiento:    types.number(1.05,  { range: [0, 1.5],    nudgeMultiplier: 0.01 }),
  largoPunta:     types.number(0.205, { range: [0, 1],      nudgeMultiplier: 0.005 }),
  speed:          types.number(0.65,  { range: [0, 10],     nudgeMultiplier: 0.05 }),
  wavelength:     types.number(0.386, { range: [0.005, 1],  nudgeMultiplier: 0.002 }),
  pulseWidth:     types.number(0.36,  { range: [0, 1],      nudgeMultiplier: 0.01 }),
  pulseIntensity: types.number(2.5,   { range: [0, 50],     nudgeMultiplier: 0.1 }),
  colorOscuro:    types.rgba({ r: 0.0196, g: 0.0196, b: 0.0196, a: 1 }),
  colorPulse:     types.rgba({ r: 0.047, g: 0.224, b: 0.149, a: 1 }),
})

raizFGObj.onValuesChange((v) => {
  raizFGUniforms.uCrecimientoActual.value = v.crecimiento
  raizFGUniforms.uLargoPunta.value        = v.largoPunta
  raizFGUniforms.uSpeed.value             = v.speed
  raizFGUniforms.uWavelength.value        = v.wavelength
  raizFGUniforms.uPulseWidth.value        = v.pulseWidth
  raizFGUniforms.uPulseIntensity.value    = v.pulseIntensity
  raizFGUniforms.uColorOscuro.value.setRGB(v.colorOscuro.r, v.colorOscuro.g, v.colorOscuro.b)
  raizFGUniforms.uColorPulse.value.setRGB(v.colorPulse.r, v.colorPulse.g, v.colorPulse.b)
})

// ── ShaderMaterial de cables_ext (pulso + curl noise + hover) ────────────────

const _RAIZ_SNOISE_GLSL = `
  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.4142135623730950488016887242097;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  vec3 snoiseVec3(vec3 x) {
    return vec3(
      snoise(vec3(x)),
      snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)),
      snoise(vec3(x.z + 74.2, x.x - 124.5, x.y + 99.4))
    );
  }

  vec3 curlNoise(vec3 p) {
    const float e = 0.1;
    vec3 dx = vec3(e, 0.0, 0.0);
    vec3 dy = vec3(0.0, e, 0.0);
    vec3 dz = vec3(0.0, 0.0, e);
    vec3 p_x0 = snoiseVec3(p - dx); vec3 p_x1 = snoiseVec3(p + dx);
    vec3 p_y0 = snoiseVec3(p - dy); vec3 p_y1 = snoiseVec3(p + dy);
    vec3 p_z0 = snoiseVec3(p - dz); vec3 p_z1 = snoiseVec3(p + dz);
    float x = p_y1.z - p_y0.z - p_z1.y + p_z0.y;
    float y = p_z1.x - p_z0.x - p_x1.z + p_x0.z;
    float z = p_x1.y - p_x0.y - p_y1.x + p_y0.x;
    return normalize(vec3(x, y, z) / (2.0 * e));
  }
`

export const raizMaterial = new THREE.ShaderMaterial({
  uniforms: raizUniforms,
  side: THREE.DoubleSide,
  vertexShader: `
    attribute vec2 uv1;
    varying float vDist;

    uniform float uTime;
    uniform vec3  uMouseRayOrigin;
    uniform vec3  uMouseRayDir;
    uniform float uHoverRadius;
    uniform float uSwaySpeed;
    uniform float uSwayFreq;
    uniform float uSwayAmp;
    uniform float uSwayYScale;
    uniform float uAnchorEnd;
    uniform float uThicknessScale;

    ${_RAIZ_SNOISE_GLSL}

    void main() {
      vDist = uv1.x;

      float anchor_mask = uAnchorEnd > 0.001
        ? smoothstep(0.0, uAnchorEnd, uv1.x) : 1.0;

      vec3 noise_pos = position * uSwayFreq;
      noise_pos.y += uTime * uSwaySpeed;
      vec3 flow = curlNoise(noise_pos);

      vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vec3 toVert = worldPos - uMouseRayOrigin;
      float projOnRay = dot(toVert, uMouseRayDir);
      vec3 closestOnRay = uMouseRayOrigin + uMouseRayDir * projOnRay;
      float rayDist = length(worldPos - closestOnRay);
      float mouse_mask = 1.0 - smoothstep(0.0, uHoverRadius, rayDist);
      if (projOnRay < 0.0) mouse_mask = 0.0;

      vec3 displacement = flow * uSwayAmp * anchor_mask * mouse_mask;
      displacement.y *= uSwayYScale;

      vec3 thickened = position + normal * uThicknessScale;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(thickened + displacement, 1.0);
    }
  `,
  fragmentShader: `
    varying float vDist;
    uniform float uTime;
    uniform float uCrecimientoActual;
    uniform float uLargoPunta;
    uniform float uSpeed;
    uniform float uWavelength;
    uniform float uPulseWidth;
    uniform float uPulseSharpness;
    uniform vec3  uColorOscuro;
    uniform vec3  uColorPulse;
    uniform float uPulseIntensity;
    uniform float uBrightness;

    void main() {
      if (vDist > uCrecimientoActual) discard;

      float u_repeating = fract((vDist / uWavelength) - (uTime * uSpeed));
      float dist_pulse  = abs(u_repeating - 0.5);
      float pulse = pow(1.0 - smoothstep(0.0, uPulseWidth, dist_pulse), uPulseSharpness);

      float mascara_punta = smoothstep(
        uCrecimientoActual - uLargoPunta, uCrecimientoActual, vDist);
      pulse *= (1.0 - mascara_punta);

      gl_FragColor = vec4(mix(uColorOscuro, uColorPulse * uPulseIntensity, pulse) * uBrightness, 1.0);
    }
  `,
})

// ── Aura holográfica de cables_ext (shell aditivo con fresnel) ────────────────
// Reutiliza la misma geometría de cables_ext (compartida por referencia → 0 VRAM
// extra). Los uniforms son los mismos objetos de raizUniforms — actualizarlos
// en el panel actualiza ambos materiales automáticamente.

export const raizAuraMaterial = new THREE.ShaderMaterial({
  uniforms: raizUniforms,
  side: THREE.DoubleSide,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    attribute vec2 uv1;
    varying float vPulse;
    varying float vFresnel;
    varying float vDist;

    uniform float uTime;
    uniform float uCrecimientoActual;
    uniform float uLargoPunta;
    uniform float uSpeed;
    uniform float uWavelength;
    uniform float uPulseWidth;
    uniform vec3  uMouseRayOrigin;
    uniform vec3  uMouseRayDir;
    uniform float uHoverRadius;
    uniform float uAuraAmp;
    uniform float uAuraNoiseScale;
    uniform float uAuraNoiseSpeed;
    uniform float uAuraHoverBoost;

    vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + 1.0 * C.xxx;
      vec3 x2 = x0 - i2 + 2.0 * C.xxx;
      vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
      i = mod(i, 289.0);
      vec4 p = permute(permute(permute(
                 i.z + vec4(0.0, i1.z, i2.z, 1.0))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0))
               + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 1.4142135623730950488016887242097;
      vec3  ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    void main() {
      vDist = uv1.x;

      float u_repeating = fract((vDist / uWavelength) - (uTime * uSpeed));
      float dist_pulse = abs(u_repeating - 0.5);
      float pulse = 1.0 - smoothstep(0.0, uPulseWidth, dist_pulse);
      float mascara_punta = smoothstep(uCrecimientoActual - uLargoPunta, uCrecimientoActual, vDist);
      pulse *= (1.0 - mascara_punta);

      vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vec3 toVert = worldPos - uMouseRayOrigin;
      float projOnRay = dot(toVert, uMouseRayDir);
      vec3 closestOnRay = uMouseRayOrigin + uMouseRayDir * projOnRay;
      float rayDist = length(worldPos - closestOnRay);
      float mouse_mask = 1.0 - smoothstep(0.0, uHoverRadius, rayDist);
      if (projOnRay < 0.0) mouse_mask = 0.0;

      vPulse = pulse * (1.0 + mouse_mask * uAuraHoverBoost);

      float n = snoise(position * uAuraNoiseScale + vec3(uTime * uAuraNoiseSpeed));
      float ampMod = 1.0 + n * 0.3;

      vec3 newPosition = position + normal * uAuraAmp * ampMod;

      vec4 mvPos = modelViewMatrix * vec4(newPosition, 1.0);
      vec3 viewNormal = normalize(normalMatrix * normal);
      vec3 viewDir = normalize(-mvPos.xyz);
      vFresnel = 1.0 - max(dot(viewDir, viewNormal), 0.0);

      if (vDist > uCrecimientoActual) { vPulse = 0.0; vFresnel = 0.0; }

      gl_Position = projectionMatrix * mvPos;
    }
  `,
  fragmentShader: `
    varying float vPulse;
    varying float vFresnel;
    varying float vDist;
    uniform vec3  uAuraColor;
    uniform float uAuraGlow;
    uniform float uAuraBase;
    uniform float uAuraPulseBoost;
    uniform float uAuraFresnelPow;
    uniform float uAuraOpacity;

    void main() {
      if (vDist <= 0.0001 && vPulse <= 0.0001 && vFresnel <= 0.0001) discard;

      float fres = pow(clamp(vFresnel, 0.0, 1.0), uAuraFresnelPow);
      float intensidad = uAuraBase + vPulse * uAuraPulseBoost;
      float alpha = intensidad * fres * uAuraOpacity;
      if (alpha < 0.002) discard;

      vec3 c = uAuraColor * uAuraGlow * intensidad;
      gl_FragColor = vec4(c, alpha);
    }
  `,
})

// ── Panel Theatre: Raíz (cables + aura) ──────────────────────────────────────

const raizObj = sheet.object('Raíz', {
  crecimiento:    types.number(0.0,   { range: [0, 200],   nudgeMultiplier: 0.5  }),
  largoPunta:     types.number(2.0,   { range: [0, 20],    nudgeMultiplier: 0.1  }),
  thickness:      types.number(0.0,   { range: [-1, 5],    nudgeMultiplier: 0.01 }),
  brightness:     types.number(1.0,   { range: [0, 5],     nudgeMultiplier: 0.05 }),
  speed:          types.number(1.5,   { range: [0, 10],    nudgeMultiplier: 0.05 }),
  wavelength:     types.number(30.0,  { range: [0.5, 200], nudgeMultiplier: 0.5  }),
  pulseWidth:     types.number(0.15,  { range: [0, 1],     nudgeMultiplier: 0.01 }),
  pulseSharpness: types.number(1.0,   { range: [0.1, 10],  nudgeMultiplier: 0.05 }),
  pulseIntensity: types.number(3.0,   { range: [0, 50],    nudgeMultiplier: 0.1  }),
  colorOscuro:    types.rgba({ r: 0.02, g: 0.02, b: 0.02, a: 1 }),
  colorPulse:     types.rgba({ r: 0.047, g: 0.224, b: 0.149, a: 1 }),  // color inicial (#0c3926)
  colorPulseFin:  types.rgba({ r: 0.039, g: 0.110, b: 0.365, a: 1 }),  // color al apretar Start (#0a1c5d)
  hoverRadius:    types.number(2.5,   { range: [0, 50],    nudgeMultiplier: 0.05 }),
  swaySpeed:      types.number(0.164, { range: [0, 5],     nudgeMultiplier: 0.01 }),
  swayFreq:       types.number(0.55,  { range: [0, 5],     nudgeMultiplier: 0.01 }),
  swayAmp:        types.number(0.228, { range: [0, 5],     nudgeMultiplier: 0.01 }),
  swayYScale:     types.number(0.3,   { range: [0, 1],     nudgeMultiplier: 0.01 }),
  anchorEnd:      types.number(10.0,  { range: [0, 200],   nudgeMultiplier: 0.5  }),
  auraAmp:        types.number(1.5,   { range: [0, 10],    nudgeMultiplier: 0.05 }),
  auraNoiseScale: types.number(2.0,   { range: [0, 20],    nudgeMultiplier: 0.05 }),
  auraNoiseSpeed: types.number(0.5,   { range: [0, 5],     nudgeMultiplier: 0.01 }),
  auraHoverBoost: types.number(2.0,   { range: [0, 20],    nudgeMultiplier: 0.05 }),
  auraGlow:       types.number(0.8,   { range: [0, 10],    nudgeMultiplier: 0.05 }),
  auraBase:       types.number(0.25,  { range: [0, 1],     nudgeMultiplier: 0.01 }),
  auraPulseBoost: types.number(1.2,   { range: [0, 5],     nudgeMultiplier: 0.05 }),
  auraFresnelPow: types.number(2.5,   { range: [0.1, 10],  nudgeMultiplier: 0.05 }),
  auraColor:      types.rgba({ r: 0.047, g: 0.224, b: 0.149, a: 1 }),  // por defecto igual que colorPulse
  auraOpacity:    types.number(1.0,   { range: [0, 1],     nudgeMultiplier: 0.01 }),
})

let _rootsStarted    = false
let _colorPulseInit  = new THREE.Color(0x0c3926)
let _colorPulseFin   = new THREE.Color(0x0a1c5d)
let _colorTween      = null

raizObj.onValuesChange((v) => {
  if (_rootsStarted) raizUniforms.uCrecimientoActual.value = v.crecimiento
  raizUniforms.uLargoPunta.value        = v.largoPunta
  raizUniforms.uThicknessScale.value    = v.thickness
  raizUniforms.uBrightness.value        = v.brightness
  raizUniforms.uSpeed.value             = v.speed
  raizUniforms.uWavelength.value        = v.wavelength
  raizUniforms.uPulseWidth.value        = v.pulseWidth
  raizUniforms.uPulseSharpness.value    = v.pulseSharpness
  raizUniforms.uPulseIntensity.value    = v.pulseIntensity
  raizUniforms.uColorOscuro.value.setRGB(v.colorOscuro.r, v.colorOscuro.g, v.colorOscuro.b)
  raizUniforms.uColorPulse.value.setRGB(v.colorPulse.r, v.colorPulse.g, v.colorPulse.b)
  _colorPulseInit.setRGB(v.colorPulse.r, v.colorPulse.g, v.colorPulse.b)
  _colorPulseFin.setRGB(v.colorPulseFin.r, v.colorPulseFin.g, v.colorPulseFin.b)
  raizUniforms.uHoverRadius.value       = v.hoverRadius
  raizUniforms.uSwaySpeed.value         = v.swaySpeed
  raizUniforms.uSwayFreq.value          = v.swayFreq
  raizUniforms.uSwayAmp.value           = v.swayAmp
  raizUniforms.uSwayYScale.value        = v.swayYScale
  raizUniforms.uAnchorEnd.value         = v.anchorEnd
  raizUniforms.uAuraAmp.value           = v.auraAmp
  raizUniforms.uAuraNoiseScale.value    = v.auraNoiseScale
  raizUniforms.uAuraNoiseSpeed.value    = v.auraNoiseSpeed
  raizUniforms.uAuraHoverBoost.value    = v.auraHoverBoost
  raizUniforms.uAuraGlow.value          = v.auraGlow
  raizUniforms.uAuraBase.value          = v.auraBase
  raizUniforms.uAuraPulseBoost.value    = v.auraPulseBoost
  raizUniforms.uAuraFresnelPow.value    = v.auraFresnelPow
  raizUniforms.uAuraColor.value.setRGB(v.auraColor.r, v.auraColor.g, v.auraColor.b)
  raizUniforms.uAuraOpacity.value       = v.auraOpacity
})

// ── Material físico base ──────────────────────────────────────────────────────

const _tmpColor = new THREE.Color()

// Una textura por proyecto — usa CONFIG.projects[i].image
// ── Textura de semillas: imagen + texto en 16:9, fuente Chakra Petch ──────────
// mapTex  = imagen del proyecto + vignette + texto (siempre visible en difusa)
// emisTex = texto en blanco sobre negro → emissiveMap para bloom
// El canvas se dibuja desde applyMaterials una vez detectada la orientación UV.

const _TEX_W = 1024
const _TEX_H  = 576   // 16:9

function _drawSemillaText(ctx, p, w, h) {
  const title       = p.title   ?? ''
  const company     = p.company ?? ''
  const showCompany = company && company !== title

  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  if (showCompany) {
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.font      = `400 ${Math.round(h * 0.155)}px "Chakra Petch", sans-serif`
    ctx.fillText(title,   w / 2, h * 0.43)
    ctx.fillStyle = 'rgba(255,255,255,0.58)'
    ctx.font      = `300 ${Math.round(h * 0.082)}px "Chakra Petch", sans-serif`
    ctx.fillText(company, w / 2, h * 0.59)
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.font      = `400 ${Math.round(h * 0.155)}px "Chakra Petch", sans-serif`
    ctx.fillText(title, w / 2, h / 2)
  }
}

// Create canvas + texture pairs upfront (drawing happens later in applyMaterials
// once we know the UV flip orientation for each semilla mesh).
const _semillaCanvases = CONFIG.projects.map(() => {
  const mapCanvas = document.createElement('canvas')
  mapCanvas.width = _TEX_W; mapCanvas.height = _TEX_H
  const emCanvas  = document.createElement('canvas')
  emCanvas.width  = _TEX_W; emCanvas.height  = _TEX_H

  const mapTex = new THREE.CanvasTexture(mapCanvas)
  mapTex.colorSpace = THREE.SRGBColorSpace
  mapTex.wrapS = THREE.RepeatWrapping; mapTex.wrapT = THREE.RepeatWrapping

  const emisTex = new THREE.CanvasTexture(emCanvas)
  emisTex.colorSpace = THREE.SRGBColorSpace
  emisTex.wrapS = THREE.RepeatWrapping; emisTex.wrapT = THREE.RepeatWrapping

  return { mapCanvas, emCanvas, mapTex, emisTex }
})

const _texPerSemilla  = _semillaCanvases.map(c => c.mapTex)
const _emisPerSemilla = _semillaCanvases.map(c => c.emisTex)

// VideoTexture per semilla — replaces the static canvas image map.
// En mobile carga la versión liviana "<video>-mobile.mp4"; si no existe (404),
// cae automáticamente al video web "<video>.mp4" para no quedar sin imagen.
const _VID_IS_MOBILE = window.matchMedia('(max-width: 768px)').matches
const _videoTexPerSemilla = CONFIG.projects.map((p) => {
  if (!p.video) return null
  const vid = document.createElement('video')
  vid.muted       = true
  vid.loop        = true
  vid.autoplay    = true
  vid.playsInline = true
  vid.setAttribute('playsinline', '')
  vid.setAttribute('webkit-playsinline', '')
  vid.setAttribute('muted', '')
  vid.setAttribute('autoplay', '')
  // iOS decodifica el <video> como textura solo si está en el DOM → oculto 1px.
  vid.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1'
  if (_VID_IS_MOBILE) {
    vid.src = p.video + '-mobile.mp4'
    vid.addEventListener('error', () => {
      if (vid.dataset.fellback) return
      vid.dataset.fellback = '1'
      vid.src = p.video + '.mp4'   // fallback a la versión web
      vid.play().catch(() => {})
    })
  } else {
    vid.src = p.video + '.mp4'
  }
  vid.play().catch(() => {})
  document.body.appendChild(vid)
  const tex      = new THREE.VideoTexture(vid)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter  = THREE.LinearFilter
  tex.magFilter  = THREE.LinearFilter
  tex.wrapS      = THREE.RepeatWrapping
  tex.wrapT      = THREE.RepeatWrapping
  return tex
})

// ── Título de cada card (texto centrado, MAYÚSCULA, blanco, Chakra Petch) ─────
// Se dibuja en un canvas transparente y se compone sobre el video dentro del
// shader de la semilla (ver _inyectarCorners) → queda pegado y centrado en la
// tarjeta 3D. El canvas se redibuja con el aspecto real de la card.
const _seedTitleTextures = CONFIG.projects.map(() => {
  const c = document.createElement('canvas')
  c.width = 1024; c.height = 576
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter  = THREE.LinearFilter
  tex.magFilter  = THREE.LinearFilter
  tex._canvas = c
  return tex
})

function _drawSeedTitle(idx, title, aspect) {
  const tex = _seedTitleTextures[idx]
  if (!tex) return
  const text = String(title ?? '').toUpperCase()
  const asp  = aspect && aspect > 1e-3 ? aspect : (16 / 9)
  const W = 1024, H = Math.max(2, Math.round(W / asp))
  const c = tex._canvas
  c.width = W; c.height = H

  document.fonts.load(`500 96px "Chakra Petch"`).then(() => {
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, W, H)
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle    = '#ffffff'

    const maxW = W * 0.62
    // Ajusta el cuerpo de la fuente para que el título entre en una sola línea.
    let size = Math.round(H * 0.115)
    const fit = (s) => { ctx.font = `500 ${s}px "Chakra Petch", sans-serif`; return ctx.measureText(text).width }
    while (size > 8 && fit(size) > maxW) size -= 2

    // Si aún muy ancho (títulos largos), parte en 2 líneas por el espacio central.
    if (fit(size) > maxW && text.includes(' ')) {
      const words = text.split(' ')
      const mid = Math.ceil(words.length / 2)
      const l1 = words.slice(0, mid).join(' ')
      const l2 = words.slice(mid).join(' ')
      size = Math.round(H * 0.115)
      const fit2 = (s) => {
        ctx.font = `500 ${s}px "Chakra Petch", sans-serif`
        return Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width)
      }
      while (size > 10 && fit2(size) > maxW) size -= 2
      ctx.font = `500 ${size}px "Chakra Petch", sans-serif`
      const lh = size * 1.15
      ctx.fillText(l1, W / 2, H / 2 - lh / 2)
      ctx.fillText(l2, W / 2, H / 2 + lh / 2)
    } else {
      ctx.font = `500 ${size}px "Chakra Petch", sans-serif`
      ctx.fillText(text, W / 2, H / 2)
    }
    tex.needsUpdate = true
  })
}

// iOS/mobile: el autoplay de los videos sin gesto está bloqueado → en el primer
// gesto del usuario reintentamos reproducir todos los videos de las semillas.
function _unlockSeedVideos() {
  for (const tex of _videoTexPerSemilla) {
    if (tex && tex.image && tex.image.play) tex.image.play().catch(() => {})
  }
  ;['pointerdown', 'touchstart', 'click', 'keydown']
    .forEach(ev => window.removeEventListener(ev, _unlockSeedVideos))
}
;['pointerdown', 'touchstart', 'click', 'keydown']
  .forEach(ev => window.addEventListener(ev, _unlockSeedVideos, { passive: true }))

// Called from applyMaterials. Orientation/range is handled via texture.repeat/offset —
// the canvas is always drawn normally (no flip transforms needed here).
function _drawSemillaCanvas(idx, p) {
  const { mapCanvas, emCanvas, mapTex, emisTex } = _semillaCanvases[idx]
  const W = _TEX_W, H = _TEX_H

  document.fonts.load(`400 64px "Chakra Petch"`).then(() => {
    // ── Emissive: white text on black ──────────────────────────────
    const emCtx = emCanvas.getContext('2d')
    emCtx.fillStyle = '#000'
    emCtx.fillRect(0, 0, W, H)
    _drawSemillaText(emCtx, p, W, H)
    emisTex.needsUpdate = true

    // ── Map: dark placeholder + text immediately, image when ready ──
    const mapCtx = mapCanvas.getContext('2d')
    mapCtx.fillStyle = '#0d0d0d'
    mapCtx.fillRect(0, 0, W, H)
    _drawSemillaText(mapCtx, p, W, H)
    mapTex.needsUpdate = true

    if (p.image) {
      const img = new Image()
      img.onload = () => {
        mapCtx.clearRect(0, 0, W, H)
        mapCtx.drawImage(img, 0, 0, W, H)
        const grad = mapCtx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.38)
        grad.addColorStop(0, 'rgba(0,0,0,0.58)')
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        mapCtx.fillStyle = grad
        mapCtx.fillRect(0, 0, W, H)
        _drawSemillaText(mapCtx, p, W, H)
        mapTex.needsUpdate = true
      }
      img.onerror = () => { mapTex.needsUpdate = true }
      img.src = p.image
    }
  })
}

const MAP_NAMES = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap',
  'aoMap', 'alphaMap', 'bumpMap', 'displacementMap',
  'specularColorMap', 'sheenColorMap', 'clearcoatMap',
]

function _transferirMaps(orig, dst) {
  for (const k of MAP_NAMES) {
    if (orig[k]) dst[k] = orig[k]
  }
  if (orig.color)    dst.userData.origColor    = orig.color.clone()
  if (orig.emissive) dst.userData.origEmissive = orig.emissive.clone()
}

function _aplicarValoresPetalos(mat, v) {
  if (mat.userData.origColor) {
    mat.color.copy(mat.userData.origColor)
      .multiply(_tmpColor.setRGB(v.color.r, v.color.g, v.color.b))
  } else {
    mat.color.setRGB(v.color.r, v.color.g, v.color.b)
  }
  mat.iridescence               = v.iridescence
  mat.iridescenceIOR            = v.iridescenceIOR
  mat.iridescenceThicknessRange = [v.iridescenceThickMin, v.iridescenceThickMax]
  // Defensivo: paneles opacos no incluyen transmission/thickness
  if ('transmission' in v) mat.transmission = v.transmission
  if ('thickness' in v)    mat.thickness    = v.thickness
  if ('opacity' in v)      mat.opacity      = v.opacity
  mat.roughness                 = v.roughness
  mat.metalness                 = v.metalness
  mat.ior                       = v.ior
  if (mat.userData.origEmissive) {
    mat.emissive.copy(mat.userData.origEmissive)
      .multiply(_tmpColor.setRGB(v.emissive.r, v.emissive.g, v.emissive.b))
  } else {
    mat.emissive.setRGB(v.emissive.r, v.emissive.g, v.emissive.b)
  }
  mat.emissiveIntensity = v.emissiveIntensity
  mat.envMapIntensity   = v.envMapIntensity
}

function _crearMaterialPetalos(nombrePanel, { conBloom = false, opaco = false, modoOpacidad = false, bloomDefault = false, transmissionDefault = 1.0 } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    iridescence: 1.0,
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [100, 400],
    transparent: !opaco || modoOpacidad,
    transmission: (opaco || modoOpacidad) ? 0.0 : transmissionDefault,
    opacity: 1.0,
    roughness: 0.1,
    metalness: 0.0,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.3,
    // modoOpacidad escribe profundidad → las plantas no desaparecen en la cola de transparencias
    depthWrite: opaco || modoOpacidad,
    side: (opaco || modoOpacidad) ? THREE.FrontSide : THREE.DoubleSide,
  })

  const seguidores  = []
  const nodosBloom  = []
  let ultimosValores = null

  const props = {
    color:               types.rgba({ r: 1, g: 1, b: 1, a: 1 }),
    iridescence:         types.number(1.0,  { range: [0, 1],     nudgeMultiplier: 0.01 }),
    iridescenceIOR:      types.number(1.5,  { range: [1, 2.5],   nudgeMultiplier: 0.01 }),
    iridescenceThickMin: types.number(100,  { range: [0, 1000],  nudgeMultiplier: 5    }),
    iridescenceThickMax: types.number(400,  { range: [0, 1000],  nudgeMultiplier: 5    }),
    roughness:           types.number(0.1,  { range: [0, 1],     nudgeMultiplier: 0.01 }),
    metalness:           types.number(0.0,  { range: [0, 1],     nudgeMultiplier: 0.01 }),
    ior:                 types.number(1.5,  { range: [1, 2.5],   nudgeMultiplier: 0.01 }),
    emissive:            types.rgba({ r: 1, g: 1, b: 1, a: 1 }),
    emissiveIntensity:   types.number(0.3,  { range: [0, 5],     nudgeMultiplier: 0.05 }),
    envMapIntensity:     types.number(1.0,  { range: [0, 5],     nudgeMultiplier: 0.05 }),
  }
  // Paneles vidrio (no-opaco, sin modoOpacidad) incluyen sliders de transmission/thickness
  if (!opaco && !modoOpacidad) {
    props.transmission = types.number(transmissionDefault, { range: [0, 1], nudgeMultiplier: 0.01 })
    props.thickness    = types.number(0.5, { range: [0, 5], nudgeMultiplier: 0.05 })
  }
  // modoOpacidad: control de opacidad en vez de transmisión
  if (modoOpacidad) {
    props.opacity = types.number(1.0, { range: [0, 1], nudgeMultiplier: 0.01 })
  }
  if (conBloom) props.bloom = types.boolean(bloomDefault)

  const obj = sheet.object(nombrePanel, props)
  obj.onValuesChange((v) => {
    ultimosValores = v
    _aplicarValoresPetalos(mat, v)
    for (const s of seguidores) _aplicarValoresPetalos(s, v)
    if (conBloom) {
      for (const n of nodosBloom) {
        if (v.bloom) n.layers.enable(BLOOM_LAYER)
        else         n.layers.disable(BLOOM_LAYER)
      }
    }
  })

  function agregarSeguidor(s, nodo) {
    seguidores.push(s)
    if (conBloom && nodo) nodosBloom.push(nodo)
    if (ultimosValores) {
      _aplicarValoresPetalos(s, ultimosValores)
      if (conBloom && nodo) {
        if (ultimosValores.bloom) nodo.layers.enable(BLOOM_LAYER)
        else                      nodo.layers.disable(BLOOM_LAYER)
      }
    }
  }

  // Set emissive on the base material AND every follower mesh material
  function setEmissiveAll(color) {
    mat.emissive.copy(color)
    for (const s of seguidores) s.emissive.copy(color)
  }

  // Get the current emissive from the first follower (actual scene mesh), or from mat
  function getEmissive() {
    const src = seguidores.length > 0 ? seguidores[0] : mat
    return src.emissive.clone()
  }

  return { mat, agregarSeguidor, setEmissiveAll, getEmissive }
}

const { mat: chipMaterial,         agregarSeguidor: chipFollow,         setEmissiveAll: chipSetEmissive,         getEmissive: chipGetEmissive         } = _crearMaterialPetalos('Chip', { conBloom: true, bloomDefault: true })
const { mat: florGrandeMaterial,   agregarSeguidor: florGrandeFollow                                                                                     } = _crearMaterialPetalos('Flor Grande')
const { mat: terrainMaterial,      agregarSeguidor: terrainFollow                                                                                          } = _crearMaterialPetalos('Terrain', { conBloom: false, opaco: false, transmissionDefault: 0.88 })
const { mat: semillasMaterial,     agregarSeguidor: semillasFollow                                                                                        } = _crearMaterialPetalos('Semillas', { conBloom: false, opaco: true })
const { mat: florCentralMaterial,  agregarSeguidor: florCentralFollow,  setEmissiveAll: florCentralSetEmissive,  getEmissive: florCentralGetEmissive  } = _crearMaterialPetalos('Flor Central', { conBloom: true, opaco: true, bloomDefault: true })
const { mat: plantasMaterial,      agregarSeguidor: plantasFollow,      setEmissiveAll: plantasSetEmissive,      getEmissive: plantasGetEmissive      } = _crearMaterialPetalos('Plantas', { conBloom: true, modoOpacidad: true, bloomDefault: true })

// ── Movimiento de plantas (onBeforeCompile injection) ────────────────────────

const MESHES_CON_MOVIMIENTO = new Set([
  'flor_central', 'germinadores', 'orejitas_shreck',
  'flores', 'arbustito', 'hoja_elefante',
])

const MESHES_PLANTAS = new Set([
  'germinadores', 'orejitas_shreck', 'flores',
  'arbustito', 'hoja_elefante', 'musguito',
])

function _inyectarMovimientoPlanta(mat) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, movimientoUniforms)

    let prefix = ''
    if (!shader.vertexShader.includes('attribute vec2 uv1')) prefix += 'attribute vec2 uv1;\n'
    if (!shader.vertexShader.includes('attribute vec2 uv2')) prefix += 'attribute vec2 uv2;\n'

    shader.vertexShader = prefix + `
      uniform float u_time;
      uniform float u_maxDisp;
      uniform float u_breathSpeed;
      uniform float u_breathFreq;
      uniform float u_wobbleSpeed;
      uniform float u_wobbleFreq;
      uniform float u_wobbleBlend;
      uniform float u_swaySpeed;
      uniform float u_swayFreq;
      uniform float u_swayAmp;
      uniform float u_anchorHeight;
      ${_SNOISE_GLSL}
    ` + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
        #include <begin_vertex>
        float offset_time = u_time + (uv2.x * 10.0);
        float position_anchor = u_anchorHeight > 0.001
          ? smoothstep(0.0, u_anchorHeight, position.y) : 1.0;

        float wave = sin(position.x * u_breathFreq + offset_time * u_breathSpeed)
                   * cos(position.z * u_breathFreq + offset_time * u_breathSpeed);
        vec3 noise_pos_inflate = position * u_wobbleFreq;
        noise_pos_inflate.y -= offset_time * u_wobbleSpeed;
        float noise_val = _snoise(noise_pos_inflate);
        float final_anim = mix(wave, noise_val, u_wobbleBlend);
        vec3 inflate_displacement = normal * final_anim * u_maxDisp * uv1.x * position_anchor;

        vec3 noise_pos_sway = position * u_swayFreq;
        noise_pos_sway.y += offset_time * u_swaySpeed;
        float nx = _snoise(noise_pos_sway);
        float nz = _snoise(noise_pos_sway + vec3(123.45, 0.0, 0.0));
        vec3 wind_flow = vec3(nx, 0.2 * nx, nz);
        vec3 sway_displacement = wind_flow * u_swayAmp * uv1.y * position_anchor;

        transformed += inflate_displacement + sway_displacement;
      `,
    )
  }
  mat.customProgramCacheKey = () => 'movimiento-planta'
}

// ── Panel Theatre: Movimiento ────────────────────────────────────────────────

const movimientoObj = sheet.object('Movimiento', {
  max_disp:      types.number(0.05, { range: [0, 0.5], nudgeMultiplier: 0.001 }),
  breath_speed:  types.number(2.0,  { range: [0, 10],  nudgeMultiplier: 0.05  }),
  breath_freq:   types.number(5.0,  { range: [0, 30],  nudgeMultiplier: 0.1   }),
  wobble_speed:  types.number(1.5,  { range: [0, 10],  nudgeMultiplier: 0.05  }),
  wobble_freq:   types.number(15.0, { range: [0, 50],  nudgeMultiplier: 0.2   }),
  wobble_blend:  types.number(0.4,  { range: [0, 1],   nudgeMultiplier: 0.01  }),
  sway_speed:    types.number(1.0,  { range: [0, 10],  nudgeMultiplier: 0.05  }),
  sway_freq:     types.number(2.5,  { range: [0, 10],  nudgeMultiplier: 0.05  }),
  sway_amp:      types.number(0.1,  { range: [0, 1],   nudgeMultiplier: 0.005 }),
  anchor_height: types.number(0.3,  { range: [0, 5],   nudgeMultiplier: 0.01  }),
})

movimientoObj.onValuesChange((v) => {
  movimientoUniforms.u_maxDisp.value      = v.max_disp
  movimientoUniforms.u_breathSpeed.value  = v.breath_speed
  movimientoUniforms.u_breathFreq.value   = v.breath_freq
  movimientoUniforms.u_wobbleSpeed.value  = v.wobble_speed
  movimientoUniforms.u_wobbleFreq.value   = v.wobble_freq
  movimientoUniforms.u_wobbleBlend.value  = v.wobble_blend
  movimientoUniforms.u_swaySpeed.value    = v.sway_speed
  movimientoUniforms.u_swayFreq.value     = v.sway_freq
  movimientoUniforms.u_swayAmp.value      = v.sway_amp
  movimientoUniforms.u_anchorHeight.value = v.anchor_height
})


// ── Rectificar la tarjeta a un quad plano ────────────────────────────────────
// Las semillas del GLB son tarjetas 3D facetadas (cara + bisel + grosor) cuyo
// contorno proyectado da un "hexágono". Reconstruimos la malla como un quad de
// 4 vértices tomando las posiciones de las 4 esquinas de UV → rectángulo real.
function _rectificarSemilla(node, proj) {
  const g0   = node.geometry
  const uvA  = g0.attributes.uv
  const posA = g0.attributes.position
  if (!uvA || !posA) return

  // bbox de UV
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity
  for (let i = 0; i < uvA.count; i++) {
    const u = uvA.getX(i), v = uvA.getY(i)
    if (u < uMin) uMin = u; if (u > uMax) uMax = u
    if (v < vMin) vMin = v; if (v > vMax) vMax = v
  }
  // vértice más cercano a cada esquina de UV
  const nearest = (tu, tv) => {
    let bi = 0, bd = Infinity
    for (let i = 0; i < uvA.count; i++) {
      const du = uvA.getX(i) - tu, dv = uvA.getY(i) - tv
      const d = du * du + dv * dv
      if (d < bd) { bd = d; bi = i }
    }
    return bi
  }
  const i00 = nearest(uMin, vMin), i10 = nearest(uMax, vMin)
  const i11 = nearest(uMax, vMax), i01 = nearest(uMin, vMax)
  const P = (i) => [posA.getX(i), posA.getY(i), posA.getZ(i)]
  const p00 = P(i00), p10 = P(i10), p11 = P(i11), p01 = P(i01)

  // Orientación: detecta si X/Y decrecen al crecer U/V (mismo criterio que antes)
  let flipX = posA.getX(i10) < posA.getX(i00)
  let flipY = posA.getY(i01) < posA.getY(i00)
  if (proj.flipTexX) flipX = !flipX
  if (proj.flipTexY) flipY = !flipY
  let uv = [[0, 0], [1, 0], [1, 1], [0, 1]]
  if (flipX) uv = uv.map(([u, v]) => [1 - u, v])
  if (flipY) uv = uv.map(([u, v]) => [u, 1 - v])

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([...p00, ...p10, ...p11, ...p01]), 3))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv.flat()), 2))
  // aSemillaUVNorm siempre 0..1 (el SDF de esquinas es simétrico, no necesita flip)
  g.setAttribute('aSemillaUVNorm', new THREE.BufferAttribute(
    new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2))
  g.setIndex([0, 1, 2, 0, 2, 3])
  g.computeBoundingBox()
  g.computeBoundingSphere()
  node.geometry = g

  // Aspecto real (ancho/alto) para el SDF de esquinas — fijo, no por derivadas
  const w = Math.hypot(p10[0] - p00[0], p10[1] - p00[1], p10[2] - p00[2])
  const h = Math.hypot(p01[0] - p00[0], p01[1] - p00[1], p01[2] - p00[2])
  // flipX/flipY: el texto debe seguir la MISMA orientación que el video para no
  // verse espejado (vSemillaUVNorm es simétrico; el video usa el uv volteado).
  return { aspect: h > 1e-6 ? w / h : 1, flipX, flipY }
}

// ── Corner SDF injector — solo redondea esquinas + bloom por contenido ───────
// La geometría ya viene rectificada a un quad (ver esSemilla), así que NO hay
// bisel: el shader solo recorta el rectángulo redondeado y, en la pasada de
// bloom, realza el brillo del video.
function _inyectarCorners(mat, key, aspect, textTex, textFlipX, textFlipY) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, _cornerUniforms)
    shader.uniforms.uAspect    = { value: aspect || 1 }
    shader.uniforms.uTextMap   = { value: textTex || null }
    shader.uniforms.uHasText   = { value: textTex ? 1 : 0 }
    shader.uniforms.uTextFlipX = { value: textFlipX ? 1 : 0 }
    shader.uniforms.uTextFlipY = { value: textFlipY ? 1 : 0 }

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       attribute vec2 aSemillaUVNorm;
       varying   vec2 vSemillaUVNorm;`,
    ).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vSemillaUVNorm = aSemillaUVNorm;`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uCornerRadius;
       uniform float uAspect;         // ancho/alto fijo (no derivadas → borde recto)
       uniform float uInBloom;        // 1 durante la pasada de bloom
       uniform float uBloomEmission;  // intensidad del bloom de las semillas
       uniform float uBloomThreshold; // piso propio de las semillas (resta a la emisión)
       uniform sampler2D uTextMap;    // título de la card (blanco sobre transparente)
       uniform float uHasText;
       uniform float uTextFlipX;      // voltea el texto para que no quede espejado
       uniform float uTextFlipY;
       varying vec2  vSemillaUVNorm;`,
    ).replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       {
         vec2  _uv  = vSemillaUVNorm;
         float _r   = uCornerRadius;
         float _asp = uAspect;
         vec2  _p   = (_uv - 0.5) * vec2(_asp, 1.0);
         vec2  _q   = abs(_p) - vec2(_asp * 0.5 - _r, 0.5 - _r);
         float _d   = length(max(_q, 0.0)) + min(max(_q.x, _q.y), 0.0) - _r;
         if (_d > 0.0) discard;   // esquinas redondeadas

         // Bloom UNIFORME: toda la cara emite parejo (tinte de la tarjeta ×
         // intensidad), con un threshold propio (piso) para control fino e
         // independiente del threshold global del panel "Bloom".
         if (uInBloom > 0.5) {
           vec3 _emit = max(diffuse * uBloomEmission - uBloomThreshold, 0.0);
           gl_FragColor = vec4(_emit, 1.0);
         } else if (uHasText > 0.5) {
           // Título centrado en blanco compuesto sobre el video (solo pasada normal).
           vec2 _tuv = _uv;
           if (uTextFlipX > 0.5) _tuv.x = 1.0 - _tuv.x;
           if (uTextFlipY > 0.5) _tuv.y = 1.0 - _tuv.y;
           vec4 _txt = texture2D(uTextMap, _tuv);
           gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), _txt.a);
         }
       }`,
    )
  }
  mat.customProgramCacheKey = () => 'semillas-flat-v12-' + key
}

// ── Esquinas redondeadas — GLSL SDF ──────────────────────────────────────────

const _semillaMats    = []
const _semillaMeshes  = []   // parallel to _semillaMats — for bloom layer toggle
const _cornerUniforms = {
  uCornerRadius:   { value: 0.06 },
  uInBloom:        { value: 0 },
  uBloomEmission:  { value: 1.5 },
  uBloomThreshold: { value: 0 },   // piso propio de las semillas (independiente del global)
}

// Llamado desde bloom.js para marcar la pasada de bloom de las semillas.
// En la pasada de bloom desactivamos depthTest: así nada que esté delante
// (lámpara/vidrio central, renderizado en negro) recorta el bloom de la tarjeta.
export function setSemillasBloomPass(on) {
  _cornerUniforms.uInBloom.value = on ? 1 : 0
  for (const mat of _semillaMats) mat.depthTest = !on
}

// ── Terrain — direct Theatre.js control (bypasses follow system) ──────────────
let _terrainMesh = null
const _terrainCtrl = sheet.object('Terrain Visibilidad', {
  visible: types.boolean(true),
}, { reconfigure: true })

_terrainCtrl.onValuesChange((v) => {
  if (_terrainMesh) _terrainMesh.visible = v.visible
})

const _esquinasObj = sheet.object('Semillas Esquinas', {
  cornerRadius: types.number(0.06, { range: [0, 0.49], nudgeMultiplier: 0.005 }),
})
_esquinasObj.onValuesChange((v) => { _cornerUniforms.uCornerRadius.value = v.cornerRadius })

// ── Panel Theatre: Glass Semillas ─────────────────────────────────────────────
// Material plano (MeshBasicMaterial, sin luz): se ve el video tal cual.
// Solo exponemos opacidad, color (tinte sobre el video) y bloom on/off.

// Color base del panel y multiplicador de hover por semilla — se componen:
// color final = base * hoverMul (hoverMul > 1 empuja al bloom).
const _seedBaseColor = { r: 1, g: 1, b: 1 }
const _seedHoverMul  = [1, 1, 1, 1]
// Opacidad base del panel y factor de visibilidad del fade — se componen:
// opacidad final = base * visFactor.
let _seedBaseOpacity = 1
let _seedVisFactor   = 1
let _seedBloom       = false
let _seedHoverBoost  = 1.8   // multiplicador de color al pasar el mouse (→ más bloom)
// En mobile no hay hover: las semillas arrancan con el hoverBoost aplicado por
// defecto, así florecen igual que en desktop al pasar el mouse.
const _seedIsMobile  = window.matchMedia('(max-width: 768px)').matches
// Bloom apenas más bajo en mobile: en vez de tocar la emisión (binario por el
// umbral global), subimos un poco el threshold propio de las semillas SOLO en
// mobile → recorta el bloom de forma gradual. 0 = igual que desktop.
// Se controla desde el panel "Glass Semillas" (bloomThresholdMobile).
let _seedMobileThresholdAdd = 0.007

function _applySeedColors() {
  for (let i = 0; i < _semillaMats.length; i++) {
    const idx = _semillaMeshes[i]?.userData.semillaIndex ?? 0
    const mul = _seedIsMobile ? _seedHoverBoost : (_seedHoverMul[idx] ?? 1)
    _semillaMats[i].color.setRGB(
      _seedBaseColor.r * mul,
      _seedBaseColor.g * mul,
      _seedBaseColor.b * mul,
    )
  }
}

function _applySeedOpacity() {
  const o = _seedBaseOpacity * _seedVisFactor
  for (const mat of _semillaMats) mat.opacity = o
}

const _glassObj = sheet.object('Glass Semillas', {
  opacity:        types.number(1.0, { range: [0, 1],   nudgeMultiplier: 0.01 }),
  color:          types.rgba({ r: 1, g: 1, b: 1, a: 1 }),
  bloom:          types.boolean(false),
  bloomEmission:       types.number(1.5,  { range: [0, 8], nudgeMultiplier: 0.1 }),
  bloomThreshold:      types.number(0.0,  { range: [0, 2], nudgeMultiplier: 0.02 }),
  bloomThresholdMobile: types.number(0.007, { range: [0, 2], nudgeMultiplier: 0.005 }),  // piso extra SOLO en mobile
  hoverBoost:          types.number(1.8,  { range: [1, 5], nudgeMultiplier: 0.05 }),
}, { reconfigure: true })

_glassObj.onValuesChange((v) => {
  _seedBaseColor.r = v.color.r
  _seedBaseColor.g = v.color.g
  _seedBaseColor.b = v.color.b
  _seedBaseOpacity = v.opacity
  _seedBloom       = v.bloom
  _seedMobileThresholdAdd = v.bloomThresholdMobile
  _cornerUniforms.uBloomEmission.value  = v.bloomEmission
  _cornerUniforms.uBloomThreshold.value = v.bloomThreshold + (_seedIsMobile ? _seedMobileThresholdAdd : 0)
  _seedHoverBoost = v.hoverBoost
  _applySeedColors()
  _applySeedOpacity()
  for (const mesh of _semillaMeshes) {
    if (v.bloom) mesh.layers.enable(BLOOM_LAYER)
    else         mesh.layers.disable(BLOOM_LAYER)
  }
})

// ── Semilla exports — click/hover detection ───────────────────────────────────

export const meshesSemillasArr   = []
export const semillaPickerMeshes = []

export function initSemillaPickers(scene) {
  const geo = new THREE.SphereGeometry(0.28, 6, 4)
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })

  const byIdx = new Map()
  for (const mesh of meshesSemillasArr) {
    const idx = mesh.userData.semillaIndex
    if (idx === undefined) continue
    const bb  = new THREE.Box3().setFromObject(mesh)
    const c   = bb.getCenter(new THREE.Vector3())
    if (!byIdx.has(idx)) byIdx.set(idx, { x: 0, y: 0, z: 0, n: 0 })
    const v = byIdx.get(idx)
    v.x += c.x; v.y += c.y; v.z += c.z; v.n++
  }

  for (const [idx, { x, y, z, n }] of byIdx) {
    const picker = new THREE.Mesh(geo, mat)
    picker.position.set(x / n, y / n, z / n)
    picker.userData.semillaIndex = idx
    scene.add(picker)
    semillaPickerMeshes.push(picker)
  }
}

// No-ops — kept so main.js imports don't break
export const rippleUniforms = {}
export function initRipple()  {}
export function tickRipple()  {}


// ── applyMaterials — traversal del GLB scene ──────────────────────────────────

export function applyMaterials(gltfScene) {
  const meshesSemillas = new Set()
  gltfScene.traverse((n) => {
    if (/^semilla[1-4]$/.test(n.name)) {
      const idx = parseInt(n.name.replace('semilla', '')) - 1
      n.traverse((m) => {
        if (m.isMesh) {
          meshesSemillas.add(m)
          m.userData.semillaIndex = idx
        }
      })
    }
  })


  gltfScene.traverse((node) => {
    if (!node.isMesh) return
    if (node.userData.skipTraverse) return

    if (node.name === 'cables_ext') {
      node.material    = raizMaterial
      node.renderOrder = 1
      node.layers.enable(BLOOM_LAYER)

      // Shell aditivo holográfico — misma geometría compartida, sin overhead de VRAM
      const aura = new THREE.Mesh(node.geometry, raizAuraMaterial)
      aura.userData.skipTraverse = true
      aura.layers.enable(BLOOM_LAYER)
      aura.renderOrder = 2
      node.add(aura)
      return
    }

    if (node.name === 'FLOR_GRANDE_RAICES') {
      const g   = node.geometry
      const pos = g.attributes.position
      const anchor = new THREE.Vector3()

      let minY = Infinity, maxY = -Infinity
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i)
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      const umbral = minY + Math.max((maxY - minY) * 0.05, 1e-4)
      let n = 0
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) <= umbral) {
          anchor.x += pos.getX(i); anchor.y += pos.getY(i); anchor.z += pos.getZ(i); n++
        }
      }
      if (n > 0) anchor.multiplyScalar(1 / n)
      else {
        for (let i = 0; i < pos.count; i++) {
          anchor.x += pos.getX(i); anchor.y += pos.getY(i); anchor.z += pos.getZ(i)
        }
        anchor.multiplyScalar(1 / pos.count)
      }

      const dist = new Float32Array(pos.count)
      const _v   = new THREE.Vector3()
      let maxD   = 0
      for (let i = 0; i < pos.count; i++) {
        _v.set(pos.getX(i), pos.getY(i), pos.getZ(i))
        const d = _v.distanceTo(anchor)
        dist[i] = d
        if (d > maxD) maxD = d
      }
      if (maxD > 0) for (let i = 0; i < dist.length; i++) dist[i] /= maxD
      g.setAttribute('aPulse', new THREE.BufferAttribute(dist, 1))

      node.material    = raizFGMaterial
      node.renderOrder = 1
      node.layers.enable(BLOOM_LAYER)
      return
    }

    const orig  = node.material
    const nuevo = new THREE.MeshPhysicalMaterial()
    if (orig) _transferirMaps(orig, nuevo)

    const esSemilla    = meshesSemillas.has(node)
    const esFlorGrande = node.name === 'FLOR_GRANDE'
    const esTerrain    = node.name.toLowerCase().includes('terrain') || node.name.toLowerCase().includes('terrrain')
    const esFlorCentral = node.name === 'flor_central'
    const esPlanta     = MESHES_PLANTAS.has(node.name)
    const esChip       = node.name === 'chip'

    // Chip y plantas: bloom propio, independiente del panel Bloom global.
    // musguito se excluye: no tiene textura base, el emissive le saldría plano.
    if (esChip || (esPlanta && node.name !== 'musguito')) {
      delete nuevo.userData.origEmissive
      nuevo.emissiveMap = nuevo.map
    }

    // Terrain: wired to Theatre.js 'Terrain' panel via terrainFollow
    if (esTerrain) {
      _terrainMesh = node
      nuevo.map          = null
      nuevo.normalMap    = null
      nuevo.roughnessMap = null
      nuevo.metalnessMap = null
      nuevo.emissiveMap  = null
      nuevo.transparent  = true
      nuevo.depthWrite   = false
      nuevo.side         = THREE.DoubleSide
      delete nuevo.userData.origColor
      delete nuevo.userData.origEmissive
      // visibility comes from _terrainCtrl
      node.visible = _terrainCtrl.value.visible
    }

    const proto  = esSemilla    ? semillasMaterial
                 : esFlorGrande ? florGrandeMaterial
                 : esTerrain    ? terrainMaterial
                 : esFlorCentral ? florCentralMaterial
                 : esPlanta     ? plantasMaterial
                 : chipMaterial
    const follow = esSemilla    ? semillasFollow
                 : esFlorGrande ? florGrandeFollow
                 : esTerrain    ? terrainFollow
                 : esFlorCentral ? florCentralFollow
                 : esPlanta     ? plantasFollow
                 : chipFollow

    // Semilla geometry is left untouched — shape and orientation come from the GLB.

    nuevo.transparent = proto.transparent
    nuevo.depthWrite  = proto.depthWrite
    nuevo.side        = proto.side
    nuevo.renderOrder = 1

    if (MESHES_CON_MOVIMIENTO.has(node.name)) {
      _inyectarMovimientoPlanta(nuevo)
    }

    if (esSemilla) {
      const _idx  = node.userData.semillaIndex ?? 0
      const _proj = CONFIG.projects[_idx] ?? CONFIG.projects[0]

      // ── Material plano: solo el video (sin luz, sin reflejos, sin vidrio) ──
      // El video se ve tal cual; opacidad/color/bloom se controlan en el panel.
      const _vidTex = _videoTexPerSemilla[_idx] ?? _texPerSemilla[_idx] ?? _texPerSemilla[0]
      const _initMul = _seedIsMobile ? _seedHoverBoost : 1   // mobile: arranca con boost (sin hover)
      const seedMat = new THREE.MeshBasicMaterial({
        map:         _vidTex,
        color:       new THREE.Color(_seedBaseColor.r * _initMul, _seedBaseColor.g * _initMul, _seedBaseColor.b * _initMul),
        transparent: true,   // siempre: deja que el panel maneje opacity en vivo
        opacity:     _seedBaseOpacity * _seedVisFactor,
        side:        THREE.DoubleSide,  // quad plano: visible de ambos lados
        depthWrite:  true,
      })
      const nuevo = seedMat   // resto del bloque opera sobre el material plano

      // Polygon offset prevents Z-fighting between co-planar cards
      nuevo.polygonOffset       = true
      nuevo.polygonOffsetFactor = -(_idx + 1)
      nuevo.polygonOffsetUnits  = -(_idx + 1)

      // Reconstruye la tarjeta como un QUAD plano (rectángulo real) usando las 4
      // esquinas de UV de la malla original → imposible que dé bisel/hexágono.
      const _rect   = _rectificarSemilla(node, _proj) || {}
      const _aspect = _rect.aspect ?? 1
      _drawSemillaCanvas(_idx, _proj)
      _drawSeedTitle(_idx, _proj.title, _aspect)
      _vidTex.repeat.set(1, 1)
      _vidTex.offset.set(0, 0)
      _semillaBaseOffset[_idx] = { x: 0, y: 0 }

      _semillaMats.push(nuevo)
      _semillaMeshes.push(node)
      _inyectarCorners(nuevo, _idx, _aspect, _seedTitleTextures[_idx], _rect.flipX, _rect.flipY)
      meshesSemillasArr.push(node)
      node.material = nuevo
      if (_seedBloom) node.layers.enable(BLOOM_LAYER)
      else            node.layers.disable(BLOOM_LAYER)
      return  // skip generic follow() — el panel "Glass Semillas" lo maneja
    }

    node.material = nuevo
    follow(nuevo, node)
  })
}

// ── updateMaterialTime — llamado en cada tick ─────────────────────────────────

export function updateMaterialTime(elapsed) {
  movimientoUniforms.u_time.value = elapsed
  raizUniforms.uTime.value        = elapsed
  raizFGUniforms.uTime.value      = elapsed
}

// ── growRoots / syncRootsToProgress ──────────────────────────────────────────

export function syncRootsToProgress(progress, maxGrowth = 200) {
  _rootsStarted = true
  raizUniforms.uCrecimientoActual.value = progress * maxGrowth
}


export function growRoots({ duration = 4, maxGrowth = 200, ease = 'power2.inOut' } = {}) {
  _rootsStarted = true
  raizUniforms.uCrecimientoActual.value = 0
  gsap.to(raizUniforms.uCrecimientoActual, {
    value:    maxGrowth,
    duration,
    ease,
  })
}

export function transitionRootsColor(duration = 4.5, ease = 'power2.inOut') {
  if (_colorTween) { _colorTween.kill(); _colorTween = null }
  const to    = _colorPulseFin
  const proxy = {
    r: raizUniforms.uColorPulse.value.r,
    g: raizUniforms.uColorPulse.value.g,
    b: raizUniforms.uColorPulse.value.b,
  }
  _colorTween = gsap.to(proxy, {
    r: to.r, g: to.g, b: to.b,
    duration,
    ease,
    onUpdate() {
      raizUniforms.uColorPulse.value.setRGB(proxy.r, proxy.g, proxy.b)
      raizFGUniforms.uColorPulse.value.setRGB(proxy.r, proxy.g, proxy.b)
    },
    onComplete() { _colorTween = null },
  })
}

// Instant reset to the initial pulse color — call at loop restart before the circle opens.
export function resetRootsColor() {
  if (_colorTween) { _colorTween.kill(); _colorTween = null }
  raizUniforms.uColorPulse.value.copy(_colorPulseInit)
  raizFGUniforms.uColorPulse.value.copy(_colorPulseInit)
}

// ── Petal color transitions (chip / plantas / flor central) ──────────────────

const _chipInit      = new THREE.Color(0x0edfff)
const _chipFin       = new THREE.Color(0x2b32ff)
const _plantasInit   = new THREE.Color(0xd7d7d7)
const _plantasFin    = new THREE.Color(0x735cff)
const _florCentInit  = new THREE.Color(0xaeaeae)
const _florCentFin   = new THREE.Color(0xfa0f0f)
let _petalColorTween = null

export function transitionPetalColors(duration = 4.5, ease = 'power2.inOut') {
  if (_petalColorTween) { _petalColorTween.kill(); _petalColorTween = null }

  // Read actual current emissive from real mesh followers — no snap, no flash
  const chipFrom    = chipGetEmissive()
  const plantasFrom = plantasGetEmissive()
  const florFrom    = florCentralGetEmissive()

  const proxy = {
    cr: chipFrom.r,    cg: chipFrom.g,    cb: chipFrom.b,
    pr: plantasFrom.r, pg: plantasFrom.g, pb: plantasFrom.b,
    fr: florFrom.r,    fg: florFrom.g,    fb: florFrom.b,
  }

  const _c = new THREE.Color()
  _petalColorTween = gsap.to(proxy, {
    cr: _chipFin.r,     cg: _chipFin.g,     cb: _chipFin.b,
    pr: _plantasFin.r,  pg: _plantasFin.g,  pb: _plantasFin.b,
    fr: _florCentFin.r, fg: _florCentFin.g, fb: _florCentFin.b,
    duration, ease,
    onUpdate() {
      chipSetEmissive(_c.setRGB(proxy.cr, proxy.cg, proxy.cb))
      plantasSetEmissive(_c.setRGB(proxy.pr, proxy.pg, proxy.pb))
      florCentralSetEmissive(_c.setRGB(proxy.fr, proxy.fg, proxy.fb))
    },
    onComplete() { _petalColorTween = null },
  })
}

export function resetPetalColors() {
  if (_petalColorTween) { _petalColorTween.kill(); _petalColorTween = null }
  chipSetEmissive(_chipInit)
  plantasSetEmissive(_plantasInit)
  florCentralSetEmissive(_florCentInit)
}

export function transitionRootsColorBack(duration = 1.2, ease = 'power2.inOut') {
  if (_colorTween) { _colorTween.kill(); _colorTween = null }
  const from  = raizUniforms.uColorPulse.value
  const proxy = { r: from.r, g: from.g, b: from.b }
  _colorTween = gsap.to(proxy, {
    r: _colorPulseInit.r, g: _colorPulseInit.g, b: _colorPulseInit.b,
    duration, ease,
    onUpdate() {
      raizUniforms.uColorPulse.value.setRGB(proxy.r, proxy.g, proxy.b)
      raizFGUniforms.uColorPulse.value.setRGB(proxy.r, proxy.g, proxy.b)
    },
    onComplete() { _colorTween = null },
  })
}

export function transitionPetalColorsBack(duration = 1.2, ease = 'power2.inOut') {
  if (_petalColorTween) { _petalColorTween.kill(); _petalColorTween = null }
  const chipFrom    = chipGetEmissive()
  const plantasFrom = plantasGetEmissive()
  const florFrom    = florCentralGetEmissive()
  const proxy = {
    cr: chipFrom.r,    cg: chipFrom.g,    cb: chipFrom.b,
    pr: plantasFrom.r, pg: plantasFrom.g, pb: plantasFrom.b,
    fr: florFrom.r,    fg: florFrom.g,    fb: florFrom.b,
  }
  const _c = new THREE.Color()
  _petalColorTween = gsap.to(proxy, {
    cr: _chipInit.r,     cg: _chipInit.g,     cb: _chipInit.b,
    pr: _plantasInit.r,  pg: _plantasInit.g,  pb: _plantasInit.b,
    fr: _florCentInit.r, fg: _florCentInit.g, fb: _florCentInit.b,
    duration, ease,
    onUpdate() {
      chipSetEmissive(_c.setRGB(proxy.cr, proxy.cg, proxy.cb))
      plantasSetEmissive(_c.setRGB(proxy.pr, proxy.pg, proxy.pb))
      florCentralSetEmissive(_c.setRGB(proxy.fr, proxy.fg, proxy.fb))
    },
    onComplete() { _petalColorTween = null },
  })
}

// ── Semilla hover effect ──────────────────────────────────────────────────────

const _semillaBaseOffset  = []  // [idx] = { x, y } — base UV offset after applyMaterials
const _semillaHoverTweens = []  // [idx] = active GSAP tween (or null)

export function semillaHoverEnter(idx) {
  if (_semillaHoverTweens[idx]) _semillaHoverTweens[idx].kill()
  // Brillo en hover: empuja el color > 1 para que florezca con el bloom.
  const proxy = { mul: _seedHoverMul[idx] ?? 1 }
  _semillaHoverTweens[idx] = gsap.to(proxy, {
    mul: _seedHoverBoost,
    duration: 0.35, ease: 'power2.out',
    onUpdate() { _seedHoverMul[idx] = proxy.mul; _applySeedColors() },
    onComplete() { _semillaHoverTweens[idx] = null },
  })
}

export function semillaHoverLeave(idx) {
  if (_semillaHoverTweens[idx]) _semillaHoverTweens[idx].kill()
  // Snap UV tilt back to base immediately
  const base = _semillaBaseOffset[idx]
  if (base) {
    const vidTex = _videoTexPerSemilla[idx]
    if (vidTex) {
      vidTex.offset.set(base.x, base.y)
    } else {
      if (_texPerSemilla[idx])  _texPerSemilla[idx].offset.set(base.x, base.y)
      if (_emisPerSemilla[idx]) _emisPerSemilla[idx].offset.set(base.x, base.y)
    }
  }
  const proxy = { mul: _seedHoverMul[idx] ?? 1 }
  _semillaHoverTweens[idx] = gsap.to(proxy, {
    mul: 1.0,
    duration: 0.55, ease: 'power2.inOut',
    onUpdate() { _seedHoverMul[idx] = proxy.mul; _applySeedColors() },
    onComplete() { _semillaHoverTweens[idx] = null },
  })
}

let _semillaFadeTween = null

export function setSemillasVisible(visible, duration = 0.7) {
  if (_semillaFadeTween) { _semillaFadeTween.kill(); _semillaFadeTween = null }

  if (visible) {
    _semillaMeshes.forEach(m => { if (m) m.visible = true })
    semillaPickerMeshes.forEach(m => { if (m) m.visible = true })
  }

  // Tween el factor de visibilidad (0..1). La opacidad final es base*vis,
  // así no pisamos la opacidad que el usuario fija en el panel.
  const proxy = { v: _seedVisFactor }

  _semillaFadeTween = gsap.to(proxy, {
    v:        visible ? 1 : 0,
    duration,
    ease:     visible ? 'power2.out' : 'power2.in',
    onUpdate() { _seedVisFactor = proxy.v; _applySeedOpacity() },
    onComplete() {
      if (!visible) {
        _semillaMeshes.forEach(m => { if (m) m.visible = false })
        semillaPickerMeshes.forEach(m => { if (m) m.visible = false })
      }
      _semillaVisFactorSettle(visible)
      _semillaFadeTween = null
    },
  })
}

function _semillaVisFactorSettle(visible) {
  _seedVisFactor = visible ? 1 : 0
  _applySeedOpacity()
}

export function semillaSetTilt(idx, nx, ny) {
  const base = _semillaBaseOffset[idx]
  if (!base) return
  const dx = nx * 0.025
  const dy = ny * 0.025
  const vidTex = _videoTexPerSemilla[idx]
  if (vidTex) {
    vidTex.offset.set(base.x + dx, base.y + dy)
  } else {
    if (_texPerSemilla[idx])  _texPerSemilla[idx].offset.set(base.x + dx, base.y + dy)
    if (_emisPerSemilla[idx]) _emisPerSemilla[idx].offset.set(base.x + dx, base.y + dy)
  }
}
