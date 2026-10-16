/**
 * Météo d'Ember, pensée pour une carte VUE DU DESSUS : la pluie tombe vers le sol
 * (les gouttes rapetissent en descendant) et éclabousse, la neige se pose puis fond,
 * le sable file au ras du sol dans le vent.
 *
 * Chaque type de météo a des couches au format des presets (voir presets.js), avec en plus :
 *   perCell  Particules créées par seconde et par case visible, à pleine intensité
 * et un voile (overlay) : teinte légère posée sur la scène, sauf dans les intérieurs.
 * grain : bruit fin sur toute la scène qui défile avec le vent (sable), { color, alpha, speed, scale }.
 *
 * wet : pluie reçue par les flammes exposées à pleine intensité (1 = averse battante).
 * Les flammes qui craignent la pluie (douse dans presets.js) s'éteignent au-delà de leur seuil.
 */

export const WEATHER_TYPES = {
  /**
   * Pluie vue d'en haut (comme depuis un drone) : on ne voit presque pas les gouttes.
   * Ce qui se voit, c'est un voile gris qui ternit la scène, des rideaux de pluie plus denses
   * qui passent avec le vent, et quelques traits rapides près de la caméra, qui filent vers
   * le point juste sous elle. Les impacts au sol restent très discrets.
   */
  rain: {
    icon: "fa-solid fa-cloud-rain",
    wet: 1,
    overlay: { color: "#2b3846", alpha: 0.24 },
    layers: {
      curtains: {
        perCell: 0.012,
        textures: ["light"],
        windFactor: 1.2,
        wind: { x: 6, y: 4 },
        // Les rafales épaississent les rideaux
        windEffects: { alpha: 1.6, count: 1.4, rate: 1.4 },
        streak: { speed: 25, max: 3.5 },
        lifetime: [5000, 8000],
        velocity: { x: [-4, 4], y: [-4, 4] },
        scale: [[0, 5], [0.5, 7], [1, 8]],
        alpha: [[0, 0], [0.3, 0.16], [0.7, 0.16], [1, 0]],
        color: [[0, "#b9c7d5"], [1, "#a3b3c4"]],
        blend: "screen",
        rotation: { spread: 0, speed: [0, 0] },
        drift: 0.2
      },
      drops: {
        perCell: 2.5,
        textures: ["drop"],
        windFactor: 1.6,
        lifetime: [380, 520],
        velocity: { x: [-2, 2], y: [-2, 2] },
        // Traits fins et longs, orientés vers le centre de la vue et poussés par le vent
        streak: { speed: 25, max: 9, focus: true },
        height: [220, 380],
        lift: [-650, -800],
        fall: 400,
        groundFade: 40,
        scale: [[0, 0.06], [1, 0.05]],
        alpha: [[0, 0], [0.2, 0.45], [1, 0.3]],
        color: [[0, "#d2e2f0"], [1, "#b4c8da"]],
        blend: "screen",
        rotation: { spread: 0, speed: [0, 0] },
        drift: 0
      },
      splashes: {
        perCell: 1.2,
        textures: ["ring"],
        windFactor: 0,
        lifetime: [260, 380],
        scale: [[0, 0.04], [1, 0.14]],
        alpha: [[0, 0.3], [1, 0]],
        color: [[0, "#d6e7f5"], [1, "#d6e7f5"]],
        blend: "screen",
        rotation: { spread: 0, speed: [0, 0] },
        drift: 0
      }
    }
  },

  snow: {
    icon: "fa-solid fa-snowflake",
    wet: 0.3,
    overlay: { color: "#dfe8f0", alpha: 0.08 },
    layers: {
      flakes: {
        perCell: 0.35,
        textures: ["glow"],
        windFactor: 1.3,
        wind: { x: 8, y: 12 },
        lifetime: [6000, 9000],
        velocity: { x: [-4, 4], y: [-4, 4] },
        height: [120, 320],
        lift: [-28, -45],
        groundFade: 1800,
        scale: [[0, 0.09], [1, 0.08]],
        alpha: [[0, 0], [0.08, 0.9], [1, 0.75]],
        color: [[0, "#ffffff"], [1, "#eef4fa"]],
        blend: "screen",
        rotation: { spread: 0, speed: [0, 0] },
        drift: 1
      }
    }
  },

  sand: {
    icon: "fa-solid fa-wind",
    wet: 0,
    overlay: { color: "#b8874a", alpha: 0.18 },
    // Grain de sable sur toute la scène : un bruit fin qui file avec le vent, plus dense dans les rafales
    grain: { color: "#e2c48c", alpha: 0.4, speed: 1.4, scale: 1.5 },
    layers: {
      grains: {
        perCell: 3,
        textures: ["dust"],
        streak: { speed: 50, max: 6 },
        windFactor: 2.2,
        wind: { x: 140, y: 30 },
        lifetime: [900, 1600],
        velocity: { x: [-10, 10], y: [-10, 10] },
        height: [0, 50],
        lift: [-10, 10],
        scale: [[0, 0.22], [1, 0.3]],
        alpha: [[0, 0], [0.2, 0.75], [1, 0]],
        color: [[0, "#f0d6a2"], [1, "#d4ad6e"]],
        blend: "normal",
        rotation: { spread: 0, speed: [0, 0] },
        drift: 0.4
      },
      haze: {
        perCell: 0.03,
        textures: ["smoke"],
        windFactor: 1.8,
        wind: { x: 100, y: 20 },
        lifetime: [4000, 6000],
        velocity: { x: [-5, 5], y: [-5, 5] },
        scale: [[0, 4], [1, 6]],
        alpha: [[0, 0], [0.3, 0.45], [1, 0]],
        color: [[0, "#cfa96d"], [1, "#b88f55"]],
        blend: "normal",
        rotation: { spread: 180, speed: [-6, 6] },
        drift: 0.3
      }
    }
  },

  ash: {
    icon: "fa-solid fa-volcano",
    wet: 0,
    overlay: { color: "#3a2f28", alpha: 0.12 },
    layers: {
      flakes: {
        perCell: 0.4,
        textures: ["ash"],
        windFactor: 1.2,
        wind: { x: 6, y: 10 },
        lifetime: [7000, 11000],
        velocity: { x: [-4, 4], y: [-4, 4] },
        height: [150, 300],
        lift: [-20, -35],
        groundFade: 2500,
        scale: [[0, 0.1], [1, 0.09]],
        alpha: [[0, 0], [0.08, 0.9], [1, 0.65]],
        color: [[0, "#8f8a85"], [1, "#5a5652"]],
        blend: "normal",
        rotation: { spread: 180, speed: [-90, 90] },
        drift: 0.9
      },
      cinders: {
        perCell: 0.03,
        textures: ["ember"],
        windFactor: 1.2,
        wind: { x: 6, y: 10 },
        lifetime: [4000, 6000],
        velocity: { x: [-4, 4], y: [-4, 4] },
        height: [150, 300],
        lift: [-25, -40],
        groundFade: 800,
        scale: [[0, 0.06], [1, 0.04]],
        alpha: [[0, 0], [0.1, 1], [0.8, 0.8], [1, 0]],
        color: [[0, "#ffb35a"], [0.6, "#ff6a1a"], [1, "#7a2a10"]],
        blend: "add",
        rotation: { spread: 0, speed: [0, 0] },
        drift: 0.8
      }
    }
  },

  /** La brume se règle à part : elle peut accompagner n'importe quelle météo. */
  fog: {
    icon: "fa-solid fa-smog",
    wet: 0,
    overlay: { color: "#9aa3ad", alpha: 0.15 },
    layers: {
      banks: {
        perCell: 0.03,
        textures: ["smoke"],
        windFactor: 0.5,
        wind: { x: 5, y: 2 },
        lifetime: [10000, 16000],
        velocity: { x: [-6, 6], y: [-6, 6] },
        scale: [[0, 5], [1, 7]],
        alpha: [[0, 0], [0.3, 0.5], [0.7, 0.5], [1, 0]],
        color: [[0, "#c3c9d0"], [1, "#aeb5bd"]],
        blend: "normal",
        rotation: { spread: 180, speed: [-4, 4] },
        drift: 0.3
      }
    }
  }
};

