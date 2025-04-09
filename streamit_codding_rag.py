import json
import os
import glob
import re
import uuid
from datetime import datetime
from typing import List, Dict, Optional
import streamlit as st
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_ollama import OllamaEmbeddings
from langchain.schema import Document
from langchain.tools.retriever import create_retriever_tool
from langchain.chains import RetrievalQA
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory
from streamlit_chat import message

# --------------------------
# Constants and Configuration
# --------------------------

CHAT_HISTORY_DIR = "chat_histories"
CHROMA_DB_DIR = "./chroma_db"
CODE_DIRECTORY = "otter-detection"
store = {}  # Global store for chat histories

# Ensure directories exist
os.makedirs(CHAT_HISTORY_DIR, exist_ok=True)
os.makedirs(CHROMA_DB_DIR, exist_ok=True)

# Load environment variables
load_dotenv()

# --------------------------
# Document Processing Functions
# --------------------------

def generate_tree_structure(directory: str) -> str:
    """Generate a textual representation of the directory tree."""
    tree = []
    for root, dirs, files in os.walk(directory):
        level = root.replace(directory, '').count(os.sep)
        indent = '  ' * level
        tree.append(f"{indent}{os.path.basename(root)}/")
        for f in files:
            tree.append(f"{indent}  {f}")
    return "\n".join(tree)

def infer_code_flow(files: List[str], directory: str) -> str:
    """Infer code flow by analyzing imports/requires in code files."""
    flow = []
    import_patterns = {
        'py': r"import\s+[\w.]+\s*(?:as\s+\w+)?|from\s+[\w.]+\s+import\s+[\w.*]+",
        'js': r"import\s+.*?\s+from\s+['\"].*?['\"]|require\(['\"].*?['\"]\)",
        'jsx': r"import\s+.*?\s+from\s+['\"].*?['\"]|require\(['\"].*?['\"]\)"
    }
    
    for file_path in files:
        ext = file_path.rsplit('.', 1)[-1] if '.' in file_path else ''
        if ext in import_patterns:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                imports = re.findall(import_patterns[ext], content)
                if imports:
                    rel_path = os.path.relpath(file_path, directory)
                    flow.append(f"{rel_path} depends on:")
                    for imp in imports:
                        flow.append(f"  - {imp.strip()}")
            except Exception as e:
                flow.append(f"Error analyzing {file_path}: {e}")
    return "\n".join(flow) if flow else "No detectable dependencies found."

def load_documents(directory: str = "code_folder") -> List[Document]:
    """Load and process code documents from a directory."""
    abs_dir = os.path.abspath(directory)
    if not os.path.isdir(abs_dir):
        raise ValueError(f"Directory '{abs_dir}' does not exist!")

    extensions = ("py", "js", "jsx", "ts", "java", "c", "cpp", "cs", "go", "rs", 
                 "php", "rb", "sh", "txt", "md", "html", "css", "yaml", "yml", "conf")
    matching_files = []
    for ext in extensions:
        matching_files.extend(glob.glob(os.path.join(directory, f"**/*.{ext}"), recursive=True))

    documents = []
    documents.append(Document(
        page_content=generate_tree_structure(directory),
        metadata={"source": "files tree"}
    ))
    documents.append(Document(
        page_content=infer_code_flow(matching_files, directory),
        metadata={"source": "code flow"}
    ))

    for file_path in matching_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            documents.append(Document(
                page_content=content,
                metadata={"source": os.path.relpath(file_path, directory)}
            ))
        except Exception as e:
            pass  # Silently skip files that can't be read
    
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)
    return text_splitter.split_documents(documents)

# --------------------------
# Vector Store Functions
# --------------------------

def create_vector_store(docs: List[Document], persist_dir: str) -> Chroma:
    """Create and persist a vector store from documents."""
    embeddings = OllamaEmbeddings(model="mxbai-embed-large")
    return Chroma.from_documents(
        documents=docs,
        embedding=embeddings,
        persist_directory=persist_dir
    )

def load_chroma_retriever(persist_dir: str) -> Chroma:
    """Load an existing vector store retriever."""
    embeddings = OllamaEmbeddings(model="mxbai-embed-large")
    vector_store = Chroma(
        persist_directory=persist_dir,
        embedding_function=embeddings
    )
    return vector_store.as_retriever()

# --------------------------
# Chat History Functions
# --------------------------

