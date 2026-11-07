const goButton = document.getElementById("simulationGo");
const stopButton = document.getElementById("simulationStop");
const statusWindow = document.getElementById("simulationStatus");
const logWindow = document.getElementById("simulationLog");
const CSV_HEADER = "target,min_turns,min_choices,min_words,max_turns,max_choices,max_words,solved_branches,incomplete_branches\r\n";

let worker = null;
let csvWriter = null;
let running = false;
let saving = false;
let completed = 0;
const logLines = [];

function setStatus(text, isError = false) {
  statusWindow.textContent = text;
  statusWindow.style.color = isError ? "#8e2332" : "#2a3d61";
}

function formatPath(path, field) {
  return path ? path.map((choice) => field === "word" ? choice.word.toUpperCase() : choice.label).join(" ") : "";
}

function formatResult(result) {
  const best = result.best ? `${result.best.length} ${formatPath(result.best, "label")} (${formatPath(result.best, "word")})` : "none";
  const worst = result.worst ? `${result.worst.length} ${formatPath(result.worst, "label")} (${formatPath(result.worst, "word")})` : "none";
  return `${result.target.toUpperCase()}: min ${best}; max ${worst}; ${result.solved} solved, ${result.incomplete} incomplete`;
}

function csvRow(result) {
  const fields = [
    result.target.toUpperCase(),
    result.best ? result.best.length : "",
    formatPath(result.best, "label"),
    formatPath(result.best, "word"),
    result.worst ? result.worst.length : "",
    formatPath(result.worst, "label"),
    formatPath(result.worst, "word"),
    result.solved,
    result.incomplete,
  ];
  return `${fields.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(",")}\r\n`;
}

function finishRun(text, isError = false) {
  if (worker) worker.terminate();
  worker = null;
  running = false;
  goButton.disabled = false;
  stopButton.disabled = true;
  setStatus(text, isError);
}

async function onWorkerMessage(event) {
  if (!running) return;
  if (event.data.type === "progress") {
    const progress = event.data.progress;
    const best = progress.best ? progress.best.length : "-";
    const worst = progress.worst ? progress.worst.length : "-";
    setStatus(`Solving ${progress.target.toUpperCase()}: current best ${best} turns, current worst ${worst} turns; ${progress.solved} solved, ${progress.incomplete} incomplete.`);
    return;
  }
  if (event.data.type === "error") {
    finishRun(`Simulation failed: ${event.data.message}`, true);
    return;
  }
  if (event.data.type !== "result") {
    finishRun("Simulation failed: unexpected worker message.", true);
    return;
  }

  saving = true;
  try {
    await csvWriter.write(csvRow(event.data.result), true);
    completed += 1;
    logLines.push(formatResult(event.data.result));
    if (logLines.length > 500) logLines.shift();
    logWindow.textContent = logLines.join("\n");
    logWindow.scrollTop = logWindow.scrollHeight;
  } catch (error) {
    saving = false;
    finishRun(`Failed to save CSV: ${error.message}`, true);
    return;
  }
  saving = false;
  if (running) {
    worker.postMessage({});
  } else {
    finishRun(`Stopped. ${completed} completed game(s) saved; any unfinished game was discarded.`);
  }
}

goButton.addEventListener("click", async () => {
  goButton.disabled = true;
  if (typeof window.showSaveFilePicker !== "function") {
    finishRun("Saving directly requires the File System Access API in a supported browser and a secure context (such as localhost).", true);
    return;
  }

  try {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: "cheatle-simulation.csv",
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
    const answers = [...new Set(text.split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter((word) => /^[a-z]{5}$/.test(word)))];
    if (!answers.length) throw new Error("No valid five-letter words found in answers.csv.");
    await csvWriter.write(CSV_HEADER, false);
    completed = 0;
    logLines.length = 0;
    logWindow.textContent = "";
    worker = new Worker("simulation-worker.js");
    worker.onmessage = onWorkerMessage;
    worker.onerror = (event) => finishRun(`Simulation worker failed: ${event.message}`, true);
    running = true;
    stopButton.disabled = false;
    setStatus("Starting simulation...");
    worker.postMessage({ answers });
  } catch (error) {
    finishRun(`Could not start simulation: ${error.message}`, true);
  }
});

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
