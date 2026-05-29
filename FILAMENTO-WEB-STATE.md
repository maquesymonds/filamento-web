# Filamento Web — State Report

**Fecha del reporte:** 2026-05-12
**Path del proyecto:** `/Users/maquesymonds/Desktop/Filamento/Portfolio Web/FilamentoWeb`
**Estado general:** early prototype — estructura funcional con scroll y modelo cargado, secciones con copy placeholder, sin polish visual

---

## 1. Stack técnico

- **Build tool:** Vite 5.4.10
- **3D engine:** Three.js 0.169.0 (con `GLTFLoader` de `three/addons`)
- **Animación / scroll:** GSAP 3.12.5 + `ScrollTrigger` plugin
- **Audio:** Web Audio API nativo (`new Audio()`)
- **Framework UI:** ninguno — vanilla JavaScript puro, módulos ES
- **TypeScript:** no — JavaScript sin tipos
- **Otras libs:** ninguna (no hay postprocessing, no hay Lenis, no hay Theatre.js, no hay drei)
- **Fuente:** Chakra Petch (Google Fonts, weights 300/400/500/600)

---

## 2. Estructura de carpetas
s
```
FilamentoWeb/
├── index.html
├── package.json
├── vite.config.js
├── ESCENA_FILAMENTO.glb          ← copia suelta en raíz (duplicado)
├── public/
│   ├── audio/
│   │   └── ambient.mp3           (2.3 MB)
│   ├── icons/
│   │   ├── SoundOff.png
│   │   └── SoundOn.mp4
│   └── models/
│       └── ESCENA_FILAMENTO.glb  (46 MB — modelo activo)
└── src/
    ├── js/
    │   ├── main.js       ← entry point, boot sequence
    │   ├── config.js     ← todos los valores tuneables
    │   ├── scene.js      ← WebGLRenderer + render loop
    │   ├── experience.js ← carga GLB, AnimationMixer, scrub
    │   ├── scroll.js     ← ScrollTrigger, text overlays
    │   ├── carousel.js   ← carrusel 3D anclado a FLOR_GRANDE
    │   ├── loaders.js    ← GLTFLoader wrapper con progress
    │   ├── audio.js      ← toggle sonido ambiente
    │   └── ui.js         ← loader, hero overlay, botón Comenzar
    └── styles/
        └── style.css
```

---

## 3. Las secciones del sitio

Las secciones están definidas en `config.js` por rangos de frames del clip de Blender. El scroll mapea linealmente `frame introFrames → frame totalFrames` sobre un stage de 600vh.

### Sección 0: Loader
- **Narrativa:** Pantalla negra con el wordmark "Filamento" y una barra de progreso de 1px. El usuario espera mientras carga el GLB.
- **Assets:** ninguno (sólo UI HTML/CSS)
- **Estado:** funcional y con el look correcto
- **Archivos clave:** [src/js/ui.js](src/js/ui.js), [src/styles/style.css](src/styles/style.css)

### Sección 1: Hero (frames 0–25, animado por GSAP — no scroll)
- **Narrativa:** Fondo negro con la escena 3D parqueada en frame 0. El usuario ve "FILAMENTO" centrado, el tagline "Diseño que permanece" en uppercase tenue, y un botón "Comenzar" abajo. El botón dispara el intro.
- **Assets:** `ESCENA_FILAMENTO.glb` (parqueado en t=0)
- **Estado:** funcional; el copy y la posición de la cámara en frame 0 dependen del GLB de Blender
- **Archivos clave:** [index.html](index.html), [src/js/experience.js](src/js/experience.js) (`playIntro()`), [src/js/ui.js](src/js/ui.js)

### Sección 2: Intro animado (frames 0→25, 2.2s GSAP)
- **Narrativa:** Al hacer click en "Comenzar", el hero desaparece y la cámara animada hace un movimiento introductorio (definido en Blender, frames 0→25) antes de que arranque el scroll.
- **Assets:** animación de cámara del GLB, frames 0–25
- **Estado:** el mecanismo funciona; la calidad visual depende del clip exportado desde Blender
- **Archivos clave:** [src/js/experience.js](src/js/experience.js) (`playIntro`, `getIntroEndTime`)

### Sección 3: Studio (frames 30–90, scroll)
- **Narrativa:** La cámara viaja por la escena mientras aparece el texto superpuesto bottom-left: heading "Somos Filamento", líneas "Un estudio de diseño industrial / fundado en Uruguay. / Diseñamos objetos que duran."
- **Assets:** animación de cámara del GLB, frames 30–90
- **Estado:** mecanismo de texto funcional; copy es placeholder definitivo o casi-definitivo
- **Archivos clave:** [src/js/scroll.js](src/js/scroll.js), [src/js/config.js](src/js/config.js) (`scrollCopy.studio`)

### Sección 4: Proceso (frames 90–160, scroll)
- **Narrativa:** Texto: "Del boceto al objeto terminado. / Cada decisión tiene una razón. / Nada es arbitrario." La cámara sigue recorriendo la escena.
- **Assets:** animación de cámara del GLB, frames 90–160
- **Estado:** mecanismo funcional; copy placeholder
- **Archivos clave:** [src/js/config.js](src/js/config.js) (`scrollCopy.process`)

