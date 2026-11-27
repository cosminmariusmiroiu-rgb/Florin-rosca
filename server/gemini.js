'use strict';
// Google Gemini (AI Studio) – editare de imagine: schimbă doar culoarea părului din poza clientei.
// Cheia API se ia din Google AI Studio (aistudio.google.com → Get API key) și se pune în panou.
const BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta/models/'; // GEMINI_BASE: doar pentru teste

class GeminiError extends Error { constructor(msg, code) { super(msg); this.code = code || 'api'; } }
// what Google's answer means for the salon (shown in the panel); the client only gets a neutral message.
// code: billing = image generation is not allowed on the free plan · quota = too many requests · key = key refused · photo = this photo gave no image
function explain(msg, status) {
  const t = String(msg || '');
  if (/free[ _-]?tier|limit: 0\b|billing/i.test(t) && /quota|exceed/i.test(t)) return new GeminiError('Google nu generează imagini pe planul gratuit (Free tier). Activează plata la Google: aistudio.google.com → API keys → „Set up billing” la cheia pusă aici. Până atunci simulatorul nu poate face poze.', 'billing');
  if (status === 429 || /quota|rate limit|resource.?exhausted/i.test(t)) return new GeminiError('Gemini: prea multe cereri într-un timp scurt (limita contului Google). Încearcă peste un minut.', 'quota');
  if (status === 401 || status === 403 || /api key not valid|api_key_invalid|permission/i.test(t)) return new GeminiError('Gemini: cheia nu este validă sau nu are acces la acest model. Pune din nou cheia în panou (Simulator AI).', 'key');
  if (status === 404) return new GeminiError('Gemini: modelul scris în panou nu mai există la Google. Schimbă „Model Gemini” în panou (Simulator AI).', 'model');
  return new GeminiError('Gemini: ' + (t || 'eroare ' + status), 'api');
}

function prompt(color) {
  return [
    'Edit this photo of a woman at a hair salon consultation.',
    `Change ONLY the color of her hair to: ${color.name}. ${color.description || ''}`.trim(),
    'Keep everything else exactly the same: the same person, the same face and facial features, the same skin, expression, eyes, makeup, clothes, background and lighting.',
    'Keep the same haircut, hair length, volume and texture. Do not make the person look different or younger.',
    'Make it look like a real, photorealistic result after a professional salon color service: healthy, glossy hair, soft natural blending at the roots, realistic strands.',
    'Return only the edited photo.'
  ].join(' ');
}

async function editHair(cfg, key, photoDataUrl, color) {
  if (!key) throw new GeminiError('Cheia Gemini nu este pusă în panou (Simulator AI).');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(photoDataUrl || '');
  if (!m) throw new GeminiError('Poza nu este validă.');
  const model = cfg.model || 'gemini-2.5-flash-image';
  let res;
  try {
    res = await fetch(BASE + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: m[1], data: m[2] } }, { text: prompt(color) }] }],
        generationConfig: { responseModalities: ['IMAGE'] }
      }),
      signal: AbortSignal.timeout(90000)
    });
  } catch (e) {
    throw new GeminiError('Nu mă pot conecta la Gemini (' + (e.name === 'TimeoutError' ? 'timpul a expirat' : 'rețea indisponibilă') + ').', 'net');
  }
  let d = {};
  try { d = await res.json(); } catch (e) {}
  if (!res.ok) throw explain(d.error && d.error.message, res.status);
  const parts = (((d.candidates || [])[0] || {}).content || {}).parts || [];
  const img = parts.find((p) => p.inline_data || p.inlineData);
  if (!img) {
    const reason = ((d.candidates || [])[0] || {}).finishReason || (d.promptFeedback && d.promptFeedback.blockReason) || 'fără imagine în răspuns';
    throw new GeminiError('Gemini nu a returnat o imagine (' + reason + '). Încearcă altă poză, cu fața și părul bine luminate.', 'photo');
  }
  const data = img.inline_data || img.inlineData;
  return 'data:' + (data.mime_type || data.mimeType || 'image/png') + ';base64,' + data.data;
}

// small key check without generating an image
async function test(key, model) {
  if (!key) throw new GeminiError('Pune întâi cheia Gemini.');
  let res;
  try {
    res = await fetch(BASE + encodeURIComponent(model || 'gemini-2.5-flash-image'), { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(20000) });
  } catch (e) { throw new GeminiError('Nu mă pot conecta la Gemini.'); }
  let d = {};
  try { d = await res.json(); } catch (e) {}
  if (!res.ok) throw explain(d.error && d.error.message, res.status);
  return d.displayName || d.name || model;
}

module.exports = { editHair, test, GeminiError };
