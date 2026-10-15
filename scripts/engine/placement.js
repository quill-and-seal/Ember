/**
 * Placement des conteneurs du moteur maison dans la scène Foundry.
 *
 * Le groupe « primary » de Foundry trie ses enfants par élévation puis par couche
 * (tuiles, dessins, tokens, météo…). Un conteneur prévu pour ce groupe
 * (PrimaryCanvasContainer) permet aux particules de respecter l'élévation :
 * un feu à l'élévation 0 passe sous un token volant, par exemple.
 *
 * Si cette classe n'est pas disponible, on se rabat sur le calque d'interface :
 * les particules s'affichent alors au-dessus de tout, mais elles s'affichent.
 */

import { warn } from "../constants.js";

/** Couche de tri : entre les dessins et les tokens, à élévation égale. */
function sortLayer() {
  const layers = foundry.canvas?.groups?.PrimaryCanvasGroup?.SORT_LAYERS ?? globalThis.PrimaryCanvasGroup?.SORT_LAYERS;
  if (layers?.DRAWINGS !== undefined && layers?.TOKENS !== undefined) {
    return Math.round((layers.DRAWINGS + layers.TOKENS) / 2);
  }
  return 650;
}

let warned = false;

/**
 * Crée un conteneur placé dans la scène, à l'élévation voulue.
 * @param {number} elevation
 * @returns {PIXI.Container}
 */
export function createSceneContainer(elevation = 0) {
  const PrimaryContainer = foundry.canvas?.primary?.PrimaryCanvasContainer ?? globalThis.PrimaryCanvasContainer;

  if (PrimaryContainer && canvas.primary) {
    try {
      const container = new PrimaryContainer();
      container.elevation = elevation;
      container.sortLayer = sortLayer();
      container.sort = 0;
      canvas.primary.addChild(container);
      return container;
    } catch (err) {
      if (!warned) warn("PrimaryCanvasContainer indisponible, repli sur le calque d'interface.", err);
      warned = true;
    }
  }

  const container = new PIXI.Container();
  (canvas.interface ?? canvas.stage).addChild(container);
  return container;
}

/** Horloge de rendu du canvas Foundry. */
export function canvasTicker() {
  return canvas.app?.ticker ?? PIXI.Ticker.shared;
}
