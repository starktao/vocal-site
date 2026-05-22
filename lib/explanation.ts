import type { Explanation } from "@/lib/types";

export function explanationMeaningText(explanation: Explanation | undefined, fallback = "") {
  if (!explanation?.meaning) return fallback;
  if (typeof explanation.meaning === "string") return explanation.meaning;
  return `${explanation.meaning.partOfSpeech || ""} ${explanation.meaning.text || ""}`.trim() || fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function normalizeRoots(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const root = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      part: String(root.part || "").trim(),
      meaning: String(root.meaning || "").trim(),
      source: String(root.source || "").trim(),
      reason: String(root.reason || "").trim(),
      related: stringArray(root.related)
    };
  }).filter((root) => root.part || root.meaning || root.source || root.reason || root.related.length);
}

function normalizeAssociations(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return { word: item.trim(), note: "" };
    const assoc = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      word: String(assoc.word || "").trim(),
      note: String(assoc.note || "").trim()
    };
  }).filter((assoc) => assoc.word || assoc.note);
}

export function normalizeExplanation(value: unknown, fallbackWord: string, fallbackMeaning = ""): Explanation {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawMeaning = source.meaning;
  const meaning = typeof rawMeaning === "string"
    ? rawMeaning.trim()
    : {
        partOfSpeech: String((rawMeaning as Record<string, unknown> | undefined)?.partOfSpeech || "").trim(),
        text: String((rawMeaning as Record<string, unknown> | undefined)?.text || fallbackMeaning || "").trim()
      };
  return {
    word: String(source.word || fallbackWord || "").trim(),
    meaning,
    roots: normalizeRoots(source.roots),
    memory: String(source.memory || "").trim(),
    associations: normalizeAssociations(source.associations),
    collocations: stringArray(source.collocations)
  };
}

export function parseExplanationJson(json: string, fallbackWord: string, fallbackMeaning = "") {
  try {
    return normalizeExplanation(JSON.parse(json), fallbackWord, fallbackMeaning);
  } catch {
    return normalizeExplanation({ word: fallbackWord, meaning: fallbackMeaning }, fallbackWord, fallbackMeaning);
  }
}
