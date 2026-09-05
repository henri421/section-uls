# section-uls · Vérification de sections en béton armé (EC2)

Noyau de calcul TypeScript pour la vérification de sections en béton armé à l'état limite ultime selon l'Eurocode 2 (EN 1992-1-1). Calcul entièrement local, sans dépendance d'exécution : le noyau ne touche ni au DOM ni au réseau, et peut être consommé par n'importe quelle interface.

## Application

Une interface web permet de saisir une section, de la voir dessinée avec ses armatures et son axe neutre oblique, d'obtenir le verdict de vérification, et d'enregistrer son travail.

```bash
npm run dev      # serveur de developpement
npm run build    # construit dans docs/, servi par GitHub Pages
npm run preview  # verifie le resultat construit
```

L'interface n'invente aucun état : elle édite un modèle, dont tout le reste est dérivé. Ce qui est enregistré est donc exactement ce qui est calculé.

Deux diagrammes d'interaction y sont tracés, et leurs coûts n'ont rien de comparable :

- le **diagramme N–My**, avec le point sollicitant, est recalculé en continu — il ne demande aucune résolution, seulement une intégration par point. Son contour reste **ouvert du côté traction** : seule la branche du pivot béton est parcourue, et refermer dessinerait un domaine qui n'a pas été calculé. En flexion déviée, le point sollicitant sort du plan de ce graphe, qui l'annonce alors explicitement ;
- le **domaine My–Mz** à effort normal constant part **sur bouton seulement** : il enchaîne une résolution par point. On y lit le taux d'exploitation géométriquement, comme le rapport entre le point sollicitant et le rayon du domaine dans sa direction.

La sortie construite est committée dans `docs/` : **toute modification de l'interface exige de relancer `npm run build` avant de pousser**, sans quoi la page en ligne diverge de la source.

## Capacités actuelles

