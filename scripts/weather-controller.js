/**
 * Météo dans Foundry (moteur Ember uniquement) :
 *   - lecture/écriture de la météo dans les flags de la scène (le MJ la règle, tout le monde la voit) ;
 *   - intérieurs : les Régions qui ont le comportement « Supprimer la météo » restent à l'abri
 *     (pas de pluie, pas de voile, et les feux qui s'y trouvent ne sont pas mouillés) ;
 *   - éclairs : flash à l'écran et, brièvement, une vraie lumière sur toute la scène.
 *     Chaque joueur peut couper le flash dans ses réglages (sensibilité aux lumières clignotantes).
 */

import { MODULE_ID, FLAG_WEATHER, warn } from "./constants.js";
import { WEATHER_DEFAULTS } from "./weather-presets.js";
import { WeatherSystem, seedFrom } from "./engine/weather.js";
import { createSceneContainer, canvasTicker } from "./engine/placement.js";
import { getParticleTexture } from "./textures.js";

/** Élévation du conteneur de météo : au-dessus des tokens et des toits. */
const WEATHER_ELEVATION = 100000;

/** Seuils d'allumage et d'extinction de la lumière d'éclair (évite de recalculer la vision à chaque image). */
const FLASH_ON = 0.2;
const FLASH_OFF = 0.05;

export class WeatherController {
  /** @param {import("./emitter-manager.js").EmitterManager} manager */
  constructor(manager) {
    this.manager = manager;
    this.system = null;
    this.exclude = null;
    this.#signature = null;
  }

  #signature;
  #light = null;
  #lightOn = false;
  #lightBroken = false;

  /* -------------------------------------------- */
  /*  Données                                     */
  /* -------------------------------------------- */

  getWeather(scene = canvas.scene) {
    return { ...WEATHER_DEFAULTS, ...(scene?.getFlag(MODULE_ID, FLAG_WEATHER) ?? {}) };
  }

  async setWeather(changes, scene = canvas.scene) {
    if (!game.user.isGM) throw new Error(game.i18n.localize("EMBER.Error.GMOnly"));
    const next = { ...this.getWeather(scene), ...changes };
    await scene.setFlag(MODULE_ID, FLAG_WEATHER, next);
    return next;
  }

  /** Le flash des éclairs est-il activé pour ce joueur ? */
  get flashEnabled() {
    try {
      return game.settings.get(MODULE_ID, "weatherFlash") !== false;
    } catch {
      return true;
    }
  }

  /* -------------------------------------------- */
  /*  Rendu                                       */
  /* -------------------------------------------- */

  /** Aligne la météo affichée sur celle de la scène. */
  sync() {
    if (!canvas.ready || !canvas.scene) return;
    const weather = this.getWeather();
    const active = this.manager.engine === "ember" && (weather.kind !== "none" || weather.fog > 0);
    if (!active) {
      // Fondu de sortie si la météo tournait déjà ; rien à créer sinon
      if (this.system) this.system.setWeather({ kind: "none", fog: 0 });
      if (this.manager.engine !== "ember") this.clear();
      return;
    }

    const signature = JSON.stringify([canvas.scene.id, this.manager.performance, canvas.dimensions?.size, this.flashEnabled]);
    if (this.system && signature !== this.#signature) this.clear();
    const fresh = !this.system;
    if (fresh) {
      this.#signature = signature;
      this.system = new WeatherSystem({
        createContainer: () => createSceneContainer(WEATHER_ELEVATION),
        getView: () => this.#view(),
        getTexture: getParticleTexture,
        ticker: canvasTicker(),
        gridPx: canvas.dimensions.size,
        performance: this.manager.performance,
        clock: () => game.time?.serverTime ?? Date.now(),
        seed: seedFrom(canvas.scene.id),
        flashOverlay: this.flashEnabled,
        onFlash: (level) => this.#onFlash(level)
      });
      this.system.start();
      this.refreshRegions();
    }
    this.system.setWind(this.manager.getWind());
    // En arrivant sur une scène où il pleut déjà, pas de fondu
    this.system.setWeather(weather, { instant: fresh });
  }

  /** Partie visible de la scène et rectangle de la scène, en coordonnées de scène. */
  #view() {
    const d = canvas.dimensions;
    const scene = d.sceneRect ?? { x: 0, y: 0, width: d.width, height: d.height };
    const screen = canvas.app.renderer.screen;
    const ref = this.system?.root ?? canvas.stage;
    const tl = ref.toLocal(new PIXI.Point(0, 0));
    const br = ref.toLocal(new PIXI.Point(screen.width, screen.height));
    return { view: { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y }, scene };
  }

