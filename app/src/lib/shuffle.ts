/**
 * Deterministic, seeded shuffle — used to enforce ExamVersion.randomizeQuestions
 * and .randomizeAnswers, which were real stored fields with zero effect on
 * the exam-taking UI before this. Presentation-only: it reorders what's
 * rendered, never what's stored, so grading (which matches on examQuestionId
 * and choice id, not position) is unaffected either way.
 *
 * Seeded by attemptId (plus a per-question suffix for choice shuffling) so
 * the same attempt always renders the same order across reloads — a
 * reshuffling exam on every page refresh would be disorienting and would
 * look like a bug, not a feature.
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return h;
}

export function seededShuffle<T>(items: T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed));
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
