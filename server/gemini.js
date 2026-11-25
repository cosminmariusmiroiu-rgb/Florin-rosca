'use strict';
// Google Gemini (AI Studio) – editare de imagine: schimbă doar culoarea părului din poza clientei.
// Cheia API se ia din Google AI Studio (aistudio.google.com → Get API key) și se pune în panou.
const BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta/models/'; // GEMINI_BASE: doar pentru teste

class GeminiError extends Error {}

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
    throw new GeminiError('Nu mă pot conecta la Gemini (' + (e.name === 'TimeoutError' ? 'timpul a expirat' : 'rețea indisponibilă') + ').');
  }
  let d = {};
  try { d = await res.json(); } catch (e) {}
  if (!res.ok) {
    const msg = (d.error && d.error.message) || ('eroare ' + res.status);
    throw new GeminiError('Gemini: ' + msg);
  }
  const parts = (((d.candidates || [])[0] || {}).content || {}).parts || [];
  const img = parts.find((p) => p.inline_data || p.inlineData);
  if (!img) {
    const reason = ((d.candidates || [])[0] || {}).finishReason || (d.promptFeedback && d.promptFeedback.blockReason) || 'fără imagine în răspuns';
    throw new GeminiError('Gemini nu a returnat o imagine (' + reason + '). Încearcă altă poză, cu fața și părul bine luminate.');
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
  if (!res.ok) throw new GeminiError('Gemini: ' + ((d.error && d.error.message) || ('eroare ' + res.status)));
  return d.displayName || d.name || model;
}

module.exports = { editHair, test, GeminiError };
