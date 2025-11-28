const fs = require('fs');
const path = require('path');

function readEnv() {
    try {
        const envPath = path.resolve(__dirname, '.env');
        const envContent = fs.readFileSync(envPath, 'utf8');
        const env = {};
        envContent.split('\n').forEach(line => {
            const match = line.match(/^\s*([^=]+)\s*=\s*(.*)$/);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                env[key] = value;
            }
        });
        console.log("Found keys in .env:", Object.keys(env));
        return env;
    } catch (error) {
        return {};
    }
}

const env = readEnv();
const API_KEY = env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("GEMINI_API_KEY not found in .env");
    process.exit(1);
}

async function testDirectGemini() {
    console.log("Testing Gemini API directly...");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${API_KEY}`;

    const body = {
        contents: [{
            parts: [{ text: "What is the current price of Bitcoin right now?" }]
        }],
        tools: [{
            google_search_retrieval: {}
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        console.log("Response:", JSON.stringify(data, null, 2));

        if (data.candidates && data.candidates[0].groundingMetadata) {
            console.log("\n🌟 Grounding Metadata Found!");
        } else {
            console.log("\nNo grounding metadata.");
        }

    } catch (error) {
        console.error("Error:", error.message);
    }
}

testDirectGemini();
