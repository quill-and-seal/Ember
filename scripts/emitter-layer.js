/**
 * Calque canvas d'Ember : affiche les poignées des émetteurs pour le MJ et gère la souris.
 *
 * Outils de la barre d'Ember :
 *   - « Sélectionner » : clic dans la zone d'un effet = ouvrir ses réglages, glisser = le déplacer.
 *     Sur une zone dessinée ouverte : glisser un sommet le déplace, clic sur un bord ajoute un sommet,
 *     clic droit sur un sommet le retire ;
 *   - « Poser » : clic sur la scène = poser l'effet choisi ; un clic sur la pastille d'un
 *     émetteur l'ouvre (et un glisser la déplace) au lieu d'en poser un nouveau ;
 *   - « Zone » : clic = ajouter un point, double-clic ou clic sur le premier point = fermer la forme,
 *     clic droit = retirer le dernier point, Échap = annuler.
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

import { LAYER_NAME, MODULE_ID, t } from "./constants.js";
import { getPreset, presetLabel } from "./presets.js";
import { presetRadius } from "./adapter.js";
import { isZone, zonePoints, pointInPolygon, shapeFromPoints, zoneAllowed } from "./zones.js";

const HANDLE_RADIUS = 14;
const VERTEX_RADIUS = 7;
const COLOR_ACCENT = 0xff8a3d;
const COLOR_DISABLED = 0x8a8a8a;
const COLOR_SELECTED = 0xffe2b8;
/** Au-delà de ce déplacement (px écran), ce n'est plus un clic mais un glisser. */
const CLICK_TOLERANCE = 6;
const DOUBLE_CLICK_MS = 350;

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
  const n = Math.max(8, Math.floor((Math.PI * 2 * r) / (dash + gap)));
  const step = (Math.PI * 2) / n;
  const on = step * (dash / (dash + gap));
  for (let i = 0; i < n; i++) {
    const a = i * step;
    g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    g.arc(0, 0, r, a, a + on);
  }
}

/** Polygone fermé en pointillés (points à plat, relatifs). */
function dashedPolygon(g, pts, dash = 10, gap = 7) {
  for (let i = 0; i < pts.length; i += 2) {
    const j = (i + 2) % pts.length;
    const x0 = pts[i];
    const y0 = pts[i + 1];
    const len = Math.hypot(pts[j] - x0, pts[j + 1] - y0);
    if (!len) continue;
    const ux = (pts[j] - x0) / len;
    const uy = (pts[j + 1] - y0) / len;
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      g.moveTo(x0 + ux * d, y0 + uy * d).lineTo(x0 + ux * e, y0 + uy * e);
    }
  }
}

