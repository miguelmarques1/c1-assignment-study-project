import lemmatize from 'wink-lemmatizer';

/**
 * A lowercase word and every lemma `wink-lemmatizer` proposes for it as a
 * noun, a verb and an adjective, without duplicates, the word first. The
 * lemmatiser cannot tell which part of speech a word is in context, so the
 * frequency list is asked about all of them and the best rank wins: `saw`
 * counts as common because `see` is.
 */
export function lemmaCandidates(word: string): string[] {
  const candidates = [word, lemmatize.verb(word), lemmatize.noun(word), lemmatize.adjective(word)];
  return [...new Set(candidates)];
}

/** Verb, noun and adjective lemmas in that order, each only when it differs from the word. */
export function inflectionLemmas(word: string): string[] {
  return lemmaCandidates(word).slice(1);
}
