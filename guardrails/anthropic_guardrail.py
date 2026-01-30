from litellm.integrations.custom_guardrail import CustomGuardrail
import json

class AnthropicGuardrail(CustomGuardrail):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    async def async_pre_call_hook(self, user_api_key: str, cache, data: dict, call_type: str):
        """
        Strip empty text content blocks from messages to avoid Anthropic 400 errors.
        """
        if "messages" in data:
            for message in data["messages"]:
                if isinstance(message.get("content"), list):
                    # Filter out text blocks that are empty strings or whitespace only
                    new_content = []
                    for block in message["content"]:
                        if isinstance(block, dict) and block.get("type") == "text":
                            text_content = block.get("text", "")
                            if text_content and text_content.strip():
                                new_content.append(block)
                        else:
                            # Keep non-text blocks (like images)
                            new_content.append(block)
                    
                    # Update content
                    message["content"] = new_content
        
        return data
