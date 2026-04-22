const sharp = require('sharp');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const { image_url, tolerance: tol } = req.body;
    const tolerance = tol || 30;

    if (!image_url) return res.status(400).json({ error: 'Missing image_url' });

    const response = await fetch(image_url);
    const arrayBuffer = await response.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    const { data, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;

    // Sample corners to determine background color
    const corners = [
      [0, 0], [width - 1, 0],
      [0, height - 1], [width - 1, height - 1]
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

    // Helper to check if pixel matches background
    const isBgColor = (idx) => {
      if (data[idx + 3] === 0) return false; // already transparent
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      return Math.sqrt(
        Math.pow(r - bgR, 2) +
        Math.pow(g - bgG, 2) +
        Math.pow(b - bgB, 2)
      ) < tolerance;
    };

    // Pass 1 — Flood fill from edges (removes outer background)
    const visited = new Uint8Array(width * height);
    const queue = [];

    for (let x = 0; x < width; x++) {
      queue.push([x, 0]);
      queue.push([x, height - 1]);
    }
    for (let y = 0; y < height; y++) {
      queue.push([0, y]);
      queue.push([width - 1, y]);
    }

    while (queue.length > 0) {
      const [x, y] = queue.pop();
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const pos = y * width + x;
      if (visited[pos]) continue;
      visited[pos] = 1;
      const idx = pos * channels;
      if (!isBgColor(idx)) continue;
      data[idx + 3] = 0;
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    // Passes 2, 3, 4 — Global sweep for remaining background-colored pixels
    // Each pass uses a slightly higher tolerance to catch edge bleed
    const sweepTolerances = [tolerance, tolerance + 10, tolerance + 20];
    
    for (const sweepTol of sweepTolerances) {
      for (let i = 0; i < data.length; i += channels) {
        if (data[i + 3] === 0) continue; // already transparent
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const diff = Math.sqrt(
          Math.pow(r - bgR, 2) +
          Math.pow(g - bgG, 2) +
          Math.pow(b - bgB, 2)
        );
        if (diff < sweepTol) {
          data[i + 3] = 0;
        }
      }
    }

    // Convert back to PNG
    const outputBuffer = await sharp(data, {
      raw: { width, height, channels }
    }).png().toBuffer();

    // Upload to Cloudinary
    const cloudinaryFormData = new FormData();
    const blob = new Blob([outputBuffer], { type: 'image/png' });
    cloudinaryFormData.append('file', blob, 'clean.png');
    cloudinaryFormData.append('upload_preset', 'tshirt_upload');
    cloudinaryFormData.append('api_key', process.env.CLOUDINARY_API_KEY);

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: 'POST',
        body: cloudinaryFormData
      }
    );

    const cloudinaryData = await cloudinaryResponse.json();

    if (cloudinaryData.error) {
      return res.status(500).json({ error: cloudinaryData.error.message });
    }

    return res.status(200).json({
      success: true,
      url: cloudinaryData.secure_url,
      public_id: cloudinaryData.public_id
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