def get_saved_chats() -> List[Dict]:
    """Get list of all saved chat sessions with metadata."""
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
                        "filename": filename,
                        "preview": chat_data["messages"][0]["content"][:50] + "..." if chat_data["messages"] else "Empty chat"
                    })
            except Exception:
                continue  # Silently skip corrupted files
    return sorted(chats, key=lambda x: x["timestamp"], reverse=True)

def load_chat_session(session_id: str) -> Optional[Dict]:
    """Load a specific chat session by session_id."""
    filename = os.path.join(CHAT_HISTORY_DIR, f"{session_id}.json")
    if os.path.exists(filename):
        with open(filename, 'r') as f:
            return json.load(f)
    return None

def save_chat_history(session_id: str, messages: List[Dict]) -> None:
    """Save chat history to a JSON file."""
    filename = os.path.join(CHAT_HISTORY_DIR, f"{session_id}.json")
    with open(filename, 'w') as f:
        json.dump({
            "session_id": session_id,
            "timestamp": datetime.now().isoformat(),
            "messages": messages
        }, f, indent=2)

def get_session_history(session_id: str) -> BaseChatMessageHistory:
    """Get or create chat history for a session."""
    if session_id not in store:
        store[session_id] = ChatMessageHistory()
        
        # Try to load existing history
        history_data = load_chat_session(session_id)
        if history_data:
            for msg in history_data["messages"]:
                if msg["type"] == "human":
                    store[session_id].add_user_message(msg["content"])
                else:
                    store[session_id].add_ai_message(msg["content"])
    
    return store[session_id]

# --------------------------
# Streamlit UI Functions
# --------------------------

def init_session_state() -> None:
    """Initialize Streamlit session state variables."""
    if "history" not in st.session_state:
        st.session_state.history = []
    if "generated" not in st.session_state:
        st.session_state.generated = []
    if "past" not in st.session_state:
        st.session_state.past = []
    if "session_id" not in st.session_state:
        st.session_state.session_id = str(uuid.uuid4())
    if "selected_chat" not in st.session_state:
        st.session_state.selected_chat = None

def save_current_chat() -> None:
    """Save the current chat session to disk."""
    messages = []
    for i in range(len(st.session_state["generated"])):
        messages.append({
            "type": "human",
            "content": st.session_state["past"][i],
            "timestamp": datetime.now().isoformat()
        })
        messages.append({
            "type": "ai",
            "content": st.session_state["generated"][i],
            "timestamp": datetime.now().isoformat()
        })
    
    save_chat_history(st.session_state.session_id, messages)

def load_selected_chat(selected_chat: Dict) -> None:
    """Load a selected chat session into the current session."""
    # Save current chat before switching
    if st.session_state.get("past"):
        save_current_chat()
    
    # Set new session ID and clear UI state
    st.session_state.session_id = selected_chat["session_id"]
    st.session_state.past = []
    st.session_state.generated = []
    
    # Clear the existing chat history in the store
    if st.session_state.session_id in store:
        del store[st.session_state.session_id]
    
    # Load the chat history from file
    chat_data = load_chat_session(selected_chat["session_id"])
    if chat_data:
        for msg in chat_data["messages"]:
            if msg["type"] == "human":
                st.session_state.past.append(msg["content"])
            else:
                st.session_state.generated.append(msg["content"])
    
    # Force refresh the chat history in LangChain's memory
    get_session_history(st.session_state.session_id)
    
    st.session_state.selected_chat = selected_chat
    st.rerun()

def create_conversational_retriever_chain(llm, retriever):
    """Create a conversation-aware retriever chain."""
    from langchain.chains import ConversationalRetrievalChain
    from langchain.memory import ConversationBufferMemory
    
    memory = ConversationBufferMemory(
        memory_key="chat_history",
        return_messages=True,
        output_key='answer'
    )
    
    return ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=retriever,
        memory=memory,
        return_source_documents=True,
        verbose=True
    )