/** Distance d'un point à un segment. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const k = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + dx * k), py - (ay + dy * k));
}

export function createEmberLayerClass({ manager, openConfig, isOpen = () => false }) {
  const InteractionLayer = foundry.canvas?.layers?.InteractionLayer ?? globalThis.InteractionLayer;

  return class EmberLayer extends InteractionLayer {
    /** Conteneur des poignées. */
    handles = null;

    /** Tracé d'une zone en cours. */
    preview = null;

    /** Bouton enfoncé : { x, y (écran), point (scène), id, vertex, button, tool } */
    #press = null;

    /** Glisser-déposer en cours : { id, handle, vertex? } */
    #drag = null;

    /** Émetteur survolé. */
    #hover = null;

    /** Points (absolus) de la zone en cours de dessin. */
    #drawing = null;
    #cursor = null;
    #lastZoneClick = 0;

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
      this.preview = this.addChild(new PIXI.Graphics());
      const view = canvas.app?.view ?? canvas.app?.canvas;
      if (view?.addEventListener) {
        this.#view = view;
        view.addEventListener("pointerdown", this.#onDown);
        view.addEventListener("pointermove", this.#onMove);
        view.addEventListener("pointerup", this.#onUp);
        view.addEventListener("contextmenu", this.#onContext);
      }
      globalThis.window?.addEventListener?.("keydown", this.#onKey);
      this.refreshHandles();
    }

    async _tearDown(options) {
      this.#press = null;
      this.#drag = null;
      this.#hover = null;
      this.#drawing = null;
      const view = this.#view;
      view?.removeEventListener("pointerdown", this.#onDown);
      view?.removeEventListener("pointermove", this.#onMove);
      view?.removeEventListener("pointerup", this.#onUp);
      view?.removeEventListener("contextmenu", this.#onContext);
      globalThis.window?.removeEventListener?.("keydown", this.#onKey);
      this.#view = null;
      this.handles = null;
      this.preview = null;
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
      this.#cancelDrawing();
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

    #zoom() {
      return canvas.stage?.scale?.x || 1;
    }

    /**
     * Émetteur sous la souris. Avec wholeArea, toute sa zone compte (cercle ou polygone) ;
     * sinon, seulement sa pastille centrale. Le plus proche du centre gagne.
     */
    #hit(point, wholeArea) {
      const grab = (HANDLE_RADIUS + 6) / this.#zoom();
      let best = null;
      let bestD = Infinity;
      for (const e of Object.values(manager.getEmitters())) {
        const d = Math.hypot(e.x - point.x, e.y - point.y);
        let inside = d <= grab;
        if (!inside && wholeArea) {
          inside = isZone(e)
            ? pointInPolygon(zonePoints(e), point.x, point.y)
            : d <= (e.radius ?? presetRadius(getPreset(e.preset))) * canvas.dimensions.size;
        }
        if (inside && d < bestD) {
          best = e.id;
          bestD = d;
        }
      }
      return best;
    }

    /** Sommet d'une zone ouverte sous la souris : { id, index } ou null. */
    #hitVertex(point) {
      const grab = (VERTEX_RADIUS + 5) / this.#zoom();
      for (const e of Object.values(manager.getEmitters())) {
        if (!isZone(e) || !isOpen(e.id)) continue;
        const pts = zonePoints(e);
        for (let i = 0; i < pts.length; i += 2) {
          if (Math.hypot(pts[i] - point.x, pts[i + 1] - point.y) <= grab) return { id: e.id, index: i / 2 };
        }
      }
      return null;
    }

    /** Bord d'une zone ouverte sous la souris : { id, after } (insérer après le sommet « after »). */
    #hitEdge(point) {
      const grab = 8 / this.#zoom();
      for (const e of Object.values(manager.getEmitters())) {
        if (!isZone(e) || !isOpen(e.id)) continue;
        const pts = zonePoints(e);
        for (let i = 0; i < pts.length; i += 2) {
          const j = (i + 2) % pts.length;
          if (segmentDistance(point.x, point.y, pts[i], pts[i + 1], pts[j], pts[j + 1]) <= grab) return { id: e.id, after: i / 2 };
        }
      }
      return null;
    }

    #onDown = (event) => {
      if ((event.button !== 0 && event.button !== 2) || !this.#emberActive()) return;
      const point = this.#toScene(event.clientX, event.clientY);
      if (!point) return;
      const tool = activeToolName();
      if (tool === "zone") {
        this.#press = { x: event.clientX, y: event.clientY, point, id: null, button: event.button, tool };
        return;
      }
      const vertex = this.#hitVertex(point);
      const id = vertex ? vertex.id : this.#hit(point, tool === "select" || event.button === 2);
      this.#press = { x: event.clientX, y: event.clientY, point, id, vertex, button: event.button, tool };
    };

    #onMove = (event) => {
      if (!this.#emberActive()) return this.#setHover(null);
      const press = this.#press;
      const point = this.#toScene(event.clientX, event.clientY);
      if (!point) return;

      if (activeToolName() === "zone") {
        this.#cursor = point;
        this.#drawPreview();
        return;
      }

      // Glisser un émetteur, ou un sommet de zone
      if (press?.id && press.button === 0) {
        if (!this.#drag && Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_TOLERANCE) {
          const handle = this.handles?.children?.find((h) => h.emitterId === press.id) ?? null;
          this.#drag = { id: press.id, handle, vertex: press.vertex };
        }
        if (this.#drag) {
          if (this.#drag.vertex) this.#previewVertex(this.#drag.id, this.#drag.vertex.index, point);
          else {
            this.#drag.handle?.position.set(point.x, point.y);
            manager.moveLive(this.#drag.id, point.x, point.y);
          }
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
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_TOLERANCE;

      if (press.tool === "zone") {
        if (!moved) this.#zoneClick(press.point, press.button);
        return;
      }

      // Fin d'un glisser : nouvelle position de l'émetteur ou du sommet
      if (drag) {
        let { x, y } = point;
        if (event.shiftKey) {
          try {
            ({ x, y } = canvas.grid.getCenterPoint({ x, y }));
          } catch {
            /* grille sans centre (gridless) */
          }
        }
        if (drag.vertex) this.#moveVertex(drag.id, drag.vertex.index, x, y);
        else manager.update(drag.id, { x: Math.round(x), y: Math.round(y) });
        return;
      }
      if (moved) return;

      // Clic droit sur un sommet d'une zone ouverte : on le retire
      if (press.vertex && press.button === 2) return this.#removeVertex(press.vertex.id, press.vertex.index);
      // Clic sur le bord d'une zone ouverte (outil Sélectionner) : nouveau sommet
      if (press.button === 0 && press.tool === "select" && !press.vertex) {
        const edge = this.#hitEdge(press.point);
        if (edge) return this.#insertVertex(edge.id, edge.after, press.point);
      }
      // Clic sur un émetteur : ses réglages
      if (press.id) return openConfig(press.id);
      // Clic droit dans le vide, ou outil « Sélectionner » dans le vide : rien
      if (press.button !== 0 || press.tool !== "place") return;
      this.#place(press.point);
    };

    /** Pas de menu contextuel du navigateur sur un émetteur ni pendant un tracé. */
    #onContext = (event) => {
      if (!this.#emberActive()) return;
      if (this.#drawing) return event.preventDefault();
      const point = this.#toScene(event.clientX, event.clientY);
      if (point && (this.#hit(point, true) || this.#hitVertex(point))) event.preventDefault();
    };

    #onKey = (event) => {
      if (event.key === "Escape" && this.#drawing) {
        this.#cancelDrawing();
        event.stopPropagation?.();
      } else if (event.key === "Enter" && this.#drawing) {
        this.#finishZone();
      }
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
    /*  Dessin d'une zone                           */
    /* -------------------------------------------- */

    #zoneClick(point, button) {
      // Clic droit : retirer le dernier point (ou annuler s'il n'y en a plus)
      if (button === 2) {
        if (!this.#drawing) return;
        this.#drawing.splice(-2, 2);
        if (!this.#drawing.length) this.#cancelDrawing();
        else this.#drawPreview();
        return;
      }
      const preset = game.settings.get(MODULE_ID, "currentPreset");
      if (!this.#drawing && !zoneAllowed(preset, getPreset(preset))) {
        ui.notifications?.warn?.(t("Zone.NotAllowed", { effect: presetLabel(preset) }));
        return;
      }
      const now = Date.now();
      const pts = (this.#drawing ??= []);
      const close = (VERTEX_RADIUS + 6) / this.#zoom();
      // Double-clic, ou clic sur le premier point : on ferme la forme
      const onFirst = pts.length >= 6 && Math.hypot(point.x - pts[0], point.y - pts[1]) <= close;
      const dbl = pts.length >= 6 && now - this.#lastZoneClick < DOUBLE_CLICK_MS;
      this.#lastZoneClick = now;
      if (onFirst || dbl) {
        // Le premier clic du double-clic a déjà posé ce point : on ne le garde pas en double
        if (dbl && pts.length > 6 && Math.hypot(point.x - pts.at(-2), point.y - pts.at(-1)) <= close) pts.splice(-2, 2);
        return this.#finishZone();
      }
      pts.push(Math.round(point.x), Math.round(point.y));
      this.#drawPreview();
    }

    #finishZone() {
      const pts = this.#drawing;
      this.#cancelDrawing();
      if (!pts || pts.length < 6) return;
      const preset = game.settings.get(MODULE_ID, "currentPreset");
      manager.create({ preset, ...shapeFromPoints(pts) });
    }

    #cancelDrawing() {
      this.#drawing = null;
      this.#cursor = null;
      this.preview?.clear?.();
    }

    /** Tracé en cours : points posés, segment jusqu'à la souris, premier point mis en avant. */
    #drawPreview() {
      const g = this.preview;
      if (!g) return;
      g.clear();
      const pts = this.#drawing;
      const z = this.#zoom();
      if (!pts?.length) return;
      g.lineStyle(2 / z, COLOR_SELECTED, 0.95);
      g.beginFill(COLOR_ACCENT, 0.08);
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      if (this.#cursor) g.lineTo(this.#cursor.x, this.#cursor.y);
      g.endFill();
      for (let i = 0; i < pts.length; i += 2) {
        g.lineStyle(2 / z, i ? COLOR_ACCENT : COLOR_SELECTED, 1).beginFill(0x1b1410, 0.9).drawCircle(pts[i], pts[i + 1], (i ? VERTEX_RADIUS : VERTEX_RADIUS + 3) / z).endFill();
      }
    }

    /* -------------------------------------------- */
    /*  Édition des sommets                         */
    /* -------------------------------------------- */

    #absPoints(id) {
      const e = manager.getEmitter(id);
      return e && isZone(e) ? zonePoints(e) : null;
    }

    #previewVertex(id, index, point) {
      const pts = this.#absPoints(id);
      if (!pts) return;
      pts[index * 2] = point.x;
      pts[index * 2 + 1] = point.y;
      const g = this.preview;
      if (!g) return;
      const z = this.#zoom();
      g.clear();
      g.lineStyle(2 / z, COLOR_SELECTED, 0.95).beginFill(COLOR_ACCENT, 0.1).drawPolygon(pts).endFill();
      g.lineStyle(2 / z, COLOR_SELECTED, 1).beginFill(0x1b1410, 0.9).drawCircle(point.x, point.y, VERTEX_RADIUS / z).endFill();
    }

    #saveShape(id, pts) {
      this.preview?.clear?.();
      return manager.update(id, shapeFromPoints(pts));
    }

    #moveVertex(id, index, x, y) {
      const pts = this.#absPoints(id);
      if (!pts) return;
      pts[index * 2] = Math.round(x);
      pts[index * 2 + 1] = Math.round(y);
      return this.#saveShape(id, pts);
    }

    #removeVertex(id, index) {
      const pts = this.#absPoints(id);
      if (!pts || pts.length <= 6) return; // un triangle au minimum
      pts.splice(index * 2, 2);
      return this.#saveShape(id, pts);
    }

    #insertVertex(id, after, point) {
      const pts = this.#absPoints(id);
      if (!pts) return;
      pts.splice((after + 1) * 2, 0, Math.round(point.x), Math.round(point.y));
      return this.#saveShape(id, pts);
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
      const color = emitter.enabled && preset ? COLOR_ACCENT : COLOR_DISABLED;
      const selected = isOpen(emitter.id);
      const hovered = this.#hover === emitter.id;
      const z = this.#zoom();

      const handle = new PIXI.Container();
      handle.position.set(emitter.x, emitter.y);
      handle.emitterId = emitter.id;
      handle.alpha = emitter.hidden ? 0.55 : 1;

      // Zone de l'effet : contour plein si sa fenêtre est ouverte, pointillé au survol
      const area = new PIXI.Graphics();
      if (isZone(emitter)) {
        const pts = emitter.shape.points;
        area.lineStyle(2, color, 0.6).beginFill(color, selected ? 0.12 : 0.06).drawPolygon(pts).endFill();
        if (selected) {
          area.lineStyle(3, COLOR_SELECTED, 0.95).drawPolygon(pts);
          // Sommets modifiables
          for (let i = 0; i < pts.length; i += 2) {
            area.lineStyle(2 / z, COLOR_SELECTED, 1).beginFill(0x1b1410, 0.9).drawCircle(pts[i], pts[i + 1], VERTEX_RADIUS / z).endFill();
          }
        } else if (hovered) {
          area.lineStyle(2, COLOR_SELECTED, 0.9);
          dashedPolygon(area, pts);
        }
      } else {
        const radiusPx = (emitter.radius ?? presetRadius(preset)) * canvas.dimensions.size;
        area.lineStyle(2, color, 0.6).beginFill(color, selected ? 0.12 : 0.06).drawCircle(0, 0, radiusPx).endFill();
        if (selected) {
          area.lineStyle(3, COLOR_SELECTED, 0.95).drawCircle(0, 0, radiusPx + 4);
        } else if (hovered) {
          area.lineStyle(2, COLOR_SELECTED, 0.9);
          dashedCircle(area, radiusPx + 4);
        }
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
