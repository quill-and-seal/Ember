/**
 * Traduit un émetteur Ember (preset + réglages) en configuration de particules,
 * comprise à la fois par le moteur maison (engine/particle-system.js) et par
 * foundry.canvas.animation.ParticleGenerator (API intégrée à Foundry v14).
 *
 * Toute la dépendance au format de configuration est concentrée ici.
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
/*  Vent                                        */
/* -------------------------------------------- */

/** Direction (degrés, 0 = haut de la carte, sens horaire) et force → vecteur {x, y}. */
export function windVector(direction, strength) {
  const rad = (direction * Math.PI) / 180;
  return { x: Math.sin(rad) * strength, y: -Math.cos(rad) * strength };
}

/**
 * Vent subi par un émetteur, en px/s à l'échelle de la scène, et intensité des rafales.
 * Avec un vent de scène actif, il remplace la brise propre au preset et il est
 * multiplié par la sensibilité du preset (windFactor) et celle de l'émetteur.
 * Sans vent de scène, l'émetteur garde la brise de son preset.
 */
export function computeWind(emitter, preset, sceneWind, { gridPx = REFERENCE_GRID } = {}) {
  const g = gridPx / REFERENCE_GRID;
  const speed = emitter.speed ?? 1;
  if (sceneWind?.enabled) {
    const k = (preset.windFactor ?? 1) * (emitter.windFactor ?? 1) * g;
    const v = windVector(sceneWind.direction ?? 0, (sceneWind.strength ?? 0) * k);
    // Courant d'air ressenti par l'effet (100 = vent fort), atténué si l'émetteur est abrité.
    const airflow = ((sceneWind.strength ?? 0) / 100) * (emitter.windFactor ?? 1);
    return { wind: v, gust: sceneWind.gusts ?? 0, airflow };
  }
  return {
    airflow: 0,
    wind: { x: (preset.wind?.x ?? 0) * g * speed, y: (preset.wind?.y ?? 0) * g * speed },
    gust: 0
  };
}

/* -------------------------------------------- */
/*  Lumière liée                                */
/* -------------------------------------------- */

/**
 * Lumière de base d'un émetteur, avant modulation par la flamme.
 * @returns {null | {mode: "auto"|"linked", dim: number, bright: number, color: number, alpha: number,
 *                   animation: object|null, vision: boolean, scale: number, linkId: string|null}}
 *          dim et bright en cases (null pour une lumière liée : on garde les siennes).
 */
export function lightConfig(emitter, preset) {
  const mode = emitter.light ?? "auto";
  if (mode === "off") return null;
  const scale = emitter.lightScale ?? 1;
  if (mode === "linked") {
    if (!emitter.lightLink) return null;
    return { mode, linkId: emitter.lightLink, dim: null, bright: null, color: null, alpha: null, animation: null, vision: true, scale };
  }
  const base = preset?.light;
  if (!base) return null;
  const color = hexToNumber(emitter.color) ?? hexToNumber(base.color) ?? 0xffc070;
  return {
    mode: "auto",
    linkId: null,
    dim: base.dim ?? 0,
    bright: base.bright ?? 0,
    color,
    alpha: base.alpha ?? 0.5,
    animation: base.animation ?? null,
    vision: emitter.lightVision !== false,
    scale
  };
}

/**
 * Lumière modulée par l'état de la flamme (niveau et rayon donnés par le moteur).
 * Renvoie des valeurs en cases et une intensité, ou disabled quand la flamme est soufflée.
 */
