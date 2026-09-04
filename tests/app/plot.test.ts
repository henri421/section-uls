import { describe, it, expect } from 'vitest';
import {
  dataBounds,
  includeOrigin,
  makeScale,
  niceTicks,
  padBounds,
  plotSvg,
  polylinePath,
} from '../../app/src/plot';
import type { Bounds, PlotBox, PlotPoint, PlotSeries } from '../../app/src/plot';

/**
 * Verifie qu'un pas est de la forme 1, 2 ou 5 fois une puissance de dix,
 * c'est-a-dire un pas qu'un lecteur suit sans effort.
 */
function mantisseDuPas(pas: number): number {
  const puissance = 10 ** Math.floor(Math.log10(pas));
  return pas / puissance;
}

function estPasLisible(pas: number): boolean {
  const mantisse = mantisseDuPas(pas);
  return [1, 2, 5, 10].some((m) => Math.abs(mantisse - m) < 1e-9);
}

function pasDe(ticks: number[]): number {
  return ticks[1] - ticks[0];
}

describe('cadrage d un nuage de points', () => {
  it('rend les bornes exactes d un nuage ordinaire', () => {
    const nuage: PlotPoint[] = [
      { x: -2, y: 10 },
      { x: 5, y: -3 },
      { x: 1, y: 7 },
    ];

    expect(dataBounds(nuage)).toEqual({ xMin: -2, xMax: 5, yMin: -3, yMax: 10 });
  });

  it('rend null sur un tableau vide, sans inventer de bornes', () => {
    expect(dataBounds([])).toBeNull();
  });

  it('ouvre un intervalle non degenere autour d un point unique', () => {
    const bornes = dataBounds([{ x: 3, y: -4 }]);
    expect(bornes).not.toBeNull();

    const elargi = padBounds(bornes as NonNullable<typeof bornes>, 0.05);

    // Etendue non nulle : sans cela, la transformation vers l'ecran
    // diviserait par zero.
    expect(elargi.xMax - elargi.xMin).toBeGreaterThan(0);
    expect(elargi.yMax - elargi.yMin).toBeGreaterThan(0);

    // Et centree sur le point : le point unique reste au milieu du cadre.
    expect((elargi.xMin + elargi.xMax) / 2).toBeCloseTo(3, 12);
    expect((elargi.yMin + elargi.yMax) / 2).toBeCloseTo(-4, 12);
  });

  it('elargit proportionnellement une etendue non nulle', () => {
    const elargi = padBounds({ xMin: 0, xMax: 100, yMin: -50, yMax: 50 }, 0.1);

    expect(elargi.xMin).toBeCloseTo(-10, 12);
    expect(elargi.xMax).toBeCloseTo(110, 12);
    expect(elargi.yMin).toBeCloseTo(-60, 12);
    expect(elargi.yMax).toBeCloseTo(60, 12);
  });

  it('etend vers zero un nuage entierement negatif sans deplacer l autre borne', () => {
    const etendu = includeOrigin({ xMin: -30, xMax: -10, yMin: -8, yMax: -2 });

    expect(etendu).toEqual({ xMin: -30, xMax: 0, yMin: -8, yMax: 0 });
  });

  it('etend vers zero un nuage entierement positif sans deplacer l autre borne', () => {
    const etendu = includeOrigin({ xMin: 10, xMax: 30, yMin: 2, yMax: 8 });

    expect(etendu).toEqual({ xMin: 0, xMax: 30, yMin: 0, yMax: 8 });
  });

  it('ne change rien a des bornes contenant deja l origine', () => {
    const bornes = { xMin: -5, xMax: 5, yMin: -1, yMax: 9 };

    expect(includeOrigin(bornes)).toEqual(bornes);
  });
});

