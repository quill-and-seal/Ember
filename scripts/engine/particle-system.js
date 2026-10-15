/**
 * Moteur de particules maison d'Ember.
 *
 * Il lit la même configuration que celle produite par adapter.js pour le
 * générateur de Foundry (zone, nombre, débit, durée de vie, vitesses, courbes
 * de taille/opacité/couleur, rotation, dérive) et ajoute :
 *   - gravity   { x, y } en px/s²
 *   - prewarm   durée simulée au démarrage (ms) pour qu'un feu soit déjà « pris »
 *
 * Il ne dépend que des bases de PIXI (Container, Sprite, Ticker), communes à PIXI 7 et 8,
 * et n'utilise rien de Foundry : il tourne aussi dans la page d'aperçu.
 */

import { compileCurve, sampleColor, sampleCurve, sampleRange } from "./curves.js";

/** Accélération de dérive (px/s²) pour une intensité de 1, à la taille de case de référence. */
const DRIFT_ACCEL = 40;

/** Pas maximal d'une mise à jour, pour éviter les sauts après un onglet en arrière-plan. */
const MAX_STEP_MS = 100;

const TAU = Math.PI * 2;

export class EmberParticleSystem {
  /**
   * @param {object} config            Configuration (voir adapter.buildConfig)
   * @param {object} [options]
   * @param {PIXI.Container} [options.container]  Conteneur parent déjà placé dans la scène
   * @param {PIXI.Ticker} [options.ticker]        Horloge qui fait avancer la simulation
   * @param {() => number} [options.random]       Générateur aléatoire (tests)
   */
  constructor(config, { container, ticker, random = Math.random } = {}) {
    this.config = config;
    this.random = random;
    this.ticker = ticker ?? globalThis.PIXI?.Ticker?.shared ?? null;

    /** Zone d'apparition, relue à chaque particule : on peut la déplacer en direct. */
    this.spawnArea = { ...config.area };

    this.container = container ?? new PIXI.Container();
    this.particles = [];
    this.pool = [];

    this._scale = compileCurve(config.scale, 0.3);
    this._alpha = compileCurve(config.alpha, 1);
    this._tint = compileCurve(config.tint, 0xffffff);
    this._accumulator = 0;
    this._stopped = true;
    this._attached = false;
    this._destroyed = false;
    this._tick = () => this.update(this.ticker.deltaMS);
  }

  /** Particules vivantes. */
  get liveCount() {
    return this.particles.length;
  }

  /* -------------------------------------------- */
  /*  Démarrage / arrêt                           */
  /* -------------------------------------------- */

  start() {
    if (this._destroyed) return;
    this._stopped = false;
    const prewarm = this.config.prewarm ?? 0;
    for (let t = 0; t < prewarm; t += 50) this.update(50);
    if (this.ticker && !this._attached) {
      this.ticker.add(this._tick);
      this._attached = true;
    }
  }

  /**
   * Arrête l'émetteur.
   * @param {object} [options]
   * @param {boolean} [options.hard]  true : tout détruire tout de suite. Sinon les particules finissent leur vie.
   */
  stop({ hard = false } = {}) {
    this._stopped = true;
    if (!hard) return;
    if (this._attached) this.ticker?.remove(this._tick);
    this._attached = false;
    this._destroyed = true;
    this.particles.length = 0;
    this.pool.length = 0;
    // Les textures sont partagées et mises en cache : on ne les détruit pas.
    this.container.destroy?.({ children: true, texture: false });
  }

  /* -------------------------------------------- */
  /*  Simulation                                  */
  /* -------------------------------------------- */

