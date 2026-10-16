/**
 * Page d'aperçu d'Ember : fait tourner le vrai moteur et les vrais presets
 * du module dans un navigateur, sans Foundry.
 * Construite par tools/build-preview.mjs en un seul fichier HTML (docs/preview.html).
 */

import { PRESETS, getPreset, getEffect } from "../scripts/presets.js";
import { GROUPS, expandEmitter } from "../scripts/groups.js";
import { buildConfig, buildArea, computeWind, finalizeConfig, presetRadius } from "../scripts/adapter.js";
import { getParticleTexture } from "../scripts/textures.js";
import { EmberParticleSystem } from "../scripts/engine/particle-system.js";
import { spawnPuff } from "../scripts/engine/puff.js";
import fr from "../lang/fr.json";

const GRID = 100;
const LABELS = { ...fr.EMBER.Preset, ...fr.EMBER.Group };
const BEHAVIOR = fr.EMBER.WindBehavior;

const state = {
  preset: "campfire",
  x: 0,
  y: 0,
  size: 1,
  density: 1,
  speed: 1,
  radius: null,
  color: null,
  windFactor: 1
};

const wind = { enabled: false, direction: 90, strength: 40, gusts: 0.3 };

/** Réactions au monde simulées dans l'aperçu : obscurité, pièce fermée, token qui passe. */
const world = { darkness: 0.6, room: false, token: false };
const ROOM = { w: 3.2 * GRID, h: 2.4 * GRID, door: 0.9 * GRID };
const TOKEN = { r: 0.4 * GRID, speed: 170, x: 0, dir: 1, vx: 0 };

const stageEl = document.getElementById("stage");
const app = new PIXI.Application({ resizeTo: stageEl, backgroundAlpha: 0, antialias: true });
stageEl.appendChild(app.view);

const grid = new PIXI.Graphics();
const night = new PIXI.Graphics();
const walls = new PIXI.Graphics();
const token = new PIXI.Graphics();
const marker = new PIXI.Graphics();
app.stage.addChild(grid);
app.stage.addChild(night);

/** Couches actives : une pour un effet simple, plusieurs pour un groupe. */
let parts = [];
/** Couche principale (celle qui porte la lumière et l'extinction). */
let system = null;

/* -------------------------------------------- */
/*  Scène                                       */
/* -------------------------------------------- */

function drawGrid() {
  const { width, height } = app.screen;
  grid.clear();
  grid.lineStyle(1, 0xc9a77a, 0.08);
  const ox = (width / 2) % GRID;
  const oy = (height / 2) % GRID;
  for (let x = ox; x < width; x += GRID) grid.moveTo(x, 0).lineTo(x, height);
  for (let y = oy; y < height; y += GRID) grid.moveTo(0, y).lineTo(width, y);
}

function drawNight() {
  night.clear();
  night.beginFill(0x05040a, 0.72 * world.darkness).drawRect(0, 0, app.screen.width, app.screen.height).endFill();
}

/** Pièce centrée sur l'émetteur, avec une porte ouverte au milieu du mur est. */
function roomBounds() {
  const left = state.x - ROOM.w / 2;
  const right = state.x + ROOM.w / 2;
  const top = state.y - ROOM.h / 2;
  const bottom = state.y + ROOM.h / 2;
  const half = ROOM.door / 2;
  return {
    contains(x, y) {
      if (x > left && x < right && y > top && y < bottom) return true;
      // Vu depuis l'émetteur, seule la porte laisse passer : un cône qui s'élargit dehors
      if (x >= right) {
        const spread = half * ((x - state.x) / (right - state.x));
        return Math.abs(y - state.y) < spread;
      }
      return false;
    }
  };
}

function drawWalls() {
  walls.clear();
  if (!world.room) return;
  const left = state.x - ROOM.w / 2;
  const right = state.x + ROOM.w / 2;
  const top = state.y - ROOM.h / 2;
  const bottom = state.y + ROOM.h / 2;
  const half = ROOM.door / 2;
  walls.lineStyle(6, 0xc9a77a, 0.9);
  walls.moveTo(right, state.y - half).lineTo(right, top).lineTo(left, top).lineTo(left, bottom).lineTo(right, bottom).lineTo(right, state.y + half);
  walls.lineStyle(3, 0x8fd18f, 0.9).moveTo(right, state.y - half).lineTo(right + half * 0.9, state.y - half * 1.4);
}

