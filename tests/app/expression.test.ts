import { describe, it, expect } from 'vitest';
import { evaluateExpression, ExpressionError } from '../../app/src/expression';

describe('evaluation d une expression saisie', () => {
  it('lit un nombre simple', () => {
    expect(evaluateExpression('30')).toBe(30);
    expect(evaluateExpression('  42.5 ')).toBe(42.5);
  });

  it('accepte la virgule comme separateur decimal', () => {
    expect(evaluateExpression('42,5')).toBe(42.5);
  });

  it("calcule le cas d'usage : un enrobage majore de l'etrier", () => {
    expect(evaluateExpression('30+10')).toBe(40);
    expect(evaluateExpression('30 + 8 + 10')).toBe(48);
  });

  it('respecte la priorite du produit sur la somme', () => {
    expect(evaluateExpression('2+3*4')).toBe(14);
    expect(evaluateExpression('3*4+2')).toBe(14);
  });

  it('respecte les parentheses', () => {
    expect(evaluateExpression('(2+3)*4')).toBe(20);
    expect(evaluateExpression('500/(2+3)')).toBe(100);
  });

  it('gere le signe prefixe', () => {
    expect(evaluateExpression('-30')).toBe(-30);
    expect(evaluateExpression('-30+50')).toBe(20);
    expect(evaluateExpression('10*-2')).toBe(-20);
  });

  it('calcule une mi-hauteur', () => {
    expect(evaluateExpression('500/2')).toBe(250);
  });

  it('refuse une saisie vide', () => {
    expect(() => evaluateExpression('')).toThrow(ExpressionError);
    expect(() => evaluateExpression('   ')).toThrow(/vide/);
  });

  it('refuse une expression incomplete', () => {
    expect(() => evaluateExpression('30+')).toThrow(ExpressionError);
    expect(() => evaluateExpression('(30')).toThrow(/parenthese/);
  });

  it('refuse un caractere etranger, en le nommant', () => {
    expect(() => evaluateExpression('30a')).toThrow(/"a"/);
    expect(() => evaluateExpression('trente')).toThrow(ExpressionError);
  });

  it('refuse la division par zero plutot que de rendre l infini', () => {
    expect(() => evaluateExpression('30/0')).toThrow(/division par zero/);
  });

  it("n'evalue jamais de code : une saisie hostile est refusee, pas executee", () => {
    // Le point n'est pas cosmetique : un champ de saisie ne doit jamais
    // devenir du code executable, meme dans une page locale.
    expect(() => evaluateExpression('alert(1)')).toThrow(ExpressionError);
    expect(() => evaluateExpression('1;2')).toThrow(ExpressionError);
  });
});