/** Types que l'on choisit dans la liste « Météo » (la brume a son propre curseur). */
export const WEATHER_KINDS = ["none", "rain", "snow", "sand", "ash"];

/** Éclairs par minute à pleine intensité. */
export const LIGHTNING_PER_MINUTE = 5;

/**
 * Ambiances toutes prêtes : elles règlent la météo et le vent d'un coup
 * (la direction du vent est gardée).
 */
export const WEATHER_AMBIANCES = {
  clear: { icon: "fa-solid fa-sun", weather: { kind: "none", intensity: 0, fog: 0, lightning: false }, wind: { enabled: false } },
  drizzle: { icon: "fa-solid fa-cloud-rain", weather: { kind: "rain", intensity: 0.3, fog: 0.2, lightning: false }, wind: { enabled: true, strength: 10, gusts: 0.1 } },
  shower: { icon: "fa-solid fa-cloud-showers-heavy", weather: { kind: "rain", intensity: 0.7, fog: 0, lightning: false }, wind: { enabled: true, strength: 30, gusts: 0.3 } },
  storm: { icon: "fa-solid fa-cloud-bolt", weather: { kind: "rain", intensity: 1, fog: 0.15, lightning: true }, wind: { enabled: true, strength: 85, gusts: 0.6 } },
  snow: { icon: "fa-regular fa-snowflake", weather: { kind: "snow", intensity: 0.4, fog: 0, lightning: false }, wind: { enabled: true, strength: 8, gusts: 0.1 } },
  blizzard: { icon: "fa-solid fa-snowflake", weather: { kind: "snow", intensity: 1, fog: 0.35, lightning: false }, wind: { enabled: true, strength: 110, gusts: 0.5 } },
  sandstorm: { icon: "fa-solid fa-wind", weather: { kind: "sand", intensity: 1, fog: 0, lightning: false }, wind: { enabled: true, strength: 100, gusts: 0.5 } },
  ashfall: { icon: "fa-solid fa-volcano", weather: { kind: "ash", intensity: 0.6, fog: 0.1, lightning: false }, wind: { enabled: true, strength: 12, gusts: 0.2 } },
  fog: { icon: "fa-solid fa-smog", weather: { kind: "none", intensity: 0, fog: 0.9, lightning: false }, wind: { enabled: true, strength: 4, gusts: 0 } }
};

export const WEATHER_DEFAULTS = Object.freeze({ kind: "none", intensity: 0.6, fog: 0, lightning: false });
