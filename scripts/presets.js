/**
 * Presets d'effets Ember.
 *
 * Toutes les distances (rayons) sont en CASES, les vitesses en pixels/seconde et
 * les tailles en multiple d'une texture de 64 px, pour une case de 100 px.
 * L'adaptateur met tout à l'échelle selon la taille de case réelle de la scène.
 *
 * Format :
 *   icon      Icône Font Awesome affichée dans le sélecteur
 *   textures  Une ou plusieurs textures (voir textures.js), tirées au hasard par particule
 *   area      { shape: "circle", radius } | { shape: "ring", inner, outer } | { shape: "rect", width, height }
 *   count     Nombre maximum de particules vivantes
 *   rate      Particules créées par seconde
 *   lifetime  [min, max] en millisecondes
 *   velocity  { x: [min, max], y: [min, max] } en px/s (y négatif = vers le haut)
 *   scale     Courbe [[temps 0..1, valeur], ...] sur la durée de vie
 *   alpha     Courbe [[temps, opacité], ...]
 *   color     Courbe [[temps, "#rrggbb"], ...]
 *   blend     "add" (lumineux), "screen" ou "normal"
 *   rotation  { spread: degrés, speed: [min, max] en degrés/s, align: suit la direction }
 *   drift     Intensité de la dérive aléatoire (0 = aucune)
 */

