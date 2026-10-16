# Changelog

## 0.3.0

- **Groupes d'effets** : plusieurs effets posés ensemble sous un seul émetteur (une poignée, une fenêtre, une lumière). Sept groupes fournis : feu de camp, forge, feu de cheminée, chaudron, encensoir, cercle rituel, marais.
- Couche principale : elle porte la lumière ; quand le vent la souffle, les braises et les étincelles s'arrêtent, la fumée continue.
- La couleur choisie ne teinte que les couches prévues (la fumée d'un feu violet reste grise).
- Chaque couche réagit au vent, aux murs, aux tokens et à l'obscurité selon son propre effet.
- Section « Couches du groupe » dans les réglages de l'émetteur : retirer un effet ou changer sa densité.
- Sélecteur en deux parties, effets et groupes.
- L'effet « Feu de camp » s'appelle désormais « Feu » ; « Feu de camp » désigne le groupe complet (flammes, braises, fumée). Les émetteurs déjà posés ne changent pas.
- API : `registerGroup`, `getGroup`, `allGroups`, `getGenerators`, et l'option `layers` de `createEmitter`.
- Aperçu : section « Groupes d'effets ».

## 0.2.0

Le moteur Ember devient le moteur par défaut de la version stable (tout ce qui était dans la pré-version va0.1.0), avec en plus les réactions au monde :

- **Les murs arrêtent les particules** (#6) : zone de mouvement de Foundry calculée depuis l'émetteur, mise à jour quand un mur change ou qu'une porte s'ouvre ; les particules ne naissent jamais de l'autre côté d'un mur ; la magie traverse.
- **Les tokens dérangent les effets** (#7) : répulsion, sillage et envol (feuilles et poussière soulevées, lucioles qui fuient), seulement pour les tokens que le joueur voit.
- **Réaction à l'obscurité** (#8) : lucioles seulement dans le noir, flammes et magie plus visibles la nuit, fumée et poussière moins visibles ; suivi en direct des transitions.
- Options par émetteur « Arrêté par les murs », « Dérangé par les tokens », « Réagit à l'obscurité ».
- Choisir le générateur de Foundry dans les réglages ouvre un avertissement listant ce qui est perdu ; un rappel s'affiche au MJ au chargement tant qu'il est actif.
- Aperçu : curseur d'obscurité, pièce fermée avec porte, token qui passe.

## va0.1.0 — variante « moteur maison » (pré-version)

Même base que la 0.1.0, avec le moteur de particules du module :

- Moteur maison au choix du MJ (réglage « Moteur de rendu »), le générateur de Foundry reste disponible.
- Physique pensée pour une carte vue du dessus : hauteur simulée avec perspective, élan radial, tourbillon, retombée au sol.
- Vent de scène (direction, force, rafales) qui déplace les effets et change leur comportement : le feu s'attise, la fumée se dissipe, les lucioles se cachent.
- Flammes fragiles soufflées par le vent, avec bouffée de fumée et rallumage : nouvelle bougie, torche en tempête.
- Lumière adaptative : lumière créée par Ember ou lumière existante liée, qui suit la flamme ; option « Éclaire vraiment » pour l'effet sur la vision.
- 13 effets (ajout de la bougie).

## 0.1.0

- Première version : émetteurs de particules posés sur la scène par le MJ.
- 12 effets : feu de camp, torche, fumée, braises, étincelles, lucioles, aura arcanique, lumière sacrée, brume toxique, bulles, feuilles, poussière.
- Réglages par émetteur : taille, densité, vitesse, rayon, couleur, élévation, actif, caché aux joueurs.
- Liste des émetteurs de la scène, réglage de qualité par joueur.
- API pour les macros et les autres modules.