### Sección 5: Work / Carrusel 3D (frames 160–230, scroll)
- **Narrativa:** La cámara llega a la zona de `FLOR_GRANDE`. Aparece un carrusel de 5 tarjetas 3D en anillo (generadas por canvas) anclado al nodo `FLOR_GRANDE` del GLB. Las tarjetas representan las áreas de servicio del estudio: Identidad, Producto, Espacio, Digital, Colecciones. El usuario puede hacer click o usar flechas del teclado para rotarlas.
- **Assets:** tarjetas generadas proceduralmente via `CanvasTexture` (no hay imágenes externas), nodo `FLOR_GRANDE` del GLB
- **Estado:** mecanismo implementado y funcional; la posición del carrusel en escena (`yOffset`, `radius`) NO está tuneada todavía — depende de ver el GLB cargado. Las tarjetas no tienen imágenes de proyectos reales.
- **Archivos clave:** [src/js/carousel.js](src/js/carousel.js), [src/js/config.js](src/js/config.js) (`carousel.*`)

### Sección 6: Contacto (frames 230–280, scroll)
- **Narrativa:** Texto final: "Trabajemos juntos / hola@filamento.uy". La cámara llega al punto final del clip.
- **Assets:** animación de cámara del GLB, frames 230–280
- **Estado:** mecanismo funcional; el email es el CTA real pero no tiene link `mailto:` todavía
- **Archivos clave:** [src/js/config.js](src/js/config.js) (`scrollCopy.contact`)

---

## 4. Storytelling / journey conceptual

El usuario entra a una pantalla negra, quieta. El wordmark "FILAMENTO" está centrado con el tagline "Diseño que permanece". Al hacer click en "Comenzar", la cámara despierta y empieza a moverse — no el usuario: la escena. Desde ese momento el scroll se convierte en tiempo: el usuario no navega páginas, controla la velocidad a la que descubre la escena. La cámara viaja por la escena 3D revelando el mundo del estudio — primero quiénes son, luego cómo trabajan, luego qué hacen (el carrusel de servicios), y finalmente cómo contactarlos. El cierre es quieto: un email, sin más.

**Emoción/sensación buscada:** calma deliberada, peso, materialidad. No velocidad ni espectáculo. El ritmo es lento porque el diseño industrial es lento y preciso.

**Hero moment:** el momento en que el usuario hace click en "Comenzar" y la escena cobra vida — el paso de la quietud al movimiento, con audio ambient entrando.

**Call-to-action:** `hola@filamento.uy` al final del scroll. No hay formulario ni botones agresivos.

---

## 5. Lo que ya está funcionando bien

- **Boot sequence completo:** loader con progress → fade out → hero reveal → botón → intro animado → scroll
- **Scrub de animación:** `ScrollTrigger` mapea scroll progress → tiempo del mixer con `scrub: 0.8` (lag cinematográfico). Funciona correctamente.
- **Sistema de texto por secciones:** los text overlays aparecen y desaparecen con `gsap` fade+translate según los rangos de frames. Limpio.
- **Carrusel 3D:** mecanismo completo — ring layout, rotación animada, hit testing con raycaster, escalado del card activo, show/hide por sección de scroll.
- **Audio toggle:** botón fixed top-right con ícono estático (off) y video animado (on). Toggle funcional.
- **Frame debug UI:** overlay en dev que muestra frame actual / total y progress — útil para tuning de rangos en config.js.
- **Responsive básico:** FOV multiplicado por 1.2 en mobile, text layer ajustado con media query.
- **Resize handler:** renderer y cámara actualizan correctamente al redimensionar ventana.

---

## 6. Lo que es placeholder o requiere mejora

**Modelo / 3D:**
- `ESCENA_FILAMENTO.glb` (46 MB) — peso muy alto para web. Necesita optimización: compresión Draco/Meshopt, texturas KTX2, reducción de polígonos si corresponde. Target recomendado: < 10 MB.
- El clip de animación y el recorrido de cámara en Blender NO está evaluado todavía desde el browser — los rangos de frames en `config.js` (studio: 30–90, process: 90–160, etc.) son estimados y van a necesitar ajuste fino una vez que se vea el GLB corriendo.
- Hay una copia suelta del GLB en la raíz del proyecto (`/ESCENA_FILAMENTO.glb`) que debería eliminarse.

**Carrusel:**
- `yOffset: 0` y `radius: 1.5` son valores placeholder — hay que ajustarlos una vez que el GLB cargue y se vea la posición real de `FLOR_GRANDE`.
- Las tarjetas del carrusel usan texto genérico ("Identidad", "Producto", etc.) sin imágenes de proyectos reales.

**Copy / texto:**
- El copy de todas las secciones es borrador funcional. Nada está confirmado con el cliente.
- El email `hola@filamento.uy` en la sección contact no tiene link `mailto:` clickeable.