export function modulateLight(base, { level = 1, radius = 1, flicker = 0 } = {}, linkedBase = null) {
  const src = linkedBase ?? base;
  const k = (base.scale ?? 1) * radius;
  const disabled = level < 0.03;
  const animation = base.animation
    ? { ...base.animation, intensity: Math.min(10, (base.animation.intensity ?? 5) + Math.round(flicker * 4)) }
    : null;
  return {
    dim: (src.dim ?? 0) * k,
    bright: (src.bright ?? 0) * k,
    alpha: Math.min(1, (src.alpha ?? 0.5) * Math.min(1.6, level)),
    color: base.color ?? src.color ?? null,
    animation: linkedBase ? null : animation,
    disabled
  };
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
 * @param {object} context   { gridPx, performance, wind, glow } (wind : vent de scène ;
 *                           glow : forcer la lueur dessinée par le moteur, pour l'aperçu)
 */
export function buildConfig(emitter, preset, { gridPx = REFERENCE_GRID, performance = 1, wind = null, glow = false } = {}) {
  const g = gridPx / REFERENCE_GRID;
  const size = emitter.size ?? 1;
  const speed = emitter.speed ?? 1;
  const density = (emitter.density ?? 1) * performance;

  const colorPoints = (emitter.color && curveFromColor(emitter.color)) || preset.color || [[0, "#ffffff"]];
  const air = computeWind(emitter, preset, wind, { gridPx });

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
    // Options propres au moteur maison, pensées pour la vue du dessus
    // (retirées ou approximées pour le générateur de Foundry).
    // Les accélérations suivent le carré de la vitesse pour garder les mêmes trajectoires.
    radial: scaleRange(preset.radial ?? [0, 0], g * speed),
    swirl: scaleRange(preset.swirl ?? [0, 0], speed),
    wind: air.wind,
    gust: air.gust,
    airflow: air.airflow,
    windEffects: preset.windEffects ?? null,
    // Flamme fragile, sauf si le MJ a désactivé l'extinction sur cet émetteur
    blowout: preset.blowout && emitter.blowout !== false ? { ...preset.blowout } : null,
    // Flamme qui craint la pluie (météo), sauf si l'émetteur est abrité
    douse: preset.douse && emitter.sheltered !== true ? preset.douse : null,
    wetness: 0,
    // Gerbes : paquets de particules d'un coup (le nombre suit la densité)
    bursts: preset.bursts
      ? {
          every: preset.bursts.every ?? [1000, 1000],
          count: scaleRange(Array.isArray(preset.bursts.count) ? preset.bursts.count : [preset.bursts.count ?? 10, preset.bursts.count ?? 10], density),
          spread: preset.bursts.spread ?? 360
        }
      : null,
    glow: buildGlow(emitter, preset, gridPx, glow),
    // Réactions au monde (la zone des murs est fournie par le gestionnaire)
    disturb: emitter.tokens !== false && preset.disturb ? scaleDisturb(preset.disturb, g, speed) : null,
    darknessEffects: emitter.darkness !== false ? preset.darkness ?? null : null,
    darkness: 0,
    drag: (preset.drag ?? 0) * speed,
    height: scaleRange(preset.height ?? [0, 0], g),
    lift: scaleRange(preset.lift ?? [0, 0], g * speed),
    fall: (preset.fall ?? 0) * g * speed * speed,
    groundFade: preset.groundFade ?? null,
    perspective: 300 * g,
    gravity: {
      x: (preset.gravity?.x ?? 0) * g * speed * speed,
      y: (preset.gravity?.y ?? 0) * g * speed * speed
    },
    prewarm: Math.max(...[].concat(preset.lifetime ?? [1000])),
    gridScale: g,
    _blend: preset.blend ?? "add",
    _textures: preset.textures?.length ? preset.textures : ["glow"]
  };
}

/**
 * Lueur dessinée par le moteur : quand le MJ a choisi une lumière purement visuelle
 * (sans effet sur la vision), ou toujours dans l'aperçu (force = true).
 */
function buildGlow(emitter, preset, gridPx, force) {
  const light = lightConfig({ ...emitter, light: emitter.light === "linked" ? "off" : emitter.light }, preset);
  if (!light || (!force && light.vision)) return null;
  const cells = light.bright + (light.dim - light.bright) * 0.5;
  return { radius: Math.max(0.5, cells) * gridPx * light.scale, color: light.color, alpha: Math.min(0.6, light.alpha + 0.1), _texture: "light" };
}

/** Mise à l'échelle des effets des tokens (forces en px/s² et px/s). */
function scaleDisturb(d, g, speed) {
  return {
    push: (d.push ?? 0) * g * speed,
    wake: d.wake ?? 0,
    lift: (d.lift ?? 0) * g * speed,
    radius: d.radius ?? 1
  };
}

/** L'effet doit-il être arrêté par les murs ? */
export function blockedByWalls(emitter, preset) {
  return preset?.walls !== false && emitter.walls !== false;
}

/** Clés comprises uniquement par le moteur maison. */
const EMBER_ONLY_KEYS = [
  "radial", "swirl", "wind", "gust", "airflow", "windEffects", "blowout", "bursts", "douse", "wetness", "exclude", "glow", "disturb", "darknessEffects", "darkness", "bounds", "drag", "height", "lift", "fall",
  "groundFade", "perspective", "gravity", "prewarm", "gridScale"
];

/** Ajoute ce qui dépend de PIXI : textures et mode de fusion (PIXI 7 : nombres, PIXI 8 : chaînes). */
export function finalizeConfig(cfg, getTexture) {
  const { _blend, _textures, ...rest } = cfg;
  const modes = globalThis.PIXI?.BLEND_MODES;
  const name = ["add", "screen", "normal"].includes(_blend) ? _blend : "normal";
  rest.blend = modes ? modes[name.toUpperCase()] ?? modes.NORMAL : name;
  rest.textures = _textures.map((id) => getTexture(id));
  if (rest.glow) {
    const { _texture, ...glow } = rest.glow;
    rest.glow = { ...glow, texture: getTexture(_texture) };
  }
  return rest;
}

/**
 * Configuration pour le générateur de Foundry, qui n'a ni hauteur ni élan radial.
 * On approxime : l'élan radial élargit la vitesse aléatoire dans toutes les
 * directions, et le vent la décale. Le reste est retiré.
 */
export function toCoreConfig(cfg) {
  const out = { ...cfg };
  const r = Math.max(Math.abs(cfg.radial?.[0] ?? 0), Math.abs(cfg.radial?.[1] ?? 0)) * 0.7;
  const wx = cfg.wind?.x ?? 0;
  const wy = cfg.wind?.y ?? 0;
  if (cfg.velocity) {
    out.velocity = {
      x: [cfg.velocity.x[0] - r + wx, cfg.velocity.x[1] + r + wx],
      y: [cfg.velocity.y[0] - r + wy, cfg.velocity.y[1] + r + wy]
    };
  }
  // Réactions au vent figées à la création (pas de rafales ni de mise à jour en direct).
  const fx = cfg.windEffects;
  const a = Math.min(1.5, cfg.airflow ?? 0);
  if (fx && a > 0) {
    const m = (key) => (fx[key] === undefined ? 1 : Math.max(0.05, 1 + (fx[key] - 1) * a));
    out.count = Math.max(1, Math.round(out.count * m("count")));
    out.spawnRate = out.spawnRate * m("rate");
    if (Array.isArray(out.lifetime)) out.lifetime = out.lifetime.map((v) => v * m("life"));
    if (out.scale?.curve) out.scale = { curve: out.scale.curve.map((p) => ({ ...p, value: p.value * m("scale") })) };
    if (out.alpha?.curve) out.alpha = { curve: out.alpha.curve.map((p) => ({ ...p, value: Math.min(1, p.value * m("alpha")) })) };
  }
  for (const key of EMBER_ONLY_KEYS) delete out[key];
  return out;
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
