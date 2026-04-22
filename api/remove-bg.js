// VERSION: 3
const sharp = require('sharp');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const { image_url, tolerance: tol } = req.body;
    const tolerance = tol || 40;

    console.log('Running version 3, tolerance:', tolerance);

    if (!image_url) return res.status(400).json({ error: 'Missing image_url' });

    const response = await fetch(image_url);
    const arrayBuffer = await response.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    const { data, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;

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

    console.log('Background color sampled:', bgR, bgG, bgB);

    for (let i = 0; i < data.length; i += channels) {
      if (data[i + 3] === 0) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const diff = Math.sqrt(
        Math.pow(r - bgR, 2) +
        Math.pow(g - bgG, 2) +
        Math.pow(b - bgB, 2)
      );
      if (diff < tolerance) {
        data[i + 3] = 0;
      }
    }

    const outputBuffer = await sharp(data, {
      raw: { width, height, channels }
    }).png().toBuffer();

    const cloudinaryFormData = new FormData();
    const blob = new Blob([outputBuffer], { type: 'image/png' });
    cloudinaryFormData.append('file', blob, 'clean.png');
    cloudinaryFormData.append('upload_preset', 'tshirt_upload');
    cloudinaryFormData.append('api_key', process.env.CLOUDINARY_API_KEY);

    const cloudinaryResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: cloudinaryFormData }
    );

    const cloudinaryData = await cloudinaryResponse.json();

    if (cloudinaryData.error) {
      return res.status(500).json({ error: cloudinaryData.error.message });
    }

    return res.status(200).json({
      version: 3,
      success: true,
      url: cloudinaryData.secure_url,
      public_id: cloudinaryData.public_id
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
