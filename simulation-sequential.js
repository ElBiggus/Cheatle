const startInput = document.getElementById("simulationStart");
const favorTop10OgWordsCheckbox = document.getElementById("favorTop10OgWords");
const useOgAnswerPoolCheckbox = document.getElementById("useOgAnswerPool");
const goButton = document.getElementById("simulationGo");
const stopButton = document.getElementById("simulationStop");
const statusWindow = document.getElementById("simulationStatus");
const logWindow = document.getElementById("simulationLog");
const CSV_HEADER = "target,turns,word_chain\r\n";

let worker = null;
let csvWriter = null;
let running = false;
let saving = false;
let candidateAnswers = [];
let targetWords = [];
let originalSolutions = [];
let favorTop10OgWords = false;
let useOgAnswerPool = false;
let targetIndex = 0;
let completed = 0;
const logLines = [];

function setStatus(text, isError = false) {
  statusWindow.textContent = text;
  statusWindow.style.color = isError ? "#8e2332" : "#2a3d61";
}

function csvRow(result) {
  const fields = [result.target.toUpperCase(), result.turns, result.chain.map((word) => word.toUpperCase()).join(" ")];
  return `${fields.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(",")}\r\n`;
}

function finishRun(text, isError = false) {
  if (worker) worker.terminate();
  worker = null;
  running = false;
  goButton.disabled = false;
  startInput.disabled = false;
  favorTop10OgWordsCheckbox.disabled = false;
  useOgAnswerPoolCheckbox.disabled = false;
  stopButton.disabled = true;
  setStatus(text, isError);
}

function startTarget(initial = false) {
  const target = targetWords[targetIndex];
  setStatus(`Solving ${target.toUpperCase()} (${targetIndex + 1} of ${targetWords.length}); ${completed} completed.`);
  if (initial) {
    const data = { answers: candidateAnswers, target };
    if (favorTop10OgWords) data.favorTop10OgWords = true;
    if (favorTop10OgWords) data.originalSolutions = originalSolutions;
    if (useOgAnswerPool) data.targetPool = targetWords;
    worker.postMessage(data);
  } else {
    worker.postMessage({ target });
  }
}

async function onWorkerMessage(event) {
  if (!running) return;
  if (event.data.type === "error") {
    finishRun(`Simulation failed: ${event.data.message}`, true);
    return;
  }
  if (event.data.type !== "result" || event.data.result.target !== targetWords[targetIndex]) {
    finishRun("Simulation failed: unexpected worker message.", true);
    return;
  }

  const result = event.data.result;
  saving = true;
  try {
    await csvWriter.write(csvRow(result), true);
    completed += 1;
    logLines.push(`${result.target.toUpperCase()}: ${result.turns} turn(s) - ${result.chain.map((word) => word.toUpperCase()).join(" ")}`);
    if (logLines.length > 500) logLines.shift();
    logWindow.textContent = logLines.join("\n");
    logWindow.scrollTop = logWindow.scrollHeight;
  } catch (error) {
    saving = false;
    finishRun(`Failed to save CSV: ${error.message}`, true);
    return;
  }
  saving = false;
  if (!running) {
    finishRun(`Stopped. ${completed} completed game(s) saved; any unfinished game was discarded.`);
  } else if (++targetIndex === targetWords.length) {
    finishRun(`Finished. ${completed} completed game(s) saved.`);
  } else {
    startTarget();
  }
}

goButton.addEventListener("click", async () => {
  const start = startInput.value.trim().toLowerCase();
  if (!/^[a-z]{5}$/.test(start)) {
    setStatus("Enter a five-letter starting word.", true);
    return;
  }
  goButton.disabled = true;
  startInput.disabled = true;
  favorTop10OgWords = favorTop10OgWordsCheckbox.checked;
  useOgAnswerPool = useOgAnswerPoolCheckbox.checked;
  favorTop10OgWordsCheckbox.disabled = true;
  useOgAnswerPoolCheckbox.disabled = true;
  originalSolutions = [];
  candidateAnswers = [];
  targetWords = [];
  if (typeof window.showSaveFilePicker !== "function") {
    finishRun("Saving directly requires the File System Access API in a supported browser and a secure context (such as localhost).", true);
    return;
  }

  try {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: "cheatle-sequential-simulation.csv",
      types: [{ description: "CSV file", accept: { "text/csv": [".csv"] } }],
    });
    csvWriter = new SimulationCsvWriter(fileHandle, (attempt, max) => {
      setStatus(`CSV file state changed; retrying save (${attempt} of ${max})...`);
    });
  } catch (error) {
    if (error.name === "AbortError") {
      finishRun("Save cancelled. No simulation started.");
    } else {
      finishRun(`Could not choose a CSV file: ${error.message}`, true);
    }
    return;
  }

  try {
    setStatus("Loading answers...");
    const response = await fetch("answers.csv", { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load answers.csv: HTTP ${response.status}`);
    const text = await response.text();
    candidateAnswers = parseWordsFromText(text).sort();
    if (!candidateAnswers.length) throw new Error("No valid five-letter words found in answers.csv.");
    if (favorTop10OgWords || useOgAnswerPool) {
      setStatus("Loading original solution words...");
      const originalResponse = await fetch("og-answers.csv", { cache: "no-store" });
      if (!originalResponse.ok) throw new Error(`Failed to load og-answers.csv: HTTP ${originalResponse.status}`);
      originalSolutions = parseWordsFromText(await originalResponse.text());
      if (!originalSolutions.length) throw new Error("No valid five-letter words found in og-answers.csv.");
    }
    targetWords = useOgAnswerPool ? [...originalSolutions].sort() : candidateAnswers;
    targetIndex = targetWords.findIndex((word) => word >= start);
    if (targetIndex === -1) throw new Error("No answer is at or after the starting word.");
    await csvWriter.write(CSV_HEADER, false);
    completed = 0;
    logLines.length = 0;
    logWindow.textContent = "";
    worker = new Worker("simulation-sequential-worker.js");
    worker.onmessage = onWorkerMessage;
    worker.onerror = (event) => finishRun(`Simulation worker failed: ${event.message}`, true);
    running = true;
    stopButton.disabled = false;
    startTarget(true);
  } catch (error) {
    finishRun(`Could not start simulation: ${error.message}`, true);
  }
});

function parseWordsFromText(text) {
  return [...new Set(text.split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter((word) => /^[a-z]{5}$/.test(word)))];
}

stopButton.addEventListener("click", () => {
  running = false;
  stopButton.disabled = true;
  if (worker) worker.terminate();
  worker = null;
  if (saving) {
    setStatus("Stopping after the completed result is saved...");
  } else {
    finishRun(`Stopped. ${completed} completed game(s) saved; any unfinished game was discarded.`);
  }
});
