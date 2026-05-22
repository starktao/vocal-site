"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Star, UserCircle, X } from "lucide-react";
import { FormEvent, KeyboardEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AiChatMessageDto, Explanation, UserStateDto, VocabBookDto, VocabCard } from "@/lib/types";

type VocabResponse = {
  user: { id: number; username: string; role: "USER" | "ADMIN" };
  book: VocabBookDto;
  books: VocabBookDto[];
  words: VocabCard[];
  state: UserStateDto;
};

const preferredVoices: Record<string, string[]> = {
  "en-US": ["Samantha", "Alex", "Google US English", "Microsoft Aria"],
  "en-GB": ["Daniel", "Serena", "Google UK English", "Microsoft Sonia"]
};

const pronunciationOverrides: Record<string, string> = {
  carbondioxide: "carbon dioxide",
  elniño: "El Nino"
};

const progressFilterValues = ["all", "unfamiliar", "favorite"] as const;
const eyeCareLabels = ["默认", "轻柔", "护眼", "深护眼"];
type ProgressFilter = typeof progressFilterValues[number];

function normalize(word: string) {
  return String(word || "").toLowerCase().replace(/[^a-z]/g, "");
}

function spokenText(rawWord: string) {
  const firstWord = String(rawWord).split("/")[0].replace(/[^\p{L}\s-]/gu, "").trim();
  const key = normalize(firstWord);
  return pronunciationOverrides[key] || firstWord.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function voiceScore(voice: SpeechSynthesisVoice, accent: string) {
  const lang = String(voice.lang || "").toLowerCase().replace("_", "-");
  const name = String(voice.name || "");
  const lowerName = name.toLowerCase();
  let score = 0;
  if (lang === accent.toLowerCase()) score += 100;
  if (lang.startsWith(accent.toLowerCase())) score += 60;
  if (voice.localService) score += 8;
  if (lowerName.includes("premium") || lowerName.includes("enhanced")) score += 6;
  preferredVoices[accent].forEach((preferred, index) => {
    if (name.includes(preferred)) score += 40 - index * 5;
  });
  return score;
}

function meaningText(explanation: Explanation | undefined, fallback: string) {
  if (!explanation?.meaning) return fallback;
  if (typeof explanation.meaning === "string") return explanation.meaning;
  return `${explanation.meaning.partOfSpeech || ""} ${explanation.meaning.text || ""}`.trim();
}

function normalizeProgressFilter(value: string | undefined): ProgressFilter {
  if (value === "familiar") return "all";
  return progressFilterValues.includes(value as ProgressFilter) ? value as ProgressFilter : "all";
}

function normalizeEyeCareLevel(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(3, Math.trunc(value || 0)));
}

function useDebouncedCallback(callback: () => void, delay = 450) {
  const timerRef = useRef<number | null>(null);
  return useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(callback, delay);
  }, [callback, delay]);
}

