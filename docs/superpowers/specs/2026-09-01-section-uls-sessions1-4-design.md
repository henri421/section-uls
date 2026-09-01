# Spec — module `section-uls`, noyau ELU (sessions 1 à 4)

**Statut :** approuvé pour développement.
**Source :** `PLAN_module_section-uls_Aedificium.md` (cahier des charges d'origine), adapté sur les points ci-dessous après clarification avec l'utilisateur.

## 1. Contexte et périmètre

Le plan d'origine visait un module `modules/section-uls/` intégré à un projet parent « Aedificium web » dont la pile technique n'était pas connue. Investigation : le projet parent réel le plus proche par thématique est `Structura/` (dépôt public `WebAedificium`), un fichier `index.html` unique en JavaScript vanilla, sans build. Décisions prises avec l'utilisateur :

- **Dépôt autonome**, distinct de Structura et du Aedificium desktop (Qt/MEF). Initialisé dans le dossier `Section BA` actuel.
- **TypeScript + Vite + Vitest + npm**, malgré l'absence de build dans les autres outils de la suite — le calcul (géométrie, solveurs Newton-Raphson, intégration) justifie un langage typé et des tests unitaires réels.
- **Dépôt public anonyme** (compte `henri421`), déployé plus tard sur GitHub Pages — mais **aucune décision de déploiement n'est prise maintenant** : sans interface (session 5+), il n'y a rien à publier. Le sujet sera rouvert à la session 5.
- **Portée de cette spec : sessions 1 à 4 du plan**, c'est-à-dire le moteur de calcul ELU complet (flexion droite → déviée → domaines d'interaction → taux d'exploitation), sans interface graphique. Sessions 5 à 10 (UI, méthode n, précontrainte, sections existantes, DXF, PWA) restent hors scope, à reprendre en spec séparé le moment venu.

## 2. Écart assumé par rapport au plan d'origine

Le plan prévoyait trois profils normatifs livrés d'origine (`EC2_recommended`, `EC2_NBN`, `EC2_ILNAS`) plus `NTC2018` pour la validation croisée VCASLU. **Décision utilisateur (2026-09-01) : on abandonne les profils NBN/ILNAS pré-remplis.**

- Le module livre **un seul profil public : `EC2_recommended`**, avec les valeurs recommandées telles quelles de l'EN 1992-1-1 (§2.4.2.4 tableau 2.1N, §3.1.6, §3.1.7, §3.2.7, annexe C).
- Le `NormProfile` reste entièrement éditable : `γc`, `γs`, `αcc`, choix de loi béton/acier, `εc2`, `εcu2`, `n`, `εud`, classe de ductilité — tous exposés comme des champs qu'un utilisateur peut modifier lui-même pour appliquer son annexe nationale, sans qu'aucune annexe spécifique (belge, luxembourgeoise ou autre) ne soit codée ou présélectionnée dans le module.
- `NTC2018` est conservé, mais uniquement comme **fixture interne** dans `tests/benchmarks/` pour rejouer les exercices de Di Cello / VCASLU (section 7 du plan) — ce n'est pas un preset exposé à l'utilisateur final, et il n'est pas concerné par l'abandon des profils NBN/ILNAS puisqu'il ne représente pas une annexe nationale EC2.

Le reste du plan (modèle mécanique, lois constitutives, solveurs, validation) est repris sans modification — voir `PLAN_module_section-uls_Aedificium.md` sections 4 à 7 pour le détail normatif complet, qui fait référence.

## 3. Conventions figées

- **Effort normal N : positif en compression.** Déformations `ε` positives en compression. Choix assumé car il colle directement aux lois EC2 (`εc2`, `εcu2` positifs pour le béton comprimé) plutôt qu'à la convention mécanique générale — à documenter en tête de `core/model/` pour éviter toute confusion avec d'autres modules Aedificium qui utiliseraient la convention inverse.
- **Repère barycentrique** de la section brute de béton, `z` vertical, moments `My`/`Mz` définis par la règle de la main droite (comme proposé au plan section 4).
- Ces conventions ne changent plus une fois la session 1 entamée.

## 4. Architecture

```
section-uls/
  package.json / tsconfig.json / vitest.config.ts
  src/
    model/            Section, Material.Concrete/Steel, Geometry.Polygon, Rebar, Action, NormProfile
    norms/             EC2_recommended (seul profil public)
    constitutive/       lois béton (parabole-rectangle, bilinéaire, bloc rectangulaire), acier (bilinéaire)
    geometry/           polygone, contours multiples (trous), position libre des armatures
    integration/        méthode des fibres (par défaut) + intégration analytique de contrôle (rectangle)
    solvers/
      uls-uniaxial.ts   flexion composée droite (bissection/Newton 1D)
      uls-biaxial.ts    flexion composée déviée (Newton-Raphson 2D)
    domain/             surface de rupture (balayage des pivots), diagrammes N-M / Mx-My, taux d'exploitation
    index.ts            API publique du noyau
  tests/
    handcalc/           calculs manuels de référence (un par session)
    benchmarks/          exercices Di Cello / VCASLU, profil NTC2018 (fixture interne)
    consistency/         non-régression, convergence fibres→analytique, symétries
```

Aucune dépendance au DOM ni au réseau dans `src/` (hors `norms/` et `model/` qui sont de purs types/données). Le noyau doit rester importable et testable sans navigateur — c'est la condition pour qu'il soit un jour réutilisé par une UI, quelle qu'elle soit.

## 5. Contenu fonctionnel par session (repris du plan, inchangé sur le fond)

### Session 1 — Socle, matériaux, ELU rectangulaire droit
- Scaffold npm/TS/Vitest/lint.
- `model/` complet, `NormProfile` avec `EC2_recommended` uniquement.
- Lois béton (parabole-rectangle) et acier (bilinéaire), y compris branche `fck > 50 MPa` (tableau 3.1 EC2).
- Solveur ELU flexion droite, section rectangulaire, méthode des fibres.
- API : `verifyUniaxial(section, action, norm)`.
- **Porte de validation :** recalcul manuel indépendant (`tests/handcalc/`), écart sur `M_Rd` < 1 %.

### Session 2 — Géométrie polygonale quelconque
- Contour polygonal arbitraire + contours multiples (trous), armatures/câbles à positions libres.
- Généralisation de l'intégration par fibres ; ajout de l'intégration analytique de contrôle sur le cas rectangulaire.
- **Porte de validation :** section rectangulaire modélisée en polygone → résultat identique à la session 1 ; convergence fibres → analytique quand le nombre de bandes augmente.

### Session 3 — Flexion composée déviée
- Solveur Newton-Raphson à deux paramètres (position + inclinaison de l'axe neutre), avec garde-fous (bornes, amortissement, repli sur bissection imbriquée).
- Gestion des pivots dans le cas dévié.
- **Porte de validation :** poteau carré à armatures symétriques, sollicitation à 45° → composantes égales ; comparaison à un calcul manuel simplifié.

### Session 4 — Domaines d'interaction et taux d'exploitation
- Surface de rupture par balayage des pivots (A/B/C) ; diagrammes N-M et Mx-My.
- Taux d'exploitation par homothétie radiale, modes « proportionnel » et « N constant ».
- Rendu graphique minimal (canvas/SVG) du domaine + point sollicitant — juste assez pour visualiser pendant les tests, pas une UI travaillée (ça, c'est la session 5).
- **Porte de validation :** point intérieur → taux < 1 ; point sur le contour → taux ≈ 1 (tolérance fixée) ; cohérence taux ↔ appartenance géométrique.

À l'issue de la session 4, le moteur ELU est complet et testé ; l'UI (session 5) et le reste (6-10) suivront en spec séparé.

## 6. Stratégie de validation

Reprise telle quelle du plan section 7 :
1. Calculs manuels indépendants dans `tests/handcalc/`, au moins un cas par session.
2. Banc d'essai Di Cello / VCASLU dans `tests/benchmarks/`, en profil `NTC2018` (fixture interne, non exposée).
3. Contrôles de cohérence internes (`tests/consistency/`) : convergence fibres/analytique, symétries, non-régression entre sessions.

Tout écart entre deux méthodes est documenté avec sa cause et la source qui fait foi — jamais masqué.

## 7. Hors scope de cette spec

Interface utilisateur, méthode n (service), précontrainte, sections existantes/facteurs de confiance, import DXF, PWA/déploiement — sessions 6 à 10 du plan d'origine, non traitées ici.

## 8. Réserve non bloquante

Aucune valeur d'annexe nationale n'est codée en dur nulle part dans le module — c'est désormais une garantie du design (section 2), pas juste une réserve à lever plus tard.
