const STATE_UNKNOWN = 0;
const STATE_ABSENT = 1;
const STATE_PRESENT = 2;
const STATE_CORRECT = 3;

const guessRow = document.getElementById("guessRow");
const nextGuessButton = document.getElementById("nextGuessButton");
const resetButton = document.getElementById("resetButton");
const loadCsvButton = document.getElementById("loadCsvButton");
const answersFileInput = document.getElementById("answersFileInput");
const roundLabel = document.getElementById("roundLabel");
const remainingLabel = document.getElementById("remainingLabel");
const message = document.getElementById("message");
const candidateTitle = document.getElementById("candidateTitle");
const candidateList = document.getElementById("candidateList");
const candidateCountLabel = document.getElementById("candidateCountLabel");
const primaryTabButton = document.getElementById("primaryTabButton");
const eliminationTabButton = document.getElementById("eliminationTabButton");
const sortWordButton = document.getElementById("sortWordButton");
const sortScoreButton = document.getElementById("sortScoreButton");
const sortEliminatesButton = document.getElementById("sortEliminatesButton");
const sortEntropyButton = document.getElementById("sortEntropyButton");

const MAX_VISIBLE_CANDIDATES = 100;
const FEEDBACK_PATTERN_WEIGHTS = [81, 27, 9, 3, 1];
const FEEDBACK_PATTERN_COUNT = 243;
const TAB_PRIMARY = "primary";
const TAB_ELIMINATION = "elimination";

let allAnswers = [];
let remainingAnswers = [];
const POSITION_WEIGHTS = [0.7, 0.8, 0.9, 1.0, 1.1];
let globalHistogram = { counts: new Map(), positionCounts: new Map(), weights: new Map() };
let currentGuess = "";
let boxStates = [STATE_UNKNOWN, STATE_UNKNOWN, STATE_UNKNOWN, STATE_UNKNOWN, STATE_UNKNOWN];
let knownCorrectLetters = [null, null, null, null, null];
let knownMinimumLetterCounts = new Map();
let guessedLetters = new Set();
let primaryCandidates = [];
let eliminationCandidates = [];
let eliminationCandidateCount = 0;
let primaryCandidateEliminations = new Map();
let eliminationCandidateEliminations = new Map();
let activeCandidateTab = TAB_PRIMARY;
let candidateSortByTab = {
  [TAB_PRIMARY]: { key: "score", direction: "desc" },
  [TAB_ELIMINATION]: { key: "entropy", direction: "desc" },
};
let round = 1;
let guessMetricsCache = new Map();

init().catch((error) => {
  handleLoadError(error);
});

async function init() {
  allAnswers = await loadAnswersFromFetch();
  startGame(allAnswers);
}

function startGame(answers) {
  allAnswers = answers;
  remainingAnswers = [...allAnswers];
  globalHistogram = buildFrequencyHistogram(allAnswers);
  round = 1;
  activeCandidateTab = TAB_PRIMARY;
  candidateSortByTab = {
    [TAB_PRIMARY]: { key: "score", direction: "desc" },
    [TAB_ELIMINATION]: { key: "entropy", direction: "desc" },
  };
  knownCorrectLetters = [null, null, null, null, null];
  knownMinimumLetterCounts = new Map();
  guessedLetters = new Set();
  computeCandidateData();
  currentGuess = getTopDisplayedWord();
  boxStates = createInitialStatesForGuess();

  if (!currentGuess) {
    throw new Error("No valid 5-letter words were found in answers.csv");
  }

  renderGuess();
  renderStatus();
  renderCandidateList();
  setMessage("Click each letter to enter Wordle feedback, then press Next guess.");
  nextGuessButton.disabled = false;
  resetButton.disabled = false;
  loadCsvButton.hidden = true;
}

