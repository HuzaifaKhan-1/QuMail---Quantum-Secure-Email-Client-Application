import 'dotenv/config';

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No GEMINI_API_KEY found in .env");
    return;
  }

  const prompt = `Write a short test email. Return JSON: {"subject": "test", "body": "test"}`;

  console.log("Testing with key:", apiKey.substring(0, 5) + "...");
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            // response_mime_type: "application/json",
          },
        }),
      }
    );

    const data = await response.json();
    console.log("Response Status:", response.status);
    console.log("Response Body:", JSON.stringify(data, null, 2));

    if (data.candidates && data.candidates[0]) {
      console.log("Success! Text:", data.candidates[0].content.parts[0].text);
    } else {
      console.log("No candidates found. Full response printed above.");
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testGemini();
