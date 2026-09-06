import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function CTA2() {
  return (
    <div className="relative w-full max-w-4xl mx-auto overflow-hidden rounded-[40px] bg-primary p-8 sm:p-10 md:p-20">
      <div className="absolute inset-0 hidden h-full w-full overflow-hidden md:block">
        <div className="absolute top-1/2 right-[-45%] aspect-square h-[800px] w-[800px] -translate-y-1/2">
          <div className="absolute inset-0 rounded-full bg-white/20"></div>
          <div className="absolute inset-0 scale-[0.8] rounded-full bg-white/15"></div>
          <div className="absolute inset-0 scale-[0.6] rounded-full bg-white/12"></div>
          <div className="absolute inset-0 scale-[0.4] rounded-full bg-white/10"></div>
          <div className="absolute inset-0 scale-[0.2] rounded-full bg-white/8"></div>
          <div className="absolute inset-0 scale-[0.1] rounded-full bg-white/5"></div>
        </div>
      </div>

      <div className="relative z-10">
        <h2 className="mb-3 text-3xl font-bold text-white sm:text-4xl md:mb-4 md:text-5xl">
          Plan your first business calling workflow
        </h2>
        <p className="mb-6 max-w-md text-base text-white sm:text-lg md:mb-8">
          Bring your call types, business systems, and follow-up process.
          Identify a focused pilot, its implementation requirements, and the
          outcomes your team will measure.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <Link
            href="/company/contact"
            className="flex w-full items-center justify-between rounded-full bg-black px-5 py-3 text-white transition-colors hover:bg-gray-900 sm:w-[240px]"
          >
            <span className="font-medium">Book a discovery call</span>
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white">
              <ArrowRight className="h-3.5 w-3.5 text-black" />
            </span>
          </Link>
          <Link
            href="#contact-us"
            className="flex w-full items-center justify-between rounded-full bg-black px-5 py-3 text-white transition-colors hover:bg-gray-900 sm:w-[240px]"
          >
            <span className="font-medium">Contact Us</span>
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white">
              <ArrowRight className="h-3.5 w-3.5 text-black" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
