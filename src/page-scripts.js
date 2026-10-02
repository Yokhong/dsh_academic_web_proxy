/** Self-contained functions serialized into the CURRENT page; never read input values. */
export function inspectPage() {
  const visible = node => {
    if (!node || node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const text = (document.body?.innerText ?? '').slice(0, 24000);
  const title = document.title ?? '';
  const challengeText = /verify (?:that )?you are (?:a )?human|checking (?:your )?browser|checking if (?:the )?site connection is secure|performing security verification|just a moment|please complete the security check|unusual traffic|人机验证|验证您是真人|正在验证|机器人检测|安全验证/iu.test(`${title}\n${text}`);
  const challengeNode = [...document.querySelectorAll('#challenge-running,#challenge-stage,.cf-challenge,iframe[src*="challenges.cloudflare.com"],iframe[src*="hcaptcha.com"][title*="challenge"],iframe[src*="recaptcha"][title*="challenge"]')].some(visible);
  const password = [...document.querySelectorAll('input[type="password"],input[autocomplete="one-time-code"]')].some(visible);
  const loginHeading = /(?:^|\b)(?:sign in|log in|login|authentication required|institutional access|single sign.on)(?:\b|$)|统一身份认证|用户登录|用戶登入|身份验证|身份驗證/iu.test(`${title}\n${[...document.querySelectorAll('h1,h2,[role="heading"]')].map(n => n.textContent).join(' ')}`);
  const loginControls = [...document.querySelectorAll('form input:not([type="hidden"]),button,a,[role="button"]')].some(node => visible(node) && (node.matches('input') || /sign in|log in|login|continue|institution|登录|登入|继续|繼續/iu.test(node.textContent ?? '')));
  const article = document.querySelector('article,[class*="abstract"],[id="abstract"]');
  let kind = 'ready';
  if (challengeNode || challengeText && text.length < 18000) kind = 'challenge';
  else if (password || loginHeading && loginControls && !article) kind = 'login';
  return { url: location.href, title, kind, readyState: document.readyState };
}

/** Read real, visible DOM download controls. No URL construction or network fetch. */
export function findDownloadCandidates() {
  const candidates = [];
  function scan(root, prefix = '') {
    for (const node of root.querySelectorAll('a,button,[role="button"],input[type="button"],input[type="submit"]')) {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden' || node.disabled || node.getAttribute('aria-disabled') === 'true') continue;
      const label = [node.innerText, node.getAttribute('aria-label'), node.getAttribute('title'), node.tagName === 'INPUT' ? node.getAttribute('value') : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 240);
      if (!/pdf|download|下载|下載|full.?text/iu.test(label)) continue;
      // A stable, exact selector built from the existing DOM, never a guessed URL.
      const path = [];
      let cursor = node;
      while (cursor && cursor.nodeType === 1) {
        if (cursor.id) { path.unshift(`#${CSS.escape(cursor.id)}`); break; }
        let segment = cursor.tagName.toLowerCase();
        const siblings = cursor.parentElement ? [...cursor.parentElement.children].filter(n => n.tagName === cursor.tagName) : [cursor];
        if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(cursor) + 1})`;
        path.unshift(segment); cursor = cursor.parentElement;
      }
      let score = /pdf/iu.test(label) ? 4 : 0;
      if (/download|下载|下載/iu.test(label)) score += 3;
      if (/full.?text|article|全文|论文|論文/iu.test(label)) score += 2;
      if (/supplement|supporting|citation|reference|export|附件|补充|補充|引用/iu.test(label)) score -= 10;
      if (score > 0) candidates.push({ label, selector: path.join(' > '), frame: prefix || null, score });
    }
  }
  scan(document);
  // Frame controls require the agent's semantic iframe-aware browser tools.
  // Returning a frame selector as a top-document selector would click the wrong node.
  const framesPresent = document.querySelectorAll('iframe,frame').length > 0;
  return { url: location.href, candidates: candidates.sort((a, b) => b.score - a.score).slice(0, 30), framesPresent };
}

export const INSPECT_PAGE_SCRIPT = `(${inspectPage.toString()})()`;
export const DOWNLOAD_CANDIDATES_SCRIPT = `(${findDownloadCandidates.toString()})()`;