  /** Arrête la météo (changement de scène, passage au générateur de Foundry). */
  clear() {
    this.system?.stop();
    this.system = null;
    this.#signature = null;
    this.#setLight(false);
  }

  /* -------------------------------------------- */
  /*  Intérieurs                                  */
  /* -------------------------------------------- */

  /** Les régions ont changé : on recalcule les intérieurs. */
  refreshRegions() {
    const shelters = [];
    for (const region of canvas.scene?.regions ?? []) {
      const behaviors = region.behaviors?.contents ?? [...(region.behaviors ?? [])];
      if (!behaviors.some((b) => b.type === "suppressWeather" && !b.disabled)) continue;
      shelters.push(region);
    }
    const holes = [];
    const tests = [];
    for (const region of shelters) {
      try {
        const polygons = region.polygons ?? region.object?.polygons ?? [];
        for (const poly of polygons) if (poly?.points?.length >= 6 && !poly.isHole) holes.push([...poly.points]);
        const tree = region.polygonTree;
        if (tree?.testPoint) tests.push((x, y) => tree.testPoint({ x, y }));
        else tests.push((x, y) => polygons.some((p) => p.contains(x, y)));
      } catch (err) {
        warn("Région ignorée pour la météo", err);
      }
    }
    this.exclude = tests.length ? { contains: (x, y) => tests.some((fn) => fn(x, y)) } : null;
    this.system?.setExclude(this.exclude, holes);
  }

  /** Pluie reçue en un point de la scène (0 = à l'abri ou temps sec). */
  wetnessAt(x, y) {
    if (!this.system) return 0;
    if (this.exclude?.contains(x, y)) return 0;
    return this.system.wetness();
  }

  /* -------------------------------------------- */
  /*  Éclairs                                     */
  /* -------------------------------------------- */

  #onFlash(level) {
    if (!this.flashEnabled) return;
    if (!this.#lightOn && level >= FLASH_ON) this.#setLight(true);
    else if (this.#lightOn && level <= FLASH_OFF) this.#setLight(false);
  }

  /** Lumière d'éclair : toute la scène éclairée un instant, murs ignorés. */
  #setLight(on) {
    if (this.#lightBroken || on === this.#lightOn) return;
    this.#lightOn = on;
    const Source = foundry.canvas?.sources?.PointLightSource;
    if (!Source || !canvas.effects?.lightSources) return;
    try {
      if (!on) {
        this.#light?.destroy?.();
        this.#light = null;
      } else {
        const d = canvas.dimensions;
        const r = d.sceneRect ?? { x: 0, y: 0, width: d.width, height: d.height };
        // Rayon en pixels (unité des sources de lumière de Foundry)
        const radius = Math.hypot(r.width, r.height) / 2;
        const data = {
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          elevation: WEATHER_ELEVATION,
          dim: radius,
          bright: radius,
          color: 0xdde6ff,
          alpha: 0.7,
          walls: false,
          vision: false,
          disabled: false
        };
        if (canvas.level?.id) data.level = canvas.level.id;
        this.#light = new Source({ object: null, sourceId: `${MODULE_ID}.lightning` });
        this.#light.initialize(data);
        this.#light.add();
      }
      canvas.perception?.update?.({ refreshLighting: true, refreshVision: true });
    } catch (err) {
      this.#lightBroken = true;
      warn("Lumière des éclairs désactivée", err);
    }
  }

  /** Foundry a réinitialisé ses lumières pendant un éclair : on le termine. */
  onInitializeLightSources() {
    if (this.#lightOn) {
      this.#lightOn = false;
      this.#light = null;
    }
  }
}
