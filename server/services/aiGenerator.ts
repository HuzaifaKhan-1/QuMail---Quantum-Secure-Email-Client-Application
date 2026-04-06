import { z } from "zod";

export const aiGenerateRequestSchema = z.object({
  context: z.string().min(1, "Context is required"),
  tone: z.string().default("Professional"),
  details: z.string().optional().default(""),
});

export type AiGenerateRequest = z.infer<typeof aiGenerateRequestSchema>;

export interface AiGenerateResponse {
  subject: string;
  body: string;
}

class AiGenerator {
  private lastUsedModel: string = "gemini-1.5-flash";

  async generateEmail(request: AiGenerateRequest): Promise<AiGenerateResponse> {
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured. Please add it to your .env file.");
    }

    const { context, tone, details } = request;
    const prompt = `Write a ${tone} email based on the following context: ${context}. Details: ${details}. Return JSON with "subject" and "body" keys.`;

    // 1. Try our preference list first
    const modelsToTry = [this.lastUsedModel, "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-1.0-pro", "gemini-1.5-flash-8b"];
    
    // 2. Discover available models if the above fail
    try {
      console.log("AI Generation: Checking for available models via API...");
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const listResponse = await fetch(listUrl);
      const listData = await listResponse.json();
      
      if (listData.models) {
        const discovered = listData.models
          .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
          .map((m: any) => m.name);
          
        console.log("AI Generation: Discovered models:", discovered);
        // Add discovered models to try list, but keep our preferences at the top
        for (const m of discovered) {
          if (!modelsToTry.includes(m)) modelsToTry.push(m);
        }
      }
    } catch (discoveryErr) {
      console.error("AI Generation: Model discovery failed:", discoveryErr);
    }

    let lastError: any = null;

    for (const modelId of modelsToTry) {
      if (!modelId) continue;
      
      try {
        console.log(`AI Generation: Attempting with model ${modelId}...`);
        const fullModelPath = modelId.startsWith("models/") ? modelId : `models/${modelId}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/${fullModelPath}:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error(`Model ${modelId} failed:`, errorData);
          lastError = errorData?.error?.message || response.statusText;
          continue; 
        }

        const data = await response.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textResponse) continue;

        this.lastUsedModel = modelId;

        let cleanJson = textResponse.trim();
        if (cleanJson.startsWith("```json")) {
          cleanJson = cleanJson.replace(/^```json/, "").replace(/```$/, "").trim();
        } else if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson.replace(/^```/, "").replace(/```$/, "").trim();
        }

        const parsed = JSON.parse(cleanJson);
        return {
          subject: parsed.subject || "No Subject Generated",
          body: parsed.body || "No Body Generated",
        };
      } catch (err: any) {
        lastError = err.message;
        console.error(`Error with ${modelId}:`, err);
      }
    }

    throw new Error(`AI Generation failed for all models. Last error: ${lastError}`);
  }
}

export const aiGenerator = new AiGenerator();