async function loadAnswersFromFetch() {
  const response = await fetch("answers.csv", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
  return parseWordsFromText(text);
}

function parseWordsFromText(text) {
  const words = text
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((word) => /^[a-z]{5}$/.test(word));

  return [...new Set(words)];
}

function handleLoadError(error) {
  const isLocalFile = window.location.protocol === "file:";

  if (isLocalFile) {
    setMessage("Cannot auto-load answers.csv from a local file. Click Load answers.csv or run a local web server.", true);
    nextGuessButton.disabled = true;
    resetButton.disabled = true;
    loadCsvButton.hidden = false;
    primaryCandidates = [];
    eliminationCandidates = [];
    eliminationCandidateCount = 0;
    primaryCandidateEliminations = new Map();
    eliminationCandidateEliminations = new Map();
    renderCandidateList();
    return;
  }

  setMessage(`Failed to load answers.csv: ${error.message}`, true);
  nextGuessButton.disabled = true;
  resetButton.disabled = true;
  primaryCandidates = [];
  eliminationCandidates = [];
  eliminationCandidateCount = 0;
  primaryCandidateEliminations = new Map();
  eliminationCandidateEliminations = new Map();
  renderCandidateList();
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#8e2332" : "#2a3d61";
}

function renderStatus() {
  roundLabel.textContent = `Round ${round}`;
  remainingLabel.textContent = `Remaining answers: ${remainingAnswers.length}`;
}

function renderGuess() {
  guessRow.innerHTML = "";

  [...currentGuess].forEach((letter, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `guess-box state-${boxStates[index]}`;
    button.textContent = letter;
    button.setAttribute("aria-label", `Letter ${letter}, state ${boxStates[index]}`);

    button.addEventListener("click", () => {
      boxStates[index] = (boxStates[index] + 1) % 4;
      button.className = `guess-box state-${boxStates[index]}`;
      button.setAttribute("aria-label", `Letter ${letter}, state ${boxStates[index]}`);
    });

    guessRow.appendChild(button);
  });
}

function buildFrequencyHistogram(words) {
  const counts = new Map();
  const positionCounts = new Map();
  const uniqueWordCounts = new Map();
  const doubleOccurrences = new Map();

  for (const word of words) {
    const uniqueLetters = new Set(word);
    for (const letter of uniqueLetters) {
      counts.set(letter, (counts.get(letter) || 0) + 1);
      uniqueWordCounts.set(letter, (uniqueWordCounts.get(letter) || 0) + 1);
    }

    [...word].forEach((letter, position) => {
      if (!positionCounts.has(letter)) {
        positionCounts.set(letter, new Array(POSITION_WEIGHTS.length).fill(0));
      }
      positionCounts.get(letter)[position] += 1;
    });

    for (const letter of uniqueLetters) {
      const letterCountInWord = word.split('').filter(c => c === letter).length;
      if (letterCountInWord > 1) {
        doubleOccurrences.set(letter, (doubleOccurrences.get(letter) || 0) + 1);
      }
    }
  }

  // Per letter: weight by relative positional frequency, normalized to 0.8-1.2
  const weights = new Map();
  for (const [letter, perPosition] of positionCounts) {
    const maxCount = Math.max(...perPosition);
    const letterWeights = perPosition.map(count => {
      if (maxCount === 0) return 1;
      // Normalize to 0.8-1.2 range so best position gets ~1.2, worst ~0.8
      return 0.8 + 0.4 * (count / maxCount);
    });
    weights.set(letter, letterWeights);
  }

  // clusterFactor: how often is a letter repeated in a word?
  // Higher factor means the letter is frequently doubled (like 'S' in 'SS').
  const clusterFactors = new Map();
  for (const letter of uniqueWordCounts.keys()) {
    const doubleCount = doubleOccurrences.get(letter) || 0;
    const totalUnique = uniqueWordCounts.get(letter);
    clusterFactors.set(letter, doubleCount / totalUnique);
  }

  return { counts, positionCounts, weights, clusterFactors };
}

function scoreWord(word, histogram) {
  let score = 0;
  const seen = new Set();

  [...word].forEach((letter, position) => {
    if (seen.has(letter)) {
      const weight = histogram.weights.get(letter)?.[position] ?? 1;
      const count = histogram.counts.get(letter) || 0;
      const cf = histogram.clusterFactors.get(letter) || 0;
      score += (count * weight) * cf;
      return;
    }
    seen.add(letter);
    const weight = histogram.weights.get(letter)?.[position] ?? 1;
    const count = histogram.counts.get(letter) || 0;
    const cf = histogram.clusterFactors.get(letter) || 0;
    score += (count * weight) * (1.0 - cf);
  });

  return Math.round(score);
}

function rankWordsByHistogram(words, histogram) {
  const ranked = words.map((word) => ({
    word,
    score: scoreWord(word, histogram),
  }));

  ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.word.localeCompare(b.word);
  });

  return ranked;
}

