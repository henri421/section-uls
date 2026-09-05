import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseModel } from '../../src/persistence/parse';
import { FORMAT_VERSION } from '../../src/persistence/model-format';
import { resolveModel } from '../../src/persistence/resolve';
import { verifyBiaxial } from '../../src/solvers/uls-biaxial';

/**
 * Temoin de stabilite du format. Ce fichier est ecrit une fois et n'est
 * JAMAIS regenere : un aller-retour ne prouve que la coherence du code avec
 * lui-meme a un instant donne, jamais sa stabilite dans le temps. Si ce test
 * casse, c'est que le format a change — ce qui doit etre un acte delibere,
 * accompagne d'une montee de FORMAT_VERSION, et non un effet de bord.
 */
describe('temoin de format', () => {
  const chemin = fileURLToPath(new URL('./temoin-pieu.json', import.meta.url));
  const json = readFileSync(chemin, 'utf8');

  it('se charge et decrit bien le pieu attendu', () => {
    const m = parseModel(json);
    expect(m.geometry).toEqual({ kind: 'circle', diameter: 600, segments: 32 });
    expect(m.reinforcement.kind).toBe('circular-cage');
    expect(m.action.N).toBe(1200);
  });

  it('est ecrit en version 1 du format et reste lisible apres la montee en version 2', () => {
    // Ce test est la preuve de la retrocompatibilite, et il ne vaut que
    // parce que le fichier n'est PAS regenere : il porte la version 1, celle
    // de tous les modeles deja enregistres par l'utilisateur. Le jour ou
    // `parseModel` se remettrait a exiger l'egalite avec FORMAT_VERSION,
    // c'est ici que cela se verrait.
    const m = parseModel(json);
    expect(m.formatVersion).toBe(1);
    expect(FORMAT_VERSION).toBeGreaterThan(m.formatVersion);
    expect(m.serviceActions).toBeUndefined();
  });

  it('produit toujours le meme moment resistant', () => {
    const r = resolveModel(parseModel(json));
    const resultat = verifyBiaxial(r.section, r.action, r.norm);

    expect(resultat.converged).toBe(true);
    // Valeur relevee a la creation du temoin. Si elle bouge, le moteur a
    // change de comportement : investiguer, ne pas mettre a jour le chiffre
    // sans avoir compris pourquoi.
    expect(resultat.M_Rd_magnitude).toBeCloseTo(380.5, 1);
  });
});
