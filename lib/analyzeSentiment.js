// lib/analyzeSentiment.js
const { DEFAULT_SENTIMENT_PROMPT } = require('../config/sentimentPrompt');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_SENTIMENT_PROMPT = process.env.OPENAI_SENTIMENT_PROMPT;
const OPENAI_MODEL = process.env.OPENAI_SENTIMENT_MODEL || 'gpt-4o-mini';

if (!global.fetch) {
  global.fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
}

function toConversationText(msgs, formatDate, maxChars = 5000) {
  const lines = msgs.map(m => {
    const who = m.direction === 'inbound' ? 'Customer' : 'Company';
    const when = formatDate ? formatDate(new Date(m.createdAt)) : new Date(m.createdAt).toISOString();
    const content = (m.text || '').replace(/\s+/g, ' ').trim();
    return `[${when}] ${who}: ${content}`;
  });
  let joined = lines.join('\n');
  if (joined.length > maxChars) {
    joined = joined.slice(joined.length - maxChars);
  }
  return joined;
}

async function analyzeSentiment(conversationText) {
  if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
  const prompt = (OPENAI_SENTIMENT_PROMPT && OPENAI_SENTIMENT_PROMPT + "\n") || DEFAULT_SENTIMENT_PROMPT;
  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: 'You only reply with one of: positive | negative | manual check.' },
      { role: 'user', content: prompt + conversationText }
    ],
    temperature: 0,
    max_tokens: 3
  };
  const rsp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json());
  const raw = rsp?.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
  const normalized = raw.replace(/[^a-z\s]/g, '').trim();
  const allowed = ['positive','negative','manual check'];
  const label = allowed.includes(normalized) ? normalized : 'manual check';
  return { label, usage: rsp?.usage, raw };
}

module.exports = { toConversationText, analyzeSentiment };