function buildKnownLettersSet() {
  const knownLetters = new Set();

  knownCorrectLetters.forEach((letter) => {
    if (letter) {
      knownLetters.add(letter);
    }
  });

  for (const letter of knownMinimumLetterCounts.keys()) {
    knownLetters.add(letter);
  }

  return knownLetters;
}

function rankWordsForElimination(words) {
  const rankedWithStats = words.map((word) => {
    const uniqueLetters = new Set(word);
    let untestedCount = 0;
    let testedCount = 0;

    for (const letter of uniqueLetters) {
      if (!guessedLetters.has(letter)) {
        untestedCount += 1;
      } else {
        testedCount += 1;
      }
    }

    return {
      word,
      score: scoreWord(word, globalHistogram),
      testedCount,
      untestedCount,
    };
  });

  // Prioritize words that haven't been tested yet to maximize information gain
  const allUntestedOnly = rankedWithStats.filter((entry) => entry.testedCount === 0);
  const sourcePool = allUntestedOnly.length > 0 ? allUntestedOnly : rankedWithStats;

  // Rank by histogram score first so the entropy evaluation is over high-quality candidates
  const sortedByScore = [...sourcePool].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.word.localeCompare(b.word);
  });

  // Limit pool size to avoid performance issues with entropy calculation
  // 1000 is a safe upper bound for most common word lists
  const restrictedPool = sortedByScore.slice(0, 1000);

  const knownLetters = buildKnownLettersSet();
  const ranked = restrictedPool.map((entry) => {
    let knownLetterBonus = 0;
    for (const letter of new Set(entry.word)) {
      if (knownLetters.has(letter)) {
        knownLetterBonus += 1;
      }
    }

    const entropy = getGuessMetrics(entry.word).entropy;

    return {
      word: entry.word,
      score: entry.score,
      eliminationPriority: entropy, // Using entropy as the primary ranker
      testedCount: entry.testedCount,
      untestedCount: entry.untestedCount,
      knownLetterBonus,
    };
  });

  ranked.sort((a, b) => {
    if (b.eliminationPriority !== a.eliminationPriority) {
      return b.eliminationPriority - a.eliminationPriority;
    }
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.word.localeCompare(b.word);
  });

  return { candidates: ranked, totalCount: sourcePool.length };
}

function computeCandidateData() {
  // Rebuild histogram from the current remaining answer set for dynamic weighting
  globalHistogram = buildFrequencyHistogram(remainingAnswers);
  guessMetricsCache.clear();
  primaryCandidates = rankWordsByHistogram(remainingAnswers, globalHistogram);
  const eliminationResult = rankWordsForElimination(allAnswers);
  eliminationCandidates = eliminationResult.candidates;
  eliminationCandidateCount = eliminationResult.totalCount;
  primaryCandidateEliminations = computeEliminationsForDisplayCandidates(primaryCandidates);
  eliminationCandidateEliminations = computeEliminationsForDisplayCandidates(eliminationCandidates);
}

