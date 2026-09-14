import { RegisterForm } from "@/src/components/forms/auth/register-form";
import Link from "next/link";
import LoginBg from "@/src/components/login-bg";
import Logo1 from "@/src/components/logo1";
import { LANDING_URL } from "@/src/lib/links";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invitationId?: string | string[] }>;
}) {
  const { invitationId } = await searchParams;
  
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2 bg-background">
      {/* Left side - Login Form */}
      <div className=" hidden lg:flex items-center justify-center h-full overflow-hidden">
        <LoginBg />
      </div>
      <div className="flex flex-col gap-4 p-6 md:p-10 h-full relative overflow-hidden">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link
            href={LANDING_URL}
            className="flex items-center gap-2 font-medium z-10"
          >
            
            <Logo1 />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs z-10">
            <RegisterForm invitationId={typeof invitationId === "string" ? invitationId : ""} />
          </div>
        </div>
      </div>

      {/* Right side - Bot Illustration */}
    </div>
  );
}
