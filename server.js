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

app.get("/", (_req, res) => {
  res.send("My Flora Folio backend is live 🌿");
});

// =======================
// ASK
// =======================
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
    res.status(500).json({
      error: "Ask failed",
      details: error?.message || String(error),
    });
  }
});

// =======================
// IDENTIFY
// =======================
app.post("/identify", async (req, res) => {
  try {
    console.log("IDENTIFY BODY KEYS:", Object.keys(req.body || {}));

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
              text: `Identify this plant from the photo and respond ONLY as valid JSON.

Use these exact keys:
{
  "name": "common plant name",
  "scientificName": "scientific name if known",
  "careSummary": "2-3 sentence short summary",
  "petSafety": "state clearly if toxic to cats/dogs, non-toxic, or uncertain",
  "fullCareGuide": {
    "light": "specific light needs",
    "water": "specific watering advice",
    "humidity": "humidity needs",
    "temperature": "temperature needs",
    "soil": "best soil type",
    "fertilizer": "fertilizer guidance"
  }
}

Rules:
- Use the image itself to identify the plant
- Include pet safety for cats and dogs
- Return JSON only`,
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${cleanBase64}`,
            },
          ],
        },
      ],
    });

    const raw =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    console.log("RAW IDENTIFY RESPONSE:", raw);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {
        name: raw || "Unknown plant",
        scientificName: "",
        careSummary: "",
        petSafety: "Pet safety uncertain",
        fullCareGuide: {},
      };
    }

    const name =
      parsed.name ||
      parsed.commonName ||
      parsed.plantName ||
      "Unknown plant";

    const scientificName = parsed.scientificName || "";
    const careSummary = parsed.careSummary || "";

    const petSafety =
      parsed.petSafety ||
      parsed.toxicity ||
      "Pet safety uncertain";

    const fullCareGuide = parsed.fullCareGuide || {};

    const light = fullCareGuide.light || "";
    const water = fullCareGuide.water || "";
    const humidity = fullCareGuide.humidity || "";
    const temperature = fullCareGuide.temperature || "";
    const soil = fullCareGuide.soil || "";
    const fertilizer = fullCareGuide.fertilizer || "";

    const detailedCareText = [
      light ? `Light: ${light}` : "",
      water ? `Water: ${water}` : "",
      humidity ? `Humidity: ${humidity}` : "",
      temperature ? `Temperature: ${temperature}` : "",
      soil ? `Soil: ${soil}` : "",
      fertilizer ? `Fertilizer: ${fertilizer}` : "",
      petSafety ? `Pet safety: ${petSafety}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    res.json({
      name,
      scientificName,
      careSummary,
      petSafety,
      detailedCare: detailedCareText,
      details: detailedCareText,
      guide: detailedCareText,
      light,
      water,
      humidity,
      temperature,
      soil,
      fertilizer,
    });
  } catch (error) {
    console.error("IDENTIFY ERROR:", error);
    res.status(500).json({
      error: "Identify failed",
      details: error?.message || String(error),
    });
  }
});

// =======================
// ZONE PLANTS
// =======================
app.post("/zone-plants", async (req, res) => {
  try {
    const { zone, exclude = [] } = req.body;

    if (!zone) {
      return res.status(400).json({ error: "Missing zone" });
    }

    const excludeText = Array.isArray(exclude) && exclude.length
      ? `Avoid repeating these plants: ${exclude.join(", ")}.`
      : "";

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: `Give me exactly 5 plant recommendations for USDA hardiness zone ${zone}.

Respond ONLY as valid JSON in this exact format:
{
  "plants": [
    {
      "name": "plant name",
      "scientificName": "scientific name if known",
      "summary": "one short reason it suits this zone",
      "imageQuery": "best search phrase for a photo of this plant"
    }
  ]
}

Rules:
- Exactly 5 plants
- Good choices for the zone
- Diverse suggestions
- imageQuery should be short and photo-friendly
- No markdown
- JSON only
${excludeText}`,
    });

    const raw =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    console.log("RAW ZONE RESPONSE:", raw);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { plants: [] };
    }

    const plants = Array.isArray(parsed.plants) ? parsed.plants : [];

    res.json({ plants });
  } catch (error) {
    console.error("ZONE ERROR:", error);
    res.status(500).json({
      error: "Zone AI failed",
      details: error?.message || String(error),
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
