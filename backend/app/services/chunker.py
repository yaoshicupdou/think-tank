import re
from typing import List, Dict

class Chunker:
    def __init__(self, chunk_size: int = 500, overlap: int = 100):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk(self, paragraphs: List[Dict]) -> List[Dict]:
        chunks = []
        for para in paragraphs:
            para_text = para["text"]
            para_len = len(para_text)

            if para_len <= self.chunk_size:
                chunks.append({
                    "content": para_text,
                    "page_num": para.get("page_num"),
                    "meta": {"source": "single_paragraph"}
                })
                continue

            # 单段超长，按句子切分
            sentences = re.split(r'([。！？.?!]\s*)', para_text)
            merged = []
            i = 0
            while i < len(sentences):
                if i + 1 < len(sentences):
                    merged.append(sentences[i] + sentences[i + 1])
                    i += 2
                else:
                    merged.append(sentences[i])
                    i += 1

            temp_chunk = []
            current_len = 0
            for sent in merged:
                if current_len + len(sent) > self.chunk_size and temp_chunk:
                    chunk_text = "".join(temp_chunk)
                    chunks.append({
                        "content": chunk_text,
                        "page_num": para.get("page_num"),
                        "meta": {"source": "long_paragraph"}
                    })
                    overlap_text = chunk_text[-self.overlap:] if len(chunk_text) > self.overlap else chunk_text
                    temp_chunk = [overlap_text, sent]
                    current_len = len(overlap_text) + len(sent)
                else:
                    temp_chunk.append(sent)
                    current_len += len(sent)

            if temp_chunk:
                chunks.append({
                    "content": "".join(temp_chunk),
                    "page_num": para.get("page_num"),
                    "meta": {"source": "long_paragraph"}
                })

        return chunks
