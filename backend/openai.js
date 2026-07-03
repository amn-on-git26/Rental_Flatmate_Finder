const fetch = global.fetch || require('node-fetch');

const buildPrompt = ({ listing, profile }) => {
  return `Given this room listing: ${JSON.stringify(listing)}\nand this tenant profile: ${JSON.stringify(profile)}\ncompute a compatibility score from 0 to 100 based on budget and location match. Return JSON: { "score": number, "explanation": string }`;
};

const fallbackScore = ({ listing, profile }) => {
  const budgetRange = profile.budget_max - profile.budget_min || 1;
  const budgetMid = (profile.budget_min + profile.budget_max) / 2;
  const rentDistance = Math.abs(listing.rent - budgetMid);
  const budgetScore = Math.max(0, 50 - Math.round((rentDistance / Math.max(budgetRange, 1)) * 25));

  const locationA = String(profile.preferred_location || '').toLowerCase();
  const locationB = String(listing.location || '').toLowerCase();
  const locationScore = locationA && locationB && locationA === locationB ? 50 : locationA && locationB && locationA.includes(locationB) || locationB.includes(locationA) ? 40 : 20;

  const score = Math.min(100, Math.max(0, budgetScore + locationScore));
  const explanation = `Fallback score based on rent proximity and location overlap. Rent ${listing.rent} against target ${profile.budget_min}-${profile.budget_max}.`;

  return { score, explanation };
};

const getCompatibility = async ({ listing, profile }) => {
  if (!process.env.OPENAI_API_KEY) {
    return fallbackScore({ listing, profile });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        messages: [{ role: 'user', content: buildPrompt({ listing, profile }) }],
        max_tokens: 200,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error ${response.status}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(text.replace(/^[^\{]*(\{.*\})[^\}]*$/s, '$1'));
    const score = Number(parsed.score || 0);
    const explanation = String(parsed.explanation || 'No explanation returned.');
    if (Number.isNaN(score)) throw new Error('Invalid score');
    return { score: Math.max(0, Math.min(100, score)), explanation };
  } catch (err) {
    const message = err.message.startsWith('OpenAI error') ? 'OpenAI unavailable; using fallback scoring.' : err.message;
    console.warn('[openai] fallback:', message);
    return fallbackScore({ listing, profile });
  }
};

module.exports = { getCompatibility };
