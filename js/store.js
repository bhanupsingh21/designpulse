// ===== DESIGNPULSE - DATA STORE (Supabase-backed) =====
// Every function here talks to a real Supabase project over its REST + Auth
// APIs. All Studies/Sessions/Answers/FlowSubmissions/Analytics functions are
// async now (they return Promises) - callers must use await/.then().

const DTH = (() => {
  'use strict';

  const SUPABASE_URL = 'https://rzantaponolgzelerjss.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_zLZV_tyKwoATgutTNVkkow_I3PfsL9g';
  const REST = SUPABASE_URL + '/rest/v1';
  const AUTH = SUPABASE_URL + '/auth/v1';

  const LOCAL_KEYS = {
    ADMIN_SESSION: 'dth_admin_session',
    CURRENT_SESSION: 'dth_current_session'
  };

  // ===== LOCAL (per-device) STORAGE HELPERS =====
  // Only used for: the admin's own login token, and "which test session is
  // this browser currently on" - both are legitimately per-device state, not
  // shared study/tester data.
  function loadLocal(key, def) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
    catch { return def; }
  }
  function saveLocal(key, data) {
    if (data === null || data === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(data));
  }

  function slugify(text) {
    return String(text || '').toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  function now() { return new Date().toISOString(); }

  // ===== REST REQUEST HELPER =====
  async function request(path, options = {}) {
    const session = loadLocal(LOCAL_KEYS.ADMIN_SESSION, null);
    const token = (session && session.access_token) ? session.access_token : SUPABASE_KEY;

    const res = await fetch(REST + path, {
      ...options,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    if (res.status === 401 && session) {
      // Admin token expired/invalid - drop the local session so isLoggedIn() reflects reality
      saveLocal(LOCAL_KEYS.ADMIN_SESSION, null);
    }

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch { /* ignore */ }
      throw new Error('Request failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
    }

    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // ===== ADMIN AUTH (real Supabase Auth) =====
  const Auth = {
    async login(email, password) {
      const res = await fetch(AUTH + '/token?grant_type=password', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.access_token) return false;
      saveLocal(LOCAL_KEYS.ADMIN_SESSION, {
        access_token: data.access_token,
        email: (data.user && data.user.email) || email
      });
      return true;
    },

    logout() {
      const session = loadLocal(LOCAL_KEYS.ADMIN_SESSION, null);
      saveLocal(LOCAL_KEYS.ADMIN_SESSION, null);
      if (session && session.access_token) {
        fetch(AUTH + '/logout', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + session.access_token }
        }).catch(() => {});
      }
    },

    isLoggedIn() {
      const session = loadLocal(LOCAL_KEYS.ADMIN_SESSION, null);
      return !!(session && session.access_token);
    },

    getAdmin() {
      const session = loadLocal(LOCAL_KEYS.ADMIN_SESSION, null);
      return session ? { email: session.email } : null;
    }
  };

  // ===== STUDIES (+ nested flows + questions via PostgREST embedding) =====
  const STUDY_SELECT = '*,flows(*,questions(*))';

  function normalizeStudy(row) {
    if (!row) return null;
    const flows = (row.flows || [])
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map(f => ({
        ...f,
        questions: (f.questions || []).slice().sort((a, b) => a.display_order - b.display_order)
      }));
    return { ...row, flows };
  }

  const Studies = {
    async getAll() {
      const rows = await request('/studies?select=' + STUDY_SELECT + '&order=created_at.desc');
      return (rows || []).map(normalizeStudy);
    },

    async getBySlug(slug) {
      const rows = await request('/studies?slug=eq.' + encodeURIComponent(slug) + '&select=' + STUDY_SELECT);
      return rows && rows[0] ? normalizeStudy(rows[0]) : null;
    },

    async getById(id) {
      const rows = await request('/studies?id=eq.' + encodeURIComponent(id) + '&select=' + STUDY_SELECT);
      return rows && rows[0] ? normalizeStudy(rows[0]) : null;
    },

    async create({ name, description, instructions, settings }) {
      let slug = slugify(name);
      let count = 1;
      // ensure unique slug
      // eslint-disable-next-line no-await-in-loop
      while (true) {
        const existing = await request('/studies?slug=eq.' + encodeURIComponent(slug) + '&select=id');
        if (!existing || existing.length === 0) break;
        slug = slugify(name) + '-' + (count++);
      }

      const body = {
        name,
        slug,
        description: description || '',
        instructions: instructions || '',
        status: 'draft',
        settings: {
          collectName: true,
          collectEmail: false,
          allowAnonymous: false,
          randomizeFlows: false,
          showProgress: true,
          allowBack: true,
          saveProgress: true,
          ...(settings || {})
        }
      };

      const rows = await request('/studies', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
      return { ...rows[0], flows: [] };
    },

    async update(id, updates) {
      const body = { ...updates, updated_at: now() };
      delete body.flows; // flows live in their own table now, never patched via studies
      const rows = await request('/studies?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
      return rows && rows[0] ? rows[0] : null;
    },

    async delete(id) {
      await request('/studies?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    },

    publish(id) { return this.update(id, { status: 'published' }); },
    close(id)   { return this.update(id, { status: 'closed' }); },
    unpublish(id) { return this.update(id, { status: 'draft' }); },

    // ===== FLOWS =====
    async addFlow(studyId, flowData) {
      const existing = await request('/flows?study_id=eq.' + encodeURIComponent(studyId) + '&select=id');
      if (existing && existing.length >= 10) return null;

      const body = {
        study_id: studyId,
        name: flowData.name || 'Untitled Flow',
        description: flowData.description || '',
        figma_url: flowData.figma_url || '',
        display_order: (existing ? existing.length : 0) + 1
      };
      const rows = await request('/flows', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
      return { ...rows[0], questions: [] };
    },

    async updateFlow(studyId, flowId, updates) {
      const body = { ...updates, updated_at: now() };
      delete body.questions; // questions live in their own table
      const rows = await request('/flows?id=eq.' + encodeURIComponent(flowId), {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
      return rows && rows[0] ? rows[0] : null;
    },

    async deleteFlow(studyId, flowId) {
      await request('/flows?id=eq.' + encodeURIComponent(flowId), { method: 'DELETE' });
      const remaining = await request('/flows?study_id=eq.' + encodeURIComponent(studyId) + '&select=id&order=display_order.asc');
      await Promise.all((remaining || []).map((f, i) =>
        request('/flows?id=eq.' + encodeURIComponent(f.id), {
          method: 'PATCH',
          body: JSON.stringify({ display_order: i + 1 })
        })
      ));
    },

    async duplicateFlow(studyId, flowId) {
      const rows = await request('/flows?id=eq.' + encodeURIComponent(flowId) + '&select=*,questions(*)');
      const flow = rows && rows[0];
      if (!flow) return null;

      const existing = await request('/flows?study_id=eq.' + encodeURIComponent(studyId) + '&select=id');
      const newFlowRows = await request('/flows', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          study_id: studyId,
          name: (flow.name || 'Untitled Flow') + ' (Copy)',
          description: flow.description || '',
          figma_url: flow.figma_url || '',
          display_order: (existing ? existing.length : 0) + 1
        })
      });
      const newFlow = newFlowRows[0];

      const questions = flow.questions || [];
      let newQuestions = [];
      if (questions.length) {
        newQuestions = await request('/questions', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(questions.map(q => ({
            flow_id: newFlow.id,
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options || [],
            required: q.required,
            display_order: q.display_order
          })))
        });
      }
      return { ...newFlow, questions: newQuestions };
    },

    async moveFlow(studyId, flowId, direction) {
      const flows = await request('/flows?study_id=eq.' + encodeURIComponent(studyId) + '&select=id,display_order&order=display_order.asc');
      const idx = flows.findIndex(f => f.id === flowId);
      const newIdx = idx + direction;
      if (idx === -1 || newIdx < 0 || newIdx >= flows.length) return;

      const a = flows[idx], b = flows[newIdx];
      await Promise.all([
        request('/flows?id=eq.' + encodeURIComponent(a.id), { method: 'PATCH', body: JSON.stringify({ display_order: b.display_order }) }),
        request('/flows?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', body: JSON.stringify({ display_order: a.display_order }) })
      ]);
    },

    // ===== QUESTIONS =====
    async addQuestion(studyId, flowId, qData) {
      const existing = await request('/questions?flow_id=eq.' + encodeURIComponent(flowId) + '&select=id');
      const body = {
        flow_id: flowId,
        question_text: qData.question_text || '',
        question_type: qData.question_type || 'short_text',
        options: qData.options || [],
        required: qData.required !== undefined ? qData.required : true,
        display_order: (existing ? existing.length : 0) + 1
      };
      const rows = await request('/questions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
      return rows[0];
    },

    async updateQuestion(studyId, flowId, questionId, updates) {
      const body = { ...updates, updated_at: now() };
      const rows = await request('/questions?id=eq.' + encodeURIComponent(questionId), {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
      return rows && rows[0] ? rows[0] : null;
    },

    async deleteQuestion(studyId, flowId, questionId) {
      await request('/questions?id=eq.' + encodeURIComponent(questionId), { method: 'DELETE' });
      const remaining = await request('/questions?flow_id=eq.' + encodeURIComponent(flowId) + '&select=id&order=display_order.asc');
      await Promise.all((remaining || []).map((q, i) =>
        request('/questions?id=eq.' + encodeURIComponent(q.id), {
          method: 'PATCH',
          body: JSON.stringify({ display_order: i + 1 })
        })
      ));
    },

    async duplicateQuestion(studyId, flowId, questionId) {
      const rows = await request('/questions?id=eq.' + encodeURIComponent(questionId));
      const q = rows && rows[0];
      if (!q) return null;
      const existing = await request('/questions?flow_id=eq.' + encodeURIComponent(flowId) + '&select=id');
      const newRows = await request('/questions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          flow_id: flowId,
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options || [],
          required: q.required,
          display_order: (existing ? existing.length : 0) + 1
        })
      });
      return newRows[0];
    }
  };

  // ===== TEST SESSIONS =====
  const Sessions = {
    async getById(id) {
      const rows = await request('/test_sessions?id=eq.' + encodeURIComponent(id));
      return rows && rows[0] ? rows[0] : null;
    },

    async getByStudy(studyId) {
      return (await request('/test_sessions?study_id=eq.' + encodeURIComponent(studyId))) || [];
    },

    async create({ studyId, testerName, testerEmail }) {
      const body = {
        study_id: studyId,
        tester_name: testerName || 'Anonymous',
        tester_email: testerEmail || '',
        status: 'in_progress',
        current_flow: 0
      };
      const rows = await request('/test_sessions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
      return rows[0];
    },

    async update(id, updates) {
      const rows = await request('/test_sessions?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(updates)
      });
      return rows && rows[0] ? rows[0] : null;
    },

    complete(id) {
      return this.update(id, { status: 'completed', completed_at: now() });
    },

    async delete(id) {
      // Cascades to that session's answers + flow_submissions (FK ON DELETE CASCADE).
      await request('/test_sessions?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    },

    // ===== per-device "which session am I on" tracking (kept local) =====
    async getCurrentSession(studyId) {
      const stored = loadLocal(LOCAL_KEYS.CURRENT_SESSION, {});
      const sessionId = stored[studyId];
      if (!sessionId) return null;
      const session = await this.getById(sessionId);
      if (!session || session.status === 'completed') return null;
      return session;
    },

    setCurrentSession(studyId, sessionId) {
      const stored = loadLocal(LOCAL_KEYS.CURRENT_SESSION, {});
      stored[studyId] = sessionId;
      saveLocal(LOCAL_KEYS.CURRENT_SESSION, stored);
    },

    clearCurrentSession(studyId) {
      const stored = loadLocal(LOCAL_KEYS.CURRENT_SESSION, {});
      delete stored[studyId];
      saveLocal(LOCAL_KEYS.CURRENT_SESSION, stored);
    }
  };

  // ===== ANSWERS =====
  const Answers = {
    async getBySession(sessionId) {
      return (await request('/answers?session_id=eq.' + encodeURIComponent(sessionId))) || [];
    },

    async getByFlowSession(flowId, sessionId) {
      return (await request(
        '/answers?flow_id=eq.' + encodeURIComponent(flowId) + '&session_id=eq.' + encodeURIComponent(sessionId)
      )) || [];
    },

    async upsert({ sessionId, studyId, flowId, questionId, answerText, answerJson }) {
      const body = {
        session_id: sessionId,
        study_id: studyId,
        flow_id: flowId,
        question_id: questionId,
        answer_text: answerText || '',
        answer_json: answerJson || null,
        updated_at: now()
      };
      // one answer per (session_id, question_id) - upsert on that unique constraint
      const rows = await request('/answers?on_conflict=session_id,question_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(body)
      });
      return rows[0];
    }
  };

  // ===== FLOW SUBMISSIONS =====
  const FlowSubmissions = {
    async getBySession(sessionId) {
      return (await request('/flow_submissions?session_id=eq.' + encodeURIComponent(sessionId))) || [];
    },

    async getAll() {
      return (await request('/flow_submissions?select=*')) || [];
    },

    async create({ sessionId, flowId }) {
      const body = {
        session_id: sessionId,
        flow_id: flowId,
        completed_at: now(),
        status: 'completed'
      };
      // one submission per (session_id, flow_id) - upsert on that unique constraint
      const rows = await request('/flow_submissions?on_conflict=session_id,flow_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(body)
      });
      return rows[0];
    }
  };

  // ===== ANALYTICS =====
  const Analytics = {
    async studyStats(studyId) {
      const sessions = await Sessions.getByStudy(studyId);
      const total = sessions.length;
      const completed = sessions.filter(s => s.status === 'completed').length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      const completedSessions = sessions.filter(s => s.completed_at && s.started_at);
      const avgTime = completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + (new Date(s.completed_at) - new Date(s.started_at)), 0) / completedSessions.length
        : 0;

      return { total, completed, incomplete: total - completed, completionRate, avgTimeMs: avgTime };
    },

    async flowStats(studyId, flowId) {
      const answers = (await request(
        '/answers?study_id=eq.' + encodeURIComponent(studyId) + '&flow_id=eq.' + encodeURIComponent(flowId)
      )) || [];
      const sessionIds = [...new Set(answers.map(a => a.session_id))];
      const responses = sessionIds.length;

      const ratingAnswers = answers.filter(a => {
        const num = parseFloat(a.answer_text);
        return !isNaN(num) && num >= 1 && num <= 5;
      });
      const avgRating = ratingAnswers.length > 0
        ? (ratingAnswers.reduce((sum, a) => sum + parseFloat(a.answer_text), 0) / ratingAnswers.length).toFixed(1)
        : null;

      const likeAnswers = answers.filter(a => a.answer_text === 'like' || a.answer_text === 'dislike');
      const likes = likeAnswers.filter(a => a.answer_text === 'like').length;
      const likePercent = likeAnswers.length > 0 ? Math.round((likes / likeAnswers.length) * 100) : null;

      return { responses, avgRating, likePercent };
    },

    async questionStats(flowId, questionId) {
      const answers = (await request(
        '/answers?flow_id=eq.' + encodeURIComponent(flowId) + '&question_id=eq.' + encodeURIComponent(questionId)
      )) || [];
      const distribution = {};
      answers.forEach(a => {
        const key = a.answer_text || 'No answer';
        distribution[key] = (distribution[key] || 0) + 1;
      });
      return { count: answers.length, distribution, answers };
    }
  };

  // ===== EXPORT =====
  async function exportCSV(studyId) {
    const study = await Studies.getById(studyId);
    if (!study) return '';

    const sessions = await Sessions.getByStudy(studyId);
    const allAnswers = (await request('/answers?study_id=eq.' + encodeURIComponent(studyId))) || [];

    const rows = [['Tester Name', 'Tester Email', 'Study', 'Flow', 'Question', 'Question Type', 'Answer', 'Timestamp']];

    sessions.forEach(session => {
      const sessionAnswers = allAnswers.filter(a => a.session_id === session.id);
      sessionAnswers.forEach(answer => {
        const flow = study.flows.find(f => f.id === answer.flow_id);
        const question = flow ? (flow.questions || []).find(q => q.id === answer.question_id) : null;
        rows.push([
          session.tester_name,
          session.tester_email || '',
          study.name,
          flow ? flow.name : answer.flow_id,
          question ? question.question_text : answer.question_id,
          question ? question.question_type : '',
          answer.answer_text,
          answer.updated_at
        ]);
      });
    });

    return rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  async function downloadCSV(studyId) {
    const csv = await exportCSV(studyId);
    const study = await Studies.getById(studyId);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${study ? study.slug : studyId}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== PUBLIC API =====
  return { Auth, Studies, Sessions, Answers, FlowSubmissions, Analytics, exportCSV, downloadCSV, slugify };
})();
