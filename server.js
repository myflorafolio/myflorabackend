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

// ✅ SAFE JSON EXTRACTOR
function extractJSON(rawText) {
  const raw = rawText || "";
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}") + 1;

  if (jsonStart === -1 || jsonEnd === 0) {
    throw new Error("No JSON object found in model response.");
  }

  const jsonString = raw.slice(jsonStart, jsonEnd);
  return JSON.parse(jsonString);
}

// 🌿 GET IMAGE FROM UNSPLASH
async function getPlantImage(plantName) {
  try {
    if (!UNSPLASH_ACCESS_KEY) return "";

    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      `${plantName} plant`
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

// 🌱 ZONE PLANTS
app.post("/zone-plants", async (req, res) => {
  try {
    const { zone, exclude = [] } = req.body;

    if (!zone) {
      return res.status(400).json({ error: "Missing zone" });
    }

    const prompt = `
Suggest 5 DIFFERENT outdoor plants that grow well in hardiness zone ${zone}.

Rules:
- Do not repeat any plants from this exclude list: ${exclude.length ? exclude.join(", ") : "none"}
- Give a varied mix, not the same common plants every time
- Avoid duplicates or near-duplicates
- Prefer variety in flower, foliage, shrub, and hardy perennial types when possible
- Keep each reason short and useful

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

    const parsed = extractJSON(raw);

    const plantsWithImages = await Promise.all(
      (parsed.plants || []).map(async (plant) => {
        const imageURL = await getPlantImage(plant.name);
        return {
          name: plant.name || "",
          why: plant.why || "",
          imageURL,
        };
      })
    );

    res.json({
      summary: parsed.summary || "",
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

// 🌿 ASK
app.post("/ask", async (req, res) => {
  try
