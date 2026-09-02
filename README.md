# section-uls · Vérification de sections en béton armé (EC2)

Noyau de calcul TypeScript pour la vérification de sections en béton armé à l'état limite ultime selon l'Eurocode 2 (EN 1992-1-1). Calcul entièrement local, sans dépendance d'exécution : le noyau ne touche ni au DOM ni au réseau, et peut être consommé par n'importe quelle interface.

## Capacités actuelles

Flexion composée droite (N + M autour d'un axe), pour :

- **sections rectangulaires** — poutres, voiles ;
- **sections polygonales quelconques** (contour simple, convexe ou non) — sections en T, en L ;
- **sections circulaires** — pieux forés et poteaux circulaires, avec générateur de cage d'armatures répartie.

Le solveur recherche par bissection la profondeur d'axe neutre équilibrant l'effort normal imposé, avec le champ de déformation calé sur le pivot béton (fibre comprimée à `εcu2`), puis en déduit le moment résistant `M_Rd`.

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

## Validation

La crédibilité de l'outil repose sur des vérifications indépendantes du chemin de calcul numérique, présentes dans `tests/` :

- **Recalcul manuel fermé** (`tests/handcalc/`) : le `M_Rd` d'une poutre rectangulaire en flexion simple est confronté à l'intégrale analytique du bloc parabole-rectangle — écart mesuré 0,001 %.
- **Convergence** : la méthode des fibres converge vers cette intégrale analytique quand le nombre de bandes augmente (erreur divisée par ~26 000 entre 10 et 1000 bandes).
- **Non-régression** : un rectangle modélisé comme polygone donne un résultat identique au chemin rectangulaire dédié.
- **Décomposition composite** : aire et centroïde d'une section en T vérifiés par décomposition rectangle-par-rectangle, indépendamment de la formule du lacet.
- **Approximation du cercle** : l'aire du polygone régulier converge vers `πr²` (0,16 % d'écart à 64 segments).

## Développement

```bash
npm install
npm test          # suite complète (Vitest)
npm run typecheck # tsc --noEmit
```

## Réserves

Cet outil est une aide au calcul ; la vérification finale et la responsabilité des résultats incombent à l'ingénieur du projet. Limites connues de la version actuelle, documentées dans le code :

- flexion **droite** uniquement — la flexion déviée (axe neutre incliné) n'est pas encore implémentée ;
- pivot béton uniquement — la loi acier à branche horizontale n'impose pas de limite de déformation, donc aucun pivot acier n'intervient ;
- contour simple sans trou (les réservations ne sont pas gérées) ;
- une section circulaire est approximée par un polygone régulier (32 côtés par défaut, paramétrable) ;
- pas de précontrainte, pas de vérification en service (méthode n), pas de contrôle de ductilité.
