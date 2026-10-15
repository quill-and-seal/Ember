/** Identifiant du module, utilisé pour les flags, les réglages et l'API. */
export const MODULE_ID = "ember-particles";

/** Nom du calque canvas enregistré par Ember. */
export const LAYER_NAME = "ember";

/** Clé du flag de scène qui contient les émetteurs. */
export const FLAG_EMITTERS = "emitters";

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
  elevation: 0
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
