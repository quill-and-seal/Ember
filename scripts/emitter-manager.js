/**
 * Gestion des émetteurs : lecture/écriture dans les flags de la scène et
 * création des générateurs de particules correspondants sur chaque client,
 * avec le moteur maison ou le générateur intégré à Foundry.
 *
 * Les émetteurs vivent dans scene.flags["ember-particles"].emitters.
 * Quand le MJ modifie la scène, Foundry diffuse la mise à jour à tous les
 * clients, et chacun reconstruit ses générateurs : pas besoin de socket.
 */

import { MODULE_ID, FLAG_EMITTERS, FLAG_WIND, EMITTER_DEFAULTS, WIND_DEFAULTS, LAYER_NAME, warn, t } from "./constants.js";
import { getPreset } from "./presets.js";
import { buildConfig, buildArea, computeWind, finalizeConfig, fallbackConfigs, toCoreConfig } from "./adapter.js";
import { getParticleTexture } from "./textures.js";
import { EmberParticleSystem } from "./engine/particle-system.js";
import { createSceneContainer, canvasTicker } from "./engine/placement.js";
import { spawnPuff } from "./engine/puff.js";
import { LightController } from "./light-controller.js";

export class EmitterManager {
  /** @type {Map<string, {generator: object, signature: string}>} */
  #active = new Map();

  #warnedMissingApi = false;

  /** Lumières liées aux émetteurs (moteur maison uniquement). */
  lights = new LightController();

  /* -------------------------------------------- */
  /*  Lecture                                     */
  /* -------------------------------------------- */

  /** Émetteurs d'une scène, complétés par les valeurs par défaut. */
  getEmitters(scene = canvas.scene) {
    const raw = scene?.getFlag(MODULE_ID, FLAG_EMITTERS) ?? {};
    const out = {};
    for (const [id, data] of Object.entries(raw)) {
      if (!data) continue;
      out[id] = { ...EMITTER_DEFAULTS, ...data, id };
    }
    return out;
  }

  getEmitter(id, scene = canvas.scene) {
    return this.getEmitters(scene)[id] ?? null;
  }

  /** Vent de la scène, complété par les valeurs par défaut. */
  getWind(scene = canvas.scene) {
    return { ...WIND_DEFAULTS, ...(scene?.getFlag(MODULE_ID, FLAG_WIND) ?? {}) };
  }

  /** Générateur actif d'un émetteur (pour les macros et le débogage). */
  getGenerator(id) {
    return this.#active.get(id)?.generator ?? null;
  }

  /* -------------------------------------------- */
  /*  Écriture (MJ uniquement)                    */
  /* -------------------------------------------- */

