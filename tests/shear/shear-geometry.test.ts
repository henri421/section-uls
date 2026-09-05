import { describe, it, expect } from 'vitest';
import { shearGeometry } from '../../src/shear/shear-geometry';
import { rectangularSection } from '../../src/geometry/rectangle';
import { circularSection } from '../../src/geometry/circle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

describe('shearGeometry', () => {
  it('rend la largeur d ame et l aire de beton du rectangle', () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: 942, depthFromTop: 450, steel }],
    });

    const g = shearGeometry(section, 1);

    expect(g.bw).toBeCloseTo(300, 9);
    expect(g.Ac).toBeCloseTo(300 * 500, 9);
  });

  it('avec un seul lit tendu, d vaut la position de ce lit', () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: 942, depthFromTop: 450, steel }],
    });

    const g = shearGeometry(section, 1);

    expect(g.d).toBeCloseTo(450, 9);
    expect(g.Asl).toBeCloseTo(942, 9);
  });

  it('avec deux lits tendus d aires egales, d vaut la MOYENNE des deux', () => {
    // Le point du test : `d` se mesure jusqu'au CENTRE DE GRAVITE des
    // armatures tendues (definition EC2), pas jusqu'a la barre la plus
    // eloignee (convention d'abaque de `effectiveDepth`). Ici la barre la
    // plus eloignee est a 450 mm, le centre de gravite a 425 mm.
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [
        { area: 600, depthFromTop: 450, steel },
        { area: 600, depthFromTop: 400, steel },
      ],
    });

    const g = shearGeometry(section, 1);

    expect(g.d).toBeCloseTo(425, 9);
    expect(g.Asl).toBeCloseTo(1200, 9);
  });

  it('pondere le centre de gravite par les aires quand les lits different', () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [
        { area: 900, depthFromTop: 450, steel },
        { area: 300, depthFromTop: 400, steel },
      ],
    });

    const g = shearGeometry(section, 1);

    // (900*450 + 300*400) / 1200 = 437,5
    expect(g.d).toBeCloseTo(437.5, 9);
    expect(g.Asl).toBeCloseTo(1200, 9);
  });

  it('ne compte que les barres tendues dans Asl', () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [
        { area: 942, depthFromTop: 450, steel },
        { area: 400, depthFromTop: 50, steel }, // comprimees, en haut
      ],
    });

    const g = shearGeometry(section, 1);

    expect(g.Asl).toBeCloseTo(942, 9);
    expect(g.d).toBeCloseTo(450, 9);
  });

  it('inverse la zone tendue quand le moment change de sens', () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [
        { area: 942, depthFromTop: 450, steel },
        { area: 400, depthFromTop: 50, steel },
      ],
    });

    const g = shearGeometry(section, -1);

    // Fibre inferieure comprimee : les barres tendues sont celles du haut,
    // et `d` se mesure depuis la fibre INFERIEURE.
    expect(g.Asl).toBeCloseTo(400, 9);
    expect(g.d).toBeCloseTo(450, 9);
  });

  it('refuse une geometrie non rectangulaire', () => {
    const section = circularSection({ diameter: 600, concrete, rebars: [] });

    expect(() => shearGeometry(section, 1)).toThrow(/rectangulaire/i);
  });

  it('refuse une section sans armature tendue', () => {
    const section = rectangularSection({ width: 300, height: 500, concrete, rebars: [] });

    expect(() => shearGeometry(section, 1)).toThrow(/armature/i);
  });
});
