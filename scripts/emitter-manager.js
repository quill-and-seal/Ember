/**
 * Gestion des émetteurs : lecture/écriture dans les flags de la scène et
 * création des générateurs de particules correspondants sur chaque client.
 *
 * Les émetteurs vivent dans scene.flags["ember-particles"].emitters.
 * Quand le MJ modifie la scène, Foundry diffuse la mise à jour à tous les
 * clients, et chacun reconstruit ses générateurs : pas besoin de socket.
 */

import { MODULE_ID, FLAG_EMITTERS, EMITTER_DEFAULTS, LAYER_NAME, warn, t } from "./constants.js";
import { getPreset } from "./presets.js";
import { buildConfig, buildArea, finalizeConfig, fallbackConfigs } from "./adapter.js";
import { getParticleTexture } from "./textures.js";

export class EmitterManager {
  /** @type {Map<string, {generator: object, signature: string}>} */
  #active = new Map();

  #warnedMissingApi = false;

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

  /** Doit-on afficher cet émetteur pour l'utilisateur courant ? */
  #isVisible(emitter) {
    if (!emitter.enabled) return false;
    if (emitter.hidden && !game.user.isGM) return false;
    return !!getPreset(emitter.preset);
  }

  /** Signature des réglages qui influencent le rendu (le libellé n'en fait pas partie). */
  #signature(emitter) {
    const { label, id, ...rest } = emitter;
    return JSON.stringify([rest, this.performance, canvas.dimensions?.size]);
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

    canvas[LAYER_NAME]?.refreshHandles?.();
  }

  /** Arrête tous les générateurs (changement de scène, désactivation). */
  clear() {
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

  /** Crée et démarre le générateur d'un émetteur, avec configurations de repli. */
  #spawn(emitter) {
    const Generator = foundry.canvas?.animation?.ParticleGenerator;
    if (!Generator) {
      if (!this.#warnedMissingApi) {
        this.#warnedMissingApi = true;
        ui.notifications.error(t("Error.NoParticleApi"));
      }
      return null;
    }

    const preset = getPreset(emitter.preset);
    const base = buildConfig(emitter, preset, {
      gridPx: canvas.dimensions.size,
      performance: this.performance
    });
    const finalized = finalizeConfig(base, getParticleTexture);

    let lastError;
    const attempts = fallbackConfigs(finalized);
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
