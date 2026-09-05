import { describe, it, expect } from 'vitest';
import { ec2Recommended, createConcrete, createSteel, rectangularSection, verifyUniaxial } from '../src/index';
import {
  polygonSection,
  circularSection,
  circularRebarCage,
  rebarRow,
  rectangularRebarLayout,
  verifyBiaxial,
} from '../src/index';
import { parseModel, serializeModel, resolveModel, FORMAT_VERSION } from '../src/index';
import { verifySection, interactionCurveAtN, interactionCurveNM, utilizationRatio } from '../src/index';
import { interactionDiagramNM } from '../src/index';
import type { DiagramPointNM } from '../src/index';
import { verifyServiceUniaxial, crackedProperties } from '../src/index';
import { verifyCrackWidth, effectiveTensionArea } from '../src/index';
import { sectionCurvature, uncrackedProperties } from '../src/index';
import { SUPPORTED_FORMAT_VERSIONS } from '../src/index';
import type {
  SectionModel,
  ServiceActionModel,
  ServiceActionsModel,
  ResolvedServiceActions,
} from '../src/index';

describe('API publique du noyau', () => {
  it("permet de verifier une section rectangulaire de bout en bout via l'entree publique", () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);
    const As = 4 * Math.PI * 10 ** 2;

    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: As, depthFromTop: 450, steel }],
    });

    const result = verifyUniaxial(section, { N: 0, M: 0 }, profile);

    expect(result.converged).toBe(true);
    expect(result.M_Rd).toBeGreaterThan(0);
  });
});

describe('API publique — session 2 et 3', () => {
  it("l'exemple du README s'execute tel quel depuis l'entree publique", () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);

    const pieu = circularSection({
      diameter: 600,
      concrete,
      rebars: circularRebarCage({ diameter: 600, cover: 50, barDiameter: 20, count: 8, steel }),
    });

    const resultat = verifyUniaxial(pieu, { N: 0, M: 0 }, profile);

    expect(resultat.converged).toBe(true);
    expect(resultat.M_Rd).toBeGreaterThan(200);
    expect(resultat.M_Rd).toBeLessThan(280);
  });

  it('la verification deviee est accessible depuis l entree publique', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);

    const layout = rectangularRebarLayout({
      width: 400,
      height: 400,
      cover: 30,
      stirrupDiameter: 8,
      steel,
      rows: [
        { face: 'bottom', bars: { count: 3, diameter: 20 } },
        { face: 'top', bars: { count: 3, diameter: 20 } },
      ],
    });

    const section = rectangularSection({ width: 400, height: 400, concrete, rebars: layout.bars });
    const r = verifyBiaxial(section, { N: 500, My: 1, Mz: 1 }, profile);

    expect(r.converged).toBe(true);
    expect(r.M_Rd_magnitude).toBeGreaterThan(0);
  });

  it('les primitives polygonales sont exportees', () => {
    expect(typeof polygonSection).toBe('function');
    expect(typeof rebarRow).toBe('function');
  });
});

describe('API publique — verdict et domaine', () => {
  it('le verdict est atteignable depuis l entree publique', () => {
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
    const section = rectangularSection({ width: 400, height: 400, concrete, rebars: layout.bars });

    const v = verifySection(section, { N: 500, My: 30, Mz: 30 }, profile);
    expect(typeof v.ok).toBe('boolean');
    expect(v.utilization).toBeGreaterThan(0);

    expect(interactionCurveAtN(section, 500, profile, { steps: 8 }).length).toBeGreaterThan(0);
    expect(interactionCurveNM(section, profile, { steps: 8 })).toHaveLength(8);
    expect(typeof utilizationRatio).toBe('function');
  });

  it('le diagramme N-M complet est atteignable depuis l entree publique', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);

    const section = rectangularSection({
      width: 300, height: 500, concrete,
      rebars: [{ depthFromTop: 450, area: 3 * Math.PI * 10 ** 2, steel }],
    });

    const diagramme: DiagramPointNM[] = interactionDiagramNM(section, profile, { steps: 8 });

    expect(diagramme).toHaveLength(16);
    expect(diagramme[0].sense).toBe(-1);
    expect(diagramme[diagramme.length - 1].sense).toBe(1);
  });
});