**Técnicamente débil / pendiente:**
- **Sin postprocessing:** no hay bloom, depth of field, ni ningún efecto de postpro. La escena se ve "plana" sin iluminación cinematográfica. Solo hay una `AmbientLight` de fallback.
- **Mobile:** el sitio tiene consideraciones básicas (FOV, media query) pero no fue testeado en dispositivos reales. 46 MB de GLB es inviable en mobile.
- **Sin router:** single page, sin navegación.
- **Sin build testeado:** nunca se corrió `vite build` — no se sabe el bundle size final ni si hay errores.
- El `#scene-veil` (div para fade to black entre estados) existe en el HTML pero nunca se usa en el código JS actual.

---

## 7. Decisiones de diseño visual ya tomadas

- **Paleta:** negro puro `#000000` como background de escena, blanco `#ffffff` para texto principal, grises `rgba(255,255,255,0.45–0.65)` para texto secundario y subtítulos. Las tarjetas del carrusel tienen gradientes oscuros con tinte de color (verde muy oscuro, azul muy oscuro, marrón, violeta, rojo) — sutiles.
- **Tipografía:** Chakra Petch exclusivamente — weight 300 para body y taglines, 500 para el brand name, 600 para headings del carrusel. La fuente da un tono técnico/industrial sin ser agresiva.
- **Tono visual:** dark, slow, cold. Sin colores saturados. Sin animaciones de UI rápidas o "bouncy". Todo es `power2.in/out`, nada de springs.
- **UI philosophy:** mínima. El botón "Comenzar" es una línea de 1px opacity 0.4. El sound toggle es un ícono sin background. No hay nav ni header persistente.
- **Scroll stage:** 600vh — ritmo deliberadamente lento. El usuario tarda en atravesarlo.
- **Tone mapping:** `ACESFilmic` a exposure 1.0 — estándar cinematográfico.

---

## 8. Performance / target

- **Devices target:** desktop primario; mobile considerado pero no optimizado
- **Browser support:** modern evergreen (no IE, no Safari < 14). No hay polyfills.
- **Peso total actual:**
  - `public/` completo: **65 MB**
  - `ESCENA_FILAMENTO.glb`: **46 MB** (crítico — necesita optimización)
  - `ambient.mp3`: **2.3 MB**
  - Íconos y demás: < 1 MB
  - Bundle JS estimado (sin build): ~200–300 KB (Three.js + GSAP)
- **FPS en dev:** no medido formalmente. La escena es simple (un GLB, sin postprocessing) — en desktop moderno debería correr a 60fps sin problema, pero no está verificado.
- **Sin build corrido:** no hay `dist/` — el peso del bundle bundleado no se conoce todavía.

---

## 9. Bloqueos técnicos actuales

- **Rangos de frames sin validar:** los valores `startFrame`/`endFrame` de cada sección en `config.js` son estimados. Hasta que no se corra el sitio con el GLB y se use el frame debug overlay para ver qué frame corresponde a qué punto de la cámara, no se puede confirmar que el texto aparece cuando corresponde.
- **Peso del GLB:** 46 MB es inviable para producción. Decisión pendiente: ¿comprimir con Draco/Meshopt en el pipeline de Blender? ¿Usar `@gltf-transform/cli`? ¿Separar el modelo del clip de cámara?
- **Postprocessing:** no se decidió si agregar bloom/DOF. Three.js nativo requiere `three/addons/postprocessing/` — ninguna de esas libs está instalada.
- **Carrusel sin posicionar:** `FLOR_GRANDE` existe como nombre en config pero no se sabe si ese nodo existe en el GLB actual con ese nombre exacto. Si el nombre cambió en Blender, el carrusel no se monta.
- **Mobile no testeado:** el FOV multiplier de 1.2 es un guess. En móvil, un GLB de 46 MB probablemente crashea el tab.
- **Sin animación de salida del hero:** el hero overlay se oculta con fade pero la escena de fondo en frame 0 puede verse "vacía" o rara dependiendo del GLB.

---

## 10. La pregunta abierta para el otro agente

> **Maque completa esta sección.** Algunos temas posibles a consultar:

- Qué hacer con la escena hero (frame 0 del GLB) — ¿debería ser un estado especial o el inicio natural del recorrido de cámara?
- Cómo estructurar la animación de Blender para que los rangos de secciones sean predecibles y fáciles de ajustar desde `config.js`
- Si tiene sentido introducir un VDB de Houdini como elemento en alguna sección (¿hero? ¿proceso?) y cómo integrarlo en Three.js (Sprite sheet, texture sequence, volumen renderizado)
- Qué referencias del library de Filamento (materiales, colores, sistema de objetos) podrían traducirse a elementos visuales en la web
- Si el carrusel 3D en `FLOR_GRANDE` tiene sentido narrativo o si la sección Work debería manejarse de otra manera
- Cómo optimizar el GLB sin perder la calidad del clip de cámara animado
- Si el postprocessing vale la pena agregarle (bloom sutil, DOF) o si la estética sin fx es intencional y correcta
