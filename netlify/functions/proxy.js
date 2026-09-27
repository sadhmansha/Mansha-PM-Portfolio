// netlify/functions/proxy.js
// Uses Google Gemini — free tier, no credit card needed.

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const prompt = body.prompt;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        })
      }
    );

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      return { statusCode: 500, body: JSON.stringify({ error: 'No response from AI' }) };
    }

    const text = data.candidates[0].content.parts[0].text;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
