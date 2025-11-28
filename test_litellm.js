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
                // Remove quotes if present
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
// Prioritize LITELLM_API_KEY as requested by user
const MASTER_KEY = env.LITELLM_API_KEY || env.LITELLM_MASTER_KEY || 'sk-1234';

// Use production URL if available, otherwise fallback to local
let BASE_URL = env.LITELLM_API_SWAGGER_URL || `http://localhost:4000`;

// Remove trailing slash if present
if (BASE_URL.endsWith('/')) {
    BASE_URL = BASE_URL.slice(0, -1);
}

console.log(`Testing LiteLLM at ${BASE_URL} with key: ${MASTER_KEY.substring(0, 4)}...`);

async function testLiteLLM() {
    try {
        // 1. List Models
        console.log('\n--- 1. Listing Models ---');
        const modelsResponse = await fetch(`${BASE_URL}/v1/models`, {
            headers: {
                'Authorization': `Bearer ${MASTER_KEY}`
            }
        });

        if (!modelsResponse.ok) {
            throw new Error(`Failed to list models: ${modelsResponse.status} ${modelsResponse.statusText}`);
        }

        const modelsData = await modelsResponse.json();
        console.log('Available Models:', JSON.stringify(modelsData, null, 2));

        const providers = [
            { name: 'OpenAI', pattern: /gpt/i },
            { name: 'Anthropic', pattern: /claude/i },
            { name: 'Gemini', pattern: /gemini/i }
        ];

        for (const provider of providers) {
            console.log(`\n--- Testing Provider: ${provider.name} ---`);

            const model = modelsData.data.find(m => provider.pattern.test(m.id));

            if (!model) {
                console.log(`No model found for ${provider.name}`);
                continue;
            }

            const modelToTest = model.id;
            console.log(`Selected model: ${modelToTest}`);

            try {
                const chatResponse = await fetch(`${BASE_URL}/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${MASTER_KEY}`
                    },
                    body: JSON.stringify({
                        model: modelToTest,
                        messages: [
                            { role: "user", content: "Hello! Just checking if you are working." }
                        ]
                    })
                });

                if (!chatResponse.ok) {
                    const errorText = await chatResponse.text();
                    throw new Error(`Chat completion failed: ${chatResponse.status} ${chatResponse.statusText} - ${errorText}`);
                }

                const chatData = await chatResponse.json();
                console.log(`${provider.name} Response:`, JSON.stringify(chatData, null, 2));
                console.log(`SUCCESS: ${provider.name} is working!`);

            } catch (error) {
                console.error(`ERROR testing ${provider.name}:`, error.message);
            }
        }

        // 3. Test Prompt Caching (Multi-turn)
        console.log('\n--- 3. Testing Prompt Caching (Multi-turn) ---');
        const largeContext = "This is a large context block to trigger caching. ".repeat(200); // ~2000 chars

        const cachingTests = [
            {
                provider: 'Anthropic',
                pattern: /claude/i,
                useCacheControl: true
            },
            {
                provider: 'OpenAI',
                pattern: /gpt/i,
                useCacheControl: false // OpenAI caches automatically
            },
            {
                provider: 'Gemini',
                pattern: /gemini-3-pro-preview/i,
                useCacheControl: false // Testing if automatic or needs config
            }
        ];

        for (const testConfig of cachingTests) {
            const model = modelsData.data.find(m => testConfig.pattern.test(m.id));

            if (!model) {
                console.log(`\nSkipping ${testConfig.provider}: No model found.`);
                continue;
            }

            console.log(`\nTesting caching for ${testConfig.provider} with model: ${model.id}`);

            let messages = [];

            // Simulating 3 turns
            for (let i = 1; i <= 3; i++) {
                console.log(`  Turn ${i}...`);

                // Gemini requires ~4096+ tokens for caching. We'll use a larger context for it.
                let contextToUse = largeContext;
                if (testConfig.provider === 'Gemini') {
                    contextToUse = largeContext.repeat(5); // ~10k chars -> ~2.5k tokens (still might be low, let's bump it)
                    contextToUse = "This is a large context block to trigger caching. ".repeat(1000); // ~10k tokens
                }

                const userContent = [
                    {
                        type: "text",
                        text: `Turn ${i} Content: ${contextToUse}`
                    }
                ];

                // Add cache_control if needed (Anthropic)
                if (testConfig.useCacheControl) {
                    userContent[0].cache_control = { type: "ephemeral" };
                }

                messages.push({
                    role: "user",
                    content: userContent
                });

                try {
                    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${MASTER_KEY}`
                        },
                        body: JSON.stringify({
                            model: model.id,
                            messages: messages
                        })
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`Request failed: ${response.status} - ${errorText}`);
                    }

                    const data = await response.json();

                    // Check for cache hits in various provider formats
                    let isCacheHit = false;
                    let cachedTokens = 0;

                    if (data.usage) {
                        if (data.usage.prompt_tokens_details?.cached_tokens > 0) {
                            isCacheHit = true;
                            cachedTokens = data.usage.prompt_tokens_details.cached_tokens;
                        } else if (data.usage.cache_read_input_tokens > 0) {
                            isCacheHit = true;
                            cachedTokens = data.usage.cache_read_input_tokens;
                        }
                    }

                    if (isCacheHit) {
                        console.log(`    🌟 CACHE HIT! (${cachedTokens} tokens)`);
                    } else {
                        console.log(`    Cache Miss.`);
                    }

                    // Add Assistant Response to history
                    const assistantContent = data.choices[0].message.content;
                    messages.push({
                        role: "assistant",
                        content: assistantContent
                    });

                } catch (error) {
                    console.error(`    Error:`, error.message);
                    break;
                }
            }
        }
    } catch (error) {
        console.error('\nERROR:', error.message);
        if (error.cause) console.error('Cause:', error.cause);
    }
}

testLiteLLM();
