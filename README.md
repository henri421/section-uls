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

La sortie construite est committée dans `docs/` : **toute modification de l'interface exige de relancer `npm run build` avant de pousser**, sans quoi la page en ligne diverge de la source.

## Capacités actuelles

Flexion composée droite (N + M autour d'un axe), pour :

- **sections rectangulaires** — poutres, voiles ;
- **sections polygonales quelconques** (contour simple, convexe ou non) — sections en T, en L ;
- **sections circulaires** — pieux forés et poteaux circulaires, avec générateur de cage d'armatures répartie.

Le solveur recherche par bissection la profondeur d'axe neutre équilibrant l'effort normal imposé, avec le champ de déformation calé sur le pivot béton (fibre comprimée à `εcu2`), puis en déduit le moment résistant `M_Rd`.

Flexion composée **déviée** (N + My + Mz, axe neutre d'inclinaison quelconque) sur les mêmes géométries, avec restitution de l'axe neutre comme droite oblique traçable dans le repère de la section, du bras de levier interne et des points d'application des résultantes.

**Enregistrement et chargement de modèles** : un cas de calcul complet — géométrie, matériaux, armatures, sollicitation, profil normatif — se sérialise en JSON et se recharge. Le format retient l'intention de saisie (« un pieu Ø600 », « 3 HA20 en face inférieure ») plutôt que ses conséquences, de sorte qu'un fichier rouvert reste modifiable. Le noyau ne gère aucun stockage : il produit et relit le format, l'hôte décide où le ranger.

**Vérification et domaine d'interaction** : `verifySection` conclut — taux d'exploitation, verdict, et le motif de l'échec quand il y en a un. Deux chemins de chargement sont proposés : « N constant, moment majoré », qui correspond à l'usage en poteau, et proportionnel. Les diagrammes `N`–`M` et `My`–`Mz` sont rendus comme des listes de points, prêtes à tracer — le noyau ne dessine pas.

**Vérification en service (méthode n)** : section fissurée homogénéisée, contraintes du béton et des armatures confrontées aux limites de l'EN 1992-1-1 §7.2. Solveur entièrement distinct de celui de l'ELU — hypothèses élastiques, béton tendu négligé — et à ne jamais confondre avec lui. Flexion droite, coefficient d'équivalence paramétrable (défaut 15, valeur conventionnelle intégrant le fluage, non prescrite par la norme sous cette forme).

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
  parseModel, serializeModel, resolveModel, verifyBiaxial, FORMAT_VERSION,
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
};

const json = serializeModel(monModele);        // a ranger ou l'on veut
const { section, action, norm } = resolveModel(parseModel(json));
const r = verifyBiaxial(section, action, norm);
// r.M_Rd_magnitude — capacite colineaire a (My, Mz)
```

```ts
import {
  ec2Recommended, createConcrete, createSteel,
  rectangularSection, rectangularRebarLayout,
  verifySection, interactionCurveAtN,
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

## Développement

```bash
npm install
npm test          # suite complète (Vitest)
npm run typecheck # tsc --noEmit
```

## Réserves

Cet outil est une aide au calcul ; la vérification finale et la responsabilité des résultats incombent à l'ingénieur du projet. Limites connues de la version actuelle, documentées dans le code :

- le domaine ne parcourt que la branche du pivot béton — la loi acier à branche horizontale n'impose aucune limite de déformation, donc aucun pivot acier n'existe dans le modèle ;
- contour simple sans trou (les réservations ne sont pas gérées) ;
- une section circulaire est approximée par un polygone régulier (32 côtés par défaut, paramétrable) ;
- pas de précontrainte, pas de contrôle de ductilité ;
- un modèle ne porte qu'un seul acier, appliqué à toutes les barres — le mélange d'aciers (sections existantes renforcées) n'est pas encore représentable ;
- le format est en version 1 et aucune migration n'est prévue : toute évolution ultérieure devra s'accompagner d'une stratégie de reprise des fichiers existants ;
- l'interface n'est pas couverte par des tests automatiques au niveau du DOM : la logique est extraite en fonctions pures testées, et le câblage — volontairement mince — est vérifié à la main ;
- les diagrammes d'interaction sont calculés par la bibliothèque (`interactionCurveAtN`, `interactionCurveNM`) mais ne sont pas encore tracés par l'interface ;
- le mode de chargement proportionnel est nettement plus coûteux que le mode « N constant » (quelques secondes contre quelques dizaines de millisecondes) : il ne se déclenche que sur demande explicite ;
- la vérification en service ne couvre que la **flexion droite** et la section **fissurée** : une section entièrement comprimée est détectée et signalée, non calculée ;
- l'ouverture de fissures (§7.3) et les flèches (§7.4) ne sont pas traitées.
