
# Import necessary libraries
from dotenv import load_dotenv
import os
from langchain_groq import ChatGroq
from langchain.document_loaders import DirectoryLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_ollama import OllamaEmbeddings
from langchain.schema import Document
from langgraph.graph import StateGraph, START, END
from typing import TypedDict, List
import glob
import time
from langchain_community.tools import DuckDuckGoSearchRun
import json
from IPython.display import Image, display
import requests
from groq import APIStatusError
import re

print("Libraries imported successfully!")

# Step 1: Setup Environment and LLM
def setup_environment():
    load_dotenv()
    if not os.getenv("GROQ_API_KEY"):
        raise ValueError("Please set GROQ_API_KEY in your .env file!")
    llm = ChatGroq(model="llama3-70b-8192")
    print("Environment setup complete. Your AI teacher is ready!")
    return llm

# Step 2: Load Documents with Tree Structure and Code Flow
def generate_tree_structure(directory):
    tree = []
    for root, dirs, files in os.walk(directory):
        level = root.replace(directory, '').count(os.sep)
        indent = '  ' * level
        tree.append(f"{indent}{os.path.basename(root)}/")
        for f in files:
            tree.append(f"{indent}  {f}")
    return "\n".join(tree)

def infer_code_flow(files, directory):
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

def load_documents(directory="code_folder"):
    abs_dir = os.path.abspath(directory)
    if not os.path.isdir(abs_dir):
        print(f"Error: Directory '{abs_dir}' does not exist!")
        return []
    print(f"Scanning directory: {abs_dir}")
    extensions = ("py", "js", "jsx", "ts", "java", "c", "cpp", "cs", "go", "rs", 
                  "php", "rb", "sh", "txt", "md", "html", "css", "yaml", "yml", "conf")
    matching_files = [f for ext in extensions for f in glob.glob(os.path.join(directory, f"**/*.{ext}"), recursive=True)]
    documents = []
    for file_path in matching_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            doc = Document(page_content=content, metadata={"source": os.path.relpath(file_path, directory)})
            documents.append(doc)
        except Exception as e:
            print(f"Failed to load {file_path}: {e}")
    
    tree_content = generate_tree_structure(directory)
    documents.append(Document(page_content=tree_content, metadata={"source": "directory_tree.txt"}))
    flow_content = infer_code_flow(matching_files, directory)
    documents.append(Document(page_content=flow_content, metadata={"source": "code_flow.txt"}))

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)
    split_docs = text_splitter.split_documents(documents)
    print(f"Loaded {len(documents)} files, split into {len(split_docs)} chunks")
    return split_docs

# Step 3: Create Vector Store
def create_vector_store(docs, persist_dir="./chroma_db"):
    embeddings = OllamaEmbeddings(model="mxbai-embed-large")
    vector_store = Chroma.from_documents(documents=docs, embedding=embeddings, persist_directory=persist_dir)
    print(f"Vector store created at {persist_dir}")
    return vector_store

# Step 4: Define Application State
class AgentState(TypedDict):
    query: str
    documents: List[Document]
    filtered_documents: List[Document]
    web_results: str
    broken_queries: List[str]
    response: str
    example_code: str
    setup_instructions: str
    combined_output: str
    chat_history: List[dict]
    feedback: dict

# Step 5: Chat History Management
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

def save_chat_history(history, history_file="chat_history.json"):
    with open(history_file, 'w') as f:
        json.dump(history, f, indent=2)

