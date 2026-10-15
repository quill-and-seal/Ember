# Ember

Effets de particules pour **Foundry VTT v14** : feux de camp, torches, fumée, braises, étincelles, lucioles, auras magiques… Le MJ les pose sur la scène, et tous les joueurs les voient.

Ember a deux moteurs de rendu, au choix du MJ dans les réglages du module (« Moteur de rendu ») :

- **Ember (maison, par défaut)** : le moteur du module, pensé pour une carte vue du dessus. Chaque particule a une hauteur simulée : ce qui monte grossit en se rapprochant de la caméra, ce qui retombe rapetisse jusqu'au sol. Dans le plan, les effets rayonnent depuis leur source, tourbillonnent ou suivent le vent. Il démarre préchauffé (un feu est déjà « pris » quand la scène s'ouvre) et ne dépend que des bases de PIXI.
- **Foundry (expérimental)** : le générateur intégré à Foundry v14 (`foundry.canvas.animation.ParticleGenerator`). Il n'a pas de hauteur : la montée, la retombée et le tourbillon sont perdus, l'élan et le vent sont approximés.

Les deux lisent les mêmes presets. Aucune image à télécharger : les textures sont générées à la volée.

**Aperçu sans Foundry** : `docs/preview.html` fait tourner le moteur maison et les presets dans un navigateur. Pour le régénérer : `npm install && npm run build:preview`.

Un module de l'atelier [Quill & Seal](https://github.com/quill-and-seal).

## Installation

Dans Foundry, **Modules complémentaires → Installer un module**, puis colle l'un de ces liens de manifeste :

- **Version stable** (générateur de Foundry) :
  ```
  https://github.com/quill-and-seal/Ember/releases/latest/download/module.json
  ```
- **Variante moteur maison** (vue du dessus, vent, lumière adaptative) :
  ```
  https://github.com/quill-and-seal/Ember/releases/download/va0.1.0/module.json
  ```

Les deux ont le même identifiant (`ember-particles`) : installer l'une remplace l'autre, et les émetteurs déjà posés restent valables.

## Utilisation

1. Active le module dans ton monde.
2. Dans la barre d'outils de gauche, ouvre le groupe **Ember** (icône de flamme).
3. Clique sur **Choisir l'effet à poser** et sélectionne un effet.
4. Avec l'outil **Poser un émetteur**, clique sur la scène.

Sur un émetteur posé :

- **Glisser** la pastille pour le déplacer (maintiens **Maj** pour l'aimanter au centre d'une case).
- **Clic droit** ou **double-clic** pour ouvrir ses réglages : effet, taille, densité, vitesse, rayon, couleur, élévation, actif, caché aux joueurs.

L'outil **Vent de la scène** règle un vent qui pousse tous les effets de la scène : direction (rose des vents), force et rafales. Le vent agit de deux façons :

- **il déplace** les particules : la fumée et les feuilles s'envolent, le feu se couche à peine, la magie l'ignore ;
- **il change le comportement** des effets : un feu s'attise (plus de flammes, plus hautes et plus vives), les braises s'arrachent en masse, la fumée et la brume se dissipent plus vite, les lucioles se cachent, la poussière se soulève. Les rafales font varier ces réactions : le feu se ravive à chaque coup de vent.
- **il souffle les flammes fragiles** : une bougie s'éteint dans un simple courant d'air, une torche seulement dans la tempête. La flamme vacille quand le vent approche de sa limite, s'éteint dans une bouffée de fumée, puis se rallume quand le vent est retombé quelques secondes. Les rafales suivent l'heure du serveur, donc tous les joueurs voient la flamme s'éteindre au même moment. L'option « Le vent peut l'éteindre » se décoche par émetteur.

Chaque émetteur a un curseur « Sensibilité au vent » (0 = abrité, ni déplacé ni attisé). Avec le moteur maison, tout change en direct, sans relancer les effets ; le générateur de Foundry fige la réaction au moment où l'effet est créé.

### Lumière adaptative (moteur Ember)

Les effets qui éclairent (feu de camp, torche, bougie, braises, aura arcanique, lumière sacrée) portent une lumière qui **suit la flamme** : elle s'éteint quand le vent la souffle, éclaire plus fort quand il l'attise, baisse par à-coups quand elle vacille, et prend la couleur imposée à l'émetteur. Dans la section **Lumière** des réglages d'un émetteur :

- **Lumière d'Ember** : une lumière créée automatiquement, avec une portée adaptée à l'effet (torche : 4 cases de lumière vive, 8 de faible). La case **« Éclaire vraiment »** en fait une vraie lumière Foundry qui compte pour la vision (une torche soufflée plonge la zone dans le noir) ; décochée, c'est une simple lueur visuelle.
- **Lier une lumière de la scène** : une lumière déjà posée, choisie dans une liste triée par distance, qui s'éteint, vacille et s'attise avec la flamme.
- **Portée** : multiplie le rayon de la lumière.

Rien n'est écrit en base de données : chaque joueur calcule la lumière de son côté, en phase grâce à l'heure du serveur, et une lumière liée garde son document intact.

L'outil **Émetteurs de la scène** liste tous les émetteurs : centrer la vue, activer/désactiver, régler, supprimer.

Chaque joueur peut réduire la quantité de particules dans les **réglages du module** (« Qualité des particules ») si sa machine peine.

## Effets inclus

Feu de camp · Torche · Bougie · Fumée · Braises · Étincelles · Lucioles · Aura arcanique · Lumière sacrée · Brume toxique · Bulles · Feuilles qui tombent · Poussière en suspension

## API pour les macros

```js
const ember = game.modules.get("ember-particles").api;

// Poser un émetteur
await ember.createEmitter({ preset: "campfire", x: 1200, y: 800, size: 1.5 });

// Lister / modifier / supprimer
const emitters = ember.getEmitters();
await ember.updateEmitter(id, { enabled: false });
await ember.deleteEmitter(id);

// Vent de la scène (direction en degrés : 0 = vers le haut de la carte, 90 = vers la droite)
await ember.setWind({ enabled: true, direction: 225, strength: 60, gusts: 0.4 });

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
