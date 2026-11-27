"""
Langfuse Integration for QuickVoice
Using the @observe() decorator as shown in the Langfuse repo
"""
import os
from dotenv import load_dotenv
from langfuse import observe
from langfuse.openai import openai  # For OpenAI integration if used

# Load environment variables from .env.dev
load_dotenv('.env.dev')

# Verify environment variables are loaded
print(f"🔑 LANGFUSE_PUBLIC_KEY: {os.getenv('LANGFUSE_PUBLIC_KEY', 'NOT SET')[:20]}..." if os.getenv('LANGFUSE_PUBLIC_KEY') else "❌ LANGFUSE_PUBLIC_KEY: NOT SET")
print(f"🔑 LANGFUSE_SECRET_KEY: {os.getenv('LANGFUSE_SECRET_KEY', 'NOT SET')[:20]}..." if os.getenv('LANGFUSE_SECRET_KEY') else "❌ LANGFUSE_SECRET_KEY: NOT SET")
print(f"🌐 LANGFUSE_BASE_URL: {os.getenv('LANGFUSE_BASE_URL', 'NOT SET')}")

@observe()
def process_voice_call(audio_data):
    """
    Main voice call processing function.
    This will be traced in Langfuse.
    """
    print("\n📞 Processing voice call...")
    
    # Step 1: Simulate STT (Speech-to-Text)
    transcript = transcribe_audio(audio_data)
    
    # Step 2: Generate LLM response
    response = generate_response(transcript)
    
    # Step 3: Execute any tools
    result = execute_tools(response)
    
    return {"transcript": transcript, "response": response, "result": result}

@observe()
def transcribe_audio(audio_data):
    """Simulate speech-to-text processing"""
    print("🔊 Transcribing audio...")
    # In real implementation: call Deepgram or other STT provider
    return "I'd like to schedule an appointment for next Tuesday at 2 PM"

@observe()
def generate_response(transcript):
    """Generate AI response using LLM"""
    print(f"🤖 Generating response for: {transcript}")
    
    # In real implementation, you would call your LLM
    # For demo, we simulate:
    response = f"Sure, I can help you schedule an appointment for next Tuesday at 2 PM. What's your name?"
    
    # Optional: Use Langfuse's OpenAI integration
    # if os.getenv("OPENAI_API_KEY"):
    #     response = openai.chat.completions.create(
    #         model="gpt-4o",
    #         messages=[{"role": "user", "content": transcript}],
    #     ).choices[0].message.content
    
    return response

@observe()
def execute_tools(response):
    """Execute any tools/actions needed"""
    print("🔧 Executing tools...")
    # Simulate scheduling an appointment
    return {"appointment_id": "apt-12345", "status": "confirmed"}

@observe()
def main_demo():
    """Run a complete demo call"""
    print("\n" + "="*50)
    print("🚀 Running QuickVoice + Langfuse Integration")
    print("="*50 + "\n")
    
    # Simulate incoming audio data
    audio_data = {"duration": 3.5, "format": "wav"}
    
    # Process the call
    result = process_voice_call(audio_data)
    
    print("\n✅ Call processed successfully!")
    print(f"📝 Transcript: {result['transcript']}")
    print(f"🤖 Response: {result['response']}")
    print(f"🔧 Result: {result['result']}")
    print("\n📊 Check the Langfuse dashboard for traces!")
    print("="*50 + "\n")
    
    return result

if __name__ == "__main__":
    # Check if Langfuse is configured
    if not os.getenv("LANGFUSE_PUBLIC_KEY"):
        print("❌ ERROR: LANGFUSE_PUBLIC_KEY is not set!")
        print("Please add your Langfuse keys to .env.dev")
        print("\nExample:")
        print("LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
        print("LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
        print("LANGFUSE_BASE_URL=https://cloud.langfuse.com")
        print("\nNote: Make sure the .env.dev file is in the current directory.")
    else:
        main_demo()