/**
 * Petite bouffée de fumée quand une flamme est soufflée par le vent.
 * Effet ponctuel : une douzaine de volutes d'un coup, emportées par le vent,
 * puis tout est détruit. Indépendant de Foundry (utilisé aussi par l'aperçu).
 */

import { EmberParticleSystem } from "./particle-system.js";

const PUFF_COUNT = 12;
const PUFF_LIFE = 1500;

/**
 * @param {object} options
 * @param {PIXI.Container} options.container  Conteneur déjà placé dans la scène (détruit à la fin)
 * @param {PIXI.Ticker} options.ticker
 * @param {number} options.x
 * @param {number} options.y
 * @param {(id: string) => PIXI.Texture} options.getTexture
 * @param {number} [options.gridScale]       Taille de case / 100
 * @param {{x: number, y: number}} [options.wind]  Vent actuel (px/s), pour emporter la fumée
 * @param {number} [options.size]            Multiplicateur de taille de l'émetteur
 * @returns {EmberParticleSystem}
 */
export function spawnPuff({ container, ticker, x, y, getTexture, gridScale = 1, wind = { x: 0, y: 0 }, size = 1 }) {
  const g = gridScale;
  const modes = globalThis.PIXI?.BLEND_MODES;
  const system = new EmberParticleSystem(
    {
      area: { x, y, radius: 4 * g },
      count: PUFF_COUNT,
      spawnRate: 0,
      lifetime: [900, PUFF_LIFE],
      velocity: { x: [-8 * g, 8 * g], y: [-8 * g, 8 * g] },
      radial: [10 * g, 25 * g],
      lift: [20 * g, 45 * g],
      drag: 0.8,
      wind: { x: wind.x * 0.8, y: wind.y * 0.8 },
      scale: { curve: [{ time: 0, value: 0.1 * g * size }, { time: 1, value: 0.38 * g * size }] },
      alpha: { curve: [{ time: 0, value: 0 }, { time: 0.15, value: 0.6 }, { time: 1, value: 0 }] },
      tint: { curve: [{ time: 0, value: 0x8a8580 }, { time: 1, value: 0x4a4744 }] },
      rotation: { spread: Math.PI, speed: { min: -30, max: 30 } },
      drift: { enabled: true, intensity: 0.3 },
      gridScale: g,
      perspective: 300 * g,
      blend: modes ? modes.NORMAL : "normal",
      textures: [getTexture("smoke")]
    },
    { container, ticker }
  );
  system.start();
  for (let i = 0; i < PUFF_COUNT; i++) system._spawn();
  system.stop();
  setTimeout(() => system.stop({ hard: true }), PUFF_LIFE + 100);
  return system;
}
