import { describe, it, expect } from 'vitest';
import {
  interactionCurveAtN,
  interactionCurveNM,
  interactionDiagramNM,
} from '../../src/domains/interaction';
import type { DiagramPointNM } from '../../src/domains/interaction';
import { verifyBiaxial } from '../../src/solvers/uls-biaxial';
import { verifyUniaxial } from '../../src/solvers/uls-uniaxial';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

function poteauCarre() {
  return rectangularSection({
    width: 400, height: 400, concrete,
    rebars: rectangularRebarLayout({
      width: 400, height: 400, cover: 30, stirrupDiameter: 8, steel,
      rows: [
        { face: 'bottom', bars: { count: 3, diameter: 20 } },
        { face: 'top', bars: { count: 3, diameter: 20 } },
        { face: 'left', bars: { count: 1, diameter: 20 } },
        { face: 'right', bars: { count: 1, diameter: 20 } },
      ],
    }).bars,
  });
}

describe('interactionCurveAtN', () => {
  it('rend une courbe fermee, sans repeter le premier point', () => {
    const courbe = interactionCurveAtN(poteauCarre(), 600, profile, { steps: 24 });

    expect(courbe).toHaveLength(24);
    expect(courbe[0].neutralAxisAngle).toBeCloseTo(0, 12);
    // Le dernier point ne doit pas etre le premier : c'est a l'appelant de refermer.
    expect(courbe[23].neutralAxisAngle).toBeGreaterThan(courbe[0].neutralAxisAngle);
    expect(courbe[23].neutralAxisAngle).toBeLessThan(2 * Math.PI);
  });

  it('chaque point coincide avec verifyBiaxial dans sa propre direction', () => {
    // Controle croise : le domaine et le solveur devie doivent decrire la
    // meme surface. On prend un point de la courbe, on relit sa direction de
    // moment, et on demande au solveur la capacite dans cette direction.
    const section = poteauCarre();
    const courbe = interactionCurveAtN(section, 600, profile, { steps: 24 });
    const point = courbe[5];

    const parLeSolveur = verifyBiaxial(section, { N: 600, My: point.My, Mz: point.Mz }, profile);

    expect(parLeSolveur.converged).toBe(true);
    expect(parLeSolveur.M_Rd.y).toBeCloseTo(point.My, 6);
    expect(parLeSolveur.M_Rd.z).toBeCloseTo(point.Mz, 6);
  });

  it('la courbe d un poteau carre symetrique est invariante par rotation de 90 deg', () => {
    const courbe = interactionCurveAtN(poteauCarre(), 600, profile, { steps: 24 });
    const magnitude = (i: number) => Math.hypot(courbe[i].My, courbe[i].Mz);

    // 24 pas sur 2*pi : un quart de tour vaut exactement 6 pas.
    for (let i = 0; i < 24; i++) {
      expect(magnitude((i + 6) % 24)).toBeCloseTo(magnitude(i), 6);
    }
  });

  it('omet les orientations ou l effort normal est hors plage, sans inventer de point', () => {
    // Effort normal absurde : aucune orientation ne le supporte.
    const courbe = interactionCurveAtN(poteauCarre(), 1e9, profile, { steps: 12 });
    expect(courbe).toHaveLength(0);
  });
});

describe('interactionCurveNM', () => {
  it('couvre de la traction dominante a la compression quasi uniforme', () => {
    const courbe = interactionCurveNM(poteauCarre(), profile, { steps: 40 });

    expect(courbe.length).toBe(40);
    expect(courbe[0].N).toBeLessThan(0); // profondeur faible : traction
    expect(courbe[39].N).toBeGreaterThan(2000); // profondeur grande : compression
    // Profondeurs strictement croissantes.
    for (let i = 1; i < courbe.length; i++) {
      expect(courbe[i].neutralAxisDepth).toBeGreaterThan(courbe[i - 1].neutralAxisDepth);
    }
  });

  it('a la forme en cloche : le moment croit puis decroit avec l effort normal', () => {
    const courbe = interactionCurveNM(poteauCarre(), profile, { steps: 60 });
    const moments = courbe.map((p) => p.M);
    const iMax = moments.indexOf(Math.max(...moments));

    // Le maximum est interieur, pas a une extremite : c'est le point d'equilibre.
    expect(iMax).toBeGreaterThan(0);
    expect(iMax).toBeLessThan(courbe.length - 1);
  });

  it('chaque point coincide avec le solveur droit au meme effort normal', () => {
    const section = poteauCarre();
    const courbe = interactionCurveNM(section, profile, { steps: 40 });
    const point = courbe[25];

    const parLeSolveur = verifyUniaxial(section, { N: point.N, M: 0 }, profile);

    expect(parLeSolveur.converged).toBe(true);
    expect(parLeSolveur.M_Rd).toBeCloseTo(point.M, 4);
    expect(parLeSolveur.neutralAxisDepth).toBeCloseTo(point.neutralAxisDepth, 4);
  });
});

