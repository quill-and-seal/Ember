/**
 * Groupes d'effets : plusieurs effets qui vivent ensemble sous un seul émetteur
 * (une seule poignée, une seule fenêtre de réglages, une seule lumière).
 *
 * Exemple : le feu de camp complet = flammes + braises + étincelles + fumée.
 *
 * Format d'un groupe :
 *   icon     Icône Font Awesome du sélecteur
 *   area     Zone affichée par la poignée (en cases). Par défaut, celle de la couche principale.
 *   layers   Liste de couches :
 *     preset   Effet de la couche (id d'un preset)
 *     lead     Couche principale : elle porte la lumière et l'extinction du groupe.
 *              Par défaut, la première couche qui éclaire, sinon la première.
 *     follow   La couche s'arrête quand la couche principale est soufflée par le vent
 *              (les étincelles cessent avec la flamme, la fumée continue).
 *     density  Densité relative (1 = celle de l'effet seul)
 *     size     Taille relative
 *     speed    Vitesse relative
 *     radius   Rayon relatif (1 = celui de l'effet seul)
 *     offset   Décalage { x, y } en cases depuis le centre de l'émetteur
 *     override Valeurs de l'effet remplacées pour cette couche (même format qu'un preset),
 *              par exemple des gerbes : override: { bursts: { every, count, spread } }
 *     tint     false : la couleur choisie par le MJ ne s'applique pas à cette couche
 *              (la fumée d'un feu violet reste grise)
 *
 * Réglages du MJ par effet, dans emitter.layers : { [preset]: { off, density } }
 * (toutes les bougies d'un cercle se règlent ensemble ; la couche principale ne se retire pas).
 *
 * La taille, la densité, la vitesse et le rayon de l'émetteur s'appliquent à toutes
 * les couches. Chaque couche garde ses réactions au vent, aux murs, aux tokens et à l'obscurité.
 */

import { REFERENCE_GRID } from "./constants.js";

/** Six bougies en cercle, pour le cercle rituel. */
function candleRing(n, r) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { preset: "candle", tint: false, offset: { x: Math.round(Math.sin(a) * r * 100) / 100, y: Math.round(-Math.cos(a) * r * 100) / 100 } };
  });
}

export const GROUPS = {
  bonfire: {
    icon: "fa-solid fa-campground",
    layers: [
      { preset: "campfire", lead: true },
      { preset: "embers", follow: true, density: 1 },
      { preset: "smoke", tint: false, density: 0.5, size: 1.1 }
    ]
  },

  forge: {
    icon: "fa-solid fa-hammer",
    layers: [
      { preset: "campfire", lead: true, size: 0.75, density: 1.2 },
      // Gerbes d'étincelles, comme des coups de marteau sur l'enclume
      {
        preset: "sparks",
        follow: true,
        speed: 1.25,
        override: { count: 90, lift: [120, 300], lifetime: [500, 1000], bursts: { every: [700, 1700], count: [16, 30], spread: 100 } }
      },
      { preset: "embers", follow: true, density: 0.5, radius: 0.8 },
      { preset: "smoke", tint: false, density: 0.35 }
    ]
  },

  hearth: {
    icon: "fa-solid fa-house-fire",
    layers: [
      { preset: "campfire", lead: true, size: 0.85, density: 0.8 },
      { preset: "embers", follow: true, density: 0.4, radius: 0.8 },
      { preset: "smoke", tint: false, density: 0.25, size: 0.8 }
    ]
  },

  cauldron: {
    icon: "fa-solid fa-flask",
    area: { shape: "circle", radius: 0.35 },
    layers: [
      { preset: "campfire", lead: true, tint: false, size: 0.45, density: 0.5, radius: 1.3 },
      { preset: "bubbles", density: 0.8, radius: 0.9 },
      { preset: "smoke", density: 0.35, size: 0.7 }
    ]
  },

  censer: {
    icon: "fa-solid fa-mortar-pestle",
    area: { shape: "circle", radius: 0.15 },
    layers: [
      { preset: "embers", lead: true, tint: false, size: 0.5, density: 0.25, radius: 0.4 },
      { preset: "smoke", density: 0.45, size: 0.6 }
    ]
  },

  ritual: {
    icon: "fa-solid fa-circle-nodes",
    area: { shape: "circle", radius: 1.5 },
    layers: [{ preset: "arcane", lead: true, size: 1.4, radius: 2 }, ...candleRing(6, 1.5)]
  },

  swamp: {
    icon: "fa-solid fa-frog",
    area: { shape: "circle", radius: 1.5 },
    layers: [
      { preset: "poison", lead: true, tint: false, radius: 2.5, density: 1.2, size: 1.2 },
      { preset: "bubbles", tint: false, density: 0.4, radius: 3 },
      { preset: "fireflies", density: 0.6 }
    ]
  }
};

/** Groupes ajoutés par d'autres modules ou macros via l'API. */
const CUSTOM = {};

export function getGroup(id) {
  return CUSTOM[id] ?? GROUPS[id] ?? null;
}

export function allGroups() {
  return { ...GROUPS, ...CUSTOM };
}

export function isGroup(id) {
  return !!getGroup(id);
}

