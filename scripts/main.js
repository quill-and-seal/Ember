/**
 * Ember — effets de particules pour Foundry VTT v14.
 * Point d'entrée : réglages, calque, contrôles de scène, hooks et API publique.
 */

import { MODULE_ID, LAYER_NAME, FLAG_EMITTERS, log, t } from "./constants.js";
import { PRESETS, allPresets, getPreset, registerPreset } from "./presets.js";
import { EmitterManager } from "./emitter-manager.js";
import { createEmberLayerClass } from "./emitter-layer.js";
import { EmitterList, PresetPicker, WindConfig, openApps, openEmitterConfig } from "./apps.js";

const manager = new EmitterManager();

/* -------------------------------------------- */
/*  Initialisation                              */
/* -------------------------------------------- */

Hooks.once("init", () => {
  log("Initialisation");

  game.settings.register(MODULE_ID, "currentPreset", {
    scope: "client",
    config: false,
    type: String,
    default: "campfire"
  });

  game.settings.register(MODULE_ID, "engine", {
    name: "EMBER.Settings.Engine.Name",
    hint: "EMBER.Settings.Engine.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      ember: "EMBER.Settings.Engine.Ember",
      core: "EMBER.Settings.Engine.Core"
    },
    default: "ember",
    onChange: () => {
      manager.clear();
      manager.sync();
    }
  });

  game.settings.register(MODULE_ID, "performance", {
    name: "EMBER.Settings.Performance.Name",
    hint: "EMBER.Settings.Performance.Hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0.1, max: 1, step: 0.05 },
    default: 1,
    onChange: () => {
      manager.clear();
      manager.sync();
    }
  });

  CONFIG.Canvas.layers[LAYER_NAME] = {
    layerClass: createEmberLayerClass({
      manager,
      openConfig: (id) => openEmitterConfig(id, manager)
    }),
    group: "interface"
  };

  // API publique : game.modules.get("ember-particles").api
  game.modules.get(MODULE_ID).api = {
    presets: PRESETS,
    allPresets,
    getPreset,
    registerPreset,
    getEmitters: (scene) => manager.getEmitters(scene),
    createEmitter: (data, scene) => manager.create(data, scene),
    updateEmitter: (id, changes, scene) => manager.update(id, changes, scene),
    deleteEmitter: (id, scene) => manager.delete(id, scene),
    getGenerator: (id) => manager.getGenerator(id),
    getWind: (scene) => manager.getWind(scene),
    setWind: (changes, scene) => manager.setWind(changes, scene),
    openWind: () => new WindConfig(manager).render({ force: true }),
    openPicker: () => new PresetPicker().render({ force: true }),
    openList: () => new EmitterList(manager).render({ force: true })
  };
});

/* -------------------------------------------- */
/*  Contrôles de scène (barre de gauche)        */
/* -------------------------------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;

  const button = (fn) => ({ button: true, onChange: fn, onClick: fn });

  const tools = {
    place: {
      name: "place",
      title: "EMBER.Controls.Place",
      icon: "fa-solid fa-location-crosshairs",
      order: 1
    },
    picker: {
      name: "picker",
      title: "EMBER.Controls.Picker",
      icon: "fa-solid fa-palette",
      order: 2,
      ...button(() => new PresetPicker().render({ force: true }))
    },
    list: {
      name: "list",
      title: "EMBER.Controls.List",
      icon: "fa-solid fa-list",
      order: 3,
      ...button(() => new EmitterList(manager).render({ force: true }))
    },
    wind: {
      name: "wind",
      title: "EMBER.Controls.Wind",
      icon: "fa-solid fa-wind",
      order: 4,
      ...button(() => new WindConfig(manager).render({ force: true }))
    },
    clear: {
      name: "clear",
      title: "EMBER.Controls.Clear",
      icon: "fa-solid fa-trash",
      order: 5,
      ...button(async () => {
        const ok = await foundry.applications.api.DialogV2.confirm({
          window: { title: t("Controls.Clear") },
          content: `<p>${t("Controls.ClearConfirm")}</p>`
        });
        if (ok) await manager.deleteAll();
      })
    }
  };

  const control = {
    name: "ember",
    title: "EMBER.Controls.Group",
    icon: "fa-solid fa-fire-flame-curved",
    layer: LAYER_NAME,
    visible: game.user.isGM,
    activeTool: "place"
  };

  // v13+ : objets indexés par nom. Ancien format (tableaux) gardé par sécurité.
  if (Array.isArray(controls)) {
    controls.push({ ...control, tools: Object.values(tools) });
  } else {
    controls.ember = { ...control, order: Object.keys(controls).length, tools };
  }
});

/* -------------------------------------------- */
/*  Synchronisation avec la scène               */
/* -------------------------------------------- */

function refreshOpenApps() {
  for (const app of openApps) app.onEmittersChanged?.();
}

Hooks.on("canvasReady", () => {
  manager.sync();
  refreshOpenApps();
});

Hooks.on("canvasTearDown", () => manager.clear());

// Foundry réinitialise ses lumières (mur modifié, lumière ajoutée…) : on remet les nôtres.
Hooks.on("initializeLightSources", () => manager.lights.onInitializeLightSources());

Hooks.on("updateScene", (scene, changes) => {
  if (scene.id !== canvas.scene?.id) return;
  const flagChanged = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) || foundry.utils.hasProperty(changes, `flags.-=${MODULE_ID}`);
  const gridChanged = foundry.utils.hasProperty(changes, "grid");
  if (!flagChanged && !gridChanged) return;
  manager.sync();
  refreshOpenApps();
});

Hooks.once("ready", () => {
  log(`Prêt — ${Object.keys(allPresets()).length} presets, flag « ${FLAG_EMITTERS} ».`);
});
