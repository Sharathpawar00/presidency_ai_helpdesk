const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const MAX_INPUT = 2000;
const KB = JSON.parse(fs.readFileSync(path.join(__dirname, 'knowledge.json'), 'utf8'));
const CATEGORIES = [...Object.keys(KB), 'Unknown'];

app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function fallback(text) {
  const q = text.toLowerCase();
  const matches = [
    ['Academics', /academic|faculty|advisor|course|study|ಅಧ್ಯಾಪಕ|ಶೈಕ್ಷಣಿಕ|शैक्षणिक|पढ़ाई/],
    ['Attendance', /attendance|absent| उपस्थित|ಅಟೆಂಡೆನ್ಸ್|ಹಾಜರಾತಿ|उपस्थिति/],
    ['Examinations', /exam|examination|timetable|schedule| ಪರೀಕ್ಷೆ|ಪರೀಕ್ಷೆ|परीक्षा|टाइमटेबल/],
    ['Placements', /placement|job|training|career|ನೇಮಕ|ಪ್ಲೇಸ್|प्लेसमेंट|नौकरी/],
    ['Library', /library|book|resource|ಲೈಬ್ರರಿ|ಗ್ರಂಥಾಲಯ|पुस्तकालय|लाइब्रेरी/],
    ['Hostel', /hostel|dorm|ಹಾಸ್ಟೆಲ್|ವಸತಿ|छात्रावास|हॉस्टल/],
    ['Administration', /admin|certificate|record|document|office|ಪ್ರಮಾಣಪತ್ರ|प्रमाणपत्र|प्रशासन/],
    ['Events', /event|fest|announcement|ಕಾರ್ಯಕ್ರಮ|ಈವೆಂಟ್|कार्यक्रम|इवेंट/],
  ];
  const found = matches.find(([, re]) => re.test(q));
  const category = found ? found[0] : 'Unknown';
  const fact = KB[category] || null;
  return {
    answer: fact ? `Based on the supplied university information: ${fact}` : 'This information is not available in the supplied information. Please contact the relevant university office for guidance.',
    category, grounded: Boolean(fact), source_fact: fact,
    follow_ups: ['Who can I contact for more details?', 'Where can I find official information?'],
    escalation_draft: fact ? null : 'Hello, I need help with this question. Could you please direct me to the relevant office or share the official information?'
  };
}

function parseModelJson(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Model did not return JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalize(data) {
  const category = CATEGORIES.includes(data.category) ? data.category : 'Unknown';
  const validFact = data.source_fact && Object.values(KB).includes(data.source_fact) ? data.source_fact : null;
  const grounded = Boolean(data.grounded && validFact);
  return {
    answer: typeof data.answer === 'string' && data.answer.trim() ? data.answer.trim() : 'I could not form a reliable answer from the supplied information.',
    category: validFact ? category : (grounded ? category : 'Unknown'),
    grounded,
    source_fact: grounded ? validFact : null,
    follow_ups: Array.isArray(data.follow_ups) ? data.follow_ups.filter(x => typeof x === 'string').slice(0, 3) : [],
    escalation_draft: grounded ? null : (typeof data.escalation_draft === 'string' ? data.escalation_draft : 'Hello, could you please direct me to the relevant university office for help with this question?')
  };
}

async function askGemini(question) {
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const model = process.env.LLM_MODEL || 'gemini-1.5-flash';
  if (provider !== 'gemini') throw new Error('Only Gemini REST is implemented; set LLM_PROVIDER=gemini');
  if (!process.env.LLM_API_KEY) throw new Error('LLM_API_KEY is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.API_TIMEOUT_MS) || 12000);
  const facts = Object.entries(KB).map(([k, v]) => `${k}: ${v}`).join('\n');
  const prompt = `You are Presidency University's campus helpdesk. Use ONLY these knowledge-base facts:\n${facts}\n\nAnswer in the same language as the student's question (English, Hindi, Kannada, or Hinglish). If a requested detail is absent, clearly say it is not available in the supplied information; never invent facts, dates, numbers, phone numbers, or emails. A response is grounded only when its complete factual answer is supported by one exact fact above. Return only strict JSON with keys answer (string), category (one of ${CATEGORIES.join(', ')}), grounded (boolean), source_fact (exact sentence above or null), follow_ups (2-3 short questions), escalation_draft (short polite message from student to the most relevant office when grounded=false, otherwise null). Match the user's language in all text fields.\n\nStudent question: ${question}`;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.LLM_API_KEY)}`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } })
    });
    if (!response.ok) {
      const err = new Error(`Gemini returned HTTP ${response.status}`);
      err.rateLimited = response.status === 429;
      throw err;
    }
    const body = await response.json();
    const raw = body.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
    if (!raw) throw new Error('Empty model response');
    return normalize(parseModelJson(raw));
  } finally { clearTimeout(timer); }
}

app.post('/api/ask', async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question) return res.status(400).json({ error: 'Please enter a question.' });
  if (question.length > MAX_INPUT) return res.status(413).json({ error: `Please keep your question under ${MAX_INPUT} characters.` });
  try {
    const result = await askGemini(question);
    return res.json({ ...result, mode: 'online' });
  } catch (error) {
    const result = fallback(question);
    result.mode = 'offline';
    if (error.rateLimited) result.notice = 'The AI service is busy. Here is a best-effort answer from the local knowledge base.';
    return res.json(result);
  }
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Please send valid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => console.log(`Campus Helpdesk running at http://localhost:${PORT}`));
