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

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

// ✅ HEALTH CHECK
app.get("/", (_req, res) => {
  res.send("My Flora Folio backend is live 🌿");
});


// 🌿 GET IMAGE FROM UNSPLASH
async function getPlantImage(plantName) {
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      plantName + " plant"
    )}&per_page=1`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      },
    });

    const data = await response.json();

    return data.results?.[0]?.urls?.regular || "";
  } catch (error) {
    console.error("IMAGE ERROR:", error);
    return "";
  }
}


// 🌱 🔥 MAIN ROUTE YOUR APP NEEDS
app.post("/zone-plants", async (req, res) => {
  try {
    const { zone, exclude = [] } = req.body;

    if (!zone) {
      return res.status(400).json({ error: "Missing zone" });
    }

    const prompt = `
Give me 5 outdoor plants that grow well in hardiness zone ${zone}.

Avoid these plants:
${exclude.join(", ")}

Return ONLY JSON in this format:
{
  "summary": "short friendly sentence",
  "plants": [
    { "name": "Plant 1", "why": "short reason" },
    { "name": "Plant 2", "why": "short reason" },
    { "name": "Plant 3", "why": "short reason" },
    { "name": "Plant 4", "why": "short reason" },
    { "name": "Plant 5", "why": "short reason" }
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

    // 🔥 CLEAN PARSE (safe)
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}") + 1;
    const jsonString = raw.slice(jsonStart, jsonEnd);

    const parsed = JSON.parse(jsonString);

    // 🌿 ADD IMAGES
    const plantsWithImages = await Promise.all(
      parsed.plants.map(async (plant) => {
        const imageURL = await getPlantImage(plant.name);

        return {
          name: plant.name,
          why: plant.why || "",
          imageURL,
        };
      })
    );

    res.json({
      summary: parsed.summary,
      plants: plantsWithImages,
    });
  } catch (error) {
    console.error("ZONE PLANTS ERROR:", error);
    res.status(500).json({
      error: "Zone plants failed",
      details: error?.message || String(error),
    });
  }
});


// 🌿 (OPTIONAL KEEP) CHAT ROUTE
app.post("/ask", async (req, res) => {
  try {
    const { message } = req.body;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: message || "Hello",
    });

    const reply =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "No reply";

    res.json({ reply });
  } catch (error) {
    console.error("ASK ERROR:", error);
    res.status(500).json({ error: "Ask failed" });
  }
});


// 🌿 ZONE CHECK
app.post("/zone-check", async (req, res) => {
  try {
    const { plant, zone } = req.body;

    const prompt = `
Does "${plant}" grow well in hardiness zone ${zone}?

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
    res.status(500).json({ error: "Zone check failed" });
  }
});


// 🌼 IDENTIFY (unchanged + safe)
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
    res.status(500).json({ error: "Identify failed" });
  }
});


// 🚀 START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
