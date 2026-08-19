// ===== FLOWLYTICS - DATA STORE (localStorage + Supabase-ready) =====
// This module manages all data. It uses localStorage for offline/demo mode.
// Replace the localStorage calls with Supabase API calls when ready.

const DTH = (() => {
  'use strict';

  // ===== KEYS =====
  const KEYS = {
    STUDIES: 'dth_studies',
    SESSIONS: 'dth_sessions',
    ANSWERS: 'dth_answers',
    FLOW_SUBMISSIONS: 'dth_flow_submissions',
    ADMIN_AUTH: 'dth_admin',
    CURRENT_SESSION: 'dth_current_session',
  };

  // ===== UTILS =====
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function slugify(text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  function now() { return new Date().toISOString(); }

  function load(key, def = []) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
    catch { return def; }
  }

  function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // ===== ADMIN AUTH =====
  const Auth = {
    ADMIN_PASSWORD: 'design2026', // Simple demo password

    login(email, password) {
      if (password === this.ADMIN_PASSWORD) {
        save(KEYS.ADMIN_AUTH, { email, loggedIn: true, at: now() });
        return true;
      }
      return false;
    },

    logout() { localStorage.removeItem(KEYS.ADMIN_AUTH); },

    isLoggedIn() {
      const a = load(KEYS.ADMIN_AUTH, null);
      return a && a.loggedIn === true;
    },

    getAdmin() { return load(KEYS.ADMIN_AUTH, null); }
  };

  // ===== STUDIES =====
  const Studies = {
    getAll() { return load(KEYS.STUDIES, []); },

    getBySlug(slug) {
      return this.getAll().find(s => s.slug === slug) || null;
    },

    getById(id) {
      return this.getAll().find(s => s.id === id) || null;
    },

    create({ name, description, instructions, settings }) {
      const studies = this.getAll();
      let slug = slugify(name);
      // ensure unique slug
      let count = 1;
      while (studies.find(s => s.slug === slug)) { slug = slugify(name) + '-' + count++; }

      const study = {
        id: uid(),
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
          ...settings
        },
        created_at: now(),
        updated_at: now(),
        flows: []
      };
      studies.push(study);
      save(KEYS.STUDIES, studies);
      return study;
    },

    update(id, updates) {
      const studies = this.getAll();
      const idx = studies.findIndex(s => s.id === id);
      if (idx === -1) return null;
      studies[idx] = { ...studies[idx], ...updates, updated_at: now() };
      save(KEYS.STUDIES, studies);
      return studies[idx];
    },

    delete(id) {
      const studies = this.getAll().filter(s => s.id !== id);
      save(KEYS.STUDIES, studies);
    },

    publish(id) { return this.update(id, { status: 'published' }); },
    close(id)   { return this.update(id, { status: 'closed' }); },
    unpublish(id) { return this.update(id, { status: 'draft' }); },

    // ===== FLOWS within study =====
    addFlow(studyId, flowData) {
      const study = this.getById(studyId);
      if (!study) return null;
      if ((study.flows || []).length >= 10) return null;

      const flow = {
        id: uid(),
        name: flowData.name || 'Untitled Flow',
        description: flowData.description || '',
        figma_url: flowData.figma_url || '',
        display_order: (study.flows || []).length + 1,
        questions: flowData.questions || [],
        created_at: now(),
        updated_at: now()
      };

      const flows = [...(study.flows || []), flow];
      this.update(studyId, { flows });
      return flow;
    },

    updateFlow(studyId, flowId, updates) {
      const study = this.getById(studyId);
      if (!study) return null;
      const flows = (study.flows || []).map(f =>
        f.id === flowId ? { ...f, ...updates, updated_at: now() } : f
      );
      this.update(studyId, { flows });
      return flows.find(f => f.id === flowId);
    },

    deleteFlow(studyId, flowId) {
      const study = this.getById(studyId);
      if (!study) return;
      const flows = (study.flows || [])
        .filter(f => f.id !== flowId)
        .map((f, i) => ({ ...f, display_order: i + 1 }));
      this.update(studyId, { flows });
    },

    duplicateFlow(studyId, flowId) {
      const study = this.getById(studyId);
      if (!study) return null;
      const flow = (study.flows || []).find(f => f.id === flowId);
      if (!flow) return null;

      const duplicate = {
        ...flow,
        id: uid(),
        name: flow.name + ' (Copy)',
        display_order: (study.flows || []).length + 1,
        questions: (flow.questions || []).map(q => ({
          ...q,
          id: uid(),
          options: q.options ? [...q.options] : []
        })),
        created_at: now(),
        updated_at: now()
      };

      const flows = [...(study.flows || []), duplicate];
      this.update(studyId, { flows });
      return duplicate;
    },

    reorderFlows(studyId, orderedIds) {
      const study = this.getById(studyId);
      if (!study) return;
      const flows = orderedIds.map((id, i) => {
        const f = study.flows.find(f => f.id === id);
        return f ? { ...f, display_order: i + 1 } : null;
      }).filter(Boolean);
      this.update(studyId, { flows });
    },

    // ===== QUESTIONS within flow =====
    addQuestion(studyId, flowId, qData) {
      const study = this.getById(studyId);
      if (!study) return null;
      const flow = (study.flows || []).find(f => f.id === flowId);
      if (!flow) return null;

      const question = {
        id: uid(),
        question_text: qData.question_text || '',
        question_type: qData.question_type || 'short_text',
        options: qData.options || [],
        required: qData.required !== undefined ? qData.required : true,
        display_order: (flow.questions || []).length + 1,
        created_at: now(),
        updated_at: now()
      };

      const questions = [...(flow.questions || []), question];
      this.updateFlow(studyId, flowId, { questions });
      return question;
    },

    updateQuestion(studyId, flowId, questionId, updates) {
      const study = this.getById(studyId);
      if (!study) return null;
      const flow = (study.flows || []).find(f => f.id === flowId);
      if (!flow) return null;
      const questions = (flow.questions || []).map(q =>
        q.id === questionId ? { ...q, ...updates, updated_at: now() } : q
      );
      this.updateFlow(studyId, flowId, { questions });
      return questions.find(q => q.id === questionId);
    },

    deleteQuestion(studyId, flowId, questionId) {
      const study = this.getById(studyId);
      if (!study) return;
      const flow = (study.flows || []).find(f => f.id === flowId);
      if (!flow) return;
      const questions = (flow.questions || [])
        .filter(q => q.id !== questionId)
        .map((q, i) => ({ ...q, display_order: i + 1 }));
      this.updateFlow(studyId, flowId, { questions });
    },

    duplicateQuestion(studyId, flowId, questionId) {
      const study = this.getById(studyId);
      if (!study) return null;
      const flow = (study.flows || []).find(f => f.id === flowId);
      if (!flow) return null;
      const q = (flow.questions || []).find(q => q.id === questionId);
      if (!q) return null;

      const duplicate = {
        ...q,
        id: uid(),
        display_order: (flow.questions || []).length + 1,
        options: q.options ? [...q.options] : [],
        created_at: now(),
        updated_at: now()
      };
      const questions = [...(flow.questions || []), duplicate];
      this.updateFlow(studyId, flowId, { questions });
      return duplicate;
    }
  };

  // ===== SESSIONS =====
  const Sessions = {
    getAll() { return load(KEYS.SESSIONS, []); },

    getById(id) { return this.getAll().find(s => s.id === id) || null; },

    getByStudy(studyId) { return this.getAll().filter(s => s.study_id === studyId); },

    create({ studyId, testerName, testerEmail }) {
      const sessions = this.getAll();
      const session = {
        id: uid(),
        session_code: 'TS-' + Math.random().toString(36).toUpperCase().slice(2, 8),
        study_id: studyId,
        tester_name: testerName || 'Anonymous',
        tester_email: testerEmail || '',
        started_at: now(),
        completed_at: null,
        status: 'in_progress',
        current_flow: 0,
        created_at: now()
      };
      sessions.push(session);
      save(KEYS.SESSIONS, sessions);
      return session;
    },

    update(id, updates) {
      const sessions = this.getAll();
      const idx = sessions.findIndex(s => s.id === id);
      if (idx === -1) return null;
      sessions[idx] = { ...sessions[idx], ...updates };
      save(KEYS.SESSIONS, sessions);
      return sessions[idx];
    },

    complete(id) {
      return this.update(id, { status: 'completed', completed_at: now() });
    },

    getCurrentSession(studyId) {
      const stored = load(KEYS.CURRENT_SESSION, {});
      const sessionId = stored[studyId];
      if (!sessionId) return null;
      const session = this.getById(sessionId);
      if (!session || session.status === 'completed') return null;
      return session;
    },

    setCurrentSession(studyId, sessionId) {
      const stored = load(KEYS.CURRENT_SESSION, {});
      stored[studyId] = sessionId;
      save(KEYS.CURRENT_SESSION, stored);
    },

    clearCurrentSession(studyId) {
      const stored = load(KEYS.CURRENT_SESSION, {});
      delete stored[studyId];
      save(KEYS.CURRENT_SESSION, stored);
    }
  };

  // ===== ANSWERS =====
  const Answers = {
    getAll() { return load(KEYS.ANSWERS, []); },

    getBySession(sessionId) { return this.getAll().filter(a => a.session_id === sessionId); },

    getByFlowSession(flowId, sessionId) {
      return this.getAll().filter(a => a.flow_id === flowId && a.session_id === sessionId);
    },

    upsert({ sessionId, studyId, flowId, questionId, answerText, answerJson }) {
      const answers = this.getAll();
      const existing = answers.findIndex(
        a => a.session_id === sessionId && a.question_id === questionId
      );

      const answer = {
        id: existing >= 0 ? answers[existing].id : uid(),
        session_id: sessionId,
        study_id: studyId,
        flow_id: flowId,
        question_id: questionId,
        answer_text: answerText || '',
        answer_json: answerJson || null,
        created_at: existing >= 0 ? answers[existing].created_at : now(),
        updated_at: now()
      };

      if (existing >= 0) { answers[existing] = answer; }
      else { answers.push(answer); }

      save(KEYS.ANSWERS, answers);
      return answer;
    },

    saveAll(sessionId, studyId, flowId, answersMap) {
      // answersMap: { questionId -> { text, json } }
      Object.entries(answersMap).forEach(([questionId, val]) => {
        this.upsert({
          sessionId, studyId, flowId, questionId,
          answerText: val.text || '',
          answerJson: val.json || null
        });
      });
    }
  };

  // ===== FLOW SUBMISSIONS =====
  const FlowSubmissions = {
    getAll() { return load(KEYS.FLOW_SUBMISSIONS, []); },

    getBySession(sessionId) { return this.getAll().filter(s => s.session_id === sessionId); },

    isCompleted(sessionId, flowId) {
      return this.getAll().some(s => s.session_id === sessionId && s.flow_id === flowId && s.status === 'completed');
    },

    create({ sessionId, flowId }) {
      const subs = this.getAll();
      const existing = subs.findIndex(s => s.session_id === sessionId && s.flow_id === flowId);
      if (existing >= 0) {
        subs[existing] = { ...subs[existing], status: 'completed', completed_at: now() };
        save(KEYS.FLOW_SUBMISSIONS, subs);
        return subs[existing];
      }
      const sub = {
        id: uid(),
        session_id: sessionId,
        flow_id: flowId,
        started_at: now(),
        completed_at: now(),
        status: 'completed'
      };
      subs.push(sub);
      save(KEYS.FLOW_SUBMISSIONS, subs);
      return sub;
    }
  };

  // ===== ANALYTICS =====
  const Analytics = {
    studyStats(studyId) {
      const sessions = Sessions.getByStudy(studyId);
      const total = sessions.length;
      const completed = sessions.filter(s => s.status === 'completed').length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      // avg completion time
      const completedSessions = sessions.filter(s => s.completed_at && s.started_at);
      const avgTime = completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => {
            const ms = new Date(s.completed_at) - new Date(s.started_at);
            return sum + ms;
          }, 0) / completedSessions.length
        : 0;

      return { total, completed, incomplete: total - completed, completionRate, avgTimeMs: avgTime };
    },

    flowStats(studyId, flowId) {
      const sessions = Sessions.getByStudy(studyId);
      const answers = Answers.getAll().filter(a => a.study_id === studyId && a.flow_id === flowId);
      const sessionIds = [...new Set(answers.map(a => a.session_id))];
      const responses = sessionIds.length;

      // rating avg
      const ratingAnswers = answers.filter(a => {
        const num = parseFloat(a.answer_text);
        return !isNaN(num) && num >= 1 && num <= 5;
      });
      const avgRating = ratingAnswers.length > 0
        ? (ratingAnswers.reduce((sum, a) => sum + parseFloat(a.answer_text), 0) / ratingAnswers.length).toFixed(1)
        : null;

      // like %
      const likeAnswers = answers.filter(a => a.answer_text === 'like' || a.answer_text === 'dislike');
      const likes = likeAnswers.filter(a => a.answer_text === 'like').length;
      const likePercent = likeAnswers.length > 0 ? Math.round((likes / likeAnswers.length) * 100) : null;

      return { responses, avgRating, likePercent };
    },

    questionStats(flowId, questionId) {
      const answers = Answers.getAll().filter(a => a.flow_id === flowId && a.question_id === questionId);
      const distribution = {};
      answers.forEach(a => {
        const key = a.answer_text || 'No answer';
        distribution[key] = (distribution[key] || 0) + 1;
      });
      return { count: answers.length, distribution, answers };
    }
  };

  // ===== SEED DEMO DATA =====
  function seedDemo() {
    const existing = Studies.getAll();
    if (existing.find(s => s.name === 'FastTV Home Screen Evaluation')) return;

    const study = Studies.create({
      name: 'FastTV Home Screen Evaluation',
      description: 'Evaluate different Home Screen directions with internal stakeholders.',
      instructions: 'Please review each prototype carefully before answering the questions. Take your time to interact with each design.',
      settings: { collectName: true, collectEmail: false, showProgress: true, allowBack: true }
    });

    const flowConfigs = [
      { name: 'Home Screen – Version A', description: 'Classic grid layout with featured content banner' },
      { name: 'Home Screen – Version B', description: 'Full-width hero with horizontal scroll rows' },
      { name: 'Home Screen – Version C', description: 'Minimal list-based layout with categories' },
      { name: 'Navigation – Tab Bar', description: 'Bottom tab bar navigation pattern' },
      { name: 'Search Experience', description: 'Dedicated search screen with filters' },
    ];

    const questionSets = [
      [
        { question_text: 'How would you rate this design overall?', question_type: 'rating', required: true },
        { question_text: 'Do you like this design direction?', question_type: 'like_dislike', required: true },
        { question_text: 'What do you like most about this design?', question_type: 'long_text', required: false },
        { question_text: 'What would you improve?', question_type: 'long_text', required: false },
        { question_text: 'Was the navigation easy to understand?', question_type: 'yes_no', required: true },
      ],
      [
        { question_text: 'Rate the visual hierarchy of this design.', question_type: 'rating', required: true },
        { question_text: 'Which aspect do you like most?', question_type: 'multiple_choice', options: ['Layout', 'Typography', 'Colors', 'Content structure', 'Imagery'], required: true },
        { question_text: 'Do you prefer this over what you\'ve seen before?', question_type: 'yes_no', required: true },
        { question_text: 'Additional comments', question_type: 'long_text', required: false },
      ],
      [
        { question_text: 'How would you rate this design?', question_type: 'rating', required: true },
        { question_text: 'Did you like this design?', question_type: 'like_dislike', required: true },
        { question_text: 'Which design do you prefer so far?', question_type: 'single_choice', options: ['Version A', 'Version B', 'Version C (this one)', 'None of them'], required: false },
        { question_text: 'Your first impression in one sentence:', question_type: 'short_text', required: false },
      ],
    ];

    flowConfigs.forEach((fc, i) => {
      const flow = Studies.addFlow(study.id, {
        name: fc.name,
        description: fc.description,
        figma_url: 'https://www.figma.com/proto/placeholder-' + (i + 1)
      });

      const qSet = questionSets[i % questionSets.length];
      qSet.forEach(q => Studies.addQuestion(study.id, flow.id, q));
    });

    Studies.publish(study.id);

    // create 20 mock testers
    const testerNames = ['Priya S.','Arjun M.','Deepa K.','Rahul V.','Sneha P.','Kiran B.','Ananya T.','Vikram R.','Meera J.','Ravi N.',
      'Pooja L.','Aditya C.','Kavita D.','Suresh H.','Nisha G.','Manjunath A.','Divya F.','Harish E.','Sunita I.','Lokesh O.'];
    const ratingText = ['3','4','5','5','4','4','5','3','5','4','5','5','4','3','5','4','4','5','3','5'];
    const likeText = ['like','like','like','dislike','like','like','like','dislike','like','like','like','like','like','dislike','like','like','like','like','dislike','like'];

    const freshStudy = Studies.getById(study.id);

    testerNames.forEach((name, ti) => {
      const session = Sessions.create({ studyId: study.id, testerName: name });
      const shouldComplete = ti < 17;

      freshStudy.flows.forEach((flow, fi) => {
        if (!shouldComplete && fi >= 3) return;

        flow.questions.forEach(q => {
          let answerText = '';
          let answerJson = null;

          switch (q.question_type) {
            case 'rating': answerText = ratingText[(ti + fi) % ratingText.length]; break;
            case 'like_dislike': answerText = likeText[(ti + fi) % likeText.length]; break;
            case 'yes_no': answerText = (ti + fi) % 3 === 0 ? 'no' : 'yes'; break;
            case 'single_choice':
              if (q.options && q.options.length) answerText = q.options[(ti + fi) % q.options.length];
              break;
            case 'multiple_choice':
              if (q.options && q.options.length) {
                const selected = q.options.filter((_, i) => (ti + i) % 2 === 0).slice(0,3);
                answerText = selected.join(', ');
                answerJson = selected;
              }
              break;
            case 'short_text':
              answerText = ['Clean and minimal','Very intuitive','Needs improvement','Love the layout','Confusing hierarchy'][ti % 5];
              break;
            case 'long_text':
              answerText = ['The layout feels very clean and content hierarchy is clear. The featured banner works well.','I love how the content is organized. The horizontal scroll pattern is very familiar from other streaming apps.','The minimal approach is refreshing but I worry about content discoverability.','Navigation is intuitive. I could find what I was looking for easily.','The search experience needs more filters. The current view is too basic.'][(ti + fi) % 5];
              break;
          }

          Answers.upsert({ sessionId: session.id, studyId: study.id, flowId: flow.id, questionId: q.id, answerText, answerJson });
        });

        FlowSubmissions.create({ sessionId: session.id, flowId: flow.id });
      });

      if (shouldComplete) {
        Sessions.complete(session.id);
      }
    });

    console.log('Demo data seeded ✓');
  }

  // ===== EXPORT =====
  function exportCSV(studyId) {
    const study = Studies.getById(studyId);
    if (!study) return '';

    const sessions = Sessions.getByStudy(studyId);
    const allAnswers = Answers.getAll().filter(a => a.study_id === studyId);

    const rows = [['Tester Name','Tester Email','Study','Flow','Question','Question Type','Answer','Timestamp']];

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

  function downloadCSV(studyId) {
    const csv = exportCSV(studyId);
    const study = Studies.getById(studyId);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${study ? study.slug : studyId}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== PUBLIC API =====
  return { Auth, Studies, Sessions, Answers, FlowSubmissions, Analytics, seedDemo, exportCSV, downloadCSV, slugify, uid };
})();
