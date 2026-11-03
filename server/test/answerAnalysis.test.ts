import { describe, expect, it } from 'vitest';
import { analyzeAnswer } from '../src/answerAnalysis.js';

describe('analyzeAnswer', () => {
  it('finds spoken times', () => {
    const a = analyzeAnswer('Hoy abrimos a las nueve y media de la mañana hasta las dos');
    expect(a.timesMentioned).toEqual(['a las nueve y media de la mañana', 'hasta las dos']);
    expect(a.summary).toContain('compruébelo');
  });

  it('finds digit times', () => {
    expect(analyzeAnswer('De 9:30 a 14:00').timesMentioned).toEqual(['De 9:30', 'a 14:00']);
  });

  it('does not invent a time when none is given', () => {
    const a = analyzeAnswer('Pues no sabría decirle, llame mañana');
    expect(a.timesMentioned).toEqual([]);
    expect(a.summary).toContain('no incluye una hora de apertura clara');
  });

  it('detects closed', () => {
    const a = analyzeAnswer('Hoy está cerrado por festivo');
    expect(a.mentionsClosed).toBe(true);
    expect(a.summary).toContain('cerrado');
  });

  it('handles empty answers', () => {
    expect(analyzeAnswer('  ').summary).toBe('No se recibió una respuesta.');
  });
});
