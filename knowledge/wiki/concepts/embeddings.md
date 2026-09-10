---
title: Embeddings
type: concept
sources:
  - knowledge/raw/articles/placeholder.md # Placeholder source reference
related:
  - "[[attention-mechanism]]"
created: 2026-09-10
updated: 2026-09-10
confidence: high
---

# Vector Embeddings Explained

Embeddings are the core numerical representation used by modern LLMs. They map discrete tokens (like words) into a continuous, dense vector space. The distance and angle between these vectors capture the semantic relationship between the represented concepts.

## How It Works
When an LLM processes text, it doesn't use one-hot encoding (which is sparse and massive); instead, it converts every token into an embedding vector (e.g., 1536 dimensions). Tokens with similar meanings will have embeddings that are close together in this high-dimensional space.

## Role in Retrieval
Embeddings are essential for **Retrieval Augmented Generation (RAG)** because they allow us to search by *meaning* rather than just by keyword matching. We convert a user query into an embedding vector and find the nearest document embeddings.