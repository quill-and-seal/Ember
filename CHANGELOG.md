# Changelog

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
