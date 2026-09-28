// netlify/functions/proxy.js

const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'GEMINI_API_KEY not set in Netlify environment variables' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const prompt = body.prompt;
  if (!prompt) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No prompt provided' }) };
  }

  const postData = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
  });

  // Support both old (AIza) and new (AQ.) key formats
  // Old format: key goes in URL query string
  // New format: key goes in x-goog-api-key header
  const useHeader = !apiKey.startsWith('AIza');
  const path = '/v1beta/models/gemini-1.5-flash:generateContent' + (useHeader ? '' : '?key=' + apiKey);

  const requestHeaders = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  };

  if (useHeader) {
    requestHeaders['x-goog-api-key'] = apiKey;
    // Also try Authorization header for OAuth-style tokens
    requestHeaders['Authorization'] = 'Bearer ' + apiKey;
  }

  return new Promise((resolve) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: path,
      method: 'POST',
      headers: requestHeaders
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (parsed.error) {
            resolve({
              statusCode: 400,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: 'Gemini API error: ' + parsed.error.message + ' (status: ' + parsed.error.code + ')' })
            });
            return;
          }

          if (!parsed.candidates || !parsed.candidates[0]) {
            resolve({
              statusCode: 500,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: 'No response from Gemini. Raw: ' + data.substring(0, 300) })
            });
            return;
          }

          const text = parsed.candidates[0].content.parts[0].text;
          resolve({
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ text: text })
          });

        } catch(e) {
          resolve({
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Parse error: ' + e.message + '. Raw response: ' + data.substring(0, 300) })
          });
        }
      });
    });

    req.on('error', (e) => {
      resolve({
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Network error: ' + e.message })
      });
    });

    req.setTimeout(25000, () => {
      req.destroy();
      resolve({
        statusCode: 504,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Request timed out after 25 seconds' })
      });
    });

    req.write(postData);
    req.end();
  });
};