  #assertGM() {
    if (!game.user.isGM) throw new Error(t("Error.GMOnly"));
  }

  async create(data = {}, scene = canvas.scene) {
    this.#assertGM();
    const id = foundry.utils.randomID();
    const emitter = { ...EMITTER_DEFAULTS, ...data };
    delete emitter.id;
    await scene.setFlag(MODULE_ID, `${FLAG_EMITTERS}.${id}`, emitter);
    return { ...emitter, id };
  }

  async update(id, changes, scene = canvas.scene) {
    this.#assertGM();
    const current = this.getEmitter(id, scene);
    if (!current) return null;
    const next = { ...current, ...changes };
    delete next.id;
    await scene.setFlag(MODULE_ID, `${FLAG_EMITTERS}.${id}`, next);
    return { ...next, id };
  }

  async delete(id, scene = canvas.scene) {
    this.#assertGM();
    await scene.unsetFlag(MODULE_ID, `${FLAG_EMITTERS}.${id}`);
  }

  /** Modifie le vent de la scène (fusionné avec le vent actuel). */
  async setWind(changes, scene = canvas.scene) {
    this.#assertGM();
    const next = { ...this.getWind(scene), ...changes };
    await scene.setFlag(MODULE_ID, FLAG_WIND, next);
    return next;
  }

  async deleteAll(scene = canvas.scene) {
    this.#assertGM();
    await scene.unsetFlag(MODULE_ID, FLAG_EMITTERS);
  }

  /* -------------------------------------------- */
  /*  Rendu                                       */
  /* -------------------------------------------- */

  /** Facteur de performance choisi par chaque joueur dans ses réglages. */
  get performance() {
    try {
      return game.settings.get(MODULE_ID, "performance") ?? 1;
    } catch {
      return 1;
    }
  }

  /** Moteur de rendu choisi par le MJ : "ember" (maison) ou "core" (Foundry). */
  get engine() {
    try {
      return game.settings.get(MODULE_ID, "engine") ?? "ember";
    } catch {
      return "ember";
    }
  }

  /** Doit-on afficher cet émetteur pour l'utilisateur courant ? */
  #isVisible(emitter) {
    if (!emitter.enabled) return false;
    if (emitter.hidden && !game.user.isGM) return false;
    return !!getPreset(emitter.preset);
  }

  /**
   * Signature des réglages qui imposent de recréer l'effet (le libellé n'en fait pas partie).
   * Avec le moteur maison, le vent s'applique en direct : il n'en fait pas partie non plus.
   * Le générateur de Foundry intègre le vent à ses vitesses : il faut le recréer.
   */
  #signature(emitter) {
    // Les réglages de lumière n'imposent de recréer l'effet que pour la lueur dessinée par le moteur.
    const { label, id, light, lightLink, lightScale, lightVision, ...rest } = emitter;
    if (light === "auto" && lightVision === false) Object.assign(rest, { light, lightScale, lightVision });
    const wind = this.engine === "core" ? this.getWind() : null;
    return JSON.stringify([rest, this.performance, this.engine, canvas.dimensions?.size, wind]);
  }

  /** Applique le vent de scène en direct aux effets du moteur maison. */
  #applyWind(emitters) {
    const sceneWind = this.getWind();
    for (const [id, entry] of this.#active) {
      const emitter = emitters[id];
      if (!emitter || typeof entry.generator.setWind !== "function") continue;
      const { wind, gust, airflow } = computeWind(emitter, getPreset(emitter.preset), sceneWind, { gridPx: canvas.dimensions.size });
      entry.generator.setWind(wind, gust, airflow);
    }
  }

  /** Aligne les générateurs actifs sur les émetteurs de la scène affichée. */
  sync() {
    if (!canvas.ready || !canvas.scene) return;
    const emitters = this.getEmitters();

    for (const [id, entry] of this.#active) {
      const emitter = emitters[id];
      if (!emitter || !this.#isVisible(emitter) || entry.signature !== this.#signature(emitter)) {
        this.#destroy(id);
      }
    }

    for (const emitter of Object.values(emitters)) {
      if (!this.#isVisible(emitter) || this.#active.has(emitter.id)) continue;
      const generator = this.#spawn(emitter);
      if (generator) this.#active.set(emitter.id, { generator, signature: this.#signature(emitter) });
    }

    this.#applyWind(emitters);
    this.lights.sync(this.#lightEntries(emitters));
    canvas[LAYER_NAME]?.refreshHandles?.();
  }

  /** Effets du moteur maison qui peuvent porter une lumière. */
  #lightEntries(emitters) {
    const entries = [];
    for (const [id, entry] of this.#active) {
      const emitter = emitters[id];
      if (!emitter || typeof entry.generator.getLight !== "function") continue;
      entries.push({ emitter, preset: getPreset(emitter.preset), system: entry.generator });
    }
    return entries;
  }

  /** Arrête tous les générateurs et leurs lumières (changement de scène, désactivation). */
  clear() {
    this.lights.clear();
    for (const id of [...this.#active.keys()]) this.#destroy(id);
  }

  /** Déplace un émetteur en direct pendant un glisser-déposer, sans écrire en base. */
  moveLive(id, x, y) {
    const entry = this.#active.get(id);
    const emitter = this.getEmitter(id);
    if (!entry || !emitter) return;
    const preset = getPreset(emitter.preset);
    const area = buildArea(preset.area, x, y, canvas.dimensions.size, emitter.radius);
    try {
      const target = entry.generator.spawnArea;
      if (target && typeof target === "object") {
        target.x = area.x;
        target.y = area.y;
      }
    } catch (err) {
      // Pas grave : la position sera appliquée en relâchant la souris.
    }
  }

  #destroy(id) {
    const entry = this.#active.get(id);
    this.#active.delete(id);
    try {
      entry?.generator?.stop({ hard: true });
    } catch (err) {
      warn("Arrêt du générateur impossible", err);
    }
  }

  /** Crée et démarre le générateur d'un émetteur avec le moteur choisi par le MJ. */
  #spawn(emitter) {
    const preset = getPreset(emitter.preset);
    const base = buildConfig(emitter, preset, {
      gridPx: canvas.dimensions.size,
      performance: this.performance,
      wind: this.getWind()
    });
    const finalized = finalizeConfig(base, getParticleTexture);
    return this.engine === "core" ? this.#spawnCore(emitter, finalized) : this.#spawnEmber(emitter, finalized);
  }

  /** Moteur maison. */
  #spawnEmber(emitter, cfg) {
    let system;
    try {
      system = new EmberParticleSystem(cfg, {
        container: createSceneContainer(cfg.elevation),
        ticker: canvasTicker(),
        // Heure du serveur : les rafales (et donc les extinctions) tombent au même moment pour tous
        clock: () => game.time?.serverTime ?? Date.now(),
        onExtinguish: ({ x, y }) =>
          spawnPuff({
            container: createSceneContainer(cfg.elevation),
            ticker: canvasTicker(),
            x,
            y,
            getTexture: getParticleTexture,
            gridScale: cfg.gridScale,
            wind: system?.config.wind,
            size: emitter.size ?? 1
          })
      });
      system.start();
      return system;
    } catch (err) {
      warn(`Impossible de créer l'émetteur ${emitter.id} (moteur maison)`, err);
      try {
        system?.stop({ hard: true });
      } catch {
        /* ignoré */
      }
      return null;
    }
  }

  /** Générateur intégré à Foundry v14, avec configurations de repli. */
  #spawnCore(emitter, finalized) {
    // Le générateur de Foundry ne sait pas s'éteindre en direct : une flamme fragile
    // dans un vent trop fort n'est simplement pas créée (elle revient quand le vent change).
    if (finalized.blowout && (finalized.airflow ?? 0) >= finalized.blowout.threshold) return null;

    const Generator = foundry.canvas?.animation?.ParticleGenerator;
    if (!Generator) {
      if (!this.#warnedMissingApi) {
        this.#warnedMissingApi = true;
        ui.notifications.error(t("Error.NoParticleApi"));
      }
      return null;
    }

    let lastError;
    const attempts = fallbackConfigs(toCoreConfig(finalized));
    for (let level = 0; level < attempts.length; level++) {
      let generator;
      try {
        generator = new Generator(attempts[level]);
        generator.start();
        if (level > 0) warn(`Émetteur ${emitter.id} : configuration simplifiée (niveau ${level}).`, lastError);
        return generator;
      } catch (err) {
        lastError = err;
        try {
          generator?.stop({ hard: true });
        } catch {
          /* ignoré */
        }
      }
    }
    warn(`Impossible de créer l'émetteur ${emitter.id}`, lastError);
    return null;
  }
}
