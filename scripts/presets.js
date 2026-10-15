/**
 * Presets d'effets Ember, pensés pour une carte VUE DU DESSUS.
 *
 * La caméra regarde le sol : ce qui « monte » se rapproche d'elle et grossit
 * (hauteur z + perspective), ce qui retombe rapetisse jusqu'au sol. Dans le plan,
 * les effets partent de la source dans toutes les directions, sont poussés par le
 * vent ou tourbillonnent : rien ne file vers le haut de l'écran.
 *
 * Toutes les distances (rayons) sont en CASES, les vitesses en pixels/seconde et
 * les tailles en multiple d'une texture de 64 px, pour une case de 100 px.
 * L'adaptateur met tout à l'échelle selon la taille de case réelle de la scène.
 *
 * Format :
 *   icon        Icône Font Awesome affichée dans le sélecteur
 *   textures    Une ou plusieurs textures (voir textures.js), tirées au hasard par particule
 *   area        { shape: "circle", radius } | { shape: "ring", inner, outer } | { shape: "rect", width, height }
 *   count       Nombre maximum de particules vivantes
 *   rate        Particules créées par seconde
 *   lifetime    [min, max] en millisecondes
 *   scale       Courbe [[temps 0..1, valeur], ...] de la taille au sol (la hauteur l'agrandit)
 *   alpha       Courbe [[temps, opacité], ...]
 *   color       Courbe [[temps, "#rrggbb"], ...]
 *   blend       "add" (lumineux), "screen" ou "normal"
 *   rotation    { spread: degrés, speed: [min, max] en degrés/s, align: suit la direction }
 *   drift       Intensité de la dérive aléatoire ondulante (0 = aucune)
 *
 *   Dans le plan de la carte (moteur maison ; le générateur de Foundry n'en garde qu'une approximation) :
 *   velocity    Vitesse aléatoire { x: [min, max], y: [min, max] } en px/s
 *   radial      Élan qui s'éloigne du centre [min, max] en px/s
 *   swirl       Tourbillon autour du centre [min, max] en degrés/s
 *   wind        Vent constant { x, y } en px/s
 *   drag        Frottement par seconde (0 = aucun)
 *
 *   En hauteur (moteur maison uniquement) :
 *   height      Hauteur de départ [min, max] en px
 *   lift        Vitesse verticale de départ [min, max] en px/s (négatif = descend)
 *   fall        Retombée vers le sol en px/s²
 *   groundFade  Durée (ms) pour s'éteindre une fois au sol (absent = continue sa vie au sol)
 */

