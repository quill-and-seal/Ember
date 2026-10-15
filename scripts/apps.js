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
      <footer class="ember-footer">
        <button type="button" data-action="delete" class="ember-danger"><i class="fa-solid fa-trash"></i> ${t("Config.Delete")}</button>
      </footer>`;
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
      elevation: Number(data.elevation) || 0,
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

/** Ouvre (ou ramène au premier plan) la fenêtre de réglages d'un émetteur. */
export function openEmitterConfig(id, manager) {
  const existing = [...openApps].find((app) => app instanceof EmitterConfig && app.emitterId === id);
  if (existing) return existing.bringToFront?.() ?? existing.render({ force: true });
  return new EmitterConfig(id, manager).render({ force: true });
}
