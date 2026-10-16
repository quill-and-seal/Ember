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
 *   - blowout   flamme fragile { threshold, relightDelay } : elle vacille quand le courant d'air
 *               approche du seuil, s'éteint au-delà (callback onExtinguish, pour une bouffée de
 *               fumée) et se rallume après relightDelay ms de calme relatif (onRelight).
 *
 * Réactions au monde :
 *   - bounds    zone autorisée { contains(x, y) } (murs) : une particule qui la quitte est
 *               arrêtée au mur et rebondit un peu ; les apparitions hors zone sont retirées.
 *   - disturb   comment les tokens dérangent l'effet { push, wake, lift, radius } :
 *               push  répulsion (px/s²) au contact, wake  part de la vitesse du token transmise
 *               (sillage), lift  envol vertical (px/s) quand un token passe, radius  portée en
 *               multiple de la taille du token. Les tokens viennent de getDisturbers().
 *   - darkness  obscurité de la scène (0 = plein jour, 1 = nuit noire), modifiable avec setDarkness()
 *   - darknessEffects  { rate, count, scale, life, alpha } : [valeur de jour, valeur de nuit]
 *
 * Lumière : le moteur calcule à chaque image un niveau de lumière (getLight()) qui suit la
 * flamme : 0 quand elle est soufflée, plus fort quand le vent l'attise, en creux quand elle
 * vacille. Les lumières de Foundry s'en servent. Avec l'option
 *   - glow      { radius (px), color, alpha, texture }
 * le moteur dessine lui-même une lueur au sol (purement visuelle, sans effet sur la vision).
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
   * @param {() => number} [options.clock]        Horloge en ms pour les rafales. Dans Foundry, l'heure du
   *                                              serveur : tous les joueurs voient les mêmes coups de vent.
   * @param {(pos: {x, y}) => void} [options.onExtinguish]  Appelé quand le vent éteint la flamme
   * @param {(pos: {x, y}) => void} [options.onRelight]     Appelé quand elle se rallume
   * @param {() => Array<{x, y, r, vx, vy}>} [options.getDisturbers]  Tokens proches, appelé à chaque image
   * @param {() => boolean} [options.gate]       Groupes : l'effet ne produit plus rien tant que gate() est faux
   *                                              (les étincelles s'arrêtent quand la flamme du groupe est soufflée)
   */
  constructor(config, { container, ticker, random = Math.random, clock, onExtinguish, onRelight, getDisturbers, gate } = {}) {
    this.config = config;
    this.random = random;
    this.clock = clock ?? (() => globalThis.performance?.now?.() ?? Date.now());
    this.onExtinguish = onExtinguish ?? null;
    this.onRelight = onRelight ?? null;
    this.getDisturbers = getDisturbers ?? null;
    this.gate = gate ?? null;

    /** La flamme est-elle allumée ? (seuls les effets « blowout » peuvent s'éteindre) */
    this.lit = true;
    this._calmMs = 0;
    this._flicker = 0;

    /** Niveau de lumière lissé : intensité (0 = éteint, 1 = normal) et facteur de rayon. */
    this._light = { level: 1, radius: 1 };
    this._glow = null;
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

  /** Change la zone autorisée (murs) en direct. null = aucune limite. */
  setBounds(bounds) {
    this.config.bounds = bounds ?? null;
  }

  /**
   * Pluie reçue par l'effet (0 = sec, 1 = averse battante). Une flamme qui craint la pluie
   * (douse) s'éteint au-delà de son seuil et se rallume quand la pluie retombe.
   */
  setWetness(level) {
    this.config.wetness = Math.min(1, Math.max(0, Number(level) || 0));
  }

  /** Zone interdite { contains(x, y) } (intérieurs pour la météo) : rien n'y naît, tout y disparaît. */
  setExclude(zone) {
    this.config.exclude = zone ?? null;
  }

  /** Change l'obscurité de la scène en direct (0 = jour, 1 = nuit). */
  setDarkness(level) {
    this.config.darkness = Math.min(1, Math.max(0, Number(level) || 0));
  }

  /**
   * Multiplicateurs de comportement dus à l'obscurité : interpolation entre la valeur
   * de jour et la valeur de nuit de chaque réaction. Peut descendre à 0 (lucioles le jour).
   */
  _darknessResponse() {
    const fx = this.config.darknessEffects;
    const dk = this.config.darkness ?? 0;
    const m = (key) => {
      const v = fx?.[key];
      if (!Array.isArray(v)) return 1;
      return Math.max(0, v[0] + (v[1] - v[0]) * dk);
    };
    return { rate: m("rate"), count: m("count"), scale: m("scale"), life: m("life"), alpha: m("alpha") };
  }

  /**
   * Multiplicateurs de comportement pour le courant d'air actuel.
   * Interpolation linéaire entre 1 (calme) et la valeur du preset (vent fort),
   * prolongée jusqu'à 1,5× pour les tempêtes, jamais sous 5 %.
   */
  _windResponse(gustFactor) {
    const fx = this.config.windEffects;
    const air = (this.config.airflow ?? 0) * gustFactor;
    const a = Math.min(1.5, air);
    const m = (key) => (fx?.[key] === undefined ? 1 : Math.max(0.05, 1 + (fx[key] - 1) * a));
    return { air, rate: m("rate"), count: m("count"), scale: m("scale"), life: m("life"), alpha: m("alpha"), lift: m("lift") };
  }

  /** Multiplicateur de rafale à l'instant présent (horloge partagée par tous les émetteurs). */
  _gustFactor() {
    const gust = this.config.gust ?? 0;
    if (!gust) return 1;
    const t = this.clock() / 1000;
    const wave = 0.6 * Math.sin(t * 0.9) + 0.4 * Math.sin(t * 2.3 + 1.7);
    return Math.max(0, 1 + gust * wave);
  }

  /**
   * Flamme fragile : vacillement à l'approche du seuil, extinction au-delà,
   * rallumage après un moment de calme (seuil × 0,7 pour éviter de clignoter).
   */
  _updateFlame(air, ms) {
    const blow = this.config.blowout;
    const douse = this.config.douse;
    if (!blow?.threshold && !douse) {
      this._flicker = 0;
      return;
    }
    // Le vent et la pluie menacent la flamme ; c'est le plus fort des deux qui compte.
    const windRatio = blow?.threshold ? air / blow.threshold : 0;
    const wetRatio = douse ? (this.config.wetness ?? 0) / douse : 0;
    const ratio = Math.max(windRatio, wetRatio);
    this._flicker = this.lit ? Math.min(1, Math.max(0, (ratio - 0.6) / 0.4)) : 0;

    if (this.lit && ratio >= 1) {
      this.lit = false;
      this._calmMs = 0;
      // Les flammes en cours sont soufflées presque instantanément.
      for (const p of this.particles) p.life = Math.min(p.life, p.age + 120);
      this._outBy = wetRatio >= windRatio ? "rain" : "wind";
      this.onExtinguish?.(this.center, this._outBy);
    } else if (!this.lit) {
      this._calmMs = ratio < 0.7 ? this._calmMs + ms : 0;
      // Après la pluie, il faut plus longtemps pour rallumer
      const delay = this._outBy === "rain" ? 6000 : blow?.relightDelay ?? 2500;
      if (this._calmMs >= delay) {
        this.lit = true;
        this._calmMs = 0;
        this.onRelight?.(this.center);
      }
    }
  }

  /**
   * Niveau de lumière actuel, pour une lumière liée à cet effet.
   * @returns {{level: number, radius: number, lit: boolean, flicker: number}}
   */
  getLight() {
    return { ...this._light, lit: this.lit, flicker: this._flicker };
  }

  /** Fait évoluer le niveau de lumière vers sa cible (fondu rapide à l'extinction, plus lent à l'allumage). */
  _updateLight(react, flickerAlpha, ms) {
    const dt = ms / 1000;
    const stoke = Math.sqrt(Math.max(0.05, react.scale * react.alpha * Math.sqrt(react.rate)));
    const targetLevel = this.lit ? Math.min(1.8, stoke) * flickerAlpha : 0;
    const targetRadius = this.lit ? Math.min(1.4, Math.sqrt(react.scale)) : 0.6;
    const kLevel = targetLevel < this._light.level ? 12 : 2.5;
    this._light.level += (targetLevel - this._light.level) * Math.min(1, dt * kLevel);
    this._light.radius += (targetRadius - this._light.radius) * Math.min(1, dt * 1.5);

    // Lueur dessinée par le moteur (option glow)
    const glow = this.config.glow;
    if (!glow) return;
    if (!this._glow) {
      this._glow = new PIXI.Sprite(glow.texture ?? PIXI.Texture.WHITE);
      this._glow.anchor.set(0.5, 0.5);
      const modes = globalThis.PIXI?.BLEND_MODES;
      this._glow.blendMode = modes ? modes.ADD : "add";
      this.container.addChildAt?.(this._glow, 0) ?? this.container.addChild(this._glow);
    }
    const { x, y } = this.center;
    const r = glow.radius * this._light.radius;
    const texSize = this._glow.texture?.width || 64;
    this._glow.position?.set?.(x, y);
    this._glow.scale.set((r * 2) / texSize, (r * 2) / texSize);
    this._glow.tint = glow.color ?? 0xffc070;
    this._glow.alpha = Math.min(1, (glow.alpha ?? 0.5) * this._light.level);
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
    if (!hard || this._destroyed) return;
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
    const windReact = this._windResponse(gustFactor);
    const dark = this._darknessResponse();
    // Réaction totale : vent × obscurité. La lumière liée ne suit que le vent (pas l'obscurité).
    const react = {
      air: windReact.air,
      rate: windReact.rate * dark.rate,
      count: windReact.count * dark.count,
      scale: windReact.scale * dark.scale,
      life: windReact.life * dark.life,
      alpha: windReact.alpha * dark.alpha,
      lift: windReact.lift
    };
    this._react = react;
    this._dark = dark;
    this._updateFlame(react.air, ms);

    // Vacillement : toute la flamme baisse d'un coup, au hasard, quand elle est près de s'éteindre
    const f = this._flicker;
    const flickerAlpha = f ? 1 - 0.55 * f * this.random() : 1;
    const flickerScale = f ? 1 - 0.25 * f * this.random() : 1;
    this._updateLight(windReact, flickerAlpha, ms);

    // Apparitions (une flamme soufflée ne produit plus rien)
    if (!this._stopped && this.lit && (!this.gate || this.gate()) && cfg.bursts) {
      this._updateBursts(ms, react);
    } else if (!this._stopped && this.lit && (!this.gate || this.gate())) {
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
    const bounds = cfg.bounds ?? null;
    const exclude = cfg.exclude ?? null;
    const disturb = cfg.disturb ?? null;
    const disturbers = disturb && this.getDisturbers ? this.getDisturbers() : null;
    const hasDisturbers = !!disturbers?.length;

    // Mise à jour (parcours à l'envers pour recycler sans décaler les index)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += ms;
      if (p.age >= p.life) {
        this._recycle(i);
        continue;
      }
      const t = p.age / p.life;

      const ox = p.x;
      const oy = p.y;

      // Tokens qui passent : répulsion, sillage, envol
      if (hasDisturbers) this._applyDisturbers(p, disturbers, disturb, dt);

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

      // Murs : la particule s'arrête contre le mur et rebondit un peu
      if (bounds && !bounds.contains(p.x, p.y)) {
        p.x = ox;
        p.y = oy;
        p.vx *= -0.3;
        p.vy *= -0.3;
      }

      // Zone interdite (intérieur, pour la météo) : la particule disparaît
      if (exclude && exclude.contains(p.x, p.y)) {
        this._recycle(i);
        continue;
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
      const s = sampleCurve(this._scale, t) * (1 + p.z / perspective) * react.scale * flickerScale;
      p.scale.set(s, s);
      p.alpha = Math.min(1, sampleCurve(this._alpha, t) * react.alpha * flickerAlpha);
      p.tint = sampleColor(this._tint, t);
    }
  }

  /* -------------------------------------------- */
  /*  Particules                                  */
  /* -------------------------------------------- */

  /**
   * Gerbes : au lieu d'un flot continu, l'effet crache un paquet de particules d'un coup,
   * dans une direction au hasard (coup de marteau sur l'enclume), puis attend le suivant.
   * Le vent rapproche les gerbes (rate) et les fournit (count), comme pour le flot continu.
   */
  _updateBursts(ms, react) {
    const b = this.config.bursts;
    const rand = this.random;
    // Premier coup à un moment au hasard : deux forges posées ensemble ne frappent pas en même temps
    if (this._burstTimer === undefined) this._burstTimer = sampleRange(b.every ?? [1000, 1000], rand) * rand();
    this._burstTimer -= ms * react.rate;
    if (this._burstTimer > 0) return;
    this._burstTimer = sampleRange(b.every ?? [1000, 1000], rand);
    const n = Math.round(sampleRange(b.count ?? [10, 10], rand) * react.count);
    const maxCount = this.config.count * react.count;
    const spread = (b.spread ?? 360) * DEG;
    this._burstDir = spread < TAU ? rand() * TAU : null;
    this._burstSpread = spread;
    for (let i = 0; i < n && this.particles.length < maxCount; i++) this._spawn();
    this._burstDir = null;
  }

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

    // Position et élan dans le plan (pas d'apparition de l'autre côté d'un mur)
    let { x, y } = this._samplePosition();
    const bounds = cfg.bounds;
    if (bounds && !bounds.contains(x, y)) {
      let ok = false;
      for (let i = 0; i < 4 && !ok; i++) {
        ({ x, y } = this._samplePosition());
        ok = bounds.contains(x, y);
      }
      if (!ok) ({ x, y } = this.center);
    }
    const exclude = cfg.exclude;
    if (exclude && exclude.contains(x, y)) {
      let ok = false;
      for (let i = 0; i < 4 && !ok; i++) {
        ({ x, y } = this._samplePosition());
        ok = !exclude.contains(x, y);
      }
      // Pas de place dehors : la particule ne naît pas (elle retourne dans la réserve)
      if (!ok) {
        p.visible = false;
        this.pool.push(p);
        return null;
      }
    }
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
      // Dans une gerbe, toutes les particules partent dans le même cône.
      const angle =
        this._burstDir != null
          ? this._burstDir + (rand() - 0.5) * this._burstSpread
          : d > 0.5
            ? Math.atan2(dy, dx)
            : rand() * TAU;
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

  /** Effet des tokens proches sur une particule. */
  _applyDisturbers(p, disturbers, d, dt) {
    for (const t of disturbers) {
      const dx = p.x - t.x;
      const dy = p.y - t.y;
      const r = t.r * (d.radius ?? 1);
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      const dist = Math.sqrt(d2) || 0.001;
      const f = 1 - dist / r;
      if (d.push) {
        p.vx += (dx / dist) * d.push * f * dt;
        p.vy += (dy / dist) * d.push * f * dt;
      }
      if (d.wake) {
        p.vx += t.vx * d.wake * f * dt * 3;
        p.vy += t.vy * d.wake * f * dt * 3;
      }
      if (d.lift) {
        const speed = Math.hypot(t.vx, t.vy);
        if (speed > 20) {
          const kick = d.lift * f * Math.min(1, speed / 150);
          if (p.grounded) {
            // Une feuille au sol est soulevée et reprend sa vie
            p.grounded = false;
            p.vz = kick;
            p.life = Math.max(p.life, p.age + 1500);
          } else {
            p.vz += kick * dt * 4;
          }
        }
      }
    }
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
