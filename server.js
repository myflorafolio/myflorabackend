import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🌿 CHANGE THIS → get from https://unsplash.com/developers
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;


// ✅ HEALTH CHECK
app.get("/", (_req, res) => {
  res.send("My Flora Folio backend is live 🌿");
});


// 🌱 GET IMAGE FROM UNSPLASH
async function getPlantImage(plantName) {
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      plantName + " plant"
    )}&per_page=1&client_id=${UNSPLASH_ACCESS_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    return data.results?.[0]?.urls?.regular || null;
  } catch (error) {
    console.error("IMAGE ERROR:", error);
    return null;
  }
}


// 🌱 ASK AI FOR PLANTS + IMAGES
app.post("/ask", async (req, res) => {
  try {
    const { zone, exclude = [] } = req.body;

    const prompt = `
    Give me 5 outdoor plants that grow well in hardiness zone ${zone}.

    Avoid these:
    ${exclude.join(", ")}

    Return ONLY JSON:
    {
      "summary": "short friendly sentence",
      "plants": [
        { "name": "Plant 1" },
        { "name": "Plant 2" },
        { "name": "Plant 3" },
        { "name": "Plant 4" },
        { "name": "Plant 5" }
      ]
    }
    `;

    const aiResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const raw =
      aiResponse.output_text ||
      aiResponse.output?.[0]?.content?.[0]?.text ||
      "";

    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}") + 1;
    const jsonString = raw.slice(jsonStart, jsonEnd);

    const parsed = JSON.parse(jsonString);

    // 🔥 ADD IMAGES TO EACH PLANT
    const plantsWithImages = await Promise.all(
      parsed.plants.map(async (plant) => {
        const image = await getPlantImage(plant.name);
        return {
          name: plant.name,
          image,
        };
      })
    );

    res.json({
      summary: parsed.summary,
      plants: plantsWithImages,
    });
  } catch (error) {
    console.error("ASK ERROR:", error);
    res.status(500).json({
      error: "Ask failed",
      details: error?.message || String(error),
    });
  }
});


// 🌿 ZONE CHECK (UNCHANGED)
app.post("/zone-check", async (req, res) => {
  try {
    const { plant, zone } = req.body;

    const prompt = `
    Does the plant "${plant}" grow well in hardiness zone ${zone}?

    Return ONLY JSON:
    {
      "match": true or false,
      "reason": "short explanation"
    }
    `;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const raw =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}") + 1;
    const jsonString = raw.slice(jsonStart, jsonEnd);

    res.json(JSON.parse(jsonString));
  } catch (error) {
    console.error("ZONE CHECK ERROR:", error);
    res.status(500).json({
      error: "Zone check failed",
      details: error?.message || String(error),
    });
  }
});


// 🌼 IDENTIFY (UNCHANGED — SAFE)
app.post("/identify", async (req, res) => {
  try {
    const imageBase64 =
      req.body.imageBase64 ||
      req.body.image ||
      req.body.base64 ||
      req.body.photo ||
      req.body.imageData;

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing image data" });
    }

    const cleanBase64 = imageBase64.replace(
      /^data:image\/[a-zA-Z]+;base64,/,
      ""
    );

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Identify this plant and give a short name only.",
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${cleanBase64}`,
            },
          ],
        },
      ],
    });

    const name =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "Unknown plant";

    res.json({ name });
  } catch (error) {
    console.error("IDENTIFY ERROR:", error);
    res.status(500).json({
      error: "Identify failed",
      details: error?.message || String(error),
    });
  }
});


// 🚀 START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
