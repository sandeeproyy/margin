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

const PAID_STATUSES = new Set(['paid', 'consumed']);

function dateKey(value, timeZone = 'Asia/Kolkata') {
  const date = value instanceof Date ? value : new Date(value ?? 0);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDateKey(key, days) {
  const [year, month, day] = String(key)
    .split('-')
    .map((value) => Number(value));
  const shifted = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + days));
  return shifted.toISOString().slice(0, 10);
}

function paidTimestamp(entry) {
  return entry.paidAt || entry.updatedAt || entry.createdAt || '';
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

    /**
     * Owner-facing earnings view. Only completed money counts: a `paid` or
     * `consumed` record has cleared Razorpay; `created` and `cancelled` do not.
     * The response carries no customer identity so the admin screen cannot
     * leak an email address or payment handle.
     */
    async summary({ days = 14, recentLimit = 12, now = new Date() } = {}) {
      await load();
      const timeZone = 'Asia/Kolkata';
      const todayKey = dateKey(now, timeZone);
      const monthPrefix = todayKey.slice(0, 7);
      const windowDays = Math.min(Math.max(Number(days) || 14, 1), 90);
      const startKey = shiftDateKey(todayKey, -(windowDays - 1));

      const totals = { amountPaise: 0, pages: 0, payments: 0 };
      const today = { amountPaise: 0, pages: 0, payments: 0 };
      const month = { amountPaise: 0, pages: 0, payments: 0 };
      const buckets = new Map();
      const paid = [];

      for (const entry of entries) {
        if (!PAID_STATUSES.has(entry.status)) continue;
        const timestamp = paidTimestamp(entry);
        const key = dateKey(timestamp, timeZone);
        if (!key) continue;

        const amountPaise = Math.max(0, Math.round(Number(entry.amountPaise) || 0));
        const pages = Math.max(0, Math.floor(Number(entry.chargeablePages) || 0));

        totals.amountPaise += amountPaise;
        totals.pages += pages;
        totals.payments += 1;

        if (key === todayKey) {
          today.amountPaise += amountPaise;
          today.pages += pages;
          today.payments += 1;
        }
        if (key.startsWith(monthPrefix)) {
          month.amountPaise += amountPaise;
          month.pages += pages;
          month.payments += 1;
        }
        if (key >= startKey && key <= todayKey) {
          const bucket = buckets.get(key) ?? {
            date: key,
            amountPaise: 0,
            pages: 0,
            payments: 0,
          };
          bucket.amountPaise += amountPaise;
          bucket.pages += pages;
          bucket.payments += 1;
          buckets.set(key, bucket);
        }

        paid.push({ entry, timestamp, key });
      }

      const series = [];
      for (let offset = 0; offset < windowDays; offset += 1) {
        const key = shiftDateKey(startKey, offset);
        series.push(
          buckets.get(key) ?? {
            date: key,
            amountPaise: 0,
            pages: 0,
            payments: 0,
          },
        );
      }

      paid.sort((left, right) =>
        String(right.timestamp).localeCompare(String(left.timestamp)),
      );

      const recent = paid
        .slice(0, Math.min(Math.max(Number(recentLimit) || 12, 1), 50))
        .map(({ entry, timestamp }) => ({
          reference: `order_…${String(entry.orderId).slice(-6)}`,
          paidAt: timestamp,
          amountPaise: Math.max(0, Math.round(Number(entry.amountPaise) || 0)),
          pages: Math.max(0, Math.floor(Number(entry.chargeablePages) || 0)),
          status: entry.status,
          currency: entry.currency || 'INR',
        }));

      return {
        currency: 'INR',
        timeZone,
        generatedAt: (now instanceof Date ? now : new Date()).toISOString(),
        totals: {
          ...totals,
          averagePaise: totals.payments
            ? Math.round(totals.amountPaise / totals.payments)
            : 0,
        },
        today,
        month,
        series,
        recent,
      };
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