Flexion composée droite (N + M autour d'un axe), pour :

- **sections rectangulaires** — poutres, voiles ;
- **sections polygonales quelconques** (contour simple, convexe ou non) — sections en T, en L ;
- **sections circulaires** — pieux forés et poteaux circulaires, avec générateur de cage d'armatures répartie.

Le solveur recherche par bissection la profondeur d'axe neutre équilibrant l'effort normal imposé, avec le champ de déformation calé sur le pivot béton (fibre comprimée à `εcu2`), puis en déduit le moment résistant `M_Rd`.

Flexion composée **déviée** (N + My + Mz, axe neutre d'inclinaison quelconque) sur les mêmes géométries, avec restitution de l'axe neutre comme droite oblique traçable dans le repère de la section, du bras de levier interne et des points d'application des résultantes.

**Enregistrement et chargement de modèles** : un cas de calcul complet — géométrie, matériaux, armatures, sollicitation, profil normatif — se sérialise en JSON et se recharge. Le format retient l'intention de saisie (« un pieu Ø600 », « 3 HA20 en face inférieure ») plutôt que ses conséquences, de sorte qu'un fichier rouvert reste modifiable. Le noyau ne gère aucun stockage : il produit et relit le format, l'hôte décide où le ranger.

**Format en version 2, et les deux versions se lisent.** La version 2 ajoute les **sollicitations de service** (`serviceActions`). L'écriture produit toujours la version courante ; la lecture accepte toutes les versions de `SUPPORTED_FORMAT_VERSIONS`, aujourd'hui `[1, 2]`. C'est la seule chose qui empêche une montée de version de rendre illisible un fichier déjà enregistré : le fichier, lui, porte pour toujours la version qui avait cours le jour où il a été écrit. Un modèle de version 1 relu n'a simplement pas de sollicitations de service — elles ne sont pas inventées — et se réenregistre en version 2. Le témoin `tests/persistence/temoin-pieu.json`, écrit une fois en version 1 et jamais régénéré, est ce qui prouve cette compatibilité ; le régénérer détruirait le seul test qui l'établit.

**Pourquoi les sollicitations de service sont séparées de celle de l'ELU.** Elles relèvent de **combinaisons EN 1990 différentes** — et différentes entre elles : la combinaison **caractéristique** pour la limitation des contraintes (§7.2), la combinaison **quasi-permanente** pour l'ouverture de fissures (§7.3) et la courbure (§7.4.3). Réutiliser le moment de l'ELU en service serait faux d'un facteur de l'ordre de 1,35 à 1,5. Les deux combinaisons sont indépendamment optionnelles, et **uniaxiales** (`{N, M}`) et non `{N, My, Mz}` : c'est exactement ce que prennent `verifyServiceUniaxial`, `verifyCrackWidth` et `sectionCurvature`, qui ne traitent que la flexion droite. Offrir un `Mz` de service qu'aucun calcul ne consomme serait un champ menteur. `resolveModel` les rend sous la forme `Action` du noyau, prêtes à être passées telles quelles à ces trois fonctions.

**Vérification et domaine d'interaction** : `verifySection` conclut — taux d'exploitation, verdict, et le motif de l'échec quand il y en a un. Deux chemins de chargement sont proposés : « N constant, moment majoré », qui correspond à l'usage en poteau, et proportionnel. Les diagrammes `N`–`M` et `My`–`Mz` sont rendus comme des listes de points, prêtes à tracer — le noyau ne dessine pas.

`interactionCurveNM` balaye la profondeur d'axe neutre depuis la fibre supérieure : elle ne décrit donc **qu'une seule branche**, celle des moments d'un seul signe. `interactionDiagramNM` rend le diagramme **complet**, ses deux sens de flexion : la branche opposée s'obtient en balayant la section tournée de π, ce qui envoie `(y, z)` sur `(−y, −z)` et donc `M` sur `−M`, l'effort normal restant inchangé. Aucune approximation. Sur une section symétriquement armée les deux branches sont miroir et l'omission ne se voit pas ; sur une dalle à deux nappes inégales, une section en T, un voile dissymétrique, elles diffèrent et n'en tracer qu'une cache la moitié du domaine.

Les points sont ordonnés pour un tracé d'un seul trait : la branche opposée dans l'ordre du balayage, puis la branche positive à l'envers — l'effort normal monte de la traction dominante jusqu'à la compression maximale, puis redescend. Chaque point porte `sense` (`1` fibre supérieure comprimée, `-1` l'autre sens) et sa profondeur d'axe neutre, mesurée depuis la fibre comprimée de **sa** branche.

**Le contour reste ouvert du côté traction, et ce n'est pas un oubli** : le noyau ne parcourt que la branche du pivot béton, il n'atteint donc jamais la traction pure `N = −A_s·f_yd`. Aucun point de fermeture n'est ajouté entre les deux extrémités — refermer dessinerait un domaine qui n'a pas été calculé, crédible et faux.

**Vérification en service (méthode n)** : section fissurée homogénéisée, contraintes du béton et des armatures confrontées aux limites de l'EN 1992-1-1 §7.2. Solveur entièrement distinct de celui de l'ELU — hypothèses élastiques, béton tendu négligé — et à ne jamais confondre avec lui. Flexion droite, coefficient d'équivalence paramétrable (défaut 15, valeur conventionnelle intégrant le fluage, non prescrite par la norme sous cette forme).

**Ouverture de fissures (§7.3)** : `w_k` calculée selon l'équation 7.8, avec l'aire effective de béton tendu, le diamètre équivalent des barres et le basculement automatique sur l'équation 7.14 quand l'espacement sort du domaine de validité de 7.11. Sections rectangulaires en flexion droite. La limite `w_max` est paramétrable : elle dépend de la classe d'exposition, que le module ne connaît pas.

**Courbure et participation du béton tendu (§7.4.3)** : moment de fissuration, courbure en section non fissurée et en section fissurée, et interpolation entre les deux. **Ce n'est pas un calcul de flèche** — une flèche exige la portée, les appuis et le chargement, qui sont du niveau élément ; le module rend la courbure, l'appelant l'intègre le long de la pièce.

## Base normative

- Loi béton parabole-rectangle, EN 1992-1-1 §3.1.7 éq. 3.17-3.18, paramètres du tableau 3.1 (y compris la branche `fck > 50 MPa`).
- Loi acier bilinéaire à branche horizontale, §3.2.7 éq. 3.8.
- Coefficients partiels et `αcc` : profil `EC2_recommended` (valeurs recommandées de la norme).

**Aucune annexe nationale n'est codée dans le module.** Les coefficients (`γc`, `γs`, `αcc`, `εc2`, `εcu2`, `n`) proviennent tous d'un objet `NormProfile` que l'utilisateur peut redéfinir pour appliquer l'annexe applicable à son projet.

## Exemple

```ts
import {
  ec2Recommended, createConcrete, createSteel,
  circularSection, circularRebarCage, verifyUniaxial,
} from './src/index';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);      // C25/30
const steel = createSteel(500, 200000, profile);   // B500

// Pieu Ø600, cage de 8 HA20, enrobage 50 mm
const pieu = circularSection({
  diameter: 600,
  concrete,
  rebars: circularRebarCage({ diameter: 600, cover: 50, barDiameter: 20, count: 8, steel }),
});

const resultat = verifyUniaxial(pieu, { N: 0, M: 0 }, profile);
// resultat.M_Rd ≈ 239 kN·m, resultat.neutralAxisDepth ≈ 132 mm
```

```ts
import {
  ec2Recommended, createConcrete, createSteel,
  rectangularSection, rectangularRebarLayout, verifyBiaxial,
} from './src/index';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

// Poteau 400x400, enrobage 30, étriers HA8, 3 HA20 en haut et en bas
const layout = rectangularRebarLayout({
  width: 400, height: 400, cover: 30, stirrupDiameter: 8, steel,
  rows: [
    { face: 'bottom', bars: { count: 3, diameter: 20 } },
    { face: 'top', bars: { count: 3, diameter: 20 } },
  ],
});

const poteau = rectangularSection({ width: 400, height: 400, concrete, rebars: layout.bars });

// Seule la DIRECTION de (My, Mz) est utilisée : ici, flexion à 45°
const r = verifyBiaxial(poteau, { N: 500, My: 1, Mz: 1 }, profile);
// r.M_Rd.y, r.M_Rd.z — capacité colinéaire à la sollicitation
// r.neutralAxis   — droite { -y·sin(angle) + z·cos(angle) = offset }
// r.leverArm      — bras de levier interne (mm)
```

```ts
import {
  parseModel, serializeModel, resolveModel, verifyBiaxial, sectionCurvature,
  FORMAT_VERSION,
} from './src/index';
import type { SectionModel } from './src/index';

// Poteau 400x400, decrit par son INTENTION de saisie plutot que ses
// consequences (positions de barres, materiaux derives) : c'est ce qui se
// serialise et se relit.
const monModele: SectionModel = {
  formatVersion: FORMAT_VERSION,
  engineVersion: '0.1.0',
  name: 'Poteau P3',
  norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1, nBands: 200 },
  concrete: { fck: 25 },
  steel: { fyk: 500, Es: 200000 },
  geometry: { kind: 'rectangle', width: 400, height: 400 },
  reinforcement: {
    kind: 'rectangular-layout',
    cover: 30,
    stirrupDiameter: 8,
    rows: [
      { face: 'bottom', bars: { count: 3, diameter: 20 } },
      { face: 'top', bars: { count: 3, diameter: 20 } },
    ],
  },
  action: { N: 500, My: 1, Mz: 1 },
  // Optionnel, et independamment optionnel pour chacune des deux : ce sont
  // des combinaisons EN 1990 differentes de l'ELU, et differentes entre
  // elles. Uniaxiales {N, M} : c'est ce que prennent les modules de service.
  serviceActions: {
    characteristic: { N: 350, M: 90 },   // §7.2 limitation des contraintes
    quasiPermanent: { N: 300, M: 65 },   // §7.3 fissuration, §7.4.3 courbure
  },
};

const json = serializeModel(monModele);        // a ranger ou l'on veut
const { section, action, norm, serviceActions } = resolveModel(parseModel(json));
const r = verifyBiaxial(section, action, norm);
// r.M_Rd_magnitude — capacite colineaire a (My, Mz)

// Les sollicitations resolues ont deja la forme Action {N, M} : aucune
// conversion a faire ici. Absentes du modele, elles sont absentes ici.
const qp = serviceActions?.quasiPermanent;
if (qp !== undefined) sectionCurvature(section, qp);
```

```ts
import {
  ec2Recommended, createConcrete, createSteel,
  rectangularSection, rectangularRebarLayout,
  verifySection, interactionCurveAtN, interactionDiagramNM,
} from './src/index';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

const layout = rectangularRebarLayout({
  width: 400, height: 400, cover: 30, stirrupDiameter: 8, steel,
  rows: [
    { face: 'bottom', bars: { count: 3, diameter: 20 } },
    { face: 'top', bars: { count: 3, diameter: 20 } },
  ],
});
const poteau = rectangularSection({ width: 400, height: 400, concrete, rebars: layout.bars });

const v = verifySection(poteau, { N: 500, My: 80, Mz: 40 }, profile);
// v.ok            — true si le taux ne dépasse pas 1
// v.utilization   — |M_Ed| / |M_Rd|
// v.reason        — pourquoi, quand ça ne passe pas

const contour = interactionCurveAtN(poteau, 500, profile);  // à tracer

// Diagramme N–M complet : 2 × steps points, contour ouvert côté traction.
const diagramme = interactionDiagramNM(poteau, profile, { steps: 40 });
// diagramme[i].sense — 1 fibre supérieure comprimée, -1 l'autre sens
// diagramme[i].N     — kN, positif en compression
// diagramme[i].M     — kN·m, dans le repère de la section
```

## Validation

La crédibilité de l'outil repose sur des vérifications indépendantes du chemin de calcul numérique, présentes dans `tests/` :

- **Recalcul manuel fermé** (`tests/handcalc/`) : le `M_Rd` d'une poutre rectangulaire en flexion simple est confronté à l'intégrale analytique du bloc parabole-rectangle — écart mesuré 0,001 %.
- **Convergence** : la méthode des fibres converge vers cette intégrale analytique quand le nombre de bandes augmente (erreur divisée par ~26 000 entre 10 et 1000 bandes).
- **Non-régression** : un rectangle modélisé comme polygone donne un résultat identique au chemin rectangulaire dédié.
- **Décomposition composite** : aire et centroïde d'une section en T vérifiés par décomposition rectangle-par-rectangle, indépendamment de la formule du lacet.
- **Approximation du cercle** : l'aire du polygone régulier converge vers `πr²` (0,16 % d'écart à 64 segments).
- **Flexion déviée** (`tests/handcalc/biaxial-triangle-parabolic.test.ts`) : `N`, `My` et `Mz` d'un triangle intégralement sur la branche parabolique confrontés à trois intégrales fermées calculées à la main.
- **Invariance par isométrie** : tourner la section et la sollicitation du même angle laisse la capacité inchangée.
- **Compression centrée** (`tests/handcalc/compression-centree.test.ts`) : le sommet du diagramme `N`–`M` confronté à `fcd·Ac + (fyd − fcd)·As`, calculé à la main.
- **Cohérence domaine / taux** : un point pris sur le contour rendu par le domaine donne un taux d'exploitation voisin de 1.
- **Méthode n** (`tests/handcalc/methode-n-poutre.test.ts`) : axe neutre, bras de levier et contraintes d'une poutre fissurée confrontés au calcul classique fermé.
- **Ouverture de fissure** (`tests/handcalc/ouverture-fissure.test.ts`) : les quatre étapes du calcul — méthode n, aire effective, déformation relative, ouverture — vérifiées séparément contre un recalcul manuel.
- **Courbure** (`tests/handcalc/courbure.test.ts`) : caractéristiques non fissurées, moment de fissuration, deux courbures et interpolation vérifiés séparément contre un recalcul manuel, plus un contrôle élémentaire `M_cr = f_ctm·b·h²/6` sur section non armée.

