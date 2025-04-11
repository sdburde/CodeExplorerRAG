from agno.agent import Agent
from agno.models.groq import Groq
from agno.tools.duckduckgo import DuckDuckGoTools

import os 
from dotenv import load_dotenv
load_dotenv()

study_agent = Agent(
    name="Study Notes Agent",
    role="Create structured study notes from educational content",
    model=Groq(id="deepseek-r1-distill-llama-70b"),
    tools=[DuckDuckGoTools()],
    instructions="""
    When processing Udemy course content:
    1. Create brif concise, well-structured markdown notes for each topic 
    2. Focus on key concepts, definitions, actionable insights, potential interview questions
    3. Use this structure:
        ## [Module/Topic Name]
        ### Key Concepts
        - Bullet point summary
        - **Important terms** in bold
        - Diagrams/examples when helpful
        
        ### Actionable Insights
        - Practical applications
        - Best practices
        
        ### Interview Questions
        - Complex questions with model answers
        - Common misconceptions to avoid
    4. Include sources/references when available
    """,
    markdown=True,
)

qa_agent = Agent(
    name="Q&A Extraction Agent",
    role="Extract and answer potential interview questions from content",
    model=Groq(id="deepseek-r1-distill-llama-70b"),
    instructions="""
    For each technical topic:
    1. Identify 3-5 challenging interview questions
    2. Provide model answers that:
       - Demonstrate depth of knowledge
       - Include examples where applicable
       - Highlight common mistakes
    3. Format as:
       **Q:** [Question]  
       **A:** [Answer]  
       *Tip:* [Additional insight]
    """,
    markdown=True,
)

learning_team = Agent(
    team=[study_agent, qa_agent],
    model=Groq(id="deepseek-r1-distill-llama-70b"),
    instructions=[
        "understand and Aggregate Answers of the agents with proper structure"
    ],
    markdown=True,
)

# Example usage with uploaded course content
learning_team.print_response("""Create study notes:
                             Topic List 
                                1. Regression Methods
                                    Simple & Multiple Linear Regression
                                    Polynomial Regression
                                    Ridge/Lasso/ElasticNet Regression
                                    Logistic Regression (Classification)
                                    Support Vector Regression
                                2. Core ML Concepts
                                    Cost Functions
                                    Convergence Algorithms
                                    Overfitting/Underfitting
                                    Performance Metrics (MSE, MAE, RMSE, ROC)
                                    Bias-Variance Tradeoff
                                3. Model Development
                                    EDA & Feature Engineering
                                    Feature Selection
                                    Hyperparameter Tuning (Grid/Random Search)
                                    Cross-Validation Techniques
                                    Model Pickling
                                4. Tree-Based Methods
                                    Decision Trees (Entropy/Gini)
                                    Random Forest
                                    AdaBoost
                                    Gradient Boosting
                                    XGBoost
                                5. Unsupervised Learning
                                    Dimensionality Reduction (PCA)
                                    Clustering (K-Means, Hierarchical, DBSCAN)
                                    Anomaly Detection (Isolation Forest, LOF)             
                             """, stream=True)




                            #  Topic List 
                            #     1. Regression Methods
                            #         Simple & Multiple Linear Regression
                            #         Polynomial Regression
                            #         Ridge/Lasso/ElasticNet Regression
                            #         Logistic Regression (Classification)
                            #         Support Vector Regression
                            #     2. Core ML Concepts
                            #         Cost Functions
                            #         Convergence Algorithms
                            #         Overfitting/Underfitting
                            #         Performance Metrics (MSE, MAE, RMSE, ROC)
                            #         Bias-Variance Tradeoff
                            #     3. Model Development
                            #         EDA & Feature Engineering
                            #         Feature Selection
                            #         Hyperparameter Tuning (Grid/Random Search)
                            #         Cross-Validation Techniques
                            #         Model Pickling
                            #     4. Tree-Based Methods
                            #         Decision Trees (Entropy/Gini)
                            #         Random Forest
                            #         AdaBoost
                            #         Gradient Boosting
                            #         XGBoost
                            #     5. Unsupervised Learning
                            #         Dimensionality Reduction (PCA)
                            #         Clustering (K-Means, Hierarchical, DBSCAN)
                            #         Anomaly Detection (Isolation Forest, LOF)   