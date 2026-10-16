# Changelog

## 0.5.1

- **Correction de la « grosse orbe »** : la lumière d'Ember (torche, feu, bougie…) recevait son rayon en pieds alors que Foundry l'attend en pixels. Une torche qui devait éclairer 8 cases n'éclairait qu'une quarantaine de pixels, d'où un petit disque saturé. Elle éclaire maintenant toute sa portée, avec le halo de l'aperçu. Même correction pour les lumières liées (qui rétrécissaient) et pour l'éclair de la météo.
- Les flammes retrouvent leur rendu lumineux de jour comme de nuit : la tache blanche de la 0.4.3 venait de cette même lumière, pas des particules (l'option `dayBlend` reste disponible pour les presets personnalisés).

## 0.5.0

- Nouvel outil **Sélectionner** (outil par défaut du groupe Ember) : un clic dans la zone d'un effet ouvre ses réglages, un glisser le déplace.
- Au survol, un trait pointillé dessine la zone de l'effet ; tant que sa fenêtre est ouverte, un contour plein montre l'effet en cours de modification.
- Avec l'outil Poser, un clic sur la pastille d'un émetteur l'ouvre au lieu d'en poser un nouveau ; clic droit sur un effet = réglages, quel que soit l'outil.
- Toute la souris (sélection, déplacement, clic droit) passe par le canvas directement, comme la pose depuis la 0.4.2 : le déplacement et l'ouverture des poignées ne dépendent plus des événements de Foundry v14.

## 0.4.3

- Correction : en plein jour sur une carte claire, les flammes (feu, torche, bougie) formaient une grosse tache blanche. Leurs particules s'additionnaient à la couleur du sol jusqu'au blanc. Le jour, elles sont maintenant dessinées avec leurs vraies couleurs ; la nuit, elles redeviennent lumineuses (fusion additive) ; au crépuscule, le passage se fait en douceur (option `dayBlend` des presets).

## 0.4.2

- Correction (pose par clic, suite) : le clic est maintenant lu directement sur le canvas, sans passer par les événements de Foundry, qui ne l'envoyaient pas au module sous v14. Un clic sur une poignée ou un glisser ne pose rien.
- Les boutons de la barre d'outils n'utilisent plus `onClick`, déprécié depuis Foundry v13 (avertissement dans la console).

## 0.4.1

- Correction : cliquer sur la scène avec l'outil « Poser un émetteur » ne créait rien sous Foundry v14 (le clic n'était plus relayé au calque). Le calque capte désormais le clic lui-même ; un glisser (sélection, déplacement de la vue) ne pose rien.
- Correction : un émetteur désactivé ne pouvait plus être réactivé depuis la liste des émetteurs (ses boutons étaient bloqués par la classe « disabled » de Foundry).

## 0.4.0

- **Météo vue du dessus** (#11), moteur Ember : pluie qui tombe vers le sol et éclabousse, neige qui se pose puis fond, tempête de sable au ras du sol, pluie de cendres, brume, éclairs. Le vent de la scène pousse tout.
- Particules accrochées à la carte : elles restent à leur place quand on déplace la vue ou qu'on dézoome. Elles ne naissent que dans la partie visible, et une zone qui apparaît est remplie aussitôt.
- Intérieurs au sec : les régions « Supprimer la météo » de Foundry ne reçoivent ni pluie ni voile.
- **La pluie éteint les feux exposés** (#9) dans un nuage de vapeur, avec rallumage après l'averse ; seuil propre à chaque flamme (bougie, braises, feu, torche). Option « À l'abri de la pluie » par émetteur.
- Éclairs synchronisés sur l'heure du serveur, avec une vraie lumière brève sur toute la scène ; réglage par joueur « Flash des éclairs ».
- Fondus de quelques secondes entre deux météos.
- Pluie vue d'en haut, comme depuis un drone : voile gris qui ternit la scène, rideaux de pluie plus denses qui passent avec le vent et s'épaississent dans les rafales, quelques traits fins qui filent vers le centre de la vue (perspective), impacts au sol bien visibles (petit éclat puis anneau qui s'élargit).
- Tempête de sable : grain fin sur toute la scène qui défile avec le vent, plus dense dans les rafales (pas dans les intérieurs) ; grains étirés dans le sens du vent.
- Fenêtre **Météo et vent de la scène** (remplace la fenêtre du vent) : neuf ambiances toutes prêtes, temps, intensité, brume, éclairs, vent.
- API : `getWeather`, `setWeather`, `applyAmbiance`, `openWeather`.
- Aperçu : section « Météo », avec la pièce fermée qui reste au sec.

## 0.3.0

- **Groupes d'effets** : plusieurs effets posés ensemble sous un seul émetteur (une poignée, une fenêtre, une lumière). Sept groupes fournis : feu de camp, forge, feu de cheminée, chaudron, encensoir, cercle rituel, marais.
- Couche principale : elle porte la lumière ; quand le vent la souffle, les braises et les étincelles s'arrêtent, la fumée continue.
- La couleur choisie ne teinte que les couches prévues (la fumée d'un feu violet reste grise).
- Chaque couche réagit au vent, aux murs, aux tokens et à l'obscurité selon son propre effet.
- Section « Couches du groupe » dans les réglages de l'émetteur : retirer un effet ou changer sa densité.
- Gerbes : un effet peut cracher ses particules par paquets, dans un cône au hasard, au lieu d'un flot continu (option `bursts`). La forge les utilise pour ses étincelles, comme des coups de marteau sur l'enclume. Le générateur de Foundry garde un flot continu.
- Une couche de groupe peut remplacer des valeurs de son effet (`override`).
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
