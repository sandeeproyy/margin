/* Margin — no framework, just the room. */

const refs = {};
for (const id of [
  'boot',
  'authView',
  'authTabs',
  'loginForm',
  'loginEmail',
  'loginPassword',
  'loginButton',
  'loginError',
  'registerForm',
  'registerName',
  'registerEmail',
  'inviteField',
  'registerInvite',
  'registerPassword',
  'registerConfirm',
  'registerButton',
  'registerError',
  'registerHelp',
  'main',
  'quotaChip',
  'quotaChipText',
  'printerPill',
  'printerDot',
  'printerPillText',
  'accountMenuWrap',
  'accountButton',
  'accountAvatar',
  'accountName',
  'accountMenu',
  'accountMenuName',
  'accountMenuEmail',
  'quotaMenuText',
  'quotaMenuBar',
  'openAccountButton',
  'openAdminButton',
  'logoutButton',
  'dropzone',
  'uploadAvailability',
  'chooseFileButton',
  'uploadTitle',
  'uploadSubtitle',
  'uploadProgress',
  'uploadProgressBar',
  'fileHint',
  'sizeHint',
  'fileInput',
  'printerTicker',
  'printerName',
  'printerTickerDot',
  'printerTransport',
  'allowanceText',
  'allowanceBar',
  'historyList',
  'recentCount',
  'refreshHistory',
  'historyEmpty',
  'connectionLabel',
  'helpLink',
  'printDialog',
  'sheet',
  'sheetStep',
  'closeSheetButton',
  'previewImage',
  'previewFallback',
  'previewName',
  'previewMeta',
  'viewPagesButton',
  'changeFileButton',
  'sheetWarnings',
  'printerSelect',
  'printerSelectHint',
  'colorRow',
  'colorHint',
  'colorControl',
  'qualityRow',
  'qualityControl',
  'paperSelect',
  'paperDetail',
  'sidesControl',
  'sidesHint',
  'moreSettings',
  'rangeControl',
  'rangeCustomWrap',
  'rangeInput',
  'rangeError',
  'orientationControl',
  'scaleControl',
  'sourceField',
  'sourceSelect',
  'collateField',
  'collateInput',
  'sheetError',
  'printSummary',
  'sheetEstimate',
  'sheetPrice',
  'sheetQuota',
  'printButton',
  'printButtonLabel',
  'copiesInput',
  'copiesDown',
  'copiesUp',
  'previewDialog',
  'closePreviewDialog',
  'previewPageImage',
  'previewPageFallback',
  'previewPageFallbackText',
  'previewPrev',
  'previewPageLabel',
  'previewPageBadge',
  'previewNext',
  'accountDialog',
  'closeAccountDialog',
  'accountDialogAvatar',
  'accountDialogName',
  'accountDialogEmail',
  'accountDialogRole',
  'accountQuotaText',
  'accountSince',
  'accountPaywallText',
  'passwordForm',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'changePasswordButton',
  'passwordError',
  'passwordSuccess',
  'adminDialog',
  'closeAdminDialog',
  'earningsStatus',
  'earningsTotal',
  'earningsTotalMeta',
  'earningsMonth',
  'earningsMonthMeta',
  'earningsToday',
  'earningsTodayMeta',
  'earningsAverage',
  'earningsChart',
  'earningsRecent',
  'earningsEmpty',
  'earningsError',
  'inviteCount',
  'inviteForm',
  'inviteNote',
  'inviteDays',
  'createInviteButton',
  'inviteError',
  'adminSecret',
  'adminSecretLabel',
  'adminSecretCode',
  'copyAdminSecret',
  'adminSecretNote',
  'inviteList',
  'inviteEmpty',
  'peopleCount',
  'userList',
  'adminPrinterStatus',
  'adminPrinterList',
  'adminPrinterEmpty',
  'adminRefreshPrinters',
  'printerDialog',
  'closePrinterDialog',
  'printerDetails',
  'refreshPrintersButton',
  'statusView',
  'statusEyebrow',
  'statusJobNumber',
  'statusTitle',
  'statusMessage',
  'statusProgressWrap',
  'progressRail',
  'statusProgressBar',
  'stepFile',
  'stepPages',
  'stepPrinter',
  'statusError',
  'statusErrorText',
  'statusReceipt',
  'receiptStatus',
  'receiptName',
  'receiptMeta',
  'receiptCopies',
  'receiptColor',
  'receiptQuality',
  'receiptPaper',
  'receiptPrinter',
  'receiptTime',
  'statusActions',
  'printAnotherButton',
  'backHomeButton',
  'statusHint',
  'toast',
  'closeStatusButton',
]) {
  refs[id] = document.getElementById(id);
}

const FALLBACK_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.rtf',
  '.odt',
  '.txt',
  '.md',
  '.xls',
  '.xlsx',
  '.xlsm',
  '.csv',
  '.ppt',
  '.pptx',
  '.pps',
  '.ppsx',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.tif',
  '.tiff',
];

const STORAGE_KEYS = {
  printer: 'margin.printer.v2',
  activeJob: 'margin.activeJob',
  pendingJob: 'margin.pendingJob',
};

