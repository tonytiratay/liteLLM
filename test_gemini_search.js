const fs = require('fs');
const path = require('path');

// Function to read .env file manually
function readEnv() {
    try {
        const envPath = path.resolve(__dirname, '.env');
        const envContent = fs.readFileSync(envPath, 'utf8');
        const env = {};
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                env[key] = value;
            }
        });
        return env;
    } catch (error) {
        console.error('Error reading .env file:', error.message);
        return {};
    }
}

const env = readEnv();
const MASTER_KEY = env.LITELLM_API_KEY || env.LITELLM_MASTER_KEY || 'sk-1234';
let BASE_URL = env.LITELLM_API_SWAGGER_URL || `http://localhost:4000`;
if (BASE_URL.endsWith('/')) {
    BASE_URL = BASE_URL.slice(0, -1);
}

async function testGeminiSearch() {
    console.log(`Testing Gemini Search at ${BASE_URL}...`);
    const model = "gemini/gemini-2.5-pro";

    // Query that likely requires search
    const query = "What is the current price of Bitcoin right now? Please use Google Search.";

    try {
        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MASTER_KEY}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "user", content: query }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Request failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log("Response:", JSON.stringify(data, null, 2));

        const content = data.choices[0].message.content;
        console.log("\n--- Content ---");
        console.log(content);

        // Check for grounding metadata if available (LiteLLM might pass it through)
        if (data.choices[0].message.grounding_metadata) {
            console.log("\n🌟 Grounding Metadata Found:", JSON.stringify(data.choices[0].message.grounding_metadata, null, 2));
        }

    } catch (error) {
        console.error("Error:", error.message);
    }
}

testGeminiSearch();
