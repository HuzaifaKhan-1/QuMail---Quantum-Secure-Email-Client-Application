import 'dotenv/config';

async function listModels() {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    console.error("No GEMINI_API_KEY found in .env");
    return;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  
  try {
    console.log("Fetching available models for this key...");
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.models) {
      console.log("SUCCESS! Available models:");
      data.models.forEach((m: any) => {
        console.log(`- ${m.name}`);
      });
    } else {
      console.log("No models returned. Full response:");
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("Failed to list models:", error);
  }
}

listModels();
