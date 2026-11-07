importScripts("app.js");

const SIMULATION_TURN_LIMIT = 6;
let rootChoices = null;

function simulationChoices() {
  globalHistogram = buildFrequencyHistogram(remainingAnswers);
  guessMetricsCache = new Map();
  primaryCandidates = rankWordsByHistogram(remainingAnswers, globalHistogram);
  eliminationCandidates = rankWordsForElimination(allAnswers).candidates;

  const primary = getSortedCandidatesForDisplay({
    candidates: primaryCandidates,
    eliminations: new Map(),
    sort: { key: "score", direction: "desc" },
  }).slice(0, 3);
  const elimination = getSortedCandidatesForDisplay({
    candidates: eliminationCandidates,
    eliminations: new Map(),
    sort: { key: "entropy", direction: "desc" },
  }).slice(0, 3);

  return [
    ...primary.map((candidate, index) => ({ word: candidate.word, label: `P${index + 1}` })),
    ...elimination.map((candidate, index) => ({ word: candidate.word, label: `E${index + 1}` })),
  ];
}

function simulateTarget(target, reportProgress) {
  remainingAnswers = [...allAnswers];
  knownCorrectLetters = [null, null, null, null, null];
  knownMinimumLetterCounts = new Map();
  guessedLetters = new Set();
  const result = { target, best: null, worst: null, solved: 0, incomplete: 0 };
  let lastProgress = 0;

  function report(force = false) {
    const now = performance.now();
    if (force || now - lastProgress >= 250) {
      reportProgress(result);
      lastProgress = now;
    }
  }

  function visit(path) {
    report();
    const choices = path.length === 0 && rootChoices ? rootChoices : simulationChoices();
    if (path.length === 0 && !rootChoices) rootChoices = choices;
    if (choices.length === 0) {
      result.incomplete += 1;
      return;
    }

    const savedAnswers = remainingAnswers;
    const savedCorrect = knownCorrectLetters;
    const savedMinimum = knownMinimumLetterCounts;
    const savedGuessed = guessedLetters;

    for (const choice of choices) {
      const nextPath = [...path, choice];
      if (choice.word === target) {
        result.solved += 1;
        if (!result.best || nextPath.length < result.best.length) result.best = nextPath;
        if (!result.worst || nextPath.length > result.worst.length) result.worst = nextPath;
        report();
        continue;
      }
      if (nextPath.length === SIMULATION_TURN_LIMIT) {
        result.incomplete += 1;
        continue;
      }

      remainingAnswers = savedAnswers;
      knownCorrectLetters = [...savedCorrect];
      knownMinimumLetterCounts = new Map(savedMinimum);
      guessedLetters = new Set(savedGuessed);
      currentGuess = choice.word;
      const pattern = buildFeedbackPattern(choice.word, target);
      boxStates = FEEDBACK_PATTERN_WEIGHTS.map((weight) => Math.floor(pattern / weight) % 3 + 1);
      rememberTestedLettersFromCurrentGuess();
      updateKnownCorrectLettersFromCurrentGuess();
      updateKnownMinimumLetterCountsFromCurrentGuess();
      const constraints = makeConstraints(currentGuess, boxStates);
      remainingAnswers = remainingAnswers.filter((word) => wordMatchesConstraints(word, constraints));
      if (remainingAnswers.length === 0) {
        result.incomplete += 1;
      } else {
        visit(nextPath);
      }
    }

    remainingAnswers = savedAnswers;
    knownCorrectLetters = savedCorrect;
    knownMinimumLetterCounts = savedMinimum;
    guessedLetters = savedGuessed;
  }

  report(true);
  visit([]);
  report(true);
  return result;
}

self.onmessage = (event) => {
  try {
    if (event.data.answers) {
      allAnswers = event.data.answers;
      rootChoices = null;
    }
    if (!allAnswers.length) throw new Error("No answers available for simulation.");
    const target = allAnswers[Math.floor(Math.random() * allAnswers.length)];
    const result = simulateTarget(target, (progress) => self.postMessage({ type: "progress", progress }));
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
