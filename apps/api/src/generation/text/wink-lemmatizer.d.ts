/** The package ships no type definitions. Each function returns its input when it knows no lemma for it. */
declare module 'wink-lemmatizer' {
  interface WinkLemmatizer {
    noun(word: string): string;
    verb(word: string): string;
    adjective(word: string): string;
  }
  const lemmatize: WinkLemmatizer;
  export = lemmatize;
}