# Step 6: Initial Agent - Improved prompt
def initial_agent(state: AgentState, llm, vector_store):
    query = state["query"]
    documents = state["documents"]
    tree_doc = next((doc for doc in documents if doc.metadata["source"] == "directory_tree.txt"), None)
    flow_doc = next((doc for doc in documents if doc.metadata["source"] == "code_flow.txt"), None)
    tree_content = tree_doc.page_content if tree_doc else ""
    flow_content = flow_doc.page_content if flow_doc else ""
    query_keywords = query.lower().split()
    tree_keywords = set(re.findall(r"\w+", tree_content.lower()))
    flow_keywords = set(re.findall(r"\w+", flow_content.lower()))
    combined_keywords = " ".join(set(query_keywords) & (tree_keywords | flow_keywords)) or query
    
    # Enhanced prompt for better document retrieval
    retrieval_prompt = f"""
    Analyze the following query and codebase information to identify the most relevant documents:
    
    **User Query**: "{query}"
    **Codebase Structure**:
    {tree_content[:2000]}... [truncated]
    
    **Code Dependencies**:
    {flow_content[:2000]}... [truncated]
    
    **Task**:
    1. Identify key components in the query that match codebase elements
    2. Determine which files are most relevant based on:
       - File names matching query terms
       - Import relationships indicating relevance
       - Content matching the query's technical requirements
    3. Return the most relevant documents with clear justification
    
    **Output Format**:
    - Relevance Score: [1-10]
    - Justification: [Brief explanation]
    - Recommended Files: [List of file paths]
    """
    
    try:
        filtered_docs = vector_store.similarity_search(combined_keywords, k=5)
        if not filtered_docs:
            return {"filtered_documents": [], "feedback": {"step": "initial", "status": "failed", "message": "No relevant documents found"}}
        
        # Add relevance analysis to feedback
        feedback = {
            "step": "initial",
            "status": "success",
            "analysis": f"Found {len(filtered_docs)} relevant documents matching keywords: {combined_keywords}"
        }
        return {"filtered_documents": filtered_docs, "feedback": feedback}
    except Exception as e:
        print(f"Similarity search failed: {e}")
        return {"filtered_documents": [], "feedback": {"step": "initial", "status": "failed", "message": str(e)}}

# Step 7: Query Breaker - Improved prompt
def break_query(state: AgentState):
    keywords = state["query"].lower().split()
    components = [word for word in keywords if word not in ("tell", "me", "about", "the", "in", "how", "its", "working")]
    
    # Enhanced prompt for better query decomposition
    decomposition_prompt = f"""
    Analyze the following technical query and break it down into core components:
    
    **Original Query**: "{state['query']}"
    
    **Task**:
    1. Identify the main technical requirements
    2. Extract key technologies/libraries mentioned
    3. Separate functional requirements from non-functional
    4. List components in order of importance
    
    **Output Format**:
    - Primary Components: [List of 2-3 main technical aspects]
    - Secondary Components: [List of supporting elements]
    - Implementation Sequence: [Suggested order to address components]
    """
    
    if not components:
        return {"broken_queries": [], "feedback": {"step": "break_query", "status": "failed", "message": "No meaningful components extracted"}}
    
    feedback = {
        "step": "break_query",
        "status": "success",
        "analysis": f"Decomposed query into {len(components)} technical components"
    }
    return {"broken_queries": components, "feedback": feedback}

# Step 8: Web Search - Improved prompt
def web_search(state: AgentState):
    try:
        search = DuckDuckGoSearchRun()
        
        # Enhanced search query formulation
        search_prompt = f"""
        Formulate the most effective web search query for finding technical documentation about:
        
        **Technical Components**: {state['broken_queries']}
        
        **Requirements**:
        1. Focus on official documentation first
        2. Include key technical terms
        3. Add "site:github.com" for code examples
        4. Prioritize recent information (last 2 years)
        
        **Example Output**:
        "Python Tornado websocket documentation site:github.com"
        """
        
        result = search.invoke(state["query"])
        if not result or result.strip() == "":
            return {"web_results": "", "feedback": {"step": "web_search", "status": "retry", "message": "Empty web results"}}
        
        feedback = {
            "step": "web_search",
            "status": "success",
            "sources": "Found web resources including documentation and examples"
        }
        return {"web_results": result, "feedback": feedback}
    except Exception as e:
        print(f"Web search failed: {e}")
        return {"web_results": "Web search unavailable", "feedback": {"step": "web_search", "status": "retry", "message": str(e)}}


