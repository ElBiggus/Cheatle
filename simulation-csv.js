class SimulationCsvWriter {
  constructor(fileHandle, onRetry) {
    this.fileHandle = fileHandle;
    this.onRetry = onRetry;
    this.contents = "";
  }

  async write(text, append) {
    const expected = append ? this.contents : "";
    const updated = expected + text;
    const maxRetries = 5;

    for (let attempt = 0; ; attempt += 1) {
      try {
        if (attempt > 0) {
          const diskContents = await (await this.fileHandle.getFile()).text();
          if (diskContents === updated) {
            this.contents = updated;
            return;
          }
          if (diskContents !== expected) {
            throw new Error("The CSV changed unexpectedly. No retry was made to avoid overwriting changes.");
          }
        }

        const offset = append ? (await this.fileHandle.getFile()).size : 0;
        const writable = await this.fileHandle.createWritable({ keepExistingData: append });
        try {
          if (append) await writable.seek(offset);
          await writable.write(text);
        } catch (error) {
          try {
            await writable.abort();
          } catch (abortError) {
            throw new Error(`${error.message}; failed to abort file write: ${abortError.message}`);
          }
          throw error;
        }
        await writable.close();
        this.contents = updated;
        return;
      } catch (error) {
        if (!append || error.name !== "InvalidStateError" || attempt === maxRetries) throw error;
        this.onRetry(attempt + 1, maxRetries);
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  }
}
