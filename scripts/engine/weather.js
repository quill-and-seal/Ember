/**
 * Météo ambiante du moteur Ember (indépendante de Foundry : utilisée aussi par l'aperçu).
 *
 * Les particules vivent en COORDONNÉES DE SCÈNE, comme les tokens : quand on déplace la vue
 * ou qu'on dézoome, chaque goutte reste à sa place sur la carte et bouge avec elle.
 * Pour rester léger, elles ne naissent que dans la partie visible de la scène (plus une marge) ;
 * quand une nouvelle zone apparaît à l'écran, elle est aussitôt remplie de particules
 * « déjà en route », pour qu'aucun trou ne se voie.
 *
 * Chaque météo (pluie, neige, sable, cendres) et la brume ont leur niveau, qui glisse
 * doucement vers la valeur demandée (fondu de quelques secondes).
 * Les éclairs suivent une horloge partagée (l'heure du serveur dans Foundry) :
 * tous les joueurs les voient au même instant.
 */

import { buildConfig, computeWind, finalizeConfig } from "../adapter.js";
import { WEATHER_TYPES, LIGHTNING_PER_MINUTE } from "../weather-presets.js";
import { EmberParticleSystem } from "./particle-system.js";

/** Durée d'un fondu complet (s). */
const FADE_S = 4;
/** Marge autour de la vue, en part de sa taille. */
const MARGIN = 0.2;
/** Nombre maximum de particules de météo vivantes, avant le réglage de qualité. */
const MAX_ALIVE = 2600;
/** Durée d'une fenêtre de tirage des éclairs (ms). */
const LIGHTNING_SLOT = 1500;
/** Durée d'un éclair (ms). */
const FLASH_MS = 650;

const CHANNELS = ["rain", "snow", "sand", "ash", "fog"];

/** Nombre pseudo-aléatoire stable dans [0, 1) pour un entier et une graine. */
function hash01(n, seed) {
  const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Graine numérique à partir d'un texte (id de scène). */
export function seedFrom(text = "") {
  let h = 7;
  for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) % 100003;
  return h;
}

/** Intensité d'un éclair à t ms de son début : deux coups rapprochés puis une traîne. */
export function flashEnvelope(t) {
  if (t < 0 || t >= FLASH_MS) return 0;
  if (t < 60) return t / 60;
  if (t < 120) return 1 - ((t - 60) / 60) * 0.75;
  if (t < 170) return 0.25 + ((t - 120) / 50) * 0.6;
  return 0.85 * (1 - (t - 170) / (FLASH_MS - 170));
}

/**
 * Début de l'éclair (ms) tiré dans une fenêtre, ou null s'il n'y en a pas.
 * Même graine + même horloge = mêmes éclairs pour tout le monde.
 */
export function lightningStart(slot, seed, level) {
  const chance = (LIGHTNING_SLOT / 60000) * LIGHTNING_PER_MINUTE * level;
  if (hash01(slot, seed) >= chance) return null;
  return slot * LIGHTNING_SLOT + hash01(slot + 0.5, seed + 1) * (LIGHTNING_SLOT - FLASH_MS);
}

function area(r) {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

function intersect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width);
  const btm = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, r - x), height: Math.max(0, btm - y) };
}

function inside(r, x, y) {
  return !!r && x >= r.x && y >= r.y && x <= r.x + r.width && y <= r.y + r.height;
}

export class WeatherSystem {
  /**
   * @param {object} options
   * @param {() => PIXI.Container} options.createContainer  Conteneur placé dans la scène, au-dessus des tokens
   * @param {() => {view: object, scene: object}} options.getView  Partie visible et rectangle de la scène (coordonnées de scène)
   * @param {(id: string) => PIXI.Texture} options.getTexture
   * @param {PIXI.Ticker} [options.ticker]
   * @param {number} [options.gridPx]       Taille d'une case en pixels
   * @param {number} [options.performance]  Réglage de qualité (0..1)
   * @param {() => number} [options.clock]  Horloge partagée (ms) pour les éclairs
   * @param {number} [options.seed]         Graine des éclairs (id de la scène)
   * @param {(level: number) => void} [options.onFlash]  Intensité de l'éclair (0..1) à chaque image où elle change
   * @param {boolean} [options.flashOverlay]  Dessiner le flash blanc des éclairs (réglage par joueur)
   * @param {() => number} [options.random]
   */
  constructor({ createContainer, getView, getTexture, ticker = null, gridPx = 100, performance = 1, clock, seed = 0, onFlash, flashOverlay = true, random = Math.random }) {
    this.createContainer = createContainer;
    this.getView = getView;
    this.getTexture = getTexture;
    this.ticker = ticker;
    this.gridPx = gridPx;
    this.performance = performance;
    this.clock = clock ?? (() => Date.now());
    this.seed = seed;
    this.onFlash = onFlash ?? null;
    this.flashOverlay = flashOverlay;
    this.random = random;

    /** Niveau actuel et visé de chaque canal (0..1). */
    this.level = Object.fromEntries(CHANNELS.map((c) => [c, 0]));
    this.target = Object.fromEntries(CHANNELS.map((c) => [c, 0]));
    this.lightning = false;

    this.wind = null;
    this.exclude = null;
    this.holes = [];

    /** Couches actives : { channel, key, def, sys } */
    this.layers = [];
    this.cover = null;
    this.flash = 0;
    this._started = false;
    this._tick = () => this.update(this.ticker.deltaMS);
  }

