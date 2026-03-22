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
// ASK (general AI)
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
// IDENTIFY (photo → plant)
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
// ZONE AI (NEW)
// =======================
app.post("/zone-plants", async (req, res) => {
  try {
    const { zone } = req.body;

    if (!zone) {
      return res.status(400).json({ error: "Missing zone" });
    }

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: `Give me 8 outdoor plants suitable for USDA hardiness zone ${zone}.
Return ONLY a clean list like:
- Plant name — short care note`,
    });

    const text =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "No suggestions";

    res.json({ result: text });

  } catch (error) {
    console.error("ZONE ERROR:", error);
    res.status(500).json({ error: "Zone AI failed" });
  }
});


// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