function getActiveCandidateModel() {
  if (activeCandidateTab === TAB_ELIMINATION) {
    return {
      title: "Top Elimination Candidates",
      candidates: eliminationCandidates,
      totalCount: eliminationCandidateCount,
      eliminations: eliminationCandidateEliminations,
      sort: candidateSortByTab[TAB_ELIMINATION],
    };
  }

  return {
    title: "Top Candidate Guesses",
    candidates: primaryCandidates,
    totalCount: primaryCandidates.length,
    eliminations: primaryCandidateEliminations,
    sort: candidateSortByTab[TAB_PRIMARY],
  };
}

function renderCandidateList() {
  const model = getActiveCandidateModel();
  candidateList.innerHTML = "";
  renderSortButtons();
  renderCandidateTabs();
  candidateTitle.textContent = model.title;

  if (model.candidates.length === 0) {
    candidateCountLabel.textContent = "Showing 0 of 0";
    const empty = document.createElement("div");
    empty.className = "candidate-empty";
    empty.textContent = "No candidate words to show.";
    candidateList.appendChild(empty);
    return;
  }

  const visibleCandidates = getSortedCandidatesForDisplay(model);
  const rankedCount = model.candidates.length < model.totalCount
    ? ` (${model.candidates.length} ranked)`
    : "";
  candidateCountLabel.textContent = `Showing ${visibleCandidates.length} of ${model.totalCount}${rankedCount}`;

  visibleCandidates.forEach((candidate, index) => {
    const rowButton = document.createElement("button");
    rowButton.type = "button";
    rowButton.className = "candidate-row";
    if (candidate.word === currentGuess) {
      rowButton.classList.add("selected");
    }

    const entropyVal = candidate.entropy ?? candidate.eliminationPriority ?? getCachedEntropy(candidate.word);
    const entropyDisplay = entropyVal ? entropyVal.toFixed(3) : "-";

    rowButton.innerHTML = [
      `<span>${index + 1}</span>`,
      `<span class="candidate-word">${candidate.word.toUpperCase()}</span>`,
      `<span class="candidate-score">${candidate.score}</span>`,
      `<span class="candidate-elim">${formatEliminations(model.eliminations.get(candidate.word))}</span>`,
      `<span class="candidate-entropy">${entropyDisplay}</span>`,
    ].join("");

    rowButton.setAttribute("aria-label", `Use guess ${candidate.word}, score ${candidate.score}, eliminates ${formatEliminations(model.eliminations.get(candidate.word))} words guaranteed, entropy ${entropyDisplay}`);
    rowButton.addEventListener("click", () => {
      selectCandidateGuess(candidate.word);
    });

    candidateList.appendChild(rowButton);
  });
}

