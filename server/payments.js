import crypto from 'node:crypto';
import fsp from 'node:fs/promises';

function makeId() {
  return `pay_${crypto.randomBytes(12).toString('base64url')}`;
}

function isPaymentRecord(entry) {
  return Boolean(
    entry &&
      typeof entry === 'object' &&
      typeof entry.orderId === 'string' &&
      entry.orderId.startsWith('order_') &&
      typeof entry.userId === 'string' &&
      typeof entry.jobId === 'string',
  );
}

export function createPaymentStore({ filePath, maxEntries = 2000 }) {
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
        const data = JSON.parse(await fsp.readFile(filePath, 'utf8'));
        if (Array.isArray(data)) parsed = data;
      } catch {
        parsed = [];
      }

      entries = parsed.filter(isPaymentRecord).slice(0, maxEntries);
      loaded = true;
    })().finally(() => {
      loadingPromise = null;
    });

    await loadingPromise;
  }

  function sorted() {
    return entries.slice().sort((left, right) =>
      String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')),
    );
  }

  async function updateRecord(orderId, patch) {
    await load();
    const record = entries.find((entry) => entry.orderId === orderId);
    if (!record) return null;
    Object.assign(record, patch, { updatedAt: new Date().toISOString() });
    await persist();
    return record;
  }

  return {
    async get(orderId) {
      await load();
      const id = String(orderId ?? '');
      if (!id) return null;
      return entries.find((entry) => entry.orderId === id) ?? null;
    },

    async findActiveForJob(userId, jobId) {
      await load();
      return (
        sorted().find(
          (entry) =>
            entry.userId === userId &&
            entry.jobId === jobId &&
            ['created', 'paid', 'consumed'].includes(entry.status),
        ) ?? null
      );
    },

    async findOpenForUser(userId, sinceIso) {
      await load();
      const since = new Date(sinceIso ?? 0).getTime();
      return sorted().filter(
        (entry) =>
          entry.userId === userId &&
          entry.status === 'created' &&
          new Date(entry.createdAt ?? 0).getTime() >= since,
      );
    },

    async create({
      orderId,
      userId,
      jobId,
      amountPaise,
      currency = 'INR',
      totalPages,
      chargeablePages,
      receipt = null,
    }) {
      await load();
      const existing = entries.find((entry) => entry.orderId === orderId);
      if (existing) return existing;

      const record = {
        id: makeId(),
        provider: 'razorpay',
        orderId,
        paymentId: null,
        signatureVerified: false,
        userId,
        jobId,
        amountPaise: Math.round(Number(amountPaise) || 0),
        currency,
        totalPages: Math.max(0, Math.floor(Number(totalPages) || 0)),
        chargeablePages: Math.max(
          0,
          Math.floor(Number(chargeablePages) || 0),
        ),
        receipt,
        status: 'created',
        createdAt: new Date().toISOString(),
        paidAt: null,
        consumedAt: null,
        cancelledAt: null,
        printJobId: null,
      };

      entries = [record, ...entries].slice(0, maxEntries);
      await persist();
      return record;
    },

    update: updateRecord,

    async markPaid(orderId, { paymentId, signatureVerified = true }) {
      return updateRecord(orderId, {
        status: 'paid',
        paymentId,
        signatureVerified: Boolean(signatureVerified),
        paidAt: new Date().toISOString(),
      });
    },

    async markConsumed(orderId, { printJobId }) {
      return updateRecord(orderId, {
        status: 'consumed',
        printJobId,
        consumedAt: new Date().toISOString(),
      });
    },

    async cancel(orderId) {
      await load();
      const record = entries.find((entry) => entry.orderId === orderId);
      if (!record || record.status !== 'created') return record;
      return updateRecord(orderId, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
      });
    },
  };
}
