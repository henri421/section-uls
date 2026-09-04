import { describe, it, expect } from 'vitest';
import { effectiveDepth, simplifiedLeverArm } from '../../app/src/lever-arm';
import {
  rectangularSection,
  rectangularRebarLayout,
  createConcrete,
  createSteel,
  ec2Recommended,
  verifySection,
  capacityAtAngle,
} from '../../src/index';

const profileLu = { ...ec2Recommended(), name: 'EC2_LU', alphaCc: 0.85 };
const concrete = createConcrete(30, profileLu);
const steel = createSteel(500, 200000, profileLu);

/** La dalle du cas reel : 1000 x 300, HA14/150 sur DEUX nappes, enrobage 40. */
function dalle() {
  return rectangularSection({
    width: 1000,
    height: 300,
    concrete,
    rebars: rectangularRebarLayout({
      width: 1000,
      height: 300,
      cover: 40,
      steel,
      rows: [
        { face: 'bottom', bars: { diameter: 14, maxSpacing: 150 } },
        { face: 'top', bars: { diameter: 14, maxSpacing: 150 } },
      ],
    }).bars,
  });
}

describe('bras de levier simplifie', () => {
  it('la hauteur utile est mesuree jusqu a l armature tendue la plus eloignee', () => {
    // Axe neutre horizontal a z = -106,3 : les deux nappes sont tendues,
    // mais `d` ne regarde que la plus eloignee de la fibre comprimee.
    const d = effectiveDepth(dalle(), 0, -106.3);

    // Fibre la plus comprimee a z = -150, nappe inferieure a z = +103.
    expect(d).toBeCloseTo(253, 6);
  });

  it('applique la formule des abaques', () => {
    expect(simplifiedLeverArm(253, 43.7)).toBeCloseTo(235.52, 2);
    expect(simplifiedLeverArm(450, 100)).toBeCloseTo(410, 6);
  });

  it('CAS REEL : la dalle luxembourgeoise retrouve les ordres de grandeur usuels', () => {
    const section = dalle();
    const v = verifySection(section, { N: 0, My: 107, Mz: 0 }, profileLu);

    const d = effectiveDepth(section, v.neutralAxis!.angle, v.neutralAxis!.offset);
    expect(d).not.toBeNull();
    // `VerificationResult` ne porte pas la PROFONDEUR d'axe neutre, seulement
    // sa position : on la reprend de l'etat a angle fixe, que l'interface
    // calcule de toute facon pour tracer les resultantes.
    const etat = capacityAtAngle(section, v.neutralAxis!.angle, 0, profileLu)!;
    const z = simplifiedLeverArm(d!, etat.x);

    expect(d!).toBeCloseTo(253, 1);
    // Entre les deux regles de pouce usuelles : 0,9d = 227,7 et 0,8h = 240.
    expect(z).toBeGreaterThan(0.9 * 253);
    expect(z).toBeLessThan(0.8 * 300);
    expect(z).toBeCloseTo(235.5, 1);

    // Et bien SUPERIEUR a la distance entre resultantes, qui est raccourcie
    // par la nappe superieure faiblement tendue.
    expect(z).toBeGreaterThan(v.leverArm!);
    expect(v.leverArm!).toBeCloseTo(212.3, 1);
  });

  it('rend null sans armature tendue, plutot qu un nombre depourvu de sens', () => {
    const section = dalle();
    // Axe neutre rejete sous la section : tout est comprime.
    expect(effectiveDepth(section, 0, 1000)).toBeNull();
  });

  it('en flexion deviee, la hauteur utile se mesure perpendiculairement a l axe neutre', () => {
    const section = dalle();
    const v = verifySection(section, { N: 0, My: 1, Mz: 1 }, profileLu);
    const d = effectiveDepth(section, v.neutralAxis!.angle, v.neutralAxis!.offset);

    expect(d).not.toBeNull();
    // La diagonale d'une dalle large : la hauteur utile perpendiculaire a un
    // axe neutre incline depasse la hauteur droite.
    expect(d!).toBeGreaterThan(253);
  });
});
