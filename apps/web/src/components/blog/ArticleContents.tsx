export interface ArticleHeading { id: string; text: string; depth: number }

export function ArticleContents({ headings }: { headings: ArticleHeading[] }) {
  return (
    <nav aria-label="On this page">
      <ul className="space-y-3">
        {headings.map((heading) => (
          <li key={heading.id} className={heading.depth === 3 ? "pl-3" : undefined}>
            <a href={"#" + heading.id} className="block text-sm leading-6 text-muted-foreground transition-colors hover:text-primary">{heading.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