# Step 9: Teach to Code
def teach_to_code(state: AgentState, llm):
    context = "\n\n".join([doc.page_content for doc in state["filtered_documents"]]) if state["filtered_documents"] else "No relevant codebase info found."
    web_info = state["web_results"][:2000] if state["web_results"] else "No web results found."
    prompt = f"""
    **Role**: You are an AI Code Assistant instructing an AI Coder.
    **User Query**: "{state['query']}"
    **Broken Down Components**: {state['broken_queries']}
    **Codebase Info (filtered)**: {context}
    **Web Resources**: {web_info}
    **Task**:
    - Provide step-by-step instructions to create a code structure with a file tree similar to:
    ```
    folder1
      ├── sub-foldername1
      │   ├── filename1.txt
      │   ├── filename2.sh
      │   ├── filename3.py
      ├── sub-foldername1
      │   ├── filename1.txt
      │   ├── filename2.sh
      │   ├── filename3.py
      ├── sub-foldername1
      │   ├── filename1.css
      │   ├── filename2.html
      │   ├── filename3.js
    ```
    - Adapt this structure to the query, ensuring all script files are included with specific purposes.
    - Ensure the code is beginner-friendly, functional, and relevant.
    **Response Format**:
    - File Tree:
      [Adapted directory structure with filenames]
    - Instructions:
      1. [Step 1: What to do]
      2. [Step 2: What to include]
      3. [Step 3: Specific guidance for scripts]
    """
    try:
        response = llm.invoke(prompt)
        if not response.content.strip():
            return {"response": "", "feedback": {"step": "teach_to_code", "status": "failed", "message": "Empty response"}}
        return {"response": response.content, "feedback": {"step": "teach_to_code", "status": "success"}}
    except APIStatusError as e:
        print(f"API Error: {e.response.text}")
        return {"response": "", "feedback": {"step": "teach_to_code", "status": "failed", "message": f"API error: {e.response.text}"}}

# Step 10: AI Coder
def ai_coder(state: AgentState, llm):
    context = "\n\n".join([doc.page_content for doc in state["filtered_documents"]]) if state["filtered_documents"] else "No relevant codebase info found."
    prompt = f"""
    **Role**: You are an AI Coder.
    **User Query**: "{state['query']}"
    **Components**: {state['broken_queries']}
    **Instructions from Teacher**: {state['response']}
    **Codebase (filtered)**: {context}
    **Task**:
    - Generate functional code for each file in the file tree specified by the teacher.
    - Include all script files with comments explaining their purpose.
    - Provide a breakdown of each file’s role.
    **Response Format**:
    - File Tree:
      [Directory structure with filenames]
    - Code Files:
      - [Filename 1]:
        ```language
        [Code with comments]
        ```
      - [Filename 2]:
        ```language
        [Code with comments]
        ```
      ... (include all scripts)
    - Breakdown:
      1. [Filename 1: Purpose]
      2. [Filename 2: Purpose]
      ...
    """
    try:
        response = llm.invoke(prompt)
        if "No specific example found" in response.content or not response.content.strip():
            return {"example_code": response.content, "feedback": {"step": "code", "status": "partial", "message": "Limited or no code examples found"}}
        return {"example_code": response.content, "feedback": {"step": "code", "status": "success"}}
    except APIStatusError as e:
        print(f"API Error: {e.response.text}")
        return {"example_code": "", "feedback": {"step": "code", "status": "failed", "message": f"API error: {e.response.text}"}}

# Step 11: Verify Code
def verify_code(state: AgentState, llm):
    context = "\n\n".join([doc.page_content for doc in state["filtered_documents"]]) if state["filtered_documents"] else "No relevant codebase info found."
    prompt = f"""
    **Role**: You are an AI Code Verifier.
    **User Query**: "{state['query']}"
    **Generated Code Example**: {state['example_code']}
    **Codebase Info (filtered)**: {context}
    **Task**:
    - Verify the code structure and each file (including all scripts) for syntax, relevance, and functionality.
    - Suggest fixes if issues are found, preserving the file tree.
    **Response Format**:
    - Result: [“Code verified successfully” or “Code verification failed”]
    - Details:
      1. [Syntax check for each file]
      2. [Relevance check]
      3. [Functionality check]
    - Fixed Code Files (if applicable):
      - [Filename 1]:
        ```language
        [Fixed code]
        ```
      - [Filename 2]:
        ```language
        [Fixed code]
        ```
      ...
    """
    try:
        response = llm.invoke(prompt)
        verified_code = response.content.strip()
        if "Code verification failed" in verified_code:
            return {"example_code": verified_code, "feedback": {"step": "verify_code", "status": "failed", "message": "Code verification failed"}}
        return {"example_code": verified_code, "feedback": {"step": "verify_code", "status": "success"}}
    except APIStatusError as e:
        print(f"API Error: {e.response.text}")
        return {"example_code": state["example_code"], "feedback": {"step": "verify_code", "status": "failed", "message": f"API error: {e.response.text}"}}

