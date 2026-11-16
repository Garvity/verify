import { llm } from "./client.js";
import { MODEL_CONFIG } from "./model.js";

const response = await llm.chat.completions.create({
  model: MODEL_CONFIG.default!,
  messages: [
    {
      role: "user",
      content: "Reply with: verify gateway connected"
    }
  ]
});

console.log(response.choices[0]?.message.content);
console.log(response.usage);