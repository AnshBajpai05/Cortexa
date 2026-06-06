# BISAG Support Ticket & Grievance AI System

An AI-powered grievance routing and governance intelligence platform designed for **urban civic administration and operational monitoring**.

The system integrates machine learning, semantic search, and governance analytics to automate grievance routing, detect duplicate complaints, and assist civic administrators in monitoring service performance.

The platform combines:

* Machine-learning–based grievance classification
* Risk-aware complaint routing
* Retrieval-Augmented Generation (RAG) civic assistant
* Duplicate grievance detection
* Governance audit ledger
* Operational dashboards for administrators

Repository:

```
Support-Ticket-Grievance-Routing-Auto-Reply
```

---

# System Architecture

```
Citizen Complaint
       │
       ▼
Complaint Intake API
       │
       ▼
Text Normalization (BBMP_SLM)
       │
       ▼
Multitask ML Classifier
       │
 ┌─────┴───────────────┐
 ▼                     ▼
Failure Mode         Risk Level
Prediction           Estimation
       │
       ▼
Department Routing
       │
       ▼
Governance Ledger
       │
       ▼
Operational Dashboards
```

---

# System Components

### 1. Complaint Intake Layer

A **Django REST API** that receives citizen grievance submissions and manages complaint lifecycle events.

### 2. Text Normalization Layer

The **BBMP_SLM model** processes free-form complaint text and converts it into structured semantic representations suitable for classification and routing.

### 3. Multitask Classification Engine

The ML model predicts:

* failure mode
* responsible department
* governance risk level

This enables automatic complaint routing and prioritization.

### 4. Duplicate Detection System

A **FAISS-based semantic similarity engine** identifies duplicate complaints and clusters repeated grievances to detect recurring civic issues.

### 5. Seva Sahayak Civic Assistant

A **Retrieval-Augmented Generation (RAG) assistant** that answers civic queries using policy documents, SOPs, and operational guidelines.

### 6. Governance Ledger

An **event-based audit trail** that records all complaint lifecycle actions including:

* intake
* department assignment
* SLA escalation
* manual override

### 7. Administrative Dashboard

A **React + Vite interface** used by administrators to monitor:

* grievance intake
* SLA performance
* departmental workload
* failure mode analytics

---

# Dataset Evolution & Reproducibility

## Dataset & Artifact Reproducibility Notice

⚠️ Some large artifacts are intentionally excluded from version control to keep the repository lightweight and within GitHub limits.

Examples include:

* large intermediate datasets
* embedding indexes
* vector databases
* model checkpoints

All dataset lineage and preprocessing steps are documented in:

```
documentation/Controlled Dataset Evolution and Experimental Reproducibility.docx
```

Location:

```
Support-Ticket-Grievance-Routing-Auto-Reply/documentation/
```

This document describes:

* dataset generation pipeline
* dataset versioning
* preprocessing transformations
* label corrections
* experimental benchmarking
* evaluation methodology

Researchers should consult this document to **reproduce training datasets exactly**.

Artifacts described in the document include:

```
grievance_ai/data/
grievance_ai/data/faiss_duplicate/
grievance_ai/data/Seva_Sahayak/vectorstore/
grievance_ai/models/
```

---

# Full Repository Structure

