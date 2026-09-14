"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import {
 Form,
 FormControl,
 FormField,
 FormItem,
 FormLabel,
 FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { authClient } from "@/src/lib/auth-client";
import { CONSOLE_URL, invitationPath } from "@/src/lib/links";
import { forgotSchema } from "@/src/models/auth/forgotSchema";

function ForgotPasswordForm() {
 const invitationId = useSearchParams().get("invitationId") ?? "";
 const [loading, setLoading] = useState(false);
 const [sent, setSent] = useState(false);
 const form = useForm<z.infer<typeof forgotSchema>>({
 resolver: zodResolver(forgotSchema),
 defaultValues: { email: "" },
 });

 async function onSubmit(values: z.infer<typeof forgotSchema>) {
 setLoading(true);
 try {
 const { error } = await authClient.requestPasswordReset({
 email: values.email,
 redirectTo: `${CONSOLE_URL ?? window.location.origin}${invitationPath(invitationId, "/reset-password")}`,
 });
 if (error) throw new Error(error.message || "Could not send reset email");
 setSent(true);
 toast.message("Check your email for next steps");
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "Could not send reset email");
 } finally {
 setLoading(false);
 }
 }

 return (
 <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
 <div className="w-full max-w-md border bg-card p-6">
 <Button asChild variant="ghost" className="mb-6 px-0">
 <Link href={invitationPath(invitationId, "/login")}>
 <ArrowLeft className="size-4" /> Back to login
 </Link>
 </Button>
 <div className="mb-6 space-y-2">
 <div className="flex size-12 items-center justify-center bg-primary/10 text-primary">
 <Mail className="size-6" />
 </div>
 <h1 className="text-2xl font-semibold tracking-tight">Forgot password?</h1>
 <p className="text-sm text-muted-foreground">
 Enter your email and we will send a reset link if the account exists.
 </p>
 </div>
 {sent ? (
 <div className="border bg-muted/20 p-4 text-sm text-muted-foreground">
 If an account exists for this email, check your inbox and spam folder for password reset instructions. You can also return to sign in.
 </div>
 ) : (
 <Form {...form}>
 <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
 <FormField
 control={form.control}
 name="email"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Email</FormLabel>
 <FormControl>
 <Input
 {...field}
 type="email"
 autoComplete="email"
 autoCapitalize="none"
 autoCorrect="off"
 disabled={loading}
 placeholder="name@example.com"
 />
 </FormControl>
 <FormMessage />
 </FormItem>
 )}
 />
 <Button type="submit" className="w-full" disabled={loading}>
 {loading ? (
 <>
 <Loader2 className="animate-spin" /> Sending...
 </>
 ) : (
 "Send reset link"
 )}
 </Button>
 </form>
 </Form>
 )}
 </div>
 </div>
 );
}

export default function ForgotPasswordPage() {
 return (
 <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Loading password recovery…</p>}>
 <ForgotPasswordForm />
 </Suspense>
 );
}