describe('API publique — persistance', () => {
  it('un modele se serialise, se relit et se resout depuis l entree publique', () => {
    const modele = {
      formatVersion: FORMAT_VERSION,
      engineVersion: '0.1.0',
      norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1, nBands: 200 },
      concrete: { fck: 25 },
      steel: { fyk: 500, Es: 200000 },
      geometry: { kind: 'rectangle' as const, width: 400, height: 400 },
      reinforcement: {
        kind: 'rectangular-layout' as const,
        cover: 30,
        stirrupDiameter: 8,
        rows: [{ face: 'bottom' as const, bars: { count: 3, diameter: 20 } }],
      },
      action: { N: 500, My: 1, Mz: 0 },
    };

    const relu = parseModel(serializeModel(modele));
    const resolu = resolveModel(relu);

    expect(resolu.section.rebars).toHaveLength(3);
    expect(resolu.concrete.fcd).toBeCloseTo(25 / 1.5, 9);
  });
});

describe('API publique — service', () => {
  it('la verification en service est atteignable depuis l entree publique', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);
    const As = 3 * (Math.PI * 20 ** 2) / 4;

    const section = rectangularSection({
      width: 300, height: 500, concrete,
      rebars: [{ depthFromTop: 450, area: As, steel }],
    });

    const r = verifyServiceUniaxial(section, { N: 0, M: 100 });
    expect(r.converged).toBe(true);
    expect(r.sigmaC).toBeGreaterThan(0);
    expect(typeof crackedProperties).toBe('function');
  });
});

describe('API publique — ouverture de fissures', () => {
  it("l'ouverture de fissure est atteignable de bout en bout depuis l'entree publique", () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);

    const section = rectangularSection({
      width: 300, height: 500, concrete,
      rebars: rectangularRebarLayout({
        width: 300, height: 500, cover: 30, stirrupDiameter: 8, steel,
        rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
      }).bars,
    });

    const r = verifyCrackWidth(section, { N: 0, M: 100 });
    expect(r.converged).toBe(true);
    expect(r.wk).toBeGreaterThan(0);
    expect(typeof effectiveTensionArea).toBe('function');
  });
});

describe('API publique — courbure', () => {
  it('la courbure en service est atteignable de bout en bout depuis l entree publique', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);
    const As = 3 * (Math.PI * 20 ** 2) / 4;

    const section = rectangularSection({
      width: 300, height: 500, concrete,
      rebars: [{ depthFromTop: 452, area: As, steel }],
    });

    const r = sectionCurvature(section, { N: 0, M: 100 });
    expect(r.converged).toBe(true);
    expect(r.curvature).toBeGreaterThan(0);
    expect(typeof uncrackedProperties).toBe('function');
  });
});

describe('API publique — format v2 et sollicitations de service', () => {
  it('expose les types et la liste des versions lues, et resout le service de bout en bout', () => {
    const modele: SectionModel = {
      formatVersion: FORMAT_VERSION,
      engineVersion: '0.1.0',
      norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1, nBands: 200 },
      concrete: { fck: 25 },
      steel: { fyk: 500, Es: 200000 },
      geometry: { kind: 'rectangle', width: 300, height: 500 },
      reinforcement: {
        kind: 'rectangular-layout',
        cover: 30,
        stirrupDiameter: 8,
        rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
      },
      action: { N: 0, My: 150, Mz: 0 },
      serviceActions: {
        characteristic: { N: 0, M: 110 },
        quasiPermanent: { N: 0, M: 80 },
      },
    };

    // Les types sont bien exportes et nommables depuis l'entree publique.
    const caract: ServiceActionModel | undefined = modele.serviceActions?.characteristic;
    const toutes: ServiceActionsModel | undefined = modele.serviceActions;
    expect(caract).toEqual({ N: 0, M: 110 });
    expect(toutes?.quasiPermanent).toEqual({ N: 0, M: 80 });

    expect([...SUPPORTED_FORMAT_VERSIONS]).toContain(FORMAT_VERSION);
    expect([...SUPPORTED_FORMAT_VERSIONS]).toContain(1);

    const resolu = resolveModel(parseModel(serializeModel(modele)));
    const service: ResolvedServiceActions | undefined = resolu.serviceActions;
    const qp = service?.quasiPermanent;
    if (qp === undefined) throw new Error('sollicitation quasi-permanente attendue');

    // Aucune conversion a la charge de l'appelant : la forme rendue est
    // celle que prennent les trois modules de service.
    expect(verifyServiceUniaxial(resolu.section, qp).converged).toBe(true);
    expect(sectionCurvature(resolu.section, qp).converged).toBe(true);
    expect(verifyCrackWidth(resolu.section, qp).wk).toBeGreaterThan(0);
  });
});
