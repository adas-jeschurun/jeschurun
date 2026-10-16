function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m],
  );
}

function inlineMd(s) {
  let x = esc(s);
  x = x.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );
  x = x.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  x = x.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  return x;
}

export function markdownBlocks(md, assetPrefix) {
  const lines = String(md || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const out = [];
  let para = [];
  const flush = () => {
    if (!para.length) return;
    const text = para.join("\n").trim();
    para = [];
    if (text)
      out.push({
        type: "p",
        text,
        html: inlineMd(text).replace(/\n/g, "<br>"),
      });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\s+\{([^}]*)\})?\s*$/);
    if (img) {
      flush();
      const attrs = {};
      String(img[3] || "")
        .split(/\s+/)
        .forEach((x) => {
          const j = x.indexOf("=");
          if (j > 0) attrs[x.slice(0, j)] = x.slice(j + 1);
        });
      let src = img[2];
      if (!/^https?:\/\//.test(src) && !src.startsWith("/")) {
        src = `${assetPrefix}${encodeURIComponent("/" + src.replace(/^\.\//, ""))}`;
      }
      let caption = "";
      if (lines[i + 1] && /^_.*_$/.test(lines[i + 1].trim())) {
        caption = lines[++i].trim().slice(1, -1);
      }
      out.push({
        type: "image",
        src,
        alt: img[1] || "",
        caption,
        size: "medium",
        layout: attrs.layout || "center",
        width: attrs.width || "",
      });
      continue;
    }
    const h = line.match(/^(#{2,3})\s+(.+)$/);
    if (h) {
      flush();
      const text = h[2].trim();
      out.push({ type: `h${h[1].length}`, text, html: inlineMd(text) });
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const text = line.replace(/^>\s?/, "").trim();
      out.push({ type: "quote", text, html: inlineMd(text) });
      continue;
    }
    if (/^---\s*$/.test(line)) {
      flush();
      out.push({ type: "divider" });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}
