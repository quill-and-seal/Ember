/**
 * Fenêtres d'Ember (ApplicationV2, sans template Handlebars) :
 * - EmitterConfig : réglages d'un émetteur
 * - PresetPicker  : choix de l'effet à poser
 * - EmitterList   : liste des émetteurs de la scène
 */

import { MODULE_ID, t } from "./constants.js";
import { allPresets, getPreset, presetLabel } from "./presets.js";
import { presetRadius } from "./adapter.js";

const { ApplicationV2 } = foundry.applications.api;

/** Fenêtres ouvertes, rafraîchies quand les émetteurs changent. */
export const openApps = new Set();

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Classe de base : rendu par chaîne HTML et suivi des fenêtres ouvertes. */
class EmberApp extends ApplicationV2 {
  /** À surcharger : retourne le HTML du contenu. */
  _html() {
    return "";
  }

  async _renderHTML() {
    const div = document.createElement("div");
    div.className = "ember-body";
    div.innerHTML = this._html();
    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    openApps.add(this);
  }

  _onClose(options) {
    super._onClose?.(options);
    openApps.delete(this);
  }

  /** Appelé quand les émetteurs de la scène changent. */
  onEmittersChanged() {
    this.render();
  }
}

/* ============================================ */
/*  Réglages d'un émetteur                      */
/* ============================================ */