/** Enregistre ou remplace un groupe personnalisé. */
export function registerGroup(id, definition) {
  if (!id || typeof id !== "string") throw new Error("Ember | registerGroup : id invalide");
  if (!Array.isArray(definition?.layers) || !definition.layers.length) throw new Error("Ember | registerGroup : il faut au moins une couche");
  CUSTOM[id] = { icon: "fa-solid fa-layer-group", ...definition };
  return CUSTOM[id];
}

/** Index de la couche principale d'un groupe. */
export function leadIndex(group, getPreset) {
  const layers = group?.layers ?? [];
  const explicit = layers.findIndex((l) => l.lead);
  if (explicit >= 0) return explicit;
  const lit = layers.findIndex((l) => getPreset(l.preset)?.light);
  return lit >= 0 ? lit : 0;
}

/** Rayon « naturel » d'une zone, en cases. */
function areaRadius(a = {}) {
  if (a.shape === "ring") return a.outer ?? 0.5;
  if (a.shape === "rect") return Math.max(a.width ?? 1, a.height ?? 1) / 2;
  return a.radius ?? 0.25;
}

/**
 * Vue « preset » d'un groupe, pour le code qui lit un preset (poignée, fenêtre, lumière) :
 * la couche principale, avec l'icône et la zone du groupe, et la liste des couches.
 * Les murs arrêtent le groupe si au moins une couche est arrêtée par les murs.
 */
export function groupAsPreset(group, getPreset) {
  const leadDef = getPreset(group.layers[leadIndex(group, getPreset)]?.preset) ?? {};
  const layerPresets = group.layers.map((l) => getPreset(l.preset)).filter(Boolean);
  const area = group.area ?? scaleArea(leadDef.area, group.layers[leadIndex(group, getPreset)]?.radius ?? 1);
  return {
    ...leadDef,
    icon: group.icon ?? leadDef.icon,
    label: group.label,
    area,
    walls: layerPresets.some((p) => p.walls !== false) ? leadDef.walls ?? true : false,
    disturb: leadDef.disturb ?? layerPresets.find((p) => p.disturb)?.disturb ?? null,
    darkness: leadDef.darkness ?? layerPresets.find((p) => p.darkness)?.darkness ?? null,
    group: true,
    layers: group.layers
  };
}

function scaleArea(area = { shape: "circle", radius: 0.25 }, k) {
  if (area.shape === "ring") return { ...area, inner: (area.inner ?? 0.3) * k, outer: (area.outer ?? 0.5) * k };
  if (area.shape === "rect") return { ...area, width: (area.width ?? 1) * k, height: (area.height ?? 1) * k };
  return { ...area, radius: (area.radius ?? 0.25) * k };
}

/**
 * Découpe un émetteur de groupe en émetteurs simples, un par couche.
 * Pour un effet simple, renvoie une seule « couche ».
 *
 * @param {object} emitter   Émetteur (complété par les valeurs par défaut)
 * @param {(id: string) => object|null} getPreset
 * @param {number} gridPx    Taille d'une case en pixels
 * @returns {Array<{index: number, emitter: object, preset: object, lead: boolean, follow: boolean, dx: number, dy: number}>}
 */
export function expandEmitter(emitter, getPreset, gridPx = REFERENCE_GRID) {
  const group = getGroup(emitter.preset);
  if (!group) {
    const preset = getPreset(emitter.preset);
    return preset ? [{ index: 0, emitter, preset, lead: true, follow: false, dx: 0, dy: 0 }] : [];
  }
  const lead = leadIndex(group, getPreset);
  const natural = areaRadius(groupAsPreset(group, getPreset).area);
  // Le rayon choisi par le MJ agrandit tout le groupe, décalages compris.
  const k = emitter.radius ? emitter.radius / natural : 1;
  const tweaks = emitter.layers ?? {};
  const out = [];
  group.layers.forEach((layer, index) => {
    const base = getPreset(layer.preset);
    if (!base) return;
    const preset = layer.override ? { ...base, ...layer.override } : base;
    // Réglages du MJ par effet (toutes les bougies d'un cercle ensemble)
    const tweak = tweaks[layer.preset] ?? {};
    const isLead = index === lead;
    // La couche principale ne se désactive pas : elle porte la lumière et l'extinction.
    if (tweak.off && !isLead) return;
    const dx = (layer.offset?.x ?? 0) * k * gridPx;
    const dy = (layer.offset?.y ?? 0) * k * gridPx;
    const radius = areaRadius(preset.area) * (layer.radius ?? 1) * k;
    out.push({
      index,
      lead: isLead,
      follow: !isLead && !!layer.follow,
      dx,
      dy,
      preset,
      emitter: {
        ...emitter,
        preset: layer.preset,
        x: emitter.x + dx,
        y: emitter.y + dy,
        radius: Math.max(0.01, radius),
        size: (emitter.size ?? 1) * (layer.size ?? 1),
        density: (emitter.density ?? 1) * (layer.density ?? 1) * (tweak.density ?? 1),
        speed: (emitter.speed ?? 1) * (layer.speed ?? 1),
        color: layer.tint === false ? null : emitter.color,
        // Une seule lumière par groupe : celle de la couche principale
        light: isLead ? emitter.light : "off",
        layers: undefined
      }
    });
  });
  return out;
}
