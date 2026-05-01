module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const { scenarioId } = req.body;
    if (!scenarioId) return res.status(400).json({ error: 'Missing scenarioId' });

    const response = await fetch(`https://us2.make.com/api/v2/scenarios/${scenarioId}/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.MAKE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ responsive: true }),
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