export class EmitterConfig extends EmberApp {
  constructor(emitterId, manager, options = {}) {
    super({ id: `ember-config-${emitterId}`, ...options });
    this.emitterId = emitterId;
    this.manager = manager;
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["ember", "ember-config"],
    window: { icon: "fa-solid fa-fire", resizable: false },
    position: { width: 440, height: "auto" },
    form: { handler: EmitterConfig.#onSubmit, submitOnChange: true, closeOnSubmit: false },
    actions: {
      delete: EmitterConfig.#onDelete,
      resetColor: EmitterConfig.#onResetColor,
      resetRadius: EmitterConfig.#onResetRadius
    }
  };

  get title() {
    return t("Config.Title");
  }

  get emitter() {
    return this.manager.getEmitter(this.emitterId);
  }

  onEmittersChanged() {
    if (!this.emitter) return this.close();
    this.render();
  }

  _html() {
    const e = this.emitter;
    if (!e) return `<p>${t("Config.Missing")}</p>`;
    const preset = getPreset(e.preset);
    const radius = e.radius ?? presetRadius(preset);
    const options = Object.keys(allPresets())
      .map((id) => `<option value="${esc(id)}" ${id === e.preset ? "selected" : ""}>${esc(presetLabel(id))}</option>`)
      .join("");

    const range = (name, min, max, step, value, suffix = "×") => `
      <div class="form-group">
        <label>${t(`Config.${name[0].toUpperCase()}${name.slice(1)}`)}</label>
        <div class="form-fields ember-range">
          <input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}">
          <output>${value}${suffix}</output>
        </div>
      </div>`;

    return `
      <div class="form-group">
        <label>${t("Config.Label")}</label>
        <div class="form-fields"><input type="text" name="label" value="${esc(e.label)}" placeholder="${esc(presetLabel(e.preset))}"></div>
      </div>
      <div class="form-group">
        <label>${t("Config.Preset")}</label>
        <div class="form-fields"><select name="preset">${options}</select></div>
      </div>
      <div class="form-group">
        <label>${t("Config.Enabled")}</label>
        <div class="form-fields"><input type="checkbox" name="enabled" ${e.enabled ? "checked" : ""}></div>
      </div>
      <div class="form-group">
        <label>${t("Config.Hidden")}</label>
        <div class="form-fields"><input type="checkbox" name="hidden" ${e.hidden ? "checked" : ""}></div>
        <p class="hint">${t("Config.HiddenHint")}</p>
      </div>
      <fieldset>
        <legend>${t("Config.Look")}</legend>
        ${range("size", 0.25, 4, 0.05, e.size)}
        ${range("density", 0.1, 3, 0.05, e.density)}
        ${range("speed", 0.25, 3, 0.05, e.speed)}
        ${range("windFactor", 0, 2, 0.05, e.windFactor)}
        ${preset?.blowout ? `
        <div class="form-group">
          <label>${t("Config.Blowout")}</label>
          <div class="form-fields"><input type="checkbox" name="blowout" ${e.blowout !== false ? "checked" : ""}></div>
        </div>` : ""}
        <p class="hint ember-wind-reaction"><i class="fa-solid fa-wind"></i> ${t("Config.WindReaction")} : ${esc(game.i18n.has(`EMBER.WindBehavior.${e.preset}`) ? game.i18n.localize(`EMBER.WindBehavior.${e.preset}`) : "—")}</p>
        <div class="form-group">
          <label>${t("Config.Radius")}</label>
          <div class="form-fields ember-range">
            <input type="range" name="radius" min="0.05" max="6" step="0.05" value="${radius}">
            <output>${radius} ${t("Config.Cells")}</output>
            <button type="button" class="icon" data-action="resetRadius" data-tooltip="${t("Config.Reset")}"><i class="fa-solid fa-rotate-left"></i></button>
          </div>
        </div>
        <div class="form-group">
          <label>${t("Config.Color")}</label>
          <div class="form-fields">
            <input type="color" name="color" value="${esc(e.color ?? "#ffffff")}" ${e.color ? "" : "data-unset"}>
            <span class="ember-color-state">${e.color ? "" : t("Config.PresetColors")}</span>
            <button type="button" class="icon" data-action="resetColor" data-tooltip="${t("Config.Reset")}"><i class="fa-solid fa-rotate-left"></i></button>
          </div>
        </div>
        <div class="form-group">
          <label>${t("Config.Elevation")}</label>
          <div class="form-fields"><input type="number" name="elevation" step="any" value="${e.elevation}"></div>
        </div>
      </fieldset>
      ${this._lightHtml(e, preset)}
      ${this._worldHtml(e, preset)}
      <footer class="ember-footer">
        <button type="button" data-action="delete" class="ember-danger"><i class="fa-solid fa-trash"></i> ${t("Config.Delete")}</button>
      </footer>`;
  }

  /** Section « Réactions au monde » : murs, tokens, obscurité. */
  _worldHtml(e, preset) {
    const box = (name, label, hint) => `
        <div class="form-group">
          <label>${label}</label>
          <div class="form-fields"><input type="checkbox" name="${name}" ${e[name] !== false ? "checked" : ""}></div>
          ${hint ? `<p class="hint">${hint}</p>` : ""}
        </div>`;
    const rows = [];
    if (preset?.walls === false) rows.push(`<p class="hint"><i class="fa-solid fa-wand-sparkles"></i> ${t("World.WallsMagic")}</p>`);
    else rows.push(box("walls", t("World.Walls"), t("World.WallsHint")));
    if (preset?.disturb) rows.push(box("tokens", t("World.Tokens"), t(`World.TokensHint`)));
    if (preset?.darkness) {
      const night = Array.isArray(preset.darkness.rate) && preset.darkness.rate[0] === 0;
      rows.push(box("darkness", t("World.Darkness"), night ? t("World.DarknessNight") : t("World.DarknessHint")));
    }
    const core = game.settings.get(MODULE_ID, "engine") === "core" ? `<p class="hint">${t("World.EmberOnly")}</p>` : "";
    return `<fieldset><legend>${t("World.Title")}</legend>${rows.join("")}${core}</fieldset>`;
  }

  /** Section « Lumière » : lumière créée par Ember, lumière existante liée, ou aucune. */
  _lightHtml(e, preset) {
    const mode = e.light ?? "auto";
    const hasLight = !!preset?.light;
    const opt = (value, label) => `<option value="${value}" ${mode === value ? "selected" : ""}>${label}</option>`;
    const size = canvas.dimensions?.size ?? 100;
    const lights = (canvas.lighting?.placeables ?? [])
      .map((l) => ({
        id: l.document.id,
        d: Math.hypot(l.document.x - e.x, l.document.y - e.y) / size,
        dim: l.document.config?.dim ?? 0,
        bright: l.document.config?.bright ?? 0
      }))
      .sort((a, b) => a.d - b.d);
    const lightOptions = lights.length
      ? lights
          .map(
            (l) =>
              `<option value="${esc(l.id)}" ${e.lightLink === l.id ? "selected" : ""}>${t("Light.At", { d: l.d.toFixed(1) })} · ${l.bright}/${l.dim}</option>`
          )
          .join("")
      : `<option value="">${t("Light.NoLights")}</option>`;

    return `
      <fieldset>
        <legend>${t("Light.Title")}</legend>
        <div class="form-group">
          <label>${t("Light.Mode")}</label>
          <div class="form-fields"><select name="light">
            ${opt("auto", hasLight ? t("Light.Auto") : t("Light.AutoNone"))}
            ${opt("linked", t("Light.Linked"))}
            ${opt("off", t("Light.Off"))}
          </select></div>
        </div>
        ${
          mode === "linked"
            ? `<div class="form-group">
          <label>${t("Light.Link")}</label>
          <div class="form-fields"><select name="lightLink">${
            e.lightLink ? "" : `<option value="" selected>—</option>`
          }${lightOptions}</select></div>
          <p class="hint">${t("Light.LinkHint")}</p>
        </div>`
            : ""
        }
        ${
          mode === "auto" && hasLight
            ? `<div class="form-group">
          <label>${t("Light.Vision")}</label>
          <div class="form-fields"><input type="checkbox" name="lightVision" ${e.lightVision !== false ? "checked" : ""}></div>
          <p class="hint">${t("Light.VisionHint")}</p>
        </div>`
            : ""
        }
        ${
          mode !== "off" && (mode === "linked" || hasLight)
            ? `<div class="form-group">
          <label>${t("Light.Scale")}</label>
          <div class="form-fields ember-range">
            <input type="range" name="lightScale" min="0.25" max="3" step="0.05" value="${e.lightScale ?? 1}">
            <output>${e.lightScale ?? 1}×</output>
          </div>
        </div>
        <p class="hint"><i class="fa-solid fa-lightbulb"></i> ${t("Light.Follows")}</p>`
            : ""
        }
        ${game.settings.get(MODULE_ID, "engine") === "core" && mode !== "off" ? `<p class="hint">${t("Light.EmberOnly")}</p>` : ""}
      </fieldset>`;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // Affiche la valeur des curseurs pendant qu'on les déplace.
    for (const input of this.element.querySelectorAll(".ember-range input[type=range]")) {
      const out = input.parentElement.querySelector("output");
      const suffix = input.name === "radius" ? ` ${t("Config.Cells")}` : "×";
      input.addEventListener("input", () => (out.textContent = `${input.value}${suffix}`));
    }
    // Choisir une couleur l'active (sinon on garde les couleurs du preset).
    const color = this.element.querySelector("input[name=color]");
    color?.addEventListener("input", () => color.removeAttribute("data-unset"));
  }

  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    const current = this.emitter;
    if (!current) return;
    const colorInput = form.querySelector("input[name=color]");
    const changes = {
      label: String(data.label ?? "").trim(),
      preset: data.preset,
      enabled: !!data.enabled,
      hidden: !!data.hidden,
      size: Number(data.size),
      density: Number(data.density),
      speed: Number(data.speed),
      windFactor: Number(data.windFactor),
      blowout: data.blowout === undefined ? current.blowout : !!data.blowout,
      elevation: Number(data.elevation) || 0,
      light: data.light ?? current.light,
      lightLink: data.light === "linked" ? data.lightLink || current.lightLink || null : current.lightLink,
      lightScale: data.lightScale === undefined ? current.lightScale : Number(data.lightScale),
      lightVision: data.lightVision === undefined ? current.lightVision : !!data.lightVision,
      walls: form.querySelector("input[name=walls]") ? !!data.walls : current.walls,
      tokens: form.querySelector("input[name=tokens]") ? !!data.tokens : current.tokens,
      darkness: form.querySelector("input[name=darkness]") ? !!data.darkness : current.darkness,
      color: colorInput?.hasAttribute("data-unset") ? null : data.color
    };
    // Le rayon n'est mémorisé que s'il diffère de celui du preset.
    // Changer de preset repart du rayon naturel du nouveau preset.
    const natural = presetRadius(getPreset(changes.preset));
    const radius = Number(data.radius);
    const presetChanged = changes.preset !== current.preset;
    changes.radius = presetChanged || Math.abs(radius - natural) < 0.001 ? null : radius;
    await this.manager.update(this.emitterId, changes);
  }

