"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import Link from "next/link";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { registerSchema } from "@/src/models/auth/registerSchema";
import { authClient } from "@/src/lib/auth-client";
import { CONSOLE_URL, invitationPath } from "@/src/lib/links";
import OAuthButtons from "../../oauth-buttons";

export function RegisterForm({ invitationId = "" }: { invitationId?: string } = {}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });
  const onSubmit = async (data: z.infer<typeof registerSchema>) => {
    setLoading(true);
    try {
      const { error } = await authClient.signUp.email({
        email: data.email,
        password: data.password,
        name: data.name,
        callbackURL: `${CONSOLE_URL ?? window.location.origin}${invitationId ? invitationPath(invitationId) : "/login"}`,
      });
      if (error) {
        toast.error(error.message || error.statusText || "Something went wrong");
        return;
      }
      toast.message("Check your email for next steps");
      router.push(invitationPath(invitationId, "/verify"));
    } catch {
      toast.error("Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <div className="flex  flex-col items-center gap-2 text-center py-2 ">
        <h1 className="text-2xl font-bold ">Create an account</h1>
        <p className="text-muted-foreground text-sm text-balance">
          {invitationId ? "Use the email address that received the invitation. Verify your email to continue." : "Enter your details to create an account"}
        </p>
      </div>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 ">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="John Doe"
                  type="text"
                  autoCapitalize="none"
                  autoComplete="name"
                  autoCorrect="off"
                  className="h-11"
                />
              </FormControl>
              <FormDescription />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="name@example.com"
                  type="email"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect="off"
                  className="h-11"
                />
              </FormControl>
              <FormDescription className="text-xs text-muted-foreground">
                New accounts need email verification before signing in.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="password"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Password</FormLabel>
              </div>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  placeholder="••••••••"
                  className="h-11 pr-10"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="confirmPassword"
          control={form.control}
          render={({ field }) => {
            const password = form.watch("password");
            return (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    placeholder="••••••••"
                    className="h-11 pr-10"
                  />
                </FormControl>
                <FormMessage>
                  {password !== field.value && "Passwords do not match"}
                </FormMessage>
              </FormItem>
            );
          }}
        />
        
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <span>Create Account</span>
          )}
        </Button>

        <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
          <span className="bg-background text-muted-foreground relative z-10 px-2">
            Or
          </span>
        </div>
        <OAuthButtons invitationId={invitationId} />
        <div className="text-center text-sm">
          Already have an account?{" "}
          <Link href={invitationPath(invitationId, "/login")} className="underline underline-offset-4">
            Login
          </Link>
        </div>
      </form>
    </Form>
  );
}
