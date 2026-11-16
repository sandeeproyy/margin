import fsp from 'node:fs/promises';

function legacyArchivePath(filePath) {
  return `${filePath}.legacy.json`;
}

export function createHistoryService({ filePath, maxEntries }) {
  let entries = [];
  let loaded = false;
  let loadingPromise = null;
  let writeChain = Promise.resolve();

  async function persist() {
    const payload = `${JSON.stringify(entries, null, 2)}\n`;
    const temporary = `${filePath}.tmp`;
    const write = writeChain.then(async () => {
      await fsp.writeFile(temporary, payload, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await fsp.rename(temporary, filePath);
    });
    writeChain = write.catch(() => {});
    await write;
  }

  async function load() {
    if (loaded) return;
    if (loadingPromise) {
      await loadingPromise;
      return;
    }

    loadingPromise = (async () => {
      let parsed = [];
      try {
        const raw = await fsp.readFile(filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) parsed = data;
      } catch {
        parsed = [];
      }

      const valid = parsed.filter(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          typeof entry.userId === 'string' &&
          entry.userId.startsWith('usr_'),
      );
      const legacy = parsed.filter(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          !(typeof entry.userId === 'string' && entry.userId.startsWith('usr_')),
      );

      if (legacy.length > 0) {
        try {
          await fsp.access(legacyArchivePath(filePath));
        } catch {
          await fsp.writeFile(
            legacyArchivePath(filePath),
            `${JSON.stringify(legacy, null, 2)}\n`,
            { encoding: 'utf8', mode: 0o600 },
          );
        }
        await persistWith(valid);
      }

      entries = valid;
      loaded = true;
    })().finally(() => {
      loadingPromise = null;
    });

    await loadingPromise;
  }

  async function persistWith(nextEntries) {
    const payload = `${JSON.stringify(nextEntries, null, 2)}\n`;
    const temporary = `${filePath}.tmp`;
    await fsp.writeFile(temporary, payload, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fsp.rename(temporary, filePath);
  }

  function sortedForUser(userId) {
    return entries
      .filter((entry) => entry.userId === userId)
      .sort((left, right) =>
        String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')),
      );
  }

  return {
    async listForUser(userId) {
      await load();
      return sortedForUser(userId).slice(0, maxEntries);
    },

    async upsert(entry) {
      await load();
      if (!entry?.userId) {
        throw new Error('History entries must belong to an account.');
      }
      const sameUser = [
        entry,
        ...entries.filter(
          (item) => item.id !== entry.id && item.userId === entry.userId,
        ),
      ].slice(0, maxEntries);
      const others = entries.filter(
        (item) => item.userId !== entry.userId && item.id !== entry.id,
      );
      entries = [...sameUser, ...others]
        .sort((left, right) =>
          String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')),
        )
        .slice(0, Math.max(maxEntries * 50, 500));
      await persist();
      return entry;
    },

    async pagesSince(userId, sinceIso) {
      await load();
      const since = new Date(sinceIso).getTime();
      return entries
        .filter(
          (entry) =>
            entry.userId === userId &&
            entry.status !== 'error' &&
            new Date(entry.createdAt).getTime() >= since,
        )
        .reduce((total, entry) => total + (Number(entry.printedPages) || 0), 0);
    },

    async globalPagesSince(sinceIso) {
      await load();
      const since = new Date(sinceIso).getTime();
      return entries
        .filter(
          (entry) =>
            entry.status !== 'error' &&
            new Date(entry.createdAt).getTime() >= since,
        )
        .reduce((total, entry) => total + (Number(entry.printedPages) || 0), 0);
    },

    async all() {
      await load();
      return entries.slice();
    },
  };
}
