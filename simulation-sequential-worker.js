importScripts("app.js");

let firstChoice = null;
let originalSolutions = new Set();
let favorTop10OgWords = false;
let targetPool = [];

function simulateTarget(target) {
  remainingAnswers = [...allAnswers];
  const chain = [];
  const guessed = new Set();

  while (true) {
    let word;
    if (chain.length === 0 && firstChoice) {
      word = firstChoice;
    } else {
      globalHistogram = buildFrequencyHistogram(remainingAnswers);
      const candidates = rankWordsByHistogram(remainingAnswers, globalHistogram);
      const sortedCandidates = getSortedCandidatesForDisplay({
        candidates,
        eliminations: new Map(),
        sort: { key: "score", direction: "desc" },
      });
      word = favorTop10OgWords
        ? sortedCandidates.slice(0, 10).find((candidate) => originalSolutions.has(candidate.word))?.word || sortedCandidates[0]?.word
        : sortedCandidates[0]?.word;
      if (chain.length === 0) firstChoice = word;
    }

    if (!word) throw new Error(`No primary candidate for ${target.toUpperCase()}.`);
    if (guessed.has(word)) throw new Error(`Repeated guess ${word.toUpperCase()} for ${target.toUpperCase()}.`);
    guessed.add(word);
    chain.push(word);
    if (word === target) return { target, turns: chain.length, chain };

    const pattern = buildFeedbackPattern(word, target);
    const states = FEEDBACK_PATTERN_WEIGHTS.map((weight) => Math.floor(pattern / weight) % 3 + 1);
    const constraints = makeConstraints(word, states);
    remainingAnswers = remainingAnswers.filter((answer) => wordMatchesConstraints(answer, constraints));
    if (allAnswers.includes(target) && !remainingAnswers.includes(target)) {
      throw new Error(`Feedback eliminated target ${target.toUpperCase()} after ${word.toUpperCase()}.`);
    }
    if (!remainingAnswers.length) {
      throw new Error(`No candidate words remain for target ${target.toUpperCase()} after ${word.toUpperCase()}.`);
    }
  }
}

self.onmessage = (event) => {
  try {
    if (event.data.answers) {
      allAnswers = event.data.answers;
      firstChoice = null;
      originalSolutions = new Set(event.data.originalSolutions || []);
      favorTop10OgWords = event.data.favorTop10OgWords === true;
      targetPool = event.data.targetPool || allAnswers;
    }
    if (!allAnswers.length) throw new Error("No answers available for simulation.");
    if (!targetPool.includes(event.data.target)) throw new Error("Target is not in the selected target pool.");
    self.postMessage({ type: "result", result: simulateTarget(event.data.target) });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
