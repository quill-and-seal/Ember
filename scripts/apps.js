/**
 * Fenêtres d'Ember (ApplicationV2, sans template Handlebars) :
 * - EmitterConfig : réglages d'un émetteur
 * - PresetPicker  : choix de l'effet à poser
 * - EmitterList   : liste des émetteurs de la scène
 */

import { MODULE_ID, t } from "./constants.js";
import { allPresets, getPreset, getEffect, presetLabel } from "./presets.js";
import { allGroups, leadIndex } from "./groups.js";
import { WEATHER_KINDS, WEATHER_AMBIANCES } from "./weather-presets.js";
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
    canvas?.ember?.refreshHandles?.();
  }

  _onClose(options) {
    super._onClose?.(options);
    openApps.delete(this);
    canvas?.ember?.refreshHandles?.();
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
    const opt = (id) => `<option value="${esc(id)}" ${id === e.preset ? "selected" : ""}>${esc(presetLabel(id))}</option>`;
    const options = `
      <optgroup label="${esc(t("Picker.Effects"))}">${Object.keys(allPresets()).map(opt).join("")}</optgroup>
      <optgroup label="${esc(t("Picker.Groups"))}">${Object.keys(allGroups()).map(opt).join("")}</optgroup>`;
    // Un groupe peut s'éteindre si l'une de ses couches est une flamme fragile (bougies du cercle rituel)
    const canBlow = preset?.group ? preset.layers.some((l) => getEffect(l.preset)?.blowout) : !!preset?.blowout;
    const behaviorKey = game.i18n.has(`EMBER.WindBehavior.${e.preset}`) ? `EMBER.WindBehavior.${e.preset}` : null;

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
        ${canBlow ? `
        <div class="form-group">
          <label>${t("Config.Blowout")}</label>
          <div class="form-fields"><input type="checkbox" name="blowout" ${e.blowout !== false ? "checked" : ""}></div>
        </div>` : ""}
        <p class="hint ember-wind-reaction"><i class="fa-solid fa-wind"></i> ${t("Config.WindReaction")} : ${esc(behaviorKey ? game.i18n.localize(behaviorKey) : "—")}</p>
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
      ${preset?.group ? this._layersHtml(e, preset) : ""}
      ${this._lightHtml(e, preset)}
      ${this._worldHtml(e, preset)}
      <footer class="ember-footer">
        <button type="button" data-action="delete" class="ember-danger"><i class="fa-solid fa-trash"></i> ${t("Config.Delete")}</button>
      </footer>`;
  }

  /**
   * Section « Couches » d'un groupe : chaque effet du groupe peut être retiré ou rendu
   * plus ou moins dense. Les couches du même effet (les bougies d'un cercle) se règlent ensemble.
   */
  _layersHtml(e, preset) {
    const leadPreset = preset.layers[leadIndex(preset, getEffect)]?.preset;
    const seen = new Map();
    for (const layer of preset.layers) seen.set(layer.preset, (seen.get(layer.preset) ?? 0) + 1);
    const rows = [...seen].map(([id, n]) => {
      const tweak = e.layers?.[id] ?? {};
      const isLead = id === leadPreset;
      const density = tweak.density ?? 1;
      const name = `${esc(presetLabel(id))}${n > 1 ? ` ×${n}` : ""}`;
      return `
        <div class="form-group ember-layer ${tweak.off && !isLead ? "off" : ""}">
          <label>
            <input type="checkbox" name="layer.${esc(id)}.on" ${tweak.off && !isLead ? "" : "checked"} ${isLead ? "disabled" : ""}>
            ${name}${isLead ? ` <i class="fa-solid fa-crown" data-tooltip="${esc(t("Layers.LeadHint"))}"></i>` : ""}
          </label>
          <div class="form-fields ember-range">
            <input type="range" name="layer.${esc(id)}.density" min="0.1" max="3" step="0.05" value="${density}">
            <output>${density}×</output>
          </div>
        </div>`;
    });
    return `
      <fieldset class="ember-layers">
        <legend>${t("Layers.Title")}</legend>
        <p class="hint">${t("Layers.Hint")}</p>
        ${rows.join("")}
      </fieldset>`;
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
    const fearsRain = preset?.group ? preset.layers.some((l) => getEffect(l.preset)?.douse) : !!preset?.douse;
    if (fearsRain) {
      rows.push(`
        <div class="form-group">
          <label>${t("World.Sheltered")}</label>
          <div class="form-fields"><input type="checkbox" name="sheltered" ${e.sheltered ? "checked" : ""}></div>
          <p class="hint">${t("World.ShelteredHint")}</p>
        </div>`);
    }
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
      sheltered: form.querySelector("input[name=sheltered]") ? !!data.sheltered : current.sheltered,
      color: colorInput?.hasAttribute("data-unset") ? null : data.color
    };
    // Le rayon n'est mémorisé que s'il diffère de celui du preset.
    // Changer de preset repart du rayon naturel du nouveau preset.
    const natural = presetRadius(getPreset(changes.preset));
    const radius = Number(data.radius);
    const presetChanged = changes.preset !== current.preset;
    changes.radius = presetChanged || Math.abs(radius - natural) < 0.001 ? null : radius;
    // Couches d'un groupe (remises à zéro quand on change d'effet)
    changes.layers = presetChanged ? null : EmitterConfig.#readLayers(form, current.layers);
    await this.manager.update(this.emitterId, changes);
  }

  /** Lit les réglages de couches du formulaire : { [preset]: { off, density } }. */
  static #readLayers(form, previous) {
    const out = {};
    for (const range of form.querySelectorAll('input[type=range][name^="layer."]')) {
      const id = range.name.slice(6, -".density".length);
      const box = form.querySelector(`input[type=checkbox][name="layer.${CSS.escape(id)}.on"]`);
      const density = Number(range.value);
      const off = box && !box.disabled ? !box.checked : false;
      out[id] = { off, density };
    }
    return Object.keys(out).length ? out : previous ?? null;
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
    const tiles = (entries) =>
      entries
        .map(
          ([id, p]) => `
        <button type="button" class="ember-tile ${id === current ? "active" : ""}" data-action="pick" data-preset="${esc(id)}">
          <i class="${esc(p.icon)}"></i><span>${esc(presetLabel(id))}</span>
        </button>`
        )
        .join("");
    return `
      <p class="hint">${t("Picker.Hint")}</p>
      <h3 class="ember-picker-title">${t("Picker.Effects")}</h3>
      <div class="ember-grid">${tiles(Object.entries(allPresets()))}</div>
      <h3 class="ember-picker-title">${t("Picker.Groups")}</h3>
      <p class="hint">${t("Picker.GroupsHint")}</p>
      <div class="ember-grid">${tiles(Object.entries(allGroups()))}</div>`;
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
        <li class="ember-row ${e.enabled ? "" : "is-off"}" data-id="${esc(e.id)}">
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

export class WeatherConfig extends EmberApp {
  constructor(manager, options = {}) {
    super(options);
    this.manager = manager;
  }

  static DEFAULT_OPTIONS = {
    id: "ember-weather",
    tag: "form",
    classes: ["ember", "ember-wind", "ember-weather"],
    window: { icon: "fa-solid fa-cloud-sun-rain" },
    position: { width: 420, height: "auto" },
    form: { handler: WeatherConfig.#onSubmit, submitOnChange: true, closeOnSubmit: false },
    actions: { compass: WeatherConfig.#onCompass, ambiance: WeatherConfig.#onAmbiance }
  };

  get title() {
    return t("Weather.Title");
  }

  _html() {
    const w = this.manager.getWind();
    const m = this.manager.weather.getWeather();
    const core = game.settings.get(MODULE_ID, "engine") === "core";
    const ambiances = Object.entries(WEATHER_AMBIANCES)
      .map(
        ([id, a]) => `
        <button type="button" class="ember-tile" data-action="ambiance" data-id="${esc(id)}">
          <i class="${esc(a.icon)}"></i><span>${t(`Weather.Ambiance.${id}`)}</span>
        </button>`
      )
      .join("");
    const kinds = WEATHER_KINDS.map((k) => `<option value="${k}" ${m.kind === k ? "selected" : ""}>${t(`Weather.Kind.${k}`)}</option>`).join("");
    const pct = (v) => `${Math.round(v * 100)} %`;
    const rose = COMPASS.map(
      ([label, deg]) =>
        `<button type="button" class="ember-compass-btn ${w.direction === deg ? "active" : ""}" data-action="compass" data-deg="${deg}" style="--deg:${deg}deg">${t(`Wind.Dir.${label}`)}</button>`
    ).join("");
    return `
      ${core ? `<p class="hint ember-engine-note"><i class="fa-solid fa-triangle-exclamation"></i> ${t("Weather.EmberOnly")}</p>` : ""}
      <fieldset>
        <legend>${t("Weather.Ambiances")}</legend>
        <div class="ember-grid ember-ambiances">${ambiances}</div>
      </fieldset>
      <fieldset>
        <legend>${t("Weather.Sky")}</legend>
        <div class="form-group">
          <label>${t("Weather.KindLabel")}</label>
          <div class="form-fields"><select name="kind">${kinds}</select></div>
        </div>
        <div class="form-group">
          <label>${t("Weather.Intensity")}</label>
          <div class="form-fields ember-range">
            <input type="range" name="intensity" min="0.05" max="1" step="0.05" value="${m.intensity}">
            <output>${pct(m.intensity)}</output>
          </div>
        </div>
        <div class="form-group">
          <label>${t("Weather.Fog")}</label>
          <div class="form-fields ember-range">
            <input type="range" name="fog" min="0" max="1" step="0.05" value="${m.fog}">
            <output>${pct(m.fog)}</output>
          </div>
        </div>
        <div class="form-group">
          <label>${t("Weather.Lightning")}</label>
          <div class="form-fields"><input type="checkbox" name="lightning" ${m.lightning ? "checked" : ""}></div>
          <p class="hint">${t("Weather.LightningHint")}</p>
        </div>
        <p class="hint"><i class="fa-solid fa-house"></i> ${t("Weather.Indoors")}</p>
      </fieldset>
      <fieldset>
        <legend>${t("Wind.Title")}</legend>
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
            <output>${pct(w.gusts)}</output>
          </div>
        </div>
      </fieldset>`;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const pct = (v) => `${Math.round(v * 100)} %`;
    const fmt = { direction: (v) => `${v}°`, strength: (v) => v, gusts: pct, intensity: pct, fog: pct };
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
    await this.manager.weather.setWeather({
      kind: d.kind,
      intensity: Number(d.intensity),
      fog: Number(d.fog),
      lightning: !!d.lightning
    });
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

  static async #onAmbiance(event, target) {
    const amb = WEATHER_AMBIANCES[target.dataset.id];
    if (!amb) return;
    await this.manager.weather.setWeather(amb.weather);
    await this.manager.setWind(amb.wind);
  }
}

/** Ancien nom de la fenêtre (le vent fait désormais partie de la météo). */
export const WindConfig = WeatherConfig;

/** Ouvre (ou ramène au premier plan) la fenêtre de réglages d'un émetteur. */
export function openEmitterConfig(id, manager) {
  const existing = [...openApps].find((app) => app instanceof EmitterConfig && app.emitterId === id);
  if (existing) return existing.bringToFront?.() ?? existing.render({ force: true });
  return new EmitterConfig(id, manager).render({ force: true });
}
