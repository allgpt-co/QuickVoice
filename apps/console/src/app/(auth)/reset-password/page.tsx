"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, ArrowLeft, KeyRound, Loader2 } from "lucide-react";
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
import { invitationPath } from "@/src/lib/links";
import { resetSchema } from "@/src/models/auth/resetSchema";

function ResetPasswordForm() {
 const router = useRouter();
 const searchParams = useSearchParams();
 const token = searchParams.get("token") ?? "";
 const invitationId = searchParams.get("invitationId") ?? "";
 const invalidToken = searchParams.get("error") === "INVALID_TOKEN";
 const [loading, setLoading] = useState(false);
 const form = useForm<z.infer<typeof resetSchema>>({
 resolver: zodResolver(resetSchema),
 defaultValues: { token, newPassword: "" },
 });

 useEffect(() => {
 form.setValue("token", token);
 }, [form, token]);

 async function onSubmit(values: z.infer<typeof resetSchema>) {
 setLoading(true);
 try {
 const { error } = await authClient.resetPassword({
 token: values.token,
 newPassword: values.newPassword,
 });
 if (error) throw new Error(error.message || "Could not reset password");
 toast.success("Password updated");
 router.push(invitationPath(invitationId, "/login"));
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "Could not reset password");
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
 <KeyRound className="size-6" />
 </div>
 <h1 className="text-2xl font-semibold tracking-tight">Reset password</h1>
 <p className="text-sm text-muted-foreground">
 Choose a new password for your QuickVoice account.
 </p>
 </div>
 {invalidToken || !token ? (
 <div className="flex gap-3 border bg-muted/20 p-4 text-sm text-muted-foreground">
 <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
 <div>
 <p className="font-medium text-foreground">Reset link is invalid or expired.</p>
 <p className="mt-1">
 Request a new password reset email to continue.
 </p>
 <Button asChild variant="outline" size="sm" className="mt-4">
 <Link href={invitationPath(invitationId, "/forgot-password")}>Request a new link</Link>
 </Button>
 </div>
 </div>
 ) : (
 <Form {...form}>
 <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
 <FormField
 control={form.control}
 name="newPassword"
 render={({ field }) => (
 <FormItem>
 <FormLabel>New password</FormLabel>
 <FormControl>
 <Input
 {...field}
 type="password"
 autoComplete="new-password"
 disabled={loading}
 placeholder="At least 8 characters"
 />
 </FormControl>
 <FormMessage />
 </FormItem>
 )}
 />
 <Button type="submit" className="w-full" disabled={loading}>
 {loading ? (
 <>
 <Loader2 className="animate-spin" /> Saving...
 </>
 ) : (
 "Reset password"
 )}
 </Button>
 </form>
 </Form>
 )}
 </div>
 </div>
 );
}

export default function ResetPasswordPage() {
 return (
 <Suspense
 fallback={
 <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
 <div className="w-full max-w-md border bg-card p-6">
 <div className="h-6 w-32 animate-pulse bg-muted" />
 <div className="mt-6 h-32 animate-pulse bg-muted" />
 </div>
 </div>
 }
 >
 <ResetPasswordForm />
 </Suspense>
 );
}
