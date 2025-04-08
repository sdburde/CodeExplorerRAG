import streamlit as st
import os
import time
import json
from langchain_chroma import Chroma
from langchain_ollama import OllamaEmbeddings
from langchain.schema import Document
from typing import TypedDict, List
import glob

# Assume these functions are defined in raw.py (your previous code)
from code_explaner import (
    setup_environment, load_documents, create_vector_store, 
    build_workflow, load_chat_history, save_chat_history, 
    initial_agent, break_query, web_search, teach_to_code, 
    ai_coder, verify_code, setup_agent, teach_final, aggregator
)

# Define AgentState
class AgentState(TypedDict):
    query: str
    documents: List[Document]
    filtered_documents: List[Document]
    web_results: str
    broken_queries: List[str]
    response: str
    example_code: str
    setup_instructions: str
    chat_history: List[dict]
    feedback: dict
    combined_output: str  # For aggregator output

# Initialize LLM and Vector Store
llm = setup_environment()
persist_dir = "./chroma_db"
if not os.path.exists(persist_dir):
    docs = load_documents("otter-detection")
    if docs:
        vector_store = create_vector_store(docs, persist_dir)
    else:
        raise ValueError("No documents loaded to create vector store")
else:
    embeddings = OllamaEmbeddings(model="mxbai-embed-large")
    vector_store = Chroma(persist_directory=persist_dir, embedding_function=embeddings)

# Build the workflow
app = build_workflow(llm, vector_store)

def load_chat_history(history_file="chat_history.json"):
    if os.path.exists(history_file):
        try:
            with open(history_file, 'r') as f:
                content = f.read().strip()
                if content:
                    return json.loads(content)
                return []
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error loading chat history: {e}. Initializing empty history.")
            return []
    return []

def stream_response(query: str):
    """Stream responses, prioritizing the final aggregated output"""
    chat_history = load_chat_history()
    state = {
        "query": query,
        "documents": [],
        "filtered_documents": [],
        "web_results": "",
        "broken_queries": [],
        "response": "",
        "example_code": "",
        "setup_instructions": "",
        "chat_history": chat_history,
        "feedback": {},
        "combined_output": ""  # Initialize combined output
    }
    
    start_time = time.time()
    
    # Stream the workflow
    for chunk in app.stream(state, stream_mode="values"):
        # # Optionally yield intermediate steps for visibility
        # if "response" in chunk and chunk["response"]:
        #     step = chunk.get("feedback", {}).get("step", "")
        #     if step == "teach_to_code":
        #         yield f"**Teaching Instructions**:\n{chunk['response']}\n\n"
        #     elif step == "teach_final":
        #         yield f"**Final Explanation**:\n{chunk['response']}\n\n"
        
        # Yield the aggregated output as the main result
        if "combined_output" in chunk and chunk["combined_output"]:
            yield f"**FULL SOLUTION**\n{chunk['combined_output']}\n\n"
        
        state = chunk
    
    # Save to chat history with the aggregated output
    state["chat_history"].append({
        "query": query,
        "response": state.get("combined_output", ""),  # Use combined_output as the main response
        "example_code": state.get("example_code", ""),
        "setup_instructions": state.get("setup_instructions", "")
    })
    save_chat_history(state["chat_history"])
    
    yield f"**Time taken**: {time.time() - start_time:.2f}s\n"

# Streamlit UI
st.title("Code Explorer Chat")

if "messages" not in st.session_state:
    st.session_state.messages = load_chat_history()

# Display chat history
for message in st.session_state.messages:
    with st.chat_message("user"):
        st.markdown(message["query"])
    with st.chat_message("assistant"):
        if "response" in message and message["response"]:
            st.markdown(f"**FULL SOLUTION**:\n{message['response']}")
        # Optionally display additional details if present
        if "example_code" in message and message["example_code"]:
            st.code(message["example_code"], language='python')
        if "setup_instructions" in message and message["setup_instructions"]:
            st.markdown(f"**Setup Instructions**:\n{message['setup_instructions']}")

# Chat input
query = st.chat_input("Ask about code (e.g., 'How to develop a video streaming app')")
if query:
    with st.chat_message("user"):
        st.markdown(query)
    
    with st.chat_message("assistant"):
        response_container = st.empty()
        full_response = ""
        
        for part in stream_response(query):
            full_response += part
            response_container.markdown(full_response)
        
        # Extract components for history
        components = {
            "query": query,
            "response": "",
            "example_code": "",
            "setup_instructions": ""
        }
        
        # Parse the full response to extract the aggregated output
        if "**FULL SOLUTION**" in full_response:
            components["response"] = full_response.split("**FULL SOLUTION**")[1].split("**Time taken**")[0].strip()
        
        # Extract example_code if present (e.g., from aggregator's verified code section)
        if "2. VERIFIED CODE:" in components["response"]:
            code_section = components["response"].split("2. VERIFIED CODE:")[1].split("3. SETUP INSTRUCTIONS:")[0].strip()
            if "```python" in code_section:
                components["example_code"] = code_section.split("```python")[1].split("```")[0].strip()
        
        # Extract setup_instructions if present
        if "3. SETUP INSTRUCTIONS:" in components["response"]:
            components["setup_instructions"] = components["response"].split("3. SETUP INSTRUCTIONS:")[1].split("4. FINAL EXPLANATION:")[0].strip()
        
        st.session_state.messages.append(components)
        save_chat_history(st.session_state.messages)

if __name__ == "__main__":
    st.write("Chat app is running. Enter a query below!")