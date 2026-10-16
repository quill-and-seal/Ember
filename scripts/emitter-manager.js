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
import { getPreset, getEffect } from "./presets.js";
import { expandEmitter } from "./groups.js";
import { buildConfig, buildArea, computeWind, finalizeConfig, fallbackConfigs, toCoreConfig } from "./adapter.js";
import { getParticleTexture } from "./textures.js";
import { EmberParticleSystem } from "./engine/particle-system.js";
import { createSceneContainer, canvasTicker } from "./engine/placement.js";
import { spawnPuff } from "./engine/puff.js";
import { LightController } from "./light-controller.js";
import { TokenTracker, computeWallBounds, sceneDarkness } from "./world.js";
import { blockedByWalls, presetRadius } from "./adapter.js";

/** Intervalle de relecture de l'obscurité de la scène (ms). */
const DARKNESS_POLL_MS = 250;

export class EmitterManager {
  /**
   * Effets actifs par émetteur. Un émetteur simple a une seule couche ; un groupe en a plusieurs.
   * @type {Map<string, {parts: Array<{emitter: object, preset: object, generator: object, lead: boolean, dx: number, dy: number}>, signature: string}>}
   */
  #active = new Map();

  #warnedMissingApi = false;

  /** Lumières liées aux émetteurs (moteur maison uniquement). */
  lights = new LightController();

  /** Tokens visibles, partagés par tous les émetteurs (réactions au monde). */
  tokens = new TokenTracker();

  #darkness = 0;
  #darknessTimer = null;

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

  /** Générateur actif d'un émetteur (couche principale pour un groupe), pour les macros et le débogage. */
  getGenerator(id) {
    const parts = this.#active.get(id)?.parts ?? [];
    return (parts.find((p) => p.lead) ?? parts[0])?.generator ?? null;
  }

