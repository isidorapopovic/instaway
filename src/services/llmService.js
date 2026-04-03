// src/services/llmService.js
const OpenAI = require('openai');

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function getChatbotDecision(messages, tools) {
    const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.2,
    });

    return response.choices[0].message;
}

module.exports = { getChatbotDecision };