function applyWorld() {
  for (const { sys } of parts) {
    sys.setDarkness(world.darkness);
    sys.setBounds(world.room && sys.config.walls !== false ? roomBounds() : null);
  }
  drawNight();
  drawWalls();
  token.visible = world.token;
  document.getElementById("dark-out").textContent = `${Math.round(world.darkness * 100)} %`;
  const preset = getPreset(state.preset);
  const notes = [];
  if (preset.walls === false) notes.push("traverse les murs (magie)");
  if (preset.disturb) notes.push("dérangé par les tokens");
  if (Array.isArray(preset.darkness?.rate) && preset.darkness.rate[0] === 0) notes.push("n'apparaît que dans l'obscurité");
  else if (preset.darkness) notes.push("change avec l'obscurité");
  document.getElementById("world-behavior").textContent = notes.join(", ") || "aucune réaction particulière";
}

function drawMarker() {
  const preset = getPreset(state.preset);
  const r = (state.radius ?? presetRadius(preset)) * GRID;
  marker.clear();
  marker.lineStyle(1.5, 0xe8b46a, 0.35).drawCircle(0, 0, r);
  marker.lineStyle(2, 0xe8b46a, 0.8).moveTo(-6, 0).lineTo(6, 0).moveTo(0, -6).lineTo(0, 6);
  marker.position.set(state.x, state.y);
}

function rebuild() {
  for (const { sys } of parts) sys.stop({ hard: true });
  parts = [];
  system = null;
  // Même découpage en couches que dans Foundry (couche principale d'abord)
  const layers = expandEmitter(state, getEffect, GRID).sort((a, b) => b.lead - a.lead);
  let lead = null;
  for (const part of layers) {
    const container = new PIXI.Container();
    app.stage.addChildAt(container, 2 + parts.length);
    const cfg = finalizeConfig(buildConfig(part.emitter, part.preset, { gridPx: GRID, wind, glow: part.lead }), getParticleTexture);
    cfg.walls = part.preset.walls;
    const sys = new EmberParticleSystem(cfg, {
      container,
      ticker: app.ticker,
      gate: part.follow && lead ? () => lead.lit : null,
      getDisturbers: () => (world.token ? [{ x: TOKEN.x, y: state.y, r: TOKEN.r, vx: TOKEN.vx, vy: 0 }] : []),
      onExtinguish: ({ x, y }) => {
        const puffLayer = new PIXI.Container();
        app.stage.addChildAt(puffLayer, 2);
        spawnPuff({ container: puffLayer, ticker: app.ticker, x, y, getTexture: getParticleTexture, wind: sys.config.wind, size: part.emitter.size });
      }
    });
    if (part.lead) lead = sys;
    parts.push({ sys, part });
  }
  system = lead ?? parts[0]?.sys ?? null;
  applyWorld();
  for (const { sys } of parts) sys.start();
  app.stage.addChild(walls);
  app.stage.addChild(token);
  app.stage.addChild(marker);
  drawMarker();
  renderStats();
  applyWind();
  applyWorld();
}

/** Applique le vent en direct, comme le fait le module dans Foundry. */
function applyWind() {
  // Chaque couche réagit au vent selon son propre effet
  for (const { sys, part } of parts) {
    const { wind: v, gust, airflow } = computeWind(part.emitter, part.preset, wind, { gridPx: GRID });
    sys.setWind(v, gust, airflow);
  }
  document.getElementById("wind-behavior").textContent = BEHAVIOR[state.preset] ?? "—";
  document.getElementById("wind-arrow").style.setProperty("--deg", `${wind.direction}deg`);
  document.getElementById("wind-dir-out").textContent = `${wind.direction}°`;
  document.getElementById("wind-strength-out").textContent = wind.strength;
  document.getElementById("wind-gusts-out").textContent = `${Math.round(wind.gusts * 100)} %`;
  document.getElementById("wind-factor-out").textContent = `${getPreset(state.preset).windFactor ?? 1}×`;
  document.getElementById("wind-panel").classList.toggle("off", !wind.enabled);
}

