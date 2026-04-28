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
    const { plantName, plant, zone } = req.body;
    const finalPlant = plantName || plant;

    if (!finalPlant || !zone) {
      return res.status(400).json({ error: "Missing plant name or zone" });
    }

    const prompt = `
Does "${finalPlant}" grow well in USDA hardiness zone ${zone}?

Return ONLY JSON:
{
  "match": true,
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

    const parsed = extractJSON(raw);

    res.json({
      match: Boolean(parsed.match),
      reason: parsed.reason || "",
    });
  } catch (error) {
    console.error("ZONE CHECK ERROR:", error);
    res.status(500).json({ error: "Zone check failed" });
  }
});

// 🌿 PLANTING ZONE
app.post("/planting-zone", async (req, res) => {
  try {
    const { plantName, plant } = req.body;
    const finalPlant = plantName || plant;

    if (!finalPlant || !String(finalPlant).trim()) {
      return res.status(400).json({ error: "Missing plant name." });
    }

    const prompt = `
For the plant "${finalPlant}", return the USDA outdoor hardiness zone range.

Return ONLY JSON:
{
  "plantingZone": "10b-12"
}

Rules:
- Use the standard USDA outdoor hardiness zone range.
- Return a range like "10b-12" or a single zone like "9a".
- Do not include words like "Zones" or any explanation.
- This is for outdoor climate hardiness, not indoor placement.
- If the plant is commonly grown as a houseplant, still return the outdoor hardiness range where it can live outdoors year-round.
- If truly unknown, return:
{
  "plantingZone": ""
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

    const parsed = extractJSON(raw);

    console.log("planting-zone result:", parsed.plantingZone || "");

    return res.json({
      plantingZone: parsed.plantingZone || "",
    });
  } catch (error) {
    console.error("PLANTING-ZONE ERROR:", error);
    return res.status(500).json({
      error: "Failed to get planting zone.",
      details: error?.message || String(error),
    });
  }
});

