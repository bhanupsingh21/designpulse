// ===== FLOWLYTICS - UI COMPONENTS & UTILITIES =====

const UI = (() => {
  'use strict';

  // ===== TOAST =====
  let toastContainer = null;

  function getToastContainer() {
    if (!toastContainer) {
      toastContainer = document.getElementById('toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
      }
    }
    return toastContainer;
  }

  function toast(message, type = 'info', duration = 3500) {
    const icons = { success: 'check_circle', error: 'cancel', info: 'info', warning: 'warning' };
    const container = getToastContainer();

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="material-symbols-outlined toast-icon" aria-hidden="true">${icons[type] || icons.info}</span><span>${message}</span>`;
    container.appendChild(el);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('show'));
    });

    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, duration);
  }

  // ===== MODAL =====
  let activeModal = null;

  function modal({ title, body, footer, onClose, size = 'md' }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="${size === 'lg' ? 'max-width:700px' : ''}">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="btn btn-ghost btn-icon" id="modal-close-btn" title="Close"><span class="material-symbols-outlined icon-sm" aria-hidden="true">close</span></button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    activeModal = overlay;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('visible'));
    });

    function close() {
      overlay.classList.remove('visible');
      setTimeout(() => {
        overlay.remove();
        document.body.style.overflow = '';
        activeModal = null;
        if (onClose) onClose();
      }, 250);
    }

    overlay.querySelector('#modal-close-btn').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    return { overlay, close, el: overlay.querySelector('.modal') };
  }

  // ===== CONFIRM MODAL =====
  function confirm(message, { title = 'Are you sure?', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
    return new Promise(resolve => {
      const m = modal({
        title,
        body: `<p style="color:var(--text-secondary);line-height:1.6">${message}</p>`,
        footer: `
          <button class="btn btn-secondary" id="modal-cancel">${cancelText}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm">${confirmText}</button>
        `
      });

      m.el.querySelector('#modal-cancel').addEventListener('click', () => { m.close(); resolve(false); });
      m.el.querySelector('#modal-confirm').addEventListener('click', () => { m.close(); resolve(true); });
    });
  }

  // ===== SPINNER =====
  function spinner() {
    const el = document.createElement('div');
    el.className = 'spinner';
    return el;
  }

  // ===== RENDER HELPERS =====
  function el(tag, attrs = {}, ...children) {
    const elem = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') elem.className = v;
      else if (k === 'style') elem.style.cssText = v;
      else if (k.startsWith('on')) elem.addEventListener(k.slice(2), v);
      else elem.setAttribute(k, v);
    });
    children.forEach(c => {
      if (typeof c === 'string') elem.insertAdjacentHTML('beforeend', c);
      else if (c) elem.appendChild(c);
    });
    return elem;
  }

  // ===== FORMAT HELPERS =====
  function formatDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  function formatTime(ms) {
    if (!ms) return '-';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}m ${s}s`;
  }

  function statusBadge(status) {
    const labels = { draft: 'Draft', published: 'Published', closed: 'Closed' };
    return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
  }

  function questionTypeLabel(type) {
    const map = {
      single_choice: 'Single Choice',
      multiple_choice: 'Multiple Choice',
      rating: 'Rating (1–5)',
      like_dislike: 'Like / Dislike',
      short_text: 'Short Text',
      long_text: 'Long Text',
      yes_no: 'Yes / No'
    };
    return map[type] || type;
  }

  // ===== NAVIGATE =====
  function navigate(href) {
    window.location.href = href;
  }

  // ===== GET URL PARAM =====
  function getParam(key) {
    return new URLSearchParams(window.location.search).get(key);
  }

  // ===== COPY TO CLIPBOARD =====
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    }
  }

  // ===== FLOW TRANSITION =====
  function showFlowTransition(flowNum, total, callback) {
    const overlay = document.createElement('div');
    overlay.className = 'flow-transition';
    overlay.innerHTML = `
      <div class="flow-transition-icon material-symbols-outlined icon-xl" aria-hidden="true">check_circle</div>
      <div class="flow-transition-text">Flow ${flowNum} complete!</div>
      <div class="flow-transition-sub">Moving to Flow ${flowNum + 1} of ${total}...</div>
    `;
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('show'));
    });

    setTimeout(() => {
      overlay.classList.remove('show');
      setTimeout(() => {
        overlay.remove();
        if (callback) callback();
      }, 500);
    }, 1800);
  }

  // ===== SIDEBAR NAV HIGHLIGHT =====
  function setActiveNav(id) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const active = document.getElementById(id);
    if (active) active.classList.add('active');
  }

  // ===== AUTOSAVE INDICATOR =====
  let saveTimeout = null;
  let unsavedBanner = null;

  function markUnsaved(saveFn) {
    if (!unsavedBanner) return;
    unsavedBanner.style.display = 'flex';
    clearTimeout(saveTimeout);
  }

  function markSaved() {
    if (!unsavedBanner) return;
    unsavedBanner.style.display = 'none';
  }

  function setUnsavedBanner(el) { unsavedBanner = el; }

  // ===== QUESTION TYPE OPTIONS =====
  const QUESTION_TYPES = [
    { value: 'rating',          label: 'Rating (1-5)',      icon: 'star' },
    { value: 'like_dislike',    label: 'Like / Dislike',    icon: 'thumb_up' },
    { value: 'single_choice',   label: 'Single Choice',     icon: 'radio_button_unchecked' },
    { value: 'multiple_choice', label: 'Multiple Choice',   icon: 'check_box_outline_blank' },
    { value: 'yes_no',          label: 'Yes / No',          icon: 'check_circle' },
    { value: 'short_text',      label: 'Short Text',        icon: 'edit' },
    { value: 'long_text',       label: 'Long Text',         icon: 'notes' },
  ];

  // ===== RENDER QUESTION FOR TESTER =====
  function renderQuestionForTester(question, existingAnswer = null) {
    const container = document.createElement('div');
    container.className = 'question-block';
    container.setAttribute('data-qid', question.id);

    const requiredStar = question.required ? '<span class="question-required-star">*</span>' : '';
    container.innerHTML = `<div class="question-text">${question.question_text}${requiredStar}</div>`;

    const answerEl = document.createElement('div');
    answerEl.className = 'answer-area';

    switch (question.question_type) {
      case 'rating': {
        const group = document.createElement('div');
        group.className = 'rating-group';
        for (let i = 1; i <= 5; i++) {
          const btn = document.createElement('button');
          btn.className = 'rating-btn' + (existingAnswer === String(i) ? ' selected' : '');
          btn.textContent = i;
          btn.setAttribute('data-value', i);
          btn.addEventListener('click', function() {
            group.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
          });
          group.appendChild(btn);
        }
        answerEl.appendChild(group);
        break;
      }

      case 'like_dislike': {
        const group = document.createElement('div');
        group.className = 'like-group';
        ['like', 'dislike'].forEach(val => {
          const btn = document.createElement('button');
          const isSelected = existingAnswer === val;
          btn.className = `like-btn${isSelected ? ` selected-${val}` : ''}`;
          btn.setAttribute('data-value', val);
          btn.innerHTML = `<span class="material-symbols-outlined btn-emoji" aria-hidden="true">${val === 'like' ? 'thumb_up' : 'thumb_down'}</span><span>${val === 'like' ? 'Like' : 'Dislike'}</span>`;
          btn.addEventListener('click', function() {
            group.querySelectorAll('.like-btn').forEach(b => b.classList.remove('selected-like','selected-dislike'));
            this.classList.add('selected-' + val);
          });
          group.appendChild(btn);
        });
        answerEl.appendChild(group);
        break;
      }

      case 'single_choice': {
        const group = document.createElement('div');
        group.className = 'choice-group';
        (question.options || ['Option A','Option B']).forEach(opt => {
          const row = document.createElement('div');
          const isSelected = existingAnswer === opt;
          row.className = 'choice-option' + (isSelected ? ' selected' : '');
          row.setAttribute('data-value', opt);
          row.innerHTML = `<span class="choice-indicator">${isSelected ? '<span class="material-symbols-outlined choice-indicator-check" aria-hidden="true">check</span>' : ''}</span><span>${opt}</span>`;
          row.addEventListener('click', function() {
            group.querySelectorAll('.choice-option').forEach(r => {
              r.classList.remove('selected');
              r.querySelector('.choice-indicator').innerHTML = '';
            });
            this.classList.add('selected');
            this.querySelector('.choice-indicator').innerHTML = '<span class="material-symbols-outlined choice-indicator-check" aria-hidden="true">check</span>';
          });
          group.appendChild(row);
        });
        answerEl.appendChild(group);
        break;
      }

      case 'multiple_choice': {
        const group = document.createElement('div');
        group.className = 'choice-group';
        const existingSelected = existingAnswer ? (Array.isArray(existingAnswer) ? existingAnswer : existingAnswer.split(', ')) : [];
        (question.options || ['Option A','Option B']).forEach(opt => {
          const row = document.createElement('div');
          const isSelected = existingSelected.includes(opt);
          row.className = 'choice-option' + (isSelected ? ' selected' : '');
          row.setAttribute('data-value', opt);
          row.innerHTML = `<span class="choice-indicator checkbox-indicator">${isSelected ? '<span class="material-symbols-outlined choice-indicator-check" aria-hidden="true">check</span>' : ''}</span><span>${opt}</span>`;
          row.setAttribute('data-multi', 'true');
          row.addEventListener('click', function() {
            this.classList.toggle('selected');
            const ind = this.querySelector('.choice-indicator');
            ind.innerHTML = this.classList.contains('selected') ? '<span class="material-symbols-outlined choice-indicator-check" aria-hidden="true">check</span>' : '';
          });
          group.appendChild(row);
        });
        answerEl.appendChild(group);
        break;
      }

      case 'yes_no': {
        const group = document.createElement('div');
        group.className = 'yesno-group';
        ['yes', 'no'].forEach(val => {
          const btn = document.createElement('button');
          btn.className = 'yesno-btn' + (existingAnswer === val ? ' selected' : '');
          btn.setAttribute('data-value', val);
          btn.textContent = val === 'yes' ? 'Yes' : 'No';
          btn.addEventListener('click', function() {
            group.querySelectorAll('.yesno-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
          });
          group.appendChild(btn);
        });
        answerEl.appendChild(group);
        break;
      }

      case 'short_text': {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'form-input';
        inp.placeholder = 'Your answer...';
        if (existingAnswer) inp.value = existingAnswer;
        answerEl.appendChild(inp);
        break;
      }

      case 'long_text': {
        const ta = document.createElement('textarea');
        ta.className = 'form-textarea';
        ta.placeholder = 'Share your thoughts...';
        ta.rows = 4;
        if (existingAnswer) ta.value = existingAnswer;
        answerEl.appendChild(ta);
        break;
      }

      default: {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'form-input';
        inp.placeholder = 'Your answer...';
        answerEl.appendChild(inp);
      }
    }

    container.appendChild(answerEl);
    return container;
  }

  // ===== GET ANSWER FROM RENDERED QUESTION =====
  function getAnswerFromQuestion(container) {
    const type = container.closest('[data-qid]')?.querySelector('.answer-area') ? null : null;
    const answerArea = container.querySelector('.answer-area');
    if (!answerArea) return null;

    // rating
    const selectedRating = answerArea.querySelector('.rating-btn.selected');
    if (selectedRating) return { text: selectedRating.getAttribute('data-value'), json: null };

    // like/dislike
    const selectedLike = answerArea.querySelector('.like-btn.selected-like, .like-btn.selected-dislike');
    if (selectedLike) return { text: selectedLike.getAttribute('data-value'), json: null };

    // yes/no
    const selectedYesNo = answerArea.querySelector('.yesno-btn.selected');
    if (selectedYesNo) return { text: selectedYesNo.getAttribute('data-value'), json: null };

    // single choice
    const selectedChoice = answerArea.querySelector('.choice-option.selected:not([data-multi])');
    if (selectedChoice && !answerArea.querySelector('[data-multi]')) {
      return { text: selectedChoice.getAttribute('data-value'), json: null };
    }

    // multiple choice
    const multiOptions = answerArea.querySelectorAll('.choice-option[data-multi]');
    if (multiOptions.length > 0) {
      const selected = [...multiOptions].filter(o => o.classList.contains('selected')).map(o => o.getAttribute('data-value'));
      return { text: selected.join(', '), json: selected };
    }

    // single choice (fallback check - look for selected without data-multi)
    const selectedSingle = answerArea.querySelector('.choice-option.selected');
    if (selectedSingle) return { text: selectedSingle.getAttribute('data-value'), json: null };

    // text
    const textarea = answerArea.querySelector('textarea');
    if (textarea) return { text: textarea.value.trim(), json: null };

    const input = answerArea.querySelector('input');
    if (input) return { text: input.value.trim(), json: null };

    return null;
  }

  // ===== RENDER CHART BAR =====
  function renderRatingChart(distribution) {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    const container = document.createElement('div');
    container.className = 'chart-bars';

    for (let i = 1; i <= 5; i++) {
      const count = distribution[String(i)] || 0;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      container.innerHTML += `
        <div class="chart-bar-row">
          <div class="chart-bar-label">${i} <span class="material-symbols-outlined icon-xs" aria-hidden="true">star</span></div>
          <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%"></div></div>
          <div class="chart-bar-count">${count}</div>
        </div>
      `;
    }
    return container;
  }

  // ===== ADMIN GUARD =====
  function requireAdmin() {
    if (!DTH.Auth.isLoggedIn()) {
      window.location.href = '../admin/login.html';
      return false;
    }
    return true;
  }

  return {
    toast, modal, confirm, spinner, el, navigate, getParam, copyToClipboard,
    showFlowTransition, setActiveNav, markUnsaved, markSaved, setUnsavedBanner,
    formatDate, formatTime, statusBadge, questionTypeLabel,
    QUESTION_TYPES, renderQuestionForTester, getAnswerFromQuestion, renderRatingChart,
    requireAdmin
  };
})();
