// config/sentimentPrompt.js
const DEFAULT_SENTIMENT_PROMPT = `You are a strict triage. Analyze the overall tone of the following conversation (customer ↔ company).
Output exactly one token from this set: positive, negative, manual check.
Use "manual check" for sarcasm/ambiguous/mixed. No explanations.

Conversation:
`;
module.exports = { DEFAULT_SENTIMENT_PROMPT };
