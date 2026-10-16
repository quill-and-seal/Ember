/**
 * Textures de particules générées à la volée dans un <canvas>.
 * Toutes sont blanches : la couleur vient de la teinte (tint) appliquée par le générateur.
 * Aucune image à charger, donc rien à héberger et aucun problème de chemin.
 */

const SIZE = 64;
const cache = new Map();

function makeCanvas(w = SIZE, h = SIZE) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function radial(ctx, cx, cy, r, stops) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
  return g;
}

const DRAWERS = {
  /** Point lumineux doux : base des braises, lucioles, magie. */
  glow(ctx) {
    const h = SIZE / 2;
    ctx.fillStyle = radial(ctx, h, h, h, [[0, 1], [0.25, 0.85], [0.6, 0.25], [1, 0]]);
    ctx.fillRect(0, 0, SIZE, SIZE);
  },

  /** Cœur très brillant avec halo court : braises incandescentes. */
  ember(ctx) {
    const h = SIZE / 2;
    ctx.fillStyle = radial(ctx, h, h, h, [[0, 1], [0.12, 1], [0.3, 0.45], [1, 0]]);
    ctx.fillRect(0, 0, SIZE, SIZE);
  },

  /** Flamme : goutte étirée vers le haut, bord doux. */
  flame(ctx) {
    const h = SIZE / 2;
    ctx.save();
    ctx.translate(h, h);
    ctx.scale(0.7, 1);
    ctx.fillStyle = radial(ctx, 0, 6, h, [[0, 1], [0.35, 0.7], [0.75, 0.15], [1, 0]]);
    ctx.beginPath();
    ctx.arc(0, 6, h - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  /** Volute de fumée : plusieurs blobs superposés, très diffus. */
  smoke(ctx) {
    const blobs = [[32, 32, 26, 0.5], [22, 28, 16, 0.35], [42, 26, 15, 0.35], [30, 42, 14, 0.3], [40, 40, 12, 0.25]];
    for (const [x, y, r, a] of blobs) {
      ctx.fillStyle = radial(ctx, x, y, r, [[0, a], [0.6, a * 0.5], [1, 0]]);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  /** Étincelle : trait horizontal fin, à aligner sur la vitesse. */
  spark(ctx) {
    const h = SIZE / 2;
    ctx.save();
    ctx.translate(h, h);
    ctx.scale(1, 0.12);
    ctx.fillStyle = radial(ctx, 0, 0, h, [[0, 1], [0.4, 0.8], [1, 0]]);
    ctx.beginPath();
    ctx.arc(0, 0, h, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  /** Scintillement en étoile à quatre branches. */
  star(ctx) {
    const h = SIZE / 2;
    ctx.fillStyle = radial(ctx, h, h, h * 0.35, [[0, 1], [1, 0]]);
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (const rot of [0, Math.PI / 2]) {
      ctx.save();
      ctx.translate(h, h);
      ctx.rotate(rot);
      ctx.scale(1, 0.08);
      ctx.fillStyle = radial(ctx, 0, 0, h, [[0, 1], [0.5, 0.5], [1, 0]]);
      ctx.beginPath();
      ctx.arc(0, 0, h, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  /** Bulle : anneau fin avec reflet. */
  bubble(ctx) {
    const h = SIZE / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(h, h, h - 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.ellipse(h - 9, h - 10, 5, 3, -0.6, 0, Math.PI * 2);
    ctx.fill();
  },

  /** Feuille stylisée avec nervure. */
  leaf(ctx) {
    const h = SIZE / 2;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(h, 6);
    ctx.quadraticCurveTo(SIZE - 8, h, h, SIZE - 6);
    ctx.quadraticCurveTo(8, h, h, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(h, 10);
    ctx.lineTo(h, SIZE - 10);
    ctx.stroke();
  },

  /** Halo de lumière : dégradé très doux et large, pour la lueur portée au sol. */
  light(ctx) {
    const h = SIZE / 2;
    ctx.fillStyle = radial(ctx, h, h, h, [[0, 0.9], [0.2, 0.6], [0.5, 0.22], [0.8, 0.05], [1, 0]]);
    ctx.fillRect(0, 0, SIZE, SIZE);
  },

  /** Éclaboussure de pluie : anneau fin qui s'élargit au sol. */
  ring(ctx) {
    const h = SIZE / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(h, h, h - 6, 0, Math.PI * 2);
    ctx.stroke();
  },

  /** Goutte de pluie vue d'en haut : point net, un peu étiré. */
  drop(ctx) {
    const h = SIZE / 2;
    ctx.save();
    ctx.translate(h, h);
    ctx.scale(1, 0.35);
    ctx.fillStyle = radial(ctx, 0, 0, h, [[0, 1], [0.35, 0.8], [1, 0]]);
    ctx.beginPath();
    ctx.arc(0, 0, h, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  /** Flocon de cendre : éclat irrégulier. */
  ash(ctx) {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    const pts = [[32, 12], [46, 22], [52, 38], [40, 50], [26, 52], [14, 40], [16, 24]];
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  },

  /** Grain de poussière : petit point net. */
  dust(ctx) {
    const h = SIZE / 2;
    ctx.fillStyle = radial(ctx, h, h, h * 0.5, [[0, 1], [0.6, 0.6], [1, 0]]);
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
};

/** Liste des textures disponibles (pour l'éditeur et la validation). */
export const TEXTURE_IDS = Object.keys(DRAWERS);

/**
 * Retourne la texture PIXI demandée, générée une seule fois puis mise en cache.
 * @param {string} id
 * @returns {PIXI.Texture}
 */
export function getParticleTexture(id) {
  const key = DRAWERS[id] ? id : "glow";
  let tex = cache.get(key);
  if (tex && !tex.destroyed) return tex;
  const c = makeCanvas();
  DRAWERS[key](c.getContext("2d"));
  tex = PIXI.Texture.from(c);
  cache.set(key, tex);
  return tex;
}
