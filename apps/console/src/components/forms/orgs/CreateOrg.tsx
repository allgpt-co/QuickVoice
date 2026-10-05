"use client";

import Link from "next/link";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
 FormField,
 FormItem,
 FormLabel,
 FormControl,
 FormMessage,
} from "@/src/components/ui/form";
import { toast } from "sonner";
import { authClient } from "@/src/lib/auth-client";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createOrgSchema } from "@/src/models/orgs/createOrgsSchema";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { generateSlug } from "@/src/utils/generateSlug";
import { clearIdentityCache } from "@/src/lib/query-cache";




export default function Orgs() {
 const router = useRouter();
 const queryClient = useQueryClient();
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const form = useForm<z.infer<typeof createOrgSchema>>({
 resolver: zodResolver(createOrgSchema),
 defaultValues: {
 name: "",
 },
 });

 const onSubmit = async (values: z.infer<typeof createOrgSchema>) => {
 try {
 setLoading(true);
 setError(null);
 const {data,error} = await authClient.organization.create({
 name: values.name,
 slug: generateSlug(values.name),
 });
 if (error) {
 const message = error.message || "Could not create organization";
 toast.error(message);
 setError(message);
 return;
 }
 if (!data?.id) {
 const message = "Organization was not created. Please try again.";
 toast.error(message);
 setError(message);
 return;
 }
 const { error: activationError } = await authClient.organization.setActive({
 organizationId: data.id,
 });
 if (activationError) {
 const message = activationError.message || "Organization was created, but could not be opened";
 toast.error(message);
 setError(message);
 return;
 }
 clearIdentityCache(queryClient);
 toast.success("Organization created successfully");
 router.push("/dashboard");
 router.refresh();
 } catch (err) {
 const message =
 err instanceof Error ? err.message : "Could not create organization";
 toast.error(message);
 setError(message);
 } finally {
 setLoading(false);
 }
 };

 return (
 <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10 max-w-lg mx-auto">
 <Link
 href="/orgs"
 className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
 >
 <ArrowLeft className="h-4 w-4" />
 Back to organizations
 </Link>

 <div className="border border-border bg-card p-6 sm:p-8">
 <div className="flex h-12 w-12 items-center justify-center bg-primary/10 text-primary mb-5">
 <Building2 className="h-6 w-6" />
 </div>
 <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mb-1">
 Create organization
 </h1>
 <p className="text-sm text-muted-foreground mb-6">
 Set up a new workspace for your team to upload and analyze calls.
 </p>

 <FormProvider {...form}>
 <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
 {error ? (
 <p className="text-sm font-medium text-destructive">{error}</p>
 ) : null}
 <FormField
 control={form.control}
 name="name"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Organization name</FormLabel>
 <FormControl>
 <Input placeholder="e.g. Acme Inc" className="h-10" {...field} />
 </FormControl>
 <FormMessage />
 </FormItem>
 )}
 />

 <div className="pt-2">
 <Button type="submit" disabled={loading || form.formState.isSubmitting} className="w-full h-10">
 {loading || form.formState.isSubmitting ? (
 <>
 <Loader2 className="h-4 w-4 animate-spin mr-2" />
 Creating...
 </>
 ) : (
 "Create organization"
 )}
 </Button>
 </div>
 </form>
 </FormProvider>
 </div>
 </div>
 );
}
