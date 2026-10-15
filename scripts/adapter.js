/**
 * Traduit un émetteur Ember (preset + réglages) en configuration pour
 * foundry.canvas.animation.ParticleGenerator (API intégrée à Foundry v14).
 *
 * Toute la dépendance à l'API du cœur est concentrée ici : si Foundry change
 * le format de configuration, c'est le seul fichier à adapter.
 * Les fonctions de calcul sont pures (sans dépendance à Foundry) pour être testables.
 */

import { REFERENCE_GRID } from "./constants.js";

/* -------------------------------------------- */
/*  Couleurs                                    */
/* -------------------------------------------- */

/** "#ff8800" → 0xff8800. Retourne null si invalide. */
export function hexToNumber(hex) {
  if (typeof hex === "number") return hex;
  if (typeof hex !== "string") return null;
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  return m ? parseInt(m[1], 16) : null;
}

/** Mélange une couleur vers le blanc (amount > 0) ou le noir (amount < 0). */
export function shade(color, amount) {
  const target = amount >= 0 ? 255 : 0;
  const k = Math.min(1, Math.abs(amount));
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (c) => Math.round(c + (target - c) * k);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/**
 * Courbe de couleur à partir d'une couleur choisie par le MJ :
 * plus clair à la naissance, la couleur au milieu, plus sombre à la fin.
 */
export function curveFromColor(hex) {
  const base = hexToNumber(hex);
  if (base === null) return null;
  return [[0, shade(base, 0.6)], [0.4, base], [1, shade(base, -0.6)]];
}

/* -------------------------------------------- */
/*  Courbes et plages                           */
/* -------------------------------------------- */

/** [[t, v], ...] → [{time, value}, ...], avec v transformé par fn. */
export function toCurve(points, fn = (v) => v) {
  const curve = points.map(([time, value]) => ({ time, value: fn(value) }));
  // L'API exige une courbe qui commence à 0, finit à 1 et dont les temps croissent strictement.
  curve.sort((a, b) => a.time - b.time);
  if (curve[0].time !== 0) curve.unshift({ time: 0, value: curve[0].value });
  if (curve.at(-1).time !== 1) curve.push({ time: 1, value: curve.at(-1).value });
  return curve.filter((p, i) => i === 0 || p.time > curve[i - 1].time);
}

/** Multiplie une plage [min, max]. */
export function scaleRange([min, max], k) {
  return [min * k, max * k];
}

const DEG = Math.PI / 180;

/* -------------------------------------------- */
/*  Zone d'apparition                           */
/* -------------------------------------------- */

/**
 * Zone d'apparition en coordonnées de scène, centrée sur (x, y).
 * @param {object} area      Zone du preset (en cases)
 * @param {number} x
 * @param {number} y
 * @param {number} gridPx    Taille d'une case en pixels
 * @param {number|null} radiusOverride  Rayon imposé par le MJ (en cases)
 */
export function buildArea(area, x, y, gridPx, radiusOverride = null) {
  const shape = area?.shape ?? "circle";
  if (shape === "rect") {
    const width = (area.width ?? 1) * gridPx;
    const height = (area.height ?? 1) * gridPx;
    return { x: x - width / 2, y: y - height / 2, width, height };
  }
  if (shape === "ring") {
    let inner = area.inner ?? 0.3;
    let outer = area.outer ?? 0.5;
    if (radiusOverride) {
      const k = radiusOverride / outer;
      inner *= k;
      outer = radiusOverride;
    }
    return { x, y, innerRadius: inner * gridPx, outerRadius: outer * gridPx };
  }
  const radius = radiusOverride ?? area?.radius ?? 0.25;
  return { x, y, radius: Math.max(1, radius * gridPx) };
}

/** Rayon « naturel » d'un preset, en cases (pour l'éditeur et les poignées). */
export function presetRadius(preset) {
  const a = preset?.area ?? {};
  if (a.shape === "ring") return a.outer ?? 0.5;
  if (a.shape === "rect") return Math.max(a.width ?? 1, a.height ?? 1) / 2;
  return a.radius ?? 0.25;
}

/* -------------------------------------------- */
/*  Configuration complète                      */
/* -------------------------------------------- */

/**
 * Construit la configuration « pure » (sans objets PIXI) d'un émetteur.
 * Les textures et le mode de fusion sont ajoutés par finalizeConfig().
 *
 * @param {object} emitter   Données de l'émetteur (voir EMITTER_DEFAULTS)
 * @param {object} preset    Définition du preset
 * @param {object} context   { gridPx, performance }
 */
export function buildConfig(emitter, preset, { gridPx = REFERENCE_GRID, performance = 1 } = {}) {
  const g = gridPx / REFERENCE_GRID;
  const size = emitter.size ?? 1;
  const speed = emitter.speed ?? 1;
  const density = (emitter.density ?? 1) * performance;

  const colorPoints = (emitter.color && curveFromColor(emitter.color)) || preset.color || [[0, "#ffffff"]];

  return {
    mode: "effect",
    area: buildArea(preset.area, emitter.x, emitter.y, gridPx, emitter.radius),
    count: Math.max(1, Math.round(preset.count * density)),
    spawnRate: Math.max(0.1, preset.rate * density),
    initial: 0,
    lifetime: preset.lifetime,
    velocity: {
      x: scaleRange(preset.velocity?.x ?? [0, 0], g * speed),
      y: scaleRange(preset.velocity?.y ?? [0, 0], g * speed)
    },
    scale: { curve: toCurve(preset.scale ?? [[0, 0.3]], (v) => v * size * g) },
    alpha: { curve: toCurve(preset.alpha ?? [[0, 1], [1, 0]]) },
    tint: { curve: toCurve(colorPoints, (v) => hexToNumber(v) ?? 0xffffff) },
    rotation: {
      alignVelocity: !!preset.rotation?.align,
      spread: (preset.rotation?.spread ?? 0) * DEG,
      speed: { min: preset.rotation?.speed?.[0] ?? 0, max: preset.rotation?.speed?.[1] ?? 0 }
    },
    drift: { enabled: (preset.drift ?? 0) > 0, intensity: preset.drift ?? 0 },
    elevation: emitter.elevation ?? 0,
    _blend: preset.blend ?? "add",
    _textures: preset.textures?.length ? preset.textures : ["glow"]
  };
}

/** Ajoute ce qui dépend de PIXI : textures et mode de fusion. */
export function finalizeConfig(cfg, getTexture) {
  const { _blend, _textures, ...rest } = cfg;
  const modes = globalThis.PIXI?.BLEND_MODES ?? {};
  const blend = { add: modes.ADD, screen: modes.SCREEN, normal: modes.NORMAL }[_blend] ?? modes.NORMAL;
  rest.textures = _textures.map((id) => getTexture(id));
  if (blend !== undefined) rest.blend = blend;
  return rest;
}

/**
 * Versions de repli de plus en plus simples, si le générateur du cœur
 * refuse la configuration complète (API encore expérimentale en v14).
 */
export function fallbackConfigs(cfg) {
  const firstColor = cfg.tint?.curve?.[0]?.value ?? 0xffffff;
  const noColorCurve = { ...cfg, tint: firstColor };
  const minimal = { ...noColorCurve };
  delete minimal.drift;
  delete minimal.rotation;
  return [cfg, noColorCurve, minimal];
}
