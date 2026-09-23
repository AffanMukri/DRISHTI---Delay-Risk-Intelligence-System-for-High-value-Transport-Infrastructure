from __future__ import annotations

import re
from dataclasses import dataclass

import pymupdf


@dataclass(frozen=True)
class ExtractedChunk:
    chunk_index: int
    page_number: int
    content: str


def extract_pdf_pages(payload: bytes) -> list[tuple[int, str]]:
    with pymupdf.open(stream=payload, filetype="pdf") as document:
        pages = []
        for index, page in enumerate(document):
            text = re.sub(r"[ \t]+", " ", page.get_text("text"))
            text = re.sub(r"\n{3,}", "\n\n", text).strip()
            if text:
                pages.append((index + 1, text))
        return pages


def chunk_pages(
    pages: list[tuple[int, str]],
    *,
    chunk_characters: int,
    overlap_characters: int,
) -> list[ExtractedChunk]:
    if overlap_characters >= chunk_characters:
        raise ValueError("Chunk overlap must be smaller than chunk size.")
    chunks: list[ExtractedChunk] = []
    for page_number, text in pages:
        start = 0
        while start < len(text):
            tentative_end = min(start + chunk_characters, len(text))
            end = tentative_end
            if tentative_end < len(text):
                boundary = max(text.rfind("\n", start, tentative_end), text.rfind(". ", start, tentative_end))
                if boundary > start + chunk_characters // 2:
                    end = boundary + 1
            content = text[start:end].strip()
            if content:
                chunks.append(ExtractedChunk(len(chunks), page_number, content))
            if end >= len(text):
                break
            start = max(end - overlap_characters, start + 1)
    return chunks