## Développement

```bash
npm install
npm test          # suite complète (Vitest)
npm run typecheck # tsc --noEmit
```

## Réserves

Cet outil est une aide au calcul ; la vérification finale et la responsabilité des résultats incombent à l'ingénieur du projet. Limites connues de la version actuelle, documentées dans le code :

- le domaine ne parcourt que la branche du pivot béton — la loi acier à branche horizontale n'impose aucune limite de déformation, donc aucun pivot acier n'existe dans le modèle. Le contour `N`–`M` est donc **ouvert du côté traction** : `interactionDiagramNM` ne le referme pas, plutôt que d'inventer un domaine non calculé ;
- contour simple sans trou (les réservations ne sont pas gérées) ;
- une section circulaire est approximée par un polygone régulier (32 côtés par défaut, paramétrable) ;
- pas de précontrainte, pas de contrôle de ductilité ;
- un modèle ne porte qu'un seul acier, appliqué à toutes les barres — le mélange d'aciers (sections existantes renforcées) n'est pas encore représentable ;
- le format est en version 2 ; la lecture accepte les versions 1 et 2 (`SUPPORTED_FORMAT_VERSIONS`), l'écriture produit toujours la version courante. Il n'existe pas de migration au sens propre : la compatibilité tient à ce que les champs ajoutés soient optionnels et à ce que la lecture n'exige jamais l'égalité avec la version courante. Une évolution qui ne pourrait pas se dire par un champ optionnel exigerait, elle, une vraie reprise des fichiers existants ;
- le câblage de l'interface est couvert par des tests de bout en bout dans un DOM simulé (`tests/app/cablage.test.ts`) : saisir une valeur doit changer le résultat affiché. Ces tests ont été ajoutés après une régression réelle que la seule couverture des fonctions pures n'avait pas vue ;
- les diagrammes d'interaction sont calculés par la bibliothèque (`interactionCurveAtN`, `interactionCurveNM`, `interactionDiagramNM`) mais ne sont pas encore tracés par l'interface ;
- le mode de chargement proportionnel est nettement plus coûteux que le mode « N constant » (quelques secondes contre quelques dizaines de millisecondes) : il ne se déclenche que sur demande explicite ;
- la vérification en service ne couvre que la **flexion droite** et la section **fissurée** : une section entièrement comprimée est détectée et signalée, non calculée ;
- l'ouverture de fissures ne couvre que les sections **rectangulaires** en flexion droite ; une autre géométrie lève une erreur plutôt que d'être approximée ;
- la limite `w_max` vaut 0,3 mm par défaut, valeur du cas courant XC2–XC4 : elle dépend de la classe d'exposition et doit être ajustée au projet ;
- la **courbure** est rendue au niveau de la section (§7.4.3) ; le calcul de **flèche** proprement dit, qui exige la portée, les appuis et le chargement, reste à la charge de l'appelant ;
- l'équation 7.19 est appliquée sous la forme `(M_cr/M)`, exacte en flexion pure, approchée en flexion composée ;
- l'équation 7.18 n'est **continue au moment de fissuration que pour `β = 1`** : avec la valeur courante `β = 0,5`, la courbure saute de `(1 − β)` fois l'écart entre les deux états. C'est une propriété de la norme, pas un artefact de calcul, et elle est testée comme telle.
