// Etape 10, C6 (audit du 10/11/2026, U4) : la note detaille le tranchant et le pivot.
// Test d'acceptation : ne pas modifier.
import { describe, it, expect } from 'vitest';
import {
  rectangularSection,
  createConcrete,
  createSteel,
  ec2Recommended,
  verifyShear,
  resolveModel,
  verifySection,
  capacityAtAngle,
  FORMAT_VERSION,
  ENGINE_VERSION,
} from '../../src/index';
import type { SectionModel } from '../../src/index';
import { blocTranchant } from '../../app/src/checks-view';
import { blocsFlexionUls } from '../../app/src/uls-view';
import { etatUltime } from '../../app/src/lever-arm';

const profil = ec2Recommended();
const beton = createConcrete(30, profil);
const acier = createSteel(500, 200000, profil);
const poutre = () =>
  rectangularSection({
    width: 300,
    height: 500,
    concrete: beton,
    rebars: [{ depthFromTop: 450, area: 1000, steel: acier }],
  });

const valeur = (lignes: { libelle: string; valeur: string }[], libelle: string): string => {
  const l = lignes.find((x) => x.libelle === libelle);
  if (l === undefined) throw new Error(`ligne absente : ${libelle} (lignes : ${lignes.map((x) => x.libelle).join(' / ')})`);
  return l.valeur;
};

describe('C6 : intermediaires du tranchant', () => {
  it('sans cadres : d, k, rho_l, C_Rd,c, v_min, sigma_cp (6.2.a, 6.3N)', () => {
    const r = verifyShear(poutre(), { V_Ed: 40, N_Ed: 0 }, profil);
    const b = blocTranchant({ resultat: r }, 40);
    expect(valeur(b.lignes, 'd (hauteur utile)')).toBe('450 mm');
    expect(valeur(b.lignes, 'k (6.2.a)')).toBe('1,67');
    expect(valeur(b.lignes, 'ρ_l (6.2.a)')).toBe('0,741 %');
    expect(valeur(b.lignes, 'C_Rd,c')).toBe('0,12');
    expect(valeur(b.lignes, 'v_min (6.3N)')).toMatch(/^0,41\d? MPa$/);
    expect(valeur(b.lignes, 'σ_cp')).toBe('0 MPa');
    // Sans cadres, aucune ligne des cadres.
    expect(b.lignes.some((l) => l.libelle === 'A_sw / s')).toBe(false);
  });

  it('avec cadres : z, cot theta, nu_1, alpha_cw, f_ywd, A_sw/s (6.8, 6.9)', () => {
    const r = verifyShear(poutre(), { V_Ed: 80, N_Ed: 0 }, profil, { links: { Asw: 100, s: 200, fywk: 500 } });
    const b = blocTranchant({ resultat: r }, 80);
    expect(valeur(b.lignes, 'z = 0,9 d')).toBe('405 mm');
    expect(valeur(b.lignes, 'cot θ')).toMatch(/^\d(,\d+)?$/);
    expect(valeur(b.lignes, 'ν_1 (6.6N)')).toBe('0,528');
    expect(valeur(b.lignes, 'α_cw')).toBe('1');
    expect(valeur(b.lignes, 'f_ywd')).toBe('434,8 MPa');
    expect(valeur(b.lignes, 'A_sw / s')).toBe('0,5 mm²/mm');
    expect(r.withLinks?.AswOverS).toBeCloseTo(0.5, 10);
    // Les formules sont nommees.
    const tout = b.lignes.map((l) => `${l.libelle} ${l.valeur}`).join(' | ');
    expect(tout).toContain('6.8');
    expect(tout).toContain('6.9');
  });
});

describe('C6 : etat ultime et pivot', () => {
  const c = { epsC2: 2e-3, epsCu2: 3.5e-3 };

  it('pivot B : x dans la section, beton a eps_cu2', () => {
    const e = etatUltime(100, 360, 400, c);
    expect(e.pivot).toBe('B');
    expect(e.epsC).toBeCloseTo(3.5e-3, 12);
    expect(e.epsS).toBeCloseTo(9.1e-3, 12); // allongement, positif
  });

  it('pivot C : section entierement comprimee, eps_c2 a (1 - eps_c2/eps_cu2) h', () => {
    const e = etatUltime(500, 360, 400, c);
    expect(e.pivot).toBe('C');
    const profC = (1 - 2 / 3.5) * 400;
    expect(e.epsC).toBeCloseTo((2e-3 * 500) / (500 - profC), 12);
    expect(e.epsS).toBeCloseTo((-2e-3 * (500 - 360)) / (500 - profC), 12); // raccourcissement, negatif
  });

  it('la note de flexion porte x, x/d, eps_c, eps_s et le pivot', () => {
    const modele: SectionModel = {
      formatVersion: FORMAT_VERSION,
      engineVersion: ENGINE_VERSION,
      name: 'Poutre',
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
      action: { N: 0, My: 100, Mz: 0 },
    };
    const resolu = resolveModel(modele);
    const resultat = verifySection(resolu.section, resolu.action, resolu.norm, { mode: 'constant-N' });
    const etat = capacityAtAngle(resolu.section, resultat.neutralAxis!.angle, resolu.action.N, resolu.norm);
    const blocs = blocsFlexionUls(resolu, resultat, etat);
    const bloc = blocs.find((b) => b.titre === 'Déformations et pivot');
    expect(bloc, 'bloc « Déformations et pivot » absent').toBeDefined();
    const l = bloc!.lignes;
    expect(valeur(l, 'Profondeur d\'axe neutre x')).toMatch(/^\d+(,\d+)? mm$/);
    expect(valeur(l, 'x / d')).toMatch(/^0,\d+$/);
    expect(valeur(l, 'ε_c (fibre la plus comprimée)')).toBe('3,5 ‰');
    expect(valeur(l, 'ε_s (armature la plus tendue)')).toMatch(/^\d+(,\d+)? ‰$/);
    expect(valeur(l, 'Pivot')).toBe('B — béton à ε_cu2');
    expect(bloc!.note).toContain('pivot A');
  });
});
