/**
 * Moteur de particules maison d'Ember, pensé pour une carte VUE DU DESSUS.
 *
 * Sur une carte de JDR, la caméra regarde le sol à la verticale. « Monter » veut
 * donc dire se rapprocher de la caméra, pas aller vers le haut de l'écran.
 * Le moteur simule une hauteur z pour chaque particule :
 *   - plus une particule est haute, plus elle paraît grosse (perspective) ;
 *   - la retombée (fall) la ramène vers le sol, où elle peut s'éteindre (groundFade).
 * Dans le plan de la carte, les mouvements possibles sont :
 *   - velocity  vitesse aléatoire { x: [min, max], y: [min, max] } en px/s
 *   - radial    élan qui s'éloigne du centre de la source [min, max] en px/s
 *   - swirl     tourbillon autour du centre [min, max] en degrés/s
 *   - wind      vent { x, y } en px/s, modifiable en direct avec setWind()
 *   - gust      rafales (0..1) : la force du vent ondule dans le temps, en phase
 *               pour tous les émetteurs (même horloge), comme un vrai coup de vent
 *   - airflow   force du courant d'air ressenti (0 = calme, 1 = vent fort), rafales incluses
 *   - windEffects  comment l'effet RÉAGIT au courant d'air : multiplicateurs atteints à airflow = 1
 *               { rate, count, scale, life, alpha, lift }. Un feu s'attise (rate, scale > 1),
 *               une fumée se dissipe (life < 1), des lucioles se cachent (rate < 1)…
 *   - drag      frottement (par seconde) qui freine l'élan, dans le plan et en hauteur
 *   - drift     dérive aléatoire ondulante
 * En hauteur :
 *   - height    hauteur de départ [min, max] en px
 *   - lift      vitesse verticale de départ [min, max] en px/s (négatif = descend)
 *   - fall      retombée en px/s² (gravité vers le sol)
 *   - perspective  hauteur (px) à laquelle une particule paraît deux fois plus grosse
 *
 * Il lit aussi tout ce que comprend le générateur de Foundry (zone, nombre, débit,
 * durée de vie, courbes de taille/opacité/couleur, rotation) et ajoute :
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

/** Perspective par défaut : à 300 px de haut, une particule paraît deux fois plus grosse. */
const DEFAULT_PERSPECTIVE = 300;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

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

  /**
   * Change le vent en direct, sans recréer les particules.
   * @param {{x: number, y: number}} wind  px/s
   * @param {number} [gust]                rafales 0..1
   */
  setWind(wind, gust = this.config.gust ?? 0, airflow = this.config.airflow ?? 0) {
    this.config.wind = { x: wind?.x ?? 0, y: wind?.y ?? 0 };
    this.config.gust = gust;
    this.config.airflow = airflow;
  }

  /**
   * Multiplicateurs de comportement pour le courant d'air actuel.
   * Interpolation linéaire entre 1 (calme) et la valeur du preset (vent fort),
   * prolongée jusqu'à 1,5× pour les tempêtes, jamais sous 5 %.
   */
  _windResponse(gustFactor) {
    const fx = this.config.windEffects;
    const a = Math.min(1.5, (this.config.airflow ?? 0) * gustFactor);
    const m = (key) => (fx?.[key] === undefined ? 1 : Math.max(0.05, 1 + (fx[key] - 1) * a));
    return { rate: m("rate"), count: m("count"), scale: m("scale"), life: m("life"), alpha: m("alpha"), lift: m("lift") };
  }

  /** Multiplicateur de rafale à l'instant présent (horloge partagée par tous les émetteurs). */
  _gustFactor() {
    const gust = this.config.gust ?? 0;
    if (!gust) return 1;
    const t = (globalThis.performance?.now?.() ?? Date.now()) / 1000;
    const wave = 0.6 * Math.sin(t * 0.9) + 0.4 * Math.sin(t * 2.3 + 1.7);
    return Math.max(0, 1 + gust * wave);
  }

  /** Particules vivantes. */
  get liveCount() {
    return this.particles.length;
  }

  /** Centre de la zone d'apparition (pour l'élan radial et le tourbillon). */
  get center() {
    const a = this.spawnArea ?? {};
    if ("width" in a) return { x: a.x + a.width / 2, y: a.y + a.height / 2 };
    return { x: a.x ?? 0, y: a.y ?? 0 };
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

    // Courant d'air de cet instant : il pousse les particules et change le comportement de l'effet
    const gustFactor = this._gustFactor();
    const react = this._windResponse(gustFactor);
    this._react = react;

    // Apparitions
    if (!this._stopped) {
      const maxCount = cfg.count * react.count;
      this._accumulator += (cfg.spawnRate ?? 10) * react.rate * dt;
      while (this._accumulator >= 1 && this.particles.length < maxCount) {
        this._spawn();
        this._accumulator -= 1;
      }
      if (this.particles.length >= maxCount) this._accumulator = Math.min(this._accumulator, 1);
    }

    // Paramètres communs à toutes les particules pour ce pas
    const gx = cfg.gravity?.x ?? 0;
    const gy = cfg.gravity?.y ?? 0;
    const windX = (cfg.wind?.x ?? 0) * gustFactor;
    const windY = (cfg.wind?.y ?? 0) * gustFactor;
    const fall = cfg.fall ?? 0;
    const damping = cfg.drag ? Math.exp(-cfg.drag * dt) : 1;
    const perspective = cfg.perspective ?? DEFAULT_PERSPECTIVE;
    const groundFade = cfg.groundFade ?? null;
    const drift = cfg.drift?.enabled ? (cfg.drift.intensity ?? 0) * DRIFT_ACCEL * (cfg.gridScale ?? 1) : 0;
    const align = !!cfg.rotation?.alignVelocity;
    const { x: cx, y: cy } = this.center;

    // Mise à jour (parcours à l'envers pour recycler sans décaler les index)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += ms;
      if (p.age >= p.life) {
        this._recycle(i);
        continue;
      }
      const t = p.age / p.life;

      // Plan de la carte
      p.vx = (p.vx + gx * dt) * damping;
      p.vy = (p.vy + gy * dt) * damping;
      if (drift) {
        const a = p.phase + p.age * p.wobble;
        p.vx += Math.cos(a) * drift * dt;
        p.vy += Math.sin(a * 1.3) * drift * dt;
      }
      p.x += (p.vx + windX) * dt;
      p.y += (p.vy + windY) * dt;

      if (p.swirl) {
        const angle = p.swirl * dt;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = p.x - cx;
        const dy = p.y - cy;
        p.x = cx + dx * cos - dy * sin;
        p.y = cy + dx * sin + dy * cos;
      }

      // Hauteur
      if (!p.grounded) {
        p.vz = (p.vz - fall * dt) * damping;
        p.z += p.vz * dt;
        if (p.z <= 0 && p.vz <= 0) {
          p.z = 0;
          p.vz = 0;
          p.grounded = true;
          p.vx = 0;
          p.vy = 0;
          if (groundFade !== null) p.life = Math.min(p.life, p.age + groundFade);
        }
      }

      // Orientation
      if (align) {
        if (p.vx || p.vy) p.rotation = Math.atan2(p.vy, p.vx);
      } else {
        p.rotation += p.spin * dt;
      }

      // Apparence : la courbe de taille, agrandie par la hauteur
      const s = sampleCurve(this._scale, t) * (1 + p.z / perspective) * react.scale;
      p.scale.set(s, s);
      p.alpha = Math.min(1, sampleCurve(this._alpha, t) * react.alpha);
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

    // Position et élan dans le plan
    const { x, y } = this._samplePosition();
    const { x: cx, y: cy } = this.center;
    p.x = x;
    p.y = y;
    p.vx = sampleRange(cfg.velocity?.x ?? 0, rand);
    p.vy = sampleRange(cfg.velocity?.y ?? 0, rand);
    const radial = sampleRange(cfg.radial ?? 0, rand);
    if (radial) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      // Au centre exact, on part dans une direction au hasard.
      const angle = d > 0.5 ? Math.atan2(dy, dx) : rand() * TAU;
      p.vx += Math.cos(angle) * radial;
      p.vy += Math.sin(angle) * radial;
    }
    p.swirl = sampleRange(cfg.swirl ?? 0, rand) * DEG;

    // Hauteur
    p.z = Math.max(0, sampleRange(cfg.height ?? 0, rand));
    const react = this._react ?? this._windResponse(1);
    p.vz = sampleRange(cfg.lift ?? 0, rand) * react.lift;
    p.grounded = false;

    p.age = 0;
    p.life = Math.max(1, sampleRange(cfg.lifetime ?? [1000, 1000], rand) * react.life);
    p.phase = rand() * TAU;
    p.wobble = 0.0015 + rand() * 0.002;

    const rot = cfg.rotation ?? {};
    p.rotation = (rot.initial ?? 0) + (rand() * 2 - 1) * (rot.spread ?? 0);
    p.spin = sampleRange(rot.speed ?? 0, rand) * DEG;
    if (rot.alignVelocity && (p.vx || p.vy)) p.rotation = Math.atan2(p.vy, p.vx);

    const perspective = cfg.perspective ?? DEFAULT_PERSPECTIVE;
    const s = sampleCurve(this._scale, 0) * (1 + p.z / perspective) * react.scale;
    p.scale.set(s, s);
    p.alpha = Math.min(1, sampleCurve(this._alpha, 0) * react.alpha);
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
