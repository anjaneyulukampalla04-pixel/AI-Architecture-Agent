# AI Architecture Agent

An autonomous, self-healing cloud system design workspace that translates high-level system requirements into interactive visual diagrams, database schemas, REST APIs, estimated monthly costs, and secure, deployable Terraform Infrastructure-as-Code (IaC).

---

## 🚀 Product Vision & Core Concept

Going from natural language requirements to a production-grade cloud deployment can take weeks of manual coordination. The **AI Architecture Agent** automates this entire lifecycle by orchestrating a sequential 17-step multi-agent pipeline. 

### Core Workflow
```
Natural Language Requirements / Ingested PDF
    ↓
Agent Orchestration Pipeline (17 specialized agents)
    ↓
Interactive Multi-View Canvas (System Context, DB Schema, API Specs, AWS mappings, Security Badges)
    ↓
Cost Estimation & Checkov IaC Security Scan (Real-world boto3 AWS APIs & Checkov binaries)
    ↓
Structured Terraform Output (reusable modules, dev/staging/prod environments)
    ↓
GitHub Repository Push & Pull Request Generation
    ↓
Deployment Center (Terraform Plan & human-in-the-loop manual apply)
```

---

## 🛠️ Architecture Diagram

```text
+-------------------------------------------------------------+
|        Domain 3: Interactive React Flow Dashboard           |
|                                                             |
|   [ React Vite UI ] <-------> [ Zustand State Store ]       |
|          ^                            ^                     |
|          |                            |                     |
|          v                            v                     |
|   [ History Sidebar ]         [ React Flow Canvas ]         |
+-------------------------------------------------------------+
             ^                               |
             | (Real-time WS)                | (HTTP/REST)
             |                               v
+-------------------------------------------------------------+
|             Domain 1: FastAPI API Gateway                   |
|                                                             |
|               [ Auth & RBAC Middleware ]                    |
|                           |                                 |
|                           v                                 |
|                 [ API Gateway Routers ]                     |
|                           |                                 |
|       +-------------------+-------------------+             |
|       |                   |                   |             |
|       v                   v                   v             |
| [ SQLite DB ]    [ WS Connection Mgr ]  [ Orchestrator ]    |
+-------------------------------------------------------------+
        ^                                       |
        | (Persists Results)                    | (Triggers)
        |                                       v
+-------------------------------------------------------------+
|              Domain 2: Autonomous AI Core                   |
|                                                             |
|               [ Agent Orchestrator Loop ]                   |
|                           |                                 |
|                           v                                 |
|               [ 15+ Specialized Agents ]                    |
|                           |                                 |
|   +---------------+-------+-------+---------------+         |
|   |               |               |               |         |
|   v               v               v               v         |
| [ LLM ]       [ RAG ]       [ Security ]    [ Terraform ]   |
| (Groq)     (Pinecone)       (Checkov)      (Validator)      |
|                           [ AWS Pricing ]                   |
+-------------------------------------------------------------+
```

---

## ✨ Features Built

### 1. Advanced Interactive Canvas
* **View Modes:** Toggle between System Context, DB Schema, API Specs, Cloud View (AWS mapping), and Security View overlays.
* **Auto-Layout:** Switch between Grid, Hierarchical (Dagre), and Radial layout configurations.
* **Interactive Toggles:** Highlight logical tiers using the Layer Filter Bar (Presentation, Application, Data).
* **Network Simulator:** Sequentially animate data flow paths on edges showing network traffic routes.

### 2. Real-World Integration Backend
* **Real AWS Costing:** Interfaces with `boto3` to request real-time instance costing from the AWS Pricing API.
* **Checkov CLI Scanner:** Temporarily writes Terraform code to run real Checkov audits, displaying findings as green/yellow/red badges directly on canvas nodes.
* **Architecture Diffing:** Computes the delta (added/removed components, APIs, tables) between any two version milestones.

### 3. Developer & AI Cooperation
* **Node Explainer:** Streams immediate LLM architecture explanations and lists system alternatives (pros/cons).
* **Observability Logs:** Observe full agent logs, intermediate inputs, outputs, and token footprints.
* **Narrative Walkthroughs:** Automatically builds slide-by-slide text descriptions of the entire topology.

---

## 💻 Tech Stack

* **Backend:** Python 3.10+, FastAPI, Uvicorn, SQLAlchemy (Async), SQLite, Pydantic, WebSockets.
* **Frontend:** React 19, Vite, React Flow v12, Zustand, Tailwind CSS, Lucide icons.
* **Orchestration:** Python-based multi-agent context flow with Google Gemini / Llama-3 (Groq API).
* **Testing & Scanning:** PyTest, Checkov CLI, boto3.

---

## ⚙️ Quick Start

### Prerequisites
* Python 3.10+
* Node.js v18+
* Checkov (optional, for local scanning: `pip install checkov`)

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install required libraries:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   # Configure your JWT_SECRET and LLM keys inside .env
   ```
5. Start the FastAPI server:
   ```bash
   uvicorn app.main:app --reload --port 3000
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Run the development Vite server:
   ```bash
   npm run dev
   ```
4. Open your browser to `http://localhost:5173`.

---

## 🧪 Testing

Execute backend database model, authentication, and analysis pipeline unit tests:
```bash
cd backend
pytest
```

For integration testing, execute the PowerShell script:
```powershell
./test_api.ps1
```