  /* -------------------------------------------- */
  /*  Réglages                                    */
  /* -------------------------------------------- */

  /**
   * Météo demandée : { kind, intensity, fog, lightning }.
   * @param {boolean} [instant]  Sans fondu (arrivée sur une scène où il pleut déjà)
   */
  setWeather({ kind = "none", intensity = 0, fog = 0, lightning = false } = {}, { instant = false } = {}) {
    for (const c of CHANNELS) this.target[c] = 0;
    if (WEATHER_TYPES[kind] && kind !== "fog") this.target[kind] = Math.min(1, Math.max(0, intensity));
    this.target.fog = Math.min(1, Math.max(0, fog));
    this.lightning = !!lightning;
    if (instant) {
      for (const c of CHANNELS) this.level[c] = this.target[c];
      this.cover = null; // tout sera rempli à la prochaine image
    }
    this._ensureLayers();
  }

  /** Vent de la scène (mêmes réglages que pour les effets). */
  setWind(sceneWind) {
    this.wind = sceneWind ?? null;
    for (const layer of this.layers) this._applyWind(layer);
  }

  /**
   * Intérieurs : zone { contains(x, y) } où il ne pleut pas, et ses polygones
   * (tableaux de points à plat) pour percer le voile.
   */
  setExclude(zone, holes = []) {
    this.exclude = zone ?? null;
    this.holes = holes;
    for (const layer of this.layers) layer.sys.setExclude(this.exclude);
    this._overlayDirty = true;
  }

  /** Pluie reçue par une flamme exposée (0..1), fondus compris. */
  wetness() {
    let w = 0;
    for (const c of CHANNELS) w += (WEATHER_TYPES[c]?.wet ?? 0) * this.level[c];
    return Math.min(1, w);
  }

  /** Niveau d'orage (0..1) : les éclairs suivent la pluie ou la neige. */
  stormLevel() {
    if (!this.lightning) return 0;
    return Math.max(this.level.rain, this.level.snow, this.level.sand, this.level.ash, 0.5 * this.level.fog);
  }

  /* -------------------------------------------- */
  /*  Cycle de vie                                */
  /* -------------------------------------------- */

  start() {
    if (this._started) return;
    this._started = true;
    this.root = this.createContainer();
    this.overlay = new PIXI.Graphics();
    this.flashGfx = new PIXI.Graphics();
    this.root.addChild(this.overlay);
    this.particleRoot = new PIXI.Container();
    this.root.addChild(this.particleRoot);
    // Grain (tempête de sable) : texture de bruit répétée qui file avec le vent, masquée aux intérieurs
    if (PIXI.TilingSprite) {
      this.grainMask = new PIXI.Graphics();
      this.grain = new PIXI.TilingSprite(this.getTexture("noise"), 1, 1);
      this.grain.mask = this.grainMask;
      this.grain.visible = false;
      this.root.addChild(this.grainMask);
      this.root.addChild(this.grain);
    }
    this.root.addChild(this.flashGfx);
    this._overlayDirty = true;
    this._ensureLayers();
    if (this.ticker) this.ticker.add(this._tick);
  }

  stop() {
    if (!this._started) return;
    this._started = false;
    this.ticker?.remove(this._tick);
    for (const layer of this.layers) layer.sys.stop({ hard: true });
    this.layers = [];
    this.root?.destroy?.({ children: true, texture: false });
    this.root = null;
    if (this.flash) this.onFlash?.(0);
    this.flash = 0;
  }

  get liveCount() {
    return this.layers.reduce((n, l) => n + l.sys.liveCount, 0);
  }

  /* -------------------------------------------- */
  /*  Couches                                     */
  /* -------------------------------------------- */

  _ensureLayers() {
    if (!this._started) return;
    for (const channel of CHANNELS) {
      const wanted = this.level[channel] > 0.001 || this.target[channel] > 0;
      const type = WEATHER_TYPES[channel];
      for (const [key, def] of Object.entries(type.layers)) {
        const has = this.layers.find((l) => l.channel === channel && l.key === key);
        if (wanted && !has) this._addLayer(channel, key, def);
      }
    }
  }

