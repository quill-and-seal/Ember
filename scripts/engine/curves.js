/**
 * Évaluation des courbes sur la durée de vie d'une particule.
 * Une courbe est un tableau [{time, value}, ...] trié, de time 0 à time 1.
 * Fonctions pures : aucune dépendance à PIXI ni à Foundry.
 */

/**
 * Prépare une courbe pour une évaluation rapide.
 * Accepte un nombre (valeur constante), [min, max], {min, max} ou {curve}.
 * @returns {{times: Float32Array, values: number[]}}
 */
export function compileCurve(input, fallback = 1) {
  if (typeof input === "number") return { times: Float32Array.of(0), values: [input] };
  const curve = input?.curve;
  if (!Array.isArray(curve) || !curve.length) {
    const v = typeof input?.min === "number" ? (input.min + (input.max ?? input.min)) / 2 : fallback;
    return { times: Float32Array.of(0), values: [v] };
  }
  return { times: Float32Array.from(curve, (p) => p.time), values: curve.map((p) => p.value) };
}

/** Index du segment qui contient t (recherche linéaire : les courbes sont courtes). */
function segment(times, t) {
  let i = 0;
  while (i < times.length - 2 && t > times[i + 1]) i++;
  return i;
}

/** Valeur numérique d'une courbe compilée à l'instant t (0..1). */
export function sampleCurve({ times, values }, t) {
  if (values.length === 1 || t <= times[0]) return values[0];
  if (t >= times[times.length - 1]) return values[values.length - 1];
  const i = segment(times, t);
  const k = (t - times[i]) / (times[i + 1] - times[i]);
  return values[i] + (values[i + 1] - values[i]) * k;
}

/** Couleur (0xRRGGBB) d'une courbe compilée à l'instant t, interpolée par canal. */
export function sampleColor({ times, values }, t) {
  if (values.length === 1 || t <= times[0]) return values[0];
  if (t >= times[times.length - 1]) return values[values.length - 1];
  const i = segment(times, t);
  const k = (t - times[i]) / (times[i + 1] - times[i]);
  const a = values[i];
  const b = values[i + 1];
  const lerp = (shift) => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * k);
  };
  return (lerp(16) << 16) | (lerp(8) << 8) | lerp(0);
}

/** Tirage uniforme dans [min, max] (accepte nombre, [min, max] ou {min, max}). */
export function sampleRange(range, rand = Math.random) {
  if (typeof range === "number") return range;
  const min = Array.isArray(range) ? range[0] : range?.min ?? 0;
  const max = Array.isArray(range) ? range[1] ?? min : range?.max ?? min;
  return min + (max - min) * rand();
}