  /** Avance la simulation de dtMs millisecondes. */
  update(dtMs) {
    if (this._destroyed) return;
    const ms = Math.min(Math.max(dtMs, 0), MAX_STEP_MS);
    const dt = ms / 1000;
    const cfg = this.config;

    // Apparitions
    if (!this._stopped) {
      this._accumulator += (cfg.spawnRate ?? 10) * dt;
      while (this._accumulator >= 1 && this.particles.length < cfg.count) {
        this._spawn();
        this._accumulator -= 1;
      }
      if (this.particles.length >= cfg.count) this._accumulator = Math.min(this._accumulator, 1);
    }

    const gx = cfg.gravity?.x ?? 0;
    const gy = cfg.gravity?.y ?? 0;
    const drift = cfg.drift?.enabled ? (cfg.drift.intensity ?? 0) * DRIFT_ACCEL * (cfg.gridScale ?? 1) : 0;
    const align = !!cfg.rotation?.alignVelocity;

    // Mise à jour (parcours à l'envers pour recycler sans décaler les index)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += ms;
      if (p.age >= p.life) {
        this._recycle(i);
        continue;
      }
      const t = p.age / p.life;

      p.vx += gx * dt;
      p.vy += gy * dt;
      if (drift) {
        const a = p.phase + p.age * p.wobble;
        p.vx += Math.cos(a) * drift * dt;
        p.vy += Math.sin(a * 1.3) * drift * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation = align ? Math.atan2(p.vy, p.vx) : p.rotation + p.spin * dt;

      const s = sampleCurve(this._scale, t);
      p.scale.set(s, s);
      p.alpha = sampleCurve(this._alpha, t);
      p.tint = sampleColor(this._tint, t);
    }
  }

  /* -------------------------------------------- */
  /*  Particules                                  */
  /* -------------------------------------------- */

  _spawn() {
    const cfg = this.config;
    const rand = this.random;
    const textures = cfg.textures ?? [];
    const texture = textures[Math.floor(rand() * textures.length)] ?? PIXI.Texture.WHITE;

    let p = this.pool.pop();
    if (p) {
      p.texture = texture;
      p.visible = true;
    } else {
      p = new PIXI.Sprite(texture);
      p.anchor.set(0.5, 0.5);
      this.container.addChild(p);
    }
    if (cfg.blend !== undefined) p.blendMode = cfg.blend;

    const { x, y } = this._samplePosition();
    p.x = x;
    p.y = y;
    p.vx = sampleRange(cfg.velocity?.x ?? 0, rand);
    p.vy = sampleRange(cfg.velocity?.y ?? 0, rand);
    p.age = 0;
    p.life = Math.max(1, sampleRange(cfg.lifetime ?? [1000, 1000], rand));
    p.phase = rand() * TAU;
    p.wobble = 0.0015 + rand() * 0.002;

    const rot = cfg.rotation ?? {};
    p.rotation = (rot.initial ?? 0) + (rand() * 2 - 1) * (rot.spread ?? 0);
    p.spin = (sampleRange(rot.speed ?? 0, rand) * Math.PI) / 180;

    const s = sampleCurve(this._scale, 0);
    p.scale.set(s, s);
    p.alpha = sampleCurve(this._alpha, 0);
    p.tint = sampleColor(this._tint, 0);

    this.particles.push(p);
    return p;
  }

  _recycle(index) {
    const p = this.particles[index];
    const last = this.particles.pop();
    if (index < this.particles.length) this.particles[index] = last;
    p.visible = false;
    this.pool.push(p);
  }

  /** Point aléatoire dans la zone d'apparition (cercle, anneau ou rectangle). */
  _samplePosition() {
    const a = this.spawnArea ?? { x: 0, y: 0, radius: 0 };
    const rand = this.random;
    if ("width" in a) {
      return { x: a.x + rand() * a.width, y: a.y + rand() * a.height };
    }
    const angle = rand() * TAU;
    let r;
    if ("outerRadius" in a) {
      const i2 = a.innerRadius ** 2;
      const o2 = a.outerRadius ** 2;
      r = Math.sqrt(i2 + rand() * (o2 - i2));
    } else {
      r = (a.radius ?? 0) * Math.sqrt(rand());
    }
    return { x: a.x + Math.cos(angle) * r, y: a.y + Math.sin(angle) * r };
  }
}
