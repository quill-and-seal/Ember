/**
 * Calque canvas d'Ember : affiche les poignées des émetteurs pour le MJ et gère la souris.
 *
 * Outils de la barre d'Ember :
 *   - « Sélectionner » : clic dans la zone d'un effet = ouvrir ses réglages, glisser = le déplacer ;
 *   - « Poser » : clic sur la scène = poser l'effet choisi ; un clic sur la pastille d'un
 *     émetteur l'ouvre (et un glisser la déplace) au lieu d'en poser un nouveau.
 * Clic droit sur un émetteur : réglages, quel que soit l'outil.
 *
 * Survol : un trait pointillé dessine la zone de l'effet. Émetteur ouvert : contour plein.
 *
 * Foundry v14 ne relaie pas les clics de la scène au calque : la souris est lue directement
 * sur l'élément HTML du canvas, puis convertie en coordonnées de scène.
 *
 * La classe est créée par une fabrique appelée au hook « init », pour être sûr
 * que les classes du cœur (foundry.canvas.layers) sont disponibles.
 */

import { LAYER_NAME, MODULE_ID } from "./constants.js";
import { getPreset, presetLabel } from "./presets.js";
import { presetRadius } from "./adapter.js";

const HANDLE_RADIUS = 14;
const COLOR_ACCENT = 0xff8a3d;
const COLOR_DISABLED = 0x8a8a8a;
const COLOR_SELECTED = 0xffe2b8;
/** Au-delà de ce déplacement (px écran), ce n'est plus un clic mais un glisser. */
const CLICK_TOLERANCE = 6;

/** Outil actif dans la barre de contrôles (compatible v12 et v13+). */
export function activeToolName() {
  const tool = ui.controls?.tool;
  if (typeof tool === "string") return tool;
  return tool?.name ?? ui.controls?.activeTool ?? null;
}

/** Groupe d'outils actif (« ember » quand la barre d'Ember est ouverte). */
function activeControlName() {
  const control = ui.controls?.control;
  if (typeof control === "string") return control;
  return control?.name ?? ui.controls?.activeControl ?? null;
}

/** Cercle en pointillés (PIXI ne sait pas tracer de pointillés). */
function dashedCircle(g, r, dash = 10, gap = 7) {
  const circumference = Math.PI * 2 * r;
  const n = Math.max(8, Math.floor(circumference / (dash + gap)));
  const step = (Math.PI * 2) / n;
  const on = step * (dash / (dash + gap));
  for (let i = 0; i < n; i++) {
    const a = i * step;
    g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    g.arc(0, 0, r, a, a + on);
  }
}

