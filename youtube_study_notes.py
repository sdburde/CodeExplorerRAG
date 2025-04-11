import os
import re
import json
import uuid
from datetime import datetime
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain.document_loaders import YoutubeLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.prompts import PromptTemplate
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, AIMessage
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
import streamlit as st

# Load environment variables
load_dotenv()

# Constants
CHAT_HISTORY_DIR = "yt_chat_histories"
os.makedirs(CHAT_HISTORY_DIR, exist_ok=True)

# Available models
MODELS = {
    "llama-3.1-8b-instant": "deepseek-r1-distill-llama-70b",
    "llama-3.3-70b-versatile": "Llama 3 70B (Versatile)",
    "llama3-70b-8192": "Llama 3 70B (Long Context)",
    "mixtral-8x7b-32768": "Mixtral 8x7B",
    "gemma2-9b-it": "Gemma 2 9B",
}

def extract_video_id(url):
    """Extract video ID from YouTube URL"""
    pattern = r'(?:v=|\/)([0-9A-Za-z_-]{11}).*'
    match = re.search(pattern, url)
    if match:
        return match.group(1)
    raise ValueError("Invalid YouTube URL")

def get_video_transcript(video_url: str):
    """Get transcript with multiple fallback methods"""
    video_id = extract_video_id(video_url)
    
    try:
        # Try official transcript API first
        transcript_data = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
        return " ".join([chunk['text'] for chunk in transcript_data])
    
    except (TranscriptsDisabled, NoTranscriptFound):
        # Fallback to YoutubeLoader
        try:
            loader = YoutubeLoader.from_youtube_url(video_url, language='en')
            docs = loader.load()
            if docs and docs[0].page_content:
                return docs[0].page_content
        except Exception:
            return None
    
    except Exception:
        return None

def create_study_notes(transcript: str, model_name: str, temperature: float):
    """Generate structured study notes from transcript"""
    # Initialize model with selected parameters
    model = ChatGroq(
        model_name=model_name,
        groq_api_key=os.getenv("GROQ_API_KEY"),
        temperature=temperature
    )
    
    # Split transcript into manageable chunks
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=4000,
        chunk_overlap=200,
        length_function=len
    )
    docs = text_splitter.split_documents([Document(page_content=transcript)])
    
    # Define the study notes prompt
    prompt = PromptTemplate.from_template("""
    Create comprehensive yet concise study notes from this video content.
    Focus on key concepts, important facts, and actionable insights.
    Use markdown formatting with headings, bullet points, and bold for emphasis.
    
    Video Content:
    {text}
    
    Structured Study Notes:
    """)
    
    # Process each chunk and combine results
    notes = []
    for doc in docs:
        chain = prompt | model
        notes.append(chain.invoke({"text": doc.page_content}).content)
    
    return "\n\n".join(notes)

def save_chat_history(session_id: str, messages: list, video_title: str = None):
    """Save chat history to JSON file"""
    filename = os.path.join(CHAT_HISTORY_DIR, f"{session_id}.json")
    data = {
        "session_id": session_id,
        "timestamp": datetime.now().isoformat(),
        "video_title": video_title,
        "messages": [{"type": msg.type, "content": msg.content} for msg in messages]
    }
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)

def load_chat_history(session_id: str):
    """Load chat history from JSON file"""
    filename = os.path.join(CHAT_HISTORY_DIR, f"{session_id}.json")
    if os.path.exists(filename):
        with open(filename, 'r') as f:
            data = json.load(f)
            messages = []
            for msg in data["messages"]:
                if msg["type"] == "human":
                    messages.append(HumanMessage(content=msg["content"]))
                else:
                    messages.append(AIMessage(content=msg["content"]))
            return messages, data.get("video_title", "Untitled Chat")
    return None, None