// 🌿 CARE FROM NAME
app.post("/care-from-name", async (req, res) => {
  try {
    const { plantName } = req.body;

    if (!plantName || !String(plantName).trim()) {
      return res.status(400).json({ error: "Missing plant name" });
    }

    const prompt = `
For the plant "${plantName}", return ONLY valid JSON in this exact format:

{
  "commonName": "string",
  "scientificName": "string",
  "light": "short helpful sentence",
  "wateringSummary": "short helpful sentence",
  "wateringIntervalDays": 7,
  "humidity": "short helpful sentence",
  "soil": "short helpful sentence",
  "petSafety": "short helpful sentence",
  "careSummary": "short helpful sentence",
  "interestingFacts": ["fact 1", "fact 2", "fact 3"],
  "pestWatch": [
    {
      "name": "pest name",
      "signs": "short signs to watch for",
      "treatment": "short treatment tip",
      "url": "https://example.com"
    }
  ]
}

Rules:
- Return JSON only.
- Keep all fields present.
- Rewrite the careSummary and interestingFacts freshly each time with slightly different wording and focus.
- Keep responses concise, beginner-friendly, and natural.
- Do not mention that you are refreshing or rewriting.
- If unsure, still provide your best estimate.
- If no pests are especially likely, return an empty pestWatch array.
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const raw =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    const parsed = extractJSON(raw);

    res.json({
      commonName: parsed.commonName || plantName,
      scientificName: parsed.scientificName || "",
      light: parsed.light || "",
      wateringSummary: parsed.wateringSummary || "",
      wateringIntervalDays:
        typeof parsed.wateringIntervalDays === "number"
          ? parsed.wateringIntervalDays
          : 7,
      humidity: parsed.humidity || "",
      soil: parsed.soil || "",
      petSafety: parsed.petSafety || "",
      careSummary: parsed.careSummary || "",
      interestingFacts: Array.isArray(parsed.interestingFacts)
        ? parsed.interestingFacts
        : [],
      pestWatch: Array.isArray(parsed.pestWatch)
        ? parsed.pestWatch.map((item) => ({
            name: item?.name || "",
            signs: item?.signs || "",
            treatment: item?.treatment || "",
            url: item?.url || "",
          }))
        : [],
    });
  } catch (error) {
    console.error("CARE FROM NAME ERROR:", error);
    res.status(500).json({
      error: "Care from name failed",
      details: error?.message || String(error),
    });
  }
});

// 🌼 IDENTIFY
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
text: `
Identify this plant from the image and return ONLY valid JSON in this exact format:

{
  "commonName": "string",
  "scientificName": "string",
  "confidence": "low, medium, or high",
  "light": "short helpful sentence",
  "wateringSummary": "short helpful sentence",
  "wateringIntervalDays": 7,
  "humidity": "short helpful sentence",
  "soil": "short helpful sentence",
  "petSafety": "short helpful sentence",
  "careSummary": "short helpful sentence",
  "plantingZone": "10b-12",
  "preferredOutdoorTempC": 12,
  "interestingFacts": ["fact 1", "fact 2", "fact 3"],
  "pestWatch": [
    {
      "name": "pest name",
      "signs": "short signs to watch for",
      "treatment": "short treatment tip",
      "url": "https://example.com"
    }
  ]
}

Rules:
- Return JSON only.
- Keep all fields present.
- If unsure, still provide your best estimate.
- "plantingZone" must be a USDA outdoor hardiness range like "10b-12" or a single zone like "9a".
- For houseplants, tropicals, succulents, cacti, bonsai, and indoor ornamentals, still return the outdoor USDA hardiness zone range where they can survive outdoors year-round.
- Do NOT leave "plantingZone" blank unless the plant truly cannot be identified at all.
- If no pests are especially likely, return an empty pestWatch array.
- Keep responses concise and beginner-friendly.
- "preferredOutdoorTempC" must be the approximate preferred outdoor temperature in degrees celcius, based on the scientific name.
`,
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

    const parsed = extractJSON(raw);

    if ((!parsed.plantingZone || parsed.preferredOutdoorTempC == null) && parsed.scientificName) {
  const zoneResponse = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `
For the plant "${parsed.scientificName}", return ONLY JSON:
{
  "plantingZone": "10b-12",
  "preferredOutdoorTempC": 12
}

Rules:
- Return the USDA outdoor hardiness range.
- Use a range like "10b-12" or a single zone like "9a".
- "preferredOutdoorTempC" must be an integer in degrees Celsius based on the scientific name.
- Do not include explanation text.
- If truly unknown, return:
{
  "plantingZone": ""
  "preferredOutdoorTempC": null
}
`,
  });

  const zoneRaw =
    zoneResponse.output_text ||
    zoneResponse.output?.[0]?.content?.[0]?.text ||
    "";

  const zoneParsed = extractJSON(zoneRaw);
      parsed.plantingZone = parsed.plantingZone || zoneParsed.plantingZone || "";
      parsed.preferredOutdoorTempC = parsed.preferredOutdoorTempC ?? zoneParsed.preferredOutdoorTempC ?? null;}

    console.log("identify plantingZone:", parsed.plantingZone || "");
    console.log("identify preferredOutdoorTempC:", parsed.preferredOutdoorTempC);
    

    res.json({
      commonName: parsed.commonName || "",
      scientificName: parsed.scientificName || "",
      confidence: parsed.confidence || "medium",
      light: parsed.light || "",
      wateringSummary: parsed.wateringSummary || "",
      wateringIntervalDays:
        typeof parsed.wateringIntervalDays === "number"
          ? parsed.wateringIntervalDays
          : 7,
      humidity: parsed.humidity || "",
      soil: parsed.soil || "",
      petSafety: parsed.petSafety || "",
      careSummary: parsed.careSummary || "",
      plantingZone: parsed.plantingZone || "",
      preferredOutdoorTempC: parsed.preferredOutdoorTempC ?? null, 
      interestingFacts: Array.isArray(parsed.interestingFacts)
        ? parsed.interestingFacts
        : [],
      pestWatch: Array.isArray(parsed.pestWatch)
        ? parsed.pestWatch.map((item) => ({
            name: item?.name || "",
            signs: item?.signs || "",
            treatment: item?.treatment || "",
            url: item?.url || "",
          }))
        : [],
    });
  } catch (error) {
    console.error("IDENTIFY ERROR:", error);
    res.status(500).json({
      error: "Identify failed",
      details: error?.message || String(error),
    });
  }
});

// 🌿 HELP MY PLANT
app.post("/help-my-plant", async (req, res) => {
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
              text: `
Look at this plant photo and return ONLY valid JSON in this format:
{
  "plantName": "name of plant if known, otherwise empty string",
  "issue": "short description of the most likely problem",
  "summary": "kind, helpful 1-2 sentence overview",
  "careTips": [
    "tip 1",
    "tip 2",
    "tip 3"
  ]
}
`,
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

    const parsed = extractJSON(raw);

    res.json({
      plantName: parsed.plantName || "",
      issue: parsed.issue || "",
      summary: parsed.summary || "",
      careTips: Array.isArray(parsed.careTips) ? parsed.careTips : [],
    });
  } catch (error) {
    console.error("HELP MY PLANT ERROR:", error);
    res.status(500).json({
      error: "Help My Plant failed",
      details: error?.message || String(error),
    });
  }
});

app.post("/pest-help", async (req, res) => {
  try {
    const plantName = req.body.plantName || "";
    const scientificName = req.body.scientificName || "";
    const pestName = req.body.pestName || "";

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: `
For the plant "${scientificName || plantName}" and the pest "${pestName}", return ONLY valid JSON:

{
  "name": "${pestName}",
  "signs": "short signs to watch for",
  "treatment": "short practical treatment steps",
  "url": "https://example.com"
}

Rules:
- Return JSON only.
- Keep all fields present.
- "treatment" should be concise, practical, and beginner-friendly.
- "url" must be a real helpful source about treating that pest.
`
    });

    const raw =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    const parsed = extractJSON(raw);

    return res.json({
      name: parsed.name || pestName,
      signs: parsed.signs || "",
      treatment: parsed.treatment || "",
      url: parsed.url || ""
    });
  } catch (error) {
    console.error("PEST HELP ERROR:", error);
    return res.status(500).json({
      error: "Failed to generate pest help.",
      details: error?.message || String(error)
    });
  }
});

// 🚀 START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
