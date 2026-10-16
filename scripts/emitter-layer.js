/**
 * Calque canvas d'Ember : affiche les poignées des émetteurs pour le MJ,
 * permet d'en poser (clic), de les déplacer (glisser) et de les éditer
 * (clic droit ou double-clic).
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
const DOUBLE_CLICK_MS = 350;
/** Au-delà de ce déplacement (px écran), ce n'est plus un clic mais un glisser (sélection, déplacement de vue). */
const CLICK_TOLERANCE = 6;

/** Outil actif dans la barre de contrôles (compatible v12 et v13+). */
export function activeToolName() {
  const tool = ui.controls?.tool;
  if (typeof tool === "string") return tool;
  return tool?.name ?? ui.controls?.activeTool ?? null;
}

export function createEmberLayerClass({ manager, openConfig }) {
  const InteractionLayer = foundry.canvas?.layers?.InteractionLayer ?? globalThis.InteractionLayer;

  return class EmberLayer extends InteractionLayer {
    /** Conteneur des poignées. */
    handles = null;

    /** Glisser-déposer en cours. */
    #drag = null;

    /** Dernier clic sur une poignée, pour détecter le double-clic. */
    #lastClick = { id: null, time: 0 };

    /** Pointeur enfoncé sur la scène (pose d'un émetteur). */
    #press = null;

    /** Dernière pose, pour ne pas poser deux fois si Foundry relaie aussi le clic. */
    #lastPlace = 0;

    /** Élément HTML du canvas écouté pour les clics. */
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
      // Foundry v14 ne relaie pas le clic de la scène au calque : on écoute directement
      // la souris sur le canvas (élément HTML), sans dépendre des événements de Foundry.
      const view = canvas.app?.view ?? canvas.app?.canvas;
      if (view?.addEventListener) {
        this.#view = view;
        view.addEventListener("pointerdown", this.#onDomDown);
        view.addEventListener("pointerup", this.#onDomUp);
      }
      this.refreshHandles();
    }

    async _tearDown(options) {
      this.#drag = null;
      this.#press = null;
      this.#view?.removeEventListener("pointerdown", this.#onDomDown);
      this.#view?.removeEventListener("pointerup", this.#onDomUp);
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
    }

    /* -------------------------------------------- */
    /*  Pose d'un émetteur                          */
    /* -------------------------------------------- */

    /** Clic relayé par Foundry (anciennes versions). */
    _onClickLeft(event) {
      super._onClickLeft?.(event);
      const origin = event.interactionData?.origin ?? canvas.mousePosition;
      this.#place(origin);
    }

    /** Outil « Poser » d'Ember sélectionné ? */
    #placing() {
      if (!game.user.isGM || activeToolName() !== "place") return false;
      const control = ui.controls?.control;
      const name = typeof control === "string" ? control : control?.name ?? ui.controls?.activeControl;
      return !name || name === "ember";
    }

    /** Bouton gauche enfoncé sur le canvas. */
    #onDomDown = (event) => {
      if (event.button !== 0 || !this.#placing()) return;
      this.#press = { x: event.clientX, y: event.clientY };
    };

    /** Relâché presque au même endroit : c'est un clic, on pose l'émetteur. */
    #onDomUp = (event) => {
      const press = this.#press;
      this.#press = null;
      if (!press || event.button !== 0 || !this.#placing()) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_TOLERANCE) return;
      const point = this.#toScene(event.clientX, event.clientY);
      if (!point) return;
      // Un clic sur une poignée la sélectionne : il ne pose rien
      const grab = (HANDLE_RADIUS + 6) / (canvas.stage?.scale?.x || 1);
      if (Object.values(manager.getEmitters()).some((e) => Math.hypot(e.x - point.x, e.y - point.y) <= grab)) return;
      this.#place(point);
    };

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

    #place(origin) {
      if (!origin || !this.#placing()) return;
      const now = Date.now();
      if (now - this.#lastPlace < 250) return;
      this.#lastPlace = now;
      const preset = game.settings.get(MODULE_ID, "currentPreset");
      manager.create({ preset, x: Math.round(origin.x), y: Math.round(origin.y) });
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

      const handle = new PIXI.Container();
      handle.position.set(emitter.x, emitter.y);
      handle.emitterId = emitter.id;
      handle.alpha = emitter.hidden ? 0.55 : 1;

      // Zone d'apparition
      const area = new PIXI.Graphics();
      area.lineStyle(2, color, 0.6).beginFill(color, 0.06).drawCircle(0, 0, radiusPx).endFill();
      handle.addChild(area);

      // Pastille centrale cliquable
      const dot = new PIXI.Graphics();
      dot.lineStyle(3, color, 1).beginFill(0x1b1410, 0.85).drawCircle(0, 0, HANDLE_RADIUS).endFill();
      dot.beginFill(color, 1).drawCircle(0, 0, 4).endFill();
      dot.eventMode = "static";
      dot.cursor = "pointer";
      dot.hitArea = new PIXI.Circle(0, 0, HANDLE_RADIUS + 4);
      dot.on("pointerdown", (event) => this.#onHandleDown(event, handle));
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

    /* -------------------------------------------- */
    /*  Interaction avec une poignée                */
    /* -------------------------------------------- */

    #onHandleDown(event, handle) {
      event.stopPropagation();
      const id = handle.emitterId;

      // Clic droit : édition
      if (event.button === 2) {
        openConfig(id);
        return;
      }
      if (event.button !== 0) return;

      // Double-clic : édition
      const now = Date.now();
      if (this.#lastClick.id === id && now - this.#lastClick.time < DOUBLE_CLICK_MS) {
        this.#lastClick = { id: null, time: 0 };
        openConfig(id);
        return;
      }
      this.#lastClick = { id, time: now };

      // Début du glisser-déposer
      const start = event.getLocalPosition(this);
      const onMove = (e) => this.#onDragMove(e);
      const onUp = (e) => this.#onDragEnd(e);
      this.#drag = { id, handle, start, moved: false, onMove, onUp };
      handle.on("globalpointermove", onMove);
      handle.on("pointerup", onUp);
      handle.on("pointerupoutside", onUp);
    }

    #onDragMove(event) {
      const drag = this.#drag;
      if (!drag) return;
      const p = event.getLocalPosition(this);
      if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 4) return;
      drag.moved = true;
      drag.handle.position.set(p.x, p.y);
      manager.moveLive(drag.id, p.x, p.y);
    }

    async #onDragEnd(event) {
      const drag = this.#drag;
      if (!drag) return;
      drag.handle.off("globalpointermove", drag.onMove);
      drag.handle.off("pointerup", drag.onUp);
      drag.handle.off("pointerupoutside", drag.onUp);
      this.#drag = null;
      if (!drag.moved) return;

      let { x, y } = drag.handle.position;
      // Maj enfoncée : aimanter au centre de la case
      if (event.shiftKey) {
        try {
          ({ x, y } = canvas.grid.getCenterPoint({ x, y }));
        } catch {
          /* grille sans centre (gridless) */
        }
      }
      await manager.update(drag.id, { x: Math.round(x), y: Math.round(y) });
    }
  };
}
