import type {
  QuestionWithOptions,
  QuizSanitized,
  QuizWithQuestions,
} from "@/lib/types/database";

export function sanitizeQuizForPlayer(quiz: QuizWithQuestions): QuizSanitized {
  return {
    ...quiz,
    questions: quiz.questions.map((q) => ({
      ...q,
      answer_options: q.answer_options.map(
        ({ is_correct: _c, ...rest }) => rest
      ),
    })),
  };
}

export function getQuestionByIndex(
  quiz: QuizWithQuestions,
  index: number
): QuestionWithOptions | undefined {
  const sorted = [...quiz.questions].sort((a, b) => a.position - b.position);
  return sorted[index];
}
