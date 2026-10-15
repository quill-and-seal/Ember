/**
 * Page d'aperçu d'Ember : fait tourner le vrai moteur et les vrais presets
 * du module dans un navigateur, sans Foundry.
 * Construite par tools/build-preview.mjs en un seul fichier HTML (docs/preview.html).
 */

import { PRESETS } from "../scripts/presets.js";
import { buildConfig, buildArea, finalizeConfig, presetRadius } from "../scripts/adapter.js";
import { getParticleTexture } from "../scripts/textures.js";
import { EmberParticleSystem } from "../scripts/engine/particle-system.js";
import fr from "../lang/fr.json";

const GRID = 100;
const LABELS = fr.EMBER.Preset;

const state = {
  preset: "campfire",
  x: 0,
  y: 0,
  size: 1,
  density: 1,
  speed: 1,
  radius: null,
  color: null
};

const stageEl = document.getElementById("stage");
const app = new PIXI.Application({ resizeTo: stageEl, backgroundAlpha: 0, antialias: true });
stageEl.appendChild(app.view);

const grid = new PIXI.Graphics();
const marker = new PIXI.Graphics();
app.stage.addChild(grid);

let system = null;
let container = null;

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

function drawMarker() {
  const preset = PRESETS[state.preset];
  const r = (state.radius ?? presetRadius(preset)) * GRID;
  marker.clear();
  marker.lineStyle(1.5, 0xe8b46a, 0.35).drawCircle(0, 0, r);
  marker.lineStyle(2, 0xe8b46a, 0.8).moveTo(-6, 0).lineTo(6, 0).moveTo(0, -6).lineTo(0, 6);
  marker.position.set(state.x, state.y);
}

function rebuild() {
  system?.stop({ hard: true });
  container = new PIXI.Container();
  app.stage.addChildAt(container, 1);
  const cfg = finalizeConfig(buildConfig(state, PRESETS[state.preset], { gridPx: GRID }), getParticleTexture);
  system = new EmberParticleSystem(cfg, { container, ticker: app.ticker });
  system.start();
  app.stage.addChild(marker);
  drawMarker();
  renderStats(cfg);
}

function moveTo(x, y) {
  state.x = x;
  state.y = y;
  const area = buildArea(PRESETS[state.preset].area, x, y, GRID, state.radius);
  if (system) {
    system.spawnArea.x = area.x;
    system.spawnArea.y = area.y;
  }
  drawMarker();
}

/* -------------------------------------------- */
/*  Interface                                   */
/* -------------------------------------------- */

function swatch(preset) {
  const stops = preset.color.map(([t, c]) => `${c} ${Math.round(t * 100)}%`).join(", ");
  return `linear-gradient(90deg, ${stops})`;
}

function renderPresets() {
  const list = document.getElementById("presets");
  list.innerHTML = Object.entries(PRESETS)
    .map(
      ([id, p]) => `
      <button type="button" class="preset" data-id="${id}" aria-pressed="${id === state.preset}">
        <span class="swatch" style="background:${swatch(p)}"></span>
        <span>${LABELS[id] ?? id}</span>
      </button>`
    )
    .join("");
}

function renderStats(cfg) {
  const preset = PRESETS[state.preset];
  const motion = [];
  if (preset.lift?.[1] > 0) motion.push("monte");
  if (preset.lift?.[1] < 0 || (preset.height?.[1] ?? 0) > 100) motion.push("descend");
  if (preset.fall) motion.push("retombe");
  if (preset.radial?.[1]) motion.push("rayonne");
  if (preset.swirl?.[1]) motion.push("tourbillonne");
  if (preset.wind) motion.push("vent");
  document.getElementById("stat-max").textContent = cfg.count;
  document.getElementById("stat-rate").textContent = `${Math.round(cfg.spawnRate)}/s`;
  document.getElementById("stat-life").textContent = `${(preset.lifetime[0] / 1000).toFixed(1)}–${(preset.lifetime[1] / 1000).toFixed(1)} s`;
  document.getElementById("stat-motion").textContent = motion.join(", ") || "flotte";
}

function syncControls() {
  const preset = PRESETS[state.preset];
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

document.getElementById("presets").addEventListener("click", (e) => {
  const btn = e.target.closest(".preset");
  if (!btn) return;
  state.preset = btn.dataset.id;
  state.radius = null;
  syncControls();
  rebuild();
});

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
document.getElementById("burst").addEventListener("click", () => {
  for (let i = 0; i < 60; i++) system?._spawn();
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

// Compteur de particules vivantes
setInterval(() => {
  document.getElementById("stat-live").textContent = system?.liveCount ?? 0;
}, 200);

// Démarrage
function center() {
  drawGrid();
  moveTo(Math.round(app.screen.width / 2), Math.round(app.screen.height * 0.62));
}
new ResizeObserver(center).observe(stageEl);
renderPresets();
syncControls();
center();
rebuild();
