async function callAI() {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": "Bearer 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",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "qwen/qwen3-vl-30b-a3b-thinking",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "What is in this image?"
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": "https://live.staticflickr.com/3851/14825276609_098cac593d_b.jpg"
                                }
                            }
                        ]
                    }
                ]
            })
        });
        const data = await response.json();
        return (data.choices[0].message.content);
    } catch (error) {
        console.error("Error calling AI:", error);
    }
}
callAI();