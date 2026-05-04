import type { QuizSanitized, QuizWithQuestions } from "@/lib/types/database";

export function sanitizeQuizForPlayer(quiz: QuizWithQuestions): QuizSanitized {
  return {
    ...quiz,
    questions: quiz.questions.map((q) => ({
      ...q,
      answer_options: q.answer_options.map((o) => {
        const { is_correct, ...rest } = o;
        void is_correct;
        return rest;
      }),
    })),
  };
}

export function getQuestionByIndex<
  Q extends { questions: Array<{ position: number }> },
>(quiz: Q, index: number): Q["questions"][number] | undefined {
  const sorted = [...quiz.questions].sort((a, b) => a.position - b.position);
  return sorted[index];
}
