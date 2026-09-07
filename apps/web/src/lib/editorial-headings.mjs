import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

function headingText(node) {
  if (node.type === "text" || node.type === "inlineCode")
    return node.value ?? "";
  if (node.type === "image") return node.alt ?? "";
  if (node.type === "break") return " ";
  return (node.children ?? []).map(headingText).join("");
}

const normalizedText = (value) =>
  value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
const slugText = (value) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-");
const sourceSlugText = (value) =>
  value
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

export const getEditorialTitleId = (idPrefix = "article") =>
  (slugText(idPrefix) || "article") + "-title";

/** Mutates only the ephemeral Markdown syntax tree, never source text or metadata. */
export function applyEditorialHeadings(
  tree,
  { title = "", idPrefix = "article" } = {},
) {
  const prefix = slugText(idPrefix) || "article";
  const aliases = new Map();
  const sourceIds = new Set();
  function rememberSourceId(node, target) {
    const text = headingText(node).trim();
    const sourceBase = sourceSlugText(text);
    let sourceId = sourceBase;
    let suffix = 1;
    while (sourceIds.has(sourceId)) sourceId = sourceBase + "-" + suffix++;
    sourceIds.add(sourceId);
    aliases.set(sourceId, target);
    const normalized = slugText(text);
    if (!aliases.has(normalized)) aliases.set(normalized, target);
    const explicitId = node.data?.hProperties?.id;
    if (typeof explicitId === "string") aliases.set(explicitId, target);
  }
  const first = tree.children?.[0];
  if (
    first?.type === "heading" &&
    first.depth === 1 &&
    title &&
    normalizedText(headingText(first)) === normalizedText(title)
  ) {
    rememberSourceId(first, getEditorialTitleId(idPrefix));
    tree.children.shift();
  }
  const headings = [];
  const usedIds = new Set([getEditorialTitleId(idPrefix)]);
  function visit(node) {
    if (node.type === "heading") {
      // The page owns its H1; preserve all other heading text.
      node.depth = Math.max(2, node.depth);
      const text = headingText(node).trim();
      const base = prefix + "-" + (slugText(text) || "section");
      let id = base;
      let suffix = 2;
      while (usedIds.has(id)) id = base + "-" + suffix++;
      usedIds.add(id);
      rememberSourceId(node, id);
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, id },
      };
      if (node.depth <= 3)
        headings.push({ id, text: text || "Section", depth: node.depth });
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(tree);
  // Existing Markdown fragment links and reference definitions follow the same IDs
  // as the contents list. Unknown and cross-page destinations remain untouched.
  for (const id of usedIds) aliases.set(id, id);
  function rewriteLinks(node) {
    if (
      (node.type === "link" || node.type === "definition") &&
      node.url?.startsWith("#")
    ) {
      let fragment = node.url.slice(1);
      try {
        fragment = decodeURIComponent(fragment);
      } catch {
        /* Preserve malformed fragments. */
      }
      const target = aliases.get(fragment);
      if (target) node.url = "#" + target;
    }
    for (const child of node.children ?? []) rewriteLinks(child);
  }
  rewriteLinks(tree);
  return headings;
}

export function getEditorialHeadings(content, options = {}) {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(content);
  return applyEditorialHeadings(tree, options);
}

export function editorialHeadingsPlugin(options = {}) {
  return (tree) => {
    applyEditorialHeadings(tree, options);
  };
}

/** Name read-only GFM checkboxes from their own list item after Markdown becomes HTML. */
export function accessibleTaskListsPlugin() {
  function itemText(node) {
    if (node.type === "text") return node.value ?? "";
    if (["ul", "ol", "input"].includes(node.tagName)) return "";
    if (node.tagName === "img") return node.properties?.alt ?? "";
    return (node.children ?? [])
      .map(itemText)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return (tree) => {
    function visit(node, taskItem) {
      const isTask =
        node.tagName === "li" &&
        node.properties?.className?.includes("task-list-item");
      const owner = isTask ? node : taskItem;
      if (
        owner &&
        node.tagName === "input" &&
        node.properties?.type === "checkbox"
      ) {
        node.properties.ariaLabel = itemText(owner) || "Checklist item";
      }
      for (const child of node.children ?? []) visit(child, owner);
    }
    visit(tree, null);
  };
}
