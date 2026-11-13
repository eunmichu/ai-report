"""RSS 2.0 · Atom · RSS 1.0(RDF) 공용 파서(표준 라이브러리)."""
from __future__ import annotations

import html.entities
import re
import xml.etree.ElementTree as ET

_XML_ENTS = {"amp", "lt", "gt", "quot", "apos"}
_ENTITY = re.compile(r"&([A-Za-z][A-Za-z0-9]*);")
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _sanitize(data: bytes) -> bytes:
    """XML 에 정의되지 않은 HTML 실체참조(&nbsp; 등)와 제어문자를 고친다."""
    text = data.decode("utf-8", "replace")
    text = _CTRL.sub("", text)

    def fix(m: re.Match) -> str:
        name = m.group(1)
        if name in _XML_ENTS:
            return m.group(0)
        cp = html.entities.name2codepoint.get(name)
        return f"&#{cp};" if cp else f"&amp;{name};"

    return _ENTITY.sub(fix, text).encode("utf-8")


def _parse(data: bytes) -> ET.Element:
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        root = ET.fromstring(_sanitize(data))
    for el in root.iter():  # 네임스페이스를 걷어 지역 이름만 남긴다
        if isinstance(el.tag, str) and "}" in el.tag:
            el.tag = el.tag.rsplit("}", 1)[1]
        for k in list(el.attrib):
            if "}" in k:
                el.attrib[k.rsplit("}", 1)[1]] = el.attrib.pop(k)
    return root


def _txt(el: ET.Element | None) -> str:
    if el is None:
        return ""
    return "".join(el.itertext()).strip()


def _first(node: ET.Element, *names: str) -> str:
    for n in names:
        v = _txt(node.find(n))
        if v:
            return v
    return ""


def _atom_link(node: ET.Element) -> str:
    best = ""
    for ln in node.findall("link"):
        href = ln.attrib.get("href", "").strip()
        rel = ln.attrib.get("rel", "alternate")
        if href and rel == "alternate":
            return href
        if href and not best:
            best = href
    return best or _txt(node.find("link"))


def parse_feed(data: bytes) -> list[dict]:
    """피드 → [{title, link, date, summary, source, source_url, author, categories}]"""
    root = _parse(data)
    nodes = list(root.iter("item")) or list(root.iter("entry"))
    out: list[dict] = []
    for n in nodes:
        is_atom = n.tag == "entry"
        title = _txt(n.find("title"))
        link = _atom_link(n) if is_atom else (_txt(n.find("link")) or _atom_link(n))
        if not link:
            guid = _txt(n.find("guid"))
            link = guid if guid.startswith("http") else ""
        src = n.find("source")
        author = _first(n, "creator", "author")
        if is_atom and n.find("author") is not None:
            author = _txt(n.find("author/name")) or author
        out.append({
            "title": title,
            "link": link.strip(),
            "date": _first(n, "pubDate", "published", "updated", "date", "issued"),
            "summary": _first(n, "description", "summary", "encoded", "content"),
            "source": _txt(src) if src is not None else "",
            "source_url": src.attrib.get("url", "") if src is not None else "",
            "author": author,
            "categories": [c.attrib.get("term") or _txt(c) for c in n.findall("category")],
        })
    return out
