---
title: Transformers Overview
type: concept
sources:
  - knowledge/raw/articles/placeholder.md # Placeholder source reference
related:
  - "[[attention-mechanism]]"
created: 2026-09-10
updated: 2026-09-10
confidence: high
---

# The Transformer Architecture

The Transformer architecture, introduced in the paper "Attention Is All You Need," revolutionized NLP. It relies entirely on attention mechanisms and processes input tokens in parallel, unlike previous sequential models (RNNs/LSTMs).

## Core Mechanism
It consists of an encoder and a decoder stack. The key breakthrough was proving that self-attention could handle complex sequence dependencies without recurrence, leading to massive parallelization gains crucial for modern GPU training.