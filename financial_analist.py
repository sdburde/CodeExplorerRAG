from agno.agent import Agent
from agno.models.groq import Groq
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.yfinance import YFinanceTools
from dotenv import load_dotenv
# Load environment variables
load_dotenv()

web_agent = Agent(
    name="Web Agent",
    role="Deep Search the web for deep information",
    model=Groq(id="deepseek-r1-distill-llama-70b"),
    tools=[DuckDuckGoTools()],
    instructions="Always include sources",
    markdown=True,
)

finance_agent = Agent(
    name="Finance Agent",
    role="Collect all financial data",
    model=Groq(id="deepseek-r1-distill-llama-70b"),
    tools=[YFinanceTools(stock_price=True, analyst_recommendations=True, company_info=True)],
    instructions="Use tables to display data",
    markdown=True,
)

agent_team = Agent(
    team=[web_agent, finance_agent],
    model=Groq(id="deepseek-r1-distill-llama-70b"),  # You can use a different model for the team leader agent
    instructions=["Always include sources", "Use tables to display data"],
    # show_tool_calls=True,  # Uncomment to see tool calls in the response
    markdown=True,
)

# Give the team a task
agent_team.print_response("What's the Future outlook and financial performance of DRONE-ST.NS do deep research", stream=True)