function renderCandidateTabs() {
  const tabConfig = [
    { button: primaryTabButton, isActive: activeCandidateTab === TAB_PRIMARY },
    { button: eliminationTabButton, isActive: activeCandidateTab === TAB_ELIMINATION },
  ];

  tabConfig.forEach(({ button, isActive }) => {
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function renderSortButtons() {
  const activeSort = candidateSortByTab[activeCandidateTab];
  const controls = [
    { button: sortWordButton, key: "word" },
    { button: sortScoreButton, key: "score" },
    { button: sortEliminatesButton, key: "eliminates" },
    { button: sortEntropyButton, key: "entropy" },
  ];

  controls.forEach(({ button, key }) => {
    button.classList.remove("active", "asc", "desc");
    if (activeSort.key === key) {
      button.classList.add("active", activeSort.direction);
      button.setAttribute("aria-label", `Sorting by ${key}, ${activeSort.direction}`);
    } else {
      button.setAttribute("aria-label", `Sort by ${key}`);
    }
  });
}

function getSortedCandidatesForDisplay(model) {
  const sorted = getDisplayCandidatePool(model.candidates);
  const activeSort = model.sort;

  sorted.sort((a, b) => {
    let comparison = 0;

    if (activeSort.key === "word") {
      comparison = a.word.localeCompare(b.word);
    } else if (activeSort.key === "score") {
      comparison = a.score - b.score;
    } else if (activeSort.key === "eliminates") {
      const elimA = model.eliminations.get(a.word) || 0;
      const elimB = model.eliminations.get(b.word) || 0;
      comparison = elimA - elimB;
    } else if (activeSort.key === "entropy") {
      const entA = a.entropy ?? a.eliminationPriority ?? getCachedEntropy(a.word);
      const entB = b.entropy ?? b.eliminationPriority ?? getCachedEntropy(b.word);
      comparison = entA - entB;
    }

    if (comparison !== 0) {
      return activeSort.direction === "asc" ? comparison : -comparison;
    }

    return a.word.localeCompare(b.word);
  });

  return sorted;
}

function getTopDisplayedWord() {
  return getSortedCandidatesForDisplay(getActiveCandidateModel())[0]?.word || "";
}

function getDisplayCandidatePool(candidates) {
  return candidates.slice(0, MAX_VISIBLE_CANDIDATES);
}

function setCandidateSort(key) {
  const activeSort = candidateSortByTab[activeCandidateTab];

  if (activeSort.key === key) {
    activeSort.direction = activeSort.direction === "asc" ? "desc" : "asc";
  } else {
    candidateSortByTab[activeCandidateTab] = {
      key,
      direction: key === "word" ? "asc" : "desc",
    };
  }

  renderCandidateList();
}

function selectCandidateGuess(word) {
  if (word === currentGuess) {
    return;
  }

  currentGuess = word;
  boxStates = createInitialStatesForGuess();
  renderGuess();
  renderCandidateList();
  setMessage(`Selected ${word.toUpperCase()} as your active guess.`);
}

function formatEliminations(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return `${value}`;
}

function buildFeedbackPattern(guess, answer) {
  let pattern = 0;
  let usedAnswerPositions = 0;
  let correctGuessPositions = 0;

  for (let i = 0; i < 5; i += 1) {
    if (guess[i] === answer[i]) {
      usedAnswerPositions |= 1 << i;
      correctGuessPositions |= 1 << i;
      pattern += 2 * FEEDBACK_PATTERN_WEIGHTS[i];
    }
  }

  for (let i = 0; i < 5; i += 1) {
    if (correctGuessPositions & (1 << i)) {
      continue;
    }

    for (let j = 0; j < 5; j += 1) {
      if (!(usedAnswerPositions & (1 << j)) && guess[i] === answer[j]) {
        usedAnswerPositions |= 1 << j;
        pattern += FEEDBACK_PATTERN_WEIGHTS[i];
        break;
      }
    }
  }

  return pattern;
}

function calculateGuessMetrics(guess, possibleAnswers) {
  const buckets = new Uint32Array(FEEDBACK_PATTERN_COUNT);
  const observedPatterns = [];

  for (const answer of possibleAnswers) {
    const pattern = buildFeedbackPattern(guess, answer);
    if (buckets[pattern] === 0) {
      observedPatterns.push(pattern);
    }
    buckets[pattern] += 1;
  }

  let entropy = 0;
  let largestBucket = 0;
  const total = possibleAnswers.length;
  // Preserve first-seen bucket order so entropy ties retain their existing ranking.
  for (const pattern of observedPatterns) {
    const count = buckets[pattern];
    const p = count / total;
    entropy -= p * Math.log2(p);
    largestBucket = Math.max(largestBucket, count);
  }
  return { entropy, guaranteedEliminations: total - largestBucket };
}

function getGuessMetrics(word) {
  if (!guessMetricsCache.has(word)) {
    guessMetricsCache.set(word, calculateGuessMetrics(word, remainingAnswers));
  }
  return guessMetricsCache.get(word);
}

function getCachedEntropy(word) {
  return getGuessMetrics(word).entropy;
}

function computeEliminationsForDisplayCandidates(candidates) {
  const eliminationMap = new Map();
  const displayCandidates = candidates.slice(0, MAX_VISIBLE_CANDIDATES);

  for (const candidate of displayCandidates) {
    const guaranteedEliminations = getGuessMetrics(candidate.word).guaranteedEliminations;
    eliminationMap.set(candidate.word, guaranteedEliminations);
  }

  return eliminationMap;
}

function makeConstraints(guess, states) {
  const fixed = Array(5).fill(null);
  const excludedPositions = Array.from({ length: 5 }, () => new Set());
  const minCount = new Map();
  const hasAbsent = new Map();

  for (let i = 0; i < 5; i += 1) {
    const letter = guess[i];
    const state = states[i];

    if (state === STATE_CORRECT) {
      fixed[i] = letter;
      minCount.set(letter, (minCount.get(letter) || 0) + 1);
    } else if (state === STATE_PRESENT) {
      excludedPositions[i].add(letter);
      minCount.set(letter, (minCount.get(letter) || 0) + 1);
    } else if (state === STATE_ABSENT) {
      excludedPositions[i].add(letter);
      hasAbsent.set(letter, true);
    }
  }

  const maxCount = new Map();
  for (const [letter, absentSeen] of hasAbsent.entries()) {
    if (!absentSeen) {
      continue;
    }
    maxCount.set(letter, minCount.get(letter) || 0);
  }

  return { fixed, excludedPositions, minCount, maxCount };
}

function wordMatchesConstraints(word, constraints) {
  const { fixed, excludedPositions, minCount, maxCount } = constraints;

  for (let i = 0; i < 5; i += 1) {
    if (fixed[i] && word[i] !== fixed[i]) {
      return false;
    }
    if (excludedPositions[i].has(word[i])) {
      return false;
    }
  }

  const counts = new Map();
  for (const letter of word) {
    counts.set(letter, (counts.get(letter) || 0) + 1);
  }

  for (const [letter, needed] of minCount.entries()) {
    if ((counts.get(letter) || 0) < needed) {
      return false;
    }
  }

  for (const [letter, limit] of maxCount.entries()) {
    if ((counts.get(letter) || 0) > limit) {
      return false;
    }
  }

  return true;
}

function allCorrect(states) {
  return states.every((state) => state === STATE_CORRECT);
}

function createInitialStatesForGuess() {
  const initialStates = [STATE_UNKNOWN, STATE_UNKNOWN, STATE_UNKNOWN, STATE_UNKNOWN, STATE_UNKNOWN];
  const confirmedCorrectCounts = new Map();

  for (const letter of knownCorrectLetters) {
    if (!letter) {
      continue;
    }
    confirmedCorrectCounts.set(letter, (confirmedCorrectCounts.get(letter) || 0) + 1);
  }

  const unresolvedPresentCounts = new Map();
  for (const [letter, minimumCount] of knownMinimumLetterCounts.entries()) {
    const confirmedCount = confirmedCorrectCounts.get(letter) || 0;
    const unresolvedCount = Math.max(0, minimumCount - confirmedCount);
    if (unresolvedCount > 0) {
      unresolvedPresentCounts.set(letter, unresolvedCount);
    }
  }

  for (let i = 0; i < 5; i += 1) {
    if (knownCorrectLetters[i] && currentGuess[i] === knownCorrectLetters[i]) {
      initialStates[i] = STATE_CORRECT;
    }
  }

  for (let i = 0; i < 5; i += 1) {
    if (initialStates[i] === STATE_CORRECT) {
      continue;
    }

    const letter = currentGuess[i];
    const remaining = unresolvedPresentCounts.get(letter) || 0;
    if (remaining > 0) {
      initialStates[i] = STATE_PRESENT;
      unresolvedPresentCounts.set(letter, remaining - 1);
    }
  }

  return initialStates;
}

function updateKnownCorrectLettersFromCurrentGuess() {
  for (let i = 0; i < 5; i += 1) {
    if (boxStates[i] === STATE_CORRECT) {
      knownCorrectLetters[i] = currentGuess[i];
    }
  }
}

function updateKnownMinimumLetterCountsFromCurrentGuess() {
  const positiveCountsThisGuess = new Map();

  for (let i = 0; i < 5; i += 1) {
    if (boxStates[i] !== STATE_PRESENT && boxStates[i] !== STATE_CORRECT) {
      continue;
    }

    const letter = currentGuess[i];
    positiveCountsThisGuess.set(letter, (positiveCountsThisGuess.get(letter) || 0) + 1);
  }

  for (const [letter, observedCount] of positiveCountsThisGuess.entries()) {
    const previous = knownMinimumLetterCounts.get(letter) || 0;
    if (observedCount > previous) {
      knownMinimumLetterCounts.set(letter, observedCount);
    }
  }
}

function rememberTestedLettersFromCurrentGuess() {
  for (const letter of currentGuess) {
    guessedLetters.add(letter);
  }
}

loadCsvButton.addEventListener("click", () => {
  answersFileInput.click();
});

answersFileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const words = parseWordsFromText(text);
    if (words.length === 0) {
      throw new Error("No valid 5-letter words found in selected CSV");
    }
    startGame(words);
  } catch (error) {
    setMessage(`Failed to parse selected CSV: ${error.message}`, true);
  } finally {
    answersFileInput.value = "";
  }
});