# Step 12: Teach Final
def teach_final(state: AgentState, llm):
    context = "\n\n".join([doc.page_content for doc in state["filtered_documents"]]) if state["filtered_documents"] else "No relevant codebase info found."
    web_info = state["web_results"][:2000] if state["web_results"] else "No web results found."
    prompt = f"""
    **Role**: You are an AI Code Assistant.
    **User Query**: "{state['query']}"
    **Broken Down Components**: {state['broken_queries']}
    **Codebase Info (filtered)**: {context}
    **Web Resources**: {web_info}
    **Verified Code Example**: {state['example_code']}
    **Task**:
    - Provide a detailed explanation of the code structure and each file (including all scripts).
    - Include a summary, breakdown with explanations, and next steps.
    **Response Format**:
    - Summary: [One-sentence summary]
    - File Tree:
      [Directory structure with filenames]
    - Explanation:
      1. [Filename 1: Description, purpose, analogy/example]
      2. [Filename 2: Description, purpose, analogy/example]
      ... (include all scripts)
    - Next Steps:
      1. [Step 1: What to try]
      2. [Step 2: How to extend]
    """
    try:
        response = llm.invoke(prompt)
        if not response.content.strip():
            return {"response": "", "feedback": {"step": "teach_final", "status": "failed", "message": "Empty response"}}
        return {"response": response.content, "feedback": {"step": "teach_final", "status": "success"}}
    except APIStatusError as e:
        print(f"API Error: {e.response.text}")
        return {"response": "", "feedback": {"step": "teach_final", "status": "failed", "message": f"API error: {e.response.text}"}}

# Step 13: Setup Agent
def setup_agent(state: AgentState, llm):
    prompt = f"""
    **Role**: You are an AI Setup Assistant.
    **User Query**: "{state['query']}"
    **Generated Code Example**: {state['example_code']}
    **Task**:
    - Create a file tree arrangement matching the structure provided earlier:
      ```
    folder1
      ├── sub-foldername1
      │   ├── filename1.txt
      │   ├── filename2.sh
      │   ├── filename3.py
      ├── sub-foldername1
      │   ├── filename1.txt
      │   ├── filename2.sh
      │   ├── filename3.py
      ├── sub-foldername1
      │   ├── filename1.css
      │   ├── filename2.html
      │   ├── filename3.js
      ```
    - Adapt this structure to the query and provide a setup guide including:
      1. Requirements.txt and detailed README.md.
      2. Docker and docker-compose setup.
      3. Environment details and run instructions for all scripts.
    - Include prerequisites, exact commands, and example files.
    **Response Format**:
    - File Tree:
      [Adapted directory structure with filenames]
    - Setup Steps:
      1. [Step 1: Prerequisites]
      2. [Step 2: Commands for scripts]
      3. [Step 3: Docker setup]
    - Example Files:
      - [requirements.txt]:
        ```
        [Content]
        ```
      - [README.md]:
        ```
        [Content]
        ```
      - [Dockerfile]:
        ```
        [Content]
        ```
      - [docker-compose.yml]:
        ```
        [Content]
        ```
    """
    try:
        response = llm.invoke(prompt)
        if not response.content.strip():
            return {"setup_instructions": "", "feedback": {"step": "setup", "status": "failed", "message": "Empty response"}}
        return {"setup_instructions": response.content, "feedback": {"step": "setup", "status": "success"}}
    except APIStatusError as e:
        print(f"API Error: {e.response.text}")
        return {"setup_instructions": "", "feedback": {"step": "setup", "status": "failed", "message": f"API error: {e.response.text}"}}

