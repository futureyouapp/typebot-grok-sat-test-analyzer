const fetch = require('node-fetch');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { file_url, prompt } = req.body;
  if (!file_url || !prompt) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).json({ error: 'Missing file_url or prompt' });
  }

  const XAI_API_KEY = process.env.XAI_API_KEY;
  if (!XAI_API_KEY) {
    console.error('XAI_API_KEY environment variable is not set');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: 'Server configuration error: API key missing' });
  }

  const GROK_BASE = 'https://api.x.ai/v1';

  try {
    console.log('Received request with file_url:', file_url);
    console.log('Prompt length:', prompt.length);

    // Download the PDF as buffer
    const fileRes = await fetch(file_url);
    console.log('File fetch status:', fileRes.status);

    if (!fileRes.ok) {
      throw new Error(`Failed to download file: ${fileRes.status}`);
    }

    const buffer = await fileRes.buffer();
    const base64Pdf = buffer.toString('base64');

    console.log('PDF converted to base64, length:', base64Pdf.length);

    // Send directly as base64 data URL in content array
    console.log('Starting analysis...');
    const analysisRes = await fetch(`${GROK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-reasoning',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Pdf
                }
              }
            ]
          }
        ]
      }),
    });

    if (!analysisRes.ok) {
      const errText = await analysisRes.text();
      throw new Error(`Analysis failed: ${analysisRes.status} - ${errText}`);
    }

    const data = await analysisRes.json();
    const findings = data.choices?.[0]?.message?.content || 'No detailed analysis returned';

    console.log('Analysis complete. Findings length:', findings.length);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ findings });

  } catch (err) {
    console.error('Error in handler:', err.message, err.stack);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