function moveTo(x, y) {
  state.x = x;
  state.y = y;
  for (const { sys, part } of parts) {
    const area = buildArea(part.preset.area, x + part.dx, y + part.dy, GRID, part.emitter.radius);
    sys.spawnArea.x = area.x;
    sys.spawnArea.y = area.y;
    part.emitter.x = x + part.dx;
    part.emitter.y = y + part.dy;
    if (world.room && sys.config.walls !== false) sys.setBounds(roomBounds());
  }
  drawWalls();
  drawMarker();
}

/* -------------------------------------------- */
/*  Interface                                   */
/* -------------------------------------------- */

function swatch(preset) {
  const stops = preset.color.map(([t, c]) => `${c} ${Math.round(t * 100)}%`).join(", ");
  return `linear-gradient(90deg, ${stops})`;
}

/** Pastille d'un groupe : une bande par couche. */
function groupSwatch(group) {
  const colors = group.layers.map((l) => PRESETS[l.preset]).filter(Boolean).map((p) => p.color[Math.floor(p.color.length / 2)][1]);
  const unique = [...new Set(colors)];
  const step = 100 / unique.length;
  return `linear-gradient(90deg, ${unique.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(", ")})`;
}

function renderPresets() {
  const tile = (id, bg) => `
      <button type="button" class="preset" data-id="${id}" aria-pressed="${id === state.preset}">
        <span class="swatch" style="background:${bg}"></span>
        <span>${LABELS[id] ?? id}</span>
      </button>`;
  document.getElementById("presets").innerHTML = Object.entries(PRESETS).map(([id, p]) => tile(id, swatch(p))).join("");
  document.getElementById("groups").innerHTML = Object.entries(GROUPS).map(([id, g]) => tile(id, groupSwatch(g))).join("");
}

function renderStats() {
  const preset = system ? parts.find((p) => p.sys === system).part.preset : getPreset(state.preset);
  const motion = [];
  if (preset.lift?.[1] > 0) motion.push("monte");
  if (preset.lift?.[1] < 0 || (preset.height?.[1] ?? 0) > 100) motion.push("descend");
  if (preset.fall) motion.push("retombe");
  if (preset.radial?.[1]) motion.push("rayonne");
  if (preset.swirl?.[1]) motion.push("tourbillonne");
  if (preset.wind) motion.push("vent");
  const sum = (k) => parts.reduce((a, { sys }) => a + (sys.config[k] ?? 0), 0);
  document.getElementById("stat-max").textContent = Math.round(sum("count"));
  document.getElementById("stat-rate").textContent = `${Math.round(sum("spawnRate"))}/s`;
  const counts = new Map();
  for (const { part } of parts) counts.set(part.emitter.preset, (counts.get(part.emitter.preset) ?? 0) + 1);
  document.getElementById("layers-out").textContent =
    parts.length > 1 ? `Couches : ${[...counts].map(([id, n]) => `${LABELS[id] ?? id}${n > 1 ? ` ×${n}` : ""}`).join(", ")}` : "";
  document.getElementById("stat-life").textContent = `${(preset.lifetime[0] / 1000).toFixed(1)}–${(preset.lifetime[1] / 1000).toFixed(1)} s`;
  document.getElementById("stat-motion").textContent = motion.join(", ") || "flotte";
}

function syncControls() {
  const preset = getPreset(state.preset);
  const radius = state.radius ?? presetRadius(preset);
  for (const [id, value, fmt] of [
    ["size", state.size, (v) => `${v}×`],
    ["density", state.density, (v) => `${v}×`],
    ["speed", state.speed, (v) => `${v}×`],
    ["radius", radius, (v) => `${v} case${v >= 2 ? "s" : ""}`]
  ]) {
    document.getElementById(id).value = value;
    document.getElementById(`${id}-out`).textContent = fmt(value);
  }
  document.getElementById("color").value = state.color ?? preset.color[Math.floor(preset.color.length / 2)][1];
  document.getElementById("color-state").textContent = state.color ? "couleur imposée" : "couleurs de l'effet";
  for (const b of document.querySelectorAll(".preset")) b.setAttribute("aria-pressed", b.dataset.id === state.preset);
}

for (const listId of ["presets", "groups"]) {
  document.getElementById(listId).addEventListener("click", (e) => {
    const btn = e.target.closest(".preset");
    if (!btn) return;
    state.preset = btn.dataset.id;
    state.radius = null;
    syncControls();
    rebuild();
  });
}

