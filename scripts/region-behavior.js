/**
 * Comportement de Région « Effet Ember » : une Région de Foundry (dessinée avec ses propres outils)
 * se remplit d'un effet Ember. Le comportement se règle dans la fenêtre de la Région ; rien n'est
 * stocké dans les flags d'Ember, la Région est la source.
 *
 * Le type est déclaré dans module.json (documentTypes.RegionBehavior.effect) : son nom complet
 * est « ember-particles.effect ».
 */

import { MODULE_ID, EMITTER_DEFAULTS, warn } from "./constants.js";
import { allPresets, getPreset, presetLabel } from "./presets.js";
import { allGroups } from "./groups.js";
import { zoneAllowed, shapeFromPoints, polygonArea } from "./zones.js";

export const BEHAVIOR_TYPE = `${MODULE_ID}.effect`;

/** Effets proposés dans la liste : ceux qui peuvent remplir une zone, puis les groupes. */
function zoneChoices() {
  const out = {};
  for (const id of [...Object.keys(allPresets()), ...Object.keys(allGroups())]) {
    if (zoneAllowed(id, getPreset(id))) out[id] = presetLabel(id);
  }
  return out;
}

/** Déclare le comportement auprès de Foundry (hook « init »). Sans l'API des Régions, ne fait rien. */
export function registerRegionBehavior() {
  const Base = foundry.data?.regionBehaviors?.RegionBehaviorType;
  const fields = foundry.data?.fields;
  if (!Base || !fields || !CONFIG.RegionBehavior) return false;
  try {
    class EmberEffectBehavior extends Base {
      static LOCALIZATION_PREFIXES = ["EMBER.RegionBehavior"];

      static defineSchema() {
        return {
          preset: new fields.StringField({ required: true, blank: false, initial: "poison", choices: zoneChoices }),
          density: new fields.NumberField({ required: true, initial: 1, min: 0.1, max: 3, step: 0.05 }),
          size: new fields.NumberField({ required: true, initial: 1, min: 0.25, max: 4, step: 0.05 }),
          speed: new fields.NumberField({ required: true, initial: 1, min: 0.25, max: 3, step: 0.05 }),
          color: new fields.ColorField({ required: false, nullable: true, initial: null }),
          hidden: new fields.BooleanField({ initial: false })
        };
      }

      /** Aucun événement à écouter : l'effet est simplement affiché tant que le comportement est actif. */
      static events = {};
    }
    CONFIG.RegionBehavior.dataModels[BEHAVIOR_TYPE] = EmberEffectBehavior;
    if (CONFIG.RegionBehavior.typeIcons) CONFIG.RegionBehavior.typeIcons[BEHAVIOR_TYPE] = "fa-solid fa-fire-flame-curved";
    return true;
  } catch (err) {
    warn("Comportement de Région « Effet Ember » indisponible", err);
    return false;
  }
}

/** Plus grand polygone d'une Région (ses trous et ses petites parties sont ignorés). */
function mainPolygon(region) {
  const polygons = region.polygons ?? region.object?.polygons ?? [];
  let best = null;
  let bestArea = 0;
  for (const poly of polygons) {
    const pts = poly?.points;
    if (!pts || pts.length < 6 || poly.isPositive === false) continue;
    const a = polygonArea(pts);
    if (a > bestArea) {
      best = pts;
      bestArea = a;
    }
  }
  return best;
}

/**
 * Émetteurs « virtuels » tirés des Régions qui ont un comportement Effet Ember actif.
 * Leur id commence par « region. » : ils ne sont jamais écrits dans les flags.
 */
export function regionEmitters(scene = canvas.scene) {
  const out = {};
  for (const region of scene?.regions ?? []) {
    const behaviors = region.behaviors?.contents ?? [...(region.behaviors ?? [])];
    for (const b of behaviors) {
      if (b.type !== BEHAVIOR_TYPE || b.disabled) continue;
      const pts = mainPolygon(region);
      if (!pts) continue;
      const s = b.system ?? {};
      const bottom = Number(region.elevation?.bottom);
      const id = `region.${region.id}.${b.id}`;
      out[id] = {
        ...EMITTER_DEFAULTS,
        ...shapeFromPoints([...pts]),
        id,
        label: region.name ?? "",
        preset: s.preset ?? "poison",
        density: s.density ?? 1,
        size: s.size ?? 1,
        speed: s.speed ?? 1,
        color: s.color ? String(s.color) : null,
        hidden: !!s.hidden,
        elevation: Number.isFinite(bottom) ? bottom : 0,
        light: "off",
        fromRegion: true
      };
    }
  }
  return out;
}
