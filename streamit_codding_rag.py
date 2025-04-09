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
from langchain_community.tools import DuckDuckGoSearchRun
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
                    chat_name = chat_data.get("chat_name", "Unnamed Chat")
                    chats.append({
                        "session_id": chat_data["session_id"],
                        "timestamp": chat_data["timestamp"],
                        "filename": filename,
                        "preview": chat_data["messages"][0]["content"][:50] + "..." if chat_data["messages"] else "Empty chat",
                        "chat_name": chat_name
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

def save_chat_history(session_id: str, messages: List[Dict], chat_name: str = None) -> None:
    """Save chat history to a JSON file."""
    if not messages:
        return  # Don't save empty chats
    
    filename = os.path.join(CHAT_HISTORY_DIR, f"{session_id}.json")
    data = {
        "session_id": session_id,
        "timestamp": datetime.now().isoformat(),
        "messages": messages
    }
    if chat_name:
        data["chat_name"] = chat_name
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)

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

def generate_chat_name(messages: List[Dict], llm: ChatGroq) -> str:
    """Generate a name for the chat session based on the conversation."""
    if len(messages) < 2:
        return "New Chat"
    
    # Extract conversation content
    content = ""
    for msg in messages[:4]:  # Use first 4 messages max
        if msg['type'] == 'human':
            content += f"User: {msg['content']}\n"
        else:
            content += f"AI: {msg['content']}\n"
    
    # Try to generate a concise title
    try:
        prompt = f"""Based on this conversation, create a very short (2-4 word) descriptive title:
        
        {content}
        
        Title:"""
        
        response = llm.invoke(prompt)
        name = response.content.strip().strip('"').strip("'")
        
        # Clean up and validate the name
        name = re.sub(r'[^a-zA-Z0-9 ]', '', name)  # Remove special chars
        name = name.strip()
        
        if not name or len(name.split()) > 5:
            raise ValueError("Invalid name generated")
            
        return name if name else "Conversation"
        
    except Exception:
        # Fallback to date-based name if generation fails
        return datetime.now().strftime("%b %d Chat")

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
    if "chat_name" not in st.session_state:
        st.session_state.chat_name = "New Chat"
    if "search_tool" not in st.session_state:
        st.session_state.search_tool = DuckDuckGoSearchRun()

def save_current_chat(llm: ChatGroq = None) -> None:
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
    
    # Generate name if missing or default
    if messages and (not st.session_state.get("chat_name") or 
                     st.session_state.chat_name in ["New Chat", "Unnamed Chat"]):
        st.session_state.chat_name = generate_chat_name(messages, llm)
    
    save_chat_history(st.session_state.session_id, messages, st.session_state.chat_name)

def load_selected_chat(selected_chat: Dict) -> None:
    """Load a selected chat session into the current session."""
    # Save current chat before switching
    if st.session_state.get("past"):
        save_current_chat()
    
    # Set new session ID and clear UI state
    st.session_state.session_id = selected_chat["session_id"]
    st.session_state.past = []
    st.session_state.generated = []
    
    # Generate name if chat is unnamed
    if selected_chat.get("chat_name", "Unnamed Chat") == "Unnamed Chat":
        chat_data = load_chat_session(selected_chat["session_id"])
        if chat_data and chat_data.get("messages"):
            st.session_state.chat_name = generate_chat_name(chat_data["messages"], llm)
            # Update the saved chat with new name
            save_chat_history(
                selected_chat["session_id"],
                chat_data["messages"],
                st.session_state.chat_name
            )
    else:
        st.session_state.chat_name = selected_chat.get("chat_name", "Unnamed Chat")
    
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


def load_selected_chat(selected_chat: Dict) -> None:
    """Load a selected chat session into the current session."""
    # Save current chat before switching
    if st.session_state.get("past"):
        save_current_chat()
    
    # Set new session ID and clear UI state
    st.session_state.session_id = selected_chat["session_id"]
    st.session_state.past = []
    st.session_state.generated = []
    st.session_state.chat_name = selected_chat.get("chat_name", "Unnamed Chat")
    
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

def setup_sidebar(llm: ChatGroq) -> Dict:
    """Configure the Streamlit sidebar with scrollable chat sessions."""
    saved_chats = get_saved_chats()
    
    with st.sidebar:
        st.header("Chat Management")
        st.markdown(f"**Current Session ID:**\n`{st.session_state.session_id}`")
        if st.session_state.get("chat_name"):
            st.markdown(f"**Current Chat:** {st.session_state.chat_name}")
        
        st.divider()
        
        if st.button("➕ New Chat", use_container_width=True):
            if st.session_state.get("past"):
                save_current_chat(llm)
            st.session_state.session_id = str(uuid.uuid4())
            st.session_state.history = []
            st.session_state.generated = []
            st.session_state.past = []
            st.session_state.selected_chat = None
            st.session_state.chat_name = "New Chat"
            st.rerun()
        
        st.divider()
        st.subheader("Your Chat Sessions")
        
        if not saved_chats:
            st.info("No saved chats yet")
        else:
            # Create a container with consistent button sizing
            st.markdown("""
            <style>
                .chat-list {
                    max-height: 400px;
                    overflow-y: auto;
                    margin-bottom: 10px;
                }
                .chat-btn {
                    width: 100% !important;
                    text-align: left !important;
                    margin: 2px 0 !important;
                    padding: 8px !important;
                    border-radius: 4px !important;
                    white-space: normal !important;
                    height: auto !important;
                    min-height: 40px !important;
                }
                .chat-btn:hover {
                    background-color: #f0f2f6 !important;
                }
            </style>
            <div class="chat-list">
            """, unsafe_allow_html=True)
            
            for chat in saved_chats:
                btn = st.button(
                    f"{chat['chat_name']} ({chat['timestamp'][:10]})",
                    key=f"chat_{chat['session_id']}",
                    help=f"Load {chat['chat_name']}",
                    use_container_width=True
                )
                if btn:
                    load_selected_chat(chat)
            
            st.markdown("</div>", unsafe_allow_html=True)
        
        st.divider()
        st.markdown(f"📁 Current codebase: `{CODE_DIRECTORY}`")
        st.markdown(f"💾 Vector store: `{CHROMA_DB_DIR}`")
        st.markdown(f"🧠 Using model: `llama-3.1-8b-instant`")

    return None

def create_conversational_retriever_chain(llm, retriever, search_tool):
    """Create a conversation-aware retriever chain with enhanced search capability."""
    from langchain.chains import ConversationalRetrievalChain
    from langchain.memory import ConversationBufferMemory
    
    memory = ConversationBufferMemory(
        memory_key="chat_history",
        return_messages=True,
        output_key='answer'
    )
    
    def should_search(query: str) -> bool:
        """Determine if we should use web search for this query."""
        search_triggers = [
            'latest', 'recent', 'current', 'update', 'news',
            'search', 'find', 'look up', '2023', '2024',
            'today', 'now', 'this year', 'this month'
        ]
        query_lower = query.lower()
        return any(trigger in query_lower for trigger in search_triggers)
    
    def format_response(response: str) -> str:
        """Format the response to be more concise."""
        # Remove redundant phrases
        response = re.sub(r'(?i)based on (the|my) (information|knowledge|data).*?(?=\.|,|;|$)', '', response)
        response = re.sub(r'\s+', ' ', response).strip()
        
        # Limit response length
        max_length = 500
        if len(response) > max_length:
            response = response[:max_length] + "... [response truncated]"
        
        return response
    
    def augmented_invoke(inputs):
        """Enhanced invoke with search capability and concise responses."""
        query = inputs["question"]
        
        # First try the regular QA
        result = qa_chain.invoke(inputs)
        answer = result["answer"]
        
        # Enhance with web search if needed
        if should_search(query):
            try:
                search_result = search_tool.run(query)
                if search_result:
                    answer = f"{format_response(answer)}\n\n🔍 Latest info from web:\n{format_response(search_result)}"
            except Exception as e:
                answer = f"{answer}\n\n[Web search failed: {str(e)}]"
        
        result["answer"] = format_response(answer)
        return result
    
    # Create the base chain
    qa_chain = ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=retriever,
        memory=memory,
        return_source_documents=True,
        verbose=True
    )
    
    return augmented_invoke