def get_saved_chats():
    """Get list of all saved chat sessions"""
    chats = []
    for filename in os.listdir(CHAT_HISTORY_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(CHAT_HISTORY_DIR, filename)
            try:
                with open(filepath, 'r') as f:
                    chat_data = json.load(f)
                    chats.append({
                        "session_id": chat_data["session_id"],
                        "timestamp": chat_data["timestamp"],
                        "video_title": chat_data.get("video_title", "Untitled Chat"),
                        "filename": filename
                    })
            except Exception:
                continue
    return sorted(chats, key=lambda x: x["timestamp"], reverse=True)

def main():
    """Streamlit application for YouTube Study Notes Creator"""
    st.set_page_config(
        page_title="YouTube Study Notes Creator",
        page_icon="📝",
        layout="centered"
    )
    
    # Initialize session state
    if "session_id" not in st.session_state:
        st.session_state.session_id = str(uuid.uuid4())
    if "messages" not in st.session_state:
        st.session_state.messages = []
    if "current_notes" not in st.session_state:
        st.session_state.current_notes = ""
    if "video_title" not in st.session_state:
        st.session_state.video_title = ""
    if "selected_model" not in st.session_state:
        st.session_state.selected_model = "llama-3.3-70b-versatile"
    if "temperature" not in st.session_state:
        st.session_state.temperature = 0.3
    
    st.title("📝 YouTube Study Notes Creator")
    st.markdown("Transform YouTube videos into concise study notes and chat with your notes")
    
    with st.sidebar:
        st.header("Settings")
        
        # Model selection
        st.session_state.selected_model = st.selectbox(
            "Select Model",
            options=list(MODELS.keys()),
            format_func=lambda x: MODELS[x],
            index=0
        )
        
        st.session_state.temperature = st.slider(
            "Creativity Level",
            min_value=0.0,
            max_value=1.0,
            value=0.3,
            step=0.1
        )
        
        # Chat history management
        st.divider()
        st.header("Chat Sessions")
        
        if st.button("➕ New Chat"):
            if st.session_state.messages:
                save_chat_history(
                    st.session_state.session_id,
                    st.session_state.messages,
                    st.session_state.video_title
                )
            st.session_state.session_id = str(uuid.uuid4())
            st.session_state.messages = []
            st.session_state.current_notes = ""
            st.rerun()
        
        saved_chats = get_saved_chats()
        if saved_chats:
            for chat in saved_chats:
                if st.button(f"{chat['video_title']} ({chat['timestamp'][:10]})"):
                    messages, title = load_chat_history(chat["session_id"])
                    st.session_state.session_id = chat["session_id"]
                    st.session_state.messages = messages
                    st.session_state.video_title = title
                    st.session_state.current_notes = next(
                        (msg.content for msg in messages if isinstance(msg, AIMessage) and "Study Notes" in msg.content),
                        ""
                    )
                    st.rerun()
    
    # Main content area
    tab1, tab2 = st.tabs(["Generate Notes", "Chat with Notes"])
    
    with tab1:
        # Get YouTube URL from user
        video_url = st.text_input(
            "Enter YouTube Video URL:",
            placeholder="https://www.youtube.com/watch?v=...",
            key="video_url"
        )
        
        if st.button("Generate Study Notes") and video_url:
            with st.spinner("Extracting transcript and generating notes..."):
                try:
                    # Get transcript
                    transcript = get_video_transcript(video_url)
                    if not transcript:
                        st.error("Could not retrieve transcript. Try a different video with captions.")
                        return
                    
                    # Generate notes
                    notes = create_study_notes(
                        transcript,
                        st.session_state.selected_model,
                        st.session_state.temperature
                    )
                    
                    # Store notes in session state
                    st.session_state.current_notes = notes
                    st.session_state.video_title = f"Notes from {video_url}"
                    
                    # Display results
                    st.subheader("Generated Study Notes")
                    st.markdown(notes, unsafe_allow_html=True)
                    
                    # Download button
                    st.download_button(
                        label="Download Notes",
                        data=notes,
                        file_name="study_notes.md",
                        mime="text/markdown"
                    )
                    
                    # Add notes to chat history
                    st.session_state.messages.append(
                        AIMessage(content=f"Study Notes:\n\n{notes}")
                    )
                    
                except Exception as e:
                    st.error(f"An error occurred: {str(e)}")
    
    with tab2:
        if not st.session_state.current_notes:
            st.info("Generate study notes first to enable chat")
        else:
            st.subheader(f"Chatting with: {st.session_state.video_title}")
            
            # Display chat messages
            for message in st.session_state.messages:
                if isinstance(message, HumanMessage):
                    with st.chat_message("user"):
                        st.markdown(message.content)
                else:
                    with st.chat_message("assistant"):
                        st.markdown(message.content)
            
            # Chat input
            if prompt := st.chat_input("Ask about the video content..."):
                # Add user message to chat history
                st.session_state.messages.append(HumanMessage(content=prompt))
                
                with st.chat_message("user"):
                    st.markdown(prompt)
                
                with st.spinner("Thinking..."):
                    try:
                        # Initialize model with current settings
                        model = ChatGroq(
                            model_name=st.session_state.selected_model,
                            groq_api_key=os.getenv("GROQ_API_KEY"),
                            temperature=st.session_state.temperature
                        )
                        
                        # Create context-aware prompt
                        chat_prompt = f"""
                        Context from video notes:
                        {st.session_state.current_notes}
                        
                        User Question:
                        {prompt}
                        
                        Answer the question based on the video content:
                        """
                        
                        # Get response
                        response = model.invoke(chat_prompt)
                        
                        # Add AI response to chat history
                        st.session_state.messages.append(AIMessage(content=response.content))
                        
                        with st.chat_message("assistant"):
                            st.markdown(response.content)
                        
                        # Auto-save chat
                        save_chat_history(
                            st.session_state.session_id,
                            st.session_state.messages,
                            st.session_state.video_title
                        )
                        
                    except Exception as e:
                        st.error(f"Error generating response: {str(e)}")

if __name__ == "__main__":
    main()