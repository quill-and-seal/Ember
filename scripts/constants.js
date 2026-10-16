/** Identifiant du module, utilisé pour les flags, les réglages et l'API. */
export const MODULE_ID = "ember-particles";

/** Nom du calque canvas enregistré par Ember. */
export const LAYER_NAME = "ember";

/** Clé du flag de scène qui contient les émetteurs. */
export const FLAG_EMITTERS = "emitters";

/** Clé du flag de scène qui contient le vent. */
export const FLAG_WIND = "wind";

/**
 * Vent de scène par défaut.
 * direction : vers où souffle le vent, en degrés (0 = vers le haut de la carte, 90 = vers la droite).
 * strength  : force en px/s pour une case de 100 px.
 * gusts     : intensité des rafales (0 = vent régulier, 1 = très irrégulier).
 */
export const WIND_DEFAULTS = Object.freeze({
  enabled: false,
  direction: 90,
  strength: 30,
  gusts: 0.3
});

/**
 * Taille de case de référence pour laquelle les presets sont écrits.
 * Rayons, vitesses et tailles sont mis à l'échelle selon la taille de case de la scène.
 */
export const REFERENCE_GRID = 100;

/** Valeurs par défaut d'un émetteur posé sur la scène. */
export const EMITTER_DEFAULTS = Object.freeze({
  label: "",
  preset: "campfire",
  x: 0,
  y: 0,
  enabled: true,
  hidden: false,
  size: 1,
  density: 1,
  speed: 1,
  radius: null,
  color: null,
  elevation: 0,
  windFactor: 1,
  blowout: true,
  // Lumière liée : "auto" (lumière créée par Ember si l'effet éclaire), "off", ou "linked" (lumière existante)
  light: "auto",
  lightLink: null,
  lightScale: 1,
  // true : vraie lumière Foundry (compte pour la vision) ; false : simple lueur visuelle
  lightVision: true,
  // Réactions au monde (moteur maison)
  walls: true,
  tokens: true,
  darkness: true,
  // Groupes : réglages par effet { [preset]: { off, density } }
  layers: null
});

/** Log préfixé. */
export function log(...args) {
  console.log("Ember |", ...args);
}

export function warn(...args) {
  console.warn("Ember |", ...args);
}

/** Traduction raccourcie. */
export function t(key, data) {
  const full = `EMBER.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}
