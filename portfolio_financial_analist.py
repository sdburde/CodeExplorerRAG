import schedule
import time
from datetime import datetime
import pytz
from agno.agent import Agent
from agno.models.groq import Groq
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.yfinance import YFinanceTools
from dotenv import load_dotenv
import json

# Load environment variables
load_dotenv()

class PortfolioManager:
    def __init__(self, stocks):
        self.stocks = stocks  # List of stock symbols you own
        self.initialize_agents()
        self.current_report = {}
        
    def initialize_agents(self):
        # Web Research Agent
        self.web_agent = Agent(
            name="Web Research Agent",
            role="Search for news, policies and sector updates. get important update and sumerize it point wise with limitated detatiled word.",
            model=Groq(id="llama3-70b-8192"),
            tools=[DuckDuckGoTools()],
            instructions="Find latest news, government policies, global events and sector trends. Be concise. Always include sources and dates.",
            markdown=True,
        )
        
        # Financial Data Agent
        self.finance_agent = Agent(
            name="Financial Data Agent",
            role="Get financial data and fundamentals. sumerize it point wise with limitated detatiled word.",
            model=Groq(id="llama3-70b-8192"),
            tools=[YFinanceTools(
                stock_price=True, 
                analyst_recommendations=True, 
                company_info=True
            )],
            instructions="Provide key financial data in compact tables. Focus on essential metrics only.",
            markdown=True,
        )
        
        # Analysis Agent
        self.analysis_agent = Agent(
            name="Analysis Agent",
            role="Analyze data and provide recommendations. sumerize it point wise with limitated detatiled word.",
            model=Groq(id="llama3-70b-8192"),
            instructions="Be concise. Provide clear hold/sell/buy recommendations with brief reasoning. Consider short, medium and long term outlooks.",
            markdown=True,
        )
    
    def analyze_single_stock(self, stock):
        """Analyze one stock at a time to manage token usage"""
        print(f"\nAnalyzing {stock}...")
        
        # 1. Get web research (with simplified queries)
        queries = [
            f"Brief news about {stock} last 2 days",
            f"Key sector trends affecting {stock}",
            f"Recent government policies impacting {stock}"
        ]
        
        web_research = []
        for query in queries:
            try:
                response = self.web_agent.run(query)
                web_research.append(str(response))
                time.sleep(2)  # Rate limiting
            except Exception as e:
                print(f"Error researching {stock}: {str(e)}")
                web_research.append(f"Research failed for: {query}")
        
        web_research_text = "\n".join(web_research)
        
        # 2. Get financial data
        try:
            financial_response = self.finance_agent.run(f"Key financial metrics for {stock}")
            financial_data = str(financial_response)
            time.sleep(2)  # Rate limiting
        except Exception as e:
            print(f"Error getting financial data for {stock}: {str(e)}")
            financial_data = f"Financial data unavailable for {stock}"
        
        # 3. Generate analysis
        analysis_prompt = f"""
        Provide concise analysis for {stock} based on:
        
        Research:
        {web_research_text}
        
        Financials:
        {financial_data}
        
        Format response as JSON with these keys:
        - summary (2-3 sentences)
        - financial_health (brief assessment)
        - short_term_outlook
        - medium_term_outlook
        - long_term_outlook
        - recommendation (Hold/Buy/Sell)
        - recommendation_reason (1-2 sentences)
        - key_risks
        """
        
        try:
            report_response = self.analysis_agent.run(analysis_prompt)
            stock_report = json.loads(str(report_response).strip('`').replace('json\n', ''))
            time.sleep(2)  # Rate limiting
            return stock_report
        except Exception as e:
            print(f"Error analyzing {stock}: {str(e)}")
            return {
                "stock": stock,
                "error": str(e)
            }
    
    def generate_portfolio_summary(self):
        """Generate compact portfolio summary"""
        if not self.current_report:
            return "No analysis available"
            
        summary_prompt = f"""
        Based on these stock analyses:
        {json.dumps(self.current_report, indent=2)}
        
        Provide concise portfolio summary with:
        - Overall health (1-2 sentences)
        - Top performing sector
        - Highest risk stock
        - Suggested action (1 sentence)
        - Market sentiment
        """
        
        try:
            summary_response = self.analysis_agent.run(summary_prompt)
            return str(summary_response)
        except Exception as e:
            return f"Summary generation failed: {str(e)}"
    
    def run_daily_update(self):
        """Run complete daily update one stock at a time"""
        print(f"\nStarting portfolio update at {datetime.now(pytz.timezone('Asia/Kolkata'))}")
        
        try:
            self.current_report = {}
            
            # Analyze each stock sequentially with delays
            for stock in self.stocks:
                self.current_report[stock] = self.analyze_single_stock(stock)
                time.sleep(5)  # Additional delay between stocks
            
            # Generate summary
            portfolio_summary = self.generate_portfolio_summary()
            
            # Save reports
            timestamp = datetime.now().strftime("%Y%m%d_%H%M")
            report_data = {
                "stocks": self.current_report,
                "summary": portfolio_summary,
                "timestamp": timestamp
            }
            
            with open(f"portfolio_report_{timestamp}.json", "w") as f:
                json.dump(report_data, f, indent=2)
            
            print(f"\nPortfolio update completed at {datetime.now(pytz.timezone('Asia/Kolkata'))}")
            print(f"Summary: {portfolio_summary[:200]}...")  # Print first part of summary
            
        except Exception as e:
            print(f"\nError during portfolio update: {str(e)}")

def schedule_updates(portfolio):
    """Schedule daily updates at specified IST times"""
    ist = pytz.timezone('Asia/Kolkata')
    
    # Morning update (8:45 AM IST)
    schedule.every().day.at("08:45").do(portfolio.run_daily_update).tag('morning_update')
    
    # Afternoon update (3:45 PM IST)
    schedule.every().day.at("15:45").do(portfolio.run_daily_update).tag('afternoon_update')
    
    # Evening update (8:00 PM IST)
    schedule.every().day.at("20:00").do(portfolio.run_daily_update).tag('evening_update')
    
    print("\nScheduler started. Updates will run at 8:45 AM, 3:45 PM, and 8:00 PM IST.")
    
    while True:
        schedule.run_pending()
        time.sleep(60)

if __name__ == "__main__":
    # Example stocks - replace with your portfolio
    my_stocks = ["AFFORDABLE.BO", "DRONE-ST.NS", "SEL-ST.NS", "TITANBIO.BO", "HECPROJECT.NS"]
    
    # Initialize portfolio manager
    portfolio = PortfolioManager(my_stocks)
    
    # Run initial update
    portfolio.run_daily_update()
    
    # Start scheduled updates
    schedule_updates(portfolio)