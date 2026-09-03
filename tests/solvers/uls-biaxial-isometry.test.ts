import { describe, it, expect } from 'vitest';
import { verifyBiaxial } from '../../src/solvers/uls-biaxial';
import { rotateSection, rotatePoint } from '../../src/geometry/rotate';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

describe('verifyBiaxial — invariance par isometrie', () => {
  // Section RECTANGULAIRE non carree et ferraillage asymetrique : aucune
  // symetrie ne peut masquer une erreur de rotation.
  const layout = rectangularRebarLayout({
    width: 300,
    height: 500,
    cover: 30,
    stirrupDiameter: 8,
    steel,
    rows: [
      { face: 'bottom', bars: { count: 3, diameter: 20 } },
      { face: 'top', bars: { count: 2, diameter: 12 } },
    ],
  });
  const section = rectangularSection({ width: 300, height: 500, concrete, rebars: layout.bars });

  it('tourner la section et le moment du meme angle laisse la capacite inchangee', () => {
    const alpha = 0.3;
    const action = { N: 700, My: 5, Mz: 2 };

    const direct = verifyBiaxial(section, action, profile);
    const tournee = rotateSection(section, alpha);
    const mTourne = rotatePoint({ y: action.My, z: action.Mz }, alpha);
    const apres = verifyBiaxial(tournee, { N: action.N, My: mTourne.y, Mz: mTourne.z }, profile);

    expect(direct.converged).toBe(true);
    expect(apres.converged).toBe(true);

    expect(
      Math.abs(apres.M_Rd_magnitude - direct.M_Rd_magnitude) / direct.M_Rd_magnitude
    ).toBeLessThan(1e-6);
    expect(Math.abs(apres.neutralAxisDepth - direct.neutralAxisDepth)).toBeLessThan(1e-3);

    // Dans la section tournee, l'axe neutre est a theta - alpha.
    const ecart = Math.atan2(
      Math.sin(apres.neutralAxis.angle - (direct.neutralAxis.angle - alpha)),
      Math.cos(apres.neutralAxis.angle - (direct.neutralAxis.angle - alpha))
    );
    expect(Math.abs(ecart)).toBeLessThan(1e-4);
  });

  it('une rotation de 90 deg d un poteau carre le laisse identique a lui-meme', () => {
    const carre = rectangularSection({
      width: 400,
      height: 400,
      concrete,
      rebars: rectangularRebarLayout({
        width: 400,
        height: 400,
        cover: 30,
        stirrupDiameter: 8,
        steel,
        rows: [
          { face: 'bottom', bars: { count: 3, diameter: 20 } },
          { face: 'top', bars: { count: 3, diameter: 20 } },
          { face: 'left', bars: { count: 1, diameter: 20 } },
          { face: 'right', bars: { count: 1, diameter: 20 } },
        ],
      }).bars,
    });

    const a = verifyBiaxial(carre, { N: 600, My: 1, Mz: 0 }, profile);
    const b = verifyBiaxial(carre, { N: 600, My: 0, Mz: 1 }, profile);

    expect(Math.abs(b.M_Rd_magnitude - a.M_Rd_magnitude) / a.M_Rd_magnitude).toBeLessThan(1e-6);
  });
});