export function createEmberLayerClass({ manager, openConfig, isOpen = () => false }) {
  const InteractionLayer = foundry.canvas?.layers?.InteractionLayer ?? globalThis.InteractionLayer;

  return class EmberLayer extends InteractionLayer {
    /** Conteneur des poignées. */
    handles = null;

    /** Bouton enfoncé : { x, y (écran), point (scène), id (émetteur visé ou null), button, tool } */
    #press = null;

    /** Glisser-déposer en cours : { id, handle } */
    #drag = null;

    /** Émetteur survolé. */
    #hover = null;

    /** Dernière pose, pour ne pas poser deux fois si Foundry relaie aussi le clic. */
    #lastPlace = 0;

    /** Élément HTML du canvas écouté. */
    #view = null;

    static get layerOptions() {
      return foundry.utils.mergeObject(super.layerOptions, {
        name: LAYER_NAME,
        zIndex: 900
      });
    }

    /* -------------------------------------------- */
    /*  Cycle de vie                                */
    /* -------------------------------------------- */

    async _draw(options) {
      await super._draw?.(options);
      this.handles = this.addChild(new PIXI.Container());
      this.handles.visible = false;
      const view = canvas.app?.view ?? canvas.app?.canvas;
      if (view?.addEventListener) {
        this.#view = view;
        view.addEventListener("pointerdown", this.#onDown);
        view.addEventListener("pointermove", this.#onMove);
        view.addEventListener("pointerup", this.#onUp);
        view.addEventListener("contextmenu", this.#onContext);
      }
      this.refreshHandles();
    }

    async _tearDown(options) {
      this.#press = null;
      this.#drag = null;
      this.#hover = null;
      const view = this.#view;
      view?.removeEventListener("pointerdown", this.#onDown);
      view?.removeEventListener("pointermove", this.#onMove);
      view?.removeEventListener("pointerup", this.#onUp);
      view?.removeEventListener("contextmenu", this.#onContext);
      this.#view = null;
      this.handles = null;
      return super._tearDown?.(options);
    }

    _activate() {
      super._activate?.();
      if (this.handles) this.handles.visible = game.user.isGM;
      this.refreshHandles();
    }

    _deactivate() {
      super._deactivate?.();
      if (this.handles) this.handles.visible = false;
      this.#press = null;
      this.#setHover(null);
    }

    /* -------------------------------------------- */
    /*  Souris                                      */
    /* -------------------------------------------- */

    /** La barre d'Ember est-elle ouverte, pour le MJ ? */
    #emberActive() {
      if (!game.user.isGM) return false;
      const name = activeControlName();
      return !name || name === "ember";
    }

    /** Position de la souris (coordonnées de la fenêtre) → coordonnées de la scène. */
    #toScene(clientX, clientY) {
      try {
        if (typeof canvas.canvasCoordinatesFromClient === "function") return canvas.canvasCoordinatesFromClient({ x: clientX, y: clientY });
      } catch {
        /* repli ci-dessous */
      }
      const rect = this.#view?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
      return canvas.stage.toLocal(new PIXI.Point(clientX - rect.left, clientY - rect.top));
    }

    /**
     * Émetteur sous la souris. Avec l'outil « Sélectionner », toute sa zone compte ;
     * sinon, seulement sa pastille centrale. Le plus proche gagne.
     */
    #hit(point, wholeArea) {
      const zoom = canvas.stage?.scale?.x || 1;
      const grab = (HANDLE_RADIUS + 6) / zoom;
      let best = null;
      let bestD = Infinity;
      for (const e of Object.values(manager.getEmitters())) {
        const d = Math.hypot(e.x - point.x, e.y - point.y);
        const area = wholeArea ? Math.max(grab, (e.radius ?? presetRadius(getPreset(e.preset))) * canvas.dimensions.size) : grab;
        if (d <= area && d < bestD) {
          best = e.id;
          bestD = d;
        }
      }
      return best;
    }

    #onDown = (event) => {
      if ((event.button !== 0 && event.button !== 2) || !this.#emberActive()) return;
      const point = this.#toScene(event.clientX, event.clientY);
      if (!point) return;
      const tool = activeToolName();
      const id = this.#hit(point, tool === "select" || event.button === 2);
      this.#press = { x: event.clientX, y: event.clientY, point, id, button: event.button, tool };
    };

    #onMove = (event) => {
      if (!this.#emberActive()) return this.#setHover(null);
      const press = this.#press;
      const point = this.#toScene(event.clientX, event.clientY);
      if (!point) return;

      // Glisser un émetteur
      if (press?.id && press.button === 0) {
        if (!this.#drag && Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_TOLERANCE) {
          const handle = this.handles?.children?.find((h) => h.emitterId === press.id) ?? null;
          this.#drag = { id: press.id, handle };
        }
        if (this.#drag) {
          this.#drag.handle?.position.set(point.x, point.y);
          manager.moveLive(this.#drag.id, point.x, point.y);
          return;
        }
      }
      if (!press) this.#setHover(this.#hit(point, activeToolName() === "select"));
    };

    #onUp = (event) => {
      const press = this.#press;
      const drag = this.#drag;
      this.#press = null;
      this.#drag = null;
      if (!press || event.button !== press.button || !this.#emberActive()) return;
      const point = this.#toScene(event.clientX, event.clientY);

      // Fin d'un glisser : on enregistre la nouvelle position
      if (drag) {
        let { x, y } = point;
        if (event.shiftKey) {
          try {
            ({ x, y } = canvas.grid.getCenterPoint({ x, y }));
          } catch {
            /* grille sans centre (gridless) */
          }
        }
        manager.update(drag.id, { x: Math.round(x), y: Math.round(y) });
        return;
      }

      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_TOLERANCE) return;

      // Clic sur un émetteur : ses réglages
      if (press.id) {
        openConfig(press.id);
        return;
      }
      // Clic droit dans le vide, ou outil « Sélectionner » dans le vide : rien
      if (press.button !== 0 || press.tool !== "place") return;
      this.#place(press.point);
    };

    /** Pas de menu contextuel du navigateur sur un émetteur. */
    #onContext = (event) => {
      if (!this.#emberActive()) return;
      const point = this.#toScene(event.clientX, event.clientY);
      if (point && this.#hit(point, true)) event.preventDefault();
    };

    /** Clic relayé par Foundry (anciennes versions) : même pose, sans doublon. */
    _onClickLeft(event) {
      super._onClickLeft?.(event);
      const origin = event.interactionData?.origin ?? canvas.mousePosition;
      if (!origin || activeToolName() !== "place" || this.#hit(origin, false)) return;
      this.#place(origin);
    }

    #place(origin) {
      if (!origin || !this.#emberActive() || activeToolName() !== "place") return;
      const now = Date.now();
      if (now - this.#lastPlace < 250) return;
      this.#lastPlace = now;
      const preset = game.settings.get(MODULE_ID, "currentPreset");
      manager.create({ preset, x: Math.round(origin.x), y: Math.round(origin.y) });
    }

    #setHover(id) {
      if (this.#hover === id) return;
      this.#hover = id;
      if (this.#view?.style) this.#view.style.cursor = id ? "pointer" : "";
      this.refreshHandles();
    }

    /* -------------------------------------------- */
    /*  Poignées                                    */
    /* -------------------------------------------- */

    /** Redessine toutes les poignées à partir des flags de la scène. */
    refreshHandles() {
      if (!this.handles || this.#drag) return;
      for (const child of this.handles.removeChildren()) child.destroy({ children: true });
      if (!game.user.isGM) return;
      for (const emitter of Object.values(manager.getEmitters())) {
        this.handles.addChild(this.#createHandle(emitter));
      }
    }

    #createHandle(emitter) {
      const preset = getPreset(emitter.preset);
      const radiusPx = (emitter.radius ?? presetRadius(preset)) * canvas.dimensions.size;
      const color = emitter.enabled && preset ? COLOR_ACCENT : COLOR_DISABLED;
      const selected = isOpen(emitter.id);
      const hovered = this.#hover === emitter.id;

      const handle = new PIXI.Container();
      handle.position.set(emitter.x, emitter.y);
      handle.emitterId = emitter.id;
      handle.alpha = emitter.hidden ? 0.55 : 1;

      // Zone de l'effet : contour plein si sa fenêtre est ouverte, pointillé au survol
      const area = new PIXI.Graphics();
      area.lineStyle(2, color, 0.6).beginFill(color, selected ? 0.12 : 0.06).drawCircle(0, 0, radiusPx).endFill();
      if (selected) {
        area.lineStyle(3, COLOR_SELECTED, 0.95).drawCircle(0, 0, radiusPx + 4);
      } else if (hovered) {
        area.lineStyle(2, COLOR_SELECTED, 0.9);
        dashedCircle(area, radiusPx + 4);
      }
      handle.addChild(area);

      // Pastille centrale
      const dot = new PIXI.Graphics();
      dot.lineStyle(3, selected ? COLOR_SELECTED : color, 1).beginFill(0x1b1410, 0.85).drawCircle(0, 0, HANDLE_RADIUS).endFill();
      dot.beginFill(color, 1).drawCircle(0, 0, 4).endFill();
      handle.addChild(dot);

      // Libellé
      const style = CONFIG.canvasTextStyle?.clone?.() ?? new PIXI.TextStyle({ fill: "#ffffff" });
      style.fontSize = 14;
      const label = new PIXI.Text(emitter.label || presetLabel(emitter.preset), style);
      label.anchor.set(0.5, 0);
      label.position.set(0, HANDLE_RADIUS + 6);
      handle.addChild(label);

      return handle;
    }
  };
}