  _addLayer(channel, key, def) {
    const cfg = finalizeConfig(
      buildConfig({ x: 0, y: 0 }, { ...def, count: 1, rate: 1, area: { shape: "rect", width: 1, height: 1 } }, { gridPx: this.gridPx }),
      this.getTexture
    );
    cfg.prewarm = 0;
    cfg.count = 0;
    cfg.spawnRate = 0;
    cfg.exclude = this.exclude;
    const container = new PIXI.Container();
    // La brume reste sous la pluie, les éclaboussures sous les gouttes
    if (channel === "fog") this.particleRoot.addChildAt(container, 0);
    else this.particleRoot.addChild(container);
    const sys = new EmberParticleSystem(cfg, { container, ticker: null, random: this.random });
    const life = def.lifetime ?? [1000, 1000];
    const layer = { channel, key, def, sys, alivePerCell: (def.perCell * (life[0] + life[1])) / 2000 };
    if (this.cover) sys.spawnArea = { ...this.cover };
    this._applyWind(layer);
    sys.start();
    this.layers.push(layer);
  }

  _applyWind(layer) {
    const { wind, gust, airflow } = computeWind({ speed: 1, windFactor: 1 }, layer.def, this.wind, { gridPx: this.gridPx });
    layer.sys.setWind(wind, gust, airflow);
  }

  /* -------------------------------------------- */
  /*  Image par image                             */
  /* -------------------------------------------- */

  update(ms) {
    if (!this._started) return;
    const dt = ms / 1000;

    // Fondus
    const step = dt / FADE_S;
    for (const c of CHANNELS) {
      const d = this.target[c] - this.level[c];
      this.level[c] = Math.abs(d) <= step ? this.target[c] : this.level[c] + Math.sign(d) * step;
    }

    // Zone couverte : la vue, plus une marge, limitée à la scène
    const { view, scene } = this.getView();
    const mx = view.width * MARGIN;
    const my = view.height * MARGIN;
    const wanted = intersect({ x: view.x - mx, y: view.y - my, width: view.width + 2 * mx, height: view.height + 2 * my }, scene);
    const cells = area(wanted) / (this.gridPx * this.gridPx);

    // Densité : particules par case, plafonnées pour garder de la fluidité au dézoom
    let total = 0;
    for (const l of this.layers) total += l.alivePerCell * cells * this.level[l.channel];
    const cap = MAX_ALIVE * Math.max(0.1, this.performance);
    const k = total > cap ? cap / total : 1;

    // La vue a changé de façon visible : on remplit tout de suite ce qui vient d'apparaître
    const prev = this.cover;
    const moved =
      !prev ||
      !inside(prev, wanted.x + 1, wanted.y + 1) ||
      !inside(prev, wanted.x + wanted.width - 1, wanted.y + wanted.height - 1) ||
      area(wanted) < area(prev) * 0.6;
    if (moved) {
      // Seule la partie déjà couverte garde ses particules ; le reste est rempli
      const overlap = prev ? area(intersect(prev, wanted)) : 0;
      const fresh = area(wanted) > 0 ? 1 - overlap / area(wanted) : 0;
      this.cover = wanted;
      for (const l of this.layers) {
        l.sys.spawnArea = { x: wanted.x, y: wanted.y, width: wanted.width, height: wanted.height };
        const n = Math.round(l.alivePerCell * cells * this.level[l.channel] * k * fresh);
        this._fill(l, n, prev);
      }
      this._overlayDirty = true;
    }

    // Centre de la vue : les gouttes filent vers lui (perspective de la caméra)
    const focus = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
    for (const l of this.layers) {
      l.sys.focus = focus;
      const lvl = this.level[l.channel] * k;
      l.sys.config.spawnRate = l.def.perCell * cells * lvl;
      l.sys.config.count = Math.ceil(l.alivePerCell * cells * lvl * 1.3) + (lvl > 0 ? 4 : 0);
      l.sys.update(ms);
    }

    // Couches éteintes et vidées : on les retire
    for (const l of [...this.layers]) {
      if (this.level[l.channel] === 0 && this.target[l.channel] === 0 && l.sys.liveCount === 0) {
        l.sys.stop({ hard: true });
        this.layers.splice(this.layers.indexOf(l), 1);
      }
    }

    this._updateOverlay(scene);
    this._updateGrain(scene, dt);
    this._updateLightning(scene);
  }

  /** Particules « déjà en route », semées dans la zone qui vient d'apparaître. */
  _fill(layer, n, previous) {
    const sys = layer.sys;
    const cover = this.cover;
    const rand = this.random;
    for (let i = 0; i < n && sys.particles.length < 20000; i++) {
      const x = cover.x + rand() * cover.width;
      const y = cover.y + rand() * cover.height;
      if (inside(previous, x, y)) continue;
      if (this.exclude?.contains(x, y)) continue;
      const p = sys._spawn();
      if (!p) continue;
      p.x = x;
      p.y = y;
      // Âge au hasard : chaque particule est à un moment différent de sa chute
      p.age = rand() * p.life * 0.9;
      if (p.vz) p.z = Math.max(0, p.z + (p.vz * p.age) / 1000);
    }
  }

