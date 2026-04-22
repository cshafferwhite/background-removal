const sharp = require('sharp');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const { image_url, tolerance: tol } = req.body;
    const tolerance = tol || 25;
    
    if (!image_url) return res.status(400).json({ error: 'Missing image_url' });

    // Fetch the image
    const response = await fetch(image_url);
    const arrayBuffer = await response.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Get raw pixel data
    const { data, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;

    // Sample corners to determine background color
    const corners = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1]
    ];

    let rTotal = 0, gTotal = 0, bTotal = 0;
    for (const [x, y] of corners) {
      const idx = (y * width + x) * channels;
      rTotal += data[idx];
      gTotal += data[idx + 1];
      bTotal += data[idx + 2];
    }

    const bgR = Math.round(rTotal / 4);
    const bgG = Math.round(gTotal / 4);
    const bgB = Math.round(bTotal / 4);

    // Remove background pixels within tolerance
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const diff = Math.sqrt(
        Math.pow(r - bgR, 2) +
        Math.pow(g - bgG, 2) +
        Math.pow(b - bgB, 2)
      );

      if (diff < tolerance) {
        data[i + 3] = 0;
      }
    }

    // Convert back to PNG
    const outputBuffer = await sharp(data, {
      raw: { width, height, channels }
    }).png().toBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.send(outputBuffer);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
