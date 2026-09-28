export interface CorrectionTargetTag {
  tag: string;
  label: string;
}

export interface TaxonomyTagEntry {
  tag: string;
  label: string;
  description: string;
}

export interface CorrectionPromptVariablesInput {
  /** The task's own statement, verbatim. */
  taskStatement: string;
  /** The task's own target tags, in order; empty for a general task. */
  targetTags: readonly CorrectionTargetTag[];
  /** The correction's frozen `submitted_text`, never the live draft. */
  submittedText: string;
  /** Every analysis tag in the taxonomy in force. */
  analysisTags: readonly TaxonomyTagEntry[];
}

/**
 * Renders `writing-correct`'s four variables (A23), using only the task
 * owner's own task and text — no profile summary, and no other
 * participant's data ever enters this prompt.
 */
export function buildCorrectionPromptVariables(input: CorrectionPromptVariablesInput): Record<string, string> {
  return {
    task_statement: input.taskStatement,
    target_structures:
      input.targetTags.length > 0
        ? input.targetTags.map((target) => `- ${target.tag} (${target.label})`).join('\n')
        : 'None: this is a general writing task.',
    submission: input.submittedText,
    taxonomy: input.analysisTags.map((entry) => `${entry.tag} — ${entry.label}: ${entry.description}`).join('\n'),
  };
}