def setup_chat_interface(qa_chain, llm: ChatGroq) -> None:
    """Configure the main chat interface with concise responses."""
    # Display chat name at the top if it exists
    if st.session_state.get("chat_name") and st.session_state.chat_name != "New Chat":
        st.subheader(st.session_state.chat_name)
    
    response_container = st.container()
    container = st.container()
    
    with container:
        with st.form(key='chat_form', clear_on_submit=True):
            user_input = st.text_area("You:", key='input', height=100)
            submit_button = st.form_submit_button(label='Send')
        
        if submit_button and user_input:
            with st.spinner("Generating response..."):
                try:
                    # Use the appropriate chain
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
                    
                    # Auto-save after each message
                    save_current_chat(llm)
                    
                    # Generate chat name after 2 messages if not already named
                    if len(st.session_state.past) == 2 and st.session_state.chat_name == "New Chat":
                        st.session_state.chat_name = generate_chat_name([
                            {"type": "human", "content": st.session_state.past[0]},
                            {"type": "ai", "content": st.session_state.generated[0]},
                            {"type": "human", "content": st.session_state.past[1]},
                            {"type": "ai", "content": result}
                        ], llm)
                        st.rerun()
                
                except Exception as e:
                    st.error(f"Error: {str(e)}")
    
    # Display chat history
    if st.session_state["generated"]:
        with response_container:
            for i in range(len(st.session_state["generated"])):
                message(st.session_state["past"][i], is_user=True, key=f"{i}_user")
                message(
                    st.session_state["generated"][i], 
                    key=str(i),
                    allow_html=True
                )

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
    selected_chat = setup_sidebar(llm)
    
    # Initialize the appropriate QA chain based on whether we're continuing a chat
    if selected_chat:
        # Use conversational chain for continued chats with search capability
        qa_chain = create_conversational_retriever_chain(llm, retriever, st.session_state.search_tool)
    else:
        # Use standard RetrievalQA for new chats with message history
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
    
    setup_chat_interface(qa_chain, llm)

if __name__ == "__main__":
    main()