for (const id of ["size", "density", "speed", "radius"]) {
  const input = document.getElementById(id);
  input.addEventListener("input", () => {
    state[id] = Number(input.value);
    syncControls();
  });
  input.addEventListener("change", rebuild);
}

document.getElementById("color").addEventListener("input", (e) => {
  state.color = e.target.value;
  syncControls();
});
document.getElementById("color").addEventListener("change", rebuild);
document.getElementById("color-reset").addEventListener("click", () => {
  state.color = null;
  syncControls();
  rebuild();
});
document.getElementById("wind-on").addEventListener("change", (e) => {
  wind.enabled = e.target.checked;
  applyWind();
});
for (const [id, key] of [["wind-dir", "direction"], ["wind-strength", "strength"], ["wind-gusts", "gusts"]]) {
  document.getElementById(id).addEventListener("input", (e) => {
    wind[key] = Number(e.target.value);
    applyWind();
  });
}

document.getElementById("dark").addEventListener("input", (e) => {
  world.darkness = Number(e.target.value);
  applyWorld();
});
document.getElementById("room-on").addEventListener("change", (e) => {
  world.room = e.target.checked;
  applyWorld();
});
document.getElementById("token-on").addEventListener("change", (e) => {
  world.token = e.target.checked;
  TOKEN.x = state.x - 3 * GRID;
  TOKEN.dir = 1;
  applyWorld();
});

// Le token fait des allers-retours sur la ligne de l'émetteur
token.beginFill(0x3d6fb0, 0.85).drawCircle(0, 0, TOKEN.r).endFill();
token.lineStyle(3, 0xdfe9f7, 0.9).drawCircle(0, 0, TOKEN.r);
token.visible = false;
app.ticker.add(() => {
  if (!world.token) return;
  const dt = app.ticker.deltaMS / 1000;
  const span = 3 * GRID;
  TOKEN.vx = TOKEN.speed * TOKEN.dir;
  TOKEN.x += TOKEN.vx * dt;
  if (TOKEN.x > state.x + span) TOKEN.dir = -1;
  if (TOKEN.x < state.x - span) TOKEN.dir = 1;
  token.position.set(TOKEN.x, state.y);
});

document.getElementById("burst").addEventListener("click", () => {
  for (const { sys } of parts) for (let i = 0; i < Math.ceil(60 / parts.length); i++) sys._spawn();
});

// Déplacer l'émetteur : clic ou glisser sur la scène
let dragging = false;
const pointer = (e) => {
  const r = app.view.getBoundingClientRect();
  moveTo(e.clientX - r.left, e.clientY - r.top);
};
app.view.addEventListener("pointerdown", (e) => {
  dragging = true;
  app.view.setPointerCapture(e.pointerId);
  pointer(e);
});
app.view.addEventListener("pointermove", (e) => dragging && pointer(e));
app.view.addEventListener("pointerup", () => (dragging = false));

// Compteur de particules vivantes et intensité ressentie (rafales comprises)
setInterval(() => {
  document.getElementById("stat-live").textContent = parts.reduce((a, { sys }) => a + sys.liveCount, 0);
  const light = system?.config.glow ? system.getLight() : null;
  document.getElementById("stat-light").textContent = light ? `${Math.round(light.level * 100)} %` : "aucune";
  const r = system?._react;
  const fragile = parts.filter(({ sys }) => sys.config.blowout).map(({ sys }) => sys);
  let flame = "";
  if (fragile.length > 1) flame = ` · ${fragile.filter((s) => s.lit).length}/${fragile.length} allumées`;
  else if (fragile.length) flame = fragile[0].lit ? (fragile[0]._flicker > 0 ? " · vacille" : " · allumée") : " · éteinte";
  document.getElementById("wind-live").textContent =
    (wind.enabled && r ? `débit ${r.rate.toFixed(2)}× · taille ${r.scale.toFixed(2)}×` : "calme") + flame;
}, 200);

// Démarrage
function center() {
  drawGrid();
  drawNight();
  moveTo(Math.round(app.screen.width / 2), Math.round(app.screen.height * 0.62));
}
new ResizeObserver(center).observe(stageEl);
renderPresets();
syncControls();
center();
rebuild();