nextGuessButton.addEventListener("click", () => {
  if (!currentGuess) {
    setMessage("No guess is currently available.", true);
    return;
  }

  if (boxStates.some((state) => state === STATE_UNKNOWN)) {
    setMessage("Set all five letter states before requesting the next guess.", true);
    return;
  }

  if (allCorrect(boxStates)) {
    rememberTestedLettersFromCurrentGuess();
    updateKnownCorrectLettersFromCurrentGuess();
    updateKnownMinimumLetterCountsFromCurrentGuess();
    setMessage("Solved. Great success!");
    nextGuessButton.disabled = true;
    return;
  }

  rememberTestedLettersFromCurrentGuess();
  updateKnownCorrectLettersFromCurrentGuess();
  updateKnownMinimumLetterCountsFromCurrentGuess();

  const constraints = makeConstraints(currentGuess, boxStates);
  remainingAnswers = remainingAnswers.filter((word) => wordMatchesConstraints(word, constraints));

  if (remainingAnswers.length === 0) {
    setMessage("No candidates remain. Check your tile feedback and try again.", true);
    nextGuessButton.disabled = true;
    primaryCandidates = [];
    eliminationCandidates = [];
    eliminationCandidateCount = 0;
    primaryCandidateEliminations = new Map();
    eliminationCandidateEliminations = new Map();
    renderCandidateList();
    renderStatus();
    return;
  }

  computeCandidateData();
  currentGuess = getTopDisplayedWord();
  boxStates = createInitialStatesForGuess();
  round += 1;

  renderGuess();
  renderStatus();
  renderCandidateList();
  setMessage("Next guess ready.");
});

