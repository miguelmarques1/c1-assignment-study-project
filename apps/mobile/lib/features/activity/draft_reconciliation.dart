import '../plan/plan_models.dart';
import 'activity_draft_store.dart';
import 'activity_models.dart';

const draftUpdatedNotice = 'This activity was updated, so your answers were cleared.';

/// What to do with a local draft given the server's view: the §5 rule table,
/// identical to the web's `reconcileDraft`.
sealed class ReconcileOutcome {
  const ReconcileOutcome();
}

class ShowResults extends ReconcileOutcome {
  const ShowResults();
}

class ShowUnavailable extends ReconcileOutcome {
  const ShowUnavailable();
}

/// Start at the first question; the draft (if any) is discarded.
class StartFresh extends ReconcileOutcome {
  const StartFresh({required this.attemptId, this.notice});

  final String? attemptId;
  final String? notice;
}

class RestoreDraft extends ReconcileOutcome {
  const RestoreDraft({required this.draft, required this.attemptId, required this.resumeSubmit});

  final ActivityDraft draft;
  final String? attemptId;
  final bool resumeSubmit;
}

ReconcileOutcome reconcileDraft(ActivityView view, ActivityDraft? draft) {
  final objective = view.objective;
  if (objective == null || objective.result != null) return const ShowResults();
  final open = objective.openAttempt;
  if (view.activity.state == PlanActivityState.skipped || (view.activity.readOnly && open == null)) {
    return const ShowUnavailable();
  }
  final attemptId = open?.id;

  if (draft == null) return StartFresh(attemptId: attemptId);
  if (draft.fingerprint != objective.item.questionsFingerprint) {
    return StartFresh(attemptId: attemptId, notice: draftUpdatedNotice);
  }
  if (attemptId == null) {
    // A draft naming an attempt the server no longer has was abandoned.
    return draft.attemptId == null
        ? RestoreDraft(draft: draft, attemptId: null, resumeSubmit: draft.pendingSubmission)
        : const StartFresh(attemptId: null);
  }
  if (draft.attemptId != null && draft.attemptId != attemptId) return StartFresh(attemptId: attemptId);
  return RestoreDraft(draft: draft.copyWith(attemptId: attemptId), attemptId: attemptId, resumeSubmit: draft.pendingSubmission);
}

/// The question to open on: the first scored one with no answer, or the last
/// when everything is answered (where `Submit answers` waits).
int firstUnansweredIndex(List<ObjectiveQuestion> questions, List<ObjectiveAnswer> answers) {
  final answered = answers.map((answer) => answer.index).toSet();
  for (var position = 0; position < questions.length; position++) {
    final question = questions[position];
    if (question.isScored && !answered.contains(question.index)) return position;
  }
  return questions.isEmpty ? 0 : questions.length - 1;
}