export function VocabApp({ initialData }: { initialData: VocabResponse }) {
  const gridRef = useRef<HTMLElement | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);
  const cardRefs = useRef(new Map<number, HTMLElement>());
  const toastTimer = useRef<number | null>(null);
  const lastCardClick = useRef<{ id: number | null; time: number }>({ id: null, time: 0 });
  const savedPage = initialData.state.lastPosition?.page || 1;
  const savedWordId = initialData.state.lastPosition?.wordId || null;
  const initialActiveId = savedWordId
    ?? initialData.words[(savedPage - 1) * 96]?.id
    ?? initialData.words[0]?.id
    ?? null;
  const initialProgressFilter = normalizeProgressFilter(initialData.state.preferences.progressFilter);
  const initialEyeCareLevel = normalizeEyeCareLevel(initialData.state.preferences.eyeCareLevel);
  const initialProgress = initialData.state.progress || {};
  const initialFavorites = new Set(initialData.state.favorites || []);
  const initialFilteredWords = initialData.words.filter((entry) => {
    const count = Math.min(5, Math.max(0, initialProgress[entry.id] || 0));
    if (initialProgressFilter === "unfamiliar" && count < 3) return false;
    if (initialProgressFilter === "favorite" && !initialFavorites.has(entry.id)) return false;
    return true;
  });
  const initialVisibleId = (() => {
    if (initialProgressFilter === "all") return initialActiveId;
    if (!initialFilteredWords.length) return null;
    const anchor = initialData.words.find((entry) => entry.id === initialActiveId) || initialData.words[0];
    if (!anchor) return initialFilteredWords[0].id;
    return initialFilteredWords.reduce((best, entry) => {
      const bestDistance = Math.abs(best.orderIndex - anchor.orderIndex);
      const entryDistance = Math.abs(entry.orderIndex - anchor.orderIndex);
      return entryDistance < bestDistance ? entry : best;
    }, initialFilteredWords[0]).id;
  })();
  const initialPage = (() => {
    if (!initialVisibleId) return savedPage;
    const pageWords = initialProgressFilter === "all" ? initialData.words : initialFilteredWords;
    const index = pageWords.findIndex((entry) => entry.id === initialVisibleId);
    return index >= 0 ? Math.floor(index / 96) + 1 : savedPage;
  })();

  const [wordList, setWordList] = useState(initialData.words);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [accent, setAccent] = useState(initialData.state.preferences.accent || "en-US");
  const [soundMode, setSoundMode] = useState(initialData.state.preferences.soundMode || "auto");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>(initialProgressFilter);
  const [eyeCareLevel, setEyeCareLevel] = useState(initialEyeCareLevel);
  const [progress, setProgress] = useState<Record<number, number>>(initialProgress);
  const [favorites, setFavorites] = useState<Set<number>>(() => initialFavorites);
  const [pageSize, setPageSize] = useState(96);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [activeId, setActiveId] = useState<number | null>(initialVisibleId);
  const [allAnchorId, setAllAnchorId] = useState<number | null>(initialActiveId);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<"explain" | "ai">("explain");
  const [toast, setToast] = useState("");
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    cardRefs.current.clear();
    lastCardClick.current = { id: null, time: 0 };
    setQuery("");
    setSearchOpen(false);
    setProgress(initialProgress);
    setFavorites(initialFavorites);
    setCurrentPage(initialPage);
    setActiveId(initialVisibleId);
    setAllAnchorId(initialActiveId);
    setDetailId(null);
    setDetailTab("explain");
    setWordList(initialData.words);
  }, [initialData.book.slug]);

  const filteredWords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return wordList.filter((entry) => {
      const count = Math.min(5, Math.max(0, progress[entry.id] || 0));
      if (progressFilter === "unfamiliar" && count < 3) return false;
      if (progressFilter === "favorite" && !favorites.has(entry.id)) return false;
      if (!needle) return true;
      return (
        entry.word.toLowerCase().includes(needle) ||
        entry.meaning.toLowerCase().includes(needle) ||
        entry.phonetic.toLowerCase().includes(needle)
      );
    });
  }, [favorites, progress, progressFilter, query, wordList]);

  const totalPages = Math.max(1, Math.ceil(filteredWords.length / pageSize));
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const visibleWords = filteredWords.slice((safePage - 1) * pageSize, safePage * pageSize);
  const activeIndex = activeId == null ? -1 : filteredWords.findIndex((entry) => entry.id === activeId);
  const activePage = activeIndex >= 0 ? Math.floor(activeIndex / pageSize) + 1 : null;
  const detailEntry = wordList.find((word) => word.id === detailId) || null;
  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1600);
  }, []);

  const savePosition = useCallback((wordId: number, page: number) => {
    void fetch("/api/last-position", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, wordId, bookSlug: initialData.book.slug }),
      keepalive: true
    });
  }, [initialData.book.slug]);

  const savePreferences = useDebouncedCallback(() => {
    void fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accent,
        soundMode,
        progressFilter,
        eyeCareLevel,
        selectedBookSlug: initialData.book.slug
      })
    });
  });

  const chooseVoice = useCallback(() => {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices().filter((item) => {
      const lang = String(item.lang || "").toLowerCase().replace("_", "-");
      return lang.startsWith(accent.toLowerCase().split("-")[0]);
    });
    return voices.sort((a, b) => voiceScore(b, accent) - voiceScore(a, accent))[0] || null;
  }, [accent]);

  const speak = useCallback((rawWord: string) => {
    const target = spokenText(rawWord);
    if (!("speechSynthesis" in window) || !target) {
      showToast("当前浏览器不支持发音");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(target);
    utterance.lang = accent;
    utterance.rate = 0.88;
    utterance.pitch = 1;
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }, [accent, showToast, voice]);

  const calculatePageSize = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return 96;
    const styles = getComputedStyle(grid);
    const columns = styles.gridTemplateColumns && styles.gridTemplateColumns !== "none"
      ? styles.gridTemplateColumns.split(" ").length
      : 1;
    const rowHeight = Number.parseFloat(styles.gridAutoRows) || 68;
    const rowGap = Number.parseFloat(styles.rowGap) || 0;
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    const availableHeight = Math.max(0, grid.clientHeight - paddingTop - paddingBottom);
    const rows = Math.max(1, Math.floor((availableHeight + rowGap) / (rowHeight + rowGap)));
    return Math.max(1, columns * rows);
  }, []);

  const focusCard = useCallback((id: number) => {
    const card = cardRefs.current.get(id);
    if (!card) return;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  const closeDetail = useCallback(() => setDetailId(null), []);

  const pageForEntry = useCallback((entry: VocabCard, list = filteredWords) => {
    const index = list.findIndex((item) => item.id === entry.id);
    return index >= 0 ? Math.floor(index / pageSize) + 1 : safePage;
  }, [filteredWords, pageSize, safePage]);

  const findClosestEntry = useCallback((list: VocabCard[], anchorId: number | null = allAnchorId) => {
    if (!list.length) return null;
    const anchorIndex = anchorId == null ? -1 : wordList.findIndex((entry) => entry.id === anchorId);
    if (anchorIndex < 0) return list[0];
    const anchorOrder = wordList[anchorIndex].orderIndex;
    return list.reduce((best, entry) => {
      const bestDistance = Math.abs(best.orderIndex - anchorOrder);
      const entryDistance = Math.abs(entry.orderIndex - anchorOrder);
      return entryDistance < bestDistance ? entry : best;
    }, list[0]);
  }, [allAnchorId, wordList]);

  const selectEntry = useCallback((entry: VocabCard, options: { focus?: boolean; speakWord?: boolean; keepDetail?: boolean } = {}) => {
    const changed = activeId !== entry.id;
    const entryPage = pageForEntry(entry);
    setCurrentPage(entryPage);
    setActiveId(entry.id);
    if (progressFilter === "all") {
      setAllAnchorId(entry.id);
      savePosition(entry.id, entryPage);
    }
    if (!options.keepDetail && (changed || detailId !== entry.id)) setDetailId(null);
    if (options.focus) requestAnimationFrame(() => focusCard(entry.id));
    if (options.speakWord && soundMode === "auto") speak(entry.word);
  }, [activeId, detailId, focusCard, pageForEntry, progressFilter, savePosition, soundMode, speak]);

  const openDetail = useCallback((entry: VocabCard) => {
    selectEntry(entry, { keepDetail: true });
    setDetailId(entry.id);
    setDetailTab("explain");
    setProgress((current) => ({ ...current, [entry.id]: Math.min(999, (current[entry.id] || 0) + 1) }));
    void fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordId: entry.id, increment: true, bookSlug: initialData.book.slug })
    }).then((response) => response.ok ? response.json() : null).then((data) => {
      if (data?.wordId) setProgress((current) => ({ ...current, [data.wordId]: data.viewCount }));
    });
  }, [initialData.book.slug, selectEntry]);

  const toggleFavorite = useCallback((entry: VocabCard) => {
    const nextFavorite = !favorites.has(entry.id);
    setFavorites((current) => {
      const next = new Set(current);
      if (nextFavorite) next.add(entry.id);
      else next.delete(entry.id);
      return next;
    });
    showToast(nextFavorite ? `已收藏 ${entry.word}` : `已取消收藏 ${entry.word}`);
    void fetch("/api/favorite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordId: entry.id, favorite: nextFavorite, bookSlug: initialData.book.slug })
    }).then((response) => response.ok ? response.json() : Promise.reject()).then((data) => {
      setFavorites((current) => {
        const next = new Set(current);
        if (data.favorite) next.add(data.wordId);
        else next.delete(data.wordId);
        return next;
      });
    }).catch(() => {
      setFavorites((current) => {
        const next = new Set(current);
        if (nextFavorite) next.delete(entry.id);
        else next.add(entry.id);
        return next;
      });
      showToast("收藏保存失败");
    });
  }, [favorites, initialData.book.slug, showToast]);

  function handleBookChange(value: string) {
    if (!value || value === initialData.book.slug) return;
    setDetailId(null);
    window.location.href = `/learn?book=${encodeURIComponent(value)}`;
  }

  const setPage = useCallback((page: number, force = false) => {
    const next = Math.max(1, Math.min(totalPages, page));
    if (next === safePage && !force && activeId) return;
    setCurrentPage(next);
    setDetailId(null);
    lastCardClick.current = { id: null, time: 0 };
    const nextEntry = filteredWords[(next - 1) * pageSize] || null;
    setActiveId(nextEntry?.id ?? null);
    if (nextEntry) {
      if (progressFilter === "all") {
        setAllAnchorId(nextEntry.id);
        savePosition(nextEntry.id, next);
      }
      requestAnimationFrame(() => focusCard(nextEntry.id));
    }
  }, [activeId, filteredWords, focusCard, pageSize, progressFilter, safePage, savePosition, totalPages]);

  const getColumnCount = useCallback(() => {
    const cards = Array.from(cardRefs.current.values());
    if (!cards.length) return 1;
    const firstTop = cards[0].offsetTop;
    let columns = 0;
    for (const card of cards) {
      if (Math.abs(card.offsetTop - firstTop) > 2) break;
      columns += 1;
    }
    return Math.max(1, columns);
  }, []);

  const moveSelection = useCallback((key: string) => {
    if (!filteredWords.length) return;
    const currentIndex = visibleWords.findIndex((entry) => entry.id === activeId);
    const columns = getColumnCount();
    let nextIndex = currentIndex;
    if (key === "ArrowRight") nextIndex = currentIndex < 0 ? 0 : currentIndex + 1;
    if (key === "ArrowLeft") nextIndex = currentIndex < 0 ? 0 : currentIndex - 1;
    if (key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : currentIndex + columns;
    if (key === "ArrowUp") nextIndex = currentIndex < 0 ? 0 : currentIndex - columns;
    if (nextIndex >= visibleWords.length && safePage < totalPages) {
      setCurrentPage(safePage + 1);
      requestAnimationFrame(() => {
        const entry = filteredWords[safePage * pageSize];
        if (entry) selectEntry(entry, { focus: true, speakWord: true });
      });
      return;
    }
    if (nextIndex < 0 && safePage > 1) {
      setCurrentPage(safePage - 1);
      requestAnimationFrame(() => {
        const entry = filteredWords[(safePage - 1) * pageSize - 1];
        if (entry) selectEntry(entry, { focus: true, speakWord: true });
      });
      return;
    }
    nextIndex = Math.max(0, Math.min(visibleWords.length - 1, nextIndex));
    const nextEntry = visibleWords[nextIndex];
    if (nextEntry) selectEntry(nextEntry, { focus: true, speakWord: true });
  }, [activeId, filteredWords, getColumnCount, pageSize, safePage, selectEntry, totalPages, visibleWords]);

  function handleCardClick(entry: VocabCard) {
    const now = performance.now();
    const isDoubleClick = lastCardClick.current.id === entry.id && now - lastCardClick.current.time <= 320;
    lastCardClick.current = { id: entry.id, time: now };
    selectEntry(entry, { focus: true, speakWord: true });
    if (isDoubleClick) {
      openDetail(entry);
      lastCardClick.current = { id: null, time: 0 };
    }
  }

  function handleCardKey(event: KeyboardEvent<HTMLElement>, entry: VocabCard) {
    if (event.key === "Enter") {
      event.preventDefault();
      selectEntry(entry, { focus: true, speakWord: true });
    }
    if (event.key === " ") {
      event.preventDefault();
      if (detailId === entry.id) {
        closeDetail();
      } else {
        selectEntry(entry, { focus: true, speakWord: true, keepDetail: true });
        openDetail(entry);
      }
    }
    if (event.key.toLowerCase() === "k") {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(entry);
    }
  }

  function updateWordExplanation(wordId: number, explanation: Explanation, meaning: string) {
    setWordList((current) => current.map((word) => word.id === wordId ? { ...word, explanation, meaning } : word));
  }

  function insertPrivateWord(anchorId: number, word: VocabCard) {
    setWordList((current) => {
      if (current.some((entry) => entry.id === word.id)) return current;
      const index = current.findIndex((entry) => entry.id === anchorId);
      if (index < 0) return [...current, word];
      return [...current.slice(0, index + 1), word, ...current.slice(index + 1)];
    });
    setProgress((current) => ({ ...current, [word.id]: 0 }));
    setFavorites((current) => new Set(current));
    showToast(`已加入 ${word.word}`);
  }

  function handleProgressFilterChange(value: string) {
    const nextFilter = normalizeProgressFilter(value);
    setProgressFilter(nextFilter);
    setDetailId(null);
    lastCardClick.current = { id: null, time: 0 };
    const anchorEntry = wordList.find((entry) => entry.id === allAnchorId) || wordList[0] || null;
    if (nextFilter === "all") {
      if (!anchorEntry) {
        setActiveId(null);
        setCurrentPage(1);
        return;
      }
      const anchorPage = Math.floor(wordList.findIndex((entry) => entry.id === anchorEntry.id) / pageSize) + 1;
      setActiveId(anchorEntry.id);
      setCurrentPage(anchorPage);
      requestAnimationFrame(() => focusCard(anchorEntry.id));
      return;
    }
    const nextList = wordList.filter((entry) => {
      const count = Math.min(5, Math.max(0, progress[entry.id] || 0));
      if (nextFilter === "unfamiliar") return count >= 3;
      if (nextFilter === "favorite") return favorites.has(entry.id);
      return true;
    });
    const nextEntry = findClosestEntry(nextList, anchorEntry?.id || allAnchorId);
    if (!nextEntry) {
      setActiveId(null);
      setCurrentPage(1);
      return;
    }
    const nextIndex = nextList.findIndex((entry) => entry.id === nextEntry.id);
    setActiveId(nextEntry.id);
    setCurrentPage(nextIndex >= 0 ? Math.floor(nextIndex / pageSize) + 1 : 1);
    requestAnimationFrame(() => focusCard(nextEntry.id));
  }

  useEffect(() => {
    const update = () => {
      const nextSize = calculatePageSize();
      setPageSize((current) => {
        if (current === nextSize) return current;
        const anchorIndex = activeId == null ? (safePage - 1) * current : filteredWords.findIndex((entry) => entry.id === activeId);
        setCurrentPage(anchorIndex >= 0 ? Math.floor(anchorIndex / nextSize) + 1 : 1);
        return nextSize;
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [activeId, calculatePageSize, filteredWords, safePage]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const refresh = () => setVoice(chooseVoice());
    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
    const timer = window.setTimeout(refresh, 250);
    return () => {
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener?.("voiceschanged", refresh);
    };
  }, [chooseVoice]);

  useEffect(() => {
    savePreferences();
  }, [accent, eyeCareLevel, progressFilter, savePreferences, soundMode]);

  useEffect(() => {
    if (progressFilter !== "all" || activeId == null || activePage == null) return;
    setAllAnchorId(activeId);
    savePosition(activeId, activePage);
  }, [activeId, activePage, progressFilter, savePosition]);

  useEffect(() => {
    if (safePage !== currentPage) setCurrentPage(safePage);
  }, [currentPage, safePage]);

  useEffect(() => {
    if (!filteredWords.length) {
      setActiveId(null);
      setDetailId(null);
      return;
    }
    if (activeId != null && activeIndex >= 0) {
      const nextPage = Math.floor(activeIndex / pageSize) + 1;
      if (safePage !== nextPage) {
        setCurrentPage(nextPage);
      } else {
        requestAnimationFrame(() => focusCard(activeId));
      }
      return;
    }
    const fallbackIndex = Math.min((safePage - 1) * pageSize, filteredWords.length - 1);
    const fallback = progressFilter === "all"
      ? filteredWords[Math.max(0, fallbackIndex)]
      : findClosestEntry(filteredWords, allAnchorId);
    if (fallback) {
      const fallbackPage = pageForEntry(fallback);
      setActiveId(fallback.id);
      setDetailId(null);
      if (progressFilter === "all") {
        setAllAnchorId(fallback.id);
        savePosition(fallback.id, fallbackPage);
      }
    }
  }, [activeId, activeIndex, allAnchorId, filteredWords, findClosestEntry, focusCard, pageForEntry, pageSize, progressFilter, safePage, savePosition]);

  useEffect(() => {
    function handleDocumentClick(event: globalThis.MouseEvent) {
      if (!detailId || !detailRef.current) return;
      if (detailRef.current.contains(event.target as Node)) return;
      setDetailId(null);
      lastCardClick.current = { id: null, time: 0 };
      event.preventDefault();
      event.stopPropagation();
    }
    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [detailId]);

  useEffect(() => {
    function handleKeydown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setDetailId(null);
      if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key)) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || target?.isContentEditable) return;
        event.preventDefault();
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") setDetailId(null);
        moveSelection(event.key);
      }
      if (event.key.toLowerCase() === "k") {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || target?.isContentEditable) return;
        const entry = wordList.find((word) => word.id === activeId);
        if (!entry) return;
        event.preventDefault();
        toggleFavorite(entry);
      }
    }
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [activeId, moveSelection, toggleFavorite, wordList]);

  const start = filteredWords.length ? (safePage - 1) * pageSize + 1 : 0;
  const end = Math.min(safePage * pageSize, filteredWords.length);

  return (
    <main className={`app eye-care-${eyeCareLevel}`}>
      <header className="topbar">
        <div>
          <h1>{initialData.book.title}<span className="variant">本地网站版</span></h1>
          <div className="page-summary">{start}-{end} / {filteredWords.length} cards · {pageSize}/page</div>
        </div>
        <label className={`search${searchOpen || query ? " is-open" : ""}`}>
          <Search aria-hidden="true" />
          <input
            type="search"
            autoComplete="off"
            aria-label="Search vocabulary"
            value={query}
            onFocus={() => setSearchOpen(true)}
            onClick={() => setSearchOpen(true)}
            onBlur={() => !query.trim() && setSearchOpen(false)}
            onChange={(event) => {
              setQuery(event.target.value);
              setDetailId(null);
            }}
          />
        </label>
        <div className="controls">
          <Segmented value={accent} options={[["en-US", "US"], ["en-GB", "UK"]]} onChange={setAccent} className="voice" />
          <Segmented value={soundMode} options={[["auto", "Auto"], ["manual", "Manual"]]} onChange={setSoundMode} className="sound-mode" />
          <label className="book-select" aria-label="Vocabulary book">
            <span>词书</span>
            <select
              value={initialData.book.slug}
              onChange={(event) => handleBookChange(event.currentTarget.value)}
              onInput={(event) => handleBookChange(event.currentTarget.value)}
            >
              {initialData.books.map((book) => (
                <option key={book.slug} value={book.slug}>{book.title}</option>
              ))}
            </select>
          </label>
          <label className="eye-slider" aria-label="Eye care level">
            <span className="eye-label">护眼</span>
            <input
              className="eye-range"
              type="range"
              min={0}
              max={3}
              step={1}
              value={eyeCareLevel}
              onChange={(event) => setEyeCareLevel(normalizeEyeCareLevel(Number(event.target.value)))}
            />
            <span className="eye-level-text">{eyeCareLabels[eyeCareLevel]}</span>
          </label>
          <Segmented
            value={progressFilter}
            options={[["all", "All"], ["unfamiliar", "不熟"], ["favorite", "收藏"]]}
            onChange={handleProgressFilterChange}
            className="progress-filter"
          />
          <div className="page-chip" aria-label="Pagination">
            <button className="page-btn" type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              <ChevronLeft />
            </button>
            <span>Page</span>
            <input
              className="page-number"
              type="number"
              min={1}
              max={totalPages}
              value={safePage}
              onChange={(event) => setPage(Number.parseInt(event.target.value, 10) || 1, true)}
            />
            <span className="page-total">/ {totalPages}</span>
            <button className="page-btn" type="button" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
              <ChevronRight />
            </button>
          </div>
          <div className="account-actions">
            {initialData.user.role === "ADMIN" && <Link className="tiny-link" href="/admin">Admin</Link>}
            <Link className="tiny-link account-link" href="/settings"><UserCircle size={15} /> {initialData.user.username}</Link>
          </div>
        </div>
      </header>

      <section ref={gridRef} className="grid" aria-label="Vocabulary cards">
        {visibleWords.map((entry) => {
          const count = Math.min(5, Math.max(0, progress[entry.id] || 0));
          const favorite = favorites.has(entry.id);
          return (
            <article
              key={entry.id}
              ref={(node) => {
                if (node) cardRefs.current.set(entry.id, node);
                else cardRefs.current.delete(entry.id);
              }}
              className={`card${entry.id === activeId ? " is-active" : ""}`}
              tabIndex={0}
              role="button"
              aria-label={entry.word}
              onClick={() => handleCardClick(entry)}
              onKeyDown={(event) => handleCardKey(event, entry)}
            >
              <div className="word-row">
                <div className="word">{entry.word}{entry.isPrivate && <span className="private-mark">私</span>}</div>
                <button
                  className={`favorite-btn${favorite ? " is-on" : ""}`}
                  type="button"
                  tabIndex={-1}
                  aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${entry.word}`}
                  title="收藏 (K)"
                  onClick={(event: MouseEvent) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleFavorite(entry);
                  }}
                >
                  <Star />
                </button>
                <button
                  className="sound-wave"
                  type="button"
                  tabIndex={-1}
                  aria-label={`Speak ${entry.word}`}
                  title="Speak"
                  onClick={(event: MouseEvent) => {
                    event.preventDefault();
                    event.stopPropagation();
                    speak(entry.word);
                  }}
                >
                  <SoundWaveIcon />
                </button>
              </div>
              <div className="card-meta">
                <div className="phonetic">{entry.phonetic || " "}</div>
                <div className="memory-dots">
                  {Array.from({ length: 5 }, (_, index) => <span key={index} className={`memory-dot${index < count ? " is-on" : ""}`} />)}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <aside ref={detailRef} className={`detail${detailEntry ? " is-open" : ""}`} aria-live="polite">
        <div className="detail-head">
          <div className="detail-title">
            <div className="detail-word">{detailEntry?.word || ""}</div>
            <div className="detail-phonetic">{detailEntry?.phonetic || ""}</div>
          </div>
          <button className="icon-btn" type="button" aria-label="Close" onClick={closeDetail}>
            <X />
          </button>
        </div>
        <div className="detail-body">
          {detailEntry && (
            <>
              <div className="detail-tabs">
                <button className={detailTab === "explain" ? "is-active" : ""} type="button" onClick={() => setDetailTab("explain")}>解释</button>
                <button className={detailTab === "ai" ? "is-active" : ""} type="button" onClick={() => setDetailTab("ai")}>AI</button>
              </div>
              {detailTab === "explain" ? (
                <DetailContent entry={detailEntry} />
              ) : (
                <AiPanel
                  entry={detailEntry}
                  bookSlug={initialData.book.slug}
                  onUpdateExplanation={updateWordExplanation}
                  onAddWord={insertPrivateWord}
                />
              )}
            </>
          )}
        </div>
      </aside>
      <div className={`toast${toast ? " is-open" : ""}`}>{toast}</div>
    </main>
  );
}

function Segmented({ value, options, onChange, className }: {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
  className: string;
}) {
  const wrapperClass = className === "progress-filter" ? "progress-filter" : `${className}-toggle`;
  return (
    <div className={wrapperClass} aria-label={className}>
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          className={`${className}-option${value === optionValue ? " is-active" : ""}`}
          type="button"
          onClick={() => onChange(optionValue)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function DetailContent({ entry }: { entry: VocabCard }) {
  const explanation = entry.explanation;
  const roots = explanation?.roots || [];
  const associations = explanation?.associations || [];
  const collocations = explanation?.collocations || [];
  return (
    <>
      <section className="block meaning">
        <h2>单词意思</h2>
        <p>{meaningText(explanation, entry.meaning)}</p>
      </section>
      {roots.length > 0 && (
        <section className="block">
          <h2>词根拆解</h2>
          <div className="roots">
            {roots.map((root, index) => (
              <div className="root-line" key={`${root.part || "root"}-${index}`}>
                <span className="root-key">{root.part || "整词"}</span>
                <div>
                  <div>{root.meaning || ""}</div>
                  {root.source && <p>来源：{root.source}</p>}
                  {root.reason && <p>说明：{root.reason}</p>}
                  {!!root.related?.length && <div className="examples">相关词：{root.related.join(" / ")}</div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {explanation?.memory && (
        <section className="block pun">
          <h2>趣味记忆</h2>
          <p>{explanation.memory}</p>
        </section>
      )}
      {associations.length > 0 && (
        <section className="block">
          <h2>联想词</h2>
          <div className="similar-list">
            {associations.map((assoc, index) => (
              <span className="similar-word" key={`${assoc.word || "assoc"}-${index}`}>
                {assoc.note ? `${assoc.word} · ${assoc.note}` : assoc.word}
              </span>
            ))}
          </div>
        </section>
      )}
      {collocations.length > 0 && (
        <section className="block">
          <h2>常见搭配</h2>
          {collocations.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}
        </section>
      )}
    </>
  );
}

type UpdatePreview = {
  status: "ok";
  summary: string;
  explanation: Explanation;
  meaningText: string;
};

type AddWordCandidate = {
  word: string;
  phonetic?: string;
  meaningText: string;
  reason?: string;
  explanation: Explanation;
};

type AddWordPreview = {
  status: "ok";
  summary: string;
  candidates: AddWordCandidate[];
};

function AiPanel({
  entry,
  bookSlug,
  onUpdateExplanation,
  onAddWord
}: {
  entry: VocabCard;
  bookSlug: string;
  onUpdateExplanation: (wordId: number, explanation: Explanation, meaning: string) => void;
  onAddWord: (anchorId: number, word: VocabCard) => void;
}) {
  const [messages, setMessages] = useState<AiChatMessageDto[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [updatePreview, setUpdatePreview] = useState<UpdatePreview | null>(null);
  const [addPreview, setAddPreview] = useState<AddWordPreview | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let alive = true;
    setMessages([]);
    setInput("");
    setNotice("");
    setUpdatePreview(null);
    setAddPreview(null);
    fetch(`/api/ai/session?book=${encodeURIComponent(bookSlug)}&wordId=${entry.id}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!alive || !data?.messages) return;
        setMessages(data.messages);
      });
    return () => {
      alive = false;
    };
  }, [bookSlug, entry.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [entry.id]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const optimistic: AiChatMessageDto = {
      id: Date.now(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString()
    };
    const assistantId = Date.now() + 1;
    const streamingMessage: AiChatMessageDto = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, optimistic, streamingMessage]);
    setInput("");
    setNotice("");
    setUpdatePreview(null);
    setAddPreview(null);
    setBusy(true);
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookSlug, wordId: entry.id, message: text })
    });
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => null);
      setMessages((current) => current.filter((message) => message.id !== assistantId));
      setBusy(false);
      setNotice(data?.error || "AI 回复失败");
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let answer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        answer += chunk;
        setMessages((current) => current.map((message) => (
          message.id === assistantId ? { ...message, content: answer } : message
        )));
      }
      const tail = decoder.decode();
      if (tail) {
        answer += tail;
        setMessages((current) => current.map((message) => (
          message.id === assistantId ? { ...message, content: answer } : message
        )));
      }
      if (!answer.trim()) {
        setMessages((current) => current.filter((message) => message.id !== assistantId));
        setNotice("AI 没有返回内容");
      }
    } catch {
      setNotice("AI 回复中断，请重试");
    } finally {
      setBusy(false);
      reader.releaseLock();
    }
  }

  async function previewUpdate() {
    setBusy(true);
    setNotice("");
    setUpdatePreview(null);
    setAddPreview(null);
    const response = await fetch("/api/ai/update-explanation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookSlug, wordId: entry.id })
    });
    const data = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setNotice(data?.error || "生成更新预览失败");
      return;
    }
    if (data.status !== "ok") {
      setNotice(data.reason || "没有发现适合更新的内容。");
      return;
    }
    setUpdatePreview(data);
  }

  async function confirmUpdate() {
    if (!updatePreview) return;
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/ai/update-explanation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookSlug, wordId: entry.id, explanation: updatePreview.explanation })
    });
    const data = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setNotice(data?.error || "保存更新失败");
      return;
    }
    onUpdateExplanation(entry.id, data.explanation, data.meaningText);
    setUpdatePreview(null);
    setNotice("已更新本词解释");
  }

  async function previewAddWord() {
    setBusy(true);
    setNotice("");
    setUpdatePreview(null);
    setAddPreview(null);
    const response = await fetch("/api/ai/add-word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookSlug, wordId: entry.id })
    });
    const data = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setNotice(data?.error || "生成新词预览失败");
      return;
    }
    if (data.status !== "ok") {
      setNotice(data.reason || "没有发现适合增添的新词。");
      return;
    }
    setAddPreview(data);
  }

  async function confirmAddWord(candidate: AddWordCandidate) {
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/ai/add-word", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookSlug, wordId: entry.id, candidate })
    });
    const data = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setNotice(data?.error || "加入新词失败");
      return;
    }
    onAddWord(entry.id, data.word);
    setAddPreview(null);
    setNotice(`已加入 ${data.word.word}`);
  }

  return (
    <section className="ai-panel">
      <div className="ai-thread">
        {messages.length === 0 && <div className="ai-empty">可以直接问这个词的用法、辨析、词源或记忆方法。</div>}
        {messages.map((message) => (
          <div key={message.id} className={`ai-message ${message.role}`}>
            <div>{message.content}</div>
          </div>
        ))}
        {busy && <div className="ai-message assistant"><div>处理中...</div></div>}
        <div ref={messageEndRef} />
      </div>
      <form className="ai-input-row" onSubmit={sendMessage}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={`问问 ${entry.word}`}
          rows={2}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button className="primary-btn ai-send" type="submit" disabled={busy || !input.trim()}>发送</button>
      </form>
      <div className="ai-actions">
        <button className="secondary-btn" type="button" onClick={previewUpdate} disabled={busy}>更新解释</button>
        <button className="secondary-btn" type="button" onClick={previewAddWord} disabled={busy}>增添新词</button>
      </div>
      {notice && <div className="ai-notice">{notice}</div>}
      {updatePreview && (
        <div className="ai-preview">
          <h3>更新预览</h3>
          <p>{updatePreview.summary}</p>
          <DetailContent entry={{ ...entry, explanation: updatePreview.explanation, meaning: updatePreview.meaningText }} />
          <div className="form-actions">
            <button className="primary-btn" type="button" onClick={confirmUpdate} disabled={busy}>确认更新</button>
            <button className="secondary-btn" type="button" onClick={() => setUpdatePreview(null)} disabled={busy}>取消</button>
          </div>
        </div>
      )}
      {addPreview && (
        <div className="ai-preview">
          <h3>新词预览</h3>
          <p>{addPreview.summary}</p>
          {addPreview.candidates.map((candidate) => (
            <div className="candidate-card" key={candidate.word}>
              <strong>{candidate.word}</strong>
              <span>{candidate.meaningText}</span>
              {candidate.reason && <p>{candidate.reason}</p>}
              <button className="primary-btn" type="button" onClick={() => confirmAddWord(candidate)} disabled={busy}>加入到当前词后</button>
            </div>
          ))}
          <button className="secondary-btn" type="button" onClick={() => setAddPreview(null)} disabled={busy}>取消</button>
        </div>
      )}
    </section>
  );
}

function SoundWaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 8c1.2 1.1 1.8 2.4 1.8 4S7.2 14.9 6 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M11 5c2 1.8 3 4.1 3 7s-1 5.2-3 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3c2.8 2.5 4.2 5.5 4.2 9S18.8 18.5 16 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