  static async #onDelete() {
    await this.manager.delete(this.emitterId);
    this.close();
  }

  static async #onResetColor() {
    await this.manager.update(this.emitterId, { color: null });
  }

  static async #onResetRadius() {
    await this.manager.update(this.emitterId, { radius: null });
  }
}

/* ============================================ */
/*  Choix du preset à poser                     */
/* ============================================ */

export class PresetPicker extends EmberApp {
  static DEFAULT_OPTIONS = {
    id: "ember-preset-picker",
    classes: ["ember", "ember-picker"],
    window: { icon: "fa-solid fa-palette" },
    position: { width: 380, height: "auto" },
    actions: { pick: PresetPicker.#onPick }
  };

  get title() {
    return t("Picker.Title");
  }

  _html() {
    const current = game.settings.get(MODULE_ID, "currentPreset");
    const tiles = Object.entries(allPresets())
      .map(
        ([id, p]) => `
        <button type="button" class="ember-tile ${id === current ? "active" : ""}" data-action="pick" data-preset="${esc(id)}">
          <i class="${esc(p.icon)}"></i><span>${esc(presetLabel(id))}</span>
        </button>`
      )
      .join("");
    return `<p class="hint">${t("Picker.Hint")}</p><div class="ember-grid">${tiles}</div>`;
  }

  static async #onPick(event, target) {
    await game.settings.set(MODULE_ID, "currentPreset", target.dataset.preset);
    try {
      ui.controls.activate?.({ control: "ember", tool: "place" });
    } catch {
      /* versions sans activate({control, tool}) */
    }
    this.close();
  }
}

