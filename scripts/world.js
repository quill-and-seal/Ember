/**
 * Réactions des effets au monde de Foundry (moteur maison uniquement) :
 *   - murs      : zone de mouvement calculée depuis l'émetteur (les portes ouvertes laissent passer) ;
 *   - tokens    : positions et vitesses des tokens visibles, pour les sillages et répulsions ;
 *   - obscurité : niveau d'obscurité de la scène affichée.
 *
 * Tout est calculé sur chaque client, sans rien écrire en base. Un joueur ne voit les
 * particules réagir qu'aux tokens qu'il voit lui-même : un token invisible ne se trahit pas.
 */

import { warn } from "./constants.js";

let wallsWarned = false;

/* -------------------------------------------- */
/*  Murs                                        */
/* -------------------------------------------- */

/**
 * Zone dans laquelle les particules d'un émetteur peuvent se déplacer : le polygone de
 * mouvement de Foundry depuis le centre de l'émetteur (les murs qui bloquent le mouvement
 * l'arrêtent, les portes ouvertes non).
 * @returns {{contains: (x: number, y: number) => boolean} | null}
 */
export function computeWallBounds(x, y, elevation = 0) {
  const Backend = CONFIG.Canvas?.polygonBackends?.move;
  if (!Backend?.create) return null;
  try {
    const polygon = Backend.create({ x, y, elevation }, { type: "move" });
    if (!polygon || typeof polygon.contains !== "function") return null;
    const box = polygon.getBounds?.() ?? null;
    return {
      polygon,
      contains: (px, py) => {
        // Test rapide sur le rectangle englobant, puis test exact
        if (box && (px < box.x || py < box.y || px > box.x + box.width || py > box.y + box.height)) return false;
        return polygon.contains(px, py);
      }
    };
  } catch (err) {
    if (!wallsWarned) warn("Murs ignorés : le calcul de la zone de mouvement a échoué.", err);
    wallsWarned = true;
    return null;
  }
}

/* -------------------------------------------- */
/*  Tokens                                      */
/* -------------------------------------------- */

/** Vitesse au-delà de laquelle on considère un téléport (px/s) : pas de sillage. */
const TELEPORT_SPEED = 3000;

/**
 * Suivi des tokens visibles : position animée et vitesse, recalculées une fois par image
 * et partagées par tous les émetteurs.
 */
export class TokenTracker {
  #state = new Map();
  #list = [];
  #frame = -1;
  #lastTime = 0;

  /** Tokens visibles par ce client, avec vitesse. Calculé une fois par image. */
  list() {
    const ticker = canvas.app?.ticker;
    const frame = ticker?.lastTime ?? performance.now();
    if (frame === this.#frame) return this.#list;
    const dt = Math.max(0.001, (frame - this.#lastTime) / 1000);
    this.#frame = frame;
    this.#lastTime = frame;

    const out = [];
    const seen = new Set();
    for (const token of canvas.tokens?.placeables ?? []) {
      if (!token.visible || token.document?.hidden && !game.user.isGM) continue;
      const w = token.w ?? token.width ?? 0;
      const h = token.h ?? token.height ?? 0;
      const x = (token.x ?? 0) + w / 2;
      const y = (token.y ?? 0) + h / 2;
      const id = token.id ?? token.document?.id;
      seen.add(id);
      const prev = this.#state.get(id);
      let vx = 0;
      let vy = 0;
      if (prev) {
        vx = (x - prev.x) / dt;
        vy = (y - prev.y) / dt;
        if (Math.hypot(vx, vy) > TELEPORT_SPEED) vx = vy = 0;
        // Lissage léger pour éviter les à-coups d'une image à l'autre
        vx = prev.vx * 0.5 + vx * 0.5;
        vy = prev.vy * 0.5 + vy * 0.5;
      }
      this.#state.set(id, { x, y, vx, vy });
      out.push({ x, y, r: Math.max(w, h) / 2, vx, vy });
    }
    for (const id of [...this.#state.keys()]) if (!seen.has(id)) this.#state.delete(id);
    this.#list = out;
    return out;
  }

  /** Tokens assez proches d'un émetteur pour le déranger. */
  near(cx, cy, reach) {
    return this.list().filter((t) => {
      const r = reach + t.r * 3;
      return Math.abs(t.x - cx) < r && Math.abs(t.y - cy) < r;
    });
  }

  clear() {
    this.#state.clear();
    this.#list = [];
  }
}

/* -------------------------------------------- */
/*  Obscurité                                   */
/* -------------------------------------------- */

/** Obscurité de la scène affichée (0 = jour, 1 = nuit), animations de transition comprises. */
export function sceneDarkness() {
  const v =
    canvas.environment?.darknessLevel ??
    canvas.level?.environment?.darknessLevel ??
    canvas.scene?.environment?.darknessLevel ??
    0;
  return Math.min(1, Math.max(0, Number(v) || 0));
}