def setup_sidebar() -> Dict:
    """Configure the Streamlit sidebar and return selected chat."""
    with st.sidebar:
        st.header("Chat Sessions")
        
        # Chat session selector
        saved_chats = get_saved_chats()
        chat_options = {f"{chat['timestamp']} - {chat['preview']}": chat for chat in saved_chats}
        
        selected_chat_key = st.selectbox(
            "Load previous chat:",
            options=["New Chat"] + list(chat_options.keys()),
            index=0,
            help="Select a previous chat to continue"
        )
        
        selected_chat = None
        if selected_chat_key != "New Chat" and selected_chat_key in chat_options:
            selected_chat = chat_options[selected_chat_key]
            if st.button("Load Selected Chat"):
                load_selected_chat(selected_chat)
        
        st.divider()
        st.markdown(f"📁 Current codebase: `{CODE_DIRECTORY}`")
        st.markdown(f"💾 Vector store: `{CHROMA_DB_DIR}`")
        st.markdown(f"🧠 Using model: `llama-3.1-8b-instant`")
        
        if st.button("Save Current Chat"):
            save_current_chat()
            st.success("Chat history saved!")
        
        if st.button("New Chat Session"):
            if st.session_state.get("past"):
                save_current_chat()
            st.session_state.session_id = str(uuid.uuid4())
            st.session_state.history = []
            st.session_state.generated = []
            st.session_state.past = []
            st.session_state.selected_chat = None
            st.rerun()
        
        st.markdown("---")
        st.markdown(f"**Current Session ID:**\n`{st.session_state.session_id}`")
    
    return selected_chat

def setup_chat_interface(qa_chain) -> None:
    """Configure the main chat interface."""
    response_container = st.container()
    container = st.container()
    
    with container:
        with st.form(key='chat_form', clear_on_submit=True):
            user_input = st.text_area("You:", key='input', height=100)
            submit_button = st.form_submit_button(label='Send')
        
        if submit_button and user_input:
            with st.spinner("Analyzing code..."):
                # Use the appropriate chain based on whether we're using conversation history
                if isinstance(qa_chain, RunnableWithMessageHistory):
                    response = qa_chain.invoke(
                        {"query": user_input},
                        config={"configurable": {"session_id": st.session_state.session_id}}
                    )
                    result = response["result"]
                else:
                    response = qa_chain({"question": user_input})
                    result = response["answer"]
                
                st.session_state.past.append(user_input)
                st.session_state.generated.append(result)
    
    # Display chat history
    if st.session_state["generated"]:
        with response_container:
            for i in range(len(st.session_state["generated"])):
                message(st.session_state["past"][i], is_user=True, key=f"{i}_user")
                message(st.session_state["generated"][i], key=str(i))

# --------------------------
# Main Application
# --------------------------

def main() -> None:
    """Main Streamlit application entry point."""
    st.set_page_config(
        page_title="Code Explorer RAG Chat",
        page_icon="💻",
        layout="wide"
    )
    
    # Initialize components
    try:
        llm = ChatGroq(model="llama-3.1-8b-instant") if os.getenv("GROQ_API_KEY") else None
    except Exception:
        st.error("Failed to initialize LLM. Please check your GROQ_API_KEY")
        return
    
    # Initialize vector store if not exists
    if not os.path.exists(CHROMA_DB_DIR):
        docs = load_documents(CODE_DIRECTORY)
        if docs:
            try:
                create_vector_store(docs, CHROMA_DB_DIR)
            except Exception:
                st.error("Failed to create vector store")
                return
    
    try:
        retriever = load_chroma_retriever(CHROMA_DB_DIR)
    except Exception:
        st.error("Failed to load vector store")
        return
    
    # Initialize session state
    init_session_state()
    
    # Setup sidebar and get selected chat
    selected_chat = setup_sidebar()
    
    # Initialize the appropriate QA chain based on whether we're continuing a chat
    if selected_chat:
        # Use conversational chain for continued chats
        qa_chain = create_conversational_retriever_chain(llm, retriever)
    else:
        # Use standard RetrievalQA for new chats
        qa_chain = RunnableWithMessageHistory(
            RetrievalQA.from_chain_type(
                llm=llm,
                retriever=retriever,
                chain_type="stuff",
                input_key="query",
                return_source_documents=True
            ),
            get_session_history,
            input_messages_key="query",
            history_messages_key="chat_history"
        )
    
    # UI Setup
    st.title("💻 Code Explorer RAG Chat")
    st.markdown("""
    <style>
        .reportview-container {
            margin-top: -2em;
        }
        #MainMenu {visibility: hidden;}
        .stDeployButton {display:none;}
        footer {visibility: hidden;}
        #stDecoration {display:none;}
    </style>
    """, unsafe_allow_html=True)
    
    setup_chat_interface(qa_chain)

if __name__ == "__main__":
    main()