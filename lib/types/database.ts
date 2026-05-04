export type QuizType = "sequential" | "host_paced";

export type SessionStatus =
  | "waiting"
  | "active"
  | "question"
  | "review"
  | "finished";

export type Profile = {
  id: string;
  display_name: string;
  created_at: string;
};

export type Quiz = {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  type: QuizType;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type Question = {
  id: string;
  quiz_id: string;
  position: number;
  text: string;
  image_url: string | null;
  time_limit_secs: number;
  created_at: string;
};

export type AnswerOption = {
  id: string;
  question_id: string;
  position: number;
  text: string;
  is_correct: boolean;
};

export type Session = {
  id: string;
  quiz_id: string;
  host_id: string;
  join_code: string;
  status: SessionStatus;
  current_question_index: number;
  question_started_at: string | null;
  review_ends_at: string | null;
  allow_late_join: boolean;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type SessionPlayer = {
  id: string;
  session_id: string;
  nickname: string;
  joined_at: string;
  is_active: boolean;
  total_points: number;
};

export type PlayerAnswer = {
  id: string;
  session_id: string;
  player_id: string;
  question_id: string;
  answer_option_id: string | null;
  response_time_ms: number | null;
  is_correct: boolean;
  points: number;
  answered_at: string | null;
};

export type QuestionWithOptions = Question & {
  answer_options: AnswerOption[];
};

export type SanitizedAnswerOption = Omit<AnswerOption, "is_correct">;

export type QuestionSanitized = Question & {
  answer_options: SanitizedAnswerOption[];
};

export type QuizSanitized = Omit<QuizWithQuestions, "questions"> & {
  questions: QuestionSanitized[];
};

export type QuizWithQuestions = Quiz & {
  questions: QuestionWithOptions[];
};

export type SessionFull = Session & {
  quiz: QuizWithQuestions;
};

export type ReviewStats = {
  option_percentages: Record<string, number>;
  fastest_correct_players: {
    rank: number;
    nickname: string;
    response_time_ms: number;
    player_id: string;
  }[];
  leaderboard_top5: {
    rank: number;
    nickname: string;
    total_points: number;
    player_id: string;
  }[];
  per_player_rows?: {
    nickname: string;
    answer_label: string;
    is_correct: boolean;
    response_time_ms: number | null;
    points: number;
    player_id: string;
  }[];
};

export type FinalLeaderboardEntry = {
  rank: number;
  nickname: string;
  total_points: number;
  player_id: string;
};