  /** Voile de la météo : une teinte légère sur la scène, percée aux intérieurs. */
  _updateOverlay(scene) {
    let alpha = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (const c of CHANNELS) {
      const o = WEATHER_TYPES[c].overlay;
      const a = (o?.alpha ?? 0) * this.level[c];
      if (!a) continue;
      const n = parseInt(o.color.slice(1), 16);
      r += ((n >> 16) & 255) * a;
      g += ((n >> 8) & 255) * a;
      b += (n & 255) * a;
      alpha += a;
    }
    if (this._overlayDirty) {
      this._overlayDirty = false;
      this.overlay.clear();
      this.overlay.beginFill(0xffffff, 1).drawRect(scene.x, scene.y, scene.width, scene.height);
      for (const pts of this.holes) {
        if (pts?.length >= 6) {
          this.overlay.beginHole();
          this.overlay.drawPolygon(pts);
          this.overlay.endHole();
        }
      }
      this.overlay.endFill();
      this.flashGfx.clear();
      this.flashGfx.beginFill(0xffffff, 1).drawRect(scene.x, scene.y, scene.width, scene.height);
      for (const pts of this.holes) {
        if (pts?.length >= 6) {
          this.flashGfx.beginHole();
          this.flashGfx.drawPolygon(pts);
          this.flashGfx.endHole();
        }
      }
      this.flashGfx.endFill();
      if (this.grainMask) {
        this.grainMask.clear();
        this.grainMask.beginFill(0xffffff, 1).drawRect(scene.x, scene.y, scene.width, scene.height);
        for (const pts of this.holes) {
          if (pts?.length >= 6) {
            this.grainMask.beginHole();
            this.grainMask.drawPolygon(pts);
            this.grainMask.endHole();
          }
        }
        this.grainMask.endFill();
        this.grain.position.set(scene.x, scene.y);
        this.grain.width = scene.width;
        this.grain.height = scene.height;
      }
    }
    this.overlay.visible = alpha > 0.002;
    if (alpha > 0.002) {
      this.overlay.tint = (Math.round(r / alpha) << 16) | (Math.round(g / alpha) << 8) | Math.round(b / alpha);
      this.overlay.alpha = Math.min(0.5, alpha);
    }
  }

  /** Grain de sable : défile dans le sens du vent, plus dense et plus rapide dans les rafales. */
  _updateGrain(scene, dt) {
    if (!this.grain) return;
    let alpha = 0;
    let def = null;
    for (const c of CHANNELS) {
      const g = WEATHER_TYPES[c].grain;
      if (!g || !this.level[c]) continue;
      def = g;
      alpha = Math.max(alpha, g.alpha * this.level[c]);
    }
    this.grain.visible = alpha > 0.005;
    if (!this.grain.visible) return;
    const gustAmp = this.wind?.enabled ? this.wind.gusts ?? 0 : 0;
    const t = this.clock() / 1000;
    const gust = Math.max(0.2, 1 + gustAmp * (0.6 * Math.sin(t * 0.9) + 0.4 * Math.sin(t * 2.3 + 1.7)));
    const { wind } = computeWind({ speed: 1, windFactor: 1 }, { windFactor: 2.2, wind: { x: 140, y: 30 } }, this.wind, { gridPx: this.gridPx });
    const speed = def.speed ?? 1;
    this.grain.tilePosition.x += wind.x * speed * gust * dt;
    this.grain.tilePosition.y += wind.y * speed * gust * dt;
    this.grain.tileScale?.set?.(def.scale ?? 1, def.scale ?? 1);
    this.grain.tint = parseInt((def.color ?? "#ffffff").slice(1), 16);
    this.grain.alpha = Math.min(1, alpha * (0.7 + 0.3 * gust));
  }

  /** Éclairs : tirés sur l'horloge partagée, mêmes instants pour tous les joueurs. */
  _updateLightning() {
    const storm = this.stormLevel();
    let level = 0;
    if (storm > 0) {
      const now = this.clock();
      const slot = Math.floor(now / LIGHTNING_SLOT);
      for (const s of [slot - 1, slot]) {
        const start = lightningStart(s, this.seed, storm);
        if (start !== null) level = Math.max(level, flashEnvelope(now - start));
      }
    }
    this.flashGfx.visible = this.flashOverlay && level > 0.01;
    this.flashGfx.alpha = level * 0.45;
    if (Math.abs(level - this.flash) > 0.01 || (level === 0 && this.flash !== 0)) {
      this.flash = level;
      this.onFlash?.(level);
    }
  }
}
