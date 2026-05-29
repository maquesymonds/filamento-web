/**
 * FILAMENTO Loader v4 — full 3D, no CSS layer
 * ─────────────────────────────────────────────
 * Phase 1  (0 – ~3s)   : fx4 shuffle entirely in 3D — geometries swap on the metallic meshes
 * Phase 2  (~3 – 3.5s) : brief hero pause with FILAMENTO fully revealed
 * Phase 3  (3.5 – 5.5s): camera rushes through the letters
 * Phase 4  (~5.5s)     : fade to black → onComplete()
 */

import * as THREE from 'three';
import { gsap }   from 'gsap';
import { Font }         from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import fontData   from '../fonts/ChakraPetch-Bold.typeface.json';

// ─── CONFIG ───────────────────────────────────────────────────
const WORD    = 'FILAMENTO';
const LETTERS = ['F','I','L','A','M','E','N','T','O']; // glyph pool for shuffle

const SHUFFLE = {
  maxIter: 55,   // iterations per cell → ~2.2 s per cell
  tickMs:  38,   // ms per tick
  delay:   60,   // ms before animation starts
};

const CAM = {
  fov:    58,
  startZ: 20,
  endZ:  -24,
};

const LETTER = {
  size:  1.3,
  depth: 0.48,
  gap:   0.08,
};
// ──────────────────────────────────────────────────────────────