resetButton.addEventListener("click", () => {
  remainingAnswers = [...allAnswers];
  knownCorrectLetters = [null, null, null, null, null];
  knownMinimumLetterCounts = new Map();
  guessedLetters = new Set();
  activeCandidateTab = TAB_PRIMARY;
  candidateSortByTab = {
    [TAB_PRIMARY]: { key: "score", direction: "desc" },
    [TAB_ELIMINATION]: { key: "entropy", direction: "desc" },
  };
  computeCandidateData();
  currentGuess = getTopDisplayedWord();
  boxStates = createInitialStatesForGuess();
  round = 1;
  nextGuessButton.disabled = false;
  renderGuess();
  renderStatus();
  renderCandidateList();
  setMessage("Reset complete.");
});

sortWordButton.addEventListener("click", () => {
  setCandidateSort("word");
});

sortScoreButton.addEventListener("click", () => {
  setCandidateSort("score");
});

sortEliminatesButton.addEventListener("click", () => {
  setCandidateSort("eliminates");
});

sortEntropyButton.addEventListener("click", () => {
  setCandidateSort("entropy");
});

primaryTabButton.addEventListener("click", () => {
  activeCandidateTab = TAB_PRIMARY;
  renderCandidateList();
});

eliminationTabButton.addEventListener("click", () => {
  activeCandidateTab = TAB_ELIMINATION;
  renderCandidateList();
});