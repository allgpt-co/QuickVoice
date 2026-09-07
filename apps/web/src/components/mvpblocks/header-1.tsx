"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import Logo from "@/components/logo";
import { Button } from "@/components/ui/button";
import { DEMO_BOOKING_URL, LOGIN_URL } from "@/lib/links";
import { navigation } from "@/lib/navigation";

export default function Header1() {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const header = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const media = window.matchMedia("(min-width: 1024px)");
    const resize = () => {
      if (media.matches) dialog.current?.close();
    };
    document.addEventListener("pointerdown", dismiss);
    media.addEventListener("change", resize);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      media.removeEventListener("change", resize);
    };
  }, []);

  const brand = (
    <>
      <Logo className="size-8 text-primary" />
      <span className="text-xl font-bold tracking-tight">QuickVoice</span>
    </>
  );

  return (
    <header
      ref={header}
      className="site-header sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md"
    >
      <div className="site-container flex h-[76px] items-center justify-between gap-6">
        <Link
          href="/"
          aria-label="QuickVoice home"
          className="flex min-h-11 shrink-0 items-center gap-2.5"
        >
          {brand}
        </Link>
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-1 lg:flex"
        >
          {navigation.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            if (!item.children)
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="nav-link"
                >
                  {item.label}
                </Link>
              );
            const id = `nav-${item.label.toLowerCase().replaceAll(" ", "-")}`;
            return (
              <div
                key={item.label}
                className="relative"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setOpenMenu(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setOpenMenu(null);
                    event.currentTarget
                      .querySelector<HTMLButtonElement>("button")
                      ?.focus();
                    event.stopPropagation();
                  }
                }}
              >
                <button
                  type="button"
                  className="nav-link"
                  aria-expanded={openMenu === item.label}
                  aria-controls={id}
                  onClick={() =>
                    setOpenMenu(openMenu === item.label ? null : item.label)
                  }
                >
                  {item.label}
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-4 transition-transform ${openMenu === item.label ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  id={id}
                  hidden={openMenu !== item.label}
                  className="absolute left-0 top-full mt-2 w-80 rounded-2xl border border-border bg-popover p-2 shadow-xl"
                >
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className="block rounded-lg px-4 py-3 hover:bg-muted"
                      onClick={() => setOpenMenu(null)}
                    >
                      <span className="block text-sm font-semibold">
                        {child.label}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {child.description}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          <a
            href={LOGIN_URL}
            data-analytics-location="header"
            className="nav-link"
          >
            Log in
          </a>
          <Button asChild size="sm">
            <a href={DEMO_BOOKING_URL} data-analytics-location="header">
              Book a demo
            </a>
          </Button>
        </div>
        <Button
          ref={mobileTrigger}
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open menu"
          aria-haspopup="dialog"
          onClick={() => dialog.current?.showModal()}
        >
          <Menu aria-hidden="true" />
        </Button>
      </div>
      <dialog
        ref={dialog}
        className="mobile-menu"
        aria-label="Site navigation"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), summary, [tabindex="0"]',
            ),
          ).filter((item) => item.getClientRects().length > 0);
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          }
          if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClose={() => mobileTrigger.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="min-h-full bg-background px-6 pb-8 pt-4">
          <div className="mb-6 flex items-center justify-between gap-4">
            <Link
              href="/"
              className="flex items-center gap-2.5"
              onClick={() => dialog.current?.close()}
            >
              {brand}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close menu"
              onClick={() => dialog.current?.close()}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <nav
            aria-label="Mobile navigation"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a"))
                dialog.current?.close();
            }}
          >
            {navigation.map((item) =>
              item.children ? (
                <details key={item.label} className="border-b border-border">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between py-3 font-semibold">
                    {item.label}
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </summary>
                  <div className="pb-4">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="block rounded-lg px-3 py-3 text-base text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </details>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex min-h-14 items-center border-b border-border py-3 font-semibold"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <div className="mt-8 grid gap-3">
            <Button asChild>
              <a href={DEMO_BOOKING_URL} data-analytics-location="mobile_menu">
                Book a demo
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={LOGIN_URL} data-analytics-location="mobile_menu">
                Log in
              </a>
            </Button>
          </div>
        </div>
      </dialog>
    </header>
  );
}
