"""
Adapter to call the ai-chat Supabase edge function from WhatsApp Lambda.
Used instead of calling Gemini directly, to share the same AI brain as the web app.
"""
import os
import requests

AI_CHAT_URL = os.environ.get(
    "AI_CHAT_URL",
    "https://aqpzhflzsqkjceeeufyf.supabase.co/functions/v1/ai-chat",
)
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def call_ai_chat(user_id, trip_id, messages, trip_context, source="whatsapp", mode="chat"):
    """Call the ai-chat edge function and return {"message": str, "toolCalls": [...]}.

    Args:
        user_id:      Supabase user UUID
        trip_id:      Trip UUID
        messages:     List of {"role": "user"|"assistant", "content": str}
        trip_context: TripContext dict (see _build_trip_context in chat_handler)
        source:       Source identifier, default "whatsapp"
        mode:         Chat mode, default "chat"

    Returns:
        dict with keys "message" (str) and "toolCalls" (list or None)

    Raises:
        requests.HTTPError on non-2xx response
    """
    payload = {
        "messages": messages,
        "tripContext": trip_context,
        "mode": mode,
        "serviceUserId": user_id,
        "tripId": trip_id,
        "persistHistory": True,
        "source": source,
    }
    resp = requests.post(
        AI_CHAT_URL,
        json=payload,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
        },
        timeout=25,
    )
    resp.raise_for_status()
    return resp.json()  # expects {"message": str, "toolCalls": [...] | null}