```
Support-Ticket-Grievance-Routing-Auto-Reply
│
├── grievance_ai/
│   │
│   ├── manage.py
│   │
│   ├── grievance_ai/
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── asgi.py
│   │   └── wsgi.py
│   │
│   ├── tickets/
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   ├── duplicate_detector.py
│   │   ├── intake_utils.py
│   │   ├── ledger_utils.py
│   │   ├── ml_utils.py
│   │   ├── slm_utils.py
│   │   └── seva_sahayak_engine.py
│   │
│   ├── scripts/
│   │   ├── analyze_dataset.py
│   │   ├── atomic_audit.py
│   │   ├── audit_dataset.py
│   │   ├── benchmark_100.py
│   │   ├── run_llm_benchmark.py
│   │   ├── run_rag_benchmark.py
│   │   ├── train_incremental.py
│   │   └── deep_diagnostic.py
│   │
│   ├── data/
│   │   ├── bbmp_failure_modes_v2_with_risk.csv
│   │   ├── bbmp_v1.1_sla_applied.csv
│   │   ├── gated_predictions_full.csv
│   │   ├── live_complaints.csv
│   │   │
│   │   ├── faiss_duplicate/
│   │   │
│   │   └── Seva_Sahayak/
│   │       ├── chunks/
│   │       ├── config/
│   │       ├── docs/
│   │       ├── sop/
│   │       └── vectorstore/
│   │
│   └── models/
│       ├── BBMP_B2_multitask_model/
│       └── BBMP_SLM/
│
├── Frontend/
│   ├── src/
│   ├── public/
│   ├── vite.config.ts
│   └── package.json
│
├── notebooks_Rag_SLLM_pipeline_execution/
│   └── Jupyter notebooks for RAG experiments and model pipelines
│
├── tests_selenium/
│   ├── test_admin_exploration.py
│   ├── test_admin_interactions.py
│   ├── test_dashboard_viz.py
│   ├── test_intake_flow.py
│   ├── report.html
│   ├── report_admin.html
│   └── report_interactions.html
│
├── documentation/
│   ├── Controlled Dataset Evolution and Experimental Reproducibility.docx
│   ├── Architectural Phase Breakdown & Freeze Tracking Report.docx
│   └── Project documentation files
│
├── docs/
│   └── ontology.md
│
├── screenshots/
│   └── UI screenshots and visual documentation
│
├── admin_explore_gallery/
├── admin_interaction_gallery/
│
├── Weekly Plan/
│   ├── Week1/
│   ├── Week2/
│   └── Week3/
│
├── requirements.txt
├── setup_project.py
└── README.md
```

---

# Seva Sahayak (RAG Civic Assistant)

The system includes a **Retrieval-Augmented Generation assistant** designed to explain civic policies.

Knowledge base location:

```
grievance_ai/data/Seva_Sahayak/
```

Important directories:

```
chunks/      → embedded text chunks
config/      → prompt templates and embedding configuration
docs/        → policy documents
sop/         → department SOP documents
vectorstore/ → FAISS retrieval index
```

---

# Duplicate Complaint Detection

Duplicate detection uses **semantic similarity search**.

Artifacts located in:

```
grievance_ai/data/faiss_duplicate/
```

Examples include:

```
complaint_embeddings.npy
department_centroids.npy
duplicate_clusters.csv
duplicates_summary.csv
duplicates_with_decision.csv
faiss_config.json
```

---

# Machine Learning Models

## Multitask Routing Model

Location:

```
grievance_ai/models/BBMP_B2_multitask_model/
```

Predicts:

* failure mode
* department routing
* governance risk

---

## BBMP_SLM

Language model used for:

* complaint normalization
* semantic understanding
* routing logic extraction

Location:

```
grievance_ai/models/BBMP_SLM/
```

---

# Backend Setup

```
cd grievance_ai
pip install -r ../requirements.txt
python manage.py migrate
python manage.py ingest_data
python manage.py runserver
```

Server:

```
http://127.0.0.1:8000
```

Note:
`db.sqlite3` is generated locally after migrations and is **not intended for production deployment**.

---

# Frontend Setup

```
cd Frontend
npm install
npm run dev
```

Dashboard:

```
http://localhost:5173
```

---

# Core System Capabilities

### Seva Sahayak

AI assistant explaining grievance procedures and civic jurisdiction.

### Service Standards Engine

Maintains mapping between complaint types and departmental SLAs.

### Governance Ledger

Tracks every grievance lifecycle event including:

```
complaint intake
department assignment
SLA escalation
manual override
```

### Duplicate Detection

Clusters semantically similar complaints to identify repeated civic issues.

---

# Experimental Scripts

Located in:

```
grievance_ai/scripts/
```

Examples:

```
benchmark_100.py
run_rag_benchmark.py
deep_diagnostic.py
verify_bias_fix.py
train_incremental.py
```

These scripts are used for:

* routing accuracy evaluation
* dataset validation
* bias auditing
* model benchmarking

---

# Development Workflow

Typical workflow:

```
git pull
git add .
git commit -m "feature update"
git push
```

---

# Project Goal

This system demonstrates how AI can support **transparent civic governance** by enabling:

* automated grievance routing
* explainable AI decision making
* operational dashboards for administrators
* audit trails for governance accountability