const state = {
  app: {
    maxUploadMb: 25,
    acceptedExtensions: FALLBACK_EXTENSIONS,
    openSignup: false,
  },
  account: null,
  quota: { dailyPages: 120, usedPages: 0, remainingPages: 120 },
  paywall: null,
  payment: null,
  openOrder: null,
  checkoutBusy: false,
  checkoutFailed: false,
  authMode: 'login',
  printers: [],
  defaultPrinterId: null,
  selectedPrinterId: null,
  printerError: null,
  history: [],
  job: null,
  pendingJobId: null,
  settings: null,
  rangeMode: 'all',
  uploading: false,
  submittingPrint: false,
  preview: { jobId: null, page: 1, pages: 0, blankPages: [] },
  previewLoading: false,
  statusJob: null,
  statusJobId: null,
  statusTimer: null,
  statusNetworkErrors: 0,
  statusHistoryRefreshed: false,
  statusFinished: false,
  closingSheet: null,
  toastTimer: null,
  admin: { users: [], invites: [], limits: null, printers: [], selectedId: null, earnings: null },
  adminSecret: '',
  passwordBusy: false,
  inviteBusy: false,
  menuOpen: false,
  refreshingPrinters: false,
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function plural(count, single, many = `${single}s`) {
  return `${count} ${count === 1 ? single : many}`;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readStorage(store, key) {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(store, key, value) {
  try {
    if (value == null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // Private browsing can refuse storage. Not important.
  }
}

function readJsonStorage(store, key) {
  const raw = readStorage(store, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatClock(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return 'Now';
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleTimeString();
  }
}

function formatHistoryTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  try {
    if (sameDay) {
      return `Today, ${new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(date)}`;
    }
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function formatMonthYear(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function formatShortDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/* Paywall                                                             */
/* ------------------------------------------------------------------ */

let razorpayScriptPromise = null;

function formatMoney(paise) {
  const value = Math.max(0, Number(paise) || 0) / 100;
  return Number.isInteger(value) ? `₹${value}` : `₹${value.toFixed(2)}`;
}

function pricingForPages(totalPages) {
  const paywall = state.paywall;
  if (!paywall) return null;
  const pages = Math.max(0, Math.floor(Number(totalPages) || 0));
  // The owner runs the room and never pays for their own prints.
  if (state.account?.role === 'admin') {
    return {
      chargeable: 0,
      amountPaise: 0,
      available: true,
      free: true,
      pages,
    };
  }
  const amountPaise =
    pages > 0
      ? Math.max(
          pages * Number(paywall.pricePerPagePaise || 0),
          Number(paywall.minimumChargePaise || 100),
        )
      : 0;
  return {
    chargeable: pages,
    amountPaise,
    available: Boolean(paywall.enabled),
  };
}

function paywallSummaryText() {
  const paywall = state.paywall;
  if (state.account?.role === 'admin') return 'Owner printing is free';
  if (!paywall) return '—';
  if (!paywall.enabled) return 'Paid printing not set up';
  return `${formatMoney(paywall.pricePerPagePaise)} per page`;
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else {
        razorpayScriptPromise = null;
        reject(new Error('The payment window could not be opened.'));
      }
    };
    script.onerror = () => {
      razorpayScriptPromise = null;
      reject(new Error('The payment window could not be opened.'));
    };
    document.head.appendChild(script);
  });

  return razorpayScriptPromise;
}

function paidRetryForCurrentJob() {
  return Boolean(
    state.payment?.orderId &&
      state.job &&
      state.payment.jobId === state.job.id,
  );
}

async function cancelPaymentOrder(orderId) {
  if (!orderId) return;
  try {
    await api(`/api/payments/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
    });
  } catch {
    // The server expires abandoned orders on its own.
  }
}

async function cancelOpenOrder() {
  const orderId = state.openOrder?.orderId;
  if (!orderId) return;
  state.openOrder = null;
  await cancelPaymentOrder(orderId);
  void refreshQuota();
}

function normalizeDashes(value) {
  return String(value ?? '').replace(/[\u2012\u2013\u2014\u2015]/g, '-');
}

function isAuthenticatedError(error) {
  return error?.status === 401;
}

function describeError(error, fallback = 'Something went wrong. Try again.') {
  return error?.message && error.message !== 'Failed to fetch'
    ? error.message
    : fallback;
}

function firstName(name) {
  return String(name ?? '').trim().split(/\s+/)[0] || 'Account';
}

function initialFor(name) {
  return (String(name ?? '').trim()[0] || 'M').toUpperCase();
}

function setBusyButton(button, busy, busyLabel, idleLabel) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle('is-busy', busy);
  const label = button.querySelector('span');
  if (label) label.textContent = busy ? busyLabel : idleLabel;
}

/* ------------------------------------------------------------------ */
/* Networking                                                          */
/* ------------------------------------------------------------------ */

async function api(path, options = {}) {
  const { method = 'GET', body, signal } = options;
  const headers = {};
  if (method !== 'GET') headers['X-Margin-Intent'] = 'app';
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    const networkError = new Error(
      'Could not reach the print room. Check your connection and try again.',
    );
    networkError.network = true;
    throw networkError;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    // A proxy error (502/503/504) arrives as an HTML page, not our JSON. That
    // almost always means the laptop or tunnel is offline, so say that instead
    // of blaming the request.
    const proxyOffline =
      !data && [502, 503, 504].includes(response.status);
    const requestError = new Error(
      data?.error ||
        (proxyOffline
          ? 'The print room is offline right now. The laptop may be asleep or the secure tunnel may have dropped.'
          : 'The print room could not finish that. Try again.'),
    );
    requestError.status = response.status;
    requestError.data = data;
    requestError.offline = proxyOffline;
    throw requestError;
  }

  return data;
}

function uploadFileBody(upload, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', upload.url, true);
    xhr.responseType = 'json';
    xhr.timeout = 10 * 60 * 1000;
    xhr.setRequestHeader('X-Upload-Token', upload.token);
    xhr.setRequestHeader(
      'Content-Type',
      file.type || 'application/octet-stream',
    );

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    });

    xhr.addEventListener('load', () => {
      const data =
        xhr.response && typeof xhr.response === 'object' ? xhr.response : null;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }
      const error = new Error(
        data?.error || 'That file could not be sent. Try again.',
      );
      error.status = xhr.status;
      error.data = data;
      reject(error);
    });

    xhr.addEventListener('error', () => {
      const error = new Error(
        'The upload lost its connection. Check your connection and try again.',
      );
      error.network = true;
      reject(error);
    });

    xhr.addEventListener('timeout', () => {
      reject(
        new Error(
          'That upload took too long. Try a smaller file or a better connection.',
        ),
      );
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('The upload was cancelled.'));
    });

    xhr.send(file);
  });
}

async function waitForJobReady(jobId, onProgress) {
  const started = Date.now();
  while (Date.now() - started < 6 * 60 * 1000) {
    const data = await api(`/api/jobs/${encodeURIComponent(jobId)}`);
    const job = data?.job;
    if (!job) {
      throw new Error('That document is no longer available. Choose it again.');
    }
    if (job.status === 'ready') return job;
    if (job.status === 'error') {
      throw new Error(
        job.error || 'That document could not be prepared. Try a PDF instead.',
      );
    }
    onProgress?.(clamp(Number(job.progress) || 0, 0, 100));
    await sleep(700);
  }
  throw new Error(
    'That document took too long to prepare. Try a smaller file or a PDF.',
  );
}

/* ------------------------------------------------------------------ */
/* Toast + screen transitions                                          */
/* ------------------------------------------------------------------ */

function toast(message, { error = false, duration = 4200 } = {}) {
  if (!message) return;
  window.clearTimeout(state.toastTimer);
  refs.toast.textContent = message;
  refs.toast.classList.toggle('is-error', error);
  refs.toast.classList.add('is-visible');
  state.toastTimer = window.setTimeout(() => {
    refs.toast.classList.remove('is-visible');
  }, duration);
}

function updateBodyLock() {
  const openDialog = Boolean(document.querySelector('dialog[open]'));
  document.body.classList.toggle(
    'is-locked',
    openDialog || !refs.statusView.hidden,
  );
}

function hideBoot() {
  refs.boot.classList.add('is-done');
}

function closeDialogById(dialog) {
  if (dialog?.open) dialog.close();
}

function showAuth(message = '', { focus = true } = {}) {
  stopStatusPolling();
  state.statusJobId = null;
  state.statusJob = null;
  state.job = null;
  state.pendingJobId = null;
  state.uploading = false;
  closePrintDialog(true);
  closeDialogById(refs.previewDialog);
  closeDialogById(refs.accountDialog);
  closeDialogById(refs.adminDialog);
  closeDialogById(refs.printerDialog);
  setUploading(false);
  setAccountMenu(false);
  refs.statusView.hidden = true;
  refs.main.hidden = true;
  refs.authView.hidden = false;
  setAuthMode('login', { focus: false });
  refs.loginError.textContent = message;
  refs.loginPassword.value = '';
  refs.registerPassword.value = '';
  refs.registerConfirm.value = '';
  refs.registerError.textContent = '';
  hideBoot();
  updateBodyLock();
  if (focus) window.setTimeout(() => refs.loginEmail.focus(), 60);
}

function showMain() {
  refs.authView.hidden = true;
  refs.main.hidden = false;
  refs.statusView.hidden = true;
  hideBoot();
  updateBodyLock();
}

function updateConnectionLabel() {
  if (!navigator.onLine) {
    refs.connectionLabel.textContent = 'Offline';
    return;
  }
  if (location.protocol === 'https:') {
    refs.connectionLabel.textContent = 'Private';
    return;
  }
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    refs.connectionLabel.textContent = 'On this laptop';
    return;
  }
  refs.connectionLabel.textContent = 'Connected';
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

function setAuthMode(mode, { focus = true } = {}) {
  state.authMode = mode === 'register' ? 'register' : 'login';
  const register = state.authMode === 'register';
  refs.loginForm.hidden = register;
  refs.registerForm.hidden = !register;
  for (const button of refs.authTabs.querySelectorAll('button[data-auth-mode]')) {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.authMode === state.authMode),
    );
  }
  refs.loginError.textContent = '';
  refs.registerError.textContent = '';
  if (register) {
    const openSignup = Boolean(state.app.openSignup);
    refs.inviteField.hidden = openSignup;
    refs.registerInvite.required = !openSignup;
    refs.registerHelp.textContent = openSignup
      ? 'Use at least 10 characters for your password.'
      : 'Margin is invitation only. Use the code the owner shared with you.';
    if (focus) window.setTimeout(() => refs.registerName.focus(), 40);
  } else if (focus) {
    window.setTimeout(() => refs.loginEmail.focus(), 40);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = refs.loginEmail.value.trim();
  const password = refs.loginPassword.value;
  refs.loginError.textContent = '';

  if (!email || !password) {
    refs.loginError.textContent = 'Enter your email and password.';
    (!email ? refs.loginEmail : refs.loginPassword).focus();
    return;
  }

  setBusyButton(refs.loginButton, true, 'Signing in…', 'Sign in');
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    refs.loginForm.reset();
    await enterApp();
    toast('Signed in. The room is yours.');
  } catch (error) {
    if (error.status === 429) {
      refs.loginError.textContent =
        'Too many attempts. Wait a few minutes, then try again.';
    } else if (error.status === 401) {
      refs.loginError.textContent = 'That email or password is not correct.';
    } else {
      refs.loginError.textContent = describeError(
        error,
        'The print room could not be reached. Try again.',
      );
    }
    refs.loginPassword.select();
  } finally {
    setBusyButton(refs.loginButton, false, 'Signing in…', 'Sign in');
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const name = refs.registerName.value.trim();
  const email = refs.registerEmail.value.trim();
  const inviteCode = refs.registerInvite.value.trim();
  const password = refs.registerPassword.value;
  const confirm = refs.registerConfirm.value;
  const openSignup = Boolean(state.app.openSignup);
  refs.registerError.textContent = '';

  if (!name) {
    refs.registerError.textContent = 'Enter your name.';
    refs.registerName.focus();
    return;
  }
  if (!email) {
    refs.registerError.textContent = 'Enter your email address.';
    refs.registerEmail.focus();
    return;
  }
  if (!openSignup && !inviteCode) {
    refs.registerError.textContent = 'Enter the invitation code you were given.';
    refs.registerInvite.focus();
    return;
  }
  if (password.length < 10) {
    refs.registerError.textContent = 'Use at least 10 characters for your password.';
    refs.registerPassword.focus();
    return;
  }
  if (password !== confirm) {
    refs.registerError.textContent = 'Those two passwords do not match.';
    refs.registerConfirm.focus();
    return;
  }

  setBusyButton(
    refs.registerButton,
    true,
    'Creating…',
    'Create my account',
  );
  try {
    await api('/api/auth/register', {
      method: 'POST',
      body: {
        name,
        email,
        password,
        inviteCode: openSignup ? '' : inviteCode,
      },
    });
    refs.registerForm.reset();
    await enterApp();
    toast('Your account is ready. Welcome in.');
  } catch (error) {
    if (error.status === 429) {
      refs.registerError.textContent =
        'Too many accounts created from here. Try again later.';
    } else {
      refs.registerError.textContent = describeError(
        error,
        'That account could not be created. Try again.',
      );
    }
  } finally {
    setBusyButton(
      refs.registerButton,
      false,
      'Creating…',
      'Create my account',
    );
  }
}

async function enterApp() {
  const data = await api('/api/bootstrap');
  applyBootstrap(data);
  showMain();
  const restored = await restoreActiveJob();
  if (!restored) await restorePendingJob();
}

async function handleLogout() {
  refs.logoutButton.disabled = true;
  setAccountMenu(false);
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // The screen signs out either way.
  } finally {
    refs.logoutButton.disabled = false;
    writeStorage(sessionStorage, STORAGE_KEYS.activeJob, null);
    writeStorage(sessionStorage, STORAGE_KEYS.pendingJob, null);
    state.account = null;
    state.history = [];
    state.printers = [];
    state.paywall = null;
    state.payment = null;
    state.openOrder = null;
    state.checkoutBusy = false;
    showAuth('You are signed out.');
  }
}

/* ------------------------------------------------------------------ */
/* Account chrome                                                      */
/* ------------------------------------------------------------------ */

function applyBootstrap(data) {
  if (data.app) {
    state.app = {
      maxUploadMb: Number(data.app.maxUploadMb) || state.app.maxUploadMb,
      acceptedExtensions:
        Array.isArray(data.app.acceptedExtensions) &&
        data.app.acceptedExtensions.length
          ? data.app.acceptedExtensions
          : state.app.acceptedExtensions,
      openSignup: Boolean(data.app.openSignup),
    };
  }

  state.account = data.account ?? null;
  state.quota = data.quota ?? state.quota;
  state.paywall = data.paywall ?? null;
  state.printerError = (data.printers ?? []).length
    ? null
    : 'No printer is connected right now.';
  setPrinters(data.printers ?? [], data.defaultPrinterId ?? null);
  renderHistory(data.history ?? []);
  renderAccountChrome();
  updateUploadHints();
  updateConnectionLabel();
}

function setAccountMenu(open) {
  state.menuOpen = Boolean(open);
  refs.accountMenu.hidden = !state.menuOpen;
  refs.accountButton.setAttribute('aria-expanded', String(state.menuOpen));
}

function renderAccountChrome() {
  const account = state.account;
  const name = account?.name || 'Account';
  const email = account?.email || '';
  const role = account?.role === 'admin' ? 'Owner' : 'Member';

  refs.accountName.textContent = firstName(name);
  refs.accountAvatar.textContent = initialFor(name);
  refs.accountMenuName.textContent = name;
  refs.accountMenuEmail.textContent = email;
  refs.accountButton.setAttribute(
    'aria-label',
    `Open account menu for ${name}`,
  );
  refs.openAdminButton.hidden = account?.role !== 'admin';

  refs.accountDialogAvatar.textContent = initialFor(name);
  refs.accountDialogName.textContent = name;
  refs.accountDialogEmail.textContent = email;
  refs.accountDialogRole.textContent = role;
  refs.accountSince.textContent = formatMonthYear(account?.createdAt);
  refs.accountQuotaText.textContent = `${state.quota.usedPages} of ${state.quota.dailyPages} pages used today`;
  if (refs.accountPaywallText) {
    refs.accountPaywallText.textContent = paywallSummaryText();
    const fact = refs.accountPaywallText.closest('div');
    if (fact) fact.hidden = !state.paywall;
  }

  updateQuotaChrome();
}

function updateQuotaChrome() {
  const daily = Math.max(1, Number(state.quota.dailyPages) || 1);
  const remaining = Math.max(0, Number(state.quota.remainingPages) || 0);
  const used = Math.max(0, Number(state.quota.usedPages) || 0);
  const percent = clamp((remaining / daily) * 100, 0, 100);

  refs.quotaChipText.textContent = `${remaining} ${remaining === 1 ? 'page' : 'pages'}`;
  refs.quotaMenuText.textContent = `${remaining} left today`;
  refs.quotaMenuBar.style.width = `${percent}%`;
  refs.allowanceText.textContent = `${remaining} of ${daily} pages left today`;
  refs.allowanceBar.style.width = `${percent}%`;
  refs.allowanceBar.classList.toggle('is-low', percent <= 20);
  refs.quotaMenuBar.classList.toggle('is-low', percent <= 20);
  refs.sheetQuota.textContent = `${remaining} ${remaining === 1 ? 'page' : 'pages'} left today`;

  if (state.account) {
    refs.accountQuotaText.textContent = `${used} of ${daily} pages used today`;
  }
}

async function refreshQuota() {
  try {
    const data = await api('/api/account');
    if (data.quota) {
      state.quota = data.quota;
      updateQuotaChrome();
    }
    if (data.account) {
      state.account = data.account;
    }
    if (data.paywall) {
      state.paywall = data.paywall;
    }
    if (data.account || data.paywall) {
      renderAccountChrome();
      if (state.job && state.settings) updatePrintSummary();
    }
  } catch {
    // The next full load will refresh it.
  }
}

function openAccountDialog() {
  setAccountMenu(false);
  refs.passwordForm.reset();
  refs.passwordError.textContent = '';
  refs.passwordSuccess.textContent = '';
  renderAccountChrome();
  if (!refs.accountDialog.open) refs.accountDialog.showModal();
  updateBodyLock();
  window.setTimeout(() => refs.currentPassword.focus(), 50);
}

async function handlePasswordChange(event) {
  event.preventDefault();
  if (state.passwordBusy) return;
  refs.passwordError.textContent = '';
  refs.passwordSuccess.textContent = '';

  const currentPassword = refs.currentPassword.value;
  const newPassword = refs.newPassword.value;
  const confirmPassword = refs.confirmPassword.value;

  if (!currentPassword) {
    refs.passwordError.textContent = 'Enter your current password.';
    refs.currentPassword.focus();
    return;
  }
  if (newPassword.length < 10) {
    refs.passwordError.textContent = 'Use at least 10 characters for the new password.';
    refs.newPassword.focus();
    return;
  }
  if (newPassword !== confirmPassword) {
    refs.passwordError.textContent = 'Those two passwords do not match.';
    refs.confirmPassword.focus();
    return;
  }

  state.passwordBusy = true;
  setBusyButton(
    refs.changePasswordButton,
    true,
    'Updating…',
    'Update password',
  );
  try {
    const data = await api('/api/account/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
    if (data.account) state.account = data.account;
    refs.passwordForm.reset();
    refs.passwordSuccess.textContent = 'Your password is updated.';
    toast('Password updated.');
  } catch (error) {
    if (isAuthenticatedError(error)) {
      closeDialogById(refs.accountDialog);
      showAuth('Please sign in again to change your password.');
      return;
    }
    refs.passwordError.textContent = describeError(
      error,
      'That password could not be updated. Try again.',
    );
  } finally {
    state.passwordBusy = false;
    setBusyButton(
      refs.changePasswordButton,
      false,
      'Updating…',
      'Update password',
    );
  }
}

/* ------------------------------------------------------------------ */
/* Printer state                                                       */
/* ------------------------------------------------------------------ */

function getSelectedPrinter() {
  if (!state.printers.length) return null;
  return (
    state.printers.find((printer) => printer.id === state.selectedPrinterId) ??
    state.printers.find((printer) => printer.online) ??
    state.printers[0]
  );
}

function statusLevel(printer) {
  const level = printer?.status?.level;
  return ['ready', 'busy', 'offline', 'error'].includes(level)
    ? level
    : 'muted';
}

function setStatusLight(element, level) {
  element.classList.remove(
    'status-light--ready',
    'status-light--busy',
    'status-light--offline',
    'status-light--error',
    'status-light--loading',
    'status-light--muted',
  );
  element.classList.add(`status-light--${level}`);
}

function choosePrinter(printers, defaultPrinterId) {
  if (!printers.length) {
    state.selectedPrinterId = null;
    return;
  }
  const stored = readStorage(localStorage, STORAGE_KEYS.printer);
  const candidates = [
    state.selectedPrinterId,
    stored,
    defaultPrinterId,
    printers.find((printer) => printer.online)?.id,
    printers[0].id,
  ];
  state.selectedPrinterId =
    candidates.find((id) => printers.some((printer) => printer.id === id)) ??
    printers[0].id;
}

function setPrinters(printers, defaultPrinterId) {
  state.printers = Array.isArray(printers) ? printers : [];
  state.defaultPrinterId = defaultPrinterId ?? null;
  choosePrinter(state.printers, state.defaultPrinterId);
  renderPrinterChrome();
  renderPrinterDetails();
  if (state.settings) syncPrintControls();
}

function renderPrinterChrome() {
  const printer = getSelectedPrinter();

  if (printer) {
    const level = statusLevel(printer);
    setStatusLight(refs.printerDot, level);
    setStatusLight(refs.printerTickerDot, level);
    const ready = printer.online && !printer.busy;
    refs.printerPillText.textContent = printer.busy
      ? 'Printer printing'
      : printer.online
        ? 'Printer ready'
        : 'Printer offline';
    refs.printerName.textContent = printer.label || 'Your printer';
    refs.printerTransport.textContent = printer.busy
      ? 'Printing now'
      : printer.online
        ? 'Ready'
        : 'Not connected';
    refs.uploadAvailability.textContent = ready
      ? 'Ready'
      : printer.online
        ? 'Printing now'
        : 'Printer offline';
    refs.printerPill.title = printer.online
      ? 'The printer is connected to the laptop.'
      : 'The printer is not connected right now.';
    return;
  }

  setStatusLight(refs.printerDot, state.printerError ? 'error' : 'muted');
  setStatusLight(refs.printerTickerDot, state.printerError ? 'error' : 'muted');
  refs.printerPillText.textContent = 'No printer';
  refs.printerName.textContent = state.printerError
    ? 'No printer connected'
    : 'Looking for it…';
  refs.printerTransport.textContent = state.printerError ? 'Check again' : 'Checking';
  refs.uploadAvailability.textContent = 'Printer offline';
  refs.printerPill.title = 'No printer is connected right now.';
}

function renderPrinterDetails() {
  refs.printerDetails.replaceChildren();

  if (!state.printers.length) {
    const empty = document.createElement('p');
    empty.className = 'printer-empty';
    empty.textContent =
      state.printerError ||
      'No printer was found. Check that it is switched on and connected to the laptop, then check again.';
    refs.printerDetails.append(empty);
    return;
  }

  for (const printer of state.printers) {
    const detail = document.createElement('div');
    detail.className = 'printer-detail';

    const head = document.createElement('div');
    head.className = 'printer-detail-head';

    const name = document.createElement('strong');
    name.textContent = printer.label || 'Your printer';

    const stateLabel = document.createElement('span');
    stateLabel.className = 'printer-detail-state';
    const dot = document.createElement('span');
    dot.className = 'status-light';
    setStatusLight(dot, statusLevel(printer));
    dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = printer.status?.label || 'Ready';
    stateLabel.append(dot, label);
    head.append(name, stateLabel);

    const meta = document.createElement('p');
    meta.className = 'printer-detail-meta';
    meta.textContent = printer.online
      ? printer.busy
        ? 'Printing a job now'
        : 'Connected to the laptop'
      : 'Not connected right now';

    const caps = document.createElement('div');
    caps.className = 'printer-caps';
    const capLabels = [
      printer.supportsColor ? 'Color' : 'Black ink only',
      printer.supportsDuplex ? 'Two-sided' : 'One-sided',
    ];
    if (Array.isArray(printer.papers) && printer.papers.length) {
      const names = printer.papers
        .slice(0, 3)
        .map((paper) => paper.name)
        .join(', ');
      capLabels.push(names);
    }
    if (printer.maxCopies) {
      capLabels.push(`Up to ${printer.maxCopies} copies`);
    }
    for (const text of capLabels) {
      const chip = document.createElement('span');
      chip.className = 'cap-chip';
      chip.textContent = text;
      caps.append(chip);
    }

    detail.append(head, meta, caps);
    refs.printerDetails.append(detail);
  }
}

async function refreshPrinters() {
  if (state.refreshingPrinters) return;
  state.refreshingPrinters = true;
  refs.refreshPrintersButton.disabled = true;
  refs.refreshPrintersButton.classList.add('is-busy');
  const label = refs.refreshPrintersButton.querySelector('span');
  const original = label.textContent;
  label.textContent = 'Checking…';

  try {
    const data = await api('/api/printers?refresh=1');
    state.printerError = (data.printers ?? []).length
      ? null
      : data.message || 'No printer is connected right now.';
    setPrinters(data.printers ?? [], state.defaultPrinterId);
    if (state.job) {
      state.settings = defaultSettings(getSelectedPrinter());
      buildPrintControls();
      updatePrintSummary();
      renderSheetWarnings();
    }
    if (!data.printers?.length) {
      toast(data.message || 'No printer found. Check that it is switched on.', {
        error: true,
      });
    } else {
      toast('The printer is connected.');
    }
  } catch (error) {
    if (isAuthenticatedError(error)) {
      closeDialogById(refs.printerDialog);
      showAuth('Please sign in again to check the printer.');
      return;
    }
    toast(describeError(error, 'Could not check the printer.'), { error: true });
  } finally {
    state.refreshingPrinters = false;
    refs.refreshPrintersButton.disabled = false;
    refs.refreshPrintersButton.classList.remove('is-busy');
    label.textContent = original;
  }
}

function selectPrinterById(id) {
  if (!state.printers.some((printer) => printer.id === id)) return;
  state.selectedPrinterId = id;
  writeStorage(localStorage, STORAGE_KEYS.printer, id);
  renderPrinterChrome();
  if (state.job) {
    state.settings = defaultSettings(getSelectedPrinter());
    buildPrintControls();
    updatePrintSummary();
    renderSheetWarnings();
  }
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

const HISTORY_ICON =
  '<svg viewBox="0 0 32 40" aria-hidden="true"><path d="M4 1h16l8 8v30H4z"></path><path d="M20 1v8h8"></path><path d="M10 18h12M10 24h12M10 30h7"></path></svg>';

function renderHistory(entries) {
  state.history = Array.isArray(entries) ? entries : [];
  refs.historyList.replaceChildren();
  refs.recentCount.textContent = state.history.length
    ? String(state.history.length)
    : '';
  refs.historyEmpty.hidden = state.history.length > 0;

  state.history.forEach((entry, index) => {
    const item = document.createElement('li');
    item.className = 'history-item';

    const number = document.createElement('span');
    number.className = 'history-index';
    number.textContent = String(index + 1).padStart(2, '0');

    const main = document.createElement('div');
    main.className = 'history-main';

    const kind = document.createElement('span');
    kind.className = 'history-kind';
    kind.innerHTML = HISTORY_ICON;

    const copy = document.createElement('div');
    copy.className = 'history-copy';
    const name = document.createElement('strong');
    name.textContent = entry.name || 'Untitled document';
    const meta = document.createElement('span');
    const metaBits = [];
    const pages = Number(entry.printedPages ?? entry.pageCount ?? 0);
    if (pages > 0) metaBits.push(plural(pages, 'page'));
    if (entry.copies > 1) metaBits.push(plural(entry.copies, 'copy', 'copies'));
    if (entry.status !== 'error') {
      metaBits.push(entry.color ? 'Color' : 'B&W');
      metaBits.push(entry.qualityLabel || entry.quality || 'Standard');
    } else {
      metaBits.push(entry.error || 'The job stopped');
    }
    meta.textContent = metaBits.join(' · ');
    copy.append(name, meta);

    main.append(kind, copy);

    const side = document.createElement('div');
    side.className = 'history-side';

    const status = document.createElement('span');
    status.className = `history-state${
      entry.status === 'error' ? ' history-state--error' : ''
    }`;
    const dot = document.createElement('span');
    dot.className = 'status-light';
    setStatusLight(dot, entry.status === 'error' ? 'error' : 'ready');
    dot.setAttribute('aria-hidden', 'true');
    const statusText = document.createElement('span');
    statusText.textContent = entry.status === 'error' ? 'Stopped' : 'Sent';
    status.append(dot, statusText);
    status.title =
      entry.status === 'error'
        ? 'Did not reach the printer'
        : 'Sent to the printer';

    const time = document.createElement('time');
    time.dateTime = entry.createdAt || '';
    time.textContent = formatHistoryTime(entry.createdAt);

    side.append(status, time);
    item.append(number, main, side);
    refs.historyList.append(item);
  });
}

async function loadHistory({ notify = false } = {}) {
  try {
    const data = await api('/api/history');
    renderHistory(data.history ?? []);
    if (notify) toast('The list is fresh.');
  } catch (error) {
    if (isAuthenticatedError(error)) {
      showAuth('Please sign in again to see your recent pages.');
      return;
    }
    if (notify) {
      toast(describeError(error, 'Could not refresh the history.'), {
        error: true,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

let dragDepth = 0;

function setUploading(active, { title, subtitle } = {}) {
  state.uploading = Boolean(active);
  refs.dropzone.classList.toggle('is-uploading', state.uploading);
  refs.dropzone.setAttribute('aria-busy', String(state.uploading));
  refs.chooseFileButton.disabled = state.uploading;
  if (state.uploading) {
    refs.uploadTitle.textContent = title || 'Sending your file';
    refs.uploadSubtitle.textContent = subtitle || 'Keeping it on the laptop';
    refs.uploadAvailability.textContent = 'Receiving';
    refs.uploadProgress.setAttribute('aria-hidden', 'false');
  } else {
    refs.uploadTitle.textContent = 'Choose a document';
    refs.uploadSubtitle.textContent = 'Drop it here, or tap to browse';
    refs.dropzone.classList.remove('is-indeterminate');
    refs.uploadProgressBar.style.width = '0%';
    refs.uploadProgress.setAttribute('aria-hidden', 'true');
    renderPrinterChrome();
  }
}

function setUploadProgress(percent) {
  refs.dropzone.classList.remove('is-indeterminate');
  refs.uploadProgressBar.style.width = `${clamp(percent, 0, 100)}%`;
}

function setUploadIndeterminate(title, subtitle) {
  refs.dropzone.classList.add('is-indeterminate');
  if (title) refs.uploadTitle.textContent = title;
  if (subtitle) refs.uploadSubtitle.textContent = subtitle;
  refs.uploadAvailability.textContent = 'Preparing';
}

function updateUploadHints() {
  const maxMb = state.app.maxUploadMb || 25;
  refs.sizeHint.textContent = `${maxMb} MB max`;
  refs.fileHint.textContent = 'PDF · Word · image · text';
  const extensions = state.app.acceptedExtensions ?? FALLBACK_EXTENSIONS;
  if (extensions.length) {
    refs.fileInput.setAttribute('accept', extensions.join(','));
  }
  refs.chooseFileButton.title = `PDF, Word, Excel, PowerPoint, images, text · up to ${maxMb} MB`;
}

function validateFile(file) {
  if (!file) return 'Choose a file to print.';
  const name = String(file.name || '');
  const dot = name.lastIndexOf('.');
  const extension = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  const accepted = state.app.acceptedExtensions ?? FALLBACK_EXTENSIONS;
  if (!extension || !accepted.includes(extension)) {
    return 'That file type is not supported. Try a PDF, Word, Excel, PowerPoint, image, or text file.';
  }
  const maxBytes = (state.app.maxUploadMb || 25) * 1024 * 1024;
  if (file.size === 0) return 'That file looks empty.';
  if (file.size > maxBytes) {
    return `That file is larger than ${state.app.maxUploadMb || 25} MB.`;
  }
  return '';
}

async function uploadFile(file) {
  if (state.uploading) return;
  const problem = validateFile(file);
  if (problem) {
    toast(problem, { error: true });
    return;
  }
  if (!navigator.onLine) {
    toast('You are offline. Reconnect, then try again.', { error: true });
    return;
  }

  state.job = null;
  setUploading(true, {
    title: 'Sending your file',
    subtitle: `${file.name} · ${formatBytes(file.size) || 'document'}`,
  });
  setUploadProgress(3);

  try {
    const prepared = await api('/api/uploads/prepare', {
      method: 'POST',
      body: { name: file.name, size: file.size },
    });
    if (!prepared?.upload?.url || !prepared.upload.token) {
      throw new Error('That file could not be sent. Try again.');
    }

    const uploaded = await uploadFileBody(
      prepared.upload,
      file,
      (fraction) => setUploadProgress(4 + fraction * 66),
    );
    const jobId = uploaded?.job?.id;
    if (!jobId) {
      throw new Error('That file could not be sent. Try again.');
    }

    setUploadProgress(72);
    setUploadIndeterminate('Preparing your pages', 'Making sure every page is ready');
    const job = await waitForJobReady(jobId, (progress) => {
      setUploadProgress(72 + (progress / 100) * 26);
    });

    state.pendingJobId = job.id;
    writeStorage(
      sessionStorage,
      STORAGE_KEYS.pendingJob,
      JSON.stringify({ id: job.id, at: Date.now() }),
    );
    setUploadProgress(100);
    await sleep(260);
    setUploading(false);
    toast('Ready to print.');
    openPrintDialog(job);
  } catch (error) {
    setUploading(false);
    if (isAuthenticatedError(error)) {
      showAuth('Please sign in again, then choose the file once more.');
      return;
    }
    toast(
      describeError(
        error,
        'That file could not be prepared. Try exporting it as a PDF.',
      ),
      { error: true, duration: 6500 },
    );
  } finally {
    refs.fileInput.value = '';
  }
}

function handleDroppedFiles(files) {
  if (!files?.length) return;
  if (files.length > 1) {
    toast('One document at a time, please. The first file was used.');
  }
  void uploadFile(files[0]);
}

async function restoreActiveJob() {
  const saved = readJsonStorage(sessionStorage, STORAGE_KEYS.activeJob);
  if (!saved?.id) return false;
  if (Date.now() - Number(saved.at || 0) > 2 * 60 * 60 * 1000) {
    writeStorage(sessionStorage, STORAGE_KEYS.activeJob, null);
    return false;
  }

  try {
    const data = await api(`/api/jobs/${encodeURIComponent(saved.id)}`);
    const job = data.job;
    if (!job) return false;
    if (['queued', 'preparing', 'sending'].includes(job.status)) {
      showStatus(job.id, job);
      return true;
    }
    writeStorage(sessionStorage, STORAGE_KEYS.activeJob, null);
    return false;
  } catch {
    writeStorage(sessionStorage, STORAGE_KEYS.activeJob, null);
    return false;
  }
}

async function restorePendingJob() {
  const saved = readJsonStorage(sessionStorage, STORAGE_KEYS.pendingJob);
  if (!saved?.id) return;
  if (Date.now() - Number(saved.at || 0) > 2 * 60 * 60 * 1000) {
    writeStorage(sessionStorage, STORAGE_KEYS.pendingJob, null);
    return;
  }

  try {
    const data = await api(`/api/jobs/${encodeURIComponent(saved.id)}`);
    const job = data.job;
    if (!job) {
      writeStorage(sessionStorage, STORAGE_KEYS.pendingJob, null);
      return;
    }
    if (job.status === 'ready') {
      openPrintDialog(job);
      return;
    }
    if (['processing', 'queued'].includes(job.status)) {
      setUploading(true, {
        title: 'Preparing your pages',
        subtitle: job.name || 'Your document',
      });
      const ready = await waitForJobReady(job.id, (progress) => {
        setUploadProgress(20 + (progress / 100) * 78);
      });
      setUploading(false);
      openPrintDialog(ready);
      return;
    }
    writeStorage(sessionStorage, STORAGE_KEYS.pendingJob, null);
  } catch {
    writeStorage(sessionStorage, STORAGE_KEYS.pendingJob, null);
  }
}

/* ------------------------------------------------------------------ */
/* Print settings                                                      */
/* ------------------------------------------------------------------ */

function fillSegmented(container, options, onChoose) {
  container.replaceChildren();
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.value = option.value;
    button.textContent = option.label;
    button.setAttribute('aria-pressed', 'false');
    button.disabled = Boolean(option.disabled);
    if (option.title) button.title = option.title;
    button.addEventListener('click', () => {
      if (button.disabled) return;
      onChoose(option.value);
      syncPrintControls();
      updatePrintSummary();
      renderSheetWarnings();
    });
    container.append(button);
  }
}

function setPressed(container, activeValue) {
  for (const button of container.querySelectorAll('button[data-value]')) {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.value === activeValue),
    );
  }
}

function defaultSettings(printer) {
  if (!printer) {
    return {
      copies: 1,
      color: false,
      quality: null,
      paperId: null,
      orientation: 'auto',
      sides: 'one-sided',
      scale: 'fit',
      collate: true,
      sourceId: null,
    };
  }

  const papers = Array.isArray(printer.papers) ? printer.papers : [];
  const defaultPaper =
    papers.find((paper) => paper.id === printer.defaultPaperId) ?? papers[0];

  return {
    copies: 1,
    color: Boolean(printer.supportsColor),
    quality:
      printer.qualities?.find((item) => item.id === printer.defaultQuality)?.id ??
      printer.qualities?.[0]?.id ??
      'PrinterDefault',
    paperId: defaultPaper?.id ?? null,
    orientation: 'auto',
    sides: 'one-sided',
    scale: 'fit',
    collate: true,
    sourceId: printer.sources?.[0]?.id ?? null,
  };
}

function buildPrintControls() {
  const printer = getSelectedPrinter();
  const settings = state.settings;

  refs.printerSelect.replaceChildren();
  if (state.printers.length) {
    for (const item of state.printers) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.online
        ? item.label || 'Your printer'
        : `${item.label || 'Your printer'} · offline`;
      refs.printerSelect.append(option);
    }
    refs.printerSelect.disabled = state.printers.length < 2;
  } else {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No printer connected';
    refs.printerSelect.append(option);
    refs.printerSelect.disabled = true;
  }

  if (!printer || !settings) {
    refs.colorControl.replaceChildren();
    refs.qualityControl.replaceChildren();
    refs.sidesControl.replaceChildren();
    refs.orientationControl.replaceChildren();
    refs.scaleControl.replaceChildren();
    refs.paperSelect.replaceChildren();
    refs.sourceSelect.replaceChildren();
    refs.printButton.disabled = true;
    refs.printButtonLabel.textContent = 'No printer available';
    return;
  }

  fillSegmented(
    refs.colorControl,
    [
      {
        value: 'color',
        label: 'Color',
        disabled: !printer.supportsColor,
        title: printer.supportsColor
          ? 'Use all ink colors'
          : 'This printer prints in black ink only',
      },
      {
        value: 'mono',
        label: 'Black ink',
        title: 'Use only the black ink cartridge',
      },
    ],
    (value) => {
      state.settings.color = value === 'color';
    },
  );

  fillSegmented(
    refs.qualityControl,
    (printer.qualities?.length
      ? printer.qualities
      : [{ id: 'PrinterDefault', label: 'Standard' }]
    ).map((quality) => ({
      value: quality.id,
      label: quality.label,
    })),
    (value) => {
      state.settings.quality = value;
    },
  );

  fillSegmented(
    refs.sidesControl,
    [
      { value: 'one-sided', label: 'One side' },
      {
        value: 'long-edge',
        label: 'Long edge',
        disabled: !printer.supportsDuplex,
        title: printer.supportsDuplex
          ? 'Turn like a book'
          : 'This printer prints one side',
      },
      {
        value: 'short-edge',
        label: 'Short edge',
        disabled: !printer.supportsDuplex,
        title: printer.supportsDuplex
          ? 'Turn like a notepad'
          : 'This printer prints one side',
      },
    ],
    (value) => {
      state.settings.sides = value;
    },
  );

  fillSegmented(
    refs.orientationControl,
    [
      { value: 'auto', label: 'Auto' },
      { value: 'portrait', label: 'Portrait' },
      { value: 'landscape', label: 'Landscape' },
    ],
    (value) => {
      state.settings.orientation = value;
    },
  );

  fillSegmented(
    refs.scaleControl,
    [
      { value: 'fit', label: 'Fit to paper' },
      { value: 'actual', label: 'Actual size' },
    ],
    (value) => {
      state.settings.scale = value;
    },
  );

  refs.paperSelect.replaceChildren();
  for (const paper of printer.papers ?? []) {
    const option = document.createElement('option');
    option.value = paper.id;
    option.textContent = paper.name;
    option.title = paper.detail || paper.name;
    refs.paperSelect.append(option);
  }
  refs.paperSelect.disabled = !(printer.papers?.length);
  if (!(printer.papers?.length)) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Printer default';
    refs.paperSelect.append(option);
  }

  refs.sourceSelect.replaceChildren();
  for (const source of printer.sources ?? []) {
    const option = document.createElement('option');
    option.value = source.id;
    option.textContent = source.name;
    refs.sourceSelect.append(option);
  }
  refs.sourceSelect.disabled = !(printer.sources?.length);

  refs.copiesInput.max = String(printer.maxCopies || 999);
  refs.moreSettings.open = false;
  syncPrintControls();
}

function syncPrintControls() {
  const printer = getSelectedPrinter();
  if (!printer || !state.settings) return;

  const settings = state.settings;
  const maxCopies = Math.max(1, Number(printer.maxCopies) || 999);

  if (!Number.isFinite(settings.copies) || settings.copies < 1) settings.copies = 1;
  settings.copies = clamp(Math.round(settings.copies), 1, maxCopies);
  if (!printer.qualities?.some((quality) => quality.id === settings.quality)) {
    settings.quality =
      printer.defaultQuality || printer.qualities?.[0]?.id || 'PrinterDefault';
  }
  if (!printer.papers?.some((paper) => paper.id === settings.paperId)) {
    settings.paperId =
      printer.papers?.find((paper) => paper.id === printer.defaultPaperId)?.id ??
      printer.papers?.[0]?.id ??
      null;
  }
  if (!printer.sources?.some((source) => source.id === settings.sourceId)) {
    settings.sourceId = printer.sources?.[0]?.id ?? null;
  }
  if (settings.sides !== 'one-sided' && !printer.supportsDuplex) {
    settings.sides = 'one-sided';
  }
  if (!printer.supportsColor) settings.color = false;

  refs.copiesInput.value = String(settings.copies);
  refs.copiesInput.max = String(maxCopies);
  refs.paperSelect.value = settings.paperId ?? '';
  refs.sourceSelect.value = settings.sourceId ?? '';
  refs.collateInput.checked = Boolean(settings.collate);
  refs.printerSelect.value = printer.id;
  refs.printerSelectHint.textContent = printer.online
    ? printer.busy
      ? 'Printing now'
      : 'Connected to the laptop'
    : 'Not connected';

  setPressed(refs.colorControl, settings.color ? 'color' : 'mono');
  setPressed(refs.qualityControl, settings.quality);
  setPressed(refs.sidesControl, settings.sides);
  setPressed(refs.orientationControl, settings.orientation);
  setPressed(refs.scaleControl, settings.scale);

  for (const button of refs.rangeControl.querySelectorAll('button')) {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.range === state.rangeMode),
    );
  }

  refs.rangeCustomWrap.hidden = state.rangeMode !== 'custom';
  refs.colorHint.textContent = printer.supportsColor
    ? settings.color
      ? 'All ink colors'
      : 'Black ink only'
    : 'Black ink only';
  refs.sidesHint.textContent = printer.supportsDuplex
    ? 'Choose how it turns'
    : 'This printer is one-sided';
  refs.collateField.hidden = settings.copies <= 1;
  refs.sourceField.hidden = !(printer.sources?.length > 1);

  const paper = printer.papers?.find((item) => item.id === settings.paperId);
  refs.paperDetail.textContent = paper?.detail || paper?.name || 'Printer default';

  refs.colorControl.classList.toggle('is-disabled', !printer.supportsColor);
  refs.qualityControl.classList.toggle(
    'is-disabled',
    !(printer.qualities?.length > 1),
  );
  refs.sidesControl.classList.toggle('is-disabled', !printer.supportsDuplex);
}

function parsePageRangeClient(input, pageCount) {
  const raw = normalizeDashes(input).trim();
  if (!raw || raw.toLowerCase() === 'all') {
    return {
      ok: true,
      indices: Array.from({ length: pageCount }, (_, index) => index),
      label: `All ${plural(pageCount, 'page')}`,
    };
  }
  if (raw.length > 160) {
    return { ok: false, error: 'That page range is too long.' };
  }

  const selected = new Set();
  const tokens = raw.split(',');
  if (tokens.length > 60) {
    return { ok: false, error: 'That page range is too long.' };
  }

  for (const tokenRaw of tokens) {
    const token = tokenRaw.trim();
    if (!token) continue;
    const match = token.match(/^(\d+)?\s*-\s*(\d+)?$/);
    const single = token.match(/^(\d+)$/);
    if (!match && !single) {
      return { ok: false, error: 'Use page numbers and ranges, like 1-3, 5.' };
    }
    const start = single ? Number(single[1]) : Number(match[1] ?? 1);
    const end = single ? Number(single[1]) : Number(match[2] ?? pageCount);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1 ||
      end < 1 ||
      start > pageCount ||
      end > pageCount
    ) {
      return { ok: false, error: `Pages must be between 1 and ${pageCount}.` };
    }
    if (start > end) {
      return { ok: false, error: 'Page ranges need to run lowest to highest.' };
    }
    for (let page = start; page <= end; page += 1) selected.add(page - 1);
  }

  if (selected.size === 0) {
    return { ok: false, error: 'Choose at least one page to print.' };
  }

  const indices = [...selected].sort((left, right) => left - right);
  return {
    ok: true,
    indices,
    label:
      indices.length === pageCount
        ? `All ${plural(pageCount, 'page')}`
        : `${plural(indices.length, 'selected page')}`,
  };
}

function currentRange() {
  if (!state.job) return { ok: false, error: 'No document is ready.' };
  if (state.rangeMode !== 'custom') {
    return parsePageRangeClient('all', state.job.pages);
  }
  if (!normalizeDashes(refs.rangeInput.value).trim()) {
    return {
      ok: false,
      error: 'Add page numbers, like 1-3, or choose all pages.',
    };
  }
  return parsePageRangeClient(refs.rangeInput.value, state.job.pages);
}

function getPaper(printer, paperId) {
  return (
    printer?.papers?.find((paper) => paper.id === paperId) ??
    printer?.papers?.[0] ??
    null
  );
}

function resolvedLandscape(printer) {
  if (!state.settings || !state.job) return false;
  if (state.settings.orientation === 'landscape') return true;
  if (state.settings.orientation === 'portrait') return false;
  const range = currentRange();
  const firstIndex = range.ok ? range.indices[0] : 0;
  const page = state.job.pageSizes?.[firstIndex];
  if (page) return Boolean(page.landscape);
  return Boolean(state.job.firstPageLandscape);
}

function pagesLargerThanPaper(printer) {
  if (!state.job || !state.settings || !printer) return [];
  const paper = getPaper(printer, state.settings.paperId);
  if (!paper?.width || !paper?.height) return [];
  const range = currentRange();
  if (!range.ok) return [];

  const landscape = resolvedLandscape(printer);
  const longSide = Math.max(paper.width, paper.height);
  const shortSide = Math.min(paper.width, paper.height);
  const paperWidth = landscape ? longSide : shortSide;
  const paperHeight = landscape ? shortSide : longSide;
  const sizes = Array.isArray(state.job.pageSizes) ? state.job.pageSizes : [];

  return range.indices
    .filter((index) => {
      const size = sizes[index];
      if (!size) return false;
      // PDF page sizes are in points; printer paper sizes are in hundredths
      // of an inch. Convert the page to the same unit before comparing.
      const width = (size.width / 72) * 100;
      const height = (size.height / 72) * 100;
      return width > paperWidth + 2 || height > paperHeight + 2;
    })
    .map((index) => index + 1);
}

function updatePrintSummary() {
  const printer = getSelectedPrinter();
  const job = state.job;
  const settings = state.settings;
  const paywall = state.paywall;
  const paidRetry = paidRetryForCurrentJob();

  if (!printer || !job || !settings) {
    refs.printSummary.textContent = 'No printer connected';
    refs.sheetEstimate.textContent = '—';
    refs.sheetPrice.hidden = true;
    refs.printButton.disabled = true;
    refs.printButtonLabel.textContent = 'No printer available';
    refs.sheetQuota.textContent = `${state.quota.remainingPages} pages left today`;
    return;
  }

  const range = currentRange();
  const pages = range.ok ? range.indices.length : 0;
  const paper = getPaper(printer, settings.paperId);
  const paperName = paper?.name || 'Printer default';
  const colorLabel = settings.color ? 'Color' : 'B&W';
  const copyLabel = plural(settings.copies, 'copy', 'copies');
  const sides = settings.sides === 'one-sided' ? 1 : 2;
  const sheetsPerCopy = pages ? Math.max(1, Math.ceil(pages / sides)) : 0;
  const sheets = sheetsPerCopy * settings.copies;
  const pagesNeeded = pages * settings.copies;
  const remaining = Math.max(0, Number(state.quota.remainingPages) || 0);
  const overQuota = pagesNeeded > remaining;
  const pricing = pricingForPages(pagesNeeded);
  const paymentsBlocked = Boolean(
    paywall && pricing && pricing.amountPaise > 0 && !paywall.enabled,
  );

  if (!range.ok) {
    refs.printSummary.textContent = 'Check the page range';
    refs.sheetEstimate.textContent = '—';
  } else {
    refs.printSummary.textContent = `${paperName} · ${colorLabel} · ${copyLabel}`;
    refs.sheetEstimate.textContent = sheets
      ? `${sides === 2 ? '≈ ' : ''}${plural(sheets, 'sheet')}`
      : '—';
  }

  refs.sheetQuota.textContent = overQuota
    ? `That is ${plural(pagesNeeded, 'page')} — only ${remaining} left today.`
    : `${remaining} ${remaining === 1 ? 'page' : 'pages'} left today`;
  refs.sheetQuota.classList.toggle('is-over', overQuota);

  refs.sheetPrice.hidden = !paywall;
  refs.sheetPrice.classList.remove('is-paid', 'is-warning');
  if (paywall) {
    if (paidRetry) {
      refs.sheetPrice.textContent = 'Payment received · finish printing';
    } else if (!range.ok || pages < 1) {
      refs.sheetPrice.textContent = '—';
    } else if (paymentsBlocked) {
      refs.sheetPrice.textContent =
        'Paid printing is not set up yet · ask the owner';
      refs.sheetPrice.classList.add('is-warning');
    } else if (pricing.free) {
      refs.sheetPrice.textContent = 'Owner print · no charge';
    } else if (pricing.amountPaise > 0) {
      refs.sheetPrice.textContent =
        pricing.chargeable === 1 &&
        Number(paywall.minimumChargePaise) > Number(paywall.pricePerPagePaise)
          ? `${formatMoney(pricing.amountPaise)} minimum for one page · ${formatMoney(paywall.pricePerPagePaise)}/page after`
          : `${formatMoney(pricing.amountPaise)} · ${plural(pricing.chargeable, 'page')} at ${formatMoney(paywall.pricePerPagePaise)}`;
      refs.sheetPrice.classList.add('is-paid');
    } else {
      refs.sheetPrice.textContent = 'No charge';
    }
  }

  let label = 'Print document';
  if (state.submittingPrint) label = 'Sending…';
  else if (state.checkoutBusy) label = 'Opening payment…';
  else if (!printer.online) label = 'Printer not connected';
  else if (!range.ok) label = 'Check the page range';
  else if (overQuota) label = 'Over today’s allowance';
  else if (paymentsBlocked) label = 'Paid printing unavailable';
  else if (paidRetry) label = 'Finish paid print';
  else if (pricing && pricing.amountPaise > 0) {
    label = `Pay ${formatMoney(pricing.amountPaise)} & print`;
  } else if (pagesNeeded) {
    label = `Print ${plural(pagesNeeded, 'page')}`;
  }

  refs.printButtonLabel.textContent = label;
  refs.printButton.disabled =
    !range.ok ||
    pages < 1 ||
    !printer.online ||
    overQuota ||
    state.submittingPrint ||
    state.checkoutBusy ||
    paymentsBlocked;
  refs.printButton.classList.toggle(
    'is-busy',
    state.submittingPrint || state.checkoutBusy,
  );
}

function makeNotice(tone, title, body, action) {
  const notice = document.createElement('div');
  notice.className = `notice notice--${tone}`;

  const mark = document.createElement('span');
  mark.className = 'notice-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = tone === 'warn' ? '!' : 'i';

  const copy = document.createElement('div');
  copy.className = 'notice-copy';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = body;
  copy.append(heading, text);

  notice.append(mark, copy);

  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-button text-button--small notice-action';
    button.textContent = action.label;
    button.addEventListener('click', action.run);
    notice.append(button);
  }

  return notice;
}

function renderSheetWarnings() {
  refs.sheetWarnings.replaceChildren();
  if (!state.job) {
    refs.sheetWarnings.hidden = true;
    return;
  }

  const notices = [];
  const blankPages = Array.isArray(state.job.blankPages)
    ? state.job.blankPages
    : [];

  if (blankPages.length) {
    const pagesText =
      blankPages.length === 1
        ? `Page ${blankPages[0]} looks blank`
        : `Pages ${blankPages.join(', ')} look blank`;
    notices.push(
      makeNotice(
        'info',
        `${pagesText} in the original.`,
        'It will print as-is. That is often how the file was made, not a problem with the printer.',
        {
          label: 'View page',
          run: () => openPreview(blankPages[0]),
        },
      ),
    );
  }

  const printer = getSelectedPrinter();
  if (state.settings?.scale === 'actual' && printer) {
    const oversized = pagesLargerThanPaper(printer);
    if (oversized.length) {
      const pagesText =
        oversized.length === 1
          ? `Page ${oversized[0]} is larger than the paper`
          : `Pages ${oversized.join(', ')} are larger than the paper`;
      notices.push(
        makeNotice(
          'warn',
          `${pagesText} at actual size.`,
          'Some edges may be cropped. Fit to paper keeps the whole page.',
          {
            label: 'Use Fit to paper',
            run: () => {
              state.settings.scale = 'fit';
              syncPrintControls();
              updatePrintSummary();
              renderSheetWarnings();
            },
          },
        ),
      );
    }
  }

  const range = currentRange();
  if (range.ok && state.settings) {
    const pagesNeeded = range.indices.length * state.settings.copies;
    const remaining = Math.max(0, Number(state.quota.remainingPages) || 0);
    if (pagesNeeded > remaining) {
      notices.push(
        makeNotice(
          'warn',
          'This is more than today’s allowance.',
          `This job uses ${plural(pagesNeeded, 'page')}. You have ${remaining} left today. Try fewer copies, a shorter range, or come back tomorrow.`,
        ),
      );
    }
  }

  for (const notice of notices) refs.sheetWarnings.append(notice);
  refs.sheetWarnings.hidden = notices.length === 0;
}

function openPrintDialog(job) {
  if (!job) return;
  closeDialogById(refs.printerDialog);

  state.job = job;
  state.pendingJobId = job.id;
  state.rangeMode = 'all';
  state.submittingPrint = false;
  state.checkoutBusy = false;
  state.checkoutFailed = false;
  if (state.payment && state.payment.jobId !== job.id) state.payment = null;
  if (state.openOrder && state.openOrder.jobId !== job.id) {
    void cancelOpenOrder();
  }
  refs.rangeInput.value = '';
  refs.rangeError.textContent = '';
  refs.rangeInput.removeAttribute('aria-invalid');
  refs.sheetError.textContent = '';
  refs.sheetStep.textContent = '03';
  refs.moreSettings.open = false;
  refs.previewName.textContent = job.name || 'Document';
  const meta = [job.kind, plural(job.pages ?? 0, 'page')];
  const size = formatBytes(job.size);
  if (size) meta.push(size);
  refs.previewMeta.textContent = meta.filter(Boolean).join(' · ');

  refs.previewFallback.hidden = false;
  refs.previewImage.hidden = true;
  if (job.thumbUrl) {
    refs.previewImage.onload = () => {
      refs.previewImage.hidden = false;
      refs.previewFallback.hidden = true;
    };
    refs.previewImage.onerror = () => {
      refs.previewImage.hidden = true;
      refs.previewFallback.hidden = false;
    };
    refs.previewImage.src = `${job.thumbUrl}${job.thumbUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
  }

  state.settings = defaultSettings(getSelectedPrinter());
  buildPrintControls();
  updatePrintSummary();
  renderSheetWarnings();

  const printer = getSelectedPrinter();
  if (!printer) {
    refs.sheetError.textContent =
      'No printer is connected right now. Check that it is switched on, then try again.';
  } else if (!printer.online) {
    refs.sheetError.textContent =
      'The printer is not connected right now. Check that it is switched on, then try again.';
  }

  writeStorage(
    sessionStorage,
    STORAGE_KEYS.pendingJob,
    JSON.stringify({ id: job.id, at: Date.now() }),
  );

  refs.sheet.classList.remove('is-closing');
  refs.printDialog.querySelector('.sheet-body').scrollTop = 0;

  if (!refs.printDialog.open) refs.printDialog.showModal();
  updateBodyLock();
  window.setTimeout(() => refs.closeSheetButton.focus(), 60);
}

function closePrintDialog(immediate = false) {
  if (!refs.printDialog.open) {
    updateBodyLock();
    return;
  }

  if (!state.submittingPrint && !state.checkoutBusy && state.openOrder) {
    void cancelOpenOrder();
  }

  if (immediate) {
    if (state.closingSheet) {
      window.clearTimeout(state.closingSheet);
      state.closingSheet = null;
    }
    refs.sheet.classList.remove('is-closing');
    refs.printDialog.close();
    updateBodyLock();
    return;
  }
  if (state.closingSheet) return;

  refs.sheet.classList.add('is-closing');
  state.closingSheet = window.setTimeout(() => {
    state.closingSheet = null;
    refs.sheet.classList.remove('is-closing');
    if (refs.printDialog.open) refs.printDialog.close();
    updateBodyLock();
    if (!refs.main.hidden) refs.chooseFileButton.focus();
  }, 260);
}

function reopenPrintSheet() {
  if (!state.job) return;
  refs.sheet.classList.remove('is-closing');
  if (!refs.printDialog.open) refs.printDialog.showModal();
  updateBodyLock();
}

function stepCopies(direction) {
  if (!state.settings) return;
  const printer = getSelectedPrinter();
  const max = Math.max(1, Number(printer?.maxCopies) || 999);
  const current = Number(refs.copiesInput.value) || state.settings.copies;
  state.settings.copies = clamp(current + direction, 1, max);
  refs.copiesInput.value = String(state.settings.copies);
  syncPrintControls();
  updatePrintSummary();
  renderSheetWarnings();
}

function buildPrintBody() {
  const printer = getSelectedPrinter();
  if (!printer || !state.settings) return null;
  return {
    printerId: printer.id,
    copies: state.settings.copies,
    color: state.settings.color,
    quality: state.settings.quality,
    paperId: state.settings.paperId,
    orientation: state.settings.orientation,
    sides: state.settings.sides,
    scale: state.settings.scale,
    collate: state.settings.collate,
    sourceId: state.settings.sourceId,
    pageRange:
      state.rangeMode === 'custom'
        ? normalizeDashes(refs.rangeInput.value).trim() || 'all'
        : 'all',
  };
}

async function beginCheckout() {
  if (state.checkoutBusy || !state.job || !state.settings) return;

  const printer = getSelectedPrinter();
  if (!printer || !printer.online) {
    refs.sheetError.textContent =
      'The printer is not connected right now. Check that it is switched on, then try again.';
    return;
  }

  const range = currentRange();
  if (!range.ok) {
    refs.sheetError.textContent = range.error;
    return;
  }

  const body = buildPrintBody();
  if (!body) return;

  state.checkoutBusy = true;
  state.checkoutFailed = false;
  refs.sheetError.textContent = '';
  updatePrintSummary();

  try {
    const data = await api(
      `/api/jobs/${encodeURIComponent(state.job.id)}/payment-order`,
      { method: 'POST', body },
    );
    const payment = data?.payment;
    if (!payment?.orderId) {
      throw new Error('The payment could not be started. Try again.');
    }

    if (payment.paid) {
      state.checkoutBusy = false;
      state.openOrder = null;
      state.payment = {
        jobId: state.job.id,
        orderId: payment.orderId,
        amountPaise: payment.amountPaise,
      };
      updatePrintSummary();
      return submitPrint({ razorpay_order_id: payment.orderId });
    }

    state.openOrder = { orderId: payment.orderId, jobId: state.job.id };
    await loadRazorpayCheckout();
    openRazorpayCheckout(payment);
    state.checkoutBusy = false;
    updatePrintSummary();
  } catch (error) {
    state.checkoutBusy = false;
    reopenPrintSheet();
    if (isAuthenticatedError(error)) {
      showAuth('Please sign in again before paying.');
      return;
    }
    refs.sheetError.textContent = describeError(
      error,
      'Payments are unavailable right now. Try again in a moment.',
    );
    updatePrintSummary();
    if (error.status === 409 || error.status === 502 || error.status === 503) {
      toast(error.message, { error: true, duration: 6000 });
    }
  }
}

function openRazorpayCheckout(payment) {
  const jobId = state.job?.id;
  if (!jobId || !window.Razorpay) {
    throw new Error('The payment window could not be opened.');
  }

  const checkout = new window.Razorpay({
    key: payment.keyId,
    amount: payment.amountPaise,
    currency: payment.currency || 'INR',
    name: 'Margin',
    description: payment.description || 'Document printing',
    order_id: payment.orderId,
    prefill: payment.prefill || {},
    notes: { jobId },
    theme: { color: '#ef542f' },
    modal: {
      escape: true,
      confirm_close: true,
      ondismiss: () => {
        if (
          state.payment?.paymentId &&
          state.payment.orderId === payment.orderId
        ) {
          reopenPrintSheet();
          return;
        }
        const failed = state.checkoutFailed;
        state.checkoutFailed = false;
        state.openOrder = null;
        state.payment = null;
        void cancelPaymentOrder(payment.orderId);
        if (!failed) {
          refs.sheetError.textContent =
            'Payment cancelled. Nothing was charged.';
        }
        reopenPrintSheet();
        updatePrintSummary();
        void refreshQuota();
      },
    },
    handler: (response) => {
      if (
        !response?.razorpay_payment_id ||
        !response?.razorpay_signature
      ) {
        state.checkoutFailed = true;
        refs.sheetError.textContent =
          'The payment could not be confirmed. Try again.';
        updatePrintSummary();
        return;
      }
      state.openOrder = null;
      state.payment = {
        jobId,
        orderId: response.razorpay_order_id || payment.orderId,
        paymentId: response.razorpay_payment_id,
        signature: response.razorpay_signature,
        amountPaise: payment.amountPaise,
      };
      state.checkoutFailed = false;
      reopenPrintSheet();
      updatePrintSummary();
      void submitPrint({
        razorpay_order_id: state.payment.orderId,
        razorpay_payment_id: state.payment.paymentId,
        razorpay_signature: state.payment.signature,
      });
    },
  });

  checkout.on('payment.failed', () => {
    state.checkoutFailed = true;
    refs.sheetError.textContent =
      'The payment did not go through. You can try again.';
    updatePrintSummary();
  });

  // Razorpay Checkout renders above the page. The print sheet is a native
  // <dialog> in the browser's top layer, which would cover it, so close the
  // sheet without cancelling the order. It reopens when Checkout closes.
  if (refs.printDialog.open) {
    refs.printDialog.close();
    updateBodyLock();
  }
  checkout.open();
}

async function submitPrint(payment = null) {
  if (
    !state.job ||
    !state.settings ||
    state.submittingPrint ||
    state.checkoutBusy
  ) {
    return;
  }

  const printer = getSelectedPrinter();
  if (!printer) {
    refs.sheetError.textContent =
      'No printer is connected right now. Check that it is switched on, then try again.';
    return;
  }
  if (!printer.online) {
    refs.sheetError.textContent =
      'The printer is not connected right now. Check that it is switched on, then try again.';
    return;
  }

  const range = currentRange();
  if (!range.ok) {
    refs.sheetError.textContent = range.error;
    refs.rangeError.textContent = range.error;
    refs.rangeInput.setAttribute('aria-invalid', 'true');
    refs.moreSettings.open = true;
    refs.rangeInput.focus();
    return;
  }

  const body = buildPrintBody();
  if (!body) return;
  if (payment) Object.assign(body, payment);

  refs.sheetError.textContent = '';
  state.submittingPrint = true;
  updatePrintSummary();
  refs.printButton.disabled = true;

  try {
    const data = await api(`/api/jobs/${encodeURIComponent(state.job.id)}/print`, {
      method: 'POST',
      body,
    });

    state.submittingPrint = false;
    state.payment = null;
    state.openOrder = null;
    refs.printButton.classList.remove('is-busy');
    writeStorage(sessionStorage, STORAGE_KEYS.pendingJob, null);
    state.pendingJobId = null;
    closePrintDialog(true);
    showStatus(data.job?.id || state.job.id, null);
    void refreshQuota();
  } catch (error) {
    state.submittingPrint = false;
    refs.printButton.classList.remove('is-busy');
    if (isAuthenticatedError(error)) {
      showAuth('Please sign in again before sending the job.');
      return;
    }
    if (
      error.data?.code === 'PAYMENT_REQUIRED' ||
      error.data?.code === 'PAYMENT_IN_PROGRESS'
    ) {
      if (payment) {
        state.payment = null;
        refs.sheetError.textContent = describeError(
          error,
          'That payment could not be used. Try again.',
        );
        updatePrintSummary();
        return;
      }
      updatePrintSummary();
      return beginCheckout();
    }
    refs.sheetError.textContent = describeError(
      error,
      'The printer did not take the job. Try again.',
    );
    updatePrintSummary();
    if (error.status === 409 || error.status === 404) {
      toast(error.message, { error: true, duration: 6000 });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Page preview                                                        */
/* ------------------------------------------------------------------ */

function renderPreviewChrome() {
  const { page, pages, blankPages } = state.preview;
  refs.previewPageLabel.textContent = `Page ${page} of ${Math.max(1, pages)}`;
  refs.previewPrev.disabled = page <= 1;
  refs.previewNext.disabled = page >= pages;
  refs.previewPageBadge.hidden = !blankPages.includes(page);
}

function loadPreviewPage() {
  const job = state.job;
  if (!job) return;
  const { page } = state.preview;
  state.previewLoading = true;
  refs.previewPageImage.hidden = true;
  refs.previewPageFallback.hidden = false;
  refs.previewPageFallbackText.textContent = 'Loading the page…';
  refs.previewPageFallback.classList.remove('is-error');

  const image = refs.previewPageImage;
  image.onload = () => {
    if (state.preview.page !== page) return;
    state.previewLoading = false;
    image.hidden = false;
    refs.previewPageFallback.hidden = true;
  };
  image.onerror = () => {
    if (state.preview.page !== page) return;
    state.previewLoading = false;
    image.hidden = true;
    refs.previewPageFallback.hidden = false;
    refs.previewPageFallback.classList.add('is-error');
    refs.previewPageFallbackText.textContent =
      'That page could not be previewed. You can still print it.';
  };
  image.src = `/api/jobs/${encodeURIComponent(job.id)}/preview/${page}`;
}

function openPreview(page = 1) {
  if (!state.job?.pages) return;
  const pageNumber = clamp(
    Math.round(Number(page) || 1),
    1,
    state.job.pages,
  );
  state.preview = {
    jobId: state.job.id,
    page: pageNumber,
    pages: state.job.pages,
    blankPages: Array.isArray(state.job.blankPages)
      ? state.job.blankPages
      : [],
  };
  renderPreviewChrome();
  loadPreviewPage();
  if (!refs.previewDialog.open) refs.previewDialog.showModal();
  updateBodyLock();
  window.setTimeout(() => refs.closePreviewDialog.focus(), 40);
}

function stepPreview(direction) {
  if (!state.job?.pages) return;
  const next = clamp(state.preview.page + direction, 1, state.job.pages);
  if (next === state.preview.page) return;
  state.preview.page = next;
  renderPreviewChrome();
  loadPreviewPage();
}

/* ------------------------------------------------------------------ */
/* Status view                                                         */
/* ------------------------------------------------------------------ */

function setStep(element, mode) {
  element.classList.remove('is-active', 'is-done');
  if (mode) element.classList.add(`is-${mode}`);
}

function shortJobId(id) {
  return `Job ${String(id || '').slice(0, 4).toUpperCase() || '—'}`;
}

function showStatus(id, seed = null) {
  if (!id) return;
  closePrintDialog(true);
  closeDialogById(refs.previewDialog);
  state.statusJobId = id;
  state.statusJob = seed;
  state.statusNetworkErrors = 0;
  state.statusHistoryRefreshed = false;
  state.statusFinished = false;
  refs.statusView.hidden = false;
  refs.statusView.classList.remove('is-sent', 'is-error');
  refs.statusReceipt.hidden = true;
  refs.statusError.hidden = true;
  refs.statusActions.hidden = true;
  refs.statusProgressWrap.hidden = false;
  refs.statusTitle.innerHTML = 'Off to the <em>printer.</em>';
  refs.statusMessage.textContent = 'Checking with the print room…';
  refs.statusHint.textContent = 'Keep this page open while the pages are prepared.';
  refs.statusEyebrow.querySelector('span').textContent = 'Sending';
  refs.statusJobNumber.textContent = shortJobId(id);
  refs.statusProgressBar.style.width = '6%';
  refs.progressRail.setAttribute('aria-valuenow', '6');
  setStep(refs.stepFile, 'done');
  setStep(refs.stepPages, 'active');
  setStep(refs.stepPrinter, '');
  refs.printAnotherButton.querySelector('span').textContent = 'Print another';
  refs.printAnotherButton.dataset.retry = 'false';
  writeStorage(
    sessionStorage,
    STORAGE_KEYS.activeJob,
    JSON.stringify({ id, at: Date.now() }),
  );
  updateBodyLock();

  if (seed) renderStatus(seed);
  scheduleStatusPoll(120);
}

function renderStatus(job) {
  if (!job) return;
  state.statusJob = job;
  const status = job.status || 'queued';
  const progress = clamp(Number(job.progress) || 0, 0, 100);
  const isSent = status === 'sent';
  const isError = status === 'error';
  const isActive = ['queued', 'preparing', 'sending'].includes(status);

  refs.statusView.classList.toggle('is-sent', isSent);
  refs.statusView.classList.toggle('is-error', isError);
  refs.statusEyebrow.querySelector('span').textContent = isSent
    ? 'Sent'
    : isError
      ? 'Stopped'
      : 'Sending';
  refs.statusJobNumber.textContent = shortJobId(job.id || state.statusJobId);
  refs.statusProgressBar.style.width = `${Math.max(progress, isSent ? 100 : 4)}%`;
  refs.progressRail.setAttribute('aria-valuenow', String(progress));

  refs.statusTitle.innerHTML = isSent
    ? 'On its way to <em>paper.</em>'
    : isError
      ? 'The printer <em>paused.</em>'
      : 'Off to the <em>printer.</em>';

  if (isSent) {
    refs.statusMessage.textContent =
      'The printer has the job. It will take the pages from here.';
    refs.statusHint.textContent =
      'You can close this page. The job is already with the printer.';
  } else if (isError) {
    refs.statusMessage.textContent =
      'Your document stayed on the laptop. Nothing was lost.';
    refs.statusHint.textContent =
      'Check the printer, then try the file again or choose a new one.';
  } else {
    refs.statusMessage.textContent =
      job.message || 'Turning your file into pages.';
    refs.statusHint.textContent =
      'Keep this page open while the pages are prepared.';
  }

  if (status === 'sent') {
    setStep(refs.stepFile, 'done');
    setStep(refs.stepPages, 'done');
    setStep(refs.stepPrinter, 'done');
  } else if (status === 'sending') {
    setStep(refs.stepFile, 'done');
    setStep(refs.stepPages, 'done');
    setStep(refs.stepPrinter, 'active');
  } else if (status === 'error') {
    const failedAtPrinter = progress >= 72;
    setStep(refs.stepFile, 'done');
    setStep(refs.stepPages, failedAtPrinter ? 'done' : 'active');
    setStep(refs.stepPrinter, failedAtPrinter ? 'active' : '');
  } else {
    setStep(refs.stepFile, 'done');
    setStep(refs.stepPages, 'active');
    setStep(refs.stepPrinter, '');
  }

  refs.statusError.hidden = !isError;
  refs.statusErrorText.textContent = isError
    ? job.error || 'The printer did not take the job. Check the printer and try again.'
    : '';
  refs.statusReceipt.hidden = !isSent;
  refs.statusActions.hidden = !(isSent || isError);
  refs.statusProgressWrap.hidden = false;

  if (isSent) {
    const print = job.print || {};
    refs.receiptStatus.textContent = 'Sent';
    refs.receiptName.textContent = job.name || 'Document';
    refs.receiptMeta.textContent = print.pages
      ? `${plural(print.pages, 'page')}${print.range ? ` · ${print.range}` : ''}`
      : plural(job.pages || 0, 'page');
    refs.receiptCopies.textContent = String(print.copies ?? 1);
    refs.receiptColor.textContent = print.color ? 'Color' : 'B&W';
    refs.receiptQuality.textContent =
      print.qualityLabel || print.quality || 'Standard';
    refs.receiptPaper.textContent = print.paper || 'A4';
    refs.receiptPrinter.textContent = 'Your printer';
    refs.receiptTime.textContent = formatClock(job.sentAt);
  }

  const canRetry = Boolean(isError && job.canRetry);
  refs.printAnotherButton.dataset.retry = String(canRetry);
  refs.printAnotherButton.querySelector('span').textContent = canRetry
    ? 'Try this file again'
    : 'Print another';

  if (isSent || isError) {
    state.statusFinished = true;
    if (!state.statusHistoryRefreshed) {
      state.statusHistoryRefreshed = true;
      void loadHistory();
      if (isSent) void refreshQuota();
    }
    stopStatusPolling();
    writeStorage(sessionStorage, STORAGE_KEYS.activeJob, null);
  } else if (isActive) {
    updateBodyLock();
  }
}

function scheduleStatusPoll(delay = 800) {
  stopStatusPolling();
  if (!state.statusJobId) return;
  const id = state.statusJobId;
  state.statusTimer = window.setTimeout(() => {
    void fetchStatus(id);
  }, delay);
}

async function fetchStatus(id) {
  if (state.statusJobId !== id) return;
  try {
    const data = await api(`/api/jobs/${encodeURIComponent(id)}`);
    if (!data.job) {
      throw Object.assign(new Error('That job is no longer available.'), {
        status: 404,
      });
    }
    state.statusNetworkErrors = 0;
    renderStatus(data.job);
    if (['queued', 'preparing', 'sending'].includes(data.job.status)) {
      scheduleStatusPoll(800);
    }
  } catch (error) {
    if (state.statusJobId !== id) return;
    if (isAuthenticatedError(error)) {
      stopStatusPolling();
      showAuth('Please sign in again to check the job.');
      return;
    }
    if (error.status === 404) {
      renderStatus({
        id,
        name: state.statusJob?.name || 'Document',
        pages: state.statusJob?.pages || 0,
        status: 'error',
        progress: 100,
        error: 'This job is no longer in the print room. Choose the file again.',
        canRetry: false,
      });
      return;
    }

    state.statusNetworkErrors += 1;
    if (state.statusNetworkErrors >= 8) {
      renderStatus({
        ...(state.statusJob || {}),
        id,
        name: state.statusJob?.name || 'Document',
        status: 'error',
        progress: state.statusJob?.progress || 0,
        error:
          'Lost contact with the print room. The job may still be printing, so check the printer before sending it again.',
        canRetry: false,
      });
      return;
    }
    refs.statusMessage.textContent = 'The link blinked. Reconnecting…';
    scheduleStatusPoll(1200);
  }
}

function stopStatusPolling() {
  if (state.statusTimer) {
    window.clearTimeout(state.statusTimer);
    state.statusTimer = null;
  }
}

function returnHome({ openPicker = false } = {}) {
  stopStatusPolling();
  state.statusJobId = null;
  state.statusJob = null;
  state.statusFinished = false;
  refs.statusView.hidden = true;
  writeStorage(sessionStorage, STORAGE_KEYS.activeJob, null);
  updateBodyLock();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (openPicker) {
    window.setTimeout(() => refs.fileInput.click(), 180);
  } else {
    refs.chooseFileButton.focus();
  }
}

function handlePrintAnother() {
  const shouldRetry = refs.printAnotherButton.dataset.retry === 'true';
  const job = state.statusJob;
  returnHome();
  if (shouldRetry && job?.id) {
    window.setTimeout(() => openPrintDialog({ ...job, status: 'ready' }), 120);
  } else {
    window.setTimeout(() => refs.fileInput.click(), 180);
  }
}

/* ------------------------------------------------------------------ */
/* Access management                                                   */
/* ------------------------------------------------------------------ */

function showAdminSecret(label, secret, note) {
  state.adminSecret = secret;
  refs.adminSecretLabel.textContent = label;
  refs.adminSecretCode.textContent = secret;
  refs.adminSecretNote.textContent = note;
  refs.adminSecret.hidden = false;
}

async function copyAdminSecret() {
  if (!state.adminSecret) return;
  try {
    await navigator.clipboard.writeText(state.adminSecret);
    toast('Copied.');
  } catch {
    toast('Could not copy automatically. Select the code and copy it.', {
      error: true,
    });
  }
}

function adminChip(text, tone = '') {
  const chip = document.createElement('span');
  chip.className = `admin-chip${tone ? ` admin-chip--${tone}` : ''}`;
  chip.textContent = text;
  return chip;
}

function earningsMeta(pages, payments) {
  if (!payments) return 'No paid prints yet';
  return `${plural(pages, 'page')} · ${plural(payments, 'payment')}`;
}

function renderEarnings() {
  const earnings = state.admin.earnings;
  refs.earningsError.textContent = '';
  if (!earnings) {
    refs.earningsStatus.textContent = '';
    return;
  }

  const totals = earnings.totals ?? {};
  const month = earnings.month ?? {};
  const today = earnings.today ?? {};
  refs.earningsTotal.textContent = formatMoney(totals.amountPaise);
  refs.earningsTotalMeta.textContent = earningsMeta(
    totals.pages,
    totals.payments,
  );
  refs.earningsMonth.textContent = formatMoney(month.amountPaise);
  refs.earningsMonthMeta.textContent = earningsMeta(
    month.pages,
    month.payments,
  );
  refs.earningsToday.textContent = formatMoney(today.amountPaise);
  refs.earningsTodayMeta.textContent = earningsMeta(today.pages, today.payments);
  refs.earningsStatus.textContent = totals.payments ? 'Paid prints only' : '';
  refs.earningsAverage.textContent = totals.payments
    ? `${formatMoney(totals.averagePaise)} average per payment`
    : '';

  const series = Array.isArray(earnings.series) ? earnings.series : [];
  const max = Math.max(...series.map((point) => Number(point.amountPaise) || 0), 0);
  refs.earningsChart.replaceChildren();
  for (const point of series) {
    const amount = Number(point.amountPaise) || 0;
    const column = document.createElement('div');
    column.className = 'earnings-bar-col';

    const bar = document.createElement('span');
    bar.className = 'earnings-bar';
    if (!amount) bar.classList.add('is-empty');
    bar.style.height = `${max ? Math.max(5, Math.round((amount / max) * 100)) : 3}%`;
    bar.title = `${formatShortDate(`${point.date}T12:00:00`)} — ${formatMoney(amount)} · ${plural(Number(point.pages) || 0, 'page')}`;
    column.append(bar);

    const label = document.createElement('span');
    label.className = 'earnings-bar-label';
    label.textContent = String(Number(String(point.date).slice(-2)) || '');
    column.append(label);
    refs.earningsChart.append(column);
  }

  const recent = Array.isArray(earnings.recent) ? earnings.recent : [];
  refs.earningsRecent.replaceChildren();
  for (const payment of recent) {
    const item = document.createElement('li');
    item.className = 'admin-row earnings-row';

    const copy = document.createElement('div');
    copy.className = 'admin-row-copy';
    const title = document.createElement('strong');
    title.textContent = formatMoney(payment.amountPaise);
    const meta = document.createElement('span');
    meta.textContent = `${formatShortDate(payment.paidAt)} · ${plural(Number(payment.pages) || 0, 'page')} · ${payment.reference}`;
    copy.append(title, meta);

    const side = document.createElement('div');
    side.className = 'admin-row-side';
    side.append(
      adminChip(
        payment.status === 'consumed' ? 'Printed' : 'Paid',
        'open',
      ),
    );

    item.append(copy, side);
    refs.earningsRecent.append(item);
  }
  refs.earningsEmpty.hidden = recent.length > 0;
}

function renderAdmin() {
  const { users, invites } = state.admin;
  const openInvites = invites.filter(
    (invite) =>
      !invite.usedAt &&
      (!invite.expiresAt || new Date(invite.expiresAt).getTime() > Date.now()),
  );

  refs.inviteCount.textContent = openInvites.length
    ? `${openInvites.length} open`
    : '';
  refs.peopleCount.textContent = users.length
    ? String(users.length)
    : '';

  refs.inviteList.replaceChildren();
  for (const invite of invites.slice(0, 10)) {
    const expired =
      invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now();
    const used = Boolean(invite.usedAt);
    const statusText = used ? 'Used' : expired ? 'Expired' : 'Open';
    const tone = used ? 'muted' : expired ? 'muted' : 'open';

    const item = document.createElement('li');
    item.className = 'admin-row';

    const copy = document.createElement('div');
    copy.className = 'admin-row-copy';
    const title = document.createElement('strong');
    title.textContent = invite.note || 'Invitation';
    const meta = document.createElement('span');
    const parts = [`Created ${formatShortDate(invite.createdAt)}`];
    if (used) parts.push(`Used ${formatShortDate(invite.usedAt)}`);
    else if (expired) parts.push(`Expired ${formatShortDate(invite.expiresAt)}`);
    else parts.push(`Expires ${formatShortDate(invite.expiresAt)}`);
    meta.textContent = parts.filter(Boolean).join(' · ');
    copy.append(title, meta);

    const side = document.createElement('div');
    side.className = 'admin-row-side';
    side.append(adminChip(statusText, tone));

    if (!used && !expired) {
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'text-button text-button--small';
      revoke.textContent = 'Revoke';
      revoke.dataset.revokeInvite = invite.id;
      side.append(revoke);
    }

    item.append(copy, side);
    refs.inviteList.append(item);
  }
  refs.inviteEmpty.hidden = invites.length > 0;

  refs.userList.replaceChildren();
  for (const user of users) {
    const self = user.id === state.account?.id;
    const active = user.status === 'active';

    const item = document.createElement('li');
    item.className = 'admin-row admin-row--person';

    const avatar = document.createElement('span');
    avatar.className = 'account-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initialFor(user.name);

    const copy = document.createElement('div');
    copy.className = 'admin-row-copy';
    const title = document.createElement('strong');
    title.textContent = self ? `${user.name} (you)` : user.name;
    const meta = document.createElement('span');
    const role = user.role === 'admin' ? 'Owner' : 'Member';
    const last = user.lastLoginAt
      ? `Last in ${formatShortDate(user.lastLoginAt)}`
      : 'Not signed in yet';
    const metaParts = [role];
    if (self && user.email) metaParts.push(user.email);
    metaParts.push(last);
    meta.textContent = metaParts.join(' · ');
    copy.append(title, meta);

    const side = document.createElement('div');
    side.className = 'admin-row-side admin-row-side--actions';
    side.append(adminChip(active ? 'Active' : 'Disabled', active ? 'open' : 'muted'));

    if (!self) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'text-button text-button--small';
      toggle.textContent = active ? 'Disable' : 'Enable';
      toggle.dataset.toggleUser = user.id;
      toggle.dataset.nextStatus = active ? 'disabled' : 'active';
      toggle.dataset.userName = user.name;
      side.append(toggle);

      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'text-button text-button--small';
      reset.textContent = 'Reset password';
      reset.dataset.resetUser = user.id;
      reset.dataset.userName = user.name;
      side.append(reset);
    }

    item.append(avatar, copy, side);
    refs.userList.append(item);
  }
}

async function loadAdminEarnings() {
  try {
    const data = await api('/api/admin/earnings');
    state.admin.earnings = data.earnings ?? null;
    renderEarnings();
  } catch (error) {
    state.admin.earnings = null;
    renderEarnings();
    if (isAuthenticatedError(error)) {
      closeDialogById(refs.adminDialog);
      showAuth('Please sign in again to see earnings.');
      return;
    }
    refs.earningsError.textContent = describeError(
      error,
      'Earnings could not be loaded right now.',
    );
  }
}

async function loadAdmin({ quiet = false } = {}) {
  try {
    const data = await api('/api/admin/overview');
    state.admin = {
      ...state.admin,
      users: data.users ?? [],
      invites: data.invites ?? [],
      limits: data.limits ?? null,
    };
    renderAdmin();
    if (state.account?.role === 'admin') {
      await Promise.all([loadAdminPrinters(), loadAdminEarnings()]);
    }
  } catch (error) {
    if (isAuthenticatedError(error)) {
      closeDialogById(refs.adminDialog);
      showAuth('Please sign in again to open the owner dashboard.');
      return;
    }
    if (!quiet) {
      toast(describeError(error, 'Could not load the owner dashboard.'), {
        error: true,
      });
    }
  }
}

async function openAdminDialog() {
  if (state.account?.role !== 'admin') return;
  setAccountMenu(false);
  refs.inviteError.textContent = '';
  refs.adminSecret.hidden = true;
  state.adminSecret = '';
  if (!refs.adminDialog.open) refs.adminDialog.showModal();
  updateBodyLock();
  refs.inviteList.replaceChildren();
  refs.userList.replaceChildren();
  refs.inviteCount.textContent = '';
  refs.peopleCount.textContent = '';
  state.admin.earnings = null;
  refs.earningsStatus.textContent = 'Loading…';
  refs.earningsError.textContent = '';
  refs.earningsChart.replaceChildren();
  refs.earningsRecent.replaceChildren();
  refs.earningsEmpty.hidden = true;
  const loading = document.createElement('li');
  loading.className = 'admin-empty';
  loading.textContent = 'Loading…';
  refs.inviteList.append(loading);
  await loadAdmin();
  window.setTimeout(() => refs.inviteNote.focus(), 40);
}

async function handleCreateInvite(event) {
  event.preventDefault();
  if (state.inviteBusy) return;
  state.inviteBusy = true;
  refs.inviteError.textContent = '';
  setBusyButton(
    refs.createInviteButton,
    true,
    'Creating…',
    'Create invitation',
  );

  try {
    const data = await api('/api/admin/invites', {
      method: 'POST',
      body: {
        note: refs.inviteNote.value.trim(),
        expiresInDays: Number(refs.inviteDays.value) || 14,
      },
    });
    if (data.code) {
      const days = Number(refs.inviteDays.value) || 14;
      showAdminSecret(
        'New invitation code',
        data.code,
        `Share it privately. It works once and expires in ${plural(days, 'day')}.`,
      );
    }
    refs.inviteForm.reset();
    refs.inviteDays.value = '14';
    toast('Invitation created.');
    await loadAdmin({ quiet: true });
  } catch (error) {
    if (isAuthenticatedError(error)) {
      closeDialogById(refs.adminDialog);
      showAuth('Please sign in again to create an invitation.');
      return;
    }
    refs.inviteError.textContent = describeError(
      error,
      'That invitation could not be created. Try again.',
    );
  } finally {
    state.inviteBusy = false;
    setBusyButton(
      refs.createInviteButton,
      false,
      'Creating…',
      'Create invitation',
    );
  }
}

async function revokeInvite(id) {
  try {
    await api(`/api/admin/invites/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    toast('Invitation revoked.');
    await loadAdmin({ quiet: true });
  } catch (error) {
    toast(describeError(error, 'That invitation could not be revoked.'), {
      error: true,
    });
  }
}

async function toggleUserStatus(id, nextStatus, name) {
  if (nextStatus === 'disabled') {
    const sure = window.confirm(
      `Disable ${name}? They will be signed out and cannot print until you enable the account again.`,
    );
    if (!sure) return;
  }

  try {
    await api(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { status: nextStatus },
    });
    toast(nextStatus === 'disabled' ? 'Account disabled.' : 'Account enabled.');
    await loadAdmin({ quiet: true });
  } catch (error) {
    toast(describeError(error, 'That account could not be changed.'), {
      error: true,
    });
  }
}

async function resetUserPassword(id, name) {
  const sure = window.confirm(
    `Reset the password for ${name}? They will be signed out and given a temporary password.`,
  );
  if (!sure) return;

  try {
    const data = await api(
      `/api/admin/users/${encodeURIComponent(id)}/reset`,
      { method: 'POST' },
    );
    if (data.password) {
      showAdminSecret(
        `Temporary password for ${name}`,
        data.password,
        'Share it privately. They should change it from Account settings after signing in.',
      );
    }
    toast('Temporary password created.');
    await loadAdmin({ quiet: true });
  } catch (error) {
    toast(describeError(error, 'That password could not be reset.'), {
      error: true,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Admin printer management                                            */
/* ------------------------------------------------------------------ */

async function loadAdminPrinters({ refresh = false } = {}) {
  try {
    const url = refresh ? '/api/admin/printers?refresh=1' : '/api/admin/printers';
    const data = await api(url);
    state.admin.printers = data.printers ?? [];
    state.admin.selectedId = data.selectedId ?? null;
    renderAdminPrinters();
    if (data.selectionMissing && data.selectedName) {
      toast(
        `The selected printer "${data.selectedName}" is not currently connected.`,
        { error: true, duration: 6000 },
      );
    }
  } catch (error) {
    if (isAuthenticatedError(error)) return;
    toast(describeError(error, 'Could not load printers.'), { error: true });
  }
}

function renderAdminPrinters() {
  const printers = state.admin.printers;
  refs.adminPrinterList.replaceChildren();
  refs.adminPrinterEmpty.hidden = printers.length > 0;

  const selected = state.admin.selectedId;
  refs.adminPrinterStatus.textContent = printers.length
    ? `${printers.length} detected`
    : '';

  for (const printer of printers) {
    const isActive = printer.id === selected;
    const item = document.createElement('li');
    item.className = `admin-row admin-row--printer${isActive ? ' is-selected' : ''}`;

    const dot = document.createElement('span');
    dot.className = 'status-light';
    setStatusLight(dot, printer.online ? 'ready' : 'offline');
    dot.setAttribute('aria-hidden', 'true');

    const copy = document.createElement('div');
    copy.className = 'admin-row-copy';
    const title = document.createElement('strong');
    title.textContent = printer.name;
    const meta = document.createElement('span');
    const parts = [
      printer.transport,
      printer.online ? 'Connected' : 'Offline',
      printer.supportsColor ? 'Color' : 'B&W',
    ];
    if (printer.isDefault) parts.push('Windows default');
    meta.textContent = parts.join(' · ');
    copy.append(title, meta);

    const side = document.createElement('div');
    side.className = 'admin-row-side';

    if (isActive) {
      side.append(adminChip('Active for users', 'open'));
    }

    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'text-button text-button--small';
    selectButton.textContent = isActive ? 'Clear choice' : 'Use this printer';
    selectButton.dataset.selectPrinter = isActive ? '' : printer.id;
    side.append(selectButton);

    item.append(dot, copy, side);
    refs.adminPrinterList.append(item);
  }
}

async function selectAdminPrinter(printerId) {
  try {
    await api('/api/admin/printers/select', {
      method: 'POST',
      body: { printerId },
    });
    toast(
      printerId
        ? 'Printer selected for client-side use.'
        : 'Selection cleared (using system default).',
    );
    await loadAdminPrinters();
    await refreshPrinters();
  } catch (error) {
    if (isAuthenticatedError(error)) {
      closeDialogById(refs.adminDialog);
      showAuth('Please sign in again.');
      return;
    }
    toast(describeError(error, 'Could not set printer.'), { error: true });
  }
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function closeAllDialogs() {
  for (const dialog of document.querySelectorAll('dialog[open]')) {
    try {
      dialog.close();
    } catch {
      // A dialog can already be closing.
    }
  }
  refs.statusView.hidden = true;
  updateBodyLock();
}

function wireDialogDismissal(dialog, close) {
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener('close', updateBodyLock);
}

function wireEvents() {
  refs.authTabs.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-auth-mode]');
    if (!button) return;
    setAuthMode(button.dataset.authMode);
  });

  refs.loginForm.addEventListener('submit', (event) => {
    void handleLogin(event);
  });
  refs.registerForm.addEventListener('submit', (event) => {
    void handleRegister(event);
  });

  for (const input of [refs.loginEmail, refs.loginPassword]) {
    input.addEventListener('input', () => {
      refs.loginError.textContent = '';
    });
  }
  for (const input of [
    refs.registerName,
    refs.registerEmail,
    refs.registerInvite,
    refs.registerPassword,
    refs.registerConfirm,
  ]) {
    input.addEventListener('input', () => {
      refs.registerError.textContent = '';
    });
  }

  refs.chooseFileButton.addEventListener('click', () => {
    if (state.uploading) return;
    refs.fileInput.value = '';
    refs.fileInput.click();
  });

  refs.fileInput.addEventListener('change', () => {
    const file = refs.fileInput.files?.[0];
    if (file) void uploadFile(file);
  });

  refs.dropzone.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth += 1;
    if (!state.uploading) refs.dropzone.classList.add('is-dragging');
  });
  refs.dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  refs.dropzone.addEventListener('dragleave', (event) => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) refs.dropzone.classList.remove('is-dragging');
  });
  refs.dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    refs.dropzone.classList.remove('is-dragging');
    if (state.uploading) return;
    handleDroppedFiles(event.dataTransfer?.files);
  });

  for (const eventName of ['dragover', 'drop']) {
    window.addEventListener(eventName, (event) => {
      if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
    });
  }

  refs.printerPill.addEventListener('click', () => {
    renderPrinterDetails();
    if (!refs.printerDialog.open) refs.printerDialog.showModal();
    updateBodyLock();
  });
  refs.printerTicker.addEventListener('click', () => {
    renderPrinterDetails();
    if (!refs.printerDialog.open) refs.printerDialog.showModal();
    updateBodyLock();
  });
  refs.refreshPrintersButton.addEventListener('click', () => {
    void refreshPrinters();
  });
  wireDialogDismissal(refs.printerDialog, () => refs.printerDialog.close());

  refs.accountButton.addEventListener('click', () => {
    setAccountMenu(!state.menuOpen);
  });
  refs.quotaChip.addEventListener('click', () => {
    setAccountMenu(!state.menuOpen);
  });
  refs.openAccountButton.addEventListener('click', () => {
    openAccountDialog();
  });
  refs.openAdminButton.addEventListener('click', () => {
    void openAdminDialog();
  });
  refs.logoutButton.addEventListener('click', () => {
    void handleLogout();
  });

  document.addEventListener('click', (event) => {
    if (!state.menuOpen) return;
    if (!refs.accountMenuWrap.contains(event.target)) setAccountMenu(false);
  });

  refs.closeSheetButton.addEventListener('click', () => closePrintDialog());
  wireDialogDismissal(refs.printDialog, () => closePrintDialog());
  refs.changeFileButton.addEventListener('click', () => {
    writeStorage(sessionStorage, STORAGE_KEYS.pendingJob, null);
    state.pendingJobId = null;
    closePrintDialog();
    window.setTimeout(() => {
      refs.fileInput.value = '';
      refs.fileInput.click();
    }, 280);
  });
  refs.viewPagesButton.addEventListener('click', () => openPreview(1));

  refs.printerSelect.addEventListener('change', () => {
    selectPrinterById(refs.printerSelect.value);
  });

  refs.copiesDown.addEventListener('click', () => stepCopies(-1));
  refs.copiesUp.addEventListener('click', () => stepCopies(1));
  refs.copiesInput.addEventListener('input', () => {
    if (!state.settings) return;
    const value = Number(refs.copiesInput.value);
    if (Number.isFinite(value) && value >= 1) {
      const max = Math.max(1, Number(getSelectedPrinter()?.maxCopies) || 999);
      state.settings.copies = clamp(Math.round(value), 1, max);
      syncPrintControls();
      updatePrintSummary();
      renderSheetWarnings();
    }
  });
  refs.copiesInput.addEventListener('blur', () => {
    if (!state.settings) return;
    const value = Number(refs.copiesInput.value);
    state.settings.copies = Number.isFinite(value) && value >= 1 ? value : 1;
    syncPrintControls();
    updatePrintSummary();
    renderSheetWarnings();
  });

  refs.paperSelect.addEventListener('change', () => {
    if (!state.settings) return;
    state.settings.paperId = refs.paperSelect.value || null;
    syncPrintControls();
    updatePrintSummary();
    renderSheetWarnings();
  });

  refs.sourceSelect.addEventListener('change', () => {
    if (!state.settings) return;
    state.settings.sourceId = refs.sourceSelect.value || null;
    syncPrintControls();
    updatePrintSummary();
  });

  refs.collateInput.addEventListener('change', () => {
    if (!state.settings) return;
    state.settings.collate = refs.collateInput.checked;
    updatePrintSummary();
  });

  refs.rangeControl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-range]');
    if (!button) return;
    state.rangeMode = button.dataset.range === 'custom' ? 'custom' : 'all';
    refs.rangeCustomWrap.hidden = state.rangeMode !== 'custom';
    if (state.rangeMode === 'custom') {
      window.setTimeout(() => refs.rangeInput.focus(), 20);
    }
    syncPrintControls();
    updatePrintSummary();
    renderSheetWarnings();
  });

  refs.rangeInput.addEventListener('input', () => {
    const cleaned = refs.rangeInput.value.replace(
      /[^\d,\-\s\u2012\u2013\u2014\u2015]/g,
      '',
    );
    if (cleaned !== refs.rangeInput.value) refs.rangeInput.value = cleaned;
    const range = currentRange();
    if (range.ok) {
      refs.rangeError.textContent = '';
      refs.rangeInput.removeAttribute('aria-invalid');
    } else {
      refs.rangeError.textContent = range.error;
      refs.rangeInput.setAttribute('aria-invalid', 'true');
    }
    updatePrintSummary();
    renderSheetWarnings();
  });

  refs.printButton.addEventListener('click', () => {
    void submitPrint();
  });

  refs.closePreviewDialog.addEventListener('click', () =>
    refs.previewDialog.close(),
  );
  wireDialogDismissal(refs.previewDialog, () => refs.previewDialog.close());
  refs.previewPrev.addEventListener('click', () => stepPreview(-1));
  refs.previewNext.addEventListener('click', () => stepPreview(1));

  refs.closeAccountDialog.addEventListener('click', () =>
    refs.accountDialog.close(),
  );
  wireDialogDismissal(refs.accountDialog, () => refs.accountDialog.close());
  refs.passwordForm.addEventListener('submit', (event) => {
    void handlePasswordChange(event);
  });

  refs.closeAdminDialog.addEventListener('click', () =>
    refs.adminDialog.close(),
  );
  wireDialogDismissal(refs.adminDialog, () => refs.adminDialog.close());
  refs.inviteForm.addEventListener('submit', (event) => {
    void handleCreateInvite(event);
  });
  refs.copyAdminSecret.addEventListener('click', () => {
    void copyAdminSecret();
  });
  refs.inviteList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-revoke-invite]');
    if (!button) return;
    void revokeInvite(button.dataset.revokeInvite);
  });
  refs.userList.addEventListener('click', (event) => {
    const toggle = event.target.closest('button[data-toggle-user]');
    if (toggle) {
      void toggleUserStatus(
        toggle.dataset.toggleUser,
        toggle.dataset.nextStatus,
        toggle.dataset.userName,
      );
      return;
    }
    const reset = event.target.closest('button[data-reset-user]');
    if (reset) {
      void resetUserPassword(reset.dataset.resetUser, reset.dataset.userName);
    }
  });

  refs.adminPrinterList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-select-printer]');
    if (!button) return;
    void selectAdminPrinter(button.dataset.selectPrinter);
  });
  refs.adminRefreshPrinters.addEventListener('click', () => {
    void loadAdminPrinters({ refresh: true });
  });

  refs.refreshHistory.addEventListener('click', () => {
    void loadHistory({ notify: true });
  });

  refs.closeStatusButton.addEventListener('click', () => returnHome());
  refs.backHomeButton.addEventListener('click', () => returnHome());
  refs.printAnotherButton.addEventListener('click', handlePrintAnother);

  window.addEventListener('online', () => {
    updateConnectionLabel();
    toast('Back online.');
    if (!refs.main.hidden) void loadHistory();
  });
  window.addEventListener('offline', () => {
    updateConnectionLabel();
    toast('The connection dropped. The print room will wait.', {
      error: true,
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (
      document.visibilityState === 'visible' &&
      state.statusJobId &&
      !state.statusTimer &&
      !state.statusFinished
    ) {
      scheduleStatusPoll(200);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.menuOpen) {
      setAccountMenu(false);
      refs.accountButton.focus();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

async function start() {
  wireEvents();
  updateConnectionLabel();

  try {
    const auth = await api('/api/auth');
    state.app = {
      maxUploadMb: Number(auth.app?.maxUploadMb) || state.app.maxUploadMb,
      acceptedExtensions:
        Array.isArray(auth.app?.acceptedExtensions) &&
        auth.app.acceptedExtensions.length
          ? auth.app.acceptedExtensions
          : state.app.acceptedExtensions,
      openSignup: Boolean(auth.app?.openSignup),
    };
    if (!auth.authenticated) {
      showAuth();
      return;
    }
    await enterApp();
  } catch (error) {
    showAuth(
      error.network
        ? 'The print room is not answering right now. Check your connection and try again.'
        : describeError(error, 'The print room could not be opened.'),
      { focus: false },
    );
  } finally {
    hideBoot();
  }
}

void start();
