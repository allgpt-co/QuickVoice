import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { REGISTER_URL } from "@/lib/links";
import { editorialHeadingsPlugin, getEditorialTitleId } from "@/lib/editorial-headings.mjs";

interface Props {
  content: string;
  title?: string;
  idPrefix?: string;
  resourceLinks?: boolean;
}

export default function MarkdownRenderer({ content, title = "", idPrefix = "article", resourceLinks = false }: Props) {
  const components: Components = {
    h2: ({ children, id }) => <h2 id={id} className="scroll-mt-28">{children}</h2>,
    h3: ({ children, id }) => <h3 id={id} className="scroll-mt-28">{children}</h3>,
    h4: ({ children, id }) => <h4 id={id} className="scroll-mt-28">{children}</h4>,
    h5: ({ children, id }) => <h5 id={id} className="scroll-mt-28">{children}</h5>,
    h6: ({ children, id }) => <h6 id={id} className="scroll-mt-28">{children}</h6>,
    table: ({ children }) => (
      <div role="region" aria-label="Scrollable data table" tabIndex={0} className="my-7 max-w-full overflow-x-auto rounded-lg border border-border">
        <table>{children}</table>
      </div>
    ),
    a: ({ href, children }) => {
      const normalizedHref = href === "/register" ? REGISTER_URL
        : resourceLinks && href && !/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href) ? "/resources/" + href
        : href;
      const isExternal = normalizedHref?.startsWith("http");
      return <a href={normalizedHref} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined}>{children}</a>;
    },
  };
  return (
    <div id={getEditorialTitleId(idPrefix)} className="reading-content min-w-0 scroll-mt-28">
      <ReactMarkdown remarkPlugins={[remarkGfm, [editorialHeadingsPlugin, { title, idPrefix }]]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