/* ============================================ */
/*  Liste des émetteurs de la scène             */
/* ============================================ */

export class EmitterList extends EmberApp {
  constructor(manager, options = {}) {
    super(options);
    this.manager = manager;
  }

  static DEFAULT_OPTIONS = {
    id: "ember-emitter-list",
    classes: ["ember", "ember-list"],
    window: { icon: "fa-solid fa-list" },
    position: { width: 420, height: "auto" },
    actions: {
      pan: EmitterList.#onPan,
      toggle: EmitterList.#onToggle,
      edit: EmitterList.#onEdit,
      remove: EmitterList.#onRemove
    }
  };

  get title() {
    return t("List.Title");
  }

  _html() {
    const emitters = Object.values(this.manager.getEmitters());
    if (!emitters.length) return `<p class="hint">${t("List.Empty")}</p>`;
    const rows = emitters
      .map((e) => {
        const p = getPreset(e.preset);
        return `
        <li class="ember-row ${e.enabled ? "" : "disabled"}" data-id="${esc(e.id)}">
          <i class="${esc(p?.icon ?? "fa-solid fa-question")}"></i>
          <span class="name">${esc(e.label || presetLabel(e.preset))}${e.hidden ? ` <i class="fa-solid fa-eye-slash" data-tooltip="${t("Config.Hidden")}"></i>` : ""}</span>
          <a data-action="pan" data-tooltip="${t("List.Pan")}"><i class="fa-solid fa-location-crosshairs"></i></a>
          <a data-action="toggle" data-tooltip="${t("List.Toggle")}"><i class="fa-solid ${e.enabled ? "fa-toggle-on" : "fa-toggle-off"}"></i></a>
          <a data-action="edit" data-tooltip="${t("List.Edit")}"><i class="fa-solid fa-sliders"></i></a>
          <a data-action="remove" data-tooltip="${t("Config.Delete")}"><i class="fa-solid fa-trash"></i></a>
        </li>`;
      })
      .join("");
    return `<ul class="ember-rows">${rows}</ul>`;
  }

  static #id(target) {
    return target.closest("[data-id]")?.dataset.id;
  }

  static #onPan(event, target) {
    const e = this.manager.getEmitter(EmitterList.#id(target));
    if (e) canvas.animatePan({ x: e.x, y: e.y });
  }

  static async #onToggle(event, target) {
    const e = this.manager.getEmitter(EmitterList.#id(target));
    if (e) await this.manager.update(e.id, { enabled: !e.enabled });
  }

  static #onEdit(event, target) {
    const id = EmitterList.#id(target);
    if (id) openEmitterConfig(id, this.manager);
  }

  static async #onRemove(event, target) {
    const id = EmitterList.#id(target);
    if (id) await this.manager.delete(id);
  }
}

