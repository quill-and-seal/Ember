# Ember

Effets de particules pour **Foundry VTT v14** : feux de camp, torches, fumée, braises, étincelles, lucioles, auras magiques… Le MJ les pose sur la scène, et tous les joueurs les voient.

Ember a deux moteurs de rendu, au choix du MJ dans les réglages du module (« Moteur de rendu ») :

- **Ember (recommandé, par défaut)** : le moteur du module, pensé pour une carte vue du dessus. Chaque particule a une hauteur simulée : ce qui monte grossit en se rapprochant de la caméra, ce qui retombe rapetisse jusqu'au sol. Dans le plan, les effets rayonnent depuis leur source, tourbillonnent ou suivent le vent. Il démarre préchauffé (un feu est déjà « pris » quand la scène s'ouvre) et ne dépend que des bases de PIXI.
- **Foundry (expérimental)** : le générateur intégré à Foundry v14 (`foundry.canvas.animation.ParticleGenerator`). Il n'a pas de hauteur : la montée, la retombée et le tourbillon sont perdus, l'élan et le vent sont approximés, et l'extinction, la lumière adaptative et les réactions au monde ne fonctionnent pas. Le choisir dans les réglages ouvre un avertissement qui liste ce qui est perdu.

Les deux lisent les mêmes presets. Aucune image à télécharger : les textures sont générées à la volée.

**Aperçu sans Foundry** : `docs/preview.html` fait tourner le moteur maison et les presets dans un navigateur. Pour le régénérer : `npm install && npm run build:preview`.

Un module de l'atelier [Quill & Seal](https://github.com/quill-and-seal).

## Installation

Dans Foundry, **Modules complémentaires → Installer un module**, puis colle ce lien de manifeste :

```
https://github.com/quill-and-seal/Ember/releases/latest/download/module.json
```

Depuis la 0.2.0, la version stable utilise le moteur Ember. La pré-version va0.1.0 reste disponible mais n'est plus mise à jour.

## Utilisation

1. Active le module dans ton monde.
2. Dans la barre d'outils de gauche, ouvre le groupe **Ember** (icône de flamme).
3. Clique sur **Choisir l'effet à poser** et sélectionne un effet.
4. Avec l'outil **Poser un émetteur**, clique sur la scène.

Sur un émetteur posé :

- **Glisser** la pastille pour le déplacer (maintiens **Maj** pour l'aimanter au centre d'une case).
- **Clic droit** ou **double-clic** pour ouvrir ses réglages : effet, taille, densité, vitesse, rayon, couleur, élévation, actif, caché aux joueurs.

L'outil **Météo et vent de la scène** règle un vent qui pousse tous les effets de la scène : direction (rose des vents), force et rafales. Le vent agit de deux façons :

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

### Réactions au monde (moteur Ember)

Les effets réagissent à la scène, sans rien écrire en base de données. Chaque réaction se décoche dans la section **Réactions au monde** des réglages d'un émetteur.

- **Les murs arrêtent les particules** : la fumée reste dans la pièce et s'accumule contre les murs, et ne sort que par les portes ouvertes. Ouvrir ou fermer une porte met à jour la zone tout de suite. Les effets magiques (aura arcanique, lumière sacrée) traversent les murs.
- **Les tokens dérangent les effets** : un token qui traverse une fumée ou une brume l'écarte et y laisse un sillage, il soulève les feuilles et la poussière, et les lucioles le fuient. Seuls les tokens que le joueur voit comptent : un token invisible ne se trahit pas par les particules.
- **L'obscurité de la scène compte** : les lucioles n'apparaissent que dans le noir, les flammes, braises et magies ressortent la nuit, la fumée et la poussière s'y voient moins. Les transitions de jour à nuit sont suivies en direct.

### Météo (moteur Ember)

L'outil **Météo et vent de la scène** règle le temps qu'il fait, pour tous les joueurs :

- **Ambiances** toutes prêtes, qui règlent la météo et le vent d'un clic : temps clair, bruine, averse, orage, neige légère, blizzard, tempête de sable, pluie de cendres, brouillard.
- **Temps** : pluie, neige, tempête de sable ou pluie de cendres, avec son intensité. **Brume** : un curseur à part, qui peut accompagner n'importe quel temps. **Éclairs** : à cocher.
- Pensée pour la **vue du dessus** : la pluie tombe vers le sol (les gouttes rapetissent en descendant) et éclabousse en petits anneaux, la neige se pose puis fond, le sable file au ras du sol, les cendres tourbillonnent en tombant. Le vent de la scène pousse tout.
- Les particules sont **accrochées à la carte**, comme les tokens : quand on déplace la vue ou qu'on dézoome, chaque goutte reste à sa place sur la scène. Elles ne naissent que dans la partie visible (plus une marge), et une zone qui apparaît à l'écran est remplie tout de suite : aucun trou au dézoom. Le réglage « Qualité des particules » plafonne leur nombre.
- **Les intérieurs restent au sec** : il ne pleut pas dans les régions qui ont le comportement « Supprimer la météo » de Foundry, et le voile de la météo n'y passe pas.
- **La pluie éteint les feux exposés** dans un nuage de vapeur, puis ils se rallument un moment après l'averse : une bougie ne tient pas sous la bruine, un feu de camp résiste à l'averse mais pas à l'orage, une torche tient presque tout. Un feu dans un intérieur reste allumé ; l'option « À l'abri de la pluie » d'un émetteur fait de même ailleurs (auvent, tente).
- **Éclairs** : ils illuminent toute la scène un court instant (une vraie lumière, qui compte pour la vision), au même moment pour tous les joueurs. Chaque joueur peut couper le flash dans ses réglages (« Flash des éclairs ») s'il est sensible aux lumières clignotantes.
- Les changements de météo passent par un **fondu** de quelques secondes ; en arrivant sur une scène où il pleut déjà, la pluie est là tout de suite.