describe('graduations lisibles', () => {
  it('gradue [0, 100] par pas de 20 ou 25, en ordre croissant et dans la plage', () => {
    const ticks = niceTicks(0, 100, 5);

    expect(ticks.length).toBeGreaterThan(1);
    const pas = pasDe(ticks);
    expect([20, 25]).toContain(pas);

    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(100);
    }
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });

  it('inclut exactement la graduation zero sur une plage franchissant zero', () => {
    const ticks = niceTicks(-30, 70, 5);

    // L'axe passe par zero : cette graduation ne doit jamais manquer, et pas
    // davantage etre remplacee par un 1e-16 qui s'afficherait « 0,0 » par
    // chance.
    expect(ticks).toContain(0);
  });

  it('rend un pas de la forme 1/2/5 x 10^k sur une plage minuscule', () => {
    const ticks = niceTicks(0, 0.003, 5);

    expect(ticks.length).toBeGreaterThan(1);
    expect(estPasLisible(pasDe(ticks))).toBe(true);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(0.003);
    }
  });

  it('rend un pas de la forme 1/2/5 x 10^k sur une plage enorme', () => {
    const ticks = niceTicks(0, 4e6, 5);

    expect(ticks.length).toBeGreaterThan(1);
    expect(estPasLisible(pasDe(ticks))).toBe(true);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(4e6);
    }
  });

  it('ne boucle pas indefiniment sur une plage d etendue nulle', () => {
    const ticks = niceTicks(42, 42, 5);

    expect(ticks.length).toBeLessThanOrEqual(1);
  });

  it('borne le nombre de graduations meme si la cible est absurde', () => {
    expect(niceTicks(0, 1, 0).length).toBeLessThan(100);
    expect(niceTicks(0, 1, -3).length).toBeLessThan(100);
  });
});

const BOITE: PlotBox = {
  width: 400,
  height: 300,
  margin: { top: 10, right: 20, bottom: 40, left: 50 },
};

describe('transformation vers l ecran', () => {
  const bornes: Bounds = { xMin: -100, xMax: 300, yMin: 0, yMax: 80 };
  const echelle = makeScale(bornes, BOITE);

  it('place xMin sur la marge gauche et xMax sur le bord droit du cadre utile', () => {
    expect(echelle.x(-100)).toBeCloseTo(50, 9);
    expect(echelle.x(300)).toBeCloseTo(400 - 20, 9);
  });

  it('INVERSE l axe vertical : yMax en haut, yMin en bas', () => {
    // En SVG l'axe vertical descend. Sans inversion le graphe est a l'envers :
    // cela se voit tout de suite a l'ecran, et rien ne l'attrape en test si on
    // ne l'assert pas.
    expect(echelle.y(80)).toBeCloseTo(10, 9);
    expect(echelle.y(0)).toBeCloseTo(300 - 40, 9);
    expect(echelle.y(80)).toBeLessThan(echelle.y(0));
  });

  it('place le milieu de la plage au milieu du cadre', () => {
    expect(echelle.x(100)).toBeCloseTo((50 + 380) / 2, 9);
    expect(echelle.y(40)).toBeCloseTo((10 + 260) / 2, 9);
  });

  it('ne rend pas NaN sur des bornes d etendue nulle', () => {
    const plate = makeScale({ xMin: 5, xMax: 5, yMin: -2, yMax: -2 }, BOITE);

    expect(Number.isFinite(plate.x(5))).toBe(true);
    expect(Number.isFinite(plate.y(-2))).toBe(true);
  });
});

describe('chemins de polyligne', () => {
  const echelle = makeScale({ xMin: 0, xMax: 10, yMin: 0, yMax: 10 }, BOITE);

  it('rend une chaine vide sur un tableau vide', () => {
    // Ni « M » seul, ni undefined : un attribut `d` incomplet est une erreur
    // silencieuse en SVG.
    expect(polylinePath([], echelle)).toBe('');
  });

  it('commence par M et enchaine un L par point suivant', () => {
    const chemin = polylinePath(
      [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 0 },
      ],
      echelle
    );

    expect(chemin.startsWith('M ')).toBe(true);
    expect(chemin.match(/L/g)?.length).toBe(2);
    expect(chemin).not.toContain('NaN');
  });

  it('ne referme JAMAIS le trace par Z', () => {
    // Le contour d'un diagramme d'interaction n'est pas ferme : le noyau ne
    // parcourt que la branche du pivot beton. Refermer dessinerait un domaine
    // qui n'a pas ete calcule.
    const chemin = polylinePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      echelle
    );

    expect(chemin).not.toContain('Z');
    expect(chemin).not.toContain('z');
  });

  it('rend un point unique sans L', () => {
    const chemin = polylinePath([{ x: 5, y: 5 }], echelle);

    expect(chemin.startsWith('M ')).toBe(true);
    expect(chemin).not.toContain('L');
  });
});

function cercleDeClasse(svg: string, classe: string): { cx: number; cy: number } | null {
  const motif = new RegExp(`<circle class="${classe}" cx="(-?[\\d.]+)" cy="(-?[\\d.]+)"`);
  const trouve = svg.match(motif);
  return trouve ? { cx: Number(trouve[1]), cy: Number(trouve[2]) } : null;
}

function compte(svg: string, motif: RegExp): number {
  return svg.match(motif)?.length ?? 0;
}

