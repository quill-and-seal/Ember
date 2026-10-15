# Ember

Effets de particules pour **Foundry VTT v14** : feux de camp, torches, fumée, braises, étincelles, lucioles, auras magiques… Le MJ les pose sur la scène, et tous les joueurs les voient.

Ember s'appuie sur le générateur de particules intégré à Foundry v14 (`foundry.canvas.animation.ParticleGenerator`) : rendu natif, élévation et ordre d'affichage gérés par le cœur, aucune image à télécharger.

Un module de l'atelier [Quill & Seal](https://github.com/quill-and-seal).

## Installation

Dans Foundry, **Modules complémentaires → Installer un module**, puis colle ce lien de manifeste :

```
https://github.com/quill-and-seal/Ember/releases/latest/download/module.json
```

## Utilisation

1. Active le module dans ton monde.
2. Dans la barre d'outils de gauche, ouvre le groupe **Ember** (icône de flamme).
3. Clique sur **Choisir l'effet à poser** et sélectionne un effet.
4. Avec l'outil **Poser un émetteur**, clique sur la scène.

Sur un émetteur posé :

- **Glisser** la pastille pour le déplacer (maintiens **Maj** pour l'aimanter au centre d'une case).
- **Clic droit** ou **double-clic** pour ouvrir ses réglages : effet, taille, densité, vitesse, rayon, couleur, élévation, actif, caché aux joueurs.

L'outil **Émetteurs de la scène** liste tous les émetteurs : centrer la vue, activer/désactiver, régler, supprimer.

Chaque joueur peut réduire la quantité de particules dans les **réglages du module** (« Qualité des particules ») si sa machine peine.

## Effets inclus

Feu de camp · Torche · Fumée · Braises · Étincelles · Lucioles · Aura arcanique · Lumière sacrée · Brume toxique · Bulles · Feuilles qui tombent · Poussière en suspension

## API pour les macros

```js
const ember = game.modules.get("ember-particles").api;

// Poser un émetteur
await ember.createEmitter({ preset: "campfire", x: 1200, y: 800, size: 1.5 });

// Lister / modifier / supprimer
const emitters = ember.getEmitters();
await ember.updateEmitter(id, { enabled: false });
await ember.deleteEmitter(id);

// Ajouter un effet personnalisé (même format que scripts/presets.js)
ember.registerPreset("frost", {
  label: "Givre",
  icon: "fa-solid fa-snowflake",
  textures: ["star", "glow"],
  area: { shape: "circle", radius: 0.4 },
  count: 40, rate: 12, lifetime: [1500, 2500],
  velocity: { x: [-10, 10], y: [-20, 10] },
  scale: [[0, 0.25], [1, 0.05]],
  alpha: [[0, 0], [0.2, 1], [1, 0]],
  color: [[0, "#ffffff"], [1, "#7fc8ff"]],
  blend: "add",
  rotation: { spread: 180, speed: [-60, 60] },
  drift: 0.3
});
```

## Feuille de route

- [x] Émetteurs posés sur la scène, presets, synchronisation
- [ ] Effets attachés aux tokens (auras qui suivent le token)
- [ ] Effets ponctuels déclenchés (explosions, impacts, projectiles)
- [ ] Météo plein écran (pluie, neige, cendres)
- [ ] Éditeur visuel avec aperçu, presets personnels, export/import JSON

## Publier une version

1. Mets à jour `CHANGELOG.md`.
2. Crée une release GitHub avec un tag `vX.Y.Z`.
3. L'action GitHub met à jour `module.json` et joint `module.json` + `module.zip` à la release.

## Licence

MIT
