# Plan de développement — Module « section-uls » (vérification de sections en béton armé)

**Projet parent :** Aedificium web
**Objet :** module de vérification de sections en béton armé et précontraint à parité fonctionnelle avec VCASLU (Prof. P. Gelfi, Université de Brescia), reconstruit à partir des fondements mécaniques et rebasé sur l'Eurocode 2.
**Destinataire :** Claude Code (agent de développement)
**Auteur du cahier des charges :** note préparée pour un usage bureau d'études / TFE, à valider par l'ingénieur du projet.

---

## 0. Avertissement et périmètre de responsabilité

Ce module est un outil d'aide au calcul. La vérification finale et la responsabilité des résultats incombent à l'ingénieur du projet. Aucun résultat produit par le module ne doit être présenté comme certain sans confrontation à un calcul de référence. Le développement n'implique aucune reproduction du code source de VCASLU, qui est un logiciel propriétaire fermé ; le module est reconstruit à partir de la mécanique des sections (compatibilité des déformations, lois constitutives normatives, intégration des contraintes), qui relève du domaine public. VCASLU sert uniquement de banc de comparaison a posteriori.

---

## 1. Décision normative fondatrice

Le référentiel primaire est **l'EN 1992-1-1 (Eurocode 2)**. VCASLU se réfère au cadre italien NTC ; nous ne le reproduisons pas, nous nous en servons pour la validation croisée. Pour que ces comparaisons tombent sur les mêmes valeurs, **la norme doit être une couche de configuration**, jamais une valeur codée en dur.

Le module expose donc un objet `NormProfile` paramétrant au minimum :

- coefficients partiels des matériaux `γc`, `γs` (EN 1992-1-1 §2.4.2.4, tableau 2.1N : valeurs recommandées 1,5 et 1,15, susceptibles d'être modifiées par annexe nationale) ;
- coefficient `αcc` sur la résistance du béton (§3.1.6(1)P, éq. 3.15 ; valeur recommandée 1,0, **à confirmer selon l'annexe nationale belge NBN et luxembourgeoise ILNAS**) ;
- choix de la loi béton (parabole-rectangle, bilinéaire, ou bloc rectangulaire) et de ses paramètres `εc2`, `εcu2`, exposant `n`, ou `λ`, `η` (§3.1.7) ;
- choix de la loi acier (branche horizontale sans limite de déformation, ou branche inclinée avec `εud`, valeur recommandée `0,9·εuk`, §3.2.7) ;
- classe de ductilité de l'acier A/B/C et rapports `(ft/fy)k`, `εuk` (annexe C).

Trois profils sont livrés d'origine : `EC2_recommended`, `EC2_NBN`, `EC2_ILNAS` (ces deux derniers avec les paramètres d'annexe nationale à renseigner et vérifier), plus un profil `NTC2018` utilisé exclusivement pour la validation face à VCASLU. **Réserve à lever avec l'utilisateur :** confirmer les valeurs exactes d'annexe nationale (`αcc`, éventuels `γ` modifiés) avant tout usage réel.

---

## 2. Périmètre fonctionnel visé (parité VCASLU)

Objectif de couverture, par ordre de priorité de développement :

1. Vérification à l'ELU en flexion composée **droite** (N + M autour d'un axe), section rectangulaire, puis géométrie polygonale quelconque, armatures disposées librement.
2. Vérification à l'ELU en flexion composée **déviée** (N + Mx + My), axe neutre incliné.
3. Tracé des **domaines d'interaction résistants** : diagramme N-M et diagramme Mx-My à effort normal fixé.
4. Calcul du **taux d'exploitation** par homothétie radiale du point sollicitant sur le domaine.
5. **Méthode n** (section fissurée homogénéisée, vérification des contraintes de service béton et acier). Solveur distinct de l'ELU.
6. **Précontrainte** (câbles avec pré-déformation, adhérente).
7. **Diagramme M-N avec contrôle de ductilité** (fonctionnalité VcaSlu 7.8).
8. **Sections existantes** avec facteurs de confiance et bibliothèque de matériaux historiques.
9. **Import DXF** de la géométrie et des armatures.
10. Sauvegarde et rechargement d'une section (format `.slu.json` propre au module).

Les points 1 à 4 constituent le noyau utile couvrant l'essentiel de l'usage courant. Les points 5 à 10 amènent la parité complète.

---