La météo d'Ember ne fonctionne qu'avec le moteur Ember. Avec le générateur de Foundry, la météo intégrée de la scène reste disponible ; évite de cumuler les deux.

### Groupes d'effets

Un groupe pose plusieurs effets ensemble sous **un seul émetteur** : une seule poignée à déplacer, une seule fenêtre de réglages, une seule lumière. Le sélecteur les propose sous les effets simples.

| Groupe | Couches |
|---|---|
| Feu de camp | flammes, braises, fumée |
| Forge | flammes, gerbes d'étincelles (comme des coups de marteau), braises, un peu de fumée |
| Feu de cheminée | flammes, braises, fumée légère |
| Chaudron | petit feu, bulles, vapeur |
| Encensoir | braises, fumée d'encens |
| Cercle rituel | aura arcanique et six bougies en cercle |
| Marais | brume toxique, bulles, lucioles |

- La **couche principale** (la flamme du feu de camp) porte la lumière. Quand le vent la souffle, les couches qui en dépendent s'arrêtent (les braises) et la fumée continue.
- La taille, la densité, la vitesse et le rayon de l'émetteur s'appliquent à toutes les couches ; agrandir le rayon du cercle rituel écarte les bougies.
- La couleur choisie colore les flammes, pas la fumée : un feu violet fume gris. Dans le chaudron, c'est l'inverse : la couleur teinte les bulles et la vapeur, le feu reste orange.
- Chaque couche garde ses propres réactions au vent, aux murs, aux tokens et à l'obscurité : sous le vent, la fumée part bien plus loin que les flammes.
- La section **Couches du groupe** de la fenêtre de réglages permet de retirer un effet du groupe ou de changer sa densité.

L'outil **Émetteurs de la scène** liste tous les émetteurs : centrer la vue, activer/désactiver, régler, supprimer.

Chaque joueur peut réduire la quantité de particules dans les **réglages du module** (« Qualité des particules ») si sa machine peine.

## Effets inclus

Feu · Torche · Bougie · Fumée · Braises · Étincelles · Lucioles · Aura arcanique · Lumière sacrée · Brume toxique · Bulles · Feuilles qui tombent · Poussière en suspension

Groupes : Feu de camp · Forge · Feu de cheminée · Chaudron · Encensoir · Cercle rituel · Marais

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

// Météo : kind = "none" | "rain" | "snow" | "sand" | "ash", intensité et brume de 0 à 1
await ember.setWeather({ kind: "rain", intensity: 0.8, fog: 0.2, lightning: true });
// ou une ambiance toute prête (météo + vent) : clear, drizzle, shower, storm, snow, blizzard, sandstorm, ashfall, fog
await ember.applyAmbiance("storm");

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

// Poser un groupe, sans les braises et avec une fumée plus épaisse
await ember.createEmitter({ preset: "bonfire", x: 1200, y: 800, layers: { embers: { off: true }, smoke: { density: 2 } } });

// Ajouter un groupe personnalisé (même format que scripts/groups.js)
ember.registerGroup("brazier", {
  label: "Brasero",
  icon: "fa-solid fa-fire-burner",
  layers: [
    { preset: "campfire", lead: true, size: 0.6 },
    { preset: "embers", follow: true, density: 0.5 },
    { preset: "smoke", tint: false, density: 0.3, offset: { x: 0, y: -0.2 } }
  ]
});
```

## Feuille de route

- [x] Émetteurs posés sur la scène, presets, synchronisation
- [x] Moteur Ember vue du dessus, vent, extinction, lumière adaptative, réactions au monde
- [x] Groupes d'effets (feu de camp, forge, chaudron…)
- [ ] Effets attachés aux tokens (auras qui suivent le token)
- [ ] Effets ponctuels déclenchés (explosions, impacts, projectiles)
- [x] Météo vue du dessus (pluie, neige, sable, cendres, brume, éclairs), intérieurs au sec, la pluie éteint les feux
- [ ] Éditeur visuel avec aperçu, presets personnels, export/import JSON

## Publier une version

1. Mets à jour `CHANGELOG.md`.
2. Crée une release GitHub avec un tag `vX.Y.Z`.
3. L'action GitHub met à jour `module.json` et joint `module.json` + `module.zip` à la release.

## Licence

MIT