export function initFilamentoLoader({ onComplete = () => {} } = {}) {

  const mobile = window.innerWidth < 768;
  if (mobile) {
    LETTER.size  = 0.82;
    LETTER.depth = 0.30;
    SHUFFLE.tickMs = 28;
    CAM.startZ = 14;
    CAM.endZ   = -16;
  }

  // ── Overlay ───────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'fl-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0',
    background: '#000', zIndex: '9999', overflow: 'hidden',
  });
  document.body.appendChild(overlay);

  // ── Renderer ──────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  overlay.appendChild(renderer.domElement);

  // ── Scene ─────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  // Deep navy-black fog — Avatar underwater darkness
  scene.fog = new THREE.FogExp2(0x00060f, 0.012);

  // ── Camera ────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(CAM.fov, innerWidth / innerHeight, 0.1, 200);
  camera.position.z = CAM.startZ;

  // Background matches fog color
  renderer.setClearColor(0x00060f);

  // ── Avatar lighting ───────────────────────────────────────────
  // Minimal ambient — dark Pandora night
  scene.add(new THREE.AmbientLight(0x000c1a, 1));

  // Key: cool blue-white from above-front (moonlight through jungle canopy)
  const keyLight = new THREE.DirectionalLight(0x90c8ff, 3.2);
  keyLight.position.set(0, 14, 10);
  scene.add(keyLight);

  // Hero rim: electric cyan from left — main bioluminescence source
  const rimCyan = new THREE.PointLight(0x00f5ff, 10, 65);
  rimCyan.position.set(-12, 3, 9);
  scene.add(rimCyan);

  // Counter-rim: deep blue from right-back (depth, atmosphere)
  const rimBlue = new THREE.PointLight(0x0033ff, 5, 55);
  rimBlue.position.set(12, -2, -4);
  scene.add(rimBlue);

  // Under-glow: Na'vi purple from below (bioluminescent ground)
  const underGlow = new THREE.PointLight(0x6600ff, 2.5, 40);
  underGlow.position.set(0, -10, 6);
  scene.add(underGlow);

  // Teal fill from front-top: separates letters from background
  const tealFill = new THREE.PointLight(0x00ddaa, 3.0, 50);
  tealFill.position.set(0, 8, 14);
  scene.add(tealFill);

  // ── Bioluminescent particle field ─────────────────────────────
  const PARTICLE_COUNT = 160;
  const pPositions = new Float32Array(PARTICLE_COUNT * 3);
  const pBase      = new Float32Array(PARTICLE_COUNT * 3); // original positions

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const x = (Math.random() - 0.5) * 26;
    const y = (Math.random() - 0.5) * 14;
    const z = Math.random() * -32 + 4;  // scattered behind and around
    pPositions[i * 3]     = pBase[i * 3]     = x;
    pPositions[i * 3 + 1] = pBase[i * 3 + 1] = y;
    pPositions[i * 3 + 2] = pBase[i * 3 + 2] = z;
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));

  const pMat = new THREE.PointsMaterial({
    color:           0x00f0ff,
    size:            0.07,
    sizeAttenuation: true,
    transparent:     true,
    opacity:         0.75,
  });

  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  // ── Build all geometries (reused across meshes) ───────────────
  const font  = new Font(fontData);
  const geoOf = {};   // letter → BufferGeometry (shared, never disposed during loader)
  const advOf = {};   // letter → advance width in 3D units

  LETTERS.forEach(l => {
    const g = new TextGeometry(l, {
      font,
      size:   LETTER.size,
      height: LETTER.depth,
      curveSegments: 4,
      bevelEnabled:   true,
      bevelThickness: 0.04,
      bevelSize:      0.022,
      bevelSegments:  5,
    });
    g.computeBoundingBox();
    geoOf[l] = g;
    advOf[l] = g.boundingBox.max.x - g.boundingBox.min.x + LETTER.gap;
  });

  // ── Material — exact iridescent glass from FilamentoWeb/src/js/materials.js ──
  const mat = new THREE.MeshPhysicalMaterial({
    color:                    0xffffff,
    iridescence:              1.0,
    iridescenceIOR:           1.5,
    iridescenceThicknessRange:[100, 400],
    transparent:              true,
    transmission:             1.0,
    opacity:                  1.0,
    roughness:                0.1,
    metalness:                0.0,
    emissive:                 new THREE.Color(0xffffff),
    emissiveIntensity:        0.3,
    depthWrite:               false,
    side:                     THREE.DoubleSide,
  });

  // ── Letter group – one mesh per WORD position ─────────────────
  const wordWidth = WORD.split('').reduce((s, l) => s + advOf[l], 0);
  let cx = -wordWidth / 2;

  const group = new THREE.Group();
  scene.add(group);

  const items = WORD.split('').map(letter => {
    const mesh = new THREE.Mesh(geoOf[letter], mat);
    mesh.position.set(cx, -LETTER.size * 0.5, 0);
    mesh.visible = false;        // hidden until shuffle wave reaches this position
    group.add(mesh);
    cx += advOf[letter];
    return {
      mesh,
      original:  letter,
      cache:     '',   // what this position showed last tick
      prevCache: '',   // snapshot of cache at start of current tick
    };
  });

  // ── RAF ───────────────────────────────────────────────────────
  let rafId;
  let camT       = 0;
  let isAdvancing = false;

  (function tick() {
    rafId = requestAnimationFrame(tick);

    camT += 0.008;

    // Gentle camera breathe only during shuffle phase
    if (!isAdvancing) {
      camera.position.x = Math.sin(camT * 1.1) * 0.03;
      camera.position.y = Math.sin(camT * 0.7) * 0.018;
    }

    // Animate bioluminescent particles (slow organic float)
    const pos = pGeo.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3]     = pBase[i * 3]     + Math.sin(camT * 0.4 + i * 0.8)  * 0.12;
      pos[i * 3 + 1] = pBase[i * 3 + 1] + Math.sin(camT * 0.3 + i * 1.2)  * 0.18;
      pos[i * 3 + 2] = pBase[i * 3 + 2] + Math.cos(camT * 0.25 + i * 0.6) * 0.08;
    }
    pGeo.attributes.position.needsUpdate = true;

    // Cyan rim light pulses softly — bioluminescent breathing
    rimCyan.intensity = 10 + Math.sin(camT * 1.8) * 1.5;

    renderer.render(scene, camera);
  })();

  // ── fx4 shuffle in 3D ─────────────────────────────────────────
  //
  // Cell 0 shows a random FILAMENTO letter each tick.
  // Cell N shows whatever cell N-1 showed the previous tick (prevCache).
  // This creates the sliding "wave fills from left" illusion.
  // All geometry swaps happen directly on the Three.js mesh — no CSS.

  let done = 0;

  function runShuffle(onDone) {
    const loop = (item, idx, iter = 0) => {
      item.prevCache = item.cache;   // snapshot before update

      if (iter === SHUFFLE.maxIter - 1) {
        // Reveal the true letter
        item.cache         = item.original;
        item.mesh.geometry = geoOf[item.original];
        item.mesh.visible  = true;
        if (++done === items.length) onDone();

      } else if (idx === 0) {
        // Lead cell: random glyph from LETTERS pool
        const g = LETTERS[Math.floor(Math.random() * LETTERS.length)];
        item.cache         = g;
        item.mesh.geometry = geoOf[g];
        item.mesh.visible  = true;

      } else {
        // Follower: take what the previous cell showed last tick
        const letter = items[idx - 1].prevCache;
        if (letter) {
          item.cache         = letter;
          item.mesh.geometry = geoOf[letter];
          item.mesh.visible  = true;
        }
        // If prev cell hasn't appeared yet, stay hidden (iter won't advance)
      }

      // Iteration counter only advances once this cell has content
      if (item.prevCache !== '') iter++;
      if (iter < SHUFFLE.maxIter) {
        setTimeout(() => loop(item, idx, iter), SHUFFLE.tickMs);
      }
    };

    // Stagger start by one tick per cell so the chain is guaranteed to be in order
    items.forEach((item, idx) => {
      setTimeout(() => loop(item, idx), SHUFFLE.delay + idx * SHUFFLE.tickMs);
    });
  }

  // ── Hero pause + camera advance ───────────────────────────────
  function startAdvance() {
    isAdvancing = true;
    // Smoothly center the camera before the rush
    gsap.to(camera.position, { x: 0, y: 0, duration: 0.35, ease: 'power2.out' });

    // Single bioluminescence pulse — letters "breathe" once before the rush
    gsap.to(rimCyan, {
      intensity: 22,
      duration: 0.35,
      yoyo: true, repeat: 1,
      ease: 'power2.inOut',
    });

    const tl = gsap.timeline({
      onComplete() {
        cancelAnimationFrame(rafId);
        renderer.dispose();
        overlay.remove();
        onComplete();
      },
    });

    // Brief static pause so the viewer reads "FILAMENTO" in 3D (0.4s)
    // then camera accelerates through the letters
    tl.to(camera.position, {
      z: CAM.endZ,
      duration: 2.1,
      ease: 'power2.in',
    }, 0.4);

    // Letters drift apart as the camera blasts through — adds drama
    items.forEach((item, i) => {
      const spread = (i - (items.length - 1) / 2) * 0.32;
      tl.to(item.mesh.position, {
        x: item.mesh.position.x + spread,
        duration: 1.6,
        ease: 'power1.in',
      }, 0.7);
    });

    // Fog thickens — deep Pandora darkness
    tl.to(scene.fog, {
      density: 0.10,
      duration: 1.9,
      ease: 'power2.in',
    }, 0.2);

    // Cyan rim explodes — bioluminescence surge
    tl.to(rimCyan, {
      intensity: 28,
      duration: 1.2,
      ease: 'power3.in',
    }, 0.2);

    // Blue rim flares from behind
    tl.to(rimBlue, {
      intensity: 12,
      duration: 1.0,
      ease: 'power2.in',
    }, 0.4);

    // Purple ground glow intensifies
    tl.to(underGlow, {
      intensity: 7,
      duration: 1.3,
      ease: 'power2.in',
    }, 0.3);

    // Fade overlay to black → site reveal
    tl.to(overlay, {
      opacity: 0,
      duration: 0.65,
      ease: 'power2.inOut',
    }, 1.7);
  }

  // ── Kick off ──────────────────────────────────────────────────
  runShuffle(startAdvance);

  // ── Resize ────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}
