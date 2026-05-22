export type Explanation = {
  id?: number;
  word: string;
  meaning?: { partOfSpeech?: string; text?: string } | string;
  roots?: Array<{
    part?: string;
    meaning?: string;
    source?: string;
    reason?: string;
    related?: string[];
  }>;
  memory?: string;
  associations?: Array<{ word?: string; note?: string }>;
  collocations?: string[];
};

export type VocabCard = {
  id: number;
  orderIndex: number;
  word: string;
  phonetic: string;
  meaning: string;
  explanation: Explanation;
};

export type UserPreferenceDto = {
  accent: string;
  soundMode: string;
  progressFilter: string;
  eyeCareLevel: number;
};

export type UserStateDto = {
  preferences: UserPreferenceDto;
  progress: Record<number, number>;
  favorites: number[];
  lastPosition: { page: number; wordId: number | null } | null;
};
