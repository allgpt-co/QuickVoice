"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Mail, Loader2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import Logo1 from "@/src/components/logo1";
import { authClient } from "@/src/lib/auth-client";
import { CONSOLE_URL, invitationPath } from "@/src/lib/links";

function Invitation() {
  const invitationId = useSearchParams().get("invitationId") ?? "";
  const router = useRouter();
  const { data: session, isPending, error: sessionError, refetch } = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [joinedOrganizationId, setJoinedOrganizationId] = useState("");
  const invitation = useQuery({
    queryKey: ["invitation", invitationId, session?.user.id, session?.user.emailVerified],
    enabled: !!invitationId && !!session && !joinedOrganizationId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await authClient.organization.getInvitation({
        query: { id: invitationId },
      });
      if (error) throw new Error(error.message, { cause: error.code });
      return data;
    },
  });

  async function openWorkspace(organizationId: string) {
    const { error } = await authClient.organization.setActive({ organizationId });
    if (error) throw new Error("You joined the workspace, but we could not open it. Please try again.");
    router.replace("/dashboard");
  }

  async function act(action: "accept" | "decline" | "signout" | "verify" | "open") {
    setBusy(true);
    setActionError("");
    try {
      if (action === "signout") {
        const { error } = await authClient.signOut();
        if (error) throw new Error(error.message);
        router.replace(invitationPath(invitationId, "/login"));
      } else if (action === "verify" && session) {
        const { error } = await authClient.sendVerificationEmail({
          email: session.user.email,
          callbackURL: `${CONSOLE_URL ?? window.location.origin}${invitationPath(invitationId)}`,
        });
        if (error) throw new Error(error.message);
        setVerificationSent(true);
      } else if (action === "open") {
        await openWorkspace(joinedOrganizationId);
      } else if (action === "accept") {
        const { data, error } = await authClient.organization.acceptInvitation({ invitationId });
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Could not accept this invitation. Please try again.");
        setJoinedOrganizationId(data.invitation.organizationId);
        await openWorkspace(data.invitation.organizationId);
      } else if (action === "decline") {
        const { error } = await authClient.organization.rejectInvitation({ invitationId });
        if (error) throw new Error(error.message);
        router.replace("/orgs");
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const wrongAccount = invitation.error?.cause === "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION";
  const needsVerification = invitation.error?.cause === "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION";
  const unavailable = invitation.error?.cause === "INVITATION_NOT_FOUND" || invitation.error?.message === "Invitation not found!";

  return (
    <>
      <div className="mb-6 flex size-12 items-center justify-center bg-primary/10 text-primary">
        <Mail className="size-6" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Workspace invitation</h1>
      <div className="mt-3 space-y-5 text-sm" aria-busy={busy}>
        {!invitationId ? (
          <p role="alert">This invitation link is incomplete. Ask the workspace owner to resend it.</p>
        ) : isPending ? (
          <p role="status" className="text-muted-foreground">Checking your account…</p>
        ) : sessionError ? (
          <>
            <p role="alert">Unable to check your account. Please try again.</p>
            <Button className="min-h-11 w-full" onClick={() => refetch()}>Try again</Button>
          </>
        ) : !session ? (
          <>
            <p className="text-muted-foreground">Sign in or create an account with the email address that received this invitation to review and join the workspace.</p>
            <div className="grid gap-3">
              <Button asChild className="min-h-11"><Link href={invitationPath(invitationId, "/login")}>Sign in to continue</Link></Button>
              <Button asChild variant="outline" className="min-h-11"><Link href={invitationPath(invitationId, "/register")}>Create an account</Link></Button>
            </div>
          </>
        ) : joinedOrganizationId ? (
          <>
            <p role="status">You have joined the workspace.</p>
            <Button className="min-h-11 w-full" disabled={busy} onClick={() => act("open")}>Open workspace</Button>
          </>
        ) : invitation.isPending ? (
          <p role="status" className="text-muted-foreground">Loading invitation…</p>
        ) : invitation.error ? (
          <>
            <p role="alert" className="text-muted-foreground">
              {wrongAccount ? "This invitation was sent to a different email address. Sign in with the account that received it."
                : needsVerification ? "Verify your email address before joining this workspace."
                : unavailable ? "This invitation is unavailable. It may have expired, been canceled, or already been used. Ask the workspace owner for a new invitation."
                : "We could not load this invitation. Please try again."}
            </p>
            <p className="break-words">Signed in as <span className="font-medium">{session.user.email}</span></p>
            {needsVerification && (
              <>
                <Button className="min-h-11 w-full" disabled={busy || verificationSent} onClick={() => act("verify")}>
                  {verificationSent ? "Verification email sent" : "Send verification email"}
                </Button>
                {verificationSent && <p role="status" className="text-muted-foreground">Check your inbox and open the verification link to return here.</p>}
              </>
            )}
            {wrongAccount || needsVerification ? (
              <Button variant="outline" className="min-h-11 w-full" disabled={busy} onClick={() => act("signout")}>Use a different account</Button>
            ) : unavailable ? (
              <Button asChild variant="outline" className="min-h-11 w-full"><Link href="/orgs">Go to workspaces</Link></Button>
            ) : (
              <Button className="min-h-11 w-full" disabled={invitation.isFetching} onClick={() => invitation.refetch()}>Try again</Button>
            )}
          </>
        ) : invitation.data ? (
          <>
            <p className="break-words text-muted-foreground"><span className="font-medium text-foreground">{invitation.data.inviterEmail}</span> invited you to join their team.</p>
            <dl className="space-y-4 border bg-muted/20 p-4">
              <div><dt className="text-muted-foreground">Workspace</dt><dd className="mt-1 break-words text-base font-semibold">{invitation.data.organizationName}</dd></div>
              <div><dt className="text-muted-foreground">Your role</dt><dd className="mt-1 break-words capitalize">{invitation.data.role}</dd></div>
              <div><dt className="text-muted-foreground">Joining as</dt><dd className="mt-1 break-words">{session.user.email}</dd></div>
            </dl>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button className="min-h-11" disabled={busy} onClick={() => act("accept")}>
                {busy && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />}Accept invitation
              </Button>
              <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => act("decline")}>Decline</Button>
            </div>
            <Button variant="link" className="min-h-11 w-full" disabled={busy} onClick={() => act("signout")}>Use a different account</Button>
          </>
        ) : null}
        {actionError && <p role="alert" className="text-destructive">{actionError}</p>}
      </div>
    </>
  );
}

export default function AcceptInvitationPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4 py-10">
      <Logo1 />
      <section className="w-full max-w-md border bg-card p-6 sm:p-8">
        <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading invitation…</p>}>
          <Invitation />
        </Suspense>
      </section>
    </main>
  );
}