describe('assemblage du graphe SVG', () => {
  const cloche: PlotSeries = {
    points: [
      { x: 0, y: 0 },
      { x: 5, y: 12 },
      { x: 10, y: 0 },
    ],
    classe: 'contour',
  };

  it('rend un viewBox et aucune dimension en dur', () => {
    // La mise a l'echelle est l'affaire de la CSS, comme pour le dessin de la
    // section.
    const svg = plotSvg([cloche], { xLabel: 'N', yLabel: 'M' });

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox=');
    expect(/<svg[^>]*\swidth=/.test(svg)).toBe(false);
    expect(/<svg[^>]*\sheight=/.test(svg)).toBe(false);
  });

  it('rend une balise path par serie', () => {
    const svg = plotSvg(
      [cloche, { points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], classe: 'seconde' }],
      { xLabel: 'N', yLabel: 'M' }
    );

    expect(compte(svg, /<path\b/g)).toBe(2);
  });

  it('ignore une serie vide sans produire de path vide', () => {
    const svg = plotSvg([{ points: [], classe: 'vide' }, cloche], {
      xLabel: 'N',
      yLabel: 'M',
    });

    expect(compte(svg, /<path\b/g)).toBe(1);
    expect(svg).not.toContain('d=""');
    expect(svg).not.toContain('NaN');
  });

  it('rend un graphe sans donnees du tout sans casser', () => {
    const svg = plotSvg([{ points: [], classe: 'vide' }], { xLabel: 'N', yLabel: 'M' });

    expect(svg).toContain('</svg>');
    expect(compte(svg, /<path\b/g)).toBe(0);
    expect(svg).not.toContain('NaN');
  });

  it('rend un marqueur hors bornes ET elargit le cadrage pour le contenir', () => {
    // C'est le cas d'une section depassee : precisement celui ou l'on veut
    // voir DE COMBIEN. Le point sollicitant ne doit jamais etre rogne.
    const svg = plotSvg([cloche], {
      xLabel: 'N',
      yLabel: 'M',
      box: BOITE,
      markers: [{ point: { x: 100, y: 40 }, classe: 'sollicitation' }],
    });

    const marqueur = cercleDeClasse(svg, 'sollicitation');
    expect(marqueur).not.toBeNull();

    const m = marqueur as NonNullable<typeof marqueur>;
    expect(m.cx).toBeGreaterThanOrEqual(BOITE.margin.left);
    expect(m.cx).toBeLessThanOrEqual(BOITE.width - BOITE.margin.right);
    expect(m.cy).toBeGreaterThanOrEqual(BOITE.margin.top);
    expect(m.cy).toBeLessThanOrEqual(BOITE.height - BOITE.margin.bottom);
  });

  it('elargit aussi le cadrage aux extremites des segments', () => {
    const svg = plotSvg([cloche], {
      xLabel: 'N',
      yLabel: 'M',
      box: BOITE,
      markers: [{ point: { x: 200, y: 90 }, classe: 'bout' }],
      segments: [{ a: { x: 0, y: 0 }, b: { x: 200, y: 90 }, classe: 'homothetie' }],
    });

    const bout = cercleDeClasse(svg, 'bout');
    expect(bout).not.toBeNull();
    expect((bout as NonNullable<typeof bout>).cx).toBeLessThanOrEqual(
      BOITE.width - BOITE.margin.right
    );
    expect(svg).toContain('homothetie');
    expect(svg).not.toContain('NaN');
  });

  it('ne laisse jamais passer NaN, y compris sur un point unique', () => {
    // Un NaN dans un attribut SVG ne leve rien : il efface silencieusement le
    // trace.
    const svg = plotSvg([{ points: [{ x: 3, y: 3 }], classe: 'unique' }], {
      xLabel: 'N (kN)',
      yLabel: 'M (kNm)',
    });

    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('Infinity');
  });

  it('porte les libelles d axes et des etiquettes de graduation a virgule', () => {
    const svg = plotSvg([{ points: [{ x: 0, y: 0 }, { x: 0.003, y: 1 }], classe: 'c' }], {
      xLabel: 'N (kN)',
      yLabel: 'M (kNm)',
    });

    expect(svg).toContain('N (kN)');
    expect(svg).toContain('M (kNm)');
    // Separateur decimal francais, via formatNumber.
    expect(svg).toContain(',');
    expect(svg).not.toContain('NaN');
  });

  it('ne referme pas les contours de series', () => {
    const svg = plotSvg([cloche], { xLabel: 'N', yLabel: 'M' });

    expect(svg).not.toContain('Z"');
  });
});