export const PRESETS = {
  campfire: {
    icon: "fa-solid fa-fire",
    textures: ["flame", "glow"],
    area: { shape: "circle", radius: 0.2 },
    count: 110,
    rate: 70,
    lifetime: [600, 1100],
    velocity: { x: [-6, 6], y: [-6, 6] },
    radial: [0, 18],
    lift: [60, 110],
    scale: [[0, 0.55], [0.5, 0.42], [1, 0.12]],
    alpha: [[0, 0], [0.12, 0.65], [1, 0]],
    color: [[0, "#fff2b0"], [0.3, "#ffae3d"], [0.65, "#ff5a1f"], [1, "#5a1e0a"]],
    blend: "add",
    rotation: { spread: 180, speed: [-40, 40] },
    drift: 0.15
  },

  torch: {
    icon: "fa-solid fa-fire-flame-simple",
    textures: ["flame", "glow"],
    area: { shape: "circle", radius: 0.06 },
    count: 45,
    rate: 40,
    lifetime: [450, 800],
    velocity: { x: [-3, 3], y: [-3, 3] },
    radial: [0, 8],
    lift: [50, 90],
    scale: [[0, 0.38], [0.5, 0.26], [1, 0.08]],
    alpha: [[0, 0], [0.1, 0.7], [1, 0]],
    color: [[0, "#fff4c2"], [0.35, "#ffb347"], [0.7, "#ff6224"], [1, "#4a1806"]],
    blend: "add",
    rotation: { spread: 180, speed: [-30, 30] },
    drift: 0.1
  },

  smoke: {
    icon: "fa-solid fa-smog",
    textures: ["smoke"],
    area: { shape: "circle", radius: 0.15 },
    count: 40,
    rate: 6,
    lifetime: [4000, 6500],
    velocity: { x: [-4, 4], y: [-4, 4] },
    radial: [3, 12],
    wind: { x: 14, y: -6 },
    lift: [25, 45],
    scale: [[0, 0.5], [1, 1.4]],
    alpha: [[0, 0], [0.2, 0.32], [1, 0]],
    color: [[0, "#6b6b6b"], [1, "#3a3a3a"]],
    blend: "normal",
    rotation: { spread: 180, speed: [-15, 15] },
    drift: 0.25
  },

  embers: {
    icon: "fa-solid fa-fire-flame-curved",
    textures: ["ember"],
    area: { shape: "circle", radius: 0.25 },
    count: 40,
    rate: 10,
    lifetime: [2000, 3500],
    velocity: { x: [-8, 8], y: [-8, 8] },
    radial: [8, 30],
    wind: { x: 6, y: -3 },
    drag: 0.4,
    lift: [30, 70],
    scale: [[0, 0.16], [1, 0.07]],
    alpha: [[0, 0], [0.1, 1], [1, 0]],
    color: [[0, "#ffd27a"], [0.5, "#ff6a1a"], [1, "#a01e00"]],
    blend: "add",
    rotation: { spread: 0, speed: [0, 0] },
    drift: 0.6
  },

  sparks: {
    icon: "fa-solid fa-bolt",
    textures: ["spark"],
    area: { shape: "circle", radius: 0.04 },
    count: 70,
    rate: 35,
    lifetime: [600, 1100],
    velocity: { x: [0, 0], y: [0, 0] },
    radial: [70, 170],
    drag: 1.2,
    lift: [60, 150],
    fall: 420,
    groundFade: 150,
    scale: [[0, 0.5], [1, 0.2]],
    alpha: [[0, 1], [0.7, 1], [1, 0]],
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
    height: [20, 80],
    lift: [-6, 6],
    scale: [[0, 0.13], [1, 0.13]],
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
    velocity: { x: [-3, 3], y: [-3, 3] },
    swirl: [40, 90],
    lift: [15, 40],
    scale: [[0, 0.28], [1, 0.05]],
    alpha: [[0, 0], [0.15, 1], [1, 0]],
    color: [[0, "#e0b3ff"], [0.5, "#8a5cff"], [1, "#3b1d9e"]],
    blend: "add",
    rotation: { spread: 180, speed: [-90, 90] },
    drift: 0.2
  },

  holy: {
    icon: "fa-solid fa-sun",
    textures: ["glow", "star"],
    area: { shape: "circle", radius: 0.35 },
    count: 45,
    rate: 14,
    lifetime: [2000, 3200],
    velocity: { x: [-4, 4], y: [-4, 4] },
    radial: [0, 10],
    lift: [30, 60],
    scale: [[0, 0.2], [1, 0.05]],
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
    velocity: { x: [-8, 8], y: [-8, 8] },
    radial: [4, 14],
    wind: { x: 5, y: 2 },
    lift: [0, 8],
    scale: [[0, 0.7], [1, 1.5]],
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
    lifetime: [1500, 2800],
    velocity: { x: [-4, 4], y: [-4, 4] },
    lift: [30, 60],
    scale: [[0, 0.1], [1, 0.18]],
    alpha: [[0, 0], [0.1, 0.8], [0.9, 0.8], [1, 0]],
    color: [[0, "#cdefff"], [1, "#cdefff"]],
    blend: "normal",
    rotation: { spread: 0, speed: [0, 0] },
    drift: 0.8
  },

  leaves: {
    icon: "fa-solid fa-leaf",
    textures: ["leaf"],
    area: { shape: "circle", radius: 1.2 },
    count: 15,
    rate: 2,
    lifetime: [5000, 8000],
    velocity: { x: [-6, 6], y: [-6, 6] },
    wind: { x: 22, y: 10 },
    height: [180, 320],
    lift: [-35, -20],
    groundFade: 600,
    scale: [[0, 0.22], [1, 0.22]],
    alpha: [[0, 0], [0.1, 1], [0.9, 1], [1, 0]],
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
    velocity: { x: [-5, 5], y: [-5, 5] },
    wind: { x: 3, y: 1 },
    height: [0, 60],
    lift: [-3, 3],
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