# Step 14: Aggregator
def aggregator(state: AgentState):
    combined = f"=== Complete Response for: {state['query']} ===\n\n"
    combined += f"1. TEACHING INSTRUCTIONS:\n{state['response'] if state.get('feedback', {}).get('step') == 'teach_to_code' else 'N/A'}\n\n"
    combined += f"2. VERIFIED CODE:\n{state['example_code']}\n\n"
    combined += f"3. SETUP INSTRUCTIONS:\n{state['setup_instructions']}\n\n"
    combined += f"4. FINAL EXPLANATION:\n{state['response'] if state.get('feedback', {}).get('step') == 'teach_final' else 'N/A'}\n"
    return {"combined_output": combined}

# Step 15: Build Workflow
def build_workflow(llm, vector_store):
    workflow = StateGraph(AgentState)
    
    def retrieve_with_check(state):
        docs = load_documents("otter-detection")
        if not docs:
            return {"documents": [], "feedback": {"step": "retrieve", "status": "failed", "message": "No documents loaded"}}
        return {"documents": docs, "feedback": {"step": "retrieve", "status": "success"}}
    
    workflow.add_node("retrieve", retrieve_with_check)
    workflow.add_node("initial", lambda state: initial_agent(state, llm, vector_store))
    workflow.add_node("break_query", break_query)
    workflow.add_node("web_search", web_search)
    workflow.add_node("teach_to_code", lambda state: teach_to_code(state, llm))
    workflow.add_node("code", lambda state: ai_coder(state, llm))
    workflow.add_node("verify_code", lambda state: verify_code(state, llm))
    workflow.add_node("setup", lambda state: setup_agent(state, llm))
    workflow.add_node("teach_final", lambda state: teach_final(state, llm))
    workflow.add_node("aggregator", aggregator)
    
    workflow.add_edge(START, "retrieve")
    workflow.add_edge("retrieve", "initial")
    workflow.add_edge("initial", "break_query")
    workflow.add_edge("break_query", "web_search")
    workflow.add_edge("web_search", "teach_to_code")
    workflow.add_edge("teach_to_code", "code")
    workflow.add_edge("code", "verify_code")
    workflow.add_edge("verify_code", "setup")
    workflow.add_edge("setup", "teach_final")
    workflow.add_edge("teach_final", "aggregator")
    workflow.add_edge("aggregator", END)
    
    graph = workflow.compile()
    return graph

# Initialize
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

app = build_workflow(llm, vector_store)

# Step 16: Run Application with Streaming
def run_app(query: str):
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
        "combined_output": "",
        "chat_history": chat_history,
        "feedback": {}
    }
    
    start_time = time.time()
    print(f"\nStreaming responses for query: '{query}'...")
    
    for chunk in app.stream(state, stream_mode="values"):
        if "response" in chunk and chunk["response"] and chunk.get("feedback", {}).get("step") == "teach_to_code":
            print(f"\n[Teach to Code Instructions]:\n{chunk['response']}")
        if "example_code" in chunk and chunk["example_code"] and chunk.get("feedback", {}).get("step") == "verify_code":
            print(f"\n[Verified Code]:\n{chunk['example_code']}")
        if "setup_instructions" in chunk and chunk["setup_instructions"] and chunk.get("feedback", {}).get("step") == "setup":
            print(f"\n[Setup Instructions]:\n{chunk['setup_instructions']}")
        if "response" in chunk and chunk["response"] and chunk.get("feedback", {}).get("step") == "teach_final":
            print(f"\n[Final Explanation from Teach Final]:\n{chunk['response']}")
        if "combined_output" in chunk and chunk["combined_output"]:
            print(f"\n[Aggregated Output]:\n{chunk['combined_output']}")
        state = chunk
    
    state["chat_history"].append({
        "query": query,
        "teach_to_code": state["response"] if state.get("feedback", {}).get("step") == "teach_to_code" else "",
        "example_code": state["example_code"],
        "setup_instructions": state["setup_instructions"],
        "teach_final": state["response"] if state.get("feedback", {}).get("step") == "teach_final" else "",
        "combined_output": state["combined_output"]
    })
    save_chat_history(state["chat_history"])
    
    print(f"\nTime taken: {time.time() - start_time:.2f}s")
    return state

# Example usage
if __name__ == "__main__":
    query = "How to develop simple video streaming app using python tornado api websocket based backend with React JS frontend web streaming. Write end to end code with proper explanation. refer docs"
    run_app(query)
