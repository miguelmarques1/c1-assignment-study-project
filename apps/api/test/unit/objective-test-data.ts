import type { Question } from '@english-quest/shared';

export const mcQuestion = (overrides: Partial<Extract<Question, { format: 'multiple_choice' }>> = {}): Question => ({
  format: 'multiple_choice',
  prompt: 'What does the writer blame for the collapse?',
  options: ['Rising interest rates', "The council's refusal to consult tenants", 'A shortage of builders', 'National housing policy'],
  answer: "The council's refusal to consult tenants",
  explanation: 'The second paragraph pins the collapse on the council.',
  ...overrides,
});

export const fillQuestion = (overrides: Partial<Extract<Question, { format: 'fill_blank' }>> = {}): Question => ({
  format: 'fill_blank',
  prompt: 'If the council ___ the tenants, the scheme would have survived.',
  answer: ['had listened to', 'had heard'],
  explanation: "A third conditional puts the past perfect in the if-clause: 'had listened to'.",
  ...overrides,
});

export const orderingQuestion = (): Question => ({
  format: 'ordering',
  prompt: "Put the writer's arguments in the order they are made.",
  segments: ['First', 'Second', 'Third'],
  answer: [1, 0, 2],
  explanation: 'The order follows the paragraphs.',
});

export const matchingQuestion = (): Question => ({
  format: 'matching',
  prompt: 'Match each word to its meaning.',
  left: ['a', 'b', 'c'],
  right: ['x', 'y', 'z'],
  answer: [1, 0, 2],
  explanation: 'Dictionary.',
});

/** Five valid questions: mc, fill, mc, fill, mc. */
export function validQuestions(): Question[] {
  return [mcQuestion(), fillQuestion(), mcQuestion({ prompt: 'Which tone?' }), fillQuestion({ prompt: '___ the tenants been heard, the vote would differ.', answer: ['Had'] }), mcQuestion({ prompt: 'Which title?' })];
}
