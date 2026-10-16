(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const state = { data: null, editions: [], edition: null, category: 'Alles', query: '', expandedArchive: false, lastFocus: null };
  const content = $('#news-content');
  const dialog = $('#article-dialog');
  let visualId = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function arrowIcon(className = '') {
    const icon = element('span', className);
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 15 15 5M5 5h10v10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return icon;
  }

  function asText(value) {
    if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(' ');
    return typeof value === 'string' ? value.trim() : '';
  }

  function safeUrl(value, allowRelative = false) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, window.location.href);
      if (!['https:', 'http:'].includes(url.protocol)) return null;
      if (!allowRelative && !/^https?:\/\//i.test(value)) return null;
      return url.href;
    } catch { return null; }
  }

  function getTimeZone() {
    const candidate = asText(state.data?.timeZone) || 'Europe/Amsterdam';
    try { new Intl.DateTimeFormat('nl-NL', { timeZone: candidate }).format(); return candidate; }
    catch { return 'Europe/Amsterdam'; }
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
    const date = parseDate(value);
    if (!date) return '';
    return new Intl.DateTimeFormat('nl-NL', { timeZone: getTimeZone(), ...options }).format(date);
  }

  function formatTime(value) {
    const date = parseDate(value);
    return date ? new Intl.DateTimeFormat('nl-NL', { timeZone: getTimeZone(), hour: '2-digit', minute: '2-digit' }).format(date) : '';
  }

  function articleCategory(article) { return asText(article.category) || 'AI-ontwikkelingen'; }
  function sourceName(article) { return asText(article.source?.name) || 'Oorspronkelijke bron'; }
  function readTime(article) {
    const words = [article.summary, article.importance, article.opportunity].map(asText).join(' ').split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
  }

  function visualMarkup(index) {
    const id = `v${++visualId}`;
    const scenes = [
      `<defs><linearGradient id="${id}" x1=".1" y1="0" x2=".8" y2="1"><stop stop-color="#fff"/><stop offset=".4" stop-color="#d0d9eb"/><stop offset=".75" stop-color="#9caec9"/><stop offset="1" stop-color="#e1e8ef"/></linearGradient><filter id="${id}s"><feGaussianBlur stdDeviation="5"/></filter></defs><ellipse cx="160" cy="200" rx="65" ry="8" fill="#7186a5" opacity=".15" filter="url(#${id}s)"/><path d="M160 19 244 67v96l-84 48-84-48V67Z" fill="url(#${id})"/><path d="m160 19 84 48-84 48-84-48Z" fill="#f0f4fb" opacity=".8"/><path d="m160 115 84-48v96l-84 48Z" fill="#879fbd" opacity=".38"/><path d="m76 67 84 48v96l-84-48Z" fill="#c6d2e3" opacity=".32"/><path d="m160 19 84 48v96l-84 48-84-48V67Z" fill="none" stroke="#fff" stroke-opacity=".7"/><path d="m76 67 84 48 84-48M160 115v96" fill="none" stroke="#fff" stroke-opacity=".65"/>`,
      `<defs><linearGradient id="${id}" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#f8f5ff"/><stop offset=".4" stop-color="#d8c5e5"/><stop offset=".72" stop-color="#a58abd"/><stop offset="1" stop-color="#ece3f3"/></linearGradient><filter id="${id}s"><feGaussianBlur stdDeviation="6"/></filter></defs><ellipse cx="160" cy="201" rx="64" ry="8" fill="#9681ac" opacity=".16" filter="url(#${id}s)"/><g fill="none" stroke="url(#${id})" stroke-width="22"><ellipse cx="160" cy="110" rx="66" ry="66" transform="rotate(-38 160 110) scale(1 .72) translate(0 42)"/><ellipse cx="160" cy="110" rx="66" ry="66" transform="rotate(38 160 110) scale(1 .72) translate(0 42)"/></g><ellipse cx="160" cy="110" rx="66" ry="66" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1" transform="rotate(-38 160 110) scale(1 .72) translate(0 42)"/>`,
      `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbfff1"/><stop offset=".5" stop-color="#b7c8a8"/><stop offset="1" stop-color="#7f9b85"/></linearGradient><filter id="${id}s"><feGaussianBlur stdDeviation="5"/></filter></defs><ellipse cx="160" cy="204" rx="72" ry="6" fill="#66846d" opacity=".18" filter="url(#${id}s)"/><g fill="url(#${id})" stroke="#eaf1e4" stroke-width=".6"><path d="m99 142 61 35 61-35v26l-61 35-61-35Z"/><path d="m99 142 61-35 61 35-61 35Z"/><path d="m99 105 61 35 61-35v25l-61 35-61-35Z"/><path d="m99 105 61-35 61 35-61 35Z"/><path d="m99 68 61 35 61-35v25l-61 35-61-35Z"/><path d="m99 68 61-35 61 35-61 35Z"/></g><path d="m160 33 61 35-61 35-61-35Z" fill="#eff4e8" opacity=".8"/>`,
      `<defs><radialGradient id="${id}" cx=".3" cy=".2" r=".9"><stop stop-color="#fff7e3"/><stop offset=".4" stop-color="#e9c698"/><stop offset=".75" stop-color="#b78964"/><stop offset="1" stop-color="#edd5b7"/></radialGradient><filter id="${id}s"><feGaussianBlur stdDeviation="7"/></filter></defs><ellipse cx="160" cy="205" rx="70" ry="7" fill="#967249" opacity=".18" filter="url(#${id}s)"/><circle cx="160" cy="110" r="81" fill="url(#${id})"/><g fill="none" stroke="#fff7e4" stroke-opacity=".42"><ellipse cx="160" cy="110" rx="81" ry="23" transform="rotate(-35 160 110)"/><ellipse cx="160" cy="110" rx="81" ry="45" transform="rotate(-35 160 110)"/><ellipse cx="160" cy="110" rx="81" ry="65" transform="rotate(-35 160 110)"/><circle cx="160" cy="110" r="81"/></g>`,
      `<defs><linearGradient id="${id}" x1=".1" y1=".1" x2=".8" y2="1"><stop stop-color="#f6ffff"/><stop offset=".35" stop-color="#b3d8d8"/><stop offset=".7" stop-color="#73a8af"/><stop offset="1" stop-color="#c0dddf"/></linearGradient><filter id="${id}s"><feGaussianBlur stdDeviation="5"/></filter></defs><ellipse cx="160" cy="205" rx="67" ry="7" fill="#568e93" opacity=".16" filter="url(#${id}s)"/><g stroke="#eaffff" stroke-width=".7" fill="url(#${id})"><rect x="119" y="35" width="83" height="146" rx="41.5" transform="rotate(38 160 108)"/><rect x="119" y="35" width="83" height="146" rx="41.5" transform="rotate(-38 160 108)"/></g><path d="M115 54c19-14 43-12 57 7l47 61" fill="none" stroke="#f4ffff" stroke-width="1.3" opacity=".6"/>`
    ];
    return `<svg viewBox="0 0 320 230" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${scenes[index % scenes.length]}</svg>`;
  }

  function createAbstractArt(article, index) {
    const visual = element('div', `visual visual-${index % 5}`);
    visual.setAttribute('aria-hidden', 'true');
    const symbol = element('div', 'visual-symbol');
    symbol.innerHTML = visualMarkup(index);
    visual.append(symbol, element('span', 'art-label', articleCategory(article).toLocaleUpperCase('nl-NL')), element('span', 'art-index', `O. / ${String(index + 1).padStart(2, '0')}`));
    return visual;
  }

  function createArt(article, index, eager = false) {
    const art = element('div', 'card-art');
    const imageUrl = safeUrl(article.image, true);
    if (imageUrl) {
      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = asText(article.imageAlt);
      img.loading = eager ? 'eager' : 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => art.replaceChildren(createAbstractArt(article, index)), { once: true });
      art.append(img);
    } else { art.append(createAbstractArt(article, index)); }
    return art;
  }

  function createCard(article, index, featured) {
    const card = element('article', `news-card${featured ? ' featured' : ''}`);
    const button = element('button', 'card-open');
    button.type = 'button';
    button.setAttribute('aria-label', `Lees: ${asText(article.title)}`);
    const body = element('div', 'card-content');
    const heading = element('h3', 'card-title', asText(article.title));
    const category = element('p', 'card-category', articleCategory(article));
    const newsDate = article.newsDate || article.publishedAt || state.edition.date;
    const dateText = formatDate(newsDate, { day: 'numeric', month: 'short', year: 'numeric' });
    if (dateText) {
      const date = element('time', 'card-news-date', dateText);
      date.dateTime = newsDate;
      date.title = `Datum nieuwsbericht: ${formatDate(newsDate)}`;
      category.append(date);
    }
    body.append(category, heading, element('p', 'card-summary', asText(article.summary)));
    const bottom = element('div', 'card-bottom');
    const source = element('span', 'card-source');
    source.append(element('span', '', sourceName(article)), element('span', 'card-source-dot'), element('span', '', `${readTime(article)} min lezen`));
    const arrow = arrowIcon('round-arrow');
    bottom.append(source, arrow);
    body.append(bottom);
    button.append(createArt(article, index, featured), body);
    button.addEventListener('click', () => openArticle(article, index, button));
    card.append(button);
    return card;
  }

  function renderArticles() {
    content.setAttribute('aria-busy', 'false');
    if (!state.edition) return;
    const all = state.edition.articles;
    const search = state.query.trim().toLocaleLowerCase('nl-NL');
    const articles = all.filter((article) => {
      const categoryMatch = state.category === 'Alles' || articleCategory(article) === state.category;
      const haystack = [article.title, article.summary, article.category, article.importance, article.opportunity, sourceName(article)].map(asText).join(' ').toLocaleLowerCase('nl-NL');
      return categoryMatch && (!search || haystack.includes(search));
    });
    $('#article-count').textContent = `${articles.length} ${articles.length === 1 ? 'verhaal' : 'verhalen'}`;
    if (!articles.length) {
      const empty = element('div', 'no-results');
      empty.append(element('h3', '', 'Nog niet gevonden.'), element('p', '', 'Probeer een ander onderwerp of bekijk de hele editie.'));
      const reset = element('button', 'reset-button', 'Bekijk alle verhalen');
      reset.type = 'button';
      reset.addEventListener('click', () => { state.query = ''; state.category = 'Alles'; $('#search-input').value = ''; renderFilters(); renderArticles(); });
      empty.append(reset);
      content.replaceChildren(empty);
      return;
    }
    const grid = element('div', 'article-grid');
    articles.forEach((article, position) => grid.append(createCard(article, all.indexOf(article), position === 0 && state.category === 'Alles' && !search)));
    content.replaceChildren(grid);
  }

  function renderFilters() {
    const container = $('#category-filters');
    const categories = ['Alles', ...new Set(state.edition.articles.map(articleCategory))];
    container.replaceChildren();
    for (const category of categories) {
      const button = element('button', 'category-button', category);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(state.category === category));
      button.addEventListener('click', () => {
        state.category = category;
        for (const item of container.children) item.setAttribute('aria-pressed', String(item === button));
        renderArticles();
      });
      container.append(button);
    }
    $('#filter-bar').hidden = false;
  }

  function selectEdition(date, scroll = false) {
    state.edition = state.editions.find((edition) => edition.date === date) || state.editions[0];
    if (!state.edition) return;
    state.category = 'Alles';
    state.query = '';
    $('#search-input').value = '';
    $('#edition-select').value = state.edition.date;
    const time = formatTime(state.edition.publishedAt);
    $('#edition-update').textContent = time ? `Gepubliceerd om ${time}` : 'Dagelijkse AI-briefing';
    renderFilters();
    renderArticles();
    if (scroll) $('#nieuws').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderEditionSelect() {
    const select = $('#edition-select');
    select.replaceChildren();
    for (const edition of state.editions) {
      const option = element('option', '', formatDate(edition.date, { weekday: 'long', day: 'numeric', month: 'long' }));
      option.value = edition.date;
      select.append(option);
    }
    select.disabled = false;
  }

  function renderArchive() {
    const archive = $('#archive-content');
    const olderEditions = state.editions.slice(1);
    if (!olderEditions.length) {
      archive.replaceChildren(element('p', 'archive-empty', state.editions.length ? 'De eerste editie is er. Volgende edities verschijnen hier elke ochtend.' : 'Eerdere edities verschijnen hier zodra ze beschikbaar zijn.'));
      return;
    }
    const list = element('div', 'archive-list');
    const visible = state.expandedArchive ? olderEditions : olderEditions.slice(0, 5);
    for (const edition of visible) {
      const row = element('button', 'archive-row');
      row.type = 'button';
      row.setAttribute('aria-label', `Bekijk de editie van ${formatDate(edition.date)}`);
      row.append(element('span', 'archive-day', formatDate(edition.date, { day: '2-digit' })));
      const date = element('span', 'archive-date');
      date.append(element('strong', '', formatDate(edition.date, { weekday: 'long' })), element('span', '', formatDate(edition.date, { day: 'numeric', month: 'long', year: 'numeric' })));
      row.append(date, element('span', 'archive-headline', asText(edition.articles[0]?.title)), element('span', 'archive-count', `${edition.articles.length} ${edition.articles.length === 1 ? 'verhaal' : 'verhalen'}`));
      const arrow = arrowIcon('round-arrow');
      row.append(arrow);
      row.addEventListener('click', () => selectEdition(edition.date, true));
      list.append(row);
    }
    archive.replaceChildren(list);
    if (olderEditions.length > 5) {
      const expand = element('button', 'archive-expand', state.expandedArchive ? 'Toon minder edities ↑' : `Bekijk alle ${olderEditions.length} edities ↓`);
      expand.type = 'button';
      expand.addEventListener('click', () => { state.expandedArchive = !state.expandedArchive; renderArchive(); });
      archive.append(expand);
    }
  }

  function normalizeStatus(value) {
    const original = asText(value);
    const status = original.toLocaleLowerCase('nl-NL');
    if (['beschikbaar', 'available', 'released', 'live'].includes(status)) return { label: 'Beschikbaar', className: '' };
    if (['aangekondigd', 'announced', 'announcement'].includes(status)) return { label: 'Aangekondigd', className: 'status-announced' };
    if (['onzeker', 'uncertain', 'unconfirmed', 'rumor', 'rumour'].includes(status)) return { label: 'Onzeker', className: 'status-uncertain' };
    return original ? { label: original, className: 'status-uncertain' } : null;
  }

  function openArticle(article, index, trigger) {
    state.lastFocus = trigger;
    const wrapper = element('article', 'dialog-article');
    const title = element('h2', '', asText(article.title));
    title.id = 'dialog-title';
    wrapper.append(element('p', 'card-category', articleCategory(article)), title);
    const meta = element('div', 'dialog-meta');
    meta.append(element('span', '', sourceName(article)));
    const date = formatDate(article.newsDate || article.publishedAt || state.edition.date);
    if (date) meta.append(element('span', 'card-source-dot'), element('span', '', date));
    const status = normalizeStatus(article.status);
    if (status) meta.append(element('span', `status-badge ${status.className}`, status.label));
    wrapper.append(meta);
    const art = element('div', 'dialog-art');
    art.append(createArt(article, index, true));
    wrapper.append(art, element('p', 'dialog-summary', asText(article.summary)));
    for (const [key, heading] of [['importance', 'Waarom dit ertoe doet'], ['opportunity', 'Een kans voor de praktijk']]) {
      if (!asText(article[key])) continue;
      const section = element('section', 'detail-section');
      section.append(element('h3', '', heading), element('p', '', asText(article[key])));
      wrapper.append(section);
    }
    const url = safeUrl(article.source?.url);
    if (url) {
      const source = element('a', 'source-link');
      source.href = url;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      const sourceText = element('span');
      sourceText.append(element('small', '', 'LEES VERDER BIJ DE BRON'), element('strong', '', sourceName(article)));
      const arrow = arrowIcon('source-arrow');
      source.append(sourceText, arrow);
      source.setAttribute('aria-label', `Lees het oorspronkelijke bericht bij ${sourceName(article)} (opent in een nieuw tabblad)`);
      wrapper.append(source);
    }
    wrapper.append(element('p', 'dialog-disclaimer', 'Deze briefing is automatisch samengesteld. De oorspronkelijke bron geeft de volledige context. Controleer belangrijke details voordat je ermee aan de slag gaat.'));
    $('#dialog-content').replaceChildren(wrapper);
    document.body.classList.add('body-dialog-open');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.scrollTop = 0;
    $('.dialog-close').focus({ preventScroll: true });
  }

  function closeArticle() {
    if (typeof dialog.close === 'function') dialog.close();
    else { dialog.removeAttribute('open'); restoreFocus(); }
  }

  function restoreFocus() {
    document.body.classList.remove('body-dialog-open');
    if (state.lastFocus?.isConnected) state.lastFocus.focus({ preventScroll: true });
  }

  function renderEmpty(failed = false) {
    const empty = element('div', 'empty-state');
    const copy = element('div', 'empty-copy');
    copy.append(element('p', 'eyebrow', failed ? 'DE BRIEFING IS EVEN ONDERWEG' : 'EEN HELDER BEGIN KOMT ERAAN'), element('h3', '', failed ? 'Even opnieuw proberen.' : 'Het nieuws wordt wakker.'), element('p', '', failed ? 'We kunnen de editie op dit moment niet ophalen. Probeer het over een moment opnieuw.' : 'De eerste AI-briefing verschijnt hier zodra deze is samengesteld. Vijf belangrijke ontwikkelingen, elke ochtend om 08:00 uur.'));
    if (failed) {
      const retry = element('button', 'retry-button', 'Opnieuw ophalen');
      retry.type = 'button';
      retry.addEventListener('click', loadData);
      copy.append(retry);
    }
    const art = element('div', 'empty-art');
    art.setAttribute('aria-hidden', 'true');
    art.append(element('div', 'rising-sun'), element('div', 'horizon'), element('div', 'sun-mask'), element('span', 'horizon-caption', 'MORGEN BEGINT VANDAAG.'));
    empty.append(copy, art);
    content.replaceChildren(empty);
    content.setAttribute('aria-busy', 'false');
    $('#filter-bar').hidden = true;
    $('#edition-select').replaceChildren(element('option', '', 'Nog geen editie beschikbaar'));
    $('#edition-select').disabled = true;
    $('#edition-update').textContent = 'Elke ochtend om 08:00 · Amsterdam';
  }

  async function loadData() {
    content.setAttribute('aria-busy', 'true');
    try {
      const embedded = $('#edition-data[type="application/json"]');
      if (embedded) state.data = JSON.parse(embedded.textContent);
      else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch('data/editions.json', { cache: 'no-cache', signal: controller.signal });
          if (!response.ok) throw new Error(`Editie niet beschikbaar: ${response.status}`);
          state.data = await response.json();
        } finally { clearTimeout(timer); }
      }
      if (!state.data || !Array.isArray(state.data.editions)) throw new Error('Ongeldige editiegegevens.');
      state.editions = state.data.editions
        .filter((edition) => /^\d{4}-\d{2}-\d{2}$/.test(edition.date) && parseDate(edition.date) && Array.isArray(edition.articles))
        .map((edition) => ({ ...edition, articles: edition.articles.filter((article) => article && asText(article.title) && asText(article.summary)) }))
        .filter((edition) => edition.articles.length)
        .sort((a, b) => b.date.localeCompare(a.date));
      const sourceNote = asText(state.data.sourceNote);
      $('#source-note').textContent = sourceNote;
      $('#source-note').hidden = !sourceNote;
      if (!state.editions.length) { renderEmpty(); renderArchive(); return; }
      renderEditionSelect();
      selectEdition(state.editions[0].date);
      renderArchive();
    } catch (error) {
      console.warn('Ochtend. kon de briefing niet laden:', error.message);
      renderEmpty(true);
    }
  }

  function toggleSearch(open) {
    const panel = $('#search-panel');
    const toggle = $('.search-toggle');
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) $('#search-input').focus();
    else toggle.focus();
  }

  $('.search-toggle').addEventListener('click', () => toggleSearch($('#search-panel').hidden));
  $('#close-search').addEventListener('click', () => toggleSearch(false));
  $('#search-input').addEventListener('input', (event) => { state.query = event.target.value; if (state.edition) renderArticles(); });
  $('#search-input').addEventListener('keydown', (event) => { if (event.key === 'Escape') toggleSearch(false); });
  $('#edition-select').addEventListener('change', (event) => selectEdition(event.target.value));
  $('.dialog-close').addEventListener('click', closeArticle);
  dialog.addEventListener('close', restoreFocus);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeArticle(); } });
  loadData();
})();