  /** Tous les générateurs actifs d'un émetteur (une entrée par couche d'un groupe). */
  getGenerators(id) {
    return (this.#active.get(id)?.parts ?? []).map((p) => p.generator);
  }

  /** Toutes les couches actives, tous émetteurs confondus. */
  *#allParts() {
    for (const entry of this.#active.values()) yield* entry.parts;
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
  #applyWind() {
    const sceneWind = this.getWind();
    for (const part of this.#allParts()) {
      if (typeof part.generator.setWind !== "function") continue;
      // Chaque couche d'un groupe réagit au vent selon son propre effet
      const { wind, gust, airflow } = computeWind(part.emitter, part.preset, sceneWind, { gridPx: canvas.dimensions.size });
      part.generator.setWind(wind, gust, airflow);
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
      const parts = this.#spawn(emitter);
      if (parts.length) this.#active.set(emitter.id, { parts, signature: this.#signature(emitter) });
    }

    this.#applyWind();
    this.#startDarknessWatch();
    this.lights.sync(this.#lightEntries(emitters));
    canvas[LAYER_NAME]?.refreshHandles?.();
  }

  /** Effets du moteur maison qui peuvent porter une lumière. */
  #lightEntries(emitters) {
    const entries = [];
    for (const [id, entry] of this.#active) {
      const emitter = emitters[id];
      // Un groupe n'a qu'une lumière : celle de sa couche principale
      const lead = entry.parts.find((p) => p.lead);
      if (!emitter || !lead || typeof lead.generator.getLight !== "function") continue;
      // Réglages de lumière à jour (ils ne recréent pas l'effet), effet et couleur de la couche principale
      const lit = { ...emitter, preset: lead.emitter.preset, color: lead.emitter.color, x: emitter.x + lead.dx, y: emitter.y + lead.dy };
      entries.push({ emitter: lit, preset: lead.preset, system: lead.generator });
    }
    return entries;
  }

  /* -------------------------------------------- */
  /*  Réactions au monde                          */
  /* -------------------------------------------- */

  /** Les murs ont changé (mur posé, porte ouverte…) : on recalcule la zone de chaque effet. */
  refreshWalls() {
    for (const part of this.#allParts()) {
      if (typeof part.generator.setBounds !== "function") continue;
      part.generator.setBounds(this.#wallBounds(part.emitter, part.preset));
    }
  }

  #wallBounds(emitter, preset = getPreset(emitter.preset)) {
    if (!blockedByWalls(emitter, preset)) return null;
    return computeWallBounds(emitter.x, emitter.y, emitter.elevation ?? 0);
  }

  /** Relit l'obscurité de la scène régulièrement (elle peut s'animer de jour à nuit). */
  #startDarknessWatch() {
    if (this.#darknessTimer) return;
    const tick = () => {
      const dk = sceneDarkness();
      if (Math.abs(dk - this.#darkness) < 0.005) return;
      this.#darkness = dk;
      for (const part of this.#allParts()) part.generator.setDarkness?.(dk);
    };
    this.#darkness = sceneDarkness();
    this.#darknessTimer = setInterval(tick, DARKNESS_POLL_MS);
  }

  #stopDarknessWatch() {
    clearInterval(this.#darknessTimer);
    this.#darknessTimer = null;
  }

  /** Arrête tous les générateurs et leurs lumières (changement de scène, désactivation). */
  clear() {
    this.#stopDarknessWatch();
    this.tokens.clear();
    this.lights.clear();
    for (const id of [...this.#active.keys()]) this.#destroy(id);
  }

  /** Déplace un émetteur en direct pendant un glisser-déposer, sans écrire en base. */
  moveLive(id, x, y) {
    const entry = this.#active.get(id);
    if (!entry) return;
    for (const part of entry.parts) {
      const area = buildArea(part.preset.area, x + part.dx, y + part.dy, canvas.dimensions.size, part.emitter.radius);
      try {
        const target = part.generator.spawnArea;
        if (target && typeof target === "object") {
          target.x = area.x;
          target.y = area.y;
        }
      } catch (err) {
        // Pas grave : la position sera appliquée en relâchant la souris.
      }
    }
  }

  #destroy(id) {
    const entry = this.#active.get(id);
    this.#active.delete(id);
    for (const part of entry?.parts ?? []) {
      try {
        part.generator?.stop({ hard: true });
      } catch (err) {
        warn("Arrêt du générateur impossible", err);
      }
    }
  }

  /**
   * Crée et démarre les générateurs d'un émetteur avec le moteur choisi par le MJ :
   * un seul pour un effet simple, un par couche pour un groupe (couche principale d'abord).
   */
  #spawn(emitter) {
    const gridPx = canvas.dimensions.size;
    const layers = expandEmitter(emitter, getEffect, gridPx).sort((a, b) => b.lead - a.lead);
    const parts = [];
    let lead = null;
    let leadBlown = false;
    for (const layer of layers) {
      const base = buildConfig(layer.emitter, layer.preset, { gridPx, performance: this.performance, wind: this.getWind() });
      const finalized = finalizeConfig(base, getParticleTexture);
      let generator;
      if (this.engine === "core") {
        // Générateur de Foundry : une couche qui suit la flamme n'apparaît pas si la flamme est soufflée
        if (layer.follow && leadBlown) continue;
        generator = this.#spawnCore(layer.emitter, finalized);
        if (layer.lead && !generator && finalized.blowout) leadBlown = true;
      } else {
        const gate = layer.follow && lead ? () => lead.lit : null;
        generator = this.#spawnEmber(layer.emitter, finalized, layer.preset, gate);
        if (layer.lead) lead = generator;
      }
      if (generator) parts.push({ emitter: layer.emitter, preset: layer.preset, generator, lead: layer.lead, dx: layer.dx, dy: layer.dy });
    }
    return parts;
  }

  /** Moteur maison. */
  #spawnEmber(emitter, cfg, preset = getPreset(emitter.preset), gate = null) {
    let system;
    cfg.bounds = this.#wallBounds(emitter, preset);
    cfg.darkness = sceneDarkness();
    const reach = (emitter.radius ?? presetRadius(preset)) * canvas.dimensions.size + canvas.dimensions.size * 2;
    try {
      system = new EmberParticleSystem(cfg, {
        gate,
        getDisturbers: cfg.disturb ? () => this.tokens.near(emitter.x, emitter.y, reach) : null,
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
