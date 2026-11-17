/* Margin — cookie notice and preferences. No trackers, no third-party code. */
(() => {
  const STORAGE_KEY = 'margin_cookie_choice_v1';
  let dialog = null;
  let banner = null;

  function readChoice() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function saveChoice() {
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // Storage can be unavailable in private modes. The notice still closes.
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function closeBanner() {
    if (!banner) return;
    banner.remove();
    banner = null;
  }

  function acceptEssential() {
    saveChoice();
    closeBanner();
    if (dialog?.open) dialog.close();
  }

  function buildDialog() {
    const modal = document.createElement('dialog');
    modal.className = 'cookie-dialog';
    modal.setAttribute('aria-labelledby', 'cookieDialogHeading');

    const inner = element('div', 'cookie-dialog-inner');
    const head = element('header', 'mini-dialog-head');
    const headCopy = element('div');
    headCopy.append(
      element('p', 'eyebrow', 'Privacy'),
      element('h2', 'cookie-dialog-title', 'Cookie settings.'),
    );
    headCopy.querySelector('p').id = 'cookieDialogEyebrow';
    headCopy.querySelector('h2').id = 'cookieDialogHeading';

    const close = element('button', 'icon-button', '');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close cookie settings');
    close.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';
    close.addEventListener('click', () => modal.close());
    head.append(headCopy, close);

    const lede = element(
      'p',
      'cookie-lede',
      'Margin uses the smallest set of cookies needed to run the print room. There are no analytics, advertising, or cross-site tracking cookies.',
    );

    const list = element('ul', 'cookie-list');
    const rows = [
      {
        title: 'Essential session',
        detail:
          'margin_session keeps you signed in. HttpOnly, SameSite=Lax, and removed when you sign out.',
        state: 'Always on',
      },
      {
        title: 'Browser storage',
        detail:
          'Your printer choice, an active job, and this cookie choice are kept in local or session storage — not in tracking cookies.',
        state: 'Always on',
      },
      {
        title: 'Payments',
        detail:
          'Razorpay may set its own cookies only after you open Checkout, to process the payment and prevent fraud. Razorpay’s policy applies.',
        state: 'On demand',
      },
      {
        title: 'Analytics & advertising',
        detail:
          'Margin does not load analytics, pixels, or advertising cookies, and does not sell data.',
        state: 'Not used',
      },
    ];

    for (const row of rows) {
      const item = element('li', 'cookie-row');
      const copy = element('div', 'cookie-row-copy');
      copy.append(
        element('strong', '', row.title),
        element('span', '', row.detail),
      );
      const chip = element('span', 'cookie-chip', row.state);
      item.append(copy, chip);
      list.append(item);
    }

    const note = element(
      'p',
      'mini-dialog-note',
      'Because Margin only uses essential storage, closing this panel is the same as choosing essential only. You can reopen it from any page footer.',
    );

    const actions = element('div', 'cookie-actions');
    const done = element('button', 'button button--ink', 'Save choice');
    done.type = 'button';
    done.addEventListener('click', acceptEssential);
    const policy = element('a', 'button button--outline', 'Read the cookie policy');
    policy.href = '/cookies.html';
    actions.append(done, policy);

    inner.append(head, lede, list, note, actions);
    modal.append(inner);
    document.body.append(modal);

    modal.addEventListener('close', () => {
      // A dialog close without saving still counts as an acknowledgement of an
      // essential-only setup, so the banner does not chase the visitor.
      saveChoice();
      closeBanner();
    });

    return modal;
  }

  function openSettings() {
    if (!dialog) dialog = buildDialog();
    closeBanner();
    if (!dialog.open) dialog.showModal();
  }

  function buildBanner() {
    const bar = element('aside', 'cookie-banner');
    bar.id = 'cookieBanner';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-labelledby', 'cookieBannerHeading');
    bar.setAttribute('aria-describedby', 'cookieBannerText');

    const copy = element('div', 'cookie-banner-copy');
    const heading = element('strong', '', 'A small cookie, nothing more.');
    heading.id = 'cookieBannerHeading';
    const text = element(
      'span',
      '',
      'Margin uses one essential cookie to keep you signed in. No analytics, advertising, or cross-site trackers.',
    );
    text.id = 'cookieBannerText';
    copy.append(heading, text);

    const actions = element('div', 'cookie-banner-actions');
    const details = element('button', 'text-button', 'Cookie details');
    details.type = 'button';
    details.addEventListener('click', openSettings);
    const accept = element('button', 'button button--ink cookie-accept', 'Got it');
    accept.type = 'button';
    accept.addEventListener('click', acceptEssential);
    actions.append(details, accept);

    bar.append(copy, actions);
    document.body.append(bar);
    return bar;
  }

  function boot() {
    window.marginOpenCookieSettings = openSettings;
    document
      .getElementById('openCookieSettings')
      ?.addEventListener('click', openSettings);
    if (!readChoice()) {
      banner = buildBanner();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
