import Link from "next/link";
import Logo from "@/components/logo";
import {
  GITHUB_DOCS_URL,
  GITHUB_REPO_URL,
  GITHUB_RELEASES_URL,
  GITHUB_LICENSE_URL,
} from "@/lib/links";

const groups = [
  {
    title: "Explore",
    links: [
      ["Solutions", "/solutions"],
      ["Industries", "/industries"],
      ["All workflows", "/use-cases"],
      ["Pricing", "/pricing"],
    ],
  },
  {
    title: "Learn",
    links: [
      ["Buyer resources", "/resources"],
      ["Guides", "/blog"],
      ["Workflow examples", "/case-studies"],
      ["Deployment review", "/compliance/hipaa"],
    ],
  },
  {
    title: "Build",
    links: [
      ["Open Source", "/open-source"],
      ["GitHub", GITHUB_REPO_URL],
      ["Repository docs", GITHUB_DOCS_URL],
      ["Releases", GITHUB_RELEASES_URL],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "/company/about-us"],
      ["Contact the team", "/company/contact"],
      ["Careers", "/company/careers"],
      ["LinkedIn", "https://www.linkedin.com/company/quickvoiceai"],
    ],
  },
];

export default function Footer4Col() {
  return (
    <footer className="border-t border-border bg-secondary">
      <div className="site-container pb-8 pt-14">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <Link
              href="/"
              aria-label="QuickVoice home"
              className="inline-flex min-h-11 items-center gap-2.5"
            >
              <Logo className="size-8 text-primary" />
              <span className="text-xl font-bold tracking-tight">
                QuickVoice
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-base leading-7 text-muted-foreground">
              AI phone agents for business calls. Open source, with room to make
              them your own.
            </p>
            <address className="mt-5 flex flex-col items-start text-sm not-italic text-muted-foreground">
              <a
                className="py-2 hover:underline"
                href="mailto:info@quickvoice.co"
              >
                info@quickvoice.co
              </a>
              <a className="py-2 hover:underline" href="tel:+12184525998">
                +1 218 452 5998
              </a>
              <span className="py-2">Delaware, United States</span>
            </address>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            {groups.map((group) => (
              <nav key={group.title} aria-label={`Footer ${group.title}`}>
                <h2 className="text-sm font-semibold">{group.title}</h2>
                <ul className="mt-4 space-y-1">
                  {group.links.map(([label, href]) => (
                    <li key={label}>
                      <Link
                        href={href!}
                        data-analytics-location="footer"
                        className="inline-flex min-h-11 items-center py-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} QuickVoice contributors.{" "}
            <a
              href={GITHUB_LICENSE_URL}
              className="underline underline-offset-4"
            >
              MIT licensed.
            </a>
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link className="py-2 hover:underline" href="/privacy-policy">
              Privacy policy
            </Link>
            <Link className="py-2 hover:underline" href="/terms-of-service">
              Terms of service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
