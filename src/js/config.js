// config.js — Todos los valores tuneables de la experiencia Filamento

export const CONFIG = {

  // ── Assets ───────────────────────────────────────────────────
  assets: {
    model:      '/models/ESCENA_FILAMENTO8_DRACO.glb',
  },

  // ── Renderer ─────────────────────────────────────────────────
  renderer: {
    antialias:           true,
    alpha:               false,
    toneMapping:         'ACESFilmic',
    toneMappingExposure: 1.0,
    shadowMapEnabled:    false,
  },

  // ── Camera ───────────────────────────────────────────────────
  // Multiplica el FOV extraído del GLB.
  // < 1.0 = zoom in. 1.0 = FOV original de Blender.
  cameraFovMultiplier:       1.0,
  cameraFovMultiplierMobile: 1.55,

  // Fallback si el modelo no tiene cámara
  cameraFallback: {
    fov:      45,
    near:     0.1,
    far:      1000,
    position: { x: 0, y: 2, z: 8 },
    target:   { x: 0, y: 0, z: 0 },
  },

  // ── Intro (botón Start → cámara se aleja) ────────────────────
  intro: {
    duration: 4.5,           // segundos — más lento = más cinematográfico
    ease:     'power2.inOut',
  },

  // ── Journey (auto-play, sin scroll) ─────────────────────────
  journey: {
    // Paradas en cada proyecto (semillas). La cámara frena en cada uno y avanza
    // al siguiente con el botón Continue. Tras el último salta a Contact (358).
    projectStops:      [256, 271, 285, 302],
    autoPlayEndFrame:  256,  // auto-play se detiene aquí → scroll toma el control
    endFrame:          249,  // FLOR_GRANDE — chip float se detiene aquí
    duration:          8,    // duración del auto-play en segundos (ease: none = velocidad constante)
    ease:              'none',
    approachFreezeFrame: 170, // cámara frena aquí → texto Approach → Continue reanuda
    scrollFreezeFrame: 359,  // cámara se congela aquí (plano final de contact)
    scrollEndFrame:    367,  // el contador llega acá y dispara el loop
  },

  // ── Scroll (legacy — mantenido solo como referencia de secciones) ──
  scroll: {
    // Frames 0-25 = intro animado (botón "Start"), NO son viaje.
    introFrames: 25,

    // scrollVH: ya no se usa para scroll, pero define el stage.
    scrollVH: 600,

    // Secciones con texto superpuesto.
    // startFrame / endFrame son frames del clip de Blender.
    // Ajustar estos valores una vez que veas la animación.
    sections: [
      { id: 'intro',     startFrame: 0,   endFrame: 30,  hasText: false },
      { id: 'studio',    startFrame: 30,  endFrame: 90,  hasText: true,  navFrame: 30  },
      { id: 'process',   startFrame: 90,  endFrame: 249, hasText: true,  navFrame: 170 },
      { id: 'work',      startFrame: 160, endFrame: 230, hasText: true,  navFrame: 257 },
      { id: 'contact',   startFrame: 230, endFrame: 280, hasText: true,  navFrame: 358 },
    ],

    // totalFrames: total de frames en el clip del GLB.
    // Este valor se setea automáticamente en experience.js una vez que carga el GLB.
    // Si lo querés override manual, cambiarlo acá.
    totalFrames: null,
  },

  // ── Copy de las secciones ────────────────────────────────────
  scrollCopy: {
    studio: {
      heading: 'Studio',
      lines: [
        'Filamento is a digital studio crafting high-end, immersive web and 3D experiences where brand, art, and technology converge.',
        'We partner with brands who understand that digital presence shapes perception, transforming it into something unforgettable. Functionality is no longer enough.',
      ],
      mobileLines: [
        'Filamento is a digital studio crafting high-end, immersive web and 3D experiences where brand, art, and technology converge. We partner with brands who understand that digital presence shapes perception, transforming it into something unforgettable. Functionality is no longer enough.',
      ],
    },
    process: {
      heading: 'Approach',
      lines: [
        'We build universes, not landing pages. By merging interaction, motion, sound, and atmosphere, we create digital spaces meant to be explored. Everything begins as one core idea where design, 3D, and code aren\'t separate phases, but operate seamlessly as a single, unified system.',
      ],
    },
    work: {
      heading: 'Our work',
      lines: [
        'A curated selection of our latest web experiences, 3D design, and digital storytelling, crafted for brands that want their presence to be felt, not just seen.',
      ],
    },
    contact: {
      items: [
        { label: 'LinkedIn',  href: 'https://www.linkedin.com/company/filamentolabs/' },
        { label: 'Instagram', href: 'https://www.instagram.com/filamento____?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==' },
        { label: 'Mail',      href: 'mailto:filamentolabs@gmail.com' },
      ],
    },
  },

  // ── Background ───────────────────────────────────────────────
  // Color de fondo de la escena Three.js
  backgroundColor: 0x000000,

  // ── Fog (espacio infinito, niebla muy tenue) ─────────────────
  // El fog desvanece lo lejano hacia su color → sensación de profundidad infinita.
  // El fondo de la escena se iguala a este color para que el fade sea continuo.
  // Tuneable en vivo desde el panel Theatre "Fog".
  fog: {
    enabled: true,
    color:   0x03050c,   // azul de espacio profundo, casi negro
    density: 0.0025,     // muy tenue
  },

  // ── Animaciones UI ───────────────────────────────────────────
  animation: {
    loaderFadeOut:   0.6,
    heroReveal:      1.0,
  },

  // ── Projects (semilla1–4 clickable panels) ───────────────────
  // Order matches semilla index: projects[0] = semilla1, etc.
  projects: [
    {
      // semilla1 — PHOS
      flipTexX: true,   // UV flip auto-detection wrong for this card's 3D orientation
      title: 'Phos',
      company: 'Estudio Once',
      date: '2026',
      category: 'UX/UI · Front-end · 3D Web · GLSL',
      description: 'An immersive product website for a designer lamp, built as a cinematic scroll-driven experience combining real-time 3D, motion, sound, and custom shaders to translate atmosphere and materiality into the web.',
      webUrl: 'https://phos-nine.vercel.app/',
      caseStudyUrl: null,
      image:   '/images/PhosHorizontal.webp',
      video:   '/videos/phos',
      bgImage: '/images/underwaterPhos.webp',
      bgTint:  { wave: 0x8b3a0a, base: 0x180800, brightness: 3.5 },
    },
    {
      // semilla2 — Casa Futura
      title: 'Casa Futura',
      company: 'Magma Futura',
      date: '2026',
      category: 'Concept · UX/UI · 3D · Front-end · Sound',
      description: 'An immersive digital experience designed as a navigable 3D house where editorial content, sound, interaction, and spatial storytelling merge into a single real-time web experience.',
      webUrl: 'https://magma-futura.netlify.app/',
      caseStudyUrl: 'https://maquesymonds.com/magma-futura-study',
      image:   '/images/MagmaHorizontal.webp',
      video:   '/videos/casaFutura',
      bgImage: '/images/UnderwaterMagma.webp',
      bgTint:  { brightness: 3.5 },
    },
    {
      // semilla3 — Sacramentum Advisors
      title: 'Sacramentum Advisors',
      company: 'Sacramentum Advisors',
      date: '2026',
      category: 'Brand Identity · UX/UI · Front-end · CMS',
      description: 'A premium digital platform for an international advisory firm, combining editorial-inspired design, motion, and a custom CMS to create a refined and credibility-focused online presence.',
      webUrl: 'https://sacramentumadvisors.com/',
      caseStudyUrl: 'https://maquesymonds.com/sacramentum-advisors',
      image:   '/images/SacramentumHorizontal.webp',
      video:   '/videos/sacramentum',
      bgImage: '/images/UnderwaterSacramentum.webp',
      bgTint:  { wave: 0x03a88b, base: 0x011410, brightness: 3.5 },
    },
    {
      // semilla4 — Río de la Plata
      title: 'China Zorrilla',
      company: 'Rio de la Plata',
      date: '2026',
      category: '3D Design · Installation · Anamorphic screen design · VFX',
      description: 'A bidirectional anamorphic 3D installation, soon to be displayed at \'China Zorrilla\', the world\'s largest fully electric ferry. Built as an immersive physical experience combining high-end VFX and fluid simulations to translate the motion of the ocean into a living digital space.',
      webUrl: null,
      caseStudyUrl: null,
      image: '/images/ChinaHorizontal.webp',
      video: '/videos/riodelaPlata',
      bgTint:  { wave: 0x020508, base: 0x010102, brightness: 1.2 },
    },
  ],

  // ── Carousel 3D ──────────────────────────────────────────────
  // 6 horizontal cards in a ring around FLOR_GRANDE trunk.
  // Tune yOffset + radius once the GLB is loaded.
  carousel: {
    trunkNode:  'FLOR_GRANDE',
    yOffset:    0,
    xOffset:    0,
    zOffset:    0,
    radius:     3.2,    // radio del ring — ajustar con Theatre.js
    cardWidth:  0.85,
    cardHeight: 0.53,
    section:    'work',

    items: [
      {
        number: '01', title: 'Filamento', subtitle: 'Brand identity',
        image: null,  // '/textures/cards/filamento.jpg'
        palette: ['#0d3b5e', '#1a7a6a', '#06111e'],
      },
      {
        number: '02', title: 'Racer', subtitle: 'Google / Interactive',
        image: null,
        palette: ['#5c2d0a', '#c07820', '#1a0d03'],
      },
      {
        number: '03', title: 'Secret Sky', subtitle: 'Porter Robinson',
        image: null,
        palette: ['#1a5c1a', '#6a2a8a', '#060d06'],
      },
      {
        number: '04', title: 'Monument', subtitle: 'Spatial experience',
        image: null,
        palette: ['#4a0a6a', '#9a1060', '#0a040e'],
      },
      {
        number: '05', title: 'Archive', subtitle: 'Digital collection',
        image: null,
        palette: ['#0a1a4a', '#0a6060', '#060608'],
      },
      {
        number: '06', title: 'Studio', subtitle: 'Internal work',
        image: null,
        palette: ['#0f2a4a', '#3a3a7a', '#080a10'],
      },
    ],
  },
}
