/**
 * Ember — effets de particules pour Foundry VTT v14.
 * Point d'entrée : réglages, calque, contrôles de scène, hooks et API publique.
 */

import { MODULE_ID, LAYER_NAME, FLAG_EMITTERS, log, t } from "./constants.js";
import { PRESETS, allPresets, getPreset, registerPreset } from "./presets.js";
import { GROUPS, allGroups, getGroup, registerGroup } from "./groups.js";
import { EmitterManager } from "./emitter-manager.js";
import { createEmberLayerClass } from "./emitter-layer.js";
import { EmitterConfig, EmitterList, PresetPicker, WeatherConfig, openApps, openEmitterConfig } from "./apps.js";
import { WEATHER_TYPES, WEATHER_AMBIANCES } from "./weather-presets.js";

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

  game.settings.register(MODULE_ID, "weatherFlash", {
    name: "EMBER.Settings.WeatherFlash.Name",
    hint: "EMBER.Settings.WeatherFlash.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      manager.weather.clear();
      manager.sync();
    }
  });

  CONFIG.Canvas.layers[LAYER_NAME] = {
    layerClass: createEmberLayerClass({
      manager,
      openConfig: (id) => openEmitterConfig(id, manager),
      // Émetteur dont la fenêtre est ouverte : contour plein autour de sa zone
      isOpen: (id) => [...openApps].some((app) => app instanceof EmitterConfig && app.emitterId === id)
    }),
    group: "interface"
  };

  // API publique : game.modules.get("ember-particles").api
  game.modules.get(MODULE_ID).api = {
    presets: PRESETS,
    allPresets,
    getPreset,
    registerPreset,
    groups: GROUPS,
    allGroups,
    getGroup,
    registerGroup,
    getEmitters: (scene) => manager.getEmitters(scene),
    createEmitter: (data, scene) => manager.create(data, scene),
    updateEmitter: (id, changes, scene) => manager.update(id, changes, scene),
    deleteEmitter: (id, scene) => manager.delete(id, scene),
    getGenerator: (id) => manager.getGenerator(id),
    getGenerators: (id) => manager.getGenerators(id),
    getWind: (scene) => manager.getWind(scene),
    setWind: (changes, scene) => manager.setWind(changes, scene),
    weatherTypes: WEATHER_TYPES,
    weatherAmbiances: WEATHER_AMBIANCES,
    getWeather: (scene) => manager.weather.getWeather(scene),
    setWeather: (changes, scene) => manager.weather.setWeather(changes, scene),
    applyAmbiance: (id, scene) => applyAmbiance(id, scene),
    openWeather: () => new WeatherConfig(manager).render({ force: true }),
    openWind: () => new WeatherConfig(manager).render({ force: true }),
    openPicker: () => new PresetPicker().render({ force: true }),
    openList: () => new EmitterList(manager).render({ force: true })
  };
});

/* -------------------------------------------- */
/*  Contrôles de scène (barre de gauche)        */
/* -------------------------------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;

  // v13+ : onChange (onClick est déprécié et provoquait un avertissement)
  const button = (fn) => ({ button: true, onChange: fn });

  const tools = {
    select: {
      name: "select",
      title: "EMBER.Controls.Select",
      icon: "fa-solid fa-arrow-pointer",
      order: 0
    },
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
    weather: {
      name: "weather",
      title: "EMBER.Controls.Weather",
      icon: "fa-solid fa-cloud-sun-rain",
      order: 4,
      ...button(() => new WeatherConfig(manager).render({ force: true }))
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
    activeTool: "select"
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
Hooks.on("initializeLightSources", () => {
  manager.lights.onInitializeLightSources();
  manager.weather.onInitializeLightSources();
});

// Régions « Supprimer la météo » : les intérieurs restent à l'abri de la pluie
let regionsTimer = null;
const onRegionChange = (doc) => {
  const scene = doc.parent?.documentName === "Scene" ? doc.parent : doc.parent?.parent;
  if (scene?.id !== canvas.scene?.id) return;
  clearTimeout(regionsTimer);
  regionsTimer = setTimeout(() => manager.refreshRegions(), 50);
};
for (const hook of ["createRegion", "updateRegion", "deleteRegion", "createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior"]) {
  Hooks.on(hook, onRegionChange);
}

// Murs posés, déplacés, supprimés, portes ouvertes ou fermées : la fumée suit
// (petit délai : Foundry met d'abord à jour ses arêtes de collision)
let wallsTimer = null;
for (const hook of ["createWall", "updateWall", "deleteWall"]) {
  Hooks.on(hook, (wall) => {
    if (wall.parent?.id !== canvas.scene?.id) return;
    clearTimeout(wallsTimer);
    wallsTimer = setTimeout(() => manager.refreshWalls(), 50);
  });
}

Hooks.on("updateScene", (scene, changes) => {
  if (scene.id !== canvas.scene?.id) return;
  const flagChanged = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) || foundry.utils.hasProperty(changes, `flags.-=${MODULE_ID}`);
  const gridChanged = foundry.utils.hasProperty(changes, "grid");
  if (!flagChanged && !gridChanged) return;
  manager.sync();
  refreshOpenApps();
});

/** Applique une ambiance toute prête : météo et vent (la direction du vent est gardée). */
async function applyAmbiance(id, scene = canvas.scene) {
  const amb = WEATHER_AMBIANCES[id];
  if (!amb) throw new Error(`Ember | ambiance inconnue : ${id}`);
  await manager.weather.setWeather(amb.weather, scene);
  await manager.setWind(amb.wind, scene);
}

Hooks.once("ready", () => {
  log(`Prêt — ${Object.keys(allPresets()).length} effets, ${Object.keys(allGroups()).length} groupes, flag « ${FLAG_EMITTERS} ».`);
  if (game.user.isGM && game.settings.get(MODULE_ID, "engine") === "core") {
    ui.notifications.warn(t("Engine.ActiveWarning"));
  }
});

/* -------------------------------------------- */
/*  Avertissement au passage au générateur      */
/* -------------------------------------------- */

/** Ce que perd un émetteur avec le générateur de Foundry (affiché dans l'avertissement). */
const CORE_LOSSES = ["Height", "Wind", "Blowout", "Light", "World", "Weather"];

/**
 * Dans les réglages du module, choisir « Foundry » ouvre un avertissement.
 * Si le MJ annule, la liste revient sur le moteur Ember avant l'enregistrement.
 */
Hooks.on("renderSettingsConfig", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const select = root?.querySelector(`select[name="${MODULE_ID}.engine"]`);
  if (!select || select.dataset.emberWarn) return;
  select.dataset.emberWarn = "1";

  const note = document.createElement("p");
  note.className = "notes ember-engine-note";
  note.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${t("Engine.Note")}`;
  const group = select.closest(".form-group");
  group?.append(note);
  const showNote = () => (note.hidden = select.value !== "core");
  showNote();

  let previous = select.value;
  select.addEventListener("change", async () => {
    if (select.value !== "core") {
      previous = select.value;
      return showNote();
    }
    const items = CORE_LOSSES.map((k) => `<li>${t(`Engine.Lose.${k}`)}</li>`).join("");
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Engine.WarnTitle"), icon: "fa-solid fa-triangle-exclamation" },
      content: `<p>${t("Engine.WarnIntro")}</p><ul>${items}</ul><p>${t("Engine.WarnOutro")}</p>`,
      yes: { label: t("Engine.WarnYes") },
      no: { label: t("Engine.WarnNo"), default: true }
    });
    if (!ok) select.value = previous;
    else previous = "core";
    showNote();
  });
});
