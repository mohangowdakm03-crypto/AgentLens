"""Step 1 of your work: embeddings + cosine similarity."""
import numpy as np

_MODEL = None


def _device():
    return "cpu"


def get_model(name="sentence-transformers/all-MiniLM-L6-v2"):
    global _MODEL
    if _MODEL is None:
        from sentence_transformers import SentenceTransformer
        _MODEL = SentenceTransformer(name, device=_device())
    return _MODEL


def embed(texts):
    """list[str] -> (n, d) array of L2-normalised vectors."""
    vecs = get_model().encode(list(texts), normalize_embeddings=True)
    return np.asarray(vecs)


def cosine(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(a @ b / denom) if denom else 0.0