/**
 * Lumières liées aux émetteurs (moteur maison uniquement).
 *
 * Deux cas :
 *   - lumière créée par Ember : une PointLightSource ajoutée par programme, sans document
 *     en base (hook « initializeLightSources », API de Foundry v14) ;
 *   - lumière existante liée : une lumière posée par le MJ, dont on modifie la source
 *     affichée sur ce client, sans toucher à son document.
 *
 * Dans les deux cas, rien n'est écrit en base : chaque client calcule sa lumière à partir
 * de l'état de la flamme. Les rafales suivent l'heure du serveur, donc tout le monde voit
 * les mêmes variations. L'intensité est mise à jour souvent (peu coûteux) ; le rayon et
 * l'allumage, qui obligent Foundry à recalculer la vision, seulement quand ils changent
 * nettement.
 */

import { MODULE_ID, warn } from "./constants.js";
import { lightConfig, modulateLight } from "./adapter.js";

/** Intervalle entre deux mises à jour de lumière (ms). */
const TICK_MS = 120;

/** Écarts minimaux pour mettre à jour (évite de recalculer la vision pour rien). */
const EPS_ALPHA = 0.03;
const EPS_RADIUS = 0.04;

export class LightController {
  /** @type {Map<string, {source: object, data: object|null}>} lumières créées par Ember */
  #own = new Map();

  /** @type {Map<string, {lightId: string, data: object|null}>} lumières existantes liées */
  #linked = new Map();

  /** @type {Array<{emitter: object, preset: object, system: object}>} */
  #entries = [];

  #acc = 0;
  #ticker = null;
  #broken = false;
  #tick = () => this.#onTick(this.#ticker?.deltaMS ?? TICK_MS);