describe('interactionDiagramNM — les deux branches', () => {
  it('rend deux fois plus de points que de pas, moitie par branche', () => {
    const d = interactionDiagramNM(poteauCarre(), profile, { steps: 20 });

    expect(d).toHaveLength(40);
    expect(d.filter((p) => p.sense === -1)).toHaveLength(20);
    expect(d.filter((p) => p.sense === 1)).toHaveLength(20);
  });

  it('sur une section symetrique, la branche opposee est le miroir exact', () => {
    const steps = 16;
    const positive = interactionCurveNM(poteauCarre(), profile, { steps });
    const d = interactionDiagramNM(poteauCarre(), profile, { steps });
    const negative = d.filter((p) => p.sense === -1);

    for (let i = 0; i < steps; i++) {
      expect(negative[i].N).toBeCloseTo(positive[i].N, 6);
      expect(negative[i].M).toBeCloseTo(-positive[i].M, 6);
    }
  });

  it('sur une section dissymetrique, les deux branches different vraiment', () => {
    // Armatures en fibre inferieure seulement : flechir dans l'autre sens
    // n'offre plus que le beton et rien en traction.
    const section = rectangularSection({
      width: 300, height: 500, concrete,
      rebars: [{ depthFromTop: 450, area: 3 * Math.PI * 10 ** 2, steel }],
    });
    const steps = 24;
    const d = interactionDiagramNM(section, profile, { steps });
    const positive = d.filter((p) => p.sense === 1);
    const negative = d.filter((p) => p.sense === -1);

    // La comparaison se fait A EFFORT NORMAL EGAL, ici en flexion PURE.
    // Comparer les maxima de |M| sur chaque branche entiere n'aurait aucun
    // sens mecanique : ces maxima tombent a des efforts normaux tres
    // differents (ici +412 kN sur une branche, +1750 kN sur l'autre), et le
    // moment y est domine par l'excentrement du bloc comprime autour du
    // centroide beton, pas par le ferraillage.
    const momentEnFlexionPure = (branche: DiagramPointNM[]): number => {
      for (let i = 1; i < branche.length; i++) {
        const a = branche[i - 1];
        const b = branche[i];
        // L'effort normal est monotone le long d'une branche : une seule
        // traversee de N = 0, donc une interpolation lineaire suffit.
        if (a.N * b.N <= 0 && a.N !== b.N) {
          return a.M + ((0 - a.N) / (b.N - a.N)) * (b.M - a.M);
        }
      }
      throw new Error('la branche ne traverse pas N = 0');
    };

    const mPos = Math.abs(momentEnFlexionPure(positive));
    const mNeg = Math.abs(momentEnFlexionPure(negative));

    // Le sens qui tend les armatures resiste nettement plus : dans l'autre
    // sens la fibre tendue n'a aucune armature et la traction du beton est
    // negligee, il ne reste donc presque rien.
    expect(mPos).toBeGreaterThan(5 * mNeg);
  });

  it('est ordonne pour un trace d un seul trait : N croit puis decroit', () => {
    const d = interactionDiagramNM(poteauCarre(), profile, { steps: 20 });
    const iMax = d.reduce((best, p, i) => (p.N > d[best].N ? i : best), 0);

    // Une seule montee, une seule descente : pas d aller-retour.
    for (let i = 1; i <= iMax; i++) expect(d[i].N).toBeGreaterThanOrEqual(d[i - 1].N);
    for (let i = iMax + 1; i < d.length; i++) expect(d[i].N).toBeLessThanOrEqual(d[i - 1].N);
  });

  it('laisse le contour OUVERT du cote traction, sans le refermer', () => {
    const d = interactionDiagramNM(poteauCarre(), profile, { steps: 20 });
    // Les deux extremites sont les deux etats de traction dominante : elles se
    // ressemblent mais la fonction ne doit PAS avoir ajoute de point de
    // fermeture artificiel entre elles.
    expect(d[0].sense).toBe(-1);
    expect(d[d.length - 1].sense).toBe(1);
    expect(d[0].neutralAxisDepth).toBeCloseTo(d[d.length - 1].neutralAxisDepth, 9);
  });
});

/**
 * Coherence EXTERNE du diagramme : le contour passe-t-il par le point que rend
 * le solveur droit ?
 *
 * Les tests ci-dessus verifient la coherence INTERNE — symetrie, ordre,
 * dissymetrie. Aucun d'eux n'attraperait une erreur de signe, d'echelle ou
 * d'unite : un contour faux d'un facteur mille reste parfaitement symetrique et
 * parfaitement ordonne. Celui-ci confronte le diagramme a une source
 * independante, `verifyUniaxial`, qui n'emprunte pas le meme chemin de calcul
 * (bissection sur la profondeur d'axe neutre, la ou le diagramme balaye).
 */