export const PRESETS = {
  campfire: {
    icon: "fa-solid fa-fire",
    textures: ["flame", "glow"],
    area: { shape: "circle", radius: 0.25 },
    count: 120,
    rate: 70,
    lifetime: [700, 1300],
    velocity: { x: [-12, 12], y: [-90, -45] },
    scale: [[0, 0.9], [0.5, 0.5], [1, 0.15]],
    alpha: [[0, 0], [0.12, 0.9], [1, 0]],
    color: [[0, "#fff2b0"], [0.3, "#ffae3d"], [0.65, "#ff5a1f"], [1, "#5a1e0a"]],
    blend: "add",
    rotation: { spread: 20, speed: [-20, 20] },
    drift: 0.15
  },

  torch: {
    icon: "fa-solid fa-fire-flame-simple",
    textures: ["flame", "glow"],
    area: { shape: "circle", radius: 0.08 },
    count: 50,
    rate: 40,
    lifetime: [500, 900],
    velocity: { x: [-6, 6], y: [-70, -35] },
    scale: [[0, 0.5], [0.5, 0.3], [1, 0.08]],
    alpha: [[0, 0], [0.1, 0.9], [1, 0]],
    color: [[0, "#fff4c2"], [0.35, "#ffb347"], [0.7, "#ff6224"], [1, "#4a1806"]],
    blend: "add",
    rotation: { spread: 15, speed: [-15, 15] },
    drift: 0.1
  },

  smoke: {
    icon: "fa-solid fa-smog",
    textures: ["smoke"],
    area: { shape: "circle", radius: 0.2 },
    count: 40,
    rate: 6,
    lifetime: [4000, 6500],
    velocity: { x: [-10, 10], y: [-30, -15] },
    scale: [[0, 0.6], [1, 1.8]],
    alpha: [[0, 0], [0.2, 0.35], [1, 0]],
    color: [[0, "#6b6b6b"], [1, "#3a3a3a"]],
    blend: "normal",
    rotation: { spread: 180, speed: [-15, 15] },
    drift: 0.3
  },

  embers: {
    icon: "fa-solid fa-fire-flame-curved",
    textures: ["ember"],
    area: { shape: "circle", radius: 0.3 },
    count: 40,
    rate: 10,
    lifetime: [2000, 3500],
    velocity: { x: [-20, 20], y: [-60, -25] },
    scale: [[0, 0.18], [1, 0.08]],
    alpha: [[0, 0], [0.1, 1], [1, 0]],
    color: [[0, "#ffd27a"], [0.5, "#ff6a1a"], [1, "#a01e00"]],
    blend: "add",
    rotation: { spread: 0, speed: [0, 0] },
    drift: 0.6
  },

  sparks: {
    icon: "fa-solid fa-bolt",
    textures: ["spark"],
    area: { shape: "circle", radius: 0.05 },
    count: 60,
    rate: 30,
    lifetime: [300, 700],
    velocity: { x: [-140, 140], y: [-160, 20] },
    scale: [[0, 0.35], [1, 0.1]],
    alpha: [[0, 1], [1, 0]],
    color: [[0, "#ffffff"], [0.4, "#ffd37a"], [1, "#ff7b1c"]],
    blend: "add",
    rotation: { spread: 0, speed: [0, 0], align: true },
    drift: 0
  },

  fireflies: {
    icon: "fa-solid fa-bug",
    textures: ["glow"],
    area: { shape: "circle", radius: 1.5 },
    count: 25,
    rate: 4,
    lifetime: [4000, 7000],
    velocity: { x: [-12, 12], y: [-12, 12] },
    scale: [[0, 0.15], [1, 0.15]],
    alpha: [[0, 0], [0.2, 1], [0.5, 0.2], [0.75, 1], [1, 0]],
    color: [[0, "#d6ff7a"], [1, "#9bff4a"]],
    blend: "add",
    rotation: { spread: 0, speed: [0, 0] },
    drift: 1
  },

  arcane: {
    icon: "fa-solid fa-wand-sparkles",
    textures: ["star", "glow"],
    area: { shape: "ring", inner: 0.3, outer: 0.5 },
    count: 50,
    rate: 15,
    lifetime: [1500, 2600],
    velocity: { x: [-8, 8], y: [-35, -10] },
    scale: [[0, 0.3], [1, 0.05]],
    alpha: [[0, 0], [0.15, 1], [1, 0]],
    color: [[0, "#e0b3ff"], [0.5, "#8a5cff"], [1, "#3b1d9e"]],
    blend: "add",
    rotation: { spread: 180, speed: [-90, 90] },
    drift: 0.2
  },

  holy: {
    icon: "fa-solid fa-sun",
    textures: ["glow", "star"],
    area: { shape: "circle", radius: 0.4 },
    count: 45,
    rate: 14,
    lifetime: [2000, 3200],
    velocity: { x: [-5, 5], y: [-45, -20] },
    scale: [[0, 0.22], [1, 0.05]],
    alpha: [[0, 0], [0.15, 1], [1, 0]],
    color: [[0, "#fffbe0"], [0.5, "#ffd76a"], [1, "#c99a2e"]],
    blend: "add",
    rotation: { spread: 180, speed: [-30, 30] },
    drift: 0.2
  },

  poison: {
    icon: "fa-solid fa-skull-crossbones",
    textures: ["smoke"],
    area: { shape: "circle", radius: 0.5 },
    count: 30,
    rate: 6,
    lifetime: [3000, 5000],
    velocity: { x: [-12, 12], y: [-12, 8] },
    scale: [[0, 0.8], [1, 1.6]],
    alpha: [[0, 0], [0.3, 0.4], [1, 0]],
    color: [[0, "#8bdc5a"], [1, "#3f7d24"]],
    blend: "normal",
    rotation: { spread: 180, speed: [-10, 10] },
    drift: 0.5
  },

  bubbles: {
    icon: "fa-solid fa-circle-dot",
    textures: ["bubble"],
    area: { shape: "circle", radius: 0.3 },
    count: 20,
    rate: 5,
    lifetime: [2500, 4000],
    velocity: { x: [-6, 6], y: [-40, -20] },
    scale: [[0, 0.12], [1, 0.25]],
    alpha: [[0, 0], [0.1, 0.8], [0.85, 0.8], [1, 0]],
    color: [[0, "#cdefff"], [1, "#cdefff"]],
    blend: "normal",
    rotation: { spread: 0, speed: [0, 0] },
    drift: 0.8
  },

  leaves: {
    icon: "fa-solid fa-leaf",
    textures: ["leaf"],
    area: { shape: "circle", radius: 1 },
    count: 15,
    rate: 2,
    lifetime: [5000, 8000],
    velocity: { x: [10, 35], y: [15, 35] },
    scale: [[0, 0.25], [1, 0.25]],
    alpha: [[0, 0], [0.1, 1], [0.85, 1], [1, 0]],
    color: [[0, "#c97a2a"], [1, "#8a4b1a"]],
    blend: "normal",
    rotation: { spread: 180, speed: [-60, 60] },
    drift: 0.8
  },

  dust: {
    icon: "fa-solid fa-wind",
    textures: ["dust"],
    area: { shape: "circle", radius: 1.2 },
    count: 40,
    rate: 6,
    lifetime: [5000, 9000],
    velocity: { x: [-6, 6], y: [-6, 6] },
    scale: [[0, 0.06], [1, 0.08]],
    alpha: [[0, 0], [0.3, 0.6], [1, 0]],
    color: [[0, "#fff3d6"], [1, "#fff3d6"]],
    blend: "add",
    rotation: { spread: 0, speed: [0, 0] },
    drift: 0.7
  }
};

/** Presets ajoutés par d'autres modules ou macros via l'API. */
const CUSTOM = {};

/** Retourne un preset par id (personnalisé en priorité), ou null. */
export function getPreset(id) {
  return CUSTOM[id] ?? PRESETS[id] ?? null;
}

/** Tous les presets disponibles, natifs puis personnalisés. */
export function allPresets() {
  return { ...PRESETS, ...CUSTOM };
}

/** Enregistre ou remplace un preset personnalisé. */
export function registerPreset(id, definition) {
  if (!id || typeof id !== "string") throw new Error("Ember | registerPreset : id invalide");
  CUSTOM[id] = { icon: "fa-solid fa-star", ...definition };
  return CUSTOM[id];
}

/** Libellé affichable d'un preset. */
export function presetLabel(id) {
  const preset = getPreset(id);
  if (preset?.label) return preset.label;
  const key = `EMBER.Preset.${id}`;
  return game.i18n.has(key) ? game.i18n.localize(key) : id;
}
