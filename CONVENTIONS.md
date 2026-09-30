# Conventions de la suite d'outils de calcul

Ce fichier est identique dans chaque dépôt de la suite (`assemblages-ec3`,
`poinconnement`, `section-uls`, `MBT`, `WebAedificium`). Il fixe la convention
**des modules nouvellement écrits**. Le code existant s'y aligne au fil de
l'eau, à chaque passage sur un module : **pas de campagne de renommage**, dont
le risque de régression ne vaut pas le bénéfice.

## Langue

- **Français pour le domaine métier** : fonctions, types, champs, fichiers du
  noyau (`verifierPoinconnement`, `DonneesPoinconnement`, `hauteurUtileMoyenne`).
  C'est la langue des Eurocodes employés et du lectorat visé.
- **Sans accents ni caractères non ASCII** dans les identifiants et les
  commentaires de code (« hauteur utile », « perimetre »). Les accents sont admis
  dans les README et les chaînes affichées.
- L'anglais est toléré pour l'infrastructure sans contenu métier.

## Unités

Efforts en **kN**, longueurs en **mm**, contraintes en **MPa**, moments en
**kN·m**, déclarées en tête de chaque module du noyau. Aucune conversion
implicite ; une conversion nécessaire est une constante nommée
(`N_PAR_KN = 1000`). `MBT`, dont le modèle géométrique est en mètres, le déclare
de même et s'y tient.

## Doctrine

> **L'outil CONSTATE et ne PRESCRIT PAS.**

Il rend des contraintes, des taux de travail, des sections ou des gorges qui
satisfont l'inéquation normative ; jamais un plan ni un détail à exécuter.
Des constats de natures différentes (résistance, service, dispositions
constructives) restent **distincts**. Une vérification sans objet est déclarée
**non applicable**, avec son motif, jamais « satisfaite ».

## Code

- Noyau de calcul pur (`src/`), sans dépendance à l'interface ; interface
  (`app/`) qui ne calcule rien. **Aucune dépendance de production** pour les
  outils sans framework.
- Chaque fonction exportée porte un commentaire qui dit ce qu'elle calcule, sa
  **clause de référence**, et, pour un choix de modélisation, **pourquoi**.
- Toute grandeur nulle ou négative lève une `Error` nommant la grandeur et son
  unité : `L epaisseur de platine t doit etre un nombre strictement positif (mm).`
- Valeurs **recommandées** des Eurocodes, 1ʳᵉ génération ; aucune annexe
  nationale codée en dur (profil dérivable par l'utilisateur).

## Tests

Vitest. Un fichier de test par module du noyau, en miroir de `src/`. Fonction
de fixture décrivant un cas de référence, **valeurs attendues calculées à la
main et écrites en dur**, jamais recalculées par le test. Un test par branche
métier, dont les levées d'erreur. Au moins un cas complet résolu à la main dans
`docs/validation/`.

## Publication

`LICENSE` MIT avec exclusion de garantie. Workflow GitHub Actions : contrôle de
types, tests, construction, puis déploiement sur Pages — le déploiement n'a lieu
que si les trois passent. Aucun artefact de construction suivi par Git.
Identité Git **anonyme** (`henri421`), configurée localement dans chaque dépôt.
