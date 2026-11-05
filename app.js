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

const MAX_VISIBLE_CANDIDATES = 100;
const TAB_PRIMARY = "primary";
const TAB_ELIMINATION = "elimination";

let allAnswers = [];
let remainingAnswers = [];
let globalHistogram = new Map();
let currentGuess = "";
let boxStates = [STATE_UNKNOWN, STATE_UNKNOWN, STATE_UNKNOWN, STATE_UNKNOWN, STATE_UNKNOWN];
let knownCorrectLetters = [null, null, null, null, null];
let knownMinimumLetterCounts = new Map();
let guessedLetters = new Set();
let primaryCandidates = [];
let eliminationCandidates = [];
let primaryCandidateEliminations = new Map();
let eliminationCandidateEliminations = new Map();
let activeCandidateTab = TAB_PRIMARY;
let candidateSortByTab = {
  [TAB_PRIMARY]: { key: "score", direction: "desc" },
  [TAB_ELIMINATION]: { key: "score", direction: "desc" },
};
let round = 1;

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
    [TAB_ELIMINATION]: { key: "score", direction: "desc" },
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
  const histogram = new Map();

  for (const word of words) {
    for (const letter of word) {
      histogram.set(letter, (histogram.get(letter) || 0) + 1);
    }
  }

  return histogram;
}

function scoreWord(word, histogram) {
  let score = 0;
  const seen = new Set();

  for (const letter of word) {
    if (seen.has(letter)) {
      continue;
    }
    seen.add(letter);
    score += histogram.get(letter) || 0;
  }

  return score;
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

    const eliminationPriority = (untestedCount * 10) - testedCount;
    return {
      word,
      score: scoreWord(word, globalHistogram),
      eliminationPriority,
      testedCount,
      untestedCount,
    };
  });

  const allUntestedOnly = rankedWithStats.filter((entry) => entry.testedCount === 0);
  const sourcePool = allUntestedOnly.length > 0 ? allUntestedOnly : rankedWithStats;

  const knownLetters = buildKnownLettersSet();
  const ranked = sourcePool.map((entry) => {
    let knownLetterBonus = 0;
    for (const letter of new Set(entry.word)) {
      if (knownLetters.has(letter)) {
        knownLetterBonus += 1;
      }
    }

    return {
      word: entry.word,
      score: entry.score,
      eliminationPriority: entry.eliminationPriority + knownLetterBonus,
      testedCount: entry.testedCount,
      untestedCount: entry.untestedCount,
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

  return ranked;
}

function computeCandidateData() {
  primaryCandidates = rankWordsByHistogram(remainingAnswers, globalHistogram);
  eliminationCandidates = rankWordsForElimination(allAnswers);
  primaryCandidateEliminations = computeEliminationsForDisplayCandidates(primaryCandidates, remainingAnswers);
  eliminationCandidateEliminations = computeEliminationsForDisplayCandidates(eliminationCandidates, remainingAnswers);
}

function getActiveCandidateModel() {
  if (activeCandidateTab === TAB_ELIMINATION) {
    return {
      title: "Top Elimination Candidates",
      candidates: eliminationCandidates,
      eliminations: eliminationCandidateEliminations,
      sort: candidateSortByTab[TAB_ELIMINATION],
    };
  }

  return {
    title: "Top Candidate Guesses",
    candidates: primaryCandidates,
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
  candidateCountLabel.textContent = `Showing ${visibleCandidates.length} of ${model.candidates.length}`;

  visibleCandidates.forEach((candidate, index) => {
    const rowButton = document.createElement("button");
    rowButton.type = "button";
    rowButton.className = "candidate-row";
    if (candidate.word === currentGuess) {
      rowButton.classList.add("selected");
    }

    rowButton.innerHTML = [
      `<span>${index + 1}</span>`,
      `<span class="candidate-word">${candidate.word.toUpperCase()}</span>`,
      `<span class="candidate-score">${candidate.score}</span>`,
      `<span class="candidate-elim">${formatEliminations(model.eliminations.get(candidate.word))}</span>`,
    ].join("");

    rowButton.setAttribute("aria-label", `Use guess ${candidate.word}, score ${candidate.score}, eliminates ${formatEliminations(model.eliminations.get(candidate.word))} words guaranteed`);
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
  const pattern = [0, 0, 0, 0, 0];
  const unmatchedAnswerCounts = new Map();

  for (let i = 0; i < 5; i += 1) {
    if (guess[i] === answer[i]) {
      pattern[i] = 2;
    } else {
      const answerLetter = answer[i];
      unmatchedAnswerCounts.set(answerLetter, (unmatchedAnswerCounts.get(answerLetter) || 0) + 1);
    }
  }

  for (let i = 0; i < 5; i += 1) {
    if (pattern[i] === 2) {
      continue;
    }

    const guessLetter = guess[i];
    const available = unmatchedAnswerCounts.get(guessLetter) || 0;
    if (available > 0) {
      pattern[i] = 1;
      unmatchedAnswerCounts.set(guessLetter, available - 1);
    }
  }

  return pattern.join("");
}

function computeGuaranteedEliminationsForGuess(guess, possibleAnswers) {
  const total = possibleAnswers.length;
  if (total <= 1) {
    return 0;
  }

  const buckets = new Map();
  for (const answer of possibleAnswers) {
    const pattern = buildFeedbackPattern(guess, answer);
    buckets.set(pattern, (buckets.get(pattern) || 0) + 1);
  }

  let largestBucket = 0;
  for (const count of buckets.values()) {
    if (count > largestBucket) {
      largestBucket = count;
    }
  }

  return total - largestBucket;
}

function computeEliminationsForDisplayCandidates(candidates, possibleAnswers) {
  const eliminationMap = new Map();
  const displayCandidates = candidates.slice(0, MAX_VISIBLE_CANDIDATES);

  for (const candidate of displayCandidates) {
    const guaranteedEliminations = computeGuaranteedEliminationsForGuess(candidate.word, possibleAnswers);
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
    if (knownCorrectLetters[i]) {
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
    [TAB_ELIMINATION]: { key: "score", direction: "desc" },
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

primaryTabButton.addEventListener("click", () => {
  activeCandidateTab = TAB_PRIMARY;
  renderCandidateList();
});

eliminationTabButton.addEventListener("click", () => {
  activeCandidateTab = TAB_ELIMINATION;
  renderCandidateList();
});