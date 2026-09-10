---
title: Attention Mechanism
type: concept
sources:
  - knowledge/raw/articles/placeholder.md # Placeholder source reference
related:
  - "[[embeddings]]"
created: 2026-09-10
updated: 2026-09-10
confidence: medium
---

# Attention Mechanisms Overview

Attention is a critical component of modern NLP models, allowing the model to weigh the importance of different parts of the input data when processing specific tokens.

## Core Idea
Instead of treating all input tokens equally (like RNNs might), attention allows the mechanism to focus its 'attention' on the most relevant pieces of information from the sequence or external context.

### Types:
1. **Self-Attention:** Attention is applied within a single sequence to relate different parts of that same sequence. This is fundamental to the Transformer architecture.
2. **Cross-Attention:** Used in encoder-decoder models (like machine translation), where the decoder attends over the output of the encoder's representation.

## Key Components
*   **Query (Q):** What I am looking for.
*   **Key (K):** What information is available.
*   **Value (V):** The actual content to be passed on.

The attention score is often calculated using the dot product of $Q$ and $K$, followed by a scaling factor ($\sqrt{d_k}$) and a softmax function.