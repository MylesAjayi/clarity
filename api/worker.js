// ============================================
// CLARITY API — Cloudflare Worker / Edge Function
// Proxies AI requests to OpenRouter, keeps API key server-side
// ============================================

const OPENROUTER_API_KEY = 'REDACTED_KEY';
const MODEL = 'google/gemini-3.1-flash-lite-preview'; // Cheapest quality model — ~£0.001 per generation

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    try {
      const body = await request.json();

      if (!body.messages || !Array.isArray(body.messages)) {
        return new Response(JSON.stringify({ error: 'Invalid request: messages array required' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      // Rate limiting by IP (simple, per-worker-invocation)
      // In production, use Cloudflare KV or Durable Objects for persistent rate limiting

      // Call OpenRouter
      const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env?.OPENROUTER_API_KEY || OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://novainsights.co.uk',
          'X-Title': 'Clarity by Nova',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: body.messages,
          max_tokens: 4000,
          temperature: 0.3, // Lower = more consistent structured output
          response_format: { type: 'json_object' },
        })
      });

      if (!aiResponse.ok) {
        const err = await aiResponse.text();
        console.error('OpenRouter error:', err);
        return new Response(JSON.stringify({ error: 'AI service error. Please try again.' }), {
          status: 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content;

      if (!content) {
        return new Response(JSON.stringify({ error: 'Empty response from AI. Please try again.' }), {
          status: 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ content }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: 'Internal error. Please try again.' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }
  }
};