## 3. Principes d'architecture

**Séparation stricte noyau / interface.** Le noyau de calcul (`core/`) est écrit en TypeScript pur, sans aucune dépendance à un framework ni au DOM. Il est testable en isolation et réutilisable ailleurs dans Aedificium web. La couche `ui/` (rendu canvas/SVG, formulaires) consomme le noyau via une API publique unique (`core/index.ts`).

**Calcul 100 % côté client.** Aucune donnée ne quitte le navigateur, ce qui répond à la contrainte de confidentialité. Aucun appel réseau dans le noyau.

**Fonctionnement hors-ligne.** Empaquetage PWA (manifeste + service worker) pour usage local complet, si le module est déployable de façon autonome. S'il est intégré à la coquille PWA d'Aedificium web, réutiliser celle du parent.

**Norme en configuration, pas en dur.** Voir section 1. Aucune constante numérique normative ne doit apparaître dans une formule ; toutes proviennent du `NormProfile`.

**Réserve d'intégration à confirmer :** la pile technique d'Aedificium web (framework UI, langage, gestionnaire de paquets) n'est pas connue de ce plan. Le noyau est volontairement agnostique. Adapter la couche `ui/` au framework réellement employé par le parent ; si Aedificium est en JavaScript simple, transpiler le noyau TypeScript.

---

## 4. Modèle de données

Types du noyau, à définir dans `core/model/` :

- `Material.Concrete` : `fck`, `γc`, `αcc`, loi et paramètres dérivés `fcd`, `εc2`, `εcu2`, `n` (calculés selon EN 1992-1-1 tableau 3.1, y compris la branche haute résistance `fck > 50 MPa`).
- `Material.Steel` : `fyk`, `γs`, `Es`, classe de ductilité, `εuk`, `εud`, choix branche horizontale/inclinée, `fyd`.
- `Material.Prestress` : `fpk`, `fp0,1k`, `Ep`, pré-déformation `εp0` (état après pertes, donné en entrée).
- `Geometry.Polygon` : liste ordonnée de sommets `(y, z)` ; support des contours multiples (trous) via aire algébrique.
- `Rebar` : position `(y, z)`, aire, matériau acier.
- `Tendon` : position `(y, z)`, aire, matériau précontraint, `εp0`.
- `Section` : géométrie + armatures + câbles + matériau béton.
- `Action` : `NEd`, `MEd,y`, `MEd,z` (convention de signe documentée et unique dans tout le module).
- `NormProfile` : voir section 1.

Convention géométrique recommandée : repère barycentrique de la section brute de béton, `z` vertical, moments définis par la règle de la main droite. À documenter en tête de `model/` et à ne jamais changer implicitement.

---

## 5. Spécification du moteur de calcul

C'est le cœur du module et la partie la plus exigeante. Les principes mécaniques ci-dessous doivent guider l'implémentation.

### 5.1 Hypothèses

Conservation des sections planes (hypothèse de Bernoulli). Le champ de déformation est linéaire sur la section et s'écrit, en tout point `(y, z)` :

`ε(y, z) = ε0 + χy·z − χz·y`

où `ε0` est la déformation au barycentre et `χy`, `χz` les courbures. Adhérence parfaite acier-béton (et câble-béton pour la précontrainte adhérente). Béton non résistant en traction pour la résistance ultime.

### 5.2 Lois constitutives (EN 1992-1-1)

Béton, au choix selon `NormProfile` :

- parabole-rectangle, §3.1.7(1), éq. 3.17 et 3.18 ;
- bilinéaire, §3.1.7(2) ;
- bloc rectangulaire équivalent, §3.1.7(3), facteurs `λ` et `η`.

Pour `fck ≤ 50 MPa` : `εc2 = 2,0 ‰`, `εcu2 = 3,5 ‰`, `n = 2`, `λ = 0,8`, `η = 1,0`. Pour `fck > 50 MPa`, implémenter les expressions du tableau 3.1 (`εc2`, `εcu2`, `n`, `λ`, `η` variables) ; ne pas figer les valeurs basses résistances.

Acier, §3.2.7, éq. 3.8 : bilinéaire, branche supérieure horizontale (déformation non bornée) ou inclinée écrouissante avec limite `εud`. `fyd = fyk/γs`.

Précontrainte : loi §3.3.6, avec décalage de la loi par la pré-déformation `εp0` du câble (la déformation totale du câble est `εp0 + ε(y,z)`).

