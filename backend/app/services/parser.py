import os
import re
from typing import List, Dict

class Parser:
    def parse(self, file_path: str) -> List[Dict]:
        ext = os.path.splitext(file_path)[1].lower()
        if ext == ".pdf":
            return self._parse_pdf(file_path)
        elif ext in [".txt", ".md"]:
            return self._parse_text(file_path)
        elif ext in [".doc", ".docx"]:
            return self._parse_docx(file_path)
        else:
            raise ValueError(f"Unsupported file type: {ext}")

    def _parse_pdf(self, file_path: str) -> List[Dict]:
        try:
            from pypdf import PdfReader
        except ImportError:
            from PyPDF2 import PdfReader

        reader = PdfReader(file_path)
        paragraphs = []
        for page_idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            page_paras = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
            for para in page_paras:
                paragraphs.append({"text": para, "page_num": page_idx + 1})
        return paragraphs

    def _parse_text(self, file_path: str) -> List[Dict]:
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
        paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
        return [{"text": p, "page_num": None} for p in paragraphs]

    def _parse_docx(self, file_path: str) -> List[Dict]:
        import docx
        doc = docx.Document(file_path)
        paragraphs = []
        for para in doc.paragraphs:
            if para.text.strip():
                paragraphs.append({"text": para.text.strip(), "page_num": None})
        return paragraphs
