const fetch = require('node-fetch');
const FormData = require('form-data');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { file_url, prompt } = req.body;
  if (!file_url || !prompt) {
    return res.status(400).json({ error: 'Missing file_url or prompt' });
  }

  const GROK_API_KEY = 'xai-q93LBDfHTxqAeIzimEue2mtRI3HscsQ5BUP58TqeTGIe6DfJD6lRtyfcClt2O3MY0dLWVJrT7cjXFxWM'; // ← REPLACE THIS WITH YOUR REAL GROK API KEY

  const GROK_BASE = 'https://api.x.ai/v1';

  try {
    // Download the PDF from Typebot's temporary URL
    const fileRes = await fetch(file_url);
    if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`);
    const buffer = await fileRes.buffer();
    const filename = file_url.split('/').pop() || 'document.pdf';

    // Upload to Grok Files API
    const form = new FormData();
    form.append('file', buffer, { filename, contentType: 'application/pdf' });

    const uploadRes = await fetch(`${GROK_BASE}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROK_API_KEY}` },
      body: form,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Grok file upload failed: ${uploadRes.status} - ${errText}`);
    }

    const { id: fileId } = await uploadRes.json();

    // Analyze the document
    const analysisRes = await fetch(`${GROK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-beta',  // Or 'grok-4-fast' / latest multimodal model – check x.ai docs
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'function', function: { name: 'document_search' } }],
        tool_choice: 'auto',
      }),
    });

    if (!analysisRes.ok) throw new Error(`Analysis failed: ${analysisRes.status}`);

    const data = await analysisRes.json();
    const findings = data.choices?.[0]?.message?.content || 'No detailed analysis returned';

    // Clean up (optional but good practice)
    fetch(`${GROK_BASE}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${GROK_API_KEY}` },
    }).catch(() => {});

    res.status(200).json({ findings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