/* ============================================ */
/*  Vent de la scène                            */
/* ============================================ */

const COMPASS = [
  ["N", 0], ["NE", 45], ["E", 90], ["SE", 135],
  ["S", 180], ["SO", 225], ["O", 270], ["NO", 315]
];

export class WindConfig extends EmberApp {
  constructor(manager, options = {}) {
    super(options);
    this.manager = manager;
  }

  static DEFAULT_OPTIONS = {
    id: "ember-wind",
    tag: "form",
    classes: ["ember", "ember-wind"],
    window: { icon: "fa-solid fa-wind" },
    position: { width: 380, height: "auto" },
    form: { handler: WindConfig.#onSubmit, submitOnChange: true, closeOnSubmit: false },
    actions: { compass: WindConfig.#onCompass }
  };

  get title() {
    return t("Wind.Title");
  }

  _html() {
    const w = this.manager.getWind();
    const rose = COMPASS.map(
      ([label, deg]) =>
        `<button type="button" class="ember-compass-btn ${w.direction === deg ? "active" : ""}" data-action="compass" data-deg="${deg}" style="--deg:${deg}deg">${t(`Wind.Dir.${label}`)}</button>`
    ).join("");
    return `
      <div class="form-group">
        <label>${t("Wind.Enabled")}</label>
        <div class="form-fields"><input type="checkbox" name="enabled" ${w.enabled ? "checked" : ""}></div>
        <p class="hint">${t("Wind.Hint")}</p>
      </div>
      <div class="ember-compass ${w.enabled ? "" : "off"}">
        ${rose}
        <div class="ember-compass-arrow" style="--deg:${w.direction}deg"><i class="fa-solid fa-arrow-up"></i></div>
      </div>
      <div class="form-group">
        <label>${t("Wind.Direction")}</label>
        <div class="form-fields ember-range">
          <input type="range" name="direction" min="0" max="355" step="5" value="${w.direction}">
          <output>${w.direction}°</output>
        </div>
      </div>
      <div class="form-group">
        <label>${t("Wind.Strength")}</label>
        <div class="form-fields ember-range">
          <input type="range" name="strength" min="0" max="150" step="5" value="${w.strength}">
          <output>${w.strength}</output>
        </div>
      </div>
      <div class="form-group">
        <label>${t("Wind.Gusts")}</label>
        <div class="form-fields ember-range">
          <input type="range" name="gusts" min="0" max="1" step="0.05" value="${w.gusts}">
          <output>${Math.round(w.gusts * 100)} %</output>
        </div>
      </div>`;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const fmt = { direction: (v) => `${v}°`, strength: (v) => v, gusts: (v) => `${Math.round(v * 100)} %` };
    const arrow = this.element.querySelector(".ember-compass-arrow");
    for (const input of this.element.querySelectorAll(".ember-range input[type=range]")) {
      const out = input.parentElement.querySelector("output");
      input.addEventListener("input", () => {
        out.textContent = fmt[input.name](Number(input.value));
        if (input.name === "direction") arrow?.style.setProperty("--deg", `${input.value}deg`);
      });
    }
  }

  static async #onSubmit(event, form, formData) {
    const d = formData.object;
    await this.manager.setWind({
      enabled: !!d.enabled,
      direction: Number(d.direction),
      strength: Number(d.strength),
      gusts: Number(d.gusts)
    });
  }

  static async #onCompass(event, target) {
    await this.manager.setWind({ direction: Number(target.dataset.deg), enabled: true });
  }
}

/** Ouvre (ou ramène au premier plan) la fenêtre de réglages d'un émetteur. */
export function openEmitterConfig(id, manager) {
  const existing = [...openApps].find((app) => app instanceof EmitterConfig && app.emitterId === id);
  if (existing) return existing.bringToFront?.() ?? existing.render({ force: true });
  return new EmitterConfig(id, manager).render({ force: true });
}