### 5.3 Intégration des contraintes sur la section

Deux stratégies, à implémenter dans `core/integration/` :

- **Méthode des fibres (par défaut, robuste et générale).** Pour un axe neutre d'orientation donnée, faire tourner le repère de sorte que l'axe neutre soit horizontal, découper la section en bandes fines parallèles à l'axe neutre, évaluer la contrainte béton au centre de chaque bande, sommer pour obtenir la résultante de compression et son moment. Convergence contrôlée par le nombre de bandes ; ce nombre est un paramètre exposé (VCASLU discrétise en petits rectangles selon un principe analogue).
- **Intégration analytique sur le polygone (option, section rectangulaire et cas simples).** Intégration exacte de la loi contrainte-déformation sur les trapèzes du contour ; utile comme contrôle de convergence de la méthode des fibres.

Les armatures et câbles sont traités comme des contributions ponctuelles ajoutées aux résultantes béton (contrainte évaluée à la position de la barre, multipliée par son aire ; retrancher le béton déplacé si l'on ne veut pas le compter deux fois, choix à documenter).

Résultantes du champ de contrainte : `N_R`, `M_R,y`, `M_R,z`.

### 5.4 Solveur ELU flexion droite (session 1 à 2)

Pour un effort normal `NEd` imposé et une flexion autour d'un seul axe, l'inconnue est la position de l'axe neutre. Chercher, par une méthode de bissection ou de Newton robuste, la position telle que `N_R(x) = NEd`, avec le champ de déformation calé sur une configuration limite (un pivot en `εcu2` côté béton comprimé ou en `εud` côté acier tendu, selon le diagramme des pivots). En déduire `M_Rd`.

### 5.5 Solveur ELU flexion déviée (session 3)

Les inconnues sont la position **et** l'inclinaison de l'axe neutre. Résoudre le système à deux équations (`N_R = NEd` et direction du moment résistant alignée sur la direction du moment sollicitant) par Newton-Raphson à deux paramètres, avec jacobien numérique et garde-fous de convergence (bornes, amortissement, repli sur bissection imbriquée). Le champ de déformation reste calé sur une configuration limite (pivot actif).

### 5.6 Domaines d'interaction et taux d'exploitation (session 4)

Construire la **surface de rupture** en balayant l'ensemble des configurations limites (pivots A, B, C au sens du diagramme des pivots), chaque configuration fournissant un triplet `(N_R, M_R,y, M_R,z)`. Les tranches de cette surface donnent le diagramme N-M (flexion droite) et le diagramme Mx-My à `N` fixé.

Taux d'exploitation par **homothétie radiale** : pour un point sollicitant `S = (NEd, MEd,y, MEd,z)`, chercher le scalaire `α` tel que `α·S` appartienne à la surface de rupture (chargement proportionnel). Le taux d'exploitation vaut `1/α` ; la section est vérifiée si `α ≥ 1`. Documenter l'hypothèse de proportionnalité et prévoir aussi le mode « `N` constant, `M` proportionnel » utilisé en pratique pour les poteaux.

### 5.7 Méthode n (session 6)

Vérification élastique en service, à ne jamais confondre avec l'ELU. Section fissurée homogénéisée avec coefficient d'équivalence `n = Es/Ec` (ou valeur conventionnelle configurable). Chercher l'axe neutre annulant le moment statique de la section homogénéisée fissurée (béton tendu négligé) compatible avec l'excentricité de l'effort. En déduire les contraintes linéaires `σc` (fibre comprimée) et `σs` (barres), à comparer aux limites de service (par exemple `k1·fck`, `k3·fyk` selon EN 1992-1-1 §7.2, valeurs recommandées à paramétrer). Solveur distinct de l'ELU.

### 5.8 Contrôle de ductilité (session 7)

Vérifier la profondeur relative de l'axe neutre `xu/d` et la déformation de l'acier tendu au droit de la rupture. Relier aux limites de redistribution et de ductilité (EN 1992-1-1 §5.5 et annexe C selon la classe A/B/C). Produire le diagramme M-N avec repérage des zones de ductilité suffisante ou insuffisante.

---

## 6. Découpage en sessions pour Claude Code

Chaque session se termine par une **porte de validation** (definition of done) explicite. Ne pas passer à la session suivante tant que la porte n'est pas franchie et documentée dans `tests/`.

### Session 1 — Socle, matériaux, ELU rectangulaire droit
- Mise en place du dépôt, TypeScript, outillage de test (Vitest ou équivalent), lint.
- `core/model/` (types de la section 4), `NormProfile` avec profil `EC2_recommended`.
- Lois béton (parabole-rectangle) et acier (bilinéaire) avec dérivation correcte des paramètres, y compris branche `fck > 50 MPa`.
- Solveur ELU flexion droite pour section rectangulaire (méthode des fibres).
- API publique minimale : `verifyUniaxial(section, action, norm)`.
- **Porte de validation :** recalcul manuel indépendant d'une poutre rectangulaire simplement fléchie (montré dans `tests/handcalc/`), écart sur `M_Rd` inférieur à un seuil fixé (par exemple 1 %). Aucune formule ne renvoie d'erreur.

### Session 2 — Géométrie polygonale quelconque
- Support d'un contour polygonal arbitraire et de contours multiples (trous).
- Armatures et câbles à positions libres.
- Généralisation de l'intégration par fibres à la géométrie polygonale.
- Ajout de l'intégration analytique de contrôle pour le cas rectangulaire.
- **Porte de validation :** pour une section rectangulaire modélisée comme polygone, résultat identique à la session 1 (contrôle de non-régression). Contrôle de convergence : la méthode des fibres tend vers l'intégration analytique quand le nombre de bandes augmente.

### Session 3 — Flexion composée déviée
- Solveur à deux paramètres (position + inclinaison de l'axe neutre), Newton-Raphson robuste.
- Gestion des pivots dans le cas dévié.
- **Porte de validation :** cas de flexion déviée d'un poteau carré à armatures symétriques ; symétrie du résultat vérifiée (une sollicitation à 45° doit donner des composantes égales). Comparaison à un calcul manuel simplifié montré.

### Session 4 — Domaines d'interaction et taux d'exploitation
- Construction de la surface de rupture par balayage des pivots.
- Diagrammes N-M et Mx-My.
- Taux d'exploitation par homothétie radiale, modes « proportionnel » et « N constant ».
- Rendu graphique canvas/SVG des domaines avec le point sollicitant.
- **Porte de validation :** un point manifestement intérieur donne un taux inférieur à 1, un point sur le contour donne un taux voisin de 1 (tolérance fixée). Cohérence entre le taux et l'appartenance géométrique au domaine tracé.

**À l'issue de la session 4, l'outil de vérification ELU est pleinement fonctionnel et couvre l'essentiel de l'usage de VCASLU.**

### Session 5 — Interface utilisateur et saisie
- Formulaires de saisie de la section, des matériaux, des armatures et des actions ; cellules d'entrée visuellement distinctes des sorties.
- Éditeur graphique de la géométrie (saisie de sommets, placement d'armatures).
- Affichage des résultats avec unités, formule symbolique et note explicative pour chaque grandeur clé.
- Sauvegarde/rechargement au format `.slu.json`.
- **Porte de validation :** un cas complet se saisit, se calcule, se sauvegarde et se recharge à l'identique dans le navigateur, sans appel réseau.

### Session 6 — Méthode n (service)
- Solveur élastique de section fissurée homogénéisée, distinct de l'ELU.
- Contraintes `σc`, `σs` et comparaison aux limites de service paramétrées.
- **Porte de validation :** distinction ELU / service clairement matérialisée dans l'interface et les résultats. Recalcul manuel d'un cas de flexion simple en méthode n, écart documenté.

### Session 7 — Précontrainte et contrôle de ductilité
- Introduction de la pré-déformation des câbles dans le champ de déformation.
- Diagramme M-N avec contrôle de ductilité (`xu/d`, déformation acier, classes A/B/C).
- **Porte de validation :** section précontrainte simple confrontée à un calcul manuel ; le contrôle de ductilité classe correctement une section sur-armée fragile et une section normalement armée ductile.

### Session 8 — Sections existantes et bibliothèque de matériaux
- Facteurs de confiance et matériaux historiques.
- Bibliothèque de matériaux éditable (béton, acier, précontrainte).
- **Porte de validation :** application correcte du facteur de confiance sur les résistances ; bibliothèque persistée localement.

### Session 9 — Import DXF
- Lecture d'un DXF, extraction du contour et des armatures.
- Mapping vers le modèle de section.
- **Porte de validation :** un DXF de test produit une section géométriquement conforme, contrôlée visuellement et par comparaison d'aire et de barycentre.

### Session 10 — PWA, empaquetage, suite de validation finale
- Manifeste, service worker, fonctionnement hors-ligne (si déploiement autonome).
- Intégration propre dans la coquille d'Aedificium web.
- Consolidation de la suite de validation (voir section 7).
- **Porte de validation :** application installable et utilisable hors-ligne ; suite de validation complète au vert ; rapport de validation généré.

### Sessions 11+ — Réserve
Robustesse numérique aux cas dégénérés (traction pure, compression centrée, section quasi entièrement comprimée), performance sur grands polygones, ergonomie, export de note de calcul. À planifier selon les besoins réels après la session 10.

---

## 7. Stratégie de validation

La crédibilité de l'outil pour un TFE ou un usage professionnel repose sur la validation, qui doit être traitée comme un livrable de premier rang et non comme une formalité.

Trois niveaux :

1. **Calculs manuels indépendants**, écrits dans `tests/handcalc/` et montrés, pour au moins un cas par session (poutre fléchie, poteau en flexion composée, section en méthode n).
2. **Banc d'essai externe.** L'ouvrage d'E. Di Cello, *Progetto e verifica di sezioni in c.a. soggette a flessione, pressoflessione e taglio allo SLU* (Dario Flaccovio), contient une cinquantaine d'exercices commentés dont les résultats sont confrontés à VCASLU. Ces exercices fournissent des sections de référence pour valider l'implémentation cas par cas, en profil `NTC2018` afin que les valeurs coïncident.
3. **Contrôles de cohérence internes.** Convergence de la méthode des fibres vers l'intégration analytique ; concordance entre le taux d'exploitation et l'appartenance géométrique au domaine ; symétries attendues ; non-régression entre sessions.

Tout écart entre deux méthodes ou deux sources doit être expliqué et sa cause identifiée, la source faisant foi étant désignée. Ne jamais masquer un écart.

---

## 8. Arborescence cible du dépôt

```
aedificium-web/
  modules/
    section-uls/
      core/
        model/            types Section, Material, Action, NormProfile
        norms/            profils EC2_recommended, EC2_NBN, EC2_ILNAS, NTC2018
        constitutive/     lois béton, acier, précontrainte
        geometry/         polygone, contours multiples, barres, câbles
        integration/      fibres, intégrale analytique
        solvers/          uls-uniaxial, uls-biaxial, method-n
        domain/           surface de rupture, N-M, Mx-My, taux, ductilité
        io/               serialize (.slu.json), dxf-import
        index.ts          API publique
      ui/                 rendu canvas/SVG, formulaires, éditeur géométrie
      tests/
        handcalc/         calculs manuels de référence
        benchmarks/       cas Di Cello / VCASLU (profil NTC2018)
        consistency/      contrôles internes et non-régression
      pwa/                manifeste, service worker (si autonome)
      README.md
```

---

## 9. Conventions et exigences transverses

Toute grandeur affichée porte son unité. Aucune constante normative n'est codée en dur dans une formule ; elle provient du `NormProfile`, exactement comme les données d'entrée d'un classeur de calcul sont regroupées et référencées. Chaque fonction du noyau documente la clause, l'équation et la norme sur laquelle elle repose (par exemple `EN 1992-1-1 §3.1.7 éq. 3.17`). Les valeurs recommandées susceptibles d'être modifiées par annexe nationale sont signalées comme telles dans le code et l'interface. La distinction entre état limite ultime et état limite de service, et entre armature minimale de résistance et armature de maîtrise de la fissuration, doit rester explicite partout où elle est pertinente.

---

## 10. Réserves à lever avec l'utilisateur avant ou pendant le développement

1. Pile technique exacte d'Aedificium web (framework UI, langage, gestionnaire de paquets), pour adapter la couche `ui/` et le mode d'empaquetage.
2. Valeurs des annexes nationales belge (NBN) et luxembourgeoise (ILNAS) à retenir pour `αcc` et les éventuels coefficients partiels modifiés.
3. Conventions de signe définitives pour `N`, `My`, `Mz`, à figer avant la session 1 et à ne plus changer.
4. Portée de la précontrainte visée : uniquement adhérente, ou également non adhérente (le second cas modifie le calcul de la déformation des câbles).
