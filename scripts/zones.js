/**
 * Zones dessinées : un effet qui remplit un polygone libre au lieu de partir d'un point.
 *
 * Un émetteur en zone garde un centre (x, y : le barycentre de la forme) et une forme :
 *   emitter.shape = { type: "polygon", points: [dx0, dy0, dx1, dy1, ...] }
 * Les points sont relatifs au centre : déplacer la zone, c'est changer x et y.
 *
 * Fonctions pures (sans Foundry), testables.
 */

/** Effets qui n'ont pas de sens étalés sur une zone : une flamme tenue, des étincelles. */
export const POINT_ONLY = new Set(["torch", "candle", "sparks"]);

/** Un preset (ou un groupe) peut-il remplir une zone ? Les presets personnalisés peuvent le refuser (zone: false). */
export function zoneAllowed(id, preset) {
  if (POINT_ONLY.has(id)) return false;
  if (preset?.zone === false) return false;
  // Un groupe suit sa couche principale
  if (preset?.group) {
    const lead = preset.layers?.find((l) => l.lead) ?? preset.layers?.[0];
    if (lead && POINT_ONLY.has(lead.preset)) return false;
  }
  return true;
}

/** L'émetteur est-il une zone dessinée ? */
export function isZone(emitter) {
  return emitter?.shape?.type === "polygon" && (emitter.shape.points?.length ?? 0) >= 6;
}

/** Aire (px²) d'un polygone à plat [x0, y0, x1, y1, ...]. */
export function polygonArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
  }
  return Math.abs(a) / 2;
}

/** Barycentre de la surface d'un polygone (repli : moyenne des sommets). */
export function polygonCentroid(pts) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = pts.length; i < n; i += 2) {
    const j = (i + 2) % n;
    const cross = pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
    a += cross;
    cx += (pts[i] + pts[j]) * cross;
    cy += (pts[i + 1] + pts[j + 1]) * cross;
  }
  if (Math.abs(a) < 1e-6) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < pts.length; i += 2) {
      sx += pts[i];
      sy += pts[i + 1];
    }
    const k = pts.length / 2 || 1;
    return { x: sx / k, y: sy / k };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Point dans le polygone (règle pair-impair). */
export function pointInPolygon(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i];
    const yi = pts[i + 1];
    const xj = pts[j];
    const yj = pts[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export function polygonBounds(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]);
    maxX = Math.max(maxX, pts[i]);
    minY = Math.min(minY, pts[i + 1]);
    maxY = Math.max(maxY, pts[i + 1]);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Points absolus (coordonnées de scène) de la zone d'un émetteur. */
export function zonePoints(emitter, x = emitter.x, y = emitter.y) {
  const rel = emitter.shape.points;
  const out = new Array(rel.length);
  for (let i = 0; i < rel.length; i += 2) {
    out[i] = rel[i] + x;
    out[i + 1] = rel[i + 1] + y;
  }
  return out;
}

/** Distance du centre au sommet le plus éloigné (px) : portée de la zone. */
export function zoneReach(emitter) {
  const p = emitter.shape.points;
  let r = 0;
  for (let i = 0; i < p.length; i += 2) r = Math.max(r, Math.hypot(p[i], p[i + 1]));
  return r;
}

/**
 * Forme d'émetteur à partir de points absolus : centre = barycentre, points relatifs arrondis.
 * @returns {{x: number, y: number, shape: {type: "polygon", points: number[]}}}
 */
export function shapeFromPoints(abs) {
  const c = polygonCentroid(abs);
  const x = Math.round(c.x);
  const y = Math.round(c.y);
  const points = abs.map((v, i) => Math.round(v - (i % 2 ? y : x)));
  return { x, y, shape: { type: "polygon", points } };
}

/** Zone d'apparition pour le moteur : points absolus, rectangle englobant, centre. */
export function polygonSpawnArea(abs) {
  const box = polygonBounds(abs);
  const c = polygonCentroid(abs);
  return { points: abs, box, cx: c.x, cy: c.y, area: polygonArea(abs) };
}