describe('interactionDiagramNM — concordance avec le solveur droit', () => {
  // Section DISSYMETRIQUE a dessein : sur une section symetrique, une erreur de
  // signe sur la branche opposee passerait inapercue.
  const dissymetrique = rectangularSection({
    width: 300,
    height: 500,
    concrete,
    rebars: [
      { depthFromTop: 450, area: 3 * Math.PI * 10 ** 2, steel },
      { depthFromTop: 50, area: 2 * Math.PI * 6 ** 2, steel },
    ],
  });

  /** Moment du contour a l'effort normal `N`, interpole sur la branche donnee. */
  function momentDuContour(points: DiagramPointNM[], sense: 1 | -1, N: number): number {
    const branche = points.filter((p) => p.sense === sense).sort((a, b) => a.N - b.N);

    for (let i = 1; i < branche.length; i++) {
      const a = branche[i - 1];
      const b = branche[i];
      if (a.N <= N && N <= b.N) {
        return a.M + ((N - a.N) / (b.N - a.N)) * (b.M - a.M);
      }
    }

    throw new Error(`le contour ne couvre pas N = ${N} kN`);
  }

  it('rend le meme moment resistant que verifyUniaxial, de la traction a la compression', () => {
    const points = interactionDiagramNM(dissymetrique, profile, { steps: 400 });

    // Ecarts mesures le 2026-09-04 : 0,001 % a N = -100 et 0, jusqu'a 0,023 %
    // a N = 2000. Ils viennent de l'INTERPOLATION entre deux points du
    // balayage geometrique, pas d'une imprecision de calcul — d'ou leur
    // croissance avec N, la ou les points du balayage s'espacent. La tolerance
    // est fixee a 0,5 %, vingt fois le plus large ecart mesure : elle est
    // choisie AU-DESSUS de la mesure, pas ajustee dessus.
    const TOLERANCE = 0.005;

    for (const N of [-100, 0, 200, 500, 1000, 2000]) {
      const attendu = verifyUniaxial(dissymetrique, { N, M: 0 }, profile).M_Rd;
      const obtenu = momentDuContour(points, 1, N);

      expect(Math.abs(obtenu - attendu) / Math.abs(attendu)).toBeLessThan(TOLERANCE);
    }
  });
});

/**
 * Le rayon du domaine My-Mz est la capacite du solveur devie.
 *
 * C'est ce que l'interface donne a lire : elle trace le contour, y place le
 * point sollicitant, et tire un rayon de l'origine jusqu'a la capacite. Le
 * rapport des deux longueurs DOIT etre le taux d'exploitation affiche a cote.
 * Les deux grandeurs sont la meme, lue deux fois — si elles divergent, c'est un
 * bug, et ce test est ce qui l'attrape avant l'ecran.
 */
describe('interactionCurveAtN — le rayon du domaine est la capacite', () => {
  /** Rayon du contour dans une direction de moment donnee, par interpolation. */
  function rayonDuContour(
    points: Array<{ My: number; Mz: number }>,
    direction: number
  ): number {
    const recentre = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const ecartA = recentre(Math.atan2(a.Mz, a.My) - direction);
      const ecartB = recentre(Math.atan2(b.Mz, b.My) - direction);

      // Encadrement de la direction cherchee par deux points consecutifs. La
      // borne a 1 radian ecarte le raccord de fin de tour, ou l'ecart angulaire
      // change de signe en franchissant pi et non la direction cherchee.
      if (ecartA <= 0 && ecartB >= 0 && Math.abs(ecartA) < 1 && Math.abs(ecartB) < 1) {
        const t = ecartA === ecartB ? 0 : -ecartA / (ecartB - ecartA);
        return Math.hypot(a.My + t * (b.My - a.My), a.Mz + t * (b.Mz - a.Mz));
      }
    }

    throw new Error('le contour ne couvre pas cette direction de moment');
  }

  it('concorde avec verifyBiaxial, au pas de 72 points utilise par l interface', () => {
    // Ecarts mesures le 2026-09-04 : 0,000 %, 0,019 % et 0,210 %. Ils viennent
    // de l'effet de CORDE — le contour rendu est une ligne brisee, dont le
    // segment passe legerement en deca de la courbe entre deux points. L'ecart
    // s'annule a 360 points, ce qui confirme l'origine. La tolerance est fixee
    // a 0,5 %, plus du double du plus large ecart mesure.
    const TOLERANCE = 0.005;
    const section = poteauCarre();

    const cas: Array<{ N: number; My: number; Mz: number }> = [
      { N: 600, My: 100, Mz: 60 },
      { N: 0, My: 100, Mz: 100 },
      { N: 1500, My: 50, Mz: 120 },
    ];

    for (const { N, My, Mz } of cas) {
      const capacite = verifyBiaxial(section, { N, My, Mz }, profile);
      expect(capacite.converged).toBe(true);

      const contour = interactionCurveAtN(section, N, profile, { steps: 72 });
      const rayon = rayonDuContour(contour, Math.atan2(Mz, My));

      expect(Math.abs(rayon - capacite.M_Rd_magnitude) / capacite.M_Rd_magnitude).toBeLessThan(
        TOLERANCE
      );
    }
  });
});
