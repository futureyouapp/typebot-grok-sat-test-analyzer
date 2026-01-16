const fetch = require('node-fetch');
const FormData = require('form-data');

module.exports = async (req, res) => {
  // Handle CORS preflight (OPTIONS request from browsers/Typebot)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Only allow POST (and OPTIONS already handled)
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

    // Download the PDF from Typebot's temporary URL
    const fileRes = await fetch(file_url);
    console.log('File fetch status:', fileRes.status, 'from URL:', file_url);

    if (!fileRes.ok) {
      const errorText = await fileRes.text().catch(() => 'No response body');
      throw new Error(`Failed to download file: ${fileRes.status} - ${errorText}`);
    }

    const buffer = await fileRes.buffer();
    const filename = file_url.split('/').pop() || 'document.pdf';

    // Upload to Grok Files API
    const form = new FormData();
    form.append('file', buffer, { filename, contentType: 'application/pdf' });

    console.log('Uploading file to Grok Files API...');
    const uploadRes = await fetch(`${GROK_BASE}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${XAI_API_KEY}` },
      body: form,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Grok file upload failed: ${uploadRes.status} - ${errText}`);
    }

    const { id: fileId } = await uploadRes.json();
    console.log('File uploaded to Grok, ID:', fileId);

    // Analyze – attach using file_ids at root level
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
            content: prompt
          }
        ],
        file_ids: [fileId]   // ← This is the change: file_ids at root level
      }),
    });

    if (!analysisRes.ok) {
      const errText = await analysisRes.text();
      throw new Error(`Analysis failed: ${analysisRes.status} - ${errText}`);
    }

    const data = await analysisRes.json();
    const findings = data.choices?.[0]?.message?.content || 'No detailed analysis returned';

    // Optional cleanup
    fetch(`${GROK_BASE}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${XAI_API_KEY}` },
    }).catch(() => {});

    console.log('Analysis complete. Findings length:', findings.length);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ findings });

  } catch (err) {
    console.error('Error in handler:', err.message, err.stack);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