  /** Aligne les lumières sur les émetteurs actifs (appelé après chaque synchronisation). */
  sync(entries) {
    if (this.#broken) return;
    this.#entries = entries;
    const wantOwn = new Set();
    const wantLinked = new Set();

    for (const { emitter, preset } of entries) {
      const base = lightConfig(emitter, preset);
      if (base?.mode === "auto" && base.vision) wantOwn.add(emitter.id);
      if (base?.mode === "linked") wantLinked.add(emitter.id);
    }

    for (const id of [...this.#own.keys()]) if (!wantOwn.has(id)) this.#destroyOwn(id);
    for (const [id, entry] of [...this.#linked]) {
      const emitter = entries.find((e) => e.emitter.id === id)?.emitter;
      if (!wantLinked.has(id) || emitter?.lightLink !== entry.lightId) this.#releaseLinked(id);
    }
    for (const { emitter } of entries) {
      if (wantOwn.has(emitter.id) && !this.#own.has(emitter.id)) this.#createOwn(emitter.id);
      if (wantLinked.has(emitter.id) && !this.#linked.has(emitter.id)) {
        this.#linked.set(emitter.id, { lightId: emitter.lightLink, data: null });
      }
    }

    this.#attach();
    this.#update(true);
  }

  /** Foundry vient de réinitialiser ses lumières : on remet les nôtres et nos modulations. */
  onInitializeLightSources() {
    if (this.#broken) return;
    for (const [id, entry] of this.#own) {
      try {
        if (!entry.source || entry.source.destroyed || !canvas.effects.lightSources.has(entry.source.sourceId)) {
          this.#createOwn(id, entry.data);
        }
      } catch (err) {
        this.#fail(err);
      }
    }
    for (const entry of this.#linked.values()) {
      if (entry.data) this.#applyLinkedData(entry.lightId, entry.data);
    }
  }

  /** Retire tout (changement de scène, module désactivé). */
  clear() {
    if (this.#ticker) this.#ticker.remove(this.#tick);
    this.#ticker = null;
    for (const id of [...this.#own.keys()]) this.#destroyOwn(id, false);
    for (const id of [...this.#linked.keys()]) this.#releaseLinked(id, false);
    this.#entries = [];
    this.#refresh(true);
  }

  /* -------------------------------------------- */
  /*  Mise à jour                                 */
  /* -------------------------------------------- */

  #attach() {
    if (this.#ticker || (!this.#own.size && !this.#linked.size)) return;
    this.#ticker = canvas.app?.ticker ?? null;
    this.#ticker?.add(this.#tick);
  }

  #onTick(ms) {
    this.#acc += ms;
    if (this.#acc < TICK_MS) return;
    this.#acc = 0;
    this.#update(false);
  }

  /** Calcule et applique la lumière de chaque émetteur. */
  #update(force) {
    if (this.#broken) return;
    let geometry = false;
    let lighting = false;
    const dist = canvas.dimensions?.distance ?? 5;

    for (const { emitter, preset, system } of this.#entries) {
      const base = lightConfig(emitter, preset);
      if (!base) continue;
      const level = system?.getLight?.() ?? { level: 1, radius: 1, flicker: 0 };

      if (base.mode === "auto" && this.#own.has(emitter.id)) {
        const m = modulateLight(base, level);
        const data = {
          x: system?.center?.x ?? emitter.x,
          y: system?.center?.y ?? emitter.y,
          elevation: emitter.elevation ?? 0,
          dim: m.dim * dist,
          bright: m.bright * dist,
          color: m.color,
          alpha: m.alpha,
          animation: this.#animation(m.animation),
          walls: true,
          vision: false,
          disabled: m.disabled
        };
        const levelId = canvas.level?.id;
        if (levelId) data.level = levelId;
        const res = this.#applyOwn(emitter.id, data, force);
        geometry ||= res.geometry;
        lighting ||= res.lighting;
      }

      if (base.mode === "linked" && this.#linked.has(emitter.id)) {
        const placeable = canvas.lighting?.get?.(base.linkId);
        const cfg = placeable?.document?.config;
        if (!cfg) continue;
        const m = modulateLight(base, level, { dim: cfg.dim, bright: cfg.bright, alpha: cfg.alpha, color: cfg.color });
        const data = { dim: m.dim, bright: m.bright, alpha: m.alpha, disabled: m.disabled || !!placeable.document.hidden };
        const entry = this.#linked.get(emitter.id);
        const res = this.#diff(entry.data, data, force);
        if (res.lighting) {
          entry.data = data;
          this.#applyLinkedData(base.linkId, data);
        }
        geometry ||= res.geometry;
        lighting ||= res.lighting;
      }
    }
    if (lighting) this.#refresh(geometry);
  }

  /** Animation Foundry, seulement si elle existe dans cette version. */
  #animation(animation) {
    if (!animation?.type) return { type: null };
    return CONFIG.Canvas?.lightAnimations?.[animation.type] ? animation : { type: null };
  }

  /** Ce qui a changé assez pour mériter une mise à jour, et si la vision doit être recalculée. */
  #diff(prev, next, force) {
    if (!prev || force) return { lighting: true, geometry: true };
    const geometry =
      prev.disabled !== next.disabled ||
      Math.abs(prev.dim - next.dim) > EPS_RADIUS * Math.max(1, prev.dim) ||
      Math.abs(prev.bright - next.bright) > EPS_RADIUS * Math.max(1, prev.bright) ||
      prev.x !== next.x ||
      prev.y !== next.y;
    const lighting = geometry || Math.abs(prev.alpha - next.alpha) > EPS_ALPHA || prev.color !== next.color;
    return { lighting, geometry };
  }

  #refresh(geometry) {
    try {
      canvas.perception?.update?.({ refreshLighting: true, refreshVision: geometry });
    } catch (err) {
      this.#fail(err);
    }
  }

  /* -------------------------------------------- */
  /*  Lumières créées par Ember                   */
  /* -------------------------------------------- */

  #createOwn(id, data = null) {
    const Source = foundry.canvas?.sources?.PointLightSource;
    if (!Source || !canvas.effects?.lightSources) return this.#fail(new Error("PointLightSource indisponible"));
    try {
      const previous = this.#own.get(id);
      if (previous?.source && !previous.source.destroyed) previous.source.destroy();
      const source = new Source({ object: null, sourceId: `${MODULE_ID}.light.${id}` });
      if (data) {
        source.initialize(data);
        source.add();
      }
      this.#own.set(id, { source, data, added: !!data });
    } catch (err) {
      this.#fail(err);
    }
  }

  #applyOwn(id, data, force) {
    const entry = this.#own.get(id);
    if (!entry) return { lighting: false, geometry: false };
    const res = this.#diff(entry.data, data, force);
    if (!res.lighting) return res;
    try {
      entry.source.initialize(data);
      if (!entry.added) {
        entry.source.add();
        entry.added = true;
      }
      entry.data = data;
    } catch (err) {
      this.#fail(err);
    }
    return res;
  }

  #destroyOwn(id, refresh = true) {
    const entry = this.#own.get(id);
    this.#own.delete(id);
    try {
      entry?.source?.destroy();
    } catch {
      /* déjà détruite */
    }
    if (refresh) this.#refresh(true);
  }

  /* -------------------------------------------- */
  /*  Lumières existantes liées                   */
  /* -------------------------------------------- */

  /** Applique notre modulation à la source affichée de la lumière, sur ce client seulement. */
  #applyLinkedData(lightId, data) {
    const source = canvas.lighting?.get?.(lightId)?.lightSource;
    if (!source || source.destroyed) return;
    try {
      source.initialize({ ...source.data, ...data });
    } catch (err) {
      this.#fail(err);
    }
  }

  /** Rend à la lumière son état d'origine (celui de son document). */
  #releaseLinked(id, refresh = true) {
    const entry = this.#linked.get(id);
    this.#linked.delete(id);
    const placeable = entry && canvas.lighting?.get?.(entry.lightId);
    try {
      placeable?.initializeLightSource?.();
    } catch {
      /* lumière supprimée entre-temps */
    }
    if (refresh) this.#refresh(true);
  }

  /* -------------------------------------------- */

  /** En cas d'erreur de l'API (version différente), on coupe la fonction proprement. */
  #fail(err) {
    if (this.#broken) return;
    this.#broken = true;
    warn("Lumières liées désactivées : l'API de lumière de Foundry n'a pas répondu comme prévu.", err);
    try {
      for (const entry of this.#own.values()) entry.source?.destroy?.();
    } catch {
      /* ignoré */
    }
    this.#own.clear();
  }
}
